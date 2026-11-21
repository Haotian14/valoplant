import {
  abilityFor, abilityGeometry, add, point, project, subtract, virtualToWorld, type AbilityGeometry, type MapInfo, type Point,
} from './catalog.ts';
import { append, appendLineup, type AbilityMarker, type AgentMarker, type CanvasItem, type CanvasSelection,
  type Collection, type ImageMarker, type Page, type TextMarker, type Utility } from './strategy.ts';
import { initialWallPath } from './wall-path.ts';

export const agentAnchor = point(17.5 * virtualToWorld, 17.5 * virtualToWorld);

export function abilityAnchor(type: string, index: number, map: MapInfo): Point {
  const ability = abilityFor(type, index);
  const [dx, dy] = ability ? abilityGeometry(ability, map.id).anchor : [12.5, 12.5];
  return point(dx * virtualToWorld, dy * virtualToWorld);
}

export function abilityLengthRange(marker: AbilityMarker, map: MapInfo) {
  const ability = abilityFor(marker.data.type, marker.data.index);
  const geometry = ability?.geometry;
  if (!ability || !geometry?.scalable || !geometry.height) return;
  const min = geometry.minLength ?? 5.78;
  const max = geometry.height;
  const raw = marker.length || (geometry.fullLengthByDefault ? max : min);
  const length = Math.min(max, Math.max(min, raw));
  const mapLength = abilityGeometry(ability, map.id).height ?? max * map.scale;
  return { length, min, max, displayScale: mapLength * virtualToWorld / max };
}

export function abilityRectRange(marker: AbilityMarker, map: MapInfo, geometry: AbilityGeometry) {
  const variable = abilityLengthRange(marker, map);
  const height = variable ? variable.length * variable.displayScale : (marker.length || geometry.height || 60) * virtualToWorld;
  return { height, forward: Math.min(height, geometry.anchor[1] * virtualToWorld || height) };
}

export function abilityVision(marker: AbilityMarker, map: MapInfo) {
  const key = `${marker.data.type}:${marker.data.index}`;
  const angle = ({ 'killjoy:2': 100, 'cypher:2': 103, 'raze:0': 40, 'gekko:1': 40 } as Record<string, number>)[key];
  if (!angle) return;
  const fixed = key === 'raze:0' || key === 'gekko:1';
  const scale = fixed ? map.scale : 1;
  const maximum = fixed ? Math.min(15 * 5.78 * map.scale, 300) : 300;
  const minimum = Math.min(maximum, 40);
  const stored = marker.length && marker.length > 0 ? marker.length : fixed ? maximum / scale : 50;
  return { angle, length: Math.min(maximum, Math.max(minimum, stored * scale)) / scale,
    min: minimum / scale, max: maximum / scale, displayScale: virtualToWorld * scale };
}

export const usesInactiveTrace = (marker: AbilityMarker) => marker.data.type === 'viper' && [1, 2].includes(marker.data.index);

export const metersToWorld = (value: number, map: MapInfo) => value * 11.56 * map.scale * virtualToWorld;

const diagonal = Math.SQRT1_2;
export const barrierMeshAxes = [point(diagonal, -diagonal), point(-diagonal, -diagonal),
  point(-diagonal, diagonal), point(diagonal, diagonal)];

export function meshArmLength(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? Math.max(1, Math.min(10, value)) : 10;
}

export function utilityAnchor(utility: Utility, map: MapInfo, version = 112): Point {
  if (utility.type === 'customCircle') {
    const r = metersToWorld(version >= 104 ? 110 : utility.customDiameter ?? 10, map) / 2;
    return point(r, r);
  }
  if (utility.type === 'customRectangle') {
    return point(metersToWorld(utility.customLength ?? 10, map) / 2, metersToWorld(utility.customWidth ?? 10, map) / 2);
  }
  if (utility.type.startsWith('viewCone')) return point(300 * virtualToWorld, 307.5 * virtualToWorld);
  if (utility.type === 'spike') return point(10 * virtualToWorld, 10 * virtualToWorld);
  return agentAnchor;
}

export function makeAgent(id: string, center: Point, ally: boolean): AgentMarker {
  return { id: crypto.randomUUID(), kind: 'plain', type: id, position: subtract(center, agentAnchor), isAlly: ally, isDeleted: false, state: 'none' };
}

export function makeAbility(type: string, index: number, center: Point, ally: boolean, map: MapInfo, attack: boolean): AbilityMarker {
  const ability = abilityFor(type, index);
  const wall = ability && abilityGeometry(ability, map.id).kind === 'wall';
  return { id: crypto.randomUUID(), position: subtract(center, abilityAnchor(type, index, map)), isDeleted: false,
    data: { type, index }, isAlly: ally, rotation: 0, length: 0, ...(wall ? { wallPath: initialWallPath(map, attack) } : {}) };
}

export function makeUtility(type: string, center: Point, ally: boolean, map: MapInfo, color: number, version: number): Utility {
  const fullCircle = type === 'viewCone360';
  const zone = type === 'customZone';
  if (fullCircle) type = 'viewCone180';
  if (zone) type = 'customRectangle';
  const utility: Utility = { id: crypto.randomUUID(), position: center, type, isAlly: ally, isDeleted: false, length: 100, rotation: 0 };
  if (zone) utility.isZone = true;
  if (type === 'customCircle') utility.customDiameter = 10;
  if (type === 'customRectangle') { utility.customWidth = 7; utility.customLength = 11; }
  if (type === 'customCircle' || type === 'customRectangle') {
    utility.customColorValue = color;
    utility.customOpacityPercent = 22;
  }
  if (type.startsWith('viewCone')) {
    utility.angle = fullCircle ? 360 : ({ viewCone40: 20, viewCone90: 60, viewCone180: 103 }[type] ?? 90);
    if (fullCircle) utility.length = 150;
  }
  utility.position = subtract(center, utilityAnchor(utility, map, version));
  return utility;
}

export function anchorFor(collection: Collection, item: CanvasItem, map: MapInfo, version: number): Point {
  if (collection === 'agentData') return agentAnchor;
  if (collection === 'abilityData' && 'data' in item) return abilityAnchor(item.data.type, item.data.index, map);
  if (collection === 'utilityData') return utilityAnchor(item as Utility, map, version);
  return point(0, 0);
}

export const pageIsAttack = (page: Page) => page.isAttack !== 'false';
export const canonicalMarkers = (page: Page, version: number) => pageIsAttack(page) || version < 97;
export const worldMarker = (item: CanvasItem, collection: Collection, map: MapInfo, page: Page, version: number) =>
  'position' in item ? project(add(item.position, anchorFor(collection, item, map, version)), canonicalMarkers(page, version)) : point(0, 0);

export const uprightScale = (item: ImageMarker | TextMarker) => item.sizeVersion ? 1 : 1000 / 1080;

export function uprightDimensions(item: ImageMarker | TextMarker): Point {
  const scale = uprightScale(item);
  if ('aspectRatio' in item) {
    const width = item.scale * scale;
    return point(width, width / Math.max(.01, item.aspectRatio));
  }
  const width = Math.max(60, (item.size ?? 185) * scale);
  const font = (item.fontSize ?? 18) * scale;
  const lines = (item.text || '在这里输入…').split('\n')
    .reduce((n, line) => n + Math.max(1, Math.ceil(line.length * font * .7 / width)), 0);
  return point(width, Math.max(36, font * 1.45 * lines + 18));
}

export function uprightPosition(item: ImageMarker | TextMarker, page: Page, version: number): Point {
  if (canonicalMarkers(page, version)) return item.position;
  return subtract(project(item.position, false), uprightDimensions(item));
}

export function pinnedUprightPosition<T extends ImageMarker | TextMarker>(item: T, resized: T, page: Page, version: number): Point {
  return canonicalMarkers(page, version) ? item.position
    : project(add(uprightPosition(item, page, version), uprightDimensions(resized)), false);
}

export function withMarkerCenter<T extends CanvasItem & { position: Point }>(
  item: T, collection: Collection, center: Point, map: MapInfo, version: number,
): T {
  return { ...item, position: subtract(center, anchorFor(collection, item, map, version)) };
}

export function drawingColor(hex: string) {
  return (0xff000000 + Number.parseInt(hex.slice(1), 16)) >>> 0;
}

export function sectorPath(radius: number, degrees: number) {
  const angle = Math.min(359.99, degrees) * Math.PI / 360;
  const x = Math.sin(angle) * radius;
  const y = -Math.cos(angle) * radius;
  return `M 0 0 L ${-x} ${y} A ${radius} ${radius} 0 ${degrees > 180 ? 1 : 0} 1 ${x} ${y} Z`;
}

/** Older Icarus files saved positioned markers on the displayed side. */
export function flipPage(page: Page, side: Page['isAttack'], map: MapInfo, version: number): Page {
  if (page.isAttack === side) return page;
  if (version >= 97) return { ...page, isAttack: side };
  function flip<T extends CanvasItem>(item: T, collection: Collection): T {
    if (!('position' in item)) return item;
    let anchor = anchorFor(collection, item, map, version);
    if ('text' in item) anchor = point((item.size ?? 185) * .463, Math.max(18, (item.fontSize ?? 16) * .85));
    if ('aspectRatio' in item) anchor = point(item.scale * .463, (item.scale * .463) / Math.max(.01, item.aspectRatio));
    const position = subtract(project(add(item.position, anchor), false), anchor);
    const rotation = 'rotation' in item ? { rotation: (item.rotation ?? 0) + Math.PI } : {};
    return { ...item, ...rotation, position };
  }
  return {
    ...page,
    isAttack: side,
    agentData: page.agentData.map(item => flip(item, 'agentData')),
    abilityData: page.abilityData.map(item => flip(item, 'abilityData')),
    utilityData: page.utilityData.map(item => flip(item, 'utilityData')),
    textData: page.textData.map(item => flip(item, 'textData')),
    imageData: page.imageData.map(item => flip(item, 'imageData')),
    lineUpOrigins: page.lineUpOrigins.map(row => ({ ...row, agent: flip(row.agent, 'agentData') })),
    lineUpLandings: page.lineUpLandings.map(row => ({ ...row, ability: flip(row.ability, 'abilityData') })),
  };
}

export function copyToPage(source: Page, target: Page, selection: CanvasSelection | string, map: MapInfo, version: number): Page {
  const projected = flipPage(source, target.isAttack, map, version);
  if (typeof selection === 'string') {
    const link = projected.lineUpLinks.find(row => row.id === selection);
    if (!link || target.lineUpLinks.some(row => row.id === link.id)) return target;
    const origin = projected.lineUpOrigins.find(row => row.id === link.originId)?.agent;
    const landing = projected.lineUpLandings.find(row => row.id === link.landingId)?.ability;
    return origin && landing ? appendLineup(target, link, origin, landing) : target;
  }
  const { collection, id } = selection;
  const object = projected[collection].find(item => item.id === id);
  return object && !target[collection].some(item => item.id === id) ? append(target, collection, object) : target;
}
