import { draggedAngle, draggedEdge, rotatedVector } from './board-gestures.ts';
import { abilityFor, abilityGeometry, add, point, project, subtract, virtualToWorld, type MapInfo, type Point } from './catalog.ts';
import {
  abilityLengthRange, abilityRectRange, abilityVision, barrierMeshAxes, canonicalMarkers, meshArmLength, metersToWorld, pageIsAttack, pinnedUprightPosition, uprightDimensions, uprightPosition, uprightScale,
  withMarkerCenter, worldMarker,
} from './geometry.ts';
import type { CanvasItem, Collection, Page, Utility } from './strategy.ts';
import { maxWallLength, maxWallPoints, reshapeWall, savedWallPath, wallMidpoints } from './wall-path.ts';

type HandleMode = 'rotate' | 'width' | 'radius' | 'length' | 'left' | 'right' | 'top' | 'bottom';
export type ObjectHandle = { position: Point; label: string } & (
  { mode: HandleMode; index?: never } | { mode: 'wallPoint' | 'wallInsert' | 'meshArm'; index: number }
);
export type ObjectFrame = { item: CanvasItem; collection: Collection; page: Page; map: MapInfo; version: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function markerAbility(item: CanvasItem, map: MapInfo) {
  const ability = 'data' in item ? abilityFor(item.data.type, item.data.index) : undefined;
  return ability && abilityGeometry(ability, map.id);
}

export function canRotate(item: CanvasItem, map: MapInfo) {
  if ('data' in item && abilityVision(item, map)) return item.visualState?.showVisionCone !== false;
  const ability = markerAbility(item, map);
  return ability ? ['sector', 'rect', 'mesh'].includes(ability.kind)
    : 'kind' in item && item.kind === 'viewCone' || 'rotation' in item && 'type' in item &&
      (item.type === 'customRectangle' || item.type.startsWith('viewCone'));
}

function directionLength(item: CanvasItem, map: MapInfo) {
  if ('data' in item) return abilityLengthRange(item, map) ?? (item.visualState?.showVisionCone !== false ? abilityVision(item, map) : undefined);
  if ('kind' in item && item.kind === 'viewCone') {
    return { length: item.length ?? 85, min: 10, max: 600, displayScale: virtualToWorld };
  }
  if ('length' in item && item.type.startsWith('viewCone')) {
    return { length: item.length || 100, min: 10, max: 600, displayScale: virtualToWorld };
  }
}

function objectRotation(item: CanvasItem) {
  return 'rotation' in item ? item.rotation ?? 0 : 0;
}

const rectAxis = (mode: HandleMode) => {
  switch (mode) {
    case 'left': return point(-1, 0);
    case 'right': return point(1, 0);
    case 'top': return point(0, -1);
    case 'bottom': return point(0, 1);
  }
};

export function objectHandles(
  { item: savedItem, collection, page, map, version }: ObjectFrame,
  gap: number, isVisible?: (position: Point) => boolean, preview?: Partial<CanvasItem>,
): ObjectHandle[] {
  const item = preview ? { ...savedItem, ...preview } : savedItem;
  if (!('position' in item) || item.isDeleted) return [];
  if ('aspectRatio' in item || 'text' in item) {
    const size = uprightDimensions(item);
    return [{ mode: 'width', position: add(uprightPosition(item, page, version), point(size.dx, size.dy / 2)), label: '调整宽度' }];
  }

  const center = worldMarker(item, collection, map, page, version);
  const ability = markerAbility(item, map);
  if ('data' in item && ability?.kind === 'wall') {
    const path = savedWallPath(item, map);
    const attack = pageIsAttack(page);
    const screen = (offset: Point) => add(center, attack ? offset : point(-offset.dx, -offset.dy));
    return [
      ...(path.length < maxWallPoints ? wallMidpoints(path).map((offset, index): ObjectHandle =>
        ({ mode: 'wallInsert', index, position: screen(offset), label: '拖出拐点' })) : []),
      ...path.map((offset, index): ObjectHandle =>
        ({ mode: 'wallPoint', index, position: screen(offset), label: path.length > 1 ? '拖动拐点 · 右键移除' : '拖动墙端点' })),
    ];
  }
  const sideAngle = canonicalMarkers(page, version) ? 0 : Math.PI;
  const angle = objectRotation(item) + sideAngle;
  const handles: ObjectHandle[] = [];
  function addHandle(mode: HandleMode, offset: Point, label: string) {
    handles.push({ mode, position: add(center, rotatedVector(offset, angle)), label });
  }

  if ('data' in item && ability?.kind === 'mesh' && item.visualState?.showRangeFill !== false) {
    const lengths = item.armLengthsMeters;
    barrierMeshAxes.forEach((axis, index) => {
      const length = metersToWorld(meshArmLength(lengths?.[index]), map);
      handles.push({ mode: 'meshArm', index, position: add(center, rotatedVector(point(axis.dx * length, axis.dy * length), angle)),
        label: '调整这条屏障臂' });
    });
  }
  if (collection === 'utilityData' && (item as Utility).type === 'customRectangle') {
    const rect = item as Utility;
    const x = metersToWorld(rect.customLength ?? 10, map) / 2;
    const y = metersToWorld(rect.customWidth ?? 10, map) / 2;
    addHandle('left', point(-x, 0), '调整长度');
    addHandle('right', point(x, 0), '调整长度');
    addHandle('top', point(0, -y), '调整宽度');
    addHandle('bottom', point(0, y), '调整宽度');
    addHandle('rotate', point(0, -y - gap * 2), '旋转矩形');
    return handles;
  }
  if ('kind' in item && item.kind === 'circle' || collection === 'utilityData' && (item as Utility).type === 'customCircle') {
    const diameter = 'kind' in item ? item.diameterMeters ?? 8 : (item as Utility).customDiameter ?? 10;
    const diagonal = metersToWorld(diameter, map) / (2 * Math.SQRT2);
    addHandle('radius', point(diagonal, diagonal), '调整范围直径');
  }
  const length = directionLength(item, map);
  const lengthHandle = length ? Math.max(gap * 2, length.length * length.displayScale) : 0;
  if (length) addHandle('length', point(0, -lengthHandle), '调整作用距离');
  if (canRotate(item, map)) {
    let radius = length ? lengthHandle + gap * 2 : gap * 3;
    if (!length && ability?.kind === 'rect' && 'data' in item) {
      const tip = Math.max(radius, abilityRectRange(item, map, ability).forward + gap);
      // Keep the same handle distance from the cast point throughout the drag.
      const position = add(center, rotatedVector(point(0, -tip), objectRotation(savedItem) + sideAngle));
      if (!isVisible || isVisible(position)) radius = tip;
    }
    addHandle('rotate', point(0, -radius), '旋转方向');
  }
  return handles;
}

export function transformObject(
  { item, collection, page, map, version }: ObjectFrame, handle: ObjectHandle, start: Point, end: Point, snap: boolean,
): Partial<CanvasItem> {
  if (!('position' in item)) return {};
  const { mode } = handle;
  const delta = subtract(end, start);
  const canonical = canonicalMarkers(page, version);
  if (mode === 'width' && ('aspectRatio' in item || 'text' in item)) {
    const width = uprightDimensions(item).dx;
    const scale = uprightScale(item);
    const next = clamp(width + delta.dx, 'text' in item ? 60 : 30, 1600) / scale;
    const update = 'text' in item ? { size: next } : { scale: next };
    const position = pinnedUprightPosition(item, { ...item, ...update }, page, version);
    return { ...update, position };
  }

  const center = worldMarker(item, collection, map, page, version);
  if (mode === 'wallPoint' || mode === 'wallInsert') {
    if (!('data' in item)) return {};
    const path = savedWallPath(item, map);
    const base = subtract(handle.position, center);
    const moved = add(base, delta);
    const attack = pageIsAttack(page);
    const save = (offset: Point) => attack ? offset : point(-offset.dx, -offset.dy);
    return { wallPath: reshapeWall(path, handle.index, mode === 'wallInsert' ? save(base) : undefined,
      save(moved), maxWallLength(map)) };
  }
  const angle = objectRotation(item);
  if (mode === 'rotate') {
    return { rotation: draggedAngle(angle, subtract(start, center), subtract(end, center), snap) };
  }
  if (mode === 'radius') {
    const from = subtract(start, center), to = subtract(end, center);
    const change = 2 * (Math.hypot(to.dx, to.dy) - Math.hypot(from.dx, from.dy)) / metersToWorld(1, map);
    if ('kind' in item && item.kind === 'circle') return { diameterMeters: clamp((item.diameterMeters ?? 8) + change, 1, 110) };
    const circle = item as Utility;
    const customDiameter = clamp((circle.customDiameter ?? 10) + change, 1, 110);
    const resized = withMarkerCenter({ ...circle, customDiameter }, collection, project(center, canonical), map, version);
    return { customDiameter, position: resized.position };
  }
  const displayAngle = angle + (canonical ? 0 : Math.PI);
  if (mode === 'meshArm' && 'data' in item) {
    const axis = rotatedVector(barrierMeshAxes[handle.index], displayAngle);
    const change = (delta.dx * axis.dx + delta.dy * axis.dy) / metersToWorld(1, map);
    const armLengthsMeters = barrierMeshAxes.map((_, index) => meshArmLength(item.armLengthsMeters?.[index]));
    armLengthsMeters[handle.index] = meshArmLength(armLengthsMeters[handle.index] + change);
    return { armLengthsMeters };
  }
  if (mode === 'length') {
    const base = directionLength(item, map);
    if (base === undefined) return {};
    const local = rotatedVector(delta, -displayAngle);
    return { length: clamp(base.length - local.dy / base.displayScale, base.min, base.max) };
  }
  const localAxis = mode !== 'meshArm' ? rectAxis(mode) : undefined;
  if (!localAxis) return {};
  const rect = item as Utility;
  const field = localAxis.dx ? 'customLength' : 'customWidth';
  const scale = metersToWorld(1, map);
  const axis = rotatedVector(localAxis, displayAngle);
  const next = draggedEdge((rect[field] ?? 10) * scale, delta, axis, scale, 110 * scale);
  const update = { [field]: next.size / scale };
  const resized = withMarkerCenter({ ...rect, ...update }, collection, project(add(center, next.centerOffset), canonical), map, version);
  return { ...update, position: resized.position };
}
