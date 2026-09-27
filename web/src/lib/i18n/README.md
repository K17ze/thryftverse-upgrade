# i18n pipeline (web)

Hand-rolled locale layer — no i18n dependency (none was installed; the
scoped surface doesn't justify one). Source of truth is the mobile app:
`frontend/src/i18n/locales/*.json` (13 locales, `en` canonical).

## Layout

- `locales/<code>.ts` — **generated** by `scripts/sync-locales.mjs`. Never
  edit by hand; regenerate with `node scripts/sync-locales.mjs`.
- `locales.ts` — `Locale` union, `LOCALES` picker metadata (endonym +
  direction), `MESSAGES` map, `translate(locale, key, params)` resolver.
- `useLocale.ts` — `useLocale()` → `{ locale, setLocale, t, dir, locales }`,
  persisted to `localStorage` (`thryftverse.web.locale`).

## Contract for consumers

```ts
const { t } = useLocale();
t('chrome.nav.explore');                // 'Explorer' / 'Explore' / …
t('sync.pendingCount', { count: 3 });   // '{count} waiting to sync'
```

- Interpolation supports `{x}` and `{{x}}` (mobile uses both).
- Passing `count` enables `key_<pluralCategory>` lookup via
  `Intl.PluralRules` (i18next `_one`/`_other` convention), en fallback.
- Missing keys fall back to en, then to the key itself — never blank.
- `<html lang>`/`dir` are applied by `PlatformRuntime` (mounted in
  `layout.tsx`); `ar` flips the document to `rtl`.

## Current coverage (honest)

| Namespace   | en | other locales | Source |
|-------------|----|---------------|--------|
| `common`    | full | full | ported from mobile |
| `chrome`    | full | full (authored) | web header/nav/footer labels |
| `stateCopy` | full | `actions` only | mobile ships domain copy in en only — same here |
| `sync`      | full | full (authored) | SyncStatusPill / SyncRetryBanner labels |
| `offline`   | full | full (authored) | OfflineBanner line |

Screen-level copy (everything outside the namespaces above) is **English
only** — screens have not been wired to `t()`.

## Adoption path

1. A surface adopts `useLocale().t` for its strings, adding keys under a
   namespace in the generator (or inline in `en.ts` via script run).
2. Non-en coverage follows mobile: only translate what mobile has already
   verified or what a native reviewer signs off. Fallback makes partial
   coverage safe.
3. The settings Language control calls `useLocale().setLocale(code)`;
   render the picker from `locales` (`label` endonyms, `dir` for rtl).
   Density/accent pickers likewise call `useDensity()`/`useAccent()`.
