# i18n Completeness Audit

**Date:** 2026-08-04
**Auditor:** Automated i18n completeness pass (WS39)
**Scope:** `frontend/src/i18n/` and all files using `t()` or `useTranslation`

---

## 1. i18n Setup

### Architecture

The i18n system is a lightweight, custom, dependency-free implementation in a single file:

- **File:** `frontend/src/i18n/index.ts` (778 lines)
- **Default locale:** `en` (en-US)
- **Supported locales:** `en`, `es` (es-ES), `fr` (fr-FR), `de` (de-DE)
- **Translation loading:** Static, in-memory. All translations are defined inline in `index.ts`.
  - `EN_TRANSLATIONS` is the base (complete) dictionary.
  - `ES_TRANSLATION_PATCH`, `FR_TRANSLATION_PATCH`, `DE_TRANSLATION_PATCH` are partial patches
    spread over the EN base: `{ ...EN_TRANSLATIONS, ...ES_TRANSLATION_PATCH }`.
  - Missing keys in a locale patch fall back to the EN value automatically.
- **`t()` function:** `t(key: TranslationKey, params?: TranslationParams): string`
  - Looks up `LOCALE_TRANSLATIONS[activeLocale][key]`, falling back to `EN_TRANSLATIONS[key]`,
    then to the raw key string.
  - Supports `{token}` interpolation via `params`.
- **Locale switching:** `setI18nLocale(locale)` sets the active locale at runtime.
- **No `useTranslation` hook** — the codebase uses the module-level `t()` function directly.
- **Type safety:** `TranslationKey = keyof typeof EN_TRANSLATIONS` — TypeScript enforces that
  every `t('key')` call references a defined EN key at compile time.

### Locale type

```ts
export type SupportedLocale = 'en' | 'es' | 'fr' | 'de';
```

---

## 2. Translation Key Counts Per Locale

| Locale | Defined keys | Coverage vs EN |
|--------|-------------|----------------|
| en (default) | 237 | 100% (base) |
| es          | 166 | 70.0% (71 fall back to EN) |
| fr          | 166 | 70.0% (71 fall back to EN) |
| de          | 166 | 70.0% (71 fall back to EN) |

### Keys used in code

- **48 distinct keys** are referenced via `t('...')` across `frontend/src` (excluding tests and the i18n index itself).
- **0 missing keys** — every key used in code is defined in the EN base dictionary.
- **189 defined keys are currently unused** in the active codebase (defined for completeness / future use, or left over from refactored screens).

---

## 3. Missing Translation Keys

**Result: NONE.**

All 48 keys used via `t('key')` in the codebase are present in `EN_TRANSLATIONS`.

The `TranslationKey` type (`keyof typeof EN_TRANSLATIONS`) provides compile-time enforcement:
any `t('new.key')` call referencing an undefined key will fail `tsc --noEmit`.

No changes were required to the en-US locale file.

---

## 4. Hardcoded Strings in Flagship Screens

The following hardcoded strings were found in JSX and are **not** wrapped in `t()`.
Per task constraints, these are documented only — not converted in this pass.

### HomeScreen.tsx

| Line | String | Context |
|------|--------|---------|
| 408  | `Chat` | Explore empty-state message |
| 734  | `Posters` | Poster section title |
| 755  | `Posters` | Poster section title (duplicate) |
| 951  | `Thryftverse` | Brand title (proper noun — typically not translated) |

### ChatScreen.tsx

| Line | String | Context |
|------|--------|---------|
| 2194 | `Start the conversation` | Empty-state title |
| 2273 | `Undo` | Undo banner action |

### CheckoutScreen.tsx

| Line | String | Context |
|------|--------|---------|
| 1026, 1054, 1090, 1157 | `Checkout` | Header title (note: `checkout.header.title` key exists but is not used here) |
| 1059 | `Sign in to checkout` | Signed-out title |
| 1069 | `Sign in` | Signed-out button |
| 1095 | `Cannot purchase your own listing` | Self-purchase guard title |
| 1105 | `Go back` | Self-purchase guard button |
| 1289 | `Order summary` | Price breakdown title (note: `checkout.section.orderSummary` key exists) |
| 1323 | `Use wallet balance` | Wallet balance label |
| 1390 | `Total` | Footer total label (note: `checkout.footer.total` key exists) |
| 1415 | `Pay` | Apple Pay button |

### LoginScreen.tsx

| Line | String | Context |
|------|--------|---------|
| 292 | `Welcome back` | Screen title |
| 298 | `Enter your email` | Input placeholder |
| 345 | `ABCD-1234` | Referral code placeholder |
| 361 | `Enter your password` | Input placeholder |
| 414 | `Enter OTP` | OTP input placeholder |
| 485 | `Create account` | Switch link |

### SellScreen.tsx

| Line | String | Context |
|------|--------|---------|
| 847  | `Create listing` | Nav title |
| 849  | `Draft saved` | Nav draft indicator |
| 878  | `Suggested fields` | Autofill section title |
| 894  | `Title` | Autofill chip label |
| 900  | `Brand` | Autofill chip label |
| 906  | `Category` | Autofill chip label |
| 918  | `Apply to empty fields` | Autofill apply action |
| 955  | `Details` | Section heading |
| 958  | `Title` | Field label |
| 978  | `Category` | Field label |
| 995  | `Brand` | Field label |
| 1011 | `Size` | Field label |
| 1028 | `Condition` | Field label |
| 1041 | `Pricing` | Section heading |
| 1046 | `Price` | Field label |
| 1080 | `Tap for median` | Sold comps action |
| 1113 | `Starting bid` | Field label |
| 1148 | `Duration` | Field label |
| 1175 | `Total valuation` | Field label |
| 1193 | `Share count` | Field label |
| 1231 | `Offering window` | Field label |
| 1258 | `Description` | Section heading |
| 1265 | `Describe the fit, fabric, flaws, and why you love it...` | Description placeholder |
| 1275 | `Tags` | Field label |
| 1301 | `Shipping` | Section heading |
| 1304 | `Shipping method` | Field label |
| 1328 | `Who pays` | Field label |
| 1354 | `Authentication photos` | Section heading |

**Total hardcoded strings found: 47** across the five flagship screens.

---

## 5. Locale Coverage Gaps (es / fr / de)

71 keys defined in EN are not present in the ES, FR, or DE patches and will fall back to English.
The fallback is graceful (no crashes, no raw keys shown), but users in those locales will see
English text for those keys.

The untranslated keys are concentrated in:

- **settings.\*** (19 keys) — Profile Hub, notifications, app, support section titles/subtitles
- **checkout.\*** (35 keys) — Postage, status, toast, readiness, delivery, payment, summary, a11y
- **chat.\*** (4 keys) — Fallback user name, group/marketplace labels, messages restored
- **product.\*** (3 keys) — Buy now, browse similar, manage listing
- **settings.picker.\*** (3 keys) — Currency, language, theme picker titles
- **settings.a11y.\*** (2 keys) — Go back, logout
- **settings.item.notif.\*** (4 keys) — Push/email titles and subtitles
- **settings.item.app.\*** (4 keys) — Language, currency display, local fiat, theme
- **settings.item.support.\*** (4 keys) — Help, terms, privacy titles/subtitles
- **settings.item.profileHub.\*** (4 keys) — Account, notifications, theme style titles
- **settings.logout.\*** (2 keys) — Logout title and subtitle
- **settings.version** (1 key)

Per task constraints, these are **not** translated in this pass — that is the translation team's job.

---

## 6. Recommendations

### Immediate (already satisfied)

1. **en-US locale is complete.** All 48 keys used in code are defined. No missing keys to add.
2. **TypeScript enforcement is in place.** `TranslationKey` prevents new `t('undefined.key')`
   calls from compiling. Run `npx tsc --noEmit` to verify.

### Short-term (separate refactor — out of scope for this pass)

3. **Wrap hardcoded strings in `t()`.** 47 hardcoded strings were identified across the five
   flagship screens. The largest concentration is in `SellScreen.tsx` (27 strings). Converting
   these requires adding new keys to `EN_TRANSLATIONS` and replacing the literals with `t('...')`
   calls. This should be a dedicated refactor to avoid mixing i18n key additions with feature work.
4. **Reuse existing keys where possible.** Several hardcoded strings duplicate existing keys:
   - `Checkout` → `checkout.header.title`
   - `Order summary` → `checkout.section.orderSummary`
   - `Total` → `checkout.footer.total`

### Medium-term (translation team)

5. **Complete es/fr/de patches.** 71 keys currently fall back to EN. Prioritize the
   `checkout.*` and `settings.*` families, as these are user-facing surfaces.
6. **Consider extracting translations to JSON files.** The single-file inline approach works at
   237 keys, but as the app grows, separating per-locale JSON files will improve maintainability
   and enable automated translation pipelines.

### Long-term (platform)

7. **Add a CI guard for hardcoded strings.** A lint rule or pre-commit hook that flags
   uppercase string literals in JSX not wrapped in `t()` would prevent regression.
8. **Add locale fallback logging in development.** When a key falls back from es/fr/de to EN,
   log a warning in `__DEV__` so untranslated keys surface during development.

---

## 7. Verification

- `npx tsc --noEmit` in `frontend` — passes with 0 errors (type system enforces key validity).
- `npm test` in `frontend` — all tests pass (no i18n keys were added or changed).

---

## 8. Changes Made

**None.** The en-US locale is already complete — every key used via `t()` is defined in
`EN_TRANSLATIONS`, and the `TranslationKey` type provides compile-time enforcement against
future regressions. This audit documents the current state and recommendations; no code or
translation files were modified.
