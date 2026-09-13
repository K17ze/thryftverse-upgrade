# Undeveloped Surface Map — 2026-09-11

Audit method: static analysis of all 139 registered screens (LOC, flagship-primitive
usage, service/store wiring, state coverage, demo/mock/coming-soon markers, icon-system
usage, a11y coverage) + route reachability + backend route coverage.

Classification:
- **DEMO/FABRICATED** — renders fake/demo/coming-soon behavior in a real surface
- **PRE-FLAGSHIP** — wired but no flagship primitives; pre-upgrade UI grammar
- **STATIC** — no data wiring at all (some legitimately static, some should be live)
- **STUB** — near-empty or dead code
- **FLAGSHIP** — upgraded grammar + wired (not listed here)

Severity = P0 user-facing dishonesty / P1 missing depth on a revenue or trust surface /
P2 thin utility / P3 polish.

---

## 1. Automation & AI Agents — WORST OFFENDER
User-named. The whole department presents capability that does not exist.

| Screen | LOC | Evidence | Severity |
|---|---|---|---|
| AIAgentIntegrationScreen | 1761 | `isComingSoon = providerId !== 'openai'` — Anthropic/Google/Groq etc. rendered as real providers but dead. AI_PROVIDER_DEMO_MODE flag | P0 |
| NewMessageScreen | 645 | `handleStartAgentChat` fabricates local conversations (`agent_dm_*`, `isDemo:true` intro message). Demo agents in a production picker | P0 |
| BotBuilderScreen | 1222 | mock:2, TODO:9 — bot creation flow partially stubbed | P1 |
| CustomBotsScreen | 400 | API:0 — fully static, no backend wiring | P1 |
| BotDetailScreen | 793 | API:1 — single fetch, thin | P1 |
| BotDirectoryScreen | 351 | API:3, thin catalog | P1 |
| GroupBotManagementScreen | 366 | API:1, minimal | P1 |
| AgentLedgerScreen | 847 | wired (botsApi runs/approvals) but utilitarian | P2 |
| ChatAgentPicker (component) | — | demo flag | P0 |

## 2. Group Chat Admin
User-named. Wired but shallow — no role model, no per-member exceptions, thin forms.

| Screen | LOC | Evidence | Severity |
|---|---|---|---|
| GroupPermissionsScreen | 347 | 3 static toggles only (editInfo/sendMessages/addMembers); no roles, no exceptions, no audit | P1 |
| EditGroupScreen | 836 | wired via chatApi but TODO:8; cover photo placeholder-only | P1 |
| CreateGroupChatScreen | 1080 | TODO:16 — highest marker count in the app | P1 |
| GroupChatInfoScreen | 2165 | Ion:31 raw icons, no flagship primitives | P1 |
| GroupMembersScreen | 941 | wired, moderate | P2 |
| GroupChatScreen | 875 | F:0, pre-flagship grammar | P1 |
| ManageQuickRepliesScreen | 481 | API:0 static, TODO:4 | P2 |
| MessageRequestsScreen | 509 | F:0, pre-flagship | P2 |
| ConversationInfoScreen | 365 | thin | P2 |
| ChatMediaPreviewScreen | 199 | F:3 minimal viewer | P2 |

## 3. Live Shopping — fabricated depth
| Screen | LOC | Evidence | Severity |
|---|---|---|---|
| LiveStreamSellerScreen | 1055 | demo:13 — heaviest demo concentration in app | P0 |
| LiveStreamViewerScreen | 1558 | demo:7 | P0 |
| LiveShoppingHomeScreen | 993 | demo:2 | P1 |

## 4. Co-Own Satellites (activity / ledger / history)
User-named ("co-own activity", "portfolio"). Wired but utilitarian —
raw tables, no flagship narrative.

| Screen | LOC | Evidence | Severity |
|---|---|---|---|
| PortfolioScreen | 1351 | wired + F:17 but dense unauthored tables | P1 |
| SyndicateOrderHistoryScreen (CoOwnOrderHistory) | 953 | wired, St:26, reads as log dump | P1 |
| MarketLedgerScreen | 431 | API:1, remote+local merge is fragile | P1 |
| AgentLedgerScreen | 847 | see dept. 1 | P1 |
| DistributionHistoryScreen | 850 | wired, St:37 | P2 |
| AssetLeaderboardScreen | 374 | thin | P2 |
| SyndicateOnboardingScreen | 333 | near-stub, F:0 | P1 |
| AssetDetailScreen | 1325 | mock:2 remaining fabrications | P1 |

## 5. Discovery Satellites
| Screen | LOC | Evidence | Severity |
|---|---|---|---|
| ConversationalSearchScreen | 926 | demo:4, mock:4 — scripted AI search | P0 |
| MoodboardEditorScreen | 1751 | demo:3, no flagship primitives | P1 |
| MoodboardHomeScreen | 950 | demo:2 | P1 |
| GalleriaScreen | 1133 | demo:2, mock:3 | P1 |
| YourAlgorithmScreen | 669 | demo:1 | P1 |
| UnifiedDiscoveryScreen | 1123 | demo:1 | P2 |
| PulseFeedScreen | 295 | thin feed | P2 |
| SavedSearchesScreen | 350 | F:0, API:0 static | P2 |
| CategoryTreeScreen | 250 | F:0, no states, Ion:5 | P2 |
| CollectionDetailScreen | 736 | API:0 — collection detail with no live data | P1 |
| ExploreCollectionScreen | 230 | thin | P2 |
| GalleriaCollectionDetailScreen | 665 | pre-flagship | P2 |

## 6. Auth & Onboarding
| Screen | LOC | Evidence | Severity |
|---|---|---|---|
| LoginScreen | 1055 | F:0, TODO:9 | P1 |
| SignUpScreen | 746 | F:0, TODO:5 | P1 |
| AuthLandingScreen | 814 | F:0, TODO:4 | P1 |
| OnboardingScreen | 331 | F:2 minimal | P2 |
| PersonalisationScreen | 278 | static | P2 |
| BiometricLoginScreen | 220 | thin | P2 |
| ForgotPasswordScreen | 205 | thin | P2 |
| ResetPasswordScreen | 314 | thin | P2 |
| AgeVerificationScreen | 281 | functional but unpolished | P3 |

## 7. Sell / Listing Flow
| Screen | LOC | Evidence | Severity |
|---|---|---|---|
| SellScreen | 1487 | F:0, TODO:26 — highest TODO density; core revenue surface with no flagship grammar | P0 |
| AIPoweredListingScreen | 1492 | F:0, TODO:22 | P0 |
| EditListingScreen | 1519 | TODO:24 | P1 |
| CreateAuctionScreen | 1562 | F:0 | P1 |
| ListingPreviewScreen | 388 | static | P2 |
| ListingSuccessScreen | 578 | pre-flagship | P2 |
| BulkListingScreen | 988 | TODO:9 | P1 |
| CatalogImport* (6 screens) | ~2900 total | all F:0, pre-flagship flow | P1 |

## 8. Commerce Core — pre-flagship grammar on the biggest surfaces
| Screen | LOC | Evidence | Severity |
|---|---|---|---|
| CheckoutScreen | 2443 | F:0 — highest-stakes screen, no flagship primitives | P1 |
| ItemDetailScreen | 1913 | F:0 — the PDP | P1 |
| ChatScreen | 2182 | F:0 | P1 |
| AuctionDetailScreen | 1942 | F:0 | P1 |
| InboxScreen | 1540 | F:0 | P1 |
| HomeScreen | 835 | F:0 — home feed lacks flagship primitives | P1 |
| MyProfileScreen | 1093 | F:0 | P1 |
| UserProfileScreen | 1328 | F:0 | P1 |
| MyOrdersScreen | 769 | F:0 | P2 |
| OrderDetailScreen | 1283 | F:0 | P2 |
| OrderReceiptScreen | 697 | F:0 | P2 |
| MakeOfferScreen | 1147 | F:5 partial | P2 |
| FilterScreen | 1432 | F:0 | P2 |

## 9. Wallet & Money
| Screen | LOC | Evidence | Severity |
|---|---|---|---|
| WalletHistoryScreen | 124 | thin wrapper over WalletTransactionHistory | P2 |
| WalletConvertScreen | 1229 | TODO:4, mock:2 | P1 |
| BalanceHistoryScreen | 302 | thin | P2 |
| AddBankAccountScreen | 270 | TODO:6 | P2 |
| WithdrawScreen | 1183 | wired | P2 |
| SellerEarningsScreen | 330 | thin | P2 |

## 10. Support & Trust
| Screen | LOC | Evidence | Severity |
|---|---|---|---|
| ResolutionCentreScreen | 256 | store-wired, thin | P2 |
| HelpSupportScreen | 694 | wired | P2 |
| SupportTicketDetailScreen | 657 | wired | P2 |
| SupportConversationScreen | 929 | F:15 | P2 |
| SupportCaseDetailScreen | 801 | F:18 | P2 |
| AppealScreen | 827 | TODO:13 | P1 |
| ReportScreen | 896 | TODO:14 | P1 |
| BuyerProtectionScreen | 352 | TODO:4 | P2 |
| OrderSupportScreen | 675 | wired | P2 |

## 11. Settings satellites (~20 screens)
All wired or legitimately static; thin list-form grammar. P2–P3.
Worst: ChatSettingsScreen (pure menu), MutedConversationsScreen (103 LOC),
ArchivedConversationsScreen (202), ConnectedAccountsScreen (215),
EmailNotificationsScreen (233), AccessibilitySettingsScreen (244),
BlockedUsersScreen (255), PrivacySettingsScreen (261), DataPrivacyScreen (275),
PersonalisationScreen (278), DataExportScreen (280), NotificationPreferencesScreen (491),
AIPreferencesScreen (364, demo:2), SustainabilityPreferencesScreen (401),
AccountControlScreen (115), AccountSecurityScreen (610), ActiveSessionsScreen (358),
TwoFactorSetupScreen (772, TODO:4), DeleteAccountScreen (542, TODO:3),
ChangePasswordScreen (282, TODO:3), ChatSettingsScreen (176).

## 12. Creator / Poster satellites
| Screen | LOC | Evidence | Severity |
|---|---|---|---|
| PosterArchiveScreen | 751 | F:0, TODO:7, Ion:15 | P1 |
| CreatePosterHighlightScreen | 635 | F:0, TODO:5 | P2 |
| PosterStoryActivityScreen | 997 | F:0, TODO:5 | P1 |
| PosterHighlightViewerScreen | 689 | F:0 | P2 |
| CreatorAnalyticsDashboardScreen | 1125 | F:16 partial, TODO:6 | P2 |
| OutfitBuilderScreen | 889 | F:0 | P2 |
| AIPhotoEnhancementScreen | 980 | F:0, TODO:5, coming-soon:2 | P1 |

## Dead / dev-only code
- **AccountSettingsScreen** (36 LOC) — redirect shim to EditProfile, never routed.
  FIXED 2026-09-11: registered in AppNavigator + RootStackParamList so legacy
  `navigate('AccountSettings')` calls resolve to the redirect instead of failing.
- ~~RuntimeSmokeTestScreen~~ — already gated behind `__DEV__` in AppNavigator; not a prod issue.
- **GlobalSearchScreen / CreateCameraScreen** — intentional aliases (fine).

---

## Priority rollup

**P0 (fabricated behavior in real surfaces):**
AIAgentIntegration, NewMessage agent chats, ChatAgentPicker, LiveStreamSeller,
LiveStreamViewer, ConversationalSearch, SellScreen, AIPoweredListing.

**P1 (missing depth on revenue/trust/social surfaces):**
Bot department (5 screens), Group admin cluster (5 screens), Live shopping,
Co-Own activity/ledger cluster, Sell flow, Catalog import, Auth trio,
Checkout/ItemDetail/Chat/AuctionDetail/Inbox/Home/MyProfile pre-flagship,
Appeal, Report, Moodboards, Galleria, CollectionDetail, Portfolio density.

**Counts:** 16 DEMO/FABRICATED · 48 PRE-FLAGSHIP · 4 STUB/dead ·
~20 thin settings satellites · 103 flagship-grammar (not all deep).
