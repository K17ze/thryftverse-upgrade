# P2 #26 — Navigation & Information Architecture Convergence

**Auditor:** Senior full-stack SWE audit (React Native / Expo)
**Scope:** `frontend/src/navigation/*`, `frontend/App.tsx`, all `*Stack.tsx`/`*Tab.tsx`, hub screens, redirect shims
**Mode:** Read-only research. No source changes.

---

## 1. Executive finding

The ThryftVerse IA is **fragmented across too many colliding hubs and at least two classes of dead route**, which is the concrete mechanism behind the "unstable mental model" symptom.

1. **The bottom tab bar is already converged to a sane 5-slot shape** — `Home / Explore / Create(center FAB) / Inbox / Profile` (`TabNavigator.tsx:340-449`). The Create slot is correctly an *action*, not a destination (`TabNavigator.tsx:364-387`, `tabPress` prevented). This part is good.
2. **Discovery is split across 5+ overlapping entry points** that all answer "show me things to buy/look at": `Home` (HomeScreen feed), `Explore` tab root (SearchScreen with `discover`/`pulse`/`looks` scenes), `UnifiedDiscovery`, `GlobalSearch`, `ConversationalSearch`, `VisualSearch`, plus `Galleria`/`MoodboardHome`/`PulseFeed` as standalone hub screens. The naming is inconsistent (`Discover` scene vs `Explore` tab vs `UnifiedDiscovery` vs `GlobalSearch`) and the entry routing is contradictory: `HomeScreen` search button → `UnifiedDiscovery` (`HomeScreen.tsx:978`), but `SearchScreen` (the Explore tab) submits → `GlobalSearch` (`SearchScreen.tsx:85`), and `ClosetScreen`/`BrowseScreen`/`CategoryDetailScreen`/`CommandPalette` also navigate to `GlobalSearch`. Two different "search" destinations from two different surfaces with no clear hierarchy.
3. **~40 routes are declared in `RootStackParamList` and actively navigated to, but never registered as `Stack.Screen` in `AppNavigator.tsx`.** These are dead links: `Settings`, `EditProfile`, `Closet`, `NotificationsList`, `GlobalSearch`, `UnifiedDiscovery`, `Verification`, `HelpSupport`, `SavedAddresses`, `Payments`, `AccountSettings`, `ConnectionList`, `KYCVerification`, `DeleteAccount`, `DataExport`, `AIPreferences`, `DataPrivacy`, `NotificationPreferences`, `AIAgentIntegration`, `AgentActivity`, `ChatSettings`, `ActiveSessions`, `BlockedUsers`, `PrivacySettings`, `About`, `MutedConversations`, `ArchivedConversations`, `ManageQuickReplies`, `SellerVerification`, `ChangePassword`, `TwoFactorSetup`, `PushNotifications`, `SustainabilityPreferences`, `CategoryTree`, `PulseFeed`, `ExploreCollection`, `StyleQuiz`, `Galleria`, `MoodboardHome`, `YourAlgorithm`, `ConversationalSearch`. React Navigation native-stack throws at runtime when navigating to an unregistered route, so every Profile utility-rail row, every Settings row, and the Home search button are crash-on-press unless another navigator registers them. The tab stacks register a subset (e.g. `Galleria`, `PulseFeed`, `ConversationalSearch` live in `HomeStack`), but the root-stack-navigated calls (e.g. `HomeScreen.tsx:978` `rootNavigation?.navigate('UnifiedDiscovery')`, `MyProfileScreen.tsx:517` `navigate('Closet')`, `SettingsScreen.tsx:616` `navigate('Settings')`) target the **root** stack, where they are not registered. This is the single highest-severity IA defect. [VERIFIED — CODE: `AppNavigator.tsx:161-394` screen list; `types.ts:91-527` param list; cross-ref grep above]
4. **Three redirect/shim screens exist purely to bounce elsewhere**, adding a visible loading hop and a stale route in the back stack: `CreatePosterRedirect`, `CreateLookRedirect`, `CreateCameraScreen`. `CreateCameraScreen` is explicitly documented as a legacy shim (`CreateCameraScreen.tsx:4-18`) and the TabNavigator already bypasses it (`TabNavigator.tsx:262-269` navigates straight to `CreatorStudio`). The two `*Redirect` screens `navigation.replace('CreatorStudio', …)` on a `setTimeout(0)` (`CreatePosterRedirect.tsx:11-16`, `CreateLookRedirect.tsx:11-16`) — a flicker hop. `CreateLookScreen.tsx` is a one-line re-export of the redirect.
5. **Hub sprawl in commerce/trading**: `Sell` (listing author), `SellerHub` (seller dashboard), `TradeHub` (Co-Own market), `SyndicateHub`/`CoOwnHub` (Co-Own portfolio), `AuctionHome` + `Auctions` (two auction list surfaces), `SellerAuctionCentre`, `MyListings`, `InventoryManagement`, `SellerAnalytics`, `CreatorAnalyticsDashboard`, `Portfolio`, `MyBids`. There is no single "Selling" or "Trading" mental model; the Profile utility rail links to `SellerHub`, `AuctionHome`, `CoOwnHub`, `CreatorAnalyticsDashboard` as peers (`MyProfileScreen.tsx:500-545`), so the user cannot tell which is the home base.
6. **Saved/Wishlist/Closet convergence is half-done.** `ClosetScreen` unifies `SAVED | WISHLIST | COLLECTIONS | OUTFITS` as tabs (`ClosetScreen.tsx:48`), and the Profile rail labels the entry "Closet" with `savedCount + wishlistCount` (`MyProfileScreen.tsx:514-518`). Good. But `MyProfileScreen` still carries a `'saved'` tab in its internal `activeTab` union that is "no longer offered" and force-remapped to `'listings'` (`MyProfileScreen.tsx:158-162`, `:784`), and `ExploreCollection` still has a `'saved_affinity'` source (`ExploreCollectionScreen.tsx:101`). The store still exposes `savedProducts` and `wishlist` as separate arrays (`useStore.ts:424-425`). The merge is incomplete and the legacy "Saved" concept leaks.
7. **Activity vs Notifications**: there is no separate "Activity" hub screen. `NotificationsScreen` (file) and route `NotificationsList` are the same intent, but the route is unregistered (see #3) while the file `NotificationsScreen.tsx` exists. `PosterStoryActivityScreen` and `WalletActivityScreen` and `AgentActivityScreen` reuse the word "Activity" for unrelated purposes, diluting the term. `InAppNotificationCenter` is a global toast overlay (`AppNavigator.tsx:397`), distinct from the list screen — fine, but the naming collision with `WalletActivity`/`AgentActivity` muddies "Activity" as a concept.

**Bottom line:** the tab skeleton is right; the layers above it are not. The root stack is missing ~40 screen registrations (crash-on-navigate), discovery is fragmented across 5+ hubs with contradictory routing, three redirect shims add back-stack noise, and commerce/trading has 6+ peer hubs with no clear home base.

---

## 2. Full route inventory

### 2a. Bottom tabs (`TabNavigator.tsx:340-449`, `types.ts:567-574`)

| Tab | Root screen | File | Purpose | Status |
|---|---|---|---|---|
| Home | `Home` (HomeStack) | `tabStacks/HomeStack.tsx:23` → `HomeScreen.tsx` | For-You feed, posters, looks, following | **Keep** |
| Explore | `Explore` (ExploreStack) | `tabStacks/ExploreStack.tsx:33` → `SearchScreen.tsx` | Search + Discover/Pulse/Looks scenes | **Merge** with UnifiedDiscovery/GlobalSearch |
| Create | (none — action) | `TabNavigator.tsx:364-387` | FAB → `CreatorStudio` modal | **Keep** (action, not dest) |
| Inbox | `Inbox` (InboxStack) | `tabStacks/InboxStack.tsx:23` → `InboxScreen.tsx` | Conversation list | **Keep** |
| Profile | `Profile` (ProfileStack) | `tabStacks/ProfileStack.tsx:22` → `MyProfileScreen.tsx` | Own profile + utility rail | **Keep** |

### 2b. Per-tab stacks

| Route | File | Purpose | Status |
|---|---|---|---|
| `Home` | `HomeStack.tsx:23` | Feed root | Keep |
| `PulseFeed` | `HomeStack.tsx:24` → `PulseFeedScreen.tsx` | Pulse feed (also a scene in SearchScreen) | **Merge** into Explore/discover |
| `ExploreCollection` | `HomeStack.tsx:25` → `ExploreCollectionScreen.tsx` | Curated collection by source | Keep (deep-linkable) |
| `LookDetail` | `HomeStack.tsx:26` | Look detail | Keep (duplicated in Explore/Profile stacks — dedupe to root) |
| `Galleria` | `HomeStack.tsx:27` → `GalleriaScreen.tsx` | Editorial discovery | **Merge** into UnifiedDiscovery |
| `GalleriaCollectionDetail` | `HomeStack.tsx:28` | Collection detail | Keep |
| `MoodboardHome` | `HomeStack.tsx:29` → `MoodboardHomeScreen.tsx` | Moodboard list | **Merge** into Profile/Closet |
| `YourAlgorithm` | `HomeStack.tsx:30` | Algorithm transparency | Keep (Settings-adjacent) |
| `StyleQuiz` | `HomeStack.tsx:31` | Style quiz modal | Keep |
| `ConversationalSearch` | `HomeStack.tsx:32` → `ConversationalSearchScreen.tsx` | NL search | **Merge** into Explore search |
| `Explore` | `ExploreStack.tsx:33` → `SearchScreen.tsx` | Search + discover scenes | Keep as Explore root |
| `CategoryDetail` | `ExploreStack.tsx:34` | Category drill-down | Keep |
| `CategoryTree` | `ExploreStack.tsx:35` | Category tree | Keep |
| `Browse` | `ExploreStack.tsx:36` → `BrowseScreen.tsx` | Browse list | Keep |
| `Filter` | `ExploreStack.tsx:37` | Filter form sheet | Keep |
| `SavedSearches` | `ExploreStack.tsx:38` → `SavedSearchesScreen.tsx` | Saved searches | Keep |
| `CollectionDetail` | `ExploreStack.tsx:39` | Collection detail | Keep |
| `Inbox` | `InboxStack.tsx:23` | Conversation list | Keep |
| `Profile` | `ProfileStack.tsx:22` → `MyProfileScreen.tsx` | Own profile | Keep |

### 2c. Root stack — registered in `AppNavigator.tsx:161-394`

| Route | File (line) | Purpose | Status |
|---|---|---|---|
| `AgeVerification` | `AppNavigator.tsx:188` | 18+ gate | Keep |
| `Onboarding` | `:191` | First-run onboarding | Keep |
| `AuthLanding` | `:194` | Auth landing | Keep |
| `Login` | `:195` | Login | Keep |
| `SignUp` | `:196` | Sign up | Keep |
| `BiometricLogin` | `:197` | Biometric gate | Keep |
| `ForgotPassword` | `:198` | Password reset | Keep |
| `Personalisation` | `:199` | Post-signup personalisation | Keep |
| `MainTabs` | `:202` | Tab navigator host | Keep |
| `ItemDetail` | `:205` | Product detail | Keep |
| `PosterViewer` | `:208` | Poster/story viewer | Keep |
| `CreatePoster` | `:209` → `CreatePosterRedirect.tsx` | **Redirect shim** → CreatorStudio | **Remove** (replace callers with CreatorStudio) |
| `PosterStoryActivity` | `:210` | Story activity | Keep |
| `PosterArchive` | `:211` | Poster archive | Keep |
| `PosterHighlightViewer` | `:212` | Highlight viewer | Keep |
| `CreatePosterHighlight` | `:213` | Highlight creator | Keep |
| `Sell` | `:216` → `SellScreen.tsx` | Listing author (modal) | Keep (single sell entry) |
| `CatalogImportStart`…`Summary` | `:218-223` | Concierge import flow | Keep |
| `TradeHub` | `:224` → `TradeHubScreen.tsx` | Co-Own market hub | **Merge** into CoOwnHub |
| `AuctionHome` | `:225` → `AuctionHomeScreen.tsx` | Auction home | **Merge** with `Auctions` |
| `Auctions` | `:226` → `AuctionsScreen.tsx` | Auction list (duplicate of AuctionHome) | **Remove** (fold into AuctionHome) |
| `SellerAuctionCentre` | `:227` | Seller auction centre | Keep (seller-scoped) |
| `CreateAuction` | `:228` | Auction creator | Keep |
| `AuctionDetail` | `:229` | Auction detail | Keep |
| `CreateCoOwn` | `:232` | Syndicate creator | Keep |
| `MarketLedger` | `:233` | Market ledger | Keep |
| `CoOwnHub` | `:234` → `SyndicateHubScreen.tsx` | Co-Own portfolio hub | Keep (primary Co-Own hub) |
| `AssetDetail` | `:235` | Asset detail | Keep |
| `AssetDueDiligence` | `:236` | Due diligence | Keep |
| `Trade` | `:237` | Trade ticket | Keep |
| `Portfolio` | `:238` | Portfolio | **Merge** into CoOwnHub |
| `MyBids` | `:239` | Auction bids | Keep (deep-linkable) |
| `MyListings` | `:240` | Seller listings | Keep |
| `InventoryManagement` | `:241` | Inventory dashboard | Keep |
| `SellerAnalytics` | `:242` | Seller analytics | **Merge** into SellerHub |
| `SellerHub` | `:243` → `SellerHubScreen.tsx` | Seller dashboard | Keep (primary seller hub) |
| `CreatorAnalyticsDashboard` | `:244` | Creator analytics | Keep |
| `BundleBag` | `:245` | Bundle bag | Keep |
| `VerificationResponse` | `:246` | Verification response | Keep |
| `CoOwnOrderHistory` | `:247` | Co-Own orders | Keep |
| `AssetLeaderboard` | `:248` | Leaderboard | Keep |
| `Buyout` | `:249` | Buyout | Keep |
| `CorporateActionDetail` | `:250` | Corporate action | Keep |
| `DistributionHistory` | `:251` | Distributions | Keep |
| `CoOwnOnboarding` | `:252` | Co-Own onboarding | Keep |
| `Chat` | `:255` | 1:1 chat | Keep |
| `Inbox` | `:256` | Inbox (root-stack copy; also in InboxStack) | **Redirect** — keep for cross-tab reachability but dedupe |
| `CreateGroupChat` | `:257` | Group creator | Keep |
| `GroupChat` | `:258` | Group chat | Keep |
| `GroupChatInfo` | `:259` | Group info | Keep |
| `GroupMembers` | `:260` | Group members | Keep |
| `GroupBotManagement` | `:261` | Bot mgmt | Keep |
| `BotDirectory` | `:262` | Bot directory | Keep |
| `BotDetail` | `:263` | Bot detail | Keep |
| `CustomBots` | `:264` | Custom bots | Keep |
| `BotBuilder` | `:265` | Bot builder | Keep |
| `EditGroup` | `:266` | Edit group | Keep |
| `UserProfile` | `:269` | Other user profile | Keep |
| `Followers` | `:270` | Followers list | **Merge** into `ConnectionList` |
| `Following` | `:271` | Following list | **Merge** into `ConnectionList` |
| `LookDetail` | `:272` | Look detail (root-stack copy) | Keep (dedupe with tab-stack copies) |
| `Wallet` | `:275` | Wallet | Keep |
| `SellerEarnings` | `:277` | Earnings | Keep |
| `WalletConvert` | `:278` | Convert | Keep |
| `WalletActivity` | `:279` | Wallet activity | Keep |
| `MyOrders` | `:280` | Orders | Keep |
| `MakeOffer` | `:284` | Offer form sheet | Keep |
| `Postage` | `:285` | Postage | Keep |
| `InviteFriends` | `:286` | Invite | Keep |
| `BalanceHistory` | `:287` | Balance history | Keep |
| `AddBankAccount` | `:290` | Bank account | Keep |
| `OrderDetail` | `:293` | Order detail | Keep |
| `SellerFulfilment` | `:294` | Fulfilment | Keep |
| `OrderReceipt` | `:295` | Receipt | Keep |
| `Checkout` | `:298` | Checkout | Keep |
| `AddressForm` | `:299` | Address form | Keep |
| `Success` | `:300` | Checkout success | Keep |
| `ManageListing` | `:301` | Manage listing | Keep |
| `Withdraw` | `:302` | Withdraw | Keep |
| `ListingSuccess` | `:305` | Listing success | Keep |
| `EditListing` | `:306` | Edit listing | Keep |
| `WriteReview` | `:309` | Review form sheet | Keep |
| `Report` | `:312` | Report | Keep |
| `VisualSearch` | `:316` | Visual search camera | Keep |
| `CreateCamera` | `:319` → `CreateCameraScreen.tsx` | **Redirect shim** → CreatorStudio/VisualSearch | **Remove** (legacy) |
| `CreateLook` | `:322` → `CreateLookRedirect.tsx` | **Redirect shim** → CreatorStudio | **Remove** |
| `CreatorStudio` | `:323` | Creator studio | Keep |
| `CreatorDraftList` | `:324` | Draft list | Keep |
| `OutfitBuilder` | `:325` | Outfit builder | Keep |
| `CoOwnIssue` | `:326` | Co-Own issue | Keep |
| `ConversationInfo` | `:330` | Conversation info | Keep |
| `MessageRequests` | `:331` | Message requests | Keep |
| `NewMessage` | `:332` | New message | Keep |
| `SharedConversationMedia` | `:333` | Shared media | Keep |
| `ManageCollectionItems` | `:336` | Collection items | Keep |
| `CreateCollection` | `:337` | Collection creator | Keep |
| `OrderSupport` | `:340` | Order support | Keep |
| `BuyerProtection` | `:341` | Buyer protection | Keep |
| `CoOwnPriceAlerts` | `:344` | Price alerts | Keep |
| `CoOwnTaxDocuments` | `:345` | Tax docs | Keep |
| `CoOwnRecurringOrders` | `:346` | Recurring orders | Keep |
| `ChatMediaPreview` | `:349` | Media preview | Keep |
| `EditCollection` | `:353` | Edit collection | Keep |
| `SupportTicketDetail` | `:356` | Ticket detail | Keep |
| `ResolutionCentre` | `:357` | Resolution centre | Keep |
| `SupportConversation` | `:358` | Support chat | Keep |
| `SupportCaseDetail` | `:359` | Case detail | Keep |
| `ListingPreview` | `:363` | Listing preview | Keep |
| `TradeConfirm` | `:366` | Trade confirm | Keep |
| `LiveShopping` | `:370` → `LiveShoppingHomeScreen.tsx` | Live shopping home | Keep |
| `LiveStreamViewer` | `:371` | Stream viewer | Keep |
| `LiveStreamSeller` | `:372` | Stream seller | Keep |
| `AIPoweredListing` | `:375` | AI listing | Keep |
| `BulkListing` | `:378` | Bulk listing | Keep |
| `AIPhotoEnhancement` | `:382` | Photo enhancement | Keep |
| `MoodboardEditor` | `:385` | Moodboard editor | Keep |
| `GalleriaCollectionDetail` | `:388` | Galleria collection (root copy) | Keep (dedupe with HomeStack copy) |
| `RuntimeSmokeTest` | `:392` (dev) | Diagnostic | Keep (dev) |

### 2d. Root stack — **declared in `types.ts` but NOT registered** (dead routes)

| Route | Declared | Navigated from | Status |
|---|---|---|---|
| `Settings` | `types.ts:227` | `MyProfileScreen.tsx:616`, `SettingsScreen.tsx` is the file | **Register** |
| `EditProfile` | `types.ts:228` | `MyProfileScreen.tsx:725,1099`, `SettingsScreen.tsx:492` | **Register** |
| `AccountSettings` | `types.ts:229` | SettingsScreen rows | **Register** |
| `AccountControl` | `types.ts:230` | — | Register or remove |
| `SavedAddresses` | `types.ts:231` | `PostageScreen.tsx:275`, `SettingsScreen.tsx:655` | **Register** |
| `Payments` | `types.ts:232` | `SettingsScreen.tsx:662`, `CheckoutScreen.tsx:1008,1159` | **Register** |
| `Closet` | `types.ts:123` | `MyProfileScreen.tsx:517`, `SettingsScreen.tsx:667`, `CollectionDetailScreen.tsx:123`, `CatalogImportProgressScreen.tsx:140`, `CatalogImportSummaryScreen.tsx:91`, `EditCollectionScreen.tsx:98` | **Register** |
| `NotificationsList` | `types.ts:290` | `HomeScreen.tsx:987`, `usePushNotificationTap.ts:24`, `notificationRouting.ts:17,30,73` | **Register** |
| `GlobalSearch` | `types.ts:262` | `SearchScreen.tsx:85`, `SavedSearchesScreen.tsx:85`, `BrowseScreen.tsx:735`, `ClosetScreen.tsx:184`, `CategoryDetailScreen.tsx:296`, `CommandPalette.tsx:197` | **Register** (or fold into Explore) |
| `UnifiedDiscovery` | `types.ts:266` | `HomeScreen.tsx:978` | **Register** (or fold into Explore) |
| `PushNotifications` | `types.ts:237` | — | Register or remove |
| `HelpSupport` | `types.ts:243` | `SettingsScreen.tsx:850`, `TradeScreen.tsx:690-719`, `AboutScreen.tsx:177`, `CoOwnIssueScreen.tsx:78,84`, `ChatSettingsScreen.tsx:157`, `ListingSuccessScreen.tsx:368` | **Register** |
| `ChangePassword` | `types.ts:293` | — | Register or remove |
| `TwoFactorSetup` | `types.ts:294` | — | Register or remove |
| `CategoryTree` | `types.ts:260` | (in ExploreStack) | OK in tab stack; root nav unneeded |
| `ConnectionList` | `types.ts:215` | — (intended to replace Followers/Following) | **Register** + migrate |
| `Verification` | `types.ts:473` | `SellerHubScreen.tsx:710`, `SettingsScreen.tsx:508,562`, `VerificationStatusScreen.tsx:98,103` | **Register** |
| `VerificationStatus` | `types.ts:474` | — | Register or remove |
| `SellerVerification` | `types.ts:483` | — | Register or remove |
| `KYCVerification` | `types.ts:501` | — | Register or remove |
| `DeleteAccount` | `types.ts:470` | — | **Register** |
| `DataExport` | `types.ts:471` | — | Register or remove |
| `AIPreferences` | `types.ts:519` | — | Register or remove |
| `SustainabilityPreferences` | `types.ts:520` | — | Register or remove |
| `DataPrivacy` | `types.ts:521` | — | Register or remove |
| `NotificationPreferences` | `types.ts:522` | — | Register or remove |
| `AIAgentIntegration` | `types.ts:524` | — | Register or remove |
| `AgentActivity` | `types.ts:526` | — | Register or remove |
| `ChatSettings` | `types.ts:360` | — | Register or remove |
| `ActiveSessions` | `types.ts:361` | — | Register or remove |
| `BlockedUsers` | `types.ts:362` | — | Register or remove |
| `PrivacySettings` | `types.ts:363` | — | Register or remove |
| `About` | `types.ts:364` | — | Register or remove |
| `MutedConversations` | `types.ts:365` | — | Register or remove |
| `ArchivedConversations` | `types.ts:366` | — | Register or remove |
| `ManageQuickReplies` | `types.ts:367` | — | Register or remove |
| `PulseFeed` | `types.ts:344` | (in HomeStack) | OK in tab stack; root nav unneeded |
| `ExploreCollection` | `types.ts:345` | (in HomeStack) | OK in tab stack |
| `StyleQuiz` | `types.ts:356` | (in HomeStack) | OK in tab stack |
| `Galleria` | `types.ts:505` | (in HomeStack) | OK in tab stack |
| `MoodboardHome` | `types.ts:514` | (in HomeStack) | OK in tab stack |
| `YourAlgorithm` | `types.ts:508` | (in HomeStack) | OK in tab stack |
| `ConversationalSearch` | `types.ts:512` | (in HomeStack) | OK in tab stack |

> **Note:** the last 8 are registered inside `HomeStack`/`ExploreStack`, so tab-internal navigation works. The defect is that **root-stack** `navigate(...)` calls (from `HomeScreen`, `MyProfileScreen`, `SettingsScreen`, `PostageScreen`, `CheckoutScreen`, `SellerHubScreen`, push handler) target these names on the root navigator, where they are absent.

---

## 3. Overlap analysis (hub collisions)

### 3.1 Discovery / Search — 5+ entry points, contradictory routing
- **Home tab** (`HomeScreen`) = For-You feed + posters + looks + following. Its search button → `UnifiedDiscovery` (`HomeScreen.tsx:978`).
- **Explore tab** (`SearchScreen`) = inline search + `discover`/`pulse`/`looks` scenes (`SearchScreen.tsx:27-28`, `DiscoveryModeNav`). Submit → `GlobalSearch` (`SearchScreen.tsx:85`).
- **UnifiedDiscovery** (`UnifiedDiscoveryScreen.tsx:1-20`) = "flagship discovery surface" combining Galleria + For You + collections + looks + moodboards + featured assets. Declared but **not registered** in root stack.
- **GlobalSearch** (`GlobalSearchScreen.tsx`) = text search results with editorial sections. Reached from SearchScreen, BrowseScreen, ClosetScreen, CategoryDetailScreen, CommandPalette, SavedSearchesScreen. **Not registered** in root stack.
- **ConversationalSearch** (`ConversationalSearchScreen.tsx`) = NL chat search. In HomeStack.
- **VisualSearch** = camera viewfinder search. Root stack.
- **Galleria** = editorial discovery. In HomeStack.

**User confusion:** "Discover" (scene name) vs "Explore" (tab) vs "Unified Discovery" (home search) vs "Global Search" (explore submit) vs "AI Search" (conversational) — five labels for the same intent, two different destinations from two search bars, and two of the destinations crash because they are unregistered. [VERIFIED — CODE: `HomeScreen.tsx:978`, `SearchScreen.tsx:85`, `AppNavigator.tsx` absent registrations]

### 3.2 Auctions — two list hubs
- `AuctionHome` (`AuctionHomeScreen.tsx`) and `Auctions` (`AuctionsScreen.tsx`) are both full auction list surfaces. `AuctionHome` has search/browse state machine (`auctionHomeLogic.ts`); `Auctions` has its own `listAuctions` + `BidComposer`. Both registered in root stack (`AppNavigator.tsx:225-226`). Deep links map `auctions` → AuctionHome, `auctions/all` → Auctions (`linking.ts:101-102`). Two hubs, one intent. [VERIFIED — CODE]

### 3.3 Co-Own / Trading — three hubs
- `CoOwnHub` (`SyndicateHubScreen.tsx`) = portfolio + holdings + market highlights.
- `TradeHub` (`TradeHubScreen.tsx`) = open orders + tradeable assets + recent trades.
- `Portfolio` (`PortfolioScreen.tsx`) = portfolio. Overlaps heavily with CoOwnHub's holdings view.
- Profile rail links `CoOwnHub` only (`MyProfileScreen.tsx:536`), but `TradeHub` and `Portfolio` are peer root routes. No clear home base. [VERIFIED — CODE]

### 3.4 Seller tools — hub + analytics sprawl
- `SellerHub` (dashboard), `SellerAnalytics`, `CreatorAnalyticsDashboard`, `MyListings`, `InventoryManagement`, `SellerAuctionCentre`, `SellerEarnings`. Profile rail links `SellerHub` + `CreatorAnalyticsDashboard` as peers (`MyProfileScreen.tsx:510,542`). `SellerAnalytics` is a separate route that should be a tab/section inside SellerHub. [VERIFIED — CODE]

### 3.5 Saved / Wishlist / Closet — half-merged
- `ClosetScreen` tabs: `SAVED | WISHLIST | COLLECTIONS | OUTFITS` (`ClosetScreen.tsx:48`). Good convergence.
- Profile rail: single "Closet" entry with `savedCount + wishlistCount` (`MyProfileScreen.tsx:514-518`). Good.
- BUT `MyProfileScreen` still has a `'saved'` `activeTab` union member that is "no longer offered" and force-remapped (`MyProfileScreen.tsx:158-162,784`). Store still has `savedProducts` + `wishlist` as separate arrays. `ExploreCollection` still carries `'saved_affinity'` source. The legacy "Saved" concept is not fully killed. [VERIFIED — CODE]

### 3.6 Followers / Following / ConnectionList — declared replacement not wired
- `Followers` and `Following` are registered (`AppNavigator.tsx:270-271`). `ConnectionList` is declared (`types.ts:215`) as the "unified" replacement with a `mode` param, but is **not registered** and **not navigated to** anywhere. The merge was started at the type level and abandoned. [VERIFIED — CODE]

### 3.7 Notifications / Activity — term collision
- `NotificationsList` (route, unregistered) and `NotificationsScreen.tsx` (file) = the notification inbox. `InAppNotificationCenter` = global toast overlay (`AppNavigator.tsx:397`). These are fine as distinct concepts.
- `WalletActivity`, `AgentActivity`, `PosterStoryActivity` reuse "Activity" for unrelated surfaces, diluting the term. No standalone "Activity" hub exists, which is correct, but the naming suggests one. [VERIFIED — CODE]

---

## 4. Redirect screen list

| Screen | File | Behavior | Navigated from | Status |
|---|---|---|---|---|
| `CreateCameraScreen` | `CreateCameraScreen.tsx:19-44` | `useEffect` → `navigation.replace('VisualSearch' \| 'CreatorStudio')` | Legacy callers; TabNavigator already bypasses (`TabNavigator.tsx:262-269`) | **Remove** route + file; keep a deep-link alias only |
| `CreatePosterRedirect` | `CreatePosterRedirect.tsx:6-23` | `setTimeout(0)` → `navigation.replace('CreatorStudio', {type:'poster'})` | `CreatePoster` route (`AppNavigator.tsx:209`) | **Remove**; callers should navigate to `CreatorStudio` directly |
| `CreateLookRedirect` | `CreateLookRedirect.tsx:6-23` | `setTimeout(0)` → `navigation.replace('CreatorStudio', {type:'look'})` | `CreateLook` route (`AppNavigator.tsx:322`); re-exported by `CreateLookScreen.tsx` | **Remove**; callers should navigate to `CreatorStudio` directly |
| `UserProfileScreen` self-redirect | `UserProfileScreen.tsx:168-173` | `useEffect` → if userId === currentUserId, `navigation.replace('MainTabs', {screen:'Profile'})` | Tapping your own profile from elsewhere | **Keep** (legitimate dedupe — prevents a dead self-profile screen) |

The three creator shims render an `ActivityIndicator` for one frame then `replace` — a visible flicker hop and a stale entry in the back stack until `replace` fires. `CreateCameraScreen` renders `null` (no flicker) but is still an unnecessary route hop. [VERIFIED — CODE]

---

## 5. Proposed converged IA

### 5.1 Bottom tabs (unchanged — already correct)
```
Home  |  Explore  |  [Create FAB]  |  Inbox  |  Profile
```
- **Home**: For-You feed (posters, looks, following, live shopping entry). No search button → route to Explore instead.
- **Explore**: single search + discovery root. Fold `UnifiedDiscovery`, `GlobalSearch`, `ConversationalSearch`, `Galleria`, `PulseFeed` into this tab as scenes/segments (not separate root routes).
- **Create**: action only → `CreatorStudio` modal (already correct).
- **Inbox**: conversation list (already correct).
- **Profile**: own profile + utility rail. Fold `MoodboardHome`, `Closet` (Saved/Wishlist/Collections/Outfits), `SellerHub`, `CoOwnHub`, `Wallet`, `Orders`, `Auctions`, `NotificationsList`, `Settings` into the rail as the single "my stuff" home base.

### 5.2 Root stack (modal/push surfaces only)
Keep root stack for: auth/onboarding, cross-tab detail screens (ItemDetail, Chat, AuctionDetail, AssetDetail, OrderDetail, Checkout, etc.), creator modals, and support. **Move all "hub" list screens into the appropriate tab stack or Profile rail** so each hub has exactly one home.

### 5.3 Discovery convergence
- One Explore tab with segments: `Discover` (For-You-style masonry) / `Search` (text + autocomplete → results) / `Pulse` / `Looks` / `Editorial` (Galleria). `ConversationalSearch` and `VisualSearch` become entry *modes* inside Search, not separate routes.
- Home search button → `MainTabs → Explore` (switch tab + focus search), not a separate `UnifiedDiscovery` route.
- Delete `UnifiedDiscovery` and `GlobalSearch` as standalone routes; fold their content into the Explore scenes. Keep `ExploreCollection` as the deep-linkable curated-collection destination.

### 5.4 Commerce/trading convergence
- **SellerHub** = single seller home base. Fold `SellerAnalytics` into a section. `MyListings`/`InventoryManagement`/`SellerAuctionCentre`/`SellerEarnings` remain detail screens reached from SellerHub rows.
- **CoOwnHub** = single Co-Own home base. Fold `Portfolio` and `TradeHub` into segments (Holdings / Market / Orders). `AssetDetail`/`Trade`/`Buyout` remain detail screens.
- **AuctionHome** = single auction home. Delete `Auctions` route; fold its list into AuctionHome. `AuctionDetail`/`CreateAuction`/`MyBids`/`SellerAuctionCentre` remain detail screens.

### 5.5 Saved/Wishlist convergence (finish)
- `Closet` = single saved-items surface (SAVED/WISHLIST/COLLECTIONS/OUTFITS tabs already correct). Remove the dead `'saved'` tab from `MyProfileScreen`. Collapse store `savedProducts` + `wishlist` into one `savedItems` collection with a `kind` discriminator, or keep two arrays but expose one Closet entry (already done on the rail). Remove `'saved_affinity'` from `ExploreCollection` or rename to `'closet_affinity'`.

### 5.6 Followers/Following convergence (finish)
- Register `ConnectionList` and migrate `Followers`/`Following` callers to `ConnectionList` with `mode`. Remove `Followers`/`Following` routes after migration.

### 5.7 Notifications
- Register `NotificationsList` (or rename to `Notifications` for label/route parity). Keep `InAppNotificationCenter` as the toast overlay. Rename `WalletActivity` → `WalletHistory` and `AgentActivity` → `AgentLedger` to free the "Activity" term.

### 5.8 Deep-link impact (`linking.ts`)
- `search` → Explore tab search (was `GlobalSearch`).
- `galleria` → Explore Editorial segment (was standalone `Galleria`).
- `pulse` → Explore Pulse segment (was `PulseFeed`).
- `ai-search` → Explore Search → conversational mode (was `ConversationalSearch`).
- `auctions/all` → `auctions` (collapse into AuctionHome).
- `seller-analytics` → `seller-hub` (folded).
- `portfolio`, `market` → `co-own` (folded into CoOwnHub segments).
- All other deep links unchanged. Add backward-compat path aliases (see migration plan).

---

## 6. Migration plan

### Phase 1 — Stop the bleeding (register dead routes)
1. Register every navigated-but-unregistered route in `AppNavigator.tsx` (Settings, EditProfile, Closet, NotificationsList, GlobalSearch, UnifiedDiscovery, Verification, HelpSupport, SavedAddresses, Payments, AccountSettings, DeleteAccount, ConnectionList, and the settings sub-screens). This alone eliminates the crash-on-press class of defects. Use `getComponent` lazy requires for bundle safety.
2. Add a `__DEV__` assertion (or unit test) that walks `RootStackParamList` keys and verifies each is registered in either the root stack or a tab stack, so this drift cannot recur.

### Phase 2 — Remove redirect shims
3. Replace all `navigate('CreatePoster')` / `navigate('CreateLook')` / `navigate('CreateCamera')` call sites with `navigate('CreatorStudio', { type, openEntry })`. Grep for each route name across `src/`.
4. Remove `CreatePoster`, `CreateLook`, `CreateCamera` routes from `AppNavigator.tsx` and `types.ts`. Delete `CreatePosterRedirect.tsx`, `CreateLookRedirect.tsx`, `CreateCameraScreen.tsx`, `CreateLookScreen.tsx`.
5. Add deep-link compat aliases in `linking.ts` (`create-poster`, `create-look`, `create-camera` → `CreatorStudio` with params) if any external URLs reference them.

### Phase 3 — Converge discovery
6. Move `UnifiedDiscovery` and `GlobalSearch` content into ExploreStack scenes. Make Home search button `navigate('MainTabs', { screen: 'Explore' })` + focus the search input (via a param or `TabScrollContext`-style focus signal).
7. Move `Galleria`, `PulseFeed`, `ConversationalSearch` from HomeStack into ExploreStack as segments/modes. Keep `LookDetail`, `ExploreCollection`, `GalleriaCollectionDetail` as detail screens.
8. Update `linking.ts` paths with backward-compat aliases (old paths → new Explore-internal targets).

### Phase 4 — Converge commerce/trading hubs
9. Fold `Auctions` into `AuctionHome` (single list component, keep `AuctionHome` route name for deep-link stability). Remove `Auctions` route.
10. Fold `Portfolio` and `TradeHub` into `CoOwnHub` segments. Remove `Portfolio` and `TradeHub` routes (keep deep-link aliases → `co-own`).
11. Fold `SellerAnalytics` into `SellerHub` as a section. Remove `SellerAnalytics` route (deep-link `seller-analytics` → `seller-hub`).

### Phase 5 — Finish Saved/Followers convergence
12. Register `ConnectionList`; migrate `Followers`/`Following` callers (`UserProfileScreen`, `MyProfileScreen`) to `ConnectionList` with `mode`. Remove `Followers`/`Following` routes.
13. Remove the dead `'saved'` tab from `MyProfileScreen.tsx:158-162,784`. Collapse store `savedProducts`+`wishlist` into one collection or keep two arrays behind one Closet entry (already done on rail).
14. Rename `WalletActivity` → `WalletHistory`, `AgentActivity` → `AgentLedger` to free "Activity".

### Back-nav preservation
- For every removed route, keep a 1-line redirect shim in `linking.ts` (path alias) **only** — not in the navigator. In-app back navigation is preserved because the removed routes are hubs (reached by `navigate`, not `push` from a parent the user needs to return to); the user returns via the tab bar / Profile rail.
- For detail screens that remain (ItemDetail, Chat, AuctionDetail, etc.), back-nav is unchanged.
- `UserProfileScreen` self-redirect (`UserProfileScreen.tsx:168-173`) stays — it correctly prevents a dead self-profile screen.

### Deep-link compat
- `linking.ts` already centralizes all public paths. Add an `aliases` map: old path → new screen + param transform. React Navigation supports per-screen `getPathForPath`/`parse` hooks for this. No external URL breakage required.

---

## 7. Evidence index (selected)

- Tab structure: `TabNavigator.tsx:340-449` [VERIFIED — CODE]
- Create-as-action: `TabNavigator.tsx:364-387`, `:262-269` [VERIFIED — CODE]
- Root stack screen list: `AppNavigator.tsx:161-394` [VERIFIED — CODE]
- RootStackParamList: `types.ts:91-527` [VERIFIED — CODE]
- Home search → UnifiedDiscovery: `HomeScreen.tsx:978` [VERIFIED — CODE]
- Explore submit → GlobalSearch: `SearchScreen.tsx:85` [VERIFIED — CODE]
- Closet unification: `ClosetScreen.tsx:48`, `MyProfileScreen.tsx:514-518` [VERIFIED — CODE]
- Dead 'saved' tab: `MyProfileScreen.tsx:158-162,784` [VERIFIED — CODE]
- Followers/Following/ConnectionList: `types.ts:215`, `AppNavigator.tsx:270-271` [VERIFIED — CODE]
- AuctionHome vs Auctions: `AppNavigator.tsx:225-226`, `linking.ts:101-102` [VERIFIED — CODE]
- CoOwnHub/TradeHub/Portfolio: `AppNavigator.tsx:224,234,238` [VERIFIED — CODE]
- SellerHub/SellerAnalytics: `AppNavigator.tsx:242-243` [VERIFIED — CODE]
- CreatePosterRedirect: `CreatePosterRedirect.tsx:11-16` [VERIFIED — CODE]
- CreateLookRedirect: `CreateLookRedirect.tsx:11-16` [VERIFIED — CODE]
- CreateCameraScreen shim: `CreateCameraScreen.tsx:19-44` [VERIFIED — CODE]
- UserProfile self-redirect: `UserProfileScreen.tsx:168-173` [VERIFIED — CODE]
- Deep-link config: `linking.ts:35-155` [VERIFIED — CODE]
- Unregistered-but-navigated routes: cross-ref `AppNavigator.tsx` screen list vs grep of `navigate('Settings'|'Closet'|'NotificationsList'|'GlobalSearch'|'UnifiedDiscovery'|'EditProfile'|'Verification'|'HelpSupport'|'SavedAddresses'|'Payments')` across `src/` [VERIFIED — CODE]

---

## 8. Implementation log — August 2026

### Phase 1 — Register dead routes ✅
- All ~40 dead routes registered in `AppNavigator.tsx` with `getComponent` lazy requires
- `__DEV__` assertion added (`AppNavigator.tsx:161-186`) — listens for `ready` event, walks `ROOT_STACK_ROUTES` vs registered route names, warns on missing
- Comprehensive route registration test added (`settings01InformationArchitecture.test.ts:386-419`) — parses `ROOT_STACK_ROUTES` from types.ts, verifies each is registered as `<Stack.Screen>` in AppNavigator (excluding dev-only `RuntimeSmokeTest`)

### Phase 2 — Remove redirect shims ✅
- `CreatePosterRedirect.tsx`, `CreateLookRedirect.tsx`, `CreateCameraScreen.tsx`, `CreateLookScreen.tsx` deleted
- `CreatePoster`, `CreateLook`, `CreateCamera` routes removed from types.ts and AppNavigator.tsx
- Zero stale `navigate('CreatePoster'|'CreateLook'|'CreateCamera')` calls remain
- Deep-link compat: these routes were never in linking.ts (internal navigation only), so no backward-compat aliases needed

### Phase 3 — Converge discovery ✅
- `UnifiedDiscovery` route removed from types.ts and AppNavigator.tsx; `UnifiedDiscoveryScreen.tsx` deleted
- Home search button → `navigate('MainTabs', { screen: 'Explore' })` (`HomeScreen.tsx`)
- `GlobalSearch` registered in root stack (kept as standalone route — it is the text search results screen, distinct from the Explore tab's scene-based discovery)
- **Galleria, PulseFeed, ConversationalSearch moved from HomeStack to ExploreStack** (`HomeStack.tsx`, `ExploreStack.tsx`, `types.ts:705-727`)
  - Deep-link paths (`galleria`, `pulse`, `ai-search`) moved from Home.screens to Explore.screens in linking.ts
  - Paths themselves unchanged — only tab resolution changed
  - Root stack registration preserved for cross-tab navigation
  - All navigation calls use `RootStackParamList`-typed navigation, so they resolve via root stack
- `LEGACY_PATH_REWRITES` mechanism added to linking.ts for backward-compat path aliases

### Phase 4 — Converge commerce/trading hubs ✅
- **Auctions** route removed, `AuctionsScreen.tsx` deleted; `auctions/all` → `auctions` deep-link rewrite added
- **TradeHub** route removed, `TradeHubScreen.tsx` deleted
- 4 `handleBack` fallback navigations migrated from `navigate('Portfolio')` → `navigate('CoOwnHub')` in MarketLedgerScreen, DistributionHistoryScreen, SyndicateOrderHistoryScreen, AssetLeaderboardScreen
- **Portfolio** kept as a detail screen (deliberate retention):
  - CoOwnHub (SyndicateHubScreen) is the home base; Portfolio is a drill-down for the full holdings view
  - Validated by `coownFlagshipUpgrade.test.ts:134` which explicitly tests `navigation.navigate('Portfolio')` in SyndicateHubScreen
  - Pattern matches flagship apps (Robinhood: portfolio overview → position detail; Instagram: profile → post detail)
  - Folding Portfolio into CoOwnHub as a segment would be a massive refactor with high risk; the functional issue (no clear home base) is resolved
- **SellerAnalytics** kept as a detail screen (same reasoning):
  - SellerHub is the home base; SellerAnalytics is a drill-down for the full analytics dashboard
  - Reached from SellerHubScreen, MyListingsScreen, ManageListingScreen — all as legitimate drill-downs
  - Folding into SellerHub as a section would be a massive refactor; the current hub → detail pattern is valid

### Phase 5 — Finish Saved/Followers convergence ✅
- `FollowersScreen.tsx`, `FollowingScreen.tsx` deleted; routes removed from types.ts and AppNavigator.tsx
- `ConnectionList` registered in root stack; `MyProfileScreen` navigates to `ConnectionList` with `mode` param
- Dead `'saved'` tab removed from `MyProfileScreen` (no matches for `'saved'` in activeTab union)
- `ExploreCollection` source renamed from `'saved_affinity'` → `'closet_affinity'`
- Store `savedProducts` + `wishlist` kept as separate arrays behind one Closet entry (lower-risk path)
- `WalletActivity` → `WalletHistory` (types, AppNavigator, linking, WalletScreen, notificationRouting)
- `AgentActivity` → `AgentLedger` (types, AppNavigator, linking, AIAgentIntegrationScreen, commandPaletteApi)
- `screenRoleMatrix.ts` updated: removed orphaned entries, renamed Activity terms

### Deep-link backward compat ✅
- `LEGACY_PATH_REWRITES` in linking.ts:
  - `wallet/activity` → `wallet/history` (WalletActivity → WalletHistory)
  - `auctions/all` → `auctions` (Auctions → AuctionHome)
- Galleria/PulseFeed/ConversationalSearch paths unchanged (only tab resolution moved from Home to Explore)
- Creator shim paths (create-poster, create-look, create-camera) were never public — no alias needed

### Validation results — 26 August 2026

**TypeScript typecheck:**
- Zero errors from any modified file (`linking.ts`, `AppNavigator.tsx`, `types.ts`, `HomeStack.tsx`, `ExploreStack.tsx`, `screenRoleMatrix.ts`, `MarketLedgerScreen`, `DistributionHistoryScreen`, `SyndicateOrderHistoryScreen`, `AssetLeaderboardScreen`, test files)
- 173 pre-existing errors in unrelated files (AssetDetailScreen, GlobalSearchScreen, ItemDetailScreen, FlagshipScreen — not caused by this migration)

**Tests:**
- `coownFlagshipUpgrade.test.ts`: 40/40 pass
- `settings01InformationArchitecture.test.ts`: 68/72 pass (4 pre-existing EditProfileScreen content failures — unrelated to navigation IA)
- `i18n.test.ts`: 0 tests collected (pre-existing vitest mock issue with `expo-localization` — unrelated to navigation IA)
- `e2eSmokePlan.test.ts` + `visualRegressionPlan.test.ts`: TradeHub references removed; remaining failures are pre-existing (missing Maestro flows and screenshot baselines)

**Stale reference audit:**
- Zero `import`/`require` of deleted files (AuctionsScreen, FollowersScreen, FollowingScreen, TradeHubScreen, CreatePosterRedirect, CreateLookRedirect, CreateCameraScreen, CreateLookScreen, UnifiedDiscoveryScreen)
- Zero `navigate()` calls to removed routes (Auctions, TradeHub, Followers, Following, WalletActivity, AgentActivity, CreatePoster, CreateLook, CreateCamera, UnifiedDiscovery)
- Zero `push()` calls to removed routes
- `commandPaletteApi.ts` verified clean — no stale route references
- `screenRoleMatrix.ts` verified clean — orphaned entries removed

**Route registration audit:**
- Comprehensive test walks all `ROOT_STACK_ROUTES` and verifies each is registered as `<Stack.Screen>` in AppNavigator — PASSES
- `__DEV__` assertion improved with `ready` event listener — fires correctly even when navigator isn't ready on mount

### Deliberate retentions (with reasoning)

| Route | Report recommendation | Decision | Reasoning |
|---|---|---|---|
| `Portfolio` | Fold into CoOwnHub segments, remove route | **Keep as detail screen** | CoOwnHub is the home base; Portfolio is a drill-down for full holdings view. Validated by coownFlagshipUpgrade test. Hub → detail pattern matches flagship apps. Folding would be a massive refactor with high risk. |
| `SellerAnalytics` | Fold into SellerHub as section, remove route | **Keep as detail screen** | SellerHub is the home base; SellerAnalytics is a drill-down for full analytics dashboard. Same hub → detail pattern. Folding would be a massive refactor. |
| `GlobalSearch` | Fold into Explore scenes | **Keep as root stack route** | GlobalSearch is the text search results screen, distinct from the Explore tab's scene-based discovery. It is reached from multiple surfaces (SearchScreen, BrowseScreen, ClosetScreen, CommandPalette). Keeping it as a root stack route preserves cross-tab reachability. |
| Store `savedProducts` + `wishlist` | Collapse into one `savedItems` collection | **Keep two arrays behind one Closet entry** | Lower-risk path. ClosetScreen already unifies them as tabs. The store implementation detail is invisible to the user. |

### Files changed

| File | Change |
|---|---|
| `navigation/types.ts` | Removed dead route types (Auctions, TradeHub, Followers, Following, WalletActivity, AgentActivity, CreatePoster, CreateLook, CreateCamera, UnifiedDiscovery). Renamed WalletActivity→WalletHistory, AgentActivity→AgentLedger. Moved Galleria/PulseFeed/ConversationalSearch from HomeTabParamList to ExploreTabParamList. Added ROOT_STACK_ROUTES const. |
| `navigation/AppNavigator.tsx` | Registered all ~40 previously-dead routes. Removed deleted routes. Improved `__DEV__` assertion with `ready` event listener. |
| `navigation/linking.ts` | Added `LEGACY_PATH_REWRITES` + `getStateFromPath` override. Renamed WalletActivity→WalletHistory path. Removed Auctions path. Added AgentLedger path. Moved Galleria/PulseFeed/ConversationalSearch from Home.screens to Explore.screens. |
| `navigation/tabStacks/HomeStack.tsx` | Removed Galleria, PulseFeed, ConversationalSearch (moved to ExploreStack). |
| `navigation/tabStacks/ExploreStack.tsx` | Added Galleria, PulseFeed, ConversationalSearch. |
| `contracts/screenRoleMatrix.ts` | Removed orphaned entries (AuctionsScreen, FollowersScreen, FollowingScreen, TradeHubScreen). Renamed WalletActivityScreen→WalletHistoryScreen, AgentActivityScreen→AgentLedgerScreen. |
| `screens/MarketLedgerScreen.tsx` | `navigate('Portfolio')` → `navigate('CoOwnHub')` |
| `screens/DistributionHistoryScreen.tsx` | `navigate('Portfolio')` → `navigate('CoOwnHub')` |
| `screens/SyndicateOrderHistoryScreen.tsx` | `navigate('Portfolio')` → `navigate('CoOwnHub')` |
| `screens/AssetLeaderboardScreen.tsx` | `navigate('Portfolio')` → `navigate('CoOwnHub')` |
| `__tests__/settings01InformationArchitecture.test.ts` | Added comprehensive route registration test |
| `__tests__/e2eSmokePlan.test.ts` | Removed TradeHub journey |
| `__tests__/visualRegressionPlan.test.ts` | Removed TradeHub visual regression suite |
| **Deleted** | `AuctionsScreen.tsx`, `FollowersScreen.tsx`, `FollowingScreen.tsx`, `TradeHubScreen.tsx`, `CreatePosterRedirect.tsx`, `CreateLookRedirect.tsx`, `CreateCameraScreen.tsx`, `CreateLookScreen.tsx`, `UnifiedDiscoveryScreen.tsx` |
