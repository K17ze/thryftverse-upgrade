# 02 — SHARED PRODUCT-DETAIL ARCHITECTURE

## Product principle

All three listing families must share one visual grammar but not one transaction module.

## Shared page anatomy

### Zone A — Media stage

- Media remains the first and dominant story.
- Phone target height:
  - compact devices: 48–52% of viewport;
  - standard devices: 54–58%;
  - never exceed the point where identity and one transaction fact cannot enter the second viewport.
- Use true image ratio/focal behaviour when metadata exists.
- Preserve paging, zoom, video and fullscreen.
- Add a quiet media count or page dots.
- Do not show a thumbnail strip on phone unless there are at least four media items and the strip can avoid obscuring the image.
- Maximum visible utility controls over media: three.
- Preferred hierarchy:
  - left: Back;
  - right: Share and one saved-state action;
  - overflow sheet contains lower-frequency actions.
- Family/status chip may occupy one small bottom-left overlay.
- No debug gear or diagnostics overlay.

### Zone B — Identity seam

One compact identity composition immediately after the hero.

Shared fields:

- family/brand/category line;
- title;
- primary commerce value;
- one secondary truth line;
- seller/issuer identity;
- compact social/save/watch state only when meaningful.

Rules:

- title: normally 26–32pt, maximum two lines;
- do not repeat the title in another large module;
- no large independent Watch card;
- no uppercase eyebrow unless it meaningfully distinguishes family or brand;
- use no more than one eyebrow in the identity block;
- seller/issuer may appear as a compact inline confidence row when enough data exists;
- missing seller data must reduce the module, not create a large generic card.

### Zone C — Family transaction module

This is the only strongly contained module near the top.

- Direct: price + protection + availability.
- Auction: current bid + countdown + reserve + viewer state.
- Co-Own: last trade + top of book + market mode + trade eligibility.

Use one clear surface, not several adjacent cards.

### Zone D — Viewer context

Only render when personal.

Examples:

- Direct: your listing / offer sent / item saved.
- Auction: leading / outbid / won / seller.
- Co-Own: units owned / ownership / unsettled or reserved state.

Viewer information should appear before generic supply or legal data.

### Zone E — Evidence and confidence

Use flat sections and disclosure rows for:

- description;
- category evidence;
- authenticity;
- seller or issuer confidence;
- shipping/returns;
- asset dossier;
- rights and risks.

No separate rounded card for every subsection.

### Zone F — Discovery

- seen in looks;
- more from seller;
- related auctions;
- similar assets;
- continue exploring.

Discovery should begin only after the core product decision is understandable.

### Zone G — Sticky action dock

The dock contains:

- the current actionable value or state;
- one primary action;
- at most one secondary action.

Blocked state must include a valid next step.

## Shared primitives to build or reconstruct

Create shared primitives only where they reduce visual drift:

- `CommerceDetailHeader`
- `CommerceDetailIdentity`
- `CommerceDetailTransactionSurface`
- `CommerceDetailMetricRow`
- `CommerceDetailDisclosureRow`
- `CommerceDetailSection`
- `CommerceDetailSellerRow`
- `CommerceDetailStateDock`
- `CommerceDetailUnavailableInline`

Preferred location:

`frontend/src/components/commerce/detail/`

Do not create duplicate screens. Existing screens must consume the shared primitives.

## Shape system

- Page background should carry most of the layout.
- Use hairline dividers and whitespace for ordinary grouping.
- Strong card radius only for:
  - transaction surface;
  - critical state;
  - a true contained interactive module.
- Avoid nested cards.
- Avoid full-width grey panels for plain text.
- Avoid pill proliferation.
- Active segmented controls use an underline or subtle fill, not a grid of outlined mini-cards.

## Typography

- Product title is not a display poster.
- Numeric hierarchy:
  - primary transaction value;
  - secondary market value;
  - metadata.
- Use tabular numerals for prices, bids, units, percentages and countdowns.
- Missing values use muted copy, not a display-size em dash.
- Do not use `+0.0%` when change is unavailable.
- One label style per page, not a mix of uppercase eyebrows, subtitle labels and pill labels.

## Motion

- Media/header transition: subtle opacity/translate only.
- Section entry animation must not cascade through the entire long page.
- Animate primary state changes, not every static section.
- Respect reduced motion.
- Press scale should be slight and consistent.
- No pulsing market indicators unless representing a real live state and permitted by reduced-motion rules.

## Theme

- Use `useAppTheme().colors`.
- Migrate touched static `Colors` usage where practical.
- Preserve a neutral luxury palette:
  - ink;
  - white;
  - stone;
  - muted greys;
  - deep navy/green/red only for factual market state.
- No champagne gold.
