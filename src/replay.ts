import registration from './replay-catalog.json' with { type: 'json' };
import abilities from './replay-abilities.json' with { type: 'json' };
import { abilityFor, mapArtworkFrame, mapById, point, type MapInfo } from './catalog.ts';
import { makeAbility, makeUtility } from './geometry.ts';
import { mapDoors, replayDoorActors } from './map-doors.ts';

export type ReplayPlayer = { subject: string; agentId?: string | null; team?: string | null };
type Vec3 = [number, number, number];
export type ReplayRound = {
  index: number; startMs: number; endMs: number; attackingTeam?: string; winningTeam?: string;
  plant?: { timeMs: number; site?: string; position?: Vec3 }; defuse?: { timeMs: number }; detonateMs?: number;
};
type Movement = { offset: number; count: number };
type Cast = { timeMs: number; subject?: string; classPath?: string; slot?: number };
type ReplayUtility = { id: number; classPath: string; owner?: string; spawnMs: number; endMs?: number;
  position: Vec3; yaw?: number; path?: [number, ...Vec3][] };
type DoorMove = { actor: string; startMs: number; endMs: number; toRest?: boolean };
type ReplayDocument = {
  match: { mapPath: string; durationMs: number }; players: ReplayPlayer[]; rounds: ReplayRound[];
  movement: Record<string, Movement>; vitals?: Record<string, [number, number, number][]>;
  kills?: { timeMs: number; victim: string; killer?: string }[];
  casts?: Cast[]; utility?: ReplayUtility[]; doors?: DoorMove[];
};
export type Replay = { doc: ReplayDocument; map: MapInfo; data: DataView };

export function decodeReplay(bytes: Uint8Array): Replay {
  if (bytes.length < 12 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'ICRP') {
    throw new Error('请选择 Icarus 已解码的 .icrp 文件');
  }
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint32(4, true) !== 1) throw new Error('不支持此 .icrp 版本');
  const jsonLength = header.getUint32(8, true);
  const blobOffset = Math.ceil((12 + jsonLength) / 8) * 8;
  if (jsonLength > 32 * 1024 * 1024 || blobOffset > bytes.length) throw new Error('回放头部无效');
  const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + jsonLength))) as ReplayDocument;
  const path = typeof doc?.match?.mapPath === 'string' ? doc.match.mapPath.split('/') : [];
  const codename = path[3] || path[2];
  const name = registration.maps[codename as keyof typeof registration.maps];
  const map = mapById[name];
  if (!map || !Number.isFinite(doc?.match?.durationMs) || doc.match.durationMs <= 0 ||
    !Array.isArray(doc.players) || !Array.isArray(doc.rounds) || !doc.movement || typeof doc.movement !== 'object') {
    throw new Error('回放地图或数据格式不受支持');
  }
  if (doc.players.some(row => !row || typeof row.subject !== 'string' || row.agentId != null && typeof row.agentId !== 'string') ||
    doc.rounds.some(row => !row || !Number.isSafeInteger(row.index) || !Number.isFinite(row.startMs) || !Number.isFinite(row.endMs)) ||
    [doc.kills, doc.casts].some(rows => rows !== undefined && (!Array.isArray(rows) || rows.some(row => !row || !Number.isFinite(row.timeMs))))) {
    throw new Error('回放选手、事件或回合记录无效');
  }
  if (doc.doors !== undefined && (!Array.isArray(doc.doors) || doc.doors.some(row => !row ||
      typeof row.actor !== 'string' || !Number.isFinite(row.startMs) || !Number.isFinite(row.endMs))) ||
      doc.utility !== undefined && (!Array.isArray(doc.utility) || doc.utility.some(row => !row ||
        typeof row.classPath !== 'string' || !Number.isFinite(row.spawnMs) || !Array.isArray(row.position)))) {
    throw new Error('回放地图门或道具记录无效');
  }
  const data = new DataView(bytes.buffer, bytes.byteOffset + blobOffset, bytes.byteLength - blobOffset);
  for (const value of Object.values(doc.movement)) {
    if (!value || !Number.isSafeInteger(value.offset) || !Number.isSafeInteger(value.count) ||
      value.offset < 0 || value.count < 0 || value.offset + value.count * 24 > data.byteLength) throw new Error('回放轨迹越界');
  }
  return { doc, map, data };
}

export function replayAgent(player: ReplayPlayer) {
  return registration.agents[player.agentId?.toLowerCase() as keyof typeof registration.agents];
}

export function replayPosition(replay: Replay, player: ReplayPlayer, time: number) {
  const movement = replay.doc.movement[player.subject];
  if (!movement?.count) return;
  const { data, map } = replay;
  const offset = (index: number) => movement.offset + index * 24;
  const at = (index: number) => data.getInt32(offset(index), true);
  if (time < at(0)) return;
  let lo = 0, hi = movement.count - 1;
  while (lo < hi) {
    const middle = (lo + hi + 1) >>> 1;
    if (at(middle) > time) hi = middle - 1;
    else lo = middle;
  }
  const next = Math.min(lo + 1, movement.count - 1);
  const timeDiff = at(next) - at(lo);
  const t = timeDiff > 0 && timeDiff <= 250 ? (time - at(lo)) / timeDiff : 0;
  const read = (index: number, field: number) => data.getFloat32(offset(index) + field * 4, true);
  const coord = (field: number) => read(lo, field) * (1 - t) + read(next, field) * t;
  return projectReplayPosition(map, [coord(1), coord(2), coord(3)], read(lo, 4));
}

function projectReplayPosition(map: MapInfo, coords: readonly number[], degrees = 0) {
  const x = coords[0] / 100, y = -coords[1] / 100, yaw = degrees * Math.PI / 180;
  if (![x, y, yaw].every(Number.isFinite)) return;
  const [a, b, c, d, e, f] = registration.transforms[map.id as keyof typeof registration.transforms];
  const frame = mapArtworkFrame(map, true);
  const position = point(frame.x + (a * x + b * y + c) * frame.scale, frame.y + (d * x + e * y + f) * frame.scale);
  const rotation = Math.atan2(d * Math.cos(yaw) - e * Math.sin(yaw), a * Math.cos(yaw) - b * Math.sin(yaw)) + Math.PI / 2;
  return { position, rotation };
}

function abilityEntry(path?: string) {
  if (typeof path !== 'string') return;
  const name = path.split('/').at(-1)?.split('.')[0] ?? '';
  return Object.hasOwn(abilities, name) ? abilities[name as keyof typeof abilities] as [string, number, boolean] : undefined;
}

export function replayCastName(cast: Cast) {
  const entry = abilityEntry(cast.classPath);
  return (entry && abilityFor(entry[0], entry[1])?.name) || ({ 3: 'C 技能', 4: 'Q 技能', 5: 'E 技能', 9: '终极技能' } as Record<number, string>)[cast.slot ?? -1] || '使用技能';
}

export function replayUtilityAt(replay: Replay, time: number, round: ReplayRound | undefined) {
  if (!round) return [];
  return (replay.doc.utility ?? []).flatMap(row => {
    if (row.spawnMs < round.startMs || time < row.spawnMs || time >= (row.endMs ?? round.endMs)) return [];
    const entry = abilityEntry(row.classPath);
    if (!entry) return [];
    const [agent, index, flight] = entry;
    const last = Array.isArray(row.path) ? row.path.findLast(sample => Array.isArray(sample) && sample[0] <= time) : undefined;
    const placed = projectReplayPosition(replay.map, last ? last.slice(1) : row.position, row.yaw);
    if (!placed) return [];
    const owner = replay.doc.players.find(player => player.subject === row.owner);
    const anchor = makeAbility(agent, index, placed.position, owner?.team !== 'Blue', replay.map, true);
    return [{ ...anchor, id: 'replay-utility-' + row.id, rotation: placed.rotation, ...(flight ? { wallPath: [],
      visualState: { showRangeOutline: false, showRangeFill: false, showInnerOutline: false, showInnerFill: false, showVisionCone: false },
    } : {}) }];
  });
}

export function replaySpikeAt(replay: Replay, time: number, round: ReplayRound | undefined) {
  if (!round) return;
  const plant = round.plant;
  if (!plant?.position || time < plant.timeMs || time >= (round.defuse?.timeMs ?? round.detonateMs ?? round.endMs)) return;
  const placed = projectReplayPosition(replay.map, plant.position);
  return placed && { ...makeUtility('spike', placed.position, true, replay.map, 0, 112), id: 'replay-spike' };
}

export function replayDoorsAt(replay: Replay, time: number, round: ReplayRound | undefined) {
  const amounts = new Map<string, number>();
  const changed = new Set<string>();
  if (!round) return { amounts, changed };
  for (const door of mapDoors(replay.map)) {
    const move = replay.doc.doors?.reduce<DoorMove | undefined>((latest, row) => row.actor === replayDoorActors[door.id] &&
      row.startMs >= round.startMs && row.startMs <= time && (!latest || row.startMs >= latest.startMs) ? row : latest, undefined);
    if (!move) continue;
    const elapsed = time - move.startMs;
    const amount = door.kind === 'spin' ? (time <= move.endMs ? Math.min(2, elapsed / 5000) : 0)
      : door.kind === 'shutter' ? (time >= move.endMs ? (move.toRest ? 0 : 1) : Math.abs(Number(!!move.toRest) - Math.min(1, elapsed / 5000)))
        : 1;
    if (amount > 0) amounts.set(door.id, amount);
    if (door.kind === 'spin' ? amount >= .5 && amount < 1.5 : amount >= .5) changed.add(door.id);
  }
  return { amounts, changed };
}

export function replayHealth(replay: Replay, player: ReplayPlayer, time: number) {
  const vitals = replay.doc.vitals?.[player.subject];
  if (!Array.isArray(vitals)) return;
  let lo = 0, hi = vitals.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (vitals[mid][0] <= time) lo = mid + 1;
    else hi = mid;
  }
  return vitals[lo - 1]?.[1];
}
