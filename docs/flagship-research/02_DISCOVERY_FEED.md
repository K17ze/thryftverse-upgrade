# 02 — Discovery, Home Feed, Browse, Galleria & Pulse: Flagship Research

> Department: Discovery — home feed, browse, galleria, pulse feed, discovery scenes.
> Scope of audit: `HomeScreen`, `BrowseScreen`, `GalleriaScreen`, `GalleriaCollectionDetailScreen`, `PulseFeedScreen`, `ExploreCollectionScreen`, `CategoryDetailScreen`, `CategoryTreeScreen`, `DiscoverScene`, `LooksScene`, `PulseScene`, and all components under `components/discovery/`, `components/discover/`, `components/explore/`.
> Charter references: AGENTS.md §3 (case study), §4 (quality bar, comparative visual-fidelity protocol, media storytelling, density target, thumbnail/squint tests).

---

## 1. 2026 Competitor Benchmark

### 1.1 Instagram feed (2026)

Instagram's 2026 feed is **vertical-first, full-screen, and post-level**. Qode Social's 2026 layout analysis confirms that "content is increasingly viewed full-screen across explore, search, and recommended placements," and that "every post must stand on its own visually, communicate its message quickly, and remain readable across devices." The grid is no longer the unit of perception; the **single post strip** is. The highest-performing feed ratio is 4:5 (1080×1350), occupying 33% more vertical screen space than square — a direct play for more visual territory per scroll frame (Lucky Graphics, 2026).

What makes Instagram flagship in 2026 is not decoration but **sub-300ms perception engineering**. Lucky Graphics reports that "the average user scrolling a social feed makes the decision to stop or continue past a post in approximately 300 milliseconds — before they've consciously read any text," and that the decisions that affect this are value contrast, silhouette legibility, and emotional gestalt — not caption copy. MyGridPlanner's 2026 trend audit adds that the over-edited, perfectly-curated grid is losing ground to "imperfect aesthetics" — mild grain, candid lighting, off-center compositions — because users are suffering "AI fatigue" from synthetic, hyper-polished content. The feed that wins is the one that feels **authored by a person, not assembled by a template**.

### 1.2 Pinterest home feed (2026)

Pinterest's 2026 engineering output is the most directly relevant benchmark for ThryftVerse because it is a **visual discovery commerce surface**, not a social graph. Three 2026 Pinterest Engineering publications define the state of the art:

1. **Multi-objective optimization at the re-ranking layer** (April 2026). Pinterest explicitly states that "visually repetitive content is less engaging and is likely to reduce the user's session length and the likelihood that a user will revisit," and that removing the feed-level diversity component produces a day-1 save spike that "quickly turns negative by the second week." The lesson: **feed-level diversity is a long-term satisfaction signal, not a nice-to-have**. A uniform masonry of identical tiles is measurably worse than a varied one, even if each individual tile scores well.

2. **Module Relevance on Home Feed**. Pinterest introduced heterogeneous modules — landing-page modules and carousel shelves — blended into the main Pin grid, because "the grid limits our ability to provide more context on the recommendations." Modules give context and topic affordance that a flat grid cannot. Critically, Pinterest built "module fatiguing" so new modules don't displace highly-optimized Pins — modules must **earn** their slot. This is the "endless garden" architecture: a base rhythm of Pins interrupted by authored modules that provide breathing room and topical orientation.

3. **Modernizing Home Feed Pre-Ranking** and the AWS $4B infrastructure commitment. Pinterest is moving from two-tower retrieval to transformer-based generative recommenders and multi-turn conversational discovery (Pinterest Assistant). The product implication for ThryftVerse: discovery is becoming **intent-driven and multimodal**, and the presentation layer must make recommendations legible — "a recommendation only works if a person understands why it is for them" (Netflix APAC 2026, cited in ContentGrip).

### 1.3 The 2026 flagship bar (synthesized)

Across Instagram, Pinterest, and the broader social-commerce literature (Sprout Social, Shopify, Influencers-Time 2026), the 2026 flagship discovery surface is:

- **Media-as-color**: real imagery is the primary visual anchor; chrome recedes.
- **Authored rhythm**: heterogeneous modules interrupt a base grid so the feed reads as curated, not as a uniform stream.
- **Sub-300ms legibility**: every tile must communicate identity + value before the user reads a word.
- **Variable reward, but with stopping cues**: the EU DSA enforcement against TikTok (Feb 2026) and the ADDICT study (2026) show that pure boundary-less infinite scroll is now a regulatory and reputational liability. The flagship 2026 pattern is **infinite-but-paced** — modules and section breaks act as soft stopping cues that let the user re-engage consciously.
- **Creator-attributed, shoppable**: Pinterest's 2026 creator attribution rollout and Instagram's April 2026 product-link-in-Reels feature both point to discovery tiles carrying creator identity and a direct shoppable path.

---

## 2. Psychology & Principles

### 2.1 Variable reward (the slot-machine mechanism)

The most robust finding in the 2026 literature is **variable ratio reinforcement**. Psychology Today (2026), FairPatterns (2026), and The Hotspur Way (2026) all converge: the brain's reward system responds more strongly to *uncertain* rewards than to predictable ones. A feed where every item is equally good produces *less* engagement than one where the next item might be excellent — or might not. The anticipation, not the reward, sustains the thumb.

For ThryftVerse this has a precise design consequence: the home feed must **vary tile quality and type** — a great find, then a couple of ordinary ones, then a featured editorial anchor, then a posters rail, then more tiles. The current `FEATURED_RHYTHM = [7, 9, 6, 10, 8]` pattern in `HomeScreen.tsx` (line 703) is a correct instinct, but it only varies *size*, not *content type* or *emotional valence*. Variable reward requires variability at the content level, not just the layout level.

### 2.2 Masonry eye-flow

Pinterest's masonry works because the **uneven bottom edge** creates a continuous eye-flow path: the eye drops to the shortest column, then continues. A uniform grid creates a horizontal scan band that the eye can "exit" from; a masonry creates a vertical zig-zag that keeps the eye inside the feed. This is why Pinterest has never moved to a uniform grid despite the engineering cost. The ThryftVerse `PinterestMasonryGrid` (using FlashList v2 `masonry` mode) and the manual `buildMasonryColumns` in `GalleriaScreen.tsx` (line 339) both implement this correctly in principle.

### 2.3 Media-as-color

On discovery surfaces, real media is the primary color palette. AGENTS.md §4 is explicit: "real media must be the primary colour and visual anchor. Generic grey placeholder cards never become the dominant first-viewport story." This means the *first thing the eye sees* must be photography, not a grey surface, a card border, or a section header. Color should come from garments, not from tokens.

### 2.4 Progressive disclosure

A discovery tile is a **promise**, not a summary. The 2026 social-commerce literature (Sparq, Influencers-Time) emphasizes that discovery "no longer starts with search — it starts with relevance." The tile's job is to communicate enough identity + value to earn a tap, then the detail surface does the rest. Overloading a tile with seller avatar, condition badge, title, price, likes, and save button violates progressive disclosure: the user is asked to process a full product card before deciding whether to engage.

### 2.5 Social proof

Social proof in 2026 is **high-velocity and specific**: "comments, likes, saves, and creator validation all influence credibility" (Influencers-Time 2026). Generic "popular this week" labels are weaker than "12 saved this hour." The current `PulseTab.tsx` trending rail (line 263) uses a window selector (24h/7d/30d) which is good, but the social proof on individual tiles is absent — the `TrendingRailItem` (line 58) shows brand + title + price only, no save count or velocity signal.

### 2.6 The "endless garden" feeling

This is the hardest principle to engineer. Pinterest's module-relevance work (2026) describes it technically: heterogeneous modules blended into a Pin grid so the feed feels like a **curated garden with clearings**, not an undifferentiated field. The user should feel they are *wandering* through something authored, not *processing* a list. This requires:

- **Section breaks that act as clearings** (a hero, a rail, a curated module).
- **Rhythm variation** — never more than ~10 identical tiles in a row without an interruption.
- **Topical orientation** — the user should periodically understand *why* this cluster is here ("Fresh drops", "From sellers you follow").

---

## 3. Current ThryftVerse Audit — Concrete Defects

### 3.1 Generic grey placeholder cards as first-viewport story

`HomeScreen.tsx` defines `ListingMediaPlaceholder` (line 255) — a flat `colors.surfaceAlt` block with a 32pt category icon. The comment at line 98 acknowledges the intent ("Missing media is not photography and should not dominate discovery"), but the *execution* fails the media-storytelling rule when a feed is sparse: if the first rows contain listings without images, the first viewport becomes a row of grey squares with tiny icons. This violates AGENTS.md §4: "Generic grey placeholder cards never become the dominant first-viewport story."

**Defect location**: `HomeScreen.tsx:255-282` (`ListingMediaPlaceholder`), rendered at line 372 inside `ExploreGridItem`, and `HomeDiscoveryCard.tsx:162-169` (the `mediaPlaceholder` view). The fallback is a flat `surfaceAlt` rectangle — it recedes, which is better than a decorative orb, but it does not *tell a story*. A flagship fallback would use a category-tinted neutral (subtle hue from the garment category) or a typographic treatment, not a flat grey.

### 3.2 Card-on-card composition in Pulse

`PulseFeedScreen.tsx` `EventCard` (line 70) and `PulseTab.tsx` `ActivityCard` (line 97) both wrap a `CachedImage` in a card with `backgroundColor: colors.surface`, `borderWidth: StyleSheet.hairlineWidth`, `borderColor: colors.border`, then place an image with its own `borderRadius: Radius.md` *inside* that card. This is card-on-card: an image-in-a-rounded-box-in-a-card. The image container and the outer card share the same radius family and the same surface token, so the silhouette reads as **nested rectangles**, not as a media object on a canvas.

**Defect location**: `PulseFeedScreen.tsx:205-215` (card style with `backgroundColor: colors.surface`, `borderRadius: Radius.lg`, `borderWidth: hairlineWidth`) combined with `cardImage` at line 216 (`borderRadius: Radius.md`, `backgroundColor: colors.surfaceAlt`). The image is 80×80 (PulseTab) or `Space.xxl + Space.xl` square (PulseFeedScreen) — small enough that the double-radius nesting dominates the silhouette. AGENTS.md §4: "No card-on-card composition. A nested surface requires a distinct interaction or state boundary. Otherwise flatten it."

### 3.3 Weak media art direction

Across the discovery surfaces, `contentFit="cover"` is used universally without category-sensitive focal positioning on most tiles. `HomeScreen.tsx` `ExploreGridItem` (line 366) and `HomeDiscoveryCard.tsx` (line 156) both pass `focalPoint={getCategoryFocalPoint(item.category)}` — this is correct and good. But `GalleriaScreen.tsx` `FeaturedAssetCard` (line 242), `CollectionItemCard` in `GalleriaCollectionDetailScreen.tsx` (line 115), `PulseTab.tsx` `ActivityCard` (line 98), and `LooksTab.tsx` `LookTile` (line 103) all use plain `contentFit="cover"` with no focal point. Shoes get cropped at the toe, bags at the handle, jewellery off-center. AGENTS.md §15: "Do not rely on `cover` blindly. Use category-sensitive focal positioning when supported safely."

### 3.4 Missing first-viewport usefulness on Pulse

`PulseTab.tsx` opens with a "Popular this week" rail (line 263), then a window-tab selector, then a horizontal rail of `TrendingRailItem` cards (140pt wide, 180pt image). The first viewport is **chrome**: a section header, a tab row, then the top sliver of a horizontal rail. There is no media object fully visible above the fold. The density target (AGENTS.md §4: "A discovery viewport should expose at least two meaningful media objects or the beginning of the next module") is missed because the window tabs consume a full row that could have been the first media row.

**Defect location**: `PulseTab.tsx:263-300`. The `windowTabs` row (line 271) sits between the header and the rail, pushing the first complete media object below the fold.

### 3.5 Dead modules and demo-only surfaces

`GalleriaScreen.tsx` line 521: `handleEditorialPress` is a no-op — "Editorials are demo-only — no dedicated detail screen yet." The tap produces a haptic and nothing else. This violates AGENTS.md §11: "Never expose controls that only produce 'Coming soon', 'Backend required', or generic explanation toasts." The editorial card has full press feedback (`activeOpacity={0.92}`, `scaleValue={0.99}`) and an `onPress` that does nothing. The `GALLERIA_DEMO_MODE` badge (line 618) is honest, but the tappable editorial card is not — it *implies* a destination that does not exist.

**Defect location**: `GalleriaScreen.tsx:518-527` (`handleEditorialPress`), `GalleriaScreen.tsx:63-106` (`HeroEditorialCard` with full press affordance), `GalleriaScreen.tsx:268-334` (`EditorialListItem`).

### 3.6 AI-slop copy

`CategoryTreeScreen.tsx` line 63: `editorialSubtitle: "Curated categories, handpicked for you"` — this is generic filler that communicates nothing. `CategoryDetailScreen.tsx` line 162: `"Browse the latest {category} pieces from the community."` — a template sentence that adds no information the user doesn't already infer from the category name. `PulseTab.tsx` line 331: `"Marketplace Live"` with `"{activities.length} active events · {liveAuctions.length} live auctions"` — the banner is a status row that restates the section headers below it. AGENTS.md §4: "Remove duplicate headings, decorative subtitles and labels that merely name an obvious object."

### 3.7 Missing states

`PulseFeedScreen.tsx` has **no loading skeleton** — it renders either events or an `EmptyState`. While events are being computed (synchronously from `listings` + `customAuctions`), there is no transitional state. `ExploreCollectionScreen.tsx` (line 127) uses a `SkeletonLoader` grid for loading, which is good, but the skeleton is a uniform 180pt-height grid — it does not resemble the final masonry layout (AGENTS.md §14: "Skeletons should resemble the final layout"). `LooksTab.tsx` (line 207) uses a bare `ActivityIndicator` (large, brand-colored spinner) — the generic centered spinner that AGENTS.md §14 explicitly prohibits: "Do not use a generic centred spinner for every state."

### 3.8 Surface-budget violations (card soup)

`PulseTab.tsx` wraps nearly every module in a `colors.surface` card with a hairline border: `liveCard` (line 393), `pulseBanner` (line 433), `activityCard` (line 541), `quizCard` (line 299 in `EditTab.tsx`). The first viewport of Pulse is a stack of separate grey panels — a header card, a banner card, then activity cards. AGENTS.md §4: "Above the fold, use at most one dominant non-media panel. Do not wrap every row, icon, filter and section in separate grey surfaces. Flat canvas, spacing and hairlines are the default utility structure."

### 3.9 Radius and stroke inconsistency

`PulseTab.tsx` mixes `Radius.md` (image containers), `Radius.lg` (cards), `Radius.full` (pills, dots), and `Radius.xxl` (window tabs in `EditTab.tsx:286`). That is four non-avatar radius sizes in one surface. AGENTS.md §4: "Use no more than two non-avatar radius sizes in one viewport unless a modal is present." The `EditTab.tsx` `quizCard` (line 299) adds a `shadowColor/shadowOffset/shadowOpacity/shadowRadius/elevation` — a decorative shadow on a non-dominant panel, which AGENTS.md §4 prohibits ("shadows on every surface").

### 3.10 Text-budget violations

`CategoryTreeScreen.tsx` first viewport: `editorialTitle` (display size), `editorialSubtitle` (body size), then a full-width `viewAllRow` with `viewAllText` (bodyLarge, bold), then `DiscoverySectionHeader` with `kicker` + `title` for each section. That is four type sizes and two eyebrows before the first category tile. AGENTS.md §4: "The first viewport normally uses no more than three type sizes and one eyebrow."

---

## 4. Micro Improvements (per-screen, per-component)

### 4.1 HomeScreen / HomeDiscoveryCard

- **Fallback art direction**: Replace the flat `surfaceAlt` placeholder (`HomeDiscoveryCard.tsx:287-292`, `HomeScreen.tsx:255-282`) with a category-tinted neutral — a subtle hue derived from the category (e.g. warm beige for bags, cool grey for watches) plus a typographic treatment (the brand initial or category name in a quiet weight). This keeps the fallback from becoming a decorative element while making it *authored* rather than *generic*.
- **Featured tile overlay**: The `featured` flag exists in the VM (`HomeScreen.tsx:148-150`) but `HomeDiscoveryCard` does not consume it — all tiles render identically. Wire the featured flag to a distinct treatment: full-span, larger media, editorial overlay with a one-line context (`item.context?.text`). This delivers the asymmetric rhythm the code comment at line 698 claims.
- **Price overlay legibility**: The video-tile overlay price (`HomeDiscoveryCard.tsx:190-203`) uses `rgba(0,0,0,0.62)` scrim at 40pt height. On a bright video frame this can still be illegible. Increase scrim to 48pt and add a subtle text-shadow (already present) but verify on device.

### 4.2 BrowseScreen

- **Filter pill chrome**: The `filterPill` / `filterPillOutline` / `sortTrigger` styles (lines 150-193) are three separate pill definitions with near-identical geometry. Consolidate to one pill primitive with active/inactive states. This is a token-level fix that reduces silhouette noise.
- **Seller identity chip**: The `sellerIdentityChip` (line 331) is a nested row inside the card with its own avatar + handle. On a browse tile this is card-on-card (a chip inside a card). Flatten: place the seller handle as a single line of text below the price, no avatar container, no chip background.

### 4.3 GalleriaScreen

- **Editorial press truthfulness**: Either build the editorial detail screen or remove the press affordance from `HeroEditorialCard` and `EditorialListItem`. Until the CMS exists, the editorial cards should be **presented as imagery** (no `AnimatedPressable`, no `accessibilityRole="button"`, no `onPress`) with the "Demo content" badge communicating the state. This is the honest path per AGENTS.md §11.
- **Section eyebrow redundancy**: `SectionHeader` (line 446) renders `eyebrow + title`. The hero already has an "EDITORIAL" eyebrow (line 95). The first viewport shows two eyebrows ("EDITORIAL" on hero, "CURATED COLLECTIONS" on the next section). Collapse to one eyebrow per viewport module-break.

### 4.4 GalleriaCollectionDetailScreen

- **Hero parallax**: The parallax implementation (line 249) is good. Add focal-point to the hero image (`contentFit="cover"` at line 413 has no focal point) so collection cover images don't crop the key garment.
- **Masonry meta height**: `buildMasonryColumns` uses `metaHeight = 72` (line 70) as a constant, but `CollectionItemCard` renders title (2 lines) + valuation (1 line) — closer to 60pt. The 12pt overshoot causes uneven column bottoms. Measure actual meta height or use FlashList v2 masonry like `PinterestMasonryGrid` does.

### 4.5 PulseFeedScreen / PulseTab

- **Flatten the activity card**: Remove the outer card surface from `EventCard` (`PulseFeedScreen.tsx:205`) and `ActivityCard` (`PulseTab.tsx:541`). Place the image directly on the canvas with a hairline separator between rows. This eliminates card-on-card and restores media-as-color.
- **Move window tabs below the first rail**: In `PulseTab.tsx`, render the first `TrendingRailItem` row *above* the window selector so the first viewport shows media, not chrome. The selector becomes a secondary control below the first impression.
- **Remove the `pulseBanner`** (`PulseTab.tsx:327-335`): it restates the section header below it. Pure text-budget waste.

### 4.6 ExploreCollectionScreen / CategoryDetailScreen

- **Skeleton fidelity**: Replace the uniform 180pt `SkeletonLoader` grid (`ExploreCollectionScreen.tsx:139`) with a `MasonrySkeleton` that varies aspect ratio — the same component `DiscoverScene` uses (`DiscoverScene.tsx:140`). This makes the loading-to-populated transition geometry-stable.
- **Category summary copy**: `CategoryDetailScreen.tsx:162` — replace `"Browse the latest {category} pieces from the community."` with either a real count + recency signal (`"23 new this week"`) or remove the line entirely. Do not ship a sentence that adds no information.

### 4.7 CategoryTreeScreen

- **Remove `editorialSubtitle`** (line 63): "Curated categories, handpicked for you" is AI-slop. The title `{resolvedPrefix}` is sufficient.
- **`viewAllRow` chrome**: The full-width brand-colored CTA (line 167) is a dominant non-media panel above the fold. Move it below the first `VisualCategoryTile` row so media leads, or reduce it to a text link with a chevron.

### 4.8 LooksTab

- **Replace the centered spinner** (`LooksTab.tsx:209-212`) with a masonry skeleton matching the final layout. AGENTS.md §14 is explicit.
- **Creator overlay**: The `creatorOverlay` (line 446) is a pill with `colors.overlay` background — a translucent chip on the image. This is acceptable (it carries identity) but the `mediaCueBadge` (line 464) and `shoppableMarker` (line 476) add two more overlay chips. Three overlays on one tile is dense. Collapse the media-cue and shoppable marker into a single bottom-right indicator when both apply.

### 4.9 PremiumSkeletonTile

- **Shimmer respect for reduced motion**: `PremiumSkeletonTile.tsx` runs a continuous `withRepeat` shimmer (line 33) regardless of `useReducedMotion`. AGENTS.md §17 prohibits "decorative shimmer after loading" and requires "reduced-motion fallbacks for all motion." Gate the shimmer behind `useReducedMotion` — under reduced motion, render a static `surfaceAlt` block.

---

## 5. Macro Improvements (feed architecture, art direction, rhythm, motion)

### 5.1 Feed architecture: from flat grid to authored garden

The home feed currently alternates between a 2-column tile grid and two injected rails (posters at index 4, looks at index 12 — `HomeScreen.tsx:770-775`). This is a correct instinct but under-developed. The flagship architecture is a **module-rhythm system**:

```
[media row] × N → [authored module] → [media row] × M → [authored module] → …
```

Modules are not just rails — they are **topically-oriented clearings**: "Fresh drops from sellers you follow", "Trending in streetwear this week", "Looks the community tagged this morning". Each module has a header that explains *why this is here* (topical orientation), a distinct layout (rail, hero, masonry cluster), and a finite length. The base grid is the variable-reward engine; the modules are the garden clearings.

Concretely: formalize a `FeedModule` type in the feed data union (`HomeScreen.tsx:158-182`) with variants: `posters_rail`, `looks_rail`, `trending_cluster`, `fresh_drops`, `category_hero`. Each module carries its own header component and layout. The `FEATURED_RHYTHM` array (line 703) extends to a `MODULE_RHYTHM` that schedules both featured tiles *and* module clearings.

### 5.2 Art direction system

The focal-point work in `getCategoryFocalPoint` (used in `HomeScreen` and `HomeDiscoveryCard`) must become a **universal contract** for every discovery image surface. Today it is applied in 2 of 6 discovery screens. The fix is a single `ArtDirectedImage` primitive that wraps `CachedImage`/`MediaPreview` and *always* resolves focal point from category, with a per-category crop registry:

| Category | Focal | Notes |
|----------|-------|-------|
| Shoes | bottom-center | avoid toe crop |
| Bags | center | preserve handle |
| Jewellery | center | square, centered |
| Watches | center | square, centered |
| Garments (top) | top-center | preserve collar/silhouette |
| Garments (bottom) | center | preserve waist |

Every discovery surface (`GalleriaScreen`, `GalleriaCollectionDetailScreen`, `PulseTab`, `LooksTab`, `ExploreCollectionScreen`) imports this primitive instead of calling `CachedImage` directly. This is a shared-primitive fix per AGENTS.md §4 ("If three or more screens exhibit the same visual defect, inspect and correct the shared primitive first").

### 5.3 Module rhythm and the "endless garden"

The rhythm should be **deterministic-but-varied** (the current `FEATURED_RHYTHM` approach, extended) and **content-aware**: a module should appear when there is *content to justify it* (e.g. a "Fresh drops" module only when there are ≥3 new listings from followed sellers). This is the Pinterest module-fatiguing principle — modules earn their slot. The feed should never show an empty module or a module with one item.

### 5.4 Motion language

The current motion is mostly correct: spring-driven header collapse (`HomeScreen.tsx:476`), crossfade on tab switch (line 822), `DiscoveryModeNav` indicator slide (`DiscoveryModeNav.tsx:93`). The gaps:

- **No directional slide on feed-mode change**: the feed crossfades (opacity only). A flagship feel adds a subtle vertical translate (8-12pt) so the new content appears to *arrive from below*, not just fade in. Respect reduced motion.
- **No press-scale on Pulse activity rows**: `EventCard` and `ActivityCard` use `activeOpacity` only. Add `scaleValue={0.985}` for a native press feel.
- **Skeleton shimmer not gated by reduced motion** (see §4.9).
- **Galleria hero parallax** is good but the `heroContentStyle` fade (line 278) fades the title out by 50% scroll — on a 62% screen-height hero, the title disappears before the user has scrolled past it. Extend the fade range to `HERO_HEIGHT * 0.75`.

### 5.5 State completeness across the department

Map every discovery surface to the state matrix (AGENTS.md §14):

| Screen | loading | empty | filtered-empty | error | offline | partial |
|--------|---------|-------|-----------------|-------|---------|---------|
| HomeScreen | skeleton ✓ | ✓ | n/a | banner ✓ | ✓ | ✓ |
| BrowseScreen | skeleton ✓ | ✓ | ✓ | ✓ | banner ✓ | — |
| GalleriaScreen | skeleton ✓ | ✓ | n/a | ✓ | banner ✓ | — |
| GalleriaCollectionDetail | skeleton ✓ | ✓ | n/a | ✓ | banner ✓ | — |
| PulseFeedScreen | **missing** | ✓ | n/a | — | — | — |
| PulseTab | — | ✓ | n/a | — | — | partial |
| ExploreCollection | skeleton ✓ | ✓ | n/a | — | — | — |
| CategoryDetail | skeleton ✓ | ✓ | n/a | ✓ | — | — |
| LooksTab | **spinner ✗** | ✓ | n/a | ✓ | — | — |
| DiscoverScene | skeleton ✓ | ✓ | n/a | ✓ | — | — |

PulseFeedScreen, PulseTab, ExploreCollection, and LooksTab all have state gaps. The flagship pass closes every row.

---

## 6. Flagship Acceptance Criteria

### 6.1 Thumbnail test (25% scale)

At 25% scale, every discovery screen must show:
- **Media as the dominant silhouette** — rounded photo rectangles, not grey panels.
- **A clear reading order** — one hero/large tile or one rail, then the grid.
- **No repeated rounded-container dominance** — the silhouette is not "a grid of identical grey rounded rects." Pulse today fails this (a stack of identical activity cards). Galleria passes (hero + rail + masonry have distinct silhouettes).

### 6.2 Squint test

Squinting at each discovery screen, media/identity/content must dominate while navigation and utility chrome recede. Specific failures to correct:
- **Pulse**: the section headers, window tabs, and banner card dominate when squinted — they are solid panels. Flatten them so media leads.
- **CategoryTree**: the brand-colored `viewAllRow` dominates when squinted — it is the brightest non-media object. Demote it.
- **Galleria**: passes — hero image dominates, section headers recede.

### 6.3 Media storytelling

- First viewport of every discovery surface contains **at least two complete media objects** (AGENTS.md §4 density target).
- No generic grey placeholder is the dominant first-viewport story.
- Every image uses category-sensitive focal positioning (via the shared `ArtDirectedImage` primitive).
- Featured and supporting crops are **visibly distinct** — a featured tile is larger and has an editorial overlay; a standard tile is smaller and commerce-literal.

### 6.4 Density target

- Normal list viewport: 4–6 useful rows (Browse, CategoryDetail).
- Discovery viewport: ≥2 meaningful media objects or the beginning of the next module (Home, Galleria, Discover, Looks, Pulse).
- Empty space supports focus, not oversized chrome. The Pulse `windowTabs` row and `pulseBanner` violate this — they consume a full row each without exposing media.

### 6.5 Comparative visual-fidelity delta (per AGENTS.md §4)

Before accepting any screen, record:
```
first useful content Y-position
number of useful objects above fold
visible rounded-container count
largest non-media control size
icon optical size and line-weight consistency
content occluded by sticky navigation/docks
loading vs final geometry shift
```
The flagship pass must show: first-content Y-position ≤ 120pt (below header), ≥2 media objects above fold, ≤2 non-avatar radius sizes, no non-media control > 44pt, loading geometry matching final geometry within 8pt.

---

## 7. Priority & Sequencing

### Phase 1 — Shared primitives (highest leverage, unblocks all screens)

1. **`ArtDirectedImage` primitive**: wraps `CachedImage`/`MediaPreview`, always resolves focal point from category. Replace direct `CachedImage` calls in `GalleriaScreen`, `GalleriaCollectionDetailScreen`, `PulseTab`, `LooksTab`, `ExploreCollectionScreen`. *(Fixes §3.3, §4.3, §4.4, §4.5, §4.8)*
2. **`PremiumSkeletonTile` reduced-motion gate**: static block under reduced motion. *(Fixes §4.9)*
3. **Fallback art direction**: category-tinted neutral + typographic treatment for missing media. *(Fixes §3.1)*

### Phase 2 — Pulse department (most defects per screen)

4. **Flatten Pulse activity cards**: remove card-on-card, hairline separators, media-as-color. *(Fixes §3.2, §3.8, §4.5)*
5. **Pulse first-viewport restructure**: move window tabs below the first rail, remove `pulseBanner`. *(Fixes §3.4, §3.6, §4.5)*
6. **Pulse loading + error states**: add masonry skeleton, error state, offline banner. *(Fixes §3.7, §5.5)*

### Phase 3 — Galleria truthfulness + Looks states

7. **Galleria editorial truthfulness**: remove press affordance from demo-only editorials or build the detail screen. *(Fixes §3.5)*
8. **LooksTab skeleton**: replace centered spinner with masonry skeleton. *(Fixes §3.7, §4.8)*
9. **Galleria masonry meta-height fix**: measure actual meta or adopt FlashList v2 masonry. *(Fixes §4.4)*

### Phase 4 — Home feed authored rhythm

10. **Formalize `FeedModule` system**: extend the feed data union, schedule module clearings with content-aware gating. *(Fixes §5.1, §5.3)*
11. **Wire `featured` flag in `HomeDiscoveryCard`**: full-span editorial tile treatment. *(Fixes §4.1)*
12. **Directional slide on feed-mode change**: add subtle vertical translate, reduced-motion gated. *(Fixes §5.4)*

### Phase 5 — Browse, Category, Explore polish

13. **BrowseScreen pill consolidation + seller chip flatten.** *(Fixes §4.2)*
14. **CategoryTree copy + viewAll demotion.** *(Fixes §3.6, §3.10, §4.7)*
15. **ExploreCollection + CategoryDetail skeleton fidelity.** *(Fixes §3.7, §4.6)*

### Phase 6 — Verification

16. **Per-screen thumbnail + squint test capture** (local, not committed unless requested).
17. **State-matrix re-audit** — confirm every row in §5.5 is closed.
18. **Visual-delta evidence** — record the six metrics from §6.5 before/after.

---

### Key file references

- `frontend/src/screens/HomeScreen.tsx` — `ListingMediaPlaceholder` (L255), `ExploreGridItem` (L300), `FEATURED_RHYTHM` (L703), feed injection (L770).
- `frontend/src/screens/GalleriaScreen.tsx` — `handleEditorialPress` no-op (L521), `GALLERIA_DEMO_MODE` badge (L618), `buildMasonryColumns` (L339).
- `frontend/src/screens/PulseFeedScreen.tsx` — `EventCard` card-on-card (L70, L205).
- `frontend/src/components/explore/PulseTab.tsx` — `windowTabs` (L271), `pulseBanner` (L327), `ActivityCard` (L97, L541).
- `frontend/src/components/explore/LooksTab.tsx` — centered spinner (L209), triple overlay (L446-476).
- `frontend/src/components/discover/HomeDiscoveryCard.tsx` — `mediaPlaceholder` (L162), unused `featured` flag.
- `frontend/src/components/discover/PremiumSkeletonTile.tsx` — un-gated shimmer (L33).
- `frontend/src/screens/CategoryTreeScreen.tsx` — AI-slop subtitle (L63), dominant `viewAllRow` (L167).
- `frontend/src/screens/CategoryDetailScreen.tsx` — template copy (L162).
- `frontend/src/screens/ExploreCollectionScreen.tsx` — uniform skeleton (L139).
