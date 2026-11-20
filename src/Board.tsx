import { useEffect, useImperativeHandle, useMemo, useRef, useState, type DragEvent, type MouseEvent, type PointerEvent, type Ref } from 'react';
import { Crosshair, Minus, Plus } from 'lucide-react';
import { distance, fitZoom, midpoint, pinchCamera, zoomAt } from './board-gestures.ts';
import { objectForPlacement, type Placement, type PlacementPreview } from './placement.ts';
import { CanvasObject, DrawingArt, LineupArt, MapArtwork, MapDoorBars, VisionWalls, type MapLayers } from './BoardArt.tsx';
import { mapById, point, project, subtract, worldHeight, worldWidth, type MapInfo, type Point } from './catalog.ts';
import { canonicalMarkers, drawingColor, pageIsAttack, worldMarker } from './geometry.ts';
import { objectHandles, transformObject, type ObjectFrame, type ObjectHandle } from './object-handles.ts';
import { savedWallPath } from './wall-path.ts';
import { changedMapDoors, findMapDoor, mapDoors, type MapDoor } from './map-doors.ts';
import { loadSightWalls, sightDoorWalls, type SightSegment } from './map-vision.ts';
import {
  bounds, drawingCollections, moveItem, newId, positionOf,
  type AbilityMarker, type AgentMarker, type CanvasItem, type CanvasSelection, type Drawing, type LineupLink, type Page,
} from './strategy.ts';

export const drawingTools = ['pencil', 'line', 'rectangle', 'ellipse'] as const;
type DrawingTool = typeof drawingTools[number];
export type Tool = DrawingTool | 'select' | 'hand' | 'eraser' | 'text' | 'lineup' | 'place';
export type Brush = { color: string; width: number; dotted: boolean; arrow: boolean; timing: boolean; speed: string };

const initialCamera = { x: worldWidth / 2, y: 500, zoom: 1 };
const keyOf = (selection: CanvasSelection) => `${selection.collection}:${selection.id}`;

export function drawingFrom(tool: DrawingTool, points: Point[], brush: Brush): Drawing {
  const first = points[0], last = points[points.length - 1];
  const trail = tool === 'pencil' || tool === 'line';
  const style = { id: newId(), colorValue: drawingColor(brush.color), thickness: brush.width,
    isDotted: brush.dotted, hasArrow: trail && brush.arrow, boundingBox: bounds(points),
    showTraversalTime: trail && brush.timing, traversalSpeedProfile: brush.speed };
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
  | { kind: 'erase'; pointerId: number; items: CanvasSelection[] }
  | { kind: 'transform'; pointerId: number; target: CanvasSelection; frame: ObjectFrame; handle: ObjectHandle; start: Point }
  | { kind: 'door'; pointerId: number; door: MapDoor; start: Point }
  | { kind: 'lineup'; pointerId: number; end: 'origin' | 'landing'; start: Point };

export type BoardViewport = {
  center: () => Point;
  pointAt: (screen: Point) => Point | undefined;
};

type Props = {
  map: MapInfo; page: Page; version: number; tool: Tool; brush: Brush; placement: Placement | null;
  viewport: Ref<BoardViewport>; externalDrag?: PlacementPreview;
  animate: boolean; layers: MapLayers; selection: CanvasSelection[]; media: Record<string, string>;
  lineupOrigin?: AgentMarker; lineupLanding?: AbilityMarker; editingLineupId?: string;
  pinnedLineupEnd?: 'origin' | 'landing';
  editingTextId?: string;
  onSelect: (items: CanvasSelection[]) => void;
  onContext: (item: CanvasSelection, screen: Point) => void;
  onEdit: (item: CanvasSelection) => void;
  onTextChange: (id: string, text: string | undefined) => void;
  onDismissAbilities: () => void;
  onHover: (item: CanvasSelection | undefined, position: Point) => void;
  hideAgents: boolean;
  onDraw: (drawing: Drawing) => void;
  onMove: (items: CanvasSelection[], delta: Point) => void;
  onTransform: (target: CanvasSelection, patch: Partial<CanvasItem>) => void;
  onDoorToggle: (door: MapDoor) => void;
  onErase: (items: CanvasSelection[]) => void;
  onPlace: (placement: Placement, worldPosition: Point) => void;
  onImageDrop: (file: File, position: Point) => void;
  onLineupMove: (end: 'origin' | 'landing', delta: Point) => void;
  onLineupOpen: (link: LineupLink) => void;
};

export default function Board(props: Props) {
  const { map, page, version, tool, brush, placement } = props;
  const root = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const space = useRef(false);
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<{ base: typeof initialCamera; start: Point; world: Point; distance: number; units: number } | null>(null);
  const [aspect, setAspect] = useState(1.4);
  const [camera, setCamera] = useState(initialCamera);
  const [drawingPreview, setDrawingPreview] = useState<Drawing>();
  const [movePreview, setMovePreview] = useState<{ ids: Set<string>; delta: Point }>();
  const [transformPreview, setTransformPreview] = useState<{ target: CanvasSelection; patch: Partial<CanvasItem> }>();
  const [screenHeight, setScreenHeight] = useState(700);
  const [marquee, setMarquee] = useState<{ start: Point; end: Point }>();
  const [lineupDelta, setLineupDelta] = useState<{ end: 'origin' | 'landing'; delta: Point }>();
  const [eraserCursor, setEraserCursor] = useState<Point>();
  const [erased, setErased] = useState<Set<string>>(new Set());
  const [mapWalls, setMapWalls] = useState<{ map: MapInfo; attack: boolean; walls: SightSegment[] }>();

  const artworkWidth = Math.min(1240, worldHeight * map.width / map.height);
  const height = Math.max(1120, (artworkWidth + 120) / aspect) / camera.zoom;
  const unitsPerPixel = height / screenHeight;
  const width = height * aspect;
  const left = camera.x - width / 2, top = camera.y - height / 2;
  const attack = pageIsAttack(page);
  const doorKey = changedMapDoors(page, map).join(',');
  const changedDoors = useMemo(() => new Set(doorKey ? doorKey.split(',') : []), [doorKey]);
  const walls = useMemo(() => [
    ...(mapWalls?.map === map && mapWalls.attack === attack ? mapWalls.walls : []),
    ...sightDoorWalls(map, attack, changedDoors),
  ], [mapWalls, map, attack, changedDoors]);
  const canToggleDoor = tool === 'select' && !props.animate && !props.externalDrag && !props.editingTextId;
  const single = tool === 'select' && props.selection.length === 1 && !props.editingTextId && props.selection[0];
  const handleItem = single && page[single.collection].find(item => item.id === single.id);
  const frame = single && handleItem && (!props.hideAgents || single.collection !== 'agentData')
    ? { item: handleItem, collection: single.collection, page, map, version } : undefined;
  const handles = frame && !movePreview ? objectHandles({
    ...frame, item: transformPreview ? { ...frame.item, ...transformPreview.patch } : frame.item,
  }, unitsPerPixel * 13) : [];

  function handleAt(target: EventTarget | null) {
    const index = target instanceof Element ? target.getAttribute('data-object-handle') : null;
    return index === null ? undefined : handles[Number(index)];
  }

  function worldAt(clientX: number, clientY: number): Point {
    const svg = root.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return point(camera.x, camera.y);
    const local = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
    return point(local.x, local.y);
  }

  function pointAt(screen: Point): Point | undefined {
    const target = document.elementFromPoint(screen.dx, screen.dy);
    return target && root.current?.contains(target) ? worldAt(screen.dx, screen.dy) : undefined;
  }

  useImperativeHandle(props.viewport, () => ({
    center: () => point(camera.x, camera.y),
    pointAt,
  }));

  function clearGesture() {
    gesture.current = null;
    setDrawingPreview(undefined);
    setMovePreview(undefined);
    setTransformPreview(undefined);
    setMarquee(undefined);
    setLineupDelta(undefined);
    setErased(new Set());
  }

  function drawingHits(event: PointerEvent<SVGSVGElement>) {
    return document.elementsFromPoint(event.clientX, event.clientY)
      .filter(element => element.hasAttribute('data-drawing-stroke'))
      .map(hitSelection)
      .filter((item): item is CanvasSelection => item?.collection === 'drawingData');
  }

  useEffect(() => { clearGesture(); }, [page.id, tool, attack]);

  useEffect(() => {
    let current = true;
    loadSightWalls(map, attack).then(segments => {
      if (current) setMapWalls({ map, attack, walls: segments });
    }).catch(() => { if (current) setMapWalls(undefined); });
    return () => { current = false; };
  }, [map, attack]);

  useEffect(() => {
    const svg = root.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setAspect(entry.contentRect.width / entry.contentRect.height);
        setScreenHeight(entry.contentRect.height);
      }
    });
    observer.observe(svg);
    function keydown(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && e.target.closest('input,textarea,button,[contenteditable],dialog')) return;
      if (e.code === 'Escape') {
        clearGesture();
        touches.current.clear();
        pinch.current = null;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        space.current = true;
      }
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
      if (event.target instanceof Element && event.target.closest('textarea')) return;
      event.preventDefault();
      const pointer = worldAt(event.clientX, event.clientY);
      const trackpadPan = !event.ctrlKey && (event.deltaX !== 0 || event.shiftKey ||
        (event.deltaMode === 0 && Math.abs(event.deltaY) < 40 && event.deltaY % 1 !== 0));
      if (trackpadPan) {
        const units = height / svg!.getBoundingClientRect().height;
        const x = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
        const y = event.shiftKey ? 0 : event.deltaY;
        setCamera(previous => ({ ...previous, x: previous.x + x * units, y: previous.y + y * units }));
      } else {
        const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
        const multiplier = Math.exp(-Math.max(-90, Math.min(90, delta)) * (event.ctrlKey ? .012 : .003));
        setCamera(previous => zoomAt(previous, pointer, multiplier));
      }
    }
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, [camera.x, camera.y, camera.zoom, height]);

  function onDown(event: PointerEvent<SVGSVGElement>) {
    if (event.target instanceof Element && event.target.closest('textarea')) return;
    if (event.button !== 0 && event.button !== 1) return;
    if (event.button === 1) event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const p = worldAt(event.clientX, event.clientY);
    const pointerId = event.pointerId;
    const clicked = hitSelection(event.target);
    const handle = handleAt(event.target);
    const doorId = canToggleDoor && event.target instanceof Element && event.target.closest('[data-map-door]')?.getAttribute('data-map-door');
    const door = doorId && mapDoors(map).find(door => door.id === doorId);
    const screen = point(event.clientX, event.clientY);
    const unitsPerPixel = height / event.currentTarget.getBoundingClientRect().height;
    if (event.pointerType === 'touch') {
      touches.current.set(pointerId, screen);
      event.currentTarget.setPointerCapture(pointerId);
      if (touches.current.size >= 2) {
        if (!pinch.current) {
          const [first, second] = touches.current.values();
          const start = midpoint(first, second);
          clearGesture();
          pinch.current = { base: camera, start, world: worldAt(start.dx, start.dy),
            distance: Math.max(1, distance(first, second)), units: unitsPerPixel };
        }
        return;
      }
    }
    if (gesture.current) return;
    const drawingTool = drawingTools.find(candidate => candidate === tool);
    if (event.button === 1 || tool === 'hand' || space.current ||
      (event.pointerType === 'touch' && !clicked && !handle && !door && tool === 'select')) {
      gesture.current = { kind: 'pan', pointerId, base: camera, screen, unitsPerPixel };
    } else if (tool === 'place' && placement) {
      props.onPlace(placement, p);
      return;
    } else if (tool === 'lineup') {
      const end = event.target instanceof Element ? event.target.closest('[data-lineup-end]')?.getAttribute('data-lineup-end') : undefined;
      if (end !== 'origin' && end !== 'landing') return;
      gesture.current = { kind: 'lineup', pointerId, end, start: p };
    } else if (drawingTool) {
      gesture.current = { kind: 'draw', pointerId, tool: drawingTool, points: [project(p, attack)] };
    } else if (tool === 'eraser') {
      const items = drawingHits(event);
      gesture.current = { kind: 'erase', pointerId, items };
      setErased(new Set(items.map(keyOf)));
    } else if (single && frame && handle) {
      gesture.current = { kind: 'transform', pointerId, frame, target: single, handle, start: p };
    } else if (door) {
      gesture.current = { kind: 'door', pointerId, door, start: p };
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
      props.onDismissAbilities();
      gesture.current = { kind: 'marquee', pointerId, start: p, prior };
    }
    if (gesture.current) event.currentTarget.setPointerCapture(pointerId);
  }

  function onMove(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === 'touch' && touches.current.has(event.pointerId)) {
      touches.current.set(event.pointerId, point(event.clientX, event.clientY));
      const gesture = pinch.current;
      if (gesture && touches.current.size >= 2) {
        const [first, second] = touches.current.values();
        const center = midpoint(first, second);
        setCamera(pinchCamera(gesture.base, gesture.world, gesture.start, center,
          distance(first, second) / gesture.distance, gesture.units));
        return;
      }
    }
    const active = gesture.current;
    const p = worldAt(event.clientX, event.clientY);
    if (!active) props.onHover(hitSelection(event.target), point(event.clientX, event.clientY));
    if (tool === 'eraser') setEraserCursor(p);
    if (!active || active.pointerId !== event.pointerId || active.kind === 'door') return;
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
    } else if (active.kind === 'lineup') {
      setLineupDelta({ end: active.end, delta: subtract(p, active.start) });
    } else if (active.kind === 'transform') {
      const patch = transformObject(active.frame, active.handle, active.start, p, event.shiftKey);
      setTransformPreview({ target: active.target, patch });
    } else {
      for (const item of drawingHits(event)) {
        if (!active.items.some(prior => keyOf(prior) === keyOf(item))) active.items.push(item);
      }
      setErased(new Set(active.items.map(keyOf)));
    }
  }

  function finish(event: PointerEvent<SVGSVGElement>, save: boolean) {
    if (event.pointerType === 'touch') {
      touches.current.delete(event.pointerId);
      if (pinch.current) {
        if (touches.current.size < 2) pinch.current = null;
        return;
      }
    }
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
    if (save && active.kind === 'lineup' && distance(cursor, active.start) > 2) {
      props.onLineupMove(active.end, subtract(cursor, active.start));
    }
    if (save && active.kind === 'transform' && distance(cursor, active.start) > unitsPerPixel) {
      props.onTransform(active.target, transformObject(active.frame, active.handle, active.start, cursor, event.shiftKey));
    }
    if (save && active.kind === 'door' && distance(cursor, active.start) <= unitsPerPixel * 5) {
      props.onDoorToggle(active.door);
    }
    if (save && active.kind === 'erase' && active.items.length) props.onErase(active.items);
    if (save && active.kind === 'marquee') {
      const box = bounds([cursor, active.start])!;
      const dragged = distance(cursor, active.start) > 5;
      const selected = [...active.prior];
      for (const collection of drawingCollections) for (const item of page[collection]) {
        if ('isDeleted' in item && item.isDeleted) continue;
        if (findMapDoor(item, map)) continue;
        const origin = positionOf(item);
        if (!origin) continue;
        const center = collection === 'drawingData' ? project(origin, attack) : worldMarker(item, collection, map, page, version);
        const selection = { collection, id: item.id };
        if (dragged && center.dx >= box.min.dx && center.dx <= box.max.dx && center.dy >= box.min.dy && center.dy <= box.max.dy &&
          !selected.some(prior => keyOf(prior) === keyOf(selection))) selected.push(selection);
      }
      props.onSelect(selected);
    }
    clearGesture();
  }

  function openContext(event: MouseEvent<SVGSVGElement>) {
    event.preventDefault();
    const handle = handleAt(event.target);
    if (handle?.mode === 'wallPoint' && single && frame && 'data' in frame.item) {
      const path = savedWallPath(frame.item, map);
      if (path.length >= 2) props.onTransform(single, { wallPath: path.filter((_, index) => index !== handle.index) });
      return;
    }
    const clicked = hitSelection(event.target);
    if (clicked) props.onContext(clicked, point(event.clientX, event.clientY));
  }

  function drop(event: DragEvent<SVGSVGElement>) {
    const image = Array.from(event.dataTransfer.files).find(file => file.type.startsWith('image/'));
    if (!image) return;
    event.preventDefault();
    props.onImageDrop(image, worldAt(event.clientX, event.clientY));
  }

  const selectedKeys = new Set(props.selection.map(keyOf));
  const ghostPoint = props.externalDrag ? pointAt(props.externalDrag.screen) : undefined;
  const ghost = props.externalDrag && ghostPoint
    ? objectForPlacement(props.externalDrag.marker, ghostPoint, map, page, version, drawingColor(brush.color))
    : undefined;
  const lineup = ([
    ['origin', 'agentData', props.lineupOrigin],
    ['landing', 'abilityData', props.lineupLanding],
  ] as const).flatMap(([end, collection, item]) => {
    if (!item) return [];
    const offset = lineupDelta?.end === end
      ? (canonicalMarkers(page, version) ? lineupDelta.delta : point(-lineupDelta.delta.dx, -lineupDelta.delta.dy)) : undefined;
    const marker = offset ? moveItem(item, offset) : item;
    return [{ end, collection, marker, center: worldMarker(marker, collection, map, page, version) }];
  });
  const markerOrder = ['imageData', 'utilityData', 'abilityData', 'agentData', 'drawingData', 'textData'] as const;
  return <VisionWalls.Provider value={walls}><div className="board-wrap">
    <svg ref={root} className={`board board-${tool}`} viewBox={`${left} ${top} ${width} ${height}`}
      role="group" tabIndex={-1} aria-label={`${mapById[map.id]?.name} 战术画布`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={event => finish(event, true)}
      onPointerCancel={event => finish(event, false)} onLostPointerCapture={event => finish(event, false)}
      onContextMenu={openContext}
      onPointerLeave={() => { props.onHover(undefined, point(0, 0)); setEraserCursor(undefined); }}
      onDoubleClick={event => {
        if (tool !== 'select') return;
        const item = hitSelection(document.elementFromPoint(event.clientX, event.clientY));
        if (item) props.onEdit(item);
      }}
      onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } }}
      onDrop={drop}>
      <defs>
        <pattern id="board-dots" width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="6" cy="6" r="1.4" fill="#3c364a" />
        </pattern>
      </defs>
      {props.layers.grid && <rect {...{ x: left, y: top, width, height }} fill="url(#board-dots)" />}
      <MapArtwork map={map} attack={attack} layers={props.layers} />
      <MapDoorBars map={map} attack={attack} changed={changedDoors} active={canToggleDoor} toggle={props.onDoorToggle} />
      {markerOrder.filter(collection => !props.hideAgents || collection !== 'agentData').map(collection => <g key={collection} opacity={tool === 'lineup' ? .36 : 1}>
        {page[collection].map(item => {
          const key = keyOf({ collection, id: item.id });
          if (erased.has(key) || findMapDoor(item, map)) return null;
          const moved = movePreview?.ids.has(key);
          const attackCoordinates = collection === 'drawingData' ? attack : canonicalMarkers(page, version);
          const delta = movePreview?.delta;
          const displayed = moved && delta ? moveItem(item, attackCoordinates ? delta : point(-delta.dx, -delta.dy)) : item;
          const transform = transformPreview && keyOf(transformPreview.target) === key ? transformPreview.patch : undefined;
          return <CanvasObject key={item.id} item={transform ? { ...displayed, ...transform } : displayed} collection={collection} map={map} page={page}
            version={version} selected={selectedKeys.has(key)} animate={props.animate && !moved && !transform} media={props.media}
            editText={collection === 'textData' && props.editingTextId === item.id
              ? text => props.onTextChange(item.id, text) : undefined} />;
        })}
      </g>)}
      <LineupArt page={page} map={map} version={version} active={tool === 'lineup' && !props.editingLineupId}
        hiddenId={props.editingLineupId} onOpen={props.onLineupOpen} />
      {drawingPreview && <g pointerEvents="none"><DrawingArt drawing={drawingPreview} attack={attack} mapScale={map.scale} /></g>}
      {marquee && <rect x={Math.min(marquee.start.dx, marquee.end.dx)} y={Math.min(marquee.start.dy, marquee.end.dy)}
        width={Math.abs(marquee.start.dx - marquee.end.dx)} height={Math.abs(marquee.start.dy - marquee.end.dy)}
        stroke="#a783f4" fill="#9b6ef4" fillOpacity=".13" strokeWidth="2" strokeDasharray="6 4" pointerEvents="none" />}
      {lineup.length === 2 && <line x1={lineup[0].center.dx} y1={lineup[0].center.dy}
        x2={lineup[1].center.dx} y2={lineup[1].center.dy} stroke="#bb9aff" strokeWidth="3"
        strokeDasharray="9 7" pointerEvents="none" />}
      {lineup.map(({ end, collection, marker }) => <g key={end}
        data-lineup-end={props.pinnedLineupEnd === end ? undefined : end}
        className={props.pinnedLineupEnd === end ? undefined : 'lineup-draft-marker'}>
        <CanvasObject item={marker} collection={collection} map={map} page={page} version={version}
          selected animate={false} media={props.media} />
      </g>)}
      {ghost && <g opacity=".72" pointerEvents="none">
        <CanvasObject item={ghost.item} collection={ghost.collection} map={map} page={page} version={version}
          selected={false} animate={false} media={props.media} />
      </g>}
      {handles.map((handle, index) => <circle key={`${handle.mode}-${handle.index ?? ''}`} data-object-handle={index}
        className={`object-handle handle-${handle.mode}`} cx={handle.position.dx} cy={handle.position.dy}
        r={unitsPerPixel * (handle.mode === 'wallInsert' ? 5 : 7)}
        vectorEffect="non-scaling-stroke">
        <title>{handle.label}</title>
      </circle>)}
      {tool === 'eraser' && eraserCursor && <circle cx={eraserCursor.dx} cy={eraserCursor.dy}
        r={10 * height / (root.current?.getBoundingClientRect().height || 1)} stroke="#f1ebff"
        strokeWidth="1.5" fill="#eeeaf833" pointerEvents="none" />}

    </svg>
    <div className="zoom-controls" aria-label="地图缩放">
      <button className="icon-button" type="button" onClick={() => setCamera(c => ({ ...c, zoom: fitZoom(c.zoom / 1.2) }))} title="缩小"><Minus size={15} /></button>
      <button className="zoom-value" type="button" onClick={() => setCamera(initialCamera)} title="重置视图">{Math.round(camera.zoom * 100)}%</button>
      <button className="icon-button" type="button" onClick={() => setCamera(c => ({ ...c, zoom: fitZoom(c.zoom * 1.2) }))} title="放大"><Plus size={15} /></button>
      <button className="icon-button zoom-reset" type="button" onClick={() => setCamera(initialCamera)} title="适合窗口"><Crosshair size={15} /></button>
    </div>
  </div></VisionWalls.Provider>;
}
