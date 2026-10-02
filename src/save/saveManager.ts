/**
 * SaveManager — single owner of the persisted SaveData.
 *
 *  - `mutate` for ordinary changes (debounced write — never per frame).
 *  - `transact(txId, fn)` for rewards/purchases: idempotent (a txId is applied
 *    at most once, even if a callback fires twice) and written immediately.
 *  - Keeps a backup copy of the last good save to recover from corruption.
 *  - Validated export/import of the whole save as JSON.
 */
import { Emitter } from '../core/events';
import { SAVE_VERSION } from '../config/versions';
import { defaultSave, sanitizeSave, type SaveData } from './schema';
import { MemoryBackend, openBestBackend, type KVBackend, type StorageKind } from './storage';

const KEY = 'save';
const BACKUP_KEY = 'save.backup';
const DEBOUNCE_MS = 450;

export interface SaveHealth {
  kind: StorageKind;
  recoveredFromBackup: boolean;
  resetBecauseCorrupt: boolean;
  lastWriteError: string | null;
}

export class SaveManager {
  private backend: KVBackend = new MemoryBackend();
  private state: SaveData = defaultSave();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();
  readonly changes = new Emitter<{ change: SaveData }>();
  readonly health: SaveHealth = { kind: 'memory', recoveredFromBackup: false, resetBecauseCorrupt: false, lastWriteError: null };

  async load(backend?: KVBackend): Promise<void> {
    this.backend = backend ?? (await openBestBackend());
    this.health.kind = this.backend.kind;
    let raw: string | null = null;
    try {
      raw = await this.backend.get(KEY);
    } catch (err) {
      console.warn('[save] read failed', err);
    }
    const parsed = tryParse(raw);
    if (raw !== null && parsed === undefined) {
      // Corrupted primary save: try the backup before giving up.
      const backup = tryParse(await this.backend.get(BACKUP_KEY).catch(() => null));
      if (backup !== undefined) {
        this.state = sanitizeSave(backup);
        this.health.recoveredFromBackup = true;
      } else {
        this.state = defaultSave();
        this.health.resetBecauseCorrupt = true;
      }
    } else {
      this.state = sanitizeSave(parsed ?? null);
    }
    // Refresh the backup with the good state we just loaded.
    await this.safeWrite(BACKUP_KEY, JSON.stringify(this.state));
    await this.flush();
  }

  get data(): Readonly<SaveData> {
    return this.state;
  }

  get storageKind(): StorageKind {
    return this.backend.kind;
  }

  /** Apply a change; persisted after a short debounce. */
  mutate(fn: (s: SaveData) => void, opts: { immediate?: boolean } = {}): void {
    fn(this.state);
    this.state.updatedAt = Date.now();
    this.changes.emit('change', this.state);
    if (opts.immediate) void this.flush();
    else this.schedule();
  }

  /**
   * Idempotent transaction. Returns false (and changes nothing) if `txId` was
   * already applied. Always persisted immediately.
   */
  transact(txId: string, fn: (s: SaveData) => void): boolean {
    if (this.state.appliedTx.includes(txId)) return false;
    fn(this.state);
    this.state.appliedTx.push(txId);
    if (this.state.appliedTx.length > 500) this.state.appliedTx.splice(0, this.state.appliedTx.length - 500);
    this.state.updatedAt = Date.now();
    this.changes.emit('change', this.state);
    void this.flush();
    return true;
  }

  hasTx(txId: string): boolean {
    return this.state.appliedTx.includes(txId);
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  /** Writes now (serialised so writes never interleave). */
  flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const snapshot = JSON.stringify(this.state);
    this.writing = this.writing.then(() => this.safeWrite(KEY, snapshot));
    return this.writing;
  }

  private async safeWrite(key: string, value: string): Promise<void> {
    try {
      await this.backend.set(key, value);
      this.health.lastWriteError = null;
    } catch (err) {
      // Quota exceeded / storage revoked mid-session: keep playing in memory.
      this.health.lastWriteError = err instanceof Error ? err.message : String(err);
      console.warn('[save] write failed', err);
    }
  }

  exportJson(): string {
    return JSON.stringify({ format: 'slippery-fish-save', saveVersion: SAVE_VERSION, exportedAt: new Date().toISOString(), data: this.state }, null, 1);
  }

  /** Validates and replaces the current save. Throws a friendly Error on invalid input. */
  async importJson(text: string): Promise<void> {
    const parsed = tryParse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('That file is not a Slippery Fish save.');
    const wrapper = parsed as Record<string, unknown>;
    if (wrapper.format !== 'slippery-fish-save' || !wrapper.data) throw new Error('That file is not a Slippery Fish save.');
    await this.safeWrite(BACKUP_KEY, JSON.stringify(this.state));
    this.state = sanitizeSave(wrapper.data);
    this.changes.emit('change', this.state);
    await this.flush();
  }

  /** Clears LOCAL progress only. (No server account exists to delete.) */
  async resetLocal(): Promise<void> {
    this.state = defaultSave();
    try {
      await this.backend.remove(BACKUP_KEY);
    } catch {
      /* ignore */
    }
    this.changes.emit('change', this.state);
    await this.flush();
  }
}

function tryParse(raw: string | null | undefined): unknown {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}
