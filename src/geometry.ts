import {
  abilityFor, abilityGeometry, add, point, project, subtract, virtualToWorld, type MapInfo, type Point,
} from './catalog.ts';
import type { AbilityMarker, AgentMarker, CanvasItem, Collection, Page, Utility } from './strategy.ts';

export const agentAnchor = point(17.5 * virtualToWorld, 17.5 * virtualToWorld);

export function abilityAnchor(type: string, index: number, map: MapInfo): Point {
  const ability = abilityFor(type, index);
  const [dx, dy] = ability ? abilityGeometry(ability, map.id).anchor : [12.5, 12.5];
  return point(dx * virtualToWorld, dy * virtualToWorld);
}

export const metersToWorld = (value: number, map: MapInfo) => value * 11.56 * map.scale * virtualToWorld;

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

export function makeAbility(type: string, index: number, center: Point, ally: boolean, map: MapInfo): AbilityMarker {
  return { id: crypto.randomUUID(), position: subtract(center, abilityAnchor(type, index, map)), isDeleted: false,
    data: { type, index }, isAlly: ally, rotation: 0, length: 0 };
}

export function makeUtility(type: string, center: Point, ally: boolean, map: MapInfo, color: number, version: number): Utility {
  const utility: Utility = { id: crypto.randomUUID(), position: center, type, isAlly: ally, isDeleted: false, length: 100, rotation: 0 };
  if (type === 'customCircle') utility.customDiameter = 10;
  if (type === 'customRectangle') { utility.customWidth = 7; utility.customLength = 11; }
  if (type === 'customCircle' || type === 'customRectangle') {
    utility.customColorValue = color;
    utility.customOpacityPercent = 22;
  }
  if (type.startsWith('viewCone')) utility.angle = Number(type.slice('viewCone'.length));
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
