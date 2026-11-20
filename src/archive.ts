import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { newId, newPage, type AbilityMarker, type AgentMarker, type Document, type LineupLink, type Page, type Strategy } from './strategy.ts';

const maxFileBytes = 64 * 1024 * 1024;
const maxExpandedBytes = 128 * 1024 * 1024;
const rootFile = /^[^/\\:\u0000-\u001f]+$/;
export const imageExtensions = /\.(?:png|jpe?g|gif|webp|bmp)$/i;
const safeImageFile = (name: string) => rootFile.test(name) && imageExtensions.test(name);

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return asArray(JSON.parse(value));
  return [];
}

function legacyLineups(raw: Record<string, unknown>): Pick<Page, 'lineUpOrigins' | 'lineUpLandings' | 'lineUpLinks'> {
  type LegacyLineup = Partial<LineupLink> & { id: string; agent: AgentMarker; ability: AbilityMarker };
  type LegacyGroup = { id: string; agent: AgentMarker; items: LegacyLineup[] };
  const origins: Page['lineUpOrigins'] = [];
  const landings: Page['lineUpLandings'] = [];
  const links: Page['lineUpLinks'] = [];
  const groups = raw.lineUpGroups != null
    ? asArray(raw.lineUpGroups) as LegacyGroup[]
    : (asArray(raw.lineUpData) as LegacyLineup[]).map(row => ({ id: row.id, agent: row.agent, items: [row] }));
  for (const group of groups) {
    if (!group?.agent || !group.items?.length) continue;
    origins.push({ id: group.id, agent: group.agent });
    for (const item of group.items) {
      if (!item?.ability) continue;
      landings.push({ id: item.id, ability: item.ability });
      links.push({ id: item.id, originId: group.id, landingId: item.id, name: item.name ?? '',
        notes: item.notes ?? '', youtubeLink: item.youtubeLink ?? '', images: item.images ?? [] });
    }
  }
  return { lineUpOrigins: origins, lineUpLandings: landings, lineUpLinks: links };
}

function parsePage(value: unknown, index: number): Page {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('战术页面格式无效');
  const page = value as Partial<Page>;
  const seed = newPage(index, page.isAttack === 'false' || (page.isAttack as unknown) === false ? 'false' : 'true');
  const data = { ...seed, ...page, isAttack: seed.isAttack, sortIndex: String(index) };
  data.id = typeof page.id === 'string' ? page.id : seed.id;
  data.name = typeof page.name === 'string' ? page.name : seed.name;
  data.settings = page.settings && typeof page.settings === 'object' ? page.settings : seed.settings;
  for (const key of [
    'agentData', 'abilityData', 'drawingData', 'textData', 'imageData', 'utilityData',
    'lineUpOrigins', 'lineUpLandings', 'lineUpLinks',
  ] as const) {
    // Preserve individual record fields the original editor uses.
    Object.assign(data, { [key]: asArray(page[key]).filter(item => item && typeof item === 'object') });
  }
  if (!('lineUpOrigins' in page || 'lineUpLandings' in page || 'lineUpLinks' in page)) {
    Object.assign(data, legacyLineups(value as Record<string, unknown>));
  }
  for (const collection of ['agentData', 'abilityData', 'textData', 'imageData', 'utilityData'] as const) {
    for (const marker of data[collection]) {
      if (typeof marker.id !== 'string' || !marker.position ||
          !Number.isFinite(marker.position.dx) || !Number.isFinite(marker.position.dy)) {
        throw new Error(`第 ${index + 1} 页的标记坐标无效`);
      }
    }
  }
  if (data.abilityData.some(marker => !marker.data || typeof marker.data.type !== 'string') ||
      data.agentData.some(marker => typeof marker.type !== 'string') ||
      data.utilityData.some(marker => typeof marker.type !== 'string') ||
      data.textData.some(marker => typeof marker.text !== 'string')) {
    throw new Error(`第 ${index + 1} 页的标记数据不完整`);
  }
  return data;
}

export function readIca(bytes: Uint8Array): { document: Document; media: Strategy['media'] } {
  if (bytes.byteLength > maxFileBytes) throw new Error('.ica 文件须在 64 MB 以内');
  let data: Uint8Array;
  let media: Strategy['media'] = {};
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let size = 0;
    const files = unzipSync(bytes, {
      filter: entry => {
        if (!rootFile.test(entry.name) || !(/\.json$/i.test(entry.name) || safeImageFile(entry.name))) return false;
        size += entry.originalSize;
        if (size > maxExpandedBytes) throw new Error('.ica 解压大小超过 128 MB');
        return true;
      },
    });
    const jsonEntries = Object.entries(files).filter(([name]) => /\.json$/i.test(name));
    if (jsonEntries.length !== 1) throw new Error('请选择包含一场战术的 .ica 文件');
    data = jsonEntries[0][1];
    media = Object.fromEntries(Object.entries(files).filter(([name]) => safeImageFile(name)));
  } else {
    data = bytes;
  }

  const value: unknown = JSON.parse(strFromU8(data));
  if (!value || typeof value !== 'object' || !('mapData' in value) || typeof value.mapData !== 'string' || !value.mapData) {
    throw new Error('战术文件缺少地图信息');
  }
  const raw = value as Document;
  const legacy = raw.pages === undefined ? [{
    ...raw, name: '第 1 页', settings: raw.settingsData,
  }] : asArray(raw.pages);
  const pages = legacy.map(parsePage);
  return { document: { ...raw, versionNumber: String(raw.versionNumber ?? '35'), pages: pages.length ? pages : [newPage(0)] }, media };
}

export function importIca(bytes: Uint8Array, fileName: string): Strategy {
  return { id: newId(), name: fileName.replace(/\.ica$/i, ''), updated: Date.now(), ...readIca(bytes) };
}

export function writeIca(strategy: Strategy): Uint8Array {
  const document: Document = {
    ...strategy.document,
    pages: strategy.document.pages.map((page, index) => ({ ...page, sortIndex: String(index) })),
  };
  const files = Object.fromEntries(Object.entries(strategy.media).filter(([name]) => safeImageFile(name)));
  files['strategy.json'] = strToU8(JSON.stringify(document));
  const expandedBytes = Object.values(files).reduce((sum, entry) => sum + entry.length, 0);
  if (expandedBytes > maxExpandedBytes) throw new Error('战术和图片共超过 128 MB');
  const bytes = zipSync(files, { level: 3 });
  if (bytes.byteLength > maxFileBytes) throw new Error('.ica 文件须在 64 MB 以内');
  return bytes;
}

export function downloadIca(strategy: Strategy) {
  saveDownload(writeIca(strategy), `${strategy.name.replace(/[<>:"/\\|?*]/g, '_').trim() || '战术'}.ica`, 'application/zip');
}

export function saveDownload(bytes: Uint8Array, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
