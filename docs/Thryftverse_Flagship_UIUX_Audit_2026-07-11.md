# ThryftVerse Flagship UI/UX Gap Audit

**Audit date:** 11 July 2026  
**Repository:** [K17ze/thryftverse-upgrade](https://github.com/K17ze/thryftverse-upgrade)  
**Audited branch:** `coown-master-complete-flagship-reconstruction`  
**Audited HEAD:** `8636f06`  
**Design contract:** `DESIGN(1).md`, version 1.3  
**Benchmark:** the 16 supplied Pinterest, Instagram, Depop, Vinted, LinkedIn and retail screenshots, current first-party product material, Apple HIG and Material 3.

## Executive verdict

ThryftVerse is **not yet at Pinterest/Instagram/Depop flagship visual quality**, and it is not production-ready as a consistently authored native product. It has a much stronger product vision and component inventory than a normal prototype, but the quality is uneven because the design contract, runtime system, active branch, screen implementations and visual-verification process do not yet agree.

The central problem is not “the app needs more gold.” The deeper problem is that the system has not made the intended art direction reliably render across the product. The latest design file correctly proposes neutral media canvases, warm premium-commerce canvases and scarce champagne/bronze accents, but those proposed premium tokens do not exist in the runtime theme. Consequently, most screens still render through a generic neutral black/white system, while many individual files add their own sizes, colours, radii and animation choices. That produces a product which can look clean in isolated places but not recognisably premium or coherent as a whole.

### Overall assessment

| Area | Assessment | Why |
|---|---:|---|
| Product/design vision | **8/10** | Strong reference interpretation, truth rules, surface modes, state coverage and visual QA gates. |
| Design-system runtime adoption | **4/10** | Two colour systems remain; proposed luxury/canvas tokens are not implemented; most screens use static legacy colours. |
| Current visual consistency | **4.5/10** | Some elevated components coexist with generic forms, excessive cards/chips, cramped headers, missing media and inconsistent density. |
| Interaction/accessibility maturity | **5.5/10** | Haptics and labels are widespread, but small targets, incomplete reduced-motion coverage and keyboard/list complexity remain. |
| Perceived performance architecture | **3.5/10** | Non-virtualised masonry, fabricated media ratios, nested lists and unbounded stagger animation conflict with Pinterest-level performance. |
| Production visual verification | **2.5/10** | No render or screenshot tests; only a narrow, outdated device-capture set; several captures visibly contain runtime/debug failures. |

**Required status under the repository's own reporting rules:** `PARTIAL — VISUAL TARGET NOT MET`.

## 1. What was audited

The audit covered:

- repository/branch integrity and whether the latest design work is actually on `main`;
- all 120 frontend screen files and 279 component files at a static-system level;
- the theme, design-token, gradient, typography, motion, navigation, media and list foundations;
- representative canonical implementations for Home, Explore, Profile, Edit Profile, Settings, 2FA, Closet, Product Detail, Sell, Inbox, Chat, Auction and Co‑Own;
- the repository's 18 surviving device captures from 5 July 2026;
- the supplied visual references;
- the automated-test strategy and design-lint enforcement;
- current benchmark direction from first-party sources.

### Important limitation

There is no complete, current, native screenshot set for the latest HEAD. The repository captures are limited to a Co‑Own/profile debugging session and predate the 11 July commit. Therefore this report can diagnose implementation and visible regression gaps, but **native visual acceptance remains pending**. No test result or component name is treated as evidence that a screen looks flagship.

## 2. P0 repository and design-governance defects

These must be fixed before another large visual pass. Otherwise new work can again appear “lost” or agents can improve the wrong branch.

### P0.1 — The latest design contract is missing from `main`

The default branch is `main` at `80f2268`. The design contract exists only on `coown-master-complete-flagship-reconstruction` at `8636f06`. A normal agent or deployment starting from `main` cannot read it.

### P0.2 — The file is named `DESIGN(1).md`, while the charter says `DESIGN.md`

`AGENTS.md` instructs agents to read `DESIGN.md`. That file does not exist. This is a direct governance break: a compliant agent can follow the instruction exactly and still miss the entire 1,921-line contract.

### P0.3 — The latest branch is materially divergent from `main`

The branch and `main` have diverged (`main` has 7 unique commits; the audited branch has 18). Compared with `main`, the branch changes approximately **195 files, adds 22,000 lines and removes 3,004**. This is not a small design-document branch.

### P0.4 — Commit `8636f06` is not a focused design commit

Although its subject is “upgrade DESIGN.md to v1.3,” the commit changes roughly **182 files and adds over 21,000 lines**, including product, checkout, chat, notifications, profile, seller, verification, order, Co‑Own and theme code. That makes rollback, review and source-of-truth reasoning unsafe. It also explains why work can appear merged in one context but absent from `main`.

### Required repository repair

1. Create one integration branch from the audited UI branch.
2. Merge/rebase the four backend commits from the current `main` deliberately, resolving conflicts by subsystem.
3. Rename `DESIGN(1).md` to `DESIGN.md`.
4. Split the 21k-line aggregate into reviewable subsystem commits where practical, or at minimum produce an ownership manifest explaining every changed surface.
5. Run the full frontend/backend verification suite.
6. Capture a complete native before-baseline.
7. Merge the integration branch into protected `main` only after visual gates pass.

Until this is done, **`main` is not the visual source of truth and the latest UI branch is not a safe production source of truth**.

## 3. July 2026 benchmark findings

The supplied screenshots reveal the real quality logic behind the references:

- **Pinterest:** media owns the screen; chrome is quiet; real image proportions and board/collage composition create rhythm; search is a persistent mode; every close-up re-roots discovery rather than ending it.
- **Instagram:** identity and media are compressed into a predictable grammar; actions stay in stable positions; inbox rows are calm and scannable; profile media dominates after a compact identity header.
- **Depop:** utility screens are dense and direct; selling is photo-first; seller identity and practical commerce coexist without a generic enterprise-dashboard appearance.
- **Vinted:** a chat can carry product context, safety guidance and a composer without losing the conversation; price/action clarity is immediate.
- **Retail product references:** product media is treated differently by object type. Shoes use protected/contained silhouettes and thumbnail continuity; product facts and size guidance are organised around the buying decision.

Current first-party direction reinforces, rather than weakens, those lessons:

- Pinterest's 2026 direction is visual, personalised and context-aware; it explicitly says visual interfaces should demonstrate recommendations rather than answer with walls of text. Its discovery strategy is moving from keyword-only search toward context, taste and trusted recommendations. [Pinterest, June 2026](https://newsroom.pinterest.com/en-SG/news/cannes-2026/)
- Pinterest's visual-search experience lets people start with an image, select/refine an object and long-press a Pin to continue into relevant ideas. ThryftVerse's visual search should therefore be an actual discovery loop, not a decorative scanning animation. [Pinterest visual search](https://newsroom.pinterest.com/news/finding-your-unique-style-campaign/)
- Pinterest treats collage as a first-class expressive and shopping format; early auto-collage tests produced twice the save rate of regular product Pins. That supports authored ThryftVerse boards/Looks rather than generic rectangular collection cards. [Pinterest collages](https://newsroom.pinterest.com/news/introducing-auto-collages-shopping-and-trend-forecasting-cannes-2025/)
- Pinterest now defines “Visually Complete” per surface: Home is complete when visible images render/videos play, while search autocomplete is complete when suggestions and avatars render. ThryftVerse currently documents this concept but does not instrument it. [Pinterest Engineering, 2026](https://medium.com/pinterest-engineering/performance-for-everyone-21a560260d08)
- Instagram's official product direction includes user control over profile-grid order, which supports the design contract's storefront curation requirement—but only after real persistence exists. [Instagram](https://about.instagram.com/blog/announcements/inspiring-instagram-creativity)
- Current Instagram still centres Feed, Stories, messaging, profile media, discovery and small-business shopping; ThryftVerse should borrow that stable interaction grammar without cloning its brand surface. [Instagram App Store](https://apps.apple.com/gb/app/instagram/id389801252)
- Depop's current product promise is fast photo-based listing, offers, buyer chat, shipping, secure checkout, protection, order management and personalised discovery. Those are operational UX requirements, not decorative inspiration. [Depop App Store](https://apps.apple.com/gb/app/depop-buy-sell-clothes/id518684914)
- Apple recommends a minimum 44×44pt button hit region, while Material recommends 48×48dp touch targets. [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/buttons), [Material 3](https://m3.material.io/foundations/designing/structure)

## 4. Audit of `DESIGN(1).md`

### What the document gets right

1. **It separates reference logic from copying.** This is essential. The target should feel native to ThryftVerse, not like Pinterest with a new logo.
2. **It recognises three canvas modes.** Media, premium-commerce and utility should not share one beige/gold treatment.
3. **It corrects the earlier “gold equals premium” mistake.** Champagne/antique-gold is described as contextual, not a universal decoration.
4. **It makes truthfulness a visual-quality dimension.** Fake watchers, liquidity, verification, charts or ghost conversations are correctly prohibited.
5. **It treats performance as visual quality.** Stable skeleton geometry and per-surface Visually Complete definitions are exactly the right benchmark.
6. **It includes concrete screen gates, defect severity, a shot list and a scorecard.** Those are much stronger than a vague mood board.
7. **It protects the Edit Profile ownership decision.** Media editing stays on Profile; public fields and private/security entrypoints remain compact.

### Where the design document itself still falls short

| Gap | Consequence | Required correction |
|---|---|---|
| Wrong filename and wrong branch | Agents and deployments miss the contract. | Rename and merge it into the canonical branch. |
| 1,921 lines in one monolith | Important rules are easy to miss; agents can cherry-pick convenient sections. | Keep a short normative core and move surface playbooks/shot lists to linked appendices. |
| Proposed tokens are documented but not implemented | The document describes a visual system that users cannot see. | Add an explicit migration ledger with token key, owner file, adopted components and completion status. |
| No code ownership matrix | It does not say which canonical component owns each rule. | Map every surface rule to exact components and routes. |
| Contradictory typography state | `designTokens.ts` says “5 variants only” but exposes many `Type` and legacy `TypeStyles` roles; the contract also requests a mono role not defined as a token. | Collapse to one semantic type API and define a real `numericTabular` style. |
| Pinterest rules contradict implementation | The contract forbids ID/hash aspect ratios, but `PinterestMasonryGrid` and Home derive ratios from IDs/hashes. | Make violations fail CI, not remain prose. |
| Touch-target rule is not enforced | Confirmed 32pt product overlay actions and many sub-44 visual controls remain. | Add component tests/static checks for hit area or `hitSlop`. |
| “Visual QA” has no evidence manifest | Old screenshots can be mistaken for current acceptance. | Store capture metadata: commit, device, OS, theme, data state, route and timestamp. |
| No measurable visual budget | “Premium” can remain subjective. | Define per-surface limits for initial media count, layout shifts, main-thread stalls, memory and Visually Complete. |

### Recommended document structure

- `DESIGN.md` — 250–400 lines of binding product principles, tokens and global fail gates.
- `docs/design/SURFACE_PLAYBOOKS.md` — Home, Explore, Profile, Product, Messaging, Sell, Auction, Co‑Own, Settings.
- `docs/design/VISUAL_QA_MATRIX.md` — routes, states, devices, captures and results.
- `docs/design/TOKEN_MIGRATION.md` — current/proposed/adopted/deprecated token state.
- `docs/design/COMPONENT_OWNERSHIP.md` — rule → canonical component → screens consuming it.

## 5. System-level implementation gap

### 5.1 Theme and colour architecture

- Only **40/120 screens** call `useAppTheme()`.
- **102/120 screens** still import the legacy `constants/colors` module; some use both systems.
- `constants/colors.ts` and `ThemeContext.tsx` expose different colour shapes and naming (`borderLight` vs `borderSubtle`, missing elevated/input/row/header roles in the legacy system).
- `StyleSheet.create()` values using the mutable legacy `Colors` export are calculated at module load. Changing the theme variable does not reconstruct those styles, so live theme changes can leave large parts of the UI stale.
- The champagne, antique-gold, bronze, warm premium canvas, focus and gold-border tokens in the design document are explicitly **proposed only**. They are absent from `ThemeColors`, `LIGHT_COLORS` and `DARK_COLORS`.

**Impact:** the app cannot consistently express its intended three-mode art direction. This is the main reason premium surfaces still look like generic neutral marketplace screens.

**Fix:** eliminate the legacy runtime source, add semantic `canvasMedia`, `canvasPremium`, `canvasUtility`, `surfacePremium`, `accentChampagne`, `accentAntiqueGold`, `accentBronze`, `onLuxuryAccent`, `focusLuxury`, `trustCommerce`, `financialUp` and `financialDown` roles, and consume them through a theme-aware style factory. Gold must remain stateful and scarce.

### 5.2 Typography and spacing drift

- Screen files contain **1,204 direct `fontSize:` declarations** and **749 direct `borderRadius:` declarations**.
- The design-token checker reports **305 hardcoded token-equivalent values**, but exits successfully because only `platform/` violations fail CI.
- The linter does not enforce raw font sizes, line heights, icon sizes, touch targets, colour contrast or the three-size-per-viewport rule.
- Some screen files exceed 2,000 lines; total screen code is about **70,527 lines**. That makes local style drift inevitable.

**Fix:** replace visual primitives with semantic text/space/radius components and make new violations fail in all canonical screen/component directories. Allow documented optical exceptions, not silent drift.

### 5.3 Media geometry and Pinterest-quality discovery

The most serious direct contradiction is in `PinterestMasonryGrid.tsx`:

- it chooses from `[0.75, 1.0, 1.25, 1.5]` using the first character of `item.id`;
- Home also hashes IDs into a ratio sequence;
- `ProductCardV2` then changes its ratio after the image loads;
- the parent column-height estimate and the child render can therefore disagree;
- all items are rendered in two ordinary `View` columns rather than a virtualised list;
- entrance delay is `index * 50` with spring animation and no cap/reduced-motion path;
- default grid gap is 3pt even though the design contract specifies an 8pt discovery gutter.

This causes fabricated crops, layout movement, inaccurate column balancing, unnecessary mount/decode work and delayed visual completion—the exact opposite of the Pinterest gate.

**Fix:** persist `width`, `height`, `aspectRatio`, `focalX`, `focalY`, `dominantColor` and `blurhash` with every media object; render the correct skeleton before decode; virtualise the masonry; cap above-fold entrance motion; prefetch only the next viewport.

### 5.4 Touch, accessibility and motion

- 98 screens contain at least one accessibility label and 88 contain a role, which is a good base.
- Confirmed ProductCard save/favourite controls are visually 32×32pt without an explicit 44/48pt hit region.
- A broad scan finds hundreds of sub-44 width/height declarations requiring manual target review.
- **58 screens** use Reanimated; **31 of those** have no visible reduced-motion handling.
- Many lists apply index-based `FadeInDown.springify()` to every item.
- Visual Search runs a JavaScript `setInterval` every 16ms to animate a fake scan line, with no reduced-motion alternative.

**Fix:** standardise `IconButton` with 44pt iOS/48dp Android hit area, accessible state and haptic policy; move decorative motion off JS; cap stagger to visible items; make reduced motion a primitive default rather than a screen opt-in.

### 5.5 Performance and screen architecture

- 60 screens use ScrollView; only 18 use FlashList.
- 14 screens combine a ScrollView with a list/masonry construct.
- Home is a 1,929-line ScrollView containing stories, hero, collections, segments and masonry. It passes an `onEndReached` property through `as any` to a ScrollView, which does not provide FlatList-style pagination semantics.
- Inbox and Chat are 2,049 and 2,202 lines respectively; Auction Home and Auction Detail are 2,556 and 2,458 lines.

Large monolithic screens make recomposition expensive, increase accidental re-renders and prevent coherent surface-level skeleton/state ownership.

**Fix:** use a virtualised section architecture with memoised, data-driven modules; split orchestration from render sections; instrument visible-media completion and interaction readiness.

### 5.6 Automated tests do not prove visual quality

- There are 65 test files.
- 34 read source files and assert that strings/imports/patterns exist.
- Zero tests call a UI `render()` helper.
- Zero screenshot/pixel visual-regression tests exist.

Tests named “reference perfect,” “flagship,” “visual” or “device audit” are therefore structural guardrails, not evidence of appearance. The current design-token lint also prints 305 warnings and still passes.

**Fix:** keep source-contract tests, but add rendered component tests, behavioural interaction tests, deterministic story fixtures and native screenshot diffing for the required states.

## 6. Rendered evidence from the repository

The surviving captures were committed on 5 July 2026 and are not a final latest-HEAD benchmark. They nevertheless reveal real failure modes that the new capture matrix must close:

1. **Auction screen:** five crowded header actions; missing imagery dominates category/product cards; `Â·` mojibake is visible; price/content approaches the home indicator; hierarchy is title-heavy and media-light.
2. **Own Profile:** a generic blank grey cover and avatar consume most of the first viewport; the horizontal utility rail clips at the edge; seller proof/trust is absent; the empty state creates a large blank page instead of a compact storefront continuation.
3. **Profile runtime state:** a toast exposes `ApiRequestErr…`, directly failing the user-safe error rule.
4. **Co‑Own hub:** the primary captured state is a generic full-screen “Could not load” page with a very large dead area and no cached/read-only continuation.
5. **Portfolio:** top content appears clipped; values expose excessive decimal precision; cards are dense, missing-media heavy and visually similar to a generic finance dashboard; the premium ownership materiality is absent.
6. **Sell:** photo-first intent is strong, but the first form still shows a very large neutral media block, a dense three-mode selector and a long all-at-once form; the bottom preview/action area is visually obstructed in the capture.
7. **Debug chrome:** `API`, `APP Preview` and floating gear controls obscure important content in multiple captures. These must be impossible in production builds and excluded from acceptance screenshots.

## 7. Department scorecard

Scores use the repository's own 0–4 scale. A flagship surface needs at least 3 in all categories and 4 in two. No department currently clears that bar with visual evidence.

| Department | Composition | Hierarchy | Density | Interaction | Truthfulness | States | Main blocker |
|---|---:|---:|---:|---:|---:|---:|---|
| Home / Discovery | 2 | 2 | 2 | 2 | 2 | 2 | Fabricated ratios, non-virtualised masonry, too many competing modules. |
| Profile / Storefront | 2 | 2 | 2 | 3 | 3 | 2 | Generic/blank hero dominance, weak merchandising, stale capture proof. |
| Edit Profile / Settings / 2FA | 3 | 3 | 3 | 3 | 3 | 2 | Stronger IA, but legacy theme, monolithic forms and incomplete state captures. |
| Product / Checkout | 3 | 3 | 2 | 3 | 3 | 3 | Strong component depth; media crop, card overload and first-viewport proof remain. |
| Closet / Saved / Boards | 2 | 2 | 2 | 3 | 3 | 2 | Dashboard stats/chips compete with media; board authorship is weak. |
| Inbox / Chat / Groups | 2 | 3 | 2 | 3 | 3 | 3 | Huge screen monoliths, static theme and no current keyboard/state visual proof. |
| Sell / Create | 2 | 2 | 2 | 3 | 3 | 2 | Photo-first start is good; workflow remains visually long and form-heavy. |
| Auction | 2 | 2 | 2 | 3 | 3 | 2 | Crowded chrome, missing media, encoding/runtime defects and weak live-lot focus. |
| Co‑Own / Portfolio / Trade | 2 | 3 | 2 | 3 | 3 | 3 | Improved truth architecture; dense finance cards, precision and premium materiality gaps. |
| Auth / Onboarding / Verification | 2 | 2 | 2 | 2 | 3 | 2 | Visual system remains fragmented and state evidence incomplete. |

## 8. Surface-by-surface elevation requirements

### 8.1 Home and Explore

**Current gap:** Home tries to be Stories, editorial hero, collections, following feed and Pinterest grid simultaneously. Explore uses a masonry implementation that invents ratios and loads all children. The visual-search affordance looks functional although its backend is unavailable.

**Target composition:**

- Home becomes the social/commerce attention surface: compact header, optional story rail, then one dominant 4:5 or natural-aspect post/listing unit at a time.
- Explore becomes the discovery surface: sticky search with camera, a restrained topic rail, then true-aspect virtualised masonry.
- Adaptive modules appear only when relevance earns them: board collage, followed seller, recently viewed, style cluster, Looks or curated edit.
- Search transitions into a committed mode with query, filters and clear exit; it should not remain a decorative field over unrelated content.
- A close-up always offers truthful continuations: similar visual items, related Looks, seller shop, save-to-board and category refinement.

**Minute detail:** 8pt grid gutter; 12–16pt image radius; no card background behind images; 44/48pt overlay targets; one metadata line plus compact price; no more than two overlays on media; skeleton uses exact aspect ratio and dominant colour; save feedback is immediate but rolls back on persistence failure.

**Visual Search:** until the backend works, the camera entry must say “Preview visual search” or be hidden behind a feature flag. Do not animate “Analysing colours, shapes and patterns” and only afterwards reveal that recognition is not connected.

### 8.2 Product cards

`ProductCardV2` currently combines condition, price-drop, media-count, save, favourite, price, old price, likes, size, avatar and seller. This is too much for a small two-column card and several controls are 32pt.

Use two variants:

- **Discovery card:** media, save/favourite, one-line identity and price—maximum three decision facts.
- **Profile/archive card:** denser product scan with status/price; no seller identity because the seller is already known.

Condition belongs in metadata unless critical. Price-drop can replace—not join—condition. Media count can use a tiny non-interactive indicator. The save/favourite control gets a 44/48pt invisible hit region.

### 8.3 Profile and seller storefront

**Current gap:** the captured own-profile first viewport is dominated by a blank cover/avatar, then oversized Edit/Share actions and a utility rail that clips at the edges. Listings do not take over quickly enough.

**Target composition:**

- If real cover media exists: 160–180pt cover with preserved focal point and 88–96pt seam avatar.
- If it does not: collapse to a compact authored identity canvas rather than rendering a giant grey placeholder.
- Align avatar lower half with a stats row (sales, rating, response/dispatch or followers where truthful).
- Put display name, handle, concise bio and verified/seller signal in one coherent block.
- Keep primary actions stable: own profile `Edit profile | Share`; other profile `Follow | Message`, with overflow separate.
- Convert Closet/Wallet/Auctions/Co‑Own into equal-width compact controls or a padded horizontal rail that never starts clipped.
- Move media above explanatory/empty copy. Empty tabs use a compact in-grid prompt, not a full blank screen.
- Add a curated shop-window rail, pinned items and manual grid arrangement only after server-side persistence exists.
- Use 3:4 thumbnails for fashion/media identity; preserve per-item crop position.

Premium profile accents should identify real seller verification, authenticated inventory or curated storefront status. A generic gold border around every avatar would reduce quality.

### 8.4 Edit Profile, Settings and Account Control

The direction is substantially better than older versions: media editing has been removed from Edit Profile, fields are grouped and Account Control is separated. Finish the work as a compact utility surface:

- first viewport: close/back, `Edit profile`, Done, compact identity row, Name and Username;
- public: Name, Username, Bio, Website;
- private: Email + verification, Phone, Country/region;
- security: Password, 2FA;
- account: Account Control;
- Save/Done stays in the header and exposes disabled, dirty, saving, success and recoverable-error states;
- focus uses a real 2pt semantic focus token; editable fields must not use disabled-looking grey blocks;
- destructive actions live only in Account Control with spacing and confirmation.

Settings should follow the supplied Instagram/Depop references: centred title, search, identity/account summary, then icon-led 56–64pt rows. Show 4–6 useful rows in the first viewport. Avoid a card around every row; group by spacing and quiet separators.

### 8.5 Two-factor authentication

The 2FA screen remains large (about 808 lines) and style-heavy. Rebuild it as an operational staged flow:

1. status summary (`Off`, `Setup incomplete`, `On`);
2. concise benefit and requirement;
3. authenticator setup with QR + manual key and secure copy feedback;
4. six-digit verification with numeric keyboard and auto-advance;
5. recovery codes with explicit saved/not-saved acknowledgement;
6. success state and disable/regenerate actions behind re-authentication.

Keep one main action per stage. Do not show QR, manual key, code entry, recovery codes and warnings in one dashboard-like page. Announce errors and never leak the secret into logs/screenshots.

### 8.6 Product detail and checkout

The component architecture is one of the stronger areas: media stage, identity, trust, buyer protection, sticky dock, size guide, price insight and recommendations are separated. The next pass must be compositional, not feature-additive.

- Product media owns 55–68% of the first viewport.
- Use `contain` or focal-safe behaviour for shoes, bags, jewellery and isolated products; use focal-aware crop for garments/editorial shots.
- Keep thumbnails subordinate but preserve carousel position and transition into full screen.
- First decision block: price, title, condition/size, seller identity, one trust line and Offer/Buy dock.
- Buyer protection, shipping and returns must be visible before irreversible payment, not necessarily all squeezed above the fold.
- Collapse attributes into compact fact rows; remove decorative chip clouds.
- Sticky dock clearly separates secondary Offer from primary Buy now and handles sold, own-item, unavailable and pending states.
- Similar/Seen in Looks appears after core decision information.
- Never show watchers, price history, authentication or scarcity without data.

Checkout should use tabular alignment, quiet section borders, one final total and an explicit protection/return summary. It must not become a stack of nested cards.

### 8.7 Closet, saved items and boards

The supplied Pinterest Saved reference uses visual two-column board mosaics, privacy/status metadata and almost no dashboard chrome. Current Closet adds search, a stats card, tabs, result count, sort, brand chips and price-drop chips before media.

Recommended hierarchy:

- `Saved | Wishlist | Collections` tab rail;
- media immediately below;
- sort/filter in a single compact sheet trigger;
- collections use authored 2×2 mosaics with title, count and private/shared state;
- product saves use true-aspect masonry;
- move “total value/savings tracked” into an optional insights sheet, not the default first viewport;
- create collection remains a restrained header/FAB action with safe-area clearance.

### 8.8 Inbox and Chat

Inbox should borrow Instagram's calm scan grammar, not its Notes feature unless ThryftVerse has a real differentiated use:

- compact account/title row and compose/settings actions;
- search;
- Primary / Requests / transactional filter only where backed by real classification;
- 56–64pt avatars, name, one-line preview, timestamp and restrained unread indicator;
- swipe actions with accessible alternatives;
- skeletons identical to row geometry.

Chat should borrow the supplied Vinted structure:

- compact participant bar;
- optional listing/order context card with image, title, price/state and valid Offer/Buy/Track action;
- commerce state changes as structured cards, not plain chat text;
- safe-message guidance collapsible and non-obstructive;
- keyboard always keeps reply context, composer and send visible;
- attachment sheet shows only supported image/video/file capabilities;
- no ghost DM when backend creation fails;
- message reactions, reply targets and status indicators remain screen-reader accessible.

Decompose the 2,049-line Inbox and 2,202-line Chat screens into orchestration plus canonical rows/header/list/composer/state components. This is required for consistent rendering and performance, not code tidiness alone.

### 8.9 Sell and Create

The captured photo-first opening is directionally correct. The remaining issue is trying to expose too much workflow at once.

- Stage 1: media capture/reorder with exact per-asset upload state.
- Stage 2: listing mode and core identity (title/category/brand/size/condition).
- Stage 3: mode-specific price/auction/Co‑Own fields.
- Stage 4: shipping, protection and preview.
- Stage 5: publish progress and recoverable success/failure.

Autofill, sold-comparables and quality meter should assist quietly; they must not turn the form into an analytics dashboard. Preserve draft state, explain which media failed, and never lose successful uploads when a later API step fails.

### 8.10 Auction

The surviving render is well below target. The first viewport needs one clear market object, not a header with five competing actions followed by missing category tiles.

- Title + two high-priority actions; move remaining controls to overflow or a contextual attention strip.
- Featured/live lot with real media, seller/trust, current bid and countdown.
- Live / Ending / Upcoming / Watching rail beneath the market identity.
- A countdown uses large tabular figures and one truthful urgency state.
- Auction detail is media-first with current price/bid state and a safe sticky bid dock.
- Ended state explains outcome, winning/losing state and next action.
- Missing-media cards become restrained category placeholders, not the dominant visual pattern.
- Fix all encoding defects (`Â·`) and ensure long titles/prices clear the home indicator.

### 8.11 Co‑Own, Portfolio and Trade

Co‑Own is where the premium-commerce canvas should become visible. Use warm near-black/off-white surfaces and contextual champagne/bronze for authenticated ownership, certificate/trust and selected market state—not generic decoration.

- Asset detail: real media, asset identity, available units, price/unit, ownership/trust and trade dock.
- Chart: display only real observations; show “history unavailable” rather than synthetic movement.
- Portfolio: one compact total-value summary; round 1ze values to a user-defined precision; never expose six-decimal noise in normal cards.
- Position cards: image, title, units/ownership and one principal value; move average entry/realised/unrealised detail to expansion/action sheet.
- Empty/error states: retain educational/browse continuation and cached/read-only values when safe; avoid a giant generic dead screen.
- Trade confirmation: units, price, fee, total, risk and resulting holding in aligned numeric rows; medium haptic on confirm, success haptic on receipt.
- Keep financial up/down colour semantic and accessible; do not use gold for gain/loss.

## 9. Minute-detail quality specification

### Geometry and alignment

- One 16pt standard content rail; 8pt discovery gutter; document every full-bleed exception.
- Align text baselines, not only container centres.
- Header icon hit regions are equal even when glyphs have different optical widths.
- Chevrons sit at least 8pt from right-aligned values.
- Sticky docks calculate content inset from measured dock height + safe area; no arbitrary spacer views.
- Validate at 320, 360, 390, 430 and 600+ widths and with increased system text.

### Type

- Maximum three visible sizes in the first viewport.
- One semantic type API; remove raw `fontSize` from canonical screens.
- Use tabular figures for prices, countdowns, units and ledger rows, but round display precision by context.
- Keep labels quieter than values; avoid uppercase except true overlines.
- Test truncation with long usernames, brands, GBP values and translated strings.

### Media

- Store dimensions/focal metadata before render.
- Skeleton, placeholder and final image share exact geometry.
- Use dominant-colour/blurhash placeholder and 200–300ms crossfade.
- Never let image failure collapse a card.
- Product-object policy: contain for isolated silhouette; focal-aware cover for editorial/body-worn media.
- Overlays stay at edges and never cover the product focal point.

### Controls

- 44pt iOS/48dp Android effective target; visual glyph may remain 20–24pt.
- Press scale 0.97–0.985 with no bounce.
- Disabled state changes opacity and semantics, not merely text colour.
- One dominant CTA per decision cluster.
- Icon-only controls always expose label, role, state and hit slop.

### Colour/materiality

- Media: neutral white/near-black; photography carries colour.
- Utility: neutral; no decorative gold.
- Premium commerce: warm canvas and sparse luxury accents tied to real state.
- Antique-gold filled controls use dark `onLuxuryAccent`, not white text.
- Do not use translucent hairlines as the only focus indicator.
- The screen must remain premium when gold is removed; composition and photography are the proof.

### Motion

- Cap list entrance animation to above-fold items; never delay item 20 by a full second.
- Reduced motion is the default concern of primitives.
- Use shared image transition only where it preserves orientation and does not flash.
- No continuous pulse or JS interval for decoration.
- Haptic light: selection/navigation; medium: send/offer/bid/trade; success: completed publish/purchase/win.

### States and copy

- Loading mirrors final content.
- Empty state explains what happened and gives one relevant action.
- Error copy is user-safe and contextual; never expose class names, raw endpoints or status codes.
- Offline/cached state is distinct from hard failure.
- Partial data hides absent fields or uses an em dash; never invents.
- Permission denial links to the next realistic resolution.
- Remove all mojibake and audit UTF‑8 source/build boundaries.

## 10. Prioritised reconstruction plan

### Phase 0 — Source-of-truth rescue (P0, before design work)

- integrate branches and backend commits;
- rename/merge `DESIGN.md`;
- remove production debug overlays;
- create route/state/device screenshot manifest;
- run a clean native build and capture the baseline.

**Exit:** one canonical branch and one reproducible app binary.

### Phase 1 — System convergence (P0/P1)

- unify ThemeContext and remove legacy static colour consumption;
- implement canvas/luxury/semantic tokens;
- unify typography and numeric styles;
- standardise icon buttons, fields, rows, sticky docks and state canvases;
- enforce token, target and reduced-motion rules in CI.

**Exit:** no canonical screen imports `constants/colors`; live theme switching works across every audited route.

### Phase 2 — Media and performance foundation (P1)

- add media dimensions/focal/dominant/blurhash metadata;
- replace ID/hash masonry ratios;
- virtualise Home/Explore/Closet grids;
- remove nested list/ScrollView architecture;
- add per-surface Visually Complete telemetry and image-failure tracking.

**Exit:** zero above-fold layout shift, correct skeleton parity and smooth mid-range Android scroll.

### Phase 3 — Highest-value product surfaces (P1)

1. Home + Explore + ProductCard;
2. Product Detail + Checkout;
3. Profile + Storefront + Closet;
4. Inbox + Chat;
5. Sell + Create;
6. Auction + Co‑Own;
7. Settings + 2FA + remaining utility/auth surfaces.

Each department must be completed in one branch with before/after/state captures, not scattered across parallel unmerged branches.

### Phase 4 — Visual verification and hardening (P1/P2)

- native screenshot diff fixtures for both themes and compact/standard devices;
- keyboard, safe-area, large-text and reduced-motion passes;
- missing image, slow network, offline, partial data, sold/ended and permission states;
- performance traces and memory checks;
- final human side-by-side review against the supplied references.

## 11. Acceptance gates for the next “flagship complete” claim

Do not accept another completion report unless it includes:

1. canonical branch and SHA that contains the design contract and all UI work;
2. clean working tree and successful typecheck/test output;
3. zero hardcoded-token warnings in canonical UI code, or an explicit reviewed exception list;
4. no legacy static colour imports in screens/components;
5. measured Visually Complete definition and result for Home, Explore, Product, Profile and Chat;
6. full required native shot list in light/dark mode at 320/390/430pt widths;
7. keyboard-open Chat/Edit Profile/Sell captures;
8. loading, empty, error, offline, partial and missing-media captures;
9. no debug overlays, raw errors, encoding defects or fake capabilities;
10. score of at least 3/4 in all six categories and 4/4 in at least two, confirmed visually rather than by source-string tests.

## Final diagnosis

`DESIGN(1).md` is a meaningful strategic upgrade and is not the reason the app feels low quality. The reason is that it currently describes a target system that the runtime only partially implements, on a branch that is not canonical, with enforcement that tolerates hundreds of inconsistencies and tests that do not render the UI.

The next quality jump will not come from another broad “make it flagship” prompt or more component count. It will come from:

1. rescuing one source of truth;
2. converging theme/type/media/motion primitives;
3. rebuilding the highest-traffic surfaces around real media geometry and virtualised composition;
4. applying luxury materiality only where ThryftVerse has genuine premium/trust/ownership meaning; and
5. refusing to call the work complete without a current, complete native visual evidence set.

That programme would move ThryftVerse from a feature-rich, repeatedly restyled prototype toward a recognisable, production-grade social-commerce product that can credibly sit beside—not merely imitate—Pinterest, Instagram and Depop.
