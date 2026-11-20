import { mkdir, writeFile, copyFile, cp, readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { buildStrategyIndex } from './strategy-index.mjs';

const output = resolve('dist/strategies');
const records = await buildStrategyIndex(resolve('strategies'), async (entry, bytes) => {
  const file = join(output, 'files', entry.revision, ...entry.path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
});
await mkdir(output, { recursive: true });
await writeFile(join(output, 'index.json'), JSON.stringify(records, null, 2) + '\n');
await Promise.all([
  copyFile('LICENSE', join('dist', 'LICENSE')),
  copyFile('NOTICE', join('dist', 'NOTICE')),
  cp('LICENSES', join('dist', 'LICENSES'), { recursive: true }),
]);
async function walk(path) {
  const entries = await readdir(join('dist', path), { withFileTypes: true });
  const children = await Promise.all(entries.map(entry => entry.isDirectory()
    ? walk(`${path}/${entry.name}`) : `${path}/${entry.name}`));
  return children.flat();
}
const files = ['index.html', ...(await walk('assets')), ...(await walk('game'))].sort();
const fingerprint = createHash('sha256');
for (const file of files) fingerprint.update(file).update(await readFile(join('dist', file)));
const worker = await readFile(new URL('./offline-worker.js', import.meta.url), 'utf8');
await writeFile(join('dist', 'sw.js'), `const version = '${fingerprint.digest('hex')}';\nconst files = ${JSON.stringify(files)};\n${worker}`);
console.log(`已发布 ${records.length} 条团队战术`);
