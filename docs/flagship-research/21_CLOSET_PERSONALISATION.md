# 21 — Closet, Personalisation, Style Quiz & Taste Profile

> **Department:** Closet (saved/wishlist/collections/outfits), Personalisation settings, Style Quiz, taste profile, saved/liked items.
> **Primary benchmarks:** Pinterest (saved boards, AI "Make It Yours"), Spotify (Taste Profile beta, 2026), Armadio / updresser / Fitted (2026 digital-closet wave), Lazarev.agency 2026 personalisation playbook, CHI '26 recommender transparency research.
> **Audit date:** 2026-08-18. All file:line references are against the production TSX in `frontend/src`.

---

## 1. 2026 Competitor Benchmark

### 1.1 Pinterest — saved boards as identity infrastructure

Pinterest's saved-board system is the canonical reference for "items I curated = who I am." As of February 2026, UXSnaps' breakdown of the Saved Boards UI praised it for letting "structure do the heavy lifting": clear content modes that reduce decision fatigue *before* the user scrolls, visual previews that act as "recognition shortcuts," privacy communicated through small but powerful signals, and creation encouraged without being forced ([UXSnaps / LinkedIn, 2026-02-15](https://www.linkedin.com/posts/uxsnaps_pinterests-uxui-breakdown-activity-7428754965403336704-Zl5A)).

In October 2025 Pinterest began shipping AI-powered board upgrades that turn boards from organisational folders into a personal styling surface ([TechCrunch, 2025-10-27](https://techcrunch.com/2025/10/27/pinterest-experiments-with-new-ai-powered-personalized-boards/)):

- **"Styled for you"** — AI collages that combine saved fashion Pins into outfits; tapping an item lets the user swipe through AI-recommended saved Pins for mixing and matching.
- **"Boards made for you"** — AI + editorial curated boards dropped into the home feed and inbox.
- **"Make It Yours"** tab — recommends fashion and home decor products based on the Pins already saved to a board.
- **"More Ideas"** tab — suggests related Pins across categories.
- **"All Saves"** tab — a single place to find every previously saved Pin.

By July 2026 these tabs had rolled out globally ([SocialBee Pinterest news, 2026-07-08](https://socialbee.com/blog/pinterest-news/)). The design lesson is that the *act of saving* is no longer terminal — every save becomes a signal that powers a transparent, board-scoped recommendation layer. The closet is not a graveyard; it is the engine.

### 1.2 Spotify — Taste Profile as a visible, editable model

In March 2026 Spotify announced the **Taste Profile** beta at SXSW ([Spotify Newsroom, 2026-03-13](https://newsroom.spotify.com/2026-03-13/taste-profile-beta-announcement/)). The headline move is *visibility and control*: users can now see how Spotify understands their taste across music, podcasts and audiobooks — e.g. "you're starting to explore '90s alternative rock" or "gravitating toward hip-hop with distinctive influences" — and directly shape it by flagging when the profile "misses the mark," asking for more or less of a vibe, or stating a current mood. Taste Profile also captures *habits and context* (marathon training → upbeat morning tracks; weekday commute → news podcasts), not just consumption.

This is the 2026 personalisation contract: the model is no longer a black box. The user can **see the signals, correct them, and steer the feed.** Over 80% of Spotify listeners say personalisation is what they love most — and the next leap is making that personalisation *legible and editable*.

### 1.3 The 2026 digital-closet wave (Armadio, updresser, Fitted, StyleSense, Stylect)

A cohort of 2026 apps treat the closet as the primary product surface, not a side tab:

- **Armadio** (launched July 2026, 5.0 App Store rating): photograph your clothes, AI isolates each garment, then composes outfits *only from what you own*. Deliberately quiet UI — "the colour is supposed to come from the clothes, not the chrome" ([luigidonadel.com/armadio](https://www.luigidonadel.com/armadio/)).
- **updresser**: "Every swipe, save and wear trains your personal AI. It shows exactly what it learned — no black box, no creepy magic." Outfits come with a score *and the why behind it* ([updresser.com](https://updresser.com/)).
- **Fitted** (750k+ users): AI-catalogued closet, AskFitted AI stylist that assembles fits from owned pieces, **Neckworth** closet-value tracker (live resale pricing, value history graph, cost-per-wear), and one-tap "turn any piece into a listing" — the closet is the sell pipeline ([fittedcloset.com](https://www.fittedcloset.com/)).
- **StyleSense** (TestFlight 2026): scans the camera roll, tags every garment with type/color/brand/season/occasion, then generates occasion + vibe outfits and flags the "gap" piece worth buying second-hand ([stylesense.se](https://stylesense.se/)).
- **Stylect** (IJERT, March 2026): offline-first digital closet with camera capture, drag-and-drop outfit builder, and an AI stylist chat ([IJERT 2026](https://www.ijert.org/stylect-design-and-development-of-a-personal-ai-powered-digital-wardrobe-web-application-ijertv15is031512)).

The shared 2026 pattern: the closet is **media-first, AI-tagged, outfit-generating, and value-aware**, and every recommendation is tied back to *your actual wardrobe*, not a generic catalogue.

### 1.4 Personalisation & style-quiz patterns (2026)

Lazarev.agency's July 2026 personalisation playbook is blunt: "Personalized UX is a data and trust problem before a visual one. The interface is the last mile. The work is in the signals you collect, the predictions you rank, and whether the user can see and correct them" ([lazarev.agency/articles/personalized-ux](https://www.lazarev.agency/articles/personalized-ux)). It names **overpersonalization** — narrow feedback loops, opaque decisions, privacy overreach — as the failure mode killing most personalisation programmes, and prescribes guardrails (confidence display, reversibility, signal transparency) alongside the recommendations.

Muzli's 2026 mobile UI trends piece identifies **layout personalization** as the new frontier: Spotify reorders shelves by time-of-day usage; Apple iOS 18 Control Center surfaces toggles by context; Google Maps presents "entirely different interfaces depending on context." The rule: "The adaptation has to be invisible. The moment a user notices the layout shifted, you've created confusion instead of convenience" ([muz.li, 2026](https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/)).

For style quizzes specifically, the 2026 consensus from Shoptrue, StyleSense, Fabletics, Le Tote and Mini & Me case studies is:

- **Short, visual, low-friction** — StyleSense builds a complete style vector in a 4-question, 30-second quiz; Shoptrue's onboarding "centered around a quick, engaging style quiz that powers the core AI engine" ([joshitejas.com/shoptrue-1](https://www.joshitejas.com/shoptrue-1); [github.com/spandana-builds/stylesense](https://github.com/spandana-builds/stylesense)).
- **Never blocking** — Fabletics learned the hard way that forcing a quiz before browsing "left a negative impact on the overall brand and felt like they couldn't trust this brand. Users just want to browse before making a commitment" ([sharonkimdesigns.com/portfolio-Fabletics](https://www.sharonkimdesigns.com/portfolio-Fabletics)).
- **Results must be legible and actionable** — Le Tote's research found users "skeptical about personalization" when the quiz is "too subjective to provide results that actually reflect a user's preferences" and warned against showing products in the quiz that "aren't actually available" — i.e. fabricated results erode trust ([helenbentley.com/lt-onboarding](http://www.helenbentley.com/lt-onboarding)).
- **The quiz feeds a visible profile** — StyleSense ships a "Privacy Modal: Full transparency — see every signal used, toggle each one, clear all data."

### 1.5 Recommendation transparency (CHI '26)

The 2026 CHI research stream is unambiguous. "Rethinking User Empowerment in AI Recommender System" (CHI '26) found that users want "active influence over personalization" and that integrating **transparency with actionable control** — managing data use, discovering varied content, configuring context-based recommending modes — builds trust and addresses filter-bubble fears ([CHI '26 program](https://programs.sigchi.org/chi/2026/program/content/222393)). A systematic review of recommender explanations (ACM, 2026) confirms explanations increase "trust, satisfaction, and engagement" but only when designed around user preferences, not dumped as raw model output ([doi.org/10.1145/3820245](https://doi.org/10.1145/3820245)). IUI '26 work adds that explanations are "especially valuable when users explore unfamiliar items" and proposes four informational dimensions: **Essence, Experience, Exchange, Entwinement** ([IUI '26](https://programs.sigchi.org/iui/2026/program/content/226598)).

The 2026 bar is therefore: **every recommendation carries a "why," every signal is visible and editable, and the user can steer the model without leaving the surface.**

---

## 2. Psychology & Principles

### 2.1 Identity through curation — the "this is me" feeling

A closet is not a list of products; it is a self-portrait assembled through acts of taste. Every save, heart and collection is a small identity claim: "this is the kind of thing I wear." Pinterest's entire product is built on this — boards are identity surfaces, not filing cabinets. The 2026 AI board features double down on it: "Make It Yours" literally names the identity transaction. When a user opens their closet and the items *look like them*, the app delivers a reflective-level emotional reward (Don Norman's third level — meaning and message). When the closet looks like a generic admin table, the app fails at the level that matters most for retention.

### 2.2 The endowment effect in saved items

Behavioural economics is clear: once a user has "saved" an item, they begin to value it more highly than an equivalent unsaved item — the mere act of possession (even digital possession) creates endowment. This is why wishlist price-drop alerts convert: the user already feels ownership. A flagship closet *honours* endowment by treating saved items as first-class owned objects — with value tracking, price-drop signals, and a persistent visual presence — rather than as transient bookmarks. Fitted's Neckworth (live resale value per piece, value history graph) is the purest expression: your closet has a net worth because you own a taste.

### 2.3 Recommendation trust and the "it knows me" delight

The CHI '26 research and Spotify's Taste Profile both converge on the same insight: personalisation feels delightful *only* when it is legible. The "it knows me" moment requires the user to recognise the model's reasoning as their own. A recommendation with no explanation is a guess; a recommendation with a visible signal ("Because you saved 3 archive pieces this week") is a confirmation. Trust is built by transparency and destroyed by opacity. The failure modes — filter bubbles, creepy inferences, confident-but-wrong suggestions — all stem from hiding the model. The 2026 contract is: **show the signal, let the user correct it, and the delight follows.**

### 2.4 Self-expression over configuration

Personalisation settings screens fail when they feel like a settings panel. The 2026 pattern (Shoptrue, StyleSense, Spotify Taste Profile) is to frame preference editing as *self-expression* — "shape your taste," not "configure your filters." The language, the visual treatment, and the feedback all reinforce that the user is describing themselves, not tuning an algorithm. This is the difference between "Categories and Sizes: Balanced" (a config label) and "Your style leans minimal with an archive streak" (an identity statement).

### 2.5 Progressive disclosure for taste

Taste is not captured in one quiz; it is learned over time. The 2026 pattern is a *seed* quiz that bootstraps the model, then continuous passive signals (saves, hearts, views, outfit creations) that refine it, plus an *active* surface (Taste Profile) where the user can see and steer. This is progressive disclosure applied to personalisation: low friction up front, depth available on demand, never forced.

---

## 3. Current ThryftVerse Audit

### 3.1 ClosetScreen.tsx — a tabbed admin panel masquerading as a closet

`ClosetScreen.tsx:62-918` is the canonical closet surface. It is functional but reads as a generic dashboard, not an identity surface:

- **Four flat tabs with no hierarchy** (`:45`, `:726-753`): SAVED · WISHLIST · COLLECTIONS · OUTFITS. The tabs are text labels with an underline indicator and a count pill glued to the header (`:688-692`). There is no visual distinction between "your saved items" (identity) and "your collections" (curation) — they are peers in a flat list. The first viewport is consumed by header + tabs + toolbar before a single media tile appears.
- **Stats card below the fold** (`:884-912`): total items, total value, collections count, and price-drop savings are buried *after* the content grid. These are the closet's identity metrics — "your closet is worth £X and you've tracked £Y in drops" — and they should be the first-viewport story, not a footer.
- **Card-on-card in the stats** (`:886` `styles.statsCard` + `t.statsCard`): the stats sit in a bordered surface (`borderColor: colors.border`) with internal dividers — a nested panel inside the scroll view. Per AGENTS.md §4, visible containment must have meaning; this card has no distinct interaction boundary.
- **Toolbar chrome** (`:756-796`): search input + two 44pt icon buttons (sort, filter) in a row, plus a separate sort dropdown panel (`:799-817`) and a horizontal brand-chip scroll (`:820-854`). The filter affordance is split across two icons, a dropdown, and a chip rail — three separate filter vocabularies for one task.
- **Duplicate sort menu** (`:440-475` `renderSortMenu` and `:799-817`): the same sort menu is rendered in two places in the component, a dead-code smell.
- **No taste profile, no recommendation layer**: the closet is a pure retrieval surface. There is no "based on what you save" rail, no style signal, no outfit suggestion, no "complete the look." The closet does not feed back into discovery.

### 3.2 ClosetMediaMosaic.tsx — media-first tile, but no closet intelligence

`ClosetMediaMosaic.tsx:60-98` is a purpose-built 3-column 3:4 portrait grid — this is the right primitive (AGENTS.md §7). The tile (`:113-274`) handles save/wishlist toggles, sold state, price-drop badge, and price overlay correctly and truthfully. But:

- **No metadata beyond price** (`:264-269`): brand, category, size, and save date are invisible. In a closet, the user is re-scanning *known* items — they need recognition cues (brand, the collection it belongs to), not just a price.
- **No grouping or sections**: items are round-robin distributed into columns (`:73-76`) with no grouping by brand, category, collection, or recency. A 50-item closet is an undifferentiated wall of thumbnails.
- **No "recently saved" or "price dropped" inline sections**: the sort exists (`ClosetScreen.tsx:194-203`) but there is no visual section break — the user cannot see "these 3 just dropped in price" as a distinct group.

### 3.3 CollectionCard.tsx — a 2020-era collage card

`CollectionCard.tsx:20-90` renders a collection as a bordered card with a 3-up cover collage and an info footer. Defects:

- **Card-on-card composition** (`:93-100` `container` with `borderRadius + backgroundColor + borderWidth`): the collection card is a filled, bordered surface containing nested rounded image surfaces (`:107-126`). Per AGENTS.md §4 "No card-on-card composition" — the collage images are already media; wrapping them in a card adds a redundant surface.
- **"Empty" text label** (`:75`): collections with no items show a folder icon and the literal word "Empty" — a blunt, non-flagship empty state. Pinterest uses the empty board as a creation prompt, not a status label.
- **No privacy signal** (`isPrivate` is in the data but not rendered in `CollectionCard`): Pinterest's privacy signals are "small but powerful" — ThryftVerse drops the signal entirely.
- **Static cover, no AI curation**: covers are the first 3 item IDs (`:28-36`). There is no "featured" pin, no AI-selected representative image, no cover editing.

### 3.4 SaveToCollectionModal.tsx — functional but chrome-heavy

`SaveToCollectionModal.tsx:31-60` wires real API collection add/remove (`addToCollectionOnApi`, `removeFromCollectionOnApi`, `createCollectionOnApi`) — this is truthful and working. The modal is a standard bottom-sheet list with a create input. No major defects, but it is a *modal* — the 2026 pattern (Pinterest long-press save, Spotify inline steer) is to make saving feel like a single gesture, not a sheet navigation.

### 3.5 PersonalisationScreen.tsx — a settings panel, not a taste profile

`PersonalisationScreen.tsx:27-247` is the personalisation surface. It is, in effect, four preference pickers:

- **Hero card** (`:162-181`): a bordered surface with an icon, a title ("All categories" / "Women, Men selected"), a subtitle ("Default discovery" / "Custom discovery"), and a "Saved" badge. This is a status summary, not a taste profile. There is no style identity, no style-vector, no "you lean minimal + archive."
- **AudiencePreferenceGrid** (`:184-190`): Women / Men / Kids / All tiles. This is a gender filter, not a taste signal.
- **DiscoveryPreferenceRow × 3** (`:193-218`): Categories and sizes, Brands, Members — each opens a `BottomSheetPicker` with 3-4 enum options ("Balanced", "Streetwear first", etc.). These are coarse config enums, not a taste model. "Brands: Streetwear first" is a single string, not a ranked brand affinity.
- **"Saved" badge in header** (`:143-147`) and hero (`:175-178`): the screen permanently shows a green "Saved" checkmark even when nothing was just saved — a fabricated persistent success state. Per AGENTS.md §11, do not fabricate success states.
- **Reset button** (`:222-233`): a plain text row. No confirmation of what resetting *means* for the feed.
- **No taste profile, no signal transparency, no feed preview**: the user cannot see *what* these preferences do to their feed. There is no "here's what you'll see more of," no signal list, no per-signal toggle, no "why am I seeing this." The screen is a one-way config panel.

### 3.6 StyleQuizScreen.tsx — a 4-step quiz that fabricates its result

`StyleQuizScreen.tsx:59-236` is the style quiz. Defects:

- **Fabricated success toast** (`:113`): `show('Feed personalised — your Explore and Home feeds now reflect your preferences.', 'success')` — but the quiz only writes to `personalisationPreferences` (gender filter, a joined style string, a price enum). Grep confirms `personalisationPreferences` is **not read by the explore feed** (`EditTab.tsx`, `PulseTab.tsx` do not consume it). The toast claims the feed changed when it did not. This is a fabricated success state (AGENTS.md §11).
- **Style selection is a joined string, not a taste vector** (`:110`): `categoriesAndSizesPref: selectedStyles.length > 0 ? selectedStyles.join(', ') : 'Balanced'` — the selected styles (Minimal, Streetwear, Vintage, Gorpcore, Archive, Techwear) are flattened into a comma-joined string stored in a field named `categoriesAndSizesPref`. The field name does not match the data. The PersonalisationScreen later reads this same field as "Categories and sizes" (`:35`, `:198`). The quiz and the settings screen disagree on what the field means.
- **Price range mapped to `brandsPref`** (`:111`): `brandsPref: selectedPrice ? selectedPrice : 'Any'` — the price tier (`budget`/`mid`/`premium`/`luxury`) is written into a field named `brandsPref` whose enum in PersonalisationScreen is `['Any', 'Streetwear first', 'Luxury first', 'Vintage first']`. The values are incompatible. Setting price "budget" makes `brandsPref` = "budget", which is not a valid brand preference. This is a data-contract bug.
- **No result screen beyond a summary** (`:183-196`): step 3 shows a checkmark and a 3-row summary. There is no "here's your style profile," no style identity, no sample recommendations, no "just for you" preview. The quiz ends on a form receipt, not a taste reveal.
- **Quiz is not onboarding-gated but is marketed as onboarding** (`EditTab.tsx:201-223`, `PulseTab.tsx:356`): the "Find Your Aesthetic" card in Explore markets the quiz as discovery personalisation, but the quiz writes to a config panel that the feed ignores. The marketing promises personalisation; the product delivers a settings write.
- **Hardcoded style list** (`:43-50`): 6 styles with generic Ionicons (`walk-outline` for Streetwear, `time-outline` for Vintage). These are not ThryftVerse-native style archetypes — they are a generic fashion-app checklist.

### 3.7 Store & API layer — thin, misnamed, disconnected

- `useStore.ts:248-253` `PersonalisationPreferences` = `{ genderFilter, categoriesAndSizesPref, brandsPref, membersPref }`. Four string/string[] fields. No taste vector, no style affinities, no signal log, no per-signal toggles.
- `useStore.ts:1255-1266`: defaults are `genderFilter: ['Women','Men']`, `categoriesAndSizesPref: 'Balanced'`, `brandsPref: 'Any'`, `membersPref: 'Everyone'`. The "default user" has no taste.
- `accountApi.ts:190-208`: `updateUserPersonalisation` PATCHes `/users/me/personalisation` with the same four fields. `fetchUserPersonalisation` reads them back. The contract is a flat config object — no taste profile, no signals, no explanations.
- **No backend contract for taste signals, recommendations, or closet insights**: there is no `/users/me/taste-profile`, no `/users/me/signals`, no `/closet/insights`, no recommendation explanation endpoint. The personalisation backend is a preference persistence layer, not a personalisation engine.

### 3.8 Dead / fabricated features summary

| Defect | Location | AGENTS.md violation |
|---|---|---|
| Fabricated "Feed personalised" toast | `StyleQuizScreen.tsx:113` | §11 (fabricated success) |
| Permanent "Saved" badge with no recent action | `PersonalisationScreen.tsx:143-147, 175-178` | §11 (fabricated success state) |
| Price written to `brandsPref` (contract mismatch) | `StyleQuizScreen.tsx:111` | §2 (data contract bug) |
| Styles written to `categoriesAndSizesPref` (misnamed) | `StyleQuizScreen.tsx:110` | §2 (data contract bug) |
| Preferences not consumed by explore feed | `EditTab.tsx`, `PulseTab.tsx` (no read) | §11 (control does not perform represented action) |
| "Empty" label on empty collections | `CollectionCard.tsx:75` | §14 (weak empty state) |
| Stats card below fold + card-on-card | `ClosetScreen.tsx:884-912` | §4 (hierarchy, no card-on-card) |
| No taste profile, no signal transparency, no "why" | `PersonalisationScreen.tsx` (entire) | §11, 2026 bar |

---

## 4. Micro Improvements

1. **Remove the fabricated "Feed personalised" toast** (`StyleQuizScreen.tsx:113`). Replace with a truthful message that names what actually changed ("Saved to your style profile") and a link to the Taste Profile surface where the user can see the effect.
2. **Remove the permanent "Saved" badge** in `PersonalisationScreen.tsx:143-147` and `:175-178`. Show a transient confirmation only on actual mutation, or remove entirely — the preferences auto-save on change.
3. **Fix the data-contract bug**: introduce a `styleAffinities: string[]` field and a `priceTier: string` field in `PersonalisationPreferences` (`useStore.ts:248-253`, `accountApi.ts:190-195`). Stop overloading `categoriesAndSizesPref` and `brandsPref`. Migrate the quiz to write to the correct fields.
4. **Surface brand and category on closet tiles**: extend `ClosetMediaMosaic` tile (`ClosetMediaMosaic.tsx:264-269`) to show a compact brand label above the price overlay, and a category glyph. Recognition > retrieval in a closet.
5. **Add a privacy signal to `CollectionCard`** (`CollectionCard.tsx:80-87`): a small lock icon next to the name when `isPrivate === true`. One glyph, high signal — the Pinterest lesson.
6. **Replace the "Empty" label** (`CollectionCard.tsx:75`) with a creation prompt: a dashed-outline collage slot with a "Add items" caption and a tap target that opens the collection.
7. **Move closet stats above the grid** (`ClosetScreen.tsx:884-912`): promote total value, items, and price-drop savings to a first-viewport identity strip (flat canvas + hairline dividers, no card). This is the closet's headline.
8. **Flatten the stats card** (`ClosetScreen.tsx:886`): remove the bordered surface; use spacing + a hairline divider row. Eliminates card-on-card.
9. **Consolidate the filter vocabulary** (`ClosetScreen.tsx:756-854`): merge sort + brand filter + price-drop filter into a single filter sheet (bottom sheet) triggered by one filter icon. Remove the duplicate `renderSortMenu` (`:440-475`).
10. **Add inline sections to the closet grid**: when sort = "Recently saved," show a "Saved this week" section header above the first 3 tiles; when price drops exist, show a "Price drops" section. Use `ClosetMediaMosaic` per section.
11. **Make the Style Quiz result screen a taste reveal** (`StyleQuizScreen.tsx:183-196`): replace the form receipt with a style-identity card — "Your style leans [X] with a [Y] streak" — plus a 3-item "Just for you" preview rail pulled from real listings filtered by the new taste vector. If no listings match, show a truthful empty state, not a fake rail.
12. **Add a "Why am I seeing this?" affordance** on explore feed items: a small info glyph that opens a bottom sheet listing the taste signals that matched (e.g. "Matches your saved archive pieces"). Start with the signals already available (saved brands, style affinities).

---

## 5. Macro Improvements

### 5.1 Closet architecture — from retrieval surface to identity engine

Reconceive the closet as the **identity surface**, not the bookmarks page. The architecture:

- **First viewport = identity strip**: closet value, item count, top style archetype, price-drop savings — a flat, media-backed strip that says "this is your closet." Stats are the headline, not the footer.
- **Sectioned grid, not a flat wall**: group by recency ("Saved this week"), by price drop ("On sale"), by dominant brand, and by collection membership. Each section is a `ClosetMediaMosaic` with a hairline section header. This mirrors Pinterest's board tabs (Make It Yours / More Ideas / All Saves) — structure does the heavy lifting.
- **Closet insights module**: a backend `/closet/insights` endpoint returning top brands, style distribution, price-tier breakdown, most-saved category, and value-over-time. Render as a compact, media-first insights strip. This is Fitted's Neckworth pattern — your closet has a net worth and a personality.
- **Closet → recommendation feedback loop**: every save/heart writes to the taste profile (§5.2). The closet is no longer terminal; it is the primary signal source. "Based on your closet" rails appear in discovery with visible signal attribution.

### 5.2 Taste profile system — a visible, editable, signal-driven model

Replace the four-field `PersonalisationPreferences` with a **Taste Profile** — the Spotify 2026 contract applied to fashion:

- **Data model** (`useStore.ts`, `accountApi.ts`):
  - `styleAffinities: { style: string; weight: number }[]` — ranked style vector (Minimal, Streetwear, Vintage, Gorpcore, Archive, Techwear, plus ThryftVerse-native archetypes).
  - `brandAffinities: { brand: string; weight: number }[]` — ranked brand vector derived from saves + purchases.
  - `priceTier: 'budget' | 'mid' | 'premium' | 'luxury'` — separate from brand affinity.
  - `sizeProfile: { category: string; size: string }[]` — real size signals.
  - `signals: { key: string; label: string; source: 'quiz' | 'save' | 'purchase' | 'view' | 'outfit'; weight: number; updatedAt: string }[]` — the transparent signal log.
  - `habits: { occasion: string; timeOfDay: string }[]` — context signals (Spotify's "marathon training → upbeat morning" analogue).
- **Taste Profile screen** (replace `PersonalisationScreen`): a media-first identity surface. Top: "Your style leans [archetype] with a [secondary] streak" — an identity statement, not a config label. Below: ranked style chips with weights, brand affinity bars, a signal list ("You saved 3 archive pieces this week", "You heart 2 gorpcore items"), each with a per-signal toggle (more / less / off). A "steer your feed" input for current mood/occasion. A live "preview" rail showing 6 items the current profile would surface — so the user sees the effect of their edits immediately.
- **Signal transparency everywhere**: every recommendation in discovery and detail carries a "why" — "Because you saved 3 archive pieces," "Matches your gorpcore streak," "On your wishlist price tier." Tap to see the full signal chain. This is the CHI '26 transparency-with-control contract.
- **Quiz as seed, not source**: the Style Quiz bootstraps `styleAffinities` and `priceTier`. It is short (4 questions), visual, never blocking, and ends on a taste reveal + "Just for you" preview. Post-quiz, passive signals (saves, hearts, outfits, views) continuously refine the profile. The user can revisit the Taste Profile anytime to steer.

### 5.3 Recommendation transparency — the "why" layer

- **Backend**: add `/users/me/taste-profile` (GET), `/users/me/signals` (GET, with per-signal toggle PATCH), and a `reason` field on every recommendation response (discovery rails, item-detail "more like this," closet "complete the look").
- **Frontend**: a shared `<RecommendationReason>` component rendered on every recommended item — a one-line "why" with an info affordance that opens the signal chain. Use the IUI '26 dimensions: **Essence** ("archive piece"), **Experience** ("you saved 3 this week"), **Exchange** ("on your price tier"), **Entwinement** ("pairs with your saved trousers").
- **No black-box suggestions**: if the model cannot produce a reason, do not show the recommendation. A confident-but-unexplained suggestion is the 2026 trust killer.

### 5.4 Style quiz truthfulness — from fabricated toast to real personalisation

- **Fix the contract** (§5.2): quiz writes to `styleAffinities` + `priceTier`, not to `categoriesAndSizesPref`/`brandsPref`.
- **Wire the feed**: `EditTab.tsx` and `PulseTab.tsx` must read the taste profile and rank/filter accordingly. If the feed cannot consume the profile yet, the quiz toast must say "Saved to your style profile" — not "Feed personalised."
- **Result screen = taste reveal**: show the derived archetype, the signal list, and a real "Just for you" rail (or a truthful empty state if no listings match yet).
- **Never blocking**: the quiz is reachable from Explore and onboarding, never a gate before browsing (the Fabletics lesson).
- **ThryftVerse-native archetypes**: replace the generic 6-style list with archetypes derived from real ThryftVerse listing taxonomy and community language — co-designed with the curation team, not copied from a fashion-app template.

### 5.5 Collections as boards — curation + AI assist

- **Board tabs on collections** (Pinterest pattern): each collection gets "Make It Yours" (AI recs based on the collection's contents), "All items," and "More ideas." This turns collections from folders into recommendation surfaces.
- **Cover editing + AI-selected cover**: let the user pick a cover, or let AI choose the most representative item. Replace the static first-3 collage (`CollectionCard.tsx:28-36`).
- **Collection insights**: item count, dominant style, value, last updated — a compact strip on the collection detail, not just a count.

---

## 6. Flagship Acceptance Criteria

### 6.1 Thumbnail test

At 25% scale, the closet's primary object is the **media grid** with an identity strip above it. Stats, tabs, and toolbar recede. No repeated rounded rectangles dominate the silhouette. The style quiz result screen reads as a **taste identity card** with a media rail, not a form receipt.

### 6.2 Squint test

Blur the closet: media tiles dominate; chrome (tabs, toolbar, stats dividers) recedes into hairlines. Blur the Taste Profile: the style archetype statement and the affinity bars are the dominant objects; the signal list and steer input are secondary. Blur the Style Quiz: the option tiles/media are dominant; the progress bar and footer button recede.

### 6.3 Surface / radius / stroke / icon / density / text budgets

- **Surface budget**: one dominant non-media panel above the fold on the closet (the identity strip). Taste Profile: one dominant panel (the archetype card). No card-on-card.
- **Radius budget**: two non-avatar radii — media tiles (12-16pt) and the identity strip panel (20pt if dominant). No mixed arbitrary radii.
- **Stroke grammar**: hairline dividers only; no 1pt borders on static cards. Selection = 2pt or filled fill.
- **Icon grammar**: one Ionicons family, 20-24pt nav, 14-18pt metadata. Privacy lock = 14pt metadata glyph.
- **Density target**: closet grid exposes 6+ media tiles above the fold (3-column). Taste Profile exposes the archetype + 3-4 affinity rows above the fold.
- **Text budget**: three type sizes + one eyebrow per first viewport. No duplicate headings, no "Saved" badge that names an obvious state.

### 6.4 State coverage

- **Closet**: loading (skeleton matching 3:4 grid), populated, empty (per tab, with CTA), filtered-empty, offline (cached + banner), error (SyncRetryBanner), partial (some collections failed).
- **Taste Profile**: loading (skeleton affinity bars), populated, empty (new user — "Take the style quiz to seed your profile"), editing (live preview rail updates), error.
- **Style Quiz**: per-step loading (none needed — local), result loading (taste vector computation), result populated, result empty (no matching listings — truthful empty, not fake rail).
- **Recommendations**: loading (skeleton rail), populated, error ("Recommendations unavailable" — already exists in `ItemDetailScreen.tsx:1434`), empty (truthful "No matches yet — save a few items to train your profile").

### 6.5 Truthful UI

- No "Feed personalised" toast unless the feed actually re-ranked.
- No permanent "Saved" badge.
- No fabricated "Just for you" rail with unranked items.
- Every recommendation carries a real reason or is removed.
- Quiz results reflect real taste-vector writes, not config-string hacks.

### 6.6 Light/dark parity

Identity strip, affinity bars, signal list, and closet grid maintain identical geometry and hierarchy across themes. Dark mode adds no translucent containers or glow.

---

## 7. Priority & Sequencing

### Phase 1 — Truthfulness & contract repair (highest urgency, lowest risk)

1. Remove fabricated toasts and permanent "Saved" badge (`StyleQuizScreen.tsx:113`, `PersonalisationScreen.tsx:143-147, 175-178`).
2. Introduce `styleAffinities` + `priceTier` fields; migrate quiz writes; stop overloading `categoriesAndSizesPref`/`brandsPref` (`useStore.ts:248-253`, `accountApi.ts:190-208`, `StyleQuizScreen.tsx:110-111`).
3. Either wire the explore feed to read the taste profile, or change the quiz toast to a truthful "Saved to your style profile."

### Phase 2 — Closet identity lift (high perceived quality, medium risk)

4. Promote closet stats to a first-viewport identity strip; flatten the card (`ClosetScreen.tsx:884-912`).
5. Add brand/category labels to closet tiles (`ClosetMediaMosaic.tsx:264-269`).
6. Add inline sections (Recently saved, Price drops) to the closet grid.
7. Add privacy signal + creation-prompt empty state to `CollectionCard` (`CollectionCard.tsx:75, 80-87`).
8. Consolidate filter vocabulary into one sheet; remove duplicate sort menu (`ClosetScreen.tsx:440-475, 756-854`).

### Phase 3 — Taste Profile surface (flagship differentiator, higher risk)

9. Build the Taste Profile screen (replace `PersonalisationScreen`): archetype statement, ranked affinities, signal list with per-signal toggles, live preview rail, steer input.
10. Backend: `/users/me/taste-profile`, `/users/me/signals` (with toggle PATCH).
11. Style Quiz result screen becomes a taste reveal + real "Just for you" rail.

### Phase 4 — Recommendation transparency (trust moat, backend-heavy)

12. Backend: `reason` field on all recommendation responses.
13. Frontend: shared `<RecommendationReason>` component on every recommended item; "Why am I seeing this?" sheet.
14. Closet → discovery feedback loop: "Based on your closet" rails with signal attribution.

### Phase 5 — Collections as boards (Pinterest parity, backend-heavy)

15. Board tabs on collections (Make It Yours / All items / More ideas).
16. AI-selected + user-editable collection covers.
17. Collection insights strip.

### Sequencing rationale

Phase 1 is non-negotiable first — shipping fabricated success is an AGENTS.md §11 violation and an active trust destroyer. Phase 2 delivers the largest perceived-quality lift per unit of risk because it reorders existing media into an identity surface with no new backend. Phase 3 is the flagship differentiator that matches the 2026 Spotify/Pinterest bar and converts the closet from a bookmark page into the personalisation engine. Phases 4-5 depend on backend recommendation infrastructure and should be sequenced after the taste profile contract is live.

---

## Sources

- Pinterest Saved Boards UI breakdown — UXSnaps / LinkedIn, 2026-02-15: https://www.linkedin.com/posts/uxsnaps_pinterests-uxui-breakdown-activity-7428754965403336704-Zl5A
- Pinterest AI-powered personalized boards — TechCrunch, 2025-10-27: https://techcrunch.com/2025/10/27/pinterest-experiments-with-new-ai-powered-personalized-boards/
- Pinterest board fundamentals — create.pinterest.com: https://create.pinterest.com/blog/board-fundamentals/
- Pinterest Saving Flow (March 2026 recording) — Page Flows: https://pageflows.com/post/desktop-web/saving/pinterest/
- 2026 Pinterest news and updates — SocialBee, 2026-07-08: https://socialbee.com/blog/pinterest-news/
- Spotify Taste Profile beta announcement — Spotify Newsroom, 2026-03-13: https://newsroom.spotify.com/2026-03-13/taste-profile-beta-announcement/
- Personalized UX in 2026: patterns and pitfalls — Lazarev.agency, 2026-07-29: https://www.lazarev.agency/articles/personalized-ux
- Mobile App Design Trends 2026: UI Patterns — Muzli: https://muz.li/blog/whats-changing-in-mobile-app-design-ui-patterns-that-matter-in-2026/
- AI Personalization in Mobile Apps — MindInventory, 2026-03-02: https://www.mindinventory.com/blog/mobile-app-personalization-using-ai/
- Hyperpersonalization in Mobile — Miquido: https://www.miquido.com/blog/hyperpersonalization-in-mobile/
- Shoptrue style quiz case study — joshitejas.com: https://www.joshitejas.com/shoptrue-1
- StyleSense full-stack personalisation prototype — github.com/spandana-builds/stylesense: https://github.com/spandana-builds/stylesense
- Le Tote onboarding redesign — helenbentley.com: http://www.helenbentley.com/lt-onboarding
- Fabletics style quiz redesign — sharonkimdesigns.com: https://www.sharonkimdesigns.com/portfolio-Fabletics
- Armadio AI stylist — luigidonadel.com, July 2026: https://www.luigidonadel.com/armadio/
- updresser AI personal stylist — updresser.com: https://updresser.com/
- Fitted digital closet — fittedcloset.com: https://www.fittedcloset.com/
- StyleSense AI wardrobe — stylesense.se: https://stylesense.se/
- Stylect digital wardrobe (IJERT, March 2026): https://www.ijert.org/stylect-design-and-development-of-a-personal-ai-powered-digital-wardrobe-web-application-ijertv15is031512
- Rethinking User Empowerment in AI Recommender System — CHI '26: https://programs.sigchi.org/chi/2026/program/content/222393
- What Makes an Explanation Good: systematic review of recommender explanations — ACM, 2026: https://doi.org/10.1145/3820245
- Explanation Driving Exploration: Conversational Recommender Systems — IUI '26: https://programs.sigchi.org/iui/2026/program/content/226598
- Empowering Users Through Conversational Explanations — CHI EA 2026: https://dl.acm.org/doi/10.1145/3772363.3799036
- Bonapi taste graph + explainable recommendations — bonapi.app: https://bonapi.app/
- Palytt taste-signal recommendations — palytt.com: https://palytt.com/
- Tastet taste profile & recommendations — app.tastet.ca: https://app.tastet.ca/en
