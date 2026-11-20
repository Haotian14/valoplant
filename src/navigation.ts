import { distance } from './board-gestures.ts';
import { gameAsset, point, project, type MapInfo, type Point } from './catalog.ts';
import type { SightSegment } from './map-vision.ts';

export type NavSource = { points: [number, number][]; polygons: number[][]; links: [number, number, number, number][] };
type Portal = { to: number; at: Point };
type Polygon = { points: Point[]; center: Point; portal: Portal[] };
export type Navigation = (Polygon | undefined)[];
const cache = new Map<string, Promise<Navigation>>();

export function prepareNavigation(source: NavSource): Navigation {
  const polygons = source.polygons.map(indices => {
    if (indices.length < 3) return;
    const points = indices.map(index => point(...source.points[index]));
    const center = point(points.reduce((sum, point) => sum + point.dx, 0) / points.length,
      points.reduce((sum, point) => sum + point.dy, 0) / points.length);
    return { points, center, portal: [] as Portal[] };
  });
  for (const [from, to, x, y] of source.links) polygons[from]?.portal.push({ to, at: point(x, y) });
  return polygons;
}

export function loadNavigation(map: MapInfo) {
  const existing = cache.get(map.id);
  if (existing) return existing;
  const request = fetch(gameAsset(`navigation/${map.id}.json`)).then(async response => {
    if (!response.ok) throw new Error('无法加载地图寻路数据');
    return prepareNavigation(await response.json() as NavSource);
  }).catch(error => { cache.delete(map.id); throw error; });
  cache.set(map.id, request);
  return request;
}

function contains(polygon: Polygon, p: Point) {
  let inBounds = false;
  const { points } = polygon;
  for (let i = 0, last = points.length - 1; i < points.length; last = i++) {
    const a = points[i], b = points[last];
    if ((a.dy > p.dy) !== (b.dy > p.dy) && p.dx < a.dx + (p.dy - a.dy) * (b.dx - a.dx) / (b.dy - a.dy)) {
      inBounds = !inBounds;
    }
  }
  return inBounds;
}

function nearest(nodes: Navigation, p: Point) {
  let exact = true;
  let nearestId = -1, shortest = 42;
  nodes.forEach((node, index) => {
    if (!node) return;
    const hit = contains(node, p);
    const range = distance(node.center, p);
    if (hit && (!exact || nearestId < 0 || range < shortest) || !hit && (!exact || nearestId < 0) && range < shortest) {
      exact = hit; shortest = range; nearestId = index;
    }
  });
  return nearestId;
}

function crosses(start: Point, end: Point, walls: readonly SightSegment[]) {
  const cross = (a: Point, b: Point, c: Point) => (b.dx - a.dx) * (c.dy - a.dy) - (b.dy - a.dy) * (c.dx - a.dx);
  return walls.some(([x1, y1, x2, y2]) => {
    const a = point(x1, y1), b = point(x2, y2);
    return cross(start, end, a) * cross(start, end, b) < 0 && cross(a, b, start) * cross(a, b, end) < 0;
  });
}

export function routeAcrossMap(nodes: Navigation, start: Point, goal: Point, attack: boolean, doors: readonly SightSegment[]) {
  const from = project(start, attack), to = project(goal, attack);
  const startNode = nearest(nodes, from), target = nearest(nodes, to);
  if (startNode < 0 || target < 0) return;
  const open = new Set([startNode]);
  const found = new Map<number, { steps: number; via?: Portal; from?: number }>([[startNode, { steps: 0 }]]);
  const estimate = (id: number) => found.get(id)!.steps + distance(nodes[id]!.center, to);
  while (open.size) {
    let current = -1, score = Infinity;
    for (const id of open) {
      const value = estimate(id);
      if (value < score) { current = id; score = value; }
    }
    if (current === target) {
      const path = [goal];
      let entry = found.get(target);
      while (entry?.via && entry.from !== undefined) {
        path.push(project(entry.via.at, attack));
        entry = found.get(entry.from);
      }
      path.push(start);
      return path.reverse();
    }
    open.delete(current);
    const node = nodes[current]!;
    for (const edge of node.portal) {
      const targetNode = nodes[edge.to];
      if (!targetNode || crosses(project(node.center, attack), project(edge.at, attack), doors) ||
        crosses(project(edge.at, attack), project(targetNode.center, attack), doors)) continue;
      const steps = found.get(current)!.steps + distance(node.center, edge.at) + distance(edge.at, targetNode.center);
      if (steps >= (found.get(edge.to)?.steps ?? Infinity)) continue;
      found.set(edge.to, { steps, via: edge, from: current });
      open.add(edge.to);
    }
  }
}
