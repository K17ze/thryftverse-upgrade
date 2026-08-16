# Thryftverse Flagship Elevation — Master Audit & Index

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Executive verdict

The application is no longer a feature-poor prototype. The codebase already contains sophisticated commerce states, mixed-media product detail, FlashList virtualization, creator composition, drafts, upload queues, seller tooling, auctions, Co-Own, Stripe checkout, trust surfaces, accessibility hooks, reduced-motion handling, offline states, and extensive tests.

The remaining gap is **product authorship**.

The current interface often communicates: “many independently good features assembled into screens.” The flagship references communicate: “one product with one visual grammar, one interaction grammar, and one opinion about what matters right now.”

### Heuristic flagship-readiness score

This is a code + reference + screenshot audit index, not a moderated usability-study score.

| Department | Current audit index | Flagship target |
|---|---:|---:|
| Global visual system / art direction | 6.0 | 9.2+ |
| Home / discovery | 5.8 | 9.0+ |
| Search / browse | 5.5 | 9.0+ |
| Product detail / mixed media | 7.3 | 9.2+ |
| Sell / listing creation | 6.7 | 9.1+ |
| Poster camera entry | 5.8 | 9.2+ |
| Poster studio / viewer | 7.0 | 9.2+ |
| Profile / closet / settings | 6.3 | 9.0+ |
| Inbox / chat | 6.7 | 9.0+ |
| Auctions | 7.0 | 9.0+ |
| Checkout / orders / wallet | 6.8 | 9.2+ |
| Seller Hub | 5.8 | 9.0+ |
| Co-Own / portfolio | 6.5 | 9.2+ |
| Accessibility / resilience | 7.0 | 9.3+ |
| **Overall** | **~6.2** | **9.1+** |

The user’s “about 6/10” assessment is therefore reasonable. The important point is *why*: the gap is increasingly not capability. It is hierarchy, restraint, coherence, media authenticity, native behavior, state polish and visual QA.

---

## The six rules that should govern the next reconstruction

### 1. Content owns the canvas; chrome recedes

Pinterest, Instagram, Depop and eBay make images, people and products the primary visual material. Thryftverse must stop making interface containers compete with the content.

**Do:**
- full-bleed or edge-aware media where context benefits;
- flat grouping before bordered-card grouping;
- separators, whitespace and typographic hierarchy before nested surfaces;
- quiet controls until the user needs them.

**Avoid:**
- cards inside cards;
- decorative gradient/orb/sparkle treatments;
- every section becoming a rounded rectangle;
- prominent labels for internal implementation concepts.

### 2. One primary action per viewport

A screen can have many capabilities, but at a glance it should answer:
1. where am I?
2. what is important?
3. what can I do next?

The visually strongest action should change with state. Secondary actions should be text, icon, disclosure, contextual menu or sheet.

### 3. AI must feel like assistance, not authorship

A fashion marketplace should not repeatedly announce that its interface is “AI powered.” Use AI to:
- prefill;
- rank;
- suggest;
- remove repetitive work;
- detect quality problems;
- personalize;
- recover from uncertainty.

Do not make AI the visual theme. Remove routine sparkle icons, AI gradients, robot-like explanation cards and settings taxonomy built around model/provider technology.

### 4. Authenticity is a commerce primitive

For second-hand fashion, a real image is trust evidence. Imperfections, labels, stitching, packaging, receipts, serial details and multiple angles reduce uncertainty.

Image enhancement must therefore be:
- optional;
- reversible;
- clearly secondary to the original;
- prohibited from inventing garment geometry, condition or defects.

### 5. Fast paths and power paths must be separate

Do not make a user enter a studio just because a studio exists.

Examples:
- Poster quick capture: camera → caption/audience → share.
- Poster studio: gallery/camera → composition → overlays → review → publish.
- Sell quick listing: media → suggested details → price → delivery → publish.
- Advanced listing: authentication, auction, Co-Own, richer attributes and seller tools behind disclosure.

### 6. Motion communicates state; it does not prove polish

Every animation needs one of these jobs:
- maintain spatial continuity;
- acknowledge touch;
- explain state change;
- direct attention to a consequential update;
- preserve object identity.

If it only “looks premium,” remove it.

---

## P0 — changes that most strongly affect the “AI-made / prototype” impression

### P0.1 Remove production demo/editorial leakage from Global Search
Target: `frontend/src/screens/GlobalSearchScreen.tsx`

Remove or server-gate:
- `TOP_SEARCH_CARDS`;
- `HERO_ITEMS` with literal H&M / Nike sample objects;
- `FEATURED_BOARDS` containing “Pinterest India” / “Pinterest Man”;
- `EDITORIAL_SECTIONS` with empty media URIs;
- placeholder editorial modules that render without real content.

Replace with a typed remote editorial contract. If the server has no editorial content, show real categories/recent searches/trending searches based on actual data. Never invent a “content-rich” surface.

### P0.2 Unify Poster media acquisition

`CreateCameraScreen` currently has a simplified gallery entry while `CreatorAssetPicker` contains a much richer photos + videos + ordered multi-select experience.

Create one canonical `MediaAcquisitionController` / `MediaAcquireSheet` used by:
- Poster;
- Look;
- Sell;
- message attachments where appropriate.

The first Poster gallery action must support:
- photos and videos;
- ordered multi-select;
- visible count;
- recents/albums;
- permission states;
- duration/type markers;
- selection preview;
- remove/reorder before editor;
- upload/preflight state;
- recovery if an asset disappears.

### P0.3 Split Poster Quick Capture from Studio

Quick capture should not expose “Start Blank”, Gallery, Templates, Drafts, hints, mode chips and overflow as competing focal points.

**Quick capture:** camera-first and minimal.  
**Studio:** explicitly invoked for media import/templates/layers.

### P0.4 Strip visible AI tropes

Search code and screenshots for:
- `sparkles`;
- “AI” / “Agent” labels;
- magic gradient cards;
- automatic breathing/pulsing empty-state decoration;
- copy explaining intelligence rather than the user benefit.

Rename “AI autofill” to “Suggested details” / “Fill from photos” where user-facing. Keep disclosure in help/privacy when needed.

### P0.5 Collapse the token hierarchy

`designTokens.ts` describes a simplified typography system but still exposes overlapping modern + legacy variants. Freeze a smaller production contract, migrate screens, then delete compatibility variants.

### P0.6 Establish screenshot-driven release gates

No department should be considered “done” because tests pass. Capture controlled screenshots of all flagship routes on a standard device matrix and diff them against approved baselines.

---

## Department sequence

1. Global visual system
2. Home / discovery / search
3. Product detail
4. Sell
5. Poster / media
6. Profile / closet / settings
7. Inbox / chat
8. Auctions
9. Checkout / wallet / orders
10. Seller Hub / inventory
11. Co-Own
12. Auth / onboarding / safety / accessibility
13. Architecture / motion / performance
14. Visual QA and release gates

Detailed plans are in the corresponding files in this folder.

---

## Flagship “definition of done”

A department is **not** done until:

- [ ] Primary action and hierarchy are obvious in a two-second glance.
- [ ] No demo, mock, empty-URI or competitor-branded content can reach production.
- [ ] No decorative AI/sparkle treatment is visible without a product reason.
- [ ] Light and dark themes both look intentionally art-directed.
- [ ] Compact iPhone, regular iPhone, Android and web are verified.
- [ ] 200% text / Dynamic Type does not truncate consequential controls.
- [ ] Reduced Motion and reduced-transparency behavior are verified.
- [ ] Empty/loading/error/offline/permission/partial states use the same visual grammar as success state.
- [ ] Media failure never collapses layout or leaves unexplained blank regions.
- [ ] Scroll/masonry/list performance is profiled in release builds.
- [ ] Every significant interaction has touch, keyboard and accessibility semantics.
- [ ] No screen depends on animation for comprehension.
- [ ] Screenshot comparison passes the department’s acceptance matrix.
- [ ] Product metrics are defined before release.

---

## Read next

Start with:
- `01_VISUAL_SYSTEM_ANTI_AI_PRODUCTION_ART_DIRECTION.md`
- `02_HOME_DISCOVERY_SEARCH_SAVED.md`
- `05_POSTER_CAMERA_MEDIA_PICKER_STUDIO_VIEWER.md`
- `17_IMPLEMENTATION_BACKLOG_MASTER_CHECKLIST.md`
