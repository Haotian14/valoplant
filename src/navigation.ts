import { distance } from './board-gestures.ts';
import { gameAsset, point, project, type MapInfo, type Point } from './catalog.ts';
import type { SightSegment } from './map-vision.ts';

type Traversal = {
  from: [polygon: number, x: number, y: number];
  to: [polygon: number, x: number, y: number];
  bidirectional?: true;
  teleport?: true;
};
export type NavSource = {
  points: [number, number][];
  polygons: number[][];
  links: [from: number, to: number, x: number, y: number][];
  floorHeights?: (number | null)[];
  traversals?: Traversal[];
};
type Portal = { to: number; entry: Point; exit: Point; teleport?: true };
type Polygon = { points: Point[]; center: Point; floor?: number | null; portal: Portal[] };
export type Navigation = (Polygon | undefined)[];
export type RoutePoint = Point & { teleport?: true };
const cache = new Map<string, Promise<Navigation>>();

export function prepareNavigation(source: NavSource): Navigation {
  const polygons = source.polygons.map((indices, id) => {
    if (indices.length < 3) return;
    const points = indices.map(index => point(...source.points[index]));
    const center = point(points.reduce((sum, point) => sum + point.dx, 0) / points.length,
      points.reduce((sum, point) => sum + point.dy, 0) / points.length);
    return { points, center, floor: source.floorHeights?.[id], portal: [] as Portal[] };
  });
  for (const [from, to, x, y] of source.links) {
    const at = point(x, y);
    polygons[from]?.portal.push({ to, entry: at, exit: at });
  }
  for (const { from, to, bidirectional, teleport } of source.traversals ?? []) {
    const [fromId, entryX, entryY] = from, [toId, exitX, exitY] = to;
    const entry = point(entryX, entryY), exit = point(exitX, exitY);
    polygons[fromId]?.portal.push({ to: toId, entry, exit, teleport });
    if (bidirectional) polygons[toId]?.portal.push({ to: fromId, entry: exit, exit: entry, teleport });
  }
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

export function navigationFloorsAt(nodes: Navigation | undefined, position: Point, attack: boolean) {
  const p = project(position, attack);
  const floors: number[] = [];
  for (const node of nodes ?? []) {
    const floor = node?.floor;
    if (node && floor != null && contains(node, p) && !floors.some(existing => Math.abs(existing - floor) <= 8)) {
      floors.push(floor);
    }
  }
  return floors;
}

function nearest(nodes: Navigation, p: Point, floor?: number) {
  let exact = true;
  let nearestId = -1, shortest = 42, floorGap: number | undefined;
  nodes.forEach((node, index) => {
    if (!node) return;
    const hit = contains(node, p);
    const range = distance(node.center, p);
    const gap = hit && floor != null && node.floor != null ? Math.abs(node.floor - floor) : undefined;
    const closer = gap != null && floorGap != null && gap !== floorGap ? gap < floorGap : range < shortest;
    if (hit && (!exact || nearestId < 0 || closer) || !hit && (!exact || nearestId < 0) && range < shortest) {
      exact = hit; shortest = range; nearestId = index; floorGap = gap;
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

export function routeAcrossMap(
  nodes: Navigation, start: Point, goal: Point, attack: boolean, doors: readonly SightSegment[],
  floors?: { start?: number; end?: number },
) {
  const from = project(start, attack), to = project(goal, attack);
  const startNode = nearest(nodes, from, floors?.start), target = nearest(nodes, to, floors?.end);
  if (startNode < 0 || target < 0) return;
  const open = new Set([startNode]);
  const found = new Map<number, { steps: number; via?: Portal; from?: number }>([[startNode, { steps: 0 }]]);
  // Straight-line distance can overestimate the remaining cost on maps with a teleporter.
  const hasTeleports = nodes.some(node => node?.portal.some(portal => portal.teleport));
  const estimate = (id: number) => found.get(id)!.steps + (hasTeleports ? 0 : distance(nodes[id]!.center, to));
  while (open.size) {
    let current = -1, score = Infinity;
    for (const id of open) {
      const value = estimate(id);
      if (value < score) { current = id; score = value; }
    }
    if (current === target) {
      const path: RoutePoint[] = [goal];
      let entry = found.get(target);
      while (entry?.via && entry.from !== undefined) {
        const { entry: portalEntry, exit, teleport } = entry.via;
        if (exit !== portalEntry) {
          const arrival = project(exit, attack);
          path.push(teleport ? { ...arrival, teleport } : arrival);
        }
        path.push(project(portalEntry, attack));
        entry = found.get(entry.from);
      }
      path.push(start);
      return path.reverse();
    }
    open.delete(current);
    const node = nodes[current]!;
    for (const edge of node.portal) {
      const targetNode = nodes[edge.to];
      if (!targetNode) continue;
      const entry = project(edge.entry, attack), exit = project(edge.exit, attack);
      if (crosses(project(node.center, attack), entry, doors) || crosses(exit, project(targetNode.center, attack), doors) ||
        (!edge.teleport && edge.entry !== edge.exit && crosses(entry, exit, doors))) continue;
      const traversalDistance = edge.teleport ? 0 : distance(edge.entry, edge.exit);
      const steps = found.get(current)!.steps + distance(node.center, edge.entry) +
        traversalDistance + distance(edge.exit, targetNode.center);
      if (steps >= (found.get(edge.to)?.steps ?? Infinity)) continue;
      found.set(edge.to, { steps, via: edge, from: current });
      open.add(edge.to);
    }
  }
}

export function routeOffsets(route: readonly RoutePoint[]) {
  let total = 0;
  const lengths = route.map((step, index) => {
    if (index && !step.teleport) total += distance(route[index - 1], step);
    return total;
  });
  return total ? lengths.map(length => length / total) : undefined;
}
