import { useEffect, useMemo, useReducer, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Circle, Copy, Crosshair, Eraser, Hand, ImagePlus, Timer,
  Layers, MapPin, Minus, MousePointer2, Pencil, Play, Plus, Redo2, Search, Shield, Square, Swords,
  Trash2, Type, Undo2, X, Pause, ChevronLeft, ChevronRight, Route,
} from 'lucide-react';
import Board, { drawingTools, startPlacementDrag, type Brush, type Placement, type Tool } from './Board.tsx';
import { type MapLayers } from './BoardArt.tsx';
import { abilityFor, add, agentById, agents, gameAsset, mapById, mapThumb, point, project, subtract, type Point } from './catalog.ts';
import { anchorFor, canonicalMarkers, drawingColor, flipPage, makeAbility, makeAgent, makeUtility, pageIsAttack } from './geometry.ts';
import { downloadIca, imageExtensions } from './archive.ts';
import { append, drawingCollections, moveItem, newId, newPage, patchItem, removeItems, type CanvasItem,
  type CanvasSelection, type Collection, type LineupLink, type Page, type Strategy,
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
  { tool: 'arrow', label: '箭头', key: '', icon: ArrowUpRight },
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
const keyOf = (item: CanvasSelection) => `${item.collection}:${item.id}`;
const textInput = (target: EventTarget | null) =>
  target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable],dialog');

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
  const pageIndex = Math.min(pageNumber, pages.length - 1);
  const page = pages[pageIndex];
  const map = mapById[strategy.document.mapData];
  const version = Number(strategy.document.versionNumber);
  const [tool, setTool] = useState<Tool>('select');
  const [tab, setTab] = useState<'agents' | 'utility'>('agents');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [team, setTeam] = useState(true);
  const [hideAgents, setHideAgents] = useState(false);
  const hovered = useRef<{ item: CanvasSelection; screen: Point } | undefined>(undefined);
  const lastDrawing = useRef<Tool>('pencil');
  const [agentId, setAgentId] = useState<string>();
  const [chosenAbility, setChosenAbility] = useState<{ type: string; index: number }>();
  const [placement, setPlacement] = useState<Placement | null>(null);
  const [brush, setBrush] = useState<Brush>({ color: brushColors[0], width: 5, dotted: false, arrow: false, timing: false });
  const [layers, setLayers] = useState<MapLayers>({ callouts: true, barriers: true, orbs: false, grid: true });
  const [layersOpen, setLayersOpen] = useState(false);
  const [selection, setSelection] = useState<CanvasSelection[]>([]);
  const [context, setContext] = useState<{ item: CanvasSelection; screen: Point }>();
  const [textDialog, setTextDialog] = useState<{ id?: string; position?: Point; text: string }>();
  const [lineupOrigin, setLineupOrigin] = useState<Point | null>(null);
  const [lineupDialog, setLineupDialog] = useState<LineupLink>();
  const [lineupPlacement, setLineupPlacement] = useState<{ origin: Point; landing: Point }>();
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
  const media = useMediaUrls(strategy.media);
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
    if (next !== 'lineup') setLineupOrigin(null);
    if (next !== 'select') setSelection([]);
    setContext(undefined);
    setInspect(false);
  }

  function changePage(index: number) {
    setPageNumber(Math.max(0, Math.min(pages.length - 1, index)));
    setSelection([]);
    setContext(undefined);
    setInspect(false);
    setLineupOrigin(null);
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
      name: mode === 'copy' ? `${page.name} 副本` : autoNamed.name, isAutoNamed: mode === 'next',
    };
    commit(previous => {
      const nextPages = [...previous.document.pages];
      nextPages.splice(position, 0, next);
      return { ...previous, document: { ...previous.document, pages: nextPages } };
    });
    setPageNumber(position);
    setSelection([]);
    setLineupOrigin(null);
  }

  function movePage(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) return;
    const list = [...pages];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    commit(previous => ({ ...previous, document: { ...previous.document, pages: list } }));
    setPageNumber(list.findIndex(item => item.id === page.id));
  }

  function removePage() {
    if (pages.length <= 1 || !window.confirm(`删除「${page.name}」？`)) return;
    commit(previous => ({ ...previous, document: { ...previous.document, pages: previous.document.pages.filter(item => item.id !== page.id) } }));
    setPageNumber(Math.max(0, pageIndex - 1));
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

  function selectAgent(id: string, abilityPicker = false) {
    setAgentId(id);
    if (abilityPicker || tool === 'lineup') {
      const agent = agentById[id];
      if (tool === 'lineup' && agent.abilities.length) setChosenAbility({ type: id, index: agent.abilities[0].index });
      return;
    }
    selectPlacement({ kind: 'agent', type: id, ally: team });
  }

  function selectAbility(type: string, index: number) {
    setChosenAbility({ type, index });
    if (tool === 'lineup') { setPanelOpen(false); return; }
    selectPlacement({ kind: 'ability', type, index, ally: team });
  }

  function place(marker: Placement, world: Point) {
    const at = project(world, canonicalMarkers(page, version));
    if (marker.kind === 'agent' && agentById[marker.type]) {
      editPage(p => append(p, 'agentData', makeAgent(marker.type, at, marker.ally)));
    } else if (marker.kind === 'ability' && abilityFor(marker.type, marker.index)) {
      editPage(p => append(p, 'abilityData', makeAbility(marker.type, marker.index, at, marker.ally, map)));
    } else if (marker.kind === 'utility' && utilityList.some(([id]) => id === marker.type)) {
      editPage(p => append(p, 'utilityData', makeUtility(marker.type, at, marker.ally, map, drawingColor(brush.color), version)));
    }
  }

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
    setInspect(false);
  }

  function copySelection() {
    copied.current = selection.flatMap(sel => {
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
      if (textInput(event.target) || textDialog || lineupDialog || pageRename) return;
      const key = event.key.toLowerCase();
      const command = event.metaKey || event.ctrlKey;
      if (command) {
        if (key === 'z') { event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' }); }
        if (key === 'y') { event.preventDefault(); dispatch({ type: 'redo' }); }
        if (key === 'c' && selection.length) { event.preventDefault(); copySelection(); }
        if (key === 'v' && copied.current.length) { event.preventDefault(); pasteSelection(); }
        if (key === 's') { event.preventDefault(); save(strategy); }
        if (key === 'a') {
          event.preventDefault();
          activate('select');
          setSelection(drawingCollections.flatMap(collection =>
            page[collection].filter(item => !('isDeleted' in item && item.isDeleted)).map(item => ({ collection, id: item.id }))));
        }
        return;
      }
      const control = controls.find(row => row.key.toLowerCase() === key);
      if (control) {
        const target = key === 'q' ? lastDrawing.current : control.tool;
        activate(tool === target ? 'select' : target);
      }
      if (key === 'escape') { activate('select'); setSelection([]); }
      if (key === 'r') { setHideAgents(value => !value); }
      if (key === 'c') addPage('next');
      if (key === 'f') setSide(pageIsAttack(page) ? 'false' : 'true', !event.shiftKey);
      if (key === 'e' && hovered.current) {
        setSelection([hovered.current.item]);
        setContext(hovered.current);
      }
      if (key === 'x') {
        const target = hovered.current?.item ?? selection[0];
        const marker = target && page[target.collection].find(row => row.id === target.id);
        if (target && marker && ('rotation' in marker || target.collection === 'abilityData')) {
          const rotation = ('rotation' in marker ? marker.rotation ?? 0 : 0) + (event.shiftKey ? -1 : 1) * Math.PI / 12;
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

  async function addImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const image = await fileToImage(file);
      commit(previous => updatePage({ ...previous, media: { ...previous.media, [image.fileName]: image.bytes } }, page.id,
        p => append(p, 'imageData', {
          id: image.id, position: point(775, 425), aspectRatio: image.aspect, scale: 200,
          fileExtension: image.extension, sizeVersion: 1, isDeleted: false,
        })));
      activate('select');
    } catch (error) { notify(error instanceof Error ? error.message : '无法打开图片'); }
  }

  function selectLineupPoint(world: Point) {
    if (!chosenAbility) { notify('先在英雄面板选一个技能'); setPanelOpen(true); return; }
    const at = project(world, canonicalMarkers(page, version));
    if (!lineupOrigin) { setLineupOrigin(at); return; }
    setLineupPlacement({ origin: lineupOrigin, landing: at });
    setLineupDialog({ id: newId(), originId: newId(), landingId: newId(), name: '', notes: '', youtubeLink: '', images: [] });
  }

  function saveLineup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lineupDialog) return;
    const data = new FormData(event.currentTarget);
    const link = { ...lineupDialog, name: String(data.get('name')).trim(), notes: String(data.get('notes')),
      youtubeLink: String(data.get('video')).trim() };
    if (lineupPlacement && chosenAbility) {
      const agent = makeAgent(chosenAbility.type, lineupPlacement.origin, team);
      const ability = makeAbility(chosenAbility.type, chosenAbility.index, lineupPlacement.landing, team, map);
      editPage(p => ({ ...p, lineUpOrigins: [...p.lineUpOrigins, { id: link.originId, agent }],
        lineUpLandings: [...p.lineUpLandings, { id: link.landingId, ability }], lineUpLinks: [...p.lineUpLinks, link] }));
    } else {
      editPage(p => ({ ...p, lineUpLinks: p.lineUpLinks.map(row => row.id === link.id ? link : row) }));
    }
    closeLineup();
  }

  function closeLineup() { setLineupDialog(undefined); setLineupPlacement(undefined); setLineupOrigin(null); }

  async function addLineupPictures(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!lineupDialog || lineupPlacement) return;
    try {
      const pictures = await Promise.all(files.map(fileToImage));
      const link = { ...lineupDialog, images: [
        ...lineupDialog.images, ...pictures.map(img => ({ id: img.id, fileExtension: img.extension })),
      ] };
      const extra = Object.fromEntries(pictures.map(img => [img.fileName, img.bytes]));
      commit(previous => updatePage({ ...previous, media: { ...previous.media, ...extra } }, page.id,
        p => ({ ...p, lineUpLinks: p.lineUpLinks.map(row => row.id === link.id ? link : row) })));
      setLineupDialog(link);
    } catch (error) { notify(error instanceof Error ? error.message : '无法添加参考图'); }
  }

  function editItem(item: CanvasSelection) {
    if (item.collection === 'textData') {
      const text = page.textData.find(row => row.id === item.id);
      if (text) setTextDialog({ id: text.id, text: text.text });
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
    editPage(p => patchItem(p, selected.collection, selected.id, update));
  }

  function setSide(side: Page['isAttack'], all = false) {
    if (!all && side === page.isAttack) return;
    commit(previous => ({ ...previous, document: { ...previous.document, pages: previous.document.pages.map(row =>
      all || row.id === page.id ? flipPage(row, side, map, version) : row,
    ) } }));
    setLineupOrigin(null);
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
      : utilityList.find(([id]) => id === placement?.type)?.[1];
  const status = tool === 'lineup' ? (!chosenAbility ? '选一个技能以开始 Lineup' : lineupOrigin ? '点击地图标记技能落点' : '点击地图标记投掷起点')
    : tool === 'place' ? `点击地图放置 ${placementLabel ?? ''}` : '';
  const videoUrl = (() => {
    try {
      const url = new URL(lineupDialog?.youtubeLink ?? '');
      return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
    } catch { return undefined; }
  })();

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
      <div className="header-actions">
        <div className="history-buttons">
          <IconButton label="撤销 (Ctrl+Z)" disabled={!history.past.length} onClick={() => dispatch({ type: 'undo' })}><Undo2 size={17} /></IconButton>
          <IconButton label="重做 (Ctrl+Shift+Z)" disabled={!history.future.length} onClick={() => dispatch({ type: 'redo' })}><Redo2 size={17} /></IconButton>
        </div>
        <button className="button primary" type="button" onClick={exportStrategy}><ArrowDownToLine size={16} />导出 .ica</button>
      </div>
    </header>

    <div className="editor-body">
      <aside className="tools" aria-label="画布工具">
        {controls.map(({ tool: id, icon: Icon, label, key }) => <IconButton key={id} label={key ? `${label} (${key})` : label}
          className={tool === id ? 'active' : ''} aria-pressed={tool === id} onClick={() => activate(id)}><Icon size={19} /></IconButton>)}
        <div className="separator" />
        <IconButton label="插入图片" onClick={() => fileInput.current?.click()}><ImagePlus size={19} /></IconButton>
        <input type="file" ref={fileInput} accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" hidden onChange={addImage} />
      </aside>

      <section className="canvas-area">
        <Board map={map} page={page} version={version} tool={tool} brush={brush} placement={placement}
          animate={animate} layers={layers} selection={selection} media={media} lineupOrigin={lineupOrigin}
          hideAgents={hideAgents} onHover={(item, screen) => { hovered.current = item && { item, screen }; }}
          onSelect={items => { setSelection(items); setContext(undefined); if (items.length !== 1) setInspect(false); }}
          onContext={(item, screen) => { setSelection([item]); setContext({ item, screen }); }}
          onEdit={editItem} onDraw={drawing => editPage(p => append(p, 'drawingData', drawing))}
          onMove={moveSelections} onErase={erase} onPlace={place}
          onText={world => setTextDialog({ position: project(world, canonicalMarkers(page, version)), text: '' })}
          onLineupPoint={selectLineupPoint} onLineupOpen={link => { setLineupPlacement(undefined); setLineupDialog(link); }} />
        <div className="map-controls">
          <span className="map-name"><MapPin size={15} />{map.name}</span>
          <div className="segmented side-switch">
            <button className={pageIsAttack(page) ? 'active attack' : ''} type="button"
              onClick={() => setSide('true')}
              aria-pressed={pageIsAttack(page)}><Swords size={14} />进攻</button>
            <button className={!pageIsAttack(page) ? 'active defense' : ''} type="button"
              onClick={() => setSide('false')}
              aria-pressed={!pageIsAttack(page)}><Shield size={14} />防守</button>
          </div>
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
        <button className="button mobile-palette" type="button" onClick={() => setPanelOpen(value => !value)}>英雄与道具</button>
        {status && <div className="canvas-hint"><Crosshair size={15} />{status}<IconButton label="取消工具" onClick={() => activate('select')}><X size={14} /></IconButton></div>}

        {(['pencil', 'line', 'arrow', 'rectangle', 'ellipse'].includes(tool)) && <div className="brush-panel" aria-label="画笔样式">
          <div className="swatches">{brushColors.map(color => <button key={color} type="button" title={color} aria-label={`颜色 ${color}`}
            aria-pressed={brush.color === color} className={brush.color === color ? 'selected-swatch' : ''}
            style={{ '--swatch': color } as React.CSSProperties} onClick={() => setBrush(prev => ({ ...prev, color }))} />)}</div>
          <input type="color" value={brush.color} aria-label="自定义颜色" onChange={event => setBrush(prev => ({ ...prev, color: event.target.value }))} />
          <select aria-label="线宽" value={brush.width} onChange={event => setBrush(prev => ({ ...prev, width: Number(event.target.value) }))}>
            <option value="3">细</option><option value="5">中</option><option value="8">粗</option><option value="12">加粗</option>
          </select>
          <button className={`button subtle ${brush.dotted ? 'active' : ''}`} type="button"
            aria-pressed={brush.dotted} onClick={() => setBrush(prev => ({ ...prev, dotted: !prev.dotted }))}>虚线</button>
          <IconButton label="箭头端点" className={brush.arrow ? 'active' : ''} aria-pressed={brush.arrow}
            onClick={() => setBrush(prev => ({ ...prev, arrow: !prev.arrow }))}><ArrowUpRight size={17} /></IconButton>
          {!['rectangle', 'ellipse'].includes(tool) && <IconButton label="显示预计跑动时间"
            className={brush.timing ? 'active' : ''} aria-pressed={brush.timing}
            onClick={() => setBrush(prev => ({ ...prev, timing: !prev.timing }))}><Timer size={16} /></IconButton>}
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
          {(selected.collection === 'abilityData' || selected.collection === 'utilityData' || ('kind' in selectedItem && selectedItem.kind === 'viewCone')) &&
            <label className="field">旋转角度
              <input type="number" step="15" key={`${selected.id}-rotation`} defaultValue={Math.round(('rotation' in selectedItem ? selectedItem.rotation ?? 0 : 0) * (180 / Math.PI))}
                onBlur={event => event.target.value !== '' && setItem({ rotation: Number(event.target.value) * Math.PI / 180 })} />
            </label>}
          {selected.collection === 'utilityData' && 'customDiameter' in selectedItem && <label className="field">直径（米）
            <input type="number" min="1" max="110" key={`${selected.id}-diameter`} defaultValue={selectedItem.customDiameter ?? 10}
              onBlur={event => setItem({ customDiameter: Math.max(1, Math.min(110, Number(event.target.value))) })} />
          </label>}
          {selected.collection === 'utilityData' && 'customWidth' in selectedItem && <div className="dimension-fields">
            <label className="field">宽（米）<input type="number" min="1" max="110" key={`${selected.id}-width`} defaultValue={selectedItem.customWidth ?? 10}
              onBlur={event => setItem({ customWidth: Math.max(1, Math.min(110, Number(event.target.value))) })} /></label>
            <label className="field">长（米）<input type="number" min="1" max="110" key={`${selected.id}-length`} defaultValue={selectedItem.customLength ?? 10}
              onBlur={event => setItem({ customLength: Math.max(1, Math.min(110, Number(event.target.value))) })} /></label>
          </div>}
          {selected.collection === 'imageData' && 'scale' in selectedItem && <label className="field">图片宽度
            <input type="number" min="30" max="1200" defaultValue={selectedItem.scale} onBlur={event => setItem({ scale: Math.max(30, Math.min(1200, Number(event.target.value))) })} />
          </label>}
          <button className="button subtle danger-text" type="button" onClick={() => erase([selected])}><Trash2 size={15} />删除对象</button>
        </div>}
      </section>

      <aside className={`palette ${panelOpen ? 'palette-open' : ''}`} aria-label="英雄、技能与道具">
        <div className="palette-tabs">
          <button type="button" className={tab === 'agents' ? 'active' : ''} onClick={() => setTab('agents')}>英雄与技能</button>
          <button type="button" className={tab === 'utility' ? 'active' : ''} onClick={() => setTab('utility')}>道具</button>
          <IconButton className="palette-close" label="关闭英雄面板" onClick={() => setPanelOpen(false)}><X size={17} /></IconButton>
        </div>
        <div className="palette-content">
          <div className="segmented team-switch">
            <button type="button" className={team ? 'active ally' : ''} aria-pressed={team} onClick={() => {
              setTeam(true); if (placement) setPlacement({ ...placement, ally: true });
            }}><i />友方</button>
            <button type="button" className={!team ? 'active enemy' : ''} aria-pressed={!team} onClick={() => {
              setTeam(false); if (placement) setPlacement({ ...placement, ally: false });
            }}><i />敌方</button>
          </div>
          {tab === 'agents' ? <>
            <div className="search-field"><Search size={16} /><input placeholder="搜索英雄" aria-label="搜索英雄" value={search} onChange={event => setSearch(event.target.value)} /></div>
            <div className="role-filters">
              <IconButton label="全部英雄" className={!role && !onlyFavorite ? 'active' : ''} onClick={() => { setRole(''); setOnlyFavorite(false); }}>全</IconButton>
              {Object.entries(roleLabels).map(([id, label]) => <IconButton key={id} label={label}
                className={role === id && !onlyFavorite ? 'active' : ''} onClick={() => { setRole(id); setOnlyFavorite(false); }}>
                <img alt="" src={gameAsset(`agents/${id}.webp`)} />
              </IconButton>)}
              <IconButton label="收藏英雄" className={onlyFavorite ? 'active' : ''} onClick={() => { setRole(''); setOnlyFavorite(value => !value); }}>★</IconButton>
            </div>
            <div className="agent-grid">
              {filteredAgents.map(agent => <button key={agent.id} type="button" className={`agent-button ${agentId === agent.id ? 'active' : ''}`}
                draggable title={`${agent.name} · 右键选技能`} aria-label={agent.name}
                onClick={() => selectAgent(agent.id)} onContextMenu={event => { event.preventDefault(); selectAgent(agent.id, true); }}
                onDragStart={event => startPlacementDrag(event, { kind: 'agent', type: agent.id, ally: team })}>
                <img draggable={false} alt="" src={gameAsset(agent.icon)} />
                {favorite.includes(agent.id) && <i className="favorite-dot" />}
              </button>)}
            </div>
            {!filteredAgents.length && <p className="muted compact">没有匹配的英雄</p>}
            {activeAgent && <section className="abilities">
              <div className="ability-heading"><strong>{activeAgent.name}</strong>
                <IconButton label={favorite.includes(activeAgent.id) ? '取消收藏' : '收藏英雄'}
                  className={favorite.includes(activeAgent.id) ? 'active' : ''} onClick={() => toggleFavorite(activeAgent.id)}>★</IconButton>
              </div>
              <div className="ability-grid">
                {activeAgent.abilities.map(ability => <button key={ability.index} type="button" draggable
                  title={ability.name} className={chosenAbility?.type === activeAgent.id && chosenAbility.index === ability.index ? 'active' : ''}
                  aria-label={ability.name} onClick={() => selectAbility(activeAgent.id, ability.index)}
                  onDragStart={event => startPlacementDrag(event, { kind: 'ability', type: activeAgent.id, index: ability.index, ally: team })}>
                  <img draggable={false} alt="" src={gameAsset(ability.icon)} />
                </button>)}
              </div>
            </section>}
          </> : <div className="utility-grid">
            {utilityList.map(([id, label]) => <button key={id} type="button" className="utility-button" draggable
              onClick={() => selectPlacement({ kind: 'utility', type: id, ally: team })}
              onDragStart={event => startPlacementDrag(event, { kind: 'utility', type: id, ally: team })}>
              {id === 'spike' ? <img alt="" src={gameAsset('spike.svg')} /> :
                id === 'customCircle' ? <Circle size={20} /> : id === 'customRectangle' ? <Square size={20} /> :
                id.startsWith('viewCone') ? <Crosshair size={20} /> : <img alt="" src={gameAsset(`agents/${id}.webp`)} />}
              <span>{label}</span>
            </button>)}
          </div>}
          {page.lineUpLinks.length > 0 && <section className="lineup-list"><h3>本页 Lineup</h3>
            {page.lineUpLinks.map(link => <button key={link.id} type="button" onClick={() => { setLineupPlacement(undefined); setLineupDialog(link); }}>
              <Route size={15} />{link.name || '未命名 Lineup'}
            </button>)}
          </section>}
        </div>
      </aside>
    </div>

    <footer className="page-strip">
      <div className="timeline-controls">
        <IconButton label={playing ? '暂停播放' : '播放战术'} className={playing ? 'active' : ''} onClick={() => {
          if (!playing && pageIndex === pages.length - 1) changePage(0);
          setPlaying(value => !value);
        }} disabled={pages.length < 2}>{playing ? <Pause size={17} /> : <Play size={17} />}</IconButton>
        <IconButton label="上一页" disabled={pageIndex === 0} onClick={() => changePage(pageIndex - 1)}><ChevronLeft size={16} /></IconButton>
        <IconButton label="下一页" disabled={pageIndex === pages.length - 1} onClick={() => changePage(pageIndex + 1)}><ChevronRight size={16} /></IconButton>
      </div>
      <div className="page-list" aria-label="战术页面">
        {pages.map((p, index) => <button type="button" className={`page-tab ${index === pageIndex ? 'active' : ''}`} key={p.id}
          aria-current={index === pageIndex ? 'step' : undefined}
          onClick={() => changePage(index)} onDoubleClick={() => { changePage(index); setPageRename(true); }}
          onDragStart={event => { event.dataTransfer.setData('application/x-team-playbook-page', String(index)); event.dataTransfer.effectAllowed = 'move'; }}
          onDragOver={event => { if (event.dataTransfer.types.includes('application/x-team-playbook-page')) event.preventDefault(); }}
          onDrop={event => onPageDrop(event, index)} draggable>
          <img src={mapThumb(map.id)} alt="" draggable={false} />
          <span><strong>{p.name}</strong><small>{pageIsAttack(p) ? '进攻' : '防守'}</small></span>
        </button>)}
        <IconButton label="接续当前页 (C)" className="page-add" onClick={() => addPage('next')}><Plus size={20} /></IconButton>
      </div>
      <div className="page-actions">
        <IconButton label="新建空白页" className="blank-page" onClick={() => addPage('blank')}><Plus size={17} /></IconButton>
        <IconButton label="复制当前页" onClick={() => addPage('copy')}><Copy size={17} /></IconButton>
        <IconButton label="重命名当前页" onClick={() => setPageRename(true)}><Pencil size={16} /></IconButton>
        <IconButton label="删除当前页" disabled={pages.length <= 1} onClick={removePage}><Trash2 size={17} /></IconButton>
      </div>
    </footer>

    {context && <>
      <div className="context-backdrop" onPointerDown={() => setContext(undefined)} />
      <div className="popover context-menu" style={{ left: Math.max(4, Math.min(context.screen.dx, window.innerWidth - 188)), top: Math.max(4, Math.min(context.screen.dy, window.innerHeight - 154)) }}>
        <button type="button" onClick={() => editItem(context.item)}><Pencil size={15} />编辑属性</button>
        <button type="button" onClick={() => { copySelection(); pasteSelection(); setContext(undefined); }}><Copy size={15} />复制对象</button>
        <button type="button" className="danger-text" onClick={() => erase([context.item])}><Trash2 size={15} />删除</button>
      </div>
    </>}
    {textDialog && <Modal title={textDialog.id ? '编辑标注' : '新建标注'} onClose={() => setTextDialog(undefined)}>
      <form onSubmit={event => {
        event.preventDefault();
        const text = String(new FormData(event.currentTarget).get('text')).trim();
        if (text) {
          const dialog = textDialog;
          if (dialog.id) editPage(p => patchItem(p, 'textData', dialog.id!, { text }));
          else if (dialog.position) editPage(p => append(p, 'textData', { id: newId(), position: dialog.position!, text,
            size: 220, fontSize: 24, sizeVersion: 1, isDeleted: false, tagColorValue: drawingColor(brush.color) }));
        }
        setTextDialog(undefined);
        activate('select');
      }}><label className="field">标注内容<textarea name="text" rows={4} autoFocus defaultValue={textDialog.text} required /></label>
        <div className="modal-actions"><button className="button primary" type="submit">保存标注</button></div>
      </form>
    </Modal>}
    {pageRename && <Modal title="重命名页面" onClose={() => setPageRename(false)}>
      <form onSubmit={event => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get('name')).trim();
        if (name) editPage(p => ({ ...p, name, isAutoNamed: false }));
        setPageRename(false);
      }}><label className="field">页面名称<input name="name" autoFocus defaultValue={page.name} required /></label>
        <div className="modal-actions"><button className="button primary" type="submit">保存</button></div>
      </form>
    </Modal>}
    {lineupDialog && <Modal title={lineupPlacement ? '新建 Lineup' : '编辑 Lineup'} onClose={closeLineup}>
      <form onSubmit={saveLineup}>
        <label className="field">名称<input name="name" autoFocus defaultValue={lineupDialog.name} placeholder="例如 A 主道到包点烟" required /></label>
        <label className="field">备注<textarea name="notes" rows={3} defaultValue={lineupDialog.notes} /></label>
        <label className="field">视频链接<input name="video" type="url" defaultValue={lineupDialog.youtubeLink} /></label>
        {videoUrl && <a className="video-link" href={videoUrl} target="_blank" rel="noreferrer">查看参考视频</a>}
        {!!lineupDialog.images.length && <div className="lineup-pictures">{lineupDialog.images.map(image => {
          const url = media[image.id + image.fileExtension];
          return url && <a key={image.id} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Lineup 参考图" /></a>;
        })}</div>}
        <div className="modal-actions">
          {!lineupPlacement && <>
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" hidden multiple ref={lineupFiles} onChange={addLineupPictures} />
            <button className="button subtle" type="button" onClick={() => lineupFiles.current?.click()}><ImagePlus size={16} />添加参考图</button>
            <IconButton label="删除 Lineup" className="danger-text" onClick={() => {
              editPage(p => {
                const links = p.lineUpLinks.filter(row => row.id !== lineupDialog.id);
                return { ...p, lineUpLinks: links, lineUpOrigins: p.lineUpOrigins.filter(row => links.some(link => link.originId === row.id)),
                  lineUpLandings: p.lineUpLandings.filter(row => links.some(link => link.landingId === row.id)) };
              });
              closeLineup();
            }}><Trash2 size={17} /></IconButton>
          </>}
          <button className="button primary" type="submit">保存 Lineup</button>
        </div>
      </form>
    </Modal>}
  </main>;
}
