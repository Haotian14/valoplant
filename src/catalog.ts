import catalog from './catalog.json' with { type: 'json' };

export type Point = { dx: number; dy: number };
export type MapInfo = {
  id: string; name: string; active: boolean; scale: number;
  width: number; height: number; defenseOffset: number[];
};
export type AbilityGeometry = {
  anchor: number[]; bounds: number[]; kind: string;
  width?: number; height?: number; minLength?: number; fullLengthByDefault?: boolean;
  diameter?: number; inner?: number; sweep?: number;
  color?: number; sprite?: string; scalable?: boolean;
  rangeOffset?: number; rangeFill?: boolean; sideBorders?: boolean; requiresSight?: boolean;
};
export type Ability = {
  index: number; name: string; icon: string; geometry: AbilityGeometry;
  mapGeometry?: Record<string, Partial<AbilityGeometry>>;
};
export type Agent = { id: string; name: string; role: string; icon: string; abilities: Ability[] };

export const maps: MapInfo[] = catalog.maps;
export const agents: Agent[] = catalog.agents;
export const mapById = Object.fromEntries(maps.map(map => [map.id, map]));
export const agentById = Object.fromEntries(agents.map(agent => [agent.id, agent]));
export const worldWidth = 1000 * 16 / 9;
export const worldHeight = 1000;
export const virtualToWorld = 1000 / 831;
export const worldPerMeter = (map: MapInfo) => 5.78 * map.scale * virtualToWorld;
export const point = (dx: number, dy: number): Point => ({ dx, dy });
export const add = (a: Point, b: Point) => point(a.dx + b.dx, a.dy + b.dy);
export const subtract = (a: Point, b: Point) => point(a.dx - b.dx, a.dy - b.dy);
export const project = (p: Point, attack: boolean) => attack ? p : point(worldWidth - p.dx, worldHeight - p.dy);
export const gameAsset = (path: string) => `${import.meta.env.BASE_URL}game/${path}`;
export const mapThumb = (id: string) => gameAsset(`maps/thumbnails/${id}_thumbnail.webp`);
export const abilityFor = (id: string, index: number) => agentById[id]?.abilities.find(ability => ability.index === index);

export function mapArtworkFrame(map: MapInfo, attack: boolean) {
  const scale = Math.min(1240 / map.width, worldHeight / map.height);
  const width = map.width * scale, height = map.height * scale;
  const [offsetX, offsetY] = attack ? [0, 0] : map.defenseOffset;
  return { width, height, scale,
    x: (worldWidth - width) / 2 - offsetX * scale, y: (worldHeight - height) / 2 - offsetY * scale };
}

export function abilityGeometry(ability: Ability, mapId: string): AbilityGeometry {
  const overrides = ability.mapGeometry?.[mapId];
  return overrides ? { ...ability.geometry, ...overrides } : ability.geometry;
}

export function cssColor(value: number | string | undefined, fallback = '#eeeaf8') {
  if (typeof value === 'number') {
    return `#${(value >>> 0).toString(16).padStart(8, '0').slice(2)}`;
  }
  if (typeof value === 'string' && /^#[a-f\d]{8}$/i.test(value)) return `#${value.slice(3)}`;
  return typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value) ? value : fallback;
}
