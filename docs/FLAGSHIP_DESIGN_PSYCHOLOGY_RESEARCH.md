# Flagship App Design Psychology — Research Report

A research synthesis guiding ThryftVerse's flagship implementation. Each section covers the psychological principle, how flagship apps apply it, how ThryftVerse currently applies it (or doesn't), what a flagship implementation looks like, and source URLs.

Grounded in `AGENTS.md` §4 "PUSH TO MAXIMUM QUALITY" and the "ANTI-AI-MADE DESIGN" policy: quality comes from **composition, hierarchy, rhythm, contrast, and restraint** — never from decorative chrome, generic gradients, label-everything disease, or excessive motion.

---

## 1. Visual Hierarchy Psychology

### The psychological principle
The human eye does not read a screen — it **scans** it in predictable patterns, then groups what it sees using Gestalt principles (proximity, similarity, continuation, closure, common region). Hierarchy is the user's *unconscious* ranking of what to look at first, second, third, driven by:

- **Size** — larger elements dominate (newspaper-headline logic).
- **Color/contrast** — brighter/richer colors grab attention before muted/grayscale ones.
- **Position** — on mobile, a strong **top-left bias** exists (expectation + reading order). Eye-tracking on 193 mobile UIs found top-down features (color, size) affect saliency *less* than expectation and the presence of text/images near the top-left.
- **Proximity** — elements close together are perceived as one group; this is the single most powerful grouping tool on small screens.
- **Whitespace as hierarchy** — empty space is not "wasted"; it tells the eye where one group ends and the next begins.

Two dominant scanning patterns (Nielsen Norman Group, 2006):
- **F-pattern** — text/content-heavy pages (search results, feeds): eyes sweep the top horizontally, drop down the left side, sweep mid-page, drop again. Key content belongs in the top horizontal band and the left vertical column.
- **Z-pattern** — visually-light pages (landing, marketing): top-left → top-right → diagonal to bottom-left → bottom-right. Trust signals top-right; CTA at the bottom-right terminus.

The "feels well-designed vs generic" split: a well-designed screen has **one dominant object** and a clear reading order. A generic screen has **equal-weight elements competing for attention** — the thumbnail test fails because nothing dominates.

### How flagship apps apply it
- **Instagram** feed: one dominant media object per row; UI chrome (icons, counts) recedes via low contrast; the photo *is* the hierarchy.
- **Pinterest**: masonry with varied card heights — asymmetry is the hierarchy engine; no two rows are the same height, so the eye keeps moving.
- **eBay** search results: price and image dominate; seller name and shipping are muted secondary metadata grouped by proximity below.
- **Linear**: a single accent color reserved for the primary action; everything else is neutral. Hierarchy by *contrast*, not by decoration.

### How ThryftVerse currently applies it
ThryftVerse's token system (`designTokens.ts`) encodes a clear type scale with weight deltas (700 → 600 → 400) and negative letter-spacing on display sizes — this is correct hierarchy infrastructure. The `Type` scale has a dominant `priceLarge` (28/32/700) and receding `caption`/`meta` tiers. The risk surfaces are **per-screen composition**, not the tokens: any screen that stacks equal-weight rounded rectangles with identical gaps will defeat the scale (the "generic dashboard silhouette" tell from AGENTS §4). The radius budget (two non-avatar sizes per viewport) and surface budget (one dominant non-media panel above the fold) are the load-bearing constraints here.

### What a flagship implementation looks like
- Decide the **dominant object** before touching tokens. On a discovery feed it's the media; on a PDP it's the hero image + price; on a profile it's the avatar + name.
- Place primary content in the **top-left-to-top-band** zone; reserve the left column for scannable structure.
- Use **proximity** to group (title + price + primary action tight; shipping/reviews in a separate cluster lower).
- Use **one** weight/size jump for hierarchy — a 700→600 delta is enough; avoid 5 competing weights.
- Apply the **thumbnail test** at 25% scale: if the silhouette is a grid of identical grey cards, re-author the composition with a dominant object and intentional asymmetry.

### Sources
- https://weareaffective.com/learning-centre/what-gestalt-principles-apply-to-mobile-app-interface-design
- https://assets.interaction-design.org/literature/article/visual-hierarchy-organizing-content-to-follow-natural-eye-movement-patterns
- https://ar5iv.labs.arxiv.org/html/2101.09176 (mobile UI saliency, top-left bias)
- https://mantasauk.com/articles/visual-hierarchy-f-z-reading-patterns-buyers-eye/
- https://doi.org/10.1162/leon_a_02005 (eye-tracking of Gestalt patterns)

---

## 2. Trust Psychology in Marketplace Apps

### The psychological principle
Trust in C2C marketplaces is **multi-layered** and reduces stranger-anxiety through signals at three levels:

1. **Seller reputation** — feedback scores, review counts, response-rate, dispatch time. eBay's research shows feedback alone is insufficient; bad transactions create *platform-wide* reputational externalities.
2. **Structural assurance** — buyer protection, escrow/holding, Money-Back Guarantee, authenticity verification. These shift perceived risk from the buyer to the platform.
3. **Profile humanity** — profile photos, real names/handles, mutual friends (Facebook Marketplace: mutual friends 43.7%, peer reviews 42.1% are the dominant trust cues). Anonymity reduces trust; identity increases it.

A key finding from the C2C literature: **seller reputation, product reviews, pricing, and the presence of profile photos** are the notable buyer-side trust influencers; **structural assurance and website/platform quality** drive platform-level trust.

Trust signals work as **heuristics** — they reduce cognitive effort by letting users outsource scrutiny to the platform. But this cuts both ways: low-quality sellers can arbitrage platform reputation, and ratings saturation inflates trust. The design implication: trust signals must be **evidenced by backend rows** (AGENTS §11 fail-closed policy), not decorative badges.

### How flagship apps apply it
- **eBay** layers: public reputation (positive/negative/neutral + "verified purchase" label), operational performance (Top-Rated Seller badge tied to shipping timeliness & claim handling, not just feedback), Money Back Guarantee, and Authenticity Guarantee for high-risk categories (watches, sneakers, handbags, jewelry). The badge redesign shifted criteria to *controllable* admin measures, and sellers responded by improving exactly those dimensions.
- **Etsy** uses a warm, handcrafted visual language (burnt-orange `#f1641e`, Graphik humanist sans, warm cream `#fff8f0` page floor) that signals "small-batch maker" rather than "tech marketplace." Trust comes from *aesthetic warmth + maker identity*, not from corporate blue.
- **Vinted** leads with photography, clear condition/price, seller ratings, and buyer protection at checkout. Trust = clean photo-led listing + protected payment.
- **Facebook Marketplace** leans on social graph: mutual friends and peer reviews are the dominant cues.

Color/typography for trust: **cool blue palettes** have reliable evidence for trust in *unfamiliar/high-anxiety* contexts (financial, B2B). But context-fit beats universal meaning — Etsy's warm orange works because it fits the handmade category. **Contrast** (CTA vs surroundings) drives click effectiveness more than hue.

### How ThryftVerse currently applies it
ThryftVerse's palette (`colors.ts`) is deliberately restrained: deep neutral background (`#0A0A0A` dark / `#FFFFFF` light), warm off-white brand (`#F4F0E8` dark / `#111111` light), a `commerceTrust` blue (`#4A7AC4`) reserved for trust accents, and an `antiqueGold`/`bronze` for verified/authenticated status. This is a **luxury-editorial** direction (Farfetch/SSENSE), not the eBay-blue direction — appropriate for a fashion-forward resale marketplace. The fail-closed trust-signal policy (AGENTS §11) is the correct structural guardrail. The risk is **badge proliferation**: if verified tier, safeguarded status, custody coverage, appraisal value, escrow ETA, response-rate, and dispatch time all render as separate pills, the screen hits "label-everything disease." Trust signals must be *evidenced and grouped*, not stacked.

### What a flagship implementation looks like
- One **primary trust anchor** per surface (e.g., seller reputation summary on a listing; buyer-protection line at checkout). Secondary signals grouped by proximity, not scattered.
- Profile **humanity**: real avatar, handle, response-rate, member-since — grouped tightly so the seller reads as a person, not a row of badges.
- **Fail-closed**: null = no render. No badge without a backend tier. A hardcoded badge is a lie (AGENTS §11).
- Color: reserve `commerceTrust` blue for genuine protection/verification; reserve `antiqueGold` for authenticated value. Never use both decoratively in the same viewport.
- Warm-editorial palette (not corporate blue) signals "curated marketplace, not mass liquidation" — matches the Farfetch/SSENSE direction already chosen.

### Sources
- https://www.sciencedirect.com/science/article/pii/S254392512300030X (C2C trust factors)
- https://www.mdpi.com/2813-4176/4/1/2 (trust as behavioral architecture)
- https://sci-hub.st/storage/2024/6320/fb72dd13363f619aeb9c0cb981d4bf3e/luca2017.pdf (marketplace trust & reputation design)
- https://www.ama.org/2026/04/21/when-a-trust-badge-changes-what-sellers-do/ (eBay Top-Rated Seller redesign)
- https://marketplacebeat.com/articles/how-to-build-trust-in-your-marketplace
- https://doi.org/10.1109/icdabi67967.2025.11547409 (Facebook Marketplace: mutual friends 43.7%, peer reviews 42.1%)
- https://www.webdesignhot.com/design.md/etsy/ (Etsy palette/typography)
- https://www.designsystems.one/design-systems/ebay-design (eBay Evo palette/typography)

---

## 3. Friction and Flow Psychology

### The psychological principle
**Flow** in mobile UX is *continuity*: the next step makes sense, the system feels fair, the user feels oriented, and effort feels proportionate to value. Flow is **not** "frictionless" — it is friction that is *legible and worth paying*.

**Behavioral friction** is the cognitive/physical/procedural cost between a user and their next action. B.J. Fogg's Behavior Model: behavior = motivation × ability × prompt. Friction reduces *perceived ability*; it raises the bar for which motivations produce action. This is why friction is a tool, not just an enemy.

**Positive friction** (deliberate pauses that help):
- **Irreversible decisions** — deleting an account, confirming a large transfer, permanently removing shared data. Confirmation dialogs exist because the error cost of an accidental irreversible action exceeds the annoyance cost of an extra tap by orders of magnitude.
- **High-stakes commitments** — payments, escrow funding, bid placement. A short review screen surfacing amount/counterparty/fee/settle-time reduces anxiety and errors.
- **Effort justification / IKEA effect** — when people invest a little effort, they value the result more. If everything feels instant, it can feel throwaway. A brief, meaningful role in the outcome increases satisfaction and trust.

**Negative friction (sludge)** — redundant form fields, confusing navigation, repeated fields, "just one more screen," pre-ticked subscription defaults. These serve the business, not the user, and users feel it immediately.

The key distinction: **if the pause helps the user make a better decision or avoid harm, they welcome it. If it exists only to serve the business, they feel it instantly.**

### How flagship apps apply it
- **Cash App / Stripe**: payments surface a review step (amount, recipient, fee) before commit — positive friction on a money surface. The rest of the flow is otherwise near-frictionless.
- **Uber**: zero-friction core (one tap to request) — the value is immediate, the stakes are low-ish, so flow is preserved by removing waste.
- **Duolingo / TikTok**: no onboarding explainer; they drop you into the value (a quiz / content) — flow preserved by removing *wasteful* friction (tutorials answering questions the user never asked).
- **eBay bidding**: placing a bid requires a confirmation (positive friction — irreversible commitment), but browsing/watching is frictionless.

### How ThryftVerse currently applies it
ThryftVerse spans money surfaces (escrow, payouts, co-ownership) and discovery surfaces (feed, search, auctions). The motion contract (`motionTokens.ts`) preserves flow: instant/micro/deliberate tiers, no motion on static content, reduced-motion fallbacks. The risk is **inconsistent friction calibration**: too much friction on low-stakes browsing (decorative confirmations, unnecessary steps) erodes flow; too little friction on money surfaces (no review step before escrow funding) breaks trust. AGENTS §11 (truthful UI, unknown-outcome ≠ success) and §13 (control quality: disabled/loading/pressed states) are the structural guardrails. The "Psychology of the Pause" finding — that a review screen on a money surface *reduces* disputes and support contacts — is directly applicable to ThryftVerse's escrow/payout flows.

### What a flagship implementation looks like
- **Map friction to stakes**: zero friction on browse/watch/like; one confirmation on bid/place-order; a review screen on escrow funding/payout (amount, counterparty, fee, settle ETA); a hard confirmation + cooling copy on irreversible destructive actions (delete account, remove co-owner).
- **Explain the pause**: "We're holding your payment until the item is marked delivered" — language that makes the friction *legible*.
- **Remove sludge**: no repeated fields, no "just one more screen," no pre-ticked defaults, no tutorials before value.
- **Preserve flow on discovery**: feed/search/auction-browse should never block on a confirmation or a loading wall — skeleton → content, no modal interruption.
- **Effort justification on listing creation**: a photo-first flow with a few meaningful steps (photos, condition, price) makes the listing feel authored, not auto-generated — but cap it so sellers don't abandon.

### Sources
- https://stevezafeiriou.com/behavioral-friction/
- https://www.inc.com/goran-paun/why-good-interfaces-should-know-when-to-slow-down/91393006
- https://www.codexical.com/posts/2026-06-12-intentional-friction-design (Fogg Behavior Model, irreversible decisions)
- https://www.futureplatforms.com/insights/psychology-of-the-pause-why-friction-builds-trust-high-stakes-world (effort justification, IKEA effect, money-surface review steps)
- https://www.influencers-time.com/optimizing-mobile-checkout-for-better-conversion-and-trust/

---

## 4. Motion Psychology

### The psychological principle
Timing is the single most consequential dimension of animation. Human perception has bands:
- **<100ms** — feels instantaneous (not perceived as motion).
- **100–300ms** — feels responsive (perceived but doesn't delay).
- **300–600ms** — feels deliberate (the interface is showing you something).
- **>600ms** — feels slow; >1000ms feels broken unless framed as a long-form transition.

Recommended ranges:
- **Micro-interactions** (button press, toggle): 100–150ms. If triggered 100×/day, even 200ms adds up.
- **Standard UI transitions** (dropdown, menu, tab): 150–250ms.
- **Content surfaces** (modal, drawer, page): 250–400ms (the user is switching mental context).
- **>500ms** is suspect — usually a decorative animation hiding as a functional one.

**Why linear feels robotic:** linear motion has no acceleration/deceleration — nothing in the physical world moves that way. Natural motion follows physics: ease-out (decelerate into rest) for entries, ease-in (accelerate away) for exits, ease-in-out for state changes. **Spring physics** (damping, stiffness, mass) feel native because they model real inertia; **velocity transfer** from a gesture into the animation is the single property that makes native feel physical — web `ease-out` fakes deceleration but always starts from zero velocity, so it feels disconnected.

**Native vs web feel:** native apps feel like *objects* (momentum, resistance, multi-sensory consequence — haptics + sound + visual deformation); web apps feel like *paper* (timer-based motion, binary interactions, visual-only feedback). Enter and exit motions should differ (energy arriving vs energy leaving); symmetric animations feel mechanical.

**Frequency matters:** the more often a user sees an animation, the shorter it should be. Stagger (3–8 items) turns choreography into rhythm; more than 8 and it becomes a long wait.

### How flagship apps apply it
- **iOS / Apple HIG**: ease-out entries, ease-in exits, spring for direct manipulation; 250–400ms for sheets; micro-interactions ~100–200ms.
- **Linear**: 120–180ms spring-based precision — snappy, settles fast, never floaty.
- **Instagram**: physics-based motion that mimics human movement; like-button spring, story transitions.
- **Cash App**: money-surface animations are *deliberate* (slightly slower) to convey weight; navigation is instant.

### How ThryftVerse currently applies it
ThryftVerse's motion contract (`motionTokens.ts`) is **already flagship-caliber** and directly aligned with the research:
- Three tiers: instant (0ms, reduced-motion), micro (120ms), deliberate (280ms) — within the 100–300ms responsive band.
- Duration ladder: touch 80ms, fast 120ms, normal 180ms, slow 280ms, slower 400ms, crawl 600ms — matches the perception bands.
- Easing: ease-out for entries (`entrance`), ease-in for exits (`exit`), ease-in-out for state changes (`crisp`) — exactly the native pattern.
- Springs: damping 12–18, stiffness 120–280, mass 0.8–1.0 (AGENTS §27.3 flagship range); semantic presets (tap, press, settle, sheet, reorder, success) — no bespoke per-screen springs.
- Stagger capped at 8 items (AGENTS §16: don't animate entire history on load).
- Reduced-motion collapses to instant/REDUCED_SPRING — accessibility honored.
- Prohibited (AGENTS §17): bounce, continuous pulsing, floating cards, decorative shimmer after load, large spring movement, dramatic parallax, animating the entire page.

The one risk: **velocity transfer**. Reanimated springs can carry gesture velocity, but if any surface uses timing-based animations where a spring with velocity would feel physical (drag-to-dismiss, pull-to-refresh, slider snap), it will read as "web-like." Audit gesture-driven surfaces for `withSpring({ velocity })` rather than `withTiming`.

### What a flagship implementation looks like
- Keep the existing tier system; never invent per-screen durations.
- Use **springs with velocity transfer** for all direct-manipulation gestures (drag, swipe, pull-to-refresh, slider).
- Enter > exit duration (entrance slightly longer than exit).
- Reserve `crawl` (600ms) only for rare onboarding/celebratory moments.
- Haptics paired with micro-interactions (selection feedback) — multi-sensory consequence is the native tell.
- No motion on static content; no decorative shimmer after load.

### Sources
- https://moro.davidumoru.me/lesson/timing-and-duration (perception bands, duration ranges, stagger)
- https://ruixen.com/blog/web-apps-feel-like-paper (momentum/resistance/consequence, velocity transfer, native vs web)
- https://www.joshwcomeau.com/animation/linear-timing-function/ (why linear feels robotic, spring physics)
- https://www.72technologies.com/blog/motion-ratios-ui-feel-cheap (ratio system, 80ms instant threshold, 500ms cap)
- https://github.com/phazurlabs/sumi/blob/main/skills/interaction-motion-design/SKILL.md (purpose over polish, physics-based)

---

## 5. Color Psychology for Commerce

### The psychological principle
Color folklore ("blue = trust, red = urgency, green = growth") is mostly wrong. The sharper findings:

1. **Context-appropriateness (color fit) outperforms universal hue associations.** Category color norms matter more than universal meaning. A blue CTA on a sportswear site underperforms a high-contrast orange/red because blue creates cognitive dissonance with an energetic category. The same blue wins on a financial site.
2. **CTA effectiveness is driven by contrast relative to surroundings, not specific hue.** Maximum contrast outperforms the "right" color.
3. **Red induces aggression via arousal** — and the effect flips by selling mechanism. Bagchi & Cheema (2013): red (vs. blue) backgrounds elicit **higher bid jumps in auctions** (aggression focused on competing with other bidders) but **lower price offers in negotiations** (aggression focused on beating the seller). The effect is stronger for **hedonic** products (wine, chocolate, fashion) than utilitarian ones.
4. **Dark colors signal dominance and higher hierarchy.** Consumers infer a darker-colored product is higher-tier than an identical lighter one; perceived dominance mediates this.
5. **Dark mode raises perceived luxury/value** in most cases — but brands built on accessibility/joy/lightness can lose authenticity in an overly dark environment.
6. **Dark mode can reduce user trust and brand perception** in commerce (Hultman & Jiang, 2024) — the dark-mode group was *divided* on trustworthiness. Dark mode is not a free win; it trades warmth for luxury.
7. **Warm hues (red/orange) enhance urgency and click intention; cool hues (blue/green) promote trust and aesthetic appeal** (Ferreira, Portuguese e-commerce study, n=137).

### How flagship apps apply it
- **eBay**: blue `#3665f3` primary (trust + links), red `#e0103a` for urgency/auction, green `#05823f` success, yellow `#f7b100` highlights. Market Sans for dense small-size reading. Color signals hierarchy/feedback "without drama."
- **Etsy**: burnt-orange `#f1641e` brand + warm cream `#fff8f0` floor — warmth signals handmade, not corporate. White canvas, warm ink `#222222`.
- **Farfetch/SSENSE** (ThryftVerse's stated reference): near-black/white minimalism, content (photography) is the color. Luxury via restraint, not hue.

### How ThryftVerse currently applies it
ThryftVerse chose the **luxury-editorial** direction: deep neutral `#0A0A0A` / `#FFFFFF`, warm off-white brand `#F4F0E8` / `#111111`, reserved `commerceTrust` blue `#4A7AC4`, `antiqueGold`/`bronze` for authenticated value, `discovery` magenta `#B85566` and `social` mauve `#9A6B7A` as category accents (never decorative). Status colors are WCAG-compliant and desaturated (`danger #9b0202`, `success #215634`, `warning #D49454`). This is context-appropriate for a **fashion-forward resale marketplace** — hedonic category, so the warm-editorial palette fits; the restraint (content is the color) matches Farfetch/SSENSE.

The research flags two risks:
1. **Dark-mode trust penalty** — ThryftVerse defaults dark. On money surfaces (escrow, payout, checkout), the dark-mode trust drop is real. Mitigation: keep geometry/density identical across themes (AGENTS §4 light/dark parity), and let trust *signals* (not background color) carry reassurance.
2. **Auction urgency color** — red induces higher bid jumps in *auctions* (hedonic category). ThryftVerse's `danger` red is currently reserved for destructive/error states. For auction countdown thresholds (last minutes), a *distinct* urgency accent (not the error red) could drive bidding engagement without conflating urgency with error. The `warning` amber `#D49454` is a candidate, but research suggests red's arousal effect is stronger for auctions specifically.

### What a flagship implementation looks like
- **Content is the color** on discovery/commerce surfaces — photography carries the visual energy; the palette stays neutral.
- **Contrast over hue** for CTAs — the primary action wins by contrast against its surroundings, not by being a "trust blue."
- **Auction urgency**: introduce a *dedicated* urgency accent (distinct from error `danger`) for genuine time-pressure thresholds (last X minutes of an auction). Red-family is empirically justified for auction bid arousal, but it must not be the same red as destructive actions, or users conflate "urgent" with "error."
- **Dark-mode money surfaces**: keep trust signals prominent and legible; don't rely on background warmth. Consider whether checkout/escrow surfaces could use a slightly raised surface (`surfaceElevated`) to feel more "contained" and trustworthy.
- **Category accents** (`discovery`, `social`) used only for category iconography/contextual accents, never as decorative fills.

### Sources
- https://vtechworks.lib.vt.edu/server/api/core/bitstreams/dad16864-1a7f-4780-b0a6-c03d9225bd29/content (Bagchi & Cheema: red backgrounds → higher auction bid jumps, lower negotiation offers)
- https://www.gogochimp.com/blog/ecommerce-psychology (Hagtvedt: dark = durability/premium; red works on hedonic categories)
- https://nidisag.isag.pt/index.php/IJAM/article/view/825 (warm hues → urgency; cool hues → trust)
- https://colorarchive.org/guides/ecommerce-color-psychology-guide/ (context-fit > universal meaning; contrast > hue)
- https://belovdigital.agency/blog/the-impact-of-color-psychology-on-e-commerce-conversions/
- https://onlinelibrary.wiley.com/doi/10.1002/mar.21623 (darkness → higher hierarchy/dominance)
- https://beecommerce.pl/en/blog/dark-mode-how-your-interface-manipulates-the-perception-of-luxury-and-price- (dark mode → luxury, but warmth brands can lose authenticity)
- https://www.diva-portal.org/smash/get/diva2:1874431/FULLTEXT01.pdf (Hultman & Jiang: dark mode negatively impacts trust/brand perception in m-commerce)

---

## 6. Typography Psychology

### The psychological principle
Typography operates *below conscious awareness* — readers don't think "humanist sans = approachable," but the accumulated signal shapes perception in milliseconds. Key findings:

- **Serifs boost perceived credibility by ~18%** (usability research) — associations with print/books/authority.
- **A serif (Cotford) triggered +13% perceived relevance, +10% memorability, +9% trustworthiness** for the word "quality" (Monotype/Neurons study, n=400). Serifs carry long cultural associations with fashion/luxury.
- **Humanist sans-serifs (FS Jack) boosted confidence +12%, sincerity/honesty** for "trust" — letters closer to calligraphy prompt a deeper instinctive reaction. Double-story "a"/"g" read as more humanist.
- **Geometric sans-serifs (Gilroy)** read as honest/modern but more clinical/distant — precision, tech-savviness.
- **Didone serifs** (extreme thick/thin contrast) say "premium" louder than any other classification — Vogue, Harper's Bazaar, luxury retail.
- **What makes a font feel premium vs cheap:**
  - *Proportions* — balanced, optically adjusted (not mechanically constructed).
  - *Spacing* — consistent kerning, comfortable letter spacing, even rhythm. Tight/inconsistent spacing reads amateur.
  - *Optical correction* — circular shapes overshoot the baseline; vertical strokes adjusted for balance. The invisible craft the eye perceives but can't explain.
  - *Consistency* — uniform stroke weight, cohesive glyphs across uppercase/lowercase/numerals.
  - *Character without overdesign* — too neutral = generic; too expressive = gimmicky. Premium sits in the middle.
- **Type scales with 1.25–1.5 ratios** create clear, mathematical hierarchy.
- **Line height / letter spacing / weight hierarchy** — body text ~1.5 line spacing is a safe default; negative tracking on display sizes tightens and elevates; one weight delta (700→600) is normally enough for hierarchy.

### How flagship apps apply it
- **Apple SF Pro** — variable font (weight, width, optical size axes), 11 semantic Dynamic Type styles, optical sizing automatic by point size. The platform vocabulary; most apps use only 1–2 styles and never touch the variable axes — works but doesn't *speak*.
- **eBay Market Sans** — engineered for reading dense product titles/prices at small sizes, not just hero copy.
- **Etsy Graphik** — humanist sans, 500–700 weights, negative tracking on display — handcrafted warmth.
- **Sotheby's** — Mercury Display (contemporary serif) for titles/headlines — elegance, heritage, luxury.

### How ThryftVerse currently applies it
ThryftVerse uses **Inter** across the board (`Inter_300Light` → `Inter_800ExtraBold`). Inter is a screen-optimized, systematic, neo-grotesque/humanist sans — an excellent, safe, premium-adjacent choice (used by Linear, Stripe, many flagship SaaS). The type scale (`designTokens.ts`) is well-constructed: display 32/38/700, title 24/32/700, subtitle 17/24/600, body 14/20/400, with negative letter-spacing on display sizes (-0.5 to -0.6) and a dedicated price scale (`priceList` 20/24/700, `priceLarge` 28/32/700). This is correct hierarchy infrastructure.

**Gaps vs the research:**
1. **No serif accent.** The research strongly associates serifs with perceived quality/trust/luxury (Cotford +13% relevance, Sotheby's Mercury, Etsy's editorial warmth). A purely-sans system reads as "tech/SaaS," not "curated fashion marketplace." A serif used *only* for display/editorial moments (campaign titles, empty-state headlines, auction lot titles) would add the luxury signal without compromising UI legibility.
2. **Inter is geometrically clean** — it reads as modern/precise but slightly clinical. The humanist warmth that boosts trust (FS Jack study) comes from calligraphic roots. Inter has some humanist features but is more neo-grotesque.
3. **38% of visitors abandon sites with poor typography** — the system is good, but per-screen type discipline (max 3 sizes, 1 eyebrow per first viewport per AGENTS §4) is the load-bearing constraint.

### What a flagship implementation looks like
- **Keep Inter for UI/body** — it's the right system font for dense small-size reading (titles, prices, metadata).
- **Introduce a serif for editorial/display moments only** — auction lot titles, campaign heroes, empty-state headlines, profile names on premium surfaces. This is the single highest-impact typography move for "curated luxury" perception. Candidate: a contemporary serif with fashion-publishing DNA (Cotford-class, Mercury-class, or New York — Apple's serif companion).
- **One weight delta for hierarchy** — 700→600 is enough; avoid 5 competing weights in one viewport.
- **Tabular figures for all prices/financial quantities** (already noted in tokens via `Numeric`).
- **Negative tracking on display** (already done: -0.5 to -0.6) — keep.
- **Max 3 type sizes + 1 eyebrow in the first viewport** (AGENTS §4 text budget).

### Sources
- https://doi.org/10.1080/00140139.2025.2541255 (cognitive/perceptual science of typeface choice)
- https://journals.uc.edu/index.php/vl/article/view/8184 (perception of qualities in typefaces, 34 studies/229 qualities)
- https://shaunwallace.org/files/Readability__TOCHI.pdf (individuated reading, font affects WPM 35%, line spacing 1.5)
- https://blakecrosley.com/blog/sf-pro-typography-system (SF Pro variable axes, Dynamic Type)
- https://www.ikagency.com/graphic-design-typography/typography-for-designers/ (serif +18% credibility, 1.25–1.5 type scales)
- https://www.prnewswire.com/news-releases/monotype-study-shows-typeface-choice-can-boost-positive-consumer-response-by-up-to-13-301553725.html (Cotford +13% relevance, FS Jack +12% confidence)
- https://www.creativebloq.com/design/fonts-typography/the-psychology-of-fonts-how-fonts-make-you-feel
- https://lettertypestudio.com/what-makes-a-font-look-premium-a-designers-breakdown/ (proportions, spacing, optical correction, character without overdesign)
- https://fontfyi.com/blog/choosing-fonts-for-brand/ (Didone = premium, geometric = tech, humanist = trust)

---

## 7. Anti-AI Design Psychology

### The psychological principle
Users can tell when UI is AI-generated — and they don't like it. The reaction is a UI **uncanny valley**: the screen is *almost* right but feels off. The feeling communicates something unintentional: **"nobody made a decision here."** This triggers:
- **Low trust** — a generic interface signals a generic/disposable product.
- **Lack of identity** — nothing says who built this or why; it could be anyone's app.
- **Uncanny familiarity** — they've seen this layout before, on a different product, in a different industry. Recognition creates distance, not comfort.

This isn't new — WordPress themes (2012), Bootstrap sites (2015), Webflow templates (2020) each produced floods of "visually competent but indistinguishable" products that users learned to equate with low effort. AI-generated UI is the latest, fastest wave.

**The core problem is missing intent**, not surface quirks. The surface tells (gradients, emoji, oversized radii, soft shadows) are symptoms; the disease is **the absence of human judgment baked into every design decision.** AI samples the *most probable continuation* of its training corpus — "typicality bias" pulls toward the centre of the corpus. With no disambiguating input, the most-typical modern web UI is shadcn-on-Tailwind in a B2B SaaS layout. That's what you get.

### The specific tells (the "signs of AI design")
1. **Ultra-conventional layout** — top navbar, centered hero + CTA, grid of cards, key metrics. "I think I saw it before."
2. **Generic visual identity** — default sans-serif with oversized headings; heavy gradients (neon for "innovative," pastel for everything else); soft shadows/glow; oversized rounded corners; stock 3D illustrations. Visually polished but emotionally forgettable.
3. **Statistically-safe color** — `from-indigo-500 to-purple-600`; blue-to-purple accent band. No reasoning behind it.
4. **`rounded-2xl` / `rounded-full` everywhere** — learned as "risk-free, friendly." No decision about whether *every* button should be that radius.
5. **Emoji as approachability variable** — "more emoji = friendlier = better," no judgment about the audience.
6. **Adjective collapse** — prompting "modern, clean, minimal, premium" collapses to the same default because the model has no counter-signal.
7. **No conditionality** — real design has conditional logic ("if this is a high-tier seller, show X; else Y"). AI defaults to one happy-path layout for all states.
8. **No type system / no design tokens** — ad-hoc font sizes, arbitrary radii, inconsistent spacing. No single source of truth.
9. **Symmetry-by-default** — everything centered, every section the same height, every gap identical. Real surfaces have intentional asymmetry.
10. **Label-everything disease** — eyebrow + title + subtitle + caption + badge on every row.
11. **Stateless UI** — only the happy path. No loading/empty/error/partial/offline.

### How flagship apps apply it (i.e., how they *avoid* the tells)
Every reference benchmark (Instagram, Pinterest, eBay, Snapchat, Linear, Things, Arc, Cash App, Stripe) was authored by senior designers who made **specific, defensible decisions**: one accent color reserved for primary action (Linear); varied card heights for asymmetry (Pinterest); the object *is* the label (Instagram); full state machine (Stripe); one radius/stroke/icon grammar per surface (Things). They show **restraint** — less but meaning more.

### How ThryftVerse currently applies it
ThryftVerse's AGENTS §4 is an explicit, codified anti-AI design policy — this is rare and strong. The token system enforces one radius grammar, one stroke grammar, one icon family, one motion language, one type scale. The anti-AI tells are named and prohibited: generic dashboard silhouette, symmetry-by-default, decorative chrome, label-everything, duplicate headings, placeholder media, over-scaffolded code, inconsistent primitives, stateless UI, verbose copy, excessive motion. The thumbnail test and squint test are mandatory. The fail-closed trust-signal policy prevents fabricated badges.

**Where the risk lives:** tokens don't enforce composition. A screen can consume all the right tokens and still be a generic dashboard silhouette (equal-weight cards, identical gaps, no dominant object). The tells most likely to slip through:
- **Label-everything** on listing/seller cards (eyebrow + title + subtitle + price + badge + caption).
- **Symmetry-by-default** on profile/settings screens.
- **Stateless UI** — happy path only, missing loading/empty/error/offline.
- **Verbose explanatory copy** ("Welcome back! Here you can manage…").
- **Card-on-card** composition (nested grey surfaces without distinct state boundaries).

### What a flagship implementation looks like
- **Composition first** — decide dominant object, reading order, breathing room before any token.
- **Restraint** — remove the eyebrow, the subtitle, the duplicate label, the decorative badge. The object is the label.
- **One system** — one radius grammar, one stroke grammar, one icon family, one press feedback, one motion language per surface (already in tokens; enforce per-screen).
- **Real media is the color** — photography anchors discovery/profile/commerce, not grey cards with labels.
- **Full state coverage** — loading/empty/error/partial/offline/populated all designed.
- **Conditional logic** — surfaces adapt to seller tier, auction state, trust evidence (fail-closed).
- **Self-critique** — thumbnail test + squint test before claiming done.
- **A serif accent + warm-editorial palette** counters the "default sans + blue-purple" AI tell with a specific, defensible brand decision.

### Sources
- https://uxplanet.org/how-to-spot-ai-generated-design-697aaabe76c8 (ultra-conventional layout, generic visual identity, gradient/emoji/radius tells)
- https://antigravitylab.net/en/articles/ai-tools/ai-generated-ui-why-it-feels-off (missing intent is the core problem; type systems/tokens/conditional logic carry intentionality)
- https://tasteprofile.io/blog/why-ai-generated-ui-looks-generic (typicality bias, training-data gravity, adjective collapse, shadcn-on-Tailwind default)
- https://dev.to/olehvolos/users-can-tell-when-your-ui-was-ai-generated-and-they-dont-like-it-33kn (low trust, lack of identity, uncanny familiarity; WordPress/Bootstrap/Webflow precedent)
- https://github.com/febbhav/signs-of-ai-design (field guide to AI-design tells)

---

## 8. Auction Psychology

### The psychological principle
Auctions produce **auction fever** — elevated emotional arousal that drives overbidding — through distinct triggers online vs. live:

- **Competitive arousal** — visible bid count, watcher count, and countdown timer recreate the pressure of a live room. Anonymity *intensifies* rivalry (faceless opponent = projectable abstraction of opposition).
- **Quasi-endowment effect** — the moment a bidder is temporarily outbid, the item's *perceived value rises* (not falls). Being the high bidder creates pseudo-ownership; losing it feels like loss, so bidders overbid to reclaim.
- **Opponent effect** — the presence/scale of competition inflates valuations non-normatively.
- **Time pressure** — structured by platform timers; forces decisions under deadline, accelerates purchase decisions, increases purchase likelihood, induces FOMO.
- **Sniping** — last-second bidding is a rational response to incremental bidders and to concealing private signals in common-values settings. ~54% of sniping in independent-private-value auctions is *behavioral* (response to irrational incremental bidders); the rest is rational information concealment. Fixed-deadline auctions (eBay) produce far more sniping than auto-extending auctions (Amazon).

**Countdown timers and manipulation:** deceptive timers (that restart or continue after zero) are perceived as manipulative, immoral, unethical — they induce FOMO but make consumers *averse* to the offer and the site. **Honesty is non-negotiable**: a timer must reflect a real deadline.

### How flagship apps apply it
- **eBay**: visible bid count, watcher count, countdown timer, outbid notifications, "Urgency" signals on the View-Item page (A/B-tested, statistically optimized placements). Fixed-deadline format drives sniping engagement. Signals are *honest* — the timer is real.
- **Sotheby's** (Your Majesty case study): a "gallery of stories" — premium digital catalog, immersive per-lot storytelling, tangibility via art-forward presentation. Bidding is integrated but the *experience* is editorial/luxury, not gamified.
- **Christie's** (nventive/betayee): mobile-first browsing without leaving the current page (critical during live auctions where timing matters); larger images + info in one column close to active bid CTAs; best-in-class luxury e-commerce elements (immersive imagery, subtle animations) without compromising usability. Search redesigned with e-commerce conventions for faster bid/transact on the same page.

### How ThryftVerse currently applies it
ThryftVerse supports auctions (bidding, countdown, watch). The motion contract includes `urgency` spring (damping 14, stiffness 220 — tight, lively) and "countdown colour interpolation at genuine threshold changes" (AGENTS §17 encouraged). The fail-closed policy (AGENTS §11) prevents fabricated urgency. The risk areas:
1. **Honesty of countdown** — must be server-synced, never client-faked, never restart-after-zero (the deceptive-timer research is clear: users detect and punish this).
2. **Urgency vs. manipulation line** — visible watcher/bid counts and a real countdown are legitimate competitive-arousal cues; fake "X people are watching" or a timer that resets is dark pattern territory.
3. **Quasi-endowment** — the outbid notification is the highest-leverage moment. Being outbid should *immediately* notify and make re-bidding frictionless (one tap), because the bidder's perceived value just rose.
4. **Sniping affordance** — if ThryftVerse uses fixed-deadline, expect sniping; the UI must handle last-second bids gracefully (no dead chevrons, no "submission failed" at T-1s).

### What a flagship implementation looks like
- **Honest, server-synced countdown** — color interpolation only at *genuine* threshold changes (e.g., <1hr → amber, <10min → urgency accent), never decorative pulsing.
- **Competitive arousal cues** — real bid count, real watcher count (fail-closed: null = no render). No fabricated social pressure.
- **Outbid = highest-leverage moment** — instant push notification + one-tap re-bid; the quasi-endowment effect means the user is *most* motivated right after being outbid.
- **Editorial lot presentation** (Sotheby's/Christie's lesson) — auction lots get immersive imagery + story, not a generic product card. The lot *is* the catalog.
- **Mobile-first live bidding** (Christie's lesson) — browse the full auction without leaving the current page; bid CTA close to image + info; no slow return-to-listing during live auctions.
- **Auction-end format decision** — fixed-deadline drives sniping/engagement but can frustrate; auto-extend reduces sniping but feels fairer. Choose deliberately and document.
- **No deceptive timers** — the single most important trust rule. A timer that lies destroys trust permanently.

### Sources
- https://neurolaunch.com/psychology-of-auctions/ (competitive arousal, quasi-endowment, opponent effect, live vs online)
- https://people.duke.edu/~dandan/webfiles/PapersPI/Auction%20Fever.pdf (quasi-endowment + opponent effect → overbidding, sniping)
- https://gunesacar.net/assets/CHI-EA-23-Time-is-Ticking-Deceptive-Countdown-Timers.pdf (deceptive timers perceived as manipulative/immoral)
- https://arxiv.org/pdf/2510.01198 (eBay View-Item page signals: Urgency + Conversational placements, A/B tested)
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4579307 (sniping via reference-dependent utility, pseudo-endowment)
- https://ideas.repec.org/a/eee/jeborg/v236y2025ics0167268125002380.html (sniping: 54% behavioral, common-values rational component)
- https://ideas.repec.org/a/eee/gamebe/v55y2006i2p297-320.html (fixed-deadline vs auto-extend; eBay vs Amazon sniping)
- https://yourmajesty.co/work/sothebys (Sotheby's: gallery of stories, premium digital catalog)
- https://www.betayee.com/christies (Christie's: mobile-first browsing, bid CTA close to image/info)
- https://nventive.com/en/case-studies/mobile-auction-app-christies/ (Christie's mobile: SwiftUI, immersive imagery, smooth engagement)

---

## 9. Social Commerce Psychology

### The psychological principle
Social commerce merges social interactivity with e-commerce — social cues and connections guide behavior. Trust forms through a novel dimension called **social credibility**: customers assess a seller's credibility through *perceived homophily with the reviewers, followers, and customers who contribute to the seller's reputation* — not just the seller themselves. It's "are people like me vouching for this person?"

Key mechanisms (S-O-R framework):
- **Social interaction** — bidirectional chat, comments, likes. Reduces information asymmetry, enhances engagement, fosters community.
- **Social recommendation** — peer endorsements + algorithmic suggestions. The *strongest* influence on the relationship-to-trust pathway.
- **Social support** — emotional/informational assistance from other users or influencers.

**User-generated content** (reviews, comments, images, videos) is perceived as more authentic and trustworthy than firm-generated communication; it reduces uncertainty and risk during decision-making. UGC influences decisions through mediating mechanisms: trust, satisfaction, perceived value, social presence, community identification.

**Dominant trust cues** (Facebook Marketplace field study, 10,000 interactions): mutual friends (43.7%) and peer reviews (42.1%) are the cues users most employ. **Seller responsiveness** is a critical determinant of successful exchanges across all stages.

### How flagship apps apply it
- **Vinted**: in-app messaging connects buyer/seller; reviews + ratings + buyer protection; reporting/blocking for safety. Photography leads; seller profiles carry ratings.
- **Depop**: social-profile-first (seller as a person with a shop, followers, reviews); DMs as the negotiation/relationship channel; social-proof via follower counts and reviews.
- **Etsy**: maker identity (shop name, profile, "about" story) + reviews; the seller is a *person*, not a row.
- **Instagram shopping**: social credibility via followers/likes/comments; UGC as the primary trust engine.

### How ThryftVerse currently applies it
ThryftVerse has chat, seller profiles, reviews/ratings, and trust signals. The `social` (`#9A6B7A`) and `discovery` (`#B85566`) accents exist for category/contextual use. The fail-closed policy (AGENTS §11) ensures reviews/ratings/verified tiers are backend-evidenced. The risk is **presenting social proof as decoration rather than relationship**: a star rating + review count badge is generic; *who* the reviewers are (homophily) and *whether the seller feels like a person* (profile, responsiveness, followers) are the actual trust drivers. The research says social recommendation is the *strongest* trust pathway — so surfacing peer endorsements (not just aggregate scores) is high-leverage.

### What a flagship implementation looks like
- **Seller as a person** — avatar, handle, member-since, response-rate, follower count, a line of bio. Grouped tightly so the seller reads as a human, not a badge stack.
- **Social credibility, not just aggregate scores** — surface *who* reviews (verified buyer, repeat buyer, similar-size buyer) alongside the star count. Homophily is the trust engine.
- **Seller responsiveness as a first-class signal** — response-time displayed on listings/profiles (it's a critical success determinant).
- **In-app chat as a relationship channel** — messaging should feel native (WhatsApp 2026 fully-rounded `Radius.chat` 20pt is already in tokens); chat builds the guanxi/relationship that drives purchase intention.
- **UGC over firm copy** — let buyer photos/reviews carry trust; firm-generated copy recedes.
- **Community identification** — small signals that the user belongs to a community (shared interests, follows, saved searches) increase engagement.
- **Fail-closed**: no review without a backend row, no rating without a real transaction, no "verified" without a tier.

### Sources
- https://doi.org/10.1086/716068 (social credibility: homophily with reviewers/followers/customers)
- https://www.mdpi.com/2071-1050/18/3/1601 (UGC systematic review: trust, authenticity, perceived risk, engagement, loyalty)
- https://doi.org/10.1109/icdabi67967.2025.11547409 (Facebook Marketplace: mutual friends 43.7%, peer reviews 42.1%, seller responsiveness critical)
- https://doi.org/10.35678/2539-5645.0.6(55).2025.185-192 (S-O-R: social recommendation strongest on trust pathway)
- https://www.sciencedirect.com/science/article/abs/pii/S1567422324000152 (review quality + responsiveness build trust; trust disposition moderates)
- https://vp0.com/blogs/vinted-clone-ui-react-native (Vinted pattern: photo-first, seller ratings, buyer protection, messaging + reporting/blocking)

---

## 10. First Viewport Psychology

### The psychological principle
The **3-second rule**: if a product doesn't earn its user in three seconds, it's lost them. The decision is *reflexive*, not logical — users instinctively sort what feels useful from what feels like noise. The first viewport captures **~57% of total viewing time**; the second viewport drops to ~17%. What sits up top sets expectations for whether the rest is worth the scroll.

The first viewport must answer three questions instantly:
1. **"What is this?"** — headline/orientation. One sentence, no jargon. If they can't tell in 3 seconds, they leave.
2. **"Is this for me?"** — relevance/value signal. Speak to their need, not your solution.
3. **"What do I do next?"** — visible, specific, low-friction primary action.

**Time-to-value is the top-10% mobile app differentiator** (App Annie/Sensor Tower): the best apps surface core value in the first interaction. They don't teach — they let users *do*. Duolingo gives you a quiz; TikTok gives you content; Uber asks where you're going.

**Above-the-fold failures** most common in audits:
- Hero images consuming 80–90% of mobile viewport, pushing CTA/value-prop off-screen.
- Value proposition absent from the first viewport → nothing stops a bounce.
- Trust signals positioned below sections that push them off-screen.
- Carousels with too-small-to-read content on mobile.

**Fold Score** = (Conversion Elements Visible / Total Elements Visible) × Clarity Weight. Optimize the ratio of goal-supporting elements to total visual elements, weighted by 5-second clarity.

### How flagship apps apply it
- **TikTok**: content is the first viewport — no onboarding, no options, just video. Time-to-value ≈ 0.
- **Uber**: one input ("where to?") — the core job is actionable in the first interaction.
- **Instagram**: feed media dominates the first viewport; chrome recedes.
- **eBay search**: results + filters visible immediately; no marketing wall.
- **Pinterest**: masonry of media objects visible instantly; the value (visual discovery) is the first viewport.

### How ThryftVerse currently applies it
AGENTS §4 encodes the first-viewport discipline directly: "Useful first viewport — the most important content and actions visible without scrolling"; density target (4–6 useful rows or 2+ media objects above fold); text budget (max 3 type sizes + 1 eyebrow); surface budget (one dominant non-media panel above fold); media storytelling (real media is the primary anchor on discovery/profile/commerce). The thumbnail test and squint test enforce it. The risk is **per-screen drift**: a screen that consumes the right tokens can still waste the first viewport on a hero banner, a centered logo, a verbose welcome, or a stack of filters that pushes the actual content below the fold.

### What a flagship implementation looks like
- **First viewport = the value**, not a marketing wall. On discovery: media objects visible immediately. On search: results + filter affordance, not a hero. On a listing: hero image + price + primary action. On a profile: avatar + name + key stats + primary action.
- **Answer the 3 questions in 3 seconds**: what is this / is this for me / what do I do next.
- **Max 3 type sizes + 1 eyebrow** above the fold (AGENTS §4 text budget).
- **One dominant non-media panel** above the fold (AGENTS §4 surface budget) — don't wrap every row/filter/section in a separate grey surface.
- **Trust signals visible without scrolling** on commerce surfaces — but grouped, not scattered.
- **Hero image height ≤ ~55–60vh** on mobile so CTA/value remain visible (Shopify mobile UX guidance).
- **Skeletons resemble final layout** (AGENTS §14) so the first viewport doesn't shift on load — loading-state geometry must match final geometry.
- **No carousel-only first viewport** — carousels with tiny content fail on mobile.
- **Squint test**: media/identity/content dominate; nav/utility chrome recedes.

### Sources
- https://heightmag.com/your-app-has-3-seconds-to-matter-use-them-right/ (3-second rule, time-to-value, top-10% apps)
- https://www.metricuno.com/above-the-fold-ux (first viewport = 57% of viewing time; Fold Score)
- https://getcolabs.com/insights/above-the-fold (5-second test; 3 questions; 6 must-have elements)
- https://www.uxitt.com/shopify-ux/shopify-mobile-ux (mobile 390px first viewport; hero ≤55–60vh; common above-the-fold failures)
- https://developers.google.com/speed/docs/insights/mobile (render above-the-fold <1s; 700ms budget after latency)

---

## Cross-Cutting Synthesis for ThryftVerse

| Topic | ThryftVerse strength | Highest-impact gap |
|---|---|---|
| 1. Visual hierarchy | Type scale + weight deltas correct | Per-screen composition: enforce dominant object + thumbnail test |
| 2. Trust | Fail-closed policy + warm-editorial palette | Group trust signals (avoid badge stack); seller-as-person |
| 3. Friction/flow | Motion contract preserves flow | Calibrate friction to stakes: review screen on money surfaces |
| 4. Motion | Tier system already flagship-caliber | Velocity transfer on gesture-driven springs (avoid web-like feel) |
| 5. Color | Luxury-editorial restraint, content-is-color | Dedicated auction-urgency accent (distinct from error red); dark-mode trust on money surfaces |
| 6. Typography | Inter + tight type scale | **Serif accent for editorial/display moments** (single biggest "curated luxury" lever) |
| 7. Anti-AI | Codified policy + token system | Enforce composition per-screen; full state coverage; avoid label-everything/card-on-card |
| 8. Auction | Urgency spring + honest-countdown policy | Outbid = instant one-tap re-bid (quasi-endowment peak); editorial lot presentation |
| 9. Social commerce | Chat + profiles + fail-closed reviews | Social credibility (who reviews, not just score); seller responsiveness first-class |
| 10. First viewport | AGENTS §4 encodes the discipline | Per-screen drift: enforce value-first, no marketing wall, hero ≤60vh |

**The three highest-leverage moves for "feels human-authored, not AI-generated":**
1. **Introduce a serif for editorial/display moments** — counters the "default sans + blue-purple" AI tell with a specific, defensible brand decision and adds the +9–13% perceived quality/trust the research associates with serifs in fashion/luxury contexts.
2. **Enforce composition per-screen (thumbnail + squint test)** — tokens don't prevent generic dashboard silhouettes; only composition discipline does. One dominant object, intentional asymmetry, real media as the anchor.
3. **Calibrate friction to stakes + make outbid the peak moment** — money surfaces get a review step (positive friction builds trust); outbid triggers instant one-tap re-bid (quasi-endowment is the highest-motivation moment in auctions).
