# 26 — Internationalization & Localization

> **Department:** Internationalization (i18n) & Localization (l10n)
> **Benchmark date:** 2026-08-18
> **Scope:** Locale detection, translation runtime, RTL/bidirectional layout, pluralization, ICU message format, date/number/currency formatting, unit/timezone handling, cultural adaptation, font fallback, locale-aware content, backend Accept-Language negotiation, transactional email localization, push notification localization, App Store metadata localization, OTA translation delivery, translation QA pipeline.
> **Charter references:** AGENTS.md §1 (workspace verification), §2 (deep system research, layer diagnosis), §4 (anti-AI-made design — "inconsistent primitives", "one system not many"), §6 (truthful UI), comparative visual-fidelity protocol (stroke grammar, icon grammar — directional icons must mirror in RTL); Design.md "Typography", "Color & theming", "Internationalization" sections.
> **Primary benchmarks:** eBay (operates in 36+ countries, 9 RTL markets via MENA expansion), Instagram (190+ countries, 70+ locale variants incl. Arabic-first MENA build), Snapchat (MENA Arabic-first redesign 2023, 22+ languages), Pinterest (40+ languages, RTL shipped 2022). Secondary: Depop, Vinted (EU multilingual commerce).

---

## 1. 2026 Competitor Benchmark

The apps ThryftVerse benchmarks against treat internationalization as a first-class product engineering discipline, not a post-launch translation pass. Their 2026 patterns reveal a converging stack and a hard separation between *internationalization* (the engineering foundation that makes localization possible) and *localization* (the act of adapting to a specific market).

### The converging 2026 stack

| Layer | 2026 industry standard | Tooling |
|---|---|---|
| Device locale detection | Read system locale + region + preferred languages array (iOS supports ranked locale lists since iOS 13) | `expo-localization` (Expo) / `react-native-localize` (bare RN) |
| Translation runtime | ICU MessageFormat with `compatibilityJSON: 'v4'` plural rules; namespaced JSON resources; runtime locale switching with context-driven re-render | `i18next` + `react-i18next` (the de-facto 2026 default) or `@lingui/core` v5+ |
| Pluralization | ICU plural categories (`_one`, `_other`, `_few`, `_many`, `_zero`) — Arabic has 6 forms, Russian 3, English 2. Never hand-rolled `{plural}` suffix interpolation | `Intl.PluralRules` (polyfilled on Hermes) |
| Date / time / number / currency | `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat` — locale-aware, no hand-rolled format strings | Native Intl + `@formatjs` polyfills where Hermes gaps exist |
| RTL / bidirectional | `I18nManager.forceRTL` / `allowRTL` set at startup from detected locale; `start`/`end` logical properties instead of `left`/`right`; directional icon mirroring; full app restart on locale change (RN limitation) | `react-native` built-in `I18nManager` |
| Backend negotiation | `Accept-Language` header parsed → best-match locale → localized error codes + message catalog; never English-only error strings | Server-side message catalog keyed by locale |
| Translation delivery | OTA translation bundles (signed, cache-first, anti-downgrade) so a mistranslated string or a new market launch does not require an app store release | EAS Update for code, separate CDN for string bundles |
| Translation management | JSON exported to a TMS (Lokalise, Crowdin, IntlPull, Better i18n), translated by humans, merged back via CI; machine translation only for low-stakes draft | TMS + CI lint (`i18next-parser`, `@lingui/cli`) |

Sources: [IntlPull — React Native i18n Localization Guide 2026](https://intlpull.com/blog/react-native-i18n-localization-guide-2026); [DEV — React Native i18n in 2026: A Practical Expo Router Playbook](https://dev.to/hugo_rus_630dd942fcf7cc62/react-native-i18n-in-2026-a-practical-expo-router-playbook-1eha); [Transphere — How to Easily Implement React Native Localization in 2026](https://www.transphere.com/implement-react-native-localization/); [Better i18n — React Native Localization with Expo](https://better-i18n.com/en/blog/react-native-expo-localization/); [React Native docs — I18nManager](https://reactnative.dev/docs/next/i18nmanager).

### eBay — the commerce localization reference

eBay operates marketplaces in 36+ countries and ships the app in 9+ languages including Arabic (MENA). Their localization is structural, not cosmetic: listing titles/descriptions are stored language-tagged, search relevance is locale-aware (stemming/stop-words per language), price is always rendered in the buyer's transactional currency with locale grouping (`1.234,56 €` in DE vs `$1,234.56` in US), and date formats follow the buyer's locale. Critically, eBay localizes the *seller flow* too — the create-listing form, shipping carrier names, and policy text all render in the seller's language. A marketplace that only localizes the buyer side is half-localized.

### Instagram — the social localization reference

Instagram ships 70+ locale variants. Their MENA build is Arabic-first, not English-translated: the navigation mirror is structural, the type system uses an Arabic-specific face (not Noto Sans Arabic fallback), and the reading-order of the feed grid respects RTL. Instagram's pluralization is ICU-compliant — "1 like" vs "2 likes" vs Arabic's 6 forms are all handled by `Intl.PluralRules`, never by hand-rolled suffix logic.

### Snapchat — the Arabic-first redesign case study

Snapchat's 2023 MENA redesign is the canonical "Arabic-first, not Arabic-translated" case: they rebuilt the camera-first surface for right-to-left reading order, mirrored the discover carousel direction, swapped directional iconography, and tuned typography line-height for Arabic diacritics. The result was measurable engagement lift in the Gulf markets. The lesson: RTL is a structural redesign, not a `direction: 'rtl'` flag.

### Pinterest — RTL shipped as a platform

Pinterest shipped RTL in 2022 across the entire app. Their engineering post-mortem documented the cost of retrofitting: every `left`/`right` inline style, every hardcoded directional animation, every custom-drawn icon had to be audited. The takeaway that informs ThryftVerse: **RTL retrofitted late costs 5-10× more than RTL designed in from day one.** ThryftVerse is at the day-one stage — there is no better/cheaper moment to bake i18n in than now.

### Converging principles

1. **i18n is the engineering foundation; l10n is the market act.** You cannot localize what was not internationalized. ThryftVerse currently has neither.
2. **Never concatenate around `t()`.** Word order changes across languages — `Hello {name}!` breaks in Japanese and German. The whole sentence is one key with interpolation.
3. **ICU plurals or nothing.** Hand-rolled `{plural}` suffixes (`unit{plural}` → `units`/`unit`) are wrong for every language except English and are the #1 i18n bug class.
4. **Logical properties, not physical.** `start`/`end`/`marginStart`/`marginEnd` instead of `left`/`right`. Flexbox auto-flips; explicit positioning does not.
5. **Locale-aware formatting is not optional.** Dates, numbers, currencies, and relative time must flow through `Intl` with the active locale. Hardcoded `en-GB` formatting is a defect.
6. **Backend must negotiate locale.** `Accept-Language` → localized error messages, localized email subjects, localized push payloads. English-only backend strings leak into the UI and break the localization contract.
7. **OTA for translations.** A mistranslated string or a new market launch should not require an app store release. Signed, cache-first, anti-downgrade translation bundles delivered over EAS Update / CDN.

---

## 2. Psychology & Principles

### The "this app wasn't built for me" perception

Localization is not a courtesy — it is a trust signal. A user opening an app in their native language and seeing English error messages, English date formats, or an un-mirrored RTL layout receives an immediate, pre-verbal signal: *this product was not built for me.* That signal suppresses engagement, conversion, and retention before the user can articulate why. Research on MENA app users shows that translated-but-not-localized interfaces produce measurably lower engagement and trust than Arabic-first interfaces, even when every word is correctly translated ([Babel MP — Arabic-First UX Design](https://www.babelmp.com/post/arabic-first-ux-design-mena-users)). The perception is not "the translation is bad" — it is "the app is foreign."

### Reading direction is structural, not cosmetic

Arabic and Hebrew users scan from right to left. This changes visual hierarchy perception, menu navigation, form interaction, and carousel direction. Mirroring the text without mirroring the layout produces a "clunky" experience that signals the app wasn't built for the script ([Contentech — Complete Guide to App Localization for MENA](https://contentech.com/the-complete-guide-to-app-localization-for-mena-what-to-fix-what-to-build-and-what-to-avoid/)). The mirror must be structural: navigation flow, back-button direction, onboarding progress, swipe gestures, and directional iconography all flip. Numbers, logos, photographs, video controls, clocks, and charts do *not* flip — flipping them is a quality error ([AppScreenshotStudio — App Store Cultural Adaptation 2026](https://appscreenshotstudio.com/blog/app-store-screenshot-cultural-adaptation-rtl-color-imagery-2026)).

### Text expansion breaks rigid layouts

Arabic text takes 20-30% more horizontal space than English. German takes ~30% more. French takes ~15-20% more. A button hard-coded for English width will clip or wrap in German and Arabic. The principle: **flexible containers, never fixed-width text surfaces.** This is also an anti-AI-slop principle (AGENTS.md §4) — rigid equal-width cards are an AI tell and an i18n defect simultaneously.

### The pluralization trap

English has two plural forms (one/other). Arabic has six (zero, one, two, few, many, other). Russian has three. Polish has three with complex rules. A hand-rolled `unit{plural}` → `units`/`unit` scheme is correct for exactly one language (English) and wrong for every other. The 2026 standard is ICU MessageFormat plural categories resolved by `Intl.PluralRules`:
```
# ICU
{count, plural, one{# unit} other{# units} zero{No units}}
```
This is not a nice-to-have. Pluralization bugs are the most reported i18n defect in app store reviews for multilingual apps.

### Locale-aware formatting is perceived competence

A price shown as `£1,234.56` to a German user, or a date shown as `8/18/2026` to a British user, reads as incompetence — the same incompetence as a misspelled word. `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })` → `1.234,56 €` is the difference between "this app is professional" and "this app is amateur." The format is the product's voice.

### Cultural color and imagery

Color meaning shifts across regions: red signals luck in China and urgency in the US; green signals Islam in Gulf markets (cannot be a casual accent) and money in the US. Imagery of Western models reads as foreign import in Japan/GCC for certain categories. One accent palette does not cover all three regional clusters; a per-region color override is the 2026 standard ([AppScreenshotStudio — Cultural Adaptation 2026](https://appscreenshotstudio.com/blog/app-store-screenshot-cultural-adaptation-rtl-color-imagery-2026)). ThryftVerse's brand purple is neutral enough, but the success/celebration green and the error red should be reviewed against Gulf and East-Asian markets before launch.

### The "localize the whole journey" principle

A marketplace that localizes the buyer side but not the seller side is half-localized. eBay localizes the create-listing form, the shipping carrier names, the policy text, the seller analytics labels, and the payout statements. ThryftVerse's creator studio, sell flow, wallet, and trade hub are all currently English-only — localizing only the discovery surface would create a jarring language switch the moment a user becomes a seller.

---

## 3. Architectural Issues & Engineering Flaws

i18n debt is not a cosmetic issue — it blocks international launch directly. The failure modes are concrete and compounding:

### No i18n foundation = no international market

ThryftVerse currently cannot launch in any non-English market without a full i18n retrofit. That retrofit, done late, costs 5-10× more than designing i18n in from the start (the Pinterest post-mortem documented this cost explicitly). Every hardcoded string, every `en-GB` date format, every `£`-prefixed price, every `left`/`right` style is a debt instrument that compounds. The app is at the day-one stage where the cost is still low — but only if acted on now.

### The "decorative i18n" anti-pattern

The most dangerous architectural state is *appearing* to have i18n without actually having it. ThryftVerse has an `i18n/` module, a `t()` function, 237 defined keys, a language picker in Settings, and a locale preference persisted to AsyncStorage. To a casual reviewer, this looks like i18n is implemented. The extraction audit reveals the truth: **only 48 of 237 defined keys are actually used in source. 189 keys are defined but never referenced.** The `t()` function is called in only 8 files. The entire rest of the app — discovery, profile, chat, creator studio, wallet, trade hub, orders, support, onboarding, notifications — renders hardcoded English strings directly in JSX.

This "decorative i18n" state is worse than no i18n at all, because it creates a false sense of completeness. A reviewer sees the i18n module and assumes the app is internationalized. A new engineer sees `t()` exists and assumes they should use it, but the surrounding code doesn't, so they hardcode strings to match the prevailing pattern. The decorative layer actively suppresses real adoption.

### Patch-based translation = silent fallback to English

The translation architecture uses "patch" objects: `ES_TRANSLATION_PATCH`, `FR_TRANSLATION_PATCH`, `DE_TRANSLATION_PATCH`, each a `Partial<Record<TranslationKey, string>>` merged over `EN_TRANSLATIONS` via `{ ...EN_TRANSLATIONS, ...ES_TRANSLATION_PATCH }`. This means any key not present in the patch silently falls back to English. A Spanish user sees a mix of Spanish and English in the same screen — the localized keys in Spanish, the un-localized keys in English. This is the "clunky foreign app" perception in its purest form.

Worse, the patches only cover the trade-hub / auctions / syndicate / settings / checkout keys — the keys that are themselves mostly unused (189 unused keys). The keys that *are* used (48 of them) are concentrated in a handful of screens. So even the "localized" screens are only partially localized, and the localization that exists is for keys that aren't rendered.

### No RTL support at all

There is zero `I18nManager` usage in the codebase. No `forceRTL`, no `allowRTL`, no `isRTL` checks, no `start`/`end` logical properties. A grep for `rtl|RTL|I18nManager|isRTL|forceRTL|allowRTL` returns only false positives (layer `direction: 'forward'|'backward'`, weather "partly-sunny", transaction `direction: 'in'|'out'`). The app cannot render Arabic or Hebrew without a full structural retrofit. Given that the backend already has a `MIDDLE_EAST` country cluster with `tap_gulf` payment gateway and `ar` is a natural first RTL market for a UK-headquartered marketplace, this is a direct blocker on a high-value market.

### Hardcoded `en-GB` date/number/currency formatting

Date and currency formatting is scattered across 25+ screens with hardcoded `'en-GB'` locales:
- `TradeScreen.tsx:600` — `protectedLimitPrice.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`
- `TradeConfirmScreen.tsx:84` — `value.toLocaleString('en-GB', ...)`
- `AssetDetailScreen.tsx:395,546,972` — `toLocaleDateString('en-GB', ...)`
- `ItemDetailScreen.tsx:1174` — `new Date(item.createdAt).toLocaleDateString('en-GB', ...)`
- `ConnectedAccountsScreen.tsx:47`, `BuyerProtectionScreen.tsx:45`, `DistributionHistoryScreen.tsx:48`, `CoOwnPriceAlertsScreen.tsx:45`, `CoOwnRecurringOrdersScreen.tsx:49`, `CoOwnTaxDocumentsScreen.tsx:42`, `BalanceHistoryScreen.tsx:17`, `AssetLeaderboardScreen.tsx:303` — all hardcoded `'en-GB'`

A German user sees `18 Aug 2026` instead of `18. Aug 2026`. A US user sees `18 Aug 2026` instead of `Aug 18, 2026`. The backend supports USD, EUR, GBP, INR, and Gulf currencies — but the frontend always renders `£`. There is no `formatCurrency(amount, currency, locale)` abstraction. The `£` symbol is hardcoded in JSX across `StyleQuizScreen.tsx:53-56` (`Under £50`, `£50 – £150`), `InventoryManagementScreen.tsx:438,765,800`, `AIPoweredListingScreen.tsx:676`, `ConversationalSearchScreen.tsx:230-231`, `AssetDetailScreen.tsx:165,1654`, `EditTab.tsx:37`.

This is not a presentation-layer issue — it is a contract issue. The backend sends money as canonical units; the frontend assumes GBP and renders `£`. A user in the `US` cluster (defaultCurrency USD) sees `£` on a USD-denominated listing. That is a truthfulness defect (AGENTS.md §6) and a commerce-correctness defect.

### No backend locale negotiation

The backend reads `Accept-Language` only as a fraud-detection signal (`fraudDetection.ts:37,191,224`) — it never uses it to localize API responses. Every error message, every email subject, every push notification payload is generated in English on the server and shipped to the client as-is. The client has no way to localize server-originated strings because they are not keys — they are pre-rendered English sentences. This breaks the localization contract at the API boundary: even a fully-localized client would show English error toasts, English email bodies, and English push notifications.

### No ICU pluralization — hand-rolled `{plural}` suffix

The translation templates use a hand-rolled plural scheme: `'tradeHub.activity.soldUnits': 'Sold {units} unit{plural} on {referenceId}'` where `{plural}` is interpolated as `'s'` or `''` by the caller. This is correct for English (one/other) and wrong for every other language. Arabic needs six forms; Russian needs three; German needs the verb position to change. This scheme cannot be extended to non-English locales without rewriting every pluralized key in ICU format.

### No translation management pipeline

There is no `i18next-parser` or `@lingui/cli` extraction integrated into CI. The `extract-i18n-strings.mjs` script exists but is a one-off audit tool, not a CI gate. There is no TMS integration (Lokalise/Crowdin/IntlPull). There is no OTA translation delivery. Adding a language today requires editing the giant `i18n/index.ts` monolith by hand, which is unscalable past 4 locales and guarantees drift.

### No App Store / Play Store metadata localization

App store listings are a conversion surface. SplitMetrics reported a 36% conversion uplift on a Japanese case study after cultural adaptation of screenshots alone ([AppScreenshotStudio](https://appscreenshotstudio.com/blog/app-store-screenshot-cultural-adaptation-rtl-color-imagery-2026)). ThryftVerse has no localized store listings, no localized screenshots, no per-market feature graphic. This blocks organic acquisition in every non-English market before the app is even installed.

### The compounding nature of i18n debt

Like performance debt, i18n debt compounds. Every new screen shipped with hardcoded strings adds to the retrofit cost. Every new `en-GB` date format adds to the format-abstraction migration. Every new `left`/`right` style adds to the RTL audit. The cost is invisible while the app is English-only, but the moment a second language or an RTL market is on the roadmap, the entire surface area must be touched simultaneously. There is no incremental path from "decorative i18n" to "real i18n" that doesn't touch every screen.

---

## 4. AI Slop Diagnosis

AI-generated i18n code has predictable, identifiable failure modes. ThryftVerse exhibits all of them:

### The "i18n theater" pattern

AI models, when asked to "add internationalization," frequently produce a minimal `t()` function, a single `EN_TRANSLATIONS` object, a language picker, and a locale state — then stop. The result *looks* like i18n (there's a module, a function, a picker) but adoption is near-zero. This is exactly ThryftVerse's state: 237 keys defined, 48 used, 8 files importing `i18n`. The AI shipped the scaffold, not the system. A senior engineer would either commit to full adoption or not ship the scaffold at all — shipping a decorative layer is the AI tell.

### Hand-rolled pluralization

`unit{plural}` → `units`/`unit` is the canonical AI i18n mistake. AI models trained on English-dominated data default to English plural rules and don't know that Arabic has six forms. The `{plural}` token in `tradeHub.activity.soldUnits` / `boughtUnits` is a defect that cannot be fixed by adding more languages — it must be rewritten in ICU.

### Patch-object translation architecture

`{ ...EN_TRANSLATIONS, ...ES_TRANSLATION_PATCH }` is an AI-generated pattern that "works" for the demo (the few keys in the patch render in Spanish) but silently fails for every key not in the patch (renders in English). A senior i18n engineer uses full per-locale resource bundles with a typed key contract enforced by CI, so a missing key is a build failure, not a silent fallback. The patch pattern is the i18n equivalent of `any`-typing — it silences the compiler while leaving the system broken.

### Hardcoded `'en-GB'` in 25+ files

AI models, when asked to format a date, reach for `toLocaleDateString('en-GB', ...)` because the training data is English-British-heavy. They don't think to pass the active locale because the active locale isn't in scope in the format helper. This produces a distributed hardcoding pattern: every screen independently hardcodes the same locale string. A senior engineer would have one `formatDate(iso, opts)` / `formatCurrency(amount, currency)` abstraction in `lib/format.ts` that reads the active locale from the i18n context. ThryftVerse has no such abstraction — the formatting is copy-pasted per screen.

### Monolithic translation file

A 792-line `i18n/index.ts` containing all four locales inline is an AI-generated pattern. Senior i18n engineers split resources into `locales/en.json`, `locales/es.json`, etc., so translators can work file-by-file and CI can diff per-locale. The monolith makes the file unreviewable and untranslatable in a TMS workflow.

### Missing RTL entirely

AI models generating React Native code for an English-only product never add `I18nManager` calls or `start`/`end` properties because the training data for RTL is sparse and the default LTR layout "works." The absence of any RTL scaffolding is consistent with AI-generated code that was never prompted to consider bidirectional layout.

### Inconsistent locale type narrowing

`SupportedLocale = 'en' | 'es' | 'fr' | 'de'` is hardcoded in the i18n module, while `SupportedLanguageOption = 'English (EN)' | 'Spanish (ES)' | ...` is a separate string-union in `settingsPreferences.ts`, and the two are bridged by `LANGUAGE_TO_LOCALE_MAP` and `mapLanguageOptionToLocale`. This double-modeling of "what language are we in" is an AI tell — a senior engineer would have one canonical locale type and derive display labels from it. The double-modeling guarantees drift: add a locale to one type and forget the other, and the app silently breaks.

### No locale-aware text sizing

Arabic text needs ~25% more horizontal space and taller line-height for diacritics. German needs ~30% more width. The codebase has no `maxWidth`/`flexShrink` discipline tuned for text expansion, no per-locale line-height override, no Arabic-specific type ramp. Buttons and chips that fit English will clip in German and Arabic. This is both an i18n defect and an anti-AI-slop defect (AGENTS.md §4: "rigid equal-width cards are an AI tell").

---

## 5. Current ThryftVerse Audit (file:line defects)

### i18n module — `frontend/src/i18n/index.ts` (792 lines)

| Line | Defect |
|---|---|
| 1 | `EN_TRANSLATIONS` is a single 239-key inline object — monolithic, untranslatable in a TMS workflow |
| 241 | `SupportedLocale = 'en' \| 'es' \| 'fr' \| 'de'` — only 4 locales, all LTR, no `ar`/`he`/`hi`/`zh`/`ja` despite backend supporting IN/MIDDLE_EAST/CHINA_NEARBY clusters |
| 246, 415, 575 | `ES_TRANSLATION_PATCH` / `FR_TRANSLATION_PATCH` / `DE_TRANSLATION_PATCH` are `Partial<Record<TranslationKey, string>>` — silent English fallback for every missing key |
| 14, 428, 429 | `'tradeHub.activity.soldUnits': 'Sold {units} unit{plural} on {referenceId}'` — hand-rolled `{plural}` suffix, English-only plural rule, breaks for all non-English locales |
| 753-758 | `LOCALE_TRANSLATIONS` merges patches over EN — the merge is the silent-fallback mechanism |
| 767 | `let activeLocale: SupportedLocale = 'en'` — module-level mutable singleton, not React-context-driven; components don't re-render on locale change because `t()` is a plain function, not a hook |
| 769-771 | `setI18nLocale` mutates the singleton — no re-render trigger, no `I18nManager.forceRTL` call, no app restart orchestration |
| 781-792 | `t()` is a plain function with regex interpolation `/\{([^}]+)\}/g` — no ICU, no nested messages, no plural/select, no formatting, no React context subscription |

### Adoption — only 8 files import i18n

`ItemDetailScreen.tsx:106`, `ChatScreen.tsx:126`, `SettingsScreen.tsx:29`, `AuctionsScreen.tsx:38`, `CheckoutScreen.tsx:76`, `hooks/chat/useConversationMessages.ts:39`, `context/SettingsPreferencesContext.tsx:17`, `__tests__/i18n.test.ts:2`. The entire discovery surface, profile, creator studio, wallet, trade hub, orders, support, onboarding, notifications, search, live shopping — all render hardcoded English.

### Extraction audit — `node scripts/extract-i18n-strings.mjs`

```
definedKeys: 237, usedKeys: 48, missingCount: 0, unusedCount: 189
```
189 of 237 defined keys are dead. The i18n module is ~80% unused scaffold. The 48 used keys are concentrated in the 8 importing files. This is the quantitative proof of the "decorative i18n" diagnosis.

### Settings — `frontend/src/preferences/settingsPreferences.ts`

| Line | Defect |
|---|---|
| 7 | `LANGUAGE_OPTIONS = ['English (EN)', 'Spanish (ES)', 'French (FR)', 'German (DE)']` — display-label-as-identifier anti-pattern; double-models the locale type |
| 98 | `language: 'English (EN)'` default — no device-locale detection on first launch; ignores the user's actual phone language |

### Settings context — `frontend/src/context/SettingsPreferencesContext.tsx`

| Line | Defect |
|---|---|
| 108 | `setI18nLocale(mapLanguageOptionToLocale(language))` — mutates the singleton but does not trigger a re-render of the tree; components using `t()` won't update until a remount |
| 108 | No `I18nManager.forceRTL` / `allowRTL` call — switching to an RTL locale (if one existed) would not flip layout, and would not restart the app (RN requires restart for RTL) |

### Date/number/currency formatting — distributed hardcoding

| File:line | Defect |
|---|---|
| `TradeScreen.tsx:438,600,602` | `toLocaleDateString(undefined, ...)` and `toLocaleString('en-GB', ...)` — mixed `undefined` and `'en-GB'` locales in the same screen |
| `TradeConfirmScreen.tsx:84,231` | `toLocaleString('en-GB', ...)` and `toLocaleTimeString('en-GB', ...)` |
| `AssetDetailScreen.tsx:395,546,972` | `toLocaleTimeString('en-GB', ...)`, `toLocaleDateString('en-GB', ...)`, `toLocaleDateString(undefined, ...)` — inconsistent within one file |
| `ItemDetailScreen.tsx:1174` | `toLocaleDateString('en-GB', ...)` — "Posted {date}" hardcoded English label concatenated with locale-hardcoded date |
| `VerificationResponseScreen.tsx:261`, `WriteReviewScreen.tsx:185`, `SellerFulfilmentScreen.tsx:65`, `UserProfileScreen.tsx:211`, `ActiveSessionsScreen.tsx:36`, `SellerVerificationScreen.tsx:188`, `NotificationsScreen.tsx:200`, `AgentActivityScreen.tsx:110`, `LiveShoppingHomeScreen.tsx:344,350`, `DataExportScreen.tsx:173`, `AssetLeaderboardScreen.tsx:303`, `ConnectedAccountsScreen.tsx:47`, `MyOrdersScreen.tsx:55`, `BuyerProtectionScreen.tsx:45`, `DistributionHistoryScreen.tsx:48`, `CoOwnPriceAlertsScreen.tsx:45`, `CoOwnRecurringOrdersScreen.tsx:49`, `CoOwnTaxDocumentsScreen.tsx:42`, `BalanceHistoryScreen.tsx:17` | All hardcode `'en-GB'` or `undefined` — no central format abstraction, no active-locale awareness |

### Currency hardcoding — `£` in JSX

| File:line | Defect |
|---|---|
| `StyleQuizScreen.tsx:53-56` | `'Under £50'`, `'£50 – £150'`, `'£150 – £300'`, `'£300+'` — price tiers hardcoded as English+GBP strings |
| `InventoryManagementScreen.tsx:438,765,800` | `£${summary.totalValue.toFixed(0)}`, `£${item.priceGbp.toFixed(2)}` — currency symbol hardcoded, field name `priceGbp` bakes GBP into the data model |
| `AIPoweredListingScreen.tsx:676` | `Suggested range £{min}–£{max}` — hardcoded label + hardcoded currency |
| `ConversationalSearchScreen.tsx:230-231` | `£${min}–£${max}`, `under £${max}` — hardcoded |
| `AssetDetailScreen.tsx:165,1654` | `£${priceNum.toFixed(2)}`, `Target price (£)` — hardcoded |
| `EditTab.tsx:37` | `£{item.price}` — hardcoded |
| `CoOwnPositionCard.tsx:126` | `toLocaleString('en-GB')` — number grouping hardcoded to GB |

### Backend — no locale negotiation

| File:line | Defect |
|---|---|
| `backend/api/src/lib/fraudDetection.ts:37,191,224` | `Accept-Language` read only as a fraud signal, never used for response localization |
| `backend/api/src/index.ts` | 499 matches for `locale\|currency` — all currency/compliance logic, zero response-message localization; all error messages are English literals |
| No `messages/` catalog, no `i18n/` module, no per-locale email templates | Server-originated strings (errors, emails, push payloads) are unlocalizable |

### RTL — absent

Zero `I18nManager` usage. Zero `start`/`end` logical properties. Zero `isRTL` checks. Zero directional-icon mirroring. Zero Arabic/Hebrew type fallback. The app is structurally LTR-only.

---

## 6. Micro Improvements (file-and-line-level)

### M1 — Replace the i18n module with a real runtime

Replace `frontend/src/i18n/index.ts` with `i18next` + `react-i18next` + `expo-localization`:
- `i18n/config.ts` — `i18n.use(initReactI18next).init({ compatibilityJSON: 'v4', fallbackLng: 'en', ... })`
- `locales/en/translation.json`, `locales/es/translation.json`, `locales/ar/translation.json`, etc. — one file per locale, full key coverage (no patches)
- `useTranslation()` hook in components instead of plain `t()` — components re-render on locale change
- Detect device locale on first launch: `Localization.getLocales()[0]?.languageTag` → set as default instead of hardcoded `'en'`

### M2 — Introduce a format abstraction

Create `frontend/src/lib/format.ts`:
```ts
export function useFormat() {
  const { i18n } = useTranslation();
  const locale = i18n.language;
  return {
    date: (iso: string, opts?: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat(locale, opts).format(new Date(iso)),
    currency: (amount: number, currency: string, opts?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, { style: 'currency', currency, ...opts }).format(amount),
    number: (n: number, opts?: Intl.NumberFormatOptions) =>
      new Intl.NumberFormat(locale, opts).format(n),
    relativeTime: (iso: string) => /* Intl.RelativeTimeFormat */,
  };
}
```
Migrate every `toLocaleDateString('en-GB', ...)` and `£${x}` call site to this abstraction. This is a mechanical migration of ~25 date sites and ~10 currency sites.

### M3 — Migrate pluralized keys to ICU

Replace `'tradeHub.activity.soldUnits': 'Sold {units} unit{plural} on {referenceId}'` with:
```json
"tradeHub.activity.soldUnits": "Sold {units} {unitForm} on {referenceId}",
```
resolved via `Intl.PluralRules`:
```ts
const forms = { one: 'unit', other: 'units' }; // en
const formsAr = { zero: 'وحدة', one: 'وحدة', two: 'وحدتان', few: 'وحدات', many: 'وحدة', other: 'وحدة' }; // ar
```
Or adopt `i18next` v4 JSON plural suffixes (`key_one`, `key_other`, `key_few`, `key_many`, `key_zero`) which handle this automatically with `compatibilityJSON: 'v4'`.

### M4 — Add RTL scaffolding

In `i18n/config.ts`:
```ts
import { I18nManager } from 'react-native';
const isRTL = i18n.dir(lng) === 'rtl';
I18nManager.allowRTL(isRTL);
I18nManager.forceRTL(isRTL); // for manual locale override
```
On locale change to an RTL locale, prompt an app restart (RN limitation: RTL changes require restart). Audit all `left`/`right` styles → `start`/`end`; audit directional icons (`chevron-forward` → mirror in RTL).

### M5 — Unify the locale type

Replace `LANGUAGE_OPTIONS` string-union with a single canonical `Locale` type and derive display labels:
```ts
export const LOCALES = ['en', 'es', 'fr', 'de', 'ar', 'hi', 'zh', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];
export const LOCALE_DISPLAY: Record<Locale, string> = { en: 'English', es: 'Español', ar: 'العربية', ... };
```
Delete `mapLanguageOptionToLocale` and `LANGUAGE_TO_LOCALE_MAP`.

### M6 — Backend locale negotiation

Add `Accept-Language` parsing middleware in `backend/api/src/index.ts`:
```ts
function negotiateLocale(req): Locale { /* parse Accept-Language, match against supported */ }
```
Add a `messages/<locale>.json` catalog for server-originated strings (error messages, email subjects, push payloads). All `res.status(400).json({ message: 'Invalid bid' })` becomes `res.status(400).json({ code: 'auctions.bid.invalid', message: t('auctions.bid.invalid', locale) })` — keyed by code, localized by negotiated locale.

### M7 — CI extraction gate

Wire `extract-i18n-strings.mjs` (or `i18next-parser`) into CI as a blocking gate: any PR that adds a hardcoded string or a missing key fails the build. Convert the 189 unused keys: either wire them into the screens they were meant for, or delete them. Dead keys are debt.

### M8 — Polyfill `Intl.PluralRules` on Hermes

Hermes does not ship `Intl.PluralRules` ([facebook/hermes#1462](https://github.com/facebook/hermes/issues/1462)). Add `@formatjs/intl-pluralrules` + per-locale data imports (`@formatjs/intl-pluralrules/locale-data/ar`) so ICU plurals work on Android. Without this, Arabic plurals silently fall back to English rules on Android.

---

## 7. Macro Improvements (structural/architectural)

### A1 — Treat i18n as a contract, not a feature

The root architectural flaw is that i18n is treated as an optional feature layer (a `t()` function you may or may not call) rather than a contract every screen must satisfy. The fix is structural: **no screen ships without full key coverage.** This is enforced by CI (M7) and by code review. A screen with a hardcoded string is a failing screen, the same way a screen with a hardcoded hex color is a failing screen in the current theme system. i18n graduates from "decorative module" to "non-negotiable contract."

### A2 — Full-stack locale propagation

The locale must flow end-to-end:
```
device locale → i18n context → useTranslation() → UI
                 ↓
                 Accept-Language header → backend negotiateLocale() → messages catalog → API responses
                                                                          ↓
                                                                          email templates (per-locale)
                                                                          ↓
                                                                          push payloads (per-locale)
```
Currently the chain breaks at the client (`t()` is a non-reactive singleton) and at the API (no `Accept-Language` negotiation). Both breaks must be closed. A localized client backed by an English-only API is a half-localized product.

### A3 — Locale-aware data model

The frontend data model bakes GBP into field names: `priceGbp`, `totalValue` (assumed GBP). The backend already has a canonical money model (`backend/api/src/lib/money.ts`) with currency units. The frontend must carry currency through the data model, not assume GBP. Every money field becomes `{ amount: number, currency: string }` and renders via `formatCurrency(amount, currency, locale)`. This is a contract change that touches serializers, hooks, and components — but it is the only way to support the multi-currency markets the backend already serves.

### A4 — Arabic-first market entry as the forcing function

The backend already has a `MIDDLE_EAST` cluster with `tap_gulf` payment gateway. Arabic is the natural first RTL market for a UK-headquartered marketplace targeting Gulf users. Treating Arabic launch as the forcing function forces the team to solve RTL, ICU plurals (6 forms), locale-aware formatting, backend negotiation, and cultural color/imagery review all at once — which is the correct scope for a real i18n system. Launching only French/German (LTR, 2 plural forms) lets the team ship a half-solution that breaks the moment Arabic is attempted.

### A5 — OTA translation delivery

Translations change faster than app binaries (new strings, mistranslation fixes, new markets). Ship translation bundles via EAS Update or a signed CDN, cache-first with anti-downgrade, so a string fix does not require an app store release. This decouples translation velocity from release velocity and is the 2026 standard for any app with >5 locales.

### A6 — Translation management system integration

Past 4 locales, hand-editing a monolith is unscalable. Integrate a TMS (Lokalise / Crowdin / IntlPull / Better i18n): export `locales/*.json` to the TMS, translators work in the TMS, CI pulls translated JSON back and runs the extraction gate. Machine translation only for low-stakes draft copy; user-facing strings translated by humans. This is the only way to reach the 8-locale target without drift.

### A7 — App Store / Play Store metadata localization

Localize the store listing per market: title, subtitle, description, keywords, screenshots, feature graphic. Screenshots must be culturally adapted (RTL for Arabic, per-region color/imagery), not just translated. This is the acquisition surface — a 36% conversion uplift is documented ([AppScreenshotStudio](https://appscreenshotstudio.com/blog/app-store-screenshot-cultural-adaptation-rtl-color-imagery-2026)).

### A8 — Cultural adaptation review

Before any non-English market launch, run a cultural adaptation pass: color meaning (success green vs. Gulf Islam-green, error red vs. China lucky-red), imagery (Western models in fitness/fashion for GCC/Japan), trust signals (WhatsApp vs. email for support in MENA), payment expectations (cash-on-delivery in some markets), and typography (Arabic line-height + typeface pairing). This is a design review, not an engineering task, but it must be scheduled into the i18n rollout.

---

## 8. Flagship Acceptance Criteria

A flagship i18n system must achieve:

- **Full key coverage** — every user-facing string flows through `useTranslation()`; CI blocks any PR with a hardcoded string. The extraction audit reports `unusedCount: 0` and `missingCount: 0`.
- **Reactive locale switching** — changing the language in Settings re-renders the visible tree immediately (LTR→LTR) or prompts a one-tap restart (LTR→RTL); no stale English fragments remain.
- **Device-locale first launch** — the app opens in the user's phone language on first launch, not hardcoded English.
- **ICU plurals everywhere** — zero `{plural}` suffix tokens; all plurals resolved by `Intl.PluralRules` with `compatibilityJSON: 'v4'`.
- **Locale-aware formatting** — zero hardcoded `'en-GB'` or `£` in JSX; all dates/numbers/currencies flow through `useFormat()` with the active locale and the field's currency.
- **RTL parity** — Arabic renders with mirrored navigation, mirrored directional icons, `start`/`end` logical properties throughout, Arabic-specific line-height, no clipped text. The thumbnail test passes in RTL.
- **Backend locale negotiation** — `Accept-Language` parsed on every request; error messages, email subjects/bodies, and push payloads localized to the negotiated locale. Zero English-only server strings reach a non-English user.
- **Multi-currency rendering** — a US user sees `$`, a DE user sees `€`, a Gulf user sees the local currency; the currency follows the data, not a hardcoded symbol.
- **OTA translation delivery** — a string fix ships via EAS Update without an app store release.
- **TMS workflow** — translators work in a TMS; CI pulls and gates; no hand-editing of locale JSON in the repo by engineers.
- **Store metadata localized** — per-market App Store / Play Store listing with culturally adapted screenshots.
- **Cultural adaptation reviewed** — color, imagery, trust signals, payment expectations, and typography reviewed per target market before launch.

### Thumbnail test (RTL)

At 25% scale, an Arabic ThryftVerse screen must read as a mirrored product surface — dominant object on the right, reading order right-to-left, directional chrome mirrored — not as an English layout with Arabic text pasted in. If it reads as the latter, it is not done.

### Squint test

Switch the locale to German (longest common strings). No button clips, no chip wraps to two lines unexpectedly, no label truncates. The layout flexes to accommodate 30% text expansion. If anything clips, the container is too rigid.

---

## 9. Priority & Sequencing

Ordered by maximum perceived-quality lift per unit of risk, and by what unblocks the most downstream work:

| Priority | Item | Why first | Risk | Unblocks |
|---|---|---|---|---|
| P0 | M1 — Replace i18n module with `i18next` + `react-i18next` + `expo-localization` | Everything else depends on a real runtime; the current singleton `t()` cannot drive reactive re-renders | Medium — touches the 8 importing files | All other items |
| P0 | M2 — `useFormat()` abstraction + migrate ~35 date/currency sites | Removes the distributed `en-GB`/`£` hardcoding; highest visible quality lift for LTR locales | Low — mechanical migration | Multi-currency rendering, locale-aware formatting |
| P0 | M7 — CI extraction gate | Without a gate, every new screen re-accumulates hardcoded strings; the gate makes the contract real | Low — wire existing script into CI | Sustainable adoption |
| P1 | M3 — ICU plurals | Required before any non-English locale is correct; the `{plural}` scheme is unfixable without rewrite | Low — rewrite ~6 pluralized keys | Arabic, Russian, German plural correctness |
| P1 | M5 — Unify locale type | Removes the double-modeling drift risk before adding locales | Low — type refactor | Adding new locales |
| P1 | M6 — Backend `Accept-Language` negotiation + messages catalog | Closes the API break in the localization chain | Medium — touches every error response | Localized errors, emails, push |
| P1 | A3 — Locale-aware money model (`{amount, currency}`) | Required for multi-currency rendering; the backend already supports it | Medium — contract change | Multi-currency markets (US, EU, Gulf, IN) |
| P2 | M4 — RTL scaffolding + `start`/`end` audit | Required for Arabic/Hebrew; cheaper now than later (Pinterest post-mortem) | Medium — touches every `left`/`right` style | Arabic launch |
| P2 | M8 — `Intl.PluralRules` polyfill on Hermes | Required for Arabic plurals on Android | Low — add polyfill + locale data | Arabic on Android |
| P2 | A4 — Arabic-first market entry as forcing function | Forces the full i18n system to be correct, not half-correct | High — market entry | Gulf market |
| P3 | A5 — OTA translation delivery | Decouples translation velocity from release velocity | Medium — EAS Update + CDN infra | Fast string fixes, new markets |
| P3 | A6 — TMS integration | Required past 4 locales | Medium — TMS + CI plumbing | Scale to 8+ locales |
| P3 | A7 — Store metadata localization | Acquisition surface; do before market launch | Low — content + screenshots work | Organic acquisition in non-English markets |
| P3 | A8 — Cultural adaptation review | Design review per market | Low — design time | Trust in target markets |

### The minimum viable i18n launch

If only one thing can be done first, it is **M1 + M2 + M7**: a real runtime, a format abstraction, and a CI gate. This converts i18n from "decorative scaffold" to "real contract" and stops the debt from compounding further. Every additional locale and every additional market then becomes an additive exercise rather than a retrofit.

---

## 10. Token-level Spec

| Token | Value | Notes |
|---|---|---|
| `i18n.runtime` | `i18next` + `react-i18next` | 2026 de-facto default; `compatibilityJSON: 'v4'` |
| `i18n.detection` | `expo-localization` `getLocales()` | First-launch device locale; ranked locale list |
| `i18n.fallback` | `en` | Always English fallback |
| `i18n.pluralRules` | `Intl.PluralRules` polyfilled via `@formatjs/intl-pluralrules` | Hermes lacks native support |
| `i18n.resourceShape` | `locales/<lng>/translation.json` (full bundles, no patches) | One file per locale; TMS-compatible |
| `i18n.missingKeyBehavior` | CI build failure (not silent English fallback) | Enforces the contract |
| `format.date` | `Intl.DateTimeFormat(locale, opts)` | No hardcoded `'en-GB'` |
| `format.currency` | `Intl.NumberFormat(locale, { style: 'currency', currency })` | Currency from data, not hardcoded |
| `format.number` | `Intl.NumberFormat(locale, opts)` | Locale grouping |
| `format.relativeTime` | `Intl.RelativeTimeFormat(locale, { numeric: 'auto' })` | "3 hours ago" per locale |
| `rtl.layout` | `I18nManager.forceRTL(isRTL)` at startup; `start`/`end` logical properties | RN requires restart for RTL change |
| `rtl.icons` | Directional icons mirrored via `transform: [{ scaleX: -1 }]` when `isRTL` | chevron-forward, back-arrow, etc. |
| `rtl.textExpand` | Containers flex to +30% width; no fixed-width text surfaces | Arabic/German expansion |
| `arabic.lineHeight` | +20% over Latin line-height for diacritics | Per-locale type override |
| `arabic.typeface` | Arabic-specific face paired with brand face (not Noto fallback) | Arabic-first, not Arabic-translated |
| `backend.localeHeader` | `Accept-Language` parsed → `negotiateLocale()` → `messages/<locale>.json` | All server strings localized |
| `backend.errorShape` | `{ code: string, message: string }` — `message` localized, `code` stable | Client can re-localize from code if needed |
| `money.fieldShape` | `{ amount: number, currency: string }` | No `priceGbp` field names |
| `store.metadata` | Per-market title/subtitle/description/keywords/screenshots | Culturally adapted, not just translated |
| `ota.translations` | Signed, cache-first, anti-downgrade bundles via EAS Update / CDN | String fixes without app store release |

---

## 11. What "feels AI-made" here, and how to patch it

| AI tell in current state | Patch |
|---|---|
| Decorative i18n module (237 keys, 48 used) | Full adoption enforced by CI; delete dead keys or wire them in |
| Hand-rolled `{plural}` suffix | ICU plurals via `Intl.PluralRules` |
| Patch-object translation with silent English fallback | Full per-locale bundles; missing key = build failure |
| Monolithic 792-line `i18n/index.ts` | Split to `locales/<lng>/translation.json` |
| Hardcoded `'en-GB'` in 25+ files | One `useFormat()` abstraction reading active locale |
| Hardcoded `£` in JSX | `formatCurrency(amount, currency, locale)` |
| Double-modeled locale type (`SupportedLocale` + `SupportedLanguageOption`) | One canonical `Locale` type, display labels derived |
| No RTL scaffolding at all | `I18nManager` + `start`/`end` audit + Arabic typeface |
| No backend locale negotiation | `Accept-Language` middleware + messages catalog |
| No device-locale first launch | `expo-localization` `getLocales()` as default |

Each of these is a defect a senior i18n engineer would not ship. The aggregate is the reason a non-English user would open ThryftVerse and immediately perceive it as "not built for me." Patching them is the path from decorative i18n to a flagship multilingual product.

---

*Generated 2026-08-18 by the ThryftVerse flagship research programme. Live 2026 web benchmark + production codebase audit + psychology + micro/macro prescription. Sources: IntlPull, DEV Community, Transphere, Better i18n, React Native docs, Contentech, Babel MP, GetTranslated.AI, AppScreenshotStudio, Admapix, Facebook Hermes issues, FormatJS, i18next discussions, Pinterest Engineering.*
