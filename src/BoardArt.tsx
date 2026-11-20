import { createContext, useContext, useMemo, useRef, type PointerEvent, type ReactNode } from 'react';
import {
  abilityFor, abilityGeometry, agentById, cssColor, gameAsset, mapArtworkFrame, project, virtualToWorld, worldWidth,
  type MapInfo, type Point,
} from './catalog.ts';
import { abilityLengthRange, barrierMeshAxes, canonicalMarkers, meshArmLength, metersToWorld, pageIsAttack, sectorPath,
  uprightDimensions, uprightPosition, uprightScale, worldMarker } from './geometry.ts';
import { drawingPoints, type AbilityMarker, type AgentMarker, type CanvasItem, type CanvasSelection, type Collection,
  type Drawing, type ImageMarker, type LineupLink, type Page, type TextMarker, type Utility } from './strategy.ts';
import { savedWallPath, smoothWall } from './wall-path.ts';
import { doorBlocks, doorLine, mapDoors, type MapDoor } from './map-doors.ts';
import { sightPolygon, type SightSegment } from './map-vision.ts';

const allyColor = '#57d0ac';
const enemyColor = '#f17587';
const tone = (ally?: boolean) => ally === false ? enemyColor : allyColor;
const degrees = (value: number) => value * 180 / Math.PI;

export type MapLayers = { callouts: boolean; barriers: boolean; orbs: boolean; grid: boolean };
export const VisionWalls = createContext<readonly SightSegment[]>([]);

export function MapArtwork({ map, attack, layers }: { map: MapInfo; attack: boolean; layers: MapLayers }) {
  const { x, y, width, height } = mapArtworkFrame(map, true);
  const mapPosition = mapArtworkFrame(map, attack);
  const mapName = `maps/${map.id}`;
  const suffix = attack ? '' : '_defense';
  const frame = { x, y, width, height };
  const flip = attack ? undefined : `rotate(180 ${worldWidth / 2} 500)`;
  return <g pointerEvents="none">
    <image href={gameAsset(`${mapName}_map${suffix}.svg`)}
      {...frame} x={mapPosition.x} y={mapPosition.y} className="map-artwork" />
    {layers.barriers && <image href={gameAsset(`${mapName}_spawn_walls.svg`)} {...frame} transform={flip} />}
    {layers.orbs && <image href={gameAsset(`${mapName}_ult_orbs.svg`)} {...frame} transform={flip} />}
    {layers.callouts && <image href={gameAsset(`${mapName}_call_outs${suffix}.svg`)} {...frame} />}
  </g>;
}

export function MapDoorBars({ map, attack, changed, active, toggle }: {
  map: MapInfo; attack: boolean; changed: ReadonlySet<string>; active: boolean; toggle: (door: MapDoor) => void;
}) {
  return <g>{mapDoors(map).map(door => {
    const toggled = changed.has(door.id);
    const [start, end] = doorLine(door, map, attack, toggled);
    const solid = doorBlocks(door, toggled);
    const bar = { x1: start.dx, y1: start.dy, x2: end.dx, y2: end.dy };
    const label = `${door.label} · ${solid ? (door.kind === 'spin' && toggled ? '已旋转' : '阻挡') : '可通行'}`;
    return <g key={door.id} data-map-door={door.id} className="map-door"
      role={active ? 'button' : undefined} aria-label={label} aria-pressed={active ? toggled : undefined}
      tabIndex={active ? 0 : undefined} onKeyDown={event => {
        if (!active || ![' ', 'Enter'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        if (!event.repeat) toggle(door);
      }}>
      <title>{label}</title>
      <line {...bar} className={`map-door-line ${door.kind === 'drop' && !toggled ? 'map-door-raised' : ''}`}
        strokeDasharray={solid ? undefined : Math.hypot(end.dx - start.dx, end.dy - start.dy) / 5}
        pointerEvents="none" />
      <line {...bar} stroke="transparent" strokeWidth="14" vectorEffect="non-scaling-stroke" pointerEvents={active ? 'stroke' : 'none'} />
    </g>;
  })}</g>;
}

function VisionSector({ origin, color, radius, sweep, rotation }: {
  origin: Point; color: string; radius: number; sweep: number; rotation: number;
}) {
  const walls = useContext(VisionWalls);
  const path = useMemo(() => {
    const boundary = sightPolygon(walls, origin, radius, rotation * Math.PI / 180, sweep);
    return boundary && `M ${boundary.map(p => `${p.dx.toFixed(2)} ${p.dy.toFixed(2)}`).join(' L ')} Z`;
  }, [walls, origin.dx, origin.dy, radius, sweep, rotation]);
  return <path d={path ?? sectorPath(radius, sweep)} transform={path ? undefined : `rotate(${rotation})`}
    fill={color} fillOpacity=".15" stroke={color} strokeWidth="2" strokeOpacity=".66" pointerEvents="none" />;
}

export function DrawingArt({ drawing, attack, mapScale, selected }: { drawing: Drawing; attack: boolean; mapScale: number; selected?: boolean }) {
  const points = drawingPoints(drawing).map(p => project(p, attack));
  if (points.length < 1) return null;
  const color = cssColor(drawing.colorValue ?? drawing.color);
  const thickness = drawing.thickness ?? 5;
  const start = points[0];
  const end = points[points.length - 1];
  const left = Math.min(start.dx, end.dx), top = Math.min(start.dy, end.dy);
  const w = Math.abs(end.dx - start.dx), h = Math.abs(end.dy - start.dy);
  const props = { stroke: color, fill: 'none', strokeWidth: thickness, strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const, strokeDasharray: drawing.isDotted ? `${thickness * 1.4} ${thickness * 2.5}` : undefined };
  const path = points.map(p => `${p.dx},${p.dy}`).join(' ');
  const speeds: Record<string, number> = { running: 6.75, walking: 4.5225, brimStim: 7.425, neonRun: 9.11 };
  const time = drawing.showTraversalTime ? points.reduce((sum, p, i) => {
    if (i === 0) return sum;
    const steps = Math.hypot(p.dx - points[i - 1].dx, p.dy - points[i - 1].dy);
    return sum + steps / (5.78 * mapScale * (speeds[drawing.traversalSpeedProfile ?? 'running'] ?? 6.75));
  }, 0) : 0;
  const arrowFrom = [...points.slice(0, -1)].reverse().find(p => Math.hypot(end.dx - p.dx, end.dy - p.dy) > 1);
  const arrow = arrowFrom && drawing.hasArrow && (() => {
    const theta = Math.atan2(end.dy - arrowFrom.dy, end.dx - arrowFrom.dx);
    const size = Math.max(13, thickness * 3);
    return <path d={`M ${end.dx} ${end.dy} L ${end.dx - Math.cos(theta - 0.55) * size} ${end.dy - Math.sin(theta - 0.55) * size}
      L ${end.dx - Math.cos(theta + 0.55) * size} ${end.dy - Math.sin(theta + 0.55) * size} Z`} fill={color} />;
  })();
  const shape = drawing.type === 'rectangleDrawing'
    ? <rect x={left} y={top} width={w} height={h} {...props} />
    : drawing.type === 'ellipseDrawing'
      ? <ellipse cx={left + w / 2} cy={top + h / 2} rx={w / 2} ry={h / 2} {...props} />
      : <polyline points={path} {...props} />;
  const eraserHit = { 'data-drawing-stroke': '', fill: 'none', stroke: 'transparent',
    strokeWidth: Math.max(22, thickness), pointerEvents: 'stroke' };
  return <>
    <g className={selected ? 'selected-drawing' : undefined}>{shape}{arrow}</g>
    {drawing.type === 'rectangleDrawing' ? <>
      <rect x={left} y={top} width={w} height={h} fill="transparent" />
      <rect x={left} y={top} width={w} height={h} {...eraserHit} />
    </> : drawing.type === 'ellipseDrawing' ? <>
      <ellipse cx={left + w / 2} cy={top + h / 2} rx={w / 2} ry={h / 2} fill="transparent" />
      <ellipse cx={left + w / 2} cy={top + h / 2} rx={w / 2} ry={h / 2} {...eraserHit} />
    </> : <polyline points={path} {...eraserHit} />}
    {drawing.showTraversalTime && <text className="svg-note" x={(start.dx + end.dx) / 2} y={(start.dy + end.dy) / 2 - 11}
      textAnchor="middle">{time.toFixed(1)}s</text>}
  </>;
}

export function AgentArt({ marker, page, map, rotation, origin }: {
  marker: AgentMarker; page: Page; map: MapInfo; rotation: number; origin: Point;
}) {
  const agent = agentById[marker.type];
  const size = (page.settings.agentSize ?? 35) * virtualToWorld;
  const color = tone(marker.isAlly);
  return <>
    {marker.kind === 'viewCone' && <VisionSector origin={origin} radius={(marker.length ?? 85) * virtualToWorld}
      sweep={Number(marker.presetType?.replace('viewCone', '')) || 90} color={color} rotation={rotation} />}
    {marker.kind === 'circle' && <circle r={metersToWorld(marker.diameterMeters ?? 8, map) / 2}
      fill={cssColor(marker.colorValue, color)} fillOpacity={(marker.opacityPercent ?? 16) / 100} stroke={cssColor(marker.colorValue, color)} strokeWidth="2" />}
    <rect x={-size / 2} y={-size / 2} width={size} height={size} rx={size * .23} fill="#19191f" stroke={color} strokeWidth="3" />
    {agent ? <image href={gameAsset(agent.icon)} x={-size / 2 + 2} y={-size / 2 + 2} width={size - 4} height={size - 4}
      opacity={marker.state === 'dead' ? .45 : 1} />
      : <text className="svg-note" dominantBaseline="middle" textAnchor="middle">{marker.type.slice(0, 1).toUpperCase()}</text>}
    {marker.state === 'dead' && <path d={`M ${-size / 3} ${-size / 3} L ${size / 3} ${size / 3} M ${-size / 3} ${size / 3} L ${size / 3} ${-size / 3}`}
      stroke={enemyColor} strokeWidth="3" />}
  </>;
}

export function AbilityArt({ marker, page, map, rotation }: { marker: AbilityMarker; page: Page; map: MapInfo; rotation: number }) {
  const ability = abilityFor(marker.data.type, marker.data.index);
  if (!ability) return <circle r={12} fill={tone(marker.isAlly)} />;
  const geometry = abilityGeometry(ability, map.id);
  const color = cssColor(geometry.color, tone(marker.isAlly));
  const size = (page.settings.abilitySize ?? 25) * virtualToWorld;
  const radius = (geometry.diameter ?? 0) * virtualToWorld / 2;
  const width = (geometry.width ?? 6) * virtualToWorld;
  const variable = abilityLengthRange(marker, map);
  const height = variable ? variable.length * variable.displayScale : (marker.length || geometry.height || 60) * virtualToWorld;
  const anchorY = geometry.anchor[1] * virtualToWorld;
  const visibility = marker.visualState;
  const fill = visibility?.showRangeFill !== false;
  const stroke = visibility?.showRangeOutline !== false ? color : 'none';
  const innerStroke = visibility?.showInnerOutline !== false ? color : 'none';
  const wall = geometry.kind === 'wall' && savedWallPath(marker, map);
  const sign = pageIsAttack(page) ? 1 : -1;
  return <>
    {wall && wall.length > 0 && <polyline points={smoothWall(wall).map(p => `${p.dx * sign},${p.dy * sign}`).join(' ')}
      fill="none" stroke={color} strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />}
    <g transform={`rotate(${rotation})`} opacity={visibility?.isActive === false ? .28 : 1}>
      {geometry.kind === 'circle' && <circle r={radius} fill={fill ? color : 'none'} fillOpacity=".12" stroke={stroke} strokeWidth="2.5" />}
      {geometry.kind === 'circle' && !!geometry.inner && <circle r={geometry.inner * virtualToWorld / 2}
        fill={visibility?.showInnerFill !== false ? color : 'none'} fillOpacity=".1" stroke={innerStroke} strokeWidth="1.6" strokeDasharray="6 4" />}
      {geometry.kind === 'sector' && <path d={sectorPath(radius, geometry.sweep ?? 90)}
        fill={fill ? color : 'none'} fillOpacity=".16" stroke={stroke} strokeWidth="2" />}
      {geometry.kind === 'rect' && <rect x={-width / 2} y={-Math.min(height, anchorY || height)} width={width} height={height} rx="2"
        fill={fill ? color : 'none'} fillOpacity=".22" stroke={fill ? stroke : 'none'} strokeWidth="2.5" />}
      {geometry.kind === 'mesh' && fill && barrierMeshAxes.map((axis, index) => {
        const length = metersToWorld(meshArmLength(marker.armLengthsMeters?.[index]), map);
        return <line key={index} x1={0} y1={0} x2={axis.dx * length} y2={axis.dy * length} stroke={color} strokeWidth="5" />;
      })}
      {geometry.kind === 'image' && fill && geometry.sprite && <image href={gameAsset(geometry.sprite)}
        x={-(radius || geometry.bounds[0] * virtualToWorld / 2)} y={-(radius || geometry.bounds[1] * virtualToWorld / 2)}
        width={radius ? radius * 2 : geometry.bounds[0] * virtualToWorld} height={radius ? radius * 2 : geometry.bounds[1] * virtualToWorld} />}
    </g>
    {!marker.visualState?.isIconHidden && <>
      <rect x={-size / 2} y={-size / 2} width={size} height={size} rx={size * .3} fill="#17171d" stroke={tone(marker.isAlly)} strokeWidth="2" />
      <image href={gameAsset(ability.icon)} x={-size / 2 + 4} y={-size / 2 + 4} width={size - 8} height={size - 8} />
    </>}
  </>;
}

function UtilityArt({ utility, map, rotation, origin }: { utility: Utility; map: MapInfo; rotation: number; origin: Point }) {
  const color = cssColor(utility.customColorValue, tone(utility.isAlly));
  const opacity = (utility.customOpacityPercent ?? 18) / 100;
  if (utility.type === 'customCircle') return <circle r={metersToWorld(utility.customDiameter ?? 10, map) / 2} stroke={color} strokeWidth="2.5" fill={color} fillOpacity={opacity} />;
  if (utility.type === 'customRectangle') {
    const w = metersToWorld(utility.customLength ?? 10, map), h = metersToWorld(utility.customWidth ?? 10, map);
    return <rect x={-w / 2} y={-h / 2} width={w} height={h} transform={`rotate(${rotation})`}
      fill={color} fillOpacity={opacity} stroke={color} strokeWidth="2.5" />;
  }
  if (utility.type.startsWith('viewCone')) {
    return <>
      <VisionSector origin={origin} radius={(utility.length || 100) * virtualToWorld} sweep={utility.angle ?? 90} color={color} rotation={rotation} />
      <circle r="7" fill={color} />
    </>;
  }
  const assetPath = utility.type === 'spike' ? 'spike.svg' : ['duelist', 'sentinel', 'controller', 'initiator'].includes(utility.type)
    ? `agents/${utility.type}.webp` : '';
  const size = (utility.type === 'spike' ? 20 : 35) * virtualToWorld;
  return assetPath ? <image href={gameAsset(assetPath)} x={-size / 2} y={-size / 2} height={size} width={size} />
    : <circle r="10" fill={color} />;
}

function TextArt({ marker, edit }: { marker: TextMarker; edit?: (text: string | undefined) => void }) {
  const finished = useRef(false);
  const size = (marker.fontSize ?? 18) * uprightScale(marker);
  const box = uprightDimensions(marker);
  const style = { fontSize: size, borderLeftColor: cssColor(marker.tagColorValue, '#976afa') };
  return <foreignObject width={box.dx} height={Math.max(edit ? 106 : 36, box.dy)}>
    {edit ? <textarea className="canvas-text canvas-text-editor" style={style} aria-label="编辑画布文本"
      defaultValue={marker.text} placeholder="在这里输入…" autoFocus
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => {
        event.stopPropagation();
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
          event.preventDefault();
          finished.current = true;
          edit(event.key === 'Escape' ? undefined : event.currentTarget.value);
        }
      }}
      onBlur={event => { if (!finished.current) edit(event.currentTarget.value); }} />
      : <div className="canvas-text" style={style}>{marker.text || '在这里输入…'}</div>}
  </foreignObject>;
}

export const pictureName = (image: ImageMarker) => `${image.assetId ?? image.id}${image.fileExtension ?? ''}`;

function ImageArt({ image, media }: { image: ImageMarker; media: Record<string, string> }) {
  const { dx: width, dy: height } = uprightDimensions(image);
  const source = media[pictureName(image)];
  return source ? <image width={width} height={height} href={source} />
    : <g><rect width={width} height={height} rx="4" fill="#1c1a23" stroke="#6b6374" />
      <text x="8" y="22" className="svg-note">图片缺失</text></g>;
}

export function CanvasObject({ item, collection, map, page, version, selected, animate, media, editText }: {
  item: CanvasItem; collection: Collection; map: MapInfo; page: Page; version: number;
  selected: boolean; animate: boolean; media: Record<string, string>; editText?: (text: string | undefined) => void;
}) {
  if ('isDeleted' in item && item.isDeleted) return null;
  const selection = { 'data-collection': collection, 'data-object-id': item.id };
  if (collection === 'drawingData') return <g {...selection}>
    <DrawingArt drawing={item as Drawing} attack={pageIsAttack(page)} mapScale={map.scale} selected={selected} />
  </g>;
  if (!('position' in item)) return null;
  const isCanonical = canonicalMarkers(page, version);
  const rotation = degrees('rotation' in item ? item.rotation ?? 0 : 0) + (isCanonical ? 0 : 180);
  const upright = 'text' in item || 'aspectRatio' in item ? item : undefined;
  const pos = upright ? uprightPosition(upright, page, version) : worldMarker(item, collection, map, page, version);
  const box = upright && uprightDimensions(upright);
  let shape: ReactNode;
  switch (collection) {
    case 'agentData': shape = <AgentArt marker={item as AgentMarker} page={page} map={map} rotation={rotation} origin={pos} />; break;
    case 'abilityData': shape = <AbilityArt marker={item as AbilityMarker} page={page} map={map} rotation={rotation} />; break;
    case 'utilityData': shape = <UtilityArt utility={item as Utility} map={map} rotation={rotation} origin={pos} />; break;
    case 'textData': shape = <TextArt key={editText ? 'edit' : 'view'} marker={item as TextMarker} edit={editText} />; break;
    case 'imageData': shape = <ImageArt image={item as ImageMarker} media={media} />; break;
  }
  return <g {...selection} className={animate ? 'animated-marker' : undefined}
    style={{ transform: `translate(${pos.dx}px, ${pos.dy}px)` }}>
    <title>{item.caption || (collection === 'agentData' ? agentById[(item as AgentMarker).type]?.name : undefined) || ''}</title>
    {shape}
    {selected && (box ? <rect x="-3" y="-3" width={box.dx + 6} height={box.dy + 6}
      fill="none" stroke="#b69aff" strokeWidth="2.5" strokeDasharray="6 4" pointerEvents="none" />
      : <circle r="30" fill="none" stroke="#b69aff" strokeWidth="2.5" strokeDasharray="6 4" pointerEvents="none" />)}
  </g>;
}

export function LineupArt({ page, version, map, active, hiddenId, onOpen }: {
  page: Page; version: number; map: MapInfo; active: boolean; hiddenId?: string; onOpen: (link: LineupLink) => void;
}) {
  return <g opacity={active ? 1 : .55}>
    {page.lineUpLinks.map(link => {
      if (link.id === hiddenId) return null;
      const origin = page.lineUpOrigins.find(row => row.id === link.originId);
      const landing = page.lineUpLandings.find(row => row.id === link.landingId);
      if (!origin || !landing) return null;
      const agent = worldMarker(origin.agent, 'agentData', map, page, version);
      const ability = worldMarker(landing.ability, 'abilityData', map, page, version);
      const side = canonicalMarkers(page, version);
      const rotation = degrees(landing.ability.rotation ?? 0) + (side ? 0 : 180);
      const onPointer = (event: PointerEvent<SVGGElement>) => {
        if (!active || event.button !== 0) return;
        event.stopPropagation();
        onOpen(link);
      };
      return <g key={link.id} onPointerDown={onPointer} pointerEvents={active ? 'auto' : 'none'} className={active ? 'clickable-lineup' : undefined}>
        <title>{link.name}</title>
        <line x1={agent.dx} y1={agent.dy} x2={ability.dx} y2={ability.dy} stroke="#ac8aff" strokeWidth="3" strokeDasharray="11 8" />
        <line x1={agent.dx} y1={agent.dy} x2={ability.dx} y2={ability.dy} stroke="transparent" strokeWidth="22" />
        <g transform={`translate(${agent.dx} ${agent.dy})`}><AgentArt marker={origin.agent} page={page} map={map} rotation={0} origin={agent} /></g>
        <g transform={`translate(${ability.dx} ${ability.dy})`}><AbilityArt marker={landing.ability} page={page} map={map} rotation={rotation} /></g>
      </g>;
    })}
  </g>;
}
