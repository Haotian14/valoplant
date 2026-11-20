import { displayPageName as pageName, t } from './locale.ts';
import { lazy, Suspense, useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronDown, Circle, Copy, Crosshair, Eraser, Eye, Hand, ImagePlus, Save, Timer,
  Layers, MapPin, Minus, MousePointer2, Pencil, Play, Plus, Redo2, Search, Shield, Square, Swords,
  Trash2, Type, Undo2, X, Pause, ChevronLeft, ChevronRight, Route, Camera, Film, Settings,
} from 'lucide-react';
import Board, { drawingTools, type BoardViewport, type Brush, type Tool } from './Board.tsx';
import { steppedRotation } from './board-gestures.ts';
import { objectForPlacement, usePlacementDrag, type Placement } from './placement.ts';
import { type MapLayers } from './BoardArt.tsx';
import { abilityFor, add, agentById, agents, cssColor, gameAsset, mapById, point, project, subtract, virtualToWorld, type Point } from './catalog.ts';
import { abilityVision, anchorFor, canonicalMarkers, copyToPage, drawingColor, flipPage, metersToWorld, pageIsAttack, pinnedUprightPosition, usesInactiveTrace, worldMarker } from './geometry.ts';
import { weapons, weaponName } from './weapons.ts';
import { canRotate, markerAbility } from './object-handles.ts';
import { changedMapDoors, findMapDoor, toggleMapDoor } from './map-doors.ts';
import { loadSightWalls, sightDoorWalls, sightPolygon } from './map-vision.ts';
import { elevationsAt, loadHeightModel, resolvedElevation, wallsAtElevation, type ElevationChoice } from './height-vision.ts';
import { initialWallPath, savedWallPath } from './wall-path.ts';
import { downloadIca, imageExtensions } from './archive.ts';
import { append, appendLineup, drawingCollections, moveItem, newId, newPage, patchItem, reindexPages, removeItems, type CanvasItem,
  type AbilityMarker, type AgentMarker, type CanvasSelection, type Collection, type LineupLink, type Page, type Strategy,
} from './strategy.ts';
import { IconButton, Modal } from './ui.tsx';
import CanvasExportDialog from './CanvasExportDialog.tsx';
import { parsePalette, readPreferences, writePreferences } from './preferences.ts';
import { useMediaUrls } from './use-media-urls.ts';
import { copyCanvasObjects, encodeCanvasClipboard, pasteCanvasObjects, readCanvasClipboard } from './canvas-clipboard.ts';

type Update = (strategy: Strategy) => Strategy;
const EditorSettings = lazy(() => import('./EditorSettings.tsx'));
type History = { present: Strategy; past: Strategy[]; future: Strategy[] };
type HistoryAction = { type: 'edit'; update: Update } | { type: 'undo' } | { type: 'redo' };
function reducer(history: History, action: HistoryAction): History {
  const save = (strategy: Strategy) => ({ ...strategy, updated: Math.max(Date.now(), history.present.updated + 1) });
  if (action.type === 'edit') {
    const next = action.update(history.present);
    return next === history.present ? history :
      { present: save(next), past: [...history.past.slice(-69), history.present], future: [] };
  }
  if (action.type === 'undo' && history.past.length) {
    return { present: save(history.past.at(-1)!), past: history.past.slice(0, -1), future: [history.present, ...history.future] };
  }
  if (action.type === 'redo' && history.future.length) {
    return { present: save(history.future[0]), past: [...history.past, history.present], future: history.future.slice(1) };
  }
  return history;
}

const controls = [
  { tool: 'select', label: '选择', key: 'S', icon: MousePointer2 },
  { tool: 'hand', label: '平移', key: 'H', icon: Hand },
  { tool: 'pencil', label: '画笔', key: 'Q', icon: Pencil },
  { tool: 'line', label: '直线', key: '', icon: Minus },
  { tool: 'rectangle', label: '矩形', key: '', icon: Square },
  { tool: 'ellipse', label: '圆形', key: '', icon: Circle },
  { tool: 'eraser', label: '橡皮擦', key: 'W', icon: Eraser },
  { tool: 'text', label: '文本', key: 'T', icon: Type },
  { tool: 'lineup', label: 'Lineup', key: 'G', icon: Route },
] as const;
const brushColors = ['#eeeaf8', '#be99ff', '#57d0ac', '#f17587', '#ffc275', '#6fbcff'];
const layerLabels = { callouts: '点位名称', barriers: '开局屏障', orbs: '大招点', grid: '网格', captions: '对象标注' };
const utilityList = [
  ['spike', '爆能器'], ['viewCone90', '60° 视野'], ['viewCone180', '103° 视野'], ['viewCone40', '20° 视野'], ['viewCone360', '全圆视野'],
  ['customCircle', '圆形范围'], ['customRectangle', '矩形范围'], ['customZone', '区域'], ['controller', '控场'], ['duelist', '决斗'],
  ['initiator', '先锋'], ['sentinel', '哨卫'],
];
const roleLabels: Record<string, string> = { duelist: '决斗', initiator: '先锋', controller: '控场', sentinel: '哨卫' };
const collectionLabels: Record<Collection, string> = {
  agentData: '英雄', abilityData: '技能', drawingData: '绘图', textData: '文本', imageData: '图片', utilityData: '道具',
};
const clipboardImages = { 'image/png': '.png', 'image/jpeg': '.jpeg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/bmp': '.bmp' };
const keyOf = (item: CanvasSelection) => `${item.collection}:${item.id}`;
const textInput = (target: EventTarget | null) =>
  target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable],dialog');

function webLink(value: string | undefined) {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch { return undefined; }
}

function updatePage(strategy: Strategy, pageId: string, update: (page: Page) => Page): Strategy {
  return { ...strategy, document: { ...strategy.document, pages: strategy.document.pages.map(page =>
    page.id === pageId ? update(page) : page) } };
}

function clipboardImage(data: DataTransfer | null) {
  const file = Array.from(data?.files ?? []).find(file => file.type.startsWith('image/'));
  if (!file || imageExtensions.test(file.name)) return file;
  const extension = clipboardImages[file.type as keyof typeof clipboardImages];
  return extension ? new File([file], 'clipboard' + extension, { type: file.type }) : undefined;
}

async function fileToImage(file: File) {
  const extension = file.name.match(imageExtensions)?.[0].toLowerCase();
  if (!extension) throw new Error('请选择 PNG、JPEG、GIF、WebP 或 BMP 图片');
  if (file.size > 16 * 1024 * 1024) throw new Error('单张图片须在 16 MB 以内');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const id = newId();
    return { id, extension, bytes, fileName: id + extension, aspect: image.naturalWidth / image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function Editor({ initial, save, exit, notify, saving, onSwitch }: {
  initial: Strategy; save: (strategy: Strategy) => void; exit: () => void; notify: (message: string) => void;
  saving: 'saved' | 'saving' | 'failed'; onSwitch?: () => void;
}) {
  const [history, dispatch] = useReducer(reducer, { present: initial, past: [], future: [] });
  const strategy = history.present;
  const pages = strategy.document.pages;
  const [pageNumber, setPageNumber] = useState(0);
  const [activePageId, setActivePageId] = useState(pages[0].id);
  const activeIndex = pages.findIndex(row => row.id === activePageId);
  const pageIndex = activeIndex < 0 ? Math.min(pageNumber, pages.length - 1) : activeIndex;
  const page = pages[pageIndex];
  const map = mapById[strategy.document.mapData];
  const version = Number(strategy.document.versionNumber);
  const [tool, setTool] = useState<Tool>('select');
  const [toolOptions, setToolOptions] = useState<'vision' | 'shapes' | 'roles'>();
  const [pagesOpen, setPagesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState(readPreferences);
  const viewport = useRef<BoardViewport>(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [team, setTeam] = useState(true);
  const [onMapOnly, setOnMapOnly] = useState(false);
  const [exportMode, setExportMode] = useState<'image' | 'video'>();
  const [captionRead, setCaptionRead] = useState<string>();
  const [sightlineReport, setSightlineReport] = useState<string>();
  const [elevationMenu, setElevationMenu] = useState<{
    item: CanvasSelection; pageId: string; choices: ElevationChoice[]; automatic?: number; manual?: number;
  }>();
  const hovered = useRef<{ item: CanvasSelection; screen: Point } | undefined>(undefined);
  const lastDrawing = useRef<Tool>('pencil');
  const [agentId, setAgentId] = useState<string>();
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [brush, setBrush] = useState<Brush>({ color: brushColors[0], width: 5, dotted: false, arrow: false, timing: false, speed: 'running' });
  const [textColor, setTextColor] = useState(brushColors[0]);
  const layers = preferences.layers;
  const theme = parsePalette(strategy.document.themePalette);
  const [layersOpen, setLayersOpen] = useState(false);
  const [selection, setSelection] = useState<CanvasSelection[]>([]);
  const [context, setContext] = useState<{ item: CanvasSelection; screen: Point }>();
  const [clearMenu, setClearMenu] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string>();
  const [lineupPlacement, setLineupPlacement] = useState<{
    origin?: AgentMarker; landing?: AbilityMarker; editing?: LineupLink; moved?: boolean;
    pinned?: { end: 'origin' | 'landing'; id: string };
  }>();
  const [lineupForm, setLineupForm] = useState<{ session: string; link: LineupLink; media: Strategy['media']; pending: number }>();
  const [endpointMenu, setEndpointMenu] = useState<{ link: LineupLink; end: 'origin' | 'landing' }>();
  const [pagesSize, setPagesSize] = useState<{ width: number; height: number }>();
  const lineupDialog = lineupForm?.link;
  const [inspect, setInspect] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [transitionFrom, setTransitionFrom] = useState<Page>();
  const [pageRename, setPageRename] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [favorite, setFavorite] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('team-playbook-favorites') ?? '[]'); } catch { return []; }
  });
  const [onlyFavorite, setOnlyFavorite] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const lineupFiles = useRef<HTMLInputElement>(null);
  const allMedia = useMemo(() => ({ ...strategy.media, ...lineupForm?.media }), [strategy.media, lineupForm?.media]);
  const media = useMediaUrls(allMedia);
  const lastSent = useRef(initial);
  const activeAgent = agentId ? agentById[agentId] : undefined;
  const selected = selection.length === 1 ? selection[0] : undefined;
  const selectedItem = selected && page[selected.collection].find(item => item.id === selected.id);

  useEffect(() => {
    if (preferences.autosave && lastSent.current !== strategy) {
      lastSent.current = strategy;
      save(strategy);
    }
  }, [strategy, save, preferences.autosave]);

  function saveCurrent() {
    lastSent.current = strategy;
    save(strategy);
  }

  function leaveEditor(action: () => void) {
    if (!preferences.autosave && lastSent.current !== strategy) {
      if (!window.confirm('当前战术有未保存的修改。保存后离开？')) return;
      saveCurrent();
    }
    action();
  }

  function commit(update: Update) { dispatch({ type: 'edit', update }); }
  const editPage = (update: (p: Page) => Page) => commit(previous => updatePage(previous, page.id, update));

  function activate(next: Tool) {
    if (drawingTools.some(tool => tool === next)) lastDrawing.current = next;
    setTool(next);
    if (next !== 'place') setPlacement(null);
    if (next !== 'lineup') setLineupPlacement(undefined);
    setToolOptions(undefined);
    if (next !== 'select') {
      setSelection([]);
      setPlaying(false);
    }
    setContext(undefined);
    setClearMenu(false);
    setInspect(false);
  }

  function changePage(index: number) {
    const target = Math.max(0, Math.min(pages.length - 1, index));
    if (pages[target].id !== page.id) setTransitionFrom(page);
    setPageNumber(target);
    setActivePageId(pages[target].id);
    setEditingTextId(undefined);
    setSelection([]);
    setContext(undefined);
    setClearMenu(false);
    setInspect(false);
    setLineupPlacement(undefined);
    setAnimate(true);
  }

  useEffect(() => {
    if (!animate) return;
    const timer = setTimeout(() => { setAnimate(false); setTransitionFrom(undefined); }, 440);
    return () => clearTimeout(timer);
  }, [animate, pageIndex]);

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (pageIndex + 1 < pages.length) changePage(pageIndex + 1);
      else setPlaying(false);
    }, 1400);
    return () => clearTimeout(timer);
  }, [playing, pageIndex, pages.length]);

  function addPage(mode: 'next' | 'copy' | 'blank') {
    const position = pageIndex + 1;
    const autoNamed = newPage(position, page.isAttack);
    const next = mode === 'blank' ? autoNamed : {
      ...structuredClone(page), id: autoNamed.id,
      name: mode === 'copy' ? `${pageName(page)} 副本` : autoNamed.name, isAutoNamed: mode === 'next',
    };
    commit(previous => {
      const nextPages = [...previous.document.pages];
      nextPages.splice(position, 0, next);
      return { ...previous, document: { ...previous.document, pages: reindexPages(nextPages) } };
    });
    setPageNumber(position);
    setActivePageId(next.id);
    setSelection([]);
    setLineupPlacement(undefined);
  }

  function movePage(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) return;
    const list = [...pages];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    commit(previous => ({ ...previous, document: { ...previous.document, pages: reindexPages(list) } }));
    setPageNumber(list.findIndex(item => item.id === page.id));
    setActivePageId(page.id);
  }

  function removePage() {
    if (pages.length <= 1 || !window.confirm(`删除「${pageName(page)}」？`)) return;
    commit(previous => ({ ...previous, document: {
      ...previous.document, pages: reindexPages(previous.document.pages.filter(item => item.id !== page.id)),
    } }));
    setPageNumber(Math.max(0, pageIndex - 1));
    setActivePageId(pages[pageIndex === 0 ? 1 : pageIndex - 1].id);
    setSelection([]);
    setInspect(false);
  }

  function selectPlacement(next: Placement) {
    setPlacement(next);
    setTool('place');
    setSelection([]);
    setContext(undefined);
    setPanelOpen(false);
  }

  function selectAgent(id: string) {
    setAgentId(current => current === id ? undefined : id);
  }

  function place(marker: Placement, world: Point) {
    const { item, collection } = objectForPlacement(marker, world, map, page, version, drawingColor(brush.color));
    if (tool === 'lineup') {
      if (lineupPlacement?.editing) return;
      if (marker.kind === 'agent') {
        if (lineupPlacement?.pinned?.end === 'origin') return;
        const origin = item as AgentMarker;
        if (lineupPlacement?.landing && lineupPlacement.landing.data.type !== origin.type) {
          notify('起点英雄和落点技能需要属于同一英雄');
          return;
        }
        setAgentId(origin.type);
        setLineupPlacement(current => ({ ...current, origin }));
      } else if (marker.kind === 'ability') {
        if (lineupPlacement?.pinned?.end === 'landing') return;
        const landing = item as AbilityMarker;
        if (lineupPlacement?.origin && lineupPlacement.origin.type !== landing.data.type) {
          notify('请选择起点英雄的技能');
          return;
        }
        setAgentId(landing.data.type);
        setLineupPlacement(current => ({ ...current, landing }));
      }
      return;
    }
    editPage(p => append(p, collection, item));
    if (marker.kind === 'text') {
      setEditingTextId(item.id);
      setSelection([{ collection, id: item.id }]);
    }
    if (tool === 'place') activate('select');
  }

  function placeAtCenter(marker: Placement) {
    const position = viewport.current?.center();
    if (position) place(marker, position);
  }

  const paletteDrag = usePlacementDrag((marker, screen) => {
    const position = viewport.current?.pointAt(screen);
    if (position) {
      place(marker, position);
      setPanelOpen(false);
    }
  }, () => {
    if (drawingTools.some(id => id === tool) || tool === 'eraser') activate('select');
  });

  function moveSelections(items: CanvasSelection[], delta: Point, copy: boolean) {
    const keys = new Set(items.map(keyOf));
    const duplicates = new Map(items.map(item => [keyOf(item), copy ? newId() : item.id]));
    editPage(p => {
      let changed = p;
      for (const collection of drawingCollections) {
        const canonical = collection === 'drawingData' ? pageIsAttack(p) : canonicalMarkers(p, version);
        const offset = canonical ? delta : point(-delta.dx, -delta.dy);
        const rows = p[collection];
        if (copy) {
          const added = rows.flatMap(item => {
            const id = duplicates.get(keyOf({ collection, id: item.id }));
            if (!id) return [];
            const moved = { ...moveItem(item, offset), id };
            if ('aspectRatio' in item) Object.assign(moved, { assetId: item.assetId ?? item.id });
            if ('attachedAgentId' in item && item.attachedAgentId) {
              Object.assign(moved, { attachedAgentId: duplicates.get(keyOf({ collection: 'agentData', id: item.attachedAgentId })) });
            }
            return [moved];
          });
          changed = { ...changed, [collection]: [...rows, ...added] };
        } else {
          changed = { ...changed, [collection]: rows.map(item => keys.has(keyOf({ collection, id: item.id })) ? moveItem(item, offset) : item) };
        }
      }
      return changed;
    });
    if (copy) setSelection(items.map(item => ({ ...item, id: duplicates.get(keyOf(item))! })));
  }

  function copyToNeighbor(direction: number, ...items: Array<CanvasSelection | string>) {
    const neighbor = pages[pageIndex + direction];
    if (!neighbor) return;
    const copy = (target: Page) => items.reduce((current, item) => copyToPage(page, current, item, map, version), target);
    if (copy(neighbor) === neighbor) notify('该页面已包含要复制的内容');
    else {
      commit(previous => updatePage(previous, neighbor.id, copy));
      notify(`已复制到「${pageName(neighbor)}」`);
    }
    setContext(undefined);
  }

  async function inspectSightline(item: CanvasItem, collection: Collection, cone: { angle: number; radius: number }) {
    setContext(undefined);
    const attack = pageIsAttack(page);
    const origin = worldMarker(item, collection, map, page, version);
    const rotation = ('rotation' in item ? item.rotation ?? 0 : 0) + (canonicalMarkers(page, version) ? 0 : Math.PI);
    const doors = new Set(changedMapDoors(page, map));
    try {
      const model = await loadHeightModel(map, attack).catch(() => undefined);
      const elevation = model && resolvedElevation(elevationsAt(model, origin), 'visionElevation' in item ? item.visionElevation : undefined);
      const walls = model && elevation != null ? wallsAtElevation(model, elevation) : await loadSightWalls(map, attack);
      const boundary = sightPolygon([...walls, ...sightDoorWalls(map, attack, doors)], origin, cone.radius, rotation, cone.angle);
      const distance = (value: number) => (value / metersToWorld(1, map)).toFixed(2) + ' m';
      const closest = boundary?.reduce((nearest, p) => {
        const length = Math.hypot(p.dx, p.dy);
        return length > 0 ? Math.min(nearest, length) : nearest;
      }, cone.radius);
      setSightlineReport([
        `${map.name} · ${attack ? '进攻' : '防守'} · ${pageName(page)}`,
        `对象 ${item.id}`,
        `地图坐标 (${origin.dx.toFixed(2)}, ${origin.dy.toFixed(2)})`,
        `朝向 ${(((rotation * 180 / Math.PI) % 360 + 360) % 360).toFixed(1)}° · 开角 ${cone.angle}° · 半径 ${distance(cone.radius)}`,
        elevation == null ? '视野模型使用平面墙体' : `眼高 ${(elevation / 100).toFixed(2)} m`,
        closest === undefined ? '范围内未检测到视线遮挡' : `最近遮挡距离 ${distance(closest)}`,
        `本页修改过状态的地图门 ${[...doors].join(', ') || '无'}`,
      ].join('\n'));
    } catch {
      notify('读取地图视野数据失败');
    }
  }

  async function openElevation(item: CanvasItem, selected: CanvasSelection) {
    setContext(undefined);
    try {
      const model = await loadHeightModel(map, pageIsAttack(page));
      const choices = elevationsAt(model, worldMarker(item, selected.collection, map, page, version));
      setElevationMenu({ ...choices, item: selected, pageId: page.id, manual: 'visionElevation' in item ? item.visionElevation : undefined });
    } catch {
      notify('读取地图高度数据失败');
    }
  }

  function erase(items: CanvasSelection[]) {
    editPage(p => removeItems(p, items));
    setSelection([]);
    setContext(undefined);
    setClearMenu(false);
    setInspect(false);
  }

  function clearPageObjects(collection?: Collection | 'lineup') {
    const collections = collection === 'lineup' ? [] : collection ? [collection] : drawingCollections;
    editPage(current => {
      const cleared = { ...current };
      for (const key of collections) cleared[key] = [];
      return !collection || collection === 'lineup' ? { ...cleared, lineUpOrigins: [], lineUpLandings: [], lineUpLinks: [] } : cleared;
    });
    setSelection([]);
    setClearMenu(false);
    setInspect(false);
  }

  function copySelection() {
    const objects = copyCanvasObjects(strategy, page, selection);
    if (!navigator.clipboard?.writeText) return;
    try {
      void navigator.clipboard.writeText(encodeCanvasClipboard(objects)).catch(() => {});
    } catch {
      notify('对象已复制到战术编辑器内的剪贴板');
    }
  }

  function pasteSelection(objects: NonNullable<ReturnType<typeof readCanvasClipboard>>) {
    const result = pasteCanvasObjects(objects, strategy, page);
    if (!result.selection.length) return;
    commit(previous => ({ ...updatePage(previous, page.id, () => result.page), media: result.media }));
    setSelection(result.selection);
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (textInput(event.target) || editingTextId || lineupDialog || pageRename) return;
      const rawKey = event.key.toLowerCase();
      const command = event.metaKey || event.ctrlKey;
      const rebound = !command && Object.entries(preferences.keys).find(([, current]) => current === rawKey)?.[0];
      const key = rebound || (!command && preferences.keys[rawKey as keyof typeof preferences.keys] ? '' : rawKey);
      if (command) {
        if (key === 'z') { event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' }); }
        if (key === 'y') { event.preventDefault(); dispatch({ type: 'redo' }); }
        if ((key === 'c' || key === 'x') && selection.length) {
          event.preventDefault(); copySelection();
          if (key === 'x') erase(selection);
        }
        if (key === 's') { event.preventDefault(); saveCurrent(); }
        if (key === 'a') {
          event.preventDefault();
          activate('select');
          setSelection(drawingCollections.flatMap(collection =>
            page[collection].filter(item => !('isDeleted' in item && item.isDeleted) && !findMapDoor(item, map))
              .map(item => ({ collection, id: item.id }))));
        }
        return;
      }
      const control = controls.find(row => row.key.toLowerCase() === key);
      if (key === 't') {
        activate('select');
        const position = viewport.current?.center();
        if (position) {
          const { item } = objectForPlacement({ kind: 'text', color: drawingColor(textColor) },
            position, map, page, version, drawingColor(brush.color));
          editPage(p => append(p, 'textData', item as Page['textData'][number]));
          setEditingTextId(item.id);
        }
      } else if (key === 'g') {
        if (tool === 'lineup') activate('select');
        else beginLineup();
      } else if (control) {
        const target = key === 'q' ? lastDrawing.current : control.tool;
        activate(tool === target ? 'select' : target);
      }
      if (key === 'escape') { paletteDrag.cancel(); activate('select'); setSelection([]); setAgentId(undefined); }
      if (key === 'r') { setOnMapOnly(value => !value); setRole(''); setOnlyFavorite(false); }
      if (key === 'c') addPage('next');
      if (key === 'f') setSide(pageIsAttack(page) ? 'false' : 'true', !event.shiftKey);
      if (key === 'e') {
        if (event.repeat || tool !== 'select') return;
        if (selection.length) erase(selection);
        else if (hovered.current) erase([hovered.current.item]);
        else setClearMenu(value => !value);
      }
      if (key === 'x') {
        const target = hovered.current?.item;
        const marker = target && page[target.collection].find(row => row.id === target.id);
        if (target && marker && canRotate(marker, map)) {
          const rotation = steppedRotation('rotation' in marker ? marker.rotation ?? 0 : 0, !event.shiftKey);
          editPage(p => patchItem(p, target.collection, target.id, { rotation }));
        }
      }
      if (key === 'delete' || key === 'backspace') {
        if (selection.length) { event.preventDefault(); erase(selection); }
      }
      if (['a', 'd', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault();
        changePage(pageIndex + (key === 'a' || key === 'arrowleft' ? -1 : 1));
      }
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  async function importImage(file: File, world = viewport.current?.center()) {
    if (!world) return;
    const at = project(world, canonicalMarkers(page, version));
    try {
      const image = await fileToImage(file);
      const width = 200;
      commit(previous => updatePage({ ...previous, media: { ...previous.media, [image.fileName]: image.bytes } }, page.id,
        p => append(p, 'imageData', {
          id: image.id, position: subtract(at, point(width / 2, width / image.aspect / 2)), aspectRatio: image.aspect, scale: width,
          fileExtension: image.extension, sizeVersion: 1, isDeleted: false,
        })));
      activate('select');
    } catch (error) { notify(error instanceof Error ? error.message : '无法打开图片'); }
  }

  function addImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void importImage(file);
  }

  useEffect(() => {
    function paste(event: ClipboardEvent) {
      if (textInput(event.target) || editingTextId || lineupDialog || pageRename) return;
      const file = clipboardImage(event.clipboardData);
      if (file) {
        event.preventDefault();
        void importImage(file);
      } else {
        try {
          const objects = readCanvasClipboard(event.clipboardData?.getData('text/plain') ?? '');
          if (!objects) return;
          event.preventDefault();
          pasteSelection(objects);
        } catch (error) {
          notify(error instanceof Error ? error.message : '无法读取剪贴板战术对象');
        }
      }
    }
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  });

  function moveLineup(end: 'origin' | 'landing', delta: Point) {
    const offset = canonicalMarkers(page, version) ? delta : point(-delta.dx, -delta.dy);
    setLineupPlacement(current => {
      const item = current?.[end];
      if (!item) return current;
      return { ...current, [end]: moveItem(item, offset), moved: true };
    });
  }

  function beginLineup() {
    activate('lineup');
    setLineupPlacement({});
  }

  function startLineupFromMarker(item: AgentMarker | AbilityMarker) {
    activate('lineup');
    setPanelOpen(true);
    if ('data' in item) {
      setAgentId(item.data.type); setLineupPlacement({ landing: { ...item, id: newId() } });
    } else {
      setAgentId(item.type); setLineupPlacement({ origin: { ...item, id: newId() } });
    }
  }

  function nextLineup() {
    if (!lineupPlacement?.origin || !lineupPlacement.landing) return;
    const pinned = lineupPlacement.pinned;
    openLineup({ id: newId(), originId: pinned?.end === 'origin' ? pinned.id : newId(),
      landingId: pinned?.end === 'landing' ? pinned.id : newId(), name: '', notes: '', youtubeLink: '', images: [] });
  }

  function openLineup(link: LineupLink) {
    setPlaying(false);
    setLineupForm({ session: newId(), link, media: {}, pending: 0 });
  }

  function openSavedLineup(link: LineupLink) {
    setEndpointMenu(undefined);
    setLineupPlacement(undefined);
    openLineup(link);
  }

  function reuseLineupEnd(link: LineupLink, end: 'origin' | 'landing') {
    setEndpointMenu(undefined);
    setPanelOpen(true);
    if (end === 'origin') {
      const origin = page.lineUpOrigins.find(row => row.id === link.originId);
      if (!origin) return;
      setAgentId(origin.agent.type);
      setLineupPlacement({ origin: origin.agent, pinned: { end, id: origin.id } });
    } else {
      const landing = page.lineUpLandings.find(row => row.id === link.landingId);
      if (!landing) return;
      setAgentId(landing.ability.data.type);
      setLineupPlacement({ landing: landing.ability, pinned: { end, id: landing.id } });
    }
    closeLineup();
    activate('lineup');
  }

  function editLineupPositions(link: LineupLink) {
    const origin = page.lineUpOrigins.find(row => row.id === link.originId)?.agent;
    const landing = page.lineUpLandings.find(row => row.id === link.landingId)?.ability;
    if (!origin || !landing) return;
    closeLineup();
    activate('lineup');
    setLineupPlacement({ origin, landing, editing: link });
  }

  function saveLineupPositions() {
    const draft = lineupPlacement;
    if (!draft?.editing || !draft.origin || !draft.landing || !draft.moved) return;
    const { editing, origin, landing } = draft;
    editPage(p => ({
      ...p,
      lineUpOrigins: p.lineUpOrigins.map(row => row.id === editing.originId ? { ...row, agent: origin } : row),
      lineUpLandings: p.lineUpLandings.map(row => row.id === editing.landingId ? { ...row, ability: landing } : row),
    }));
    activate('select');
  }

  function saveLineup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lineupForm || lineupForm.pending) return;
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name')).trim();
    const link = { ...lineupForm.link, name, notes: String(data.get('notes')),
      youtubeLink: String(data.get('video')).trim() };
    const draft = lineupPlacement;
    commit(previous => updatePage({ ...previous, media: { ...previous.media, ...lineupForm.media } }, page.id, p => {
      if (draft?.origin && draft.landing) {
        return appendLineup(p, link, draft.origin, draft.landing);
      }
      return { ...p, lineUpLinks: p.lineUpLinks.map(row => row.id === link.id ? link : row) };
    }));
    closeLineup();
    if (lineupPlacement) activate('select');
  }

  function closeLineup() { setLineupForm(undefined); }

  async function addLineupPictures(files: File[]) {
    if (!lineupForm || !files.length) return;
    const { session } = lineupForm;
    setLineupForm(current => current?.session === session ? { ...current, pending: current.pending + 1 } : current);
    try {
      const pictures = await Promise.all(files.map(fileToImage));
      setLineupForm(current => current?.session === session ? {
        ...current, media: { ...current.media, ...Object.fromEntries(pictures.map(img => [img.fileName, img.bytes])) },
        link: { ...current.link, images: [...current.link.images, ...pictures.map(img => ({ id: img.id, fileExtension: img.extension }))] },
      } : current);
    } catch (error) { notify(error instanceof Error ? error.message : '无法添加参考图'); }
    finally {
      setLineupForm(current => current?.session === session ? { ...current, pending: current.pending - 1 } : current);
    }
  }

  function removeLineupPicture(image: LineupLink['images'][number]) {
    setLineupForm(current => {
      if (!current) return current;
      const media = { ...current.media };
      delete media[image.id + image.fileExtension];
      return { ...current, media, link: { ...current.link, images: current.link.images.filter(row => row.id !== image.id) } };
    });
  }

  function editItem(item: CanvasSelection) {
    if (item.collection === 'textData') {
      setSelection([item]);
      setEditingTextId(item.id);
    } else {
      setSelection([item]);
      setInspect(true);
    }
    setContext(undefined);
  }

  function setItem(update: Partial<CanvasItem>) {
    if (!selected || !selectedItem) return;
    if (selected.collection === 'utilityData' && 'position' in selectedItem) {
      const center = add(selectedItem.position, anchorFor(selected.collection, selectedItem, map, version));
      const resized = { ...selectedItem, ...update };
      update = { ...update, position: subtract(center, anchorFor(selected.collection, resized, map, version)) };
    }
    if ('aspectRatio' in selectedItem && 'scale' in update) {
      update = { ...update, position: pinnedUprightPosition(selectedItem, { ...selectedItem, ...update }, page, version) };
    }
    editPage(p => patchItem(p, selected.collection, selected.id, update));
  }

  function setSide(side: Page['isAttack'], all = false) {
    if (!all && side === page.isAttack) return;
    commit(previous => ({ ...previous, document: { ...previous.document, pages: previous.document.pages.map(row =>
      all || row.id === page.id ? flipPage(row, side, map, version) : row,
    ) } }));
    setLineupPlacement(undefined);
  }

  function onPageDrop(event: DragEvent<HTMLButtonElement>, targetIndex: number) {
    const source = event.dataTransfer.getData('application/x-team-playbook-page');
    if (source) { event.preventDefault(); movePage(Number(source), targetIndex); }
  }

  function exportStrategy() {
    try { downloadIca(strategy); notify('已导出 .ica 战术文件'); }
    catch (error) { notify(error instanceof Error ? error.message : '战术导出失败'); }
  }

  function toggleFavorite(id: string) {
    const next = favorite.includes(id) ? favorite.filter(item => item !== id) : [...favorite, id];
    setFavorite(next);
    try { localStorage.setItem('team-playbook-favorites', JSON.stringify(next)); } catch { /* Favorites also work for this session. */ }
  }

  const pageAgents = useMemo(() => new Set(page.agentData.filter(item => !item.isDeleted).map(item => item.type)), [page.agentData]);
  const filteredAgents = useMemo(() => agents.filter(agent =>
    (!role || agent.role === role) && (!onlyFavorite || favorite.includes(agent.id)) &&
    (!onMapOnly || pageAgents.has(agent.id) || tool === 'lineup') &&
    agent.name.toLowerCase().includes(search.toLowerCase()),
  ).sort((a, b) => a.name.localeCompare(b.name)), [role, onlyFavorite, favorite, search, onMapOnly, pageAgents, tool]);

  const placementLabel = placement?.kind === 'agent' ? agentById[placement.type]?.name
    : placement?.kind === 'ability' ? abilityFor(placement.type, placement.index)?.name
      : placement?.kind === 'utility' ? utilityList.find(([id]) => id === placement.type)?.[1] : '文本';
  const isDrawing = drawingTools.some(id => id === tool);
  const status = tool === 'lineup'
    ? lineupPlacement?.editing ? '拖动投掷起点或技能落点'
      : !lineupPlacement?.origin ? '拖放英雄标记投掷起点'
      : !lineupPlacement.landing ? '拖放该英雄的技能标记落点'
      : lineupPlacement.pinned ? '拖动新增标记可微调位置' : '拖动两端可微调位置'
    : tool === 'place' ? `点击地图放置 ${placementLabel ?? ''}` : '';
  const lineupAgent = lineupPlacement?.origin?.type ?? lineupPlacement?.landing?.data.type;
  const videoUrl = webLink(lineupDialog?.youtubeLink);
  const contextItem = context && page[context.item.collection].find(item => item.id === context.item.id);
  const contextAbilityVision = contextItem && 'data' in contextItem ? abilityVision(contextItem, map) : undefined;
  const contextVision = contextAbilityVision
    ? { angle: contextAbilityVision.angle, radius: contextAbilityVision.length * contextAbilityVision.displayScale }
    : contextItem && 'kind' in contextItem && contextItem.kind === 'viewCone'
      ? { angle: Number(contextItem.presetType?.replace('viewCone', '')) || 90, radius: (contextItem.length ?? 85) * virtualToWorld }
      : contextItem && 'type' in contextItem && 'length' in contextItem && context.item.collection === 'utilityData' && contextItem.type.startsWith('viewCone')
        ? { angle: 'angle' in contextItem ? contextItem.angle ?? 90 : 90, radius: (contextItem.length || 100) * virtualToWorld } : undefined;
  const endpointLinks = endpointMenu && page.lineUpLinks.filter(link => endpointMenu.end === 'origin'
    ? link.originId === endpointMenu.link.originId : link.landingId === endpointMenu.link.landingId);
  const imageLink = contextItem && 'aspectRatio' in contextItem ? webLink(contextItem.link) : undefined;
  const abilityShape = contextItem && markerAbility(contextItem, map);
  const hasWall = abilityShape?.kind === 'wall' && contextItem && 'data' in contextItem
    ? savedWallPath(contextItem, map).length > 0 : undefined;
  const rangeToggles: { key: keyof NonNullable<AbilityMarker['visualState']>; label: string }[] = [];
  if (abilityShape) {
    if (['circle', 'sector'].includes(abilityShape.kind)) rangeToggles.push({ key: 'showRangeOutline', label: '范围轮廓' });
    if (['circle', 'sector', 'rect', 'mesh', 'image'].includes(abilityShape.kind)) rangeToggles.push({
      key: 'showRangeFill', label: contextItem && 'data' in contextItem && usesInactiveTrace(contextItem) ? '技能激活' : '技能范围',
    });
    if (contextItem && 'data' in contextItem && abilityVision(contextItem, map)) rangeToggles.push({ key: 'showVisionCone', label: '技能视野' });
    if (abilityShape.inner) {
      rangeToggles.push({ key: 'showInnerOutline', label: '内圈轮廓' }, { key: 'showInnerFill', label: '内圈填充' });
    }
  }

  return <main className="editor">
    <header className="editor-header">
      <div className="editor-title">
        <IconButton label={t('返回战术库')} onClick={() => leaveEditor(exit)}><ArrowLeft size={20} /></IconButton>
        {onSwitch && <IconButton label={t('打开另一份战术')} onClick={() => leaveEditor(onSwitch)}><BookOpen size={17} /></IconButton>}
        <div className="editor-title-text">
          <input aria-label={t('战术名称')} key={strategy.name} defaultValue={strategy.name}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            onBlur={event => {
              const name = event.currentTarget.value.trim();
              if (!name) { event.currentTarget.value = strategy.name; return; }
              if (name !== strategy.name) commit(previous => ({ ...previous, name }));
            }} />
          <span className={`save-status ${saving === 'failed' ? 'error' : ''}`}>
            <i />{!preferences.autosave && lastSent.current !== strategy ? '尚未保存' :
              saving === 'saved' ? '已保存到浏览器' : saving === 'saving' ? '正在保存' : t('保存失败')}
          </span>
        </div>
      </div>

    </header>

    <div className="editor-body">
      <section className="canvas-area">
        <Board map={map} page={page} version={version} tool={tool} brush={brush} placement={placement}
          viewport={viewport} externalDrag={paletteDrag.preview} editingTextId={editingTextId}
          animate={animate} layers={layers} selection={selection} media={media}
          theme={theme} coneOpacity={preferences.coneOpacity / 100} transitionFrom={transitionFrom}
          lineupOrigin={lineupPlacement?.origin} lineupLanding={lineupPlacement?.landing}
          editingLineupId={lineupPlacement?.editing?.id}
          pinnedLineupEnd={lineupPlacement?.pinned?.end}
          onDismissAbilities={() => setAgentId(undefined)}
          onTextChange={(id, text) => {
            setEditingTextId(undefined);
            const item = page.textData.find(marker => marker.id === id);
            if (item && text !== undefined && item.text !== text) {
              editPage(p => patchItem(p, 'textData', id, {
                text, position: pinnedUprightPosition(item, { ...item, text }, p, version),
              }));
            }
          }}
          hideAgents={false} onReadCaption={setCaptionRead} onHover={(item, screen) => { hovered.current = item && { item, screen }; }}
          onSelect={items => { setSelection(items); setContext(undefined); setClearMenu(false); if (items.length !== 1) setInspect(false); }}
          onContext={(item, screen) => { setSelection([item]); setClearMenu(false); setContext({ item, screen }); }}
          onEdit={editItem} onDraw={drawing => editPage(p => append(p, 'drawingData', drawing))}
          onMove={moveSelections} onTransform={(target, patch) => editPage(p => patchItem(p, target.collection, target.id, patch))}
          onDoorToggle={door => editPage(p => toggleMapDoor(p, door, map, version))}
          onErase={erase} onPlace={place}
          onImageDrop={(file, position) => { void importImage(file, position); }}
          onLineupMove={moveLineup} onLineupOpen={openSavedLineup} onLineupEndpoint={(link, end) => {
            setPlaying(false); setEndpointMenu({ link, end });
          }} />
        <div className="map-chrome">
        <div className="map-controls">
          <span className="map-name"><MapPin size={15} />{map.name}</span>
          <button className={`button side-toggle ${pageIsAttack(page) ? 'attack' : 'defense'}`} type="button"
            aria-label={t('切换整套战术的攻防朝向，按住 Shift 仅切换本页')}
            title={t('切换攻防 (F) · 按住 Shift 仅切换本页')}
            onClick={event => setSide(pageIsAttack(page) ? 'false' : 'true', !event.shiftKey)}>
            {pageIsAttack(page) ? <Swords size={16} /> : <Shield size={16} />}
            {pageIsAttack(page) ? t('进攻') : t('防守')}
            {pages.some(row => row.isAttack !== page.isAttack) && <i className="mixed-side" />}
          </button>
          <div className="layer-control">
            <IconButton label={t('地图图层')} className={layersOpen ? 'active' : ''} onClick={() => setLayersOpen(value => !value)}><Layers size={17} /></IconButton>
            {layersOpen && <div className="popover layer-menu">
              {(Object.keys(layers) as (keyof MapLayers)[]).map(layer => <label key={layer}>
                <input type="checkbox" checked={layers[layer]} onChange={() => {
                  const next = { ...preferences, layers: { ...layers, [layer]: !layers[layer] } };
                  setPreferences(next); writePreferences(next);
                }} />
                {layerLabels[layer]}
              </label>)}
            </div>}
          </div>
        </div>
      <div className="document-controls" aria-label={t('战术操作')}>
        <div className="history-buttons">
          <IconButton label={t('撤销 (Ctrl+Z)')} disabled={!history.past.length} onClick={() => dispatch({ type: 'undo' })}><Undo2 size={17} /></IconButton>
          <IconButton label={t('重做 (Ctrl+Shift+Z)')} disabled={!history.future.length} onClick={() => dispatch({ type: 'redo' })}><Redo2 size={17} /></IconButton>
        </div>
        <IconButton label={t('保存 (Ctrl+S)')} onClick={saveCurrent}><Save size={17} /></IconButton>
        <IconButton label={t('导出 .ica')} onClick={exportStrategy}><ArrowDownToLine size={17} /></IconButton>
        <IconButton label={t('导出 PNG 截图')} onClick={() => { setPlaying(false); setExportMode('image'); }}><Camera size={17} /></IconButton>
        <IconButton label={t('导出视频')} onClick={() => { setPlaying(false); setExportMode('video'); }}><Film size={17} /></IconButton>
        <IconButton label={t('战术设置')} onClick={() => { setPlaying(false); setSettingsOpen(true); }}><Settings size={17} /></IconButton>
      </div>
        </div>
        <button className="button mobile-palette" type="button" onClick={() => setPanelOpen(value => !value)}>{t('工具与英雄')}</button>
        {clearMenu && <div className="popover clear-menu" aria-label={t('清除本页对象')}>
          <button type="button" className="button danger-text"
            disabled={!drawingCollections.some(key => page[key].length) && !page.lineUpLinks.length}
            onClick={() => clearPageObjects()}>{t('清除本页全部对象')}</button>
          <div className="clear-groups">
            {drawingCollections.map(key => <button type="button" key={key} className="button subtle"
              disabled={!page[key].length} onClick={() => clearPageObjects(key)}>{t(collectionLabels[key])}</button>)}
            <button className="button subtle" type="button" disabled={!page.lineUpLinks.length} onClick={() => clearPageObjects('lineup')}>Lineup</button>
          </div>
        </div>}
        {status && <div className={`canvas-hint ${tool === 'lineup' ? 'lineup-controls' : ''}`}>
          <span>{status}</span>
          <IconButton label={t('取消工具')} onClick={() => activate('select')}><X size={16} /></IconButton>
          {tool === 'lineup' && (lineupPlacement?.editing
            ? <button className="button primary" type="button" onClick={saveLineupPositions}
              disabled={!lineupPlacement.moved}>{t('保存位置')}</button>
            : <button className="button primary" type="button" onClick={nextLineup}
              disabled={!lineupPlacement?.origin || !lineupPlacement.landing}>{t('下一步')}</button>)}
        </div>}

        {inspect && selected && selectedItem && <div className="popover inspector">
          <div className="inspector-heading"><strong>{t('对象属性')}</strong><IconButton label={t('关闭属性')} onClick={() => setInspect(false)}><X size={15} /></IconButton></div>
          {'position' in selectedItem && <label className="field">{t('标注')}
            <input key={selected.id} defaultValue={selectedItem.caption ?? ''} onBlur={event => setItem({ caption: event.target.value })} />
          </label>}
          {(selected.collection === 'agentData' || selected.collection === 'abilityData' || selected.collection === 'utilityData') &&
            <label className="check-field"><input type="checkbox" checked={!('isAlly' in selectedItem) || selectedItem.isAlly !== false}
              onChange={event => setItem({ isAlly: event.target.checked })} />{t('友方')}</label>}
          {selected.collection === 'agentData' && <label className="check-field"><input type="checkbox"
            checked={'state' in selectedItem && selectedItem.state === 'dead'}
            onChange={event => setItem({ state: event.target.checked ? 'dead' : 'none' })} />{t('阵亡')}</label>}
          {selected.collection === 'agentData' && <label className="field">{t('标记类型')}
            <select value={'kind' in selectedItem ? selectedItem.kind ?? 'plain' : 'plain'}
              onChange={event => setItem({ kind: event.target.value, rotation: 0, presetType: 'viewCone90', length: 100, diameterMeters: 8, opacityPercent: 18 })}>
              <option value="plain">{t('英雄头像')}</option><option value="viewCone">{t('带视野锥')}</option><option value="circle">{t('带范围圈')}</option>
            </select>
          </label>}
          {selected.collection === 'agentData' && <label className="field">{t('武器')}
            <select value={'weapon' in selectedItem ? selectedItem.weapon ?? 'none' : 'none'}
              onChange={event => setItem({ weapon: event.target.value })}>
              <option value="none">{t('无武器')}</option>
              {Object.entries(weapons).map(([label, values]) => <optgroup key={label} label={label}>
                {values.map(id => <option key={id} value={id}>{weaponName(id)}</option>)}
              </optgroup>)}
            </select>
          </label>}
          {'text' in selectedItem && <label className="field">{t('标签颜色')}
            <input type="color" value={cssColor(selectedItem.tagColorValue, '#976afa')}
              onChange={event => setItem({ tagColorValue: drawingColor(event.target.value) })} />
          </label>}
          {selected.collection === 'utilityData' && 'customColorValue' in selectedItem && <>
            <label className="field">{t('形状颜色')}<input type="color" value={cssColor(selectedItem.customColorValue)}
              onChange={event => setItem({ customColorValue: drawingColor(event.target.value) })} /></label>
            <label className="field">{t('填充不透明度')}
              <input type="range" min="0" max="100" value={selectedItem.customOpacityPercent ?? 22}
                onChange={event => setItem({ customOpacityPercent: Number(event.target.value) })} />
            </label>
          </>}
          {canRotate(selectedItem, map) &&
            <label className="field">{t('旋转角度')}
              <input type="number" step="15" key={`${selected.id}-${'rotation' in selectedItem ? selectedItem.rotation : 0}`} defaultValue={Math.round(('rotation' in selectedItem ? selectedItem.rotation ?? 0 : 0) * (180 / Math.PI))}
                onBlur={event => event.target.value !== '' && setItem({ rotation: Number(event.target.value) * Math.PI / 180 })} />
            </label>}
          {selected.collection === 'utilityData' && 'customDiameter' in selectedItem && <label className="field">{t('直径（米）')}
            <input type="number" min="1" max="110" key={`${selected.id}-${selectedItem.customDiameter}-diameter`} defaultValue={selectedItem.customDiameter ?? 10}
              onBlur={event => setItem({ customDiameter: Math.max(1, Math.min(110, Number(event.target.value))) })} />
          </label>}
          {selected.collection === 'utilityData' && 'customWidth' in selectedItem && <div className="dimension-fields">
            <label className="field">{t('宽（米）')}<input type="number" min="1" max="110" key={`${selected.id}-${selectedItem.customWidth}-width`} defaultValue={selectedItem.customWidth ?? 10}
              onBlur={event => setItem({ customWidth: Math.max(1, Math.min(110, Number(event.target.value))) })} /></label>
            <label className="field">{t('长（米）')}<input type="number" min="1" max="110" key={`${selected.id}-${selectedItem.customLength}-length`} defaultValue={selectedItem.customLength ?? 10}
              onBlur={event => setItem({ customLength: Math.max(1, Math.min(110, Number(event.target.value))) })} /></label>
          </div>}
          {'aspectRatio' in selectedItem && <>
            <label className="field">{t('图片宽度')}
              <input type="number" min="30" max="1600" key={`${selectedItem.id}-${selectedItem.scale}`} defaultValue={Math.round(selectedItem.scale)}
                onBlur={event => {
                  const width = event.currentTarget.valueAsNumber;
                  if (Number.isFinite(width) && width !== Math.round(selectedItem.scale)) setItem({ scale: Math.max(30, Math.min(1600, width)) });
                }} />
            </label>
            <label className="field">{t('参考链接')}
              <input type="url" key={selectedItem.id} defaultValue={selectedItem.link} placeholder="https://"
                onBlur={event => {
                  const input = event.currentTarget;
                  const value = input.value.trim();
                  const link = webLink(value);
                  if (value && !link) {
                    input.value = selectedItem.link ?? '';
                    notify('请输入完整的 HTTP 或 HTTPS 链接');
                  } else if ((link ?? '') !== (selectedItem.link ?? '')) setItem({ link: link ?? '' });
                }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
            </label>
            {webLink(selectedItem.link) && <a className="video-link" href={webLink(selectedItem.link)} target="_blank" rel="noreferrer">{t('打开参考链接')}</a>}
          </>}
          <button className="button subtle danger-text" type="button" onClick={() => erase([selected])}><Trash2 size={15} />{t('删除对象')}</button>
        </div>}
        <section className="pages-panel" aria-label={t('战术页面')}
          style={pagesOpen && pagesSize ? { width: `min(${pagesSize.width}px, calc(100% - 16px))` } : undefined}>
          {pagesOpen && <div className="pages-expanded">
            <div className="pages-heading"><strong>{t('页面')}</strong><span>{pages.length} {' '}{t('页')}</span></div>
            <div className="page-list" style={pagesSize ? { maxHeight: `min(${pagesSize.height}px, 60dvh)` } : undefined}>
              {pages.map((row, index) => <button type="button" className={`page-tab ${index === pageIndex ? 'active' : ''}`} key={row.id}
                aria-current={index === pageIndex ? 'step' : undefined}
                onClick={() => changePage(index)} onDoubleClick={() => { changePage(index); setPageRename(true); }}
                onDragStart={event => { event.dataTransfer.setData('application/x-team-playbook-page', String(index)); event.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={event => { if (event.dataTransfer.types.includes('application/x-team-playbook-page')) event.preventDefault(); }}
                onDrop={event => onPageDrop(event, index)} draggable>
                <span className="page-number">{index + 1}</span>
                <strong>{pageName(row)}</strong>
                <small>{pageIsAttack(row) ? t('进攻') : t('防守')}</small>
              </button>)}
            </div>
            <button className="page-resize" type="button" aria-label={t('调整页栏尺寸')}
              onPointerDown={event => {
                const panel = event.currentTarget.closest('section')!;
                const list = panel.querySelector('.page-list')!;
                event.currentTarget.dataset.origin = JSON.stringify([event.clientX, event.clientY, panel.clientWidth, list.clientHeight]);
                event.currentTarget.setPointerCapture(event.pointerId);
              }} onPointerMove={event => {
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                const [x, y, width, height] = JSON.parse(event.currentTarget.dataset.origin!);
                setPagesSize({ width: Math.max(220, Math.min(620, width + event.clientX - x)),
                  height: Math.max(70, Math.min(570, height + y - event.clientY)) });
              }} onKeyDown={event => {
                if (!event.key.startsWith('Arrow')) return;
                event.preventDefault(); event.stopPropagation();
                setPagesSize(current => ({
                  width: Math.max(220, Math.min(620, (current?.width ?? 300) + (event.key === 'ArrowRight' ? 12 : event.key === 'ArrowLeft' ? -12 : 0))),
                  height: Math.max(70, Math.min(570, (current?.height ?? 230) + (event.key === 'ArrowUp' ? 12 : event.key === 'ArrowDown' ? -12 : 0))),
                }));
              }}>↗</button>
            <div className="pages-actions">
              <div className="timeline-controls">
                <IconButton label={playing ? '暂停播放' : '播放战术'} className={playing ? 'active' : ''} onClick={() => {
                  if (!playing && pageIndex === pages.length - 1) changePage(0);
                  setPlaying(value => !value);
                }} disabled={pages.length < 2}>{playing ? <Pause size={16} /> : <Play size={16} />}</IconButton>
                <IconButton label={t('上一页 (A)')} disabled={pageIndex === 0} onClick={() => changePage(pageIndex - 1)}><ChevronLeft size={16} /></IconButton>
                <IconButton label={t('下一页 (D)')} disabled={pageIndex === pages.length - 1} onClick={() => changePage(pageIndex + 1)}><ChevronRight size={16} /></IconButton>
              </div>
              <div className="page-actions">
                <IconButton label={t('新建空白页')} onClick={() => addPage('blank')}><Square size={16} /></IconButton>
                <IconButton label={t('复制当前页')} onClick={() => addPage('copy')}><Copy size={16} /></IconButton>
                <IconButton label={t('重命名当前页')} onClick={() => setPageRename(true)}><Pencil size={15} /></IconButton>
                <IconButton label={t('删除当前页')} disabled={pages.length <= 1} onClick={removePage}><Trash2 size={16} /></IconButton>
              </div>
            </div>
          </div>}
          <div className="pages-pill">
            <IconButton label={t('接续当前页 (C)')} className="page-add" onClick={() => addPage('next')}><Plus size={19} /></IconButton>
            <button className="page-name-toggle" type="button" aria-expanded={pagesOpen}
              onClick={() => setPagesOpen(value => !value)}><span>{pageName(page)}</span><ChevronDown size={17} /></button>
          </div>
        </section>
      </section>

      <aside className={`palette ${panelOpen ? 'palette-open' : ''}`} aria-label={t('编辑工具和英雄')}>
        {activeAgent && <section className="ability-dock" aria-label={`${activeAgent.name} 技能`}>
          {activeAgent.abilities.map(ability => {
            const marker: Placement = { kind: 'ability', type: activeAgent.id, index: ability.index, ally: team };
            const selected = placement?.kind === 'ability' && placement.type === activeAgent.id && placement.index === ability.index;
            return <button className={`ability-dock-button ${selected ? 'active' : ''}`} type="button" key={ability.index}
              aria-label={ability.name} title={`${ability.name} · 拖到地图`}
              {...paletteDrag.bind(marker, event => {
                if (tool !== 'lineup' && (event.detail === 0 || window.matchMedia('(pointer: coarse)').matches)) selectPlacement(marker);
              })}><img draggable={false} alt="" src={gameAsset(ability.icon)} /></button>;
          })}
        </section>}
        <div className="palette-panel">
          <div className="palette-title"><h2>{t('工具')}</h2>
            <IconButton className="palette-close" label={t('关闭面板')} onClick={() => setPanelOpen(false)}><X size={17} /></IconButton>
          </div>
          <div className="editor-tool-grid">
            <IconButton label={t('画笔 (Q)')} className={isDrawing ? 'active' : ''} aria-pressed={isDrawing}
              onClick={() => activate(isDrawing ? 'select' : lastDrawing.current)}><Pencil size={20} /></IconButton>
            <IconButton label={t('橡皮擦 (W)')} className={tool === 'eraser' ? 'active' : ''} aria-pressed={tool === 'eraser'}
              onClick={() => activate(tool === 'eraser' ? 'select' : 'eraser')}><Eraser size={20} /></IconButton>
            <IconButton label={t('文本工具 (T 在地图中心放置文本)')} className={tool === 'text' ? 'active' : ''} aria-pressed={tool === 'text'}
              onClick={() => activate(tool === 'text' ? 'select' : 'text')}><Type size={20} /></IconButton>
            <IconButton label={t('插入图片')} onClick={() => fileInput.current?.click()}><ImagePlus size={20} /></IconButton>
            <IconButton label="Lineup (G)" className={tool === 'lineup' ? 'active' : ''} aria-pressed={tool === 'lineup'}
              onClick={() => tool === 'lineup' ? activate('select') : beginLineup()}><BookOpen size={19} /></IconButton>
            <IconButton label={t('视野锥工具')} className={toolOptions === 'vision' ? 'active' : ''} aria-pressed={toolOptions === 'vision'}
              onClick={() => { activate('select'); setToolOptions(toolOptions === 'vision' ? undefined : 'vision'); }}><Eye size={20} /></IconButton>
            <IconButton label={t('形状工具')} className={toolOptions === 'shapes' ? 'active' : ''} aria-pressed={toolOptions === 'shapes'}
              onClick={() => { activate('select'); setToolOptions(toolOptions === 'shapes' ? undefined : 'shapes'); }}><Square size={19} /></IconButton>
            <IconButton label={t('职责图标')} className={toolOptions === 'roles' ? 'active' : ''} aria-pressed={toolOptions === 'roles'}
              onClick={() => { activate('select'); setToolOptions(toolOptions === 'roles' ? undefined : 'roles'); }}>
              <img draggable={false} alt="" src={gameAsset('agents/duelist.webp')} />
            </IconButton>
            <IconButton label={t('放置爆能器')}
              {...paletteDrag.bind({ kind: 'utility', type: 'spike', ally: team }, () => {
                const center = viewport.current?.center();
                if (!center) return;
                if (tool !== 'lineup') { place({ kind: 'utility', type: 'spike', ally: team }, center); return; }
                activate('select');
                const { item } = objectForPlacement({ kind: 'utility', type: 'spike', ally: team },
                  center, map, page, version, drawingColor(brush.color));
                editPage(p => append(p, 'utilityData', item as Page['utilityData'][number]));
              })}><img draggable={false} alt="" src={gameAsset('spike.svg')} /></IconButton>
          </div>
          <input type="file" ref={fileInput} accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" hidden onChange={addImage} />
        {isDrawing && <div className="brush-panel" aria-label={t('画笔样式')}>
          <div className="drawing-modes">
            {controls.filter(({ tool }) => drawingTools.includes(tool as typeof drawingTools[number])).map(({ tool: id, label, icon: Icon }) =>
              <IconButton key={id} label={label} aria-pressed={tool === id} className={tool === id ? 'active' : ''}
                onClick={() => activate(id)}><Icon size={19} /></IconButton>)}
          </div>
          <div className="brush-controls">
          <div className="swatches">{[...brushColors, ...preferences.colors].map(color => <button key={color} type="button" title={color} aria-label={`颜色 ${color}`}
            aria-pressed={brush.color === color} className={brush.color === color ? 'selected-swatch' : ''}
            style={{ '--swatch': color } as React.CSSProperties} onClick={() => setBrush(prev => ({ ...prev, color }))} />)}</div>
          <input type="color" value={brush.color} aria-label={t('自定义颜色')} onChange={event => setBrush(prev => ({ ...prev, color: event.target.value }))} />
          {!brushColors.includes(brush.color) && <IconButton
            label={preferences.colors.includes(brush.color) ? '移除自定义颜色' : '保存自定义颜色'}
            onClick={() => setPreferences(previous => {
              const colors = previous.colors.includes(brush.color) ? previous.colors.filter(color => color !== brush.color) : [...previous.colors, brush.color];
              const next = { ...previous, colors };
              writePreferences(next);
              return next;
            })}>{preferences.colors.includes(brush.color) ? <Minus size={15} /> : <Plus size={15} />}</IconButton>}
          <select aria-label={t('线宽')} value={brush.width} onChange={event => setBrush(prev => ({ ...prev, width: Number(event.target.value) }))}>
            <option value="3">{t('细')}</option><option value="5">{t('中')}</option><option value="8">{t('粗')}</option><option value="12">{t('加粗')}</option>
          </select>
          <button className={`button subtle ${brush.dotted ? 'active' : ''}`} type="button"
            aria-pressed={brush.dotted} onClick={() => setBrush(prev => ({ ...prev, dotted: !prev.dotted }))}>{t('虚线')}</button>
          {(tool === 'pencil' || tool === 'line') && <>
            <IconButton label={t('箭头端点')} className={brush.arrow ? 'active' : ''} aria-pressed={brush.arrow}
              onClick={() => setBrush(prev => ({ ...prev, arrow: !prev.arrow }))}><ArrowUpRight size={17} /></IconButton>
            <IconButton label={t('显示预计移动时间')} className={brush.timing ? 'active' : ''} aria-pressed={brush.timing}
              onClick={() => setBrush(prev => ({ ...prev, timing: !prev.timing }))}><Timer size={16} /></IconButton>
            {brush.timing && <select aria-label={t('移动方式')} value={brush.speed} onChange={event => setBrush(prev => ({ ...prev, speed: event.target.value }))}>
              <option value="running">{t('跑动')}</option><option value="walking">{t('静步')}</option>
              <option value="brimStim">{t('振奋信标')}</option><option value="neonRun">{t('霓虹疾跑')}</option>
            </select>}
          </>}
        </div></div>}

          {tool === 'text' && <div className="context-tools">
            <label>{t('标签颜色')}{' '} <input type="color" value={textColor} onChange={event => setTextColor(event.target.value)} /></label>
            <button type="button" className="button primary"
              {...paletteDrag.bind({ kind: 'text', color: drawingColor(textColor) }, () =>
                placeAtCenter({ kind: 'text', color: drawingColor(textColor) }))}>{t('放置文本')}</button>
          </div>}
          {toolOptions && <div className="context-tools utility-grid">
            {utilityList.filter(([id]) => toolOptions === 'vision' ? id.startsWith('viewCone')
              : toolOptions === 'shapes' ? id.startsWith('custom') : id in roleLabels).map(([id, label]) => {
              const marker: Placement = { kind: 'utility', type: id, ally: team };
              return <button key={id} type="button" className="utility-button" title={`${label} · 点击放在地图中心，或拖到地图`}
                {...paletteDrag.bind(marker, () => placeAtCenter(marker))}>
                {id === 'customCircle' ? <Circle size={20} /> : id.startsWith('custom') ? <Square size={20} /> :
                  id.startsWith('viewCone') ? <Eye size={20} /> : <img draggable={false} alt="" src={gameAsset(`agents/${id}.webp`)} />}
                <span>{label}</span>
              </button>;
            })}
          </div>}

          <div className="palette-title agent-heading"><h2>{t('英雄')}</h2>
            <IconButton label={t('仅显示收藏英雄')} className={onlyFavorite ? 'active' : ''} aria-pressed={onlyFavorite}
              onClick={() => { setRole(''); setOnlyFavorite(value => !value); }}>★</IconButton>
          </div>
          <div className="palette-content">
            <div className="palette-filters">
              <div className="search-field"><Search size={16} /><input placeholder={t('搜索英雄')} aria-label={t('搜索英雄')} value={search} onChange={event => setSearch(event.target.value)} /></div>
              <div className="segmented team-switch">
                <button type="button" className={team ? 'active ally' : ''} aria-pressed={team} onClick={() => setTeam(true)}><i />{t('友方')}</button>
                <button type="button" className={!team ? 'active enemy' : ''} aria-pressed={!team} onClick={() => setTeam(false)}><i />{t('敌方')}</button>
              </div>
            </div>
            <div className="role-filters">
              <IconButton label={t('全部英雄')} className={!role && !onlyFavorite && !onMapOnly ? 'active' : ''}
                onClick={() => { setRole(''); setOnlyFavorite(false); setOnMapOnly(false); }}>{t('全')}</IconButton>
              <IconButton label={t('已上图英雄 (R)')} className={onMapOnly ? 'active' : ''}
                onClick={() => { setOnMapOnly(value => !value); setRole(''); setOnlyFavorite(false); }}><MapPin size={16} /></IconButton>
              {Object.entries(roleLabels).map(([id, label]) => <IconButton key={id} label={label}
                className={role === id ? 'active' : ''} onClick={() => { setRole(role === id ? '' : id); setOnlyFavorite(false); setOnMapOnly(false); }}>
                <img alt="" src={gameAsset(`agents/${id}.webp`)} />
              </IconButton>)}
            </div>
            <div className="agent-grid">
              {filteredAgents.map(agent => {
                const isFavorite = favorite.includes(agent.id);
                const locked = tool === 'lineup' && !!lineupAgent && lineupAgent !== agent.id;
                const marker: Placement = { kind: 'agent', type: agent.id, ally: team };
                return <div className="agent-tile" key={agent.id}>
                  <button type="button" className={`agent-button ${agentId === agent.id ? 'active' : ''}`}
                    title={`${agent.name} · 点击展开技能，拖到地图放置`} aria-label={agent.name}
                    aria-expanded={agentId === agent.id} disabled={locked} onContextMenu={event => { event.preventDefault(); selectAgent(agent.id); }}
                    {...paletteDrag.bind(marker, () => selectAgent(agent.id))}>
                    <img draggable={false} alt="" src={gameAsset(agent.icon)} />
                  </button>
                  <button type="button" className={`favorite-star ${isFavorite ? 'marked' : ''}`}
                    aria-label={`${isFavorite ? '取消收藏' : '收藏'} ${agent.name}`} aria-pressed={isFavorite}
                    onClick={() => toggleFavorite(agent.id)}>★</button>
                </div>;
              })}
            </div>
            {!filteredAgents.length && <p className="muted compact">{t('没有匹配的英雄')}</p>}
            {page.lineUpLinks.length > 0 && <section className="lineup-list"><h3>{t('本页 Lineup')}</h3>
              {page.lineUpLinks.map(link => <button key={link.id} type="button" onClick={() => openSavedLineup(link)}>
                <Route size={15} />{link.name || t('未命名 Lineup')}
              </button>)}
            </section>}
          </div>
        </div>
      </aside>
    </div>


    {context && <>
      <div className="context-backdrop" onPointerDown={() => setContext(undefined)} />
      <div className="popover context-menu" style={{ left: Math.max(4, Math.min(context.screen.dx, window.innerWidth - 188)),
        top: Math.max(4, Math.min(context.screen.dy, window.innerHeight - Math.min(window.innerHeight * .65, 420) - 8)) }}>
        <button type="button" onClick={() => { setInspect(true); setContext(undefined); }}><Pencil size={15} />{t('编辑属性')}</button>
        {contextItem && context.item.collection === 'agentData' && 'type' in contextItem &&
          <button type="button" onClick={() => { setAgentId(contextItem.type); setPanelOpen(true); setContext(undefined); }}>
            <Crosshair size={15} />{t('展开该英雄技能')}
          </button>}
        {contextItem && (context.item.collection === 'agentData' || context.item.collection === 'abilityData') &&
          <button type="button" onClick={() => startLineupFromMarker(contextItem as AgentMarker | AbilityMarker)}>
            <Route size={15} />{t('以此为')}{context.item.collection === 'agentData' ? t('起点') : t('落点')}{t('新建 Lineup')}
          </button>}
        {contextItem && 'text' in contextItem &&
          <button type="button" onClick={() => editItem(context.item)}><Type size={15} />{t('编辑文本')}</button>}
        {contextItem && contextVision && <>
          <button type="button" onClick={() => void openElevation(contextItem, context.item)}><Layers size={15} />{t('视线高度')}</button>
          <button type="button" onClick={() => void inspectSightline(contextItem, context.item.collection, contextVision)}>
            <Eye size={15} />{t('视线报告')}
          </button>
        </>}
        {[-1, 1].filter(direction => pages[pageIndex + direction]).map(direction =>
          <button key={direction} type="button" onClick={() => copyToNeighbor(direction, context.item)}>
            <Copy size={15} />{t('复制到')}{direction < 0 ? t('上一页') : t('下一页')}
          </button>)}
        {contextItem && 'data' in contextItem && rangeToggles.map(({ key, label }) => {
          const checked = contextItem.visualState?.[key] !== false;
          return <button key={key} type="button" aria-pressed={checked} onClick={() => editPage(p => patchItem(p, 'abilityData', contextItem.id, {
            visualState: { ...contextItem.visualState, [key]: !checked },
          }))}>{checked ? <Check size={15} /> : <Square size={15} />}{label}</button>;
        })}
        {imageLink && <a href={imageLink} target="_blank" rel="noreferrer" onClick={() => setContext(undefined)}><ArrowUpRight size={15} />{t('打开参考链接')}</a>}
        {hasWall !== undefined && <button type="button" onClick={() => {
          editPage(p => patchItem(p, 'abilityData', context.item.id, { wallPath: hasWall ? [] : initialWallPath(map, pageIsAttack(page)) }));
          setContext(undefined);
        }}>{hasWall ? <Eraser size={15} /> : <Route size={15} />}{hasWall ? '移除水墙' : '绘制水墙'}</button>}
        <button type="button" onClick={() => {
          pasteSelection(copyCanvasObjects(strategy, page, [context.item]));
          setContext(undefined);
        }}><Copy size={15} />{t('复制对象')}</button>
        <button type="button" className="danger-text" onClick={() => erase([context.item])}><Trash2 size={15} />{t('删除')}</button>
      </div>
    </>}
    {captionRead && <Modal title={t('对象标注')} onClose={() => setCaptionRead(undefined)}>
      <p className="caption-content">{captionRead}</p>
    </Modal>}
    {sightlineReport && <Modal title={t('视线报告')} onClose={() => setSightlineReport(undefined)}>
      <label className="field">{t('报告内容')}<textarea readOnly rows={7} value={sightlineReport} /></label>
      <div className="modal-actions"><button type="button" className="button primary"
        onClick={() => navigator.clipboard.writeText(sightlineReport).then(() => notify('已复制视线报告'), () => notify('可以手动选择并复制报告'))}>
        <Copy size={15} />{t('复制报告')}
      </button></div>
    </Modal>}
    {elevationMenu && <Modal title={t('视线高度')} onClose={() => setElevationMenu(undefined)}>
      <div className="draft-switcher">{[{ label: '自动', height: undefined }, ...elevationMenu.choices].map(choice => {
        const meters = choice.height ?? (choice.label === '自动' ? elevationMenu.automatic : undefined);
        const checked = choice.height == null ? elevationMenu.manual == null :
          elevationMenu.manual != null && Math.abs(elevationMenu.manual - choice.height) <= 8;
        return <button type="button" className="button subtle" key={choice.height ?? 'auto'} aria-pressed={checked} onClick={() => {
          const { item, pageId } = elevationMenu;
          commit(previous => updatePage(previous, pageId, row => patchItem(row, item.collection, item.id, { visionElevation: choice.height })));
          setElevationMenu(undefined);
        }}>{checked && <Check size={15} />}{choice.label}{meters != null && ` · ${(meters / 100).toFixed(2)} m`}</button>;
      })}</div>
      {!elevationMenu.choices.length && <p className="muted">{t('当前位置没有采样到可用站立面。')}</p>}
    </Modal>}
    {endpointMenu && endpointLinks && <Modal title={endpointMenu.end === 'origin' ? t('同一起点的 Lineup') : t('同一落点的 Lineup')}
      onClose={() => setEndpointMenu(undefined)}>
      <div className="draft-switcher">{endpointLinks.map(link => <button className="button secondary" type="button" key={link.id}
        onClick={() => openSavedLineup(link)}>{link.name || t('未命名 Lineup')}</button>)}</div>
      <div className="modal-actions">
        {[-1, 1].filter(direction => pages[pageIndex + direction]).map(direction =>
          <button key={direction} className="button subtle" type="button" onClick={() => {
            copyToNeighbor(direction, ...endpointLinks.map(link => link.id));
            setEndpointMenu(undefined);
          }}>{t('整组复制到')}{direction < 0 ? t('上一页') : t('下一页')}</button>)}
        <button className="button primary" type="button" onClick={() => reuseLineupEnd(endpointMenu.link, endpointMenu.end)}>
          {t('以此点位新增')}
        </button>
      </div>
    </Modal>}
    {exportMode && <CanvasExportDialog strategy={strategy} pageId={page.id} layers={layers} media={media}
      mode={exportMode} close={() => setExportMode(undefined)} notify={notify} />}
    {settingsOpen && <Suspense fallback={<p role="status" className="toast">{t('正在打开设置…')}</p>}><EditorSettings settings={page.settings} palette={theme} preferences={preferences}
      close={() => setSettingsOpen(false)} apply={(settings, palette, allPages, prefs) => {
        setPreferences(prefs); writePreferences(prefs);
        commit(previous => ({ ...previous, document: { ...previous.document, themePalette: palette,
          pages: previous.document.pages.map(row => allPages || row.id === page.id ? { ...row, settings: {
            ...row.settings, agentSize: settings.agentSize, abilitySize: settings.abilitySize, useNeutralTeamColors: settings.useNeutralTeamColors,
          } } : row) } }));
      }} /></Suspense>}
    {pageRename && <Modal title={t('重命名页面')} onClose={() => setPageRename(false)}>
      <form onSubmit={event => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get('name')).trim();
        if (name) editPage(p => ({ ...p, name, isAutoNamed: false }));
        setPageRename(false);
      }}><label className="field">{t('页面名称')}<input name="name" autoFocus defaultValue={pageName(page)} required /></label>
        <div className="modal-actions"><button className="button primary" type="submit">{t('保存')}</button></div>
      </form>
    </Modal>}
    {lineupDialog && <Modal title={lineupPlacement ? t('新建 Lineup') : '编辑 Lineup'} onClose={closeLineup}>
      <form onSubmit={saveLineup} onPaste={event => {
        const file = clipboardImage(event.clipboardData);
        if (!file) return;
        event.preventDefault();
        void addLineupPictures([file]);
      }}>
        <label className="field">{t('名称')}<input name="name" autoFocus defaultValue={lineupDialog.name} placeholder={t('例如 A 主道到包点烟')} /></label>
        <label className="field">{t('备注')}<textarea name="notes" rows={3} defaultValue={lineupDialog.notes} /></label>
        <label className="field">{t('视频链接')}<input name="video" type="url" defaultValue={lineupDialog.youtubeLink} /></label>
        {videoUrl && <a className="video-link" href={videoUrl} target="_blank" rel="noreferrer">{t('查看参考视频')}</a>}
        {!!lineupDialog.images.length && <div className="lineup-pictures">{lineupDialog.images.map(image => {
          const url = media[image.id + image.fileExtension];
          return <div key={image.id} className="lineup-picture">
            {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={t('Lineup 参考图')} /></a> : <span>{t('图片缺失')}</span>}
            <IconButton label={t('移除参考图')} onClick={() => removeLineupPicture(image)}><X size={14} /></IconButton>
          </div>;
        })}</div>}
        {!lineupPlacement && <div className="modal-actions">
          <button className="button subtle" type="button" onClick={() => reuseLineupEnd(lineupDialog, 'origin')}>{t('从此起点新增')}</button>
          <button className="button subtle" type="button" onClick={() => reuseLineupEnd(lineupDialog, 'landing')}>{t('向此落点新增')}</button>
          {[-1, 1].filter(direction => pages[pageIndex + direction]).map(direction =>
            <button key={direction} className="button subtle" type="button" onClick={() => copyToNeighbor(direction, lineupDialog.id)}>
              {t('复制到')}{direction < 0 ? t('上一页') : t('下一页')}
            </button>)}
        </div>}
        <div className="modal-actions">
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" hidden multiple ref={lineupFiles}
            onChange={event => {
              void addLineupPictures(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = '';
            }} />
          <button className="button subtle" type="button" onClick={() => lineupFiles.current?.click()}><ImagePlus size={16} />{t('添加参考图')}</button>
          {!lineupPlacement && <>
            <button className="button subtle" type="button" onClick={() => editLineupPositions(lineupDialog)}><MapPin size={16} />{t('调整位置')}</button>
            <IconButton label={t('删除 Lineup')} className="danger-text" onClick={() => {
              editPage(p => {
                const links = p.lineUpLinks.filter(row => row.id !== lineupDialog.id);
                return { ...p, lineUpLinks: links, lineUpOrigins: p.lineUpOrigins.filter(row => links.some(link => link.originId === row.id)),
                  lineUpLandings: p.lineUpLandings.filter(row => links.some(link => link.landingId === row.id)) };
              });
              closeLineup();
            }}><Trash2 size={17} /></IconButton>
          </>}
          <button className="button primary" type="submit" disabled={!!lineupForm?.pending}>{t('保存 Lineup')}</button>
        </div>
      </form>
    </Modal>}
  </main>;
}
