import { cssColor, gameAsset } from './catalog.ts';
import type { MapLayers } from './BoardArt.tsx';

export type MapPalette = { base: string; detail: string; highlight: string };
const original = { base: '#271406', detail: '#b27c40', highlight: '#f08234' };
export const standardLayers: MapLayers = { callouts: true, barriers: true, orbs: false, grid: true, captions: true };
export const keyLabels = {
  q: '绘图', w: '橡皮擦', s: '选择', h: '平移', t: '新增文字', a: '上一页', d: '下一页',
  c: '接续当前页', f: '切换攻防', r: '已上图英雄', g: 'Lineup', e: '删除', x: '旋转',
};
export type ActionKey = keyof typeof keyLabels;
export type Preferences = {
  layers: MapLayers; autosave: boolean; agentSize: number; abilitySize: number; neutral: boolean; coneOpacity: number;
  palette?: MapPalette; profiles: { name: string; palette: MapPalette }[];
  colors: string[]; keys: Partial<Record<ActionKey, string>>;
};
const storageKey = 'team-playbook-preferences';

export function readPreferences(): Preferences {
  const defaults: Preferences = {
    layers: standardLayers, autosave: true, agentSize: 35, abilitySize: 25, neutral: false,
    coneOpacity: 15, colors: [], profiles: [], keys: {},
  };
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<Preferences> | null;
    return { ...defaults, ...stored, layers: { ...standardLayers, ...stored?.layers } };
  } catch { return defaults; }
}

export function writePreferences(preferences: Preferences) {
  try { localStorage.setItem(storageKey, JSON.stringify(preferences)); } catch { /* Saving preferences is optional. */ }
}

export function parsePalette(input: unknown): MapPalette | undefined {
  if (!input || typeof input !== 'object') return;
  const value = input as Record<string, unknown>;
  function read(key: keyof MapPalette) {
    const color = value[key] ?? value[`${key}ColorValue`];
    if (typeof color === 'number') return cssColor(color);
    if (typeof color !== 'string') return;
    const hash = color.startsWith('#') ? color : '#' + color;
    if (/^#[0-9a-f]{6}$/i.test(hash)) return hash;
    if (/^#[0-9a-f]{8}$/i.test(hash)) return '#' + hash.slice(-6);
  }
  const base = read('base'), detail = read('detail'), highlight = read('highlight');
  return base && detail && highlight ? { base, detail, highlight } : undefined;
}

export const defaultMapPalette = original;
const svgSources = new Map<string, Promise<string>>();

export async function themedMap(filename: string, palette: MapPalette) {
  const url = gameAsset(filename);
  let source = svgSources.get(url);
  if (!source) {
    source = fetch(url).then(response => {
      if (!response.ok) throw new Error('无法加载地图主题');
      return response.text();
    }).catch(error => { svgSources.delete(url); throw error; });
    svgSources.set(url, source);
  }
  const keyByColor = new Map(Object.entries(original).map(([key, color]) => [color, key as keyof MapPalette]));
  const recolored = (await source).replace(/#(?:271406|b27c40|f08234)\b/gi, old => palette[keyByColor.get(old.toLowerCase())!]);
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(recolored);
}
