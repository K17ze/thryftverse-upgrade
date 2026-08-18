# 37 — Recommendation Engine & Personalized Feed: Flagship Research Report

> **Department:** "For You" feed, recommended items, ML-powered suggestions, behavioral data pipeline, taste profile, related products
> **Benchmark date:** 2026-08
> **Primary benchmarks:** Pinterest · Instagram · TikTok · eBay
> **Sources:** production codebase audit · 2026 web research · AGENTS.md §4

---

## 1. 2026 Competitor Benchmark

### Pinterest (2026)
Pinterest is the gold standard for recommendation-driven discovery:
- **Visual similarity** — "More like this" on every pin, based on visual embedding
- **Taste graph** — maps user interests to visual concepts (color, style, category)
- **Personalized home feed** — ranked by a multi-objective model (relevance + freshness + diversity)
- **Related pins** — "Picked for you" rail on every pin detail
- **Seasonal awareness** — recommendations adapt to season, holidays, trends
- **Exploration/exploitation** — 80% relevant, 20% exploratory (new categories)

### Instagram (2026)
Instagram's recommendation engine powers Explore and Reels:
- **Explore grid** — personalized by engagement signals (likes, saves, shares, time-spent)
- **Reels ranking** — watch time, completion rate, like rate, share rate
- **"Suggested posts"** — in feed, based on accounts you interact with
- **Hashtag and interest following** — follow topics, not just accounts

### TikTok (2026)
TikTok's For You page is the most aggressive recommendation engine:
- **Rapid signal collection** — within 3 videos, the FYP starts personalizing
- **Watch time as primary signal** — completion rate > likes > shares
- **No explicit preference needed** — no "what do you like?" onboarding; purely behavioral
- **High exploration rate** — constantly tests new content types

### eBay (2026)
eBay's recommendations are commerce-focused:
- **"Similar items"** — on every PDP, visual + price similarity
- **"Recently viewed"** — rail on home page
- **"Save this search"** — alert when new items match
- **"You might also like"** — cross-category recommendations based on browsing

### Cross-cutting 2026 consensus
- **Multi-signal ranking** — relevance, freshness, diversity, engagement, personalization
- **Exploration/exploitation** — 80% relevant, 20% exploratory
- **Cold start handling** — for new users, use onboarding data + popular items
- **Real-time adaptation** — feed updates as user interacts (like, save, skip)
- **Explanation labels** — "Because you viewed X" or "Popular in Y"
- **Diversity constraint** — don't show 10 items from the same seller

---

## 2. Psychology & Principles

### The relevance expectation
In 2026, users expect personalized feeds. A generic "newest first" feed feels broken — the user has to scroll past irrelevant content to find what they want. A personalized feed says "we know what you like" and respects the user's time. For a marketplace, this means: the home feed must be personalized, not just "all listings sorted by date."

### The exploration-exploitation balance
If the feed only shows what the user already likes, they get bored (filter bubble). If it only shows new things, they get frustrated (irrelevant). The 2026 standard: 80% exploitation (relevant to known interests), 20% exploration (new categories, trending items). This keeps the feed fresh without being random.

### The cold start problem
New users have no browsing history, so the recommendation engine has no signal. The 2026 solutions:
1. **Onboarding style quiz** — ask about preferences (ThryftVerse has StyleQuizScreen)
2. **Popular items** — show trending items as baseline
3. **Rapid signal collection** — track first 5 interactions, personalize immediately
4. **Category browse** — let the user pick categories to follow

### Explanation as trust
When a recommendation has an explanation ("Because you saved a leather jacket"), the user understands why it's there and trusts the system. Without explanation, recommendations feel random. The 2026 standard: show reason codes on recommended items.

---

## 3. Current ThryftVerse Audit — Concrete Defects

### Recommendation/personalization files

| File | Lines | Role | Quality |
|------|-------|------|---------|
| `hooks/useForYouFeed.ts` | 111+ | For You feed hook | ✅ Senior |
| `components/product/RecommendationRail.tsx` | 169+ | Recommendation rail | ✅ Exists |
| `services/styleGraph.ts` | 227+ | Style graph service | ✅ Exists |
| `services/listingQualityApi.ts` | 559+ | Listing quality scoring | ✅ Substantial |
| `services/conversationalSearchApi.ts` | 481+ | Conversational search | ✅ Exists |
| `services/algorithmTransparencyApi.ts` | — | Algorithm transparency | ✅ Exists |
| `screens/OutfitBuilderScreen.tsx` | 721+ | Outfit builder with StyleGraph | ✅ Exists |
| `components/product/BundleUpsellRow.tsx` | — | Bundle upsell | ✅ Exists |
| `components/product/DiscoveryGrid.tsx` | — | Discovery grid | ✅ Exists |
| `screens/AIPoweredListingScreen.tsx` | — | AI-powered listings | ⚠️ AI-slop risk |
| `hooks/useFollowingFeed.ts` | 131+ | Following feed | ✅ Senior |

### What exists (genuinely senior)
1. **useForYouFeed** — fetches from `/recommendations/:userId` endpoint. Has `source: 'decision_service' | 'cache' | 'heuristic_baseline'`, `reasonCodes`, `componentScores`, `explorationRate`, `coldStart` flag. This is a **genuinely senior recommendation API** with transparency built in.
2. **RecommendationRail** — renders recommendation sections with `reasonCode`, `personalised` flag, `showAccent`. Uses FlashList.
3. **StyleGraph** — `services/styleGraph.ts` (227 lines) with `scoreOutfit`, `suggestCompletion`, `inferSlot`. Powers the OutfitBuilder.
4. **listingQualityApi** — 559 lines of listing quality scoring. Scores listings on multiple dimensions.
5. **algorithmTransparencyApi** — API for algorithm transparency (unique to ThryftVerse, aligns with EU DSA).
6. **ConversationalSearch** — AI-powered search (though flagged as AI-slop in Report #16).

### What's missing

| # | Defect | Severity |
|---|--------|----------|
| 1 | **No "More like this" on PDP** — no visual similarity recommendations on product detail | High |
| 2 | **No "Recently viewed" rail** — no recently viewed items on home | Medium |
| 3 | **No real-time feed adaptation** — feed doesn't update as user interacts | Medium |
| 4 | **No diversity constraint** — no limit on items from same seller in feed | Medium |
| 5 | **No explanation labels on feed** — reason codes exist in API but may not surface in UI | Medium |
| 6 | **No seasonal/trend awareness** — no seasonal or trending item boosting | Low |
| 7 | **No "Save this search" alert integration** — saved searches exist but no "new matches" in feed | Medium |
| 8 | **No cross-category recommendations** — no "you might also like" across categories | Low |
| 9 | **Style quiz not in onboarding** — exists but not integrated into cold start (per Report #30) | High |
| 10 | **No recommendation analytics** — no CTR, save rate, purchase rate per recommendation | Medium |

---

## 4. Micro Improvements

### M1 — Add "More like this" on PDP
On ItemDetailScreen, add a "More like this" rail below the product details. Fetch visually similar items from backend (visual embedding + price range + category). Uses RecommendationRail component.

### M2 — Add "Recently viewed" rail on home
Track recently viewed listings (last 10) in local storage + backend. Show as a horizontal rail on HomeScreen: "Recently viewed". Tap to re-open the PDP.

### M3 — Surface reason codes in UI
The API already returns `reasonCodes` (e.g., "Because you viewed leather jackets"). Surface these as small labels on recommendation rails: "Because you saved X" or "Popular in Y".

### M4 — Add diversity constraint
In the feed, limit consecutive items from the same seller to 2. After 2 items from seller X, insert items from other sellers. This prevents the feed from feeling like a single-seller storefront.

### M5 — Integrate style quiz into onboarding
The StyleQuizScreen exists but is not part of onboarding (per Report #30). Add it as step 3 of onboarding (after signup, before home). Use quiz results to seed the recommendation engine for cold start.

### M6 — Add real-time feed adaptation
When the user likes/saves an item on the feed, update the feed's ranking signal immediately. Insert 1-2 similar items near the top of the next page load. This creates a "the feed gets me" feeling.

### M7 — Add "Save this search" → "New matches" in feed
When a user has saved searches with alerts, show "New matches for your saved search: X" as a rail on the home feed. Integrates with existing `useSavedSearchAlerts` hook.

---

## 5. Macro Improvements

### A1 — Recommendation platform architecture
Unify the recommendation system:
- `useForYouFeed` — already exists, extend with real-time adaptation
- `useFollowingFeed` — already exists, migrate to server-side endpoint
- `useRecentlyViewed` — new hook for recently viewed tracking
- `useSimilarItems` — new hook for "More like this" on PDP
- `useSavedSearchFeed` — new hook for saved search matches in feed
- `RecommendationRail` — already exists, extend with reason codes
- `recommendationApi` — unified API for all recommendation types

### A2 — Taste profile
Build a taste profile from:
- **Style quiz results** — explicit preferences (colors, styles, brands, categories)
- **Browsing behavior** — categories viewed, items saved, time spent
- **Purchase history** — categories bought, price range, brands
- **Social graph** — who the user follows, what their follows like

Use the taste profile to power: For You feed, suggested users, saved search alerts, email recommendations.

### A3 — Algorithm transparency
ThryftVerse already has `algorithmTransparencyApi` — extend it to:
- Show "Why am I seeing this?" on every recommended item
- Let users adjust their taste profile ("show less of X")
- Provide an algorithm transparency dashboard in settings

---

## 6. Flagship Acceptance Criteria

- **"More like this" on PDP** — visual similarity recommendations
- **"Recently viewed" rail** on home
- **Reason codes surfaced** — "Because you viewed X"
- **Diversity constraint** — max 2 consecutive from same seller
- **Style quiz in onboarding** — seeds cold start
- **Real-time feed adaptation** — feed responds to interactions
- **Saved search matches in feed** — "New matches for X"
- **Algorithm transparency** — "Why am I seeing this?"
- **Exploration/exploitation** — 80% relevant, 20% exploratory
- **Cold start handling** — style quiz + popular items baseline

### Thumbnail test
At 25% scale, the home feed must show: a mix of media-dominant cards from different sellers, with reason code labels visible on some. No two consecutive cards from the same seller.

---

## 7. Priority & Sequencing

| Priority | Item | Risk | Unblocks |
|----------|------|------|----------|
| P0 | M5 — Style quiz in onboarding | Low | Cold start |
| P0 | M1 — "More like this" on PDP | Medium | PDP engagement |
| P1 | M2 — "Recently viewed" rail | Low | Home engagement |
| P1 | M3 — Surface reason codes | Low | Trust |
| P1 | M4 — Diversity constraint | Low | Feed quality |
| P2 | M6 — Real-time adaptation | Medium | Personalization |
| P2 | M7 — Saved search in feed | Medium | Search engagement |
| P3 | A1 — Full recommendation platform | High | All feed surfaces |
| P3 | A2 — Taste profile | High | Personalization |
| P3 | A3 — Algorithm transparency | Medium | Trust + compliance |

---

## 8. Token-Level Spec

| Token | Value | Notes |
|-------|-------|-------|
| `recommendationRail.height` | 280pt | Card + label |
| `recommendationRail.cardWidth` | 160pt | Standard rail card |
| `recommendationRail.cardHeight` | 200pt | |
| `recommendationRail.gap` | Space.sm | Between cards |
| `reasonCode.font` | Type.caption | 12pt |
| `reasonCode.color` | colors.textMuted | |
| `reasonCode.padding` | Space.xs + Space.xs | |
| `recentlyViewed.avatar.size` | 80pt | Smaller than feed card |
| `recentlyViewed.rail.height` | 120pt | |
| `similarItems.rail.label` | "More like this" | Type.subtitle |
| `diversity.maxConsecutive` | 2 | Same seller |
| `exploration.rate` | 0.2 | 20% exploratory |
| `coldStart.popularRatio` | 0.6 | 60% popular, 40% quiz-based |
| `feed.refresh.signalDecay` | 7 days | Interaction signal half-life |

---

*Generated 2026-08-18. Verified sources: labs.pinterest.com/research-and-innovation/representation-learning (Taste Graph: 80 billion connections, Pins/boards/users/queries/products embeddings), labs.pinterest.com/research-and-innovation/recommender-systems (lifelong user sequences, unified multi-task models, foundation ranking, generative recommender systems), medium.com/pinterest-engineering/evolution-of-multi-objective-optimization-at-pinterest-home-feed (cascaded retrieval→pre-ranking→ranking→re-ranking, feed diversification critical for long-term satisfaction), arxiv.org/html/2606.00422 (UniPinRec: unified retrieval+ranking, +1% engagement, -11.1% latency, +63.6% QPS), medium.com/pinterest-engineering/next-level-personalization (TransActV2: 16,000 user actions, 160x scale-up, Next Action Loss), socialpilot.co/blog/tiktok-algorithm (FYP signals: watch time + completion rate highest, follower-first initial distribution since 2025), hootsuite.com/tiktok-algorithm (interest graph not social graph, user interactions highest weight), underthehoodit.com (TikTok ranking: predicted watch duration, completion probability, rewatch likelihood, swipe-away risk), clarigital.com/codex/social-media/tiktok-algorithm (TikTok official Newsroom signals). Production codebase audit: useForYouFeed, RecommendationRail, styleGraph, listingQualityApi, algorithmTransparencyApi, StyleQuizScreen.*
