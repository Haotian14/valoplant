import { distance } from './board-gestures.ts';
import { point, project, type MapInfo, type Point } from './catalog.ts';
import { nearestSightWall, type SightSegment } from './map-vision.ts';

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
type Opening = { left: Point; right: Point };
type Portal = { to: number; entry: Point; exit: Point; opening?: Opening; teleport?: true };
type Polygon = { points: Point[]; center: Point; floor?: number | null; convex: boolean; portal: Portal[] };
export type Navigation = (Polygon | undefined)[];
export type RoutePoint = Point & { teleport?: true };
const cache = new Map<string, Promise<Navigation>>();
const area = (a: Point, b: Point, c: Point) =>
  (b.dx - a.dx) * (c.dy - a.dy) - (b.dy - a.dy) * (c.dx - a.dx);

function isConvex(points: Point[]) {
  const turns = points.map((a, i) => area(a, points[(i + 1) % points.length], points[(i + 2) % points.length]));
  return turns.every(turn => turn >= -1e-7) || turns.every(turn => turn <= 1e-7);
}

function sharedOpening(from: Polygon, to: Polygon, midpoint: Point): Opening | undefined {
  if (!from.convex || !to.convex) return;
  for (const [i, a] of from.points.entries()) {
    const b = from.points[(i + 1) % from.points.length];
    const length = distance(a, b);
    if (!length || Math.abs(area(a, b, midpoint)) > .1 * length) continue;
    const along = (p: Point) => ((p.dx - a.dx) * (b.dx - a.dx) + (p.dy - a.dy) * (b.dy - a.dy)) / length;
    for (const [j, c] of to.points.entries()) {
      const d = to.points[(j + 1) % to.points.length];
      if (Math.abs(area(a, b, c)) > 1e-7 || Math.abs(area(a, b, d)) > 1e-7) continue;
      const [near, far] = along(c) <= along(d) ? [c, d] : [d, c];
      const first = along(near) > 0 ? near : a;
      const last = along(far) < length ? far : b;
      // Stored coordinates are rounded. The midpoint identifies the intended overlap on split edges.
      if (along(last) <= along(first) || distance(midpoint, point((first.dx + last.dx) / 2, (first.dy + last.dy) / 2)) > .15) continue;
      return area(from.center, to.center, first) > area(from.center, to.center, last)
        ? { left: first, right: last } : { left: last, right: first };
    }
  }
}

export function prepareNavigation(source: NavSource): Navigation {
  const polygons = source.polygons.map((indices, id) => {
    if (indices.length < 3) return;
    const points = indices.map(index => point(...source.points[index]));
    const center = point(points.reduce((sum, point) => sum + point.dx, 0) / points.length,
      points.reduce((sum, point) => sum + point.dy, 0) / points.length);
    return { points, center, floor: source.floorHeights?.[id], convex: isConvex(points), portal: [] as Portal[] };
  });
  for (const [from, to, x, y] of source.links) {
    const origin = polygons[from], destination = polygons[to];
    if (!origin || !destination) continue;
    const at = point(x, y);
    origin.portal.push({ to, entry: at, exit: at, opening: sharedOpening(origin, destination, at) });
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
  // Use Vite's hashed asset URLs so an older offline worker cannot serve a stale mesh.
  const assets = import.meta.glob<string>('./navigation-data/*.json', {
    eager: true, query: '?url&no-inline', import: 'default',
  });
  const url = assets[`./navigation-data/${map.id}.json`];
  if (!url) return Promise.reject(new Error('无法加载地图寻路数据'));
  const request = fetch(url).then(async response => {
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
  let nearestId = -1, shortest = Infinity, floorGap = Infinity;
  nodes.forEach((node, index) => {
    if (!node || !contains(node, p)) return;
    const range = distance(node.center, p);
    const gap = floor != null && node.floor != null ? Math.abs(node.floor - floor) : Infinity;
    if (gap < floorGap || (gap === floorGap && range < shortest)) {
      shortest = range;
      nearestId = index;
      floorGap = gap;
    }
  });
  if (nearestId >= 0) return { id: nearestId, at: p };

  let closest = p;
  shortest = 42;
  nodes.forEach((node, index) => {
    if (!node) return;
    const outline = node.points.map((a, i): SightSegment => {
      const b = node.points[(i + 1) % node.points.length];
      return [a.dx, a.dy, b.dx, b.dy];
    });
    const onEdge = nearestSightWall(outline, p, shortest);
    if (onEdge === p) return;
    closest = onEdge;
    shortest = distance(onEdge, p);
    nearestId = index;
  });
  if (nearestId >= 0) return { id: nearestId, at: closest };
}

export function crossesDoor(start: Point, end: Point, walls: readonly SightSegment[]) {
  if (start.dx === end.dx && start.dy === end.dy) return false;
  return walls.some(([x1, y1, x2, y2]) => {
    if (Math.max(start.dx, end.dx) < Math.min(x1, x2) || Math.min(start.dx, end.dx) > Math.max(x1, x2) ||
      Math.max(start.dy, end.dy) < Math.min(y1, y2) || Math.min(start.dy, end.dy) > Math.max(y1, y2)) return false;
    const a = point(x1, y1), b = point(x2, y2);
    return area(start, end, a) * area(start, end, b) <= 0 && area(a, b, start) * area(a, b, end) <= 0;
  });
}

function canWalkStraight(nodes: Navigation, start: number, finish: number, from: Point, to: Point) {
  if (start === finish) return nodes[start]!.convex;
  const dx = to.dx - from.dx, dy = to.dy - from.dy;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return false;
  const reachedAt = new Map([[start, 0]]);
  const pending = [start];
  while (pending.length) {
    const id = pending.pop()!;
    if (id === finish) return true;
    for (const { to: next, opening } of nodes[id]!.portal) {
      if (!opening) continue;
      const { left, right } = opening;
      const sideA = area(from, to, left), sideB = area(from, to, right);
      if (sideA * sideB > 0 || sideA === sideB) continue;
      const across = sideA / (sideA - sideB);
      const x = left.dx + (right.dx - left.dx) * across;
      const y = left.dy + (right.dy - left.dy) * across;
      const along = ((x - from.dx) * dx + (y - from.dy) * dy) / lengthSquared;
      if (along < reachedAt.get(id)! - 1e-8 || along > 1 || along >= (reachedAt.get(next) ?? Infinity)) continue;
      reachedAt.set(next, along);
      pending.push(next);
    }
  }
  return false;
}

function pullPath(start: Point, end: Point, openings: Opening[]) {
  const path: Point[] = [];
  const corridor = [{ left: start, right: start }, ...openings, { left: end, right: end }];
  let left = 0, right = 0;
  let corner = start;
  const samePoint = (a: Point, b: Point) => a.dx === b.dx && a.dy === b.dy;
  for (let i = 1; i < corridor.length; i++) {
    const next = corridor[i];
    const leftPoint = corridor[left].left, rightPoint = corridor[right].right;
    if (area(corner, rightPoint, next.right) >= 0) {
      if (samePoint(corner, rightPoint) || area(corner, leftPoint, next.right) <= 0) {
        right = i;
      } else {
        corner = leftPoint;
        path.push(corner);
        right = i = left;
        continue;
      }
    }
    if (area(corner, leftPoint, next.left) <= 0) {
      if (samePoint(corner, leftPoint) || area(corner, corridor[right].right, next.left) >= 0) {
        left = i;
      } else {
        corner = corridor[right].right;
        path.push(corner);
        left = i = right;
      }
    }
  }
  path.push(end);
  return path;
}

function routeWaypoints(start: Point, goal: Point, portals: Portal[], attack: boolean, doors: readonly SightSegment[]): RoutePoint[] {
  const path: RoutePoint[] = [start];
  let openings: Opening[] = [], midpoints: Point[] = [];
  function walkTo(target: Point) {
    const origin = path.at(-1)!;
    const pulled = pullPath(origin, target, openings);
    const blocked = pulled.some((step, i) => crossesDoor(project(pulled[i - 1] ?? origin, attack), project(step, attack), doors));
    path.push(...(blocked ? [...midpoints, target] : pulled));
    openings = [];
    midpoints = [];
  }
  for (const portal of portals) {
    if (portal.opening) {
      openings.push(portal.opening);
      midpoints.push(portal.entry);
      continue;
    }
    walkTo(portal.entry);
    if (portal.entry !== portal.exit) {
      path.push(portal.teleport ? { ...portal.exit, teleport: true } : portal.exit);
    }
  }
  walkTo(goal);
  return path.map(step => step.teleport ? { ...project(step, attack), teleport: true } : project(step, attack));
}

export function routeAcrossMap(
  nodes: Navigation, start: Point, goal: Point, attack: boolean, doors: readonly SightSegment[],
  floors?: { start?: number; end?: number },
) {
  const origin = project(start, attack), destination = project(goal, attack);
  const first = nearest(nodes, origin, floors?.start), last = nearest(nodes, destination, floors?.end);
  if (!first || !last) return;
  const { id: startNode, at: from } = first, { id: target, at: to } = last;
  const walkStart = project(from, attack), walkEnd = project(to, attack);
  if (crossesDoor(start, walkStart, doors) || crossesDoor(walkEnd, goal, doors)) return;
  const straight = !crossesDoor(walkStart, walkEnd, doors) && canWalkStraight(nodes, startNode, target, from, to);
  const withEndpoints = (path: RoutePoint[]) => {
    if (from === origin) path[0] = start;
    else path.unshift(start);
    if (to === destination) path[path.length - 1] = goal;
    else path.push(goal);
    return path;
  };
  // A teleporter can make a path shorter than an unobstructed walk.
  const hasTeleports = nodes.some(node => node?.portal.some(portal => portal.teleport));
  if (straight && !hasTeleports) return withEndpoints([walkStart, walkEnd]);
  const open = new Set([startNode]);
  const found = new Map<number, { steps: number; via?: Portal; from?: number }>([[startNode, { steps: 0 }]]);
  const estimate = (id: number) => found.get(id)!.steps + (hasTeleports ? 0 : distance(nodes[id]!.center, to));
  while (open.size) {
    let current = -1, score = Infinity;
    for (const id of open) {
      const value = estimate(id);
      if (value < score) { current = id; score = value; }
    }
    if (current === target) {
      const portals: Portal[] = [];
      let entry = found.get(target);
      while (entry?.via && entry.from !== undefined) {
        portals.push(entry.via);
        entry = found.get(entry.from);
      }
      const path = routeWaypoints(from, to, portals.reverse(), attack, doors);
      const blocked = path.some((step, i) => i > 0 && !step.teleport && crossesDoor(path[i - 1], step, doors));
      if (straight && (blocked || path.slice(1).reduce((length, step, i) =>
        length + (step.teleport ? 0 : distance(path[i], step)), 0) >= distance(walkStart, walkEnd))) {
        return withEndpoints([walkStart, walkEnd]);
      }
      if (!blocked) return withEndpoints(path);
      return;
    }
    open.delete(current);
    const node = nodes[current]!;
    for (const edge of node.portal) {
      const targetNode = nodes[edge.to];
      if (!targetNode) continue;
      const entry = project(edge.entry, attack), exit = project(edge.exit, attack);
      if (crossesDoor(project(node.center, attack), entry, doors) || crossesDoor(exit, project(targetNode.center, attack), doors) ||
        (!edge.teleport && edge.entry !== edge.exit && crossesDoor(entry, exit, doors))) continue;
      const traversalDistance = edge.teleport ? 0 : distance(edge.entry, edge.exit);
      const steps = found.get(current)!.steps + distance(node.center, edge.entry) +
        traversalDistance + distance(edge.exit, targetNode.center);
      if (steps >= (found.get(edge.to)?.steps ?? Infinity)) continue;
      found.set(edge.to, { steps, via: edge, from: current });
      open.add(edge.to);
    }
  }
  if (straight) return withEndpoints([walkStart, walkEnd]);
}

export function routeOffsets(route: readonly RoutePoint[]) {
  let total = 0;
  const lengths = route.map((step, index) => {
    if (index && !step.teleport) total += distance(route[index - 1], step);
    return total;
  });
  return total ? lengths.map(length => length / total) : undefined;
}
