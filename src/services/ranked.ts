/**
 * RankedService — adapter for real browser multiplayer.
 *
 * STATUS IN THIS BUILD: architecture only. No Ranked server is configured
 * (SERVICE_CONFIG.ranked.serverUrl is empty), so the Ranked screen explains
 * that live matches are unavailable. Single-player modes never depend on it.
 *
 * Protocol (implemented by a separate server — see docs/SERVICES.md):
 *  - Client connects over secure WebSocket, sends {hello, contentVersion,
 *    generatorVersion, appVersion}; incompatible versions are refused.
 *  - Server matches two players, picks ONE seed per round (same layout), and
 *    sends a synchronized start time.
 *  - Clients stream throttled snapshots (≈10 Hz) for the opponent view and
 *    their full input log at round end. The server re-simulates the input log
 *    with the same pure-TS GameSim to validate the completion time (never
 *    trusting a client-reported time). Cross-runtime determinism must be
 *    verified before launch (V8 server vs. each browser engine).
 *  - Best of three; each round won independently by the faster valid time;
 *    ties replay the round; disconnect > 20 s forfeits the round; reconnection
 *    resumes the snapshot stream.
 */
import { SERVICE_CONFIG } from '../config/services';

export type RankedStatus =
  | { state: 'unconfigured'; reason: string }
  | { state: 'offline'; reason: string }
  | { state: 'ready'; endpoint: string };

export interface RankedService {
  status(): RankedStatus;
}

export class RankedAdapter implements RankedService {
  status(): RankedStatus {
    const url = SERVICE_CONFIG.ranked.serverUrl;
    if (!url) {
      return { state: 'unconfigured', reason: 'No Ranked server is configured for this build, so live online matches are unavailable.' };
    }
    if (!url.startsWith('wss://')) return { state: 'unconfigured', reason: 'The configured Ranked endpoint must be a secure wss:// URL.' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { state: 'offline', reason: 'You appear to be offline.' };
    return { state: 'ready', endpoint: url };
  }
}

/** Display helper (spec §31): handles invalid/zero values safely. */
export function percentageDifference(timeA: number, timeB: number): number | null {
  if (!Number.isFinite(timeA) || !Number.isFinite(timeB) || timeA <= 0 || timeB <= 0) return null;
  const slower = Math.max(timeA, timeB);
  return (Math.abs(timeA - timeB) / slower) * 100;
}

/** Best-of-three bookkeeping: first to two round wins. Raw times are never summed. */
export function bestOfThree(rounds: Array<'A' | 'B' | 'tie'>): { a: number; b: number; winner: 'A' | 'B' | null } {
  let a = 0, b = 0;
  for (const r of rounds) {
    if (r === 'A') a++;
    else if (r === 'B') b++;
    if (a === 2 || b === 2) break;
  }
  return { a, b, winner: a >= 2 ? 'A' : b >= 2 ? 'B' : null };
}
