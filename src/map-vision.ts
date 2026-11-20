import { gameAsset, mapArtworkFrame, type MapInfo, type Point } from './catalog.ts';
import { doorBlocks, doorLine, mapDoors } from './map-doors.ts';

export type SightSegment = readonly [x1: number, y1: number, x2: number, y2: number];
const turn = 2 * Math.PI;
const angleEpsilon = .0001;
const wallCache = new Map<string, Promise<SightSegment[]>>();

export function projectSightWalls(raw: number[], map: MapInfo, attack: boolean): SightSegment[] {
  const { x, y, scale } = mapArtworkFrame(map, attack);
  const segments: SightSegment[] = [];
  for (let index = 0; index + 3 < raw.length; index += 4) {
    segments.push([x + raw[index] * scale, y + raw[index + 1] * scale, x + raw[index + 2] * scale, y + raw[index + 3] * scale]);
  }
  return segments;
}

export function loadSightWalls(map: MapInfo, attack: boolean) {
  const key = `${map.id}-${attack ? 'attack' : 'defense'}`;
  const stored = wallCache.get(key);
  if (stored) return stored;
  const request = fetch(gameAsset(`vision/${key}.json`)).then(async response => {
    if (!response.ok) throw new Error(`Cannot load vision walls for ${key}`);
    return projectSightWalls(await response.json() as number[], map, attack);
  }).catch((error: unknown) => {
    wallCache.delete(key);
    throw error;
  });
  wallCache.set(key, request);
  return request;
}

export function sightDoorWalls(map: MapInfo, attack: boolean, changedDoors: ReadonlySet<string>): SightSegment[] {
  const out: SightSegment[] = [];
  const overlap = mapArtworkFrame(map, true).scale * .5;
  for (const door of mapDoors(map)) {
    const changed = changedDoors.has(door.id);
    if (!doorBlocks(door, changed)) continue;
    const [start, end] = doorLine(door, map, attack, changed);
    const dx = end.dx - start.dx, dy = end.dy - start.dy;
    const extend = overlap / Math.hypot(dx, dy);
    out.push([start.dx - dx * extend, start.dy - dy * extend, end.dx + dx * extend, end.dy + dy * extend]);
  }
  return out;
}

export function nearestSightWall(walls: readonly SightSegment[], target: Point, reach: number): Point {
  let best = target;
  let shortest = reach * reach;
  for (const [x1, y1, x2, y2] of walls) {
    const dx = x2 - x1, dy = y2 - y1;
    const length = dx * dx + dy * dy;
    if (!length) continue;
    const t = Math.min(1, Math.max(0, ((target.dx - x1) * dx + (target.dy - y1) * dy) / length));
    const x = x1 + dx * t, y = y1 + dy * t;
    const distance = (x - target.dx) ** 2 + (y - target.dy) ** 2;
    if (distance < shortest) { shortest = distance; best = { dx: x, dy: y }; }
  }
  return best;
}

/** Returns a polygon relative to the origin. Bounds and tangent rays keep it
 * within the cone, while map edges stop each ray at its first intersection. */
export function sightPolygon(
  walls: readonly SightSegment[], origin: Point, radius: number, rotation: number, sweep: number,
): Point[] | undefined {
  const span = Math.min(360, sweep) * Math.PI / 180;
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(span) || span <= 0) return;
  const start = rotation - Math.PI / 2 - span / 2;
  const angles = new Set<number>();
  const segments: SightSegment[] = [];
  const starts: { at: number; index: number }[] = [];
  const ends: { at: number; index: number }[] = [];
  const radiusSquared = radius * radius;
  const bearing = (dx: number, dy: number) => ((Math.atan2(dy, dx) - start) % turn + turn) % turn;

  function addTangent(relative: number, dx: number, dy: number) {
    if (dx * dx + dy * dy > radiusSquared || (!dx && !dy)) return;
    if (relative > span + angleEpsilon) return;
    const center = Math.min(span, relative);
    angles.add(center);
    angles.add(Math.max(0, center - angleEpsilon));
    angles.add(Math.min(span, center + angleEpsilon));
  }

  for (const [x1, y1, x2, y2] of walls) {
    const ax = x1 - origin.dx, ay = y1 - origin.dy;
    const bx = x2 - origin.dx, by = y2 - origin.dy;
    if (Math.min(ax, bx) > radius || Math.max(ax, bx) < -radius || Math.min(ay, by) > radius || Math.max(ay, by) < -radius) continue;
    const dx = bx - ax, dy = by - ay;
    const squared = dx * dx + dy * dy;
    if (!squared) continue;
    const nearest = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / squared));
    if ((ax + nearest * dx) ** 2 + (ay + nearest * dy) ** 2 > radiusSquared) continue;

    const a = bearing(ax, ay), b = bearing(bx, by);
    let low = Math.min(a, b), high = Math.max(a, b);
    if (high - low > Math.PI) [low, high] = [high, low + turn];
    // A segment intersects rays only along its shorter arc around the observer.
    // Split spans that cross the starting ray so each can enter the sweep once.
    for (const offset of [0, -turn]) {
      const from = Math.max(0, low + offset), to = Math.min(span, high + offset);
      if (to < from) continue;
      const index = segments.length;
      segments.push([ax, ay, dx, dy]);
      starts.push({ at: from, index });
      ends.push({ at: to, index });
    }
    addTangent(a, ax, ay);
    addTangent(b, bx, by);
  }
  if (!starts.length) return;

  const divisions = Math.ceil(span / (Math.PI / 72));
  for (let index = 0; index <= divisions; index++) angles.add(index * span / divisions);
  starts.sort((a, b) => a.at - b.at);
  ends.sort((a, b) => a.at - b.at);
  const active = new Set<number>();
  let entered = 0, exited = 0;
  let obstructed = false;
  const boundary = [...angles].sort((a, b) => a - b).map(relative => {
    while (entered < starts.length && starts[entered].at <= relative + 1e-10) {
      active.add(starts[entered++].index);
    }
    while (exited < ends.length && ends[exited].at < relative - 1e-10) {
      active.delete(ends[exited++].index);
    }
    const x = Math.cos(start + relative), y = Math.sin(start + relative);
    let range = radius;
    for (const index of active) {
      const [ax, ay, dx, dy] = segments[index];
      const denominator = x * dy - y * dx;
      if (Math.abs(denominator) < 1e-8) continue;
      const position = (ax * y - ay * x) / denominator;
      if (position < 0 || position > 1) continue;
      const hit = (ax * dy - ay * dx) / denominator;
      if (hit > .02 && hit < range) range = hit;
    }
    obstructed ||= range < radius;
    return { dx: x * range, dy: y * range };
  });
  if (!obstructed) return;
  return span >= turn ? boundary : [{ dx: 0, dy: 0 }, ...boundary];
}
