import type { Strategy } from './strategy.ts';

const storeName = 'strategies';

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('valoplant-team-playbook', 1);
    open.onupgradeneeded = () => open.result.createObjectStore(storeName, { keyPath: 'id' });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

let connection: Promise<IDBDatabase> | undefined;

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await (connection ??= openLibrary());
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? request.error);
  });
}

export const loadDrafts = () => transaction<Strategy[]>('readonly', store => store.getAll());
export const saveDraft = (strategy: Strategy) => transaction('readwrite', store => store.put(strategy));
export const deleteDraft = (id: string) => transaction('readwrite', store => store.delete(id));
