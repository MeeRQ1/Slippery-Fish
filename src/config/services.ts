/**
 * PUBLIC client configuration for optional online services.
 *
 * Everything here ships inside the static bundle and is visible to anyone —
 * NEVER put secrets, private API keys, merchant secrets or admin credentials
 * here or in VITE_* environment variables.
 *
 * All services are unconfigured in this build. Each value can be supplied at
 * build time through the matching VITE_ variable (see .env.example).
 */
const env = import.meta.env;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export const SERVICE_CONFIG = {
  /** 'development' | 'staging' | 'production' — controls test/sandbox flags. */
  environment: (str(env.VITE_SERVICE_ENV) || (env.DEV ? 'development' : 'production')) as 'development' | 'staging' | 'production',
  ranked: {
    /** Secure WebSocket endpoint of the Ranked matchmaking/session server (wss://…). */
    serverUrl: str(env.VITE_RANKED_SERVER_URL),
  },
  auth: {
    /** Hosted sign-in provider name + public client id (no secrets). */
    provider: str(env.VITE_AUTH_PROVIDER),
    publicClientId: str(env.VITE_AUTH_PUBLIC_CLIENT_ID),
  },
  cloudSave: {
    apiBaseUrl: str(env.VITE_CLOUD_SAVE_API),
  },
  ads: {
    provider: str(env.VITE_ADS_PROVIDER),
    /** Public placement ids from the provider dashboard. */
    placements: {
      failure_continue: str(env.VITE_ADS_PLACEMENT_CONTINUE),
      free_chest: str(env.VITE_ADS_PLACEMENT_CHEST),
      fishing: str(env.VITE_ADS_PLACEMENT_FISHING),
    },
  },
  payments: {
    provider: str(env.VITE_PAYMENTS_PROVIDER),
    /** Backend that creates provider-hosted checkout sessions and verifies webhooks. */
    checkoutApiUrl: str(env.VITE_PAYMENTS_CHECKOUT_API),
  },
  remoteConfig: {
    /** Optional JSON endpoint for promotions (server-controlled; local clock is not trusted). */
    url: str(env.VITE_REMOTE_CONFIG_URL),
  },
} as const;

/**
 * Legal & support links shown in Settings → Privacy & Legal.
 * DEVELOPMENT PLACEHOLDERS: the bundled drafts are served from this site's
 * /legal/ folder. Replace with stable public HTTPS URLs before release.
 */
export const LEGAL_LINKS = {
  privacyPolicyUrl: str(env.VITE_PRIVACY_POLICY_URL) || 'legal/privacy-policy.html',
  termsUrl: str(env.VITE_TERMS_URL) || 'legal/terms-of-use.html',
  supportUrl: str(env.VITE_SUPPORT_URL) || 'legal/support.html',
  accountDeletionUrl: str(env.VITE_ACCOUNT_DELETION_URL) || 'legal/data-deletion.html',
  publisherWebsiteUrl: str(env.VITE_PUBLISHER_WEBSITE_URL) || '',
  thirdPartyNoticesUrl: 'legal/third-party-notices.html',
  /** True while the defaults above (unreviewed drafts) are in use. */
  usingPlaceholders: !str(env.VITE_PRIVACY_POLICY_URL) || !str(env.VITE_TERMS_URL),
} as const;
