# Global Visual System, Anti-AI Art Direction & Production Grammar

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Current diagnosis

The app has tokens, themes, animation helpers and multiple “flagship” primitives. The problem is **parallel design systems still coexist**.

`frontend/src/theme/designTokens.ts` says typography was simplified, yet `Type` and legacy `TypeStyles` still expose overlapping semantic roles. This creates a predictable failure mode: each screen looks internally reasonable while the app as a whole lacks one editorial rhythm.

The same pattern exists with:
- multiple card radii;
- many elevation levels;
- local dimensions;
- screen-specific hero geometries;
- custom headers beside flagship headers;
- multiple skeleton patterns;
- several discovery grids / rails;
- local button semantics.

## Target product character

Thryftverse should feel:

**Editorial + tactile + trustworthy + fashion-native + commerce-precise.**

Not:
- crypto dashboard;
- enterprise SaaS;
- AI demo;
- glassmorphism showcase;
- generic component-library example;
- “luxury” through gold/gradient ornament.

Luxury should come from:
- composition;
- restraint;
- excellent photography;
- exact spacing;
- calm typography;
- considered motion;
- trustworthy transaction detail.

---

## Global layout grammar

### Screen canvas
Use three layout families only.

**A. Media-led**
- Home, product detail, Poster, Looks, saved inspiration.
- Media can meet edges.
- Chrome overlays only when necessary.
- Text follows media rather than enclosing it in a card.

**B. Dense utility list**
- Settings, inbox, addresses, payment methods, notifications.
- Mostly flat rows.
- Section headings + whitespace.
- Cards only for genuinely grouped transactional units.

**C. Transaction / decision**
- Checkout, bid, offer, Co-Own order, payout.
- Strong summary, transparent value, one primary action.
- Sticky action dock.
- No decorative content.

Every screen must declare one family in a header comment or screen metadata so future work does not arbitrarily mix patterns.

---

## Typography reconstruction

### Proposed semantic set

| Token | Use |
|---|---|
| `display` | rare campaign/onboarding statement |
| `screenTitle` | screen identity |
| `sectionTitle` | major section |
| `itemTitle` | product/person/conversation title |
| `body` | content |
| `bodyStrong` | emphasized body |
| `meta` | timestamps/attributes |
| `label` | controls/field labels |
| `priceHero` | PDP/checkout total |
| `priceList` | cards/listings |
| `numericMeta` | bids, quantities, P&L |

Rules:
- eliminate “captionElevated/metaElevated/price/bodyLarge” ambiguity after migration;
- one weight delta is normally enough to express hierarchy;
- never use uppercase merely to make a section “premium”;
- prices and financial quantities use tabular figures;
- line-height should remain readable when text scaling increases.

### Migration
1. Create `typography.v2.ts`.
2. Map old roles to new roles.
3. Add lint/codemod reporting forbidden old tokens.
4. Migrate flagship routes first.
5. Delete compatibility variants only after screenshot parity.

---

## Radius / surface discipline

The app should not look like every idea was emitted as a card.

Use:
- 0–4: image/editorial edge;
- 8: compact control or media thumbnail;
- 12: sheet/dialog content;
- 16: rare standalone panel;
- full: pill/round avatar/control.

Avoid 24px rounded containers except deliberate navigation/floating chrome.

### Card test

Before creating a card, ask:
1. Is this object independently actionable?
2. Does it need a boundary to preserve meaning when reordered?
3. Does it carry transactional state?
4. Is the boundary needed for contrast/accessibility?

If “no” to all, use whitespace/separator.

---

## Color

### Direction
- Neutral canvas.
- Media supplies most visual color.
- Brand color is a control/identity signal, not a section background generator.
- Success/warning/danger are semantic only.
- Avoid translucent brand-color washes on routine rows.
- Avoid gold as a proxy for luxury.

### Dark mode
Do not simply tint light-mode cards. Dark mode needs:
- lower number of borders;
- stronger spatial grouping;
- high-quality media;
- controlled text contrast;
- clear surface hierarchy without every container becoming grey.

---

## Liquid Glass / modern iOS

Apple’s current system positions Liquid Glass as navigation/control material over content. Use platform materials in:
- tab bars;
- compact floating action clusters;
- contextual navigation;
- sheets where the platform supplies the effect.

Do **not** apply glass to:
- product information cards;
- seller trust cards;
- settings rows;
- every section background.

On Android/web, preserve semantic hierarchy rather than imitating Apple glass pixel-for-pixel.

---

## Anti-AI visual rules

Remove by default:
- sparkle icon beside automatic behavior;
- purple/blue “intelligence” gradient;
- animated orb;
- breathing icon;
- animated shimmer after content loaded;
- generically enthusiastic helper prose;
- cards titled “AI insight”;
- “Powered by…” labels in core flow;
- fake smart suggestions with no confidence/provenance.

Prefer:
- “Suggested title”
- “Suggested price”
- “From your photos”
- “Check these details”
- “Looks good”
- “Could not identify brand”

This makes assistance feel native and honest.

---

## Motion contract

Recommended bands:
- touch acknowledgement: 90–150ms;
- micro state transition: 160–240ms;
- sheet/route continuity: 260–420ms;
- celebratory/success motion: rare, under ~600ms.

Springs should be semantic presets:
- `tap`
- `settle`
- `sheet`
- `reorder`
- `success`

Do not create a bespoke spring per screen.

### Delete / reduce
- perpetual empty-state breathing;
- gratuitous 3D rotations;
- multiple concurrent entrance animations in long dashboards;
- delayed stagger across every card;
- motion on filters that delays reading.

---

## Icons

- Use platform-familiar metaphors.
- Do not mix filled/outline arbitrarily.
- Filled state should normally mean selected/active/saved.
- Never use icons to compensate for unclear information architecture.
- Avoid sparkle/wand icon as generic “smart.”

---

## Global acceptance criteria

- [ ] No more than two container radii dominate any screen.
- [ ] No screen shows more than one high-emphasis filled CTA in the first viewport.
- [ ] All flagship screens use the new semantic typography set.
- [ ] Routine list screens are mostly flat, not card grids.
- [ ] Media-led screens allocate more visual area to content than chrome.
- [ ] Dark mode is separately reviewed, not mechanically accepted.
- [ ] Decorative animation inventory is reduced.
- [ ] All automatic suggestions are phrased around benefit, not implementation technology.
