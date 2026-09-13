# Task 17 — Item Detail: Media Dominant + Condition Evidence

## Status: DONE

## Case study — composition before the change

Reading order before this pass:

```
media hero (0.54/0.58) → offline banner → identity (eyebrow/title/price/condition chip)
→ trust dossier (seller row + ≤3 facts) → "Item details" (description + CategoryEvidence + posted)
→ SellerInfoCard + more-from-seller rail → "Buying this item" (collapsed shipping/returns)
→ price history → questions → discovery rails → sticky dock
```

Findings against Chapter 12 (product detail & purchase decision):

- **Media** — dominant but below its own ceiling. The stage default is 0.62; the screen asked for 0.54/0.58, undercutting the primary evidence. Thumbnail strip already overlays the hero.
- **Condition** — a grade chip ("● Good") in the attribute row; the plain-English definition required a tap → bottom sheet. Chapter 12: "make condition specific… should have evidence, preferably corresponding media." The definition and the media jump were hidden.
- **Seller evidence** — already well-placed: display-only dossier in the first viewport, full SellerInfoCard lower. Not dominant, accessible. Unchanged.
- **Delivery** — `estimatedDeliveryStart/End` existed in the commerce context but only surfaced inside the collapsed `ShippingReturnsInfo` body deep below the fold. Not adjacent to the buying decision.
- **Purchase** — sticky dock with price + tier-adaptive CTA. Sound; shipping hint existed but never carried the delivery estimate, and the same hint expression was duplicated across all four tier branches.
- **States** — loading skeleton, error canvas, not-found canvas, offline banner, sold/unavailable dock + SOLD media overlay, per-image failure with retry all existed. Missing: offline-aware error copy, and the stale-data partial state (failed refetch with cached item rendered — silently presented stale price/availability as current).

## Changes

### `frontend/src/screens/ItemDetailScreen.tsx`

1. **Media dominance** — hero `heightFraction` raised `0.54/0.58 → 0.56/0.60`; the loading skeleton `heroFraction` updated to match so loading→populated stays geometry-stable.
2. **Condition evidence inline** — new flat block at the top of the "Item details" section (before the description): condition dot + grade, the plain-English definition (always visible, no tap required), and the "View condition photos" jump to the fullscreen viewer's last shot when the listing has >1 photo. No card — canvas + spacing only. Reuses existing `conditionDot` / `conditionEvidenceJump` styles.
3. **`conditionMeta` definitions de-prefixed** — "Good: Light wear…" → "Light wear…" since the grade name now renders beside the definition both inline and in the condition sheet (which still shows the grade badge). The chip → sheet interaction is preserved.
4. **Stale-data partial state** — when the listing query errors while a previously resolved item is on screen, a `CommerceDetailUnavailableInline` notice ("Couldn't refresh listing — showing the last loaded details" + Retry) renders between the offline banner and the identity block. Body is offline-aware.
5. **Offline-aware error canvas** — when `data.isError && !item` and the device is offline, the error canvas says "You're offline / Connect to the internet to load this listing." instead of the generic "Something went wrong".
6. New styles: `conditionEvidence`, `conditionEvidenceHeader`, `conditionEvidenceName`, `conditionEvidenceDefinition`, `staleNoticeWrap`.

### `frontend/src/components/commerce/detail/CommerceActionDock.tsx`

7. **Delivery estimate adjacent to purchase** — `deliveryWindow` computed once from `commerce.estimatedDeliveryStart/End` via `formatShortDate`; the four duplicated `shippingHint` expressions collapsed into one composed hint: `"Free shipping · Est. 12–14 Nov"`, `"Shipping calculated at checkout · Est. 12–14 Nov"`, or `"Est. 12–14 Nov"` alone. Applies to all four commerce tiers uniformly.

### `frontend/src/components/commerce/detail/CommerceTrustDossier.tsx`

8. **Delivery in first-viewport trust facts** — the dispatch/shipping trust row now appends the estimated window (`"Dispatches in 1 day · Est. 12–14 Nov"` / `"Free DPD · Est. 12–14 Nov"`). When no dispatch label or shipping method exists but the window does, a delivery-only row is emitted. Row cap of 3 is unchanged; nothing fabricated — all values from the server commerce context.

## New composition

```
media hero (0.56/0.60 + thumbnail strip)
→ offline banner (when offline)
→ stale-data notice (when refetch failed with cached item)
→ identity: eyebrow · title · price · [condition chip] size · category · social proof · size guide
→ trust dossier: seller row · rating / verification / response / dispatch+delivery (≤3)
→ Item details: condition evidence (grade + definition + photo jump) · description · spec grid · posted
→ SellerInfoCard + more-from-seller rail
→ Buying this item (costs/delivery/protection disclosure + shipping & returns)
→ price history → questions → discovery rails
→ sticky dock: price · shipping+delivery hint · Buy now / Make offer (or tier state)
```

## How condition / seller / delivery evidence is displayed

- **Condition**: grade chip in the first viewport (identity attribute row, tappable → sheet) **plus** inline evidence block in "Item details": `● Good` + "Light wear consistent with gentle use; no major flaws." + "View condition photos →" opening the fullscreen viewer on the last (flaw/detail) photo. CategoryEvidence still carries the structured `Condition — Good` row.
- **Seller**: display-only dossier (avatar, name, verified badge, stats line) + ≤3 hairline-separated trust facts in the first viewport; full SellerInfoCard (Follow / Message / View shop) below the fold — accessible, not dominant.
- **Delivery**: `Est. {start}–{end}` now appears twice where it matters — inside the trust-facts delivery row above the fold, and inside the dock's shipping hint beside the Buy button.

## tsc result

```
node ./node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
→ 0 errors (no matches for ItemDetail|CommerceActionDock|CommerceTrustDossier; total error count 0)
```

## Constraints honoured

- No `components/coown/` files touched.
- No new features — all rendered values already existed in the commerce context / listing model; only placement and truthful state surfacing changed.
- All navigation, analytics (`ProductAnalytics.mediaZoom`, `checkoutStart`, `offerStart`), and haptics preserved verbatim.
- Phase 2 building blocks (`CommerceMediaHero`, `CommerceIdentityBlock`, `CommerceTrustDossier`, `CommerceActionDock`) used as-is; edits were confined to two of them plus the orchestrator.
- Flat canvas retained — no new cards, badges, or pills added.

## Concerns

1. **Definition duplication (minor)** — the condition definition now renders inline and inside the condition sheet. This is deliberate (summary affordance vs. focused detail); the sheet also carries the photo jump.
2. **Media fraction is a nudge, not a floor** — `heroHeight` still defers to intrinsic media aspect (`screenWidth * height/width`, capped at 1.35×width) when the API supplies dimensions, so the fraction is a fallback bound rather than a guarantee.
3. **Screen is still ~1,900 LOC** — this task targeted composition and state truthfulness, not further extraction; the remaining inline sections (sheets, rails, gestures) are candidates for a future pass.
4. **Delivery window format** — `formatShortDate` returns '' for unparseable input, in which case the estimate silently omits; consistent with the existing `ShippingReturnsInfo` behaviour.
5. **`familyStateAccent` remains hardcoded `null`** — pre-existing Phase 2 concern, unchanged per scope.
