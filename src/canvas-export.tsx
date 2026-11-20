import { displayPageName as pageName, t } from './locale.ts';
import { renderToStaticMarkup } from 'react-dom/server';
import { zipSync } from 'fflate';
import { saveDownload } from './archive.ts';
import { CanvasObject, LineupArt, MapArtwork, MapDoorBars, VisionHeight, VisionWalls, type MapLayers } from './BoardArt.tsx';
import { cssColor, mapArtworkFrame, mapById } from './catalog.ts';
import { pageIsAttack, uprightDimensions, uprightPosition } from './geometry.ts';
import { changedMapDoors, findMapDoor } from './map-doors.ts';
import { loadSightWalls, sightDoorWalls } from './map-vision.ts';
import { loadHeightModel } from './height-vision.ts';
import { drawingCollections, type Page, type Strategy, type TextMarker } from './strategy.ts';
import { formattedLines } from './text-content.ts';
import { parsePalette, themedMap } from './preferences.ts';
import { quickTimeFrame, transparentMovie } from './quicktime-animation.ts';

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_').trim() || '战术';
const fileBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());
const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

type ExportOptions = { transparent: boolean; captions: boolean; width: number; layers: MapLayers };

function SnapshotText({ item, page, version }: { item: TextMarker; page: Page; version: number }) {
  const position = uprightPosition(item, page, version);
  const size = item.fontSize ?? 16;
  const box = uprightDimensions(item);
  const maxChars = Math.max(1, Math.floor((box.dx - 16) / (size * .62)));
  const lines = formattedLines(item.text).flatMap(line => {
    const prefix = line.kind === 'bullet' ? '• ' : line.kind === 'number' ? `${line.number}. ` : '';
    const characters = [...(prefix + line.parts.map(part => part.text).join(''))];
    const wrapped = [];
    do { wrapped.push({ text: characters.splice(0, maxChars).join(''), heading: line.kind === 'heading' }); }
    while (characters.length);
    return wrapped;
  });
  return <g transform={`translate(${position.dx} ${position.dy})`}>
    <rect width={box.dx} height={lines.length * size * 1.4 + 14} rx="4" fill="#221c2b" stroke="#6a577f" />
    <rect width="4" height={lines.length * size * 1.4 + 14} rx="2" fill={cssColor(item.tagColorValue, '#976afa')} />
    <text x="10" fill="#f4f0fa" fontSize={size}>{lines.map((line, index) => <tspan key={index} x="10"
      y={size * (index * 1.4 + 1) + 5} fontWeight={line.heading ? '700' : undefined}>{line.text}</tspan>)}</text>
  </g>;
}

async function snapshot(
  strategy: Strategy, page: Page, media: Record<string, string>, options: ExportOptions, signal: AbortSignal,
  cached: Map<string, Promise<string>>,
): Promise<HTMLCanvasElement> {
  const map = mapById[strategy.document.mapData];
  const version = Number(strategy.document.versionNumber);
  const attack = pageIsAttack(page);
  const frame = mapArtworkFrame(map, attack);
  const changed = new Set(changedMapDoors(page, map));
  const doors = sightDoorWalls(map, attack, changed);
  const [flat, model] = await Promise.all([
    loadSightWalls(map, attack).catch(() => []), loadHeightModel(map, attack).catch(() => undefined),
  ]);
  const walls = [...flat, ...doors];
  const palette = parsePalette(strategy.document.themePalette);
  const mapImage = palette && await themedMap(`maps/${map.id}_map${attack ? '' : '_defense'}.svg`, palette);
  signal.throwIfAborted();
  const captions = options.captions ? drawingCollections.flatMap(key => page[key].flatMap(item =>
    'caption' in item && item.caption?.trim() && !item.isDeleted && !findMapDoor(item, map) ? [item.caption.trim()] : [])) : [];
  let captionY = 42;
  const captionRows = captions.map((caption, index) => {
    const lines = caption.split('\n').flatMap(paragraph => {
      const chars = [...paragraph];
      const result = [];
      do { result.push(chars.splice(0, 17).join('')); } while (chars.length);
      return result;
    });
    const y = captionY;
    captionY += lines.length * 18 + 12;
    return { index, y, lines };
  });
  const mapWidth = frame.width + 48;
  const mapHeight = frame.height + 48;
  const viewWidth = mapWidth + (captions.length ? 310 : 0);
  const viewHeight = Math.max(mapHeight, captionY + 36);
  const outputHeight = Math.round(options.width * viewHeight / viewWidth);
  const markup = renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={options.width} height={outputHeight}
    viewBox={`${frame.x - 24} ${frame.y - 24} ${viewWidth} ${viewHeight}`} fontFamily="Arial, sans-serif">
    <style>{'.svg-note{fill:#f2edf9;font-size:17px;font-weight:600;paint-order:stroke;stroke:#141019;stroke-width:3px}.map-door-line{stroke:#d0a06d;stroke-width:4}.map-door-raised{opacity:.55}'}</style>
    {!options.transparent && <rect x={frame.x - 24} y={frame.y - 24} width={viewWidth} height={viewHeight} fill="#17151f" />}
    <MapArtwork map={map} attack={attack} layers={options.layers} mapImage={mapImage} />
    <MapDoorBars map={map} attack={attack} active={false} changed={changed} toggle={() => {}} />
    <VisionWalls.Provider value={walls}><VisionHeight.Provider value={model ? { model, doors } : null}>
      {(['imageData', 'utilityData', 'abilityData', 'agentData', 'drawingData'] as const).flatMap(collection =>
        page[collection].filter(item => !findMapDoor(item, map)).map(item =>
          <CanvasObject key={`${collection}-${item.id}`} item={item} collection={collection} map={map} page={page}
            version={version} selected={false} animate={false} media={media} />))}
      {page.textData.filter(item => !item.isDeleted).map(item => <SnapshotText key={item.id} item={item} page={page} version={version} />)}
      <LineupArt page={page} map={map} version={version} active={false} onOpen={() => {}} />
    </VisionHeight.Provider></VisionWalls.Provider>
    {!!captions.length && <g transform={`translate(${frame.x + frame.width + 28} ${frame.y})`}>
      <rect x="-10" y="-6" width="280" height={captionY} rx="8" fill="#211c2b" stroke="#6a577f" />
      <text fill="#f3eaff" fontSize="20" y="20">{t('对象标注')}</text>
      {captionRows.map(({ index, y, lines }) => <text key={index} fill="#e8dff3" fontSize="14" y={y}>
        {lines.map((line, i) => <tspan key={i} x={i === 0 ? 0 : 18} y={y + i * 18}>
          {i === 0 ? `${index + 1}. ${line}` : line}
        </tspan>)}
      </text>)}
    </g>}
  </svg>);
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('无法生成截图图层');
  await Promise.all([...doc.querySelectorAll('image')].map(async element => {
    const source = element.getAttribute('href');
    if (!source || source.startsWith('data:')) return;
    let inline = cached.get(source);
    if (!inline) {
      inline = fetch(new URL(source, document.baseURI), { signal }).then(response => {
        if (!response.ok) throw new Error('未能加载截图所需的地图或图片');
        return response.blob();
      }).then(dataUrl);
      cached.set(source, inline);
    }
    element.setAttribute('href', await inline);
  }));
  signal.throwIfAborted();
  const image = new Image();
  image.src = await dataUrl(new Blob([new XMLSerializer().serializeToString(doc.documentElement)], { type: 'image/svg+xml;charset=utf-8' }));
  await image.decode();
  signal.throwIfAborted();
  const canvas = document.createElement('canvas');
  canvas.width = options.width;
  canvas.height = outputHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器画布不可用');
  ctx.drawImage(image, 0, 0);
  return canvas;
}

export async function exportScreenshots(strategy: Strategy, pages: Page[], media: Record<string, string>, options: ExportOptions,
  signal: AbortSignal, progress: (completed: number) => void) {
  const files: Record<string, Uint8Array> = {};
  const cache = new Map<string, Promise<string>>();
  for (const [index, page] of pages.entries()) {
    const canvas = await snapshot(strategy, page, media, options, signal, cache);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法编码 PNG')), 'image/png'));
    files[`${String(index + 1).padStart(2, '0')}-${safeName(pageName(page))}.png`] = await fileBytes(png);
    progress(index + 1);
  }
  signal.throwIfAborted();
  const name = safeName(strategy.name);
  if (pages.length === 1) saveDownload(Object.values(files)[0], name + '.png', 'image/png');
  else saveDownload(zipSync(files, { level: 0 }), name + '.zip', 'application/zip');
}

export function videoType() {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return;
  return ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
}

export async function exportVideo(strategy: Strategy, pages: Page[], media: Record<string, string>, options: ExportOptions,
  seconds: number, signal: AbortSignal, progress: (completed: number) => void) {
  if (options.transparent) {
    const cache = new Map<string, Promise<string>>();
    const frames: Uint8Array[] = [];
    const canvas = document.createElement('canvas');
    canvas.width = options.width;
    canvas.height = Math.round(options.width * 9 / 16);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    for (const [index, page] of pages.entries()) {
      const frame = await snapshot(strategy, page, media, options, signal, cache);
      const ratio = Math.min(canvas.width / frame.width, canvas.height / frame.height);
      const w = frame.width * ratio, h = frame.height * ratio;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frame, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      frames.push(quickTimeFrame(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height));
      progress(index + 1);
      await new Promise(resolve => setTimeout(resolve, 0));
      signal.throwIfAborted();
    }
    saveDownload(transparentMovie(frames, canvas.width, canvas.height, seconds * 1000),
      safeName(strategy.name) + '.mov', 'video/quicktime');
    return;
  }
  const type = videoType();
  if (!type) throw new Error('当前浏览器没有可用的视频编码器');
  const cache = new Map<string, Promise<string>>();
  const frames: HTMLCanvasElement[] = [];
  for (const page of pages) frames.push(await snapshot(strategy, page, media, { ...options, transparent: false }, signal, cache));
  signal.throwIfAborted();
  const canvas = document.createElement('canvas');
  canvas.width = options.width;
  canvas.height = Math.ceil(Math.max(...frames.map(frame => frame.height)) / 2) * 2;
  const ctx = canvas.getContext('2d')!;
  const stream = canvas.captureStream(30);
  let recorder: MediaRecorder | undefined;
  let frameRequest = 0;
  let cancel = () => {};
  try {
    recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: options.width <= 1000 ? 2_500_000 : 7_000_000 });
    const writer = recorder;
    const chunks: Blob[] = [];
    const recorded = new Promise<Blob>((resolve, reject) => {
      writer.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      writer.onstop = () => resolve(new Blob(chunks, { type }));
      writer.onerror = () => reject(new Error('视频编码失败'));
    });
    writer.start();
    const duration = seconds * 1000;
    const start = performance.now();
    let last = -1;
    const cancelled = new Promise<void>((_, reject) => {
      cancel = () => reject(signal.reason);
      signal.addEventListener('abort', cancel, { once: true });
    });
    await Promise.race([recorded.then(() => {}), cancelled, new Promise<void>((resolve, reject) => {
      function draw(now: number) {
        if (signal.aborted) { reject(signal.reason); return; }
        const elapsed = Math.max(0, now - start);
        const index = Math.min(frames.length - 1, Math.floor(elapsed / duration));
        if (index !== last) { last = index; progress(index + 1); }
        ctx.fillStyle = '#17151f';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(frames[index], 0, (canvas.height - frames[index].height) / 2);
        const mix = (elapsed % duration - duration + 280) / 280;
        if (index < frames.length - 1 && mix > 0 && mix < 1) {
          ctx.globalAlpha = mix;
          ctx.drawImage(frames[index + 1], 0, (canvas.height - frames[index + 1].height) / 2);
          ctx.globalAlpha = 1;
        }
        if (elapsed >= duration * frames.length) resolve();
        else frameRequest = requestAnimationFrame(draw);
      }
      frameRequest = requestAnimationFrame(draw);
    })]);
    if (writer.state !== 'inactive') writer.stop();
    const blob = await recorded;
    signal.throwIfAborted();
    if (!blob.size) throw new Error('浏览器未生成视频内容');
    saveDownload(await fileBytes(blob), safeName(strategy.name) + (type === 'video/mp4' ? '.mp4' : '.webm'), type);
  } finally {
    signal.removeEventListener('abort', cancel);
    cancelAnimationFrame(frameRequest);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach(track => track.stop());
  }
}
