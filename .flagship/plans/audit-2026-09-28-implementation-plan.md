# Implementation plan — current-uiux-parity-audit-2026-09-28

Spec (binding authority): `docs/research/current-uiux-parity-audit-2026-09-28.md`
Repo: `C:/Users/User/Desktop/thryftverse-upgrade` — Expo/React Native app in `frontend/`.
Branch: `feat/product-detail-contract-media-device-closure`. Working tree carries prior
uncommitted implementation (findings 01,02,03,05,06,07,08 + partial 04). Build on top of it.

## Global constraints (verbatim binding for every task)

- Edit ONLY inside `frontend/`. NEVER touch `web/`, `backend/`, `ops-console/`, `docker/`.
- NEVER run `git commit`, `git add`, `git checkout`, `git stash`, `git restore`, or any
  state-changing git command. `git diff`/`git status`/`git log` read-only are allowed.
  The working tree contains other in-flight work; do not disturb it.
- NEVER spawn subagents. Single level of parallelism is owned by the orchestrator.
- No new npm dependencies. Use existing tokens:
  `frontend/src/theme/designTokens.ts` (Space, Radius, Stroke, ExchangeLayout, FontFamily),
  `frontend/src/theme/typography.v2.ts` (TypographyV2), `useAppTheme()` colors
  (`frontend/src/theme/ThemeContext.tsx`), `frontend/src/components/AnimatedPressable.tsx`,
  `frontend/src/components/CachedImage.tsx`, shared disclosure primitives in
  `frontend/src/components/commerce/detail/`.
- Anti-AI design policy: flat canvas + hairline separators + typography hierarchy are the
  default. No new cards/shadows/pills/gradients as decoration. Separate hit area (≥44pt,
  transparent) from visible shape (compact glyphs OK). Full state coverage
  (loading/empty/error/partial/offline). Tabular numerals for money. Reduced-motion and
  large-text (up to 200% font scaling) must be first-class. accessibilityRole /
  accessibilityLabel / accessibilityState on interactive elements.
- Money/financial values must NEVER be silently truncated or abbreviated in executable
  contexts. Exact values wrap or reflow instead.
- Match existing file conventions (hardcoded EN copy is the current convention in these
  surfaces — do not introduce i18n in touched files unless already present there).
- Tests: vitest (`cd frontend && npx vitest run src/__tests__/<file>`). Create NEW uniquely
  named test files under `frontend/src/__tests__/`; do NOT edit existing test files unless
  the task explicitly owns one. Use `@testing-library/react-native` as existing tests do.
- Typecheck: `cd frontend && npx tsc --noEmit` must remain clean.
- Write the full report to the assigned report file; return only status + one-line summary.

## Tasks (disjoint file ownership — safe for parallel dispatch)

### Task A — Co-own financial readability (audit findings 10, 11, 12, 13, 14)
Owns:
- `frontend/src/components/coown/CoOwnOrderBook.tsx`
- `frontend/src/components/coown/asset-detail/AssetMarketSection.tsx`
- `frontend/src/components/coown/asset-detail/AssetDetailIdentity.tsx`
- `frontend/src/components/coown/asset-detail/AssetDetailModals.tsx`
- new tests e.g. `src/__tests__/coownFinancialReadability.test.tsx`
May read: `frontend/src/utils/orderBookDepth.ts`, theme files, existing coown tests.

Requirements from audit:
- 10 (P1): replace hardcoded 90/80pt rails with a responsive financial layout — measured
  available width + text scale; at the constrained breakpoint show exact price/units in a
  structured stacked row or clearly scrollable table; never abbreviate executable quotes.
  Also fix single-line top-of-book values in AssetMarketSection (~line 289).
- 11 (P2): remove redundant quote emphasis between AssetMarketSection bid/spread/ask strip
  and the embedded book's spread band; label the imbalance gauge "Bid"/"Ask" visibly (a
  monochrome screenshot must still explain it); state gauge scope.
- 12 (P1): remove 1.3 font-multiplier caps and 0.7 shrink on the dominant price in
  AssetDetailIdentity (~line 109); reflow supporting context below the price. Same
  large-text strategy in AssetDetailModals titles (~line 209, 1.3 caps).
- 13 (P2): three-state daily change — positive/negative/unchanged. `>= 0` currently makes
  exact zero render as up. Sign-aware rounding so tiny negatives don't print "-0.00%".
- 14 (P2): trading rules block in AssetMarketSection (~line 734) claims tappable
  disclosure in its comment but renders static clipped rows. Choose deliberately:
  real destination with full terms, or honest static summary with wrapping text.
  Verify backend policy before changing the circuit-breaker claim; fix the comment.

### Task B — Seller auction inventory row (finding 09)
Owns:
- `frontend/src/components/auction/SellerAuctionRow.tsx`
- `frontend/src/components/auction/sellerAuctionCentreViewModels.ts` (if needed)
- new tests e.g. `src/__tests__/sellerAuctionRowDensity.test.tsx`

Requirements: prioritize item identity + one commercial value + one next task; supporting
currency/state move to a quiet wrapping line; monetary lines must not clamp at one line
when space-constrained — wrap exactly; consider a smaller media slot (~72–80pt) if the
composition supports it; preserve full details in the management destination; target ~4
useful rows per viewport at default text; action labels understandable at large text.
Keep `buildAuctionAccessibilityLabel` contract intact.

### Task C — Purchase-information ownership (finding 04 residual)
Owns:
- `frontend/src/components/itemdetail/ItemDetailBuyingSection.tsx`
- `frontend/src/components/commerce/detail/ShippingReturnsInfo.tsx`
- `frontend/src/components/commerce/detail/CommerceDetailDisclosureRow.tsx` (extend only if
  the shared primitive needs it)
- new tests e.g. `src/__tests__/purchaseInfoOwnership.test.tsx`

Requirements: one ownership model — a factual purchase summary (known cost, delivery,
return facts — not filler) leading to full terms; a separate shipping disclosure only if
it performs a distinct task. Preserve ALL current detail capabilities and destinations.
Prior session already renamed the link to "Costs & buyer protection" and exposed
shipping+returns in the collapsed summary — build on that, do not revert it.

### Task D — Agent Studio operational clarity (findings 15, 16, 17)
Owns:
- `frontend/src/components/agents/AgentStudioConnectionsSection.tsx`
- `frontend/src/components/agents/agentStudioStyles.ts`
- `frontend/src/components/agents/AgentStudioAgentsSection.tsx`
- `frontend/src/components/agents/AgentStudioStatusOverview.tsx`
- `frontend/src/hooks/useAgentStudioResources.ts`
- `frontend/src/screens/AgentStudioScreen.tsx` (or wherever the hook/sections are consumed —
  find via grep; only to wire the new per-resource state)
- new tests e.g. `src/__tests__/agentStudioResources.test.tsx`

Requirements:
- 15 (P1): provider chips get accessible single-select semantics
  (accessibilityRole 'radio'/'button' + accessibilityState selected/checked) and ≥44pt
  transparent targets around compact visible chips (4pt vertical padding currently).
  Remove unreachable "coming soon" provider branches; do not invent new providers.
- 16 (P2): agent rows lead with purpose or actionable setup issue where the contract
  supplies it; runtime/version demoted to detail metadata; name+status may wrap together.
- 17 (P1): `useAgentStudioResources` reduces all rejections to one boolean. Keep
  per-resource freshness/error state (bots / connections / approvals); the status
  overview must mark only the affected resource, preserve healthy info, expose the full
  actionable connection error, and label stale data. Retry identifies what refreshes.

### Task E — Discovery media integrity (findings 18, 19, 20)
Owns:
- `frontend/src/components/discover/PinterestMasonryGrid.tsx`
- new tests e.g. `src/__tests__/discoveryMediaStates.test.tsx`
May read: `frontend/src/components/CachedImage.tsx` — if a shared change seems warranted,
do NOT edit it; note it in the report for orchestrator decision.

Requirements:
- 18 (P1): every media unit type (listing, editorial/Poster/Moodboard branches ~line 622)
  gets consistent loading/error/retry contract — local onError + placeholder handling;
  failed tiles keep a coherent identity (icon/title context), never unrelated stock media.
- 19 (P2): verification glyphs over media (~line 650) use `colors.brand` (near-black in
  light theme) beside white on dark scrim — wrong contrast role. Use a media-overlay
  foreground role (white/scrim-aware) with controlled backing if needed.
- 20 (P2): reduced-motion value is read and discarded (~line 479). Apply it to media
  transitions — instant swaps under reduced motion.

### Task F — Chat accessibility + gesture (findings 21, 22)
Owns:
- `frontend/src/components/chat/MessageBubble.tsx`
- `frontend/src/components/SwipeableMessage.tsx`
- new tests e.g. `src/__tests__/messageBubbleA11y.test.tsx`

Requirements:
- 21 (P1): bubble Pressable (~line 328) has button semantics but only onLongPress.
  Provide a coherent accessible node: normal activation or named accessibility actions
  for reply/menu (accessibilityActions + onAccessibilityAction on Android,
  accessibilityTraits/behaviour equivalent on iOS), while nested media/link controls
  stay independently operable and no redundant focus stops appear.
- 22 (P2): SwipeableMessage (~line 95) resets displacement only in onEnd; add explicit
  onFinalize/cancel cleanup so interrupted gestures cannot retain translation; collapse
  the double haptic (threshold + fire) into one deliberate event unless two-stage is
  intentional.

### Task G — Portfolio recovery + group permissions (findings 23, 24)
Owns:
- `frontend/src/components/portfolio/PortfolioPartialBanner.tsx`
- `frontend/src/screens/PortfolioScreen.tsx` (only to wire retry + stale labeling)
- `frontend/src/screens/GroupPermissionsScreen.tsx`
- new tests e.g. `src/__tests__/partialStateRecovery.test.tsx`

Requirements:
- 23 (P2): partial banner gets a quiet retry action or explicit refresh instruction;
  never clamps at large text; a partial total is never presented as complete; where
  available identify which positions are stale/missing.
- 24 (P2): replace the centred spinner with a restrained 3-row skeleton matching loaded
  geometry; move the read-only explanation near the first affected control or into the
  intro using server capability data; offline vs authority-denied must read differently.

### Task H — Design.md reconciliation (finding 25) — ORCHESTRATOR ONLY, after waves land
Update `Design.md` to document current token roles (`successText`/`dangerText`/`warningText`
foregrounds vs fills), embedded inset ownership, large-text layout rules.

## Execution

Parallel background implementers (A–G), disjoint ownership, no commits.
Per-package review by orchestrator (diff + scoped vitest + tsc), fix rounds as needed.
Final: full `npx tsc --noEmit`, targeted vitest suites, Design.md task H, report.
