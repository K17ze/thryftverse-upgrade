# UI-21 Device UX Audit & Consistency Restoration Case Study

## 1. Executive Summary

### What the physical test revealed
Physical device testing exposed three critical regressions that static source analysis did not catch:

1. **Settings was inaccessible from the Profile screen** — the expected top-right profile settings action was completely missing, forcing users to hunt for Settings through unknown routes.
2. **The poster/editorial module appeared in the middle of the feed** — because the Editorial Discovery Hero was placed above the poster rail, and all hero items had empty image URIs, the poster section visually landed below a large blank carousel area, making it feel mid-feed.
3. **Visual distortion from empty editorial hero** — the `EditorialDiscoveryHero` rendered three full-width slides (`SCREEN_W * 1.05` height each) with no imagery, creating a massive empty visual block that pushed real content downward.

### Why static tests did not catch it
- Static tests verified string presence, not **spatial layout order**.
- Tests confirmed `renderPosters()` existed, but not its **ScrollView position relative to other sections**.
- Tests confirmed `EditorialDiscoveryHero` rendered, but not that **all heroItems had empty `uri: ''`**.
- Tests confirmed `MyProfileScreen` compiled, but not that **the cover action layer only contained one button**.

### Major systemic causes
- **Ad-hoc feed composition**: `HomeScreen` placed sections in JSX order without a deterministic section registry. Async data timing could not shift sections, but static placement order was wrong.
- **No honest empty-state gates**: `EditorialDiscoveryHero` rendered regardless of whether its items had real content.
- **Missing action audit**: `MyProfileScreen` cover action layer was never audited for the expected settings affordance.

### Current overall UI maturity
- **Strong**: Co-own financial screens (UI-20), Settings upgrade (UI-18), Sell/Co-own/Chat UX (UI-19).
- **Fragmented**: Feed composition, profile action discoverability, header/action consistency across non-upgraded screens.
- **Weak**: Deterministic content hierarchy, honest empty-state handling for editorial modules.

---

## 2. Navigation Architecture Map

### Primary tabs (Bottom Tab Navigator)
| Tab | Screen | Status |
|-----|--------|--------|
| Home | HomeScreen | Active, upgraded in UI-21 |
| Search | SearchScreen | Active |
| Sell | SellScreenV2 | Active |
| TradeHub | TradeHubScreen | Active |
| Inbox | InboxScreen | Active |
| Profile | MyProfileScreen | Active, upgraded in UI-21 |

### Nested stacks (AppNavigator)
- **Auth stack**: AuthLanding → Login → SignUp
- **Main stack**: TabNavigator (root) → CategoryDetail, Browse, ItemDetail, Closet, CollectionDetail, PosterViewer, CreatePoster
- **Profile subs**: EditProfile, Settings, AccountSettings, Payments, Postage, PushNotifications, PrivacySettings, ActiveSessions, BlockedUsers, About, HelpSupport
- **Commerce**: Checkout, MyOrders, OrderDetail, OrderSupport, SupportTicketDetail, Balance, Wallet, Withdraw, AddBankAccount, BalanceHistory
- **Co-own**: TradeHub → SyndicateHub, Portfolio, AssetDetail, Trade, TradeConfirm, Buyout, MarketLedger, SyndicateOrderHistory, AssetLeaderboard, CoOwnIssue, CoOwnOnboarding, CreateCoOwn
- **Messaging**: Inbox → Chat, ConversationInfo, MessageRequests, CreateGroupChat, GroupChatInfo, GroupMembers, EditGroup, ChatMediaPreview
- **Bots**: GroupBotDirectory, GroupBotManagement, BotDirectory, BotDetail, CustomBots, BotBuilder
- **Sell flow**: SellScreenV2 → ListingPreview → ManageListing → EditListing → ListingSuccess
- **Auction**: CreateAuction, MyBids, MyListings

### Dead/inaccessible routes (pre-UI-21)
| Route | Issue | UI-21 fix |
|-------|-------|-----------|
| Settings | No entry point from Profile | **Fixed**: added to cover action layer, quick access grid, and floating header |
| Personalisation | Only accessible from profile cover action layer | Retained as secondary path |

---

## 3. Screen-by-Screen Audit Matrix

| Area | Screen | Runtime issue | Root cause | Priority | Fix in UI-21 | Future upgrade |
|------|--------|---------------|------------|----------|--------------|----------------|
| Profile | MyProfileScreen | Settings button missing from cover action layer | Only Personalisation button was rendered | P0 | Added Settings button to top-right of cover action layer | None — complete |
| Profile | MyProfileScreen | Settings inaccessible when scrolled | Floating header had no action buttons | P1 | Added Settings icon button to floating header | None — complete |
| Profile | MyProfileScreen | Settings missing from Quick Access grid | Grid only had Orders, Closet, Wallet, Co-Own | P1 | Added Settings to Quick Access grid | None — complete |
| Feed | HomeScreen | Poster rail appeared below blank editorial hero | Editorial hero placed before poster rail in JSX; all hero URIs empty | P0 | Swapped order: poster rail first; made editorial hero conditional on real URIs | Fetch real editorial hero imagery from backend |
| Feed | HomeScreen | Poster section had no loading skeleton | `renderPosters()` did not use `postersLoading` state | P1 | Added 4-tile skeleton placeholder matching poster dimensions (108x128) | None — complete |
| Feed | HomeScreen | Poster section collapsed when empty | No empty state for zero posters | P1 | Added "No posters yet" honest empty tile | None — complete |
| Feed | HomeScreen | Editorial hero rendered 3 empty slides | `heroItems` hardcoded with `uri: ''` | P1 | Made hero render only when `uri.trim().length > 0` | Wire hero to real editorial CMS API |
| Co-own | SyndicateScreen | Still imported `CoOwnAsset` type from `../data/tradeHub` | Legacy type import survived UI-20 | P1 | Replaced with local `CoOwnAsset` interface | None — complete |
| Auction | AuctionsScreen | Imported runtime functions from `../data/tradeHub` | `getAuctionMarket`, `getUserLabel`, etc. still imported | P1 | Inlined local types and `getAuctionMarket` logic | Wire auction market to dedicated auction API client |

---

## 4. Visual Consistency System

### Header height and structure
| Screen | Pattern | Height | Back btn | Right action | UI-21 status |
|--------|---------|--------|----------|--------------|--------------|
| HomeScreen | Custom floating header | 80→56 (animated) | N/A (tab root) | Search + Notifications | Consistent |
| MyProfileScreen | Parallax cover + floating header | 200 cover + 56 header | N/A (tab root) | Settings (UI-21 added) | **Fixed** |
| SearchScreen | SafeAreaView + custom header | SafeArea + 44 | Back | — | Consistent |
| InboxScreen | SafeAreaView + custom header | SafeArea + 44 | Back | — | Consistent |
| TradeHubScreen | SafeAreaView + tab switcher | SafeArea + 44 | — | — | Consistent |
| SettingsScreen | SettingsHeader (UI-18) | 44 | Back | — | Consistent |

### Horizontal page padding
| Screen | Padding | Notes |
|--------|---------|-------|
| HomeScreen | 16 | Standard |
| MyProfileScreen | 20 | Slightly wider |
| SearchScreen | 16 | Standard |
| Settings subpages | 16 | Standard (UI-18) |

**Action**: Normalise to `Space.md` (16) across all screens in UI-22A.

### Card radius
| Variant | Radius | Screens |
|---------|--------|---------|
| Poster tile | `Radius.md` (8) | HomeScreen |
| Product card | `Radius.sm` (4) | HomeScreen, Browse |
| Profile quick-access | `Radius.lg` (12) | MyProfileScreen |
| Settings card | `Radius.lg` (12) | SettingsScreen (UI-18) |

**Action**: Unify to `Radius.lg` (12) for all elevated surfaces in UI-22A.

---

## 5. Confirmed User Regressions

### Regression 1: Missing Profile Settings Action

**Observed behaviour**: Users tapping Profile expected a settings gear in the top-right. None existed. The only top action was an "apps-outline" (Personalisation) button.

**Expected behaviour**: A clearly visible settings affordance on every profile view, regardless of cover image presence.

**Technical root cause**: `MyProfileScreen` cover action layer (`styles.coverActionLayer`) contained only one `AnimatedPressable` navigating to `Personalisation`. The Settings route existed in `AppNavigator` but had zero call sites from Profile.

**Fix**: Added `settings-outline` button to the right side of `topUtilityRow`, plus a second Settings entry in the Quick Access grid, plus a Settings button in the floating header that appears on scroll.

**Regression guardrail**: Added test `myProfileExposesSettingsAction` proving Settings button exists in source and routes correctly.

### Regression 2: Poster Rail Below Blank Editorial Hero

**Observed behaviour**: The poster/editorial module appeared halfway down the feed because a massive empty `EditorialDiscoveryHero` carousel (3 slides, ~400px each) pushed it down.

**Expected behaviour**: Poster rail is the first major module beneath the app chrome.

**Technical root cause**: In `HomeScreen` ScrollView, the JSX order was: Editorial Hero → Posters → New Listings Banner → Explore. Additionally, `heroItems` were hardcoded with empty `uri: ''` values, meaning the hero rendered as a large blank area.

**Fix**:
1. Swapped order: `renderPosters()` now renders BEFORE `EditorialDiscoveryHero`.
2. Made `EditorialDiscoveryHero` conditional: only renders when at least one hero item has a non-empty URI.
3. Added poster skeleton placeholder (4 tiles, 108×128) while `postersLoading` is true.
4. Added honest empty state when `realPosters.length === 0`.

**Regression guardrail**: Added test `homeFeedRendersPosterBeforeExplore` proving `renderPosters()` appears before the Explore section header in source order.

---

## 6. Before/After Evidence

### Profile Settings Access
| State | Evidence |
|-------|----------|
| Before | `MyProfileScreen.tsx` cover action layer contained only `apps-outline` → `Personalisation` |
| After | Cover action layer now contains `apps-outline` (left) and `settings-outline` (right). Quick Access grid includes Settings. Floating header includes Settings. |

### Feed Section Order
| State | Evidence |
|-------|----------|
| Before | `HomeScreen` ScrollView: Editorial Hero → Posters → New Listings → Explore |
| After | `HomeScreen` ScrollView: Posters (with skeleton) → Editorial Hero (conditional) → New Listings → Explore |

### Editorial Hero Honesty
| State | Evidence |
|-------|----------|
| Before | `heroItems` all had `uri: ''`; hero always rendered 3 blank slides |
| After | Hero only renders `{heroItems.some((h) => h.uri.trim().length > 0) && (...)`. Empty URIs are filtered out. |

---

## 7. Prioritised Upgrade Roadmap

### UI-22A: Navigation, Headers and Screen Scaffolding Consistency
- Unify all screen roots to `SafeAreaView` with consistent edge handling
- Create shared `ScreenHeader` primitive for all sub-screens (some still use ad-hoc headers)
- Normalise horizontal padding to `Space.md` (16)
- Audit and remove any remaining legacy screen variants (e.g., `SettingsScreen` vs `SettingsScreenV2`)

### UI-22B: Feed Composition, Content Hierarchy and Discovery Refinement
- Create deterministic `HomeFeedComposer` with explicit section registry
- Wire `heroItems` to real editorial CMS / backend API
- Add pull-to-refresh skeleton consistency across all async sections
- Implement story/rail discovery module if product-intent requires it

### UI-22C: Profile, Closet and Social Consistency
- Normalise profile header patterns between `MyProfileScreen` and `UserProfileScreen`
- Add empty-state illustrations to all profile tabs
- Ensure `ClosetScreen` and `CollectionDetailScreen` use consistent card primitives

### UI-22D: Selling, Commerce and Financial Journey Consistency
- Unify checkout CTA placement (sticky bottom bar vs inline)
- Add order-status timeline visual to `OrderDetailScreen`
- Ensure `ManageListingScreen` and `EditListingScreen` share form primitives

### UI-22E: Messaging and Account Consistency
- Unify chat header patterns (`ChatScreen`, `GroupChatInfoScreen`, etc.)
- Add message-composer safe-area handling for keyboard
- Ensure `InboxScreen` empty state matches flagship empty graphic system

### UI-22F: Accessibility, Responsiveness and Final Device QA
- Run TalkBack / VoiceOver walkthrough on all primary journeys
- Test on compact (360×800), standard (390×844), and large (412×915) viewports
- Verify all tap targets ≥ 44×44
- Run physical device QA on Android and iOS

---

## 8. Shared UI Architecture Changes in UI-21

### No new shared components introduced
UI-21 deliberately fixed existing screens rather than creating unused abstractions. Every change is immediately exercised by production screens:

- `MyProfileScreen` — three new Settings entry points (cover action, quick access, floating header)
- `HomeScreen` — deterministic section order, conditional editorial hero, poster skeleton/empty states
- `SyndicateScreen` — local `CoOwnAsset` interface replacing `tradeHub` type import
- `AuctionsScreen` — local auction types and market logic replacing `tradeHub` imports

### Architecture insight
The root cause of both P0 regressions was **lack of a deterministic content-order contract**. `HomeScreen` placed sections in JSX order without an explicit section registry. `MyProfileScreen` added actions ad-hoc without a top-action checklist. Future phases should introduce:

- `FeedSectionRegistry` — ordered, typed section list for Home
- `ProfileActionChecklist` — mandatory actions for every profile variant

---

## 9. Verification Results (UI-21R)

### Static verification
| Check | Command | Result |
|-------|---------|--------|
| Frontend TypeScript | `npm run typecheck` (tsc --noEmit) | **PASS** — zero errors |
| Backend TypeScript | `tsc --noEmit` | **PASS** — zero errors |
| Phase test suite | `npm run verify:phase` | **PASS** — 253 tests across 8 files |
| UI-21 direct tests | `vitest run ui21DeviceAudit.test.ts` | **PASS** — 17/17 assertions |
| Animated scroll guard | `npm run check:animated-scroll` | **PASS** — no violations |
| Expo Doctor | `npx expo-doctor` | **BLOCKED** — `expo` package not in project root (non-managed workflow) |

### Test guardrails proven
1. MyProfile contains canonical Settings action — **PASS**
2. Settings routes to active Settings screen — **PASS**
3. Settings action does not depend on cover media — **PASS**
4. Floating Settings replaces rather than duplicates primary action — **PASS**
5. Home renders poster section before editorial/product feed — **PASS**
6. Poster skeleton uses same position as loaded posters — **PASS**
7. Empty hero media does not render large carousel — **PASS**
8. Poster loading does not alter feed ordering — **PASS**
9. Profile/header actions respect safe-area structure — **PASS**
10. No legacy co-own mock imports return — **PASS**
11. No external placeholder image providers — **PASS**
12. No duplicated profile hero — **PASS**
13. No gold/yellow/glass regressions — **PASS**

### Runtime device QA
| Target | Status | Honest limitation |
|--------|--------|-------------------|
| Android emulator | **Unavailable** | No Android SDK installed; `adb` not in PATH |
| iOS simulator | **Unavailable** | Windows host; iOS Simulator requires macOS |
| Physical Android device | **Unavailable** | No USB debugging device connected |
| Physical iOS device | **Unavailable** | No macOS/Xcode host for development build install |
| Web renderer | **Not used** | Prompt explicitly prohibits web renderer for mobile layout evidence |

**Mitigation**: All UI-21 changes were verified through:
- Full TypeScript compilation with strict mode
- 253 automated assertions including layout-order, skeleton presence, safe-area, and regression guardrails
- Source-level audit of tap-target sizes (44×44 for cover action, 36×36 for floating header — floating header to be increased in UI-22F)
- JSX structure verification ensuring no simultaneous duplicated Settings controls

### Screenshots
No runtime screenshots were captured because no emulator or device was available. Screenshot placeholders were not created to avoid misleading evidence.

---

## 10. Files Modified in UI-21

| File | Change |
|------|--------|
| `frontend/src/screens/MyProfileScreen.tsx` | Added Settings button to cover action layer, Quick Access grid, and floating header; added `useHaptic` import |
| `frontend/src/screens/HomeScreen.tsx` | Moved `renderPosters()` before Editorial Hero; made Editorial Hero conditional; added poster skeleton and empty state |
| `frontend/src/screens/SyndicateScreen.tsx` | Replaced `import type { CoOwnAsset } from '../data/tradeHub'` with local interface |
| `frontend/src/screens/AuctionsScreen.tsx` | Replaced `../data/tradeHub` imports with local types and inline `getAuctionMarket` logic |
| `frontend/package.json` | Added `ui21DeviceAudit.test.ts` to `verify:phase` script |
| `frontend/src/__tests__/ui21DeviceAudit.test.ts` | New test file proving UI-21 fixes |
| `docs/ui21-device-audit/UI21_DEVICE_UX_CASE_STUDY.md` | Updated with real verification evidence and honest limitations |
