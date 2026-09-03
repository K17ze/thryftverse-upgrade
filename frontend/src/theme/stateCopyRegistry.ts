/**
 * Centralized state copy registry — the single source of truth for loading,
 * empty, error, offline, and stale copy across ThryftVerse screens.
 *
 * Design principles (AGENTS.md §4, §14):
 *   - State copy is specific, calm, and actionable.
 *   - Avoid: "Something went wrong", "Error", "Failed to load".
 *   - Use: "Couldn't load [X]. [Specific recovery action]."
 *   - No aggressive alarm tone — errors use calm urgency.
 *   - Every state offers a clear next step (no dead ends).
 *
 * This registry references i18n keys (under the `stateCopy` namespace), not
 * hardcoded strings. The actual copy lives in `src/i18n/locales/en.json`
 * under the `stateCopy` key. Use `useStateCopy(key)` in components to get
 * translated strings; use `getStateCopy(key)` for non-component access to
 * the i18n key references.
 *
 * @see src/i18n/locales/en.json → `stateCopy` namespace for the copy text.
 * @see src/components/flagship/StateCopyView.tsx for the rendering component.
 */

import { useAppTranslation } from '../i18n/useAppTranslation';

// ── State copy entry interface ──────────────────────────────────────────────

/**
 * A single state copy entry. Each field is an i18n key (relative to the
 * `stateCopy` namespace) that resolves to a translated string.
 */
export interface StateCopyEntry {
  /** Registry key identifying this entry (e.g. "conversations"). */
  key: string;
  /** i18n key for the loading state message. */
  loading: string;
  /** i18n key for the empty state message. */
  empty: string;
  /** i18n key for the empty-after-filtering message. */
  emptyFiltered?: string;
  /** i18n key for the error state message. */
  error: string;
  /** i18n key for the error recovery action label. */
  errorRecovery?: string;
  /** i18n key for the offline state message. */
  offline?: string;
  /** i18n key for the stale data message. */
  stale?: string;
  /** i18n key for the permission denied message. */
  permissionDenied?: string;
}

// ── Registry entries ────────────────────────────────────────────────────────
// Each entry maps a logical surface key to its i18n keys within the
// `stateCopy` namespace. The actual copy text is defined in en.json.

const REGISTRY: Record<string, StateCopyEntry> = {
  conversations: {
    key: 'conversations',
    loading: 'conversations.loading',
    empty: 'conversations.empty',
    emptyFiltered: 'conversations.emptyFiltered',
    error: 'conversations.error',
    errorRecovery: 'conversations.errorRecovery',
    offline: 'conversations.offline',
    stale: 'conversations.stale',
    permissionDenied: 'conversations.permissionDenied',
  },
  messages: {
    key: 'messages',
    loading: 'messages.loading',
    empty: 'messages.empty',
    error: 'messages.error',
    errorRecovery: 'messages.errorRecovery',
    offline: 'messages.offline',
    stale: 'messages.stale',
  },
  listings: {
    key: 'listings',
    loading: 'listings.loading',
    empty: 'listings.empty',
    emptyFiltered: 'listings.emptyFiltered',
    error: 'listings.error',
    errorRecovery: 'listings.errorRecovery',
    offline: 'listings.offline',
    stale: 'listings.stale',
  },
  inventory: {
    key: 'inventory',
    loading: 'inventory.loading',
    empty: 'inventory.empty',
    emptyFiltered: 'inventory.emptyFiltered',
    error: 'inventory.error',
    errorRecovery: 'inventory.errorRecovery',
    offline: 'inventory.offline',
    stale: 'inventory.stale',
  },
  orders: {
    key: 'orders',
    loading: 'orders.loading',
    empty: 'orders.empty',
    emptyFiltered: 'orders.emptyFiltered',
    error: 'orders.error',
    errorRecovery: 'orders.errorRecovery',
    offline: 'orders.offline',
    stale: 'orders.stale',
  },
  analytics: {
    key: 'analytics',
    loading: 'analytics.loading',
    empty: 'analytics.empty',
    emptyFiltered: 'analytics.emptyFiltered',
    error: 'analytics.error',
    errorRecovery: 'analytics.errorRecovery',
    offline: 'analytics.offline',
    stale: 'analytics.stale',
  },
  wallet: {
    key: 'wallet',
    loading: 'wallet.loading',
    empty: 'wallet.empty',
    emptyFiltered: 'wallet.emptyFiltered',
    error: 'wallet.error',
    errorRecovery: 'wallet.errorRecovery',
    offline: 'wallet.offline',
    stale: 'wallet.stale',
  },
  search: {
    key: 'search',
    loading: 'search.loading',
    empty: 'search.empty',
    emptyFiltered: 'search.emptyFiltered',
    error: 'search.error',
    errorRecovery: 'search.errorRecovery',
    offline: 'search.offline',
    stale: 'search.stale',
  },
  sellerHub: {
    key: 'sellerHub',
    loading: 'sellerHub.loading',
    empty: 'sellerHub.empty',
    emptyFiltered: 'sellerHub.emptyFiltered',
    error: 'sellerHub.error',
    errorRecovery: 'sellerHub.errorRecovery',
    offline: 'sellerHub.offline',
    stale: 'sellerHub.stale',
  },
  profile: {
    key: 'profile',
    loading: 'profile.loading',
    empty: 'profile.empty',
    emptyFiltered: 'profile.emptyFiltered',
    error: 'profile.error',
    errorRecovery: 'profile.errorRecovery',
    offline: 'profile.offline',
    stale: 'profile.stale',
  },
};

// ── State type ──────────────────────────────────────────────────────────────

/**
 * The renderable state variants for a state copy surface.
 */
export type StateCopyState =
  | 'loading'
  | 'empty'
  | 'emptyFiltered'
  | 'error'
  | 'offline'
  | 'stale'
  | 'permissionDenied';

// ── getStateCopy ────────────────────────────────────────────────────────────

/**
 * Returns the state copy entry (i18n key references) for the given registry
 * key. Use this for non-component access or when you need the raw i18n keys.
 *
 * For translated strings in React components, prefer `useStateCopy(key)`.
 *
 * @example
 *   const entry = getStateCopy('conversations');
 *   // entry.error → "conversations.error" (i18n key)
 */
export function getStateCopy(key: string): StateCopyEntry {
  const entry = REGISTRY[key];
  if (!entry) {
    if (__DEV__) {
      console.warn(`[stateCopyRegistry] Unknown key: "${key}". Falling back to "conversations".`);
    }
    return REGISTRY.conversations;
  }
  return entry;
}

// ── Resolved state copy (translated strings) ────────────────────────────────

/**
 * A state copy entry with all i18n keys resolved to translated strings.
 * Returned by `useStateCopy`.
 */
export interface ResolvedStateCopy {
  /** Registry key. */
  key: string;
  /** Translated loading message. */
  loading: string;
  /** Translated empty state message. */
  empty: string;
  /** Translated empty-after-filtering message. */
  emptyFiltered?: string;
  /** Translated error message. */
  error: string;
  /** Translated error recovery action label. */
  errorRecovery?: string;
  /** Translated offline message. */
  offline?: string;
  /** Translated stale data message. */
  stale?: string;
  /** Translated permission denied message. */
  permissionDenied?: string;
}

// ── useStateCopy hook ───────────────────────────────────────────────────────

/**
 * Returns translated state copy for the given registry key.
 *
 * Uses the `useAppTranslation` hook to resolve i18n keys into translated
 * strings. Re-renders when the locale changes.
 *
 * @example
 *   const copy = useStateCopy('conversations');
 *   <Text>{copy.error}</Text>
 *   // → "Couldn't load your conversations. Check your connection and try again."
 */
export function useStateCopy(key: string): ResolvedStateCopy {
  const { t } = useAppTranslation('stateCopy');
  const entry = getStateCopy(key);

  return {
    key: entry.key,
    loading: t(entry.loading),
    empty: t(entry.empty),
    emptyFiltered: entry.emptyFiltered ? t(entry.emptyFiltered) : undefined,
    error: t(entry.error),
    errorRecovery: entry.errorRecovery ? t(entry.errorRecovery) : undefined,
    offline: entry.offline ? t(entry.offline) : undefined,
    stale: entry.stale ? t(entry.stale) : undefined,
    permissionDenied: entry.permissionDenied ? t(entry.permissionDenied) : undefined,
  };
}

// ── Registry key list (for validation / tooling) ────────────────────────────

/**
 * All valid registry keys. Use for type-safe key references.
 */
export const STATE_COPY_KEYS = Object.keys(REGISTRY) as readonly string[];

/**
 * Type-safe registry key.
 */
export type StateCopyKey = keyof typeof REGISTRY;
