import assert from 'node:assert/strict';
import test from 'node:test';
import { add, mapById, point } from '../src/catalog.ts';
import { abilityLengthRange, makeAbility, makeUtility, metersToWorld, uprightPosition } from '../src/geometry.ts';
import { objectHandles, transformObject } from '../src/object-handles.ts';
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
  const mesh = makeAbility('deadlock', 2, point(500, 300), true, map, false);
  const item = { ...mesh, armLengthsMeters: [10, 9, 8, 7], rotation: Math.PI / 2 };
  const frame = { item, collection: 'abilityData', map, page: defense, version } as const;
  const handles = objectHandles(frame, 13).filter(handle => handle.mode === 'meshArm');
  const first = handles[0];
  const move = metersToWorld(3, map) * Math.SQRT1_2;
  const patch = transformObject(frame, first, first.position, add(first.position, point(move, move)), false);
  assert.deepEqual(handles.map(handle => handle.index), [0, 1, 2, 3]);
  assert.deepEqual(Object.keys(patch), ['armLengthsMeters']);
  assert.deepEqual(Object.values(patch).flat().map(number => Math.round(number)), [7, 9, 8, 7]);
});
