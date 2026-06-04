# EXECUTION_TRACKER.md

> **Single ledger of every file:line change with status**
> Updated after every code change
> Format: one row per file, with current/target state and acceptance criteria

---

## Status Legend

- ⬜ NOT STARTED
- 🟡 IN PROGRESS
- ✅ DONE
- ❌ BLOCKED
- ⏸️ PAUSED

---

## TRACK 0 — Foundation Tokens

| Status | File | Change | Verified |
|---|---|---|---|
| ✅ | `frontend/src/constants/colors.ts` | `Glass.*`, `Glow.*`, `IconTint.*` already present and verified | ✅ |
| ✅ | `frontend/src/theme/designTokens.ts` | `Type` tokens already at spec (15/500 body, etc.); `Elevation.glow` present | ✅ |
| ⬜ | `frontend/src/theme/gradients.ts` | NEW FILE: `Gradients.gold`, `Gradients.overlay`, `Gradients.ambient` | ⬜ |
| ✅ | `frontend/src/constants/motion.ts` | `Spring`, `Duration`, `Stagger` exports verified | ✅ |

## TRACK 1 — New Components

| Status | File | Change | Verified |
|---|---|---|---|
| ✅ | `frontend/src/components/ui/GlassSearchPill.tsx` | Already exists and functional | ✅ |
| ✅ | `frontend/src/components/settings/PremiumToggle.tsx` | Already exists and functional | ✅ |
| ✅ | `frontend/src/components/ui/AppInput.tsx` | `variant: 'solid' \| 'glass'` already present | ✅ |
| ⬜ | `frontend/src/components/ui/AppSegmentControl.tsx` | Add `variant: 'solid' \| 'glass'` prop | ⬜ |
| ✅ | `frontend/src/components/SettingsCell.tsx` | `SettingsRow` helper already exported | ✅ |
| ✅ | `frontend/src/components/ui/GlassSurface.tsx` | `Glass.bg` fallback added; per-corner radius works via container clip | ✅ |

## TRACK 2 — Screen-by-Screen Adoption

### 12 — Settings & Security (user priority)

| Status | File | Change | Verified |
|---|---|---|---|
| ⬜ | `frontend/src/screens/SettingsScreen.tsx` | Profile preview GlassCard + GlassSearchPill + PremiumToggle for all toggles | ⬜ |
| ⬜ | `frontend/src/screens/AccountSettingsScreen.tsx` | All SettingsCard → GlassCard; AppInput variant="glass" | ⬜ |
| ⬜ | `frontend/src/screens/EditProfileScreen.tsx` | Avatar picker, glass cards, AppInput variant="glass", PremiumToggle | ⬜ |
| ⬜ | `frontend/src/screens/ChangePasswordScreen.tsx` | GlassCard form, AppInput variant="glass" | ⬜ |
| ⬜ | `frontend/src/screens/TwoFactorSetupScreen.tsx` | Status hero, QR card, AppInput variant="glass" | ⬜ |
| ⬜ | `frontend/src/screens/PushNotificationsScreen.tsx` | GlassCard rows, PremiumToggle replacing Switch | ⬜ |
| ⬜ | `frontend/src/screens/HelpSupportScreen.tsx` | GlassCard categories, FAQ accordion | ⬜ |
| ⬜ | `frontend/src/screens/ReportScreen.tsx` | GlassCard reason picker | ⬜ |

### 13a — Create Poster (user priority)

| Status | File | Change | Verified |
|---|---|---|---|
| ⬜ | `frontend/src/screens/CreatePosterScreen.tsx` | GlassHeader, floating tool panels (GlassCard), color picker, text editor, layer list, GlassBottomBar | ⬜ |
| ⬜ | `frontend/src/screens/PosterViewerScreen.tsx` | Full-bleed hero, BlurView header, AvatarRing creator, related carousel | ⬜ |

### 13b — Create Look (user priority)

| Status | File | Change | Verified |
|---|---|---|---|
| ⬜ | `frontend/src/screens/CreateLookScreen.tsx` | Canvas (GlassCard), style tags, item picker (BottomSheet), tagged people, GlassBottomBar | ⬜ |
| ⬜ | `frontend/src/screens/OutfitBuilderScreen.tsx` | Same as CreateLook + category sections + price total | ⬜ |

### 03 — Auth & Onboarding

| Status | File | Change | Verified |
|---|---|---|---|
| ⬜ | `frontend/src/screens/LoginScreen.tsx` | GlassCard form, AppInput variant="glass" | ⬜ |
| ⬜ | `frontend/src/screens/SignUpScreen.tsx` | Same + password strength | ⬜ |
| ⬜ | `frontend/src/screens/ForgotPasswordScreen.tsx` | GlassCard form + GlowOrb | ⬜ |
| ⬜ | `frontend/src/screens/PersonalisationScreen.tsx` | GlassCard quiz, selected chip gold border | ⬜ |

### 04 — Home & Discovery

| Status | File | Change | Verified |
|---|---|---|---|
| ⬜ | `frontend/src/screens/BrowseScreen.tsx` | GlassCard listing cards, glass chips | ⬜ |
| ⬜ | `frontend/src/screens/GlobalSearchScreen.tsx` | GlassSearchPill + GlassCard results | ⬜ |
| ⬜ | `frontend/src/screens/FilterScreen.tsx` | GlassCard filter sections | ⬜ |
| ⬜ | `frontend/src/screens/CategoryTreeScreen.tsx` | GlassCard category cards | ⬜ |
| ⬜ | `frontend/src/screens/CategoryDetailScreen.tsx` | GlassCard hero + grid | ⬜ |

### 05 — Item Detail

| Status | File | Change | Verified |
|---|---|---|---|
| ⬜ | `frontend/src/screens/MakeOfferScreen.tsx` | GlassCard form, AppInput variant="glass" | ⬜ |
| ⬜ | `frontend/src/screens/BuyoutScreen.tsx` | GlassCard summary | ⬜ |

### 06 — Sell & Listings

| Status | File | Change | Verified |
|---|---|---|---|
| ⬜ | `frontend/src/screens/SellScreen.tsx` | Dashed upload zone, glass form sections, listing type chips | ⬜ |
| ⬜ | `frontend/src/screens/EditListingScreen.tsx` | Same patterns as Sell | ⬜ |
| ⬜ | `frontend/src/screens/ListingSuccessScreen.tsx` | GlassCard preview + confetti | ⬜ |
| ⬜ | `frontend/src/screens/MyListingsScreen.tsx` | GlassCard grid + AppStatusPill | ⬜ |
| ⬜ | `frontend/src/screens/ManageListingScreen.tsx` | GlassCard actions + stats | ⬜ |

### 07 — Inbox & Chat

| Status | File | Change | Verified |
|---|---|---|---|
| ✅ | `frontend/src/screens/InboxScreen.tsx` | GlassHeader + GlassSearchPill + AvatarRing (64px) + PulseDot + Typography tokens | ✅ |
| ✅ | `frontend/src/screens/ChatScreen.tsx` | msgRow column layout, GlassSurface bubbles, KAV Android fix, composer Glass.bg, link preview GlassSurface, toolbar cleaned, typography tokens | ✅ |
| ✅ | `frontend/src/components/chat/ChatHeader.tsx` | ActiveTheme import moved to top | ✅ |
| ✅ | `frontend/src/components/chat/MessageBubble.tsx` | GlassSurface instead of GlassCard, width:100% container, maxWidth:100% bubbleContainer | ✅ |
| ✅ | `frontend/src/components/chat/LinkPreviewCard.tsx` | GlassSurface instead of solid bg | ✅ |
| ✅ | `frontend/src/components/ui/Text.tsx` | BodyEmphasis: fixed Type.price.size → Type.bodyEmphasis.size (20px→15px) | ✅ |
| ✅ | `frontend/src/components/ui/GlassSearchPill.tsx` | Hardcoded Inter_500Medium → Typography.family.medium | ✅ |
| ✅ | `frontend/src/components/chat/MentionHighlight.tsx` | Hardcoded fonts → Typography.family tokens | ✅ |
| ✅ | `frontend/src/components/chat/EmojiReactionsBar.tsx` | Hardcoded fonts → Typography.family tokens | ✅ |
| ✅ | `frontend/src/components/chat/NewMessagesSeparator.tsx` | Hardcoded fonts → Typography.family tokens | ✅ |
| ✅ | `frontend/src/components/chat/ScrollToBottomFAB.tsx` | Hardcoded fonts → Typography.family tokens | ✅ |
| ✅ | `frontend/src/components/chat/ComposerInput.tsx` | Added Typography.family.regular to input style | ✅ |
| ⬜ | `frontend/src/screens/CreateGroupChatScreen.tsx` | GlassCard form, member picker | ⬜ |
| ⬜ | `frontend/src/screens/GroupBotDirectoryScreen.tsx` | GlassCard group cards | ⬜ |

### 08 — Profile & Social

| Status | File | Change | Verified |
|---|---|---|---|
| ⬜ | `frontend/src/screens/MyProfileScreen.tsx` | Verify parallax + LinkedIn hero + glass quick access | ⬜ |
| ⬜ | `frontend/src/screens/UserProfileScreen.tsx` | Same patterns + follow/message buttons | ⬜ |
| ⬜ | `frontend/src/screens/ClosetScreen.tsx` | GlassCard grid + filter chips | ⬜ |
| ⬜ | `frontend/src/screens/CollectionDetailScreen.tsx` | GlassCard hero + grid | ⬜ |

### 09 — Trade & Wallet

| Status | File | Change | Verified |
|---|---|---|---|
| ⬜ | `frontend/src/screens/BalanceScreen.tsx` | GlassCard hero + metric cards | ⬜ |
| ⬜ | `frontend/src/screens/BalanceHistoryScreen.tsx` | GlassCard transaction rows | ⬜ |
| ⬜ | `frontend/src/screens/WithdrawScreen.tsx` | GlassCard form | ⬜ |
| ⬜ | `frontend/src/screens/AddBankAccountScreen.tsx` | GlassCard form | ⬜ |
| ⬜ | `frontend/src/screens/PaymentsScreen.tsx` | GlassCard payment methods | ⬜ |
| ⬜ | `frontend/src/screens/PostageScreen.tsx` | GlassCard addresses + PremiumToggle | ⬜ |
| ⬜ | `frontend/src/screens/WalletScreen.tsx` | GlassCard hero | ⬜ |
| ⬜ | `frontend/src/screens/PortfolioScreen.tsx` | GlassCard metrics + chart + holdings | ⬜ |
| ⬜ | `frontend/src/screens/MarketLedgerScreen.tsx` | GlassCard transaction rows | ⬜ |

### 10 — Orders & Checkout

| Status | File | Change | Verified |
|---|---|---|---|
| ⬜ | `frontend/src/screens/CheckoutScreen.tsx` | GlassCard summary | ⬜ |
| ⬜ | `frontend/src/screens/OrderDetailScreen.tsx` | GlassCard timeline + status banner | ⬜ |
| ⬜ | `frontend/src/screens/MyOrdersScreen.tsx` | GlassCard order list | ⬜ |
| ⬜ | `frontend/src/screens/WriteReviewScreen.tsx` | GlassCard form, star rating | ⬜ |

### 11 — Trade Hub & Syndicate

| Status | File | Change | Verified |
|---|---|---|---|
| ⬜ | `frontend/src/screens/TradeHubScreen.tsx` | GlassCard hero + category grid | ⬜ |
| ⬜ | `frontend/src/screens/SyndicateHubScreen.tsx` | GlassCard syndicate cards | ⬜ |
| ⬜ | `frontend/src/screens/SyndicateOnboardingScreen.tsx` | GlassCard form | ⬜ |
| ⬜ | `frontend/src/screens/SyndicateOrderHistoryScreen.tsx` | GlassCard list | ⬜ |
| ⬜ | `frontend/src/screens/SyndicateScreen.tsx` | GlassCard hero + members | ⬜ |

### 14 — Notifications & Activity

| Status | File | Change | Verified |
|---|---|---|---|
| ⬜ | `frontend/src/screens/NotificationsScreen.tsx` | GlassCard rows, gold unread border, PulseDot | ⬜ |
| ⬜ | `frontend/src/screens/InviteFriendsScreen.tsx` | GlassCard hero + contact list | ⬜ |
| ⬜ | `frontend/src/screens/AuctionsScreen.tsx` | GlassCard auction cards | ⬜ |
| ⬜ | `frontend/src/screens/MyBidsScreen.tsx` | GlassCard bid rows | ⬜ |
| ⬜ | `frontend/src/screens/AssetDetailScreen.tsx` | GlassCard info + bid history | ⬜ |
| ⬜ |