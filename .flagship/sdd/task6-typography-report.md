# Task 6 — F04 Typography Contract Conflict: Fix Report

**Date:** 2026-09-11
**Branch:** `feat/product-detail-contract-media-device-closure`
**Status:** DONE

---

## 1. Defect summary

`designTokens.ts` `Type.display` resolved to `24/30` while `TypographyV2.display`
(the canonical contract per `Design.md` §Typography) resolves to `32/38`.
`TypeStyles.display` already delegated to `TypographyV2.display`, so
`Type.display` and `TypeStyles.display` inside the same file disagreed — the
same semantic role name produced different geometry depending on the import
path.

`TypographyV2` is the canonical authority (Design.md). `Type`/`TypeStyles` in
`designTokens.ts` are deprecated compatibility exports and were aligned to it.

## 2. Full divergence audit — `Type` vs `TypographyV2`

Every `Type` key was compared against its canonical V2 role via
`LEGACY_TO_V2_MAP` (typography.v2.ts L274–295). Divergences found and fixed:

| Type key | Before | Canonical V2 role | After | Fields changed |
|---|---|---|---|---|
| `display` | 24/30/700/-0.5 | `display` 32/38/700/-0.5 | 32/38/700/-0.5 | size, lineHeight |
| `title` | 20/26/700/-0.6 | `screenTitle` 24/32/700/-0.6 | 24/32/700/-0.6 | size, lineHeight |
| `screenTitle` | 20/26/700/-0.6 | `screenTitle` 24/32/700/-0.6 | 24/32/700/-0.6 | size, lineHeight |
| `heading` | 17/22/600/-0.4 | `sectionTitle` 17/24/600/-0.4 | 17/24/600/-0.4 | lineHeight |
| `caption` | 12/16/400/0 | `caption` 12/16/400/0.1 | 12/16/400/0.1 | letterSpacing |
| `captionElevated` | 13/18/400/0.1 | `captionElevated` 13/18/500/0 | 13/18/500/0 | weight, letterSpacing |

Already matching (no change needed): `hero`, `subtitle`, `sectionTitle`,
`itemTitle`, `body`, `bodyEmphasis`, `bodyStrong`, `priceList`, `priceLarge`,
`priceHero`, `meta`, `metaElevated`, `label`, `numericMeta`.

Roles from the task checklist that do not exist in `Type`: `metadata`,
`action`, `financial`, `small`, `micro`, `eyebrow` — nothing to align.

Intentionally left divergent — legacy-only keys with **semantic remaps** (both
in `FORBIDDEN_LEGACY_TOKENS`, pending deletion after migration; zero consumers):

- `Type.bodyLarge` (16/22/700/-0.2) → canonical role `priceList` (20/24/700/-0.3).
  Changing it would alter layout geometry for a token already forbidden in new
  code; the LEGACY map already declares the canonical target.
- `Type.price` (14/20/600/-0.2) → canonical role `priceList`. Same reasoning —
  documented in-file as "LEGACY — prefer priceList for actual prices".

## 3. `TypeStyles` consistency fixes

`TypeStyles` doc-comment claims it "mirrors `Type` values exactly". Two entries
violated that invariant (both zero-consumer):

| TypeStyles key | Was delegating to | Now delegates to | Reason |
|---|---|---|---|
| `hero` | `TypographyV2.display` (32/38) | `TypographyV2.hero` (28/34) | `Type.hero` = 28/34; V2 has a real `hero` role — old mapping silently equated hero with display |
| `caption` | `TypographyV2.meta` (11/14/500/0.15) | `TypographyV2.caption` (12/16/400/0.1) | `Type.caption` = 12/16; old mapping rendered captions as meta-sized text |

Verified all other `TypeStyles` entries agree with `Type`:
`display`→V2.display (32/38 = Type.display ✓), `heading`→V2.sectionTitle
(17/24 = Type.heading ✓), `title`→V2.screenTitle (24/32 = Type.title ✓),
`body`/`bodyEmphasis`/`bodyStrong`→V2 equivalents ✓, `overline`→V2.label
(= Type.label ✓). TypeStyles-only keys (`metadata`→meta, `button`→bodyStrong)
have no `Type` counterpart to contradict.

## 4. Consumer impact of the `display` 24→32 change

**Zero runtime impact.** Verified by grep over `frontend/src`:

- `Type.display`: **no consumers.** `Type` itself is imported in exactly one
  file — `src/components/flagship/PageCompositions.tsx:50` — where it is a
  **dead import** (no `Type.*` member access anywhere in the file).
- `TypeStyles.display` / `TypeStyles.*`: **zero consumers** repo-wide
  (`TypeStyles` appears only in designTokens.ts and typography.v2.ts).
- `Numeric.display` (spreads `...Type.display`): **zero consumers**.
- All other `Type.*` role accesses outside designTokens.ts are code comments
  only (CommerceDetailMetricRow, ProfileHero, InboxConversationRow).
- All screens using display geometry already read `TypographyV2.display` (32/38)
  directly — 40+ references across LoginScreen, SignUpScreen, OnboardingScreen,
  BiometricLoginScreen, AgeVerificationScreen, ForgotPasswordScreen,
  ResetPasswordScreen, CategoryTreeScreen, SellerAuctionCentreScreen,
  SyndicateOnboardingScreen, MakeOfferScreen, BrandedSplash, FlagshipHeroSection,
  CoOwnFeaturedAsset, CoOwnWalletBreakdown, IdentityCard, BuyNowSheet, BidSheet,
  PosterReactionReplyBar, AppErrorBoundary, posters.ts, CreatorCanvas,
  CreatorAssetPicker, PerformanceOverlay, DrawingWorkspace,
  ItemDetailSkeleton, CommerceDetailTransactionSurface, AuctionStateBadge,
  AuctionCountdown. **None of them change.**

No component relied on `Type.display` being 24. No layout regressions.

## 5. Changes made

**`frontend/src/theme/designTokens.ts`** (only file with value changes)
- `Type.display`: `size 24→32`, `lineHeight 30→38` (+comment updated)
- `Type.title`: `size 20→24`, `lineHeight 26→32` (+comment)
- `Type.screenTitle`: `size 20→24`, `lineHeight 26→32` (+comment)
- `Type.heading`: `lineHeight 22→24` (+comment)
- `Type.caption`: `letterSpacing 0→0.1` (+comment)
- `Type.captionElevated`: `weight '400'→'500'`, `letterSpacing 0.1→0` (+comment)
- `TypeStyles.hero`: now delegates to `TypographyV2.hero` (was `.display`)
- `TypeStyles.caption`: now delegates to `TypographyV2.caption` (was `.meta`)
- `Numeric.display` doc comment: `(24/30/700)` → `(32/38/700)`
- **`@deprecated` JSDoc added to `Type`** (was missing; points to
  `TypographyV2`, documents the F04 alignment and `LEGACY_TO_V2_MAP`).
  `TypeStyles` already carried a `@deprecated` JSDoc — left as is.

**`frontend/src/theme/typography.v2.ts`**
- Migration-order comment (L17–23): documents that same-named `Type` roles
  resolve to identical geometry (aligned under defect F04); legacy-only keys
  are semantic aliases via `LEGACY_TO_V2_MAP`.

`TypographyV2` values were **not** modified (canonical per constraints).

## 6. Verification

```
cd frontend; node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
```

- **designTokens.ts / typography.v2.ts errors: 0** (filter on
  `designTokens|typography` returned nothing).
- **tsc overall: clean — 0 `error TS` lines across the whole project.**
  (The 5 pre-existing `MoodboardHomeScreen.tsx` JSX syntax errors noted in an
  earlier pass have since been fixed in the working tree; the file no longer
  produces diagnostics.)

## 7. Concerns / notes

1. **Dead `Type` import** — `PageCompositions.tsx:50` imports `Type` but never
   uses it. Left in place (out of scope; removing it is a trivial follow-up).
2. **Legacy semantic deltas remain by design** — `Type.bodyLarge` (16/22) and
   `Type.price` (14/20) still differ from their canonical V2 role
   (`priceList`). Both are forbidden tokens pending deletion; no consumer
   reads them. Aligning them would silently change geometry of a deprecated
   token, so they were flagged rather than changed.
3. **Design.md stale note** — the "Known migration gap" callout in Design.md's
   typography section is now resolved and can be removed/updated by the docs
   owner (parent agent may handle).
4. **`FontSize.display` = 40** — the raw size scale is a separate axis (not a
   role) and was left unchanged; no same-name conflict because `FontSize` and
   `Type`/`TypographyV2` are different namespaces.
5. **`Type.label` lacks `textTransform: 'uppercase'`** that
   `TypographyV2.label` carries. `Type` is a geometry-only map (size/lineHeight/
   weight/letterSpacing per the `TypeStyle` interface), so this is a shape
   limitation of the legacy contract, not a divergence in shared fields.
   `TypeStyles.overline` (the styled counterpart) does apply the uppercase
   transform via `TypographyV2.label`. No action taken.
