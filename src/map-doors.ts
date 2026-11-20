import { midpoint, rotatedVector } from './board-gestures.ts';
import { add, mapArtworkFrame, point, project, subtract, type MapInfo, type Point } from './catalog.ts';
import { metersToWorld, pageIsAttack } from './geometry.ts';
import { newId, type CanvasItem, type Page, type Utility } from './strategy.ts';

type DoorKind = 'drop' | 'spin' | 'breakable' | 'shutter';
export type MapDoor = { id: string; label: string; kind: DoorKind; start: Point; end: Point };

function door(id: string, label: string, kind: DoorKind, x1: number, y1: number, x2: number, y2: number): MapDoor {
  return { id, label, kind, start: point(x1, y1), end: point(x2, y2) };
}

// Attack-side SVG coordinates from Icarus 5.2.1, lib/const/map_doors.dart.
const doorsByMap: Record<string, MapDoor[]> = {
  ascent: [
    door('ascent-a', 'A 点开关门', 'shutter', 322.5, 179.5, 322.5, 192),
    door('ascent-b', 'B 点开关门', 'shutter', 148.5, 129.5, 148.5, 140),
  ],
  lotus: [
    door('lotus-a', 'A 点旋转门', 'spin', 423.7, 241.2, 448.2, 241.2),
    door('lotus-c', 'C 点旋转门', 'spin', 158.1, 259.8, 158.1, 283.8),
    door('lotus-a-link', 'A 连接可破坏墙', 'breakable', 338.4, 200.9, 338.4, 210.7),
  ],
  summit: [
    door('summit-a', 'A 通道降墙', 'drop', 337.5, 154.2, 359.8, 154.2),
    door('summit-mid', '中路降墙', 'drop', 191.3, 166.4, 213, 166.4),
    door('summit-b', 'B 通道降墙', 'drop', 34.3, 117.2, 56, 117.2),
  ],
};

const noDoors: readonly MapDoor[] = [];
export const mapDoors = (map: MapInfo): readonly MapDoor[] => doorsByMap[map.id] ?? noDoors;
export const replayDoorActors: Record<string, string> = {
  'ascent-a': 'WindowShieldA1', 'ascent-b': 'WindowShieldB1',
  'lotus-a': 'Drawbridge6', 'lotus-c': 'Drawbridge5', 'lotus-a-link': 'RespawningWallPlate',
  'summit-a': 'DescentBox_v12', 'summit-mid': 'DescentBox_v9', 'summit-b': 'DescentBox_v5',
};
export const findMapDoor = (item: CanvasItem, map: MapInfo) =>
  'mapDoor' in item ? mapDoors(map).find(door => door.id === item.mapDoor) : undefined;
export const changedMapDoors = (page: Page, map: MapInfo) => {
  const stored = new Set(page.utilityData.filter(row => !row.isDeleted).map(row => row.mapDoor));
  return mapDoors(map).filter(door => stored.has(door.id)).map(door => door.id);
};

export function doorLine(door: MapDoor, map: MapInfo, attack: boolean, changed: boolean, rotation = changed ? Math.PI / 2 : 0): [Point, Point] {
  const { x, y, scale } = mapArtworkFrame(map, true);
  const center = midpoint(door.start, door.end);
  const draw = (p: Point) => {
    const svg = door.kind === 'spin' && rotation ? add(center, rotatedVector(subtract(p, center), rotation)) : p;
    return project(point(x + svg.dx * scale, y + svg.dy * scale), attack);
  };
  return [draw(door.start), draw(door.end)];
}

export function doorBlocks(door: MapDoor, changed: boolean) {
  return door.kind === 'spin' || (door.kind === 'breakable' ? !changed : changed);
}

export function toggleMapDoor(page: Page, door: MapDoor, map: MapInfo, version: number): Page {
  const rows = page.utilityData.filter(row => row.mapDoor !== door.id);
  if (page.utilityData.some(row => row.mapDoor === door.id && !row.isDeleted)) return { ...page, utilityData: rows };

  const [from, to] = doorLine(door, map, version >= 97 || pageIsAttack(page), true);
  const vector = subtract(to, from);
  const length = Math.hypot(vector.dx, vector.dy), width = 4;
  const utility: Utility = {
    id: newId(), type: 'customRectangle', mapDoor: door.id, length: 0, rotation: Math.atan2(vector.dy, vector.dx),
    position: subtract(midpoint(from, to), point(length / 2, width / 2)),
    customLength: length / metersToWorld(1, map), customWidth: width / metersToWorld(1, map),
    customColorValue: door.kind === 'breakable' ? 0xff271406 : 0xffb27c40, customOpacityPercent: 100, isDeleted: false,
  };
  return { ...page, utilityData: [...rows, utility] };
}
