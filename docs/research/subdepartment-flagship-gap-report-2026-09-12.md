# ThryftVerse Sub-Department Flagship Gap Report

**Compiled:** 2026-09-12
**Method:** 6 parallel research tracks — 4 live-online competitor/psychology tracks (Instagram, Pinterest, Snapchat, marketplace commerce) + 1 psychology-of-quality track + 1 full codebase sub-department inventory. ~190 cited sources across all tracks; every source report carries per-claim evidence classes.
**Scope:** SUB-DEPARTMENTS ONLY — secondary/deeper screens, sheets, forms, management surfaces, state objects. Main screens (Home feed, Discover masonry, Item detail) were already audited in `flagship-uiux-upgrade-report-2026-09-11.md`.
**Source reports:**
- `.flagship/research/instagram-subdepartments.md` (~60 sources)
- `.flagship/research/pinterest-subdepartments.md` (~40 sources)
- `.flagship/research/snapchat-subdepartments.md` (52 sources)
- `.flagship/research/marketplace-subdepartments.md` (~40 sources)
- `.flagship/research/flagship-psychology.md` (38 sources)
- `.flagship/research/codebase-subdepartment-inventory.md` (166 screens, ~40 sheets cataloged)

**Evidence discipline:** claims are tagged SOURCE-VERIFIED (code inspected), SECONDARY ANALYSIS, PRIMARY DOC, COMMUNITY REPORT, or INFERENCE in the source reports. Nothing below is presented as live-verified device evidence — rendered/native review remains pending.

---

## 1. Executive summary

**The headline finding is structural, not cosmetic.** The codebase inventory graded ~166 shippable screens: **~12 FLAGSHIP · ~138 COMPETENT · ~12 PROTOTYPE · 0 whole-screen AI-SLOP**. The Sept-11 truthfulness debt (fake data, demo paths, TODO leaks) is largely paid down. What remains is a *grammar and lifecycle* gap concentrated in exactly the places this report scopes — the sub-departments:

1. **Monolithic kitchen-sink screens violate the 400-line orchestrator charter.** 16 screens exceed 1,400 LOC. The three highest-stakes surfaces — `CheckoutScreen` (2,482 LOC), `ChatScreen` (2,203 LOC), and the listing funnel (`SellScreen` + `EditListingScreen` + `AIPoweredListingScreen`, ~4,500 LOC combined) — are pre-flagship grammar on money-critical flows.

2. **~55 screens have zero `components/flagship` imports.** The design system's strongest primitives never reach most sub-departments. `SellerHubScreen` + `components/seller/*` is the proven template (412-LOC orchestrator, per-resource status machines, inline retry) — convergence, not invention, is the fix.

3. **The flagship apps' real sub-department advantage is *state objects*, not styling.** Instagram's graduated moderation ladder, Pinterest's boards-as-recommendation-engines, Snapchat's per-relationship privacy graph, Vinted's label-in-thread + dispatch deadline machine, eBay's offer state machine — none of these are visual flourishes. They are *lifecycle objects with honest state machines* rendered compactly. ThryftVerse's sub-departments mostly render data; the benchmarks render *state over time*.

4. **Psychology thresholds are measurable and mostly unmet.** Press feedback must land in 30–85 ms (visual) / 5–50 ms (haptic) to fuse as one causal event; skeletons beat spinners by converting unknown wait into preview (48% rated an identical 5 s skeleton load "fast"); 19% of checkout abandonment traces to card-distrust fixed by payment-field visual encapsulation. These are auditable numbers, not taste.

**What this means:** ThryftVerse's next flagship increment is not "prettier sub-screens." It is (a) decomposing the monoliths into domain-factored orchestrators, (b) giving commerce and social objects real state machines (offers, orders, saves, mutes, retention), and (c) importing the specific benchmark mechanics cataloged below — each with measurable acceptance criteria.

---

## 2. The 15 weakest sub-department surfaces (codebase evidence)

Ranked by user-impact × quality-gap, from `codebase-subdepartment-inventory.md`:

| # | Surface | File | Grade | Core defect |
|---|---------|------|-------|-------------|
| 1 | Checkout | `frontend/src/screens/CheckoutScreen.tsx` | PROTOTYPE-risk | 2,482-LOC monolith; zero flagship primitives; highest-stakes money surface |
| 2 | Chat | `frontend/src/screens/ChatScreen.tsx` | COMPETENT-monolith | 2,203-LOC orchestrator; commerce-critical; pre-flagship screen grammar |
| 3 | Listing funnel | `SellScreen.tsx` + `EditListingScreen.tsx` + `AIPoweredListingScreen.tsx` | PROTOTYPE | ~4,500 LOC combined; core creation funnel on pre-flagship grammar |
| 4 | Support conversation | `SupportConversationScreen.tsx:572` | defect | Dead "Attach file" button (`onPress={() => {}}` with a11y label promising attach) — fake affordance on a trust surface |
| 5 | Item detail | `ItemDetailScreen.tsx` | COMPETENT-monolith | 2,039 LOC; no flagship imports (partially remediated in earlier wave) |
| 6 | Live stream viewer | `LiveStreamViewerScreen.tsx:900,1007` | defect | A11y-lie pressables — non-actionable sheet containers announced as buttons |
| 7 | Your Algorithm | `YourAlgorithmScreen.tsx:358` | defect | Same a11y-lie pattern |
| 8 | Invite friends | `InviteFriendsScreen.tsx` | defect | Referral code derived client-side from user ID — needs backend-verified code |
| 9 | Create auction / Payments | `CreateAuctionScreen.tsx`, `PaymentsScreen.tsx` | defect | Residual hardcoded hex values bypassing theme tokens |
| 10–15 | ~55 screens | various | COMPETENT | Zero `components/flagship` imports; inconsistent primitive adoption |

**Already-good, do-not-touch template:** `SellerHubScreen` + `components/seller/*` — the convergence target.

---

## 3. What the benchmarks have that we lack

Synthesized from the four competitor tracks. Each pattern lists the mechanism, the psychology, and what ThryftVerse has today.

### 3.1 Commerce lifecycle objects (the largest gap)

| Benchmark pattern | Mechanism | ThryftVerse today | Gap severity |
|---|---|---|---|
| **Offer state machine as first-class object** (eBay/Depop) | Offers have Pending → Accepted/Declined/Expired/Countered states, 24h expiry, binding terms ("if accepted you're charged"), visible in a dedicated Inbox tab, parallel counters first-accept-wins | Offers exist but lack the inbox-visible state machine, expiry salience, and parallel-counter atomicity | **P0** |
| **Seller auto-accept/auto-decline floors** (eBay, Depop auto-respond <60 s) | Two numbers turn negotiation into a rule engine; comments bypass auto-accept to manual review | No seller automation thresholds | **P1** |
| **Structural lowball guardrails** (Vinted ≤40% below list; Poshmark 10%-deeper-than-last-90-days) | Protects seller sentiment without killing the feature | No server-enforced cap | **P1** |
| **Prepaid label delivered into the order thread** (Vinted) | Seller never visits a carrier site; wrong carrier → auto-cancel | Seller handles shipping off-platform | **P0** |
| **Dispatch deadline machine** (Vinted 5-day; Whatnot 2-day scan rate) | Auto-cancel on miss; buyer-approved extension negotiated in-product; "I confirm I've sent" survives carrier scan lag | No enforced deadline mechanics | **P0** |
| **Buyer confirmation window** (Vinted 2-day "Everything is OK" / "I have an issue"; silence auto-completes) | Escrow release is a held button the buyer feels they control | No visible escrow/confirmation window | **P0** |
| **Fee-inclusive price upstream** (Vinted/Depop) | Buyer-protection fee pre-computed into listing-page breakdown → checkout total matches expectation | Fee surfaces improved in Wave A but upstream parity needs verification on listing cards | **P1** |
| **Wallet balance auto-applied** (Vinted/StockX) | Balance silently deducted with a "remove" affordance — kills a "choose funding source" step | Wallet exists; auto-apply at checkout unverified | **P1** |
| **Account health scoring for sellers** (Whatnot: On-Time Scan Rate, Defect-Free Order Rate) | Seller-facing operational radar with consequences, not vanity stats | SellerHub has metrics; consequence-coupled health score absent | **P1** |
| **Private price channels** (Vinted/Poshmark seller-initiated offers to likers) | Buyer-specific price invisible to everyone else; preserves list price | No seller-initiated private offers | **P2** |

### 3.2 Messaging as a mutual contract (Snapchat mechanics)

| Benchmark pattern | Mechanism | ThryftVerse today | Gap severity |
|---|---|---|---|
| **Two-way state legibility** | Saving a message turns it grey *for both parties*; deletes leave tombstones; retention changes post in-chat notices; screenshots notify | Message lifecycle fields propagate (Wave C) but mutual state display is partial | **P1** |
| **Per-relationship privacy graph** | Silent mutes (stories/chats/calls), block-vs-remove distinction, per-friend exclusion — none notify the other party | Block exists; silent mute and per-relationship granularity absent | **P1** |
| **Typing/read state grammar** | Snapchat's chat states (delivered/opened/typing/saving) are a continuous grammar, not a binary | Read receipts added in Inbox wave; typing indicators and per-message state chips thin | **P1** |
| **Temporal privacy** | Ghost Mode timers (3h/24h/indefinite), consent decay, "still sharing?" check-ins | N/A pattern — transferable to seller away-status and share-expiry | **P2** |
| **Object-anchored messaging** (Pinterest) | Reply threads bind to the shared pin/listing itself; the object carries context into chat | Commerce cards in chat exist; thread-object binding weak | **P1** |

### 3.3 Save/collection systems (Pinterest + Instagram)

| Benchmark pattern | Mechanism | ThryftVerse today | Gap severity |
|---|---|---|---|
| **Two-tier save gesture** (Instagram) | Tap = save, hold = file-into-collection; toast teaches the second gesture | Save is single-action; no hold-to-file | **P1** |
| **Inline collection creation inside the save sheet** (Pinterest/Instagram) | Create-board inline, suggested names, covers-as-visual-index | Collection/board system exists; inline create-in-save-flow unverified | **P1** |
| **Boards as recommendation engines** (Pinterest `More ideas`/`Shop`/`Make it yours`, Oct-2025 refresh) | Every saved collection becomes a personalized surface, not a folder | Boards are storage; no board-scoped recommendations | **P2** |
| **Entry-point budgeting lesson** (Instagram's mistake) | Instagram buried Saved behind ☰ and was criticized for it — saved/collections must be one tap from profile | Verify Saved/Collections entry depth | **P2** |

### 3.4 Settings, notifications & control (Instagram + Pinterest)

| Benchmark pattern | Mechanism | ThryftVerse today | Gap severity |
|---|---|---|---|
| **Searchable settings as canonical nav** (Instagram) | IA is shuffled so often that the help ecosystem says "type the setting name" — settings search is first-class | Settings screens exist; no settings search | **P1** |
| **Notification quality = ranked batching** (Meta NEP diversity demotion; Pinterest ML-batched channel/timing) | Repetitive notifications demoted; item-level clustering ("X and 12 others liked"); chronological opt-out toggle | Notification surfaces exist; clustering/diversity demotion absent | **P1** |
| **Granular feed tuning with attribution** (Pinterest) | Per-topic/per-item/per-category controls; "why this item" attribution; persistence is the trust bar (silent-failing controls breed *more* distrust) | Your Algorithm screen exists (Wave C wired real directives); per-item attribution and persistence verification needed | **P1** |
| **Graduated moderation ladder** (Instagram Restrict/Limits) | Silent middle rungs between filter and block: Restrict (silent), Limits (time-boxed, spike-triggered) — prevents harassment escalation between transacting strangers | Block only; no silent/time-boxed middle | **P1** |

### 3.5 Social identity sub-departments

| Benchmark pattern | Mechanism | ThryftVerse today | Gap severity |
|---|---|---|---|
| **Friendship-profile equivalent** (Snapchat) | Each relationship is a visitable object — shared media, earned markers, per-relationship identity snapshot | UserProfile exists; relationship-scoped surfaces absent | **P2** |
| **Three-tier engagement ladder** (Instagram private story likes) | save/react → emoji → message — zero-commitment response tier prevents DM-forced engagement suppression | Like/save/comment exist; the zero-artifact reaction tier thin | **P2** |
| **Social-awareness monetization** (Snapchat+ Peek/Story-view notifications/Solar System) | Paid layer sells who's paying attention to you, per-perk toggle cards, sensitive perks default-off | Not applicable yet — premium tier doesn't exist | P3 |

---

## 4. The flagship signatures (psychology thresholds to audit against)

From `flagship-psychology.md` — the measurable bar every sub-department upgrade must hit:

| # | Signature | Threshold | Evidence |
|---|-----------|-----------|----------|
| 1 | First-impression window | Aesthetic judgment stabilizes in **50 ms** — first paint must arrive already-composed | Lindgaard; NN/g |
| 2 | Causality ceiling | **<100 ms** response reads as user-caused | Nielsen response limits |
| 3 | Visual press feedback | **30–85 ms** to fuse with touch | ACM TAP 2014 |
| 4 | Haptic confirmation | **5–50 ms**; preferred causal band **100–200 ms** (instant isn't always better) | Perceptual & Motor Skills |
| 5 | Pressed scale | **0.95–0.98** (≤0.95 cartoonish, ≥0.99 imperceptible) | iOS system feel |
| 6 | Loading indicator ladder | <100 ms none · 100ms–1s response-only · >1 s skeleton · >10 s percent-done | Nielsen limits |
| 7 | Skeleton = preview | Skeletons convert unknown wait into content shape; **48%** rated identical 5 s skeleton "fast"; blank worst | IHC 2025 RCT |
| 8 | Skeleton parity | Skeleton must match final geometry ~1:1 or it reads as a second glitch | M3 |
| 9 | Springs are platform default | iOS WWDC23 + M3 Expressive replaced easing with physics — velocity-preserving interruption is what reads "native" | Apple/Material |
| 10 | Motion = spatial model | Card→detail shared-element continuity answers "is this the same item?" without re-orientation tax | M3 container transform |
| 11 | Exit < enter | Enter ~250–400 ms, exit ~200 ms, cross-fades <200 ms | M3 durations |
| 12 | Viewport density | ~4–6 useful rows per list viewport; ≥2 media objects per discovery viewport | Fitts/visual-search |
| 13 | Type budget | ≤3 type sizes in first viewport; layer-cake scan on headings | NN/g eyetracking |
| 14 | One decision per screen | Stepped forms beat multi-field screens on completion and error rate | PLOS ONE; GDS |
| 15 | Front-load keywords | First 2 lines / first words get the fixations — "Order #4821 · Shipped" not "Your order information" | NN/g |
| 16 | Tabular numerals | `tnum` for prices/timers — alignment IS comprehension | typography research |
| 17 | Payment trust is visual | Encapsulating payment fields + lock + seals raises confidence on identical HTTPS form; 19% abandon on distrust | Baymard 2025 |
| 18 | Truthful uncertainty | "Saved locally, will sync" beats fake success; state + available-actions both shown offline | web.dev/Google |
| 19 | Recovery in place | Failed mutations retry *in place*, not via context-losing modal | error-recovery research |
| 20 | AI-slop fingerprint | Convergent defaults (generic cards + emoji icons + vague copy) read as "no decisions made" in the 50 ms window — fix is authored specificity: dominant object, asymmetry, one grammar | Sailop/Built In/Linear 2025-26 |

---

## 5. Gap registry — prioritized upgrade plan

Severity: **P0** = money/trust-critical or charter violation · **P1** = benchmark parity gap with clear evidence · **P2** = quality-of-life · **P3** = defer.

### Wave 1 — Commerce lifecycle objects (P0)

| ID | Gap | Implementation sketch | Acceptance criteria |
|----|-----|----------------------|---------------------|
| G01 | Checkout monolith | Decompose `CheckoutScreen` into orchestrator + `components/checkout/*` (address, delivery options w/ per-option ETA+price, payment encapsulation w/ lock+trust signals, breakdown, wallet auto-apply). Already has `PaymentStateBanner`, `PulsingDot`, `checkoutFlow` primitives — extend, don't rebuild. | <600-LOC screen file; ≤4 decisions on one screen; listing→checkout price parity 0 deltas; payment failure inline retry; express wallet ≤2 taps |
| G02 | Offer state machine | Offers as first-class objects: Pending/Accepted/Declined/Expired/Countered states, 24h expiry timestamps, binding copy pre-submit, dedicated Offers surface in Inbox, parallel counters first-accept-wins | Offer lifecycle visible in inbox; accepted offer → pre-filled checkout; expiry timestamps; atomic parallel resolution |
| G03 | Dispatch deadline + label | Seller order thread carries prepaid label + carrier choice; 5-day dispatch deadline with visible countdown; buyer-approved extension; "I confirm sent" override for scan lag | Label in-thread; deadline salience; extension is in-product negotiation; auto-cancel truthful |
| G04 | Buyer confirmation window | 2-day post-delivery "Everything is OK / I have an issue" window; silence auto-completes; escrow release legible to buyer | Confirmation card in order thread; auto-complete disclosed; dispute path in-place |

### Wave 2 — Trust & relationship infrastructure (P1)

| ID | Gap | Implementation sketch | Acceptance criteria |
|----|-----|----------------------|---------------------|
| G05 | Graduated moderation ladder | Between filter and block: silent Mute (no notification), Restrict (messages land in requests, no read receipts), time-boxed Limits during attention spikes | Mute/restrict reachable from profile + chat; no outbound notification; state visible to actor only |
| G06 | Two-way message contract | Saved-in-chat grey state for both parties; delete tombstones; screenshot notice where policy allows; per-message state chips | Both parties see identical state; no silent divergence |
| G07 | Per-relationship privacy | Silent mute seller/buyer; hide my activity per-relationship; block-vs-remove distinction | Granularity reachable from relationship surface; non-notifying |
| G08 | Chat monolith decomposition | `ChatScreen` → orchestrator + `components/chat/*` (composer, message groups, commerce cards, state chips) | <600-LOC screen; commerce cards structured; keyboard contract preserved |

### Wave 3 — Control & tuning surfaces (P1)

| ID | Gap | Implementation sketch | Acceptance criteria |
|----|-----|----------------------|---------------------|
| G09 | Searchable settings | Settings index + fuzzy search entry at top of Settings root | Any reachable setting findable by name in ≤2 taps |
| G10 | Notification batching | Item-level clustering ("X and 12 others liked"), diversity demotion, chronological opt-out toggle in settings | Clustered rows; opt-out honored; no repetitive-notification fatigue |
| G11 | Feed-tuning persistence verification | Your Algorithm directives (from Wave C) — verify every control persists and visibly affects feed; silent-failing controls are worse than none | Each control has persistence evidence + visible feed effect |
| G12 | Two-tier save + inline collection create | Tap=save, hold=file-into-collection; teaching toast; inline create inside save sheet | Hold gesture files; create-in-flow works; entry to collections ≤1 tap from profile |

### Wave 4 — Structure & grammar convergence (P1/P2)

| ID | Gap | Implementation sketch | Acceptance criteria |
|----|-----|----------------------|---------------------|
| G13 | Monolith decomposition program | 16 screens >1,400 LOC; converge on `SellerHubScreen` template — orchestrator + `components/<domain>/*` + per-resource status machines | No screen >600 LOC without documented exception; flagship primitives adopted |
| G14 | Listing funnel re-grammar | Sell/EditListing/AIPoweredListing → stepped one-decision-per-screen flow (PLOS ONE evidence) | Each step one decision; early validation; progress indicated |
| G15 | Fake affordance + a11y lies | SupportConversation dead "Attach file" (remove or implement); LiveStreamViewer/YourAlgorithm non-actionable containers announced as buttons | Zero dead interactive claims; roles match behavior |
| G16 | Residual hex/token leaks | CreateAuctionScreen, PaymentsScreen hardcoded hex → theme tokens | Token-only colors |
| G17 | Referral code backend ownership | InviteFriendsScreen derives code client-side → server-issued code | Code server-authored |

### Wave 5 — Differentiators (P2/P3, after P0/P1 land)

| ID | Gap | Implementation sketch |
|----|-----|----------------------|
| G18 | Seller account-health radar | Whatnot-style On-Time Scan / Defect-Free rates with consequences surfaced in SellerHub |
| G19 | Boards as recommendation surfaces | `More ideas`/`Shop` tabs on saved collections |
| G20 | Seller-initiated private offers | Buyer-specific pricing to likers, preserving list price |
| G21 | Object-anchored messaging | Listing-thread binding survives navigation into chat |
| G22 | Relationship-profile objects | Per-buyer/seller shared-history surfaces |
| G23 | Temporal sharing grammar | Time-boxed seller away-status; expiring shares |

---

## 6. What NOT to do (boundaries reaffirmed)

- **No masonry geometry changes** — masonry is product identity (user directive).
- **No editor/poster department changes** — separate space, already split.
- **No decorative gold/chrome** — neutral canvas canonical; quality from geometry/state/interaction.
- **No dark patterns** — the psychology research is applied for trust and clarity, not addiction/coercion (Snapchat+ "who's watching you" mechanics are P3 precisely because they monetize anxiety — only consider if they pass a user-benefit test).
- **No fabricated capabilities** — every new affordance needs a real backend contract or an honest "coming/not available" state.
- **Source-verified ≠ native-verified** — everything here still requires rendered device evidence before being called flagship-complete.

## 7. Validation requirements

Per `flagship-autopilot` convergence gates, before any sub-department upgrade is claimed done:

1. Typecheck + lint + focused tests pass.
2. Structural tests updated (real JSX composition assertions, not string-presence).
3. Fresh-context adversarial review per task.
4. Rendered evidence where tooling allows — named build/device/OS/theme/font-scale; otherwise `Visual QA: pending user review`.
5. Psychology thresholds verified in implementation (press feedback on press-in, skeleton geometry parity, spring-based interruptible motion, ≤3 type sizes in first viewport, 4–6 rows/viewport).

---

## 8. Campaign position

This report extends `flagship-uiux-upgrade-report-2026-09-11.md` (18 findings, Waves A–D — all completed and reviewed). The Wave A+B+C/D execution already delivered: commerce truth, readiness instrumentation, typography alignment, search truthfulness, reduced-motion consistency, SellerHub state/composition, media pipeline contract seam, visual search facets, recommendation control, accessibility hardening, cache propagation, and AI disclosure truthfulness.

This sub-department report defines **Wave E**: the lifecycle-object and grammar-convergence program above. Recommended execution order: Wave 1 (commerce lifecycle) → Wave 2 (trust/relationship) → Wave 3 (control surfaces) → Wave 4 (structure) → Wave 5 (differentiators), each with implementer → review → fix-loop per SDD.
