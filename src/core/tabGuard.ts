/**
 * TabGuard — one active game tab per browser profile.
 *
 * Two open tabs each hold their own in-memory copy of the save; without a
 * guard, feeding the pet or claiming a chest in both could double-spend or
 * double-claim from stale copies. The guard makes exactly one tab "active":
 *
 *  - Preferred: the Web Locks API (`navigator.locks`) — the active tab holds
 *    an exclusive lock. A new tab that cannot get it shows "open in another
 *    tab" and may take over: the old tab flushes its save, turns read-only
 *    and releases the lock; the new tab then re-reads the save from storage.
 *  - Fallback: a BroadcastChannel hello/here handshake (same behaviour,
 *    slightly weaker against two tabs opening in the same instant).
 *  - Neither available: no guard (documented limitation; per-transaction
 *    idempotency still prevents double-paying inside one tab).
 */
const LOCK = 'slippery-fish-active-tab';
const CHANNEL = 'slippery-fish-tabs';

type Msg = { t: 'hello'; id: string } | { t: 'here'; id: string } | { t: 'takeover'; id: string } | { t: 'released'; id: string };

export interface TabGuardHooks {
  /** This tab may play (initially, or after a takeover). */
  onActive: (afterTakeover: boolean) => void | Promise<void>;
  /** Another tab owns the game; offer "play here". */
  onBlocked: () => void;
  /** This tab handed the game to another tab: flush and go read-only. */
  onReleased: () => Promise<void>;
}

export class TabGuard {
  readonly id = Math.random().toString(36).slice(2);
  private channel: BroadcastChannel | null = null;
  private releaseLock: (() => void) | null = null;
  private active = false;
  private waiters: Array<() => void> = [];

  constructor(private hooks: TabGuardHooks) {
    try {
      this.channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
    } catch {
      this.channel = null;
    }
    this.channel?.addEventListener('message', (e: MessageEvent<Msg>) => void this.onMessage(e.data));
  }

  get isActive(): boolean {
    return this.active;
  }

  private get locks(): LockManager | null {
    try {
      return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null;
    } catch {
      return null;
    }
  }

  async start(): Promise<void> {
    const locks = this.locks;
    if (locks) {
      const got = await this.tryLock(locks, true);
      if (got) await this.becomeActive(false);
      else this.hooks.onBlocked();
      return;
    }
    if (!this.channel) {
      await this.becomeActive(false);
      return;
    }
    // BroadcastChannel fallback: ask whether someone is already playing.
    let answered = false;
    const onHere = (e: MessageEvent<Msg>) => { if (e.data.t === 'here') answered = true; };
    this.channel.addEventListener('message', onHere);
    this.post({ t: 'hello', id: this.id });
    await new Promise((r) => setTimeout(r, 300));
    this.channel.removeEventListener('message', onHere);
    if (answered) this.hooks.onBlocked();
    else await this.becomeActive(false);
  }

  /** Called from the "Play here instead" button of a blocked tab. */
  async takeOver(): Promise<void> {
    if (this.active) return;
    const released = new Promise<void>((r) => this.waiters.push(r));
    this.post({ t: 'takeover', id: this.id });
    const locks = this.locks;
    if (locks) {
      // Wait for the lock itself (the other tab releases it after flushing); give up after 4 s.
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      const got = await this.tryLock(locks, false, ctrl.signal);
      clearTimeout(timer);
      if (!got) {
        this.hooks.onBlocked();
        return;
      }
    } else {
      await Promise.race([released, new Promise((r) => setTimeout(r, 1500))]);
    }
    await this.becomeActive(true);
  }

  private tryLock(locks: LockManager, ifAvailable: boolean, signal?: AbortSignal): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const opts: LockOptions = ifAvailable ? { mode: 'exclusive', ifAvailable: true } : { mode: 'exclusive', ...(signal ? { signal } : {}) };
      locks.request(LOCK, opts, (lock) => {
        if (!lock) {
          resolve(false);
          return undefined;
        }
        resolve(true);
        // Hold the lock until released.
        return new Promise<void>((release) => { this.releaseLock = release; });
      }).catch(() => resolve(false));
    });
  }

  private async becomeActive(afterTakeover: boolean): Promise<void> {
    this.active = true;
    await this.hooks.onActive(afterTakeover);
  }

  private async onMessage(m: Msg): Promise<void> {
    if (m.id === this.id) return;
    if (m.t === 'hello' && this.active) this.post({ t: 'here', id: this.id });
    if (m.t === 'takeover' && this.active) {
      this.active = false;
      await this.hooks.onReleased();
      this.releaseLock?.();
      this.releaseLock = null;
      this.post({ t: 'released', id: this.id });
    }
    if (m.t === 'released') {
      const w = this.waiters;
      this.waiters = [];
      for (const fn of w) fn();
    }
  }

  private post(m: Msg): void {
    try {
      this.channel?.postMessage(m);
    } catch {
      /* channel closed */
    }
  }
}
