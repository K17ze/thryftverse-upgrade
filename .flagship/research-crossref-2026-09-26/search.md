# Cross-Reference Audit — Search / Browse / Categories / Filters / Visual & Conversational Search

**Date:** 2026-09-26 · **Dept:** search-browse-categories-filters-visual-conversational
**Code audited:** `web/src/app/{search,browse,categories,category}/**`, `web/src/components/{search,filters,visualsearch,convsearch}/**`, `web/src/lib/hooks/visual-search-queries.ts`, `web/src/lib/store/savedSearches.ts`
**References studied (live):** Vinted (faceted search engineering + filter UX), eBay (left-rail refinements, Best Match, saved searches, advanced search), Depop (filter/sort bottom sheets, saved-search alerts, style tags), Pinterest Lens / Flashlight (camera affordance, object-level region selection), Google Shopping (subcategory suggestion chips, rating facets, mobile filter experiments), Airbnb (filter sheet with live "Show N homes" CTA, flexible-matching over-filter recovery).

---

## 1. Reference Grammar (2025–2026 distilled)

### Autocomplete anatomy
- **Vinted:** suggestion dropdown mixes *term completions*, *brand matches* and *category-scoped suggestions* ("boots" → "Boots in Women", "Boots in Men"). Recent searches lead when the field is empty.
- **eBay:** autocomplete includes direct item suggestions with thumbnails, category scope rows, and spell-correction rows.
- **Depop:** recent searches + trending on the empty state; suggestions are terms, not items.
- **Google:** submit row ("Search for X") implicit; matched-span bolding of the *untyped* tail is the universal grammar.
- **Standard semantics:** `role=combobox` + `aria-expanded` + `aria-activedescendant` on the input; `role=listbox`/`role=option` on the menu; ArrowUp/Down cycle, Enter commits, Escape dismisses.

### Recent / suggested / trending grammar
- All references show **recent searches first** (removable, clear-all), then **trending**, then brand/category discovery. Depop additionally surfaces recently-viewed items on the search landing.

### Facet honesty
- **Vinted engineering (canonical statement):** "no click will lead to zero results" — facet options are derived from the current result set, each carrying the count that click would produce; counts cap at "500+".
- **eBay:** left refinement rail, item specifics per category, condition multi-select, buying format; counts per option; collapsible groups with "See more".
- **Google Shopping:** facet rail + clickable subcategory chips above results; testing product-rating facets (2025).
- **Depop:** facets include **colour** and **style tags** (#vintage, #y2k) — resale-fashion grammar requires both.

### Sort semantics
- eBay "Best Match" default; Newly listed; Price ± shipping asc/desc; ending soonest (auctions). Depop: relevance / newest / price low-high / high-low. Vinted: relevance / newest / price.
- Sort is a URL param everywhere — share/back must replay it.

### Filter sheet vs rail
- Desktop = persistent left rail (eBay, Vinted, Google Shopping). Mobile = modal sheet with **live preview count CTA** ("Show 186 homes" — Airbnb; "Show N results" — Depop). One facet surface per viewport.

### Visual-search affordance placement
- Pinterest/eBay/Google Lens: **camera glyph inside or trailing the search bar** — it is peer to the text submit, not a separate feature. Pinterest Flashlight additionally offers **object-level selection** (tap a detected dot or draw a region). Results lead with detected-attribute refinement chips.

### Query refinement & zero results
- Google: "Did you mean X" on *weak* result sets, not only empty ones; "Searches related to" at the bottom.
- eBay: "Search instead for X" / related searches rail.
- Airbnb: **flexible matching** — when over-filtered, show near-matches outside the parameters rather than a dead end.
- Recovery surfaces offer corrected queries, popular searches, and category escapes — never a bare "0 results".

---

## 2. Our Implementation

### Anatomy
- `/search` → `SearchClient` (`components/search/SearchClient.tsx`): field + camera link + "Refine in chat"; empty query → `SearchLanding`; query → `RefinedResults`; exhausted → `SearchRecovery`.
- `/browse` → `BrowseClient`: horizontal category chip rail + `RefinedResults`.
- `/categories` → directory tiles (`CategoryTile`) + expandable index (`CategoryIndex`).
- `/category/[slug]` → `CategoryClient`: subcategory chip rail (`?sub=` deep-linked) + `RefinedResults`.
- `/search/visual` → `VisualSearchClient`: dropzone → query panel + region picker + detected-attribute chips + results machine. Engine: deterministic colour-histogram heuristic (`visualSearchEngine.ts`), honestly labelled "not AI".
- `/search/chat` → `ConvSearchClient`: thread, removable constraint chips, results rail, "Open these results" hand-off via `searchHref()`.

### Verified strengths
| Pattern | Evidence |
|---|---|
| Combobox ARIA | `SearchField.tsx:60-64` role=combobox, aria-autocomplete, aria-expanded, aria-controls, aria-activedescendant; options `role=option` + `aria-selected` (`SearchClient.tsx:271-303`) |
| Keyboard nav | ArrowUp/Down wrap-around + Enter + Escape + scrollIntoView (`SearchClient.tsx:178-202`) |
| Submit-row grammar | "Search for '<term>'" row leads suggestions (`SearchClient.tsx:167-170`) — mobile autocomplete grammar |
| Matched-span emphasis | `splitMatch` bolds the typed fragment in brand (`SearchClient.tsx:74-87, 295-303`) |
| Honest facet counts | `facetCounts.ts:22-54` — each group's base set is "listings passing every *other* filter", so a count = what a click shows. Correct eBay semantics. |
| Live-apply sheet + count CTA | `FilterSheet.tsx:362-373` — "Show N results" footer = Airbnb grammar |
| One facet surface per viewport | `RefinedResults.tsx:99-100, 277-288` — rail ≥lg, sheet <lg, mutually exclusive |
| Sort in URL | `useSortParam.ts` — `?sort=`, router.replace, scroll preserved |
| Did-you-mean | `SearchClient.tsx:130-155, 352-364` — canonical correction runs, results shown with "No results for X — showing Y" notice without URL rewrite |
| Synonym/intent parsing | `searchMatch.ts:223-282` — shared vocabulary bridged from `convSearchEngine.parseIntent` (single source, both directions) |
| Typo tolerance | Levenshtein ≤2 + bigram-Dice ≥0.5 (`searchMatch.ts:147-165`) |
| Zero-results recovery | `SearchRecovery.tsx` — popular searches + stocked category tiles + clear-filters escape |
| Recent searches | `searchHistory.ts` — localStorage, removable chips, clear-all (`SearchLanding.tsx:168-202`) |
| Saved search | `savedSearches.ts` — persisted, alert toggle, describeFilters summary; saved via sheet + toast |
| Visual-search states | Full machine: idle/analyzing(reading→extracting→matching)/populated/empty/error; stale-run guard via `runRef` sequence (`visual-search-queries.ts:118-123, 155-157`); blob URL lifecycle disposed correctly |
| Region-of-interest | `VisualSearchRegionPicker.tsx` — drag/tap/pointer-capture, scrim, % framed live region, keyboard nudge |
| Detected attributes | `VisualSearchRefinementBar.tsx` — removable chips, source honesty ("Guessed from top colour matches" tooltip), restore-all |
| Conv-search honesty | Header: "Rule-based search — full AI matching ships later" (`ConvSearchClient.tsx:156-159`); chips re-run in place (`ConvSearchClient.tsx:126-137`) |
| Category browse | Media-first tiles with fixture-truth counts + expandable subcategory index with live counts (`categories/page.tsx`, `CategoryIndex.tsx`) |

---

## 3. Gap Table

| # | Pattern | Reference | Status | Severity | File:line |
|---|---|---|---|---|---|
| 1 | **Facet state in URL** (share/back/bookmark replays filters) | eBay `LH_*` params, Vinted URL facets — standard commerce contract | **MISSING** — facets are component state only; only `?sort=` persists. Manually applied filters are lost on share/back | **HIGH** | `RefinedResults.tsx:94-96` (useState); `SearchClient.tsx:70` comment confirms exclusion |
| 2 | **Colour facet** | Vinted, Depop, eBay all facet colour — core resale-fashion grammar | **MISSING** from `ListingFilters` — the colour vocabulary already exists (`visualSearchTypes.ts:COLOR_VOCAB`) and conv-search already filters by it (`convSearchEngine.ts:678-681`); plumbing exists, UI doesn't | **HIGH** | `filterTypes.ts:25-33` |
| 3 | **Multi-select facet values** (brand, size) | eBay/Vinted checkbox multi-select; mobile selection is `brands: string[]`, `sizes: string[]` | **DIVERGENT** — web facets single-select (`brand`, `size` are `string`, not arrays). Parity break with mobile | **MED** | `filterTypes.ts:31-32`; `RefinementRail.tsx:202-217` |
| 4 | **Member search** | Placeholder promises it: "Search items, brands, members" | **MISSING** — `matchListings` only searches listings; no member results section. Truthfulness defect (AGENTS honest-UI) | **MED** | `SearchField.tsx:34`; `searchMatch.ts:257` |
| 5 | **Category-scoped autocomplete rows** ("X in Women") | Vinted autocomplete offers dept-scoped suggestions; Google Shopping clickable subcategory chips | **MISSING** — suggestions are flat terms only | **MED** | `searchMatch.ts:297-343` |
| 6 | **Brand facet search-within-list** | Vinted/eBay offer a search box inside the brand facet when many options | **MISSING** — brands cap at "Show N more" only | **MED** | `RefinementRail.tsx:196-207`; `FilterSheet.tsx:253-270` |
| 7 | **"Most liked" sort** | Mobile SORT_OPTIONS include it (`frontend/.../filterTypes.ts:13`) | **DIVERGENT** — web has 4 sorts, no `most-liked`; parity claim in filterTypes header is inaccurate | **MED** | `filterTypes.ts:8-15` |
| 8 | **Relevance ranking honesty** | eBay "Best Match" = actual relevance ranking | **PARTIAL** — `sortListings('relevance')` returns input order; `matchListings` filters but never scores, so "Best match" is catalogue order, not match quality | **MED** | `filterTypes.ts:77`; `searchMatch.ts:264-278` |
| 9 | **Related-searches / refinement row** at bottom of results | Google "Searches related to", eBay related-searches rail | **MISSING** — populated results end at the grid | **MED** | `RefinedResults.tsx:245-275` |
| 10 | **Did-you-mean on weak (non-zero) sets** | Google offers correction whenever confidence is low, not only at 0 | **PARTIAL** — `suggestion` computed only when `matched.length === 0`; a typo returning 2 results gets no correction offer | **MED** | `searchMatch.ts:280` |
| 11 | **Sold-item filter/toggle** | eBay "Sold items" facet; Vinted marks sold | **MISSING** — sold listings are included in results (scrim on `ProductTile`) with no way to hide/filter them; landing excludes them (`SearchLanding.tsx:25`) so behaviour is inconsistent | **MED** | `searchMatch.ts` (no isSold handling); `filterTypes.ts` |
| 12 | **Did-you-mean inside recovery surface** | Recovery should offer the computed near-miss term | **PARTIAL** — when a suggestion exists but also misses, `SearchRecovery` never surfaces it; only generic popular searches | **LOW** | `SearchClient.tsx:332-337`; `SearchRecovery.tsx` (no suggestion prop) |
| 13 | **Filter presets** (saved filter combos) | Mobile `FilterPresets.tsx` — saved + quick-apply | **MISSING** on web | **LOW** | — |
| 14 | **Item-level suggestions in autocomplete** (thumbnails/direct products) | eBay/Pinterest autocomplete mixes items + terms | **MISSING** — term rows only | **LOW** | `SearchClient.tsx:167-171` |
| 15 | **Visual-search entry on every image** ("find similar" on tiles/PDP) | Pinterest: any Pin is a visual-search entry; eBay: "find visually similar" per item | **MISSING** — camera affordance exists in the search bar (`SearchClient.tsx:314-320`) and landing, but no per-listing visual pivot | **MED** | `ProductTile.tsx` (no affordance) |
| 16 | **Image paste / URL input** for visual search | Google Lens accepts paste + URL | **PARTIAL** — file pick + drag-drop only; no clipboard paste, no URL | **LOW** | `VisualSearchDropzone.tsx` |
| 17 | **Region box resize via keyboard** | Full keyboard operability | **PARTIAL** — arrows nudge position only; cannot resize the box without pointer | **LOW** | `VisualSearchRegionPicker.tsx:115-134` |
| 18 | **Pagination / infinite scroll** | All references paginate or infinite-scroll results | **MISSING** — `MasonryGrid` renders the whole set; fine at fixture scale, unbounded in live mode | **LOW** | `RefinedResults.tsx:255-256` |
| 19 | **Multi-object detection affordance** | Pinterest Flashlight dots on detected objects | **MISSING** — manual region framing only (acceptable for a colour heuristic; do not fake dots) | **LOW** | `VisualSearchQueryPanel.tsx` |
| 20 | **Home/End in suggestion listbox** | Full listbox keyboard spec | **PARTIAL** — ArrowUp/Down/Enter/Escape only | **LOW** | `SearchClient.tsx:185-202` |
| 21 | **Category depth beyond 2 levels** | Vinted taxonomy is 3+ levels deep | **PARTIAL** — `CATEGORY_TREE` is a flat hardcoded map; three departments (vintage/designer/streetwear) have zero children | **LOW** | `taxonomy.ts:10-29` |
| 22 | **Recently-viewed on search landing** | Depop landing shows recently viewed | **MISSING** | **LOW** | `SearchLanding.tsx` |
| 23 | **Ending-soon contextual sort (auctions)** | Mobile injects it for auction contexts (`isAuctionSortContext`) | **MISSING** on web — web has an /auctions surface; divergence risk | **LOW** | `filterTypes.ts:10-15` |

---

## 4. Top Caveats (quality-of-truth findings)

1. **Sort honesty:** "Best match" is a label on unranked input order. `matchListings` returns the filtered array in catalogue order; there is no relevance score. Either rank matches (e.g., term-coverage + likes weighting) or rename the default to something honest ("Newest" is honest and cheap). `filterTypes.ts:76-95`, `searchMatch.ts:257-282`.
2. **Facet counts are genuinely honest** — each option's count is computed against the result set with its own dimension relaxed (`facetCounts.ts:21-54`), which is exactly the eBay/Vinted contract ("no click leads to zero results"). Verified, not claimed.
3. **Visual search degrades gracefully and truthfully:** validation happens before any state commit (`visual-search-queries.ts:260-287`), decode failure lands on an explicit error state with retry that re-reads the file (`:209-222`), stale analysis can't land under a newer photo (`runRef` sequence), and the UI never claims AI. The honest note is honest: it *is* a colour-similarity heuristic. Solid.
4. **Filter state durability is the biggest structural gap:** sort is URL-persisted but facets are surface state. Saved searches replay correctly (they re-seed via params), but a user who manually builds a facet set and copies the URL shares an unfiltered page. Live-mode note: facet params exist in `SEED_PARAM_KEYS` — the read path is already built; only the write-back is missing.
5. **Placeholder overpromises scope:** "Search items, brands, members" — members are not searchable anywhere in the surface. Either implement member results or narrow the placeholder. Small fix, real honesty defect.
6. **Did-you-mean is well-built but under-applied:** the correction machinery (vocab + Levenshtein + Dice) only fires at exactly zero hits, and `SearchRecovery` never receives the computed suggestion, so a correction that itself misses produces a generic recovery with no "did you mean" link.
7. **Facet selection model diverges from mobile:** mobile multi-selects brands/sizes (`string[]`); web single-selects (`string`). The URL contract (`brand=`, `size=` singular values) bakes the divergence in — fixing later means a param-shape migration; decide now.
8. **Keyword coverage is good but not complete:** suggestion listbox lacks Home/End; region picker keyboard path can move but not resize a region; autocomplete has no item-level (thumbnail) rows.

---

*Cross-referenced against mobile (`frontend/src`) where parity is claimed in file headers: filterTypes sort set, multi-select shape, FilterPresets and ending-soon contextual sort are the confirmed divergences.*
