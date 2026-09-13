# Task 4 — F03: Source-assertion test file rename + tautology removal

**Status:** DONE
**Date:** 2026-09-11
**File:** `frontend/src/__tests__/nativeVisualAcceptance.test.ts` → `frontend/src/__tests__/structuralArchitecture.test.ts` (renamed via `git mv`, history preserved)

## Baseline before fix

`npx vitest run src/__tests__/nativeVisualAcceptance.test.ts` → **39 passed / 1 failed (40 total)**.

The one failure was itself a stale tautology:
`expect(itemScreen).toContain('CommerceDetailIdentity')` — `ItemDetailScreen` was
refactored to the Phase-2 `CommerceIdentityBlock` family, so the assertion could
never pass again while also proving nothing about rendering.

Additional latent tautologies found during the audit:

- `expect(itemScreen).toContain('CommerceMediaStage')` passed only because the
  string appears inside **code comments** (ItemDetailScreen.tsx:797,833) — the
  screen renders `CommerceMediaHero`, not `CommerceMediaStage` directly.
- `expect(assetScreen).toContain('CommerceDetailIdentity')` passed only on a
  **comment** (AssetDetailScreen.tsx:1028); the screen renders
  `AssetDetailIdentity` (line 1032).
- `expect(*).toContain('Ionicons')` checks that an import string exists — a dead
  import satisfies it.

## What was renamed

- File: `nativeVisualAcceptance.test.ts` → `structuralArchitecture.test.ts`
- Top-level describe: `native visual acceptance QA matrix (spec 07_VISUAL)` → `structural architecture checks`
- `thumbnail test (structural)` describe → `media-first composition`
- `surface budget` describe → folded into `screen deconstruction` (its old tests were pure `toContain` tautologies; the real invariant is composition)
- Icon tests: `uses Ionicons consistently` → `has a consistent icon family` / `asset detail tree has a consistent icon family`
- Header comment rewritten to state these are structural/architectural source checks, **not** visual acceptance, and to point at the real rendered-screenshot pipeline (`visual-baseline-manifest.json`, `__screenshots__/`, `visualRegressionPlan.test.ts`, `scripts/capture-baselines.sh`).

## What was removed (tautological)

- All bare `toContain('Ionicons')` positive assertions (auction, asset identity, item) — a dead import passes them.
- `expect(itemScreen).toContain('CommerceDetailIdentity')` — stale; component no longer exists in that screen.
- `expect(itemScreen).toContain('CommerceMediaStage')` — matched comments only; replaced by real JSX-usage assertion on `CommerceMediaHero`.
- `expect(assetScreen).toContain('CommerceDetailIdentity')` — matched a comment only; replaced by JSX-usage assertion on `AssetDetailIdentity`.
- Redundant `toContain('CommerceDetailIdentity')` inside the auction text-budget test (covered by the deconstruction block).
- Asset text-budget test whose entire body was the comment-matching tautology; heading ownership for asset is now covered by the `AssetDetailIdentity` composition check.

## What was kept (genuinely useful)

- **Radius budget** — `borderRadius: 30|32|40|48` banned in commerce detail components + auction/asset screen styles.
- **Stroke grammar** — hairline divider in `CommerceDetailSection`; ≤4 distinct `borderWidth` values in auction screen.
- **No card-on-card** — `CommerceDetailSection` must not be nested inside card-styled views (auction, asset).
- **Truthful UI** — `auction.bidCount` sourced from data with no `bidCount = <literal>`; no `lastExecutionPrice = <literal>`; no "people interested"; no `'Demand'` label on likes.
- **State completeness** — loading/error/unavailable state handling on all three screens.
- **Control quality** — a11y labels on docks (asset checked on `AssetDetailDock.tsx`, the owner layer); pressed feedback on `CommerceDetailStateDock`.
- **Discovery density** — `BundleUpsellRow`/`moreLikeThisGrid` present, no `railSections.map`; Co-Own charts are width-responsive (`useWindowDimensions`, no fixed `CHART_WIDTH = 320`); fully-allocated state has a real primary action.
- **Light/dark parity** — `colors.` theme usage, no hardcoded `#000`/`#fff` backgrounds.
- Icon family negatives (`not.toContain('MaterialIcons'|'FontAwesome')`) kept and **extended** with `MaterialCommunityIcons` and `Feather` — a real one-icon-family invariant rather than an import-presence check. Asset check now spans the screen **and** the extracted owner-layer components.

## What was added

New `expectComposes(source, component)` helper: asserts the component name is
referenced **and** rendered as JSX (`/<Component[\s/>]/`) — comments and dead
imports no longer satisfy the check.

New `screen deconstruction` describe (7 tests):

- `ItemDetailScreen` renders `CommerceMediaHero`, `CommerceIdentityBlock`, `CommerceTrustDossier`, `CommerceActionDock` (Phase-2 extraction guard).
- `AuctionDetailScreen` renders `CommerceDetailIdentity` + `CommerceDetailTransactionSurface`.
- `AssetDetailScreen` renders `AssetDetailIdentity`; `AssetDetailDock` renders `CommerceDetailStateDock`.
- `HomeScreen` renders `HomeHeader`, `HomeMasonryFeed`, `HomeFeedHeader`.
- Owner-layer nesting: `HomeFeedHeader`→`HomeStoryRail`, `HomeMasonryFeed`→`HomeLookBreak`, `HomeStoryRail`→`PosterStoryArtwork`.
- `MyProfileScreen` renders `ProfileHeaderHero`, `CompletionGrowthPanel`, `StorefrontTabs`.
- `StorefrontTabs`→`ClosetGrid` (owner layer; `ClosetGrid` is not referenced directly by the screen).

New `media-first composition` describe (3 tests): auction/asset render `<CommerceMediaStage`, item renders `<CommerceMediaHero` which itself composes `CommerceMediaStage`.

## Verification results

- `npx vitest run src/__tests__/structuralArchitecture.test.ts` → **43 passed / 0 failed** (was 39/1).
  Note: the project uses **vitest** (`"test": "vitest run --dir src"`); there is no jest install — `npx jest` would fetch an unrelated package. Use vitest for this suite.
- `node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` → **exit 0**, zero diagnostics (project-wide clean; no references to either file name).
- `grep nativeVisualAcceptance` → remaining references are docs/log/report files only (`.flagship/*`, `docs/research/*`, `implementation_plan.md`) — historical records, not code references. No test or script imports the old file name.

## Concerns / notes for parent agent

- These remain **source-assertion** tests by design. They now fail only on real structural regressions (component de-composition, budget violations, fabricated data), but they still cannot verify rendered layout. The header comment documents where actual visual acceptance lives.
- `docs/research/flagship-uiux-upgrade-report-2026-09-11.md` and `implementation_plan.md` still cite the old filename as a pattern reference — informational only, no functional impact. Update if docs hygiene matters.
- The `expectComposes` JSX check uses a regex on source text; a component rendered via an unusual indirection (e.g., `createElement`) would not match — none exists in the audited screens today.
