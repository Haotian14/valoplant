import { useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, BookOpen, Check, ChevronDown, Circle, Copy, Crosshair, Eraser, Eye, Hand, ImagePlus, Save, Timer,
  Layers, MapPin, Minus, MousePointer2, Pencil, Play, Plus, Redo2, Search, Shield, Square, Swords,
  Trash2, Type, Undo2, X, Pause, ChevronLeft, ChevronRight, Route,
} from 'lucide-react';
import Board, { drawingTools, type BoardViewport, type Brush, type Tool } from './Board.tsx';
import { steppedRotation } from './board-gestures.ts';
import { objectForPlacement, usePlacementDrag, type Placement } from './placement.ts';
import { type MapLayers } from './BoardArt.tsx';
import { abilityFor, add, agentById, agents, gameAsset, mapById, point, project, subtract, type Point } from './catalog.ts';
import { anchorFor, canonicalMarkers, drawingColor, flipPage, pageIsAttack, pinnedUprightPosition } from './geometry.ts';
import { canRotate, markerAbility } from './object-handles.ts';
import { findMapDoor, toggleMapDoor } from './map-doors.ts';
import { initialWallPath, savedWallPath } from './wall-path.ts';
import { downloadIca, imageExtensions } from './archive.ts';
import { append, appendLineup, drawingCollections, moveItem, newId, newPage, pageName, patchItem, reindexPages, removeItems, type CanvasItem,
  type AbilityMarker, type AgentMarker, type CanvasSelection, type Collection, type LineupLink, type Page, type Strategy,
} from './strategy.ts';
import { IconButton, Modal } from './ui.tsx';

type Update = (strategy: Strategy) => Strategy;
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
const layerLabels = { callouts: '点位名称', barriers: '开局屏障', orbs: '大招点', grid: '网格' };
const utilityList = [
  ['spike', '爆能器'], ['viewCone90', '视野锥'], ['viewCone180', '广角视野'], ['viewCone40', '窄角视野'],
  ['customCircle', '圆形范围'], ['customRectangle', '矩形范围'], ['controller', '控场'], ['duelist', '决斗'],
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

function markerWithNewId(item: CanvasItem, offset: Point): CanvasItem {
  const moved = moveItem(item, offset);
  return { ...moved, ...('aspectRatio' in moved ? { assetId: moved.assetId ?? moved.id } : {}), id: newId() };
}

function useMediaUrls(media: Strategy['media']) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const objects = Object.fromEntries(Object.entries(media).map(([name, bytes]) => {
      const extension = name.split('.').at(-1)?.toLowerCase();
      const type = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
      return [name, URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }))];
    }));
    setUrls(objects);
    return () => Object.values(objects).forEach(url => URL.revokeObjectURL(url));
  }, [media]);
  return urls;
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

export default function Editor({ initial, save, exit, notify, saving }: {
  initial: Strategy; save: (strategy: Strategy) => void; exit: () => void; notify: (message: string) => void;
  saving: 'saved' | 'saving' | 'failed';
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
  const viewport = useRef<BoardViewport>(null);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [team, setTeam] = useState(true);
  const [hideAgents, setHideAgents] = useState(false);
  const hovered = useRef<{ item: CanvasSelection; screen: Point } | undefined>(undefined);
  const lastDrawing = useRef<Tool>('pencil');
  const [agentId, setAgentId] = useState<string>();
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [brush, setBrush] = useState<Brush>({ color: brushColors[0], width: 5, dotted: false, arrow: false, timing: false, speed: 'running' });
  const [textColor, setTextColor] = useState(brushColors[0]);
  const [layers, setLayers] = useState<MapLayers>({ callouts: true, barriers: true, orbs: false, grid: true });
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
  const lineupDialog = lineupForm?.link;
  const [inspect, setInspect] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [animate, setAnimate] = useState(false);
  const [pageRename, setPageRename] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [favorite, setFavorite] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('team-playbook-favorites') ?? '[]'); } catch { return []; }
  });
  const [onlyFavorite, setOnlyFavorite] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const lineupFiles = useRef<HTMLInputElement>(null);
  const copied = useRef<{ collection: Collection; item: CanvasItem }[]>([]);
  const allMedia = useMemo(() => ({ ...strategy.media, ...lineupForm?.media }), [strategy.media, lineupForm?.media]);
  const media = useMediaUrls(allMedia);
  const lastSent = useRef(initial);
  const activeAgent = agentId ? agentById[agentId] : undefined;
  const selected = selection.length === 1 ? selection[0] : undefined;
  const selectedItem = selected && page[selected.collection].find(item => item.id === selected.id);

  useEffect(() => {
    if (lastSent.current !== strategy) {
      lastSent.current = strategy;
      save(strategy);
    }
  }, [strategy, save]);

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
    const timer = setTimeout(() => setAnimate(false), 430);
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

  function moveSelections(items: CanvasSelection[], delta: Point) {
    const keys = new Set(items.map(keyOf));
    editPage(p => {
      let changed = p;
      for (const collection of drawingCollections) {
        const canonical = collection === 'drawingData' ? pageIsAttack(p) : canonicalMarkers(p, version);
        const offset = canonical ? delta : point(-delta.dx, -delta.dy);
        changed = { ...changed, [collection]: p[collection].map(item => keys.has(keyOf({ collection, id: item.id })) ? moveItem(item, offset) : item) };
      }
      return changed;
    });
  }

  function erase(items: CanvasSelection[]) {
    editPage(p => removeItems(p, items));
    setSelection([]);
    setContext(undefined);
    setClearMenu(false);
    setInspect(false);
  }

  function clearPageObjects(collection?: Collection) {
    const collections = collection ? [collection] : drawingCollections;
    editPage(current => {
      const cleared = { ...current };
      for (const key of collections) cleared[key] = [];
      return collection ? cleared : { ...cleared, lineUpOrigins: [], lineUpLandings: [], lineUpLinks: [] };
    });
    setSelection([]);
    setClearMenu(false);
    setInspect(false);
  }

  function copySelection(items = selection) {
    copied.current = items.flatMap(sel => {
      const item = page[sel.collection].find(row => row.id === sel.id);
      return item ? [{ collection: sel.collection, item }] : [];
    });
  }

  function pasteSelection() {
    if (!copied.current.length) return;
    const next = copied.current.map(row => ({ ...row, item: markerWithNewId(row.item, point(22, 22)) }));
    editPage(p => next.reduce((current, row) => append(current, row.collection, row.item), p));
    setSelection(next.map(row => ({ collection: row.collection, id: row.item.id })));
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (textInput(event.target) || editingTextId || lineupDialog || pageRename) return;
      const key = event.key.toLowerCase();
      const command = event.metaKey || event.ctrlKey;
      if (command) {
        if (key === 'z') { event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' }); }
        if (key === 'y') { event.preventDefault(); dispatch({ type: 'redo' }); }
        if ((key === 'c' || key === 'x') && selection.length) {
          event.preventDefault(); copySelection();
          if (key === 'x') erase(selection);
        }
        if (key === 's') { event.preventDefault(); save(strategy); }
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
      if (key === 'r') { setHideAgents(value => !value); }
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
      } else if (copied.current.length) {
        event.preventDefault();
        pasteSelection();
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
    setLineupPlacement(undefined);
    openLineup(link);
  }

  function reuseLineupEnd(link: LineupLink, end: 'origin' | 'landing') {
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

  const filteredAgents = useMemo(() => agents.filter(agent =>
    (!role || agent.role === role) && (!onlyFavorite || favorite.includes(agent.id)) &&
    agent.name.toLowerCase().includes(search.toLowerCase()),
  ).sort((a, b) => a.name.localeCompare(b.name)), [role, onlyFavorite, favorite, search]);

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
  const imageLink = contextItem && 'aspectRatio' in contextItem ? webLink(contextItem.link) : undefined;
  const abilityShape = contextItem && markerAbility(contextItem, map);
  const hasWall = abilityShape?.kind === 'wall' && contextItem && 'data' in contextItem
    ? savedWallPath(contextItem, map).length > 0 : undefined;
  const rangeToggles: { key: keyof NonNullable<AbilityMarker['visualState']>; label: string }[] = [];
  if (abilityShape) {
    if (['circle', 'sector'].includes(abilityShape.kind)) rangeToggles.push({ key: 'showRangeOutline', label: '范围轮廓' });
    if (['circle', 'sector', 'rect', 'mesh', 'image'].includes(abilityShape.kind)) rangeToggles.push({ key: 'showRangeFill', label: '技能范围' });
    if (abilityShape.inner) {
      rangeToggles.push({ key: 'showInnerOutline', label: '内圈轮廓' }, { key: 'showInnerFill', label: '内圈填充' });
    }
  }

  return <main className="editor">
    <header className="editor-header">
      <div className="editor-title">
        <IconButton label="返回战术库" onClick={exit}><ArrowLeft size={20} /></IconButton>
        <div className="editor-title-text">
          <input aria-label="战术名称" key={strategy.name} defaultValue={strategy.name}
            onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            onBlur={event => {
              const name = event.currentTarget.value.trim();
              if (!name) { event.currentTarget.value = strategy.name; return; }
              if (name !== strategy.name) commit(previous => ({ ...previous, name }));
            }} />
          <span className={`save-status ${saving === 'failed' ? 'error' : ''}`}>
            <i />{saving === 'saved' ? '已保存到浏览器' : saving === 'saving' ? '正在保存' : '保存失败'}
          </span>
        </div>
      </div>

    </header>

    <div className="editor-body">
      <section className="canvas-area">
        <Board map={map} page={page} version={version} tool={tool} brush={brush} placement={placement}
          viewport={viewport} externalDrag={paletteDrag.preview} editingTextId={editingTextId}
          animate={animate} layers={layers} selection={selection} media={media}
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
          hideAgents={hideAgents} onHover={(item, screen) => { hovered.current = item && { item, screen }; }}
          onSelect={items => { setSelection(items); setContext(undefined); setClearMenu(false); if (items.length !== 1) setInspect(false); }}
          onContext={(item, screen) => { setSelection([item]); setClearMenu(false); setContext({ item, screen }); }}
          onEdit={editItem} onDraw={drawing => editPage(p => append(p, 'drawingData', drawing))}
          onMove={moveSelections} onTransform={(target, patch) => editPage(p => patchItem(p, target.collection, target.id, patch))}
          onDoorToggle={door => editPage(p => toggleMapDoor(p, door, map, version))}
          onErase={erase} onPlace={place}
          onImageDrop={(file, position) => { void importImage(file, position); }}
          onLineupMove={moveLineup} onLineupOpen={openSavedLineup} />
        <div className="map-chrome">
        <div className="map-controls">
          <span className="map-name"><MapPin size={15} />{map.name}</span>
          <button className={`button side-toggle ${pageIsAttack(page) ? 'attack' : 'defense'}`} type="button"
            aria-label="切换整套战术的攻防朝向，按住 Shift 仅切换本页"
            title="切换攻防 (F) · 按住 Shift 仅切换本页"
            onClick={event => setSide(pageIsAttack(page) ? 'false' : 'true', !event.shiftKey)}>
            {pageIsAttack(page) ? <Swords size={16} /> : <Shield size={16} />}
            {pageIsAttack(page) ? '进攻' : '防守'}
            {pages.some(row => row.isAttack !== page.isAttack) && <i className="mixed-side" />}
          </button>
          <div className="layer-control">
            <IconButton label="地图图层" className={layersOpen ? 'active' : ''} onClick={() => setLayersOpen(value => !value)}><Layers size={17} /></IconButton>
            {layersOpen && <div className="popover layer-menu">
              {(Object.keys(layers) as (keyof MapLayers)[]).map(layer => <label key={layer}>
                <input type="checkbox" checked={layers[layer]} onChange={() => setLayers(prev => ({ ...prev, [layer]: !prev[layer] }))} />
                {layerLabels[layer]}
              </label>)}
            </div>}
          </div>
        </div>
      <div className="document-controls" aria-label="战术操作">
        <div className="history-buttons">
          <IconButton label="撤销 (Ctrl+Z)" disabled={!history.past.length} onClick={() => dispatch({ type: 'undo' })}><Undo2 size={17} /></IconButton>
          <IconButton label="重做 (Ctrl+Shift+Z)" disabled={!history.future.length} onClick={() => dispatch({ type: 'redo' })}><Redo2 size={17} /></IconButton>
        </div>
        <IconButton label="保存 (Ctrl+S)" onClick={() => save(strategy)}><Save size={17} /></IconButton>
        <IconButton label="导出 .ica" onClick={exportStrategy}><ArrowDownToLine size={17} /></IconButton>
      </div>
        </div>
        <button className="button mobile-palette" type="button" onClick={() => setPanelOpen(value => !value)}>工具与英雄</button>
        {clearMenu && <div className="popover clear-menu" aria-label="清除本页对象">
          <button type="button" className="button danger-text"
            disabled={!drawingCollections.some(key => page[key].length) && !page.lineUpLinks.length}
            onClick={() => clearPageObjects()}>清除本页全部对象</button>
          <div className="clear-groups">
            {drawingCollections.map(key => <button type="button" key={key} className="button subtle"
              disabled={!page[key].length} onClick={() => clearPageObjects(key)}>{collectionLabels[key]}</button>)}
          </div>
        </div>}
        {status && <div className={`canvas-hint ${tool === 'lineup' ? 'lineup-controls' : ''}`}>
          <span>{status}</span>
          <IconButton label="取消工具" onClick={() => activate('select')}><X size={16} /></IconButton>
          {tool === 'lineup' && (lineupPlacement?.editing
            ? <button className="button primary" type="button" onClick={saveLineupPositions}
              disabled={!lineupPlacement.moved}>保存位置</button>
            : <button className="button primary" type="button" onClick={nextLineup}
              disabled={!lineupPlacement?.origin || !lineupPlacement.landing}>下一步</button>)}
        </div>}

        {inspect && selected && selectedItem && <div className="popover inspector">
          <div className="inspector-heading"><strong>对象属性</strong><IconButton label="关闭属性" onClick={() => setInspect(false)}><X size={15} /></IconButton></div>
          {'position' in selectedItem && <label className="field">标注
            <input key={selected.id} defaultValue={selectedItem.caption ?? ''} onBlur={event => setItem({ caption: event.target.value })} />
          </label>}
          {(selected.collection === 'agentData' || selected.collection === 'abilityData' || selected.collection === 'utilityData') &&
            <label className="check-field"><input type="checkbox" checked={!('isAlly' in selectedItem) || selectedItem.isAlly !== false}
              onChange={event => setItem({ isAlly: event.target.checked })} />友方</label>}
          {selected.collection === 'agentData' && <label className="check-field"><input type="checkbox"
            checked={'state' in selectedItem && selectedItem.state === 'dead'}
            onChange={event => setItem({ state: event.target.checked ? 'dead' : 'none' })} />阵亡</label>}
          {selected.collection === 'agentData' && <label className="field">标记类型
            <select value={'kind' in selectedItem ? selectedItem.kind ?? 'plain' : 'plain'}
              onChange={event => setItem({ kind: event.target.value, rotation: 0, presetType: 'viewCone90', length: 100, diameterMeters: 8, opacityPercent: 18 })}>
              <option value="plain">英雄头像</option><option value="viewCone">带视野锥</option><option value="circle">带范围圈</option>
            </select>
          </label>}
          {canRotate(selectedItem, map) &&
            <label className="field">旋转角度
              <input type="number" step="15" key={`${selected.id}-${'rotation' in selectedItem ? selectedItem.rotation : 0}`} defaultValue={Math.round(('rotation' in selectedItem ? selectedItem.rotation ?? 0 : 0) * (180 / Math.PI))}
                onBlur={event => event.target.value !== '' && setItem({ rotation: Number(event.target.value) * Math.PI / 180 })} />
            </label>}
          {selected.collection === 'utilityData' && 'customDiameter' in selectedItem && <label className="field">直径（米）
            <input type="number" min="1" max="110" key={`${selected.id}-${selectedItem.customDiameter}-diameter`} defaultValue={selectedItem.customDiameter ?? 10}
              onBlur={event => setItem({ customDiameter: Math.max(1, Math.min(110, Number(event.target.value))) })} />
          </label>}
          {selected.collection === 'utilityData' && 'customWidth' in selectedItem && <div className="dimension-fields">
            <label className="field">宽（米）<input type="number" min="1" max="110" key={`${selected.id}-${selectedItem.customWidth}-width`} defaultValue={selectedItem.customWidth ?? 10}
              onBlur={event => setItem({ customWidth: Math.max(1, Math.min(110, Number(event.target.value))) })} /></label>
            <label className="field">长（米）<input type="number" min="1" max="110" key={`${selected.id}-${selectedItem.customLength}-length`} defaultValue={selectedItem.customLength ?? 10}
              onBlur={event => setItem({ customLength: Math.max(1, Math.min(110, Number(event.target.value))) })} /></label>
          </div>}
          {'aspectRatio' in selectedItem && <>
            <label className="field">图片宽度
              <input type="number" min="30" max="1600" key={`${selectedItem.id}-${selectedItem.scale}`} defaultValue={Math.round(selectedItem.scale)}
                onBlur={event => {
                  const width = event.currentTarget.valueAsNumber;
                  if (Number.isFinite(width) && width !== Math.round(selectedItem.scale)) setItem({ scale: Math.max(30, Math.min(1600, width)) });
                }} />
            </label>
            <label className="field">参考链接
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
            {webLink(selectedItem.link) && <a className="video-link" href={webLink(selectedItem.link)} target="_blank" rel="noreferrer">打开参考链接</a>}
          </>}
          <button className="button subtle danger-text" type="button" onClick={() => erase([selected])}><Trash2 size={15} />删除对象</button>
        </div>}
        <section className="pages-panel" aria-label="战术页面">
          {pagesOpen && <div className="pages-expanded">
            <div className="pages-heading"><strong>页面</strong><span>{pages.length} 页</span></div>
            <div className="page-list">
              {pages.map((row, index) => <button type="button" className={`page-tab ${index === pageIndex ? 'active' : ''}`} key={row.id}
                aria-current={index === pageIndex ? 'step' : undefined}
                onClick={() => changePage(index)} onDoubleClick={() => { changePage(index); setPageRename(true); }}
                onDragStart={event => { event.dataTransfer.setData('application/x-team-playbook-page', String(index)); event.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={event => { if (event.dataTransfer.types.includes('application/x-team-playbook-page')) event.preventDefault(); }}
                onDrop={event => onPageDrop(event, index)} draggable>
                <span className="page-number">{index + 1}</span>
                <strong>{pageName(row)}</strong>
                <small>{pageIsAttack(row) ? '进攻' : '防守'}</small>
              </button>)}
            </div>
            <div className="pages-actions">
              <div className="timeline-controls">
                <IconButton label={playing ? '暂停播放' : '播放战术'} className={playing ? 'active' : ''} onClick={() => {
                  if (!playing && pageIndex === pages.length - 1) changePage(0);
                  setPlaying(value => !value);
                }} disabled={pages.length < 2}>{playing ? <Pause size={16} /> : <Play size={16} />}</IconButton>
                <IconButton label="上一页 (A)" disabled={pageIndex === 0} onClick={() => changePage(pageIndex - 1)}><ChevronLeft size={16} /></IconButton>
                <IconButton label="下一页 (D)" disabled={pageIndex === pages.length - 1} onClick={() => changePage(pageIndex + 1)}><ChevronRight size={16} /></IconButton>
              </div>
              <div className="page-actions">
                <IconButton label="新建空白页" onClick={() => addPage('blank')}><Square size={16} /></IconButton>
                <IconButton label="复制当前页" onClick={() => addPage('copy')}><Copy size={16} /></IconButton>
                <IconButton label="重命名当前页" onClick={() => setPageRename(true)}><Pencil size={15} /></IconButton>
                <IconButton label="删除当前页" disabled={pages.length <= 1} onClick={removePage}><Trash2 size={16} /></IconButton>
              </div>
            </div>
          </div>}
          <div className="pages-pill">
            <IconButton label="接续当前页 (C)" className="page-add" onClick={() => addPage('next')}><Plus size={19} /></IconButton>
            <button className="page-name-toggle" type="button" aria-expanded={pagesOpen}
              onClick={() => setPagesOpen(value => !value)}><span>{pageName(page)}</span><ChevronDown size={17} /></button>
          </div>
        </section>
      </section>

      <aside className={`palette ${panelOpen ? 'palette-open' : ''}`} aria-label="编辑工具和英雄">
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
          <div className="palette-title"><h2>工具</h2>
            <IconButton className="palette-close" label="关闭面板" onClick={() => setPanelOpen(false)}><X size={17} /></IconButton>
          </div>
          <div className="editor-tool-grid">
            <IconButton label="画笔 (Q)" className={isDrawing ? 'active' : ''} aria-pressed={isDrawing}
              onClick={() => activate(isDrawing ? 'select' : lastDrawing.current)}><Pencil size={20} /></IconButton>
            <IconButton label="橡皮擦 (W)" className={tool === 'eraser' ? 'active' : ''} aria-pressed={tool === 'eraser'}
              onClick={() => activate(tool === 'eraser' ? 'select' : 'eraser')}><Eraser size={20} /></IconButton>
            <IconButton label="文本工具 (T 在地图中心放置文本)" className={tool === 'text' ? 'active' : ''} aria-pressed={tool === 'text'}
              onClick={() => activate(tool === 'text' ? 'select' : 'text')}><Type size={20} /></IconButton>
            <IconButton label="插入图片" onClick={() => fileInput.current?.click()}><ImagePlus size={20} /></IconButton>
            <IconButton label="Lineup (G)" className={tool === 'lineup' ? 'active' : ''} aria-pressed={tool === 'lineup'}
              onClick={() => tool === 'lineup' ? activate('select') : beginLineup()}><BookOpen size={19} /></IconButton>
            <IconButton label="视野锥工具" className={toolOptions === 'vision' ? 'active' : ''} aria-pressed={toolOptions === 'vision'}
              onClick={() => { activate('select'); setToolOptions(toolOptions === 'vision' ? undefined : 'vision'); }}><Eye size={20} /></IconButton>
            <IconButton label="形状工具" className={toolOptions === 'shapes' ? 'active' : ''} aria-pressed={toolOptions === 'shapes'}
              onClick={() => { activate('select'); setToolOptions(toolOptions === 'shapes' ? undefined : 'shapes'); }}><Square size={19} /></IconButton>
            <IconButton label="职责图标" className={toolOptions === 'roles' ? 'active' : ''} aria-pressed={toolOptions === 'roles'}
              onClick={() => { activate('select'); setToolOptions(toolOptions === 'roles' ? undefined : 'roles'); }}>
              <img draggable={false} alt="" src={gameAsset('agents/duelist.webp')} />
            </IconButton>
            <IconButton label="放置爆能器"
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
        {isDrawing && <div className="brush-panel" aria-label="画笔样式">
          <div className="drawing-modes">
            {controls.filter(({ tool }) => drawingTools.includes(tool as typeof drawingTools[number])).map(({ tool: id, label, icon: Icon }) =>
              <IconButton key={id} label={label} aria-pressed={tool === id} className={tool === id ? 'active' : ''}
                onClick={() => activate(id)}><Icon size={19} /></IconButton>)}
          </div>
          <div className="brush-controls">
          <div className="swatches">{brushColors.map(color => <button key={color} type="button" title={color} aria-label={`颜色 ${color}`}
            aria-pressed={brush.color === color} className={brush.color === color ? 'selected-swatch' : ''}
            style={{ '--swatch': color } as React.CSSProperties} onClick={() => setBrush(prev => ({ ...prev, color }))} />)}</div>
          <input type="color" value={brush.color} aria-label="自定义颜色" onChange={event => setBrush(prev => ({ ...prev, color: event.target.value }))} />
          <select aria-label="线宽" value={brush.width} onChange={event => setBrush(prev => ({ ...prev, width: Number(event.target.value) }))}>
            <option value="3">细</option><option value="5">中</option><option value="8">粗</option><option value="12">加粗</option>
          </select>
          <button className={`button subtle ${brush.dotted ? 'active' : ''}`} type="button"
            aria-pressed={brush.dotted} onClick={() => setBrush(prev => ({ ...prev, dotted: !prev.dotted }))}>虚线</button>
          {(tool === 'pencil' || tool === 'line') && <>
            <IconButton label="箭头端点" className={brush.arrow ? 'active' : ''} aria-pressed={brush.arrow}
              onClick={() => setBrush(prev => ({ ...prev, arrow: !prev.arrow }))}><ArrowUpRight size={17} /></IconButton>
            <IconButton label="显示预计移动时间" className={brush.timing ? 'active' : ''} aria-pressed={brush.timing}
              onClick={() => setBrush(prev => ({ ...prev, timing: !prev.timing }))}><Timer size={16} /></IconButton>
            {brush.timing && <select aria-label="移动方式" value={brush.speed} onChange={event => setBrush(prev => ({ ...prev, speed: event.target.value }))}>
              <option value="running">跑动</option><option value="walking">静步</option>
              <option value="brimStim">振奋信标</option><option value="neonRun">霓虹疾跑</option>
            </select>}
          </>}
        </div></div>}

          {tool === 'text' && <div className="context-tools">
            <label>标签颜色 <input type="color" value={textColor} onChange={event => setTextColor(event.target.value)} /></label>
            <button type="button" className="button primary"
              {...paletteDrag.bind({ kind: 'text', color: drawingColor(textColor) }, () =>
                placeAtCenter({ kind: 'text', color: drawingColor(textColor) }))}>放置文本</button>
          </div>}
          {toolOptions && <div className="context-tools utility-grid">
            {utilityList.filter(([id]) => toolOptions === 'vision' ? id.startsWith('viewCone')
              : toolOptions === 'shapes' ? id.startsWith('custom') : id in roleLabels).map(([id, label]) => {
              const marker: Placement = { kind: 'utility', type: id, ally: team };
              return <button key={id} type="button" className="utility-button" title={`${label} · 点击放在地图中心，或拖到地图`}
                {...paletteDrag.bind(marker, () => placeAtCenter(marker))}>
                {id === 'customCircle' ? <Circle size={20} /> : id === 'customRectangle' ? <Square size={20} /> :
                  id.startsWith('viewCone') ? <Eye size={20} /> : <img draggable={false} alt="" src={gameAsset(`agents/${id}.webp`)} />}
                <span>{label}</span>
              </button>;
            })}
          </div>}

          <div className="palette-title agent-heading"><h2>英雄</h2>
            <IconButton label="仅显示收藏英雄" className={onlyFavorite ? 'active' : ''} aria-pressed={onlyFavorite}
              onClick={() => { setRole(''); setOnlyFavorite(value => !value); }}>★</IconButton>
          </div>
          <div className="palette-content">
            <div className="palette-filters">
              <div className="search-field"><Search size={16} /><input placeholder="搜索英雄" aria-label="搜索英雄" value={search} onChange={event => setSearch(event.target.value)} /></div>
              <div className="segmented team-switch">
                <button type="button" className={team ? 'active ally' : ''} aria-pressed={team} onClick={() => setTeam(true)}><i />友方</button>
                <button type="button" className={!team ? 'active enemy' : ''} aria-pressed={!team} onClick={() => setTeam(false)}><i />敌方</button>
              </div>
            </div>
            <div className="role-filters">
              <IconButton label="全部英雄" className={!role && !onlyFavorite ? 'active' : ''}
                onClick={() => { setRole(''); setOnlyFavorite(false); }}>全</IconButton>
              {Object.entries(roleLabels).map(([id, label]) => <IconButton key={id} label={label}
                className={role === id ? 'active' : ''} onClick={() => { setRole(role === id ? '' : id); setOnlyFavorite(false); }}>
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
            {!filteredAgents.length && <p className="muted compact">没有匹配的英雄</p>}
            {page.lineUpLinks.length > 0 && <section className="lineup-list"><h3>本页 Lineup</h3>
              {page.lineUpLinks.map(link => <button key={link.id} type="button" onClick={() => openSavedLineup(link)}>
                <Route size={15} />{link.name || '未命名 Lineup'}
              </button>)}
            </section>}
          </div>
        </div>
      </aside>
    </div>


    {context && <>
      <div className="context-backdrop" onPointerDown={() => setContext(undefined)} />
      <div className="popover context-menu" style={{ left: Math.max(4, Math.min(context.screen.dx, window.innerWidth - 188)),
        top: Math.max(4, Math.min(context.screen.dy, window.innerHeight - (rangeToggles.length + (imageLink ? 1 : 0) +
          (hasWall !== undefined ? 1 : 0)) * 35 - 138)) }}>
        <button type="button" onClick={() => editItem(context.item)}><Pencil size={15} />编辑属性</button>
        {contextItem && 'data' in contextItem && rangeToggles.map(({ key, label }) => {
          const checked = contextItem.visualState?.[key] !== false;
          return <button key={key} type="button" aria-pressed={checked} onClick={() => editPage(p => patchItem(p, 'abilityData', contextItem.id, {
            visualState: { ...contextItem.visualState, [key]: !checked },
          }))}>{checked ? <Check size={15} /> : <Square size={15} />}{label}</button>;
        })}
        {imageLink && <a href={imageLink} target="_blank" rel="noreferrer" onClick={() => setContext(undefined)}><ArrowUpRight size={15} />打开参考链接</a>}
        {hasWall !== undefined && <button type="button" onClick={() => {
          editPage(p => patchItem(p, 'abilityData', context.item.id, { wallPath: hasWall ? [] : initialWallPath(map, pageIsAttack(page)) }));
          setContext(undefined);
        }}>{hasWall ? <Eraser size={15} /> : <Route size={15} />}{hasWall ? '移除水墙' : '绘制水墙'}</button>}
        <button type="button" onClick={() => { copySelection([context.item]); pasteSelection(); setContext(undefined); }}><Copy size={15} />复制对象</button>
        <button type="button" className="danger-text" onClick={() => erase([context.item])}><Trash2 size={15} />删除</button>
      </div>
    </>}
    {pageRename && <Modal title="重命名页面" onClose={() => setPageRename(false)}>
      <form onSubmit={event => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get('name')).trim();
        if (name) editPage(p => ({ ...p, name, isAutoNamed: false }));
        setPageRename(false);
      }}><label className="field">页面名称<input name="name" autoFocus defaultValue={pageName(page)} required /></label>
        <div className="modal-actions"><button className="button primary" type="submit">保存</button></div>
      </form>
    </Modal>}
    {lineupDialog && <Modal title={lineupPlacement ? '新建 Lineup' : '编辑 Lineup'} onClose={closeLineup}>
      <form onSubmit={saveLineup} onPaste={event => {
        const file = clipboardImage(event.clipboardData);
        if (!file) return;
        event.preventDefault();
        void addLineupPictures([file]);
      }}>
        <label className="field">名称<input name="name" autoFocus defaultValue={lineupDialog.name} placeholder="例如 A 主道到包点烟" /></label>
        <label className="field">备注<textarea name="notes" rows={3} defaultValue={lineupDialog.notes} /></label>
        <label className="field">视频链接<input name="video" type="url" defaultValue={lineupDialog.youtubeLink} /></label>
        {videoUrl && <a className="video-link" href={videoUrl} target="_blank" rel="noreferrer">查看参考视频</a>}
        {!!lineupDialog.images.length && <div className="lineup-pictures">{lineupDialog.images.map(image => {
          const url = media[image.id + image.fileExtension];
          return <div key={image.id} className="lineup-picture">
            {url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Lineup 参考图" /></a> : <span>图片缺失</span>}
            <IconButton label="移除参考图" onClick={() => removeLineupPicture(image)}><X size={14} /></IconButton>
          </div>;
        })}</div>}
        {!lineupPlacement && <div className="modal-actions">
          <button className="button subtle" type="button" onClick={() => reuseLineupEnd(lineupDialog, 'origin')}>从此起点新增</button>
          <button className="button subtle" type="button" onClick={() => reuseLineupEnd(lineupDialog, 'landing')}>向此落点新增</button>
        </div>}
        <div className="modal-actions">
          <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" hidden multiple ref={lineupFiles}
            onChange={event => {
              void addLineupPictures(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = '';
            }} />
          <button className="button subtle" type="button" onClick={() => lineupFiles.current?.click()}><ImagePlus size={16} />添加参考图</button>
          {!lineupPlacement && <>
            <button className="button subtle" type="button" onClick={() => editLineupPositions(lineupDialog)}><MapPin size={16} />调整位置</button>
            <IconButton label="删除 Lineup" className="danger-text" onClick={() => {
              editPage(p => {
                const links = p.lineUpLinks.filter(row => row.id !== lineupDialog.id);
                return { ...p, lineUpLinks: links, lineUpOrigins: p.lineUpOrigins.filter(row => links.some(link => link.originId === row.id)),
                  lineUpLandings: p.lineUpLandings.filter(row => links.some(link => link.landingId === row.id)) };
              });
              closeLineup();
            }}><Trash2 size={17} /></IconButton>
          </>}
          <button className="button primary" type="submit" disabled={!!lineupForm?.pending}>保存 Lineup</button>
        </div>
      </form>
    </Modal>}
  </main>;
}
