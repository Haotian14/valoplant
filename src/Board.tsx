import { useEffect, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent } from 'react';
import { Crosshair, Minus, Plus } from 'lucide-react';
import { CanvasObject, DrawingArt, LineupArt, MapArtwork, type MapLayers } from './BoardArt.tsx';
import { mapById, point, project, subtract, worldHeight, worldWidth, type MapInfo, type Point } from './catalog.ts';
import { canonicalMarkers, drawingColor, pageIsAttack, worldMarker } from './geometry.ts';
import {
  bounds, drawingCollections, moveItem, newId, positionOf,
  type CanvasSelection, type Drawing, type LineupLink, type Page,
} from './strategy.ts';

export const drawingTools = ['pencil', 'line', 'arrow', 'rectangle', 'ellipse'] as const;
type DrawingTool = typeof drawingTools[number];
export type Tool = DrawingTool | 'select' | 'hand' | 'eraser' | 'text' | 'lineup' | 'place';
export type Placement =
  | { kind: 'agent'; type: string; ally: boolean }
  | { kind: 'ability'; type: string; index: number; ally: boolean }
  | { kind: 'utility'; type: string; ally: boolean };
export type Brush = { color: string; width: number; dotted: boolean; arrow: boolean; timing: boolean };

const initialCamera = { x: worldWidth / 2, y: 500, zoom: 1 };
const dragKey = 'application/x-team-playbook-marker';
const distance = (a: Point, b: Point) => Math.hypot(a.dx - b.dx, a.dy - b.dy);
const keyOf = (selection: CanvasSelection) => `${selection.collection}:${selection.id}`;

export function startPlacementDrag(event: DragEvent<HTMLElement>, placement: Placement) {
  event.dataTransfer.setData(dragKey, JSON.stringify(placement));
  event.dataTransfer.effectAllowed = 'copy';
}

export function drawingFrom(tool: DrawingTool, points: Point[], brush: Brush): Drawing {
  const first = points[0], last = points[points.length - 1];
  const style = { id: newId(), colorValue: drawingColor(brush.color), thickness: brush.width,
    isDotted: brush.dotted, hasArrow: tool === 'arrow' || brush.arrow, boundingBox: bounds(points),
    showTraversalTime: brush.timing && tool !== 'rectangle' && tool !== 'ellipse', traversalSpeedProfile: 'running' };
  if (tool === 'pencil') return { ...style, type: 'freeDrawing', listOfPoints: points };
  if (tool === 'rectangle' || tool === 'ellipse') {
    return { ...style, type: tool === 'rectangle' ? 'rectangleDrawing' : 'ellipseDrawing', start: first, end: last };
  }
  return { ...style, type: 'lineDrawing', lineStart: first, lineEnd: last };
}

function hitSelection(target: EventTarget | null): CanvasSelection | undefined {
  if (!(target instanceof Element)) return;
  const object = target.closest('[data-collection][data-object-id]');
  if (!object) return;
  const collection = object.getAttribute('data-collection') as CanvasSelection['collection'];
  return { collection, id: object.getAttribute('data-object-id')! };
}

type Gesture =
  | { kind: 'pan'; pointerId: number; base: typeof initialCamera; screen: Point; unitsPerPixel: number }
  | { kind: 'draw'; pointerId: number; tool: DrawingTool; points: Point[] }
  | { kind: 'move'; pointerId: number; start: Point; items: CanvasSelection[] }
  | { kind: 'marquee'; pointerId: number; start: Point; prior: CanvasSelection[] }
  | { kind: 'erase'; pointerId: number; items: CanvasSelection[] };

type Props = {
  map: MapInfo; page: Page; version: number; tool: Tool; brush: Brush; placement: Placement | null;
  animate: boolean; layers: MapLayers; selection: CanvasSelection[]; media: Record<string, string>;
  lineupOrigin: Point | null;
  onSelect: (items: CanvasSelection[]) => void;
  onContext: (item: CanvasSelection, screen: Point) => void;
  onEdit: (item: CanvasSelection) => void;
  onHover: (item: CanvasSelection | undefined, position: Point) => void;
  hideAgents: boolean;
  onDraw: (drawing: Drawing) => void;
  onMove: (items: CanvasSelection[], delta: Point) => void;
  onErase: (items: CanvasSelection[]) => void;
  onPlace: (placement: Placement, worldPosition: Point) => void;
  onText: (worldPosition: Point) => void;
  onLineupPoint: (worldPosition: Point) => void;
  onLineupOpen: (link: LineupLink) => void;
};

export default function Board(props: Props) {
  const { map, page, version, tool, brush, placement } = props;
  const root = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const space = useRef(false);
  const [aspect, setAspect] = useState(1.4);
  const [camera, setCamera] = useState(initialCamera);
  const [drawingPreview, setDrawingPreview] = useState<Drawing>();
  const [movePreview, setMovePreview] = useState<{ ids: Set<string>; delta: Point }>();
  const [marquee, setMarquee] = useState<{ start: Point; end: Point }>();
  const [lineupCursor, setLineupCursor] = useState<Point>();
  const [erased, setErased] = useState<Set<string>>(new Set());

  const artworkWidth = Math.min(1240, worldHeight * map.width / map.height);
  const height = Math.max(1120, (artworkWidth + 120) / aspect) / camera.zoom;
  const width = height * aspect;
  const left = camera.x - width / 2, top = camera.y - height / 2;
  const attack = pageIsAttack(page);

  function worldAt(clientX: number, clientY: number): Point {
    const svg = root.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return point(camera.x, camera.y);
    const local = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return point(local.x, local.y);
  }

  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setAspect(entry.contentRect.width / entry.contentRect.height);
      }
    });
    observer.observe(svg);
    function keydown(e: KeyboardEvent) {
      if (e.code !== 'Space' || (e.target instanceof HTMLElement && e.target.closest('input,textarea,button,[contenteditable]'))) return;
      e.preventDefault();
      space.current = true;
    }
    function keyup(e: KeyboardEvent) { if (e.code === 'Space') space.current = false; }
    function blur() { space.current = false; }
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    return () => {
      observer.disconnect();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const pointer = worldAt(event.clientX, event.clientY);
      const multiplier = Math.exp(-Math.max(-90, Math.min(90, event.deltaY)) * .003);
      setCamera(previous => {
        const zoom = Math.max(.42, Math.min(8, previous.zoom * multiplier));
        const ratio = previous.zoom / zoom;
        return { zoom, x: pointer.dx + (previous.x - pointer.dx) * ratio, y: pointer.dy + (previous.y - pointer.dy) * ratio };
      });
    }
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, [camera.x, camera.y]);

  function onDown(event: PointerEvent<SVGSVGElement>) {
    if (gesture.current || (event.button !== 0 && event.button !== 1)) return;
    if (event.button === 1) event.preventDefault();
    const p = worldAt(event.clientX, event.clientY);
    const pointerId = event.pointerId;
    const clicked = hitSelection(event.target);
    const screen = point(event.clientX, event.clientY);
    const drawingTool = drawingTools.find(candidate => candidate === tool);
    if (event.button === 1 || tool === 'hand' || space.current) {
      const unitsPerPixel = height / event.currentTarget.getBoundingClientRect().height;
      gesture.current = { kind: 'pan', pointerId, base: camera, screen, unitsPerPixel };
    } else if (tool === 'place' && placement) {
      props.onPlace(placement, p);
      return;
    } else if (tool === 'text') {
      props.onText(p);
      return;
    } else if (tool === 'lineup') {
      props.onLineupPoint(p);
      return;
    } else if (drawingTool) {
      gesture.current = { kind: 'draw', pointerId, tool: drawingTool, points: [project(p, attack)] };
    } else if (tool === 'eraser') {
      gesture.current = { kind: 'erase', pointerId, items: clicked ? [clicked] : [] };
      setErased(new Set(clicked ? [keyOf(clicked)] : []));
    } else if (clicked) {
      const selected = props.selection.some(item => keyOf(item) === keyOf(clicked));
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      const items = additive && selected
        ? props.selection.filter(item => keyOf(item) !== keyOf(clicked))
        : additive ? [...props.selection, clicked] : selected ? props.selection : [clicked];
      props.onSelect(items);
      if (!items.some(item => keyOf(item) === keyOf(clicked))) return;
      gesture.current = { kind: 'move', pointerId, start: p, items };
    } else {
      const prior = event.shiftKey ? props.selection : [];
      props.onSelect(prior);
      gesture.current = { kind: 'marquee', pointerId, start: p, prior };
    }
    if (gesture.current) event.currentTarget.setPointerCapture(pointerId);
  }

  function onMove(event: PointerEvent<SVGSVGElement>) {
    const active = gesture.current;
    const p = worldAt(event.clientX, event.clientY);
    if (!active) props.onHover(hitSelection(event.target), point(event.clientX, event.clientY));
    if (tool === 'lineup' && props.lineupOrigin) setLineupCursor(p);
    if (!active || active.pointerId !== event.pointerId) return;
    if (active.kind === 'pan') {
      setCamera({
        zoom: active.base.zoom,
        x: active.base.x - (event.clientX - active.screen.dx) * active.unitsPerPixel,
        y: active.base.y - (event.clientY - active.screen.dy) * active.unitsPerPixel,
      });
    } else if (active.kind === 'draw') {
      const cursor = project(p, attack);
      if (active.tool === 'pencil') {
        if (distance(active.points[active.points.length - 1], cursor) > 2) active.points.push(cursor);
      } else {
        active.points[1] = cursor;
      }
      if (active.points.length > 1) setDrawingPreview(drawingFrom(active.tool, active.points, brush));
    } else if (active.kind === 'move') {
      setMovePreview({ ids: new Set(active.items.map(keyOf)), delta: subtract(p, active.start) });
    } else if (active.kind === 'marquee') {
      setMarquee({ start: active.start, end: p });
    } else {
      const item = hitSelection(document.elementFromPoint(event.clientX, event.clientY));
      if (item && !active.items.some(prior => keyOf(prior) === keyOf(item))) {
        active.items.push(item);
        setErased(new Set(active.items.map(keyOf)));
      }
    }
  }

  function finish(event: PointerEvent<SVGSVGElement>, save: boolean) {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const cursor = worldAt(event.clientX, event.clientY);
    if (save && active.kind === 'draw') {
      const end = project(cursor, attack);
      if (active.tool !== 'pencil') active.points[1] = end;
      else if (distance(active.points.at(-1)!, end) > 2) active.points.push(end);
      if (active.points.length > 1 && (active.tool === 'pencil' || distance(active.points[0], end) > 1)) {
        props.onDraw(drawingFrom(active.tool, active.points, brush));
      }
    }
    if (save && active.kind === 'move' && distance(cursor, active.start) > 2) {
      props.onMove(active.items, subtract(cursor, active.start));
    }
    if (save && active.kind === 'erase' && active.items.length) props.onErase(active.items);
    if (save && active.kind === 'marquee' && distance(cursor, active.start) > 5) {
      const box = bounds([cursor, active.start])!;
      const selected = [...active.prior];
      for (const collection of drawingCollections) for (const item of page[collection]) {
        if ('isDeleted' in item && item.isDeleted) continue;
        const origin = positionOf(item);
        if (!origin) continue;
        const center = collection === 'drawingData' ? project(origin, attack) : worldMarker(item, collection, map, page, version);
        const selection = { collection, id: item.id };
        if (center.dx >= box.min.dx && center.dx <= box.max.dx && center.dy >= box.min.dy && center.dy <= box.max.dy &&
          !selected.some(prior => keyOf(prior) === keyOf(selection))) selected.push(selection);
      }
      props.onSelect(selected);
    }
    gesture.current = null;
    setDrawingPreview(undefined);
    setMovePreview(undefined);
    setMarquee(undefined);
    setErased(new Set());
  }

  function openContext(event: MouseEvent<SVGSVGElement>) {
    event.preventDefault();
    const clicked = hitSelection(event.target);
    if (clicked) props.onContext(clicked, point(event.clientX, event.clientY));
  }

  function drop(event: DragEvent<SVGSVGElement>) {
    const data = event.dataTransfer.getData(dragKey);
    if (!data) return;
    event.preventDefault();
    let dropped: Placement;
    try { dropped = JSON.parse(data) as Placement; } catch { return; }
    if (dropped && typeof dropped.type === 'string' && typeof dropped.ally === 'boolean') {
      props.onPlace(dropped, worldAt(event.clientX, event.clientY));
    }
  }

  const selectedKeys = new Set(props.selection.map(keyOf));
  const activeLineup = props.lineupOrigin && tool === 'lineup' ? project(props.lineupOrigin, canonicalMarkers(page, version)) : null;
  const markerOrder = ['imageData', 'utilityData', 'abilityData', 'agentData', 'drawingData', 'textData'] as const;
  return <div className="board-wrap">
    <svg ref={root} className={`board board-${tool}`} viewBox={`${left} ${top} ${width} ${height}`}
      role="img" aria-label={`${mapById[map.id]?.name} 战术画布`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={event => finish(event, true)}
      onPointerCancel={event => finish(event, false)} onContextMenu={openContext}
      onPointerLeave={() => props.onHover(undefined, point(0, 0))}
      onDoubleClick={event => {
        if (tool !== 'select') return;
        const item = hitSelection(document.elementFromPoint(event.clientX, event.clientY));
        if (item) props.onEdit(item);
      }}
      onDragOver={event => { if (event.dataTransfer.types.includes(dragKey)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
      onDrop={drop}>
      <defs>
        <pattern id="board-dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="6" cy="6" r="1.4" fill="#3c364a" />
        </pattern>
      </defs>
      {props.layers.grid && <rect {...{ x: left, y: top, width, height }} fill="url(#board-dots)" />}
      <MapArtwork map={map} attack={attack} layers={props.layers} />
      {markerOrder.filter(collection => !props.hideAgents || collection !== 'agentData').map(collection => <g key={collection} opacity={tool === 'lineup' ? .36 : 1}>
        {page[collection].map(item => {
          const key = keyOf({ collection, id: item.id });
          if (erased.has(key)) return null;
          const moved = movePreview?.ids.has(key);
          const attackCoordinates = collection === 'drawingData' ? attack : canonicalMarkers(page, version);
          const delta = movePreview?.delta;
          const movedItem = moved && delta ? moveItem(item, attackCoordinates ? delta : point(-delta.dx, -delta.dy)) : item;
          return <CanvasObject key={item.id} item={movedItem} collection={collection} map={map} page={page}
            version={version} selected={selectedKeys.has(key)} animate={props.animate && !moved} media={props.media} />;
        })}
      </g>)}
      <LineupArt page={page} map={map} version={version} active={tool === 'lineup'} onOpen={props.onLineupOpen} />
      {drawingPreview && <g pointerEvents="none"><DrawingArt drawing={drawingPreview} attack={attack} mapScale={map.scale} /></g>}
      {marquee && <rect x={Math.min(marquee.start.dx, marquee.end.dx)} y={Math.min(marquee.start.dy, marquee.end.dy)}
        width={Math.abs(marquee.start.dx - marquee.end.dx)} height={Math.abs(marquee.start.dy - marquee.end.dy)}
        stroke="#a783f4" fill="#9b6ef4" fillOpacity=".13" strokeWidth="2" strokeDasharray="6 4" pointerEvents="none" />}
      {activeLineup && <g pointerEvents="none">
        {lineupCursor && <line x1={activeLineup.dx} y1={activeLineup.dy} x2={lineupCursor.dx} y2={lineupCursor.dy}
          stroke="#bb9aff" strokeWidth="3" strokeDasharray="9 7" />}
        <circle cx={activeLineup.dx} cy={activeLineup.dy} r="12" fill="#8c65df" stroke="white" strokeWidth="2" />
      </g>}
    </svg>
    <div className="zoom-controls" aria-label="地图缩放">
      <button className="icon-button" type="button" onClick={() => setCamera(c => ({ ...c, zoom: Math.max(.42, c.zoom / 1.2) }))} title="缩小"><Minus size={15} /></button>
      <button className="zoom-value" type="button" onClick={() => setCamera(initialCamera)} title="重置视图">{Math.round(camera.zoom * 100)}%</button>
      <button className="icon-button" type="button" onClick={() => setCamera(c => ({ ...c, zoom: Math.min(8, c.zoom * 1.2) }))} title="放大"><Plus size={15} /></button>
      <button className="icon-button zoom-reset" type="button" onClick={() => setCamera(initialCamera)} title="适合窗口"><Crosshair size={15} /></button>
    </div>
  </div>;
}
