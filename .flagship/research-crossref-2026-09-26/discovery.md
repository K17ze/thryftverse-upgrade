# Cross-Reference Audit — Discovery Surfaces

**Department:** discovery — home feed, explore, pulse, story rail, masonry grid, feed cards
**Date:** 2026-09-26 · **Code:** `web/src` · **Mobile reference:** `frontend/src`
**Verdict:** The web discovery stack is compositionally strong — a genuinely authored feed (interleaved module bands, balanced masonry with real aspect ratios, complete tile anatomy, honest end markers) — but it is a **static** discovery product wearing dynamic labels. Mobile already ships the machinery competitors consider table stakes in 2025–26 (server-ranked `/recommendations` with reason codes, impression confirmation, "Why am I seeing this?", not-interested writes, dynamically-derived signal chips, pull-to-refresh, "N new drops" pill, viewability autoplay, long-press feed controls). Web has none of that plumbing, and Explore's "Made for you" heading labels an unpersonalized feed — a truthfulness bug, not just a gap.

---

## 1. Reference Grammar (live research distillation)

### Pinterest — modular feed, visual-search-everywhere, honest personalization
- **Home feed modules (Mar 2025).** Pinterest now interleaves two module types into the masonry: *carousel modules* (horizontal Pin shelves) and *landing-page modules* (topic pivots). Critically, fixed-slot insertion was abandoned for a **"skip slot" model — a module only replaces a Pin when its predicted engagement beats the Pin it would displace**, plus module *fatiguing* (modules are withdrawn for users who don't engage). (Pinterest Engineering, "Module Relevance on Homefeed"; Social Media Today, 24 Mar 2025)
- **Personalization depth.** TransActV2 ranks against **16k+ lifelong user actions** (160× the previous sequence window), with Next-Action loss — the feed is a lifelong-taste mirror, not a session heuristic. (Pinterest Engineering, Jun 2025)
- **Long-press → visual search.** Since May 2025, long-pressing any home-feed Pin opens visual search; VLMs generate the words for *why* you like a Pin (aesthetic/palette/fit), and a refinement bar re-slices results by style/occasion. (Pinterest Newsroom; TechCrunch, 5 May 2025)
- **"Boards made for you" (Oct 2025).** AI+editorial personalized boards injected **into the home feed and inbox**; "Styled for you" collages assemble outfits from saved Pins; board tabs "Make It Yours" (shoppable picks from your saves) and "More Ideas". (TechCrunch, 27 Oct 2025)
- **User control grammar.** Per-Pin three-dot → "Not interested" / "See less like this"; Settings → "Refine your recommendations" incl. per-category **AI-content toggles**; AI-generated Pins are labeled. Training the feed is a documented, repeated loop. (Pinterest help via genviral.io 2026 update; heise.de)
- **Card anatomy.** The Pin is media — no title text in the feed; hover reveals Save/link-out; ~236px columns, 2-col on phone, variable heights, tight 6–8px gutters.

### Instagram — feed control surfaces, reels-first, taller media
- **Reels-first navigation test (Sep 2025, India/Korea).** Reels becomes the default landing tab; the Following tab gains three feed options — **"All", "Friends", "Latest"** — a graduated intimacy model for the followed-graph. (TechCrunch, 29 Sep 2025)
- **Explore (Jun 2025 refresh).** Top nav bar to IGTV/Shop/Reels; **personalized topic channels** under it; **Stories recommendations blended into the masonry grid** itself; category tiles open horizontally-scrollable topical streams. (Digilogy, 13 Jun 2025; Meta Transparency Center ranking explainer)
- **"Your Algorithm" (Dec 2025).** A heart-lines icon on Reels opens a sheet showing **the AI-summarized topics shaping your recommendations**; each topic gets more/less controls; arbitrary topics can be added; slated to extend to Explore. This is the industry-frontier pattern: the algorithm as an inspectable, editable surface. (TechCrunch/Wired/Fast Company, Dec 2025)
- **"Reset suggested content" (Jan 2025)** — a full personalization do-over (Mosseri; The Verge tuning guide). Per-item **Interested / Not interested** menus are live across feed, Reels, Explore and Search. (Meta Transparency Center)
- **Media grammar shift.** Profile grid went 1:1 → **3:4** (Jan 2025); 3:4 uploads supported natively (May 2025) — vertical-first media is now the default assumption; feed posts max 4:5. (The Verge; Forbes)
- **Stories rail.** Circular tiles, unwatched gradient ring, your-own-story first, watched sink to the tail — grammar our poster rail already mirrors with cards.

### Depop — taste-graph personalization as the product
- **"My DNA".** Learns from likes, saves, follows and onboarding style picks; drives a personalized shop-the-style feed. Reported **+15% session length YoY** attributed to My DNA; AI visual search shipped 2025–26. (businessmodelcanvastemplate.com; Accio; zipsale)
- **Surface structure.** Home ≈ For You (style-edit led), Feed (social graph), Explore (curated discovery). Research consistently finds users want *style-level* personalization, not seller-level; Explore only works when it feels editorial rather than exhaustive. (saskialamb redesign case; Medium case study)
- **Tile anatomy.** Dense 2-col grid; seller identity + price on the tile; likes drive the taste loop; low-fi "authentic" photography is the accepted media register.

### TikTok Shop — discovery commerce inside the entertainment stream
- **"Discovery without intent."** Products surface inside the For You feed as native content; ranking weighs watch-time, scroll speed and engagement velocity; the Shop tab runs separate Recommended/For-You feeds on collaborative filtering. (TikTok Shop business blog; bemomentiq)
- **Live/shoppable grammar.** Anchored product card at the bottom of a shoppable video/LIVE; creator row + follow + viewer count at top; floating hearts and **"someone just bought"** social-proof pulses; one tap → listing overlay → in-app checkout, no redirects. (GetStream live-shopping teardown)
- **Controls.** "Manage Topics" (2024) and FYP recommendation reset — the topic-control pattern Instagram copied for "Your Algorithm".
- **Desktop (Feb 2025).** Modular layout with refreshed For You feed + Explore tab + floating player — snap-feed grammar is now expected to survive on desktop too. (TechCrunch via TEXXR)

### Vinted — the incumbent resale feed
- Newsfeed splits personalized "For you" content from catalog; **infinite scroll is its most-criticized trait** (users lose orientation — a point in favour of our finite, marked feed); curated entry modules ("favourite brands", picked categories) front-load the session. (martahutesa UX case; vbp.netlify product-design case)

### Distilled 2026 premium grammar
| Vector | What premium means now |
|---|---|
| Density | 2-col masonry phone → ~5–6 at desktop; ≥2 media objects in first viewport; 6–8px gutters; aspect reserved server-side, zero reflow |
| Media | Vertical-first (3:4/4:5); focal-point crops; LQIP blur-up; most-visible video autoplays muted |
| Personalization | Lifelong-taste ranking; *inspectable* (why-this sheet, reason codes); *editable* (not-interested, topic weights, reset); honest labels |
| Refresh | Pull-to-refresh on touch; "N new" pill on scroll-stopped feeds; last-good feed survives a failed refresh |
| Scroll | Snap rails with edge fades; infinite scroll optional — an honest end beats a fake one |
| Card | Media + price + brand + seller + state (sold/drop/saved); social proof above a threshold; double-tap like; long-press → quick actions/peek/visual search |
| Modules | Full-bleed shelves interleaved *dynamically* (skip-slot), fatigued when ignored — never fixed chrome |

---

## 2. Our Implementation (file evidence)

### Home feed — `app/page.tsx`, `components/home/HomeFeed.tsx`
- **Composition order** (page.tsx:74-142): sticky control bar (For you/Following `SegmentedControl` + signal `Chip` rail) → `StoryRail` → `EntryBand` → `RecentlyViewedRail` → `FreshDropsRail` → chunked `MasonryGrid` with module bands after positions 8/16/24/32 (`HomeFeed.tsx:53-58`) → honest "You've reached the end" marker (`:155-158`).
- **Filtering:** Following mode re-filters the *same* feed's listing units by `followedSellers` (page.tsx:54-60); signal chips run word-boundary matching across brand/category/subcategory/title — 'men' can't hit 'women' (`homeSignals.ts:38-54`). Signal list is a **static constant** (`HOME_SIGNALS`, `homeSignals.ts:19-36`).
- **Ranking:** `rankFeedUnits` (rankFeed.ts) — wishlist likes → brand/category/subcategory affinity, follows → seller affinity; boosted listings dealt every 4th listing slot; authored units hold position. Deterministic, honest, **purely local** — no server serve, no reason codes, no impression loop.
- **Masonry:** balanced shortest-column distribution on server-truth aspect ratios + fixed info allowance (`MasonryGrid.tsx:69-83`); `span` units get featured rows with lead/trail companions (`segmentBand`, `:106-138`); 2→6 columns via `useSyncExternalStore` (`:291-309`) — SSR-corrected before first paint.
- **States:** `HomeFeedSkeleton` mirrors rail+masonry geometry (`:65-86`); error state is a real retry surface and keeps `RecentlyViewedRail` mounted (`:103-119`); per-mode empty states with recovery CTAs (page.tsx:110-141).
- **Feed construction (fixture):** authored interleave at fixed indices — look@6, poster@12, moodboard@18, editorial@24, rec-break@29; `span=2` forced at listing idx 7 & 15 (`lib/api/client.ts:67-135`). Live mode maps `/feed/home` units and **returns `nextCursor`, which `useFeed` (`lib/hooks/queries.ts:30-32`) discards** — single-page `useQuery`, no `useInfiniteQuery`.

### Story rail — `components/feed/StoryRail.tsx`
- 76×135 poster cards, unwatched brand ring → hairline when seen, unwatched-first sort, "N new" badge on first unwatched (`:60-115`), skeleton row while loading, degrades to inline retry row on error (`:46-56`).

### Explore — `app/explore/page.tsx`, `components/explore/*`
- Search header → static `CATEGORY_DIRECTORY` media tiles with real counts (`:53-91`) → `TrendingTopics` (authored `TRENDING_TOPICS`, covers lifted from catalogue listings — `topics.ts:34-64`) → `LooksMoodboards` 3-card editorial band → **"Made for you"** `MasonryGrid` fed by the *same* `useFeed()` units as home, **unranked** (`:97-105`) → end marker.

### Pulse — `app/pulse/page.tsx`, `components/pulse/*`
- Snap-scroll full-bleed column (mobile edge-to-edge, desktop 430px centered with side chevrons, arrow-key stepping, inactive cards dim/scale — `PulseFeed.tsx:82-157`), honest "You're all caught up" end card.
- `PulseCard` (`PulseCard.tsx`): creator row + Follow/Following pill (persisted follows store, hydration-gated), kind chips (Live auction/Fresh drop/Price drop) that **tick a live countdown with urgency colour states** (`:83-111`), glyph-scrim like/save/share right rail (44px targets), shoppable item chips deep-linking to `/item/[id]`. Creator posts render like count read-only — no fabricated post-like store (`:233-245`).
- `pulseModel.ts` builds cards from real auctions/drops/price-drops/`PULSE_POSTS`, recency-sorted (`:48-144`).

### Cards — `components/cards/ProductTile.tsx`
- Reserved aspect + focal point + LQIP (`AppImage`), sold scrim + label + opacity-70, price-drop-% > sustainability badge cascade, video/multi-image indicator, **share+save+heart triad** with 44px transparent targets (hover-reveal on pointer devices, always visible on touch — `globals.css:606-612`), metadata budget: disclosure → brand → title → size·condition → price → seller(+verified). Stretched-link navigation, auth-gated saves via `SignupWall`.

---

## 3. Mobile parity deltas (`frontend/src`)

Mobile is materially ahead of web on personalization mechanics:

| Capability | Mobile | Web |
|---|---|---|
| For-you serve | `useForYouFeed` → real `GET /recommendations/:userId` with requestId, sessionId, serveMode, reasonCodes, per-item scores (`hooks/useForYouFeed.ts:130-301`) | `useFeed()` → fixture list + local `rankFeedUnits` boost |
| Impressions | `useRecommendationImpressions` batches viewability impressions → `POST /recommendations/impressions` (`hooks/useRecommendationImpressions.ts`) | none |
| Feed controls | Long-press tile → "Not interested" / "Show less like this" with undo window, honest persisted/session/failed states, identity-bound writes (`UnifiedDiscoveryScreen.tsx:199-320`, `services/recommendationFeedbackApi.ts`) | none |
| Explainability | `FeedExplanationSheet` — ranked reasons, confidence label, see-more/show-less/remove-topic (`components/algorithm/FeedExplanationSheet.tsx`) | none |
| Signal chips | `useDynamicAlgorithmSignals` — chips derived from algorithm profile + recommendation vectors + recent searches + wishlist brands; personalization dot; selection boosts the profile (`hooks/useDynamicAlgorithmSignals.ts:86-137`) | static `HOME_SIGNALS` |
| Refresh | `RefreshControl` pull-to-refresh + "N new drops ready" pill + FRESH-02 last-good-on-failed-refresh banner (`HomeScreen.tsx:683-692`, `HomeFeedHeader.tsx:115-142`, `:269-294`) | none; `isError` swaps the whole feed for an error panel |
| Mode persistence | `home.feedMode` in MMKV (`HomeScreen.tsx:121-133`) | `useState`, session-only |
| Peek | Long-press → media peek modal (`HomeScreen.tsx:701-772`) | none |
| Video | Viewability-driven autoplay, most-visible tile (`HomeDiscoveryCard.tsx:177-187`, `useViewabilityPlayback`) | play badge only |
| Like gestures | `DoubleTapHeart` burst + save (`HomeDiscoveryCard.tsx:168-214`) | single-tap buttons |
| Social proof | likes count shown when >10 (`HomeDiscoveryCard.tsx:145-154`) | none |
| Home modules | No mounted `RecentlyViewedRail` (component exists, unused — `components/home/RecentlyViewedRail.tsx` is dead code there) | `RecentlyViewedRail` mounted and working — web is *ahead* here |
| Pulse | `PulseTab`/`PulseFeedScreen`: event rows + "Popular this week" rail with **24h/7d/30d windows** + "Live Now" rail + sold events (`components/explore/PulseTab.tsx:261-337`) | TikTok-style snap feed — richer card grammar, but **no trending rail, no live-now rail, no sold events** |
| Story rail | frame-count badge (layers icon + N) (`HomeStoryRail.tsx:94-99`) | ring/name/unwatched only |
| Offline | `OfflineBanner`, sync-error banner, degraded-personalization row (`HomeFeedHeader.tsx:269-294`) | none |

---

## 4. Gap Table

| # | Pattern | Reference | Our status | Severity | File |
|---|---|---|---|---|---|
| 1 | Server-ranked "For you" w/ reason codes + impression confirmation | Pinterest TransActV2; IG Explore 3-stage ranking; our own mobile `/recommendations` | **PARTIAL** — local like/follow re-sort only (`rankFeed.ts:66-108`); `useFeed` ignores cursor & identity | **P0** | `lib/hooks/queries.ts:30` · `app/page.tsx:71` |
| 2 | Per-item feed controls: Not interested / Show less / Undo | Pinterest 3-dot; IG/Meta transparency; TikTok Manage Topics | **MISSING** — mobile ships the full pipeline | **P0** | absent from `components/cards/ProductTile.tsx`, `components/feed/*` |
| 3 | "Why am I seeing this?" explanation sheet | IG Your Algorithm (Dec 2025); Pinterest VLM rationale | **MISSING** — mobile `FeedExplanationSheet` exists | **P1** | absent |
| 4 | Dynamic personalized signal chips | Depop My DNA; mobile `useDynamicAlgorithmSignals` | **PARTIAL** — static constant list, no personalization dot, no boost-on-select | **P1** | `components/home/homeSignals.ts:19-36` |
| 5 | Pull-to-refresh / "N new drops" pill / refresh affordance | Mobile RefreshControl + banner; universal 2026 grammar | **MISSING** — refetch exists but no user-facing trigger or freshness signal | **P1** | `app/page.tsx` · `components/home/HomeFeed.tsx` |
| 6 | "Made for you" honesty | Label truthfulness (charter §11) | **DIVERGENT-BY-DESIGN defect** — Explore's "Made for you" renders the unranked shared feed | **P1** | `app/explore/page.tsx:97` |
| 7 | Infinite scroll / pagination | `feed.ts` returns `nextCursor`; IG/Pinterest/Vinted | **MISSING** (deliberate on mobile; on web the live cursor is silently dropped — paginate or document intent) | **P2** | `lib/api/services/feed.ts:71` · `lib/hooks/queries.ts:30` |
| 8 | Failed-refresh keeps last-good + offline/degraded banner | Mobile FRESH-02 `refreshError`; OfflineBanner; degraded row | **PARTIAL** — `isError` replaces populated feed with an error panel; no offline affordance | **P2** | `components/home/HomeFeed.tsx:103-119` |
| 9 | Long-press → peek / quick actions / visual search | Pinterest long-press search (May 2025); mobile peek modal | **MISSING** | **P2** | `components/cards/ProductTile.tsx` |
| 10 | Video autoplay (most-visible tile, muted) | Mobile `useViewabilityPlayback`; IG/TikTok feeds | **MISSING** — badge only; web images-only is honest but flat vs. competition | **P2** | `components/cards/ProductTile.tsx:158-166` |
| 11 | First-viewport product density | Pinterest/Depop: saleable media in viewport 1 | **PARTIAL** — sticky bar + story rail + EntryBand + RecentlyViewed + FreshDrops before the first masonry row (~700–1000px of lead-in) | **P2** | `app/page.tsx:97-142` · `HomeFeed.tsx:141-143` |
| 12 | Pulse: trending rail w/ 24h/7d/30d windows + Live-Now rail + sold events | Mobile `PulseTab`; TikTok Shop trending surfaces | **PARTIAL** — snap grammar exceeds mobile, but loses its two rails and 'sold' kind | **P2** | `components/pulse/pulseModel.ts` · `app/pulse/page.tsx` |
| 13 | Double-tap/double-click like w/ burst | IG/TikTok; mobile `DoubleTapHeart` | **MISSING** | **P3** | `components/cards/ProductTile.tsx` |
| 14 | Social-proof likes count (thresholded) | Mobile >10 rule; TikTok counts; Depop likes | **MISSING** | **P3** | `components/cards/ProductTile.tsx:213-250` |
| 15 | Shared-element tile→PDP transition | Mobile `SharedTransitionView`; IG/Pinterest zoom-through | **MISSING** (View Transitions API is the web analogue) | **P3** | `components/cards/ProductTile.tsx:254-260` |
| 16 | Feed-mode persistence | Mobile MMKV `home.feedMode` | **MISSING** | **P3** | `app/page.tsx:31` |
| 17 | Story rail frame-count badge + create-self tile | Mobile layers+N; IG "Your story" | **PARTIAL** | **P3** | `components/feed/StoryRail.tsx` |
| 18 | Featured-span art direction from media geometry | Mobile heroes require real landscape media (≥1.2, `discoveryFeedAssembly.ts:45-51`); Pinterest strong-media slots | **PARTIAL** — web forces `span=2` at fixed idx 7 & 15 regardless of the image's actual shape | **P3** | `lib/api/client.ts:132-135` |
| 19 | Module fatigue / dynamic slotting | Pinterest skip-slot — modules compete against Pins on predicted engagement | **PARTIAL** — fixed breakpoints (8/16/24/32), self-omitting on short feeds (honest) but engagement-blind | **P3** | `components/home/HomeFeed.tsx:53-58` |
| 20 | "Refine your recommendations" / reset surface | Pinterest settings; IG reset; mobile `algorithmTransparencyApi` + YourAlgorithm sheet | **MISSING** | **P3** | — |
| 21 | Masonry: balanced columns, reserved ratios, featured bands, no reflow | Pinterest grid | **MATCHED** | — | `components/feed/MasonryGrid.tsx:69-138` |
| 22 | Story rail: unwatched ring + ordering + count badge | IG stories grammar | **MATCHED** | — | `components/feed/StoryRail.tsx:60-115` |
| 23 | Card state anatomy: sold/drop/sustainability/disclosure/seller/save+like+share | Depop/Vinted tile completeness | **MATCHED** (minus likes count) | — | `components/cards/ProductTile.tsx` |
| 24 | Authored module bands as siblings of the grid | Pinterest carousel modules; Vinted curated selections | **MATCHED** | — | `components/home/HomeFeed.tsx:52-58` |
| 25 | Pulse card grammar: creator+follow, action rail, shoppable chips, ticking countdown | TikTok shoppable card / LIVE | **MATCHED** (stills — no video assets) | — | `components/pulse/PulseCard.tsx` |
| 26 | Honest finite-feed end marker | vs. Vinted's criticized infinite scroll | **MATCHED / DIVERGENT-BY-DESIGN** | — | `HomeFeed.tsx:155-158` · `explore/page.tsx:108-113` |
| 27 | Skeletons mirror final geometry | 2026 load-fidelity bar | **MATCHED** | — | `HomeFeed.tsx:65-86` · `PulseFeedSkeleton.tsx` · `Skeleton.tsx:12-31` |
| 28 | Facet entries with real counts → resolving routes | Pinterest/Vinted ways-into-catalogue | **MATCHED** (data-derived; unresolvable facets self-omit) | — | `components/home/modules/EntryBand.tsx:100-111` |
| 29 | "Trending" claims backed by measurement | IG topic channels are engagement-derived | **PARTIAL** — `TRENDING_TOPICS` is an authored constant; nothing measures the trend | **P3** | `components/explore/topics.ts` |
| 30 | Explore intent-driven category pills + saved-search affordance | Mobile `useDiscoveryCategories` + addSavedSearch | **PARTIAL** — static directory tiles; no saved search | **P2** | `app/explore/page.tsx:53-91` |

---

## 5. Top 5 highest-leverage caveats

1. **The personalization loop is severed on web.** Mobile serves a real ranked feed with reason codes, impression confirmation and negative-feedback writes; web "For you" is a client-side re-sort of a static fixture page, and Explore's "Made for you" doesn't even re-sort. The backend contract (`/recommendations`, `/interactions`, `/recommendations/impressions`, intent mutations) already exists — the web client simply never calls it. **Fix is plumbing, not invention: wire `useFeed` (or a sibling) to the same serve path mobile uses, keep `rankFeedUnits` as the fixture/degraded fallback, and label accordingly.** (P0)

2. **No feed controls = no taste loop and no trust grammar.** Every 2025-26 reference ships per-item "Not interested / Show less / Why am I seeing this?" — and mobile already implements the full honest version (undo window, persisted/session/failed states, identity-bound writes). Web needs a tile overflow/long-press menu + the explanation sheet + the feedback notice bar. Porting `recommendationFeedbackApi` semantics is a contract job, not a research job. (P0/P1)

3. **Refresh grammar is absent.** No pull-to-refresh analogue, no "N new drops" pill, and a background refetch failure currently replaces a populated feed with an error panel (mobile's FRESH-02 keeps last-good + an inline banner). Add a refresh affordance in the sticky control bar, a new-items pill on re-focus/re-poll, and split `isError` into initial-load vs refresh-failure. (P1)

4. **First viewport sells nothing.** Sticky bar → story rail → EntryBand → RecentlyViewed → FreshDrops means ~700–1000px of shelves before the first masonry product row; Pinterest/Depop put shoppable media inside viewport one. Collapse the lead-in (e.g. merge EntryBand into the story-rail band or drop `FreshDropsRail` when it duplicates the feed head), or lift the first masonry chunk above the lower rails. (P1)

5. **Authored-vs-measured honesty needs a pass.** "Trending topics" is a hand-authored constant; signal chips are static while mobile derives them from the user's algorithm profile; Pulse lost mobile's "Popular this week" trending rail (which at least sorts by views) and its 24h/7d/30d windowing. Either wire these to real signals (views/likes velocity exists in the data) or rename to honest labels ("Shop by style", "Editors' topics"). (P2)

---

### Method note
Live research sources (cited inline): Pinterest Engineering (Module Relevance, TransActV2), Social Media Today, Pinterest Newsroom, TechCrunch (Pinterest visual search May 2025; AI boards Oct 2025; IG Reels-first Sep 2025; Your Algorithm Dec 2025), Meta Transparency Center, Digilogy, The Verge/Forbes (3:4 grid), Depop/My DNA coverage (zipsale, accio, businessmodelcanvastemplate), TikTok Shop business blog + GetStream teardown, Vinted UX case studies. Code evidence: `web/src` files cited per-row; mobile reference `frontend/src` (HomeScreen, UnifiedDiscoveryScreen, PulseFeedScreen, PulseTab, useForYouFeed, useDynamicAlgorithmSignals, FeedExplanationSheet, recommendationFeedbackApi, discoveryFeedAssembly, HomeDiscoveryCard).
