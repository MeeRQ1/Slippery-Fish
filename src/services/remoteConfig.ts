/**
 * Remote config / promotions. Promotions are SERVER-controlled: when no
 * endpoint is configured there are none, and the app never invents a
 * countdown or a "limited time" offer from the local clock.
 *
 * When VITE_REMOTE_CONFIG_URL is set, the endpoint must return
 *   { "promotions": [{ "id", "title", "body", "endsAt" (ISO, optional) }] }
 * Responses are validated; anything malformed is ignored. Promotions are
 * informational only in this build (no real-money purchases exist).
 */
import { SERVICE_CONFIG } from '../config/services';

export interface Promotion {
  id: string;
  title: string;
  body: string;
  endsAt: number | null;
}

const clip = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

export function sanitizePromotions(raw: unknown): Promotion[] {
  if (!raw || typeof raw !== 'object') return [];
  const list = (raw as { promotions?: unknown }).promotions;
  if (!Array.isArray(list)) return [];
  const out: Promotion[] = [];
  for (const p of list.slice(0, 6)) {
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    const id = clip(r.id, 40), title = clip(r.title, 60), body = clip(r.body, 240);
    if (!id || !title) continue;
    const ends = typeof r.endsAt === 'string' ? Date.parse(r.endsAt) : NaN;
    out.push({ id, title, body, endsAt: Number.isFinite(ends) ? ends : null });
  }
  return out;
}

export class RemoteConfig {
  private cache: Promise<Promotion[]> | null = null;

  get configured(): boolean {
    return SERVICE_CONFIG.remoteConfig.url.startsWith('https://');
  }

  promotions(): Promise<Promotion[]> {
    if (!this.configured) return Promise.resolve([]);
    this.cache ??= (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(SERVICE_CONFIG.remoteConfig.url, { signal: ctrl.signal, credentials: 'omit', cache: 'no-store' });
        clearTimeout(t);
        if (!res.ok) return [];
        return sanitizePromotions(await res.json());
      } catch {
        return [];
      }
    })();
    return this.cache;
  }
}
