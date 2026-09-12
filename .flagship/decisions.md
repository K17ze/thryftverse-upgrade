# Co-Own implementation decisions

1. Keep one canonical order-book stream hook shared by Asset Detail and Trade. A sequence gap or reconnect always resnapshots.
2. Treat issuer authenticity as pending until platform review; a create request cannot self-attest `verified`.
3. Treat an online history failure as an error, not an empty ledger or complete local cache. Offline cache is shown only with the offline banner.
4. Treat marked value and executable sale proceeds as separate quantities. Empty bid depth renders `No current bids`, never zero cash-out value.
5. Return reserved sell units from the authenticated holdings projection and cap sellable units at settled minus reserved.
6. Public order projections do not return counterparty user IDs. Owner-scoped history remains authenticated.
7. Issue reports are persisted through the API with an immutable audit event; the client keeps the form contents when submission fails.
8. Do not restore recurring-order or tax-document screens that are currently deleted without confirming their replacement contract; dead routes are safer than fabricated financial surfaces.
9. Offering and market states are separate fields; `isOpen` alone cannot express them. `offeringStatus` and `marketStatus` are the canonical lifecycle; `isOpen` retained for backward compatibility only.
10. An exit corporate action closes the market. All mutating handlers (preview, reserve, order, buyout creation) must reject when `hasActiveExitAction` is true. Buyout accept is exempt — holders must be able to accept exit offers.
11. Buyout body schemas must be `.strict()` and the authenticated user must match `bidderUserId`/`holderUserId`. Raw-body actor-key injection is a real impersonation vector.
12. Reservation and final placement must use the same rounding precision (4 decimals). A 2-decimal final check against a 4-decimal reservation rejects just-reserved orders.
13. Preview and reserve must check the reconciliation halt, not just final placement. Users must not reserve funds they cannot place.
14. Appraisal divided by supply is "Appraised value / unit", not "NAV / unit". NAV requires subtracting liabilities and expenses.
15. The performance chart must not fabricate historical marks. Cost-vs-value comparison is honest; a time-series without real historical data is not.
16. Portfolio service must surface partial failures, not silently drop them. A partial flag and failed asset IDs let the UI warn that totals may be incomplete.
17. TradeScreen "Last" price must use `lastExecutionPriceGbp`, not `asset.unitPriceGbp` (reference/offering price). No trades means "No trades yet", not a mislabelled reference price.

## 2026-09-22 — Wave 39 dossier sheet defect closure

### Decision: separate `onOpenDiligence` from `onNavigateIssue`
**Context:** The dossier sheet's "Full due diligence" action was wired to `onNavigateIssue`, opening the issue-reporting screen instead of the due-diligence screen.
**Decision:** Added a distinct `onOpenDiligence` prop. The issue route (`CoOwnIssue`) is now exclusively for issue reporting; the due-diligence route (`AssetDueDiligence`) is exclusively for the full diligence surface.
**Alternatives considered:** Reusing `onNavigateIssue` with a flag parameter — rejected because it conflates two distinct user intents and makes the call site ambiguous.

### Decision: render provenance as freeform text, not fabricated timeline
**Context:** The asset contract exposes `provenance` as a freeform string. `CoOwnAssetDossier` expects structured `{event, date, note}` events. Mapping freeform text to structured events invents data the issuer never supplied.
**Decision:** Render provenance as an honest freeform text block in the dossier sheet. Do not pass fabricated events into `CoOwnAssetDossier`. The structured timeline component is reserved for assets whose issuers publish structured provenance.
**Alternatives considered:** Heuristic parsing of the freeform string into events — rejected because it fabricates dates and event labels from unstructured text.

### Decision: mock `marketApi` without `importOriginal` in regression tests
**Context:** The real `marketApi` module transitively imports `apiClient` → `expo-secure-store`/`expo-network`, which load React Native Flow source through CommonJS. Vitest under the `react-native-web` alias cannot parse RN's `import typeof` syntax, producing `SyntaxError: Unexpected token 'typeof'` before test discovery.
**Decision:** Stub `marketApi` with only the two fetchers the tests exercise (`listCoOwnExecutions`, `fetchCoOwnPriceHistory`). Do not use `importOriginal` because it eagerly loads the real module and its transitive native deps.
**Alternatives considered:** Mocking `expo-secure-store`/`expo-network`/`expo-constants` individually — tried, but the parse error originates from the transitive `apiClient` import chain, not from the modules themselves. Mocking the `commerce/detail` barrel was also required to prevent `BottomSheet` → `react-native-reanimated` from loading the same RN Flow source.

### Decision: remove dead `feeSchedule` prop from `AssetOwnershipSection`
**Context:** `AssetOwnershipSection` accepted a `feeSchedule` prop but never rendered it. The structured fee schedule is now rendered in the dossier sheet (Pillar 2 consolidation).
**Decision:** Removed the prop from the interface, destructuring, and call site. Fees live exclusively in the dossier sheet to eliminate cross-tab duplication.
**Alternatives considered:** Keeping the prop for future use — rejected because dead props are a maintenance hazard and the dossier sheet is the single source of fee truth.

## 2026-09-11 — Waves A-D + F implementation decisions

### Decision: buyout premiumPct computed against the trade-path reference mark
**Context:** `GET /co-own/assets/:id` returned `premiumPct: null` because the offers table has no premium column.
**Decision:** Compute `(offerPriceGbp - mark)/mark` where mark = last settled secondary execution, else the primary unit price — the same reference the trade path uses. Null only when no positive mark exists.
**Alternatives considered:** Adding a premium column — rejected; premium is a derived display value, not stored state.

### Decision: socket deltas batch on a fixed ~90ms window with contiguous-prefix application
**Context:** Per-message setState forced a full quote-strip + ladder re-render per socket delta.
**Decision:** Buffer deltas, flush once per window after sorting by sequence, apply only the contiguous prefix; first gap discards the rest and triggers the canonical resnapshot. Snapshots clear the buffer (a pending flush on an empty buffer is a no-op).
**Alternatives considered:** Per-delta setState — rejected (render churn). Full virtualization of a 5-level ladder — rejected as unjustified complexity.

### Decision: risk acknowledgment precedes the education guide in the first-trade gate
**Context:** The compliance profile orders KYC > risk > wallet > education; the trade path only gated on education.
**Decision:** First buy/sell intent opens the risk disclosure sheet with an explicit "I understand - continue" control when `riskDisclosureAccepted` is false; pending trade intent (side + limit price) is preserved through the sheet chain (risk > guide > Trade).
**Alternatives considered:** Blocking at the Trade screen — rejected; the disclosure must land before order entry, and the AssetDetail surface is where the intent originates.

### Decision: actionable ballots are separated from the passive events log
**Context:** Governance votes mixed into the corporate-actions event list read as history, not decisions.
**Decision:** Open `actionType === 'governance'` actions render in a dedicated "Open decisions" block with deadline + Vote CTA to `CorporateActionVote`. The vote screen re-checks server-side eligibility; the list is an affordance, not a gate.
**Alternatives considered:** A badge on the event row — rejected; an awaiting ballot is an action surface, not an event.

### Decision: distribution proceeds waterfall states gross > per-unit > units > received only
**Context:** The distribution contract carries no cost/fee line items.
**Decision:** Render only contract-backed rows and disclose "Costs and fees are not itemised for this distribution." Net label adapts to status (Projected to you / You received / Paid (later reversed)).
**Alternatives considered:** Estimating a net figure — rejected; it fabricates a deduction the contract does not quantify.

### Decision: allocation segment palette derived from theme tokens, not fixed hexes
**Context:** `CoOwnPortfolioAllocation` used a hardcoded slate/taupe ramp — illegible against the neutral system in dark mode.
**Decision:** Derive 8 stops by interpolating `textPrimary` to `border` (t = 0.08..0.92); rank-ordered so the largest slice takes the highest-contrast tone. Segment identity follows rank, stable across theme switches.
**Alternatives considered:** Keeping fixed hexes per theme — rejected; duplicated palettes drift.

### Decision: viewers consume the baked render artifact, not the raw document source
**Context:** `media_url` (rendered artifact with all edits burned in) vs the stored composition document whose media layer still references `source_media_url`. Canvas view-mode played `payload.mediaUri` � the unedited source � silently discarding published edits.
**Decision:** `pageWithRenderedMedia` substitutes the rendered `media_url` as the page's media layer (identity geometry, all baked edit fields cleared) and drops static overlay types already burned into the artifact. Interactive/dynamic layers (vote, quiz, question, emojiSlider, link, product, look, music, mention, time, weather) stay live on top � they carry taps/freshness the bake cannot provide.
**Alternatives considered:** Re-rendering the raw doc client-side (status quo) � rejected, it ignores trim/speed/freeze/reverse and diverges from non-app surfaces. Shipping doc + re-rendering all overlays client-side (Snap model) � our backend already bakes statics; dropping them avoids double-draw.

### Decision: no multi-clip concat for publish � posters are a paged deck
**Context:** W12 hypothesized "a 3-clip poster video publishes only the cover clip." Post-publish, every page renders its own frame artifact (`renderPosterFrameCompositions`); looks are contract-enforced single-page (`compositionContract.ts:81`).
**Decision:** Concat is not needed for publish parity. It becomes relevant only if a "export poster as single video" feature is added � park until then.
**Alternatives considered:** Backend concat demuxer now � rejected; no consumer.

### Decision: listing queue offline-park refunds the interrupted attempt
**Context:** A connectivity drop aborts the transport with the same AbortError as a user cancel; previously in-flight items hung until transport timeout and burned a retry attempt.
**Decision:** `parkForOffline()` flags in-flight items `_offlineAborted`; the catch requeues them as `pending` with `attemptCount` refunded and preserves the `_needsFinalizationOnly` checkpoint. Explicit user cancel during the abort still wins.
**Alternatives considered:** Marking offline-parked items as `paused` � rejected; listing items have no user-visible pause affordance, pending matches retry semantics.
