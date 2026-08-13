# ThryftVerse Visual QA Gates

> **Purpose:** A repeatable visual-quality system that runs before any release or before any visual change is merged. Automated logic tests cannot judge optical alignment, hierarchy, card density, media dominance, copy quality, empty-state authorship, or transition quality. This document defines the human + automated gates that close that gap.
>
> **Authority:** AGENTS.md §4 (comparative visual-fidelity protocol, thumbnail test, squint test, visual delta evidence), §20 (release gates), §27 (flagship timing rules); Design.md (Visual QA, metrics, reference quality gates, minute visual quality checklist, acceptance scorecard); audit `15_VISUAL_QA_METRICS_EXPERIMENTS_RELEASE_GATES.md`.
>
> **Rule:** A TypeScript pass cannot override an obviously inferior native render. A passing test suite cannot override a P0 visual blocker. Do not average away a P0 defect.

---

## 1. When to run this gate

Run the full visual QA gate:

- before any release candidate is promoted;
- before any visual change is merged to a flagship route;
- after any change to a shared primitive used by three or more screens;
- after any token migration that affects color, radius, spacing, typography, or elevation;
- when a user reports a visual quality gap that automated tests did not catch.

A "visual change" includes: layout edits, token swaps, new components, state additions, motion changes, media treatment changes, and theme edits.

---

## 2. Device matrix

Every gate run must cover the matrix below. A gate that passes only on a single flagship iPhone is not a pass.

### Native
- compact iPhone width (320–359pt);
- regular iPhone (360–399pt);
- large iPhone (400–479pt);
- older supported iPhone;
- mid-range Android;
- lower-memory Android.

### Web (when applicable)
- 390-ish mobile viewport;
- tablet;
- 1280 desktop;
- 1440+ desktop.

### Settings (each device)
- light;
- dark;
- 100% text;
- 200% text where practical;
- reduced motion;
- poor network / offline states.

---

## 3. Golden routes to capture

Capture at minimum the golden routes below, in both light and dark, at the device widths in §2. "Capture" means a native screenshot or a high-fidelity web preview at the correct viewport width.

### Core
- Home loaded / loading / error
- Search idle / results / no results
- PDP fixed / auction / co-own / sold
- Sell empty / media / validation / publishing / failure
- Poster camera / media picker / editor / publish / viewer
- Profile self / other / empty
- Settings root
- Inbox / requests / chat
- Checkout / pending / failure / receipt
- Auction Home / live detail / ended
- Seller Hub work pending / empty
- Co-Own Hub / asset / ticket / portfolio

---

## 4. Thumbnail test (mandatory, P0)

At roughly **25% scale**, the primary object and reading order must remain obvious. Repeated rounded rectangles must not dominate the silhouette.

Procedure:
1. Capture the first-viewport screenshot at the target device width.
2. Scale the capture to 25% (thumbnail size).
3. Without reading text, answer:
   - What is the single dominant object?
   - What is the reading order (first → second → third)?
   - Do repeated grey rounded rectangles dominate the silhouette?

Pass condition:
- The primary object (media, price, identity, or key action) is unmistakable.
- Reading order is obvious from silhouette alone.
- Rounded rectangles do not dominate.

Fail condition:
- The silhouette is a field of equal-weight grey rectangles.
- No single object dominates.
- Reading order is ambiguous at thumbnail size.

A screen that fails the thumbnail test is not flagship. Fix before merge.

---

## 5. Squint test (mandatory, P0)

Blur or squint at the screen. Media / identity / content must dominate. Navigation and utility chrome must recede.

Procedure:
1. Capture the first-viewport screenshot.
2. Apply a Gaussian blur (radius ~8–12px) or physically squint.
3. Answer:
   - What dominates the blurred view?
   - Does chrome (headers, tab bars, dock, borders) compete with content?
   - Does media carry the color, or does grey UI carry the color?

Pass condition:
- Media, identity, or content dominates.
- Chrome recedes into the background.
- Color comes from imagery, not from grey panels.

Fail condition:
- Chrome and content compete at equal weight.
- Grey panels are the dominant color story.
- The screen reads as a settings page instead of a media/product surface.

---

## 6. Visual delta evidence checklist

For every meaningful flagship pass, retain local before/after captures and compare at least the metrics below. Do not commit captures unless requested. Record the delta in the release sign-off.

| Metric | What to measure | Target |
|---|---|---|
| First useful content Y-position | Y-coordinate of the first object the user actually needs (media, price, title, primary action) | Lower is better; no low-value hero pushing content down |
| Number of useful objects above fold | Count of decision-useful objects (media, price, title, action, trust signal) visible without scrolling | Discovery: ≥2 meaningful media objects; list: 4–6 useful rows |
| Visible rounded-container count | Count of distinct rounded grey containers visible above fold | ≤1 dominant non-media panel; flat canvas + hairlines is the default |
| Largest non-media control size | Largest visible control that is not media (button, chip, icon container) | Compact utility 32–36pt visible chrome inside 44pt hit target; no oversized grey circles for routine actions |
| Icon optical size | Optical size band of icons in the viewport | Standard nav 20–24pt; metadata 14–18pt; one family, one band per region |
| Content occluded by sticky nav/docks | Pixels of useful content hidden by sticky headers, tab bars, docks | Zero occlusion of the last scroll item; dock clearance computed from DockConstants |
| Loading vs final geometry shift | Pixel movement between skeleton and final render | Zero layout shift; skeleton matches final aspect ratio exactly |

Record format:
```text
Screen: <name>
Device: <width>pt, <light/dark>, <text-scale>, <motion>
Before → After:
  first useful content Y: <px> → <px>
  useful objects above fold: <n> → <n>
  visible rounded containers: <n> → <n>
  largest non-media control: <px> → <px>
  icon optical size: <pt> → <pt>
  content occluded by sticky: <px> → <px>
  loading→final shift: <px> → <px>
```

---

## 7. Visual quality metrics (tracked per screen)

These metrics are the quantitative backbone of the visual QA gate. Each screen in a release must record them.

### 7.1 First useful content Y-position
The Y-coordinate of the first object the user actually needs. A low-value hero, repeated title, or decorative block that pushes real content down is a P1 defect.

### 7.2 Number of useful objects above fold
Decision-useful objects visible without scrolling.
- Discovery viewport: at least two meaningful media objects or the beginning of the next module.
- List viewport: roughly 4–6 useful rows.
- Detail viewport: media + price/action or a clear path to them.

### 7.3 Visible rounded-container count
Count of distinct rounded grey containers visible above the fold.
- Budget: at most one dominant non-media panel.
- Flat canvas, spacing, and hairlines are the default utility structure.
- Wrapping every row, icon, filter, and section in separate grey surfaces is a fail.

### 7.4 Loading vs final geometry shift
Pixel movement between the skeleton/loading state and the final render.
- Target: zero layout shift.
- Skeletons must match final aspect ratios exactly.
- A generic centered spinner for every state is a P1 defect.

### 7.5 Text budget compliance
The first viewport normally uses no more than **three type sizes + one eyebrow**.
- Count distinct font sizes visible above the fold.
- Remove duplicate headings, decorative subtitles, and labels that merely name an obvious object.
- Section headers must be quieter than content.

### 7.6 Surface budget compliance
At most **one dominant non-media panel** above the fold.
- A nested surface requires a distinct interaction or state boundary; otherwise flatten it.
- No card-on-card composition.

### 7.7 Radius budget compliance
At most **two non-avatar radius sizes** per viewport (excluding a modal).
- Radius communicates role: 8–12pt compact utility, 12–16pt media/fields, 20pt+ only for a genuinely dominant panel or dock.
- Using the same radius for everything is a fail. Mixing arbitrary 0.5/1/1.5/2pt outlines in the same component family is a fail.

### 7.8 Stroke grammar compliance
- Separators: hairline.
- Fields and explicit outlines: 1pt.
- Focus/selection: 2pt.
- Never mix arbitrary 0.5, 1, 1.5, 2pt outlines in the same component family.

### 7.9 Icon grammar compliance
- One icon family per region (Ionicons is canonical).
- One optical size band per region.
- Stable outline/filled-state rule (filled = selected/active/saved).
- Standard nav glyphs 20–24pt; metadata glyphs 14–18pt.

### 7.10 Hit-target compliance
- Minimum practical touch target: 44pt.
- Visible chrome is separate from hit area: a 44pt target may show only a 20–24pt glyph.
- No 44pt grey circle/square rendered merely to satisfy accessibility on routine actions.

---

## 8. Screenshot rubric — 100 points

Score every captured screen against the rubric below. Do not average away a P0 blocker. Placeholder/demo content is an automatic fail.

| Dimension | Weight |
|---|---:|
| Hierarchy | 20 |
| Content-to-chrome balance | 15 |
| Typography | 10 |
| Spacing/rhythm | 10 |
| Media presentation | 15 |
| Control consistency | 10 |
| State truthfulness | 10 |
| Platform fidelity | 5 |
| Accessibility resilience | 5 |

A screen is not flagship unless it scores at least 3/4 in every acceptance scorecard category (composition, hierarchy, density, interaction, truthfulness, state coverage) and 4/4 in at least two. See Design.md "Acceptance Scorecard".

---

## 9. Human review questions

Answer these for every screened screen. A "no" or "unsure" to any question is a defect to fix.

1. What is the first thing my eye sees?
2. Is that what the user needs?
3. How many bordered containers are visible?
4. How many actions compete for emphasis?
5. Does any control look like a web component dropped into native?
6. Does anything look like a generic AI template?
7. Can I remove an element without harming comprehension?
8. Does the dark-mode version feel separately authored?
9. Does content look real?
10. What happens if media/network/data is missing?

---

## 10. Interaction QA

Record 60fps screen capture of:
- open route;
- scroll;
- open/close sheet;
- keyboard;
- swipe media;
- zoom;
- publish/bid/payment transitions.

Look for:
- dropped frames;
- animation overshoot;
- layout jump;
- delayed pressed state;
- stacked toasts;
- overlapping sheets;
- header flicker.

Flagship timing (AGENTS.md §27.2):
- 50–100ms: instant feedback (button press highlight).
- 100–200ms: simple state change (toggle, checkbox, icon swap).
- 200–300ms: standard transition (page slide, sheet appear, tab switch).
- 300–500ms: complex transition (layout rearrangement, shared element).
- 500ms+: elaborate animation (onboarding, celebratory moments).

Feedback must arrive within 100ms of user action. Err on the shorter side.

---

## 11. Reference quality gates

Apply the relevant reference gate from Design.md for each surface type. These are fail conditions, not aspirations.

- **Pinterest gate** (discovery / explore / boards / saved): fabricated proportions, chrome competing with media, no mode transition, dead ends, skeleton mismatch, layout shift, fixed-frequency modules, canvas overwhelming photography, fake visual search.
- **Instagram gate** (feed / social / stories): media not dominating, unpredictable action grammar, delayed/dishonest feedback, hit targets <44pt, no seen/unseen state, media pop/shift, forced square thumbnails, caption overpowering media.
- **TikTok gate** (profile storefront / media density): profile feels like settings, media density <60% of first viewport, chrome dominating, flat grid with no authored rails, instant tab transitions, no press feedback.
- **Depop gate** (seller profile / edit profile / closet): feels like settings, inconsistent seller actions, flat dump with no curation, missing policies/trust, competing editors, no seller stats, archive cards identical to discovery cards, media editing inside Edit Profile.
- **Edit Profile gate**: cover/avatar editing inside it, competing AccountSettings, Name/Username not in first viewport, disabled-looking fields, giant Save footer, keyboard/footer hiding fields, unstructured settings dump, unclear save state.
- **Performance gate**: no Visually Complete condition, above-fold layout shift, skeleton mismatch, frame drops on mid-range Android, image failures collapsing layout, no reduced-motion fallback, decorative animation blocking primary action.
- **Vestiaire/Vinted gate** (product detail / checkout / trust): trust after payment intent, buried shipping/returns, seller verification not in first viewport, price/action/trust not all visible before scroll, backend errors exposed, non-tabular checkout numbers, no primary/secondary dock separation, undesigned sold/unavailable/missing-media states, fake authenticity.
- **Whatnot gate** (auction / live / co-own): illegible countdown, no haptic/confirmation on bid/trade, dock overlapping content/home indicator, non-tabular financial values, empty order book with no next step, risk disclosures after irreversible action, fabricated charts/metrics.
- **Luxury gate** (all premium surfaces): depends on gold/radius/shadow to appear premium, global beige/gold, weak accent contrast, white text on antique-gold without measured contrast, fabricated verification, decorative gold on utility screens, generic photography/typography/hierarchy, no ThryftVerse product advantage expressed. A screen does not fail merely because it contains no gold.

---

## 12. Minute visual quality checklist

Before reporting completion, inspect the native render against every item below. This is the difference between a 7/10 screen and a 9/10 screen.

### Spacing
- [ ] All horizontal edges align to the same 16px rail (or documented exception).
- [ ] Card gutters are exactly 8px (discovery) or 16px (standard screens).
- [ ] Section breaks: 16px within a group, 24px between groups, 32px for major transitions.
- [ ] No random dead space above/below heroes, forms, empty states, headers.
- [ ] Bottom docks and sheets clear the home indicator / navigation bar.
- [ ] No asymmetric padding unless intentionally aligned to a media edge.

### Typography
- [ ] No more than 3 type sizes visible in the first viewport.
- [ ] The main object (price, title, media) is visually dominant.
- [ ] Captions readable at a glance — no 10–11px unless legally required.
- [ ] Labels quieter than values.
- [ ] Uppercase labels rare and purposeful (overlines only).
- [ ] Line-height sufficient for large text.
- [ ] Prices use `Type.priceList` or `Type.priceLarge`, not `Type.body`.

### Alignment
- [ ] Avatars, names, prices, buttons, chevrons share clear baselines.
- [ ] Right-side values and chevrons have minimum 8px separation.
- [ ] Media cards align to a consistent grid — no off-by-one pixel jitter.
- [ ] Tab labels and indicators align perfectly.
- [ ] Section headers align to the same left rail as section content.

### Media
- [ ] Product images cropped honestly — shoes, bags, jewellery, garment silhouettes preserved.
- [ ] `contentFit="cover"` not blindly used on critical product imagery — focal points safe.
- [ ] Every image has a visible loading state (skeleton matching final aspect ratio) and failure state.
- [ ] Skeletons match final aspect ratio — no layout shift on load.
- [ ] Overlays do not cover the item itself.
- [ ] Media fades in (`Duration.normal` crossfade), not pops.
- [ ] Missing images get a restrained placeholder, not a broken-image icon.

### Controls
- [ ] Every tappable target is at least 44pt.
- [ ] Disabled state readable but clearly inactive (0.4 opacity, not just grey text).
- [ ] Pressed state visible (0.97 scale or `colors.rowPressed` background).
- [ ] Primary action dominates only when it should.
- [ ] Destructive actions separated (bottom of group, `colors.danger`, confirmation required).
- [ ] Icon-only controls have `accessibilityLabel`.

### Forms
- [ ] Fields look editable — `colors.input` background, visible border.
- [ ] Active focus border clear — 2px `colors.brand`.
- [ ] Helper and error texts aligned, calm, below the field.
- [ ] Keyboard never covers the active field.
- [ ] Save/Done reachable (header right) but not visually heavy.
- [ ] Read-only fields clearly distinguished from editable fields.

### Lists and cards
- [ ] Cards not nested unnecessarily — no cards inside cards.
- [ ] Metadata reduced to only what helps the decision — max 3–4 elements per row.
- [ ] Density high enough to be useful but not cluttered — 4–6 rows visible in first viewport.
- [ ] Every row resilient at 320pt width — text truncates, prices don't overlap, chevrons reachable.
- [ ] Row press feedback consistent across the app.

### States
- [ ] Loading state matches final layout — skeleton, not generic spinner.
- [ ] Empty state gives the next action — not just "Nothing here."
- [ ] Error state uses user-safe language — no backend exceptions or status codes.
- [ ] Offline state designed — not a blank screen or crash.
- [ ] Partial-data state does not look broken.
- [ ] Missing-media state restrained — placeholder, not broken-image.
- [ ] Permission-denied state explains what is needed and how to enable it.

### Luxury materiality
- [ ] Correct canvas mode selected: media, premium-commerce, or utility.
- [ ] The screen remains premium if all gold accents are temporarily removed.
- [ ] Luxury accent, when used, communicates a real premium/trust/ownership/curation state.
- [ ] Accent contrast measurable; translucent hairlines not sole focus indicators.
- [ ] Antique-gold fills use `luxuryOnAccent`, not theme-dependent white text.
- [ ] Utility screens avoid decorative gold.
- [ ] Media surfaces let photography carry colour.
- [ ] First viewport feels authored and recognisably ThryftVerse through product logic, not ornament.

### Visual completion & performance
- [ ] Surface has a written Visually Complete condition.
- [ ] Above-fold skeletons match final geometry exactly.
- [ ] First meaningful media appears without layout shift.
- [ ] Core actions become interactive before below-fold content finishes.
- [ ] Initial scroll/press remains smooth on a mid-range Android target.
- [ ] Image decode/failure tracked and recoverable.
- [ ] Experimental motion is feature-gated and removable.

### Motion
- [ ] Press scale subtle: 0.97–0.985.
- [ ] Images crossfade on load — no pop.
- [ ] Transitions 150–250ms unless hero-level (400–600ms).
- [ ] Reduced motion respected — instant or simple fade fallback.
- [ ] No bounce, continuous pulse, or decorative shimmer.
- [ ] Haptics at the right moments: light for selection, medium for purchase/bid, success for completion.

### Accessibility
- [ ] All controls have `accessibilityLabel` and `accessibilityRole`.
- [ ] State announced — selected, unread, loading, error.
- [ ] Destructive actions clearly labelled as destructive.
- [ ] Text has sufficient contrast.
- [ ] Touch targets practical — 44pt minimum.
- [ ] Back and Close distinguishable — different icons, different labels.
- [ ] Screen-reader order follows visual order.

---

## 13. Production metrics (tracked per release)

### Discovery
- time-to-first-content;
- result open rate;
- save rate;
- search refinement;
- no-result rate.

### Sell
- start → publish;
- time to publish;
- field abandonment;
- media upload failure;
- draft recovery.

### Poster
- camera open → capture;
- capture → share;
- picker → canvas;
- publish failure/retry;
- first frame time.

### PDP
- media swipe depth;
- video play;
- buy/offer/bid;
- seller detail open;
- checkout start.

### Seller
- pending task completion;
- time to ship/reply;
- reprice action.

### Performance
- crash-free sessions (target ≥99.95% per 2026 benchmarks);
- p95 route interactive;
- dropped frames (target: 60fps / 16ms per frame);
- memory;
- image/video failure.

---

## 14. Visual sign-off

Require one short `VISUAL_SIGNOFF.md` per release containing:
- screenshots (golden routes, light + dark, device matrix);
- before/after captures for changed surfaces;
- visual delta evidence (§6 metrics);
- known deviations;
- performance capture;
- accessibility notes;
- screenshot rubric scores (§8);
- self-scorecard (Design.md acceptance scorecard).

---

## 15. How to use this gate

1. Run the automated release gate script: `npm run check:visual-gates` (see `release-gates.md`).
2. Run TypeScript: `cd frontend; npx tsc --noEmit`.
3. Capture golden routes across the device matrix (§2, §3).
4. Run the thumbnail test (§4) and squint test (§5) on every first-viewport capture.
5. Record visual delta evidence (§6) for every changed surface.
6. Score each screen against the screenshot rubric (§8) and the minute checklist (§12).
7. Apply the relevant reference quality gate (§11).
8. Answer the human review questions (§9).
9. Run interaction QA (§10) with 60fps capture.
10. Record production metrics (§13).
11. Produce `VISUAL_SIGNOFF.md` (§14).

A release is not shippable until every P0 gate passes and every P1 gate is resolved or explicitly waived with a documented reason.
