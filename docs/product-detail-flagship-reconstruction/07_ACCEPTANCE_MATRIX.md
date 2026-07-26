# 07 — ACCEPTANCE MATRIX

## Global visual gates

| Requirement | Pass condition |
|---|---|
| Hero actions | Maximum three visible controls |
| Hit targets | Minimum 44pt without oversized visible containers |
| Debug chrome | None |
| Title | Maximum two lines; no clipping |
| First decision context | Visible by second viewport |
| Cards | No nested cards; ordinary sections use whitespace/dividers |
| Theme | Touched surfaces use app theme correctly |
| Missing facts | Absent or explicitly unavailable; never fabricated |
| Dock | Does not cover final content |
| Large text | No overlap at supported max multiplier |
| Compact width | No horizontal collision at 320/360 |
| Dark mode | No static-light surfaces or illegible borders |
| Motion | Reduced-motion path works |
| Actions | Every blocked state gives a valid next step or no false affordance |

## Co-Own gates

- [ ] Phone does not use three equal metric columns.
- [ ] Bid and Ask never overlap.
- [ ] Last trade appears once as the dominant market value.
- [ ] `+0.0%` is not shown when executions are missing or request failed.
- [ ] Empty chart hides range/mode/volume controls.
- [ ] Viewer position appears before full supply structure.
- [ ] Supply structure is collapsed by default.
- [ ] Rights incomplete dock opens rights review.
- [ ] Risk summary is compact.
- [ ] Full 13-row rights sheet remains available.
- [ ] Buyout/exit wording matches actual capability.
- [ ] Issuer module collapses gracefully when data is missing.
- [ ] Market stale state is factual and visible.
- [ ] Holder and non-holder layouts differ meaningfully.

## Auction gates

- [ ] No simultaneous Share + Save + Like + Watch hero cluster.
- [ ] Current bid and countdown dominate one transaction surface.
- [ ] Viewer state does not create a duplicate large module.
- [ ] Reserve status is factual.
- [ ] Server-clock resync remains functional.
- [ ] Bid/Buy Now preflight remains unchanged.
- [ ] Terminal states show one clear result and next action.
- [ ] Bid history and rules use progressive disclosure.
- [ ] Sticky dock remains state-correct.

## Direct listing gates

- [ ] Price, title and protection form one coherent identity block.
- [ ] Seller confidence appears before deep content.
- [ ] Shipping/protection/returns are grouped.
- [ ] Attributes are not a row of oversized pills.
- [ ] Unsupported price history is absent.
- [ ] Similar content is not repeated across overlapping rails.
- [ ] Buy/offer/manage/sold docks remain correct.
- [ ] Save, wishlist and collection semantics remain distinct but not equally visually dominant.

## Required test commands

```bash
npm --prefix frontend run typecheck
npm --prefix frontend run check:animated-scroll
npm --prefix frontend run lint:design-tokens
npm --prefix frontend run test
npm --prefix frontend run check:maestro-flows
npm --prefix frontend run doctor
```

The agent must not report completion with failing commands unless the failure is pre-existing, independently reproduced on the base branch, and documented with exact output.
