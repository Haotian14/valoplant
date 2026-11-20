import { mkdir, writeFile, copyFile, cp } from 'node:fs/promises';
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
console.log(`已发布 ${records.length} 条团队战术`);
