# 30 — Growth & Retention Mechanics

> **Department:** Growth Engineering, Retention Mechanics & Viral Loops
> **Benchmark date:** 2026-08-18
> **Scope:** Streaks, badges, achievements, referrals (give-get), viral loops (share-to-story, share-to-chat), re-engagement push campaigns, email re-engagement, gamification (ethical vs dark), loyalty programs, seller retention (Top Seller), buyer retention (taste profile), dormant user reactivation, the Hook Model (trigger-action-reward-investment), onboarding retention, personalisation as retention.
> **Charter references:** AGENTS.md §2 (deep system research, layer diagnosis), §4 (anti-AI-made design — "stateless UI", "truthful UI"), §6 (truthful UI — no fabricated success), §14 (state completeness); Design.md "Onboarding", "Discovery", "Profile", "Closet".
> **Primary benchmarks:** Instagram (social retention loops), Snapchat (streaks as the retention engine), eBay (Top Seller program, seller retention), Pinterest (taste profile as buyer retention), Duolingo (streak + leaderboard + freemium retention system), Temu (gamification + referral + paid growth loop). Secondary: Depop, Vinted (marketplace-specific retention), TikTok Shop Live (live shopping retention).

---

## 1. 2026 Competitor Benchmark

Growth and retention in 2026 is not a list of hacks — it is a loop. The equation is `Growth ≈ acquisition × retention × monetization × virality`, and the median app leaks the second term so badly (96% churn by day 30, under 4% retention) that no acquisition tactic can outrun it ([MWM Guides — Mobile App Growth Strategies](https://mwm.ai/guides/mobile-app-growth-strategies)). The 2026 consensus: fix retention first, then monetization, then acquisition, then virality — in that order. Scaling acquisition into a leaky bucket just raises the cost of churn.

### The 2026 growth/retention stack

| Layer | 2026 industry standard | Tooling |
|---|---|---|
| The Hook Model | Trigger (push/email) → Action (open app) → Variable Reward (content varies) → Investment (user contributes data/content) — the four-stage habit loop | Nir Eyal's framework; implemented via push + feed + UGC |
| Streaks | Daily action streak with loss aversion (breaking a streak is painful); streak repair mechanics (one free repair, paid repair); streak freezes; streak sharing | Duolingo's streak is the benchmark |
| Badges/achievements | Tiered badges tied to real accomplishments (not participation trophies); visible on profile; rarity tiers (common/rare/epic/legendary) | eBay Top Seller, Foursquare mayorships |
| Referrals (give-get) | "Give $10, get $10" — both sides benefit; tracked via referral code + deep link; attribution from install to first purchase; fraud prevention | Custom referral system + Branch/AppsFlyer attribution |
| Viral loops | Share-to-story (Instagram Stories, Snapchat), share-to-chat (WhatsApp, iMessage); shared content deep-links back to the app; every shareable object has a deep link | ShareSheet + deep links + universal links |
| Re-engagement push | Segmented by inactivity tier (3-day, 7-day, 30-day); personalized content ("New listings matching your taste"); not generic ("We miss you!") | Push + segmentation + personalization |
| Email re-engagement | Tiered: 7-day (soft nudge), 30-day (content highlight), 60-day (incentive), 90-day (last chance); unsubscribe honored | Email + segmentation |
| Gamification | Ethical: badges for real accomplishments, leaderboards for active communities, progress bars for meaningful goals. Dark: fake urgency, manipulative streaks, pay-to-win | Duolingo (ethical), Temu (borderline) |
| Loyalty programs | Tiered: Bronze → Silver → Gold → Platinum; perks increase with tier (reduced fees, priority support, exclusive drops); tier based on real activity (GMV, transactions), not just time | eBay Top Seller, Sephora Beauty Insider |
| Seller retention | Top Seller program (reduced fees, badge, priority in search); seller standards with clear thresholds; seller education; performance dashboard | eBay Top Seller |
| Buyer retention | Taste profile (personalized feed); saved searches; price drop alerts; wishlist; "items you might like" recommendations | Pinterest taste profile, eBay saved searches |
| Dormant user reactivation | Tiered reactivation: 30-day (content push), 60-day (incentive push), 90-day (email + incentive); win-back offers; "we've changed" messaging | Segmented push + email |
| Onboarding retention | Value-first onboarding (show the product, not a tutorial); taste quiz during onboarding (personalization investment); first-purchase incentive; day-1 push ("Complete your profile") | Onboarding slides + style quiz + day-1 push |

Sources: [The Viral App — Mobile App Growth Strategy 2026](https://theviralapp.com/blog/mobile-app-growth-strategy-2026/); [StriveCloud — Habit Formation & User Retention 2026](https://www.strivecloud.io/blog/habit-formation-user-retention); [MWM Guides — Mobile App Growth Strategies](https://mwm.ai/guides/mobile-app-growth-strategies); [VMobify — How Duolingo Grew](https://vmobify.com/blog/how-duolingo-grew); [Cubitrek — How Temu Used Gamification and Referrals](https://cubitrek.com/blog/how-temu-used-gamification-referral-paid-ads-to-explode-in-a-new-market).

### Duolingo — the streak retention benchmark

Duolingo's daily active users grew from ~5M in 2020 to 40M+ in 2024 — a 4.5× jump driven not by buying installs but by re-engineering retention ([VMobify — How Duolingo Grew](https://vmobify.com/blog/how-duolingo-grew)). The streak is the load-bearing mechanic: it converts a vague intention ("I want to learn a language") into a concrete, visible, daily obligation that the user is loath to break. The streak gets stronger the longer it runs — a 200-day streak is 200 days of accumulated effort the user does not want to forfeit. Streak repair mechanics (streak freeze, paid repair) ensure a single missed day doesn't collapse the whole investment. In Hook Model terms, the streak is the **investment** stage: a small daily deposit that raises the cost of leaving and loads tomorrow's trigger.

### eBay — seller retention via Top Seller

eBay's Top Seller program is the benchmark for marketplace seller retention. Sellers who maintain high feedback scores, fast shipping, and low defect rates earn the Top Seller badge (visible on listings), reduced final value fees (up to 10% discount), priority in search results, and access to promotional tools. The program creates a clear progression: new seller → established seller → Top Seller → eBay Plus seller. Each tier has transparent thresholds, so sellers know exactly what to do to advance. This is retention through **earned status**, not through dark patterns.

### Pinterest — taste profile as buyer retention

Pinterest's retention engine is the taste profile: the more a user pins, saves, and follows, the better the recommendations become. This is the **investment** stage of the Hook Model — the user invests by expressing taste, and the reward is increasingly relevant content. The key insight: personalization is a retention mechanism, not just a discovery feature. A user who has invested in their taste profile has a switching cost — starting over on a new app means re-training the algorithm from zero.

### Temu — gamification + referral growth loop

Temu went from unknown to #1 most-downloaded shopping app in the US in 14 months, crossing 200M US installs by Q1 2026 ([Cubitrek — How Temu Used Gamification](https://cubitrek.com/blog/how-temu-used-gamification-referral-paid-ads-to-explode-in-a-new-market)). The growth loop: gamification (spin-the-wheel, free gifts, timers) + referral (give-get with aggressive incentives) + paid ads. Temu's referral program offers store credit for both referrer and referee, with the credit tied to the referee's first purchase (ensuring quality installs, not just installs). The gamification is borderline — aggressive timers and "almost there" mechanics push toward dark patterns — but the referral loop is well-executed.

### Converging principles

1. **Retention first, acquisition second.** Scaling acquisition into a leaky bucket raises the cost of churn. Fix the retention curve on a small cohort before scaling acquisition ([MWM Guides](https://mwm.ai/guides/mobile-app-growth-strategies)).
2. **The Hook Model is the framework.** Trigger → Action → Variable Reward → Investment. Every retention mechanic maps to one of these four stages. A retention program that doesn't address all four stages is incomplete ([StriveCloud — Habit Formation 2026](https://www.strivecloud.io/blog/habit-formation-user-retention)).
3. **Streaks work but must be ethical.** Streak repair (don't punish a single missed day), streak freezes (one free pass), and meaningful daily actions (not arbitrary taps) are the ethical pattern. Punishing streaks that collapse on one miss drive churn, not retention.
4. **Referrals must be give-get.** One-sided referral ("invite friends for $5") underperforms two-sided ("Give $10, get $10") by 3-5×. Both sides must benefit. The reward must be tied to a quality event (first purchase, first listing), not just install.
5. **Every shareable object has a deep link.** A share that doesn't deep-link back to the app is a broken viral loop. The recipient taps the shared link, the app opens to the exact object, and the loop is complete. Without deep links, the share opens a browser and the loop breaks.
6. **Personalization is retention.** The taste profile (saved items, style quiz, followed sellers) is an investment that creates switching costs. A user who has trained their feed has a reason to stay.
7. **Day 1 retention is the cliff.** Global average Day 1 retention is 26% ([StriveCloud 2026](https://www.strivecloud.io/blog/habit-formation-user-retention)). Users who don't find value on Day 1 are statistically unlikely to return. The onboarding + day-1 experience is the single highest-leverage retention intervention.

---

## 2. Psychology & Principles

### The Hook Model (Nir Eyal)

The Hook Model is the framework for habit-forming products: **Trigger → Action → Variable Reward → Investment**.

- **Trigger:** The push notification, email, or internal cue that prompts the user to act. External triggers (push, email) bootstrap the habit; internal triggers (boredom, FOMO, the desire to check) sustain it.
- **Action:** The simplest behavior the user can take in anticipation of a reward. Opening the app, scrolling the feed, checking notifications. The action must be simple enough that the trigger-reward loop closes in seconds.
- **Variable Reward:** The reward must be variable to create compulsion. If every push delivers the same reward, the user habituates and stops responding. Variable rewards (sometimes a message, sometimes a price drop, sometimes nothing) create the same psychology as slot machines.
- **Investment:** The user contributes something (data, content, reputation, time) that increases the cost of leaving and loads the next trigger. A taste profile, a streak, a listing, a follower count — these are investments that create switching costs.

The Hook Model is ethically neutral. It can be used to build healthy habits (Duolingo's streak for daily language learning) or to exploit users (infinite scroll with variable rewards optimized for engagement at the expense of wellbeing). The distinction is whether the habit serves the user's goals or the platform's goals.

### Loss aversion and streaks

Loss aversion (Kahneman & Tversky): the pain of losing is psychologically 2× as powerful as the pleasure of gaining. A streak exploits loss aversion — the user doesn't want to lose 200 days of accumulated effort. The longer the streak, the stronger the loss aversion, and the more motivated the user is to maintain it. This is why streak repair mechanics are critical: without them, a single missed day collapses the entire investment, and the user churns ("I lost my streak, what's the point?"). With repair, the streak survives a miss, and the user returns.

### Social proof and commitment & consistency

Social proof: users look to others for cues on how to behave. A leaderboard ("You're in the top 10% of sellers this month") leverages social proof. A referral program ("Your friend invited you") leverages social proof. Commitment & consistency (Cialdini): once a user takes a small action (signs up, completes a style quiz, lists an item), they are more likely to take consistent future actions. The style quiz during onboarding is a commitment device — the user invests in their taste profile, which creates consistency pressure to use it.

### The endowment effect

The endowment effect: users value things more once they own them. A seller who has listed 10 items "owns" their seller identity and values it more than a seller who has listed 0. A buyer who has saved 50 items to their wishlist "owns" their taste profile and values it more than a buyer who has saved 0. The endowment effect creates switching costs — the user doesn't want to start over on a new app because they'd lose their accumulated identity.

### FOMO and ethical boundaries

FOMO (Fear Of Missing Out) is a powerful trigger, but it's also the boundary between ethical retention and dark patterns. "This listing ends in 1 hour" is ethical if the timer is real. "Only 2 left in stock!" is a dark pattern if the stock count is fabricated. The 2026 consensus: urgency must be truthful (per AGENTS.md §6 — no fabricated success, no fake scarcity). Timers, stock counts, and "X people are watching this" must reflect real data, not manufactured pressure.

### The distinction between healthy engagement and dark patterns

| Healthy engagement | Dark pattern |
|---|---|
| Streak with repair (one free miss) | Streak that collapses on one miss |
| Badge for real accomplishment (10 sales) | Badge for participation (signed up) |
| "Give $10, get $10" referral | "Invite 50 friends to unlock $5" |
| Real urgency (auction ends in 1h) | Fake urgency ("Only 2 left!" when stock is 200) |
| Personalized feed from real taste | Infinite scroll optimized for engagement |
| Day-1 push with relevant content | Day-1 push with generic "We miss you" |

---

## 3. Architectural Issues & Engineering Flaws

Growth/retention debt blocks production in concrete ways:

### No retention infrastructure = no sustainable growth

Without retention mechanics (streaks, personalization, re-engagement), the app is a funnel: install → use once → churn. The median app loses 96% of users by day 30 ([MWM Guides](https://mwm.ai/guides/mobile-app-growth-strategies)). No acquisition tactic can outrun a 96% churn rate — the cost of acquiring a user who churns in 3 days is always higher than the revenue they generate. Retention infrastructure is the prerequisite for sustainable growth.

### CAC vs LTV collapse

Customer Acquisition Cost (CAC) vs Lifetime Value (LTV) is the unit economics equation. Without retention, LTV is low (users churn before generating revenue). With rising ad costs (CPIs up across every channel in 2026), CAC is high. When CAC > LTV, the business loses money on every user. Retention is the lever that increases LTV — a user who stays for 12 months generates 10× the revenue of a user who stays for 1 month.

### Viral coefficient < 1 = no viral growth

The viral coefficient (k) measures how many new users each existing user brings. k = 1 means each user brings one new user (self-sustaining growth). k < 1 means the viral loop decays (each generation brings fewer users). Without a functional referral program and share-to-deep-link infrastructure, k ≈ 0 — there is no viral growth. ThryftVerse's referral program exists but the share doesn't deep-link back to the app (the shared link opens a browser, not the app), so the viral loop is broken.

### Dormant user churn

Without a dormant user reactivation pipeline (tiered push + email + incentives), users who go dormant stay dormant. A user who hasn't opened the app in 30 days has a <5% probability of returning organically. Reactivation pushes ("New listings matching your taste") can recover 5-15% of dormant users. Without reactivation, these users are permanently lost.

### Seller burnout

Marketplaces have a two-sided retention problem. Seller retention is arguably more important than buyer retention — a marketplace without sellers has no inventory, and no inventory means no buyers. Without seller retention mechanics (Top Seller program, seller dashboard, reduced fees for high performers), sellers list a few items, don't sell enough, and leave. The cold-start problem for marketplaces is fundamentally a seller retention problem.

### The cold-start problem

A new marketplace has no buyers (so sellers don't list) and no sellers (so buyers don't come). The cold-start solution is to seed one side first — typically sellers (get inventory) or buyers (get demand). ThryftVerse's style quiz and onboarding invest in the buyer side; the seller onboarding (`SyndicateOnboardingScreen.tsx`) invests in the seller side. But without retention mechanics on both sides, the seeded users churn before the two-sided market materializes.

---

## 4. AI Slop Diagnosis

AI-generated growth mechanics have predictable failure modes:

### Generic "invite friends for $5" with no tracking

AI models generate an "Invite Friends" screen with a referral code and a share button, but no backend tracking. The referral code is generated client-side (deterministic from user ID), not server-side (with attribution). There's no tracking from share → install → signup → first purchase. The referral program appears to exist but doesn't actually attribute installs to referrers or pay rewards. ThryftVerse partially has this — `InviteFriendsScreen.tsx:26-29` generates the referral code client-side (`generateReferralCode` from user ID), and the referral stats are fetched from a backend endpoint (`/users/:id/referral-stats`), but the attribution pipeline (share → install → first purchase → reward) is not visible in the codebase.

### Fake badges that don't mean anything

AI models generate badge components (Gold, Silver, Bronze) but tie them to arbitrary thresholds (3 referrals = Silver, 10 = Gold) that don't correspond to real accomplishment. A "Gold" badge for 10 referrals is a participation trophy, not an achievement. eBay's Top Seller badge requires sustained performance (high feedback, fast shipping, low defects) over a rolling period — it's a real signal of seller quality.

### Streaks that punish rather than reward

AI models generate streak counters that reset to 0 on a missed day, with no repair mechanic. This is the punitive streak pattern that drives churn. A user who loses a 30-day streak feels the loss acutely and may not return. Duolingo's streak freeze (one free miss) and paid repair are the ethical pattern.

### Share buttons that don't deep-link back

AI models generate share buttons using `Share.share({ message: '...' })` that share a text message with a URL, but the URL opens a browser, not the app. Without universal links / app links, the shared link doesn't open the app, and the viral loop is broken. ThryftVerse's `InviteFriendsScreen.tsx:90-93` uses `Share.share` with a `https://thryftverse.app/invite/${referralCode}` URL — but without `apple-app-site-association` and `assetlinks.json` hosted (per Report #27), this URL opens a browser, not the app.

### Push spam without segmentation

AI models generate re-engagement pushes that fire to all inactive users with the same generic message ("We miss you! Come back!"). This is push spam — it's not personalized, not segmented, and not contextual. The 2026 standard is tiered, segmented, personalized re-engagement: 3-day inactive → "New listings from sellers you follow"; 7-day → "Price drop on your wishlist item"; 30-day → "Your taste profile has X new matches."

---

## 5. Current ThryftVerse Audit (file:line defects)

### Referral program — `frontend/src/screens/InviteFriendsScreen.tsx`

**Strengths:**
- `InviteFriendsScreen.tsx:26-29` — deterministic referral code generation (`TV-XXXXXX` from user ID) — consistent, shareable
- `InviteFriendsScreen.tsx:50` — invite link `https://thryftverse.app/invite/${referralCode}` — structured URL
- `InviteFriendsScreen.tsx:53-78` — referral stats fetched from backend (`/users/:id/referral-stats`) with invited/joined/rewarded/creditsBalance — real metrics
- `InviteFriendsScreen.tsx:80-86` — loyalty tier (Bronze/Silver/Gold) derived from referral activity — tiered progression
- `InviteFriendsScreen.tsx:88-95` — `Share.share` with referral code + link — native share sheet
- `InviteFriendsScreen.tsx:97-105` — copy code + copy link with clipboard + toast — multiple share paths

**Defects:**
| Line (file) | Defect |
|---|---|
| `InviteFriendsScreen.tsx:26-29` | Referral code generated client-side (deterministic from user ID) — not server-side with attribution tracking. The code is predictable (anyone who knows the user ID can generate the code), which is a fraud vector. |
| `InviteFriendsScreen.tsx:50` | `https://thryftverse.app/invite/${referralCode}` — this URL opens a browser, not the app, because `apple-app-site-association` and `assetlinks.json` are not hosted (per Report #27). The viral loop is broken at the deep-link step. |
| `InviteFriendsScreen.tsx:63-76` | `.catch(() => { // Backend endpoint not available — keep zeros })` — silently fails if the backend endpoint doesn't exist. The user sees zeros for all stats, which is a truthful-UI issue (per AGENTS.md §6 — the screen should show "Stats unavailable" not fake zeros). |
| `InviteFriendsScreen.tsx:80-86` | Loyalty tier is based on `rewarded` referrals only (3 = Silver, 10 = Gold) — doesn't account for GMV, seller activity, or buyer activity. A one-dimensional tier. |
| `InviteFriendsScreen.tsx:90-93` | Share message: "Join me on Thryftverse - the premium marketplace for second-hand fashion!" — generic, not personalized. No dynamic content (no "I just sold X" or "I found Y"). |
| Missing | No give-get structure visible — the share message says "Use my code" but doesn't specify what the referee gets ("$10 off your first purchase") or what the referrer gets ("$10 credit when they sell"). |
| Missing | No referral attribution pipeline — no tracking from share → install → signup → first purchase → reward. The backend endpoint returns stats but the attribution mechanism is not visible. |
| Missing | No referral fraud prevention — no device fingerprinting, no IP check, no self-referral prevention. |

### Onboarding — `frontend/src/screens/OnboardingScreen.tsx`

**Strengths:**
- `OnboardingScreen.tsx:27-44` — `isOnboardingComplete` / `markOnboardingComplete` with AsyncStorage — onboarding state persistence
- `OnboardingScreen.tsx:46-51` — `OnboardingSlide` interface with icon, iconBackground, title, body — structured slides
- `OnboardingScreen.tsx:53-60` — slide content focuses on value ("Discover unique pieces", "Browse curated fashion") — value-first, not tutorial-first
- Reanimated transitions (`SlideInRight`, `FadeOutDown`) — animated slide transitions

**Defects:**
| Line (file) | Defect |
|---|---|
| Missing | No taste quiz integration during onboarding — the `StyleQuizScreen.tsx` exists but is not part of the onboarding flow. The style quiz is the **investment** stage of the Hook Model — the user expresses taste, which personalizes the feed and creates switching costs. Skipping it in onboarding loses the highest-leverage investment moment. |
| Missing | No day-1 push trigger — after onboarding, there's no scheduled push for day 1 ("Complete your profile" or "New listings matching your taste"). Day 1 retention is the cliff (26% global average). |
| Missing | No first-purchase incentive — no "10% off your first purchase" or "Free shipping on your first order" during onboarding. The first-purchase incentive is the highest-conversion activation lever. |

### Style quiz — `frontend/src/screens/StyleQuizScreen.tsx`

**Strengths:**
- `StyleQuizScreen.tsx:29` — 4-step quiz (Step 0-3) — bite-sized, not overwhelming
- `StyleQuizScreen.tsx:37-40` — gender options (Women, Men, Both) — personalization input
- Reanimated transitions (`FadeInRight`, `FadeInLeft`) — animated step transitions
- `useStore` integration — quiz results stored in global state

**Defects:**
| Line (file) | Defect |
|---|---|
| Missing | Not integrated into onboarding flow — the quiz exists but is a standalone screen, not part of the first-run experience. The investment moment (onboarding) is when users are most willing to answer questions. |
| Missing | No "your taste profile is ready" reveal after quiz — the quiz ends but doesn't show the user how their answers will personalize their feed. The reveal is the reward that justifies the investment. |

### Closet — `frontend/src/screens/ClosetScreen.tsx` (44KB)

**Strengths:**
- 44KB screen — substantial feature with media mosaic, board cards, and closet management
- `ClosetMediaMosaic.tsx` (12.5KB) — visual closet display
- `ClosetBoardCard.tsx` (7.5KB) — closet board cards
- The closet is a retention mechanism — it's the user's collection, which is an investment that creates switching costs (endowment effect)

**Defects:**
| Line (file) | Defect |
|---|---|
| Missing | No closet sharing — can't share the closet with friends or on social media. Sharing the closet is a viral loop (the recipient sees the collection, taps a item, deep-links to the listing). |
| Missing | No closet stats — no "X items in your closet", "Y items sold", "Z items watched". Stats are a retention signal (progress visualization). |

### Sustainability badge — `frontend/src/components/product/SustainabilityBadge.tsx`

**Strengths:**
- Truthful labeling (per AGENTS.md §11) — "Estimated impact", not "Precise measurement"
- Grade system (A/B/C/D) with CO2 and water saved estimates
- Two variants: `compact` (chip for cards) and `detailed` (breakdown card)
- Sustainability is a retention mechanism for ethically-minded buyers — it adds meaning to the purchase

### Seller standards badges — `frontend/src/components/profile/SellerStandardsBadges.tsx`

**Strengths:**
- `deriveSellerBadges` from `SellerTrustSummary` — badges derived from real seller performance data
- Multiple badge types with icons and labels
- This is the foundation of a seller retention program (eBay Top Seller pattern)

**Defects:**
| Line (file) | Defect |
|---|---|
| Missing | No visible tier progression — the badges exist but there's no "progress toward next tier" UI. The seller can see their current badges but not what they need to do to earn the next one. |
| Missing | No perks tied to badges — eBay's Top Seller comes with reduced fees and search priority. ThryftVerse's badges appear to be status-only without tangible perks. |

### Personalisation — `frontend/src/screens/PersonalisationScreen.tsx` + `ToolPersonalization.ts`

**Strengths:**
- `PersonalisationScreen.tsx` (11.8KB) — personalisation settings screen
- `ToolPersonalization.ts` (6.6KB) — personalisation logic
- `DiscoveryPreferenceRow.tsx` — discovery preference controls
- `AudiencePreferenceGrid.tsx` — audience preference grid
- Personalisation is a retention mechanism (taste profile = investment = switching cost)

### Share — `frontend/src/components/ShareSheet.tsx`

**Strengths:**
- `ShareSheet.tsx` (7.8KB) — share sheet component exists
- `SharedTransitionImage.tsx` / `SharedTransitionView.tsx` — shared element transitions for share-to-detail navigation

**Defects:**
| Line (file) | Defect |
|---|---|
| Missing | No share-to-story — can't share a listing to Instagram Stories or Snapchat. Share-to-story is the highest-conversion viral loop for visual marketplaces. |
| Missing | No share image generation — no "shareable card" image with the listing photo, price, and brand that can be shared to social media. The share is text-only via `Share.share`. |

### Activity badge — `frontend/src/components/ActivityBadge.tsx`

**Strengths:**
- `ActivityBadge.tsx` (6.2KB) — activity badge component (notification count badge)
- `vq09dInboxBadgeUnit.test.ts` — test coverage for inbox badge

### Missing growth/retention infrastructure

| Item | Status |
|---|---|
| Streaks | **Missing** — no daily action streak (e.g., "Check in daily for new listings") |
| Achievements system | **Missing** — no achievement system beyond seller badges and loyalty tier |
| Give-get referral structure | **Partial** — referral code exists but give-get structure not visible in UI |
| Referral attribution pipeline | **Missing** — no share → install → purchase → reward tracking |
| Share-to-story | **Missing** — no Instagram Stories / Snapchat share |
| Shareable card images | **Missing** — no generated share images with listing data |
| Re-engagement push campaigns | **Missing** — no tiered, segmented, personalized re-engagement pushes |
| Email re-engagement | **Missing** — no email re-engagement pipeline |
| Dormant user reactivation | **Missing** — no 30/60/90-day reactivation campaigns |
| Day-1 push trigger | **Missing** — no scheduled push after first session |
| First-purchase incentive | **Missing** — no onboarding first-purchase discount |
| Top Seller program with perks | **Missing** — seller badges exist but no fee reductions or search priority |
| Leaderboards | **Missing** — no community leaderboards (top sellers, most active buyers) |
| Progress bars | **Missing** — no "progress toward next tier" or "progress toward reward" UI |
| Loyalty program with tangible perks | **Partial** — loyalty tier exists (Bronze/Silver/Gold) but no perks visible |
| Win-back offers | **Missing** — no dormant user win-back incentives |
| Wishlist price drop alerts | **Partial** — push preferences include "priceDrops" category but need to verify the alert pipeline exists |

---

## 6. Micro Improvements (file-and-line-level)

### M1 — Integrate style quiz into onboarding

In `OnboardingScreen.tsx`, after the value slides, add a step that routes to `StyleQuizScreen` (or embeds the quiz inline). After the quiz, show a "Your taste profile is ready" reveal screen that shows how the feed will be personalized. This is the investment stage of the Hook Model during the highest-leverage moment (onboarding).

### M2 — Add day-1 push trigger

After onboarding completion (`markOnboardingComplete`), schedule a day-1 push: "New listings matching your taste profile" or "Complete your profile to get personalized recommendations." The day-1 push is the single highest-leverage retention intervention (Day 1 retention is 26% global average).

### M3 — Add first-purchase incentive

During onboarding or after the style quiz, offer a first-purchase incentive: "10% off your first purchase" or "Free shipping on your first order." Display the incentive as a banner in the feed and checkout until it's used. The first purchase is the activation event — a user who buys once is 5× more likely to return than a user who doesn't.

### M4 — Fix referral deep link

Host `apple-app-site-association` and `assetlinks.json` (per Report #27) so that `https://thryftverse.app/invite/${referralCode}` opens the app, not the browser. Add a `NavigationContainer` `linking` prop that routes `/invite/:code` to a signup screen pre-filled with the referral code. This closes the viral loop.

### M5 — Add give-get structure to referral UI

In `InviteFriendsScreen.tsx:118-120`, update the hero subtitle to explicitly state the give-get: "Give £10, get £10. When your friend makes their first sale, you both get £10 in Thryftverse credit." The explicit give-get is 3-5× more effective than a vague "invite and earn."

### M6 — Add referral attribution pipeline

Build a backend pipeline: share → unique referral link with tracking param → install → attribution (Branch or AppsFlyer) → signup with referral code → first purchase/listing → reward both sides. Without attribution, the referral program can't verify who referred whom, and rewards can't be paid reliably.

### M7 — Add share-to-story

Use `expo-sharing` or a custom native module to share listing images to Instagram Stories and Snapchat. Generate a shareable card image (listing photo + price + brand + "Available on Thryftverse" + deep link QR code) using `react-native-view-shot`. Share-to-story is the highest-conversion viral loop for visual marketplaces.

### M8 — Add shareable card images

Use `react-native-view-shot` to capture a styled card (listing image, price, brand, "Shop on Thryftverse" badge) and share it via `Share.share` with the image as an attachment. Image shares have 5-10× higher CTR than text-only shares.

### M9 — Add tiered re-engagement pushes

Build a backend pipeline for tiered re-engagement:
- **3-day inactive:** "New listings from sellers you follow" (content push)
- **7-day inactive:** "Price drop on your wishlist item" (value push)
- **14-day inactive:** "Your taste profile has X new matches" (personalization push)
- **30-day inactive:** "Come back for £10 off your next purchase" (incentive push)
- **60-day inactive:** "We miss you. Here's what's new on Thryftverse" (email + push)
- **90-day inactive:** "Last chance: your £10 credit expires in 7 days" (urgency push)

### M10 — Add Top Seller program with perks

Extend the seller standards badges (`SellerStandardsBadges.tsx`) with a tiered program:
- **Bronze Seller:** 5+ sales, 4.5+ rating → badge on listings
- **Silver Seller:** 25+ sales, 4.7+ rating, <2% defect rate → badge + 5% fee reduction + priority support
- **Gold Seller:** 100+ sales, 4.8+ rating, <1% defect rate → badge + 10% fee reduction + search priority + exclusive drops

Display "progress toward next tier" on the seller dashboard.

### M11 — Add streak mechanic for buyers

Add a "Daily Discovery" streak: open the app daily to see new listings matching your taste. The streak is shown in the feed header with a flame icon and day count. Streak repair: one free freeze per week. The streak drives daily app opens, which is the trigger for the Hook Model.

### M12 — Add wishlist price drop alerts

Verify and complete the price drop alert pipeline: when a wishlist item's price drops, send a push notification ("Price drop: Vintage Leather Jacket was £200, now £150") with a deep link to the listing. Price drop alerts are the highest-CTR push category for marketplaces.

---

## 7. Macro Improvements (structural/architectural)

### A1 — Growth as a loop, not a funnel

The root architectural shift is from funnel thinking (install → use → churn) to loop thinking (retained users monetize → revenue funds acquisition → referrals bring users who retain → loop compounds). Every growth mechanic should strengthen the loop, not just plug a funnel stage. The referral program strengthens virality; the streak strengthens retention; the taste profile strengthens investment; the re-engagement push strengthens the trigger. Together, they form a compounding loop.

### A2 — The Hook Model as the architectural framework

Map every retention mechanic to the Hook Model:
- **Trigger:** Push notifications (re-engagement, price drops, new listings), email (transactional, re-engagement)
- **Action:** Open the app, scroll the feed, check notifications, open a listing
- **Variable Reward:** Personalized feed (content varies), new listings (inventory varies), price drops (value varies), messages (social varies)
- **Investment:** Taste profile (style quiz, saved items, followed sellers), closet (owned collection), listings (seller inventory), streak (daily habit), reputation (reviews, badges)

A retention program that doesn't address all four stages is incomplete. ThryftVerse currently has partial Action and Reward (feed + listings) and partial Investment (closet + style quiz + seller badges), but weak Trigger (no day-1 push, no re-engagement campaigns) and no streak mechanic.

### A3 — Referral as a product system

The referral program is not a screen — it's a product system with attribution, fraud prevention, reward fulfillment, and analytics. The architecture:
1. **Server-side referral code generation** (not client-side deterministic) with anti-fraud checks
2. **Attribution pipeline** (share → install → signup → first action → reward) via Branch or AppsFlyer
3. **Reward fulfillment** (credit issuance, credit redemption, credit expiry)
4. **Fraud prevention** (device fingerprinting, IP check, self-referral prevention, velocity limits)
5. **Analytics** (referral rate, conversion rate, viral coefficient, fraud rate)

### A4 — Seller retention as a two-sided market necessity

Seller retention is arguably more important than buyer retention for a marketplace. The architecture:
1. **Seller dashboard** with performance metrics (GMV, sell-through rate, rating, defect rate)
2. **Tiered seller program** (Bronze → Silver → Gold) with transparent thresholds and tangible perks
3. **Seller education** (how to take better photos, how to price, how to ship fast)
4. **Seller community** (forums, leaderboards, featured sellers)
5. **Seller re-engagement** (push for dormant sellers: "You have X views on your listings")

### A5 — Personalization as the switching cost

The taste profile is the primary switching cost. The architecture:
1. **Style quiz during onboarding** (investment moment)
2. **Implicit taste signals** (saved items, viewed items, purchased items, followed sellers)
3. **Explicit taste signals** (style quiz, preferences, "not interested" feedback)
4. **Personalized feed** (ranked by taste relevance)
5. **Taste profile reveal** ("Your taste: Minimalist, Vintage, Sustainable — see how your feed is personalized")
6. **Taste profile export** (share your taste profile with friends — viral loop)

### A6 — Re-engagement as a tiered pipeline

Re-engagement is not a single push — it's a tiered pipeline with different messages, channels, and incentives at each inactivity tier. The architecture:
1. **3-day:** Content push (new listings from followed sellers)
2. **7-day:** Value push (price drop on wishlist)
3. **14-day:** Personalization push (taste profile matches)
4. **30-day:** Incentive push (£10 off)
5. **60-day:** Email + push (what's new)
6. **90-day:** Last chance push (credit expiring)

Each tier is segmented by user type (buyer vs seller), activity level (browsed vs purchased vs listed), and taste profile. Generic "we miss you" pushes are explicitly prohibited.

---

## 8. Flagship Acceptance Criteria

A flagship growth/retention system must achieve:

- **Day 1 retention >40%** (global average is 26%; flagship is 40%+)
- **Day 30 retention >15%** (median is 3.9%; flagship is 15%+)
- **Style quiz integrated into onboarding** — investment moment during highest-leverage window
- **Day-1 push trigger** — scheduled push after first session
- **First-purchase incentive** — discount or free shipping on first order
- **Give-get referral with attribution** — "Give £10, get £10" with server-side attribution pipeline
- **Referral deep link working** — shared link opens the app, not the browser
- **Share-to-story** — listing images shareable to Instagram Stories and Snapchat
- **Shareable card images** — generated image with listing data, not text-only share
- **Tiered re-engagement pushes** — 3/7/14/30/60/90-day with personalized content
- **Streak mechanic with repair** — daily discovery streak with one free freeze per week
- **Top Seller program with perks** — tiered badges with fee reductions and search priority
- **Seller dashboard** — performance metrics with progress toward next tier
- **Wishlist price drop alerts** — push on price drop with deep link to listing
- **Loyalty program with tangible perks** — not just badges, but real benefits (credits, discounts, exclusive access)
- **Personalized feed from taste profile** — implicit + explicit taste signals → ranked feed
- **Taste profile reveal** — user sees how their taste personalizes their feed
- **Dormant user reactivation pipeline** — tiered push + email + incentives
- **Viral coefficient tracked** — k measured and optimized toward 1
- **No dark patterns** — all urgency, scarcity, and streaks are truthful (per AGENTS.md §6)

### Thumbnail test

A ThryftVerse feed at 25% scale must show: personalized content (not a generic grid), a streak indicator if active, trust signals (seller badges, sustainability grade), and a clear primary action (browse, save, buy). If the feed looks like a generic marketplace grid with no personalization or retention signals, it is not done.

---

## 9. Priority & Sequencing

| Priority | Item | Why first | Risk | Unblocks |
|---|---|---|---|---|
| P0 | M1 — Integrate style quiz into onboarding | Investment moment during highest-leverage window; directly impacts Day 1 retention | Low — wire existing screen into onboarding | Day 1 retention |
| P0 | M2 — Day-1 push trigger | Day 1 retention is the cliff (26% global average); a day-1 push is the single highest-leverage intervention | Low — schedule push after onboarding | Day 1 retention |
| P0 | M4 — Fix referral deep link | Without working deep links, the viral loop is broken; every other referral improvement is wasted | Low — host association files (per Report #27) | Viral loop |
| P0 | M3 — First-purchase incentive | First purchase is the activation event; 5× return rate for first-time buyers | Low — add discount logic to checkout | Activation |
| P1 | M5 — Give-get referral UI | 3-5× more effective than vague "invite and earn" | Low — update copy | Referral conversion |
| P1 | M9 — Tiered re-engagement pushes | Recovers 5-15% of dormant users; without it, dormant = permanently lost | Medium — segmentation + personalization pipeline | Dormant user recovery |
| P1 | M12 — Wishlist price drop alerts | Highest-CTR push category for marketplaces | Medium — price monitoring pipeline | Push CTR |
| P1 | M7 — Share-to-story | Highest-conversion viral loop for visual marketplaces | Medium — native share integration | Viral coefficient |
| P1 | A3 — Referral as a product system | Attribution, fraud prevention, reward fulfillment — the infrastructure for a real referral program | High — full backend pipeline | Referral program at scale |
| P2 | M8 — Shareable card images | 5-10× higher CTR than text-only shares | Medium — image generation | Share conversion |
| P2 | M10 — Top Seller program with perks | Seller retention is the two-sided market necessity; badges without perks don't retain | Medium — tier system + perk fulfillment | Seller retention |
| P2 | M11 — Streak mechanic for buyers | Daily app opens = trigger for Hook Model; streak with repair is ethical | Medium — streak state + repair logic | Daily retention |
| P2 | A5 — Personalization as switching cost | Taste profile = investment = switching cost; the defense against churn | High — personalization infrastructure | Long-term retention |
| P3 | A1 — Growth as a loop | Architectural shift from funnel to loop thinking | High — organizational + architectural | Sustainable growth |
| P3 | A4 — Seller retention architecture | Seller dashboard, education, community, re-engagement | High — full seller product surface | Seller retention at scale |
| P3 | A6 — Re-engagement as tiered pipeline | 6-tier pipeline with segmentation and personalization | High — segmentation + personalization | Dormant user recovery at scale |
| P3 | M6 — Referral attribution pipeline | Full attribution from share to reward | High — Branch/AppsFlyer integration | Referral at scale |

---

## 10. Token-level Spec

| Token | Value | Notes |
|---|---|---|
| `growth.hookModel.stages` | trigger, action, variableReward, investment | All four stages addressed |
| `retention.day1.target` | >40% | Global average is 26% |
| `retention.day30.target` | >15% | Median is 3.9% |
| `onboarding.styleQuiz` | Integrated into onboarding flow | Investment moment |
| `onboarding.day1Push` | Scheduled push after first session | "New listings matching your taste" |
| `onboarding.firstPurchaseIncentive` | 10% off or free shipping | Activation event |
| `referral.structure` | Give £10, get £10 (both sides benefit) | 3-5× more effective than one-sided |
| `referral.codeGeneration` | Server-side with anti-fraud | Not client-side deterministic |
| `referral.attribution` | Share → install → signup → first action → reward | Branch or AppsFlyer |
| `referral.deepLink` | `https://thryftverse.app/invite/:code` opens app | Requires association files (Report #27) |
| `referral.fraudPrevention` | Device fingerprint, IP check, self-referral prevention, velocity limits | Anti-gaming |
| `share.toStory` | Instagram Stories, Snapchat | Highest-conversion viral loop |
| `share.cardImage` | Generated image with listing photo, price, brand, deep link | 5-10× higher CTR than text |
| `reengagement.tiers` | 3d (content), 7d (value), 14d (personalization), 30d (incentive), 60d (email), 90d (last chance) | Tiered, segmented, personalized |
| `reengagement.segmentation` | By user type (buyer/seller), activity level, taste profile | Not generic |
| `streak.mechanic` | Daily discovery streak with flame icon | Trigger for Hook Model |
| `streak.repair` | One free freeze per week | Ethical (don't punish one miss) |
| `seller.program.tiers` | Bronze (5+ sales), Silver (25+ sales), Gold (100+ sales) | Transparent thresholds |
| `seller.program.perks` | Badge, fee reduction (5-10%), search priority, exclusive drops | Tangible perks, not just status |
| `seller.dashboard` | GMV, sell-through rate, rating, defect rate, progress toward next tier | Performance visibility |
| `loyalty.tiers` | Bronze, Silver, Gold (from referral activity + GMV) | Multi-dimensional, not just referrals |
| `loyalty.perks` | Credits, discounts, exclusive access, priority support | Real benefits |
| `personalization.tasteProfile` | Style quiz + implicit signals (saved, viewed, purchased) + explicit signals (preferences) | Switching cost |
| `personalization.feedRanking` | Ranked by taste relevance | Personalized feed |
| `personalization.reveal` | "Your taste: Minimalist, Vintage, Sustainable" | Justify the investment |
| `alerts.priceDrop` | Push on wishlist price drop with deep link | Highest-CTR push category |
| `virality.coefficient` | k measured and optimized toward 1 | Tracked metric |
| `growth.ethics` | No fake urgency, no fake scarcity, no punitive streaks, no fabricated counts | Per AGENTS.md §6 |

---

## 11. What "feels AI-made" here, and how to patch it

| AI tell in current state | Patch |
|---|---|
| Referral code generated client-side (predictable, fraud-vulnerable) | Server-side generation with anti-fraud |
| Referral link opens browser, not app (broken viral loop) | Host association files + NavigationContainer linking prop |
| Referral stats silently fail to zeros (truthful-UI violation) | Show "Stats unavailable" not fake zeros |
| Loyalty tier based on one dimension (referrals only) | Multi-dimensional (referrals + GMV + activity) |
| Share is text-only via `Share.share` | Shareable card images + share-to-story |
| No give-get structure in referral UI | "Give £10, get £10" explicit |
| Style quiz exists but not in onboarding | Integrate into onboarding flow |
| No day-1 push trigger | Schedule push after first session |
| No first-purchase incentive | 10% off or free shipping on first order |
| No re-engagement campaigns | Tiered 3/7/14/30/60/90-day pipeline |
| No streak mechanic | Daily discovery streak with repair |
| Seller badges without perks | Top Seller program with fee reductions + search priority |
| No progress-toward-next-tier UI | Show progress bar on seller dashboard |
| No wishlist price drop alerts | Price monitoring + push pipeline |
| No dormant user reactivation | Tiered reactivation pipeline |

**What's already well-built (not AI-slop):**
- `InviteFriendsScreen.tsx` — referral screen with code, link, share, stats, loyalty tier (good foundation, needs deep-link fix + give-get + attribution)
- `OnboardingScreen.tsx` — value-first onboarding slides (good, needs style quiz integration)
- `StyleQuizScreen.tsx` — 4-step taste quiz (good, needs onboarding integration + reveal)
- `ClosetScreen.tsx` (44KB) — substantial closet feature (investment mechanism)
- `SustainabilityBadge.tsx` — truthful sustainability scoring (retention through meaning)
- `SellerStandardsBadges.tsx` — seller badges from real performance data (foundation for Top Seller program)
- `PersonalisationScreen.tsx` — personalisation settings (taste profile foundation)
- `ShareSheet.tsx` — share component exists (needs share-to-story + card images)
- `ActivityBadge.tsx` — notification count badge (trigger visibility)

The growth/retention foundation exists — referral, onboarding, style quiz, closet, sustainability, seller badges, personalisation. The defects are gaps (no deep links, no attribution, no re-engagement, no streaks, no share-to-story, no Top Seller perks) rather than foundational failures. The path to flagship is closing the viral loop (deep links + attribution), adding the missing Hook Model stages (trigger: day-1 push + re-engagement; investment: streak + Top Seller), and fixing the AI-slop patterns (client-side referral code, silent stat failures, text-only shares).

---

*Generated 2026-08-18 by the ThryftVerse flagship research programme. Live 2026 web benchmark + production codebase audit + psychology + micro/macro prescription. Sources: The Viral App, StriveClub, MWM Guides, VMobify (Duolingo teardown), Cubitrek (Temu teardown), Nir Eyal Hook Model.*
