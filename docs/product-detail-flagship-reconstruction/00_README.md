# PRODUCT-DETAIL FLAGSHIP RECONSTRUCTION

## Purpose

This folder is the implementation authority for reconstructing the three ThryftVerse product-detail families:

1. Direct marketplace listing
2. Auction listing
3. Co-Own asset/instrument

The work starts from:

- repository: `K17ze/thryftverse-upgrade`
- required base branch: `feat/p0-flagship-truth-modes`
- target implementation branch: `feat/product-detail-flagship-reconstruction`

The prior truth-mode branch is a prerequisite. It closes mock-mode, endpoint, upload-finalization, offer, creator-publish, chat-composer, CI and screenshot infrastructure gaps. It does **not** visually reconstruct the product-detail pages.

## Current visual verdict

The current Co-Own detail page is truthful and feature-rich but visually reads as:

- a finance settings dashboard;
- stacked rounded cards;
- repeated prices;
- equal-width metric columns that cannot fit on a phone;
- long legal and supply blocks;
- oversized visible controls;
- a large non-actionable warning dock;
- disconnected content modules rather than one authored product story.

The direct and auction detail screens use stronger media-first shells, but they still need a coordinated reconstruction because all three listing families should feel like one flagship product system, not three unrelated departments.

## Non-negotiable constraints

- Preserve all backend truth and runtime-mode work already present on `feat/p0-flagship-truth-modes`.
- Frontend visual reconstruction only. Do not alter backend APIs, migrations, money logic, settlement, order semantics, legal meaning or provider behaviour.
- Do not create `V2`, `New`, `Redesign`, `Premium`, or duplicate replacement screens.
- Rebuild the canonical existing screens and components in place.
- Do not fabricate price history, NAV, appraisals, distributions, bids, urgency, activity, scarcity, seller trust, availability or market movement.
- Missing facts must remain absent, collapsed, or explicitly unavailable.
- Do not use champagne gold, decorative luxury gradients, glow effects, oversized glass pills or ornamental shadows.
- References define quality, hierarchy, media treatment and density. They are not templates to copy.
- Preserve direct, auction and Co-Own transaction differences.
- Use existing `useAppTheme().colors`, `Space`, `Radius`, `Type`, `Typography`, `DockConstants`, haptic and reduced-motion primitives.
- Keep 44pt minimum interactive targets, but do not make the visible chrome 44–56pt grey circles unless containment is functionally necessary.
- Remove every debug gear, diagnostics chip, API badge and development overlay from visual acceptance builds.

## Required end state

One shared, media-led detail grammar with three specialised transaction cores:

- **Direct:** price, protection, seller, offer/buy.
- **Auction:** current bid, reserve, countdown, viewer state, bid/buy-now.
- **Co-Own:** market price, order-book truth, holding, rights and trade state.

The product family must be recognisable without making the screens look like different applications.
