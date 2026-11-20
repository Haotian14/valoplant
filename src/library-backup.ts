import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { importIca, writeIca, saveDownload } from './archive.ts';
import { newId, type Strategy } from './strategy.ts';

export type LibraryFolder = {
  id: string; parentId?: string; name: string; color: string; icon: string; pinned?: boolean;
};

export const folderIcons = ['📁', '🎯', '🗺️', '🛡️', '⚡'];
export const defaultFolderColor = '#a883ee';
const manifestName = 'team-playbook-library.json';
const component = (value: string) => value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().replace(/^\.+/, '').slice(0, 120) || '未命名';

export function folderChain(folders: LibraryFolder[], id: string | undefined) {
  const chain: LibraryFolder[] = [];
  const remaining = new Set(folders.map(folder => folder.id));
  let cursor = id;
  while (cursor && remaining.delete(cursor)) {
    const folder = folders.find(row => row.id === cursor);
    if (!folder) break;
    chain.unshift(folder);
    cursor = folder.parentId;
  }
  return chain;
}

export function libraryBackup(drafts: Strategy[], folders: LibraryFolder[], root?: string): Uint8Array {
  const inScope = (id: string | undefined) => !root || folderChain(folders, id).some(folder => folder.id === root);
  const scope = folders.filter(folder => inScope(folder.id));
  const files: Record<string, Uint8Array> = {};
  const backupDrafts: { file: string; folderId?: string; pinned?: boolean; createdAt?: number }[] = [];
  for (const draft of drafts) {
    if (!inScope(draft.folderId)) continue;
    const chain = folderChain(folders, draft.folderId);
    const begin = root ? chain.findIndex(folder => folder.id === root) : 0;
    const prefix = chain.slice(begin).map(folder => component(folder.name)).join('/');
    const base = [prefix, component(draft.name)].filter(Boolean).join('/');
    let filename = base + '.ica';
    for (let copy = 2; Object.hasOwn(files, filename); copy++) filename = `${base} (${copy}).ica`;
    files[filename] = writeIca(draft);
    backupDrafts.push({ file: filename, folderId: draft.folderId, pinned: draft.pinned, createdAt: draft.createdAt });
  }
  files[manifestName] = strToU8(JSON.stringify({ version: 1, folders: scope, drafts: backupDrafts }));
  return zipSync(files, { level: 0 });
}

export function downloadLibrary(drafts: Strategy[], folders: LibraryFolder[], root?: string) {
  const label = root ? folders.find(row => row.id === root)?.name : '战术库备份';
  saveDownload(libraryBackup(drafts, folders, root), `${component(label ?? '战术')}.zip`, 'application/zip');
}

export function readLibraryBackup(bytes: Uint8Array) {
  let total = 0;
  const files = unzipSync(bytes, { filter(entry) {
    if (!/\.ica$/i.test(entry.name) && entry.name !== manifestName) return false;
    if (entry.name.split('/').some(name => !name || name === '.' || name === '..' || name.includes('\\'))) return false;
    total += entry.originalSize;
    if (total > 256 * 1024 * 1024) throw new Error('备份解压后超过 256 MB');
    return true;
  } });
  const folders: LibraryFolder[] = [];
  const manifest = files[manifestName] && JSON.parse(strFromU8(files[manifestName]));
  const folderIds = new Map<string, string>();
  if (manifest?.version === 1 && Array.isArray(manifest.folders)) {
    const source = manifest.folders.filter((folder: LibraryFolder) => typeof folder?.id === 'string' && typeof folder.name === 'string');
    for (const folder of source) folderIds.set(folder.id, newId());
    for (const folder of source) {
      const visited = new Set([folder.id]);
      let parent = folder.parentId;
      while (parent && !visited.has(parent)) {
        visited.add(parent);
        parent = source.find((value: LibraryFolder) => value.id === parent)?.parentId;
      }
      folders.push({
        id: folderIds.get(folder.id)!, parentId: parent ? undefined : folderIds.get(folder.parentId),
        name: folder.name.slice(0, 120), color: /^#[a-f\d]{6}$/i.test(folder.color) ? folder.color : defaultFolderColor,
        icon: folderIcons.includes(folder.icon) ? folder.icon : folderIcons[0], pinned: folder.pinned === true,
      });
    }
  }
  const pathFolders = new Map<string, string>();
  const byFile = new Map<string, { folderId: string; pinned?: boolean; createdAt?: number }>();
  if (Array.isArray(manifest?.drafts)) for (const row of manifest.drafts) if (typeof row?.file === 'string') byFile.set(row.file, row);
  const drafts = Object.entries(files).flatMap(([path, dataBytes]) => {
    if (!/\.ica$/i.test(path)) return [];
    const parts = path.split('/');
    const file = parts.pop()!;
    const metadata = byFile.get(path);
    let parentId = metadata ? folderIds.get(metadata.folderId) : undefined;
    if (!metadata) {
      const prefix: string[] = [];
      for (const name of parts) {
        prefix.push(name);
        const key = prefix.join('/');
        const known = pathFolders.get(key);
        if (known) { parentId = known; continue; }
        const id = newId();
        folders.push({ id, parentId, name: name.slice(0, 120), icon: folderIcons[0], color: defaultFolderColor });
        pathFolders.set(key, id);
        parentId = id;
      }
    }
    return [{ ...importIca(dataBytes, file), folderId: parentId, pinned: metadata?.pinned === true,
      createdAt: Number.isFinite(metadata?.createdAt) ? metadata?.createdAt : Date.now() }];
  });
  if (!drafts.length && !folders.length) throw new Error('备份中没有战术或文件夹');
  return { drafts, folders };
}
