# Thryftverse Flagship Product Blueprint

## Document Purpose

This blueprint maps every production sector of Thryftverse, identifies current quality gaps, and defines the desired flagship outcome for each. It is a living architecture document used to guide UI-22 reconstruction work.

---

## Sector Map

| Sector | Screens/routes | Current purpose | Current quality problem | Missing product depth | Desired flagship outcome | Shared architecture required | Backend dependency | Priority |
|--------|---------------|-----------------|------------------------|----------------------|--------------------------|------------------------------|-------------------|----------|
| **Global navigation and application shell** | TabNavigator, AppNavigator, ScreenHeader, BottomTabBar | Root-level navigation between 5 tabs; modal/push screen transitions | Inconsistent header patterns per screen family; tab bar lacks contextual awareness; no global scroll-aware header behaviour | No unified screen wrapper; no global padding enforcement; no shared sticky action behaviour | Every screen family follows intentional shared structure: consistent headers, safe-area handling, horizontal padding, scroll behaviour, and action placement | FlagshipScreen, FlagshipHeader, FlagshipStickyFooter, TabNavigator (refined) | None (purely frontend) | P0 |
| **Authentication and onboarding** | AuthLanding, Login, SignUp, ForgotPassword | User authentication and account recovery | Functional but basic; lacks progressive onboarding state | No social proof during onboarding; weak error state design; no biometric prompt | Smooth auth flow with clear states, progressive disclosure, and contextual help | FlagshipFormSection, FlagshipState | Auth API | P1 |
| **Home and discovery** | HomeScreen, BrowseScreen, CategoryDetail, CategoryTree, GlobalSearch | Primary feed and category browsing | Home composition lacks editorial hierarchy; poster rail is underdeveloped; discovery feels like a list | Missing hero editorial sections; weak category visual identity; no personalised hero | Rich home composition with editorial hero, poster rail, discovery categories, and product masonry with intentional loading order | FlagshipHeroSection, FlagshipProductCard, StaggeredGridEntrance | Feed API, Category API | P1 |
| **Posters/editorial content** | PosterViewer, CreatePoster | Editorial poster viewing and creation | Poster viewer lacks immersive media handling; creation flow is functional but shallow | No poster storytelling depth; weak sharing actions; no poster series/Collections | Immersive poster viewer with editorial typography, share actions, and series navigation | FlagshipMediaHeader, ResponsiveMediaFrame | Media API | P2 |
| **Search and categories** | SearchScreen, FilterScreen, VisualSearch | Search entry, filtering, visual search | Search results lack density control; filter sheet is basic; visual search lacks feedback | No search history richness; weak filter preview; no search suggestions architecture | Powerful search with history, suggestions, filter preview, and visual search with clear feedback states | FlagshipSegmentedTabs | Search API, Visual Search API | P1 |
| **Item detail and seller discovery** | ItemDetail, UserProfile (seller view) | Product detail and seller context | Item detail lacks commerce depth; seller discovery is weak | No size guide integration; weak similar items; no live offer state | Rich item detail with size guide, similar items, seller trust signals, and live offer state | FlagshipProductCard, FlagshipActionCluster | Listing API, Offer API | P1 |
| **Profile and social identity** | MyProfile, UserProfile, EditProfile | Profile viewing and editing | Profile lacks editorial media treatment; edit profile is still form-like rather than identity-editing | No profile preview in settings; weak cover/avatar editing experience; no social proof editing | Rich profile with editorial media, clear statistics, social identity editing, and tab transitions | FlagshipProfileMedia, FlagshipHeroSection | Profile API | P0 |
| **Edits / Looks / Pulse** | CreateLook, OutfitBuilder, MyProfile (tabs) | User-generated style content | Creation flows are functional but not inspirational; content cards lack editorial quality | No editorial preview during creation; weak content card typography; no pulse narrative | Inspirational creation flow with live preview, editorial cards, and pulse narrative | FlagshipMediaHeader, ResponsiveMediaFrame | Content API | P2 |
| **Closet and collections** | ClosetScreen, CollectionDetail, CreateCollection, EditCollection | Saved items, wishlist, collections | Functional but lacks visual richness; collection covers are underdeveloped | No collection editorial identity; weak empty states; no collection sharing | Beautiful closet with editorial collection covers, clear empty states, and sharing | FlagshipProductCard, FlagshipEmptyGraphic | Collection API | P2 |
| **Selling and listing creation** | SellScreenV2, ListingPreview, EditListing, ManageListing | Listing creation and management | Sell flow is long; preview lacks marketplace context; management is list-based | No draft auto-save; weak preview realism; no listing performance analytics | Streamlined sell flow with draft auto-save, realistic preview, and performance insights | FlagshipFormSection, FlagshipStickyFooter | Listing API, Media API | P1 |
| **Listing management** | ManageListing, MyListings | Active and past listings | Basic list view; no analytics; weak status communication | No listing performance; no bulk actions; no status timeline | Management centre with status timeline, performance indicators, and bulk actions | FlagshipOrderCard | Listing API | P2 |
| **Auctions and bids** | AuctionsScreen, CreateAuction, MyBids | Auction creation and participation | Functional but shallow; lacks competitive tension | No bid history visualization; weak auction ending urgency; no reserve indicator | Auction experience with bid history, urgency timers, and reserve indicators | FlagshipAssetCard | Auction API | P2 |
| **Checkout and payments** | CheckoutScreen, SuccessScreen, Payments | Purchase flow and payment management | Checkout is dense; payment management lacks centre identity | No order summary richness; weak payment method identity; no billing address management | Smooth checkout with rich summary, and a true Payment Centre with method management | FlagshipOrderCard, FlagshipStickyFooter | Commerce API, Payment API | P1 |
| **Orders and support** | MyOrders, OrderDetail, OrderSupport, SupportTicketDetail | Order tracking and issue resolution | Order list is basic; detail lacks timeline; support is form-based | No order timeline visualization; weak issue status tracking; no refund state | Order centre with visual timeline, clear issue status, and refund state | FlagshipOrderCard | Order API, Support API | P1 |
| **Inbox and message requests** | InboxScreen, MessageRequests | Conversation list and request management | Inbox rows are functional but not premium; requests lack context | No rich message preview; weak request action context; no conversation search | Rich inbox with message previews, contextual request actions, and search | FlagshipInteractiveRow | Conversation API | P0 |
| **Chat and marketplace context** | ChatScreen, ChatMediaPreview, ConversationInfo | Messaging and media exchange | Chat lacks marketplace context richness; media viewer is basic | No offer card prominence; weak transaction state in chat; no shared media grid | Rich chat with prominent offer cards, transaction state, and shared media grid | FlagshipActionCluster | Chat API, Media API | P0 |
| **Conversation management** | ConversationInfo, GroupChatInfo, GroupMembers, EditGroup | Conversation settings and group management | Functional but shallow; group management lacks identity | No group cover editing; weak member identity; no permission hierarchy | Conversation settings with group identity editing and clear permission hierarchy | FlagshipProfileMedia | Chat API | P2 |
| **Settings and account** | Settings, EditProfile, AccountSettings, Payments, Postage, Personalisation, ChatSettings, ActiveSessions, BlockedUsers, HelpSupport, About | Account management and preferences | Header/card fragmentation; inputs not unified; mock data present; weak screen purpose expression | No profile preview in settings root; EditProfile is form-like not identity-editor; Payments lacks centre identity; Postage lacks address management; Personalisation lacks visual preview | Unified Settings department: root with profile preview and search; EditProfile as identity editor; Payments as Payment Centre; Postage as Delivery Centre; Personalisation as visual customisation experience | FlagshipScreen, FlagshipHeader, FlagshipSection, FlagshipFormSection, FlagshipState, FlagshipDangerZone | Profile API, Auth API, Commerce API | P0 |
| **Privacy and security** | PrivacySettings, ChangePassword, TwoFactorSetup | Privacy controls and security | Basic toggles and forms; lacks trust signalling | No privacy overview; weak 2FA setup guidance; no security score | Privacy dashboard with clear controls, guided 2FA setup, and security indicators | FlagshipSection, FlagshipState | Auth API | P1 |
| **Notifications** | PushNotifications, NotificationsList | Push and in-app notification preferences | Toggle list is basic; lacks visual indication of coverage | No notification coverage indicator; weak channel management; no quiet hours | Notification centre with coverage indicator, channel management, and quiet hours | FlagshipSection | Preferences API | P2 |
| **Postage and delivery** | PostageScreen | Shipping preferences and carrier selection | Radio-button list inside generic card; lacks address management | No saved addresses; no default address; no delivery preview | Delivery Centre with address management, default address, carrier options, and delivery preview | FlagshipFormSection, FlagshipState | Capabilities API | P1 |
| **Personalisation** | PersonalisationScreen | Content preference tuning | Pills inside cards; lacks visual preview | No live/representative preview; weak selected state; no grouped choices | Visual customisation experience with live preview, clear selected state, and grouped choices | FlagshipSection | Preferences API | P1 |
| **Wallet and withdrawals** | WalletScreen, BalanceScreen, BalanceHistory, Withdraw, AddBankAccount | Balance management and withdrawals | Wallet is a stub; balance lacks visual identity; withdrawal flow is functional | No wallet identity; weak transaction history; no payout schedule | Financial centre with wallet identity, rich transaction history, and payout schedule | FlagshipAssetCard | Finance API | P2 |
| **Co-own discovery** | TradeHub, SyndicateHub, Portfolio | Financial asset discovery and portfolio | Functional but lacks editorial richness; portfolio is list-based | No asset editorial treatment; weak portfolio visualisation; no performance chart | Rich asset discovery with editorial cards and visual portfolio | FlagshipAssetCard, FlagshipHeroSection | Syndicate API | P2 |
| **Co-own asset detail** | AssetDetail, Trade, TradeConfirm, Buyout | Asset trading and detail | Asset detail lacks financial depth; trading flow is basic | No price history chart; weak ownership breakdown; no dividend indicator | Rich asset detail with price history, ownership breakdown, and trading depth | FlagshipAssetCard | Trade API | P2 |
| **Co-own ledger/history** | MarketLedger, CoOwnOrderHistory | Transaction history and ledger | List-based; lacks financial summary | No aggregated summary; weak filtering; no export | Ledger with aggregated summary, filtering, and export | FlagshipOrderCard | Ledger API | P3 |
| **Accessibility and responsive states** | All screens | Accessibility compliance and responsive layout | Inconsistent accessibility labels; no responsive width handling | Missing screen reader optimisation; no keyboard navigation; no reduced motion handling; no font scaling tests | All screens pass accessibility audit: labels, roles, hints, keyboard navigation, reduced motion, font scaling, and contrast | FlagshipScreen (responsive behaviour) | None | P1 |

---

## Implementation Phasing

| Phase | Sectors | Rationale |
|-------|---------|-----------|
| **UI-22A** | Global navigation and application shell | Foundation for all other work |
| **UI-22B** | Settings and account department | Complete product family reconstruction |
| **UI-22C** | Inbox and message requests, Chat and marketplace context | Messaging is high-usage and currently fragmented |
| **UI-22D** | Profile and social identity (MyProfile, UserProfile, Edits, Looks, Pulse) | Social identity is core to retention |
| **UI-22E** | Home and discovery, Posters/editorial content | Discovery is the primary entry point |
| **UI-22F** | Selling and commerce, Checkout and payments, Orders and support | Revenue-critical flows |
| **UI-22G** | Co-own financial department | Niche but high-value user segment |
| **UI-22H** | Accessibility and responsive completion | Compliance and inclusivity |

---

## Shared Architecture Dependency Graph

```
FlagshipScreen
  ├─ FlagshipHeader
  │    ├─ FlagshipHeaderAction
  │    └─ Back button (44x44, surface)
  ├─ FlagshipSection
  │    ├─ FlagshipSectionHeader
  │    └─ FlagshipInteractiveRow
  ├─ FlagshipMediaHeader
  ├─ FlagshipSegmentedTabs
  ├─ FlagshipStickyFooter
  ├─ FlagshipFormSection
  ├─ FlagshipState
  │    ├─ Loading
  │    ├─ Empty
  │    ├─ Error
  │    └─ Offline
  ├─ FlagshipDangerZone
  └─ ResponsiveMediaFrame
```

Each component must be adopted by at least two production screens before creation is justified.

---

## Backend Integration Points

| Sector | API Dependencies | Data Freshness Requirement |
|--------|-----------------|---------------------------|
| Settings root | Profile API (read-only) | Cache 5 min |
| Edit Profile | Profile API (write) | Immediate sync |
| Payments | Commerce API, Capabilities API | Pull to refresh |
| Postage | Capabilities API | Cache 1 hour |
| Account | Auth API, Account API | Immediate sync |
| Chat settings | Chat API (preferences) | Immediate sync |
| Active sessions | Auth API (sessions) | Pull to refresh |
| Blocked users | Social API | Pull to refresh |

---

## Quality Gates

1. No screen may use inline `IS_LIGHT ? ... : ...` color constants.
2. All typography must use `Type` or `T` design tokens.
3. Every interactive element must provide haptic feedback.
4. All Settings subpages must use the shared screen architecture.
5. No fake data may appear in production UI.
6. All destructive actions must be visually separated and confirmable.
7. Loading, empty, and error states must be present on every async screen.
8. Accessibility labels, roles, and hints must be present on every interactive element.
