/**
 * Payments — OPTIONAL real-money purchases.
 *
 * STATUS IN THIS BUILD: disabled. No payment provider, checkout backend, or
 * entitlement server exists, so no real-money product can be bought, no
 * price is charged, and nothing is ever granted from a client-side "success"
 * page. The Store shows the catalog as unavailable with an honest reason.
 *
 * A real integration must:
 *  - create provider-hosted checkout sessions on a SERVER (merchant secrets
 *    never reach the browser),
 *  - grant entitlements only after the server verifies the provider's
 *    signed webhook / receipt, idempotently per transaction id,
 *  - support Recover/Restore Purchases from the server's entitlement record,
 *  - display final prices from the provider (taxes/currency), plus refund
 *    terms and age/parental requirements where applicable.
 */
import { REAL_MONEY_CATALOG } from '../config/economy';
import { SERVICE_CONFIG } from '../config/services';

export interface ProductView {
  productId: string;
  label: string;
  grants: Partial<Record<'icicles' | 'shards' | 'fish', number>>;
  /** Not a live price — real prices must come from the provider. */
  referencePriceUsd: number;
}

export interface PaymentService {
  availability(): { available: boolean; reason: string };
  products(): ProductView[];
  purchase(productId: string): Promise<{ ok: false; reason: string }>;
  recoverPurchases(): Promise<{ ok: false; reason: string }>;
}

export const PAYMENTS_UNAVAILABLE_REASON = 'Real-money purchases are turned off in this version. Nothing here can be bought with real money — everything is earned by playing.';

export class DisabledPaymentService implements PaymentService {
  availability(): { available: boolean; reason: string } {
    return {
      available: false,
      reason: SERVICE_CONFIG.payments.provider
        ? 'A payment provider is configured, but secure server-verified checkout has not been implemented in this build.'
        : PAYMENTS_UNAVAILABLE_REASON,
    };
  }
  products(): ProductView[] {
    return REAL_MONEY_CATALOG.map((p) => ({ productId: p.productId, label: p.label, grants: { ...p.grants }, referencePriceUsd: p.referencePriceUsd }));
  }
  async purchase(): Promise<{ ok: false; reason: string }> {
    return { ok: false, reason: this.availability().reason };
  }
  async recoverPurchases(): Promise<{ ok: false; reason: string }> {
    return { ok: false, reason: 'There are no real-money purchases to recover — real-money purchases have never been enabled in this version.' };
  }
}
