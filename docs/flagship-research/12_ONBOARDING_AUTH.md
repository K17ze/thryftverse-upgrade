# 12 — Onboarding & Auth: Flagship Research Report

**Department:** Onboarding, auth landing, login, signup, forgot password, age verification, success screen, syndicate onboarding, personalisation
**Date:** August 2026
**Scope:** First-run gate → value-prop slides → auth landing → signup/login → age verification → personalisation → success
**Charter references:** AGENTS.md §3 (case study), §4 (push to maximum quality), §11 (truthful UI), §27 (2026 flagship UX psychology)

---

## 1. 2026 Competitor Benchmark — Instagram & Snapchat Onboarding

The two most-studied first-run flows in 2026 are Instagram and Snapchat. Both have evolved away from "explain the app" toward "get the user to value with the least cognitive cost." The patterns below are drawn from live iOS captures (Page Flows, Mobbin, Lazyweb — updated February 2026) and 2026 conversion research.

### Instagram — progressive, single-action, identity-led

Instagram's 2026 onboarding is a 34-screen sequence built on one principle: **one action per screen, one obvious primary control**. The flow is:

```
Start → Sign up → Country → Phone → Verify → Name → Password → Birthday → Username → Friends → Photo → Notifications → Home
```

Key 2026 patterns:

- **No value-prop carousel.** Instagram does not waste the first 30 seconds explaining what Instagram is. The brand wordmark is the value proposition; the user already knows why they are there. The first screen is "giant brand, two obvious actions, no clutter" (Swipefile analysis).
- **Single-action screens.** Each step asks for exactly one input. Country is a picker. Phone is one field. Name is one field. This is the progressive-disclosure pattern Heyflow's 2026 data validates: three-field forms convert at 10.1%, nine-field forms drop to 3.6% — a 64% decline.
- **Identity before capability.** Instagram collects identity (phone, name, birthday, username, photo) before it asks for any capability grant (contacts, photos, notifications). This is value-before-ask: the user has invested in their own profile before the app asks for system permissions.
- **Permission requests are contextual and explained.** Android's 2026 onboarding guidance is explicit: "Show the value of the app before asking for device permissions." Instagram follows this — contacts and photo access are requested only after the user has a profile and has seen the feed.
- **Frictionless auth.** Sign in with Apple/Google sits alongside email. The primary CTA is visually dominant; social is secondary but first-class.

### Snapchat — experience over checklist, playful, avatar-led

Snapchat's 2026 onboarding (14 steps, updated February 2026) treats onboarding as an experience, not a checklist (Manikanta Putta, LinkedIn 2026-06):

- **One action per screen** — same as Instagram.
- **Playful brand personality** — the avatar builder is the emotional peak; the user creates something of themselves before they reach the feed.
- **Smart error prevention** — username conflicts are caught inline, not on submit.
- **Automated friend discovery** — contacts sync reduces the cold-start problem.
- **User control with skip options** — every step is skippable; the user never feels trapped.

The 2026 industry consensus (scandiweb, Raze, UX Magazine) is sharp: **onboarding is not the start of the product experience — it is the moment the brain decides whether the product deserves attention, trust, and commitment.** 77% of users stop using an app within three days; only 8.4% completed onboarding within 30 days in Q2 2025. Good onboarding can lift retention by up to 50%. The job is one thing: **get a new user to first value as fast as possible.**

### What this means for ThryftVerse

ThryftVerse is a fashion marketplace with fractional ownership (Co-Own), live auctions, and sustainability positioning. Unlike Instagram, the value proposition is **not** universally known — "co-own a fraction of a luxury bag" is a concept most users have not encountered. This means ThryftVerse **does** need value-prop slides, unlike Instagram. But it must follow the Snapchat principle: treat onboarding as an experience that removes friction, not a lecture that explains features.

---

## 2. Psychology & Principles

### 2.1 First impression — the 30-second verdict

UX Magazine's 2026 research is unambiguous: users judge the product before they understand it. Emotional impression forms in 0.2 seconds; cognitive impression in 3 seconds; stay-or-leave decision in 10–30 seconds. The primacy effect means first experiences are disproportionately influential — a smooth first moment anchors "this app is simple," while one moment of uncertainty anchors "this is confusing" or "this is risky."

For ThryftVerse, the first screen the user sees is **AgeVerification** (the gate), then **Onboarding** (the slides), then **AuthLanding**. All three must feel "edited, stable, and deliberate" (AGENTS.md §27.1). The current age gate says "Get started" — a generic label that tells the user nothing about where they are. The onboarding slides use icon panels and body copy that feel like a generic explainer, not a crafted brand moment.

### 2.2 Commitment escalation

The principle (Heyflow 2026): distribute asks across multiple screens with one question per view, so users commit incrementally rather than facing the full burden upfront. Each small commitment creates a micro-investment that makes the next step feel cheaper. This is why Instagram asks for country, then phone, then name — not all at once.

ThryftVerse's current `SignUpScreen` asks for username, email, and password on one screen. That is three fields — acceptable by the 3-field benchmark — but the username is asked before the user understands what a username is *for* in ThryftVerse (is it a display name? a handle? a login credential?). The commitment escalation is violated because the user is asked to invent an identity before they have seen the product.

### 2.3 Value-before-ask

Microsoft Design's 2026 research: "When onboarding leads with setup, users are asked to invest before they've seen what the agent can do. The fix isn't eliminating the setup — it's reordering it. Show a useful result first, then ask for context." Android's 2026 onboarding guidance states the same: "Show the value of the app before asking for device permissions or to create an account. Always follow the value proposition with the action."

ThryftVerse's current order is: AgeVerification → Onboarding (value slides) → AuthLanding → SignUp → MainTabs. The value slides come before the auth ask — this is correct. But the slides themselves are weak (see §3). And after signup, the user lands on MainTabs with no personalisation prompt — the value-before-ask chain breaks at the moment of highest intent.

### 2.4 The "I belong here" feeling

Snapchat's avatar builder and Instagram's "find friends" step are not functional necessities — they are identity rituals. They make the user feel that this app is *theirs*. ThryftVerse's closest equivalent is `PersonalisationScreen` (gender filter, categories, brands, members) — but it is buried in settings, not surfaced in first-run. The user never gets the "this is my wardrobe" moment during onboarding.

### 2.5 Cognitive ease

AGENTS.md §27.1: "Easy-to-process interfaces feel premium. Reduce visual noise, maintain clear hierarchy, use consistent patterns. Generous whitespace signals confidence." The current `AuthLandingScreen` violates this with a `glassCard` wrapping the secondary button (card-on-card), a `socialDivider` with uppercase tracked text, and a `devBypassBtn` that is visible in dev builds. The first viewport has at least four distinct visual surfaces competing for attention.

### 2.6 Trust at the door

AGENTS.md §27.7: trust is a critical necessity. The auth landing is the door. The current screen has trust signals ("Buyer protection", "Make offers", "Co-Own trading") but they are rendered as a flat row of 18pt icons with dots between them — they read as decoration, not as credible proof. 2026 research (Landra) is explicit: "Most brands treat social proof like optional garnish. It isn't. It's one of the few things that can reduce skepticism fast, especially on mobile where users make fast judgments." The trust signals need to be **proof**, not **claims** — real seller counts, real transaction volume, real buyer-protection policy links.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### 3.1 AgeVerificationScreen — truthful but generic

**File:** `frontend/src/screens/AgeVerificationScreen.tsx`

The age gate is **truthful** — it uses `secureStorage` (hardware-backed Keychain/Keystore), the `AppNavigator` genuinely checks `isAgeVerified`, and the under-18 path shows an honest denial screen. This respects AGENTS.md §11. However:

- **Title is "Get started"** (line 137) — a generic label that does not communicate brand identity or context. The user sees a storefront icon, "Get started," and a subtitle about being 18+. There is no brand wordmark, no value hint.
- **"I am 18 or older" / "I am under 18"** (lines 147, 158) — a self-declaration checkbox. Per the UK Online Safety Act and EU DSA Article 28 (2026), self-declaration is increasingly **insufficient** for "highly effective age assurance." Ofcom has issued six- and seven-figure fines for apps that rely on a checkbox. Apple's Declared Age Range API (iOS 26.2) is now available as one signal. The current gate is honest about what it is, but the *label* "I am 18 or older" implies a verification that is not occurring.
- **Under-18 path on iOS** — `handleCloseApp` no-ops on iOS (line 118) because `BackHandler.exitApp` does nothing. The user is shown "Close app" but tapping it does nothing. This is a truthful-UI violation (§11): the control does not perform the represented action.
- **No data-protection transparency** — ICO 2026 guidance requires being "clear, open and honest about how you use people's information for age assurance." The screen stores a boolean in SecureStore but never tells the user this.

### 3.2 OnboardingScreen — weak value-prop slides, icon-panel composition

**File:** `frontend/src/screens/OnboardingScreen.tsx`

- **Four slides, all icon + title + body** (lines 53–78). The slides are: "Discover unique pieces," "Co-Own what you love," "Bid on live auctions," "Sell sustainably." The copy is competent but generic — "Browse curated fashion from independent sellers and creators. Every piece is hand-listed — no mass-market noise, just the good stuff." This reads as AI-slop marketing copy, not as a crafted brand voice. There is no quantified proof, no social proof, no real imagery.
- **Icon panels are the dominant visual** (lines 218–225) — a 56pt Ionicon inside a tinted rounded square. Per AGENTS.md §4, "Generic grey placeholder cards never become the dominant first-viewport story" and "real media must be the primary colour and visual anchor." The onboarding has **zero real media** — no product imagery, no seller photos, no auction moments. The entire visual story is four outline icons. This is the core defect: the first impression of ThryftVerse is four grey-tinted icon boxes.
- **No social proof** — no seller count, no transaction count, no ratings, no real user quotes. 2026 research (Landra, Waveup) is explicit that proof points reduce skepticism. The slides claim "Co-Own" and "auctions" but show no evidence these features are real or active.
- **No progressive disclosure** — the slides are a linear carousel. There is no interactive element, no choice, no personalisation. The user is a passive reader. Snapchat and Instagram both make the user *do* something within the first few screens.
- **Skip and Back are present** — this is good (commitment anxiety reduction, §27.1). The step eyebrow "01 / 04" is good. The animated dots are good. These are the strongest parts of the screen.

### 3.3 AuthLandingScreen — card-on-card, glass card, dev bypass

**File:** `frontend/src/screens/AuthLandingScreen.tsx`

- **Card-on-card composition** (lines 318–329) — the secondary "i already have an account" button is wrapped in a `glassCard` (a surface with border and background) which sits inside the footer. This is a §4 violation: "No card-on-card composition. A nested surface requires a distinct interaction or state boundary. Otherwise flatten it." The glass card has no distinct interaction — it is a styled wrapper around a button.
- **"entry 01" eyebrow** (line 228) — an unexplained label at the top. It is not a brand wordmark, not a step indicator, not a value prop. It is decorative chrome that violates the text budget (§4: "The first viewport normally uses no more than three type sizes and one eyebrow"). This is a second eyebrow competing with the trust row.
- **Trust signals are claims, not proof** (lines 252–271) — "Buyer protection", "Make offers", "Co-Own trading" with 18pt outline icons and dots. These are feature labels, not trust evidence. There is no link to the buyer-protection policy, no seller count, no transaction volume.
- **Dev bypass button** (lines 384–431) — visible in `__DEV__` builds. It is a green-tinted button labeled "Dev Bypass (UI Testing)" that logs in as `marie@seed.test`. This is acceptable for development but must never ship to production. It is currently gated by `__DEV__` — correct — but it adds visual noise to the auth landing in dev builds.
- **Social auth is correctly placed** — Apple first, Google second, below the email path. This is the right hierarchy. The `hasGoogleOAuth` guard (line 54) is good — it prevents a crash when OAuth is not configured.
- **Magic link handling** (lines 68–119) — real, working, with error states. This is a strong part of the screen.
- **Terms text** (line 381) — "by continuing, you agree to our terms of service and privacy policy." — lowercase, no links. This is a claim with no actionable destination. Per §11, the control should navigate to the actual documents or be removed.

### 3.4 LoginScreen — feature-rich but dense

**File:** `frontend/src/screens/LoginScreen.tsx`

- **Three auth methods on one screen** — password, OTP, magic link. This is feature-rich and functionally correct. But the visual hierarchy is flat: the primary "Log In" button, the "Send OTP to Email" button, the "Send Magic Link Instead" button, and the OTP verification group all sit in the same form column with similar visual weight. The user cannot tell which path is recommended.
- **2FA challenge is inline** (lines 350–392) — good, with recovery code fallback. This is a strong pattern.
- **Trust reassurance** (lines 309–316) — "Your login is encrypted and secure" with a 13pt lock icon. This is a claim, not proof. It is also redundant — the lock icon and text add visual noise without adding trust.
- **"or" divider** (lines 429–433) — separates password from OTP/magic link. But the OTP and magic link buttons are both below the divider with no further separation. The divider implies a binary split that does not match the three-option reality.

### 3.5 SignUpScreen — three fields, no progressive disclosure

**File:** `frontend/src/screens/SignUpScreen.tsx`

- **Username, email, password on one screen** (lines 173–223) — three fields is within the 2026 benchmark. But username is asked first, before the user understands what it is for. There is no inline availability check — the user discovers conflicts only on submit.
- **Password strength indicator** (lines 228–254) — good, real-time, behavioral feedback. This is a flagship pattern.
- **"Join the movement." title** (line 167) — a line break in the title for stylistic effect. The subtitle "Create your account to discover, buy, sell, and co-own unique pieces." is competent but generic.
- **No social signup** — the AuthLanding has Apple/Google, but SignUp does not. A user who taps "create account" and lands on a form, with no social option, has a higher-friction path than the landing implied.
- **No terms links** (line 259) — "By signing up, you agree to our Terms of Service and Privacy Policy." — same defect as AuthLanding: claim with no destination.

### 3.6 ForgotPasswordScreen — clean but minimal

**File:** `frontend/src/screens/ForgotPasswordScreen.tsx`

- **Functionally correct** — sends a real reset link via `requestPasswordReset`, shows a success state with the email address. This is truthful.
- **Success state is minimal** (lines 79–92) — an icon, text, and a "Return to Login" button. No guidance on what to do if the email does not arrive, no "resend" option, no spam-folder hint. The success state is honest but incomplete.
- **"Reset Password" title with line break** (line 76) — `Reset{'\n'}Password` — a stylistic break that feels designed rather than authored.

### 3.7 SuccessScreen — fabricated timeline, real order data

**File:** `frontend/src/screens/SuccessScreen.tsx`

- **Real order fetching** (lines 41–62) — `getOrder(orderId)` is a real API call. The order card shows real listing image, title, seller, and amount. This is truthful.
- **Timeline is fabricated** (lines 121–153) — "Order placed" (complete), "Seller prepares item" (active), "Item shipped", "Delivered." The `isComplete` and `isActive` states are **hardcoded**, not derived from order status. The timeline shows "Seller prepares item" as active regardless of the actual order state. This is a §11 violation: the UI fabricates activity and tracking state. The detail text "Usually within 1-2 business days" and "You'll get tracking updates in chat" are claims about a system that may not exist.
- **Confetti** (line 81) — decorative celebration. Acceptable for a payment success moment, but gated by reduced motion — good.
- **"Payment Successful" title** (line 90) — accurate. The subtitle adapts to loading/error/success states — good.

### 3.8 SyndicateOnboardingScreen — educational but static

**File:** `frontend/src/screens/SyndicateOnboardingScreen.tsx`

- **Four Co-Own-specific slides** (lines 18–39) — "Own a piece of something desirable," "Buy units at your own pace," "Sell when you are ready," "Trust and protection." The copy is more specific than the main onboarding — it mentions GBP, TVUSD, 1% fee, liquidity risk. This is better.
- **Checklist on first slide** (lines 116–130) — "What you'll learn" with three items. This is a good pattern — it sets expectations.
- **No real media** — same defect as main onboarding: icon rings, no product imagery. A fractional ownership onboarding that never shows a real co-owned item is missing its strongest proof.
- **"Co-Own investing" badge** (line 108) — a labeled badge. Acceptable, but it is a claim not a proof point.
- **Close button is a bordered square** (lines 71–80) — a 44pt+ button with border and background. Per §4, ordinary Close controls "default to transparent 44pt targets." The visible chrome is unnecessary.

### 3.9 PersonalisationScreen — settings-only, not first-run

**File:** `frontend/src/screens/PersonalisationScreen.tsx`

- **Functionally correct** — gender filter, categories/sizes, brands, members, with a reset action and a "Saved" badge. The `BottomSheetPicker` is a good native pattern.
- **Not in the first-run flow** — this screen is reachable from settings, not from onboarding. The user's first personalisation moment is the default feed, not a guided preference selection. This breaks the value-before-ask chain: the user reaches the feed with no personalisation, sees a generic discovery surface, and has to find settings to customize.
- **"Saved" badge is always visible** (lines 144, 175–178) — a green checkmark with "Saved" text in the header and a "Saved" badge on the hero card. This is a fabricated persistence signal — it shows "Saved" even before the user changes anything. Per §11, this fabricates persistence state.

---

## 4. Micro Improvements

These are targeted fixes that do not change the onboarding architecture:

1. **AgeVerification: replace "Get started" with brand wordmark + value hint.** The title should be "ThryftVerse" (or the wordmark) with a subtitle "A marketplace for fashion, auctions, and co-ownership. 18+ only." This gives the first screen a brand identity instead of a generic label.

2. **AgeVerification: make the iOS "Close app" control truthful.** On iOS, `BackHandler.exitApp` no-ops. Either remove the button on iOS and show "You can close the app" text, or use `Linking.openSettings` to offer an alternative. Do not show a button that does nothing (§11).

3. **AgeVerification: add data-transparency microcopy.** "We store only your 18+ confirmation on this device, not your date of birth." This meets ICO 2026 transparency expectations.

4. **Onboarding: replace icon panels with real media.** Each slide should feature a real product image, auction moment, or co-owned item as the dominant visual. The icon becomes a small accent, not the anchor. This is the single highest-impact visual fix.

5. **Onboarding: add quantified proof to each slide.** "Discover unique pieces" → "12,000+ hand-listed items from 3,400 independent sellers." "Co-Own what you love" → "£2.1M in fractional units traded." Use real numbers from the backend, not fabricated ones. If the numbers are not available, do not fabricate — use a softer claim ("from independent sellers and creators") without a count.

6. **AuthLanding: flatten the glass card.** Remove the `glassCard` wrapper around the secondary button. The secondary button should be a transparent pressable with a text label, sitting below the primary CTA with spacing alone as the separator.

7. **AuthLanding: remove "entry 01" eyebrow.** It is unexplained decorative chrome. The brand wordmark "THRYFT" and the subtitle "buy, sell, trade. no noise." are sufficient.

8. **AuthLanding: make trust signals into proof.** Replace the flat icon row with a single line of real social proof: "3,400 sellers · 12,000 items · Buyer protection on every purchase" with the protection text linking to the policy.

9. **AuthLanding: make terms text navigable.** "Terms of Service" and "Privacy Policy" should be tappable links (or inline navigations to a legal screen), not dead text.

10. **Login: clarify the auth-method hierarchy.** Make "Log In" the visually dominant primary. Demote OTP and magic link to a secondary "More options" expandable or a smaller secondary button row. The current flat column of three equally-weighted buttons is ambiguous.

11. **SignUp: add inline username availability check.** Debounce-check the username against the backend as the user types, showing a checkmark or "taken" state inline. This prevents submit-time rejection and matches Snapchat's error-prevention pattern.

12. **SignUp: add social signup options.** If the user came from "create account," offer Apple/Google at the top of the form, same as AuthLanding. Do not force email-only signup after the landing implied social was available.

13. **ForgotPassword: enrich the success state.** Add "Didn't receive it? Check spam or resend" with a resend action. Add a spam-folder hint. The current success state is honest but leaves the user stranded if the email does not arrive.

14. **SuccessScreen: derive timeline state from order status.** Replace the hardcoded `isComplete`/`isActive` with values derived from `order.status`. If the order is "paid," only "Order placed" is complete. If the order is "shipped," "Item shipped" is complete. Do not fabricate "Seller prepares item" as active when the backend has not confirmed it.

15. **SyndicateOnboarding: add real co-owned item imagery.** Show a real fractional item (e.g., a luxury bag with unit price and units sold) on the first slide. This is the proof that Co-Own is real.

16. **SyndicateOnboarding: flatten the Close button.** Remove the border and background from the Close control. Make it a transparent 44pt target with a 22pt glyph (§4).

17. **Personalisation: remove the always-on "Saved" badge.** Show "Saved" only after the user changes a preference. On first view, show no badge or a neutral "All preferences apply" state.

---

## 5. Macro Improvements — Onboarding Architecture

### 5.1 Reorder the first-run chain for value-before-ask

**Current chain:**
```
AgeVerification → Onboarding (value slides) → AuthLanding → SignUp → MainTabs (no personalisation)
```

**Proposed flagship chain:**
```
AgeVerification → Onboarding (value + media + proof) → AuthLanding → SignUp → Personalisation (first-run) → MainTabs
```

The personalisation step should be a **first-run moment**, not a settings page. After signup, the user has maximum intent and minimum investment — this is the moment to ask "what are you shopping for?" with a tappable gender/category grid. The current `PersonalisationScreen` already has the right components (`AudiencePreferenceGrid`, `DiscoveryPreferenceRow`); it needs a first-run variant that skips the "Saved" badge and frames the step as "Make it yours" rather than "Personalisation settings."

### 5.2 Value-prop system — media-led, proof-anchored

The onboarding slides must shift from **icon + copy** to **media + proof + copy**. Each slide should be:

```
[ Real product image — full-width, art-directed ] → [ Headline (8-10 words) ] → [ Proof point (real number) ] → [ Body (1 sentence) ]
```

This follows the Waveup 2026 value-proposition framework: an 8–10-word headline with a quantified benefit, one proof point, and a named audience. The media is the anchor; the copy is the explanation. This is the opposite of the current layout where the icon panel is the anchor and the copy is the story.

If real numbers are not available from the backend, the slides should use **honest qualitative proof** — a real seller quote, a real listing screenshot — rather than fabricated metrics. Per §11, no fabricated data.

### 5.3 Auth friction — passkey-first, progressive

The 2026 auth pattern (FIDO Alliance, Android Credential Manager, Authsignal) is **passkey-first with fallback**:

1. **Identifier-first** — the signup/login form starts with an email field only. No password field on the first view.
2. **Passkey offer** — after entering email, offer "Continue with passkey" (biometric) as the primary path. Fall back to password or magic link if passkey is unavailable.
3. **Passkey creation during signup** — after the first successful signup, offer to create a passkey so the user never needs a password again.
4. **Magic link as fallback** — the current magic link flow is already correct and should remain as the passwordless fallback.

This is a significant architecture change. It requires backend WebAuthn support. If the backend does not support passkeys yet, the immediate fix is to **present the auth methods in a clear hierarchy** (password primary, OTP/magic link secondary) rather than adding passkey. But the target architecture is passkey-first.

### 5.4 Age verification truthfulness

The current self-declaration gate is honest about what it is, but the label "I am 18 or older" implies a verification that is not occurring. The 2026 regulatory landscape (UK Online Safety Act, EU DSA Article 28, EU Commission Recommendation 2026/1035) is moving toward "highly effective age assurance" that rules out checkboxes.

**Short-term (no backend change):** Relabel the button to be truthful: "Confirm I am 18 or older" with a subtitle "We do not verify your age — you are confirming it yourself. ThryftVerse is a marketplace for adults." This is honest about the self-declaration nature.

**Medium-term:** Integrate Apple's Declared Age Range API (iOS 26.2) as one signal. This does not collect a birth date — it requests an age bracket from the device. On Android, use `Credential Manager` signals where available.

**Long-term:** Integrate a third-party age-assurance provider for higher-risk features (Co-Own investing, auctions above a threshold). The gate can be tiered: self-declaration for browsing, stronger assurance for transacting.

### 5.5 Success screen — truthful timeline

The success screen timeline must be driven by real order state. The `TimelineStep` components should accept `status` derived from `order.fulfilmentStatus` (or equivalent backend field). If the backend does not expose a fulfilment status, the timeline should show only the steps that are confirmed:

```
✓ Order placed (confirmed by payment)
○ Seller prepares item (pending — we've notified the seller)
- Item shipped (not yet)
- Delivered (not yet)
```

The "Seller prepares item" step should not be `isActive` (brand-colored, implying it is happening now) unless the backend has confirmed the seller has accepted the order. If the backend has no seller-acceptance signal, the step should be `pending` (muted, "waiting for seller confirmation").

---

## 6. Flagship Acceptance Criteria

The onboarding and auth flow is flagship when:

1. **AgeVerification** shows a brand wordmark, a truthful self-declaration label, data-transparency microcopy, and a working close/deny path on both iOS and Android.
2. **Onboarding** uses real product media as the dominant visual on every slide, with quantified or qualitative proof points (no fabricated numbers), and a clear step indicator with Skip and Back.
3. **AuthLanding** has no card-on-card composition, no unexplained eyebrow, trust signals that link to real policies, and terms text that is navigable.
4. **Login** has a clear visual hierarchy: password primary, OTP/magic link secondary, 2FA inline with recovery fallback.
5. **SignUp** has inline username availability, social signup options, password strength feedback, and navigable terms links.
6. **ForgotPassword** has an enriched success state with resend and spam guidance.
7. **SuccessScreen** derives timeline state from real order status — no hardcoded `isComplete`/`isActive`.
8. **SyndicateOnboarding** uses real co-owned item imagery, has a transparent Close control, and specific risk-disclosure copy.
9. **Personalisation** is surfaced as a first-run step after signup, with no fabricated "Saved" badge on first view.
10. **No fabricated success, data, or persistence** anywhere in the flow (§11).
11. **First viewport** of every screen passes the thumbnail test and squint test (§4): media/identity/content dominates, chrome recedes.
12. **Reduced motion** is respected on every animated transition.
13. **Accessibility**: every control has a label, every state is announced, every touch target is ≥44pt, and screen-reader order follows visual order.

---

## 7. Priority & Sequencing

### Phase 1 — Truthfulness & visual anchors (highest impact, no architecture change)

| Priority | Change | File | Effort |
|----------|--------|------|--------|
| P0 | SuccessScreen: derive timeline from real order status | `SuccessScreen.tsx` | Low |
| P0 | AgeVerification: fix iOS "Close app" no-op | `AgeVerificationScreen.tsx` | Low |
| P0 | Personalisation: remove always-on "Saved" badge | `PersonalisationScreen.tsx` | Low |
| P1 | Onboarding: replace icon panels with real media | `OnboardingScreen.tsx` | Medium |
| P1 | AuthLanding: flatten glass card, remove "entry 01" | `AuthLandingScreen.tsx` | Low |
| P1 | AuthLanding: make trust signals navigable proof | `AuthLandingScreen.tsx` | Medium |
| P1 | SyndicateOnboarding: transparent Close, real media | `SyndicateOnboardingScreen.tsx` | Medium |

### Phase 2 — Hierarchy & friction reduction

| Priority | Change | File | Effort |
|----------|--------|------|--------|
| P2 | Login: clarify auth-method hierarchy | `LoginScreen.tsx` | Medium |
| P2 | SignUp: inline username availability | `SignUpScreen.tsx` + backend | Medium |
| P2 | SignUp: add social signup options | `SignUpScreen.tsx` | Low |
| P2 | ForgotPassword: enriched success state | `ForgotPasswordScreen.tsx` | Low |
| P2 | Terms text: make navigable on AuthLanding + SignUp | both files | Low |

### Phase 3 — Architecture (requires backend or platform work)

| Priority | Change | Files | Effort |
|----------|--------|-------|--------|
| P3 | Personalisation as first-run step after signup | `PersonalisationScreen.tsx`, navigation | Medium |
| P3 | AgeVerification: Apple Declared Age Range API | `AgeVerificationScreen.tsx` | Medium |
| P3 | Passkey-first auth (identifier-first + passkey offer) | `LoginScreen.tsx`, `SignUpScreen.tsx`, `authApi.ts`, backend | High |
| P3 | Tiered age assurance for Co-Own/auctions | `AgeVerificationScreen.tsx`, backend, third-party provider | High |

### Sequencing rationale

Phase 1 is truthfulness and visual anchors — it fixes §11 violations and the weakest first-impression surfaces. Every item is achievable without backend changes. Phase 2 improves hierarchy and reduces friction within the existing architecture. Phase 3 is the strategic architecture shift (passkeys, first-run personalisation, tiered age assurance) that requires backend or platform integration and should be planned as a cross-layer effort per AGENTS.md §2.

The single highest-impact change is **P1: Onboarding real media**. The first impression of ThryftVerse is currently four icon boxes. Replacing them with real product imagery transforms the first 30 seconds from "generic explainer" to "curated marketplace." This is the change that will be obvious at thumbnail size (§22).
