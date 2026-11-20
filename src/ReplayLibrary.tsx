import { t } from './locale.ts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Play, Pause, Upload } from 'lucide-react';
import { CanvasObject, DrawingArt, MapArtwork, MapDoorBars, VisionWalls } from './BoardArt.tsx';
import { mapArtworkFrame, mapById, point, project, type Point } from './catalog.ts';
import { makeAgent } from './geometry.ts';
import { loadSightWalls, sightDoorWalls, type SightSegment } from './map-vision.ts';
import { mapDoors, toggleMapDoor } from './map-doors.ts';
import { standardLayers } from './preferences.ts';
import { decodeReplay, replayAgent, replayCastName, replayDoorsAt, replayHealth, replayPosition, replaySpikeAt, replayUtilityAt, type Replay } from './replay.ts';
import { deleteReplay, loadReplays, saveReplay, type SavedReplay } from './storage.ts';
import { newId, newPage, type Drawing, type Page, type Strategy } from './strategy.ts';
import { IconButton } from './ui.tsx';

const stamp = (time: number) => {
  const seconds = Math.floor(Math.max(0, time) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export default function ReplayLibrary({ close, drafts, capture }: {
  close: () => void; drafts: Strategy[]; capture: (map: string, name: string, page: Page, draftId?: string) => void;
}) {
  const [saved, setSaved] = useState<SavedReplay[]>([]);
  const [active, setActive] = useState<{ name: string; replay: Replay }>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { void loadReplays().then(setSaved).catch(() => setError('无法读取本机回放库')); }, []);

  async function open(blob: Blob, name: string, keep: boolean) {
    if (loading) return;
    setLoading(true); setError('');
    try {
      if (blob.size > 160 * 1024 * 1024) throw new Error('回放文件超过 160 MB');
      const replay = decodeReplay(new Uint8Array(await blob.arrayBuffer()));
      if (keep) {
        const file = { id: newId(), blob, map: replay.map.id, name };
        await saveReplay(file);
        setSaved(current => [...current, file]);
      }
      setActive({ replay, name });
    } catch (problem) { setError(problem instanceof Error ? problem.message : '读取回放失败'); }
    finally { setLoading(false); }
  }

  if (active) return <ReplayPlayer key={active.name} {...active} close={() => setActive(undefined)} drafts={drafts} capture={capture} />;
  return <main className="library" onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
    onDrop={event => {
      const file = event.dataTransfer.files[0];
      if (!file) return;
      event.preventDefault(); void open(file, file.name, true);
    }}>
    <section className="library-content">
      <div className="library-heading"><div><h1>{t('本地比赛回放')}</h1><p>{t('选择或拖入 Icarus 已解码的 .icrp 文件。')}</p></div>
        <div className="library-actions">
          <button className="button secondary" type="button" onClick={close}><ArrowLeft size={16} />{t('返回战术库')}</button>
          <button className="button primary" type="button" onClick={() => input.current?.click()} disabled={loading}><Upload size={16} />{t('导入回放')}</button>
        </div>
      </div>
      <input ref={input} type="file" accept=".icrp" hidden onChange={event => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
        if (file) void open(file, file.name, true);
      }} />
      <label className="field">{t('搜索本地回放')}<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      {error && <p role="alert" className="banner">{error}</p>}
      {loading && <p role="status">{t('正在读取回放…')}</p>}
      <div className="replay-list">{saved.filter(row => row.name.toLowerCase().includes(query.toLowerCase())).map(row =>
        <div key={row.id} className="replay-list-item">
          <button type="button" className="button subtle" disabled={loading} onClick={() => open(row.blob, row.name, false)}>
            {row.name} · {mapById[row.map]?.name ?? row.map}
          </button>
          <button type="button" className="button subtle danger-text" onClick={async () => {
            if (!window.confirm(`从本地回放库移除「${row.name}」？`)) return;
            try { await deleteReplay(row.id); setSaved(current => current.filter(item => item.id !== row.id)); }
            catch { setError('移除回放失败'); }
          }}>{t('移除')}</button>
        </div>)}</div>
      {!saved.length && <p className="muted">{t('回放库为空。')}</p>}
    </section>
  </main>;
}

function ReplayPlayer({ name, replay, close, drafts, capture }: {
  name: string; replay: Replay; close: () => void; drafts: Strategy[];
  capture: (map: string, name: string, page: Page, draftId?: string) => void;
}) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [highlight, setHighlight] = useState('');
  const [perspective, setPerspective] = useState('auto');
  const [filter, setFilter] = useState('');
  const [destination, setDestination] = useState('');
  const [drawing, setDrawing] = useState(false);
  const [ink, setInk] = useState<Drawing[]>([]);
  const [stroke, setStroke] = useState<Point[]>([]);
  const [walls, setWalls] = useState<SightSegment[]>([]);
  const pointer = useRef<number | undefined>(undefined);
  const { doc, map } = replay;
  const duration = doc.match.durationMs;
  const round = doc.rounds.find(row => row.startMs <= time && row.endMs >= time);
  const attack = perspective === 'attack' || perspective === 'auto' && round?.attackingTeam !== 'Blue';
  const frame = mapArtworkFrame(map, attack);
  const page = useMemo(() => newPage(0, attack ? 'true' : 'false'), [attack]);
  const score = doc.rounds.filter(row => row.endMs < time).reduce((total, row) => {
    if (row.winningTeam === 'Red') total[0]++;
    if (row.winningTeam === 'Blue') total[1]++;
    return total;
  }, [0, 0]);
  const playerName = (id?: string) => {
    const player = doc.players.find(row => row.subject === id);
    return player && (replayAgent(player) ?? player.team) || '未知选手';
  };
  const markers = doc.players.flatMap(player => {
    const position = replayPosition(replay, player, time);
    if (!position) return [];
    const marker = makeAgent(replayAgent(player) ?? '?', position.position, player.team === 'Red');
    return [{ ...marker, id: player.subject, kind: 'viewCone', rotation: position.rotation, length: 88,
      state: replayHealth(replay, player, time) === 0 ? 'dead' : 'none' }];
  });
  const abilities = replayUtilityAt(replay, time, round);
  const spike = replaySpikeAt(replay, time, round);
  const doors = replayDoorsAt(replay, time, round);
  const blockers = [...walls, ...sightDoorWalls(map, attack, doors.changed)];
  const events = useMemo(() => [
    ...(doc.kills ?? []).map(row => ({ time: row.timeMs, kind: '击杀', text: `${playerName(row.killer)} → ${playerName(row.victim)}` })),
    ...(doc.casts ?? []).map(row => ({ time: row.timeMs, kind: '技能', text: `${playerName(row.subject)} · ${replayCastName(row)}` })),
    ...doc.rounds.flatMap(row => [
      ...(row.plant ? [{ time: row.plant.timeMs, kind: '爆能器', text: `安装 ${row.plant.site ?? ''}` }] : []),
      ...(row.defuse ? [{ time: row.defuse.timeMs, kind: '爆能器', text: '拆除' }] : []),
      ...(row.detonateMs ? [{ time: row.detonateMs, kind: '爆能器', text: '爆炸' }] : []),
    ]),
  ].filter(event => Number.isFinite(event.time)).sort((a, b) => a.time - b.time), [doc]);

  useEffect(() => {
    let live = true;
    setWalls([]);
    void loadSightWalls(map, attack).then(value => { if (live) setWalls(value); }).catch(() => {});
    return () => { live = false; };
  }, [map, attack]);

  useEffect(() => {
    if (!playing) return;
    let timer: number;
    let prior = performance.now();
    function tick(now: number) {
      const elapsed = Math.max(0, now - prior) * speed;
      prior = now;
      setTime(value => Math.min(duration, value + elapsed));
      timer = requestAnimationFrame(tick);
    }
    timer = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(timer);
  }, [playing, speed, duration]);
  useEffect(() => { if (time >= duration) setPlaying(false); }, [time >= duration]);

  function pointAt(event: React.PointerEvent<SVGSVGElement>) {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return point(0, 0);
    const cursor = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return project(point(cursor.x, cursor.y), attack);
  }

  return <main className="library">
    <section className="library-content">
      <div className="library-heading">
        <div><h1>{map.name} {' '}{t('· 比赛回放')}</h1><p>{name} {' '}{t('· 红方')}{' '} {score[0]} : {score[1]} {' '}{t('蓝方')}</p></div>
        <button type="button" className="button secondary" onClick={close}><ArrowLeft size={16} />{t('返回回放库')}</button>
      </div>
      <div className="replay-layout">
        <VisionWalls.Provider value={blockers}>
          <svg className="replay-map" viewBox={`${frame.x - 24} ${frame.y - 24} ${frame.width + 48} ${frame.height + 48}`}
            onPointerDown={event => {
              if (!drawing || event.button !== 0) return;
              setPlaying(false); pointer.current = event.pointerId; setStroke([pointAt(event)]);
              event.currentTarget.setPointerCapture(event.pointerId);
            }} onPointerMove={event => {
              if (pointer.current !== event.pointerId) return;
              const cursor = pointAt(event); setStroke(current => [...current, cursor]);
            }} onPointerUp={event => {
              if (pointer.current !== event.pointerId) return;
              pointer.current = undefined;
              if (stroke.length > 1) setInk(current => [...current, { id: newId(), listOfPoints: stroke, thickness: 5 }]);
              setStroke([]);
            }} onPointerCancel={() => { pointer.current = undefined; setStroke([]); }}>
            <MapArtwork map={map} attack={attack} layers={standardLayers} />
            <MapDoorBars map={map} attack={attack} changed={doors.changed} amounts={doors.amounts} active={false} toggle={() => {}} />
            {abilities.map(marker => <CanvasObject key={marker.id} item={marker} collection="abilityData" map={map}
              page={page} version={112} selected={false} animate={false} media={{}} />)}
            {spike && <CanvasObject item={spike} collection="utilityData" map={map} page={page}
              version={112} selected={false} animate={false} media={{}} />}
            {markers.filter(marker => !highlight || marker.id === highlight).map(marker =>
              <CanvasObject key={marker.id} item={marker} collection="agentData" map={map} page={page} version={112}
                selected={marker.id === highlight} animate={false} media={{}} />)}
            {ink.map(row => <DrawingArt key={row.id} drawing={row} attack={attack} mapScale={map.scale} />)}
            {!!stroke.length && <DrawingArt drawing={{ id: 'stroke', listOfPoints: stroke }} attack={attack} mapScale={map.scale} />}
          </svg>
        </VisionWalls.Provider>
        <section className="replay-roster">
          <h2>{t('阵容')}</h2>
          <div>{doc.players.map(player => <button className={`button subtle ${highlight === player.subject ? 'active' : ''}`}
            key={player.subject} type="button" onClick={() => setHighlight(value => value === player.subject ? '' : player.subject)}>
            {replayAgent(player) ?? '未知英雄'} · {player.team === 'Red' ? '红' : '蓝'} · {replayHealth(replay, player, time) ?? '—'}
          </button>)}</div>
          <h2>{t('事件')}</h2>
          <label className="field">{t('筛选')}<select value={filter} onChange={event => setFilter(event.target.value)}>
            {['', '击杀', '技能', '爆能器'].map(kind => <option value={kind} key={kind}>{kind || t('全部')}</option>)}
          </select></label>
          <div className="replay-events">{events.filter(event => (!filter || event.kind === filter) &&
            (!round || event.time >= round.startMs && event.time <= round.endMs)).map((event, index) =>
            <button className="button subtle" type="button" key={index} onClick={() => { setTime(event.time); setPlaying(false); }}>
              {stamp(event.time)} · {event.text}
            </button>)}</div>
        </section>
      </div>
      <div className="replay-controls">
        <IconButton label={playing ? t('暂停') : t('播放')} onClick={() => { if (time >= duration) setTime(0); setPlaying(value => !value); }}>
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </IconButton>
        <span>{stamp(time)} / {stamp(duration)}</span>
        <input aria-label={t('回放时间')} type="range" min="0" max={duration} value={time} onChange={event => setTime(Number(event.target.value))} />
        <select aria-label={t('回合')} value={round?.index ?? ''} onChange={event => {
          const selected = doc.rounds.find(row => String(row.index) === event.target.value); if (selected) setTime(selected.startMs);
        }}><option value="">{t('回合')}</option>{doc.rounds.map(row => <option key={row.index} value={row.index}>{t('第')}{' '} {row.index + 1} {' '}{t('回合')}</option>)}</select>
        <select aria-label={t('倍速')} value={speed} onChange={event => setSpeed(Number(event.target.value))}>
          {[.25, .5, 1, 1.5, 2].map(rate => <option key={rate} value={rate}>{rate}×</option>)}
        </select>
        <select aria-label={t('地图朝向')} value={perspective} onChange={event => setPerspective(event.target.value)}>
          <option value="auto">{t('自动')}</option><option value="attack">{t('进攻')}</option><option value="defense">{t('防守')}</option>
        </select>
      </div>
      <div className="replay-controls">
        <button className={`button secondary ${drawing ? 'active' : ''}`} type="button" onClick={() => { setDrawing(value => !value); setPlaying(false); }}>{t('复盘画笔')}</button>
        <button className="button subtle" type="button" onClick={() => setInk([])} disabled={!ink.length}>{t('清除画笔')}</button>
        <select aria-label={t('保存到战术')} value={destination} onChange={event => setDestination(event.target.value)}>
          <option value="">{t('新建战术')}</option>{drafts.filter(row => row.document.mapData === map.id).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
        <button className="button primary" type="button" onClick={() => {
          const doorPage = mapDoors(map).filter(door => doors.changed.has(door.id))
            .reduce((current, door) => toggleMapDoor(current, door, map, 112), page);
          capture(map.id, `${map.name} 复盘 ${stamp(time)}`, { ...doorPage, id: newId(),
            agentData: markers.map(marker => ({ ...marker, id: newId() })), drawingData: ink.map(row => ({ ...row, id: newId() })),
            abilityData: abilities.map(marker => ({ ...marker, id: newId() })),
            utilityData: [...doorPage.utilityData, ...(spike ? [{ ...spike, id: newId() }] : [])],
          }, destination || undefined);
        }}>{t('抓取当前画面')}</button>
      </div>
    </section>
  </main>;
}
