# Pinterest Sub-Department UI/UX — September 2026 State
## Frontier research for ThryftVerse flagship audit
**Research date:** 2026-09-12 · **Scope:** Pinterest sub-departments only (pin closeup, boards, save flows, profile/shop, Lens, notifications/messages, settings/tuning, create flows). Home feed and main search deliberately excluded.
**App version baseline:** Pinterest iOS v14.32–14.34 (Aug–Sep 2026 release train; weekly "bug fixes / performance" notes — feature surface documented via Help Center + press, not changelogs). [App Store / AppPulse, 2026-08/09, PRIMARY DOC]

**Evidence classes:** DIRECT OBSERVATION · PRIMARY DOC (Pinterest Help Center, engineering blog, newsroom, papers) · SECONDARY ANALYSIS (press, teardowns) · COMMUNITY REPORT (Reddit, forums, extension authors) · INFERENCE.

---

## 1. PIN CLOSEUP / PRODUCT DETAIL

### Current Pinterest pattern (Sept 2026) — component anatomy
- **Media-first canvas.** The image is the surface. Chrome is limited to: `Save` (primary, red), magnifying-glass-sparkle (visual search), share, heart-outline react, product tag icon, and an ellipsis overflow containing **Download / Add to collage / Report**. [help.pinterest.com/en-gb/article/interact-with-pins, Pinterest Help, living doc accessed 2026-09-12, PRIMARY DOC]
- **One-tap default save.** `Save` commits to a *recommended board* without opening a sheet; a dropdown adjacent to it opens board selection only if the user wants control. Two commitment tiers on one control. [help.pinterest.com/en/article/save-pins-on-pinterest, PRIMARY DOC]
- **Related-content continuation.** Scrolling past the pin body continues into visually/graph-similar pins (Related Pins powered by PinSage-class graph embeddings over the pin↔board graph — 3B nodes / 18B edges at publication), then modular sections such as *More to explore*, *Related searches*, and *Shop similar*. [PinSage, KDD'18 paper, cs.stanford.edu/people/jure/pubs/pinsage-kdd18.pdf, PRIMARY DOC; heatherfarris.com teardown, SECONDARY ANALYSIS]
- **Commerce blocks on product pins.** Price, availability, product details, and a `Visit site` outbound CTA — no in-app checkout. Third-party storefronts confirm Product Pins render price + availability + "Visit Site" as the buy path. [create.pinterest.com/merchants, PRIMARY DOC; spocket.co merchant guide 2025, SECONDARY ANALYSIS]
- **"Shop the Look" dot layer.** Detected objects in scene pins render as white dots; tap → dot expands into a bounding box + product results; swipe up → full shoppable feed. [Shop The Look paper, arxiv 2006.10866, Pinterest Engineering 2020, PRIMARY DOC]
- **Try On entry.** Select beauty/decor pins carry a `Try on` button or cube icon in closeup. [help.pinterest.com/en-gb/article/try-on, PRIMARY DOC]
- **Link-quality gating.** Pinterest has experimented with *removing* the `Visit` button on pins whose outbound link fails a quality bar — the CTA is earned, not guaranteed. [community.zazzle.com thread quoting Pinterest support, COMMUNITY REPORT]

### The psychology
- **Reduced commitment cost / default effect:** Save-to-suggested-board converts intent in one tap; the board picker is progressive disclosure for the minority who want control.
- **Information scent + momentum:** the closeup is a *waypoint*, not a destination — related pins underneath convert every dead-end into a next move (the "rabbit hole" the Lens team explicitly designed for). [Pinterest Engineering Lens post, PRIMARY DOC]
- **Object-level agency:** dots and tappable regions let users point at *the thing they mean* — recognition over recall; no need to verbalize "rattan peacock chair."
- **Trust via restraint:** price/availability shown *before* the outbound click sets accurate expectations; gating the Visit CTA on link quality trades short-term CTR for long-term trust.

### What makes it flagship
- Commerce and discovery layers are **stacked on the same media** (dots, cutouts, tags) rather than competing panels.
- Every pin closeup is simultaneously a detail page, a search launcher, a save surface, and a storefront — four jobs, one composition, no duplicate headers.

### Transferable mechanics (thrift marketplace)
- Item detail = media-first canvas; bottom continuation into *visually similar listings* + *more from this seller* + *same-era/brand rails* — no dead ends.
- Single primary CTA with a one-tap default (Save/Watch to suggested collection) + secondary picker.
- Dot/hotspot layer for multi-item photos ("shop this flat-lay") on seller shots.
- Show total price + shipping + availability *before* the buy sheet; gate prominence on listing quality (photo count, measurements, description completeness).

### Measurable acceptance criteria
- Item detail renders ≥2 continuation modules below the fold within 600ms of media load.
- One-tap save-to-default-collection completes in ≤2 taps total including confirmation toast.
- ≥70% of multi-item seller photos expose tappable hotspots where catalog mapping exists.
- Price/shipping/availability block visible in first viewport on 100% of listings; listings missing measurements show a quality-degraded CTA state.

---

## 2. BOARDS & BOARD MANAGEMENT

### Current Pinterest pattern — component anatomy
- **Three board types:** public, private/secret, group (collaborators). [help.pinterest.com/en/article/boards, PRIMARY DOC]
- **Tabbed board interior (mobile):** `All saves` | `More ideas` | `Shop` — recommendation tabs are **owner-only even on public boards**. Default lands on All saves; a filter-icon toggle controls "Show recommendations first." [help/boards, PRIMARY DOC]
- **Oct 2025 AI board refresh:** `Make it yours` tab (product recs for fashion/decor boards from saved pins), `More ideas` for all categories, `All saves` tab, `Styled for you` AI outfit collages (US/CA test), `Boards made for you` (editorial+AI boards pushed to inbox/feed). [EMARKETER, 2025-10-28, SECONDARY ANALYSIS]
- **Sections** = sub-collections inside a board; suggested section names at creation; then a pin-picker to populate. [help/create-a-board-section, PRIMARY DOC]
- **Reorder:** long-press → drag-and-drop pins, sections, and boards. Board sorting: `A to Z` / `Custom` / `Last saved to`. [help/organize-pins-and-sections, help/organize-your-boards, PRIMARY DOC]
- **Merge:** drag one board/section onto another → "Move Pins and delete board," or overflow → Merge. Converts a board into a *section* of the target. [help/merge-boards-and-sections; create.pinterest.com boards guide, PRIMARY DOC]
- **Archive:** board drops below the boards grid, hidden from public profile, save-disabled, restorable anytime. [help/archive-or-delete-a-board, PRIMARY DOC]
- **Delete with grace:** 7-day restore window via `Recently deleted boards` section (desktop restore only). [same, PRIMARY DOC]
- **Board cover + header image** (cover: iOS/desktop; header: mobile only; requires ≥1 pin). [help/edit-a-board, PRIMARY DOC]
- **Organize mode:** bulk-select grid → Move / Copy / Delete across boards and sections. [help/move-pins-to-another-board; Tailwind/HubSpot guides, PRIMARY DOC + SECONDARY]
- **Known regressions (community):** users report `More ideas` disappearing *inside board sections*, and section order auto-alphabetizing against custom order — both friction points July 2026. [reddit.sentinel-team.org r/Pinterest snapshots 2026-06/07, COMMUNITY REPORT]

### The psychology
- **Chunking & spatial memory:** boards → sections mirror how people mentally file plans; manual ordering (drag) preserves spatial memory of "where things live" — which is exactly why auto-alphabetizing enrages users (learned-location violation).
- **Endowment / IKEA effect:** collections users assemble and name feel owned; covers and headers are self-expression surfaces.
- **Object permanence & safe regret:** archive ≠ delete; the 7-day restore window lowers the cost of destructive action, encouraging cleanup instead of hoarding.
- **Variable reward inside owned space:** `More ideas`/`Shop`/`Make it yours` inject algorithmic serendipity *inside* the user's own taxonomy — discovery without leaving home turf.
- **Agency asymmetry:** recommendation tabs visible only to the owner preserves the "curated public face vs. private workshop" separation.

### What makes it flagship
- The board is a **living document**, not a static folder: owner-only intelligence tabs, merge-into-section refactoring, archive lifecycle, restore window — a full CRUD+lifecycle model most apps never build.
- Destructive and organizational actions are separated by commitment level (reorder < section < merge < archive < delete).

### Transferable mechanics
- Collections ("Closets"/"Wishlists") get sub-sections, drag-reorder, custom covers, merge-into-section, archive, and a soft-delete restore window.
- Owner-only `More like these` / `Shop this collection` tabs: turn a saved collection into a demand signal for the recommendation engine.
- `Make it yours`-style tab: "Complete this look" recommendations derived from saved items (e.g., saved blazer → suggested vintage trousers/boots).

### Measurable acceptance criteria
- Collection supports: sections, drag-reorder (items + sections), cover picker, merge, archive, restore ≤7 days — all reachable in ≤3 taps from collection view.
- Bulk organize mode selects ≥20 items and executes move/delete in one commit with undo snackbar.
- Owner-only recommendation tab present on collections with ≥5 saved items; hidden from other viewers.
- Restoring an archived collection returns it to its prior sort position (spatial memory preserved).

---

## 3. SAVE FLOWS

### Current Pinterest pattern — component anatomy
- **Two-tier save:** `Save` = instant commit to a *recommended board*; chevron/dropdown = board picker sheet. On mobile: tap pin → `Save` at bottom → choose board or `Create board`. [help/save-pins-on-pinterest, PRIMARY DOC]
- **Inline board creation inside the save sheet:** suggested name auto-filled from activity (editable), `Keep this board secret` toggle, collaborator invite — all without leaving the flow. [help/create-a-board, PRIMARY DOC]
- **Section creation mid-flow:** name field + suggested names → immediately select pins to move into it. [help/create-a-board-section, PRIMARY DOC]
- **Long-press quick-save** from feed: press-and-hold a pin → drag to save icon or to the visual-search icon — gesture menu, no navigation. [help/use-visual-search-features, PRIMARY DOC]
- **Bulk organize:** `Organize` on a board → multi-select → Move/Copy/Delete to boards *or sections*. [help/move-pins-to-another-board, PRIMARY DOC]

### The psychology
- **Default effect + recognition over recall:** the system *guesses the destination* and offers suggested board/section names — the user recognizes rather than generates. Naming is the highest-friction step in any filing flow; Pinterest amortizes it.
- **Progressive disclosure:** zero UI for the common case (one tap), full control one layer down.
- **Commitment gradient:** quick-save < choose-board < create-board < create-section — each step optional, never blocking.
- **Flow preservation:** board creation happens *inside* the save context so the original intent ("keep this") is never dropped.

### What makes it flagship
- The save sheet is a **completion engine**: suggested names, secret toggle, collaborators — the full object model editable inline, yet the common path is still one tap.
- Same gesture vocabulary everywhere (long-press works in feed, board, closeup).

### Transferable mechanics
- One-tap `Watch`/`Save` to a suggested collection; long-press for the picker; inline collection creation with suggested name ("vintage denim", "90s sportswear") derived from the item's attributes.
- Save-to-section in one sheet: `Save to ▸ Collection ▸ Section` as a single progressive-disclosure tree, never three screens.
- Gesture parity: long-press any listing card anywhere → save / compare / visually-search-similar.

### Measurable acceptance criteria
- Save completes in 1 tap for returning users when a suggested collection exists (acceptance: tap-to-saved-toast ≤1 interaction, ≤300ms perceived).
- New-collection creation inline adds ≤2 fields (name pre-filled, privacy toggle) — no navigation away from detail.
- Long-press menu on listing cards exposes ≤4 actions; save is reachable via drag-release in <800ms.
- Bulk organize: ≥50 items movable in one operation with a single undo window ≥5s.

---

## 4. PROFILE & SHOP

### Current Pinterest pattern — component anatomy
- **Created / Saved split** on profile; Saved contains boards grid + sort control; `Recently deleted boards` recovery section at the bottom. [help/organize-your-boards, help/archive-or-delete-a-board, PRIMARY DOC]
- **Merchant storefront:** connecting a catalog auto-generates a `Shop` tab — featured in-stock products organized by category, featured product groups, dynamically-created recommendations. [Pinterest Newsroom archive, merchant tools launch, PRIMARY DOC]
- **Board-level Shop tab:** personalized shoppable recs derived from the board's saved pins (owner-only). [help/boards, PRIMARY DOC]
- **Try On state (Sept 2026):** live for lipstick + eyeshadow (ModiFace-parameterized, ~10K+ shades historically) and home decor/furniture AR placement with 3D rotate; entry via camera `Try on` tab, or `Try on`/cube badge on eligible pins; integrated with skin-tone ranges; deliberately *no* smoothing/beautifying filters; snapshot-of-try-on savable as a pin; `more like this` below. Regional gating exists (e.g., UK: lipstick only). [help/try-on; newsroom AR launch; TechCrunch 2021-01-22, PRIMARY DOC + SECONDARY]
- **Personalization commerce moments:** e.l.f. "Color E.L.F.nalysis" — selfie → color-season analysis → curated board → shop (Cannes, June 2025). [MediaPost 2025-06-18, SECONDARY ANALYSIS]
- **AI-content provenance:** detected genAI pins carry a bottom-left label; ads disclose only inside "Why am I seeing this ad?". [TechBriefly 2025-03-10, SECONDARY ANALYSIS]

### The psychology
- **Identity vs. inventory:** Created/Saved separates self-expression from collection — two distinct social signals.
- **Reduced purchase anxiety:** Try On collapses the imagination gap ("will this shade work on me") — the #1 conversion blocker for color/fit categories; the no-beauty-filter stance protects calibration trust (what you see is what arrives).
- **Storefront as ambient surface:** Shop tab exists *because data exists* (catalog connected → tab appears) — zero-config progressive enhancement.
- **Personalized board as bridge:** e.l.f.'s selfie→board→shop chain converts analysis into an *owned artifact* (a board you keep) before asking for a purchase — commitment sequencing.

### What makes it flagship
- Provenance and realism are first-class (AI labels, no-smoothing AR, quality-gated links) — trust infrastructure, not just merchandising.
- Shop surfaces are *derived* from user behavior (boards → shop recs), so commerce feels like a continuation of intent rather than an insertion.

### Transferable mechanics
- Seller profiles: auto-generated `Shop`/rack view from live inventory — grouped by category, featured drops, "recently listed" — zero extra work for sellers.
- Fit confidence for thrift: measurements + "fits like" + model/reference sizing is the thrift analog of Try On; where feasible, AR for home goods; at minimum, *visual size reference* standards.
- Buyer profiles: `Saved` (collections) vs. `Listed` (their own items) — thrift users are both sides of the market.
- Provenance labels: AI-edited listing photos flagged; flaws-disclosure badges — resale trust is won on honest imaging.

### Measurable acceptance criteria
- Seller profile auto-composes a shop surface when ≥3 live listings exist; no manual setup step.
- Listing detail exposes size/measurement confidence block on 100% of apparel items; items missing measurements are visually marked.
- Saved vs. Listed surfaces reachable in ≤2 tabs from profile root.
- AI-edited or filter-applied listing media carries a disclosure label (audit sample ≥98% precision on flagged set).

---

## 5. VISUAL SEARCH (LENS) REFINEMENT

### Current Pinterest pattern — component anatomy
- **Three entry points:** (a) tap anywhere on a pin in closeup, (b) magnifying-glass-sparkle icon, (c) long-press a feed/board pin → drag to the sparkle icon. [help/use-visual-search-features, PRIMARY DOC]
- **Object glow:** on activation, searchable/shoppable objects in the image *glow* — the affordance is revealed on demand, not painted permanently. Tap a glowing item to select. [same, PRIMARY DOC]
- **Freeform cropper:** pinch-to-zoom + drag corner handles; tap selection again to deselect; results live-update *below* the image (mobile) / beside it (desktop) as the region changes. [same, PRIMARY DOC]
- **Dot reticle (Shop the Look):** white dots on detected objects → tap expands to bounding box → product rail; swipe up for full feed. [arxiv 2006.10866, PRIMARY DOC]
- **Refinement chips:** suggested keywords appear below the image; swiping the results grid up reveals more keyword refinements; a search bar materializes at the bottom on scroll to pivot into text search. [help/use-visual-search-features, PRIMARY DOC]
- **Cutout bridge:** any selected region can become a collage cutout; product-pin cutouts retain price/availability. [same, PRIMARY DOC]
- **Lens camera:** camera icon in search bar → pinch/tap-to-focus → snap or camera roll; Try On tab inside the same camera surface. [help/pinterest-lens, PRIMARY DOC]
- Scale: 250M+ visual searches/month as far back as 2017 — the refinement UX carries real traffic. [Pinterest Engineering Lens post, PRIMARY DOC]

### The psychology
- **Say-it-without-words:** visual queries solve vocabulary failure — users can't name "gorpcore shell jacket" but can point at it. Pointing is the lowest-literacy query interface that exists.
- **Progressive refinement loop:** region → results → keyword chips → new region — each turn narrows intent *without restarting*; the image stays anchored while results stream beneath (context preservation).
- **Affordance-on-demand (glow):** interactivity is revealed at the moment of intent — zero permanent chrome tax on the media.
- **Bridged modalities:** dots → bounding box → chips → text bar is a continuous escalation from pointing to language; users commit only as much precision as they have.

### What makes it flagship
- The image *is* the query language; refinement is layered (region → object → keyword) and every layer is reversible in one tap.
- Visual search isn't a separate destination — it hangs off the same long-press gesture everywhere.

### Transferable mechanics
- Long-press any listing photo → "find similar" region cropper: circle the boots in a full-fit photo → similar boots in inventory.
- Refinement chips under visual results: era / size / color / brand / price — cheap structured filters riding a visual query.
- "Shop this photo" hotspots on seller lookbook shots; buyers circle what they want in bundled-lot photos.

### Measurable acceptance criteria
- Region selection returns refined results in ≤1.5s p75 on device.
- Refinement chips change results with no scroll-to-top reset; deselect restores prior result set in one tap.
- Visual-search entry available via long-press on 100% of listing cards and detail media.
- Similar-items rail achieves ≥60% same-category precision (human-audited sample of 200 queries).

---

## 6. NOTIFICATIONS & MESSAGES

### Current Pinterest pattern — component anatomy
- **Unified bottom-nav surface:** the dialog-ellipsis tab hosts `Updates` (scrolled-to section) and `Messages` — activity and conversation share one home. Desktop splits into bell (updates) + messages. [help/send-messages, PRIMARY DOC]
- **Activity taxonomy (settings matrix):** each category × channel (Push / Email / In-app) is independently toggled — categories include: Pins you saved; Boards/searches/topics (boards-for-you, topics-for-you, recommended searches); Pins inspired by recent activity / picked for you / popular; Social (followers, group-board updates, messages, "people who share your interests"); Others (announcements, surveys). Push types: comments, mentions, saves, tries, invitations, etc. [help/edit-notification-settings, PRIMARY DOC]
- **NEP (Notification Event Processor):** near-real-time ML decides *content, recipient, channel, timing, aggregation* — pools events until a notification is worth sending; per-segment objectives; measurable WAU lift. [Pinterest Engineering NEP post on Medium, PRIMARY DOC]
- **Messages:** up to 10 recipients; `+` inside composer searches *pins/boards/profiles to attach*; heart reaction; **per-item reply threads** — replying to a shared pin opens a dedicated sub-thread about that object. Hide conversation; teen-safety restrictions. [help/send-messages, PRIMARY DOC]
- **Board-invite requests:** "Join" button → owner gets email+push; accept/decline from inbox. [help/request-to-join-a-board, PRIMARY DOC]
- **Community pain:** users report notifications/messages *moving* between UI revisions — surface instability is a real complaint theme in 2026. [Reddit sentiment snapshots 2026-06/07, COMMUNITY REPORT]

### The psychology
- **Batching respects attention:** aggregation ("pool events until ready") applies variable-reward economics in reverse — fewer, denser, higher-value interrupts beat a drip of low-value ones.
- **Object-anchored conversation:** replying *to a pin* keeps discussion bound to the artifact — no "which one did you mean?" overhead (shared context = reduced coordination cost).
- **Agency via matrix:** category×channel control converts "notifications are spam" rage into tuning — users who can opt down stay; users who can't, churn. (Cf. the r/Pinterest rage threads.)
- **Stability is a feature:** repeatedly relocating the inbox violates learned-location memory — community backlash is the measurable cost.

### What makes it flagship
- Notification delivery is a *ranked decision system* (NEP), not a rules engine — channel, timing and bundling are ML-chosen per user.
- Messages treat shared objects as first-class thread anchors — commerce-native messaging.

### Transferable mechanics
- One Activity surface: grouped updates (price drops on watched items, seller messages, offer events, "similar to your save") with a category×channel preference matrix.
- Object-anchored threads: reply directly to a shared listing / offer / bundle — thread header carries the item card.
- Notification bundling: batch low-priority events into a digest; reserve push for offers/messages/price-drops (money-relevant).
- Never relocate the inbox between releases — add, don't move.

### Measurable acceptance criteria
- Preferences expose ≥6 categories × ≥2 channels (push/in-app) with per-category persistence.
- ≥3 consecutive low-priority events aggregate into one grouped row with expandable detail.
- Object-anchored reply threads render the referenced listing card inline at the top of the sub-thread.
- In-app inbox position is frozen in IA across releases (regression test on navigation map).

---

## 7. SETTINGS & TUNING (personalization controls)

### Current Pinterest pattern — component anatomy
- **`Refine your recommendations`** (evolution of the 2020 "Home Feed Tuner") with five tabs: `Activity/Pins` (kill recs based on pins you looked at), `AI content`/`GenAI interests` (per-category AI reduction: architecture, entertainment, female fashion, food, health, male fashion…), `Boards` (per-board recs off — secret boards lock-labeled, archived auto-off), `Interests` (remove topics), `Following` (edit follows). [help/tune-your-home-feed, PRIMARY DOC; genviral.io 2026 guide, SECONDARY]
- **Pin-level feedback:** "why am I seeing this"-style attribution + hide + reason capture ("See less like this") — feedback is an explicit labeled signal, not just a downvote. [SocialSamosa 2020 launch coverage + current help paths, SECONDARY/PRIMARY]
- **Platform-reach gap:** GenAI controls shipped desktop+Android first, iOS staged. [help/tune-your-home-feed, PRIMARY DOC]
- **Efficacy gap (community):** multiple July-2026 reports of tuner toggles failing / board-based recs randomly re-enabling — controls exist but users doubt they work. [Reddit sentiment snapshots 2026-06/07, COMMUNITY REPORT]

### The psychology
- **Locus of control:** visible, granular levers convert algorithmic resentment into agency — even unused, the *existence* of the tuner raises tolerance.
- **Signal-legibility:** listing *which boards/pins* drive recs makes the model inspectable — "the algorithm" becomes a set of named, removable causes.
- **Recency justice:** one-off searches shouldn't haunt the feed forever; activity-level kill-switches acknowledge interest decay.
- **The trust corollary:** controls that don't visibly work are *worse than none* — the community evidence shows fake agency breeds deeper distrust than honest opacity.

### What makes it flagship
- Interest management is **object-level** (this board, this pin, this topic, this AI category) rather than one global "personalization" switch.
- Feedback vocabulary is explicit ("see less like this" with reason) — the user teaches the model in machine-usable terms.

### Transferable mechanics
- `Tune your feed`: per-source switches (this saved item, this collection, this seller, this category, followed sellers) — each a named, removable cause.
- "Why this listing?" disclosure row on recommendations: *"Because you saved vintage Levi's 501s"*.
- "Show less like this" with reason capture (wrong size / wrong era / already bought) — reasons feed ranking, not just filtering.

### Measurable acceptance criteria
- Tuner exposes ≥4 scopes (item, collection, seller, category) with per-scope persistence and immediate effect (change reflected in feed within 1 refresh).
- Every recommended item carries a one-line attribution string.
- "See less" offers ≥3 reason options; applying one measurably reduces that class within 24h (verified by sampled feed diff).
- Tuner state survives app updates and is honored by ranking (no silent resets — the Pinterest failure mode).

---

## 8. CREATE FLOWS (Pin builder, collages, product tagging)

### Current Pinterest pattern — component anatomy
- **Collage composer:** `+` → Collage → entry cards: new collage / drafts / template / **remix a collage**. Cutout sources: `More ideas` / `Your boards` / `Image uploads` / `Drafts`; search; previously-made cutouts; suggested cutouts. [help/create-a-collage, PRIMARY DOC]
- **Cutout mechanic:** open a pin → tap the portion to cut → `Add` or `Edit` the mask; selection becomes a reorderable layer. Product-pin cutouts **retain price/availability → the collage is shoppable**. [help/create-a-collage + use-visual-search-features, PRIMARY DOC]
- **Remix economy:** published collages can be remixed (creator toggleable); remixes auto-credit the original at the bottom; `Swap` a cutout with `Keep original shape`. [help/create-a-collage, PRIMARY DOC]
- **Pin builder + tag products:** business flow: Create Pin → upload → `Add products` → search by name / paste retailer link / pick from catalog. [community.pinterest.biz walkthrough, COMMUNITY/PRIMARY]
- **Auto-collages (advertiser AI):** catalog → thousands of shoppable collages (outfit ideas, similar products, user saves); users saved auto-collages **at 2× the rate of regular product pins** in early tests. [Pinterest Newsroom, Cannes Lions June 2025, PRIMARY DOC]
- **Scale signal:** tens of millions of user-built collages; disproportionately Gen Z. [Newsroom June 2025, PRIMARY DOC]

### The psychology
- **Creation from curation:** collages let users *author* using only what they've already *collected* — the bar to create drops to "arrange your taste." UGC without a camera.
- **Template momentum:** drafts/templates/remix = three descending commitment levels to start; remix specifically converts consumption into co-creation while auto-attribution protects provenance pride.
- **Shoppable self-expression:** the artifact is simultaneously mood board and storefront — identity output that carries commerce payload for free.
- **IKEA effect + network credit:** you built it (endowment), yet the original creator is named (fairness) — both motivations served.

### What makes it flagship
- Cutouts are **intelligent objects**: they remember their product metadata through the pipeline (pin → cutout → collage → shoppable tap-through).
- Creation is downstream of discovery — the composer is pre-stocked with the user's own saves, so the canvas is never blank.

### Transferable mechanics
- "Style board" composer: buyers/sellers arrange saved listings into fit collages; each cutout keeps its listing link + price → instantly shoppable outfit boards.
- Remix with attribution: community style boards as templates ("keep the layout, swap in your sizes").
- Listing-bundle creation: sellers cut multiple items from one photo into separate purchasable hotspots.

### Measurable acceptance criteria
- Composer opens pre-stocked with user's saved items; first cutout achievable in ≤3 taps from any listing.
- Every cutout retains item link + price through publish (metadata survival test on 100% of shoppable boards).
- Remix preserves original-creator attribution on 100% of derivative publishes.
- Draft autosave with resume; publish → live board pin ≤5s.

---

# RANKED TOP-10 — Pinterest sub-department patterns a marketplace app most likely lacks

1. **Recommendation tabs *inside* collections** (`More ideas` / `Shop` / `Make it yours`, owner-only) — collections as demand signals, not dead folders. Highest leverage: converts saving behavior into discovery+inventory matching.
2. **One-tap save to a *suggested* destination** — recommended board preselected, picker behind a chevron, inline create with suggested name. Most marketplace save flows are either no-destination dumps or multi-screen pickers.
3. **Region-level visual search from any image** (long-press → crop → similar items, glow-on-demand, refinement chips). Solves "I can't describe it" — endemic to vintage/thrift where taxonomy is weak.
4. **Object-anchored messaging threads** (reply to the *listing*, dedicated sub-thread) — eliminates "which item?" friction in negotiation.
5. **Soft-delete + archive lifecycle for collections** (7-day restore, archive hides-but-keeps) — cheap regret insurance that encourages organization.
6. **Per-source feed tuning with attribution** ("why this item" + per-item/seller/category kill-switches that *actually persist*) — the trust layer for any ranked feed.
7. **Dot/hotspot shoppable layer on multi-item photos** (Shop-the-Look mechanics) — thrift flat-lays and lot photos are perfectly suited; one photo → many purchasable objects.
8. **Merge-into-section refactoring** — drag collection A onto B → A becomes a section. Real collections grow organically and need restructuring primitives, not just rename/delete.
9. **Cutout composer producing shoppable artifacts** (style boards retaining price/link, remixable with attribution) — UGC creation with zero photography burden; huge for thrift styling culture.
10. **Aggregated, ML-timed notifications with category×channel matrix** — batch low-value events, reserve push for money events. Most marketplaces either spam or stay silent; the middle path is a ranked notification system.

---

## SOURCE REGISTER (all claims traceable)

| # | Source | Publisher | Date | Class |
|---|--------|-----------|------|-------|
| 1 | help.pinterest.com/en/article/interact-with-pins | Pinterest Help Center | living doc, acc. 2026-09-12 | PRIMARY DOC |
| 2 | help.pinterest.com/en/article/save-pins-on-pinterest | Pinterest Help Center | living doc | PRIMARY DOC |
| 3 | help.pinterest.com/en/article/create-a-board | Pinterest Help Center | living doc | PRIMARY DOC |
| 4 | help.pinterest.com/en/article/create-a-board-section | Pinterest Help Center | living doc | PRIMARY DOC |
| 5 | help.pinterest.com/en/article/boards | Pinterest Help Center | living doc | PRIMARY DOC |
| 6 | help.pinterest.com/en/article/organize-pins-and-sections | Pinterest Help Center | living doc | PRIMARY DOC |
| 7 | help.pinterest.com/en/article/organize-your-boards | Pinterest Help Center | living doc | PRIMARY DOC |
| 8 | help.pinterest.com/en/article/merge-boards-and-sections | Pinterest Help Center | living doc | PRIMARY DOC |
| 9 | help.pinterest.com/en/article/archive-or-delete-a-board | Pinterest Help Center | living doc | PRIMARY DOC |
| 10 | help.pinterest.com/en/article/edit-a-board | Pinterest Help Center | living doc | PRIMARY DOC |
| 11 | help.pinterest.com/en/article/move-pins-to-another-board | Pinterest Help Center | living doc | PRIMARY DOC |
| 12 | help.pinterest.com/en/article/use-visual-search-features | Pinterest Help Center | living doc | PRIMARY DOC |
| 13 | help.pinterest.com/en/article/pinterest-lens | Pinterest Help Center | living doc | PRIMARY DOC |
| 14 | help.pinterest.com/en/article/tune-your-home-feed | Pinterest Help Center | living doc | PRIMARY DOC |
| 15 | help.pinterest.com/en/article/send-messages | Pinterest Help Center | living doc | PRIMARY DOC |
| 16 | help.pinterest.com/en/article/edit-notification-settings | Pinterest Help Center | living doc | PRIMARY DOC |
| 17 | help.pinterest.com/en/article/request-to-join-a-board | Pinterest Help Center | living doc | PRIMARY DOC |
| 18 | help.pinterest.com/en-gb/article/create-a-collage | Pinterest Help Center | living doc | PRIMARY DOC |
| 19 | help.pinterest.com/en-gb/article/try-on | Pinterest Help Center | living doc | PRIMARY DOC |
| 20 | create.pinterest.com/merchants + /product-features/* | Pinterest Create | living doc | PRIMARY DOC |
| 21 | Shop The Look paper (arXiv 2006.10866) | Pinterest Engineering | 2020 | PRIMARY DOC |
| 22 | PinSage paper (KDD'18) | Pinterest/Stanford | 2018 | PRIMARY DOC |
| 23 | PinnerSage paper (KDD'20) | Pinterest/Stanford | 2020 | PRIMARY DOC |
| 24 | NEP notification system post | Pinterest Engineering (Medium) | ~2021 | PRIMARY DOC |
| 25 | Lens engineering post | Pinterest Engineering (Medium) | 2017 | PRIMARY DOC |
| 26 | Cold-start RecSys paper (arXiv 2512.17277) | Pinterest (via alphaXiv) | 2025-12 | PRIMARY DOC |
| 27 | AI boards announcement coverage | EMARKETER | 2025-10-28 | SECONDARY ANALYSIS |
| 28 | Auto-collages + trend forecasting | Pinterest Newsroom | 2025-06 | PRIMARY DOC |
| 29 | AI-content labeling policy | TechBriefly | 2025-03-10 | SECONDARY ANALYSIS |
| 30 | e.l.f. Color E.L.F.nalysis | MediaPost | 2025-06-18 | SECONDARY ANALYSIS |
| 31 | AR Try On launch | Pinterest Newsroom archive / TechCrunch | 2020/2021 | PRIMARY+SECONDARY |
| 32 | r/Pinterest sentiment snapshots | Reddit via sentinel-team.org | 2026-06/07 | COMMUNITY REPORT |
| 33 | Pinterest update rant roundup | dwhite.eu | 2025 | COMMUNITY REPORT |
| 34 | Pinterest UX case study | Medium (A. James) | 2025-10-20 | SECONDARY ANALYSIS |
| 35 | Pinterest product teardown | LinkedIn (V. Osusuluwa) | 2025-07-09 | SECONDARY ANALYSIS |
| 36 | Pinterest System Analysis & UX Audit | Behance | published 2026-04-14 | SECONDARY ANALYSIS |
| 37 | Pinterest Power Menu extension (module inventory) | GitHub | 2025–26 | COMMUNITY REPORT |
| 38 | iOS version history v14.x | App Store / AppPulse / iPa4Fun | 2026-08/09 | PRIMARY DOC |
| 39 | Home Feed Tuner launch coverage | SocialSamosa | 2020-03 | SECONDARY ANALYSIS |
| 40 | Product-tagging walkthrough thread | Pinterest Business Community | 2025 | COMMUNITY REPORT |

**Confidence note:** Sept-2026 surface details are anchored to living Help Center docs accessed today plus Oct-2025–Aug-2026 press/community evidence; where Pinterest A/B-tests or regions differ (Try On gating, Visit-button experiment, GenAI controls staged on iOS), this is flagged inline.
