import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpRight, BookOpen, ChevronDown, CircleHelp, CloudDownload, FolderOpen,
  LayoutGrid, List, Map as MapIcon, MapPin, MoreHorizontal, Plus, RefreshCw, Search, Trash2, Upload, Users, X, Play, Eye,
} from 'lucide-react';
import Editor from './Editor.tsx';
import { downloadIca, importIca } from './archive.ts';
import { agentById, gameAsset, mapById, maps, mapThumb } from './catalog.ts';
import { deleteDraft, loadDrafts, loadFolders, saveDraft, updateLibrary } from './storage.ts';
import { defaultFolderColor, downloadLibrary, folderChain, folderIcons, readLibraryBackup, type LibraryFolder } from './library-backup.ts';
import { alliedRoster, newId, newStrategy, reindexPages, type Page, type Strategy } from './strategy.ts';
import { flipPage, pageIsAttack } from './geometry.ts';
import { IconButton, Modal } from './ui.tsx';
import { readPreferences } from './preferences.ts';
import StrategyViewer from './StrategyViewer.tsx';
import LanguageSelect from './LanguageSelect.tsx';
import { languageTag, t, useLanguage } from './locale.ts';

type Entry = { path: string[]; name: string; map: string; revision: string; roster?: string[] };
type MapFilter = string;
type Saving = 'saved' | 'saving' | 'failed';
const catalogUrl = `${import.meta.env.BASE_URL}strategies/`;
const mapName = (id: string) => mapById[id]?.name ?? id;
const date = (timestamp: number) => new Intl.DateTimeFormat(languageTag(), { month: 'short', day: 'numeric' }).format(timestamp);
const publishedPath = (entry: Entry) => entry.path.join('/');
const entryKey = (entry: Entry) => `${publishedPath(entry)}@${entry.revision}`;
const ReplayLibrary = lazy(() => import('./ReplayLibrary.tsx'));

export default function App() {
  const language = useLanguage();
  const [drafts, setDrafts] = useState<Strategy[]>([]);
  const [localFolders, setLocalFolders] = useState<LibraryFolder[]>([]);
  const [localFolder, setLocalFolder] = useState<string>();
  const [editFolder, setEditFolder] = useState<LibraryFolder>();
  const [renameDraft, setRenameDraft] = useState<Strategy>();
  const [moveDraft, setMoveDraft] = useState<Strategy>();
  const [switchDraft, setSwitchDraft] = useState(false);
  const [showReplays, setShowReplays] = useState(false);
  const [saving, setSaving] = useState<Record<string, Saving>>({});
  const [draftLoadError, setDraftLoadError] = useState(false);
  const [active, setActive] = useState<Strategy>();
  const [viewing, setViewing] = useState<Strategy>();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [opening, setOpening] = useState('');
  const [tab, setTab] = useState<'team' | 'drafts'>('team');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MapFilter>('');
  const [folder, setFolder] = useState('');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState<'recent' | 'created' | 'name' | 'map'>('recent');
  const [reverseSort, setReverseSort] = useState(false);
  const [create, setCreate] = useState(false);
  const [createMap, setCreateMap] = useState('');
  const [showOldMaps, setShowOldMaps] = useState(false);
  const [help, setHelp] = useState(false);
  const [selectedMenu, setSelectedMenu] = useState('');
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastWrites = useRef(new Map<string, number>());

  useEffect(() => { document.documentElement.lang = languageTag(); }, [language]);

  const notify = useCallback((message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(''), 3600);
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all([loadDrafts(), loadFolders()]).then(([rows, folders]) => {
      if (!live) return;
      setDrafts(current => [...rows.filter(row => !current.some(local => local.id === row.id)), ...current]);
      setLocalFolders(folders);
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

  function captureReplay(map: string, name: string, page: Page, draftId?: string) {
    const draft = drafts.find(row => row.id === draftId && row.document.mapData === map);
    if (draft && Number(draft.document.versionNumber) < 97) {
      const canonical = flipPage({ ...page, isAttack: 'true' }, page.isAttack, mapById[map], 96);
      page = { ...canonical, isAttack: pageIsAttack(page) ? 'true' : 'false' };
    }
    page = { ...page, name, isAutoNamed: false };
    const strategy = draft ?? newStrategy(map, name);
    const pages = draft ? [...draft.document.pages, page] : [page];
    store({ ...strategy, updated: Date.now(), document: { ...strategy.document, pages: reindexPages(pages) } });
    notify(draft ? '画面已追加到战术最后一页' : '已保存为本地战术');
  }

  async function openTeam(entry: Entry, preview = false) {
    if (opening) return;
    setOpening(entryKey(entry));
    try {
      if (!mapById[entry.map]) throw new Error(`暂不支持地图 ${entry.map}`);
      const existing = drafts.find(row => row.published?.path === publishedPath(entry) &&
        row.published.revision === entry.revision && row.published.importedAt === row.updated);
      if (existing) { (preview ? setViewing : setActive)(existing); return; }
      const path = ['files', entry.revision, ...entry.path].map(encodeURIComponent).join('/');
      const response = await fetch(catalogUrl + path, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error('战术文件读取失败，刷新团队列表后重试');
      const strategy = importIca(new Uint8Array(await response.arrayBuffer()), entry.path.at(-1)!);
      if (!mapById[strategy.document.mapData]) throw new Error(`暂不支持地图 ${strategy.document.mapData}`);
      const source = { ...strategy, published: { path: publishedPath(entry), revision: entry.revision, importedAt: strategy.updated } };
      if (preview) setViewing(source);
      else startDraft(source);
    } catch (error) {
      notify(error instanceof Error ? error.message : '无法打开团队战术');
    } finally {
      setOpening('');
    }
  }

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    await importFiles(files);
  }

  async function importFiles(files: File[]) {
    if (!files.length) return;
    try {
      const records: Strategy[] = [];
      const folders: LibraryFolder[] = [];
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (/\.ica$/i.test(file.name)) {
          const strategy = importIca(bytes, file.name);
          if (!mapById[strategy.document.mapData]) throw new Error(`暂不支持地图 ${strategy.document.mapData}`);
          records.push({ ...strategy, createdAt: Date.now(), folderId: localFolder });
        } else {
          const backup = readLibraryBackup(bytes);
          records.push(...backup.drafts);
          folders.push(...backup.folders);
        }
      }
      setTab('drafts');
      if (files.length === 1 && /\.ica$/i.test(files[0].name)) startDraft(records[0]);
      else {
        await updateLibrary(records, folders);
        setDrafts(current => [...current, ...records]);
        setLocalFolders(current => [...current, ...folders]);
        setLocalFolder(undefined);
        notify(`已导入 ${records.length} 份战术和 ${folders.length} 个文件夹`);
      }
    } catch (error) {
      notify(error instanceof Error ? `无法导入，${error.message}` : '无法导入文件');
    }
  }

  function createStrategy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createMap) return;
    const name = String(new FormData(event.currentTarget).get('name')).trim() || `${mapName(createMap)} 战术`;
    setCreate(false);
    setTab('drafts');
    const strategy = newStrategy(createMap, name);
    const defaults = readPreferences();
    strategy.document.themePalette = defaults.palette;
    strategy.document.pages[0].settings = { agentSize: defaults.agentSize, abilitySize: defaults.abilitySize, useNeutralTeamColors: defaults.neutral };
    startDraft({ ...strategy, folderId: tab === 'drafts' ? localFolder : undefined });
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

  function exportLibrary(folderId?: string) {
    try { downloadLibrary(drafts, localFolders, folderId); }
    catch (error) { notify(error instanceof Error ? error.message : '备份导出失败'); }
  }

  async function saveFolder(folder: LibraryFolder) {
    try {
      await updateLibrary([], [folder]);
      setLocalFolders(rows => rows.some(row => row.id === folder.id) ? rows.map(row => row.id === folder.id ? folder : row) : [...rows, folder]);
      setEditFolder(undefined);
    } catch { notify('无法保存文件夹'); }
  }

  async function removeFolder(folder: LibraryFolder) {
    if (!window.confirm(`删除「${folder.name}」？其中内容将移到上一级。`)) return;
    const folders = localFolders.filter(row => row.parentId === folder.id).map(row => ({ ...row, parentId: folder.parentId }));
    const children = drafts.filter(row => row.folderId === folder.id).map(row => ({ ...row, folderId: folder.parentId }));
    try {
      await updateLibrary(children, folders, folder.id);
      setLocalFolders(rows => rows.filter(row => row.id !== folder.id).map(row => folders.find(child => child.id === row.id) ?? row));
      setDrafts(rows => rows.map(row => children.find(child => child.id === row.id) ?? row));
      if (localFolder === folder.id) setLocalFolder(folder.parentId);
      setEditFolder(undefined);
    } catch { notify('无法删除文件夹'); }
  }

  function moveEntry(event: DragEvent, parentId?: string) {
    const strategy = drafts.find(row => row.id === event.dataTransfer.getData('application/x-playbook-strategy'));
    const folder = localFolders.find(row => row.id === event.dataTransfer.getData('application/x-playbook-folder'));
    if (!strategy && !folder) return;
    event.preventDefault();
    event.stopPropagation();
    if (strategy) store({ ...strategy, folderId: parentId });
    if (folder && !folderChain(localFolders, parentId).some(row => row.id === folder.id)) void saveFolder({ ...folder, parentId });
  }

  function allowLibraryDrop(event: DragEvent) {
    if (event.dataTransfer.types.some(type => type.startsWith('application/x-playbook-'))) event.preventDefault();
  }

  function changeTab(value: typeof tab) {
    setTab(value); setFolder(''); setFilter(''); setSelectedMenu('');
  }

  const teamFolders = useMemo(() => [...new Set((entries ?? []).flatMap(entry => entry.path.slice(0, -1)
    .map((_, index) => entry.path.slice(0, index + 1).join('/'))))].sort(), [entries]);
  const normalized = query.trim().toLocaleLowerCase();
  const teamItems = (entries ?? []).filter(entry =>
    (!folder || publishedPath(entry).startsWith(folder + '/')) &&
    (!filter || entry.map === filter) &&
    `${publishedPath(entry)} ${mapName(entry.map)}`.toLocaleLowerCase().includes(normalized),
  ).sort((a, b) => (reverseSort ? -1 : 1) * (sort === 'map' ?
    mapName(a.map).localeCompare(mapName(b.map)) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)));
  const draftItems = drafts.filter(row => (normalized || row.folderId === localFolder) && (!filter || row.document.mapData === filter) &&
    `${row.name} ${mapName(row.document.mapData)} ${folderChain(localFolders, row.folderId).map(folder => folder.name).join('/')}`
      .toLocaleLowerCase().includes(normalized),
  ).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (reverseSort ? -1 : 1) * (sort === 'name' ? a.name.localeCompare(b.name) :
    sort === 'created' ? (b.createdAt ?? b.updated) - (a.createdAt ?? a.updated) :
    sort === 'map' ? mapName(a.document.mapData).localeCompare(mapName(b.document.mapData)) || a.name.localeCompare(b.name) : b.updated - a.updated));
  const visibleFolders = localFolders.filter(row => normalized ? row.name.toLocaleLowerCase().includes(normalized) : row.parentId === localFolder)
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (reverseSort ? -1 : 1) * a.name.localeCompare(b.name));
  const hasItems = tab === 'team' ? teamItems.length > 0 : draftItems.length > 0 || visibleFolders.length > 0;
  const startCreate = () => { setCreateMap(''); setShowOldMaps(false); setCreate(true); };

  return <>
    {showReplays ? <Suspense fallback={<p className="loading">{t('正在打开回放库…')}</p>}>
      <ReplayLibrary close={() => setShowReplays(false)} drafts={drafts} capture={captureReplay} />
    </Suspense> : viewing ? <StrategyViewer key={viewing.id} strategy={viewing} close={() => setViewing(undefined)} editCopy={() => {
      setViewing(undefined);
      startDraft(viewing);
    }} /> : active ? <Editor key={active.id} initial={active} save={store} exit={() => setActive(undefined)} onSwitch={() => setSwitchDraft(true)}
      notify={notify} saving={saving[active.id] ?? 'saved'} />
      : <main className="library"
        onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
        onDrop={event => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          void importFiles(Array.from(event.dataTransfer.files));
        }}>
        <header className="site-header">
          <div className="header-inner">
            <div className="brand"><span className="brand-icon"><BookOpen size={20} /></span>
              <span>Team Playbook</span></div>
            <nav aria-label={t('战术库')}>
              <button type="button" className={tab === 'team' ? 'nav-active' : ''} onClick={() => changeTab('team')}><Users size={16} />{t('团队战术库')}</button>
              <button type="button" className={tab === 'drafts' ? 'nav-active' : ''} onClick={() => changeTab('drafts')}><FolderOpen size={17} />{t('本地战术')}</button>
              <button type="button" onClick={() => setShowReplays(true)}><Play size={16} />{t('回放')}</button>
            </nav>
            <div className="header-actions">
              <LanguageSelect inline />
              <IconButton label={t('如何分享战术')} onClick={() => setHelp(true)}><CircleHelp size={19} /></IconButton>
            </div>
          </div>
        </header>

        <section className="library-content">
          <div className="library-heading">
            <div><h1>{tab === 'team' ? t('团队战术库') : t('本地战术')}</h1>
              <p>{tab === 'team' ? t('打开队伍发布的战术，在地图上演练。') : t('保存在这个浏览器里的战术草稿。')}</p></div>
            <div className="library-actions">
              <button className="button secondary" type="button" onClick={() => fileInput.current?.click()}><Upload size={16} />{t('导入 .ica 或 ZIP')}</button>
              {tab === 'drafts' && <>
                <button className="button secondary" type="button" onClick={() => setEditFolder({
                  id: newId(), parentId: localFolder, name: '', color: defaultFolderColor, icon: folderIcons[0],
                })}><FolderOpen size={16} />{t('新建文件夹')}</button>
                <button className="button secondary" type="button" onClick={() => exportLibrary()}><ArrowDownToLine size={16} />{t('备份战术库')}</button>
              </>}
              <button className="button primary" type="button" onClick={startCreate}><Plus size={19} />{t('新建战术')}</button>
            </div>
          </div>
          <div className="library-controls">
            <div className="search-field library-search"><Search size={17} />
              <input type="search" placeholder={t('搜索战术或地图')} aria-label={t('搜索战术')} value={query} onChange={event => setQuery(event.target.value)} />
            </div>
            <label className="select-wrap"><MapPin size={15} />
              <select aria-label={t('筛选地图')} value={filter} onChange={event => setFilter(event.target.value)}>
                <option value="">{t('全部地图')}</option>
                {maps.map(map => <option value={map.id} key={map.id}>{map.name}</option>)}
              </select><ChevronDown size={13} />
            </label>
            {tab === 'team' && teamFolders.length > 0 && <label className="select-wrap"><FolderOpen size={15} />
              <select aria-label={t('团队文件夹')} value={folder} onChange={event => setFolder(event.target.value)}>
                <option value="">{t('所有文件夹')}</option>{teamFolders.map(value => <option key={value}>{value}</option>)}
              </select><ChevronDown size={13} />
            </label>}
            <div className="library-controls-end">
              <label className="select-wrap"><select aria-label={t('排序')} value={tab === 'team' && ['recent', 'created'].includes(sort) ? 'name' : sort}
                onChange={event => setSort(event.target.value as typeof sort)}>
                {tab === 'drafts' && <option value="recent">{t('最近修改')}</option>}
                {tab === 'drafts' && <option value="created">{t('创建日期')}</option>}
                <option value="name">{t('按名称')}</option><option value="map">{t('按地图')}</option>
              </select><ChevronDown size={13} /></label>
              <button className="button subtle" type="button" onClick={() => setReverseSort(value => !value)}>{reverseSort ? t('反向排序') : t('默认排序')}</button>
              <div className="segmented view-controls">
                <IconButton label={t('卡片视图')} className={layout === 'grid' ? 'active' : ''} aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><LayoutGrid size={16} /></IconButton>
                <IconButton label={t('列表视图')} className={layout === 'list' ? 'active' : ''} aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={18} /></IconButton>
              </div>
              {tab === 'team' && <IconButton label={t('刷新团队战术')} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} /></IconButton>}
            </div>
          </div>
          {tab === 'drafts' && localFolder && <nav className="library-breadcrumb" aria-label={t('当前文件夹')}>
            <button className="button subtle" type="button" onDragOver={allowLibraryDrop} onDrop={event => moveEntry(event)}
              onClick={() => { setLocalFolder(undefined); setQuery(''); }}>{t('本地战术')}</button>
            {folderChain(localFolders, localFolder).map(folder => <button key={folder.id} className="button subtle" type="button"
              onDragOver={allowLibraryDrop} onDrop={event => moveEntry(event, folder.id)}
              onClick={() => { setLocalFolder(folder.id); setQuery(''); }}>{folder.name}</button>)}
            <button className="button subtle" type="button" onClick={() => exportLibrary(localFolder)}>{t('导出文件夹 ZIP')}</button>
          </nav>}

          {draftLoadError && tab === 'drafts' && <p className="banner">{t('无法打开浏览器存储。可以继续编辑并通过导出保留战术。')}</p>}
          {catalogError && tab === 'team' && <p role="alert" className="banner">{catalogError}
            <button type="button" className="button secondary" onClick={() => setRefresh(value => value + 1)}>{t('重试')}</button></p>}
          {tab === 'team' && entries === null && !catalogError && <p className="muted loading" role="status">{t('正在读取团队战术…')}</p>}
          {hasItems && <div className={`strategy-list strategy-${layout}`}>
            {tab === 'team' ? teamItems.map(entry => <StrategyCard key={entryKey(entry)}
              name={entry.name} map={entry.map} roster={entry.roster} detail={entry.path.slice(0, -1).join(' / ') || t('团队战术')}
              disabled={!!opening} opening={opening === entryKey(entry)} onOpen={() => openTeam(entry)} onPreview={() => openTeam(entry, true)} />)
              : <>
                {visibleFolders.map(folder => <article className="strategy-card library-folder" key={folder.id} draggable
                  onDragStart={event => event.dataTransfer.setData('application/x-playbook-folder', folder.id)}
                  onDragOver={allowLibraryDrop} onDrop={event => moveEntry(event, folder.id)}>
                  <button className="strategy-open" type="button" onClick={() => { setLocalFolder(folder.id); setQuery(''); }}>
                    <span className="folder-emblem" style={{ color: folder.color }}>{folder.icon}</span>
                    <span className="strategy-info"><strong>{folder.pinned && '★ '}{folder.name}</strong></span>
                  </button>
                  <div className="strategy-more"><IconButton label={t('编辑文件夹')} onClick={() => setEditFolder(folder)}><MoreHorizontal size={19} /></IconButton></div>
                </article>)}
                {draftItems.map(strategy => <StrategyCard key={strategy.id}
                name={strategy.name} map={strategy.document.mapData} roster={alliedRoster(strategy.document.pages)}
                detail={`${strategy.document.pages.length} 页 · ${date(strategy.updated)}`}
                pinned={strategy.pinned} dragId={strategy.id}
                onOpen={() => mapById[strategy.document.mapData] ? setActive(strategy) : notify('这张地图暂未收录')}
                menu={selectedMenu === strategy.id}
                onMenu={() => setSelectedMenu(value => value === strategy.id ? '' : strategy.id)}
                onExport={() => downloadDraft(strategy)}
                onRename={() => { setRenameDraft(strategy); setSelectedMenu(''); }}
                onMove={() => { setMoveDraft(strategy); setSelectedMenu(''); }}
                onPin={() => { store({ ...strategy, pinned: !strategy.pinned }); setSelectedMenu(''); }}
                onDuplicate={() => {
                  const now = Date.now();
                  store({ ...strategy, id: newId(), name: `${strategy.name} 副本`, updated: now, createdAt: now, published: undefined, pinned: false });
                  setSelectedMenu('');
                  notify('已复制战术');
                }}
                onRemove={() => removeDraft(strategy)} />)}
              </>}
          </div>}
          {!hasItems && (tab === 'drafts' || (entries !== null && !catalogError)) && <div className="empty-state">
            <div className="empty-icon">{tab === 'team' ? <Users size={28} /> : <MapIcon size={28} />}</div>
            <h2>{query || filter || folder ? t('没有匹配的战术') : tab === 'team' ? t('还没有发布的战术') : t('开始你的第一场战术')}</h2>
            <p>{query || filter || folder ? t('换个关键词，或清除筛选条件。') :
              tab === 'team' ? t('把导出的 .ica 放进仓库的 strategies/ 文件夹，部署后就会出现在这里。') : t('选一张地图，摆放英雄、规划路线并导出。')}</p>
            {query || filter || folder
              ? <button type="button" className="button secondary" onClick={() => { setQuery(''); setFilter(''); setFolder(''); }}>{t('清除筛选')}</button>
              : <button type="button" className="button secondary" onClick={startCreate}><Plus size={17} />{t('新建战术')}</button>}
          </div>}
        </section>
        <input type="file" ref={fileInput} accept=".ica,.zip,application/zip" multiple hidden onChange={onImport} />
        {create && <Modal title={t('新建战术')} description={t('选择地图后进入编辑器。')} wide onClose={() => setCreate(false)}>
          <form onSubmit={createStrategy}>
            <label className="field">{t('战术名称')}<input type="text" name="name" placeholder={t('可留空')} autoComplete="off" maxLength={120} /></label>
            <div className="map-picker">
              {maps.filter(map => map.active || showOldMaps).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)).map(map =>
                <button key={map.id} type="button" className={`map-option ${createMap === map.id ? 'active' : ''}`}
                  onClick={() => setCreateMap(map.id)} onDoubleClick={() => setCreateMap(map.id)} aria-pressed={createMap === map.id}>
                  <img src={mapThumb(map.id)} alt="" /><span>{map.name}</span>
                </button>)}
            </div>
            <div className="modal-actions">
              <button type="button" className="button subtle" onClick={() => setShowOldMaps(value => !value)}>{showOldMaps ? t('只看当前地图池') : t('显示全部地图')}</button>
              <button className="button primary" type="submit" disabled={!createMap}>{t('开始编辑')}<ArrowUpRight size={16} /></button>
            </div>
          </form>
        </Modal>}
        {help && <Modal title={t('和队友分享战术')} onClose={() => setHelp(false)}>
          <ol className="help-steps">
            <li>{t('在编辑器点击「导出 .ica」，把文件发给仓库维护者。')}</li>
            <li>{t('把 .ica 放进 GitHub 仓库的')}{' '} <code>strategies/</code> {' '}{t('并提交。')}</li>
            <li>{t('GitHub Pages 部署完成后，刷新团队战术库。')}</li>
          </ol>
          <p className="muted">{t('打开团队战术会创建本地副本。编辑后的版本可以再次导出。')}</p>
        </Modal>}
      </main>}
    {editFolder && <Modal title={localFolders.some(row => row.id === editFolder.id) ? t('编辑文件夹') : t('新建文件夹')}
      onClose={() => setEditFolder(undefined)}>
      <form onSubmit={event => {
        event.preventDefault();
        const name = editFolder.name.trim();
        if (name) void saveFolder({ ...editFolder, name });
      }}>
        <label className="field">{t('名称')}<input value={editFolder.name} required autoFocus maxLength={120}
          onChange={event => setEditFolder({ ...editFolder, name: event.target.value })} /></label>
        <label className="field">{t('父文件夹')}<select value={editFolder.parentId ?? ''} onChange={event => setEditFolder({ ...editFolder, parentId: event.target.value || undefined })}>
          <option value="">{t('本地战术')}</option>
          {localFolders.filter(row => !folderChain(localFolders, row.id).some(folder => folder.id === editFolder.id)).map(row =>
            <option key={row.id} value={row.id}>{folderChain(localFolders, row.id).map(folder => folder.name).join(' / ')}</option>)}
        </select></label>
        <label className="field">{t('颜色')}<input type="color" value={editFolder.color} onChange={event => setEditFolder({ ...editFolder, color: event.target.value })} /></label>
        <label className="field">{t('图标')}<select value={editFolder.icon} onChange={event => setEditFolder({ ...editFolder, icon: event.target.value })}>
          {folderIcons.map(icon => <option key={icon}>{icon}</option>)}</select></label>
        <label className="check-field"><input type="checkbox" checked={!!editFolder.pinned}
          onChange={event => setEditFolder({ ...editFolder, pinned: event.target.checked })} />{t('置顶')}</label>
        <div className="modal-actions">
          {localFolders.some(row => row.id === editFolder.id) && <>
            <button className="button subtle" type="button" onClick={() => exportLibrary(editFolder.id)}>{t('导出 ZIP')}</button>
            <button className="button subtle danger-text" type="button" onClick={() => removeFolder(editFolder)}>{t('删除文件夹')}</button>
          </>}
          <button type="submit" className="button primary">{t('保存')}</button>
        </div>
      </form>
    </Modal>}
    {renameDraft && <Modal title={t('重命名战术')} onClose={() => setRenameDraft(undefined)}>
      <form onSubmit={event => {
        event.preventDefault();
        const name = String(new FormData(event.currentTarget).get('name')).trim();
        if (name) { store({ ...renameDraft, name, updated: Date.now() }); setRenameDraft(undefined); }
      }}>
        <label className="field">{t('名称')}<input name="name" defaultValue={renameDraft.name} autoFocus required maxLength={120} /></label>
        <div className="modal-actions"><button className="button primary" type="submit">{t('保存')}</button></div>
      </form>
    </Modal>}
    {moveDraft && <Modal title={t('移动战术')} onClose={() => setMoveDraft(undefined)}>
      <form onSubmit={event => {
        event.preventDefault();
        const id = String(new FormData(event.currentTarget).get('folder'));
        store({ ...moveDraft, folderId: id || undefined }); setMoveDraft(undefined);
      }}>
        <label className="field">{t('目标文件夹')}<select name="folder" defaultValue={moveDraft.folderId ?? ''}>
          <option value="">{t('本地战术')}</option>
          {localFolders.map(folder => <option key={folder.id} value={folder.id}>{folderChain(localFolders, folder.id).map(row => row.name).join(' / ')}</option>)}
        </select></label>
        <div className="modal-actions"><button className="button primary" type="submit">{t('移动')}</button></div>
      </form>
    </Modal>}
    {switchDraft && <Modal title={t('打开另一份战术')} onClose={() => setSwitchDraft(false)}>
      <div className="draft-switcher">{drafts.filter(row => row.id !== active?.id && mapById[row.document.mapData]).map(row =>
        <button className="button secondary" type="button" key={row.id} onClick={() => { setActive(row); setSwitchDraft(false); }}>
          {row.name} · {mapName(row.document.mapData)}
        </button>)}
        {drafts.length <= 1 && <p className="muted">{t('本地库中没有其他战术')}</p>}
      </div>
    </Modal>}
    {toast && <div className="toast" role="status">{toast}<IconButton label={t('关闭提示')} onClick={() => setToast('')}><X size={15} /></IconButton></div>}
  </>;
}

function StrategyCard({ name, map, detail, roster = [], disabled, opening, menu, pinned, dragId, onMenu, onExport, onRename, onMove, onPin, onDuplicate, onRemove, onOpen, onPreview }:
  { name: string; map: string; detail: string; roster?: string[]; disabled?: boolean; opening?: boolean; menu?: boolean;
    pinned?: boolean; dragId?: string; onRename?: () => void; onMove?: () => void; onPin?: () => void;
    onMenu?: () => void; onExport?: () => void; onDuplicate?: () => void; onRemove?: () => void; onOpen: () => void; onPreview?: () => void; }) {
  const agents = roster.filter(id => Object.hasOwn(agentById, id)).map(id => agentById[id]);
  const portraits = agents.slice(0, 5);
  const extra = agents.slice(portraits.length);
  return <article className="strategy-card" draggable={!!dragId}
    onDragStart={event => { if (dragId) event.dataTransfer.setData('application/x-playbook-strategy', dragId); }}>
    <button type="button" className="strategy-open" onClick={onOpen} disabled={disabled}>
      <span className="strategy-artwork">
        {mapById[map] && <img alt="" src={mapThumb(map)} />}
        <span className="map-chip"><MapPin size={13} />{mapName(map)}</span>
        {!!portraits.length && <span className="strategy-roster" role="img"
          aria-label={`${t('友方阵容')} · ${agents.map(agent => agent.name).join(' / ')}`}>
          {portraits.map(agent => <img key={agent.id} alt="" title={agent.name} src={gameAsset(agent.icon)} loading="lazy" draggable={false} />)}
          {!!extra.length && <span title={extra.map(agent => agent.name).join(' / ')}>+{extra.length}</span>}
        </span>}
      </span>
      <span className="strategy-info">
        <span><strong>{pinned && '★ '}{name}</strong><small>{opening ? t('正在打开…') : detail}</small></span>
        {!onMenu && !onPreview && <CloudDownload size={17} />}
      </span>
    </button>
    {onPreview && <div className="strategy-more">
      <IconButton label={`只读浏览 ${name}`} disabled={disabled} onClick={onPreview}><Eye size={18} /></IconButton>
    </div>}
    {onMenu && <div className="strategy-more">
      <IconButton label={`${name} 的操作`} aria-expanded={!!menu} onClick={onMenu}><MoreHorizontal size={19} /></IconButton>
      {menu && <div className="popover context-menu card-menu">
        <button type="button" onClick={onExport}><ArrowDownToLine size={15} />{t('导出 .ica')}</button>
        <button type="button" onClick={onRename}>{t('重命名')}</button>
        <button type="button" onClick={onMove}>{t('移动到文件夹')}</button>
        <button type="button" onClick={onPin}>{pinned ? t('取消置顶') : t('置顶')}</button>
        <button type="button" onClick={onDuplicate}><Plus size={15} />{t('复制战术')}</button>
        <button type="button" className="danger-text" onClick={onRemove}><Trash2 size={15} />{t('删除本地战术')}</button>
      </div>}
    </div>}
  </article>;
}
