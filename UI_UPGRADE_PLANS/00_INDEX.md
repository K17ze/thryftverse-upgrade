# UI_UPGRADE_PLANS — Master Index

> **ThryftVerse Aesthetic Elevation Playbook**
> Version: 2026-06-02
> Owner: Frontend UI/UX
> Status: Active — drives every UI change in the codebase

---

## Purpose

This folder is the **single source of truth** for elevating ThryftVerse's UI/UX to match the 14 reference images in `reference/`. Every file here is an executable playbook with concrete file paths, line numbers, hex codes, and pass/fail acceptance criteria.

The codebase is **read in this order**:
1. Read `00_INDEX.md` (this file) to navigate
2. Read `00_OVERALL_AND_FOUNDATION.md` for the philosophy
3. Read `01_FOUNDATION_TOKENS.md` for the design system
4. Read `02_SHARED_COMPONENTS.md` for the component library
5. Read the per-section `.md` (03–14) when working on a specific screen
6. Update `EXECUTION_TRACKER.md` after every file change
7. Update `VISUAL_AUDIT.md` after every visual review

---

## Reference Image Inventory (14 images → 17 .md files)

| Reference Image | Maps To Section Doc |
|---|---|
| `overall outlook.jpeg` | `00_OVERALL_AND_FOUNDATION.md` (master) |
| `overall reference.jpeg` | `00_OVERALL_AND_FOUNDATION.md` (master) |
| `overall reference.jpg` | `00_OVERALL_AND_FOUNDATION.md` (master) |
| `settings reference.jpeg` | `12_SETTINGS_AND_SECURITY.md` |
| `settings reference.png` | `12_SETTINGS_AND_SECURITY.md` |
| `settingsreen.jpeg` | `12_SETTINGS_AND_SECURITY.md` |
| `edit profile settings reference .jpeg` | `12_SETTINGS_AND_SECURITY.md` + `08_PROFILE_AND_SOCIAL.md` |
| `inbox messages.png` | `07_INBOX_AND_CHAT.md` |
| `message reference .jpeg` | `07_INBOX_AND_CHAT.md` |
| `edits,looks,pulse reference.jpeg` | `13_POSTER_LOOK_AND_PULSE.md` |
| `saved_closet .jpeg` | `08_PROFILE_AND_SOCIAL.md` |
| `extra reference.jpeg` | Cross-cutting — see `02_SHARED_COMPONENTS.md` |
| `extra reference (2).jpeg` | Cross-cutting — see `02_SHARED_COMPONENTS.md` |
| `extra reference for structuring llayout .jpeg` | Cross-cutting — see `00_OVERALL_AND_FOUNDATION.md` layout section |

---

## File Index

### Foundation (Read First)
- [00_OVERALL_AND_FOUNDATION.md](./00_OVERALL_AND_FOUNDATION.md) — Visual philosophy, design DNA, layout principles
- [01_FOUNDATION_TOKENS.md](./01_FOUNDATION_TOKENS.md) — Concrete tokens: colors, gradients, typography, elevation, motion
- [02_SHARED_COMPONENTS.md](./02_SHARED_COMPONENTS.md) — Component library: GlassCard, GlowSurface, AppButton, etc.

### Per-Section Playbooks (300-500 lines each)
- [03_AUTH_AND_ONBOARDING.md](./03_AUTH_AND_ONBOARDING.md) — AuthLanding, Login, SignUp, ForgotPassword, Personalisation
- [04_HOME_AND_DISCOVERY.md](./04_HOME_AND_DISCOVERY.md) — Home, Browse, GlobalSearch, Filter, CategoryTree
- [05_ITEM_DETAIL.md](./05_ITEM_DETAIL.md) — ItemDetail, MakeOffer, Buyout
- [06_SELL_AND_LISTINGS.md](./06_SELL_AND_LISTINGS.md) — Sell, EditListing, ListingSuccess, MyListings, ManageListing
- [07_INBOX_AND_CHAT.md](./07_INBOX_AND_CHAT.md) — Inbox, Chat, CreateGroupChat, GroupBotDirectory
- [08_PROFILE_AND_SOCIAL.md](./08_PROFILE_AND_SOCIAL.md) — MyProfile, UserProfile, EditProfile, Closet
- [09_TRADE_AND_WALLET.md](./09_TRADE_AND_WALLET.md) — Balance, Withdraw, AddBankAccount, Payments, Postage, Wallet, Portfolio
- [10_ORDERS_AND_CHECKOUT.md](./10_ORDERS_AND_CHECKOUT.md) — Checkout, OrderDetail, MyOrders, WriteReview
- [11_TRADE_HUB_AND_SYNDICATE.md](./11_TRADE_HUB_AND_SYNDICATE.md) — TradeHub, SyndicateHub, SyndicateOnboarding, CoOwn
- [12_SETTINGS_AND_SECURITY.md](./12_SETTINGS_AND_SECURITY.md) — Settings, AccountSettings, ChangePassword, TwoFactorSetup, PushNotifications, HelpSupport
- [13_POSTER_LOOK_AND_PULSE.md](./13_POSTER_LOOK_AND_PULSE.md) — CreatePoster, PosterViewer, CreateLook, OutfitBuilder
- [14_NOTIFICATIONS_AND_ACTIVITY.md](./14_NOTIFICATIONS_AND_ACTIVITY.md) — Notifications, InviteFriends, Auctions, MyBids

### Cross-Cutting Ops Docs
- [EXECUTION_TRACKER.md](./EXECUTION_TRACKER.md) — Every file:line change with status
- [VISUAL_AUDIT.md](./VISUAL_AUDIT.md) — Per-section before/after + reference image side-by-side

### Legacy Plans (Retain for context, superseded by 00-14)
- HONEST_AUDIT.md — original gap analysis
- OVERALL_AESTHETIC_ELEVATION.md — design system source (now split into 00-02)
- INBOX_UPGRADE_PLAN.md — superseded by 07
- SETTINGS_UPGRADE_PLAN.md — superseded by 12
- UPLOAD_SCREEN_UPGRADE_PLAN.md — superseded by 06
- OTHER_SCREENS_UPGRADE_PLAN.md — superseded by 04, 05, 09, 10, 11
- AESTHETIC_CROSSCHECK_PLAN.md — kept as a cross-check index

---

## How to Use This Folder

### When starting work on a specific screen
1. Open the per-section .md (e.g., `12_SETTINGS_AND_SECURITY.md` for `SettingsScreen.tsx`)
2. Read sections 1-3 (reference, DNA, current state)
3. Implement section 4 (target state) using concrete file:line edits
4. Pass all items in section 7 (acceptance criteria)
5. Log change in `EXECUTION_TRACKER.md`
6. Capture before/after in `VISUAL_AUDIT.md`

### When introducing a new component
1. Check `02_SHARED_COMPONENTS.md` — if it exists, use it; if not, add it there FIRST
2. Update the per-section .md that needs it
3. Log in `EXECUTION_TRACKER.md`

### When in doubt about a visual spec
1. Check the **Reference Image** for the section
2. If still unclear, default to `00_OVERALL_AND_FOUNDATION.md` and `01_FOUNDATION_TOKENS.md`
3. Never hardcode values — always use tokens

---

## Section → Screen File Mapping (Quick Lookup)

| Section Doc | Screens Touched (frontend/src/screens/) |
|---|---|
| 03 | `AuthLandingScreen.tsx`, `LoginScreen.tsx`, `SignUpScreen.tsx`, `ForgotPasswordScreen.tsx`, `PersonalisationScreen.tsx` |
| 04 | `HomeScreen.tsx`, `BrowseScreen.tsx`, `GlobalSearchScreen.tsx`, `FilterScreen.tsx`, `CategoryTreeScreen.tsx`, `CategoryDetailScreen.tsx` |
| 05 | `ItemDetailScreen.tsx`, `MakeOfferScreen.tsx`, `BuyoutScreen.tsx` |
| 06 | `SellScreen.tsx`, `EditListingScreen.tsx`, `ListingSuccessScreen.tsx`, `MyListingsScreen.tsx`, `ManageListingScreen.tsx` |
| 07 | `InboxScreen.tsx`, `ChatScreen.tsx`, `CreateGroupChatScreen.tsx`, `GroupBotDirectoryScreen.tsx` |
| 08 | `MyProfileScreen.tsx`, `UserProfileScreen.tsx`, `EditProfileScreen.tsx`, `ClosetScreen.tsx`, `CollectionDetailScreen.tsx` |
| 09 | `BalanceScreen.tsx`, `BalanceHistoryScreen.tsx`, `WithdrawScreen.tsx`, `AddBankAccountScreen.tsx`, `PaymentsScreen.tsx`, `PostageScreen.tsx`, `WalletScreen.tsx`, `PortfolioScreen.tsx`, `MarketLedgerScreen.tsx` |
| 10 | `CheckoutScreen.tsx`, `OrderDetailScreen.tsx`, `MyOrdersScreen.tsx`, `WriteReviewScreen.tsx` |
| 11 | `TradeHubScreen.tsx`, `SyndicateHubScreen.tsx`, `SyndicateOnboardingScreen.tsx`, `SyndicateOrderHistoryScreen.tsx`, `SyndicateScreen.tsx` |
| 12 | `SettingsScreen.tsx`, `AccountSettingsScreen.tsx`, `ChangePasswordScreen.tsx`, `TwoFactorSetupScreen.tsx`, `PushNotificationsScreen.tsx`, `HelpSupportScreen.tsx`, `ReportScreen.tsx` |
| 13 | `CreatePosterScreen.tsx`, `PosterViewerScreen.tsx`, `CreateLookScreen.tsx`, `OutfitBuilderScreen.tsx` |
| 14 | `NotificationsScreen.tsx`, `InviteFriendsScreen.tsx`, `AuctionsScreen.tsx`, `MyBidsScreen.tsx`, `AssetDetailScreen.tsx`, `AssetLeaderboardScreen.tsx` |

---

## Quality Gates (Every Section Must Pass)

- [ ] All cards use `GlassCard` (from `components/ui/GlassSurface.tsx`)
- [ ] All interactive elements use `AnimatedPressable` (haptic + scale)
- [ ] All avatars use `AvatarRing` (gold ring, online dot, unread glow)
- [ ] All toggles use `PremiumToggle` (gold track, drop-in for `Switch`)
- [ ] All search inputs use `GlassSearchPill` (floating glassmorphism)
- [ ] All form inputs use `AppInput variant="glass"`
- [ ] All primary CTAs use `AppButton variant="primary"` (gold)
- [ ] All loading states use `SkeletonLoader` (shimmer)
- [ ] No raw `fontSize` or `fontFamily` in stylesheets — use `Type` tokens
- [ ] No inline `IS_LIGHT ? ... : ...` color constants — use `Colors` tokens
- [ ] All list entrances use `FadeInDown` with stagger
- [ ] All headers are scroll-aware where applicable
- [ ] All touch targets ≥ 44pt
- [ ] All glass cards respect `useReducedMotion` for parallax/animation
- [ ] `EXECUTION_TRACKER.md` updated
- [ ] `VISUAL_AUDIT.md` screenshot captured

---

## Changelog

- **2026-06-02**: Initial structure created. 17 .md files in 5 batches.
  - Foundation (00, 01, 02) — first
  - Hero sections (03, 04, 05) — second
  - Mid sections (06, 07, 08, 09) — third
  - Tail sections (10, 11, 12, 13, 14) — fourth
  - Ops docs (EXECUTION_TRACKER, VISUAL_AUDIT) — fifth

---

## Contact / Ownership

- **Frontend UI/UX Lead**: Owns this folder
- **Component Library**: `components/ui/` — any new component goes here first, then referenced in 02
- **Tokens**: `constants/colors.ts`, `theme/designTokens.ts`, `theme/gradients.ts` — single source

---

**Next step**: Read `00_OVERALL_AND_FOUNDATION.md` to internalize the visual philosophy, then `01_FOUNDATION_TOKENS.md` for the concrete design system values.
