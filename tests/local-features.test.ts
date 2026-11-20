import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { libraryBackup, readLibraryBackup, type LibraryFolder } from '../src/library-backup.ts';
import { makeAgent, copyToPage, flipPage, worldMarker } from '../src/geometry.ts';
import { mapArtworkFrame, mapById, point, project } from '../src/catalog.ts';
import { copyCanvasObjects, encodeCanvasClipboard, pasteCanvasObjects, readCanvasClipboard } from '../src/canvas-clipboard.ts';
import { elevationsAt, prepareHeightModel, resolvedElevation, wallsAtElevation } from '../src/height-vision.ts';
import { nearestSightWall } from '../src/map-vision.ts';
import { prepareNavigation, routeAcrossMap, type NavSource } from '../src/navigation.ts';
import { decodeReplay, replayAgent, replayCastName, replayDoorsAt, replayPosition, replaySpikeAt, replayUtilityAt } from '../src/replay.ts';
import { formattedLines, textLinks } from '../src/text-content.ts';
import { quickTimeFrame, transparentMovie } from '../src/quicktime-animation.ts';
import { newPage, newStrategy } from '../src/strategy.ts';

test('folder ZIP preserves nested paths, folder styling and pinned strategies', () => {
  const folders: LibraryFolder[] = [
    { id: 'a', name: '进攻', icon: '📁', color: '#3b799f', pinned: true },
    { id: 'b', name: '二楼', icon: '🎯', color: '#e99986', parentId: 'a' },
  ];
  const source = { ...newStrategy('ascent', '夹击'), folderId: 'b', pinned: true };
  const restored = readLibraryBackup(libraryBackup([source], folders, 'a'));
  assert.equal(restored.drafts.length, 1);
  const recovered = restored.drafts[0];
  const parent = restored.folders.find(row => row.id === recovered.folderId);
  assert.equal(parent?.name, '二楼');
  assert.equal(restored.folders.find(row => row.id === parent?.parentId)?.pinned, true);
  assert.equal(recovered.pinned, true);
  assert.deepEqual(recovered.document, source.document);
});

test('adjacent-page copy keeps identity and avoids duplicates', () => {
  const map = mapById.ascent;
  const object = makeAgent('sage', point(780, 540), true);
  const source = { ...newPage(0), agentData: [object] };
  const target = newPage(1, 'false');
  const selection = { collection: 'agentData' as const, id: object.id };
  const changed = copyToPage(source, target, selection, map, 112);
  assert.deepEqual(changed.agentData, [object]);
  assert.equal(copyToPage(source, changed, selection, map, 112), changed);
  assert.deepEqual(target.agentData, []);
  const legacy = copyToPage(source, target, selection, map, 96);
  assert.notDeepEqual(legacy.agentData[0].position, object.position);
});

test('system clipboard transfers legacy map positions and referenced image bytes to a different strategy', () => {
  const source = newStrategy('ascent', '原图');
  source.document.versionNumber = '96';
  const map = mapById.ascent;
  const agent = makeAgent('sage', point(400, 500), true);
  const page = { ...source.document.pages[0], agentData: [agent],
    imageData: [{ id: 'picture', position: point(500, 400), aspectRatio: 1.5, scale: 100, fileExtension: '.png' }] };
  const defense = flipPage(page, 'false', map, 96);
  source.media['picture.png'] = new Uint8Array([1, 2, 3]);
  const encoded = encodeCanvasClipboard(copyCanvasObjects(source, defense, [
    { collection: 'agentData', id: agent.id }, { collection: 'imageData', id: 'picture' },
  ]));
  const target = newStrategy('ascent', '新战术');
  const loaded = readCanvasClipboard(encoded);
  assert.ok(loaded);
  const pasted = pasteCanvasObjects(loaded, target, target.document.pages[0]);
  const newAgent = pasted.page.agentData[0];
  const image = pasted.page.imageData[0];
  assert.notEqual(newAgent.id, agent.id);
  assert.deepEqual(worldMarker(newAgent, 'agentData', map, pasted.page, 112), point(422, 522));
  assert.deepEqual(pasted.media[image.assetId + image.fileExtension!], source.media['picture.png']);
});

test('the bundled height model finds local standable levels and different wall bands', () => {
  const map = mapById.ascent;
  for (const attack of [true, false]) {
    const side = attack ? 'attack' : 'defense';
    const bytes = readFileSync(new URL(`../public/game/elevation/ascent-${side}.json.gz`, import.meta.url));
    const model = prepareHeightModel(bytes, map, attack);
    const { x, y, scale } = mapArtworkFrame(map, attack);
    let stacked: ReturnType<typeof elevationsAt> | undefined;
    for (let row = 5; row < map.height && !stacked; row += 5) {
      for (let col = 5; col < map.width; col += 5) {
        const available = elevationsAt(model, point(x + col * scale, y + row * scale));
        if (available.choices.length > 1) { stacked = available; break; }
      }
    }
    assert.ok(stacked);
    assert.equal(resolvedElevation(stacked, stacked.choices[0].height), stacked.choices[0].height);
    assert.equal(resolvedElevation(stacked, 32000), stacked.automatic);
    assert.notDeepEqual(wallsAtElevation(model, 175), wallsAtElevation(model, 975));
  }
});

test('snapping chooses the nearest point within the current screen reach', () => {
  assert.deepEqual(nearestSightWall([[0, 0, 30, 0], [4, 2, 4, 30]], point(6, 7), 8), point(4, 7));
  assert.deepEqual(nearestSightWall([[0, 0, 30, 0]], point(6, 7), 2), point(6, 7));
});

test('released navigation assets produce matching routes across map sides', () => {
  const input = JSON.parse(readFileSync(new URL('../public/game/navigation/ascent.json', import.meta.url), 'utf8')) as NavSource;
  const nodes = prepareNavigation(input);
  const [firstLink] = input.links;
  const from = nodes[firstLink[0]]!.center;
  const to = nodes[firstLink[1]]!.center;
  const route = routeAcrossMap(nodes, from, to, true, []);
  assert.ok(route && route.length >= 2);
  assert.deepEqual(routeAcrossMap(nodes, project(from, false), project(to, false), false, []),
    route.map(p => project(p, false)));
});

test('plain HTTP links and inline formats remain separate from markup', () => {
  const [heading, ordered, following] = formattedLines('# **路线**\n3. *开始*\n1. 结束');
  assert.equal(heading.kind, 'heading');
  assert.deepEqual(heading.parts, [{ text: '路线', bold: true, italic: false }]);
  assert.equal(ordered.number, 3);
  assert.equal(following.number, 4);
  assert.deepEqual(textLinks('参考 https://example.com/guide。javascript:alert(1)').map(link => link.url),
    ['https://example.com/guide']);
});

test('transparent MOV writes ARGB sample data and points its chunk to the media payload', () => {
  const frame = quickTimeFrame(new Uint8ClampedArray([10, 20, 30, 0, 40, 50, 60, 128]), 2, 1);
  assert.deepEqual([...frame.slice(6)], [1, 2, 0, 10, 20, 30, 128, 40, 50, 60, 255, 0]);
  const movie = transparentMovie([frame, frame], 2, 1, 1000);
  const text = new TextDecoder('latin1').decode(movie);
  const chunk = text.indexOf('stco');
  assert.ok(text.includes('rle '));
  const offset = new DataView(movie.buffer).getUint32(chunk + 12);
  assert.equal(offset, text.indexOf('mdat') + 4);
  assert.deepEqual(movie.slice(offset, offset + frame.length), frame);
});

test('reads and projects an Icarus replay movement sample and rejects out-of-bounds data', () => {
  const subject = 'fixture-agent';
  const doc = {
    match: { mapPath: '/Game/Maps/Ascent/Ascent', durationMs: 10000 },
    players: [{ subject, agentId: '569fdd95-4d10-43ab-ca70-79becc718b46', team: 'Red' }],
    rounds: [{ index: 0, startMs: 0, endMs: 10000, plant: { timeMs: 3000, position: [100, 0, 0] }, defuse: { timeMs: 8000 } }],
    movement: { [subject]: { count: 1, offset: 0 } },
    casts: [{ timeMs: 1500, subject, slot: 3 }],
    utility: [{ id: 7, classPath: '/Game/Patch_Thorne_4_SlowField_Production.Patch_Thorne_4_SlowField_Production_C',
      owner: subject, spawnMs: 2000, endMs: 5000, position: [100, 0, 0] }],
    doors: [{ actor: 'WindowShieldA1', startMs: 3000, endMs: 8000 }],
  };
  const raw = new TextEncoder().encode(JSON.stringify(doc));
  const offset = Math.ceil((12 + raw.length) / 8) * 8;
  const bytes = new Uint8Array(offset + 24);
  bytes.set([73, 67, 82, 80]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 1, true); view.setUint32(8, raw.length, true);
  bytes.set(raw, 12);
  view.setInt32(offset, 100, true); view.setFloat32(offset + 4, 50, true);
  const replay = decodeReplay(bytes);
  assert.equal(replay.map.id, 'ascent');
  assert.equal(replayAgent(replay.doc.players[0]), 'sage');
  assert.equal(replayPosition(replay, replay.doc.players[0], 0), undefined);
  assert.ok(Number.isFinite(replayPosition(replay, replay.doc.players[0], 100)?.position.dx));
  const round = replay.doc.rounds[0];
  assert.equal(replayCastName(replay.doc.casts![0]), 'C 技能');
  assert.equal(replayUtilityAt(replay, 3000, round)[0]?.data.type, 'sage');
  assert.deepEqual(replayUtilityAt(replay, 5100, round), []);
  assert.equal(replaySpikeAt(replay, 4000, round)?.type, 'spike');
  assert.equal(replaySpikeAt(replay, 8500, round), undefined);
  assert.equal(replayDoorsAt(replay, 4000, round).changed.has('ascent-a'), false);
  assert.equal(replayDoorsAt(replay, 6000, round).changed.has('ascent-a'), true);
  assert.throws(() => decodeReplay(bytes.subarray(0, bytes.length - 1)), /越界/);
});
