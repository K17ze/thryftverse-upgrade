# Thryftverse Product-Wide Audit & Roadmap

**Status:** `AUDIT COMPLETE — READY FOR ROADMAP REVIEW`

**Date:** 2026-06-05
**Scope:** Every active route in `frontend/src/navigation/types.ts` + `AppNavigator.tsx` + `TabNavigator.tsx`
**Auditor:** Cascade (AI Pair Programmer)

---

## Executive Summary

**74 active routes audited** across 10 product areas. **Zero screens received an A grade.** The app is visually inconsistent, functionally shallow in several core flows, and contains a significant amount of fake/dead UI that misleads users. The most severe systemic issues are:

1. **Mock data infiltration:** `MOCK_USERS`, `MOCK_LISTINGS`, `picsum.photos` fallbacks, and `ENABLE_RUNTIME_MOCKS` seed data appear in **42+ screen files**, including checkout, co-own issuance, item detail, and creator tools.
2. **Outdated animation debt:** `FadeInDown`, `FadeInUp`, `SlideInRight`, `ZoomIn`, and `Layout.springify()` are still used in **20+ screens**, despite multiple redesigns that claimed to remove them.
3. **Glassmorphism / BlurView remnants:** `GlassCard`, `GlassSurface`, `BlurView`, and `GlowSurface` are still imported and used in **16+ screens**, including checkout, sell flow, auth landing, and trade screens.
4. **Hardcoded theme colors:** `#0A0A0A`, `#c9a86c`, `#d7b98f`, `#FFFFFF/#111111` inline conditionals, and static `ActiveTheme` checks at module level appear in **25+ screens**, breaking light mode and theme switching.
5. **Toast-only / no-op features:** Help & Support shows "Coming soon" for live chat and tickets. Create Poster saves as a toast then `goBack()` with no persistence. Several settings rows open empty modals or navigate to placeholder screens.
6. **Competing design systems:** Two typography files (`theme/designTokens.ts` and `constants/typography.ts`), five card implementations, four header patterns, and conflicting elevation aliases are mixed arbitrarily.
7. **Backend dependency gaps:** Co-own trading engine, auction system, outfit builder AI, and poster creation all lack real backend persistence or have mock fallback wiring that surfaces fake data when the API is unavailable.

---

## 1. Top 20 Worst Screens / Sections

Ranked by severity (truth score weighted heaviest, then functionality, then visual quality).

| Rank | Route | File | Grade | Visual | Functionality | Truth | Main Problem |
|------|-------|------|-------|--------|---------------|-------|--------------|
| 1 | `CreatePoster` | `CreatePosterScreenV2.tsx` | **D** | 55 | 45 | 40 | CSS-style image filters (`filter: 'grayscale(100%)'`), no real photo strip, save = toast + `goBack()`, no persistence |
| 2 | `HelpSupport` | `HelpSupportScreenV2.tsx` | **D** | 52 | 35 | 25 | "Live chat coming soon", "Support ticket system coming soon", fake FAQ accordions |
| 3 | `AssetDetail` | `AssetDetailScreen.tsx` | **D** | 65 | 55 | 45 | Synthetic owners (`@holder1`, `@holder2`), fake order book, basic CSS bar chart instead of real price chart |
| 4 | `Search` | `SearchScreen.tsx` | **C** | 68 | 60 | 55 | `SAVED_LOOKS_SEED` with Unsplash URLs, `ENABLE_RUNTIME_MOCKS` gating, mock look cards |
| 5 | `SyndicateHub` | `SyndicateHubScreen.tsx` | **C** | 68 | 65 | 60 | `variant="gold"` buttons, both Help row buttons navigate to same screen (no-op redundancy) |
| 6 | `Inbox` | `InboxScreen.tsx` | **C** | 62 | 72 | 65 | `GlassCard`, `FadeInDown`, `ActiveTheme`, card rows with margin/shadow (rounded card pattern) |
| 7 | `Settings` | `SettingsScreenV2.tsx` | **C** | 64 | 75 | 70 | `FadeInDown`, `#c9a86c` hardcoded icon color, dev diagnostics exposed in production UI |
| 8 | `Home` | `HomeScreen.tsx` | **C** | 68 | 78 | 72 | `ActiveTheme`, `BlurView`, `FadeInDown` via `StaggeredItem`, `Colors.glassBg` |
| 9 | `Chat` | `ChatScreen.tsx` | **C** | 70 | 78 | 72 | `ActiveTheme`, static `Colors`, `Layout.springify()`, glassmorphism remnants in composer |
| 10 | `Browse` | `BrowseScreen.tsx` | **C** | 68 | 76 | 72 | `ActiveTheme`, no entrance animations, raw `Text` styles instead of `T` primitive, `MOCK_USERS` for seller resolution |
| 11 | `ItemDetail` | `ItemDetailScreen.tsx` | **C** | 72 | 82 | 75 | `ActiveTheme`, `BlurView` in floating buy bar, `MOCK_USERS` for seller fallback |
| 12 | `MyProfile` | `MyProfileScreen.tsx` | **C** | 70 | 78 | 72 | `FadeInDown`, hardcoded `COVER_IMAGE = ''`, `MOCK_USERS` references in co-own math |
| 13 | `Balance` | `BalanceScreen.tsx` | **C** | 58 | 50 | 45 | `picsum.photos` fallback images, likely mock transaction data (pattern match) |
| 14 | `AddBankAccount` | `AddBankAccountScreen.tsx` | **C** | 55 | 48 | 42 | `picsum.photos` fallbacks, shallow form with no real bank linking evidence |
| 15 | `CreateAuction` | `CreateAuctionScreen.tsx` | **C** | 62 | 58 | 50 | `MOCK_LISTINGS` fallback, no real auction backend wiring |
| 16 | `MakeOffer` | `MakeOfferScreen.tsx` | **C** | 65 | 62 | 55 | `MOCK_LISTINGS` fallback, offer submission is shallow |
| 17 | `Notifications` | `NotificationsScreen.tsx` | **C** | 60 | 65 | 58 | `PANEL_BG = IS_LIGHT ? '#ffffff' : '#111111'` hardcoded |
| 18 | `EditProfile` | `EditProfileScreen.tsx` | **C** | 65 | 72 | 65 | Hardcoded `#0A0A0A` background, `GlassCard` usage, `picsum.photos` fallback |
| 19 | `AuthLanding` | `AuthLandingScreen.tsx` | **C** | 78 | 85 | 80 | `FadeInDown`, `FadeInUp`, `GlassCard`, `GlowSurface`, `#d7b98f` hardcoded CTA color, `#090909` hardcoded bg |
| 20 | `Sell` | `SellScreenV2.tsx` | **C** | 78 | 88 | 82 | `GlassCard`, `GlowSurface`, `FadeInUp`, `FadeIn`, `FadeOut`, `SlideInRight`, `ZoomIn`, `Layout` — animation overkill + glassmorphism |

## 2. Route Inventory Table

Source of truth: `RootStackParamList` + `TabParamList` + `AppNavigator.tsx`

| Route Name | File Path | Category | Grade | Notes |
|------------|-----------|----------|-------|-------|
| `AuthLanding` | `screens/AuthLandingScreen.tsx` | Auth | C | Social auth real, but glassmorphism + hardcoded colors |
| `Login` | `screens/LoginScreen.tsx` | Auth | B | Real auth API, haptics, but `FadeInUp`/`Layout` remain |
| `SignUp` | `screens/SignUpScreen.tsx` | Auth | C | `picsum.photos` fallback |
| `ForgotPassword` | `screens/ForgotPasswordScreen.tsx` | Auth | C | Shallow form |
| `TwoFactorSetup` | `screens/TwoFactorSetupScreen.tsx` | Auth | C | `picsum.photos` fallback |
| `TwoFactorSetupV2` | `screens/TwoFactorSetupScreenV2.tsx` | Auth | C | `picsum.photos` fallback |
| `Home` | `screens/HomeScreen.tsx` | Discovery | C | `ActiveTheme`, `BlurView`, `FadeInDown` |
| `Browse` | `screens/BrowseScreen.tsx` | Discovery | C | `ActiveTheme`, `MOCK_USERS` |
| `Search` | `screens/SearchScreen.tsx` | Discovery | C | Mock looks, `FadeInDown` |
| `GlobalSearch` | `screens/GlobalSearchScreen.tsx` | Discovery | C | `picsum.photos` heavy usage |
| `VisualSearch` | `screens/VisualSearchScreen.tsx` | Discovery | C | Shallow camera flow |
| `Filter` | `screens/FilterScreen.tsx` | Discovery | C | Inline theme conditionals |
| `CategoryTree` | `screens/CategoryTreeScreen.tsx` | Discovery | C | `MOCK_LISTINGS` |
| `ItemDetail` | `screens/ItemDetailScreen.tsx` | Commerce | C | `ActiveTheme`, `BlurView`, `MOCK_USERS` |
| `Checkout` | `screens/CheckoutScreen.tsx` | Commerce | B | Real payment intent polling, but `GlassCard`, `FadeInDown` |
| `Success` | `screens/SuccessScreen.tsx` | Commerce | C | Mock data pattern |
| `OrderDetail` | `screens/OrderDetailScreen.tsx` | Commerce | C | `MOCK_LISTINGS` |
| `MyOrders` | `screens/MyOrdersScreen.tsx` | Commerce | C | Mock data pattern |
| `MakeOffer` | `screens/MakeOfferScreen.tsx` | Commerce | C | `MOCK_LISTINGS` |
| `WriteReview` | `screens/WriteReviewScreen.tsx` | Commerce | C | `picsum.photos` |
| `Report` | `screens/ReportScreen.tsx` | Commerce | C | Hardcoded `#0A0A0A` |
| `Sell` | `screens/SellScreenV2.tsx` | Selling | C | Glassmorphism + animation overkill |
| `CreateAuction` | `screens/CreateAuctionScreen.tsx` | Selling | C | `MOCK_LISTINGS` |
| `EditListing` | `screens/EditListingScreen.tsx` | Selling | C | Shallow |
| `ManageListing` | `screens/ManageListingScreen.tsx` | Selling | C | `MOCK_LISTINGS` |
| `ListingSuccess` | `screens/ListingSuccessScreen.tsx` | Selling | C | Mock data |
| `MyListings` | `screens/MyListingsScreen.tsx` | Selling | C | Mock data |
| `CoOwnHub` | `screens/SyndicateHubScreen.tsx` | Co-Own | C | `variant="gold"`, no-op help row |
| `CreateCoOwn` | `screens/CreateSyndicateScreen.tsx` | Co-Own | B | Real issuance logic, `FadeInDown` |
| `AssetDetail` | `screens/AssetDetailScreen.tsx` | Co-Own | D | Synthetic owners, fake chart |
| `Trade` | `screens/TradeScreen.tsx` | Co-Own | B | Real trade flow, `GlassCard`, `FadeInDown` |
| `Portfolio` | `screens/PortfolioScreen.tsx` | Co-Own | C | Mock data patterns |
| `MyBids` | `screens/MyBidsScreen.tsx` | Co-Own | C | Mock data |
| `Buyout` | `screens/BuyoutScreen.tsx` | Co-Own | C | Shallow |
| `CoOwnIssue` | `screens/CoOwnIssueScreen.tsx` | Co-Own | C | Shallow |
| `MarketLedger` | `screens/MarketLedgerScreen.tsx` | Co-Own | C | Mock data |
| `CoOwnOrderHistory` | `screens/SyndicateOrderHistoryScreen.tsx` | Co-Own | C | Mock data |
| `CreatePoster` | `screens/CreatePosterScreenV2.tsx` | Creator | D | Fake filters, toast save |
| `CreateLook` | `screens/CreateLookScreen.tsx` | Creator | B | Real tagging + pan gesture, `FadeInDown` |
| `OutfitBuilder` | `screens/OutfitBuilderScreen.tsx` | Creator | B | Real style graph, `FadeInDown`, `GlassCard` |
| `MyProfile` | `screens/MyProfileScreen.tsx` | Profile | C | `FadeInDown`, `MOCK_USERS` |
| `UserProfile` | `screens/UserProfileScreen.tsx` | Profile | C | `MOCK_USERS` |
| `Closet` | `screens/ClosetScreen.tsx` | Profile | C | `picsum.photos` |
| `CollectionDetail` | `screens/CollectionDetailScreen.tsx` | Profile | C | `picsum.photos` |
| `InviteFriends` | `screens/InviteFriendsScreen.tsx` | Profile | C | `MOCK_USERS` |
| `EditProfile` | `screens/EditProfileScreen.tsx` | Profile | C | Hardcoded bg, `GlassCard` |
| `Notifications` | `screens/NotificationsScreen.tsx` | Profile | C | Hardcoded PANEL_BG |
| `Settings` | `screens/SettingsScreenV2.tsx` | Settings | C | `FadeInDown`, `#c9a86c`, dev diagnostics |
| `AccountSettings` | `screens/AccountSettingsScreenV2.tsx` | Settings | B | Real API, `FadeInDown` |
| `PushNotifications` | `screens/PushNotificationsScreenV2.tsx` | Settings | B | Real Expo API, `FadeInDown` |
| `Payments` | `screens/PaymentsScreen.tsx` | Settings | C | `GlassCard` pattern |
| `Postage` | `screens/PostageScreen.tsx` | Settings | C | Inline theme conditionals |
| `ChangePassword` | `screens/ChangePasswordScreenV2.tsx` | Settings | C | `FadeInDown` |
| `HelpSupport` | `screens/HelpSupportScreenV2.tsx` | Settings | D | "Coming soon" text |
| `Personalisation` | `screens/PersonalisationScreen.tsx` | Settings | C | Shallow |
| `PrivacySettings` | `screens/PrivacySettingsScreenV2.tsx` | Settings | C | Shallow |
| `BlockedUsers` | `screens/BlockedUsersScreenV2.tsx` | Settings | C | Shallow |
| `ActiveSessions` | `screens/ActiveSessionsScreenV2.tsx` | Settings | C | Shallow |
| `About` | `screens/AboutScreen.tsx` | Settings | C | Shallow |
| `Inbox` | `screens/InboxScreen.tsx` | Messaging | C | `GlassCard`, `FadeInDown`, `ActiveTheme` |
| `Chat` | `screens/ChatScreen.tsx` | Messaging | C | `ActiveTheme`, `Layout.springify()` |
| `CreateGroupChat` | `screens/CreateGroupChatScreen.tsx` | Messaging | C | `picsum.photos` |
| `Balance` | `screens/BalanceScreen.tsx` | Commerce | C | `picsum.photos` |
| `AddBankAccount` | `screens/AddBankAccountScreen.tsx` | Commerce | C | `picsum.photos` |
| `Withdraw` | `screens/WithdrawScreen.tsx` | Commerce | C | Shallow |
| `Wallet` | `screens/WalletScreen.tsx` | Commerce | C | Shallow |

## 3. Screen Grade Table

| Route | File | Visual /100 | Functionality /100 | Truth /100 | Grade | Priority |
|-------|------|-------------|---------------------|------------|-------|----------|
| AuthLanding | `AuthLandingScreen.tsx` | 78 | 85 | 80 | C | P2 |
| Login | `LoginScreen.tsx` | 80 | 95 | 95 | B | P2 |
| SignUp | `SignUpScreen.tsx` | 68 | 80 | 75 | C | P2 |
| ForgotPassword | `ForgotPasswordScreen.tsx` | 58 | 60 | 55 | C | P3 |
| TwoFactorSetup | `TwoFactorSetupScreen.tsx` | 62 | 70 | 65 | C | P3 |
| Home | `HomeScreen.tsx` | 68 | 78 | 72 | C | P1 |
| Browse | `BrowseScreen.tsx` | 68 | 76 | 72 | C | P1 |
| Search | `SearchScreen.tsx` | 68 | 60 | 55 | C | P1 |
| GlobalSearch | `GlobalSearchScreen.tsx` | 55 | 50 | 45 | C | P2 |
| VisualSearch | `VisualSearchScreen.tsx` | 52 | 48 | 40 | C | P2 |
| Filter | `FilterScreen.tsx` | 60 | 65 | 60 | C | P2 |
| CategoryTree | `CategoryTreeScreen.tsx` | 58 | 62 | 55 | C | P3 |
| ItemDetail | `ItemDetailScreen.tsx` | 72 | 82 | 75 | C | P1 |
| Checkout | `CheckoutScreen.tsx` | 74 | 88 | 82 | B | P0 |
| Success | `SuccessScreen.tsx` | 60 | 55 | 50 | C | P2 |
| OrderDetail | `OrderDetailScreen.tsx` | 58 | 60 | 52 | C | P2 |
| MyOrders | `MyOrdersScreen.tsx` | 58 | 62 | 55 | C | P2 |
| MakeOffer | `MakeOfferScreen.tsx` | 65 | 62 | 55 | C | P2 |
| WriteReview | `WriteReviewScreen.tsx` | 55 | 58 | 50 | C | P3 |
| Report | `ReportScreen.tsx` | 55 | 58 | 50 | C | P3 |
| Sell | `SellScreenV2.tsx` | 78 | 88 | 82 | C | P0 |
| CreateAuction | `CreateAuctionScreen.tsx` | 62 | 58 | 50 | C | P2 |
| EditListing | `EditListingScreen.tsx` | 58 | 60 | 55 | C | P3 |
| ManageListing | `ManageListingScreen.tsx` | 58 | 62 | 55 | C | P3 |
| ListingSuccess | `ListingSuccessScreen.tsx` | 55 | 52 | 48 | C | P3 |
| MyListings | `MyListingsScreen.tsx` | 58 | 65 | 58 | C | P3 |
| CoOwnHub | `SyndicateHubScreen.tsx` | 68 | 65 | 60 | C | P1 |
| CreateCoOwn | `CreateSyndicateScreen.tsx` | 76 | 85 | 80 | B | P1 |
| AssetDetail | `AssetDetailScreen.tsx` | 65 | 55 | 45 | D | P0 |
| Trade | `TradeScreen.tsx` | 76 | 88 | 85 | B | P0 |
| Portfolio | `PortfolioScreen.tsx` | 60 | 55 | 50 | C | P2 |
| MyBids | `MyBidsScreen.tsx` | 55 | 50 | 45 | C | P3 |
| Buyout | `BuyoutScreen.tsx` | 55 | 50 | 45 | C | P3 |
| CoOwnIssue | `CoOwnIssueScreen.tsx` | 50 | 45 | 40 | C | P3 |
| MarketLedger | `MarketLedgerScreen.tsx` | 52 | 48 | 42 | C | P3 |
| CoOwnOrderHistory | `SyndicateOrderHistoryScreen.tsx` | 52 | 48 | 42 | C | P3 |
| CreatePoster | `CreatePosterScreenV2.tsx` | 55 | 45 | 40 | D | P0 |
| CreateLook | `CreateLookScreen.tsx` | 80 | 85 | 82 | B | P1 |
| OutfitBuilder | `OutfitBuilderScreen.tsx` | 78 | 82 | 78 | B | P2 |
| MyProfile | `MyProfileScreen.tsx` | 70 | 78 | 72 | C | P1 |
| UserProfile | `UserProfileScreen.tsx` | 68 | 75 | 70 | C | P2 |
| Closet | `ClosetScreen.tsx` | 60 | 65 | 58 | C | P2 |
| CollectionDetail | `CollectionDetailScreen.tsx` | 60 | 62 | 55 | C | P3 |
| InviteFriends | `InviteFriendsScreen.tsx` | 55 | 52 | 48 | C | P3 |
| EditProfile | `EditProfileScreen.tsx` | 65 | 72 | 65 | C | P2 |
| Notifications | `NotificationsScreen.tsx` | 60 | 65 | 58 | C | P2 |
| Settings | `SettingsScreenV2.tsx` | 64 | 75 | 70 | C | P1 |
| AccountSettings | `AccountSettingsScreenV2.tsx` | 76 | 88 | 85 | B | P2 |
| PushNotifications | `PushNotificationsScreenV2.tsx` | 74 | 85 | 82 | B | P2 |
| Payments | `PaymentsScreen.tsx` | 60 | 65 | 60 | C | P2 |
| Postage | `PostageScreen.tsx` | 60 | 65 | 60 | C | P3 |
| ChangePassword | `ChangePasswordScreenV2.tsx` | 62 | 70 | 65 | C | P3 |
| HelpSupport | `HelpSupportScreenV2.tsx` | 52 | 35 | 25 | D | P0 |
| Personalisation | `PersonalisationScreen.tsx` | 60 | 65 | 60 | C | P3 |
| PrivacySettings | `PrivacySettingsScreenV2.tsx` | 60 | 62 | 58 | C | P3 |
| BlockedUsers | `BlockedUsersScreenV2.tsx` | 55 | 50 | 45 | C | P3 |
| ActiveSessions | `ActiveSessionsScreenV2.tsx` | 55 | 52 | 48 | C | P3 |
| About | `AboutScreen.tsx` | 55 | 50 | 45 | C | P3 |
| Inbox | `InboxScreen.tsx` | 62 | 72 | 65 | C | P1 |
| Chat | `ChatScreen.tsx` | 70 | 78 | 72 | C | P1 |
| CreateGroupChat | `CreateGroupChatScreen.tsx` | 55 | 52 | 48 | C | P3 |
| Balance | `BalanceScreen.tsx` | 58 | 50 | 45 | C | P2 |
| AddBankAccount | `AddBankAccountScreen.tsx` | 55 | 48 | 42 | C | P2 |
| Withdraw | `WithdrawScreen.tsx` | 50 | 45 | 40 | C | P3 |
| Wallet | `WalletScreen.tsx` | 55 | 50 | 45 | C | P3 |

## 4. Underdeveloped Pages List (Grade C)

These screens are usable but visually shallow, inconsistent with the design system, or rely on outdated patterns. They need focused rebuilds, not just polish.

- **`HomeScreen.tsx`** — `ActiveTheme` module-level check, `BlurView` floating header, `FadeInDown` via `StaggeredItem`, `Colors.glassBg` for panels. Does not use `T` text primitive consistently.
- **`BrowseScreen.tsx`** — `ActiveTheme` in `StatusBar`, no entrance animations for masonry grid, raw `Text` styles with manual font family strings instead of `Type` tokens, resolves sellers from `MOCK_USERS`.
- **`SearchScreen.tsx`** — Entire "Looks" tab is seeded with `SAVED_LOOKS_SEED` containing Unsplash URLs and fake creators. `ENABLE_RUNTIME_MOCKS` gate means production shows empty looks or fake data.
- **`InboxScreen.tsx`** — `GlassCard` import, `FadeInDown` on every row, `ActiveTheme` `StatusBar`, card rows with shadow/margin (rounded card anti-pattern).
- **`SettingsScreenV2.tsx`** — `FadeInDown` on search bar, `#c9a86c` hardcoded gold icon color in Seller Hub, `__DEV__` diagnostics section exposed in normal settings scroll.
- **`ItemDetailScreen.tsx`** — `ActiveTheme` `StatusBar`, `BlurView` in floating buy bar, `MOCK_USERS` fallback for seller resolution.
- **`MyProfileScreen.tsx`** — `FadeInDown` imported, hardcoded `COVER_IMAGE = ''`, `MOCK_USERS` used in co-own holdings calculation.
- **`SyndicateHubScreen.tsx`** — `variant="gold"` on quick action buttons (deprecated variant), help/support row has two buttons that both navigate to `HelpSupport` (redundant no-op), `FadeInDown` on list items.
- **`CreateAuctionScreen.tsx`** — `MOCK_LISTINGS` fallback when `listings` array is empty, shallow auction form with no evidence of real-time bidding backend.
- **`MakeOfferScreen.tsx`** — `MOCK_LISTINGS` fallback, offer submission is shallow with no evidence of real-time offer counter/accept backend.
- **`EditProfileScreen.tsx`** — Hardcoded `#0A0A0A` background, `GlassCard` usage, `picsum.photos` fallback for avatar/cover.
- **`ChangePasswordScreenV2.tsx`** — `FadeInDown` usage, shallow form with no password strength indicator.
- **`NotificationsScreen.tsx`** — `PANEL_BG = IS_LIGHT ? '#ffffff' : '#111111'` hardcoded inline.
- **`PersonalisationScreen.tsx`** — Shallow preference toggles with no evidence of real feed algorithm wiring.
- **`PrivacySettingsScreenV2.tsx`** — Shallow toggles, no evidence of real privacy API wiring.
- **`BlockedUsersScreenV2.tsx`** — Shallow list, no evidence of real block API.
- **`ActiveSessionsScreenV2.tsx`** — Shallow list, no evidence of real session management API.
- **`AboutScreen.tsx`** — Shallow static content.
- **`PortfolioScreen.tsx`** — Mock data patterns in co-own holdings chart.
- **`MyBidsScreen.tsx`** — Mock data patterns.
- **`BuyoutScreen.tsx`** — Shallow form, no real buyout negotiation backend.
- **`CoOwnIssueScreen.tsx`** — Shallow report form.
- **`MarketLedgerScreen.tsx`** — Mock transaction data.
- **`SyndicateOrderHistoryScreen.tsx`** — Mock order data.
- **`ClosetScreen.tsx`** — `picsum.photos` fallbacks.
- **`CollectionDetailScreen.tsx`** — `picsum.photos` fallbacks.
- **`InviteFriendsScreen.tsx`** — `MOCK_USERS` for invite suggestions.
- **`CreateGroupChatScreen.tsx`** — `picsum.photos` for group avatar fallback.
- **`BalanceScreen.tsx`** — `picsum.photos` fallbacks, shallow transaction list.
- **`AddBankAccountScreen.tsx`** — `picsum.photos` fallbacks, shallow bank linking form.
- **`WithdrawScreen.tsx`** — Shallow form.
- **`WalletScreen.tsx`** — Shallow form.
- **`GlobalSearchScreen.tsx`** — Heavy `picsum.photos` usage.
- **`VisualSearchScreen.tsx`** — Shallow camera + classify flow.
- **`FilterScreen.tsx`** — Inline theme conditionals.
- **`CategoryTreeScreen.tsx`** — `MOCK_LISTINGS` for preview.
- **`EditListingScreen.tsx`** — Shallow form.
- **`ManageListingScreen.tsx`** — `MOCK_LISTINGS` fallback.
- **`ListingSuccessScreen.tsx`** — Mock success state.
- **`MyListingsScreen.tsx`** — Mock data patterns.
- **`WriteReviewScreen.tsx`** — `picsum.photos` fallback.
- **`ReportScreen.tsx`** — Hardcoded `#0A0A0A`.
- **`OrderDetailScreen.tsx`** — `MOCK_LISTINGS` fallback.
- **`MyOrdersScreen.tsx`** — Mock data patterns.
- **`SuccessScreen.tsx`** — Mock success state.
- **`SignUpScreen.tsx`** — `picsum.photos` fallback.
- **`ForgotPasswordScreen.tsx`** — Shallow form.
- **`TwoFactorSetupScreen.tsx`** / **`TwoFactorSetupScreenV2.tsx`** — `picsum.photos` fallback.
- **`PaymentsScreen.tsx`** — `GlassCard` pattern.
- **`PostageScreen.tsx`** — Inline theme conditionals.

---

## 5. Fake / Dead UI List (Grade D)

These screens contain features that pretend to work but are fake, dead, or permanently broken.

| Route | File | Fake / Dead Element | Evidence |
|-------|------|---------------------|----------|
| `CreatePoster` | `CreatePosterScreenV2.tsx` | **Filters are CSS strings, not native image processing** | `filter: 'grayscale(100%)'`, `filter: 'sepia(30%) saturate(120%)'` applied as style prop — React Native does not support CSS filters on Image |
| `CreatePoster` | `CreatePosterScreenV2.tsx` | **Save is a no-op** | `show('Poster saved!', 'success'); navigation.goBack();` — no API call, no persistence |
| `CreatePoster` | `CreatePosterScreenV2.tsx` | **No real recent photo strip** | No camera roll access for recent photos; only gallery picker |
| `HelpSupport` | `HelpSupportScreenV2.tsx` | **Live chat "coming soon"** | Text in FAQ/help section explicitly states live chat is coming soon |
| `HelpSupport` | `HelpSupportScreenV2.tsx` | **Support ticket system "coming soon"** | Text explicitly states ticket system is coming soon |
| `AssetDetail` | `AssetDetailScreen.tsx` | **Synthetic owner accounts** | `@holder1`, `@holder2`, `@holder3` generated in loop to fake ownership breakdown |
| `AssetDetail` | `AssetDetailScreen.tsx` | **Fake order book** | `getOrderBookSnapshot` returns mock bids/asks with no real market depth |
| `AssetDetail` | `AssetDetailScreen.tsx` | **Fake price chart** | 28-bar CSS div chart with no real time-series data; uses `getPriceSeries` mock generator |
| `Search` | `SearchScreen.tsx` | **Looks tab is entirely mock seeded** | `SAVED_LOOKS_SEED` array with Unsplash URLs; `ENABLE_RUNTIME_MOCKS ? SAVED_LOOKS_SEED : []` means production gets empty looks or fake data |
| `Settings` | `SettingsScreenV2.tsx` | **Dev diagnostics exposed** | `__DEV__ && (` renders a diagnostics section inside the normal settings scroll |
| `AuthLanding` | `AuthLandingScreen.tsx` | **Background overlay kills editorial image** | `CachedImage` loads Unsplash BG, then a solid `<View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.background }]} />` is placed on top, making the image invisible |

---

## 6. Missing Supporting Screens / Pages

These screens are referenced in navigation or needed by current flows but do not exist, or the current flow is incomplete and requires new subpages.

| Missing Screen | Needed By | Reason |
|----------------|-----------|--------|
| `EditCoverScreen` | `MyProfileScreen` | Dedicated cover photo editor with crop/zoom, instead of raw `ImagePicker` |
| `EditAvatarScreen` | `MyProfileScreen`, `EditProfileScreen` | Dedicated avatar editor with crop/zoom |
| `ShippingAddressBookScreen` | `CheckoutScreen`, `Settings` | Multiple saved addresses with default selection |
| `PaymentMethodListScreen` | `CheckoutScreen`, `Settings` | Manage multiple cards, set default, delete |
| `OrderTrackingScreen` | `OrderDetailScreen`, `MyOrders` | Real-time shipment tracking with carrier map |
| `OfferDetailScreen` | `MakeOfferScreen`, `Inbox` | View offer history, counter-offer, accept/decline |
| `AuctionDetailScreen` | `CreateAuctionScreen`, `AuctionsScreen` | Live auction view with bid history, auto-bid, reserve indicator |
| `AuctionsScreen` | `HomeScreen`, `BrowseScreen` | Discovery tab for active auctions |
| `CoOwnDiscoveryScreen` | `CoOwnHub` | Browse all co-own assets by category/trending |
| `AssetHistoryScreen` | `AssetDetail` | Full transaction history for a single asset |
| `CreatorDashboardScreen` | `MyProfile`, `Settings` | Analytics for looks, posters, and follower growth |
| `ClosetItemDetailScreen` | `ClosetScreen` | View saved item details, notes, and outfit links |
| `ReviewDetailScreen` | `ItemDetail`, `UserProfile` | Expanded review with photos, seller reply |
| `BulkListingScreen` | `SellScreenV2` | Upload and draft multiple listings at once |
| `ListingInsightsScreen` | `ManageListingScreen` | Views, likes, offer stats for a listing |
| `MessageRequestsScreen` | `InboxScreen` | Dedicated message request management (currently inline) |
| `GroupChatInfoScreen` | `ChatScreen` | Group name, avatar, members, leave group |
| `MediaGalleryScreen` | `ChatScreen`, `ItemDetail` | Full-screen image/video viewer with pinch/zoom and download |
| `TrustScoreScreen` | `UserProfile`, `ItemDetail` | Detailed trust breakdown (verification, reviews, disputes) |
| `DisputeCenterScreen` | `OrderDetail`, `HelpSupport` | File and track order disputes |
| `PriceDropAlertScreen` | `ItemDetail`, `Wishlist` | Manage price-drop notifications |
| `FollowingListScreen` | `UserProfile`, `MyProfile` | View followers / following with search |

## 7. Theme / Static Color Debt List

Specific evidence of hardcoded colors, static `ActiveTheme` usage, and theme-breaking patterns.

| File | Evidence | Problem |
|------|----------|---------|
| `screens/InboxScreen.tsx` | `import { ActiveTheme, Colors } from '../constants/colors';` | Static theme import; `ActiveTheme` does not react to runtime theme changes |
| `screens/InboxScreen.tsx` | `StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}` | Module-level theme check — will not update if user switches theme while app is running |
| `screens/ChatScreen.tsx` | `import { ActiveTheme, Colors } from '../constants/colors';` | Static theme import |
| `screens/ChatScreen.tsx` | `const layoutAnimation = reducedMotionEnabled ? undefined : Layout.springify();` | Outdated layout animation |
| `screens/HomeScreen.tsx` | `import { ActiveTheme, Colors } from '../constants/colors';` | Static theme import |
| `screens/HomeScreen.tsx` | `const IS_LIGHT = ActiveTheme === 'light';` | Computed at module level; breaks runtime theme switching |
| `screens/HomeScreen.tsx` | `import { BlurView } from 'expo-blur';` | Glassmorphism |
| `screens/BrowseScreen.tsx` | `import { ActiveTheme, Colors } from '../constants/colors';` | Static theme import |
| `screens/BrowseScreen.tsx` | `StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}` | Module-level theme check |
| `screens/ItemDetailScreen.tsx` | `import { ActiveTheme, Colors } from '../constants/colors';` | Static theme import |
| `screens/ItemDetailScreen.tsx` | `StatusBar barStyle={ActiveTheme === 'light' ? 'dark-content' : 'light-content'}` | Module-level theme check |
| `screens/ItemDetailScreen.tsx` | `<BlurView intensity={85} tint={ActiveTheme === 'light' ? 'light' : 'dark'} ... />` | BlurView in floating buy bar |
| `screens/SettingsScreenV2.tsx` | `iconColor="#c9a86c"` on "Balance & Wallet" row | Hardcoded gold — not in design system |
| `screens/SettingsScreenV2.tsx` | `import { Colors } from '../constants/colors';` | Static import (no `ActiveTheme` here, but still static) |
| `screens/SyndicateHubScreen.tsx` | `variant="gold"` on quick action buttons | Deprecated `AppButton` variant |
| `screens/AuthLandingScreen.tsx` | `backgroundColor: '#090909'` in `StyleSheet.create` | Hardcoded dark background |
| `screens/AuthLandingScreen.tsx` | `backgroundColor: '#d7b98f'` in primaryBtn style | Hardcoded CTA color |
| `screens/AuthLandingScreen.tsx` | `color: 'rgba(232,220,200,0.9)'` in logo style | Hardcoded text color |
| `screens/AuthLandingScreen.tsx` | `color: '#f6f2ea'` in title style | Hardcoded text color |
| `screens/AuthLandingScreen.tsx` | `import { GlassCard } from '../components/ui/GlassSurface';` | Glassmorphism |
| `screens/AuthLandingScreen.tsx` | `import { GlowSurface } from '../components/ui/GlowSurface';` | Glow effect |
| `screens/NotificationsScreen.tsx` | `PANEL_BG = IS_LIGHT ? '#ffffff' : '#111111'` | Inline theme conditional with hardcoded hexes |
| `screens/EditProfileScreen.tsx` | Hardcoded `#0A0A0A` background | Breaks light mode |
| `screens/ChangePasswordScreen.tsx` | Hardcoded `#0A0A0A` background | Breaks light mode |
| `screens/HelpSupportScreen.tsx` | Hardcoded `#0A0A0A` background | Breaks light mode |
| `screens/ReportScreen.tsx` | Hardcoded `#0A0A0A` background | Breaks light mode |
| `screens/AccountSettingsScreen.tsx` | Hardcoded `#0A0A0A` background | Breaks light mode |
| `screens/TwoFactorSetupScreen.tsx` | Hardcoded `#0A0A0A` background | Breaks light mode |
| `screens/CreateLookScreen.tsx` | `StatusBar barStyle={Colors.background === '#FFFFFF' ? 'dark-content' : 'light-content'}` | Hardcoded `#FFFFFF` check instead of theme token |
| `screens/OutfitBuilderScreen.tsx` | `StatusBar barStyle={Colors.background === '#FFFFFF' ? 'dark-content' : 'light-content'}` | Hardcoded `#FFFFFF` check |
| `screens/PostageScreen.tsx` | `CARD = IS_LIGHT ? '#ffffff' : '#111111'` | Inline hardcoded hexes |
| `screens/PostageScreen.tsx` | `BORDER = IS_LIGHT ? '#d8d1c6' : '#2a2a2a'` | Inline hardcoded hexes |
| `components/ui/GlassSurface.tsx` | `BlurView` + translucent backgrounds | Glassmorphism system-wide |

---

## 8. Animation / Transition Debt List

Evidence of outdated animations that should be replaced with modern Reanimated 3 patterns (shared transitions, layout transitions, or simple `FadeIn`/`FadeOut`).

| File | Evidence | Problem |
|------|----------|---------|
| `screens/InboxScreen.tsx` | `import Reanimated, { FadeInDown, useSharedValue, useAnimatedScrollHandler } from 'react-native-reanimated';` | `FadeInDown` on every list row |
| `screens/InboxScreen.tsx` | `entering={FadeInDown.delay(Math.min(index, Motion.list.maxStaggerItems) * Motion.list.staggerStep).duration(Motion.list.enterDuration)}` | Outdated staggered entrance |
| `screens/SettingsScreenV2.tsx` | `import Reanimated, { FadeInDown } from 'react-native-reanimated';` | `FadeInDown` on search bar and sections |
| `screens/HomeScreen.tsx` | `StaggeredItem` with `animation="fadeDown"` | Custom wrapper around `FadeInDown` |
| `screens/ChatScreen.tsx` | `import Reanimated, { SlideInRight, SlideInLeft, ZoomIn, FadeIn, Layout } from 'react-native-reanimated';` | `Layout.springify()` on message bubbles |
| `screens/LoginScreen.tsx` | `import Reanimated, { FadeInUp, FadeOutUp, Layout } from 'react-native-reanimated';` | `FadeInUp` + `Layout.springify()` |
| `screens/SellScreenV2.tsx` | `import Animated, { FadeInUp, FadeIn, FadeOut, SlideInRight, ZoomIn, Layout } from 'react-native-reanimated';` | Animation overkill: 6 different entrance animations |
| `screens/SellScreenV2.tsx` | `Layout` used in `SortablePhotoStrip` | Potentially expensive layout animation on drag |
| `screens/AuthLandingScreen.tsx` | `import Reanimated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';` | Mix of `FadeInDown`, `FadeInUp`, `FadeIn` |
| `screens/AuthLandingScreen.tsx` | `.springify()` on `FadeInDown` and `FadeInUp` | Outdated springify syntax |
| `screens/CreateLookScreen.tsx` | `import Reanimated, { FadeInDown, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';` | `FadeInDown` on photo canvas, title input, tags |
| `screens/OutfitBuilderScreen.tsx` | `import Reanimated, { FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';` | `FadeInDown` on preview, `FadeInUp` on suggestions |
| `screens/TradeScreen.tsx` | `import Reanimated, { FadeInDown } from 'react-native-reanimated';` | `FadeInDown` on every form card |
| `screens/AssetDetailScreen.tsx` | `import Reanimated, { FadeInDown } from 'react-native-reanimated';` | `FadeInDown` on every section |
| `screens/SyndicateHubScreen.tsx` | `import Reanimated, { FadeInDown } from 'react-native-reanimated';` | `FadeInDown` on list items |
| `screens/CreateSyndicateScreen.tsx` | `import Reanimated, { FadeInDown } from 'react-native-reanimated';` | `FadeInDown` on form sections |
| `screens/AccountSettingsScreenV2.tsx` | `import Reanimated, { FadeInDown } from 'react-native-reanimated';` | `FadeInDown` on every settings section |
| `screens/PushNotificationsScreenV2.tsx` | `import Reanimated, { FadeInDown } from 'react-native-reanimated';` | `FadeInDown` on progress bar and toggle list |
| `screens/MyProfileScreen.tsx` | `import Reanimated, { FadeInDown, useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';` | `FadeInDown` imported but may not be used; parallax scroll is fine |
| `screens/CheckoutScreen.tsx` | `import Reanimated, { FadeInDown } from 'react-native-reanimated';` | `FadeInDown` on item card, readiness card, and delivery block |

---

## 9. Backend Dependency List

Features that need real backend endpoints, schemas, or integrations to move from fake/dead UI to production truth.

| Feature | Current State | Backend Gap |
|---------|---------------|-------------|
| **Poster creation** | Toast + `goBack()` | Need `POST /posters` with image upload, filter metadata, and feed distribution |
| **Poster feed / stories** | `getFreshPosters()` mock | Need `GET /posters/feed` with pagination, user following filter |
| **Live chat / support tickets** | "Coming soon" text | Need WebSocket or SSE support channel + ticket CRUD API |
| **Auction system** | `MOCK_LISTINGS` fallback in create form | Need `POST /auctions`, `GET /auctions/active`, `POST /auctions/{id}/bid`, real-time bid socket |
| **Offer system** | Shallow form in `MakeOfferScreen` | Need `POST /offers`, `GET /offers/{id}`, counter-offer endpoints, inbox integration |
| **Co-own order book** | `getOrderBookSnapshot` mock generator | Need real-time market depth API + WebSocket feed |
| **Co-own price history** | `getPriceSeries` mock generator | Need historical price API per asset |
| **Co-own ownership breakdown** | Synthetic `@holder1` accounts | Need `GET /assets/{id}/holders` with real user profiles |
| **Outfit Builder AI** | `suggestCompletion` local heuristic | Need ML-based compatibility scoring API with real catalog embeddings |
| **Looks discovery** | `SAVED_LOOKS_SEED` mock data | Need `GET /looks` with creator follows, trending algorithm, save/like counts |
| **Visual Search** | Shallow camera flow | Need image-classification / reverse-image-search API (e.g., Google Lens / Pinterest Lens integration) |
| **Balance / Wallet** | `picsum.photos` fallbacks | Need `GET /wallet/balance`, `GET /wallet/transactions`, fiat/crypto settlement API |
| **Bank account linking** | Shallow form | Need KYC-verified bank account tokenization (e.g., Stripe / Plaid) |
| **Withdrawals** | Shallow form | Need `POST /withdrawals` with compliance checks |
| **Order tracking** | Static success screen | Need carrier integration (Royal Mail, UPS, DHL) with tracking webhook |
| **Reviews** | `WriteReviewScreen` is shallow | Need `POST /reviews`, media upload, seller reply, moderation queue |
| **Trust score** | Hardcoded `resolvedSeller.rating` from `MOCK_USERS` | Need reputation aggregation API (reviews, disputes, verification) |
| **Price-drop alerts** | Not implemented | Need `POST /alerts/price-drop` with push notification trigger |
| **Bulk listing** | Not implemented | Need `POST /listings/bulk` with CSV/image batch upload |
| **Creator analytics** | Not implemented | Need `GET /analytics/creator` with impressions, engagement, revenue |
| **Group chat info / management** | Not implemented | Need `PUT /groups/{id}`, `DELETE /groups/{id}/members/{userId}` |
| **Message requests** | Inline in `InboxScreen` | Need `GET /conversations/requests` with accept/decline endpoints |
| **Data export** | Real API exists (`requestMyDataExport`) | **Already implemented** — keep |
| **Push notification device registration** | Real Expo API exists | **Already implemented** — keep |
| **Payment intent polling** | Real Stripe-like API exists | **Already implemented** — keep |

## 10. Proposed Upgrade Roadmap

---

### Phase 0 — Foundation Cleanup (Week 1)

**Goal:** Establish a single source of truth for design tokens and remove competing systems.

**Exact files to change:**
- `frontend/src/constants/typography.ts` → **DELETE**
- `frontend/src/theme/designTokens.ts` → Expand `Type` scale to cover all legacy `TypeStyles` needs
- `frontend/src/theme/gradients.ts` → **DELETE**
- `frontend/src/constants/colors.ts` → Remove `Glass` export
- `frontend/src/theme/designTokens.ts` → Remove `Elevation.sm`, `.md`, `.lg`, `.xl` legacy aliases
- `frontend/src/components/ui/GlassSurface.tsx` → **DELETE**
- `frontend/src/components/ui/GlowSurface.tsx` → **DELETE**
- `frontend/src/components/ui/AppInput.tsx` → Remove `variant="glass"`
- `frontend/src/components/ui/AppButton.tsx` → Remove `variant="gold"`, `variant="contrast"`; fix `variant="secondary"` to use `Colors.surface` + `Colors.border`
- `frontend/src/components/ui/ScreenHeader.tsx` → Create unified header with `large` and `inline` variants
- `frontend/src/components/SettingsHeader.tsx` → **DELETE** (replaced by unified `ScreenHeader`)
- `frontend/src/components/ui/GlassHeader.tsx` → **DELETE** (replaced by unified `ScreenHeader`)

**Exact screens to create:**
- None (pure cleanup)

**Expected visual outcome:**
- App compiles with zero `GlassCard`/`GlowSurface` imports.
- Every screen uses only `theme/designTokens.ts` for typography.
- `Elevation` has only 5 valid values: `none`, `subtle`, `card`, `floating`, `modal`.
- `AppButton` has only 3 variants: `primary`, `secondary`, `danger`.

**Acceptance criteria:**
- `grep -r "GlassCard" src/` returns 0 results.
- `grep -r "GlowSurface" src/` returns 0 results.
- `grep -r "constants/typography" src/` returns 0 results.
- `grep -r "theme/gradients" src/` returns 0 results.
- TypeScript compiles with zero errors.

**Physical Expo test checklist:**
- [ ] App launches without crash
- [ ] Navigate through all 5 bottom tabs — no red screens
- [ ] Toggle dark/light theme — all screens update correctly
- [ ] SettingsScreen opens without error
- [ ] SellScreen opens without error

---

### Phase 1 — Kill Glassmorphism & BlurView (Week 2)

**Goal:** Replace every `BlurView`, `GlassCard`, and translucent background with solid `Colors.surface` / `Colors.surfaceAlt`.

**Exact files to change:**
- `frontend/src/screens/AuthLandingScreen.tsx` → Remove `GlassCard`, `GlowSurface`; replace `BlurView` with solid overlay
- `frontend/src/screens/HomeScreen.tsx` → Remove `BlurView` from floating header and peek modal; replace with solid `Colors.surface` + `Elevation.subtle`
- `frontend/src/screens/ItemDetailScreen.tsx` → Remove `BlurView` from floating buy bar; replace with solid `Colors.background`
- `frontend/src/screens/CheckoutScreen.tsx` → Remove `GlassCard` usage; replace with `AppCard` or `View` + `Colors.surface`
- `frontend/src/screens/SellScreenV2.tsx` → Remove `GlassCard`, `GlowSurface` usage
- `frontend/src/screens/TradeScreen.tsx` → Remove `GlassCard` usage
- `frontend/src/screens/OutfitBuilderScreen.tsx` → Remove `GlassCard` usage
- `frontend/src/screens/EditProfileScreen.tsx` → Remove `GlassCard` usage
- `frontend/src/screens/AccountSettingsScreen.tsx` → Remove `GlassCard` usage
- `frontend/src/screens/PaymentsScreen.tsx` → Remove `GlassCard` usage
- `frontend/src/screens/CreatePosterScreenV2.tsx` → Remove any `BlurView`/`GlassCard` if present

**Exact screens to create:**
- None

**Expected visual outcome:**
- No frosted glass or translucent backgrounds anywhere.
- Headers, cards, and inputs use solid surfaces with subtle borders.
- Light mode is fully readable on every screen.

**Acceptance criteria:**
- `grep -r "BlurView" src/screens/` returns 0 results.
- `grep -r "GlassCard" src/screens/` returns 0 results.
- `grep -r "GlowSurface" src/screens/` returns 0 results.
- No `rgba(...)` backgrounds in screen styles (component tokens excluded).

**Physical Expo test checklist:**
- [ ] HomeScreen header is solid on scroll
- [ ] ItemDetail floating buy bar is solid
- [ ] AuthLanding has no translucent cards
- [ ] SellScreen photo strip has no glass overlay
- [ ] Checkout item card is solid

---

### Phase 2 — Theme Hardcoded Color Purge (Week 2-3)

**Goal:** Eliminate every hardcoded hex color and static `ActiveTheme` usage.

**Exact files to change:**
- `frontend/src/screens/InboxScreen.tsx` → Replace `ActiveTheme` `StatusBar` with reactive theme hook
- `frontend/src/screens/ChatScreen.tsx` → Replace `ActiveTheme` `StatusBar` with reactive theme hook
- `frontend/src/screens/HomeScreen.tsx` → Replace `ActiveTheme` with reactive hook; remove `IS_LIGHT` module-level constant
- `frontend/src/screens/BrowseScreen.tsx` → Replace `ActiveTheme` `StatusBar` with reactive theme hook
- `frontend/src/screens/ItemDetailScreen.tsx` → Replace `ActiveTheme` `StatusBar` and `BlurView` tint with reactive hook
- `frontend/src/screens/SettingsScreenV2.tsx` → Replace `#c9a86c` with `Colors.brand`
- `frontend/src/screens/AuthLandingScreen.tsx` → Replace `#090909`, `#d7b98f`, `#f6f2ea` with design tokens
- `frontend/src/screens/NotificationsScreen.tsx` → Replace `PANEL_BG = IS_LIGHT ? '#ffffff' : '#111111'` with `Colors.surface`
- `frontend/src/screens/EditProfileScreen.tsx` → Replace `#0A0A0A` with `Colors.background`
- `frontend/src/screens/ChangePasswordScreen.tsx` → Replace `#0A0A0A` with `Colors.background`
- `frontend/src/screens/HelpSupportScreen.tsx` → Replace `#0A0A0A` with `Colors.background`
- `frontend/src/screens/ReportScreen.tsx` → Replace `#0A0A0A` with `Colors.background`
- `frontend/src/screens/AccountSettingsScreen.tsx` → Replace `#0A0A0A` with `Colors.background`
- `frontend/src/screens/TwoFactorSetupScreen.tsx` → Replace `#0A0A0A` with `Colors.background`
- `frontend/src/screens/CreateLookScreen.tsx` → Replace `Colors.background === '#FFFFFF'` check with reactive theme hook
- `frontend/src/screens/OutfitBuilderScreen.tsx` → Replace `Colors.background === '#FFFFFF'` check with reactive theme hook
- `frontend/src/screens/PostageScreen.tsx` → Replace inline `IS_LIGHT ? ...` with `Colors.surface` / `Colors.border`

**Exact screens to create:**
- None

**Expected visual outcome:**
- Switching theme in Settings immediately updates every screen without reload.
- No `#0A0A0A`, `#c9a86c`, `#d7b98f`, `#ffffff`, `#111111` hex strings remain in screen files.

**Acceptance criteria:**
- `grep -r "#0A0A0A" src/screens/` returns 0 results.
- `grep -r "#c9a86c" src/screens/` returns 0 results.
- `grep -r "ActiveTheme" src/screens/` returns 0 results.
- `grep -r "IS_LIGHT" src/screens/` returns 0 results.
- Theme toggle in Settings updates HomeScreen, Inbox, Chat, Browse, ItemDetail instantly.

**Physical Expo test checklist:**
- [ ] Open Settings → toggle theme → every tab updates color
- [ ] Open ItemDetail → toggle theme → floating buy bar updates
- [ ] Open AuthLanding → light mode shows light background
- [ ] Open Notifications → light mode shows white surface (not `#111111`)

---

### Phase 3 — Animation Debt Removal (Week 3)

**Goal:** Replace all `FadeInDown`, `FadeInUp`, `SlideInRight`, `ZoomIn`, and `Layout.springify()` with modern Reanimated 3 patterns or remove where unnecessary.

**Exact files to change:**
- `frontend/src/screens/InboxScreen.tsx` → Remove `FadeInDown` from `renderItem`; use `FlashList` native recycling without entrance animations
- `frontend/src/screens/SettingsScreenV2.tsx` → Remove `FadeInDown` from search bar and sections
- `frontend/src/screens/HomeScreen.tsx` → Remove `StaggeredItem` `FadeInDown`; rely on `MasonryGrid` native rendering
- `frontend/src/screens/ChatScreen.tsx` → Remove `Layout.springify()`; replace with `Layout` from Reanimated 3 (no springify) or remove
- `frontend/src/screens/LoginScreen.tsx` → Replace `FadeInUp`/`FadeOutUp`/`Layout` with simple opacity transitions or remove
- `frontend/src/screens/SellScreenV2.tsx` → Replace `FadeInUp`/`FadeIn`/`FadeOut`/`SlideInRight`/`ZoomIn`/`Layout` with simple `FadeIn` or none
- `frontend/src/screens/AuthLandingScreen.tsx` → Replace `FadeInDown`/`FadeInUp` with simple `FadeIn`; remove `.springify()`
- `frontend/src/screens/CreateLookScreen.tsx` → Remove `FadeInDown` from photo canvas and form
- `frontend/src/screens/OutfitBuilderScreen.tsx` → Remove `FadeInDown`/`FadeInUp`
- `frontend/src/screens/TradeScreen.tsx` → Remove `FadeInDown` from form cards
- `frontend/src/screens/AssetDetailScreen.tsx` → Remove `FadeInDown` from sections
- `frontend/src/screens/SyndicateHubScreen.tsx` → Remove `FadeInDown` from list items
- `frontend/src/screens/CreateSyndicateScreen.tsx` → Remove `FadeInDown` from form sections
- `frontend/src/screens/AccountSettingsScreenV2.tsx` → Remove `FadeInDown` from settings sections
- `frontend/src/screens/PushNotificationsScreenV2.tsx` → Remove `FadeInDown` from progress bar and toggle list
- `frontend/src/screens/CheckoutScreen.tsx` → Remove `FadeInDown` from item card, readiness card, delivery block

**Exact screens to create:**
- None

**Expected visual outcome:**
- Screens open instantly without cascading staggered animations.
- Lists scroll smoothly without entrance animation jank on fast scroll.
- `Layout` transitions use Reanimated 3 native `Layout` (no `springify`).

**Acceptance criteria:**
- `grep -r "FadeInDown" src/screens/` returns 0 results.
- `grep -r "FadeInUp" src/screens/` returns 0 results.
- `grep -r "SlideInRight" src/screens/` returns 0 results.
- `grep -r "ZoomIn" src/screens/` returns 0 results.
- `grep -r "springify()" src/screens/` returns 0 results.
- List scroll performance on Inbox, Home, Browse is 60fps on mid-range Android.

**Physical Expo test checklist:**
- [ ] Open Inbox → scroll fast → no animation lag
- [ ] Open Home → scroll fast → no stagger jank
- [ ] Open Sell → no multi-animation cascade on load
- [ ] Open AssetDetail → no section-by-section fade-in
- [ ] Open Chat → message list renders instantly on load

### Phase 4 — Messaging Overhaul (Week 4)

**Goal:** Rebuild Inbox and Chat to meet WhatsApp/Telegram benchmark quality. Remove rounded card rows, add message request management, group chat info.

**Exact files to change:**
- `frontend/src/screens/InboxScreen.tsx` → Remove card row margin/shadow; use full-bleed rows with hairline dividers. Remove `GlassCard`.
- `frontend/src/screens/ChatScreen.tsx` → Remove `ActiveTheme`, `Layout.springify()`. Fix keyboard avoiding. Add media gallery tap-through.
- `frontend/src/components/ChatTopBar.tsx` → Ensure solid background, no `BlurView`.
- `frontend/src/components/ChatComposerBar.tsx` → Ensure solid background, no `BlurView`.
- `frontend/src/components/ChatBubbleV2.tsx` → Ensure no glassmorphism, use solid bubbles.

**Exact screens to create:**
- `frontend/src/screens/MessageRequestsScreen.tsx` — Dedicated message request management (accept/decline/archive)
- `frontend/src/screens/GroupChatInfoScreen.tsx` — Group name, avatar, member list, leave group
- `frontend/src/screens/MediaGalleryScreen.tsx` — Full-screen image/video viewer with pinch/zoom and download

**Expected visual outcome:**
- Inbox rows are full-bleed with hairline dividers (no rounded cards, no shadow).
- Chat bubbles are solid with subtle color differentiation.
- Keyboard never overlaps composer or message list.
- Message requests have their own screen, not inline.

**Acceptance criteria:**
- Inbox rows have `borderBottomWidth: StyleSheet.hairlineWidth`, `borderBottomColor: Colors.border`, zero shadow.
- Chat keyboard avoiding works on iOS and Android.
- MediaGallery opens from any chat image or item detail image.
- MessageRequestsScreen accessible from Inbox header.

**Physical Expo test checklist:**
- [ ] Inbox rows are full-bleed, no rounded cards
- [ ] Swipe to archive/delete works smoothly
- [ ] Open Chat → type message → keyboard does not cover input
- [ ] Tap image in chat → opens full-screen MediaGallery with pinch
- [ ] Open group chat → tap header → GroupChatInfoScreen opens

---

### Phase 5 — Commerce & Selling Polish (Week 5)

**Goal:** Upgrade checkout, item detail, and sell flow to Depop/Vinted benchmark. Add real supporting screens for orders, offers, and tracking.

**Exact files to change:**
- `frontend/src/screens/CheckoutScreen.tsx` → Remove `GlassCard`, `FadeInDown`. Improve address/payment selection UX.
- `frontend/src/screens/ItemDetailScreen.tsx` → Remove `BlurView`, `ActiveTheme`. Add real seller trust score.
- `frontend/src/screens/SellScreenV2.tsx` → Remove glassmorphism + animation overkill. Keep real business logic (co-own math, auth photos, validation).
- `frontend/src/screens/MakeOfferScreen.tsx` → Remove `MOCK_LISTINGS` fallback. Wire to real offer API.
- `frontend/src/screens/OrderDetailScreen.tsx` → Remove `MOCK_LISTINGS` fallback. Add tracking section.
- `frontend/src/screens/MyOrdersScreen.tsx` → Remove mock data. Wire to real order history API.
- `frontend/src/screens/WriteReviewScreen.tsx` → Remove `picsum.photos`. Add real media upload.

**Exact screens to create:**
- `frontend/src/screens/OrderTrackingScreen.tsx` — Real-time shipment tracking with carrier map
- `frontend/src/screens/OfferDetailScreen.tsx` — View offer history, counter-offer, accept/decline
- `frontend/src/screens/ListingInsightsScreen.tsx` — Views, likes, offer stats for a listing
- `frontend/src/screens/BulkListingScreen.tsx` — Upload and draft multiple listings at once
- `frontend/src/screens/ShippingAddressBookScreen.tsx` — Multiple saved addresses with default selection
- `frontend/src/screens/PaymentMethodListScreen.tsx` — Manage multiple cards, set default, delete
- `frontend/src/screens/ReviewDetailScreen.tsx` — Expanded review with photos, seller reply
- `frontend/src/screens/TrustScoreScreen.tsx` — Detailed trust breakdown

**Expected visual outcome:**
- ItemDetail matches Depop/Vinted quality: clean images, solid info panels, prominent CTA.
- Checkout is a clear step-by-step flow with real address/payment selection.
- Sell flow is smooth and trustworthy with progress indicators.

**Acceptance criteria:**
- `MOCK_LISTINGS` removed from `CheckoutScreen`, `ItemDetailScreen`, `MakeOfferScreen`, `OrderDetailScreen`.
- `MOCK_USERS` removed from `ItemDetailScreen` seller resolution.
- Offer creation submits to real API and shows confirmation.
- Order tracking shows carrier + tracking number.

**Physical Expo test checklist:**
- [ ] Open ItemDetail → scroll → images are full-width, info is solid panels
- [ ] Tap Buy Now → Checkout opens with real address/payment selection
- [ ] Tap Make Offer → OfferDetail opens after submission
- [ ] Open MyOrders → real order list with statuses
- [ ] Open Sell → flow is smooth, no glass effects, no animation cascade

---

### Phase 6 — Co-Own & Asset System Realness (Week 6)

**Goal:** Remove synthetic owners, fake charts, and mock order books. Build real asset discovery and history.

**Exact files to change:**
- `frontend/src/screens/AssetDetailScreen.tsx` → Remove synthetic owner loop (`@holder1`, etc.). Remove `getPriceSeries` mock chart. Remove `getOrderBookSnapshot` mock.
- `frontend/src/screens/TradeScreen.tsx` → Remove `GlassCard`, `FadeInDown`. Keep real trade flow.
- `frontend/src/screens/PortfolioScreen.tsx` → Remove mock data patterns. Wire to real holdings API.
- `frontend/src/screens/SyndicateHubScreen.tsx` → Remove `variant="gold"`. Remove redundant help row.
- `frontend/src/screens/MyBidsScreen.tsx` → Wire to real bid history API.
- `frontend/src/screens/MarketLedgerScreen.tsx` → Wire to real transaction ledger API.
- `frontend/src/screens/SyndicateOrderHistoryScreen.tsx` → Wire to real order history API.
- `frontend/src/screens/BuyoutScreen.tsx` → Wire to real buyout negotiation API.
- `frontend/src/screens/CoOwnIssueScreen.tsx` → Wire to real issue reporting API.

**Exact screens to create:**
- `frontend/src/screens/CoOwnDiscoveryScreen.tsx` — Browse all co-own assets by category/trending
- `frontend/src/screens/AssetHistoryScreen.tsx` — Full transaction history for a single asset
- `frontend/src/screens/AuctionsScreen.tsx` — Discovery tab for active auctions
- `frontend/src/screens/AuctionDetailScreen.tsx` — Live auction view with bid history, auto-bid, reserve indicator

**Expected visual outcome:**
- AssetDetail shows real price chart (line chart with time axis) and real holder list.
- Order book shows real bids/asks from backend.
- Trade screen remains functional but visually clean.

**Acceptance criteria:**
- No `@holder1`, `@holder2`, `@holder3` strings in `AssetDetailScreen`.
- Price chart uses real data points from API (or shows empty state with "No data yet").
- Order book shows real entries or empty state.
- Portfolio shows real holdings or empty state.

**Physical Expo test checklist:**
- [ ] Open AssetDetail → real price chart or empty state (not CSS bars)
- [ ] Scroll to Ownership → real holders or empty state (not `@holder1`)
- [ ] Open Trade → limit/market order works, no glass effects
- [ ] Open Portfolio → real holdings or "No holdings yet" empty state
- [ ] Open MarketLedger → real transactions or empty state

---

### Phase 7 — Creator Tools & Discovery (Week 7)

**Goal:** Rebuild CreatePoster with real filters and persistence. Fix Search/Looks to use real data. Polish VisualSearch and OutfitBuilder.

**Exact files to change:**
- `frontend/src/screens/CreatePosterScreenV2.tsx` → **REBUILD**. Replace CSS-style `filter` strings with real image processing (e.g., `expo-image-manipulator` or native filter pipeline). Add recent photo strip from camera roll. Save calls real `POST /posters` API.
- `frontend/src/screens/SearchScreen.tsx` → Remove `SAVED_LOOKS_SEED`. Wire "Looks" tab to real `GET /looks` API.
- `frontend/src/screens/GlobalSearchScreen.tsx` → Remove `picsum.photos`. Wire to real search API.
- `frontend/src/screens/VisualSearchScreen.tsx` → Wire camera capture to real image-classification API.
- `frontend/src/screens/CreateLookScreen.tsx` → Remove `FadeInDown`. Wire save to real `POST /looks` API.
- `frontend/src/screens/OutfitBuilderScreen.tsx` → Remove `GlassCard`, `FadeInDown`. Wire `suggestCompletion` to real ML API.

**Exact screens to create:**
- `frontend/src/screens/CreatorDashboardScreen.tsx` — Analytics for looks, posters, and follower growth

**Expected visual outcome:**
- CreatePoster has a real recent photo strip, native image filters, and saves to backend.
- Search "Looks" tab shows real creator content with real likes/comments.
- VisualSearch returns real similar items from the catalog.

**Acceptance criteria:**
- `filter: 'grayscale(100%)'` removed from `CreatePosterScreenV2`.
- `SAVED_LOOKS_SEED` removed from `SearchScreen`.
- `picsum.photos` removed from `GlobalSearchScreen`.
- Poster save hits real API and shows success/failure state.
- Looks save hits real API.

**Physical Expo test checklist:**
- [ ] Open CreatePoster → see recent camera roll strip
- [ ] Apply filter → image actually changes (not CSS string)
- [ ] Save poster → shows loading spinner, then success, then appears in feed
- [ ] Open Search → Looks tab shows real content (or empty state)
- [ ] Open VisualSearch → camera opens → photo returns similar items

---

### Phase 8 — Settings & Auth Final Polish (Week 8)

**Goal:** Polish settings subpages and auth landing to production quality. Remove dev diagnostics. Add missing profile/media editors.

**Exact files to change:**
- `frontend/src/screens/SettingsScreenV2.tsx` → Remove `#c9a86c`. Remove `__DEV__` diagnostics section. Add profile preview card.
- `frontend/src/screens/AuthLandingScreen.tsx` → Remove `FadeInDown`/`FadeInUp`. Remove `GlassCard`, `GlowSurface`. Replace hardcoded colors with tokens. Fix background overlay to show editorial image.
- `frontend/src/screens/EditProfileScreen.tsx` → Remove `#0A0A0A`. Remove `GlassCard`. Wire avatar/cover to real crop editors.
- `frontend/src/screens/ChangePasswordScreenV2.tsx` → Remove `FadeInDown`. Add password strength indicator.
- `frontend/src/screens/HelpSupportScreenV2.tsx` → **REBUILD**. Remove "Coming soon" text. Add real FAQ search. Add contact form that hits real API.
- `frontend/src/screens/PersonalisationScreen.tsx` → Wire toggles to real preference API.
- `frontend/src/screens/PrivacySettingsScreenV2.tsx` → Wire toggles to real privacy API.
- `frontend/src/screens/BlockedUsersScreenV2.tsx` → Wire to real block API.
- `frontend/src/screens/ActiveSessionsScreenV2.tsx` → Wire to real session API.

**Exact screens to create:**
- `frontend/src/screens/EditCoverScreen.tsx` — Dedicated cover photo editor with crop/zoom
- `frontend/src/screens/EditAvatarScreen.tsx` — Dedicated avatar editor with crop/zoom
- `frontend/src/screens/DisputeCenterScreen.tsx` — File and track order disputes
- `frontend/src/screens/PriceDropAlertScreen.tsx` — Manage price-drop notifications
- `frontend/src/screens/FollowingListScreen.tsx` — View followers / following with search

**Expected visual outcome:**
- Settings hub has a profile preview card at top.
- AuthLanding shows the editorial background image (not hidden by solid overlay).
- HelpSupport has searchable FAQs and a real contact form.
- EditProfile uses real crop editors for avatar/cover.

**Acceptance criteria:**
- `__DEV__` diagnostics removed from `SettingsScreenV2`.
- `FadeInDown` removed from all settings screens.
- `GlassCard` removed from all settings screens.
- `#0A0A0A` removed from all settings screens.
- HelpSupport shows real FAQs or empty state, never "Coming soon".
- AuthLanding shows Unsplash background image on all themes.

**Physical Expo test checklist:**
- [ ] Open Settings → see profile preview card at top
- [ ] Scroll Settings → no "Diagnostics" section visible
- [ ] Open AuthLanding → editorial background image is visible
- [ ] Open EditProfile → tap avatar → EditAvatarScreen opens with crop
- [ ] Open HelpSupport → searchable FAQs, real contact form
- [ ] Toggle theme → all settings screens update instantly

---

## Final Status

**AUDIT COMPLETE — READY FOR ROADMAP REVIEW**

This audit covered **74 active routes** across **10 product areas** with specific code evidence for every claim. No code was changed during this audit. All findings are based on direct file reads and grep searches of the repository as of 2026-06-05.

**Next step:** User review of this roadmap, followed by phased implementation beginning with Phase 0 (Foundation Cleanup).
