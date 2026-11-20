import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpRight, BookOpen, ChevronDown, CircleHelp, CloudDownload, FolderOpen,
  LayoutGrid, List, Map as MapIcon, MapPin, MoreHorizontal, Plus, RefreshCw, Search, Trash2, Upload, Users, X,
} from 'lucide-react';
import Editor from './Editor.tsx';
import { downloadIca, importIca } from './archive.ts';
import { mapById, maps, mapThumb } from './catalog.ts';
import { deleteDraft, loadDrafts, saveDraft } from './storage.ts';
import { newId, newStrategy, type Strategy } from './strategy.ts';
import { IconButton, Modal } from './ui.tsx';

type Entry = { path: string[]; name: string; map: string; revision: string };
type MapFilter = string;
type Saving = 'saved' | 'saving' | 'failed';
const catalogUrl = `${import.meta.env.BASE_URL}strategies/`;
const mapName = (id: string) => mapById[id]?.name ?? id;
const date = (timestamp: number) => new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(timestamp);
const publishedPath = (entry: Entry) => entry.path.join('/');
const entryKey = (entry: Entry) => `${publishedPath(entry)}@${entry.revision}`;

export default function App() {
  const [drafts, setDrafts] = useState<Strategy[]>([]);
  const [saving, setSaving] = useState<Record<string, Saving>>({});
  const [draftLoadError, setDraftLoadError] = useState(false);
  const [active, setActive] = useState<Strategy>();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [opening, setOpening] = useState('');
  const [tab, setTab] = useState<'team' | 'drafts'>('team');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MapFilter>('');
  const [folder, setFolder] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState<'recent' | 'name' | 'map'>('recent');
  const [create, setCreate] = useState(false);
  const [createMap, setCreateMap] = useState('');
  const [showOldMaps, setShowOldMaps] = useState(false);
  const [help, setHelp] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastWrites = useRef(new Map<string, number>());

  const notify = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 3600);
  }, []);

  useEffect(() => {
    let live = true;
    loadDrafts().then(rows => {
      if (!live) return;
      setDrafts(current => [...rows.filter(row => !current.some(local => local.id === row.id)), ...current]);
    }).catch(() => { if (live) setDraftLoadError(true); });
    return () => { live = false; clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogError('');
    fetch(`${catalogUrl}index.json`, { cache: 'no-cache', signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('无法读取仓库战术列表');
        return response.json() as Promise<Entry[]>;
      }).then(setEntries).catch(error => {
        if (error.name !== 'AbortError') setCatalogError('无法读取团队战术库，可重试加载。');
      });
    return () => controller.abort();
  }, [refresh]);

  const store = useCallback((strategy: Strategy) => {
    setDrafts(rows => rows.some(row => row.id === strategy.id)
      ? rows.map(row => row.id === strategy.id ? strategy : row) : [...rows, strategy]);
    setSaving(current => ({ ...current, [strategy.id]: 'saving' }));
    const attempt = (lastWrites.current.get(strategy.id) ?? 0) + 1;
    lastWrites.current.set(strategy.id, attempt);
    saveDraft(strategy).then(() => {
      if (lastWrites.current.get(strategy.id) !== attempt) return;
      setSaving(current => ({ ...current, [strategy.id]: 'saved' }));
    }).catch(() => {
      if (lastWrites.current.get(strategy.id) !== attempt) return;
      setSaving(current => ({ ...current, [strategy.id]: 'failed' }));
      notify('浏览器保存失败，请导出 .ica 保留当前战术');
    });
  }, [notify]);

  function startDraft(strategy: Strategy) {
    store(strategy);
    setActive(strategy);
  }

  async function openTeam(entry: Entry) {
    if (opening) return;
    setOpening(entryKey(entry));
    try {
      if (!mapById[entry.map]) throw new Error(`暂不支持地图 ${entry.map}`);
      const existing = drafts.find(row => row.published?.path === publishedPath(entry) &&
        row.published.revision === entry.revision && row.published.importedAt === row.updated);
      if (existing) { setActive(existing); return; }
      const path = ['files', entry.revision, ...entry.path].map(encodeURIComponent).join('/');
      const response = await fetch(catalogUrl + path, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error('战术文件读取失败，刷新团队列表后重试');
      const strategy = importIca(new Uint8Array(await response.arrayBuffer()), entry.path.at(-1)!);
      if (!mapById[strategy.document.mapData]) throw new Error(`暂不支持地图 ${strategy.document.mapData}`);
      startDraft({ ...strategy, published: { path: publishedPath(entry), revision: entry.revision, importedAt: strategy.updated } });
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法打开团队战术');
    } finally {
      setOpening('');
    }
  }

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const strategy = importIca(new Uint8Array(await file.arrayBuffer()), file.name);
      if (!mapById[strategy.document.mapData]) throw new Error(`暂不支持地图 ${strategy.document.mapData}`);
      setTab('drafts');
      startDraft(strategy);
    } catch (error) {
      notify(error instanceof Error ? `无法导入 .ica，${error.message}` : '无法导入 .ica');
    }
  }

  function createStrategy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createMap) return;
    const name = String(new FormData(event.currentTarget).get('name')).trim() || `${mapName(createMap)} 战术`;
    setCreate(false);
    setTab('drafts');
    startDraft(newStrategy(createMap, name));
  }

  async function removeDraft(strategy: Strategy) {
    setSelectedMenu('');
    if (!window.confirm(`删除本地战术「${strategy.name}」？`)) return;
    try {
      await deleteDraft(strategy.id);
      setDrafts(rows => rows.filter(row => row.id !== strategy.id));
    } catch { notify('删除失败，请稍后重试'); }
  }

  function downloadDraft(strategy: Strategy) {
    setSelectedMenu('');
    try { downloadIca(strategy); }
    catch (error) { notify(error instanceof Error ? error.message : '导出失败'); }
  }

  function changeTab(value: typeof tab) {
    setTab(value); setFolder(''); setFilter(''); setSelectedMenu('');
  }

  const folders = useMemo(() => [...new Set((entries ?? []).flatMap(entry => entry.path.length > 1 ? [entry.path[0]] : []))].sort(), [entries]);
  const normalized = query.trim().toLocaleLowerCase();
  const teamItems = (entries ?? []).filter(entry =>
    (!folder || (entry.path.length > 1 && entry.path[0] === folder)) &&
    (!filter || entry.map === filter) &&
    `${publishedPath(entry)} ${mapName(entry.map)}`.toLocaleLowerCase().includes(normalized),
  ).sort((a, b) => sort === 'map' ? mapName(a.map).localeCompare(mapName(b.map)) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
  const draftItems = drafts.filter(row => (!filter || row.document.mapData === filter) &&
    `${row.name} ${mapName(row.document.mapData)}`.toLocaleLowerCase().includes(normalized),
  ).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) :
    sort === 'map' ? mapName(a.document.mapData).localeCompare(mapName(b.document.mapData)) || a.name.localeCompare(b.name) : b.updated - a.updated);
  const hasItems = tab === 'team' ? teamItems.length > 0 : draftItems.length > 0;
  const startCreate = () => { setCreateMap(''); setShowOldMaps(false); setCreate(true); };

  return <>
    {active ? <Editor key={active.id} initial={active} save={store} exit={() => setActive(undefined)}
      notify={notify} saving={saving[active.id] ?? 'saved'} />
      : <main className="library">
        <header className="site-header">
          <div className="header-inner">
            <div className="brand"><span className="brand-icon"><BookOpen size={20} /></span>
              <span>Team Playbook</span></div>
            <nav aria-label="战术库">
              <button type="button" className={tab === 'team' ? 'nav-active' : ''} onClick={() => changeTab('team')}><Users size={16} />团队战术库</button>
              <button type="button" className={tab === 'drafts' ? 'nav-active' : ''} onClick={() => changeTab('drafts')}><FolderOpen size={17} />本地战术</button>
            </nav>
            <IconButton label="如何分享战术" onClick={() => setHelp(true)}><CircleHelp size={19} /></IconButton>
          </div>
        </header>

        <section className="library-content">
          <div className="library-heading">
            <div><h1>{tab === 'team' ? '团队战术库' : '本地战术'}</h1>
              <p>{tab === 'team' ? '打开队伍发布的战术，在地图上演练。' : '保存在这个浏览器里的战术草稿。'}</p></div>
            <div className="library-actions">
              <button className="button secondary" type="button" onClick={() => fileInput.current?.click()}><Upload size={16} />导入 .ica</button>
              <button className="button primary" type="button" onClick={startCreate}><Plus size={19} />新建战术</button>
            </div>
          </div>
          <div className="library-controls">
            <div className="search-field library-search"><Search size={17} />
              <input type="search" placeholder="搜索战术或地图" aria-label="搜索战术" value={query} onChange={event => setQuery(event.target.value)} />
            </div>
            <label className="select-wrap"><MapPin size={15} />
              <select aria-label="筛选地图" value={filter} onChange={event => setFilter(event.target.value)}>
                <option value="">全部地图</option>
                {maps.map(map => <option value={map.id} key={map.id}>{map.name}</option>)}
              </select><ChevronDown size={13} />
            </label>
            {tab === 'team' && folders.length > 0 && <label className="select-wrap"><FolderOpen size={15} />
              <select aria-label="团队文件夹" value={folder} onChange={event => setFolder(event.target.value)}>
                <option value="">所有文件夹</option>{folders.map(value => <option key={value}>{value}</option>)}
              </select><ChevronDown size={13} />
            </label>}
            <div className="library-controls-end">
              <label className="select-wrap"><select aria-label="排序" value={tab === 'team' && sort === 'recent' ? 'name' : sort}
                onChange={event => setSort(event.target.value as typeof sort)}>
                {tab === 'drafts' && <option value="recent">最近修改</option>}
                <option value="name">按名称</option><option value="map">按地图</option>
              </select><ChevronDown size={13} /></label>
              <div className="segmented view-controls">
                <IconButton label="卡片视图" className={layout === 'grid' ? 'active' : ''} aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><LayoutGrid size={16} /></IconButton>
                <IconButton label="列表视图" className={layout === 'list' ? 'active' : ''} aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={18} /></IconButton>
              </div>
              {tab === 'team' && <IconButton label="刷新团队战术" onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} /></IconButton>}
            </div>
          </div>

          {draftLoadError && tab === 'drafts' && <p className="banner">无法打开浏览器存储。可以继续编辑并通过导出保留战术。</p>}
          {catalogError && tab === 'team' && <p role="alert" className="banner">{catalogError}
            <button type="button" className="button secondary" onClick={() => setRefresh(value => value + 1)}>重试</button></p>}
          {tab === 'team' && entries === null && !catalogError && <p className="muted loading" role="status">正在读取团队战术…</p>}
          {hasItems && <div className={`strategy-list strategy-${layout}`}>
            {tab === 'team' ? teamItems.map(entry => <StrategyCard key={entryKey(entry)}
              name={entry.name} map={entry.map} detail={entry.path.slice(0, -1).join(' / ') || '团队战术'}
              disabled={!!opening} opening={opening === entryKey(entry)} onOpen={() => openTeam(entry)} />)
              : draftItems.map(strategy => <StrategyCard key={strategy.id}
                name={strategy.name} map={strategy.document.mapData} detail={`${strategy.document.pages.length} 页 · ${date(strategy.updated)}`}
                onOpen={() => mapById[strategy.document.mapData] ? setActive(strategy) : notify('这张地图暂未收录')}
                menu={selectedMenu === strategy.id}
                onMenu={() => setSelectedMenu(value => value === strategy.id ? '' : strategy.id)}
                onExport={() => downloadDraft(strategy)}
                onDuplicate={() => {
                  const now = Date.now();
                  store({ ...strategy, id: newId(), name: `${strategy.name} 副本`, updated: now, published: undefined });
                  setSelectedMenu('');
                  notify('已复制战术');
                }}
                onRemove={() => removeDraft(strategy)} />)}
          </div>}
          {!hasItems && (tab === 'drafts' || (entries !== null && !catalogError)) && <div className="empty-state">
            <div className="empty-icon">{tab === 'team' ? <Users size={28} /> : <MapIcon size={28} />}</div>
            <h2>{query || filter || folder ? '没有匹配的战术' : tab === 'team' ? '还没有发布的战术' : '开始你的第一场战术'}</h2>
            <p>{query || filter || folder ? '换个关键词，或清除筛选条件。' :
              tab === 'team' ? '把导出的 .ica 放进仓库的 strategies/ 文件夹，部署后就会出现在这里。' : '选一张地图，摆放英雄、规划路线并导出。'}</p>
            {query || filter || folder
              ? <button type="button" className="button secondary" onClick={() => { setQuery(''); setFilter(''); setFolder(''); }}>清除筛选</button>
              : <button type="button" className="button secondary" onClick={startCreate}><Plus size={17} />新建战术</button>}
          </div>}
        </section>
        <input type="file" ref={fileInput} accept=".ica,application/zip" hidden onChange={onImport} />
        {create && <Modal title="新建战术" description="选择地图后进入编辑器。" wide onClose={() => setCreate(false)}>
          <form onSubmit={createStrategy}>
            <label className="field">战术名称<input type="text" name="name" placeholder="可留空" autoComplete="off" maxLength={120} /></label>
            <div className="map-picker">
              {maps.filter(map => map.active || showOldMaps).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)).map(map =>
                <button key={map.id} type="button" className={`map-option ${createMap === map.id ? 'active' : ''}`}
                  onClick={() => setCreateMap(map.id)} onDoubleClick={() => setCreateMap(map.id)} aria-pressed={createMap === map.id}>
                  <img src={mapThumb(map.id)} alt="" /><span>{map.name}</span>
                </button>)}
            </div>
            <div className="modal-actions">
              <button type="button" className="button subtle" onClick={() => setShowOldMaps(value => !value)}>{showOldMaps ? '只看当前地图池' : '显示全部地图'}</button>
              <button className="button primary" type="submit" disabled={!createMap}>开始编辑<ArrowUpRight size={16} /></button>
            </div>
          </form>
        </Modal>}
        {help && <Modal title="和队友分享战术" onClose={() => setHelp(false)}>
          <ol className="help-steps">
            <li>在编辑器点击「导出 .ica」，把文件发给仓库维护者。</li>
            <li>把 .ica 放进 GitHub 仓库的 <code>strategies/</code> 并提交。</li>
            <li>GitHub Pages 部署完成后，刷新团队战术库。</li>
          </ol>
          <p className="muted">打开团队战术会创建本地副本。编辑后的版本可以再次导出。</p>
        </Modal>}
      </main>}
    {toast && <div className="toast" role="status">{toast}<IconButton label="关闭提示" onClick={() => setToast('')}><X size={15} /></IconButton></div>}
  </>;
}

function StrategyCard({ name, map, detail, disabled, opening, menu, onMenu, onExport, onDuplicate, onRemove, onOpen }:
  { name: string; map: string; detail: string; disabled?: boolean; opening?: boolean; menu?: boolean;
    onMenu?: () => void; onExport?: () => void; onDuplicate?: () => void; onRemove?: () => void; onOpen: () => void; }) {
  return <article className="strategy-card">
    <button type="button" className="strategy-open" onClick={onOpen} disabled={disabled}>
      <span className="strategy-artwork">
        {mapById[map] && <img alt="" src={mapThumb(map)} />}
        <span className="map-chip"><MapPin size={13} />{mapName(map)}</span>
      </span>
      <span className="strategy-info">
        <span><strong>{name}</strong><small>{opening ? '正在打开…' : detail}</small></span>
        {!onMenu && <CloudDownload size={17} />}
      </span>
    </button>
    {onMenu && <div className="strategy-more">
      <IconButton label={`${name} 的操作`} aria-expanded={!!menu} onClick={onMenu}><MoreHorizontal size={19} /></IconButton>
      {menu && <div className="popover context-menu card-menu">
        <button type="button" onClick={onExport}><ArrowDownToLine size={15} />导出 .ica</button>
        <button type="button" onClick={onDuplicate}><Plus size={15} />复制战术</button>
        <button type="button" className="danger-text" onClick={onRemove}><Trash2 size={15} />删除本地战术</button>
      </div>}
    </div>}
  </article>;
}
