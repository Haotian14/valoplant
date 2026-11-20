import { distance, rotatedVector } from './board-gestures.ts';
import type { MapInfo, Point } from './catalog.ts';
import type { AbilityMarker } from './strategy.ts';

const origin = { dx: 0, dy: 0 };
const samples = 16;
const worldPerMeter = (map: MapInfo) => 5.78 * map.scale * 1000 / 831;
export const maxWallPoints = 7;
export const maxWallLength = (map: MapInfo) => 60 * worldPerMeter(map);

export function initialWallPath(map: MapInfo, attack: boolean, rotation = 0): Point[] {
  return [rotatedVector({ dx: 0, dy: (attack ? -30 : 30) * worldPerMeter(map) }, rotation)];
}

export function savedWallPath(marker: AbilityMarker, map: MapInfo): Point[] {
  return Array.isArray(marker.wallPath) ? marker.wallPath : initialWallPath(map, true, marker.rotation);
}

function lerp(a: Point, b: Point, t: number): Point {
  return { dx: a.dx + (b.dx - a.dx) * t, dy: a.dy + (b.dy - a.dy) * t };
}

export function smoothWall(path: Point[]): Point[] {
  const points = [origin, ...path];
  if (points.length < 3) return points;
  const curve = [origin];
  const step = (a: Point, b: Point) => Math.max(1e-6, Math.sqrt(distance(a, b)));
  for (let index = 0; index + 1 < points.length; index++) {
    const left = points[index], right = points[index + 1];
    const before = points[index - 1] ?? lerp(right, left, 2);
    const after = points[index + 2] ?? lerp(left, right, 2);
    const a = step(before, left), b = step(left, right), c = step(right, after);
    for (let index = 1; index <= samples; index++) {
      const fraction = index / samples;
      const t = fraction * b;
      const p = lerp(before, left, 1 + t / a);
      const q = lerp(left, right, fraction);
      const r = lerp(right, after, (t - b) / c);
      curve.push(lerp(lerp(p, q, (a + t) / (a + b)), lerp(q, r, t / (b + c)), fraction));
    }
  }
  return curve;
}

export function wallMidpoints(path: Point[]): Point[] {
  if (path.length <= 1) return path.map(point => lerp(origin, point, .5));
  const curve = smoothWall(path);
  return path.map((_, index) => curve[index * samples + samples / 2]);
}

export function wallLength(path: Point[]): number {
  return smoothWall(path).reduce((total, point, index, points) =>
    index ? total + distance(points[index - 1], point) : total, 0);
}

export function reshapeWall(
  path: Point[], index: number, insertAt: Point | undefined, target: Point, maxLength: number,
): Point[] {
  const limit = Math.max(maxLength, wallLength(path));
  const draft = [...path];
  if (insertAt) draft.splice(index, 0, insertAt);
  const currentLength = wallLength(draft);
  const baseline = currentLength > limit ? draft.map(point => lerp(origin, point, limit / currentLength)) : draft;
  const start = baseline[index];
  if (!start) return baseline;
  const substitute = (point: Point) => baseline.map((value, i) => i === index ? point : value);
  const full = substitute(target);
  if (wallLength(full) <= limit) return full;
  let near = 0, far = 1;
  for (let attempt = 0; attempt < 14; attempt++) {
    const fraction = (near + far) / 2;
    if (wallLength(substitute(lerp(start, target, fraction))) > limit) far = fraction;
    else near = fraction;
  }
  return substitute(lerp(start, target, near));
}
