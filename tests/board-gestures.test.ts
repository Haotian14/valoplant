import assert from 'node:assert/strict';
import test from 'node:test';
import { distance, midpoint, pinchCamera, placeBeside, steppedRotation, zoomAt } from '../src/board-gestures.ts';

test('wheel zoom keeps the world point under the cursor fixed', () => {
  const start = { x: 100, y: 200, zoom: 2 };
  const cursor = { dx: 60, dy: 280 };

  assert.deepEqual(zoomAt(start, cursor, 2), { x: 80, y: 240, zoom: 4 });
  assert.deepEqual(zoomAt(start, cursor, 10), { x: 70, y: 260, zoom: 8 });
  assert.deepEqual(zoomAt(start, cursor, .1), { x: 140, y: 120, zoom: 1 });
});

test('pinch scales from the initial touch midpoint and follows its motion', () => {
  const first = { dx: 0, dy: 0 };
  const second = { dx: 20, dy: 0 };
  const movedFirst = { dx: 10, dy: 20 };
  const movedSecond = { dx: 50, dy: 20 };
  const scale = distance(movedFirst, movedSecond) / distance(first, second);

  assert.deepEqual(pinchCamera({ x: 200, y: 120, zoom: 1 }, { dx: 70, dy: 40 },
    midpoint(first, second), midpoint(movedFirst, movedSecond), scale, 2), { x: 115, y: 60, zoom: 2 });
});

test('rotation snaps to the next 45-degree step in the requested direction', () => {
  const step = Math.PI / 4;
  assert.equal(steppedRotation(Math.PI / 6, true), step);
  assert.equal(steppedRotation(Math.PI / 6, false), 0);
  assert.equal(steppedRotation(step, true), Math.PI / 2);
  assert.equal(steppedRotation(0, false), -step);
});

test('character panels stay beside the portrait and clear the right and bottom edges', () => {
  const canvas = { left: 50, top: 80, right: 950, bottom: 640 };
  const panel = { width: 196, height: 230 };

  assert.deepEqual(placeBeside({ left: 260, right: 284, top: 154, bottom: 178 }, canvas, panel), { dx: 292, dy: 154 });
  assert.deepEqual(placeBeside({ left: 910, right: 934, top: 602, bottom: 626 }, canvas, panel), { dx: 706, dy: 402 });
});

test('character panels open below or above when the canvas is too narrow for either side', () => {
  const canvas = { left: 0, top: 48, right: 360, bottom: 660 };
  const panel = { width: 196, height: 230 };

  assert.deepEqual(placeBeside({ left: 169, right: 191, top: 165, bottom: 187 }, canvas, panel), { dx: 82, dy: 195 });
  assert.deepEqual(placeBeside({ left: 169, right: 191, top: 510, bottom: 532 }, canvas, panel), { dx: 82, dy: 272 });
});
