# Co-Own Asset Detail and Due Diligence

## Code surfaces inspected / affected

- `frontend/src/screens/AssetDetailScreen.tsx`
- `frontend/src/screens/AssetDueDiligenceScreen.tsx`
- `frontend/src/platform/server/useCoOwnQueries.ts`
- `frontend/src/components/coown/*`

## Current diagnosis


The Phase 3 reconstruction is strong: media and collectible identity lead, issuer/price/availability sit below imagery, market state is plain language, shared server cache prevents duplicate hydration, and Due Diligence is a separate deep route.

Phase 4 should not add features. It should make the object/evidence pages feel authored rather than a collection of shared metric rows.


## User psychology / product job


The user needs progressive expertise:
- novice: understand object + unit + availability;
- buyer: understand market/position;
- diligent buyer: inspect legal/provenance/risk.

Putting all expertise on one page raises perceived risk and complexity.


## Flagship target composition


Asset Detail:
1. object;
2. identity/unit price;
3. issuer/trust;
4. market/position summary;
5. story;
6. one Due Diligence entry;
7. related.

Due Diligence:
- evidence dossier, not settings page.


## Detailed implementation map


1. Due Diligence sections get document-like hierarchy:
   - provenance timeline;
   - authentication evidence gallery;
   - custody/insurance document rows;
   - valuation block with date/source/comparables;
   - ownership structure diagram;
   - rights/fees table;
   - risk statement;
   - audit history timeline.
2. Reserve `CommerceDetailMetricRow` for true metrics, not prose/evidence.
3. Evidence with images/documents must be visible as evidence, not summarized into text rows.
4. Market depth remains advanced disclosure.
5. Holder position has its own compact panel only when viewer is a holder.
6. “To be confirmed” remains truthful with reason/ETA, but visually de-emphasized.
7. Trade dock should not display when reconciliation/error makes trading unsafe; current truth logic preserved.


## Micro-detail pass


- Use serif/editorial accent only if design system supports it consistently; otherwise strong sans hierarchy.
- Document/evidence thumbnails square/portrait based on source, not generic icons.
- Avoid four consecutive rounded disclosure cards.


## Acceptance / screenshot QA


Capture:
- non-holder;
- holder;
- incomplete rights;
- complete evidence;
- stale market;
- Due Diligence long scroll.

Pass:
- first viewport still feels like a collectible;
- market mechanics do not overwhelm the object;
- Due Diligence feels trustworthy without looking bureaucratic.


## Reference crosswalk


- Coinbase-like progressive expertise principle (simple default, advanced market depth on demand).
- Auction-house catalogue / luxury editorial psychology rather than crypto dashboard.
