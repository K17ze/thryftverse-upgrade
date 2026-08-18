# 04 — Search, Visual Search, Conversational Search & Filtering

**Department:** Search, global search, visual search, conversational search, saved searches, filter
**Programme:** ThryftVerse Flagship Upgrade
**Date:** August 2026
**Scope surfaces:** `SearchScreen.tsx`, `GlobalSearchScreen.tsx`, `VisualSearchScreen.tsx`, `ConversationalSearchScreen.tsx`, `SavedSearchesScreen.tsx`, `FilterScreen.tsx`, `components/search/*` (3 files), `services/conversationalSearchApi.ts`, `services/searchAutocompleteApi.ts`, `services/listingsApi.ts` (visual search), `components/VisualSearchCamera.tsx`

This report is a research artefact. It audits the current production search stack against 2026 competitor benchmarks and the AGENTS.md §4 / §11 quality and truthfulness bars, then defines the macro/micro improvements, acceptance criteria, and sequencing for the flagship pass. Per AGENTS.md §10, the deliverable is visible product improvement — this document exists only to de-risk that implementation.

---

## 1. 2026 Competitor Benchmark

### 1.1 Pinterest Lens & visual search (2026 state)

Pinterest is the category-defining visual discovery app and the most relevant benchmark for ThryftVerse's visual search. As of 2026, Pinterest's visual search stack has moved decisively past "upload a photo, get a grid." The defining advances:

- **Multimodal, VLM-powered refinement.** Pinterest now uses Visual Language Models (VLMs) to *generate the words* for why a user likes a Pin — decoding an image into aesthetic, colour palette, fit, and product-category tokens that the user can then refine against (Pinterest Newsroom, "Introducing new visual search features"; TechCrunch, May 2025). This is the inverse of ThryftVerse's current flow, where the user must *type* the description into a free-text field after capturing.
- **Object-level glow + tap-to-search.** Searchable/shoppable objects in an image glow with an animated highlight; tapping any glowing object scopes the search to that object. Pinch-to-zoom narrows the region. This is recognition-over-recall made literal: the system shows the user *what it can see* rather than asking them to name it.
- **Long-press to search from feed.** Visual search is no longer gated behind a dedicated camera screen — users long-press any Pin on the home feed to launch visual search. This removes the modal context switch that ThryftVerse currently imposes (Explore → VisualSearch route).
- **Refinement bar with style/occasion/colour axes.** After an initial visual match, Pinterest offers a refinement bar ("more Y2K", "formal occasion", "different colour") that operates on the *visual* result set, not a fresh text query.
- **Pinterest Assistant (multi-turn conversational discovery).** Launched 2026, powered by open-source vision-language models optimised at scale on AWS (Pinterest investor release, 2026). This brings multi-turn conversational discovery *into* the visual search experience — the conversation and the image are the same surface, not two separate routes.
- **$4B AWS commitment through 2031** to accelerate the AI roadmap, Taste Graph, and multimodal models. The strategic signal: visual search is the product, not a feature.

### 1.2 Instagram search (2026 state)

Instagram is the benchmark for *social* search — finding people, content, and topics, not just products. Meta's transparency centre (updated June 2026) confirms Instagram Search is now an AI-ranked system across hashtags, places, reels, posts, profiles, and audio. Adam Mosseri publicly admitted in 2025 that Instagram's content search "is not very good" and that Meta had strengthened the search team. The 2026 trajectory:

- **Multi-scope results.** Top / Accounts / Tags / Places / Audio — scope tabs with live counts, exactly the pattern ThryftVerse's GlobalSearchScreen already imitates with Items | People.
- **Recent searches as the first-viewport anchor.** Tapping the search bar surfaces recent searches first; typing progressively filters. Instagram treats recents as the primary recognition scaffold, not an afterthought section.
- **Personalised ranking using follower graph + interaction history** as signals, not just text match. ThryftVerse's `rankedListings` already does a lightweight version of this (affinity profile from wishlist), which is a genuine strength to preserve.
- **Keyword search across captions/bios** — the signal that social search is moving from "find the account" to "find the content." For a resale marketplace, the equivalent is searching listing *descriptions and titles*, which ThryftVerse's backend `searchListingsFromApi` already supports.

### 1.3 2026 AI / conversational search patterns

- **Google Search Live (global, 2026)** — real-time multimodal voice + camera conversation in AI Mode, powered by Gemini 3.1 Flash Live. The user can speak, point the camera, and get spoken answers with follow-ups. The conversation persists across app switches via Live Activities.
- **Google I/O 2026** — the biggest Search box upgrade in 25 years: dynamically expanding input, AI-powered suggestions beyond autocomplete, multimodal inputs (text, images, files, videos, Chrome tabs), and "Search agents" that run in the background. The strategic lesson: the search *box itself* is becoming an AI surface, not just a text input.
- **YouTube "Ask YouTube"** — conversational search rolled out to mobile in 2026, accessed via an "Ask" option in the search bar. The pattern: conversational search is an *entry mode* on the main search surface, not a separate destination screen.
- **Perplexity** — cited sources for every answer, thread follow-ups, voice input. The trust pattern (citations, source disclosure) is directly relevant to AGENTS.md §11.
- **Apple WWDC26 "Design intuitive search experiences"** — Liquid Glass search patterns, search field placement impacting where the field animates, bottom-toolbar search animating up over the keyboard for reachability, and a single primary search entry point for tabbed apps. The guidance is explicit: tabbed apps should have *one* canonical search space, not per-tab search.

### 1.4 2026 mobile filter UX patterns

- **Bottom-sheet / full-screen overlay is the mobile-native pattern** (UXPin 2026, SAP Fiori 2026, Tadable 2026). The filter button lives top-right or in a sticky bar; the sheet slides up; "Clear all" and "Apply" are fixed at the bottom; the sheet supports swipe-down to close. ThryftVerse's `FilterScreen` already implements this correctly with a gesture-driven bottom sheet — this is a genuine strength.
- **Result count on the Apply button** ("Show 47 results") is now table stakes. ThryftVerse does this (`applyLabel = Show ${resultCount} items`).
- **Applied filters visible as chips above results** at all times, because the sheet itself is hidden. ThryftVerse exposes an `activeFilterCount` badge on the filter icon but does *not* render the active filter chips themselves above the result grid — a gap.
- **Prioritise top 3–4 most-used filters; push the rest to "Advanced."** Mobile filter sheets that show every axis at equal weight fail the density target.
- **Asynchronous filtering with live count updates** as the user toggles, so the Apply button count is never stale.

---

## 2. Psychology & Principles

### 2.1 Recognition over recall

The single most important principle for a resale marketplace search. Users can *recognise* the jacket they want far more easily than they can *recall* its brand, category, and size as typed tokens. Pinterest's glow-and-tap and Google Lens's multimodal box both operationalise this: the system presents what it can see, and the user confirms. ThryftVerse's current visual search inverts this — it asks the user to type "black leather jacket" into a free-text field after capturing the photo, which is recall labour on top of a recognition intent.

### 2.2 Progressive filtering

Users rarely know their exact filter set up front. The 2026 pattern is: start broad, narrow incrementally, see the count move live. This is the opposite of a modal filter sheet that requires the user to commit to all axes at once before seeing any result. ThryftVerse's bottom-sheet filter is correct *mechanically* but is used as a one-shot commit — there is no progressive, in-result refinement chip bar that lets the user narrow without re-opening the sheet.

### 2.3 Query disambiguation

"Jordan" could be a brand, a person, or a place. "Denim" could be a category or a style. 2026 search surfaces disambiguate via scope tabs (Instagram), typed suggestion chips with icons (Pinterest), or a clarifying assistant turn (Google). ThryftVerse's `searchSuggestions` in GlobalSearchScreen already tags suggestions as `brand | category | item` with distinct icons — this is good. The gap is that the disambiguation disappears the moment the user submits, and the results do not show *which* interpretation was used.

### 2.4 Visual-first discovery ("I'll know it when I see it")

The resale shopper's dominant mode is browsing, not querying. The first viewport of any search landing should therefore be *media*, not a text-heavy dashboard of sections. Pinterest's home feed, Instagram's Explore grid, and Depop's discover tab all lead with imagery. ThryftVerse's GlobalSearchScreen discover landing currently leads with "Recent searches" and "Saved searches" *text rows*, then categories, then a masonry grid at the bottom — media is buried below the fold. This inverts the discovery hierarchy.

### 2.5 The honesty contract (AGENTS.md §11)

Every visible control must perform a real action, navigate truthfully, show a truthful disabled state, or be removed. For search this means: no "AI" labels on keyword matching, no fabricated match counts, no "coming soon" banners that mask a missing backend. The conversational search service is already honest about this (demo mode flag, "matched keywords" label), but the *banner copy* ("Full AI coming soon") is a §11 violation — it is a promise of future capability presented as current UI.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### 3.1 Conversational search: AI-slop responses and "coming soon" banner

**File:** `ConversationalSearchScreen.tsx:580`, `services/conversationalSearchApi.ts`

The conversational search service is, by its own documentation, *deterministic keyword matching* — not an LLM. The honesty scaffolding is mostly correct: `CONVERSATIONAL_SEARCH_DEMO_MODE = __DEV__`, `isDemo: true` on every entity, "matched keywords" labels, `AITrustSignal` confidence derived from chip count. The defects:

- **"Full AI coming soon" banner (line 580).** This is a direct AGENTS.md §11 violation. The banner text reads: `AI search is in demo mode — using keyword matching. Full AI coming soon.` A "coming soon" promise inside production UI is explicitly prohibited. The truthful framing is: "Keyword matching — we extract filters from your description." No future-tense AI promise.
- **Fabricated match count.** `estimateMatchCount` (service line 323) is a deterministic function of filter count (`base = 120; base -= 18 * brands.length; ...`), not a catalogue query. The UI presents `estimatedMatchCount` as "around ${matchCount} items" in the assistant bubble. This is a fabricated number presented as a real estimate. Per §11, do not fabricate data. The truthful version either queries the real count or omits the number and says "Tap View results to see matches."
- **Generic AI-slop assistant copy.** `buildAssistantContent` (line 355) returns templated strings: `"I matched these keywords:\n${summary}\n\nBased on those, I found around ${matchCount} items. Tap "View results" to see them, or refine below."` This reads as chatbot filler, not a crafted product voice. The "I" persona implies an agent that does not exist.
- **Refinement suggestions are static.** `buildRefinementSuggestions` always returns `['under £30', 'under £50']` or `['over £100']` plus 'sustainable only' / 'in black' / 'size 9' — hardcoded regardless of the actual catalogue or the user's query. These are not real refinements; they are decorative chips.

### 3.2 Visual search: missing affordances and weak entry

**File:** `VisualSearchScreen.tsx`, `components/VisualSearchCamera.tsx`

The visual search flow has real strengths: a Google Lens-style full-screen camera (`VisualSearchCamera`), an Instagram-style scanning animation with corner brackets and scanline, an honest `resultNote` that admits when results are category/brand-filtered rather than visually matched (`visualMatching: false`), and a `PinterestMasonryGrid` results display. The defects:

- **No object-level tap-to-search.** The user captures a whole photo and gets a whole-grid result. There is no glow, no object detection, no tap-on-the-jacket-to-search-just-the-jacket. This is the single biggest gap vs. Pinterest Lens 2026.
- **No long-press-to-search from feed.** Visual search is gated behind a dedicated `VisualSearch` route reachable only from the Explore search bar camera icon and the GlobalSearch camera icon. A user browsing the discover masonry grid cannot long-press a listing image to find visually similar items. This is a missed recognition-over-recall opportunity.
- **Free-text description field is recall labour.** `renderRefinementBar` (line 443) puts a `TextInput` ("e.g. black leather jacket") as the primary refinement. The user already captured a photo — asking them to *also* type a description is the inverse of the Pinterest VLM pattern where the system generates the words.
- **`visualMatching` is always false in practice.** The backend (`listingsApi.ts:216`) returns `visualMatching: false` "until an ML image-similarity model is deployed." The UI honestly surfaces this via `resultNote`, but the result is that "visual search" is currently *category/brand/price filtering with a photo attached*. The photo is decorative. This is borderline §11: the feature is named "Visual Search" but does not do visual matching. The honest path is either (a) ship real image embedding similarity, or (b) reframe the surface as "Photo search" with a truthful note that matching is by description/category, not by image features.
- **Category rail derived from cached listings, not the photo.** `availableCategories` (line 114) is computed from the full `listings` array, not from the captured image's detected category. The chips are the same regardless of what the user photographed.
- **Brand suggestions are global top brands, not photo-relevant.** Same issue — `brandSuggestions` (line 129) is the top-6 brands across all listings.

### 3.3 Global search: weak recent/saved/trending states and chrome-heavy landing

**File:** `GlobalSearchScreen.tsx`

The global search screen is the most complex surface in the department (~1450 lines). It has real strengths: backend `searchListingsFromApi` integration, affinity-based ranking from wishlist, scope tabs (Items | People) with live counts, masonry grid with deterministic image heights, and a focus-state vs. resting-state distinction. The defects:

- **Discover landing leads with text, not media.** The first viewport when `isDiscoverLanding && !isSearchFocused` shows: Recent searches (text rows) → Saved searches (text rows) → Categories (emoji pills) → Discover masonry grid. Per §2.4, media should dominate. The masonry grid is the most valuable module and it is at the bottom of a long scroll.
- **Duplicated recent/saved sections.** The focus state (line 980) and the resting state (line 1067) render near-identical "Recent searches" and "Saved searches" sections with slightly different layouts. This is code duplication that produces visual inconsistency — the two states should share a composed component.
- **`searchSuggestions` is client-side only.** The live suggestions dropdown (line 651) derives from cached `listings` titles/brands/categories. It does not call the backend autocomplete service (`searchAutocompleteApi`) or `searchListingsFromApi`. On a cold cache, the dropdown is empty. The dedicated `SearchAutocomplete` component (which *does* use the autocomplete service) is not wired into GlobalSearchScreen at all — it exists as an orphaned component.
- **`getBroadenedSuggestions` returns hardcoded `['women', 'men']`.** (line 167) For a single-token query with no multi-word broadening, the function falls back to literal `'women'` and `'men'` strings. These are not real suggestions derived from the catalogue — they are hardcoded fallbacks presented as suggestions. §11 risk.
- **Sort cycling is a hidden gesture.** `handleCycleSort` (line 745) cycles through 5 sort options on a single icon tap with no visible label. The user has no idea what the current sort is until they tap, and tapping advances blindly. This fails the "clear enabled state" and "recognition over recall" bars.
- **No active-filter chips above results.** The filter bar shows a count badge (`activeFilterCount`) but not the actual active filters as removable chips. The user must open the full FilterScreen to see or remove a single active brand.

### 3.4 Saved searches: functional but flat

**File:** `SavedSearchesScreen.tsx`

This screen is functionally complete: filter tabs (All / New), new-match badges, alert toggle, remove, relative-time meta, mark-all-seen, and an honest empty state with a CTA. The defects are compositional:

- **Every row is a card.** `searchCard` (line 168) wraps each saved search in a rounded surface with a hairline border. Per AGENTS.md §4 "surface budget," a list of same-structure rows should use flat canvas + hairline separators, not N repeated cards. The thumbnail test fails: at 25% scale, the silhouette is a stack of rounded rectangles.
- **Icon-in-circle chrome.** `searchIconWrap` (line 186) puts the notification/bookmark icon in a 30pt filled circle. Per §4 "visible containment must have meaning," an ordinary row icon does not need a persistent fill. This is chrome-heavy.
- **No preview of *what* the search returns.** The row shows query text + filter meta + "checked 3h ago" but no thumbnail of a representative result. For a visual-first marketplace, a saved search row without a single image is a missed recognition cue.

### 3.5 Filter screen: correct pattern, dead options and mock fallbacks

**File:** `FilterScreen.tsx`

The filter screen is architecturally sound: gesture-driven bottom sheet with half/full snap points, live result count on Apply, presets, "My sizes" with long-press-to-save, sustainability toggle, and a loading skeleton. The defects:

- **`MOCK_BRANDS` and `MOCK_SIZES` fallbacks.** (lines 167–168) When `listings` is empty or has no brands/sizes, the filter falls back to hardcoded `['Nike', 'Adidas', 'Stussy', 'Carhartt', ...]` and `['XS', 'S', 'M', 'L', 'XL', 'XXL']`. These are presented as real filter options. If the user selects "Nike" and there are no Nike listings, the result count is 0 — a dead filter. Per §11, show a truthful disabled/empty state, not fabricated options.
- **"Ending soon" sort option with no auction context.** `SORT_OPTIONS` includes `'Ending soon'` (line 59) but the filter screen is used for general browse/search, not just auctions. For non-auction listings this sort is meaningless and will produce an arbitrary order. Dead control.
- **Sustainability toggle is a client-side heuristic.** `isSustainableGrade` estimates grade A/B from condition/category/brand/location. The caption honestly says "Estimated grade A or B items" — this is truthful. But the toggle is presented alongside real filters (brand, size, condition, price) without visual distinction that it is an estimate. Minor §11 risk.
- **No active-filter chips rendered back on the calling screen.** The sheet applies filters to `browseFilters` store, but the calling screen (GlobalSearch/Browse) only shows a count badge, not the chips. The filter state is invisible until the sheet is reopened.

### 3.6 Search components: orphaned and under-wired

**Files:** `components/search/SearchAutocomplete.tsx`, `SearchHistoryManager.tsx`, `TrendingSearches.tsx`

Three purpose-built search components exist but are not fully wired into the production search flow:

- **`SearchAutocomplete`** — a polished FlashList dropdown with trending/recent/suggestion sections, matched-portion highlighting, confidence dots, and a demo-mode indicator. It consumes the `searchAutocompleteApi` service. **It is not rendered in `GlobalSearchScreen`**, which instead implements its own inline `searchSuggestions` dropdown from cached listings. The better component is orphaned.
- **`SearchHistoryManager`** — a pin/delete/clear-all manager for search history with empty state. No screen renders it. GlobalSearchScreen manages recents via `AsyncStorage` directly with no pin or per-item delete UI.
- **`TrendingSearches`** — a ranked list with trend direction (up/down/new/stable) and optional category grouping. No screen renders it. GlobalSearchScreen has no trending module at all.

These components represent real product depth that was built but never connected. Per AGENTS.md §7 (canonical implementation) and §8 (preserve and elevate), the flagship pass should wire them in rather than rebuild.

---

## 4. Micro Improvements

These are localised, low-risk fixes that can land in the first sprint without architectural change.

1. **Remove the "Full AI coming soon" banner.** (`ConversationalSearchScreen.tsx:580`) Replace with a truthful, present-tense label: "Keyword matching — we extract filters from your description." No future-tense AI promise. Direct §11 fix.

2. **Remove the fabricated match count from assistant bubbles.** (`conversationalSearchApi.ts:323`, `ConversationalSearchScreen.tsx:247`) Either query the real count via `searchListingsFromApi` + filter application, or replace "around ${matchCount} items" with "Tap View results to see matches." Do not present a deterministic formula as a catalogue estimate.

3. **Rewrite `buildAssistantContent` to drop the "I" persona.** The assistant is keyword extraction, not an agent. Copy should be declarative: "Matched: Brand Nike, Category sneakers, Size 9, under £50. Tap View results." No chatbot filler.

4. **Replace `getBroadenedSuggestions` hardcoded `['women', 'men']`.** (`GlobalSearchScreen.tsx:167`) Derive broadened tokens from the canonical category tree (`CATEGORIES`) or omit suggestions when none are real. No hardcoded fallback strings.

5. **Show current sort label, not a blind cycle icon.** (`GlobalSearchScreen.tsx:745`) Replace the single `swap-vertical` icon with a labeled sort chip ("Recommended ↓") that opens a small popover or cycles with a visible label. Recognition over recall.

6. **Render active-filter chips above the result grid.** (`GlobalSearchScreen.tsx:1345`) When `activeFilterCount > 0`, render removable chips (brand, size, condition, price range) in the filter bar. Tapping a chip removes that single filter without reopening the sheet. This closes the "applied filters must be visible at all times" gap.

7. **Remove `MOCK_BRANDS` / `MOCK_SIZES` fallbacks.** (`FilterScreen.tsx:167–168`) When no derived options exist, show a truthful empty section ("No brands in this category yet") rather than fabricated options that produce 0-result filters.

8. **Remove or gate "Ending soon" sort.** (`FilterScreen.tsx:59`) Only show this option when the context is an auction category. For general browse/search, omit it. Dead control removal.

9. **Flatten SavedSearchesScreen rows.** (`SavedSearchesScreen.tsx:168`) Replace `searchCard` rounded surfaces with flat rows + hairline separators. Remove the `searchIconWrap` filled circle; use a bare 20pt icon. Add a single 44pt thumbnail of a representative result image to each row. Passes the thumbnail test.

10. **Lead the discover landing with media.** (`GlobalSearchScreen.tsx:1067`) Move the Discover masonry grid above Recent/Saved searches. Recents and saved are secondary scaffolds; the grid is the primary discovery object. This is a reorder, not a rebuild.

11. **Wire `SearchAutocomplete` into GlobalSearchScreen.** Replace the inline `searchSuggestions` dropdown (line 651) with the existing `SearchAutocomplete` component, fed by `searchAutocompleteApi`. Unify trending/recent/suggestion rendering. Remove the orphaned inline implementation.

12. **Add long-press-to-visual-search on listing images.** (`GlobalSearchScreen.tsx` masonry items, `SearchScreen.tsx` discover tiles) Add `onLongPress` to listing image pressables that navigates to `VisualSearch` with `initialImageUri` set to the listing's image. This is the Pinterest long-press pattern and requires no new screen.

---

## 5. Macro Improvements

These are architectural or multi-layer changes that define the flagship outcome.

### 5.1 Search architecture: one canonical entry, scope-aware results

Per Apple WWDC26 guidance, a tabbed app should have a single primary search entry point. ThryftVerse currently has search split across `SearchScreen` (Explore, with a fake search bar that navigates to GlobalSearch) and `GlobalSearchScreen` (the real search). The flagship architecture:

- **`SearchScreen` keeps the persistent search affordance** (the bar + camera icon) but it is honestly a navigation trigger to `GlobalSearch`, not a fake input. The current implementation is already correct here — the bar is an `AnimatedPressable` that navigates. Preserve.
- **`GlobalSearchScreen` becomes the single canonical search surface** with three modes: text, visual, conversational. Today these are three separate routes (`GlobalSearch`, `VisualSearch`, `ConversationalSearch`). The flagship version unifies them into one surface with mode switching, so the user's query context (recents, saved, scope) persists across modes. This mirrors Google's 2026 multimodal Search box and YouTube's "Ask" entry mode.
- **Scope tabs persist across modes.** Items | People | Visual results. The scope tab pattern already exists for Items | People; extend it.

### 5.2 Visual search entry: from dedicated route to ambient affordance

The flagship visual search is not a separate destination but an *ambient* capability:

- **Long-press any listing image** → visual search with that image as the query (micro #12).
- **Camera icon in the search bar** → full-screen capture (current, preserve).
- **Object-level tap-to-search on the captured photo.** This requires backend support: an object-detection / segmentation model that returns bounding boxes for detectable items in the uploaded image. The backend contract would extend `POST /visual-search` to return `regions: [{ bbox, label, confidence }]`, and the UI would render tappable overlays on the captured image. This is the Pinterest glow pattern. Scope: backend ML + frontend overlay. This is the single highest-impact macro change for visual search.
- **VLM-generated description tokens.** Instead of asking the user to type "black leather jacket," the backend returns candidate description tokens (colour, category, material, style) from the image, rendered as tappable chips that refine the result set. This replaces the free-text `description` TextInput with recognition-over-recall chips. Scope: backend VLM + frontend chip bar.

### 5.3 AI search truthfulness: real backend or honest reframing

The conversational search service is currently a keyword-matching mock flagged as demo. The flagship decision is binary:

- **Path A — ship real conversational AI.** Wire `startConversation` / `continueConversation` to a backend LLM endpoint that does genuine intent extraction and retrieval. Replace `estimateMatchCount` with a real catalogue query. Remove the demo flag. The UI layer does not need to change (the service signatures are backend-ready by design).
- **Path B — reframe honestly as "Smart filters."** If a real LLM is not shipping in this programme, rename the surface from "Conversational Search" / "Ask ThryftVerse" to "Smart Filters" or "Describe & Find." Remove the chat bubble metaphor, the typing indicator, and the "I" persona. Present it as a single input that extracts filters and shows them as chips with a "View results" button. This is truthful and still useful.

Either path is acceptable. The current state — chatbot UI with keyword matching and a "coming soon" banner — is not.

### 5.4 Empty / recent / trending states as a composed system

The discover landing, focus state, and saved searches all need a unified "search entry scaffold":

- **`RecentSearches` composed component** — shared between the focus state and the resting landing, with pin/delete (from `SearchHistoryManager`), clear-all, and a representative thumbnail per term. Eliminate the duplicated sections in GlobalSearchScreen.
- **`TrendingSearches` wired in** — render the existing component on the discover landing, fed by a backend trending endpoint (or, honestly, by real category popularity from `listings` counts). No hardcoded terms.
- **`SavedSearches` preview row** — a compact horizontal strip of saved searches with thumbnail + query + new-match badge, shown above the masonry grid on the landing. The current vertical card list is too heavy for the landing; the compact strip belongs on the landing, the full list on `SavedSearchesScreen`.
- **Empty state for first-ever users.** When `recentSearches`, `savedSearches`, and `trending` are all empty, the landing should show a curated category masonry (real listings by category) with a single "Search Thryftverse" input at top. No empty text sections.

### 5.5 Filter architecture: progressive + visible state

- **Active-filter chip bar above results on every screen that uses `browseFilters`.** GlobalSearch, Browse, and VisualSearch results should all render the same `ActiveFilterChips` component driven from the store. Tapping a chip removes that filter and re-runs.
- **Progressive in-result refinement.** Add a horizontal chip rail above results for the top 3–4 most-used axes (Category, Brand, Price range, Condition) that applies instantly without opening the sheet. The full sheet remains for "All filters." This is the 2026 mobile pattern (SAP Fiori feedback bar, UXPin chip bar).
- **Live count in the sheet.** `getResultsCount` already runs on every toggle — ensure the Apply button count updates synchronously (it currently does via `resultCount` recompute). Preserve and verify this does not jank on large catalogues.

---

## 6. Flagship Acceptance Criteria

A search department screen is flagship-ready when all of the following are true:

1. **Truthful UI (§11).** No "coming soon" banners. No fabricated match counts. No "AI" labels on keyword matching. Conversational search either uses a real LLM or is reframed as "Smart Filters" with no chatbot persona. Visual search either does real image similarity or is labelled "Photo search" with a truthful note.

2. **Recognition over recall.** The user can initiate visual search by long-pressing any listing image. The visual search surface offers tappable object regions or VLM-generated description chips, not a required free-text description field.

3. **Single canonical search entry.** GlobalSearchScreen is the one search surface, with text / visual / conversational as modes, not separate routes. Scope tabs (Items | People / Visual) persist across modes.

4. **Media-first discover landing.** The first viewport of the search landing shows at least two meaningful media objects (masonry grid) above the fold. Recent/saved/category scaffolds are secondary, below the grid or in a compact strip.

5. **Visible filter state.** Active filters render as removable chips above results on every screen using `browseFilters`. The count badge alone is insufficient.

6. **Progressive refinement.** A horizontal chip rail for the top 3–4 filter axes applies instantly without opening the full sheet. The full sheet remains for advanced/all filters.

7. **No dead filters.** `MOCK_BRANDS` / `MOCK_SIZES` removed. "Ending soon" sort gated to auction context. Every filter option in the sheet maps to real, non-empty catalogue values or shows a truthful disabled state.

8. **No orphaned components.** `SearchAutocomplete`, `SearchHistoryManager`, and `TrendingSearches` are wired into the production flow or removed. No built-but-unconnected components remain.

9. **State completeness (§14).** Loading (skeletons matching final layout), empty (first-ever user with no recents/saved), filtered-empty (with recovery actions), offline, error+retry, and populated states are all designed for every search surface.

10. **Compositional quality (§4).** SavedSearchesScreen passes the thumbnail test (flat rows + hairlines, no repeated cards). GlobalSearchScreen uses no more than two non-avatar radii in the first viewport. No card-on-card composition. No decorative subtitles or duplicate headings.

11. **Honest sort label.** The current sort is visible as a labeled chip, not a blind cycle icon.

12. **Performance (§16).** Masonry grids use deterministic image heights (already true via `mediaHeightRatio`). Search input is debounced. People search is debounced (already 300ms). No unvirtualized large lists. Reduced-motion fallbacks for the visual search scan animation.

---

## 7. Priority & Sequencing

### Sprint 1 — Truthfulness & dead-code cleanup (P0, no backend)

- Remove "Full AI coming soon" banner; rewrite conversational copy (micro #1, #3).
- Remove fabricated match count; either query real count or omit (micro #2).
- Remove `getBroadenedSuggestions` hardcoded fallback (micro #4).
- Remove `MOCK_BRANDS` / `MOCK_SIZES` (micro #7).
- Gate "Ending soon" sort to auction context (micro #8).
- Wire `SearchAutocomplete` into GlobalSearchScreen, remove inline duplicate (micro #11).

### Sprint 2 — Visibility & recognition (P0, no backend)

- Show current sort label (micro #5).
- Render active-filter chips above results (micro #6).
- Long-press listing image → visual search (micro #12).
- Reorder discover landing: media first, then scaffolds (micro #10).
- Flatten SavedSearchesScreen rows + add thumbnail (micro #9).

### Sprint 3 — Architecture unification (P1, frontend re-architecture)

- Unify GlobalSearch / VisualSearch / ConversationalSearch into one surface with mode switching (macro 5.1).
- Compose `RecentSearches` / `SavedSearches` preview strip / `TrendingSearches` into a unified landing scaffold (macro 5.4).
- Add progressive in-result refinement chip rail (macro 5.5).

### Sprint 4 — Visual search depth (P1, backend ML required)

- Backend: object detection / segmentation on `POST /visual-search` returning regions (macro 5.2).
- Frontend: tappable object overlays on captured image (glow pattern).
- Backend: VLM-generated description tokens.
- Frontend: replace free-text description field with tappable chips.

### Sprint 5 — Conversational AI decision (P1, backend dependent)

- Decision: ship real LLM (Path A) or reframe as Smart Filters (Path B) (macro 5.3).
- If Path A: wire `conversationalSearchApi` to real backend, remove demo flag, real match counts.
- If Path B: reframe UI, remove chat metaphor, ship as filter-extraction surface.

### Sequencing rationale

Sprints 1–2 are no-backend, low-risk, and resolve the §11 truthfulness violations and the most visible UX gaps. They should land first and be verifiable on device immediately. Sprint 3 is a frontend re-architecture that unifies three routes into one; it depends on 1–2 being merged. Sprints 4–5 require backend work and are the differentiating flagship features; they can proceed in parallel once the frontend architecture is unified. The conversational AI decision in Sprint 5 is a product call that should be made explicitly, not deferred — the current "demo mode forever" state is the worst of both worlds.
