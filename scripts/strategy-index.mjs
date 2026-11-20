import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { readIca } from '../src/archive.ts';

const maxFileBytes = 64 * 1024 * 1024;

async function strategyFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    if (entry.name.startsWith('.')) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return strategyFiles(path);
    return entry.isFile() && /\.ica$/i.test(entry.name) ? [path] : [];
  }));
  return nested.flat();
}

export async function buildStrategyIndex(root, writeFile) {
  const files = (await strategyFiles(root)).sort((a, b) => a.localeCompare(b));
  const records = [];
  for (const file of files) {
    const path = relative(root, file).split(sep);
    try {
      if (path.some(part => part.includes('\\'))) throw new Error('文件名不能包含反斜线');
      if ((await stat(file)).size > maxFileBytes) throw new Error('.ica 文件须在 64 MB 以内');
      const bytes = await readFile(file);
      const { document } = readIca(bytes);
      const revision = createHash('sha256').update(bytes).digest('hex');
      const record = { path, name: path.at(-1).slice(0, -4), map: document.mapData, revision };
      records.push(record);
      await writeFile?.(record, bytes);
    } catch (error) {
      throw new Error(`${path.join('/')}: ${error.message}`, { cause: error });
    }
  }
  return records;
}
