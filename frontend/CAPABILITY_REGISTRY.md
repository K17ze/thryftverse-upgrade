# ThryftVerse Capability Registry & Scope Gates

> **Purpose:** Map every product capability to its implementation depth, proving which features are production-ready vs. surface-level. This prevents feature proliferation without depth.
> **Audit source:** THRYFTVERSE_FLAGSHIP_PRODUCT_DEPTH_AUDIT_2026-09-01.md §13 (P2-15)

## How to Use This Document

Before adding a new feature or claiming a capability is "done", verify it against this registry. A capability is only **PRODUCTION** when all its state paths, contracts, and UI states are implemented and tested.

## Capability Depth Levels

| Level | Meaning | Criteria |
|-------|---------|----------|
| **PRODUCTION** | Flagship-ready | Full state coverage, server-backed, tested, localized, accessible |
| **BETA** | Functional but incomplete | Core happy path works, some states missing, not fully localized |
| **SURFACE** | UI exists, shallow depth | Screen renders but backend/state/edge cases are incomplete |
| **STUB** | Route exists, minimal implementation | Navigation works but screen is placeholder |
| **PLANNED** | Not implemented | Route type exists, no screen |

---

## 1. Commerce & Listings

| Capability | Screen(s) | Lines | Level | Gaps | Owner |
|-----------|-----------|-------|-------|------|-------|
| Product Detail (PDP) | ItemDetailScreen | 2,596 | PRODUCTION | Decomposed into hooks, full state coverage | — |
| Sell/Create Listing | SellScreen | 2,105 | PRODUCTION | Full form, media upload, category/brand/condition | — |
| Edit Listing | EditListingScreen | 1,928 | PRODUCTION | Autosave, conflict detection, draft restore (Wave 7) | — |
| Checkout | CheckoutScreen | 2,221 | PRODUCTION | Inline validation, 3-dot progress, trust badges | — |
| Make Offer | MakeOfferScreen | 1,120 | PRODUCTION | Offer state machine, context bar, milestones | — |
| My Listings | MyListingsScreen | ~800 | PRODUCTION | Cursor pagination, server totals | — |
| Inventory Mgmt | InventoryManagementScreen | 1,234 | PRODUCTION | Cursor pagination, bulk operations | — |
| Manage Listing | ManageListingScreen | ~900 | PRODUCTION | Context preservation, analytics drill-down (Wave 7) | — |
| Seller Hub | SellerHubScreen | ~600 | PRODUCTION | Task-first composition, server task routes | — |
| Seller Analytics | SellerAnalyticsScreen | ~1,100 | PRODUCTION | Trends, funnel, period comparison (Wave 7) | — |

## 2. Messaging & Chat

| Capability | Screen(s) | Lines | Level | Gaps | Owner |
|-----------|-----------|-------|-------|------|-------|
| Inbox | InboxScreen | 1,382 | PRODUCTION | Segmentation, requests, dense rows (Wave 7) | — |
| Chat (1:1) | ChatScreen | 2,056 | PRODUCTION | Message editing, reactions, read receipts, context bar | — |
| Group Chat | GroupChatScreen | ~800 | BETA | Group identity, member roles, no group calls | — |
| Message Editing | (inline in Chat) | — | PRODUCTION | 15-min window, realtime reconciliation (Wave 7) | — |
| Reactions | (inline in Chat) | — | PRODUCTION | Emoji reactions, realtime sync | — |
| Read Receipts | (inline in Chat) | — | PRODUCTION | Per-message, group "Read by N" | — |
| Pin/Unread | (inline in Inbox) | — | PRODUCTION | Server-backed, optimistic update | — |
| Block/Report | BlockedUsersScreen | ~300 | PRODUCTION | Server-authoritative, enforcement | — |
| Scam Detection | (inline in Chat) | — | PRODUCTION | Server-side scanner, warning card | — |
| Offer Messages | (inline in Chat) | — | PRODUCTION | State machine, milestone, context bar | — |
| Voice Messages | (inline in Chat) | — | BETA | Recording, playback, waveform — no voice transcription | — |
| Video Messages | (inline in Chat) | — | BETA | Recording, playback — no video compression | — |
| Forwarding | — | — | PLANNED | Not implemented | — |
| Star/Favorite | — | — | PLANNED | Not implemented | — |
| Scheduled Messages | — | — | PLANNED | Not implemented | — |
| Disappearing Messages | — | — | PLANNED | Not implemented | — |
| Document/Location/Contact | — | — | SURFACE | Attachment picker has UI, handlers TODO (P2-02) | — |

## 3. Discovery & Feed

| Capability | Screen(s) | Lines | Level | Gaps | Owner |
|-----------|-----------|-------|-------|------|-------|
| Home Feed | HomeScreen | 1,714 | PRODUCTION | ForYou/Following tabs, pull-to-refresh | — |
| Search | GlobalSearchScreen | 2,001 | PRODUCTION | Typeahead, saved searches, people search | — |
| Visual Search | VisualSearchScreen | 1,098 | BETA | Camera-based search, results need tuning | — |
| Unified Discovery | UnifiedDiscoveryScreen | 1,040 | BETA | Combined feed/search/browse | — |
| Browse | BrowseScreen | 1,013 | PRODUCTION | Category browsing | — |
| Filters | FilterScreen | 1,411 | PRODUCTION | Advanced filters, sort, price range | — |
| Closet/Wishlist | ClosetScreen | 1,097 | PRODUCTION | Saved items, collections | — |
| Notifications | NotificationsScreen | 1,331 | PRODUCTION | Activity feed, push integration | — |

## 4. Creator & Social

| Capability | Screen(s) | Lines | Level | Gaps | Owner |
|-----------|-----------|-------|-------|------|-------|
| Profile | MyProfileScreen | 1,705 | PRODUCTION | Listings, looks, reviews, followers | — |
| User Profile | UserProfileScreen | 1,287 | PRODUCTION | Other user's profile, follow, message | — |
| Look Detail | LookDetailScreen | 1,415 | PRODUCTION | Multi-item looks, shop the look | — |
| Poster Viewer | PosterViewerScreen | 1,641 | PRODUCTION | Full-screen poster, items overlay | — |
| Moodboard Editor | MoodboardEditorScreen | 1,745 | BETA | Drag-and-drop, item placement — needs polish | — |
| Portfolio | PortfolioScreen | 1,208 | BETA | Creator portfolio, looks grid | — |
| Creator Analytics | CreatorAnalyticsDashboardScreen | 1,127 | BETA | Views, engagement, timeline — needs trends | — |
| Galleria | GalleriaScreen | 1,132 | BETA | Curated collections | — |

## 5. Live Shopping

| Capability | Screen(s) | Lines | Level | Gaps | Owner |
|-----------|-----------|-------|-------|------|-------|
| Live Viewer | LiveStreamViewerScreen | 1,561 | BETA | LiveKit integration, chat, bidding — needs stability | — |
| Live Seller | LiveStreamSellerScreen | 1,068 | BETA | Broadcast, product showcase — needs polish | — |
| Live Home | LiveShoppingHomeScreen | 1,040 | BETA | Schedule, upcoming, past streams | — |

## 6. Auctions

| Capability | Screen(s) | Lines | Level | Gaps | Owner |
|-----------|-----------|-------|-------|------|-------|
| Auction Home | AuctionHomeScreen | 1,602 | BETA | Active/upcoming/past auctions | — |
| Auction Detail | AuctionDetailScreen | 1,923 | BETA | Bidding, history, auto-bid — needs realtime | — |
| Create Auction | CreateAuctionScreen | 1,006 | BETA | Auction creation form | — |
| Seller Auction Centre | SellerAuctionCentreScreen | 1,211 | BETA | Seller-side auction management | — |

## 7. Co-Ownership & Trading

| Capability | Screen(s) | Lines | Level | Gaps | Owner |
|-----------|-----------|-------|-------|------|-------|
| Asset Detail | AssetDetailScreen | 2,062 | BETA | Co-own asset, fractions, distributions | — |
| Asset Due Diligence | AssetDueDiligenceScreen | 1,158 | BETA | Risk assessment, documentation | — |
| Trade | TradeScreen | 1,091 | BETA | Fraction trading — needs liquidity indicators | — |
| Syndicate Hub | SyndicateHubScreen | 1,214 | BETA | Group investment pools | — |
| Create Syndicate | CreateSyndicateScreen | 1,260 | BETA | Syndicate creation | — |
| Portfolio | PortfolioScreen | 1,208 | BETA | Holdings, performance — needs trends | — |

## 8. AI & Agents

| Capability | Screen(s) | Lines | Level | Gaps | Owner |
|-----------|-----------|-------|-------|------|-------|
| AI Agent Integration | AIAgentIntegrationScreen | 1,760 | BETA | BYOK, provider config — needs testing | — |
| AI Powered Listings | AIPoweredListingScreen | 1,537 | BETA | AI listing suggestions — needs quality tuning | — |
| Bot Builder | BotBuilderScreen | 1,221 | BETA | Custom agent creation — needs templates | — |
| Bot Directory | BotDirectoryScreen | ~600 | BETA | Agent marketplace | — |
| Custom Bots | CustomBotsScreen | ~500 | BETA | User's custom agents | — |
| Conversational Search | (inline in Search) | — | BETA | AI-powered search — needs relevance tuning | — |
| Your Algorithm | YourAlgorithmScreen | 1,335 | PRODUCTION | Feed transparency, signal control | — |

## 9. Settings & Account

| Capability | Screen(s) | Lines | Level | Gaps | Owner |
|-----------|-----------|-------|-------|------|-------|
| Settings Hub | SettingsScreen | 989 | PRODUCTION | Job-based sections, search (P2-04 Wave 8) | — |
| Edit Profile | EditProfileScreen | ~600 | PRODUCTION | Avatar, bio, username | — |
| Verification | VerificationScreen | ~500 | PRODUCTION | KYC, DAC7, badge | — |
| Change Password | ChangePasswordScreen | ~300 | PRODUCTION | 2FA, TOTP | — |
| Account Control | AccountControlScreen | ~300 | PRODUCTION | Delete, deactivate, export | — |
| Delete Account | DeleteAccountScreen | ~400 | PRODUCTION | Re-auth, biometric, TOTP, confirm phrase | — |
| Data Export | DataExportScreen | ~300 | PRODUCTION | Real export delivery with download | — |
| Privacy Settings | PrivacySettingsScreen | ~300 | PRODUCTION | Visibility, blocked users | — |
| Data Privacy | DataPrivacyScreen | ~400 | PRODUCTION | Consent toggles, backend sync | — |
| Blocked Users | BlockedUsersScreen | ~300 | PRODUCTION | Server-authoritative list | — |
| Notification Prefs | NotificationPreferencesScreen | ~400 | PRODUCTION | Push, email, quiet hours | — |
| Accessibility | AccessibilitySettingsScreen | ~300 | PRODUCTION | Text size, reduced motion, contrast | — |
| Personalisation | PersonalisationScreen | ~400 | PRODUCTION | Feed preferences, content controls | — |

## 10. Wallet & Payments

| Capability | Screen(s) | Lines | Level | Gaps | Owner |
|-----------|-----------|-------|-------|------|-------|
| Wallet | WalletScreen | ~600 | PRODUCTION | Balance, payout, history | — |
| Withdraw | WithdrawScreen | 1,288 | PRODUCTION | Payout flow, bank details | — |
| Wallet Convert | WalletConvertScreen | 1,228 | BETA | Currency conversion — needs FX rate display | — |
| Balance History | BalanceHistoryScreen | ~400 | PRODUCTION | Transaction history | — |
| Payments | PaymentsScreen | ~300 | PRODUCTION | Payment methods, cards | — |
| Saved Addresses | SavedAddressesScreen | ~400 | PRODUCTION | Shipping addresses | — |
| Address Form | AddressFormScreen | 1,016 | PRODUCTION | Address CRUD | — |

## 11. Authentication

| Capability | Screen(s) | Lines | Level | Gaps | Owner |
|-----------|-----------|-------|-------|------|-------|
| Login | LoginScreen | 1,049 | PRODUCTION | Email, social, biometric | — |
| Onboarding | OnboardingScreen | ~500 | PRODUCTION | Age verification, preferences | — |
| Age Verification | AgeVerificationScreen | ~300 | PRODUCTION | DOB, compliance | — |

---

## Scope Gates

### Gate 1: Before adding a new feature
- [ ] Does this feature serve a core user job (buy, sell, message, discover)?
- [ ] Is there a canonical contract (types, API, domain model)?
- [ ] Are all states designed (loading, empty, error, offline, partial)?
- [ ] Is it localized (all 13 locales)?
- [ ] Is it accessible (labels, touch targets, reduced motion)?
- [ ] Does it use design tokens (no hardcoded colors/sizes)?

### Gate 2: Before claiming a capability is "production"
- [ ] Full state coverage verified
- [ ] Server-backed (not local-only)
- [ ] TypeScript types are complete (no `any`)
- [ ] Visual release gates pass (0 P0, 0 P1)
- [ ] Locale validation passes
- [ ] At least one test covers the core path

### Gate 3: Before adding a new screen
- [ ] Is this screen's job distinct from existing screens?
- [ ] Does it use the appropriate page composition archetype?
- [ ] Is it under 1,000 lines (or decomposed into hooks)?
- [ ] Does it use AppIcon (not direct Ionicons)?
- [ ] Does it use FlagshipState for loading/empty/error?

---

## Portfolio Summary (2026-09-02)

| Metric | Value | Target |
|--------|-------|--------|
| Total screens | 172 | < 180 |
| Screens ≥ 1,000 lines | 47 | < 30 |
| Total screen lines | 130,731 | < 100,000 |
| Largest screen | 2,596 (ItemDetail) | < 1,500 |
| AppIcon adoption | 23/172 | > 100/172 |
| Direct Ionicons usage | 154/172 | < 50/172 |
| Production capabilities | 42 | — |
| Beta capabilities | 28 | — |
| Surface/stub capabilities | 3 | 0 |
| Planned capabilities | 4 | — |

### Priority Scope Reductions
1. **Decompose screens > 1,500 lines** (12 screens): ItemDetail, Checkout, Sell, AssetDetail, Chat, GlobalSearch, EditListing, AuctionDetail, AIAgentIntegration, MoodboardEditor, Home, MyProfile
2. **Complete beta capabilities** in commerce and messaging (highest user impact)
3. **Remove or upgrade stub/surface capabilities** — no dead routes
4. **Migrate Ionicons to AppIcon** on top 20 screens (P2-10)
