# Deep blueprint — Home, Explore, Search

This document converts the earlier strategy into screen-level implementation instructions.

---

## A. HomeScreen — current anatomy to challenge

Current source contains several separate visual ideas:
- top-level Home identity/actions;
- Poster/story content;
- For You / Following;
- masonry listing cards;
- recommendation sections;
- item metadata under media;
- seller identity on many tiles;
- multiple insertion families.

The problem is not that any one of these is wrong. The problem is that the feed has too many reasons to interrupt the visual rhythm.

### Phase 4 target: a 3-layer Home

#### Layer 1 — Social pulse
A single compact lane that answers “what from people I follow is fresh?”

Allowed:
- Poster/story moment;
- creator/closet update if truly social.

Not allowed:
- separate rail for every social content type.

#### Layer 2 — Personalized visual commerce
The main masonry feed.

The tile itself is the recommendation. Do not add a “Recommended for you” label to every object.

#### Layer 3 — Deliberate editorial interruption
Occasional:
- Look;
- themed collection;
- Galleria feature;
- live auction event.

The interruption must have a different geometry and clear reason.

---

## B. Feed role scheduler

Introduce a display contract separate from ranking:

```ts
type FeedDisplayRole =
  | 'masonry_standard'
  | 'masonry_tall'
  | 'look_feature'
  | 'poster_social'
  | 'editorial_wide'
  | 'live_event'
  | 'continuation';
```

The ranking service decides *what* appears.
The display planner decides *how* the already-ranked item should appear.

### Rules

- Never change product ordering for the sake of a pretty pattern.
- Avoid deterministic “every 7th item is wide” if it produces unrelated editorial emphasis.
- Prefer semantic display hints returned from content type/ranking metadata.
- Persist role for the loaded page so a re-render does not reshuffle geometry.
- Pagination must not produce two consecutive interruption modules.

### Visual cadence recommendation

Typical 12-item span:
- 8–10 normal/tall masonry;
- max 1 social/Look insertion;
- max 1 wide/editorial/live insertion.

This is a **budget**, not a rigid pattern.

---

## C. Standard listing tile contract

### At rest
Show:
- media;
- price;
- one identity line.

Candidate identity hierarchy:
1. brand + item type if structured;
2. listing title if clean;
3. seller only if seller identity is itself a recommendation signal.

### On interaction or context
Optional:
- save;
- seller;
- size;
- condition;
- shipping.

Do not permanently show all.

### Why
A Pinterest-style feed is visually scannable because image comparison occurs before text reading. Marketplace facts remain necessary, but they should not turn every cell into a mini Product Detail.

---

## D. Metadata decisions

### Price
Keep visible for commerce intent.

### Seller avatar + handle
Current implementation can make this repetitive.
Reserve for:
- followed creator;
- editorial curator;
- seller whose identity is meaningful;
- promoted social content.

### Condition
Show only if:
- condition is unusual;
- condition is part of active search/refinement;
- listing is luxury/evidence-sensitive.

### Size
Useful when user size preference is known and this materially aids decision. Otherwise detail/search filter.

### Engagement count
Hide by default unless social proof is strategically important.

---

## E. Home first 3 viewport wireframe

### Viewport 1
```
[quiet Home top bar]
[social/poster pulse — one lane]
[masonry begins immediately]
```

### Viewport 2
```
[masonry]
[masonry]
[masonry]
```

### Viewport 3
```
[Look/editorial interruption]
[masonry resumes]
```

Avoid:
```
Header
Stories
Section title
For You/Following
Rail
Section title
Masonry
Section title
Another rail
```

---

# Explore deep blueprint

## A. Current control load

Current `SearchScreen` has:
- screen title Explore;
- global-search field;
- visual-search button;
- 4-part segment;
- offline/error states;
- content.

Before media begins, the user can see a large amount of UI.

## B. Recommended mode hierarchy

Preferred:
- Discover
- Looks
- Pulse

Remove `Trending` as permanent sibling.

Where Trending goes:
- Discover section “Trending now”
- Pulse ranking/scope
- search sort/refinement only when source is real.

### Code cleanup
Rename old `EditTab` to product concept if retained.
A component called Edit that renders Trending is internal semantic debt and will confuse future agents.

---

## C. Explore first viewport

```
Explore
[ Search items, brands & people        camera ]
[ Discover   Looks   Pulse ]
[ first media row/grid begins ]
```

No shortcut card before media.
No item-count subtitle.
No persistent sync status in healthy state.

### Search field behavior
When tapped, it should visually continue into Global Search rather than feel like a modal teleport.

Implementation options:
- same route with `mode='focused'`;
- shared transition/geometry;
- single controller mounted in both;
- navigation with identical top shell.

---

# GlobalSearch deep blueprint

## A. Idle state
Priority:
1. recent search, if any;
2. saved search, if any;
3. Browse categories;
4. visual search;
5. personalized suggestion.

Do not label first category subset “Trending” without trend data.

## B. Typing state
Request control:
- debounce only network request, not input update;
- show suggestions while waiting;
- cancel stale query;
- preserve keyboard.

Suggested suggestion sources:
- category;
- brand;
- recent query;
- popular server query if actual data;
- exact product terms.

## C. Results state
Top:
```
[search field]
[Items | People]
[Filter   Sort: Recommended]     238 results
[active filters only if present]
```

Grid below.

### Filter rule
Do not show:
- `Ending soon` for fixed-price-only results;
- auction-only facets when no auction scope;
- irrelevant size/brand facets if result category doesn't support them.

### Active filter chip rule
Maximum one horizontal row.
If many filters:
`Filters · 5`
plus at most 2 most important active tokens.

---

# Search psychology and references

## Pinterest
Image is a search surface. This supports making Thryftverse Visual Search a first-class adjacent affordance, not an “AI feature.”

## Apple 2026
Search can be a dedicated discovery area or focused entry. Thryftverse’s Explore tab fits the “rich discovery” case; it does not need a separate unrelated Search world.

## Depop / Vinted
Text relevance + structured item ontology must be reflected in seller listing quality and result refinement. Visual beauty must not undermine exact filters.

---

# Micro-interactions

## Tap feed tile
- pressed opacity/scale only;
- no generic ripple over photography on iOS;
- Android uses platform-appropriate press feedback without hiding image.

## Long press
Potential preview/quick actions:
- Save;
- Hide;
- Similar;
- Share.

Do not overload default tile.

## Save
Immediate icon state.
No toast for routine save unless context requires.

## Follow-up recommendation
If user chooses Similar, use this as a high-intent search transition retaining source image/identity.

---

# Test matrix

Home:
- first load;
- cached load;
- 50+ items;
- many videos;
- no social content;
- only listings;
- low-quality/missing media;
- followed creators.

Explore:
- each mode;
- offline;
- empty;
- refresh.

Search:
- idle;
- keyboard;
- suggestion;
- normal listing query;
- auction query;
- luxury query;
- people;
- visual image;
- filters;
- zero result.

---

# Visual scorecard

Fail if:
- more than 30% of first Explore viewport is permanent controls;
- every Home tile has 4+ metadata lines;
- two different titled rails appear in one viewport;
- “Trending” is not data-backed;
- search result sort includes irrelevant commerce-family options;
- seller avatar repeats under nearly every feed tile;
- normal healthy browsing exposes sync/status infrastructure.

Pass when:
- imagery produces the page rhythm;
- search is obvious but not visually dominant until used;
- filters feel attached to the current result;
- Explore is understandable without learning internal content types.
