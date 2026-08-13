# Home, Discovery, Search & Saved/Closet Elevation

> **Audit date:** 2026-08-12  
> **Repository:** `K17ze/thryftverse-upgrade`  
> **Audited branch:** `feat/product-detail-contract-media-device-closure`  
> **Audited HEAD:** `df5e9a71f3dfb60407666a9323c66c758aef1b0f`  
> **Purpose:** Next-stage visual/UI/UX production elevation. This document is implementation guidance, not a claim that reference apps should be copied 1:1.

## Code evidence

Primary targets:
- `frontend/src/screens/HomeScreen.tsx`
- `frontend/src/screens/GlobalSearchScreen.tsx`
- `frontend/src/components/discover/*`
- `frontend/src/components/ProductCardV2.tsx`
- saved/closet collection surfaces

### Critical production issue: GlobalSearch demo/editorial seed data

The live screen contains hardcoded editorial structures including:
- `TOP_SEARCH_CARDS`;
- `HERO_ITEMS`;
- `FEATURED_BOARDS`;
- `EDITORIAL_SECTIONS`;
- literal sample brands / labels;
- empty media URIs.

This is a **P0 release-quality blocker**, because the surface can look visually full in code while rendering as synthetic / placeholder / competitor-inspired content.

## Psychology

Discovery products work because people believe there is a coherent world behind the screen.

Pinterest’s strongest pattern is not “masonry.” It is:
- high content-to-chrome ratio;
- visually legible objects;
- fast scanning;
- personalized continuity;
- low-friction save;
- search as an intent amplifier.

Marketplace discovery additionally needs:
- price;
- condition/brand clues;
- seller/trust only when useful;
- scarcity or auction status without badge overload.

When fake editorial blocks, empty images or generic trend cards appear, users lose the sense that the feed is alive.

---

## Home target

### First viewport
1. Quiet top navigation / search affordance.
2. Small creator/story/Poster rail only if it has real content.
3. Immediate product/content grid.
4. No introductory dashboard cards.

### Feed composition

Use a typed feed-unit contract:
```ts
type DiscoveryUnit =
  | { type: 'listing'; ... }
  | { type: 'look'; ... }
  | { type: 'poster'; ... }
  | { type: 'editorial'; source: 'server'; ... }
  | { type: 'recommendation_break'; ... };
```

Server decides eligible units. Client never invents editorial media.

### Product tiles

A Pinterest-like grid is useful, but marketplace tiles need predictable information.

Default:
- media;
- title/brand (one restrained line);
- price;
- optional state marker (auction/co-own/sold) — one;
- save action mostly on interaction/hover/long press.

Do not stack:
price + old price + discount + likes + seller + badge + shipping + AI reason + availability all below every image.

### Video in feed
- poster frame before playback;
- autoplay only when sufficiently visible;
- muted;
- pause when offscreen/backgrounded;
- no native video-control chrome in tiny feed cards;
- respect reduced motion/data saver;
- remember playback position only if product semantics need it.

---

## Search target

### Search idle state
Use real:
- recent searches;
- saved searches;
- categories;
- recently viewed;
- server-ranked trends.

No fake “Top searches” art cards unless the backend sends them.

### Search active
- search field stays visually dominant;
- autocomplete is textual and fast;
- show category/brand/user/listing scopes only when query evidence warrants;
- chips should narrow intent, not decorate.

### Results
- immediate result count or useful context;
- a thin sort/filter row;
- same product tile grammar as home;
- preserve scroll position when entering/back;
- show applied filters as removable tokens;
- no-result state gives broaden/remove-filter suggestions based on current filters.

### Visual search
Pinterest is the reference for intent flow:
- image first;
- crop/region focus;
- recognized object/keywords;
- results underneath;
- easy refinement.

Avoid making visual search look like a separate “AI feature.” It is simply another search input.

---

## Saved / Closet

Reference direction from Instagram Saved + Pinterest boards:
- collection covers are media mosaics, not icon cards;
- two-column grid is acceptable on phone;
- title and item count are enough;
- recently saved can be a direct entry;
- create collection is quiet but discoverable;
- selection/reorder happens in a focused management state.

If Closet also carries outfits/wardrobe semantics, separate:
- `Saved` = intent/bookmarking;
- `Closet` = owned/wardrobe if that model genuinely exists.

Do not make one tab carry every saved/wishlist/collection/wardrobe concept.

---

## Exact P0 implementation

### `GlobalSearchScreen.tsx`
- [ ] Delete local editorial seed constants from production path.
- [ ] Create `useDiscoveryEditorial()` / server response.
- [ ] Render `null` for unavailable editorial modules; do not render empty URI shells.
- [ ] Add schema validation and telemetry for invalid media.
- [ ] Add dev-only fixtures outside production bundle or behind explicit fixture flag.

### `HomeScreen.tsx`
- [ ] Remove decorative fallback Poster art using generic sparkle/orb treatment.
- [ ] Replace with quiet media-unavailable state or text-only Poster preview.
- [ ] Choose one masonry implementation path; avoid parallel grid components unless use cases truly differ.
- [ ] Audit every feed badge; cap default badges to one status concept per tile.
- [ ] Profile FlashList in release mode.

## P1
- [ ] Add content-unit ranking contract.
- [ ] Standardize media focal-point behavior.
- [ ] Shared transition only for image→detail where reliable; never block navigation.
- [ ] Long-press quick actions use native-feeling menu/sheet.
- [ ] Skeleton geometry must match final media aspect ratios.

## P2
- [ ] Contextual editorial modules personalized from real data.
- [ ] Search query correction / intent expansion.
- [ ] “Because you saved…” explanations behind overflow/help, not on every card.

---

## Acceptance tests

- [ ] Production search contains no hardcoded competitor names.
- [ ] Production search contains no empty editorial image URI.
- [ ] Home can render entirely from backend data with no fake content.
- [ ] First content appears without layout jump.
- [ ] Back navigation restores feed/search scroll.
- [ ] 1000+ item feed is profiled in release mode.
- [ ] Image errors preserve card geometry.
- [ ] Video stops offscreen/backgrounded.
- [ ] Saved collection covers remain stable as content loads.
