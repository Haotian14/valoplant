import { displayPageName as pageName, t } from './locale.ts';
import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui.tsx';
import type { Strategy } from './strategy.ts';
import type { MapLayers } from './BoardArt.tsx';

export default function CanvasExportDialog({ strategy, pageId, layers, media, mode, close, notify }: {
  strategy: Strategy; pageId: string; layers: MapLayers; media: Record<string, string>;
  mode: 'image' | 'video'; close: () => void; notify: (message: string) => void;
}) {
  const pages = strategy.document.pages;
  const controller = useRef<AbortController | undefined>(undefined);
  const [selected, setSelected] = useState<string[]>(mode === 'video' ? pages.map(page => page.id) : [pageId]);
  const [width, setWidth] = useState(1920);
  const [seconds, setSeconds] = useState(2);
  const [transparent, setTransparent] = useState(false);
  const [captions, setCaptions] = useState(false);
  const [encoding, setEncoding] = useState<number>();
  const [error, setError] = useState('');

  useEffect(() => () => controller.current?.abort(), []);

  async function run() {
    if (controller.current || !selected.length) return;
    const abort = new AbortController();
    controller.current = abort;
    setEncoding(0);
    setError('');
    try {
      const { exportScreenshots, exportVideo } = await import('./canvas-export.tsx');
      const selectedPages = pages.filter(page => selected.includes(page.id));
      const options = { width, transparent, captions, layers };
      if (mode === 'image') await exportScreenshots(strategy, selectedPages, media, options, abort.signal, setEncoding);
      else await exportVideo(strategy, selectedPages, media, options, seconds, abort.signal, setEncoding);
      notify(t(mode === 'image' ? '截图已导出' : '视频已导出'));
      close();
    } catch (error) {
      if (!abort.signal.aborted) setError(t(error instanceof Error ? error.message : '导出失败'));
    } finally {
      controller.current = undefined;
      setEncoding(undefined);
    }
  }

  return <Modal title={mode === 'image' ? t('导出截图') : t('导出视频')} onClose={close}>
    <form onSubmit={event => { event.preventDefault(); void run(); }}>
      <fieldset disabled={encoding !== undefined} className="export-fields">
        <label className="field">{t('画面宽度')}<select value={width} onChange={event => setWidth(Number(event.target.value))}>
          <option value={960}>960 px</option><option value={1280}>1280 px</option><option value={1920}>1920 px</option>
        </select></label>
        {mode === 'video' && <label className="field">{t('每页停留时间（秒）')}
          <input type="number" min="1" max="10" step=".5" value={seconds} onChange={event => setSeconds(Number(event.target.value))} required />
        </label>}
        <label className="check-field"><input type="checkbox"
          checked={transparent} onChange={event => setTransparent(event.target.checked)} />{mode === 'image' ? t('透明背景') : t('透明 MOV')}</label>
        <label className="check-field"><input type="checkbox" checked={captions} onChange={event => setCaptions(event.target.checked)} />{t('包含对象标注')}</label>
        <div className="export-page-controls"><strong>{t('页面')}</strong>
          <button className="button subtle" type="button" onClick={() => setSelected(pages.map(page => page.id))}>{t('全选')}</button>
          <button className="button subtle" type="button" onClick={() => setSelected([])}>{t('清空选择')}</button>
        </div>
        <div className="export-page-list">
          {pages.map(page => <label className="check-field" key={page.id}><input type="checkbox" checked={selected.includes(page.id)}
            onChange={event => setSelected(current => event.target.checked ? [...current, page.id] : current.filter(id => id !== page.id))} />
            {pageName(page)}</label>)}
        </div>
      </fieldset>
      {mode === 'video' && <p className="muted compact">{transparent
        ? '透明 MOV 按页切换。' : '导出期间请保持此标签页在前台。支持 MP4 时优先使用 MP4，否则使用 WebM。'}</p>}
      {error && <p role="alert" className="banner">{error}</p>}
      {encoding !== undefined && <p role="status">{t('正在导出')}{' '} {encoding} / {selected.length} {' '}{t('页')}</p>}
      <div className="modal-actions">
        {encoding !== undefined
          ? <button className="button subtle" type="button" onClick={() => controller.current?.abort()}>{t('取消导出')}</button>
          : <button className="button primary" type="submit" disabled={!selected.length}>{t('下载')}</button>}
      </div>
    </form>
  </Modal>;
}
