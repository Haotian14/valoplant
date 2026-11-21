import { displayPageName as pageName, t } from './locale.ts';
import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Pause, Pencil, Play } from 'lucide-react';
import Board from './Board.tsx';
import { mapById } from './catalog.ts';
import { parsePalette, readPreferences } from './preferences.ts';
import type { LineupLink, Strategy } from './strategy.ts';
import { useMediaUrls } from './use-media-urls.ts';
import { useStrategyPlayback } from './use-strategy-playback.ts';
import { IconButton, Modal } from './ui.tsx';

const ignore = () => {};
const brush = { color: '#eeeaf8', width: 5, dotted: false, arrow: false, timing: false, speed: 'running' };

export default function StrategyViewer({ strategy, close, edit }: {
  strategy: Strategy; close: () => void; edit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [caption, setCaption] = useState<string>();
  const [lineup, setLineup] = useState<LineupLink>();
  const [preferences] = useState(readPreferences);
  const media = useMediaUrls(strategy.media);
  const { pages } = strategy.document;
  const { playing, setPlaying, animate, transitionFrom, changePage, togglePlayback } = useStrategyPlayback(pages, index, setIndex);
  const page = pages[index];
  const map = mapById[strategy.document.mapData];

  useEffect(() => {
    function turn(event: KeyboardEvent) {
      if (caption || lineup || event.defaultPrevented || event.target instanceof HTMLSelectElement ||
          event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      changePage(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
    window.addEventListener('keydown', turn);
    return () => window.removeEventListener('keydown', turn);
  }, [caption, lineup, changePage, index]);

  return <main className="editor strategy-viewer">
    <header className="editor-header">
      <IconButton label={t('返回战术库')} onClick={close}><ArrowLeft size={20} /></IconButton>
      <strong title={strategy.name}>{strategy.name}</strong>
      <button className="button subtle" type="button" onClick={edit}><Pencil size={15} />{t('编辑战术')}</button>
    </header>
    <div className="canvas-area">
      <Board readOnly map={map} page={page} version={Number(strategy.document.versionNumber)} tool="hand"
        brush={brush} placement={null} viewport={null} animate={animate} transitionFrom={transitionFrom} layers={preferences.layers}
        coneOpacity={preferences.coneOpacity / 100} theme={parsePalette(strategy.document.themePalette)}
        selection={[]} media={media} hideAgents={false}
        onSelect={ignore} onContext={ignore} onEdit={ignore} onTextChange={ignore}
        onDismissAbilities={ignore} onHover={ignore} onDraw={ignore} onMove={ignore} onTransform={ignore}
        onDoorToggle={ignore} onErase={ignore} onPlace={ignore} onImageDrop={ignore}
        onLineupMove={ignore} onLineupEndpoint={ignore}
        onReadCaption={text => { setPlaying(false); setCaption(text); }}
        onLineupOpen={link => { setPlaying(false); setLineup(link); }} />
    </div>
    <nav className="viewer-pages" aria-label={t('战术翻页')}>
      <IconButton label={t(playing ? '暂停播放' : '播放战术')} className={playing ? 'active' : ''}
        onClick={togglePlayback} disabled={pages.length < 2}>{playing ? <Pause size={22} /> : <Play size={22} />}</IconButton>
      <IconButton label={t('上一页')} disabled={index === 0} onClick={() => changePage(index - 1)}><ChevronLeft size={22} /></IconButton>
      <select aria-label={t('当前页')} value={index} onChange={event => changePage(Number(event.target.value))}>
        {pages.map((row, idx) => <option value={idx} key={row.id}>{pageName(row)}</option>)}
      </select>
      <IconButton label={t('下一页')} disabled={index === pages.length - 1} onClick={() => changePage(index + 1)}><ChevronRight size={22} /></IconButton>
    </nav>
    {caption && <Modal title={t('对象标注')} onClose={() => setCaption(undefined)}><p className="caption-content">{caption}</p></Modal>}
    {lineup && <Modal title={lineup.name || 'Lineup'} onClose={() => setLineup(undefined)}>
      {lineup.notes && <p className="caption-content">{lineup.notes}</p>}
      {/^https?:\/\//.test(lineup.youtubeLink) && <a href={lineup.youtubeLink} target="_blank" rel="noreferrer">{t('打开参考视频')}</a>}
      <div className="viewer-lineup-images">{lineup.images.map(image => {
        const url = media[image.id + image.fileExtension];
        return url && <a key={image.id} href={url} target="_blank" rel="noreferrer"><img src={url} alt={t('Lineup 参考图')} /></a>;
      })}</div>
    </Modal>}
  </main>;
}
