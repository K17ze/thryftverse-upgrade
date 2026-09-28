# Adversarial review — audit-2026-09-28 implementation wave

Reviewer: fresh-context read-only subagent (agent 531de379). Source-level review of
`.superpowers/sdd/audit-2026-09-28/native-diff.patch` vs the audit spec, plus the seven
new test files. No device session; findings are source-derived.

## Findings

1. **Important — `AssetDetailIdentity` renders `NaN%`/`Infinity%` as a down/up move.**
   `AssetDetailIdentity.tsx` ~101-105,138-165: `movePct24h != null` admits non-finite
   numbers. `NaN` → down glyph/color + "down NaN percent"; `Infinity` → `+Infinity%` up.
   Guard with `Number.isFinite`. Tests cover 0/-0.04/±1.5 but not NaN/Infinity/+0.04.

2. **Important — single-resource retry races the in-flight full reload.**
   `useAgentStudioResources.ts` ~78,92-93: `reload('connections')` bumps the global
   `sequence.current`, so a settling full `reload()` early-returns — its fulfilled
   payloads never reach the store and its resource entries stay `loading`. The overview
   hides retry while `status === 'loading'` → unrecoverable until refocus. Needs a
   per-resource-key sequence guard.

3. **Important — `usePortfolioData` clears the partial qualifier on refresh failure.**
   `frontend/src/hooks/portfolio/usePortfolioData.ts` ~65-73: failed refresh runs
   `setIsPartial(false)` while retained positions stay on screen → partial totals lose
   their "may be incomplete" qualifier and are also now stale. Violates F23 acceptance
   ("never present a partial total as complete").

4. **Important — `SellerAuctionRow` headline amount diverges from meta/a11y amount.**
   `SellerAuctionRow.tsx` ~55 selects `currentBidGbp > 0 ? current : starting`, while
   `resolvePriceText`/`buildAuctionAccessibilityLabel` select on `bidCount > 0`.
   Retracted-bid edge cases show/announce two different prices. (Pre-existing selection
   logic — surfaced on a touched money surface.) Single-source the selection.

5. **Minor — `any` props on a financial surface** (`SellerAuctionRow.tsx` ~42-43:
   `formatFromFiat`/`fxRates`). Type against `SupportedCurrencyCode` + real rates map.

6. **Minor — new `aiAgent` strings are English-only across 13 locales.** en.json gains
   resource/retry keys; other locales fall back to EN per `locales/index.ts` merge —
   deliberate infra, but error surfaces now announce English to non-EN users.

7. **Minor — hardcoded English a11y labels in new a11y code** — MessageBubble ~307-335
   (t() already in scope), AgentStudio* sections, AuctionDescription,
   PortfolioPartialBanner, AssetMarketSection.

8. **Minor — `AuctionDescription` mounts a phantom "Read more" pre-measurement** —
   `overflows = lineCount == null || lineCount > 3` shows the 44pt control before
   `onTextLayout` lands. Gate on `lineCount != null && lineCount > 3`.

9. **Minor — ambiguous `"150u"` abbreviation beside executable quotes** —
   `AssetMarketSection.tsx` ~337,371 prints `{units}u` under tradable bid/ask.
   Spell "units" or drop the marker.

10. **Minor — `CoOwnOrderBook` breakpoint measured on border-box width + pre-measure
    flash** — padding inflates `availableWidth` by 32pt in standalone mode; initial
    `measuredWidth = 0` falls back to `windowWidth` and can flash the rail layout for
    a frame.

11. **Minor — stale agent/connection rows render unlabeled inside tab content** —
    `AIAgentIntegrationScreen.tsx` ~87 only derives `loadError` for `status === 'error'`;
    `stale` lists have no in-section marker (the overview row is above the tab strip).
    Also `deviceKeys.loading` (local keystore, not a fetched resource) is folded into
    the overview skeleton gate.

12. **Minor — dead style `introTitle`** in `GroupPermissionsScreen.tsx` ~281-287.

13. **Minor — test-quality gaps** — (a) `coownFinancialReadability` validates
    AssetDetailModals by readFileSync string-grep; (b) `auctionDetailFlagshipClosure`
    dropped the "View all bids" assertion rather than updating it (prior wave);
    (c) no tests for findings 1–3 paths or the 240pt breakpoint boundary.

## Clean areas verified

- AssetMarketSection quote ownership consistent (`canonicalBandVisible` mirrors render
  branches; tape/depth/error views restore full quote row — no quote info lost).
- CoOwnOrderBook stacked mode: exact unclamped values, 44pt rows, `onSelectLevel`
  preserved, labeled Bid/Ask gauge + scope caption — F10/F11 met.
- SwipeableMessage: commit/cleanup split correct, single haptic, valid RNGH chain.
- MessageBubble: named actions mirror affordances; inert bubbles demote to `text`.
- DiscoveryMediaImage: URI-keyed failure, hidden fallback glyph, reduced-motion
  `transition={0}` per cell.
- CommerceDetailDisclosureRow: 44pt target, decorative icons hidden, one a11y node.
- GroupPermissionsScreen: geometry-matched skeleton, authority explainer above
  controls, offline vs denied copy distinct, reconciliation preserved.
- Provider chips: radio + selected on ≥44pt transparent targets, no coming-soon rows.

## Counts

Critical 0 · Important 4 (findings 1–4) · Minor 9 (findings 5–13)
