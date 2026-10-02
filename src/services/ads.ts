/**
 * AdService — the ONLY path from gameplay to rewarded ads. Gameplay never
 * touches a provider SDK.
 *
 * STATUS IN THIS BUILD: no browser rewarded-ad provider is integrated or
 * configured. `UnavailableAdService` is used in production: every placement
 * reports unavailable with a clear reason and nothing is ever auto-granted.
 *
 * A clearly labelled DEVELOPMENT MOCK exists for testing the UI flows. It is
 * only constructible in `vite dev` builds (import.meta.env.DEV) when the URL
 * contains `?mockAds=1`, it shows "DEV MOCK AD" on screen, and it is
 * tree-shaken out of production builds.
 *
 * Rewards must only be granted on the provider's documented qualifying
 * reward event — never on button press, ad start, load failure, premature
 * close or a timer. Callers grant through Wallet.grant(txId) so duplicate
 * callbacks cannot double-pay.
 */
export type AdPlacement = 'failure_continue' | 'free_chest' | 'fishing';

export type AdResult =
  | { status: 'rewarded'; rewardId: string }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string }
  | { status: 'unavailable'; reason: string };

export interface AdService {
  readonly providerName: string;
  /** Honest, player-facing availability. */
  availability(placement: AdPlacement): { available: boolean; reason: string };
  /** Resolves once the ad flow finishes. Never rejects. */
  showRewarded(placement: AdPlacement): Promise<AdResult>;
}

export const ADS_UNAVAILABLE_REASON = 'Rewarded ads are not connected in this version of Slippery Fish yet.';

export class UnavailableAdService implements AdService {
  readonly providerName = 'none';
  availability(): { available: boolean; reason: string } {
    return { available: false, reason: ADS_UNAVAILABLE_REASON };
  }
  async showRewarded(): Promise<AdResult> {
    return { status: 'unavailable', reason: ADS_UNAVAILABLE_REASON };
  }
}

/** DEVELOPMENT ONLY. Simulates provider callbacks so the UI can be exercised. */
class DevMockAdService implements AdService {
  readonly providerName = 'DEV MOCK (not a real ad)';
  private counter = 0;
  availability(): { available: boolean; reason: string } {
    return { available: true, reason: 'Development mock — no real ad will play.' };
  }
  showRewarded(placement: AdPlacement): Promise<AdResult> {
    return new Promise((resolve) => {
      const veil = document.createElement('div');
      veil.className = 'dev-mock-ad';
      veil.innerHTML = `<div class="dev-mock-card"><b>DEV MOCK AD</b><p>Placement: ${placement}<br/>This is not a real advertisement.</p></div>`;
      const mk = (label: string, fn: () => void) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.addEventListener('click', () => { veil.remove(); fn(); });
        veil.querySelector('.dev-mock-card')!.append(b);
      };
      mk('Simulate reward', () => resolve({ status: 'rewarded', rewardId: `mock-${Date.now()}-${++this.counter}` }));
      mk('Simulate cancel', () => resolve({ status: 'cancelled' }));
      mk('Simulate failure', () => resolve({ status: 'failed', reason: 'No fill (simulated)' }));
      document.body.append(veil);
    });
  }
}

export function createAdService(): AdService {
  if (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('mockAds') === '1') {
    return new DevMockAdService();
  }
  return new UnavailableAdService();
}
