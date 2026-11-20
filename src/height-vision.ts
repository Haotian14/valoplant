import { gunzipSync, strFromU8, strToU8 } from 'fflate';
import { gameAsset, mapArtworkFrame, type MapInfo, type Point } from './catalog.ts';
import { projectSightWalls, type SightSegment } from './map-vision.ts';

type Band = [lower: number | null, upper: number | null];
type Source = {
  version: 1; camera: number;
  grid: [step: number, columns: number, rows: number, samples: string];
  walls: [bands: Band[], segments: number[]][];
  supports: [label: string, elevation: number, automatic: boolean, plane: [number, number, number] | null, rings: number[][], evenOdd: boolean][];
};
type Support = Source['supports'][number] & { bounds: [number, number, number, number] };
export type HeightModel = {
  camera: number; frame: ReturnType<typeof mapArtworkFrame>; step: number; columns: number; rows: number; grid: DataView;
  supports: Support[]; walls: [Band[], SightSegment[]][];
  activeWalls: Map<string, SightSegment[]>;
};
export type ElevationChoice = { label: string; height: number };
const models = new Map<string, Promise<HeightModel>>();

export function prepareHeightModel(sourceBytes: Uint8Array, map: MapInfo, attack: boolean): HeightModel {
  const bytes = sourceBytes[0] === 31 && sourceBytes[1] === 139 ? gunzipSync(sourceBytes) : sourceBytes;
  const source = JSON.parse(strFromU8(bytes)) as Source;
  if (source.version !== 1) throw new Error('地图高度数据格式不支持');
  const [step, columns, rows, samples] = source.grid;
  const decoded = strToU8(atob(samples), true);
  const supports = source.supports.map(row => {
    const bounds: Support['bounds'] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of row[4]) {
      for (let i = 0; i < ring.length; i += 2) {
        bounds[0] = Math.min(bounds[0], ring[i]); bounds[2] = Math.max(bounds[2], ring[i]);
        bounds[1] = Math.min(bounds[1], ring[i + 1]); bounds[3] = Math.max(bounds[3], ring[i + 1]);
      }
    }
    return Object.assign(row, { bounds });
  });
  return {
    frame: mapArtworkFrame(map, attack), camera: source.camera, step, rows, columns,
    grid: new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength), supports,
    walls: source.walls.map(([bands, segments]) => [bands, projectSightWalls(segments, map, attack)]),
    activeWalls: new Map(),
  };
}

export function loadHeightModel(map: MapInfo, attack: boolean) {
  const key = `${map.id}-${attack ? 'attack' : 'defense'}`;
  const existing = models.get(key);
  if (existing) {
    models.delete(key);
    models.set(key, existing);
    return existing;
  }
  const request = fetch(gameAsset(`elevation/${key}.json.gz`)).then(async response => {
    if (!response.ok) throw new Error('无法读取地图高度数据');
    return prepareHeightModel(new Uint8Array(await response.arrayBuffer()), map, attack);
  }).catch((error: unknown) => {
    if (models.get(key) === request) models.delete(key);
    throw error;
  });
  models.set(key, request);
  if (models.size > 4) models.delete(models.keys().next().value!);
  return request;
}

function contains(rings: number[][], evenOdd: boolean, x: number, y: number) {
  let winding = 0;
  for (const ring of rings) {
    let ax = ring.at(-2)!, ay = ring.at(-1)!;
    for (let i = 0; i < ring.length; i += 2) {
      const bx = ring[i], by = ring[i + 1];
      if ((ay > y) !== (by > y) && x < ax + (y - ay) * (bx - ax) / (by - ay)) winding += by > ay ? 1 : -1;
      ax = bx; ay = by;
    }
  }
  return evenOdd ? Math.abs(winding) % 2 !== 0 : winding !== 0;
}

export function elevationsAt(model: HeightModel, origin: Point) {
  const { frame, step, grid, columns, rows, camera } = model;
  const x = (origin.dx - frame.x) / frame.scale, y = (origin.dy - frame.y) / frame.scale;
  const col = Math.floor(x / step), row = Math.floor(y / step);
  const sample = col < 0 || col >= columns || row < 0 || row >= rows ? -32768
    : grid.getInt16(2 * (row * columns + col), true);
  const choices: ElevationChoice[] = [];
  let automatic = sample === -32768 ? undefined : Math.round(sample + camera * 100);
  if (automatic !== undefined) choices.push({ label: '地面', height: automatic });
  for (const support of model.supports) {
    const [left, top, right, bottom] = support.bounds;
    if (x < left || x > right || y < top || y > bottom) continue;
    const [label, surface, auto, plane, rings, evenOdd] = support;
    if (!contains(rings, evenOdd, x, y)) continue;
    const height = Math.round(((plane ? plane[0] * x + plane[1] * y + plane[2] : surface) + camera) * 100);
    if (!choices.some(choice => Math.abs(choice.height - height) <= 2)) choices.push({ label: label || '站立面', height });
    if (auto) automatic = Math.max(automatic ?? -Infinity, height);
  }
  return { choices: choices.sort((a, b) => a.height - b.height), automatic };
}

export const resolvedElevation = (elevations: ReturnType<typeof elevationsAt>, manual: number | undefined) =>
  manual != null && elevations.choices.some(choice => Math.abs(choice.height - manual) <= 8) ? manual : elevations.automatic;

export function wallsAtElevation(model: HeightModel, elevation: number) {
  const meters = elevation / 100;
  const groups = model.walls.map(([bands, segments]) =>
    bands.some(([from, until]) => (from ?? -Infinity) <= meters && meters <= (until ?? Infinity)) ? segments : null);
  const key = groups.map(group => group ? '1' : '0').join('');
  const cached = model.activeWalls.get(key);
  if (cached) return cached;
  const walls = groups.flatMap(group => group ?? []);
  model.activeWalls.set(key, walls);
  if (model.activeWalls.size > 8) model.activeWalls.delete(model.activeWalls.keys().next().value!);
  return walls;
}
