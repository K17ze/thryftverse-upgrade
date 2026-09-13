# Sub-Department Surface Inventory — ThryftVerse RN App

**Track:** Complete sub-department inventory + quality assessment
**Date:** current audit (post-dated to repo state; supersedes `undeveloped-surface-map.md` of 2026-09-11 where they conflict)
**Scope:** `frontend/src/screens/` (171 files → ~166 shippable surfaces after removing aliases/shims/dev-screens) + `frontend/src/components/` (566 files) + `ops-console/` (admin web app)
**Method:** full-screen census + per-file signal scan (flagship-primitive imports, service wiring, state-coverage keywords, a11y labels, haptics, demo/mock/coming-soon markers, dead handlers, hex-color leaks) + targeted implementation reads of ~30 representative surfaces per department.

## Grading rubric

- **FLAGSHIP** — authored composition, flagship-grammar primitives or equivalent, full state machine (loading/empty/error/offline), real wiring, haptics + a11y, domain-factored.
- **COMPETENT** — wired, token-disciplined, honest, adequate states; held back by monolith size, pre-flagship grammar, or thin domain depth.
- **PROTOTYPE** — materially shallow for the role it plays; minimal states or missing expected depth; still honest.
- **AI-SLOP** — fabricated affordances, undisclosed fake data, dead primary controls, generic card-stack.

**Headline finding:** the codebase is post-cleanup. The Sept-11 map's P0 dishonesty items are largely resolved — demo content is now gated (`__DEV__`/`EXPO_PUBLIC_MOCK_MODE` or runtime API-failure detection) and carries honest "demo" badges (Galleria `GALLERIA_DEMO_MODE`, ConversationalSearch per-message `isDemo`, AI-preferences preview notice). TODO markers are near-zero; hex-color leaks are near-zero; every screen uses theme tokens. **No screen grades AI-SLOP outright.** Remaining debt is structural (monolith screens with zero flagship-grammar imports) and depth gaps, plus a few localized dishonest affordances flagged below.

---

## 1. Settings & Account (~24 surfaces)

Shared component system: `components/settings/` (SettingsPage/Section/Row/Card/InfoBanner/StickySaveBar/SignOutRow/IdentityCard/PasswordStrengthBar/RadioButton) + `screens/settings/settingsRouteMetadata.ts` (searchable route metadata with i18n rowKeys).

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| Settings hub | `screens/SettingsScreen.tsx` | FLAGSHIP | Route-metadata search, sectioned IA, i18n row keys, currency/language/accent pickers, feature-flag debug section, skeleton state (1106 LOC) |
| Accessibility | `screens/AccessibilitySettingsScreen.tsx` | COMPETENT | Thin (238) but wired prefs |
| Account control | `screens/AccountControlScreen.tsx` | COMPETENT | Real `requestMyDataExport` API, haptics (121) |
| Account security | `screens/AccountSecurityScreen.tsx` | COMPETENT | 612, wired |
| Security recovery | `screens/AccountSecurityRecoveryScreen.tsx` | COMPETENT | 526, wired |
| Active sessions | `screens/ActiveSessionsScreen.tsx` | COMPETENT | 376, wired |
| Biometric login | `screens/BiometricLoginScreen.tsx` | COMPETENT | Thin (235) |
| Change password | `screens/ChangePasswordScreen.tsx` | COMPETENT | 292, haptics |
| Connected accounts | `screens/ConnectedAccountsScreen.tsx` | COMPETENT | Thin (230), 0 a11y labels |
| Data export | `screens/DataExportScreen.tsx` | COMPETENT | Thin (295) |
| Data privacy | `screens/DataPrivacyScreen.tsx` | COMPETENT | GDPR IA, routes to canonical export/delete screens |
| Delete account | `screens/DeleteAccountScreen.tsx` | COMPETENT | 541, confirmation flow |
| Email notifications | `screens/EmailNotificationsScreen.tsx` | COMPETENT | Thin (247) |
| Notification prefs | `screens/NotificationPreferencesScreen.tsx` | COMPETENT | 513, quiet hours |
| Personalisation | `screens/PersonalisationScreen.tsx` | COMPETENT | Store-wired prefs grid |
| Privacy settings | `screens/PrivacySettingsScreen.tsx` | COMPETENT | Thin (281) |
| Push notifications | `screens/PushNotificationsScreen.tsx` | COMPETENT | 488, permission context |
| Sustainability prefs | `screens/SustainabilityPreferencesScreen.tsx` | COMPETENT | 406 |
| Two-factor setup | `screens/TwoFactorSetupScreen.tsx` | FLAGSHIP | 771, fl:3 imports, real TOTP verify, haptics |
| AI preferences | `screens/AIPreferencesScreen.tsx` | COMPETENT | Honest "features in preview" banner |
| Your algorithm | `screens/YourAlgorithmScreen.tsx` | COMPETENT | 597, real signals service |
| Blocked users | `screens/BlockedUsersScreen.tsx` | COMPETENT | 267, unblock flow |
| About | `screens/AboutScreen.tsx` | COMPETENT | 168, dev-mode easter egg (7-tap), real Share/Linking |
| Account settings | `screens/AccountSettingsScreen.tsx` | N/A | 35-LOC redirect shim to EditProfile (fixed 2026-09-11) |

**Top defects:** `ConnectedAccountsScreen` has 0 `accessibilityLabel`s; several satellites are single-list thin with no offline banner. No fabricated rows found — every row routes or toggles real state.

**Already good — don't touch:** `settingsRouteMetadata.ts` search architecture; `SettingsSection`/`SettingsRow` token grammar; DataPrivacy's canonical-routing design.

---

## 2. Edit / Create / Form Surfaces

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| Edit profile | `screens/EditProfileScreen.tsx` | FLAGSHIP | `usePreventRemove` dirty-guard, live preview component, media-upload hook, FlagshipScreen (867) |
| Sell (create listing) | `screens/SellScreen.tsx` | COMPETENT | 3-hook domain pattern (data→form→actions), ListingMediaStudio/CameraSheet/PublishFooter; still 1486 LOC, zero flagship imports |
| Edit listing | `screens/EditListingScreen.tsx` | COMPETENT | 1539-LOC monolith, haptics, skeletons |
| AI-powered listing | `screens/AIPoweredListingScreen.tsx` | COMPETENT | 1491, 17 skeleton refs, pre-flagship grammar |
| Create auction | `screens/CreateAuctionScreen.tsx` | COMPETENT | 1561, fl:0, 5 residual hex leaks |
| Bulk listing | `screens/BulkListingScreen.tsx` | COMPETENT | 987, wired |
| Catalog import (6) | `screens/CatalogImport{Start,Consent,Item,Progress,Review,Summary}Screen.tsx` | COMPETENT | ~2900 LOC total, all fl:0 — pre-flagship flow grammar; Consent screen honest-permission copy |
| Create/Edit collection | `screens/Create{,Edit}CollectionScreen.tsx` | COMPETENT | Thin (459/358), store-wired |
| Manage collection items | `screens/ManageCollectionItemsScreen.tsx` | COMPETENT | 389 |
| Create group chat | `screens/CreateGroupChatScreen.tsx` | COMPETENT | 1132, wired member picker |
| Edit group | `screens/EditGroupScreen.tsx` | COMPETENT | 881, chatApi-wired |
| Address form | `screens/AddressFormScreen.tsx` | COMPETENT | 1015, validation |
| Create syndicate | `screens/CreateSyndicateScreen.tsx` | COMPETENT | 1344, real issuer-listing fetch (no mockData) |
| Listing preview | `screens/ListingPreviewScreen.tsx` | PROTOTYPE | 387, static preview shell — legit but no states |
| Write review | `screens/WriteReviewScreen.tsx` | COMPETENT | 500, wired |
| Report | `screens/ReportScreen.tsx` | COMPETENT | Evidence upload via `uploadMedia`, per-target reason models (user/listing/conversation) |
| Appeal | `screens/AppealScreen.tsx` | COMPETENT | 826, wired |

**Top defects:** Sell/EditListing/AIPoweredListing/CreateAuction collectively ~6,000 LOC of pre-flagship form grammar on the core revenue funnel — the single largest grammar gap in the app. `CreateAuctionScreen` still has 5 hardcoded hex values.

---

## 3. Commerce (checkout, offers, orders)

Shared system: `components/checkout/` (AddAddressSheet, AddCardSheet, CheckoutItemSummary, PaymentSelector, ProgressOverlay, SelectionRow, Skeleton, PaymentStateBanner, PriceRow, PulsingDot), `components/orders/` (timeline, footer, sheets, dispatch countdown, review prompt, inspection banner, package contents).

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| Checkout | `screens/CheckoutScreen.tsx` | COMPETENT | 2482-LOC monolith — largest file in app; real Stripe PaymentSheet + intent settlement + shipping quotes + capability policy + screen-capture protection; **zero flagship imports** |
| Make offer | `screens/MakeOfferScreen.tsx` | FLAGSHIP | Idempotency-key lookup, unknown-outcome reconciliation hook, FlagshipScreen (1155) |
| My orders | `screens/MyOrdersScreen.tsx` | COMPETENT | 876, store+API, skeletons |
| Order detail | `screens/OrderDetailScreen.tsx` | COMPETENT | 1282, `orderDetailLogic` domain module (status normalisation, timeline builder, ETA windows), 32 haptic calls, domain components |
| Order receipt | `screens/OrderReceiptScreen.tsx` | COMPETENT | 696 |
| Order support | `screens/OrderSupportScreen.tsx` | COMPETENT | 674 |
| Payments | `screens/PaymentsScreen.tsx` | COMPETENT | 497, 4 hex leaks |
| Saved addresses | `screens/SavedAddressesScreen.tsx` | COMPETENT | 467 |
| Postage | `screens/PostageScreen.tsx` | COMPETENT | 372 |
| Bundle bag | `screens/BundleBagScreen.tsx` | COMPETENT | 312 |
| Buyout | `screens/BuyoutScreen.tsx` | COMPETENT | 825, haptics |
| Trade / confirm / success | `screens/{TradeScreen,TradeConfirmScreen,SuccessScreen}.tsx` | COMPETENT | 1232/747/354 |
| Buyer protection | `screens/BuyerProtectionScreen.tsx` | COMPETENT | Real claim form + protection API + skeleton (351) |

**Top defects:** `CheckoutScreen` (2482 LOC) violates the charter's 400-line orchestrator rule by 6×; state machines are real but composition is a single file doing payment intents + addresses + postage + Stripe + messaging. `PaymentsScreen` has residual hardcoded hex.

---

## 4. Wallet & Money

Shared: `components/wallet/` (WalletTransactionHistory, AddMoneySheet), `components/coown/` state canvases.

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| Wallet | `screens/WalletScreen.tsx` | FLAGSHIP | Biometric gate, screen-capture protection, AddMoneySheet, transaction history, offline banner (928) |
| Wallet history | `screens/WalletHistoryScreen.tsx` | COMPETENT | Deliberately thin canonical-ledger wrapper per spec 17 — one-ledger design is intentional, not lazy (124) |
| Wallet convert | `screens/WalletConvertScreen.tsx` | COMPETENT | 1228, haptics |
| Withdraw | `screens/WithdrawScreen.tsx` | COMPETENT | 1288, wired |
| Balance history | `screens/BalanceHistoryScreen.tsx` | COMPETENT | Thin (316) — payout ledger |
| Add bank account | `screens/AddBankAccountScreen.tsx` | COMPETENT | Thin (294) |
| Seller earnings | `screens/SellerEarningsScreen.tsx` | COMPETENT | Thin (353) |

**Already good:** WalletHistory's "one canonical ledger" IA (documented spec reference) — model for how thin wrappers should justify themselves.

---

## 5. Seller Department

Shared system: `components/seller/` — SellerExecutiveHero, SellerPillarTiles, SellerOrdersModule, SellerAnalyticsModule, SellerClosetModule, SellerListingsModule, SellerOpportunitiesModule, SellerHubDock, SellerTrustStrip, SellerThumbRail, `hubViewModels.ts`, `analytics/`.

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| Seller hub | `screens/SellerHubScreen.tsx` | FLAGSHIP | Reference implementation: 412-LOC orchestrator, per-resource status machines w/ inline retry, zone-composed modules, freshness propagation, dock outside scroll |
| Manage listing | `screens/ManageListingScreen.tsx` | FLAGSHIP | 794, fl:3 imports |
| Seller analytics | `screens/SellerAnalyticsScreen.tsx` | COMPETENT | 274, skeletons; thin for an "analytics" surface |
| Seller auction centre | `screens/SellerAuctionCentreScreen.tsx` | COMPETENT | 1204, marketApi-wired, skeleton+retry |
| Seller fulfilment | `screens/SellerFulfilmentScreen.tsx` | COMPETENT | 880, haptics |
| Inventory management | `screens/InventoryManagementScreen.tsx` | COMPETENT | 1287, 22 state refs |
| My listings | `screens/MyListingsScreen.tsx` | COMPETENT | 678, skeletons |
| Seller verification | `screens/SellerVerificationScreen.tsx` | COMPETENT | 425 |
| Listing success | `screens/ListingSuccessScreen.tsx` | COMPETENT | 585 |

**Already good — don't touch:** `SellerHubScreen` + `components/seller/*` — this is the department template the rest of the app should converge on.

---

## 6. Messaging

Shared system: `components/chat/` — 41 components (composer bar, message bubble, voice recorder/bubble, swipeable message, typing indicator, mention picker, poll bubble, offer context bar, scam/payment warnings, pinned bar, reaction bar, forward/context/info sheets, inbox row, transaction strip, marketplace card, agent picker, skeletons). Hooks: `useConversationComposer`, `useConversationSafety`, `useConversationAgents`, etc.

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| Chat | `screens/ChatScreen.tsx` | COMPETENT | 2203-LOC orchestrator; domain hooks + 41-component ecosystem; fl:0 — pre-flagship screen grammar despite excellent parts |
| Inbox | `screens/InboxScreen.tsx` | COMPETENT | 1599, skeletons (audited rows) |
| Chat settings | `screens/ChatSettingsScreen.tsx` | COMPETENT | Thin (175) menu — legit |
| Archived convos | `screens/ArchivedConversationsScreen.tsx` | COMPETENT | 213, store-driven |
| Muted convos | `screens/MutedConversationsScreen.tsx` | COMPETENT | 102 LOC w/ skeleton+empty — correctly thin |
| Message requests | `screens/MessageRequestsScreen.tsx` | COMPETENT | 523 |
| New message | `screens/NewMessageScreen.tsx` | COMPETENT | Agent chats now real deployed bots (was demo fabrication, fixed) |
| Conversation info | `screens/ConversationInfoScreen.tsx` | PROTOTYPE | 387, thin — no depth beyond a few rows |
| Group chat | `screens/GroupChatScreen.tsx` | COMPETENT | 815 |
| Group info | `screens/GroupChatInfoScreen.tsx` | COMPETENT | 1029, deep wiring: invite links create/revoke, media fetch, promote/demote/remove, capabilities |
| Group members | `screens/GroupMembersScreen.tsx` | COMPETENT | 964, real role actions |
| Group permissions | `screens/GroupPermissionsScreen.tsx` | PROTOTYPE | Fail-closed server model (good) but only 3 editable keys — no roles, no per-member exceptions, no audit trail |
| Group bot mgmt | `screens/GroupBotManagementScreen.tsx` | COMPETENT | 466, skeletons |
| Quick replies | `screens/ManageQuickRepliesScreen.tsx` | COMPETENT | 541, FlagshipState, offline-aware |
| Shared media | `screens/SharedConversationMediaScreen.tsx` | COMPETENT | 486 |
| Media preview | `screens/ChatMediaPreviewScreen.tsx` | PROTOTYPE | 196-LOC minimal viewer |

**Top defect:** `SupportConversationScreen.tsx:572` — **dead "Attach file" button** (`onPress={() => {}}` with a11y label promising photo/document attach). Fake affordance on a trust surface; wire it or remove it.

---

## 7. Bots / AI Agents

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| Agent studio | `screens/AIAgentIntegrationScreen.tsx` | FLAGSHIP | Phase-7 re-architecture: real provider verify round-trips, truthful Connected/Invalid badges, on-device key disclosure; **caveat:** 1700 LOC + disabled "coming soon" provider chips for Anthropic/Google etc. |
| Bot builder | `screens/BotBuilderScreen.tsx` | COMPETENT | 1231, wired |
| Bot detail | `screens/BotDetailScreen.tsx` | COMPETENT | 858, skeletons |
| Bot directory | `screens/BotDirectoryScreen.tsx` | COMPETENT | 383 |
| Custom bots | `screens/CustomBotsScreen.tsx` | COMPETENT | Now `fetchCustomBotsFromApi`-wired w/ FlagshipState + skeletons (was static per Sept-11 map) |
| Agent ledger | `screens/AgentLedgerScreen.tsx` | PROTOTYPE | 839, botsApi runs/approvals but utilitarian log-dump composition |

---

## 8. Profile & Social

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| My profile | `screens/MyProfileScreen.tsx` | COMPETENT | 1092, fl:0 — pre-flagship grammar |
| User profile | `screens/UserProfileScreen.tsx` | COMPETENT | 1339, fl:0 |
| Followers/connections | `screens/ConnectionListScreen.tsx` | COMPETENT | 385, skeletons |
| Collection detail | `screens/CollectionDetailScreen.tsx` | COMPETENT | Shared-transition cover, mosaic, context data (735) |
| Explore collections | `screens/ExploreCollectionScreen.tsx` | COMPETENT | Thin (246) |
| Closet | `screens/ClosetScreen.tsx` | COMPETENT | 1098, 28 skeleton refs |
| Invite friends | `screens/InviteFriendsScreen.tsx` | COMPETENT | Real referral-history fetch; **caveat:** referral code derived client-side from user ID (`TV-XXXXXX`) — verify it matches backend-issued codes |
| Reviews (write) | `screens/WriteReviewScreen.tsx` | COMPETENT | See §2 |

---

## 9. Auth & Onboarding

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| Login | `screens/LoginScreen.tsx` | COMPETENT | Full auth surface: password + Apple + Google + magic link + email OTP + inline 2FA/recovery-code challenge; 1054, fl:0 |
| Sign up | `screens/SignUpScreen.tsx` | COMPETENT | 745 |
| Auth landing | `screens/AuthLandingScreen.tsx` | COMPETENT | 813 |
| Onboarding | `screens/OnboardingScreen.tsx` | COMPETENT | AsyncStorage-flagged, offline-aware, funnel tracking (330) |
| Personalisation step | `screens/PersonalisationScreen.tsx` | COMPETENT | (listed under settings too) |
| Forgot/reset password | `screens/{ForgotPassword,ResetPassword}Screen.tsx` | COMPETENT | Thin (224/313) |
| Biometric login | `screens/BiometricLoginScreen.tsx` | COMPETENT | 235 |
| Age verification | `screens/AgeVerificationScreen.tsx` | COMPETENT | 300 |

---

## 10. Notifications

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| Notifications | `screens/NotificationsScreen.tsx` | FLAGSHIP | 5 typed row components (social/commerce/auction/financial/system), swipe actions, quiet-hours awareness, V2 event upgrade path (1364) |
| Preferences / push / email | `screens/{NotificationPreferences,PushNotifications,EmailNotifications}Screen.tsx` | COMPETENT | Wired preference surfaces |

---

## 11. Search & Discovery Satellites

Shared: `components/search/` (SearchAutocomplete, SearchHistoryManager, TrendingSearches, PeopleResultRow), `scenes/discovery/` (Discover/Pulse/Looks scenes).

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| Search hub | `screens/SearchScreen.tsx` | FLAGSHIP | Orchestrator → mode nav + 3 scenes, autocomplete, recorded history, trending API, taxonomy, error boundary (396) |
| Filters | `screens/FilterScreen.tsx` | COMPETENT | 1445, gesture-driven (pan/interpolate), sync-status pill, 53 a11y labels; monolith |
| Saved searches | `screens/SavedSearchesScreen.tsx` | COMPETENT | Store+alert hook, empty state, relative-time labels |
| Conversational search | `screens/ConversationalSearchScreen.tsx` | COMPETENT | Honest per-message `isDemo` disclosure + AITrustSignal; scripted fallback path remains |
| Visual search | `screens/VisualSearchScreen.tsx` | COMPETENT | 1236 |
| Global search | `screens/GlobalSearchScreen.tsx` | N/A | 6-line alias |
| Category tree | `screens/CategoryTreeScreen.tsx` | PROTOTYPE | 249, taxonomy-driven but no loading/empty states |
| Category detail | `screens/CategoryDetailScreen.tsx` | COMPETENT | 470 |
| Unified discovery | `screens/UnifiedDiscoveryScreen.tsx` | COMPETENT | 1232 |
| Browse | `screens/BrowseScreen.tsx` | COMPETENT | 1119, 35 a11y labels |
| Pulse feed | `screens/PulseFeedScreen.tsx` | PROTOTYPE | 314, derives events from real store data but is a thin feed — no pagination/depth |
| Look detail | `screens/LookDetailScreen.tsx` | COMPETENT | 1454 |
| Galleria | `screens/GalleriaScreen.tsx` | COMPETENT | Honest demo badge when API falls back (561) |
| Galleria collection | `screens/GalleriaCollectionDetailScreen.tsx` | COMPETENT | 664 |

---

## 12. Support & Trust

Shared: `components/support/` (SupportMessage, SupportContextHeader, SupportEvidenceRow, SupportHandoffState, SupportActionReview).

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| Help & support | `screens/HelpSupportScreen.tsx` | COMPETENT | Real bootstrap + knowledge search + AI→human handoff states (693) |
| Support conversation | `screens/SupportConversationScreen.tsx` | COMPETENT | 940, fl:1 — **contains the dead attach button (line 572)** |
| Case detail | `screens/SupportCaseDetailScreen.tsx` | COMPETENT | 800 |
| Ticket detail | `screens/SupportTicketDetailScreen.tsx` | COMPETENT | 695 |
| Resolution centre | `screens/ResolutionCentreScreen.tsx` | PROTOTYPE | 271, store-wired w/ filters but thin for a disputes hub |
| Report / Appeal / Order support | `screens/{Report,Appeal,OrderSupport}Screen.tsx` | COMPETENT | Wired (see §2) |

---

## 13. Co-Own / Finance Satellites

Shared: `components/coown/` (StateCanvas, OfflineBanner, ReconciliationBanner, PositionCard, PortfolioStorytelling/PerformanceChart/Allocation, skeletons).

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| Portfolio | `screens/PortfolioScreen.tsx` | FLAGSHIP | Rich composed domain (position cards, storytelling, allocation chart, action sheets), screen-capture protection (1348) |
| Syndicate hub | `screens/SyndicateHubScreen.tsx` | COMPETENT | 1280 |
| Syndicate order history | `screens/SyndicateOrderHistoryScreen.tsx` | COMPETENT | 951, wired log |
| Syndicate onboarding | `screens/SyndicateOnboardingScreen.tsx` | PROTOTYPE | 332, static 4-slide explainer — honest risk copy but no interactive depth |
| Asset detail | `screens/AssetDetailScreen.tsx` | COMPETENT | 1324, mockData dependency removed |
| Asset due diligence | `screens/AssetDueDiligenceScreen.tsx` | COMPETENT | 1231 |
| Asset leaderboard | `screens/AssetLeaderboardScreen.tsx` | PROTOTYPE | 396, thin table |
| Market ledger | `screens/MarketLedgerScreen.tsx` | PROTOTYPE | 393, fragile remote+local merge (per map; still thin) |
| Distribution history | `screens/DistributionHistoryScreen.tsx` | PROTOTYPE | 850, raw log dump |
| Co-own issue / price alerts | `screens/{CoOwnIssue,CoOwnPriceAlerts}Screen.tsx` | COMPETENT | 415/525 |
| Corporate action detail / vote | `screens/CorporateAction{Detail,Vote}Screen.tsx` | COMPETENT | 772/734, haptics |

---

## 14. Live Shopping

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| Live shopping home | `screens/LiveShoppingHomeScreen.tsx` | COMPETENT | 480 |
| Viewer | `screens/LiveStreamViewerScreen.tsx` | COMPETENT | 1450, `LIVE_SHOPPING_DEMO_MODE = __DEV__ || EXPO_PUBLIC_MOCK_MODE` — prod hits real service; **defect:** a11y-lie sheet pressables (lines 900, 1007) announce non-actionable containers as buttons |
| Seller | `screens/LiveStreamSellerScreen.tsx` | COMPETENT | 1171; heaviest demo-simulation dependency in service layer (53 demo refs in `liveShoppingApi.ts`) — production path thin |

---

## 15. Creator / Poster / Moodboards

Shared: `creator/` — full studio subsystem (camera, engine, dock, layers, publish workflow, templates, drafts, haptics); `components/poster/`; moodboard sheets ×4 in `components/`.

| Surface | Path | Grade | Evidence |
|---|---|---|---|
| Moodboard editor | `screens/MoodboardEditorScreen.tsx` | FLAGSHIP | Real gesture canvas (pan/pinch/rotate, clamped), per-operation sync state machine, reduced-motion aware, real API — no demo path (1711) |
| Moodboard home | `screens/MoodboardHomeScreen.tsx` | COMPETENT | 950 |
| Creator analytics | `screens/CreatorAnalyticsDashboardScreen.tsx` | COMPETENT | 1124, partial flagship |
| Poster viewer | `screens/PosterViewerScreen.tsx` | COMPETENT | 1655 monolith |
| Poster archive / story activity / highlight viewer / create highlight | `screens/Poster{Archive,StoryActivity,HighlightViewer}Screen.tsx`, `CreatePosterHighlightScreen.tsx` | COMPETENT | Pre-flagship grammar (fl:0) |
| Outfit builder | `screens/OutfitBuilderScreen.tsx` | COMPETENT | 888 |
| AI photo enhancement | `screens/AIPhotoEnhancementScreen.tsx` | COMPETENT | 979, coming-soon rows disclosed |
| Create camera | `screens/CreateCameraScreen.tsx` | N/A | 21-line alias into `creator/` studio |

---

## 16. Verification & Compliance

`VerificationScreen` (985), `KYCVerificationScreen` (652), `VerificationStatusScreen` (587), `VerificationResponseScreen` (666), `SellerVerificationScreen` (425), `AgeVerificationScreen` (300) — all COMPETENT: wired, state machines, thin-to-moderate depth.

---

## 17. Admin / Moderation

**Not in the RN app** — no admin/moderation routes exist in `frontend/src/navigation`. Moderation lives in `ops-console/` (separate Vite web app): `WorkQueueView` (938), `CaseWorkspaceView` (1675), `OfcomRiskAssessmentView` (1012), `DsaTransparencyView` (515), `AppealsView` (426), `CommandsView` (334), `AuditView` (154), `LoginView` (85) + CommandPalette. Grade: **COMPETENT** (real regulatory surface coverage; CaseWorkspace is a 1675-LOC monolith carrying the same structural debt as the app's big screens).

In-app trust surfaces (Report/Appeal/ResolutionCentre) covered in §12.

---

## Sheets / Overlays Inventory

Cross-cutting: `components/{BottomSheet,BottomSheetPicker,ConfirmationSheet,ShareSheet,LanguagePickerSheet,SignupWallSheet,ImageViewer,CommandPalette,Toast,OfflineBanner,SyncRetryBanner,ErrorFallback,ScreenErrorBoundary}.tsx`; `components/sheets/` (ActionSheet, FormSheet, InspectorSheet, TransactionSheet); feature sheets in `components/checkout/` (AddAddress, AddCard), `components/orders/` (OrderActions, ReviewPrompt), `components/sell/` (ShippingPicker), `components/chat/` (AttachmentReview, ChatAction, DocumentReview, Forward, GroupMediaSource, MessageInfo), `components/ui/` (BidSheet, BuyNowSheet), `components/moodboard*` sheets ×4, `creator/` sheets (Crop, Cutout, Layers, Settings, Publish, FolderOrganize, InstantCut), `components/security/` (BiometricGate), `components/algorithm/` (FeedExplanationSheet), `components/wallet/` (AddMoneySheet).

**Assessment:** a real sheet system exists — shared BottomSheet + domain sheets — and is consistently used. No orphan modals found except `ManageQuickRepliesScreen`'s inline `Modal` (minor inconsistency).

---

## The 15 Weakest Sub-Department Surfaces
(ranked by user-impact × quality-gap)

1. **`CheckoutScreen` (2482 LOC, fl:0)** — highest-stakes money surface is the app's biggest monolith; flagship grammar absent.
2. **`ChatScreen` (2203, fl:0)** — commerce-critical thread screen; great domain hooks but pre-flagship screen grammar and size.
3. **`ItemDetailScreen` (2039, fl:0)** — the PDP (main-track audited; still the deepest grammar gap per prior audit).
4. **`AuctionDetailScreen` (1957, fl:0)** — live-bidding money surface, pre-flagship.
5. **`SellScreen` (1486, fl:0)** — the listing-creation funnel; refactored to hooks but grammar/size still pre-flagship.
6. **`EditListingScreen` (1539)** — monolith companion to Sell.
7. **`AIPoweredListingScreen` (1491, fl:0)** — AI-assisted sell path, pre-flagship.
8. **`CreateAuctionScreen` (1561, fl:0, 5 hex leaks)** — auction authoring, pre-flagship + token leaks.
9. **`InboxScreen` (1599, fl:0)** — high-traffic surface, pre-flagship.
10. **`CatalogImport* flow` (6 screens, ~2900 LOC, all fl:0)** — entire seller-import journey on pre-flagship grammar.
11. **`MyProfileScreen` / `UserProfileScreen` (1092/1339, fl:0)** — identity surfaces, pre-flagship.
12. **`LiveStreamSellerScreen` (1171)** — production path thin; heaviest demo-simulation service behind it.
13. **`SupportConversationScreen`** — dead "Attach file" affordance (line 572) on a trust surface.
14. **`ConversationalSearchScreen`** — scripted local fallback still ships (honestly disclosed, but a real AI search surface it is not).
15. **`GroupPermissionsScreen` (327)** — 3-key permission model; no roles, exceptions, or audit — shallowest admin surface relative to group-chat importance.

## Summary Table

| Department | Screens | Avg grade | Biggest gap |
|---|---|---|---|
| Settings & account | 23 | COMPETENT | Satellites thin; a11y gaps on ConnectedAccounts |
| Forms / create / edit | 18 | COMPETENT | ~6,000 LOC pre-flagship sell/listing funnel |
| Commerce | 14 | COMPETENT | Checkout monolith (2482), no flagship grammar |
| Wallet & money | 7 | COMPETENT+ | Thin ledger satellites |
| Seller | 9 | FLAGSHIP-leaning | Best-in-app dept; analytics surface thin |
| Messaging | 17 | COMPETENT | ChatScreen monolith; group-permissions depth |
| Bots / AI | 6 | COMPETENT | AgentLedger utilitarian; provider chips |
| Profile & social | 8 | COMPETENT | Profile screens pre-flagship |
| Auth & onboarding | 8 | COMPETENT | Pre-flagship grammar on Login/SignUp/AuthLanding |
| Notifications | 4 | FLAGSHIP-leaning | Solid |
| Search & discovery | 13 | COMPETENT | PulseFeed/CategoryTree thin; conv-search fallback |
| Support & trust | 8 | COMPETENT | Dead attach button; ResolutionCentre thin |
| Co-Own satellites | 12 | COMPETENT | Ledger dumps (Market/Agent/Distribution/Leaderboard) |
| Live shopping | 3 | COMPETENT | Demo-gated simulation; prod path unproven |
| Creator / poster | 10 | COMPETENT | Poster screens pre-flagship; MoodboardEditor is the standout |
| Verification | 6 | COMPETENT | Adequate |
| Admin (ops-console, web) | 8 views | COMPETENT | CaseWorkspace monolith |
| **Total cataloged** | **~166 RN screens + 8 console views + ~40 sheet/overlay components** | | |

**Grade counts (shippable RN screens):** FLAGSHIP ≈ 12 · COMPETENT ≈ 138 · PROTOTYPE ≈ 12 · AI-SLOP = 0 whole-screen (localized dishonest affordances flagged: dead attach button, a11y-lie pressables, disclosed coming-soon chips).

**Systemic note:** the dominant quality gap is no longer truthfulness — it is **grammar convergence and file-size discipline**: ~55 screens still carry zero `components/flagship` imports, and 16 screens exceed 1,400 LOC, breaking the charter's 400-line orchestrator rule even where domain factoring is otherwise good.
