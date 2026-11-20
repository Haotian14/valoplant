import type { Point } from './catalog.ts';

type Base = { id: string; position: Point; isDeleted?: boolean; caption?: string };
export type AgentMarker = Base & {
  kind?: string; type: string; isAlly?: boolean; state?: string;
  rotation?: number; length?: number; presetType?: string; diameterMeters?: number; colorValue?: number; opacityPercent?: number;
};
export type AbilityMarker = Base & {
  data: { type: string; index: number }; isAlly?: boolean;
  rotation?: number; length?: number; wallPath?: Point[]; armLengthsMeters?: number[];
  visualState?: { isActive?: boolean; isIconHidden?: boolean };
};
export type TextMarker = Base & { text: string; size?: number; fontSize?: number; sizeVersion?: number; tagColorValue?: number };
export type ImageMarker = Base & { aspectRatio: number; scale: number; fileExtension?: string; sizeVersion?: number; assetId?: string; link?: string };
export type Utility = Base & {
  type: string; isAlly?: boolean; length: number; rotation: number; angle?: number;
  customDiameter?: number; customWidth?: number; customLength?: number;
  customColorValue?: number; customOpacityPercent?: number; isZone?: boolean; attachedAgentId?: string;
};
export type Drawing = {
  id: string; type?: string; color?: string; colorValue?: number; thickness?: number;
  isDotted?: boolean; hasArrow?: boolean; showTraversalTime?: boolean;
  traversalSpeedProfile?: string;
  listOfPoints?: Point[]; lineStart?: Point; lineEnd?: Point; start?: Point; end?: Point;
  boundingBox?: { min: Point; max: Point } | null;
};
export type LineupLink = {
  id: string; originId: string; landingId: string; name: string; notes: string;
  youtubeLink: string; images: { id: string; fileExtension: string }[];
};

export type Page = {
  id: string; name: string; sortIndex: string; isAutoNamed?: boolean; isAttack: 'true' | 'false';
  settings: { agentSize?: number; abilitySize?: number; [key: string]: unknown };
  agentData: AgentMarker[]; abilityData: AbilityMarker[]; drawingData: Drawing[];
  textData: TextMarker[]; imageData: ImageMarker[]; utilityData: Utility[];
  lineUpOrigins: { id: string; agent: AgentMarker }[];
  lineUpLandings: { id: string; ability: AbilityMarker }[];
  lineUpLinks: LineupLink[];
};

export type Document = { versionNumber: string; mapData: string; pages: Page[]; [key: string]: unknown };
export type Strategy = {
  id: string; name: string; updated: number; document: Document; media: Record<string, Uint8Array>;
  published?: { path: string; revision: string; importedAt: number };
};

export const drawingCollections = ['agentData', 'abilityData', 'drawingData', 'textData', 'imageData', 'utilityData'] as const;
export type Collection = typeof drawingCollections[number];
export type CanvasItem = Page[Collection][number];
export type CanvasSelection = { collection: Collection; id: string };
type ItemByCollection<T extends Collection> = Page[T][number];

export const newId = () => crypto.randomUUID();
export const currentIcaVersion = '112';

export function newPage(index: number, attack: Page['isAttack'] = 'true'): Page {
  return {
    id: newId(), name: `第 ${index + 1} 页`, sortIndex: String(index), isAutoNamed: true,
    isAttack: attack, settings: { agentSize: 35, abilitySize: 25 },
    agentData: [], abilityData: [], drawingData: [], textData: [], imageData: [], utilityData: [],
    lineUpOrigins: [], lineUpLandings: [], lineUpLinks: [],
  };
}

export function newStrategy(map: string, name: string): Strategy {
  return {
    id: newId(), name, updated: Date.now(), media: {},
    document: { versionNumber: currentIcaVersion, mapData: map, pages: [newPage(0)] },
  };
}

export function append<T extends Collection>(page: Page, collection: T, item: ItemByCollection<T>): Page {
  return { ...page, [collection]: [...page[collection], item] };
}

export function patchItem<T extends Collection>(
  page: Page, collection: T, id: string, update: Partial<ItemByCollection<T>>,
): Page {
  return { ...page, [collection]: page[collection].map(item => item.id === id ? { ...item, ...update } : item) };
}

export function removeItems(page: Page, selections: CanvasSelection[]): Page {
  let next = page;
  for (const collection of drawingCollections) {
    const ids = new Set(selections.filter(item => item.collection === collection).map(item => item.id));
    if (ids.size) next = { ...next, [collection]: next[collection].filter(item => !ids.has(item.id)) };
  }
  return next;
}

export function drawingPoints(drawing: Drawing): Point[] {
  if (drawing.listOfPoints?.length) return drawing.listOfPoints;
  if (drawing.lineStart && drawing.lineEnd) return [drawing.lineStart, drawing.lineEnd];
  return drawing.start && drawing.end ? [drawing.start, drawing.end] : [];
}

export function bounds(points: Point[]) {
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { dx, dy } of points) {
    minX = Math.min(minX, dx); minY = Math.min(minY, dy);
    maxX = Math.max(maxX, dx); maxY = Math.max(maxY, dy);
  }
  return { min: { dx: minX, dy: minY }, max: { dx: maxX, dy: maxY } };
}

export function moveItem(item: CanvasItem, delta: Point): CanvasItem {
  const move = (p: Point) => ({ dx: p.dx + delta.dx, dy: p.dy + delta.dy });
  if ('position' in item) return { ...item, position: move(item.position) };
  const boundingBox = bounds(drawingPoints(item).map(move));
  if (item.listOfPoints) return { ...item, listOfPoints: item.listOfPoints.map(move), boundingBox };
  if (item.lineStart && item.lineEnd) {
    return { ...item, lineStart: move(item.lineStart), lineEnd: move(item.lineEnd), boundingBox };
  }
  if (item.start && item.end) return { ...item, start: move(item.start), end: move(item.end), boundingBox };
  return item;
}

export function positionOf(item: CanvasItem): Point | undefined {
  return 'position' in item ? item.position : drawingPoints(item)[0];
}
