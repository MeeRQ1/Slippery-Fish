/**
 * Persistence backends: IndexedDB (preferred), localStorage (fallback) and an
 * in-memory store when the browser denies storage (some private modes,
 * blocked site data). The active kind is shown to the player so local-only /
 * session-only limits are never hidden.
 */
export type StorageKind = 'indexeddb' | 'localstorage' | 'memory';

export interface KVBackend {
  readonly kind: StorageKind;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const DB_NAME = 'slippery-fish';
const STORE = 'kv';

class IndexedDBBackend implements KVBackend {
  readonly kind = 'indexeddb' as const;
  private constructor(private db: IDBDatabase) {}

  static open(timeoutMs = 2500): Promise<IndexedDBBackend> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('indexedDB unavailable'));
        return;
      }
      const timer = setTimeout(() => reject(new Error('indexedDB open timeout')), timeoutMs);
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch (err) {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => {
        clearTimeout(timer);
        resolve(new IndexedDBBackend(req.result));
      };
      req.onerror = () => {
        clearTimeout(timer);
        reject(req.error ?? new Error('indexedDB open failed'));
      };
      req.onblocked = () => {
        clearTimeout(timer);
        reject(new Error('indexedDB blocked'));
      };
    });
  }

  private tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = this.db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req.result);
      t.onerror = () => reject(t.error ?? new Error('transaction failed'));
      t.onabort = () => reject(t.error ?? new Error('transaction aborted (quota?)'));
    });
  }

  async get(key: string): Promise<string | null> {
    const v = await this.tx<unknown>('readonly', (s) => s.get(key));
    return typeof v === 'string' ? v : null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.tx('readwrite', (s) => s.put(value, key));
  }

  async remove(key: string): Promise<void> {
    await this.tx('readwrite', (s) => s.delete(key));
  }
}

class LocalStorageBackend implements KVBackend {
  readonly kind = 'localstorage' as const;
  static probe(): LocalStorageBackend {
    const k = '__sf_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return new LocalStorageBackend();
  }
  async get(key: string): Promise<string | null> {
    return localStorage.getItem(`sf.${key}`);
  }
  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(`sf.${key}`, value);
  }
  async remove(key: string): Promise<void> {
    localStorage.removeItem(`sf.${key}`);
  }
}

export class MemoryBackend implements KVBackend {
  readonly kind = 'memory' as const;
  private map = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}

export async function openBestBackend(): Promise<KVBackend> {
  try {
    return await IndexedDBBackend.open();
  } catch (err) {
    console.warn('[save] IndexedDB unavailable, trying localStorage', err);
  }
  try {
    return LocalStorageBackend.probe();
  } catch (err) {
    console.warn('[save] localStorage unavailable, using memory (progress will not persist)', err);
  }
  return new MemoryBackend();
}
