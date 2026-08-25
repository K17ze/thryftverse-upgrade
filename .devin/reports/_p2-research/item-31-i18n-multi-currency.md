# P2 #31 — Internationalisation, Regional Policy & Multi-Currency

**Auditor:** Senior engineer audit (evidence-based, anti-AI-design policy)
**Scope:** `frontend/src`, `backend/api/src`
**Date:** 2026-08-25

---

## 1. Executive finding

ThryftVerse is **hard-wired to GBP/£ across the entire commerce surface**, despite shipping a
partially-built i18n + multi-currency substrate that is **not wired into the UI**.

- **68 screens** (not 69 — see methodology note) contain direct `£`/`GBP` references in
  `frontend/src/screens` alone; expanding to components/services/tests the count is **~150 files**.
  Every price label, filter preset, accessibility summary, offer string, withdrawal summary,
  auction bid dock and receipt is formatted as `formatFromFiat(amount, 'GBP')` or a literal `£`.
- An **i18next + react-i18next + expo-localization** stack IS installed and configured
  (`frontend/src/i18n/i18n.ts`), with ICU plurals (`intl-pluralrules`), RTL support, device-locale
  detection and 4 locales (`en/es/fr/de`). But it is **used by only 4 screens**
  (`AuctionsScreen`, `SettingsScreen`, `CheckoutScreen`, `ItemDetailScreen`) and the new
  namespace JSON (`locales/en.json`) has **three empty namespaces** (`listing`, `messaging`,
  `commerce`) — i.e. the commerce surface, which is exactly where i18n is needed most, has zero
  translation keys.
- A **currency abstraction exists** (`CurrencyContext`, `useFormattedPrice`, `formatPrice`,
  9 supported currencies, gold-rate FX via `onezeQuoteApi`) and a Settings picker lets users
  choose a display currency. But callers bypass it: they pass the literal `'GBP'` into
  `formatFromFiat` instead of reading `currencyCode` from context, so the user's chosen currency
  is ignored on most screens.
- The **backend is far more mature than the frontend**: `079_canonical_money_units.sql` stores
  ISO-4217 currency + integer minor units with a currency registry and exponent per code; `money.ts`
  defines a typed `Money` interface; `countryCapabilities.ts` resolves per-country currencies,
  payment gateways, payout currencies and postage carriers across 7 country clusters. But
  `commerce_shipping_quotes` still stores `price_gbp NUMERIC(12,2)` with `currency DEFAULT 'GBP'`
  (`072_server_shipping_quotes.sql:12-13`), and `shipping.ts` hardcodes `currency: 'GBP'` on
  quote persistence (`shipping.ts:307,324`).
- **Regional policy** is partially modelled (GDPR requests, KYC, AML, jurisdiction rules,
  country clusters, per-cluster gateways) but **VAT/tax, restricted-items, age-of-consent and
  shipping-zone tables are absent** — no `tax_rate`, `vat`, `restricted_item`, `age_of_consent`
  columns exist anywhere in migrations.
- **Date formatting is locale-parameterised** (`utils/dateFormat.ts` accepts a `locale` arg) but
  every caller passes the default `'en-GB'` and relative-time strings (`"Just now"`, `"5m ago"`)
  are hardcoded English.

**Verdict:** The architecture is ~40% built but ~5% adopted. The frontend displays GBP
everywhere regardless of user preference; commerce copy is untranslatable English; regional tax
and restricted-items policy does not exist. This is a P2 that blocks any non-UK launch.

> **Methodology note on the "69 screens" figure:** A direct grep of
> `frontend/src/screens` for `£|GBP` returns **68** `.tsx` screen files. The 69th in the
> ticket likely counts `SuccessScreen.tsx` (which has a single `£` at line 161) together with
> a screen counted differently, or counts `dev/DesignReviewScreen.tsx`. Either way the order of
> magnitude is correct and the gap is real.

---

## 2. Full table — files with direct £ / GBP references

Only `frontend/src/screens` is enumerated per the ticket ("69 screens"). Representative
snippet + fix per file. Files beyond screens (components, services, store, utils, tests) are
listed in §2b.

### 2a. Screens (68 files)

| # | File | Line(s) | Snippet (representative) | Fix |
|---|------|---------|--------------------------|-----|
| 1 | `ChatScreen.tsx` | 1309,1314,1760 | `GBP` in offer/transaction rendering | route through `useFormattedPrice()`; remove literal `GBP` |
| 2 | `MessageRequestsScreen.tsx` | 232 | `£` in offer preview | use `formatFromFiat(amount, currencyCode)` |
| 3 | `ConversationInfoScreen.tsx` | 247 | `£` in transaction strip | context currency |
| 4 | `HomeScreen.tsx` | 545,559,573 | `GBP` in drop banner metrics | `useCurrencyContext` + `t()` |
| 5 | `MyProfileScreen.tsx` | 220,226,229,230,889,902 | `GBP` in shop stats | context currency |
| 6 | `SellerHubScreen.tsx` | 286,289,427,430 | `£` earnings summary | `useFormattedPrice` |
| 7 | `MyBidsScreen.tsx` | 222,255,263 | `GBP` bid amounts | context currency |
| 8 | `MoodboardEditorScreen.tsx` | 368 | `£` asset price | context currency |
| 9 | `LookDetailScreen.tsx` | 690,895,918,1018 | `£` piece prices | context currency |
| 10 | `CollectionDetailScreen.tsx` | 470 | `GBP` collection value | context currency |
| 11 | `AuctionsScreen.tsx` | 359,376,533,587,781,790,866,867,933 | `GBP` bid/buy-now | already imports `useCurrencyContext` (line 147) — finish migration |
| 12 | `PostageScreen.tsx` | 189,223,236 | `GBP` postage quotes | context currency; backend must stop hardcoding GBP |
| 13 | `SellerAuctionCentreScreen.tsx` | 251,350,353 | `GBP` auction metrics | context currency |
| 14 | `PulseFeedScreen.tsx` | 152,177,195 | `£` pulse card prices | context currency |
| 15 | `MarketLedgerScreen.tsx` | 36,49,50,51,56,88,174,179,206 | `£`/`GBP` ledger rows | context currency + `t()` |
| 16 | `InviteFriendsScreen.tsx` | 302 | `£` referral credit | context currency |
| 17 | `CheckoutScreen.tsx` | 323,1343,1419,1452,1463,1532,1543,1604-1797 (24 hits) | `formatFromFiat(item.price,'GBP')`, a11y summary "Item ... Delivery ... Total ..." | already imports `useAppTranslation` (line 77) — replace all `'GBP'` literals with `currencyCode` from context; translate a11y template |
| 18 | `AssetDueDiligenceScreen.tsx` | 509,815 | `GBP` valuation | context currency |
| 19 | `GlobalSearchScreen.tsx` | 627,1267-1709 (11 hits) | `GBP` price facets | context currency; facets must be server-driven |
| 20 | `VisualSearchScreen.tsx` | 552,566 | `£` match prices | context currency |
| 21 | `DistributionHistoryScreen.tsx` | 43 | `£` distribution amount | context currency |
| 22 | `BrowseScreen.tsx` | 631 | `GBP` price sort | context currency |
| 23 | `TradeScreen.tsx` | 383 | `GBP` trade value | context currency |
| 24 | `AssetDetailScreen.tsx` | 178,1096,1116,1344,1356,1847 | `£`/`GBP` asset price | context currency |
| 25 | `BalanceHistoryScreen.tsx` | 177,179,200 | `GBP` balance | context currency |
| 26 | `SellerAnalyticsScreen.tsx` | 359,521,652,669,707,729 | `£` revenue | context currency |
| 27 | `MakeOfferScreen.tsx` | 120,179,180,271,374-710 (20 hits) | `formatFromFiat(numericOfferGbp,'GBP')`, `Offer: ... for ${title}. Valid for ${expiryHours}h.` | already imports `useCurrencyContext` (line 49) — drop `'GBP'` literal; translate offer template |
| 28 | `WithdrawScreen.tsx` | 293-767 (15 hits) | `formatFromFiat(numericAmount,'GBP',{displayMode:'fiat'})`, "Withdrawal summary"/"Amount"/"Fee"/"You receive" | already imports `useCurrencyContext` (line 79) — drop `'GBP'`; translate labels |
| 29 | `ItemDetailScreen.tsx` | 613,616,622,625,1473,1851 | `GBP` price | already imports `useAppTranslation` (line 109) — finish currency migration |
| 30 | `SyndicateOnboardingScreen.tsx` | 34 | `GBP` min stake | context currency |
| 31 | `LiveShoppingHomeScreen.tsx` | 467 | `£` live price | context currency |
| 32 | `CreateSyndicateScreen.tsx` | 150-753 (16 hits) | `GBP` stake/units | already imports `useCurrencyContext` (line 56) — drop `'GBP'` |
| 33 | `ClosetScreen.tsx` | 859,872 | `GBP` closet value | context currency |
| 34 | `MyListingsScreen.tsx` | 63,76,253,258 | `£` listing prices | context currency |
| 35 | `SellerEarningsScreen.tsx` | 6 | `£` earnings header | context currency |
| 36 | `WalletScreen.tsx` | 202,522,639 | `£`/`GBP` balance | already imports `useCurrencyContext` (line 53) — finish migration |
| 37 | `TradeConfirmScreen.tsx` | 75,80 | `GBP` trade total | context currency |
| 38 | `PortfolioScreen.tsx` | 275-878 (8 hits) | `GBP` portfolio value | context currency |
| 39 | `LiveStreamViewerScreen.tsx` | 481-816 (13 hits) | `£` bid/flash prices | context currency |
| 40 | `FilterScreen.tsx` | 323,885,933-936 | `{label:'Under £20',min:'',max:'20'}` etc. price presets | generate presets from `CURRENCIES[code].symbol` + bounds; translate labels |
| 41 | `CorporateActionDetailScreen.tsx` | 63 | `£` distribution | context currency |
| 42 | `CoOwnRecurringOrdersScreen.tsx` | 46,397 | `£` recurring amount | context currency |
| 43 | `CoOwnPriceAlertsScreen.tsx` | 42 | `£` threshold | context currency |
| 44 | `AuctionDetailScreen.tsx` | 455,639,1058,1329,1330,1461,1532,1829 | `GBP` bid/buy-now | already imports `useCurrencyContext` (line 118) — finish migration |
| 45 | `CreateAuctionScreen.tsx` | 81,82,90,92,220,314,460 | `GBP` starting bid | already imports `useCurrencyContext` (line 55) — finish migration |
| 46 | `BulkListingScreen.tsx` | 499,664,672 | `£` bulk price | context currency |
| 47 | `AIPoweredListingScreen.tsx` | 651,672 | `£` suggested price | context currency |
| 48 | `SellerFulfilmentScreen.tsx` | 350 | `GBP` fulfilment | context currency |
| 49 | `OrderDetailScreen.tsx` | 1703,1961-1971 | `GBP` order totals | context currency |
| 50 | `ListingSuccessScreen.tsx` | 80 | `£` success price | context currency |
| 51 | `SyndicateHubScreen.tsx` | 56-748 (21 hits) | `GBP` pool metrics | context currency |
| 52 | `MyOrdersScreen.tsx` | 305 | `GBP` order | context currency |
| 53 | `OrderReceiptScreen.tsx` | 119,228-231,340 | `£` receipt lines | context currency + `t()` |
| 54 | `AuctionHomeScreen.tsx` | 742,756,885,888,1947-2023 | `{label:'Under £50',max:50}` etc. | generate presets from currency symbol; translate |
| 55 | `ManageCollectionItemsScreen.tsx` | 149,163,188,203 | `GBP` item value | context currency |
| 56 | `LiveStreamSellerScreen.tsx` | 274,363,404,438 | `£` seller prices | context currency |
| 57 | `ListingPreviewScreen.tsx` | 45,48 | `GBP` preview | context currency |
| 58 | `InventoryManagementScreen.tsx` | 438,765,800 | `£` inventory value | context currency |
| 59 | `CreateCollectionScreen.tsx` | 306 | `GBP` target | context currency |
| 60 | `ManageListingScreen.tsx` | 205,371 | `£` price edit | context currency |
| 61 | `ConversationalSearchScreen.tsx` | 231,232,233 | `£` price answer | context currency |
| 62 | `StyleQuizScreen.tsx` | 53-56 | `{label:'Under £50',value:'budget'}` etc. | generate from currency symbol; translate |
| 63 | `BuyerProtectionScreen.tsx` | 41 | `£` protection fee | context currency |
| 64 | `BuyoutScreen.tsx` | 102,241 | `£` buyout price | context currency |
| 65 | `BundleBagScreen.tsx` | 97,125,217-234 | `£` bundle totals | context currency |
| 66 | `SuccessScreen.tsx` | 161 | `£` success amount | context currency |
| 67 | `CoOwnTaxDocumentsScreen.tsx` | 38 | `£` tax doc | context currency |
| 68 | `AssetLeaderboardScreen.tsx` | 33,67,178,179 | `£` leaderboard value | context currency |

### 2b. Non-screen files with £/GBP (summary, not exhaustive)

- **Store/state:** `store/useStore.ts` (56 GBP hits — mock data + selectors default to GBP),
  `storage/schema.ts:144`, `navigation/types.ts:142`
- **Components (15+):** `ProductCardV2.tsx`, `BidSheet.tsx`, `BuyNowSheet.tsx`,
  `MakeOfferSheet.tsx`, `BoostListingSheet.tsx`, `ListingPreviewCard.tsx`, `OfferToLikersSheet.tsx`,
  `BundleUpsellRow.tsx`, `ShippingReturnsInfo.tsx`, `AuctionRunwayCard.tsx`,
  `AuctionStickyBidDock.tsx`, `AuctionGridCard.tsx`, `AuctionSupportingTile.tsx`,
  `AuctionValueLockup.tsx`, `CommerceDetailIdentity.tsx`, `CommerceDetailStateDock.tsx`,
  `CommerceDetailTransactionSurface.tsx`, `ProductCommerceSummary.tsx`,
  `PriceInsightStrip.tsx`, `RecommendationRail.tsx`, `RelatedItemsRail.tsx`, `ShopRail.tsx`,
  `ProfileShopTile.tsx`, `ClosetMediaMosaic.tsx`, `MarketplaceChatCard.tsx`,
  `CoOwnRecoursePanel.tsx`, `CoOwnTrustPanel.tsx`, `CoOwnWalletBreakdown.tsx`,
  `AddMoneySheet.tsx`, `WalletTransactionHistory.tsx`, `OutfitPieceEditor.tsx`,
  `PosterStickerLayer.tsx`, `FlagshipMetricLine.tsx`, `FlatRow.tsx`, `Text.tsx`,
  `HomeDiscoveryCard.tsx`, `SmartSellCard.tsx`, `EditTab.tsx`, `PulseTab.tsx`,
  `ImportListingTile.tsx`, `UnitsComposer.tsx`
- **Services:** `marketApi.ts` (10), `conversationalSearchApi.ts` (12 £), `liveShoppingApi.ts`,
  `chatAgentsApi.ts`, `moodboardApi.ts`, `galleriaApi.ts`, `onezeQuoteApi.ts`
- **Platform/contracts:** `platform/product/listingDetailContract.ts` (281,302),
  `platform/product/productDetailViewModel.ts:278`, `platform/share/SocialShare.ts:438`,
  `platform/share/instagramStory.ts:77`, `platform/share/types.ts:121`
- **Data:** `data/tradeHub.ts`, `data/posters.ts`
- **Creator:** `CreatorCanvas.tsx` (6 £), `LookSourceTray.tsx`, `CreatorAssetPicker.tsx`,
  `ProductBrowserSheet.tsx`
- **Utils:** `utils/transactionSheetLogic.ts` (4)
- **Tests:** `commerceDetailRuntime.test.tsx` (18), `vq10aAuctionDetail.test.ts`,
  `listingDetailContract.test.ts`, `vq10aServerClock.test.ts`, `discoverySurfaces.test.ts`,
  `auctionDetailFlagshipClosure.test.ts`, `i18n.test.ts`
- **Backend:** `routes/shipping.ts:307,324` (hardcodes `currency:'GBP'`),
  `db/migrations/072_server_shipping_quotes.sql:12-13` (`price_gbp NUMERIC(12,2)`),
  `db/migrations/079_canonical_money_units.sql` (legacy `amount_gbp` shadow column),
  `lib/pricingEngine.ts` (36 currency refs), `routes/payments.ts`, `routes/wallet.ts`,
  `lib/paymentProviders.ts`, `lib/countryCapabilities.ts:28` (`priceFromGbp` carrier field)

---

## 3. i18n library status

**Status: PRESENT but barely adopted.**

**Installed (`frontend/package.json`):**
- `i18next ^26.4.0` (line 115)
- `react-i18next ^17.0.12` (line 124)
- `expo-localization ~57.0.1` (line 103)
- `intl-pluralrules ^2.0.1` (line 116)

**Configured (`frontend/src/i18n/i18n.ts`):**
- `initReactI18next` pipeline, `fallbackLng:'en'`, `supportedLngs:['en','es','fr','de']`
  (`i18n.ts:120-145`)
- ICU plural support via polyfill (`i18n.ts:28,131`)
- Device-locale detection via `expo-localization.getLocales()` (`i18n.ts:74-83`)
- RTL support via `I18nManager.forceRTL` (`i18n.ts:96-104`)
- Backward-compatible `t(key, params)` export (`i18n.ts:187-192`)
- Reactive `useTranslation` re-export (`i18n.ts:204`)
- Namespace hook `useAppTranslation(namespace)` (`useAppTranslation.ts:24-29`)

**Locale resources:**
- Legacy flat-key system in `i18n/index.ts`: `EN_TRANSLATIONS` (~240 keys, lines 1-241) +
  `ES_TRANSLATION_PATCH` (246-415), `FR_TRANSLATION_PATCH` (415-584), `DE_TRANSLATION_PATCH`
  (584-753) — each ~170 keys. Coverage is auctions + syndicate + settings + trade hub only.
- New namespace system in `i18n/locales/en.json` (306 lines): `common`, `home`, `search`,
  `settings`, `profile` are populated; **`listing`, `messaging`, `commerce` are empty objects**
  (`en.json:303-305`). No `es/fr/de.json` exists yet — non-English locales still rely on the
  legacy patch merged over English (`i18n.ts:61-66`).

**Adoption: only 4 screens** import `useAppTranslation`/`useTranslation`:
`AuctionsScreen.tsx:38`, `SettingsScreen.tsx:31`, `CheckoutScreen.tsx:77`,
`ItemDetailScreen.tsx:109`. The legacy `t()` from `i18n/index.ts` is used by ~8 files
(`index.ts:801-804` comment). **The remaining ~64 commerce screens use inline English strings.**

**Recommendation: ADOPT the existing i18next stack — do not introduce a new library.**
Justification:
1. It is already installed, configured, type-safe (`i18next.d.ts`) and wired into Settings
   (`SettingsPreferencesContext.tsx:128` calls `setI18nLocale`).
2. `expo-localization` is the correct React Native device-locale source; `i18next` + `react-i18next`
   is the de-facto RN standard with ICU plurals, namespaces, suspense, lazy loading and a
   `i18next-parser` extraction toolchain.
3. Adding `intl-messageformat`/`formatjs` would duplicate `i18next`'s ICU capability and create
   two interpolation systems. `intl-pluralrules` (already a dep) is the only formatjs polyfill
   needed and it is already loaded.
4. Lingui would require a compiler/babel plugin swap — unjustified given i18next is working.

**Gap to close:** (a) finish namespace JSON for `listing/messaging/commerce` and all commerce
screens; (b) add `es.json/fr.json/de.json` namespace files; (c) add `i18next-parser` config +
extraction script to CI; (d) delete the legacy `i18n/index.ts` flat-key system once all 8
consumers migrate; (e) translate hardcoded relative-time strings in `dateFormat.ts`.

---

## 4. Currency architecture assessment

### 4.1 Storage (backend) — STRONG, partially migrated

- `079_canonical_money_units.sql`: `money_currency_registry` table with ISO-4217 code, exponent
  (0-3), registry version, enabled flag (lines 6-12). 44 currencies seeded with correct
  exponents (JPY=0, BHD=3, GBP=2, etc.) (lines 14-38).
- `payment_intents` extended with `amount_minor BIGINT`, `currency_exponent SMALLINT`,
  `money_registry_version`, `provider_amount`, `money_conversion_trace JSONB`,
  `money_quarantined` (lines 60-67). Legacy `amount_gbp` kept for shadow read; mismatched rows
  quarantined (lines 82-100).
- `lib/money.ts`: typed `Money` interface `{currency, minorAmount, exponent, registryVersion}`
  (lines 59-64), `AssetAmount` for 1ZE (mg, scale 3) (66-71), `MoneyConversionTrace` for
  provider boundary (73-85), `MoneyValidationError` codes (101-113). Exponent map hardcoded
  mirrors registry (7-53).
- **Gap:** `commerce_shipping_quotes.price_gbp NUMERIC(12,2)` + `currency DEFAULT 'GBP'`
  (`072:12-13`) is NOT migrated to minor units. `shipping.ts:307,324` still writes `currency:'GBP'`
  literally. Carrier `priceFromGbp` field in `countryCapabilities.ts:28` is GBP-denominated.
  Listing price storage should be audited (out of scope here) for the same `price_gbp` pattern.

### 4.2 Display (frontend) — ABSTRACTION EXISTS, CALLERS BYPASS IT

- `constants/currencies.ts`: 9 currencies (GBP, USD, EUR, NGN, JPY, CAD, AUD, AED, INR) with
  code, name, symbol, locale, `goldRatePerGram` (lines 22-86). `DEFAULT_CURRENCY_CODE='GBP'`
  (line 20).
- `utils/currency.ts`: `toFiat`/`toIze` via gold rate (32-51), `formatIzeAmount` (53),
  `formatAuctionIze` (61), `formatCoOwnIze` with locale (65), `formatFiatAmount` via
  `Intl.NumberFormat(meta.locale, {style:'currency', currency})` with symbol fallback (75-92),
  `formatPrice` combining ize+fiat per `displayMode` (103-123).
- `context/CurrencyContext.tsx`: `CurrencyProvider` persists `currencyCode` + `displayMode` to
  AsyncStorage (42-94), fetches live gold rates from `onezeDisplayRates` every 120s (104-116),
  exposes `settlementCurrencies` set (default `{'GBP'}` line 39).
- `hooks/useFormattedPrice.ts`: `formatFromIze(izeAmount)` and `formatFromFiat(fiatAmount,
  sourceCurrency='GBP', ...)` (29-39). **The `'GBP'` default here is the root leak** — callers
  pass `'GBP'` explicitly instead of the context's `currencyCode`, so the user's chosen
  currency is ignored.
- `hooks/useCurrencyPref.ts`: Settings-facing label helper.
- **Adoption: 13 screens/components** import `useCurrencyContext`
  (`AuctionsScreen`, `SellerAuctionCentreScreen`, `WalletConvertScreen`, `MakeOfferScreen`,
  `WithdrawScreen`, `CreateSyndicateScreen`, `SellerEarningsScreen`, `WalletScreen`,
  `AuctionDetailScreen`, `CreateAuctionScreen`, `MakeOfferSheet`, `AddMoneySheet`,
  `OfferToLikersSheet`) — but most STILL pass literal `'GBP'` to `formatFromFiat` (see
  `MakeOfferScreen:179`, `WithdrawScreen:657-659`, `CheckoutScreen:1343,1604`). The context is
  imported but the currency code is not actually used.

### 4.3 Conversion — gold-rate based, not FX

- Conversion is **1ZE (gold-gram) ↔ fiat** via `goldRatePerGram`, NOT fiat↔fiat FX. There is no
  USD→GBP or EUR→USD conversion path. `onezeQuoteApi` supplies live gold rates per currency.
- This works for *display* (every fiat price is derived from a 1ZE amount) but means there is
  no real FX exposure model for settling in a non-display currency. Settlement currencies are
  constrained to `{'GBP'}` by default (`CurrencyContext.tsx:39`).

### 4.4 User preference — wired but ineffective

- Settings → "Local currency" picker (`SettingsScreen.tsx:761-763`) lists all 9 currencies,
  persists via `CurrencyContext`, and the value flows into `useFormattedPrice`. But because
  commerce screens hardcode `'GBP'`, changing the picker has **no visible effect on checkout,
  offers, withdrawals, auctions, filters or receipts**.

---

## 5. Regional policy gaps

**Present:**
- `countryCapabilities.ts`: 7 clusters (`IN, US, UK, EUROPE, MIDDLE_EAST, CHINA_NEARBY, GLOBAL`)
  (4-11), per-cluster `defaultCurrency`, `supportedCurrencies`, `stableCoinEnabled`,
  `paymentMethodTypes`, `gatewaysByChannel` (commerce/co-own/wallet_topup/wallet_withdrawal),
  `payoutDefaultCurrency`, `payoutSupportedCurrencies`, `payoutGatewayPriority`,
  `postageCarriers` (34-44, templates 106+). EUROPE/MIDDLE_EAST/CHINA_NEARBY country sets
  defined (86-98).
- `countryCapabilityPolicy.ts`: gateway/channel/currency allowance + payout default resolvers
  (16-121).
- `009_compliance_regulatory_foundation.sql`: `gdpr_requests` (export/erasure) (433-446),
  `compliance_audit_log` (immutable, hash-chained) (451-466), `user_consents`, `kyc_cases`,
  `aml_alerts`, `jurisdiction_rules` (triggers 478-511).
- Payment providers: stripe/razorpay/mollie/flutterwave/tap/wise (`money.ts:56`,
  `paymentProviders.ts`).

**ABSENT (gaps blocking EU/US launch):**
1. **VAT/tax** — no `tax_rate`, `vat`, `sales_tax` table or column anywhere in migrations.
   `CoOwnTaxDocumentsScreen.tsx:38` references `£` tax docs but there is no tax engine. EU VAT
   (per-country rates, MOSS/OSS), UK VAT (20%), US sales tax (per-state) are unmodelled.
2. **Restricted items** — no `restricted_item`, `prohibited_category`, `category_restriction`
   table. Different jurisdictions ban different categories (e.g. ivory, certain electronics,
   age-restricted goods). Category taxonomy (`constants/categories.ts`) has no regional guard.
3. **Age of consent / age gating** — no `age_of_consent`, `min_age`, `age_verification` column.
   KYC exists but no per-jurisdiction minimum-age rule for commerce/co-own.
4. **Shipping zones** — no `shipping_zone` table. `commerce_shipping_quotes` keys off
   `carrier_id` + `countryCode` ad hoc; `countryCapabilities.postageCarriers` is a flat list
   per cluster with no zone-based rate table, no restricted-destination list, no DDP/DDU
   incoterm model.
5. **GDPR vs UK-GDPR divergence** — `gdpr_requests` table treats GDPR as one blob
   (`request_type IN ('export','erasure')`). No UK-GDPR-specific retention period, no
   EU-vs-UK transfer mechanism, no per-jurisdiction retention policy. `PrivacyManifest.tsx`
   references intl/localization but is a static manifest, not a policy engine.
6. **Currency on listings** — listings appear to store a single GBP price (legacy
   `price_gbp`); there is no per-listing `currency_code` allowing a US seller to list in USD.
   The display layer converts from 1ZE, but authoring is GBP-only.
7. **Locale-aware number/date formatting at call sites** — `dateFormat.ts` accepts `locale` but
   every caller passes the default `'en-GB'`; relative-time strings (`"Just now"`, `"5m ago"`,
   `"Today"`, `"Yesterday"`, `dateFormat.ts:101-104,119-120`) are hardcoded English and not
   pluralised.

---

## 6. Proposed flagship i18n + multi-currency architecture

### 6.1 Translation pipeline

1. **Keep i18next + react-i18next + expo-localization + intl-pluralrules.** No new library.
2. **Namespace completion:** author `listing.json`, `messaging.json`, `commerce.json`,
   `auction.json`, `wallet.json`, `coown.json`, `seller.json`, `search.json` (some exist as
   legacy flat keys — migrate to namespace JSON). Target ~1,200 keys total.
3. **Per-locale namespace files:** `locales/{en,es,fr,de}/*.json`. Drop the patch-over-English
   model (`i18n.ts:55-66`) once full files exist; use i18next fallback per-key instead.
4. **Extraction:** add `i18next-parser` config (`i18next-parser.config.js`) + `npm run i18n:extract`
   script in CI, failing PRs that introduce untranslated inline strings in migrated namespaces.
5. **Lint rule:** ESLint `react-i18next` plugin (`no-literal-string` scoped to `screens/` and
   `components/`) to prevent regression.
6. **Delete legacy** `i18n/index.ts` flat-key system + `legacyTranslations.ts` once the 8
   consumers migrate to `useAppTranslation`.
7. **ICU plurals** for all count-bearing strings (`{count, plural, one {# item} other {# items}}`).
8. **Relative time:** replace hardcoded `dateFormat.ts:101-120` with `Intl.RelativeTimeFormat`
  (locale from i18next) and translate "Today"/"Yesterday".
9. **RTL:** keep `I18nManager.forceRTL` path; add ar/he when launching MENA.

### 6.2 Currency service

1. **Single source of truth:** every price is authored and stored as `Money{currency, minorAmount,
   exponent}` (backend `money.ts` already defines this). Migrate `commerce_shipping_quotes`,
   listing prices, and carrier `priceFromGbp` to minor units + currency code; drop `price_gbp`.
2. **Display layer:** all screens call `useFormattedPrice().formatFromIze(izeAmount)` or
   `formatFromFiat(fiatAmount, currencyCode)` where `currencyCode` comes from context — **never
   a literal `'GBP'`**. Remove the `'GBP'` default in `useFormattedPrice.formatFromFiat`
   (`useFormattedPrice.ts:32`) and require the caller to pass the context currency.
3. **User preference:** `CurrencyContext.currencyCode` is the display currency; persist + sync
   to backend user settings (`106_user_settings_privacy.sql` already has a settings table).
   Default from `countryCapabilities.defaultCurrency` for the user's resolved country, not a
   global `DEFAULT_CURRENCY_CODE='GBP'`.
4. **Conversion:** keep 1ZE-gold as the canonical unit; add a fiat↔fiat display conversion path
   for cases where a listing is authored in USD but the viewer wants GBP (use live FX +
   the 1ZE rate as the bridge). Mark converted prices with a "≈" indicator and disclose the
   conversion rate.
5. **Settlement currencies:** expand `settlementCurrencies` from `{'GBP'}` to the cluster's
   `payoutSupportedCurrencies` from `countryCapabilities`. Wallet/withdraw UI must show only
   allowed settlement currencies for the user's region.
6. **Backend API:** all money endpoints return `{amount: string(minor), currency, exponent}`;
   frontend never parses floats. `formatFiatAmount` already uses `Intl.NumberFormat` — keep.
7. **Price facets/filters:** `FilterScreen`/`AuctionHomeScreen`/`GlobalSearchScreen` presets
   (`Under £50` etc.) must be generated from `CURRENCIES[code].symbol` + server-driven bounds
   in the user's currency, not hardcoded `£` literals.

### 6.3 Regional config

1. **`countryCapabilities` is the regional config spine** — extend it:
   - `tax`: per-cluster VAT/sales-tax rules (rate, inclusive/exclusive, MOSS region).
   - `restrictedCategories`: list of category IDs blocked in the cluster.
   - `minAge`: commerce + co-own minimum age.
   - `shippingZones`: zone ID, destination countries, incoterm (DDP/DDU), carrier whitelist,
     restricted destinations.
   - `retentionPolicy`: data retention days per jurisdiction (EU/UK/US).
2. **New tables:** `tax_rules(country_code, category_id, rate_bps, inclusive)`,
   `category_restrictions(country_cluster, category_id, allowed)`,
   `shipping_zones(id, countries, incoterm, carrier_ids)`,
   `jurisdiction_age_rules(country_code, min_age_commerce, min_age_coown)`.
3. **GDPR/UK-GDPR:** split `gdpr_requests` retention by jurisdiction; add UK-GDPR transfer
   mechanism record to `compliance_audit_log`.
4. **Checkout:** compute tax at quote time from `tax_rules` for the ship-to country; show
   tax-inclusive or tax-exclusive per cluster convention; line-item the VAT/sales tax.

### 6.4 Rollout (UK-first then EU/US)

**Phase 0 — Stop the bleed (1-2 weeks):**
- Remove every literal `'GBP'` from `formatFromFiat` calls; route through `currencyCode`.
- Finish the 13 screens that already import `useCurrencyContext` but still hardcode GBP.
- Translate `dateFormat.ts` relative strings; wire locale into all `dateFormat` call sites.

**Phase 1 — UK flagship (2-4 weeks):**
- Complete `commerce/listing/messaging/auction/wallet` namespace JSON for `en`.
- Migrate all 68 screens to `useAppTranslation`; add `i18next-parser` to CI.
- Migrate `commerce_shipping_quotes` + listing price storage to minor units + currency code.
- Ship UK as the default cluster with GBP settlement, UK VAT (20%) inclusive, UK shipping zones.

**Phase 2 — EU (4-8 weeks):**
- Add `es/fr/de` namespace JSON; add EUR settlement via mollie/stripe EU.
- Implement EU VAT OSS per-country rates; DDP shipping for EU zones.
- GDPR retention per EU member state; localize all date/number/currency via `Intl`.
- Restricted-categories per EU market (e.g. DE packaging rules, FR electronics).

**Phase 3 — US (8-12 weeks):**
- Add `en-US` locale variant (date format, spelling); USD settlement via stripe_americas.
- Per-state sales tax (Stripe Tax or internal table); DDU shipping zones.
- US restricted categories; COPPA/age gating; US state data-retention rules.

**Phase 4 — MENA/APAC (later):** ar/he RTL, AED/SAR/INR settlement, regional payment
providers (tap, razorpay), regional restricted-items.

---

## 7. Evidence tags (line refs)

- i18n stack installed: `frontend/package.json:103,115,116,124`
- i18next config: `frontend/src/i18n/i18n.ts:28-32,120-145,187-192,204`
- Namespace hook: `frontend/src/i18n/useAppTranslation.ts:24-29`
- Empty commerce namespaces: `frontend/src/i18n/locales/en.json:303-305`
- Legacy flat-key system + patches: `frontend/src/i18n/index.ts:1-241,246,415,584,753-767,781-813`
- Only 4 screens use i18n: `AuctionsScreen.tsx:38`, `SettingsScreen.tsx:31`,
  `CheckoutScreen.tsx:77`, `ItemDetailScreen.tsx:109`
- Settings language picker wired: `SettingsPreferencesContext.tsx:128`
- Currency constants (9 codes, GBP default): `constants/currencies.ts:1-86`
- Currency context + AsyncStorage + live rates: `context/CurrencyContext.tsx:33-116`
- `formatFiatAmount` uses `Intl.NumberFormat`: `utils/currency.ts:75-92`
- `formatPrice` ize+fiat: `utils/currency.ts:103-123`
- **Root leak — `'GBP'` default in formatFromFiat:** `hooks/useFormattedPrice.ts:32`
- Callers hardcoding GBP: `CheckoutScreen.tsx:1343,1604`, `MakeOfferScreen.tsx:179,180`,
  `WithdrawScreen.tsx:657-659`, `FilterScreen.tsx:933-936`, `AuctionHomeScreen.tsx:1947-1950`,
  `StyleQuizScreen.tsx:53-56`
- Backend canonical money: `backend/api/src/db/migrations/079_canonical_money_units.sql:6-12,60-100`
- `Money` type: `backend/api/src/lib/money.ts:59-64`
- Currency exponents: `backend/api/src/lib/money.ts:7-53`
- Country clusters + capabilities: `backend/api/src/lib/countryCapabilities.ts:4-11,34-44,86-120`
- Capability policy: `backend/api/src/lib/countryCapabilityPolicy.ts:16-121`
- Shipping hardcoded GBP: `backend/api/src/routes/shipping.ts:307,324`;
  `db/migrations/072_server_shipping_quotes.sql:12-13`
- GDPR requests table: `backend/api/src/db/migrations/009_compliance_regulatory_foundation.sql:433-446`
- Compliance audit log (hash-chained): `009:451-466`
- Date format locale param + hardcoded relative strings: `frontend/src/utils/dateFormat.ts:7,21,101-104,119-120`
- 68 screens with £/GBP: see §2a (grep `£|GBP` over `frontend/src/screens`)
- ~150 total files with £/GBP across frontend: see §2b
