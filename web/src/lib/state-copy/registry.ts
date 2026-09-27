/**
 * State copy registry — 1:1 port of frontend/src/theme/stateCopyRegistry.ts.
 *
 * Single source of truth for loading / empty / error / offline / stale copy
 * per domain. Entries hold i18n keys under the `stateCopy` namespace (the
 * copy text lives in the generated locale modules — en canonical; non-en
 * domains fall back to en, matching mobile's actual coverage).
 *
 * Copy discipline (AGENTS.md §14):
 *   - Specific, calm, actionable: "Couldn't load [X]. [Recovery action]."
 *   - No "Something went wrong", no alarm tone, no dead ends.
 */
import { useLocale } from '@/lib/i18n';
import { hasTranslation, translate, type Locale } from '@/lib/i18n/locales';

/** Domain keys — mirror the mobile REGISTRY, plus web-authored additions
 *  (entries after `profile`) whose copy is authored in
 *  scripts/sync-locales.mjs STATE_COPY_WEB_EN (en only; non-en falls back). */
export type StateCopyDomain =
  | 'conversations'
  | 'messages'
  | 'listings'
  | 'inventory'
  | 'orders'
  | 'analytics'
  | 'wallet'
  | 'search'
  | 'sellerHub'
  | 'profile'
  | 'notifications';

export const STATE_COPY_DOMAINS: readonly StateCopyDomain[] = [
  'conversations',
  'messages',
  'listings',
  'inventory',
  'orders',
  'analytics',
  'wallet',
  'search',
  'sellerHub',
  'profile',
  'notifications',
];

export function isStateCopyDomain(value: unknown): value is StateCopyDomain {
  return (
    typeof value === 'string' &&
    (STATE_COPY_DOMAINS as readonly string[]).includes(value)
  );
}

/** Renderable state variants (mobile `StateCopyState`). */
export type StateCopyState =
  | 'loading'
  | 'empty'
  | 'emptyFiltered'
  | 'error'
  | 'offline'
  | 'stale'
  | 'permissionDenied';

/** A resolved (translated) state copy entry for a domain. */
export interface ResolvedStateCopy {
  key: StateCopyDomain;
  loading: string;
  empty: string;
  emptyFiltered?: string;
  error: string;
  errorRecovery?: string;
  offline?: string;
  stale?: string;
  permissionDenied?: string;
}

type TranslateFn = (key: string) => string;
type HasFn = (key: string) => boolean;

function resolve(domain: StateCopyDomain, t: TranslateFn, has: HasFn): ResolvedStateCopy {
  const ns = `stateCopy.${domain}`;
  // Optional fields probe existence first — `translate` echoes the key
  // (and warns in dev) when absent, so only real keys reach it.
  const opt = (key: string): string | undefined => (has(key) ? t(key) : undefined);
  return {
    key: domain,
    loading: t(`${ns}.loading`),
    empty: t(`${ns}.empty`),
    emptyFiltered: opt(`${ns}.emptyFiltered`),
    error: t(`${ns}.error`),
    errorRecovery: opt(`${ns}.errorRecovery`),
    offline: opt(`${ns}.offline`),
    stale: opt(`${ns}.stale`),
    permissionDenied: opt(`${ns}.permissionDenied`),
  };
}

/** Translated state copy for a domain — re-renders on locale change. */
export function useStateCopy(domain: StateCopyDomain): ResolvedStateCopy {
  const { t, locale } = useLocale();
  return resolve(domain, t, (key) => hasTranslation(locale, key));
}

/**
 * Imperative variant for non-component code (already-resolved strings,
 * no reactivity). Prefer `useStateCopy` inside React.
 */
export function getStateCopy(domain: StateCopyDomain, locale: Locale = 'en'): ResolvedStateCopy {
  return resolve(
    domain,
    (key) => translate(locale, key),
    (key) => hasTranslation(locale, key),
  );
}

/** Generic recovery action labels (`stateCopy.actions.*`). */
export function useStateCopyActions(): {
  tryAgain: string;
  refresh: string;
  browseListings: string;
  addListing: string;
  clearFilters: string;
} {
  const { t } = useLocale();
  return {
    tryAgain: t('stateCopy.actions.tryAgain'),
    refresh: t('stateCopy.actions.refresh'),
    browseListings: t('stateCopy.actions.browseListings'),
    addListing: t('stateCopy.actions.addListing'),
    clearFilters: t('stateCopy.actions.clearFilters'),
  };
}
