/**
 * Privacy manager. Reports — truthfully — what this build stores and sends.
 *
 * This build has NO analytics, NO advertising SDK, NO accounts, NO crash
 * reporting and NO third-party trackers; fonts are bundled (self-hosted), so
 * opening the game makes no third-party requests. Consent is therefore "not
 * required" for the current feature set. If an ad provider or analytics is
 * added, `requiresConsent` must become true and a certified consent
 * management platform (e.g. an IAB TCF CMP where applicable) must gate the
 * SDK before it loads.
 */
import { SERVICE_CONFIG } from '../config/services';
import type { SaveManager } from '../save/saveManager';

export interface DataItem {
  what: string;
  where: string;
  why: string;
}

export class PrivacyManager {
  constructor(private save: SaveManager) {}

  /** True only once a data-collecting third-party service is integrated. */
  get requiresConsent(): boolean {
    return false;
  }

  /** Plain-language inventory shown in Settings → Privacy & Legal. */
  dataInventory(): DataItem[] {
    const items: DataItem[] = [
      { what: 'Game progress (levels, stars, best times, currencies, cosmetics, quests, stats)', where: 'This browser only (IndexedDB, or localStorage as a fallback)', why: 'So your progress is still here next time' },
      { what: 'Settings (volume, controls, accessibility, graphics)', where: 'This browser only (localStorage)', why: 'To remember your preferences' },
      { what: 'Username and profile icon', where: 'This browser only', why: 'Shown on your profile — never uploaded in this version' },
    ];
    if (SERVICE_CONFIG.ranked.serverUrl) items.push({ what: 'Ranked match data (when you join a match)', where: 'The configured Ranked server', why: 'To run and validate online matches' });
    return items;
  }

  /** Records that the player viewed the current policy draft (no consent implied). */
  markPolicySeen(version: string): void {
    this.save.mutate((s) => { s.privacy.policyVersionSeen = version; s.privacy.consent = this.requiresConsent ? s.privacy.consent : 'notRequired'; s.privacy.updatedAt = Date.now(); });
  }
}

export const POLICY_DRAFT_VERSION = 'draft-2026-10';
