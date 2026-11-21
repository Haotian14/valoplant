import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { abilityFor, abilityGeometry, mapArtworkFrame, mapById, maps, point, project, virtualToWorld, worldPerMeter } from '../src/catalog.ts';
import { changedMapDoors, doorLine, findMapDoor, mapDoors, toggleMapDoor } from '../src/map-doors.ts';
import { projectSightWalls, sightDoorWalls, sightPolygon } from '../src/map-vision.ts';
import { readIca, writeIca } from '../src/archive.ts';
import { newPage, newStrategy } from '../src/strategy.ts';

const readWalls = (map: string, attack: boolean): number[] => JSON.parse(
  readFileSync(new URL(`../public/game/vision/${map}-${attack ? 'attack' : 'defense'}.json`, import.meta.url), 'utf8'),
);

test('every map ships usable wall data registered to each side of the artwork', () => {
  for (const map of maps) for (const attack of [true, false]) {
    const raw = readWalls(map.id, attack);
    const projected = projectSightWalls(raw, map, attack);
    const frame = mapArtworkFrame(map, attack);
    assert.ok(raw.length > 1000, map.id);
    assert.equal(projected.length * 4, raw.length);
    assert.ok(raw.every(Number.isFinite), map.id);
    assert.equal(projected[0][0], frame.x + raw[0] * frame.scale);
  }
});

test('view cones stop at the first wall and continue past its endpoints', () => {
  const origin = point(100, 100);
  const walls = [[95, 80, 105, 80], [95, 70, 105, 70]] as const;
  const cone = sightPolygon(walls, origin, 90, 0, 90)!;
  assert.ok(cone.some(p => Math.abs(p.dx) < 1e-8 && Math.abs(p.dy + 20) < 1e-8));
  assert.ok(cone.some(p => Math.abs(Math.hypot(p.dx, p.dy) - 90) < 1e-8));
  assert.equal(sightPolygon(walls, origin, 90, Math.PI, 90), undefined);
});

test('Trademark keeps its ten-metre scan radius on the visible side of a wall', () => {
  const map = mapById.lotus;
  const geometry = abilityGeometry(abilityFor('chamber', 0)!, map.id);
  const radius = geometry.diameter! * virtualToWorld / 2;
  const origin = point(100, 100);
  const wall = [[120, 0, 120, 200]] as const;
  const range = sightPolygon(wall, origin, radius, 0, 360)!;

  assert.equal(geometry.requiresSight, true);
  assert.ok(Math.abs(radius - 10 * worldPerMeter(map)) < 1e-9);
  assert.ok(range.every(p => p.dx <= 20 + 1e-9));
  assert.ok(range.some(p => Math.abs(p.dx + radius) < 1e-9));
  assert.equal(sightPolygon([], origin, radius, 0, 360), undefined);
});

test('the Ascent door blocks the same sightline on either side only when shut', () => {
  const map = mapById.ascent;
  const [door] = mapDoors(map);
  for (const attack of [true, false]) {
    const [a, b] = doorLine(door, map, attack, false);
    const facing = attack ? 1 : -1;
    const origin = point((a.dx + b.dx) / 2 - facing * 14, (a.dy + b.dy) / 2);
    const walls = projectSightWalls(readWalls(map.id, attack), map, attack);
    const open = [...walls, ...sightDoorWalls(map, attack, new Set())];
    const shut = [...walls, ...sightDoorWalls(map, attack, new Set([door.id]))];
    assert.equal(sightPolygon(open, origin, 21, facing * Math.PI / 2, 15), undefined);
    const cone = sightPolygon(shut, origin, 21, facing * Math.PI / 2, 15)!;
    assert.ok(cone.some(p => Math.abs(p.dx - facing * 14) < 1e-8 && Math.abs(p.dy) < 1e-8));
  }
});

test('rotating and breaking Lotus doors change the blocking segments by pose', () => {
  const map = mapById.lotus;
  const [spin, , breakable] = mapDoors(map);
  const [a, b] = doorLine(spin, map, true, true);
  assert.ok(Math.abs(a.dx - b.dx) < 1e-8);
  assert.deepEqual(doorLine(spin, map, false, true), [project(a, false), project(b, false)]);
  assert.equal(sightDoorWalls(map, true, new Set()).length, 3);
  assert.equal(sightDoorWalls(map, true, new Set([spin.id, breakable.id])).length, 2);
});

test('door state stays on its own page and survives .ica export', () => {
  const map = mapById.lotus;
  const [door] = mapDoors(map);
  const draft = newStrategy(map.id, 'Lotus');
  const original = newPage(0, 'false');
  const changed = toggleMapDoor(original, door, map, 112);
  draft.document.pages = [changed, newPage(1)];
  const [copy, sibling] = readIca(writeIca(draft)).document.pages;
  assert.deepEqual(changedMapDoors(copy, map), [door.id]);
  assert.deepEqual(changedMapDoors(sibling, map), []);
  assert.deepEqual(changedMapDoors(original, map), []);
  assert.equal(findMapDoor(copy.utilityData[0], map)?.id, door.id);
  assert.equal(findMapDoor(copy.utilityData[0], mapById.ascent), undefined);
  assert.deepEqual(toggleMapDoor(copy, door, map, 112).utilityData, []);
});
