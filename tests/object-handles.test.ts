import assert from 'node:assert/strict';
import test from 'node:test';
import { abilityFor, abilityGeometry, add, mapById, maps, point, project, virtualToWorld } from '../src/catalog.ts';
import { abilityLengthRange, abilityRectRange, flipPage, hasCircleRangeFill, makeAbility, makeUtility, uprightPosition } from '../src/geometry.ts';
import { canRotate, objectHandles, stepObjectRotation, transformObject } from '../src/object-handles.ts';
import { newPage, type ImageMarker, type Utility } from '../src/strategy.ts';
import { maxWallLength, smoothWall, wallLength } from '../src/wall-path.ts';

const map = mapById.lotus;
const defense = newPage(0, 'false');
const version = 112;

test('resizing a legacy image on defense holds its visible top-left corner', () => {
  const item: ImageMarker = { id: 'picture', position: point(600, 300), scale: 160, aspectRatio: 2 };
  const frame = { item, collection: 'imageData', map, page: defense, version } as const;
  const [handle] = objectHandles(frame, 13);
  const resized = { ...item, ...transformObject(frame, handle, handle.position, add(handle.position, point(100, 30)), false) };

  assert.ok(resized.scale > item.scale);
  assert.deepEqual(uprightPosition(resized, defense, version), uprightPosition(item, defense, version));
});

test('resizing a rotated rectangle holds its opposite edge on defense', () => {
  const item = { ...makeUtility('customRectangle', point(600, 300), true, map, 0xffffffff, version), rotation: Math.PI / 2 };
  const frame = { item, collection: 'utilityData', map, page: defense, version } as const;
  const before = objectHandles(frame, 13);
  const right = before.find(handle => handle.mode === 'right')!;
  const resized = { ...item, ...transformObject(frame, right, right.position, add(right.position, point(0, -25)), false) } as Utility;
  const after = objectHandles({ ...frame, item: resized }, 13);
  const oldEdge = before.find(handle => handle.mode === 'left')!.position;
  const newEdge = after.find(handle => handle.mode === 'left')!.position;

  assert.ok(resized.customLength! > item.customLength!);
  assert.ok(Math.hypot(oldEdge.dx - newEdge.dx, oldEdge.dy - newEdge.dy) < 1e-9);
});

test('a scalable skill stores unscaled length when dragged on a scaled map', () => {
  const item = makeAbility('breach', 2, point(500, 200), true, map, false);
  const frame = { item, collection: 'abilityData', map, page: defense, version } as const;
  const range = abilityLengthRange(item, map)!;
  const handle = objectHandles(frame, 13).find(handle => handle.mode === 'length')!;
  const patch = transformObject(frame, handle, handle.position, add(handle.position, point(0, 50 * range.displayScale)), false) as { length: number };

  assert.equal(range.length, 46.24);
  assert.ok(Math.abs(patch.length - (range.min + 50)) < 1e-9);
});

test('Fault Line is eight metres wide while keeping the original anchor across maps', () => {
  const skill = abilityFor('breach', 2)!;
  for (const map of maps) {
    const geometry = abilityGeometry(skill, map.id);
    assert.ok(Math.abs(geometry.width! - 8 * 5.78 * map.scale) < 1e-9, map.id);
    assert.ok(Math.abs(geometry.anchor[0] - 7.5 * 5.78 * map.scale / 2) < 1e-9, map.id);
  }
});

test('directional ranges and distance handles include the gap from the cast point', () => {
  const center = point(500, 400);
  const skills = [['breach', 2, 8], ['breach', 3, 8], ['iso', 0, 5], ['waylay', 3, 3]] as const;
  for (const [type, index, gapMeters] of skills) {
    const item = makeAbility(type, index, project(center, false), true, map, false);
    const frame = { item, collection: 'abilityData', map, page: defense, version } as const;
    const geometry = abilityGeometry(abilityFor(type, index)!, map.id);
    const rect = abilityRectRange(item, map, geometry);
    const gap = gapMeters * 5.78 * map.scale * virtualToWorld;
    assert.ok(Math.abs(rect.forward - rect.height - gap) < 1e-9);
    const handle = objectHandles(frame, 13).find(handle => handle.mode === (geometry.scalable ? 'length' : 'rotate'))!;
    const tip = center.dy + rect.forward + (geometry.scalable ? 0 : 13);
    assert.ok(Math.abs(handle.position.dy - tip) < 1e-9);
  }
});

test('Sage can rotate the wall sprite around its existing placement anchor', () => {
  const center = point(500, 400);
  const item = makeAbility('sage', 0, center, true, map, true);
  const frame = { item, collection: 'abilityData', map, page: newPage(0), version } as const;
  const [handle] = objectHandles(frame, 13);
  assert.equal(handle.mode, 'rotate');
  assert.deepEqual(transformObject(frame, handle, handle.position, add(center, point(39, 0)), true), { rotation: Math.PI / 2 });
});

test('plain skill icons turn from upright on defense without adding a range handle', () => {
  for (const [type, index] of [['sova', 0], ['fade', 0], ['yoru', 2]] as const) {
    const item = makeAbility(type, index, point(500, 400), true, map, false);
    const frame = { item, collection: 'abilityData', map, page: defense, version } as const;
    assert.equal(canRotate(item, map), true);
    assert.deepEqual(objectHandles(frame, 13), []);
    const rotation = stepObjectRotation(item, map, false, true);
    assert.equal(rotation, Math.PI * 5 / 4);
    assert.equal(stepObjectRotation({ ...item, rotation }, map, false, false), Math.PI);
    assert.equal(stepObjectRotation({ ...item, rotation: -Math.PI / 4 }, map, true, true), 2 * Math.PI);
    const attack = { ...newPage(0), abilityData: [item, { ...item, id: 'turned', rotation: -Math.PI }] };
    const flipped = flipPage(attack, 'false', map, 96);
    assert.deepEqual(flipped.abilityData.map(marker => marker.rotation), [0, 2 * Math.PI]);
  }
});

test('Killjoy turret and Alarmbot use outlined outer ranges', () => {
  for (const index of [1, 2]) {
    const geometry = abilityGeometry(abilityFor('killjoy', index)!, map.id);
    assert.equal(hasCircleRangeFill(geometry), false);
  }
  assert.equal(hasCircleRangeFill(abilityFor('killjoy', 0)!.geometry), true);
});

test('fixed-length skills rotate from their range tip around a stationary cast point', () => {
  const center = point(500, 400);
  const gap = 13;
  for (const [type, index] of [['omen', 1], ['fade', 3]] as const) {
    const { height } = abilityGeometry(abilityFor(type, index)!, map.id);
    const distance = height! * virtualToWorld + gap;
    for (const attack of [true, false]) {
      const page = attack ? newPage(0) : defense;
      const item = { ...makeAbility(type, index, project(center, attack), true, map, attack), rotation: undefined };
      const frame = { item, collection: 'abilityData', map, page, version } as const;
      const [handle] = objectHandles(frame, gap);
      const direction = attack ? 1 : -1;

      assert.equal(handle.mode, 'rotate');
      assert.ok(Math.hypot(handle.position.dx - center.dx, handle.position.dy - center.dy + direction * distance) < 1e-9);
      const patch = transformObject(frame, handle, handle.position, add(center, point(direction * distance, 0)), false);
      assert.deepEqual(Object.keys(patch), ['rotation']);
      assert.ok('rotation' in patch && Math.abs((patch.rotation ?? NaN) - Math.PI / 2) < 1e-9);
    }
  }
});

test('Paranoia keeps a rotation handle near its marker when the range tip is offscreen', () => {
  const center = point(500, 100);
  const item = makeAbility('omen', 1, center, true, map, true);
  const frame = { item, collection: 'abilityData', map, page: newPage(0), version } as const;
  const isVisible = ({ dy }: typeof center) => dy >= 0;
  const [handle] = objectHandles(frame, 13, isVisible);
  const [preview] = objectHandles(frame, 13, isVisible, { rotation: Math.PI / 2 });

  assert.deepEqual(handle.position, add(center, point(0, -39)));
  assert.deepEqual(preview.position, add(center, point(39, 0)));
});

test('a bend pulled from a wall segment respects the saved orientation and maximum length', () => {
  const item = makeAbility('harbor', 1, point(500, 200), true, map, false);
  const frame = { item, collection: 'abilityData', map, page: defense, version } as const;
  const handle = objectHandles(frame, 13).find(handle => handle.mode === 'wallInsert')!;
  const patch = transformObject(frame, handle, handle.position, add(handle.position, point(1200, 0)), false) as { wallPath: typeof item.wallPath };
  const path = patch.wallPath!;

  assert.equal(path.length, 2);
  assert.ok(path[0].dx < 0);
  assert.ok(path[1].dy > 0);
  assert.ok(wallLength(path) <= maxWallLength(map));
  assert.ok(wallLength(path) > maxWallLength(map) - 1);
  assert.deepEqual(smoothWall(path).at(-1), path[1]);
});

test('dragging a single Deadlock mesh arm on defense preserves the native arm order', () => {
  const center = point(500, 300);
  const mesh = makeAbility('deadlock', 2, center, true, map, false);
  const item = { ...mesh, armLengthsMeters: [10, 9, 8, 7], rotation: Math.PI / 2 };
  const frame = { item, collection: 'abilityData', map, page: defense, version } as const;
  const handles = objectHandles(frame, 13).filter(handle => handle.mode === 'meshArm');
  const first = handles[0];
  const screen = project(center, false);
  const meter = 5.78 * map.scale * virtualToWorld;
  assert.ok(Math.abs(Math.hypot(first.position.dx - screen.dx, first.position.dy - screen.dy) - 10 * meter) < 1e-9);
  const move = 3 * meter * Math.SQRT1_2;
  const patch = transformObject(frame, first, first.position, add(first.position, point(move, move)), false);
  assert.deepEqual(handles.map(handle => handle.index), [0, 1, 2, 3]);
  assert.deepEqual(Object.keys(patch), ['armLengthsMeters']);
  assert.deepEqual(Object.values(patch).flat().map(number => Math.round(number)), [7, 9, 8, 7]);
});
