import type { Strategy } from './strategy.ts';
import type { LibraryFolder } from './library-backup.ts';

const storeName = 'strategies';
const folderStore = 'folders';
const replayStore = 'replays';
export type SavedReplay = { id: string; name: string; blob: Blob; map: string };

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('valoplant-team-playbook', 3);
    let blocked = false;
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(storeName)) open.result.createObjectStore(storeName, { keyPath: 'id' });
      if (!open.result.objectStoreNames.contains(folderStore)) open.result.createObjectStore(folderStore, { keyPath: 'id' });
      if (!open.result.objectStoreNames.contains(replayStore)) open.result.createObjectStore(replayStore, { keyPath: 'id' });
    };
    open.onsuccess = () => {
      if (blocked) { open.result.close(); return; }
      open.result.onversionchange = () => { open.result.close(); connection = undefined; };
      resolve(open.result);
    };
    open.onerror = () => reject(open.error);
    open.onblocked = () => {
      blocked = true;
      reject(new Error('本机存储更新被另一个战术板标签页占用'));
    };
  });
}

let connection: Promise<IDBDatabase> | undefined;
function database() {
  return connection ??= openLibrary().catch(error => { connection = undefined; throw error; });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>, name = storeName) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const request = action(tx.objectStore(name));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? request.error);
  });
}

export const loadDrafts = () => transaction<Strategy[]>('readonly', store => store.getAll());
export const saveDraft = (strategy: Strategy) => transaction('readwrite', store => store.put(strategy));
export const deleteDraft = (id: string) => transaction('readwrite', store => store.delete(id));
export const loadFolders = () => transaction<LibraryFolder[]>('readonly', store => store.getAll(), folderStore);
export const loadReplays = () => transaction<SavedReplay[]>('readonly', store => store.getAll(), replayStore);
export const saveReplay = (replay: SavedReplay) => transaction('readwrite', store => store.put(replay), replayStore);
export const deleteReplay = (id: string) => transaction('readwrite', store => store.delete(id), replayStore);

export async function updateLibrary(drafts: Strategy[], folders: LibraryFolder[], removedFolder?: string) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([storeName, folderStore], 'readwrite');
    const draftRows = tx.objectStore(storeName);
    const folderRows = tx.objectStore(folderStore);
    for (const draft of drafts) draftRows.put(draft);
    for (const folder of folders) folderRows.put(folder);
    if (removedFolder) folderRows.delete(removedFolder);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
