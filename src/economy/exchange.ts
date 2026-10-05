/**
 * Limited earned-currency exchanges (Store → Trade). Each offer has a cap
 * per UTC period (the same day/ISO-week keys as quests). The trade count is
 * incremented inside the same wallet transaction that moves the currency, so
 * a double tap or a reload can never exceed the cap or pay twice.
 */
import { EXCHANGE_OFFERS, type ExchangeOffer } from '../config/economy';
import { periodKeys } from '../quests/quests';
import type { SaveData } from '../save/schema';
import type { SaveManager } from '../save/saveManager';
import type { Wallet } from './wallet';

export function tradeKey(offer: ExchangeOffer, nowMs: number): string {
  const p = periodKeys(nowMs);
  return `${offer.id}@${offer.limit.per === 'daily' ? p.daily : p.weekly}`;
}

export function tradesLeft(s: Readonly<SaveData>, offer: ExchangeOffer, nowMs: number): number {
  return Math.max(0, offer.limit.count - (s.store.trades[tradeKey(offer, nowMs)] ?? 0));
}

export type TradeResult = 'ok' | 'limit' | 'unaffordable' | 'duplicate';

export function trade(save: SaveManager, wallet: Wallet, offer: ExchangeOffer, nowMs: number, txId: string, source?: { x: number; y: number }): TradeResult {
  if (tradesLeft(save.data, offer, nowMs) <= 0) return 'limit';
  if (!wallet.canAfford(offer.cost)) return 'unaffordable';
  const key = tradeKey(offer, nowMs);
  const ok = wallet.exchange(txId, offer.cost, offer.grants, (st) => {
    st.store.trades[key] = (st.store.trades[key] ?? 0) + 1;
    // Keep the record small: forget counters from old periods.
    const live = new Set(EXCHANGE_OFFERS.map((o) => tradeKey(o, nowMs)));
    for (const k of Object.keys(st.store.trades)) if (!live.has(k)) delete st.store.trades[k];
  }, source);
  return ok ? 'ok' : 'duplicate';
}
