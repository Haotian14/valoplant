import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/import-vision-walls.mjs /path/to/icarus/assets/maps');
const catalog = JSON.parse(await readFile(new URL('../src/catalog.json', import.meta.url), 'utf8'));
const output = new URL('../public/game/vision/', import.meta.url);
await mkdir(output, { recursive: true });

function edgesAtEyeHeight(model) {
  const eye = model.defaultCameraHeightMeters;
  const edges = new Map();
  for (const wall of model.walls) {
    if (!wall.unknownHeight && !wall.bands.some(([bottom, top]) => bottom <= eye && (top === null || eye <= top))) continue;
    for (const ring of wall.rings) {
      for (let index = 0; index < ring.length; index += 2) {
        const next = (index + 2) % ring.length;
        const [x1, y1, x2, y2] = [ring[index], ring[index + 1], ring[next], ring[next + 1]]
          .map(value => Math.round(value * 100) / 100);
        if (Math.hypot(x1 - x2, y1 - y2) < .06) continue;
        const edge = x1 < x2 || (x1 === x2 && y1 < y2) ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
        edges.set(edge.join(','), edge);
      }
    }
  }
  return Array.from(edges.values()).flat();
}

for (const map of catalog.maps) {
  for (const side of ['attack', 'defense']) {
    const name = `${map.id}_svg_height_${side}.json.gz`;
    const model = JSON.parse(gunzipSync(await readFile(resolve(source, name))).toString());
    if (model.map !== map.id || model.side !== side || model.viewBox[2] !== map.width || model.viewBox[3] !== map.height) {
      throw new Error(`Unexpected registration for ${name}`);
    }
    await writeFile(new URL(`${map.id}-${side}.json`, output), JSON.stringify(edgesAtEyeHeight(model)) + '\n');
  }
}
