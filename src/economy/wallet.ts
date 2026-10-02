/**
 * Wallet — currency balances backed by the save, with idempotent,
 * transaction-id-keyed grants and spends (a reward callback firing twice can
 * never pay twice; a spend never goes negative).
 */
import type { Currency } from '../config/economy';
import { Emitter } from '../core/events';
import type { SaveData } from '../save/schema';
import type { SaveManager } from '../save/saveManager';

export type Amounts = Partial<Record<Currency, number>>;

export interface Reward extends Amounts {
  hoods?: string[];
  waddles?: string[];
}

export interface WalletEvents {
  /** delta > 0 = gain (animate toward counter), < 0 = spend (visible deduction). */
  changed: { currency: Currency; delta: number; balance: number; source?: { x: number; y: number } };
}

const CURRENCIES: Currency[] = ['icicles', 'shards', 'fish'];

export class Wallet {
  readonly events = new Emitter<WalletEvents>();
  constructor(private save: SaveManager) {}

  balance(c: Currency): number {
    return this.save.data.wallet[c];
  }

  canAfford(cost: Amounts): boolean {
    return CURRENCIES.every((c) => (cost[c] ?? 0) <= this.balance(c));
  }

  /** Atomically deducts `cost` (and applies `extra` in the same transaction). False if unaffordable or already applied. */
  spend(txId: string, cost: Amounts, extra?: (s: SaveData) => void): boolean {
    if (this.save.hasTx(txId)) return false;
    if (!this.canAfford(cost)) return false;
    const applied = this.save.transact(txId, (s) => {
      for (const c of CURRENCIES) s.wallet[c] = Math.max(0, s.wallet[c] - Math.max(0, Math.floor(cost[c] ?? 0)));
      extra?.(s);
    });
    if (applied) for (const c of CURRENCIES) if (cost[c]) this.events.emit('changed', { currency: c, delta: -(cost[c] ?? 0), balance: this.balance(c) });
    return applied;
  }

  /**
   * Spend `cost` and grant `reward` in ONE transaction (chests, purchases):
   * either both happen or neither does, exactly once per txId.
   */
  exchange(txId: string, cost: Amounts, reward: Reward, extra?: (s: SaveData) => void, source?: { x: number; y: number }): boolean {
    if (this.save.hasTx(txId) || !this.canAfford(cost)) return false;
    const applied = this.save.transact(txId, (s) => {
      for (const c of CURRENCIES) s.wallet[c] = Math.max(0, s.wallet[c] - Math.max(0, Math.floor(cost[c] ?? 0)));
      for (const c of CURRENCIES) s.wallet[c] = Math.min(1_000_000_000, s.wallet[c] + Math.max(0, Math.floor(reward[c] ?? 0)));
      for (const hd of reward.hoods ?? []) if (!s.hoods.owned.includes(hd)) s.hoods.owned.push(hd);
      for (const w of reward.waddles ?? []) if (!s.waddles.owned.includes(w)) s.waddles.owned.push(w);
      extra?.(s);
    });
    if (applied) {
      for (const c of CURRENCIES) {
        const delta = (reward[c] ?? 0) - (cost[c] ?? 0);
        if (delta !== 0) this.events.emit('changed', { currency: c, delta, balance: this.balance(c), ...(delta > 0 && source ? { source } : {}) });
      }
    }
    return applied;
  }

  /** Grants a reward exactly once per txId. */
  grant(txId: string, reward: Reward, extra?: (s: SaveData) => void, source?: { x: number; y: number }): boolean {
    const applied = this.save.transact(txId, (s) => {
      for (const c of CURRENCIES) s.wallet[c] = Math.min(1_000_000_000, s.wallet[c] + Math.max(0, Math.floor(reward[c] ?? 0)));
      for (const hd of reward.hoods ?? []) if (!s.hoods.owned.includes(hd)) s.hoods.owned.push(hd);
      for (const w of reward.waddles ?? []) if (!s.waddles.owned.includes(w)) s.waddles.owned.push(w);
      extra?.(s);
    });
    if (applied) for (const c of CURRENCIES) if (reward[c]) this.events.emit('changed', { currency: c, delta: reward[c] ?? 0, balance: this.balance(c), ...(source ? { source } : {}) });
    return applied;
  }
}

export function isEmptyReward(r: Reward): boolean {
  return !r.icicles && !r.shards && !r.fish && !(r.hoods?.length) && !(r.waddles?.length);
}
