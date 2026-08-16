# Codebase Screen-Archetype Parity Map
## From one shared shell to role-specific flagship composition

A consistent header does not make every screen flagship. Each screen must follow the mental model of its job.

# A — Media / Discovery
Representative:
- Home
- Search
- Browse
- CategoryDetail
- ExploreCollection
- CollectionDetail
- PulseFeed
- Galleria
- VisualSearch

Target:
- media owns most pixel area;
- low chrome;
- search/filter close to content;
- true aspect ratios;
- progressive metadata;
- no outlined card around every media object.

Review:
- image derivative/focal point;
- video playback;
- skeleton parity;
- long-press/save/profile continuity;
- empty discovery.

# B — Profile / Identity
- MyProfile
- UserProfile
- Followers
- Following
- public seller profile
- LookDetail

Target:
- identity hero;
- authored content tabs;
- compact social/trust proof;
- private utility separate.

P0:
- remove Saved from owner identity rail;
- make public/private visibility explicit.

# C — Listing Authoring / Management
- Sell
- EditListing
- ManageListing
- MyListings
- InventoryManagement
- ListingPreview
- ListingSuccess
- AIPoweredListing
- BulkListing

Target:
- media first;
- category-aware fields;
- progressive optional fields;
- real fulfilment;
- proceeds clarity;
- one publish action;
- management rows, not dashboard cards.

P0:
- Fulfilment V2.
- Manage Listing commercial-state truth.
- reusable policies.

# D — Seller Operations
- SellerHub
- SellerAnalytics
- SellerEarnings
- SellerFulfilment
- SellerAuctionCentre
- MyOrders
- OrderDetail

Target:
- task-first;
- money/order truth;
- urgency;
- payout clarity;
- analytics drill-down.

P0:
- authoritative SellerHub overview;
- orders to ship;
- payouts;
- correct metric semantics.

# E — Standard Product Detail
- ItemDetail
- related commerce sheets

Target order:
1. media;
2. identity/price;
3. max 3 trust facts;
4. description/evidence;
5. seller;
6. buying detail;
7. related discovery.

Audit:
- avoid horizontal main-section tabs;
- category-aware evidence;
- high-value capability truth;
- sticky action never obscures content.

# F — Auction
- AuctionHome
- Auctions
- AuctionDetail
- MyBids
- CreateAuction
- SellerAuctionCentre

Target:
- time/status dominates;
- current bid and action clear;
- history progressive;
- ended/won/lost distinct;
- seller controls separate.

# G — Co-Own / Financial Market
- CoOwnHub/SyndicateHub
- AssetDetail
- Portfolio
- Trade
- TradeConfirm
- MarketLedger
- Leaderboard
- PriceAlerts
- TaxDocs
- RecurringOrders
- CorporateAction
- Buyout
- DistributionHistory

Target:
- retail-comprehensible summary;
- progressive sophistication;
- financial truth;
- highest density only in advanced/data screens.

P0: Asset Detail V4.

# H — Messaging / People
- Inbox
- Chat
- NewMessage
- CreateGroupChat
- GroupChat
- GroupInfo
- GroupMembers
- MessageRequests
- ConversationInfo

Target:
- identity/conversation dominates;
- low chrome;
- immediate search;
- flat people rows;
- keyboard ergonomics.

P0: real `/users/search` + E2E.

# I — Settings / Security / Privacy
- Settings
- AccountControl
- ChangePassword
- TwoFactor
- ActiveSessions
- PrivacySettings
- DataPrivacy
- Accessibility
- NotificationPreferences
- ConnectedAccounts
- BlockedUsers
- DataExport
- DeleteAccount
- About

Target:
- flat utility canvas;
- grouped rows;
- minimal icon containers;
- forms without card-within-card.

Border hotlist includes ChangePassword, DataExport, BlockedUsers, SavedAddresses and several account/verification utilities.

# J — Wallet / Payments / Transactions
- Wallet
- WalletActivity
- Withdraw
- AddBankAccount
- Payments
- Checkout
- AddressForm
- BalanceHistory
- OrderReceipt

Target:
- money state dominates;
- available/on-hold/processing explicit;
- minimal forms;
- fees before confirmation;
- strong success/failure continuity.

# K — Trust / Verification / Legal
- Verification
- KYCVerification
- VerificationStatus
- SellerVerification
- BuyerProtection
- Report
- ResolutionCentre
- SupportTicket
- OrderSupport

Target:
- document/status mental model;
- visible progress;
- evidence requests explain why;
- no repeated “shield card” motif.

# L — Creator
- CreatorStudio
- LookComposer
- PosterComposer
- CreatorDraftList
- PosterViewer
- LookDetail
- CreatorAssetPicker

Target:
- canvas/media is product;
- controls float/recede;
- context actions on selection;
- capture→edit continuity;
- typography curated;
- Poster temporal depth remains a benchmark requirement.

# Static visual hotlist

Prioritize manual screenshot/code review:
- SellerHubScreen
- ManageListingScreen
- ChangePasswordScreen
- MyListingsScreen
- SellerAnalyticsScreen
- DataExportScreen
- BlockedUsersScreen
- GroupMembersScreen
- SavedAddressesScreen
- BalanceHistoryScreen
- ResolutionCentreScreen
- CoOwnTaxDocumentsScreen
- BuyoutScreen
- StyleQuizScreen
- EditGroupScreen
- PostageScreen
- ReportScreen
- SearchScreen
- BundleBagScreen
- InviteFriendsScreen
- DeleteAccountScreen
- BuyerProtectionScreen
- OutfitBuilderScreen
- LoginScreen
- SyndicateOnboardingScreen
- CoOwnIssueScreen
- EditProfileScreen
- CollectionDetailScreen
- VerificationStatusScreen

This is a review queue, not an automatic border-deletion list.

# Per-archetype scoring

Score:
1. focal hierarchy;
2. density;
3. chrome restraint;
4. task clarity;
5. state truth;
6. native interaction;
7. accessibility;
8. performance/media fidelity;
9. edge states;
10. product signature.

Core journey: no dimension <8 and mean ≥9.
