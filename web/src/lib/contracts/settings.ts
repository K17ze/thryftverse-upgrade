/**
 * Settings-domain contracts — the web mirrors of the mobile account-
 * security services. Shapes mirror frontend/src/services/
 * accountSecurityApi.ts, accountApi.ts and passkeyApi.ts so a live-mode
 * swap changes the data source, not the surfaces.
 */

/** Mirrors mobile `SecuritySessionInfo` — sessions stay redacted: no token
 *  hashes, no raw device fingerprints. */
export interface SecuritySession {
  id: string;
  /** Human device label ("ThryftVerse app — iPhone 15"). */
  deviceName: string;
  /** 'iOS' | 'Android' | 'Web' — drives the row icon. */
  platform: string;
  ipAddress: string | null;
  createdAt: string;
  /** ISO timestamp; null = never seen. */
  lastSeenAt: string | null;
  /** Server-derived on live; fixture marks the first entry. */
  isCurrent: boolean;
}

/** Mirrors mobile `ConnectedAccount` (accountApi.ts). */
export interface ConnectedAccount {
  id: string;
  provider: 'google' | 'apple' | 'facebook';
  providerEmail: string | null;
  linkedAt: string;
}

export interface ConnectedAccountsResult {
  accounts: ConnectedAccount[];
  /** Whether the account carries an email/password credential — a linked
   *  provider can only be unlinked while another sign-in method remains. */
  hasPassword: boolean;
}

/** Mirrors mobile `PasskeyInfo` (passkeyApi.ts), trimmed to what the
 *  surface renders. credentialId is the base64url of the authenticator's
 *  rawId — a real WebAuthn credential handle in this build. */
export interface PasskeyRecord {
  credentialId: string;
  name: string | null;
  deviceType: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/** Own-account lifecycle state (mobile AccountControlScreen + the
 *  deactivate entry point referenced from EditProfileScreen). 'deactivated'
 *  is reversible — the account hides and restores on reactivation. */
export type AccountStatus = 'active' | 'deactivated';

/** Mirrors mobile useStore.personalisationPreferences
 *  (PersonalisationScreen.tsx). Values are the mobile option labels
 *  verbatim so both apps round-trip the same payload. */
export interface PersonalisationPreferences {
  /** Audience keys: 'Women' | 'Men' | 'Kids' | 'All' ('All' is exclusive). */
  genderFilter: string[];
  categoriesAndSizesPref: string;
  brandsPref: string;
  membersPref: string;
}

export const AUDIENCE_OPTIONS = ['Women', 'Men', 'Kids', 'All'] as const;
export const CATEGORY_SIZE_OPTIONS = ['Balanced', 'Mostly XS-S', 'Mostly M-L', 'All sizes'] as const;
export const BRAND_OPTIONS = ['Any', 'Streetwear first', 'Luxury first', 'Vintage first'] as const;
export const MEMBER_OPTIONS = ['Everyone', 'Verified sellers first', 'People I follow first'] as const;

export const DEFAULT_PERSONALISATION: PersonalisationPreferences = {
  genderFilter: ['Women', 'Men'],
  categoriesAndSizesPref: 'Balanced',
  brandsPref: 'Any',
  membersPref: 'Everyone',
};

/**
 * Feed-ranking hook point. Maps the audience selection onto the listing
 * `category` facet the fixture catalogue actually carries ('women' | 'men'
 * are gendered; 'sneakers' | 'bags' | 'accessories' are shared). Returns
 * lowercase keys for the local ranking layer: boosted categories rise,
 * downweighted keys demote — same semantics as rankFeed's downweightedKeys.
 * 'All' / a full selection produces no signal; 'Kids' has no catalogue
 * category yet, so it never invents a filter.
 */
export function personalisationRankingSignals(
  prefs: PersonalisationPreferences,
): { boostedCategories: string[]; downweightedKeys: string[] } {
  const GENDERED = ['women', 'men'] as const;
  const selected = new Set(prefs.genderFilter.map((g) => g.toLowerCase()));
  if (selected.has('all')) return { boostedCategories: [], downweightedKeys: [] };
  const chosen = GENDERED.filter((g) => selected.has(g));
  // Full coverage (or nothing meaningful) = neutral feed.
  if (chosen.length === 0 || chosen.length === GENDERED.length) {
    return { boostedCategories: [], downweightedKeys: [] };
  }
  const excluded = GENDERED.filter((g) => !selected.has(g));
  return { boostedCategories: [...chosen], downweightedKeys: [...excluded] };
}
