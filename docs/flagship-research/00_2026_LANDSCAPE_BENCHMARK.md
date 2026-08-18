# 00 — 2026 Flagship Landscape & Benchmark

**Status:** MACRO SYNTHESIS — master reference for all department flagship docs
**Date:** August 2026
**Owner:** ThryftVerse Flagship Upgrade Programme
**Depends on:** `AGENTS.md` (charter §4, §11, §17, §27)
**Feeds:** every department-level flagship doc (`01_*` … `NN_*`)

> This document is the single macro reference that defines what "flagship" means in
> August 2026, diagnoses why a modern app can still read as a 6/10 from 2020, benchmarks
> the four reference competitors (Instagram, Pinterest, eBay, Snapchat), scores ThryftVerse
> today on 14 axes, codifies the flagship acceptance protocol from the AGENTS.md charter,
> and gives a prioritised upgrade roadmap. Every downstream department doc must inherit the
> scorecard, the acceptance protocol, and the root-cause diagnosis defined here.

---

## 1. The 2026 Flagship Landscape

### 1.1 What changed between 2020 and 2026

The visual and behavioural baseline for a "good" mobile app has moved twice since 2020.

- **2020-era baseline.** Flat design, Material 2 / iOS 13 conventions, card-on-card composition,
  grey-circle icon buttons, generic spinners, keyword search, static image carousels, one dark
  mode that was just "invert the palette." This is the world most template-generated and
  AI-scaffolded apps still ship in.
- **2023-era baseline.** Material 3 / iOS 17, tokenised design systems, skeleton loaders,
  spring physics, semantic colour, dynamic type. The "good enough" bar.
- **August 2026 baseline.** Two new platform languages now define the floor:
  - **iOS 26 Liquid Glass** — a translucent, adaptive, lensing material for controls and
    navigation; floating bars that defer to content; controls that "come alive" during
    interaction; depth and refraction as hierarchy tools, used with restraint
    ([Apple — Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass),
    [WWDC25 — Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)).
  - **Android 16 Material 3 Expressive** — an emotion-first, physics-driven update to Material
    You, grounded in 46 research studies with ~18,000 participants; springy motion, variable
    corner radius, shape-morphing, dynamic colour. Google's own eye-tracking study found users
    fixated on the correct element **33% faster** and completed tasks **20% faster** in M3
    Expressive vs prior Material 3
    ([Google — Expressive Design research](https://design.google/library/expressive-material-design-google-research),
    [Usability Hasn't Peaked (Google Research)](https://research.google/pubs/usability-hasnt-peaked-exploring-how-expressive-design-overcomes-the-usability-plateau/),
    [Google — M3 Expressive launch](https://blog.google/products-and-platforms/platforms/android/material-3-expressive-android-wearos-launch/)).

On top of the platform languages, five cross-platform forces define the 2026 flagship bar
([CR38 — Mobile App Design Trends 2026](https://cr38.digital/blog/mobile-app-design-trends-2026),
[Zealousys — 2026 UI/UX trends](https://zealousys.com/blog/top-mobile-app-ui-ux-design-trends/),
[Forasoft — 2026 UX playbook](https://www.forasoft.com/blog/article/mobile-app-ux-design-best-practices)):

1. **Spatial depth with restraint** — layered depth, soft shadows, motion that implies 3D space,
   but never skeuomorphic. Depth is a hierarchy tool, not decoration.
2. **Soft, spring-based motion as the default feedback** — nothing snaps, everything settles.
   Spring physics across all interactions is the single biggest perceived-quality lift available.
3. **Tokenised, motion-aware design systems** — colour, type, spacing, radius, elevation, motion
   and voice are all tokens; components are replaceable implementations of a tokenised contract
   ([Creative Alive — Design Systems 2026](https://creativealive.com/design-systems-2026-component-libraries-motion-tokens/),
   [UI/UX Atlas — Motion Design Tokens](https://www.uiuxatlas.com/lessons/motion/motion-design-tokens/)).
4. **AI as inline, opt-in, reversible UI** — predictive next-actions, visual search, semantic
   search, on-device inference for instant feedback. Forced or opaque AI kills trust faster than
   any legacy anti-pattern ([Forasoft](https://www.forasoft.com/blog/article/mobile-app-ux-design-best-practices)).
5. **Accessibility as a buying criterion** — WCAG 2.2 AA, 44×44pt targets, dynamic type,
   reduced-motion, VoiceOver/TalkBack. The European Accessibility Act (EAA, in force 2025) made
   this contractual, not optional.

### 1.2 What "flagship" means in 2026, in one sentence

A flagship app in 2026 feels **edited, stable, and deliberate** — the user forms that judgment
within seconds of opening it. Premium is less about decoration and more about control
(AGENTS.md §27.1). The product should feel like one authored surface, not an assembly of
reusable parts; media should be the primary colour; motion should settle, not snap; every
control should be truthful and every state should be designed.

---

## 2. The Flagship Scorecard — 14 Axes

Each axis is scored 1–10. For each, we define what a **10/10 (2026 flagship)** looks like and
what a **6/10 (2020-era)** looks like. The 6/10 band is deliberately precise because it is the
diagnostic band most "modern but underdeveloped" apps land in.

| # | Axis | 10/10 — 2026 flagship | 6/10 — 2020-era |
|---|------|------------------------|------------------|
| 1 | **Composition** | One authored surface; elements relate spatially with intent; media is the visual anchor; at most one dominant non-media panel above the fold (AGENTS §4 surface budget). | Card-on-card; every row, icon and section wrapped in its own grey surface; assembled from reusable parts rather than designed. |
| 2 | **Hierarchy** | Eye knows first, second, third glance; one dominant object per viewport; type scale has clear relationships with no competing weights. | Flat hierarchy; everything similar weight; duplicate headings, decorative subtitles, labels that merely name an obvious object. |
| 3 | **First-viewport usefulness** | Most important content + primary action visible without scrolling; time-to-first-value under 60s ([Forasoft](https://www.forasoft.com/blog/article/mobile-app-ux-design-best-practices)). | First viewport consumed by chrome, banners, onboarding modules, or grey placeholders; real content starts below the fold. |
| 4 | **Spacing rhythm** | Every gap communicates relationship; consistent 4/8pt scale; generous whitespace signals confidence. | Random padding; inconsistent gaps; oversized chrome compensated by empty space. |
| 5 | **Alignment** | Edges, baselines, centres are intentional; edge behaviour is consistent across the viewport. | Drifting edges; misaligned baselines; icons centred in oversized containers rather than optically aligned. |
| 6 | **Typography** | ≤3 type sizes + one eyebrow in first viewport; clear scale; one weight rule; no competing weights; dynamic type honoured. | 5+ competing sizes; decorative subtitles; repeated labels; type that doesn't scale with accessibility settings. |
| 7 | **Media art direction** | Real media is the primary colour and visual anchor; category-sensitive focal positioning; featured and supporting crops differ; shoes/bags not cropped at critical edges (AGENTS §15). | Generic grey placeholder cards dominate; blind `cover` crops; featured and supporting crops identical; low-quality images get no restrained placeholder. |
| 8 | **Action placement** | Primary actions obvious; secondary restrained; destructive separated and confirmed; hit area separated from visible shape (44pt target, 20–24pt glyph; no 44pt grey circles — AGENTS §4). | Chrome-heavy controls; 44pt grey circles/squares around every icon; primary and secondary actions compete; destructive actions not separated. |
| 9 | **Information density** | 4–6 useful rows in a list viewport; ≥2 meaningful media objects in discovery; enough to be useful, not so much it overwhelms (AGENTS §4 density target). | Either too sparse (oversized chrome, 2 rows visible) or too cluttered (dashboard dump with no hierarchy). |
| 10 | **Native interaction** | Press scale 0.97–0.985, opacity response, spring physics, haptic grammar; gesture-first with discoverable button equivalents; <16ms response ([CR38](https://cr38.digital/blog/mobile-app-design-trends-2026), AGENTS §17). | Snap transitions; no press feedback; no haptics; gestures with no discoverable fallback. |
| 11 | **State coverage** | Loading (skeleton matching final silhouette), empty (illustration + CTA), error (inline + recovery), partial, offline, populated, filtered-empty, permission-denied all designed (AGENTS §14). | Generic centred spinner for every state; no empty state; fabricated data to avoid designing one; no offline state. |
| 12 | **Motion language** | Restrained, tokenised, spring-based; 160–240ms standard; reduced-motion fallbacks; motion confirms action, doesn't disguise a slow app (AGENTS §17, §27.2–27.3). | Missing motion entirely; or decorative bounce/pulse/shimmer; no reduced-motion behaviour. |
| 13 | **Truthful UI** | Every control performs its action, navigates correctly, shows truthful disabled state, or is removed; no "Coming soon", no fabricated success/data/presence (AGENTS §11). | "Coming soon" toasts; fabricated success states; controls that produce explanation toasts; fake activity/presence/order state. |
| 14 | **Light/dark parity** | Geometry, hierarchy and density identical across themes; dark mode is not permission for translucent containers or glow (AGENTS §4). | Dark mode is "invert palette + add glow"; different density; translucent containers appear only in dark; hierarchy shifts between themes. |

**How to use the scorecard.** Score each axis 1–10. A flagship product targets **≥8 on every
axis**, with no axis below 7. A 6/10 on any single axis is a visible 2020-era tell; two or more
6/10s and the whole product reads as "underdeveloped" regardless of the other scores. This is
the central diagnostic insight: **flagship quality is gated by the weakest axis, not the average.**

---

## 3. Root-Cause Diagnosis — Why a Modern App Still Reads as "6/10 from 2020"

A React Native app can ship with current libraries, a token file, and dark mode, and still feel
like "a 6/10 from 2020, underdeveloped, low-quality AI-slop." The root cause is not missing
technology — it is **composition debt and authorship absence**. The app was assembled from
generic primitives rather than authored as a product surface. The 2020-era tells below are the
specific symptoms. Each one is a failure of authorship, not a missing token.

### 3.1 The 2020-era tells (diagnostic checklist)

1. **Card-on-card composition.** Every row, icon, filter, and section is wrapped in its own grey
   surface. Nested surfaces with no distinct interaction or state boundary. Violates the AGENTS
   §4 "no card-on-card" and "surface budget" rules directly. This is the single most common tell
   and the one users register first, even if they can't name it.
2. **Chrome-heavy controls (44pt grey circles).** Back, search, overflow, camera, notification
   and chevron controls rendered as 44pt grey circles or squares merely to satisfy the touch
   target. AGENTS §4 is explicit: separate hit area from visible shape; ordinary utility controls
   default to transparent 44pt targets with a 20–24pt glyph.
3. **Excessive surfaces / wrappers.** A grey panel inside a grey panel inside a screen background.
   Three layers of containment where flat canvas + spacing + a hairline would do.
4. **Generic grey placeholders.** On discovery, profile and creator surfaces, grey placeholder
   cards become the dominant first-viewport story. AGENTS §4 "media storytelling" is violated:
   real media must be the primary colour and visual anchor.
5. **Missing motion.** Snap transitions, no press feedback, no haptics, no spring physics. The
   app feels dead. In 2026, soft spring-based motion is the default feedback pattern in
   well-designed apps ([CR38](https://cr38.digital/blog/mobile-app-design-trends-2026)).
6. **Missing state coverage.** A generic centred spinner for every state; no empty state; no
   offline state; no filtered-empty state. Fabricated data to avoid designing an empty state.
7. **Fabricated / "coming soon" UI.** Controls that produce "Coming soon" or "Backend required"
   toasts; fabricated success states, IDs, presence, activity, order state. AGENTS §11 violation.
8. **AI-generated text that reads as slop.** Generic, hedging, repetitive copy that could belong
   to any app. Decorative subtitles and labels that merely name an obvious object. This is the
   "AI-slop" signal: the text was generated to fill space, not to communicate.
9. **Inconsistent radii / strokes.** Arbitrary 0.5, 1, 1.5 and 2pt outlines in the same component
   family; three or four radius sizes in one viewport with no role logic. Violates AGENTS §4
   radius budget and stroke grammar.
10. **Decorative subtitles / duplicate headings.** A heading, then a subtitle that restates the
    heading, then a label that names the same object. AGENTS §4 text budget: ≤3 type sizes + one
    eyebrow in the first viewport.
11. **No media art direction.** Blind `cover` crops; shoes cropped at the toe; bags cropped at
    the strap; portrait garments losing their silhouette; square jewellery off-centre. Featured
    and supporting crops identical. AGENTS §15 violation.
12. **Flat information hierarchy.** Everything the same weight; no dominant object; the eye has
    no reading order. The screen reads as a dashboard dump, not a crafted product surface.

### 3.2 The underlying root cause

All twelve tells share one root cause: **the surface was assembled, not authored.** A designer
(or an AI scaffold) reached for generic primitives — a Card, a Row, an Icon Button, a Spinner —
and stacked them until the screen "worked." No one stepped back and asked: *what is the one
dominant object, what is the reading order, where does media carry the story, what is the
spacing rhythm, what are the states?*

This is why token swaps and shadow additions don't fix it. You cannot token your way out of
card-on-card composition. You cannot shadow your way into hierarchy. The fix is authorship:
design the surface as one composition, enforce the surface/radius/stroke/text budgets, make
media the anchor, design every state, and let motion settle.

### 3.3 Why AI-slop specifically reads as low-quality

2026 users have been calibrated by category-defining apps to expect "edited, stable, deliberate"
(AGENTS §27.1). AI-generated text and AI-assembled layouts violate all three: they are
unedited (generic copy, decorative subtitles), unstable (inconsistent radii/strokes/spacing),
and accidental (no author made a deliberate composition decision). The user's snap judgment is
visceral — it is the **visceral level** of Don Norman's emotional design (AGENTS §27.1) — and it
happens before they read a single word. This is why a "technically correct" app can still feel
like slop: the composition was never authored.

---

## 4. Per-Competitor 2026 Benchmark

The goal is to learn the **underlying design thinking**, not to photocopy surface appearance
(AGENTS §3, §5). For each competitor: what they do in 2026, and what ThryftVerse should learn.

### 4.1 Instagram — content-forward authorship and the viewfinder system

**August 2026 state.** Instagram unveiled its first major brand refresh in over a decade in
August 2026. The wordmark is still script but tightened and squared; the wider system brings an
updated Instagram Sans, a new Instagram Pen (handwriting) and Instagram Mono; motion, layout and
UI have been refreshed with "more room to breathe"; the gradient remains core but is used with a
lighter touch
([Meta Design blog](https://www.meta.com/design-at-meta/blog/the-new-instagram-brand-identity/),
[About Instagram — visual refresh](https://about.instagram.com/blog/announcements/instagram-visual-refresh),
[It's Nice That — behind the refresh](https://www.itsnicethat.com/features/behind-instagrams-first-major-refresh-in-10-years-partnership-130826),
[Creative Boom](https://www.creativeboom.com/news/instagram-reveals-its-first-brand-refresh-in-10-years-with-a-new-wordmark-and-three-typefaces/)).

The most instructive idea is the **viewfinder device** — a form derived from the camera glyph
that frames imagery throughout the system and "breaks the fourth wall" to remind the scroller
that every image began with a real person framing a shot. The team describes the system as "a
really well-designed sketchbook" — structured enough to hold together, flexible enough to
encourage weirdness. The identity is rooted in the actual tools and rituals of photographic
image-making (contact sheets, registration marks, annotations), not a borrowed aesthetic.

**What ThryftVerse should learn.**
- **Content-forward composition.** The system "puts content at the center" and the chrome
  recedes. ThryftVerse's discovery and listing surfaces should let the garment be the hero; the
  UI is a well-designed sketchbook, not a dashboard.
- **One authored device, used consistently.** The viewfinder is a single compositional idea
  applied across the system. ThryftVerse needs its own equivalent — a consistent framing
  logic for media, not a different card shape on every screen.
- **Restraint with the gradient.** The gradient stays core but is used with a lighter touch.
  ThryftVerse should reserve its accent colour for selection, primary action, and status — not
  decoration (mirrors AGENTS §4 "visible containment must have meaning").
- **Typography as identity.** Three typefaces (Sans, Pen, Mono) give Instagram range without
  chaos. ThryftVerse needs a disciplined type scale, not 5 competing sizes.

### 4.2 Pinterest — Gestalt, masonry, and the image-first design system

**August 2026 state.** Pinterest's design system **Gestalt** is the canonical reference for
image-first, visual-discovery products. It ships masonry layout primitives, a documented motion
language tuned for image-heavy surfaces (fades, scale-ins, shimmer placeholders as first-class),
opinionated guidance on internationalization and RTL, and a large internally consistent icon set.
Since 2022 it expanded from ~45 web components to 85 code-backed components across Android, iOS
and Web, with a token layer covering colour, typography, elevation, spacing, radius and motion
([Gestalt docs](https://gestalt.pinterest.systems/),
[GitHub — pinterest/gestalt](https://github.com/pinterest/gestalt),
[DesignSystems.one — Gestalt breakdown](https://www.designsystems.one/design-systems/gestalt),
[shadcn — Pinterest marketing system](https://www.shadcn.io/design/pinterest)).

The marketing system is "the discipline of getting out of the photograph's way": a warm-cream
neutral palette (#fbfbf9 page wash, #f6f6f3 card surface), Pin Sans in tight negative-tracked
display sizes, a single saturated Pinterest Red (#e60023) reserved exclusively for the Sign-up
CTA, the active-tab indicator, and the wordmark. Two-radius shape system (16px buttons/pin cards,
32px modals, nothing in between). Steep type jump (70px display → 16px body). Masonry pin grid at
8px gutters — imagery effectively touches across columns, the tightest grid in mainstream marketing.

**What ThryftVerse should learn.**
- **Single-accent voltage.** One saturated accent reserved for CTAs, active state, and brand —
  never decorative. This is exactly AGENTS §4 "visible containment must have meaning."
- **Two-radius shape system.** No more than two non-avatar radius sizes in a viewport. Pinterest
  proves the discipline; ThryftVerse should adopt the AGENTS §4 radius budget literally.
- **Masonry as discovery.** Asymmetric, image-led grids where imagery touches across columns.
  ThryftVerse's discovery feed should feel like a wardrobe, not a spreadsheet.
- **Motion tuned for image-heavy surfaces.** Fades, scale-ins, and shimmer placeholders are
  first-class citizens, not afterthoughts. ThryftVerse's loading states should be shimmer
  skeletons matching the final silhouette (AGENTS §14, §27.4).
- **Documentation as the contract.** In 2026 the token layer is the contract, not the component
  library ([Creative Alive](https://creativealive.com/design-systems-2026-component-libraries-motion-tokens/)).
  ThryftVerse's tokens (colour, type, spacing, radius, elevation, motion) must be the source of
  truth.

### 4.3 eBay — visual-rich search and the marketplace maturity pivot

**August 2026 state.** eBay has been executing a multi-year search and discovery redesign. The
new search interface features larger, high-resolution images, a modernized layout, streamlined
navigation, a new full-width "Shopping View" (replacing the old gallery view, no sidebar ads),
consolidated delivery options, interactive price filters, rounded image corners, uniform image
sizes, and consistent font styles. AI and visual search are integrated into homepage discovery
("Press, Hold, Discover" to shop similar items; the "Explore" AI-powered discovery feed for
fashion)
([eBay Innovation — search redesign](https://innovation.ebayinc.com/stories/ebay-introduces-intuitive-search-redesign-to-elevate-shopper-experience/),
[Value Added Resource — eBay visual search](https://www.valueaddedresource.net/ebay-visual-search-shop-similar-app/)).
The seller side has been rebuilt around a selling overview page that prioritises high-level
information with drill-down, moves frequently-checked modules (tasks) to the top, and introduces
contextual in-app education triggered by seller activity
([Anna Zaremba — eBay selling](https://www.annamzaremba.com/project-ebay-selling.html)).

**What ThryftVerse should learn.**
- **Visual-rich search is the floor.** Larger images, uniform sizes, rounded corners, consistent
  fonts — the search results page is a visual surface, not a text list. ThryftVerse's browse and
  search results must be image-led.
- **AI discovery with user control.** eBay's "Explore" learned the hard way that removing user
  fine-tuning controls ("update interests") degraded trust. AGENTS §27.6 and Forasoft both
  confirm: AI features win when inline, opt-in, and reversible. ThryftVerse's recommendations
  must expose why ("Suggested because you viewed…") and stay reversible.
- **Seller surface hierarchy.** Move the most-checked modules to the top; prioritise high-level
  info with drill-down; contextual education triggered by activity. ThryftVerse's seller/selling
  surfaces should follow this hierarchy, not dump every setting at the same weight.
- **Shopping View over gallery view.** Full-width, no sidebar ads, image-first. ThryftVerse's
  category browse should feel like shopping, not like a database query result.

### 4.4 Snapchat — the cautionary tale on minimalist redesign and the five-tab settlement

**August 2026 state.** Snapchat's "Simple Snapchat" three-tab redesign (announced SPS 2024) was
**reversed** in Q1 2025 after losing 1 million North American users. The most engaged users
"consistently demonstrated a preference for a five-tab layout, favoring the familiarity of
tile-based content discovery and a dedicated Map tab." Snap is now testing a "refined" five-tab
design that brings more Stories into the messaging experience and places Spotlight directly
right of the camera
([The Verge — Snapchat scraps simple redesign](https://www.theverge.com/news/658306/snapchat-simple-redesign-losing-north-american-users),
[Noah Intelligence](https://noah-news.com/snap-rethinks-snapchat-redesign-after-user-backlash-and-reports-strong-quarterly-growth/),
[Creative Bloq](https://www.creativebloq.com/web-design/ux-ui/snapchats-redesign-fail-shows-users-dont-always-want-minimalist-ui),
[Snap newsroom — SPS 2024](https://newsroom.snap.com/sps-2024-simple-snapchat?lang=en-US)).

The lesson is not "don't redesign." It is: **minimalism is not automatically better; familiarity
and tile-based discovery carry real value; and the most engaged users are the canary.** The
camera remains the open-to state; the unified For You feed merges Spotlight with publisher
content; Stories sit at the top of conversations because "sharing and replying to Stories is
fundamental to the way we communicate."

**What ThryftVerse should learn.**
- **Don't strip navigation that earned its place.** If a tab/surface has a clear user job, keep
  it. Minimalism that removes capability is not flagship — it is regression. AGENTS §8: preserve
  working functionality; preserve navigation.
- **Camera/creation as the open-to state.** Snapchat opens to the camera because creation is the
  core job. ThryftVerse's equivalent is the listing/creation flow for sellers — it should be
  fast, primary, and never buried.
- **Tile-based discovery has value.** The five-tab preference proves users like tile-based
  content discovery. ThryftVerse's home/discovery should be tile-and-media-led, not a menu list.
- **Test with the most engaged users first.** They are the canary. A redesign that loses them
  loses the business.

---

## 5. ThryftVerse Overall Scorecard — Today vs Target

This is the macro scorecard for the app **today**, based on the 2020-era tells audit. Each axis
gets a current score, a one-two sentence justification, and a target. Department docs inherit
these targets and break them into screen-level work.

| # | Axis | Today | Justification (today) | Target |
|---|------|------|------------------------|--------|
| 1 | Composition | 5 | Card-on-card across browse, profile, and listing surfaces; every row and icon wrapped in its own grey surface; assembled not authored. | 9 |
| 2 | Hierarchy | 5 | Flat hierarchy; duplicate headings and decorative subtitles common; no single dominant object per viewport. | 9 |
| 3 | First-viewport usefulness | 6 | Real content often starts below the fold behind chrome, banners, or grey placeholders; time-to-first-value is not under 60s on key surfaces. | 9 |
| 4 | Spacing rhythm | 5 | Random padding; inconsistent gaps; oversized chrome compensated by empty space rather than deliberate rhythm. | 8 |
| 5 | Alignment | 6 | Drifting edges and misaligned baselines on list rows; icons centred in oversized containers rather than optically aligned. | 8 |
| 6 | Typography | 5 | 5+ competing sizes on several surfaces; decorative subtitles; type that doesn't consistently honour dynamic type. | 8 |
| 7 | Media art direction | 4 | Generic grey placeholders dominate discovery; blind `cover` crops; shoes/bags cropped at critical edges; featured and supporting crops identical. | 9 |
| 8 | Action placement | 5 | Chrome-heavy controls; 44pt grey circles around utility icons; primary and secondary actions compete; hit area not separated from visible shape. | 9 |
| 9 | Information density | 5 | Either too sparse (oversized chrome, 2 rows visible) or too cluttered (dashboard dump); not hitting the 4–6 rows / ≥2 media objects target. | 8 |
| 10 | Native interaction | 5 | Snap transitions; missing press feedback and haptics; no spring physics; gestures with no discoverable fallback. | 8 |
| 11 | State coverage | 4 | Generic centred spinner for most states; missing empty/offline/filtered-empty states; fabricated data to avoid designing empty states in places. | 9 |
| 12 | Motion language | 4 | Missing motion entirely on most surfaces; no tokenised motion; no reduced-motion fallback; where motion exists it is decorative not purposeful. | 8 |
| 13 | Truthful UI | 5 | "Coming soon" toasts and fabricated success/presence in places; controls that produce explanation toasts rather than performing an action. | 10 |
| 14 | Light/dark parity | 5 | Dark mode is largely "invert palette"; density and hierarchy drift between themes; translucent containers appear in dark without role logic. | 9 |

**Aggregate today:** ~5.0 average, gated by the weakest axes (Media art direction 4, State
coverage 4, Motion language 4). **Aggregate target:** ~8.6 average, with no axis below 8 except
where 9/10 is the explicit target. The gap is ~3.6 points — closeable through authorship, not
through token swaps.

---

## 6. Flagship Acceptance Protocol

This protocol is inherited directly from the AGENTS.md charter (§4 comparative visual-fidelity
protocol, §11 truthful UI, §17 motion). Every screen, in every department, must pass **all** of
these before it is accepted as flagship. No single check is optional.

### 6.1 The two visual tests (gate checks)

1. **Thumbnail test.** At roughly 25% scale, the primary object and reading order remain
   obvious; repeated rounded rectangles do not dominate the silhouette. (AGENTS §4)
2. **Squint test.** Blur or squint at the screen; media/identity/content should dominate, while
   navigation and utility chrome recede. (AGENTS §4)

If three or more screens exhibit the same visual defect, inspect and correct the **shared
primitive** first. Screen-local compensation is allowed only when that screen has a genuinely
different information hierarchy (AGENTS §4).

### 6.2 The hard budgets

| Budget | Rule (verbatim from AGENTS §4) |
|--------|--------------------------------|
| **Surface budget** | Above the fold, at most one dominant non-media panel. Do not wrap every row, icon, filter and section in separate grey surfaces. Flat canvas, spacing and hairlines are the default utility structure. |
| **Radius budget** | No more than two non-avatar radius sizes in one viewport unless a modal is present. Radius communicates role: 8–12pt compact utility, 12–16pt media/fields, 20pt+ only for a genuinely dominant panel or dock. |
| **Stroke grammar** | Separators are hairline; fields and explicit outlines are 1pt; 2pt is reserved for focus or selection. Never mix arbitrary 0.5, 1, 1.5 and 2pt outlines in the same component family. |
| **Icon grammar** | A region uses one icon family, one optical size band and a stable outline/filled-state rule. Standard navigation glyphs are 20–24pt. Small metadata glyphs are 14–18pt. Novelty symbols do not replace clear product language. |
| **Density target** | A normal list viewport exposes roughly 4–6 useful rows. A discovery viewport exposes at least two meaningful media objects or the beginning of the next module. Empty space must support focus, not compensate for oversized chrome. |
| **Text budget** | The first viewport normally uses no more than three type sizes and one eyebrow. Remove duplicate headings, decorative subtitles and labels that merely name an obvious object. |
| **Media storytelling** | On discovery, profile and creator surfaces, real media must be the primary colour and visual anchor. Generic grey placeholder cards never become the dominant first-viewport story. |
| **No card-on-card** | A nested surface requires a distinct interaction or state boundary. Otherwise flatten it. |
| **Light/dark parity** | Geometry, hierarchy and information density remain identical across themes. Dark mode is not permission to add translucent containers or glow. |

### 6.3 The control and truth rules

- **Separate hit area from visible shape.** A control may require a 44pt target while showing
  only a 20–24pt glyph. Do not render a 44pt grey circle or square merely to satisfy
  accessibility. (AGENTS §4)
- **Visible containment must have meaning.** Use a persistent fill or outline only for selection,
  primary action, input boundary, status, media contrast, or grouping that is unclear without
  it. Ordinary Back, search, overflow, camera, notification and chevron controls default to
  transparent 44pt targets. (AGENTS §4)
- **Truthful UI.** Every visible control must perform the represented action, navigate to the
  correct screen, show a truthful disabled state, or be removed. Never expose "Coming soon" /
  "Backend required" / explanation toasts. Never fabricate success, IDs, data, persistence,
  presence, activity, order or tracking state. (AGENTS §11)

### 6.4 The motion rules

- **Encouraged:** press scale 0.97–0.985, slight opacity response on press, animated segment
  indicators with spring physics, content crossfade/directional slide on mode change, watch icon
  state transition, haptic selection feedback, reduced-motion fallbacks for all motion.
- **Prohibited:** bounce, continuous pulsing, floating cards, decorative shimmer after loading,
  large spring movement, dramatic parallax, excessive blur dependency, animating the entire page.
- **Duration:** 160–240ms for most transitions. Respect reduced motion by changing instantly or
  using a simple fade. (AGENTS §17)
- **Flagship timing (2026, AGENTS §27.2):** 50–100ms instant feedback; 100–200ms simple state
  change; 200–300ms standard transition; 300–500ms complex transition; 500ms+ elaborate only.
  Feedback must arrive within 100ms of user action.

### 6.5 The state completeness rule

Every screen touched must account for: loading, populated, empty, filtered-empty, offline, error,
retry, disabled, submitting, success, partial data, missing media, permission denied. Skeletons
should resemble the final layout. No generic centred spinner for every state. No fabricated data
to avoid designing an empty state. (AGENTS §14)

### 6.6 Acceptance evidence (visual delta)

For a meaningful flagship pass, retain local before/after captures and compare at least:
first useful content Y-position, number of useful objects above fold, visible rounded-container
count, largest non-media control size, icon optical size and line-weight consistency, content
occluded by sticky navigation/docks, loading vs final geometry shift (AGENTS §4). Do not commit
captures unless requested. A TypeScript pass cannot override an obviously inferior native render.

---

## 7. Prioritised Upgrade Roadmap

The roadmap is ordered by **perceived-quality lift per unit of work** — which departments, fixed
first, produce the largest jump in the user's snap judgment of "flagship." The ordering follows
the scorecard weakest-axes and the 2020-era tell frequency.

### Phase 1 — Shared primitives & motion foundation (highest leverage, unblocks everything)

**Why first.** The scorecard's weakest axes (Media art direction 4, State coverage 4, Motion
language 4) and the most frequent tells (card-on-card, chrome-heavy controls, missing motion,
missing states) are all **shared primitive** problems. AGENTS §4: "If three or more screens
exhibit the same visual defect, inspect and correct the shared primitive first." Fixing the
primitives unblocks every department.

- **Motion tokens.** Land the spring configs from AGENTS §27.3 (tap, press, entrance, lift,
  success, sharedElement, urgency) as the single source of truth; wire `useMotionConfig()` into
  every interactive primitive; add reduced-motion fallbacks. ([Creative Alive](https://creativealive.com/design-systems-2026-component-libraries-motion-tokens/),
  [UI/UX Atlas](https://www.uiuxatlas.com/lessons/motion/motion-design-tokens/))
- **Surface/radius/stroke/icon budgets.** Enforce the AGENTS §4 budgets at the primitive level:
  one Card primitive with role-based radius, one hairline separator, one 1pt field outline, 2pt
  only for focus/selection; one icon family, one optical size band per region.
- **Control primitive.** Separate hit area from visible shape; transparent 44pt targets for
  utility controls; 20–24pt glyphs; no 44pt grey circles.
- **State primitives.** Skeleton matching final silhouette, shimmer for image-heavy surfaces,
  inline error + recovery, empty-state illustration + CTA. Kill the generic centred spinner.
- **Media primitive.** Category-sensitive focal positioning; restrained placeholder for
  low-quality/missing images; featured vs supporting crop logic (AGENTS §15).

### Phase 2 — Discovery & browse (the first impression)

**Why second.** Discovery is the open-to surface for buyers. It is where the "edited, stable,
deliberate" snap judgment is formed. Media art direction and composition tell most here.

- Flatten card-on-card into tile-and-media-led composition (Pinterest masonry discipline, eBay
  Shopping View discipline).
- Real media as the primary colour and visual anchor; kill grey-placeholder dominance.
- AI discovery with user control and exposed reasoning (eBay "Explore" lesson, AGENTS §27.6).
- Hit the density target: ≥2 meaningful media objects above the fold.

### Phase 3 — Listing detail / product page (the conversion surface)

**Why third.** This is where social-referred shoppers land and where conversion happens. 2026
social commerce data: social-referred shoppers convert at 1.4× organic search on a
source-matched PDP, but abandon at 2.3× on a generic SEO-first page
([Online Store News — social commerce PDP rethink](https://onlinestorenews.com/social-commerce-maturity-is-forcing-a-product-page-rethink-in-2026/),
[Online Store News — conversion gap](https://onlinestorenews.com/social-commerce-conversion-gap-is-forcing-stores-to-redesign-pdps/)).
- Video-native hero blocks where media exists; static image stack otherwise.
- Truthful pricing, fees, status, pending states (AGENTS §27.7 trust architecture).
- Complete state coverage (loading skeleton, missing media, offline, error + retry).
- Coherent action placement: primary buy action obvious, secondary restrained, destructive
  separated.

### Phase 4 — Profile & creator surfaces (identity and trust)

**Why fourth.** Profile is where identity, social proof, and seller trust live. Vinted/Depop
analysis shows profile is not a feature dumping ground — it is a seller-focused hierarchy with
separate seller-wardrobe vs buyer entry points (AGENTS §27.6).
- Clear hierarchy; seller-focused; separate seller wardrobe from buyer entry points.
- Real media as the anchor; social proof visible (likes, reviews, seller stories).
- No fabricated presence/activity (AGENTS §11).

### Phase 5 — Seller / selling surfaces (the creation flow)

**Why fifth.** The seller flow is ThryftVerse's "camera" — the core creation job (Snapchat
lesson). It should be fast, primary, and never buried. eBay's selling overview lesson:
prioritise high-level info with drill-down, move frequently-checked modules to the top,
contextual education triggered by activity.
- Selling overview hierarchy: tasks at top, high-level info, drill-down.
- Fast listing creation flow; in-app contextual education.
- Truthful states: no fabricated success, no fake order/tracking state.

### Phase 6 — Navigation, search, and cross-cutting polish

**Why last.** Once primitives and the high-traffic surfaces are flagship, navigation and
cross-cutting polish close the gap. Don't strip navigation that earned its place (Snapchat
lesson); do enforce platform conventions (iOS 26 Liquid Glass scoped to nav/controls, Android 16
M3 Expressive springy motion — AGENTS §27.5).
- Five-tab-equivalent: keep navigation that has a clear user job.
- Visual search / semantic search / AI autocomplete (keyword-only search is a 2020 liability —
  AGENTS §27.6).
- Light/dark parity pass: geometry, hierarchy, density identical across themes.
- Accessibility pass: WCAG 2.2 AA, 44×44pt targets, dynamic type, reduced motion, VoiceOver/
  TalkBack labels (AGENTS §18).

---

## 8. Sources

- Apple — Adopting Liquid Glass: https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass
- WWDC25 — Meet Liquid Glass: https://developer.apple.com/videos/play/wwdc2025/219/
- Apple Developer — Design what's new: https://developer.apple.com/design/whats-new
- Google — Expressive Design research: https://design.google/library/expressive-material-design-google-research
- Google Research — Usability Hasn't Peaked: https://research.google/pubs/usability-hasnt-peaked-exploring-how-expressive-design-overcomes-the-usability-plateau/
- Google — Material 3 Expressive launch: https://blog.google/products-and-platforms/platforms/android/material-3-expressive-android-wearos-launch/
- Android Developers — Material 3 in Compose: https://developer.android.com/develop/ui/compose/designsystems/material3
- Android Developers — MotionScheme: https://developer.android.com/reference/kotlin/androidx/compose/material3/MotionScheme
- Meta Design — The new Instagram brand identity: https://www.meta.com/design-at-meta/blog/the-new-instagram-brand-identity/
- About Instagram — Visual refresh: https://about.instagram.com/blog/announcements/instagram-visual-refresh
- It's Nice That — Behind Instagram's refresh: https://www.itsnicethat.com/features/behind-instagrams-first-major-refresh-in-10-years-partnership-130826
- It's Nice That — Designing for 3 billion: https://www.itsnicethat.com/features/designing-for-3-billion-how-instagram-built-a-brand-system-that-celebrates-everyones-point-of-view-partnership-170826
- Creative Boom — Instagram refresh: https://www.creativeboom.com/news/instagram-reveals-its-first-brand-refresh-in-10-years-with-a-new-wordmark-and-three-typefaces/
- Pinterest Gestalt docs: https://gestalt.pinterest.systems/
- GitHub — pinterest/gestalt: https://github.com/pinterest/gestalt
- DesignSystems.one — Gestalt breakdown: https://www.designsystems.one/design-systems/gestalt
- shadcn — Pinterest marketing system: https://www.shadcn.io/design/pinterest
- Anthill Collective — Pinterest navigation redesign: https://www.anthill-collective.com/pinterest
- eBay Innovation — Intuitive search redesign: https://innovation.ebayinc.com/stories/ebay-introduces-intuitive-search-redesign-to-elevate-shopper-experience/
- Value Added Resource — eBay visual search: https://www.valueaddedresource.net/ebay-visual-search-shop-similar-app/
- Anna Zaremba — eBay selling: https://www.annamzaremba.com/project-ebay-selling.html
- The Verge — Snapchat scraps simple redesign: https://www.theverge.com/news/658306/snapchat-simple-redesign-losing-north-american-users
- Snap newsroom — SPS 2024 Simple Snapchat: https://newsroom.snap.com/sps-2024-simple-snapchat?lang=en-US
- The Verge — Snapchat biggest redesign: https://www.theverge.com/2024/9/17/24246999/snapchat-redesign-three-tabs-stories-spotlight
- Noah Intelligence — Snap rethinks redesign: https://noah-news.com/snap-rethinks-snapchat-redesign-after-user-backlash-and-reports-strong-quarterly-growth/
- Creative Bloq — Snapchat redesign fail: https://www.creativebloq.com/web-design/ux-ui/snapchats-redesign-fail-shows-users-dont-always-want-minimalist-ui
- CR38 — Mobile App Design Trends 2026: https://cr38.digital/blog/mobile-app-design-trends-2026
- Zealousys — 2026 UI/UX trends: https://zealousys.com/blog/top-mobile-app-ui-ux-design-trends/
- GMI Software — Mobile UX/UI trends 2026: https://gmi.software/blog/mobile-app-design-trends
- Forasoft — 2026 UX playbook: https://www.forasoft.com/blog/article/mobile-app-ux-design-best-practices
- UXPin — Mobile app design examples 2026: https://www.uxpin.com/studio/blog/mobile-app-design-examples/
- Creative Alive — Design Systems 2026: https://creativealive.com/design-systems-2026-component-libraries-motion-tokens/
- UI/UX Atlas — Motion Design Tokens: https://www.uiuxatlas.com/lessons/motion/motion-design-tokens/
- Carmen Ansio — Motion Tokens for Design Systems: https://www.carmenansio.com/articles/motion-tokens-design-systems/
- The AfroDity — Design Tokens in Practice: https://www.theafrodity.com/post/design-tokens-in-practice-from-figma-variables-to-production-code
- Online Store News — Social commerce PDP rethink: https://onlinestorenews.com/social-commerce-maturity-is-forcing-a-product-page-rethink-in-2026/
- Online Store News — Social commerce conversion gap: https://onlinestorenews.com/social-commerce-conversion-gap-is-forcing-stores-to-redesign-pdps/
- GetStream — TikTok Live Shopping UX: https://getstream.io/blog/tiktok-live-shopping/
- Zalando Design — Scroll, see, shop: https://medium.com/zalando-design/scroll-see-shop-the-one-click-future-of-fashion-3d14815af303
- Sparq — Social commerce search: https://www.sparq.ai/blogs/social-commerce-search-shopify

---

*End of macro synthesis. Department docs (`01_*` onward) inherit the 14-axis scorecard, the
acceptance protocol (§6), the root-cause diagnosis (§3), and the roadmap priorities (§7). Each
department doc must score its own surfaces on the 14 axes and map its work to the protocol.*
