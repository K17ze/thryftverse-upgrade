# Task C report — Purchase-information ownership (audit finding 04 residual, P2)

**Status: DONE**

## Ownership model (the decision the audit asked for)

One model, two non-overlapping roles — **facts vs. terms**:

- **`ShippingReturnsInfo` is the sole owner of delivery/returns facts.** Its
  collapsed summary is the at-a-glance truth (`Free shipping · No returns`,
  `Shipping: £3.49 · 14-day returns`,
  `Shipping calculated at checkout · Return policy confirmed at checkout`), and
  its expansion keeps the full policy detail (shipping cost, estimated delivery,
  carrier, restocking fee, conditions). Shipped by the prior session; preserved
  verbatim — the file is untouched.
- **The "Costs & buyer protection" disclosure row is the sole owner of the
  path to complete terms** (the existing `Costs, delivery & protection` sheet:
  item price, buyer-protection fee, estimated total, delivery method, protection
  policy, returns, authenticity). It now previews **only facts the sheet owns
  that the shipping row does not** — never shipping/returns copy:
  - `commerce.estimatedTotal` → `Est. total £48.50`, with the sheet's own
    qualifier `(excl. shipping)` appended whenever `shippingPayer !== 'seller'`
    so the money fact never reads as more inclusive than it is;
  - else `commerce.buyerProtectionFee > 0` → `Buyer protection fee £3.20`;
  - `commerce.protectionPolicy.available` → the server-authored label
    (fallback `Buyer Protection`);
  - `commerce.authenticity` (status ≠ `not_offered`) → server label, else
    `Authenticity verified` / `Verification in progress` /
    `Authenticity check available` (mirrors the contract's eligible semantics).
  - When none of those exist, the summary is omitted and the label carries the
    row alone — per the audit's own fallback instruction.
- A buyer now gets **total-cost context** (est. total on the costs row) and the
  **return-policy fact** (collapsed shipping summary) at a glance — no need to
  open two destinations to compare overlapping content.

`purchaseSummary` remains the section's visibility gate only (its documented
contract); it is not rendered — its shipping/returns clauses belong to the
shipping row, and rendering it would re-create the duplication finding.

## Why merging was not chosen

The alternative (one collapsed owner + a bare pointer) would have removed the
at-a-glance money/protection facts or forced them into the shipping row's
summary, re-mixing ownership. The chosen split gives each entry point a distinct
task — facts vs. full terms — while keeping every current capability reachable
(sheet destination, expanded policy detail, sustainability block, and the
screen-level `purchaseSummary` gate are all preserved).

## Files changed

- `frontend/src/components/itemdetail/ItemDetailBuyingSection.tsx` — added
  `useFormattedPrice` (called before the early return, rules-of-hooks safe);
  derives the costs-row preview from `commerce` owned facts; header comment now
  documents the ownership model; prop doc clarified (gate, not rendered copy).
- `frontend/src/__tests__/purchaseInfoOwnership.test.tsx` — NEW, 11 tests.
  The `../commerce/detail` barrel is stubbed at its module boundary
  (`vi.importActual` re-exports the real `CommerceDetailSection`,
  `CommerceDetailDisclosureRow`, `ShippingReturnsInfo`; `SustainabilityImpact`
  renders null) because the barrel transitively loads modules that are not
  exercisable in the node test env (`SyntaxError: Unexpected token 'typeof'`
  from a Flow-source dependency). Components under test remain real.
- `ShippingReturnsInfo.tsx`, `CommerceDetailDisclosureRow.tsx` — **unchanged**.
  The shared primitive already provides the wrapped label+summary, fixed
  chevron, and fact-inclusive default a11y label (`label, summary, count`);
  no extension was needed.

## Tests added / coverage

Collapsed-state truthfulness through the composed section (free + no returns /
paid + window / unknown policy); expansion still reaches full policy detail;
the costs row still fires `onShowPurchaseDetails` exactly once; the costs row
announces `Costs & buyer protection, Est. total £48.50 (excl. shipping) ·
Buyer Protection · Authenticity verified` and contains no shipping price,
method or returns wording; the `(excl. shipping)` qualifier drops when the
seller pays shipping; label-only row when the sheet owns no previewable facts;
each delivery/returns fact (`14-day returns`, `£3.49`, `No returns`) appears
exactly once in the composed tree; empty `purchaseSummary` renders nothing.

## Verification

- `npx vitest run src/__tests__/purchaseInfoOwnership.test.tsx
  src/__tests__/shippingReturnsDisclosure.test.tsx
  src/__tests__/commerceDetailRuntime.test.tsx` — **38/38 pass** (11 new).
- `npx tsc --noEmit` — zero errors in all owned/touched files. The tree-wide
  run currently reports TS2367/TS2322 errors exclusively in sibling tasks'
  in-flight files (`agentStudioResources.test.tsx`, `partialStateRecovery.test.tsx`,
  `discoveryMediaStates.test.tsx`, `sellerAuctionRowDensity.test.tsx`,
  `CoOwnOrderBook.tsx`, `AIAgentIntegrationScreen.tsx` — Tasks A/B/D/E/G);
  counts vary between runs as those agents edit. None are in Task C scope.

## Constraints honored

Frontend only; no git state changes; no new dependencies; existing tokens
(`useFormattedPrice`, theme colors via the shared primitive) used; disclosure-row
a11y contract preserved (facts join the default label, chevron stays
`accessible={false}`, ≥44pt row via `Control.hit`, opacity-only press); money
never abbreviated (exact `estimatedTotal`/`buyerProtectionFee` via
`formatFromFiat`); hardcoded EN copy matches file convention. The purchase-terms
sheet (`ItemDetailSheets.tsx`, not owned) intentionally keeps its complete-terms
rows including shipping/returns — comprehensive is correct for a terms
destination; entry-point duplication is removed.

## Concerns / handoff notes

- `purchaseSummary` (derived in `itemDetailDerived.ts`, owned by no task) still
  mixes shipping/returns wording in its gate string — harmless since it is never
  rendered, but if an orchestrator wants a perfectly clean model the derivation
  could later be reduced to a boolean gate.
- No native device validation performed (none connected); a11y-verified via
  `accessibilityLabel`/`accessibilityState` assertions only.
- Tree-wide `tsc --noEmit` is currently dirty from sibling tasks' files; the
  orchestrator should re-run it after all waves land.
