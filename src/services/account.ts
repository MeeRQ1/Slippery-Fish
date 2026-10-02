/**
 * Accounts & cloud save — adapters for OPTIONAL online services.
 *
 * STATUS IN THIS BUILD: no sign-in provider and no cloud-save backend are
 * integrated. Every player is a local guest: progress lives only in this
 * browser (IndexedDB → localStorage → memory). The UI says so plainly and
 * never shows a fake "signed in" state, a fake sync, or a fake account
 * deletion. See docs/SERVICES.md for the integration contract.
 *
 * Integration notes for a real provider:
 *  - Use the provider's hosted/redirect sign-in (OAuth 2.0 + PKCE, no client
 *    secret in the browser). Never store passwords or private keys locally.
 *  - Cloud save must be server-authoritative for anything purchasable; the
 *    client uploads its save, the server validates/merges and returns the
 *    canonical copy. Conflicts: server wins for currencies/purchases,
 *    max() for progress, newest for cosmetics/settings.
 *  - Account deletion must delete the SERVER account and data (not just the
 *    local save) and be reachable in-app and on a public web page.
 */
import { SERVICE_CONFIG } from '../config/services';

export type AuthState =
  | { kind: 'guest'; reason: string }
  | { kind: 'signedIn'; displayName: string; provider: string };

export interface AuthService {
  state(): AuthState;
  /** Whether a sign-in flow can be started in this build. */
  canSignIn(): { available: boolean; reason: string };
  signIn(): Promise<{ ok: false; reason: string } | { ok: true }>;
  signOut(): Promise<void>;
  /** Server-side account deletion (only meaningful when signed in). */
  requestAccountDeletion(): Promise<{ ok: false; reason: string } | { ok: true }>;
}

export const NO_ACCOUNTS_REASON = 'Accounts aren’t available in this version — you play as a guest and progress is saved on this device only.';

export class GuestAuthService implements AuthService {
  state(): AuthState {
    return { kind: 'guest', reason: NO_ACCOUNTS_REASON };
  }
  canSignIn(): { available: boolean; reason: string } {
    const configured = SERVICE_CONFIG.auth.provider && SERVICE_CONFIG.auth.publicClientId;
    return {
      available: false,
      reason: configured
        ? 'A sign-in provider is configured, but the sign-in integration has not been implemented in this build.'
        : NO_ACCOUNTS_REASON,
    };
  }
  async signIn(): Promise<{ ok: false; reason: string }> {
    return { ok: false, reason: this.canSignIn().reason };
  }
  async signOut(): Promise<void> {
    /* guests have nothing to sign out of */
  }
  async requestAccountDeletion(): Promise<{ ok: false; reason: string }> {
    return { ok: false, reason: 'There is no online account to delete — this build never creates one. You can erase this device’s local save in Settings.' };
  }
}

export type CloudSaveState = { available: false; reason: string } | { available: true; lastSyncedAt: number | null };

export interface CloudSaveService {
  state(): CloudSaveState;
}

export class LocalOnlyCloudSave implements CloudSaveService {
  state(): CloudSaveState {
    return {
      available: false,
      reason: SERVICE_CONFIG.cloudSave.apiBaseUrl
        ? 'A cloud-save endpoint is configured, but cloud sync has not been implemented in this build.'
        : 'Cloud save is not available — progress stays on this device. Use Export Save to keep a backup.',
    };
  }
}
