# Execution Roadmap for the Next Flagship Push

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Phase 0 — Freeze & baseline

- inventory flagship routes;
- capture current screenshots;
- lock branch;
- record p95 interaction/performance;
- mark demo content;
- create `ui-v2` feature flag where needed.

**Exit:** everyone can compare before/after on the same device states.

---

## Phase 1 — Remove prototype signatures

1. GlobalSearch demo/editorial cleanup.
2. AI/sparkle/gradient visual audit.
3. Settings AI taxonomy relocation.
4. Design token v2.
5. Empty/error state cleanup.
6. card-density pass.

**Outcome:** app immediately stops looking generated/template-driven.

---

## Phase 2 — Poster reconstruction

1. Quick Capture IA.
2. canonical media acquire sheet.
3. image/video multi-select.
4. album/permission treatment.
5. Studio tool prioritization.
6. viewer motion restraint.
7. publish recovery QA.

**Outcome:** media creation feels competitive with social references.

---

## Phase 3 — Discovery + product

1. backend-only editorial units.
2. Home unit contract.
3. tile cleanup.
4. search hierarchy.
5. PDP section hierarchy.
6. custom product-video controls.

---

## Phase 4 — Sell + seller

1. progressive listing flow.
2. suggestion treatment.
3. seller-proceeds transparency.
4. task-first Seller Hub.
5. inventory density.
6. seller inbox integration.

---

## Phase 5 — Identity + communication

1. profile hierarchy.
2. collection mosaics.
3. settings native density.
4. inbox segment reduction.
5. marketplace context in chat.

---

## Phase 6 — Transaction + live commerce

1. checkout flattening.
2. payment state.
3. auction presentation state.
4. Co-Own financial hierarchy.
5. receipt/confirmation systems.

---

## Phase 7 — Architecture / performance

This runs in parallel, but consolidate after the main UI contract is proven:
- split giant screens;
- media contract;
- list policy;
- gesture matrix;
- performance budget;
- web parity.

---

# Suggested work packages

Each package should be one reviewable branch/PR with:
- screenshots;
- code changes;
- tests;
- acceptance checklist;
- no unrelated restyling.

### WP01 — Anti-prototype closure
GlobalSearch + fallback art + AI terminology.

### WP02 — UI grammar v2
Typography/radius/surface/rows/buttons.

### WP03 — Poster acquisition
Camera + media picker.

### WP04 — Poster studio/viewer
Tooling + viewer.

### WP05 — Discovery/search
Home + GlobalSearch.

### WP06 — PDP
Media + hierarchy.

### WP07 — Sell
Authoring.

### WP08 — Seller
Hub/inventory.

### WP09 — Profile/settings/saved
Identity.

### WP10 — Inbox/chat
Communication.

### WP11 — Checkout/orders
Transaction.

### WP12 — Auction
Live commerce.

### WP13 — Co-Own
Financial UX.

### WP14 — Visual gate
Golden screenshots + device QA.

---

# Definition of a successful next push

Do not target “9/10 everywhere” in one mega-commit.

Target this sequence:
- eliminate obvious 4–6/10 artifacts;
- make core creation/discovery/PDP paths consistently 8+;
- lock primitives;
- propagate across long-tail screens;
- then perform optical/motion micro-polish toward 9+.

This avoids another cycle where dozens of screens receive small styling changes but the product still feels uniformly “almost there.”
