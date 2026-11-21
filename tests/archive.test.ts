import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { strToU8, unzipSync } from 'fflate';
import { importIca, readIca, writeIca } from '../src/archive.ts';
import { append, appendLineup, moveItem, newPage, newStrategy, pageName, reindexPages, removeItems } from '../src/strategy.ts';
import { buildStrategyIndex } from '../scripts/strategy-index.mjs';

const position = { dx: 900, dy: 500 };

test('opens a native .ica archive and round-trips its pages, metadata, and media', () => {
  const draft = newStrategy('ascent', '进攻 A');
  const [page] = draft.document.pages;
  draft.document.pages = [
    { ...page, name: '开局「A」', agentData: [{ id: 'jett', type: 'jett', isAlly: true, position }],
      imageData: [{ id: 'reference', position, aspectRatio: 1, scale: 160, sizeVersion: 1, fileExtension: '.png' }] },
    { ...newPage(1, 'false'), name: '第二阶段' },
  ];
  draft.document.themePalette = { highlightColorValue: 0xff000000 };
  const reference = new Uint8Array([1, 2, 3, 4]);
  draft.media['reference.png'] = reference;
  const bytes = writeIca(draft);
  assert.deepEqual(Object.keys(unzipSync(bytes)).sort(), ['reference.png', 'strategy.json']);
  const copy = importIca(bytes, '队友的战术.ica');
  assert.equal(copy.name, '队友的战术');
  assert.notEqual(copy.id, draft.id);
  assert.deepEqual(copy.document, draft.document);
  assert.deepEqual(copy.media['reference.png'], reference);
});

test('reads native legacy Lineup records and keeps their media references', () => {
  const document = {
    mapData: 'lotus',
    versionNumber: '35',
    pages: [{ ...newPage(0), isAttack: 'true', lineUpOrigins: undefined, lineUpLandings: undefined,
      lineUpLinks: undefined, lineUpData: [{ id: 'setup', notes: 'Look at the roof', agent: {
        id: 'agent', type: 'omen', position,
      }, ability: { id: 'smoke', data: { type: 'omen', index: 2 }, position },
      images: [{ id: 'ref', fileExtension: '.png' }] }] }],
  };
  const [page] = readIca(strToU8(JSON.stringify(document))).document.pages;
  assert.equal(page.lineUpOrigins[0].agent.type, 'omen');
  assert.equal(page.lineUpLandings[0].ability.data.index, 2);
  assert.equal(page.lineUpLinks[0].notes, 'Look at the roof');
  assert.equal(page.lineUpLinks[0].images[0].id, 'ref');
});

test('shared Lineup endpoints are stored once and survive an .ica round trip', () => {
  const draft = newStrategy('lotus', 'Lineups');
  const [page] = draft.document.pages;
  const agent = { id: 'omen', type: 'omen', position };
  const ability = { id: 'smoke', data: { type: 'omen', index: 2 }, position };
  const first = { id: 'first', originId: 'a', landingId: 'b', name: '', notes: '', youtubeLink: '', images: [] };
  draft.document.pages = [appendLineup(
    appendLineup(appendLineup(page, first, agent, ability),
      { ...first, id: 'from-origin', landingId: 'c' }, agent, { ...ability, id: 'second-smoke' }),
    { ...first, id: 'to-landing', originId: 'd' }, { ...agent, id: 'second-omen' }, ability,
  )];

  const [copy] = readIca(writeIca(draft)).document.pages;
  assert.deepEqual(copy.lineUpOrigins.map(row => row.id), ['a', 'd']);
  assert.deepEqual(copy.lineUpLandings.map(row => row.id), ['b', 'c']);
  assert.deepEqual(copy.lineUpLinks.map(row => [row.originId, row.landingId]), [['a', 'b'], ['a', 'c'], ['d', 'b']]);
});

test('an .ica archive preserves walls, range visibility and picture reference links', () => {
  const draft = newStrategy('lotus', '几何标注');
  const [page] = draft.document.pages;
  page.abilityData = [
    { id: 'high-tide', data: { type: 'harbor', index: 1 }, position, wallPath: [{ dx: 20, dy: -40 }, { dx: 60, dy: -100 }] },
    { id: 'smoke', data: { type: 'omen', index: 2 }, position, visualState: { showRangeFill: false, showRangeOutline: true } },
  ];
  page.imageData = [{ id: 'ref', position, aspectRatio: 1, scale: 200, link: 'https://example.com/reference' }];

  const [copy] = readIca(writeIca(draft)).document.pages;
  assert.deepEqual(copy.abilityData, page.abilityData);
  assert.deepEqual(copy.imageData, page.imageData);
});

test('page reordering renumbers localized automatic names and keeps custom names', () => {
  const auto = { ...newPage(2), name: '第 3 页' };
  const custom = { ...newPage(0), name: '切 B', isAutoNamed: false };
  const reordered = reindexPages([auto, custom]);

  assert.deepEqual(reordered.map(page => [page.id, page.sortIndex, page.name]),
    [[auto.id, '0', 'Page 1'], [custom.id, '1', '切 B']]);
  assert.deepEqual(reordered.map(pageName), ['第 1 页', '切 B']);
});

test('moving and deleting a selection only mutates the current page version', () => {
  const original = newPage(0);
  const agent = { id: 'omen', type: 'omen', position };
  const page = append(original, 'agentData', agent);
  const moved = moveItem(page.agentData[0], { dx: 30, dy: -15 });
  assert.deepEqual(moved, { ...agent, position: { dx: 930, dy: 485 } });
  assert.deepEqual(page.agentData[0].position, position);
  assert.equal(original.agentData.length, 0);
  assert.equal(removeItems(page, [{ collection: 'agentData', id: agent.id }]).agentData.length, 0);
});

test('indexes nested names and updates revisions from the actual strategy file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'team-playbook-index-'));
  try {
    const directory = join(root, '进攻 #1');
    const file = join(directory, 'A 夹击.ica');
    await mkdir(directory);
    const draft = newStrategy('ascent', 'A 夹击');
    const [page] = draft.document.pages;
    page.agentData = [
      { id: 'ally', type: 'sova', position },
      { id: 'enemy', type: 'raze', isAlly: false, position },
      { id: 'deleted', type: 'sage', isDeleted: true, position },
      { id: 'unknown', type: 'unknown-agent', position },
    ];
    page.abilityData = [
      { id: 'ally-skill', data: { type: 'omen', index: 2 }, position },
      { id: 'enemy-skill', data: { type: 'jett', index: 0 }, isAlly: false, position },
    ];
    draft.document.pages[0] = appendLineup(page,
      { id: 'lineup', originId: 'origin', landingId: 'landing', name: '', notes: '', youtubeLink: '', images: [] },
      { id: 'origin', type: 'viper', position }, { id: 'landing', data: { type: 'viper', index: 0 }, position });
    await writeFile(file, writeIca(draft));
    const [first] = await buildStrategyIndex(root);
    assert.deepEqual(first.path, ['进攻 #1', 'A 夹击.ica']);
    assert.equal(first.map, 'ascent');
    assert.deepEqual(first.roster, ['sova', 'omen', 'viper']);
    draft.document.pages.push({ ...newPage(1), agentData: [
      { id: 'repeat', type: 'sova', position },
      { id: 'new', type: 'breach', position },
    ] });
    await writeFile(file, writeIca(draft));
    const [second] = await buildStrategyIndex(root);
    assert.notEqual(second.revision, first.revision);
    assert.deepEqual(second.roster, ['sova', 'omen', 'viper', 'breach']);
    await rm(file);
    assert.deepEqual(await buildStrategyIndex(root), []);
    await writeFile(file, 'invalid .ica');
    await assert.rejects(buildStrategyIndex(root), /进攻 #1\/A 夹击\.ica/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
