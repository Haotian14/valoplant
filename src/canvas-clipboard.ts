import { strFromU8, strToU8 } from 'fflate';
import { readIca, writeIca } from './archive.ts';
import { mapById, point } from './catalog.ts';
import { canonicalMarkers, flipPage, pageIsAttack } from './geometry.ts';
import { drawingCollections, moveItem, newId, newPage, type CanvasSelection, type Page, type Strategy } from './strategy.ts';

type ClipboardObjects = Pick<Strategy, 'document' | 'media'>;
const prefix = 'team-playbook:objects:1:';
let clipboard: ClipboardObjects | undefined;

export function copyCanvasObjects(strategy: Strategy, page: Page, selected: CanvasSelection[]): ClipboardObjects {
  const media: Strategy['media'] = {};
  const copy = newPage(0, page.isAttack);
  for (const collection of drawingCollections) {
    const ids = new Set(selected.filter(row => row.collection === collection).map(row => row.id));
    Object.assign(copy, { [collection]: page[collection].filter(row => ids.has(row.id)) });
  }
  for (const image of copy.imageData) {
    const key = (image.assetId ?? image.id) + (image.fileExtension ?? '');
    const data = strategy.media[key];
    if (data) media[key] = data;
  }
  clipboard = {
    document: { versionNumber: strategy.document.versionNumber, mapData: strategy.document.mapData, pages: [copy] },
    media,
  };
  return clipboard;
}

export function encodeCanvasClipboard(objects: ClipboardObjects): string {
  return prefix + btoa(strFromU8(writeIca({ ...objects, id: '', name: '', updated: 0 }), true));
}

export function readCanvasClipboard(text: string): ClipboardObjects | undefined {
  if (!text.startsWith(prefix)) return clipboard;
  if (text.length > 90_000_000) throw new Error('剪贴板中的战术对象过大');
  const objects = readIca(strToU8(atob(text.slice(prefix.length)), true));
  if (!mapById[objects.document.mapData] || objects.document.pages.length !== 1) throw new Error('剪贴板战术对象格式无效');
  return objects;
}

export function pasteCanvasObjects(objects: ClipboardObjects, strategy: Strategy, target: Page) {
  const source = objects.document.pages[0];
  const sourceVersion = Number(objects.document.versionNumber);
  const version = Number(strategy.document.versionNumber);
  const normalized = flipPage(source, 'true', mapById[objects.document.mapData], sourceVersion);
  const projected = flipPage(normalized, target.isAttack, mapById[strategy.document.mapData], version);
  const selection: CanvasSelection[] = [];
  const media = { ...strategy.media };
  const agentIds = new Map(source.agentData.map(agent => [agent.id, newId()]));
  const page = { ...target };
  for (const collection of drawingCollections) {
    const canonical = collection === 'drawingData' ? pageIsAttack(target) : canonicalMarkers(target, version);
    const offset = canonical ? point(22, 22) : point(-22, -22);
    const rows = projected[collection].map(item => {
      const id = collection === 'agentData' ? agentIds.get(item.id)! : newId();
      const next = { ...moveItem(item, offset), id };
      if ('aspectRatio' in next) {
        const ext = next.fileExtension ?? '';
        const original = (next.assetId ?? item.id) + ext;
        const data = objects.media[original];
        const key = media[original] === data ? next.assetId ?? item.id : id;
        if (data) media[key + ext] = data;
        next.assetId = key;
      }
      if ('attachedAgentId' in next && next.attachedAgentId) next.attachedAgentId = agentIds.get(next.attachedAgentId);
      selection.push({ collection, id });
      return next;
    });
    Object.assign(page, { [collection]: [...target[collection], ...rows] });
  }
  return { page, media, selection };
}
