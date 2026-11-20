import type { Point } from './catalog.ts';

export type Camera = { x: number; y: number; zoom: number };

export const fitZoom = (zoom: number) => Math.min(8, Math.max(1, zoom));
export const distance = (a: Point, b: Point) => Math.hypot(a.dx - b.dx, a.dy - b.dy);
export const midpoint = (a: Point, b: Point): Point => ({ dx: (a.dx + b.dx) / 2, dy: (a.dy + b.dy) / 2 });

export function zoomAt(camera: Camera, position: Point, factor: number): Camera {
  const zoom = fitZoom(camera.zoom * factor);
  const ratio = camera.zoom / zoom;
  return { zoom, x: position.dx + (camera.x - position.dx) * ratio, y: position.dy + (camera.y - position.dy) * ratio };
}

export function pinchCamera(camera: Camera, anchor: Point, startCenter: Point, center: Point, factor: number, unitsPerPixel: number): Camera {
  const next = zoomAt(camera, anchor, factor);
  const conversion = unitsPerPixel * camera.zoom / next.zoom;
  return { zoom: next.zoom,
    x: next.x - (center.dx - startCenter.dx) * conversion,
    y: next.y - (center.dy - startCenter.dy) * conversion };
}

export function steppedRotation(rotation: number, clockwise: boolean): number {
  const step = Math.PI / 4;
  const units = rotation / step;
  const next = clockwise ? Math.floor(units + 1e-6) + 1 : Math.ceil(units - 1e-6) - 1;
  return next * step;
}

export function rotatedVector(vector: Point, radians: number): Point {
  const sin = Math.sin(radians), cos = Math.cos(radians);
  return { dx: vector.dx * cos - vector.dy * sin, dy: vector.dx * sin + vector.dy * cos };
}

export function draggedAngle(rotation: number, start: Point, end: Point, snap: boolean): number {
  const cross = start.dx * end.dy - start.dy * end.dx;
  const dot = start.dx * end.dx + start.dy * end.dy;
  const result = rotation + Math.atan2(cross, dot);
  const step = Math.PI / 4;
  return snap ? Math.round(result / step) * step : result;
}

export function draggedEdge(size: number, delta: Point, axis: Point, min: number, max: number) {
  const next = Math.min(max, Math.max(min, size + delta.dx * axis.dx + delta.dy * axis.dy));
  const offset = (next - size) / 2;
  return { size: next, centerOffset: { dx: axis.dx * offset, dy: axis.dy * offset } };
}
