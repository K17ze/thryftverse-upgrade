# Other Screens UI/UX Upgrade Plan

## Honest Audit: What I Got Wrong

My original plan proposed heavy rewrites for 30+ screens and creating 14+ new shared components. After auditing the actual codebase, **most screens already use premium components** and the scope is dramatically smaller.

### What Already Exists (Do Not Rebuild)

| Component | File | Already Used By | Notes |
|-----------|------|-----------------|-------|
| `GlassCard` / `GlassSurface` | `components/ui/GlassSurface.tsx` | AuthLanding, ItemDetail, Settings | Already has blur, border, radius, shadow |
| `GlowSurface` | `components/ui/GlowSurface.tsx` | AuthLanding, Inbox | Animated pulsing glow |
| `AppButton` (gold variant) | `components/ui/AppButton.tsx` | All screens | `variant="primary"` uses `Colors.brand` (gold) |
| `AnimatedPressable` | `components/AnimatedPressable.tsx` | All screens | Scale + haptic feedback |
| `AppInput` | `components/ui/AppInput.tsx` | Sell, Checkout, AccountSettings | Labels, prefixes, helper text, multiline |
| `AppSegmentControl` | `components/ui/AppSegmentControl.tsx` | Sell, AccountSettings | Existing segment control |
| `SkeletonLoader` | `components/SkeletonLoader.tsx` | HomeScreen | Shimmer skeletons already exist |
| `BlurView` | `expo-blur` | HomeScreen, ItemDetail, ChatHeader | Frosted glass already implemented |
| `SharedTransitionView` | `components/SharedTransitionView.tsx` | HomeScreen, ItemDetail | Shared element transitions |
| `Reanimated` parallax | `ItemDetailScreen.tsx` | ItemDetail | Scroll-driven parallax + header blur |
| `DoubleTapHeart` | `components/DoubleTapHeart.tsx` | HomeScreen | Like animation |
| `ProductCardV2` | `components/ProductCardV2.tsx` | HomeScreen | Masonry grid cards with overlays |
| `StaggeredItem` | `components/StaggeredGridEntrance.tsx` | HomeScreen | Grid entrance animations |
| `ScreenHeader` | `components/ui/ScreenHeader.tsx` | Checkout, Orders | Reusable header with back button |

### Screens Already Premium (Minimal or No Changes Needed)

| Screen | Why It's Already Premium |
|--------|--------------------------|
| `AuthLandingScreen` | Uses `AmbientGradientMesh`, `GlassCard`, `GlowSurface`, full-bleed image, staggered animations |
| `HomeScreen` | Uses `BlurView`, `LinearGradient`, `SharedTransitionView`, masonry grid, `DoubleTapHeart`, `SkeletonLoader`, story bubbles with gradient rings, price overlays |
| `ItemDetailScreen` | Uses parallax scroll, `BlurView` floating header, `SharedTransitionView`, `AnimatedPressable` |
| `CheckoutScreen` | Uses `ScreenHeader`, `AppCard`, `FadeInDown`, bottom sheets, haptics |
| `ChatScreen` | `ChatHeader` already uses `BlurView`; `MessageBubble` already has gold for "me" |

---

## What Actually Needs Work

The real gap is not "create 14 new components" — it's **selective adoption of existing `GlassCard`** on screens still using solid `AppCard` or `Colors.surface` backgrounds.

### Pattern-Based Refactor (Not Screen-by-Screen)

Instead of auditing 30 screens individually, apply these **4 patterns** wherever they appear:

#### Pattern 1: Swap `AppCard` to `GlassCard`
Any screen still wrapping sections in `AppCard variant="surface"` or `AppCard variant="elevated"` should swap to `GlassCard` from `components/ui/GlassSurface`.

**Affected screens** (estimated, audit during implementation):
- `BrowseScreen` — listing cards
- `MyOrdersScreen` / `OrderDetailScreen` — order cards
- `BalanceScreen` / `BalanceHistoryScreen` — balance cards, transaction rows
- `ClosetScreen` — saved item cards, collection cards
- `NotificationsScreen` — notification rows
- `MyListingsScreen` / `ManageListingScreen` — listing cards, status overlays
- `EditProfileScreen` — form card wrappers
- `HelpSupportScreen` — FAQ category cards
- `PaymentsScreen` / `AddBankAccountScreen` / `PostageScreen` — payment method cards, form cards
- `ChangePasswordScreen` / `TwoFactorSetupScreen` — form cards
- `FilterScreen` — filter section cards
- `MakeOfferScreen` — offer card, input wrappers
- `ListingSuccessScreen` — preview card
- `ForgotPasswordScreen` / `LoginScreen` — form cards
- `PushNotificationsScreen` — notification category rows
- `CreateLookScreen` / `OutfitBuilderScreen` — canvas card
- `CreatePosterScreen` / `PosterViewerScreen` — editor cards
- `GlobalSearchScreen` — recent search chips, result cards
- `CategoryDetailScreen` / `CategoryTreeScreen` — category cards
- `CollectionDetailScreen` — collection cards
- `GroupBotDirectoryScreen` / `CreateGroupChatScreen` — group cards
- `PersonalisationScreen` — quiz cards
- `InviteFriendsScreen` — invite cards

#### Pattern 2: Soften Solid Icon Buttons
Any header or toolbar icon button using `Colors.surface` background should switch to translucent `rgba(255,255,255,0.05)` with `borderColor: Colors.border`.

**Affected screens**: Any screen with a custom header (most of the above).

#### Pattern 3: Add `AvatarRing` Where Missing
Any plain circular avatar (not using `AvatarRing`) should be upgraded, especially on:
- `HomeScreen` story bubbles (already has gradient ring, may not need)
- `ItemDetailScreen` seller row
- `MyProfileScreen` / `UserProfileScreen` profile avatar
- `NotificationsScreen` notification avatars
- `ChatScreen` (already has online ring in `ChatHeader`)

#### Pattern 4: Optional `GlowSurface` on Key CTAs
On high-value CTAs (Publish, Buy, Send Offer, Withdraw), optionally wrap in `GlowSurface` (intensity=0.1, color=Colors.brand) for a subtle premium halo.

---

## Screen-by-Screen Honest Notes

### Already Done (Keep As-Is)
- `AuthLandingScreen` — Already uses `GlassCard`, `GlowSurface`, `AmbientGradientMesh`
- `HomeScreen` — Already uses `BlurView`, `SharedTransitionView`, `SkeletonLoader`, masonry grid
- `ItemDetailScreen` — Already uses parallax, `BlurView` header, `SharedTransitionView`
- `CheckoutScreen` — Already uses `ScreenHeader`, `AppCard`, `FadeInDown`, bottom sheets
- `ChatScreen` — `ChatHeader` already uses `BlurView`; outgoing bubbles already gold
- `InboxScreen` — Covered in `INBOX_UPGRADE_PLAN.md`
- `SettingsScreen` / `AccountSettingsScreen` — Covered in `SETTINGS_UPGRADE_PLAN.md`
- `SellScreen` — Covered in `UPLOAD_SCREEN_UPGRADE_PLAN.md`

### Needs GlassCard Adoption Only
All remaining screens below need **only** the Pattern 1 swap (`AppCard` → `GlassCard`) and possibly Pattern 2 (translucent buttons). No new components.

| Screen | Action |
|--------|--------|
| `BrowseScreen` | Swap listing cards to `GlassCard` |
| `MyOrdersScreen` | Swap order list cards to `GlassCard` |
| `OrderDetailScreen` | Swap timeline cards to `GlassCard`; add gold tint to completed steps |
| `BalanceScreen` | Swap balance hero and metric cards to `GlassCard` |
| `BalanceHistoryScreen` | Swap transaction rows to `GlassCard` |
| `ClosetScreen` | Swap saved item cards and collection cards to `GlassCard` |
| `NotificationsScreen` | Swap notification rows to `GlassCard`; reuse `PulseDot` for unread |
| `MyListingsScreen` | Swap listing grid cards to `GlassCard`; status pills already tinted |
| `ManageListingScreen` | Swap action sheet cards to `GlassCard` |
| `EditProfileScreen` | Swap form card to `GlassCard`; avatar picker can reuse `AvatarRing` |
| `HelpSupportScreen` | Swap FAQ category cards to `GlassCard` |
| `PaymentsScreen` | Swap payment method cards to `GlassCard` |
| `AddBankAccountScreen` | Swap form card to `GlassCard` |
| `PostageScreen` | Swap shipping profile cards to `GlassCard` |
| `ChangePasswordScreen` | Swap form card to `GlassCard` |
| `TwoFactorSetupScreen` | Swap QR/instruction cards to `GlassCard` |
| `FilterScreen` | Swap filter sections to `GlassCard` |
| `MakeOfferScreen` | Swap offer card and input wrapper to `GlassCard` |
| `ListingSuccessScreen` | Swap preview card to `GlassCard`; confetti optional |
| `ForgotPasswordScreen` | Swap form card to `GlassCard` |
| `LoginScreen` | Swap form card to `GlassCard` |
| `PushNotificationsScreen` | Swap category rows to `GlassCard`; toggles already gold |
| `CreateLookScreen` | Swap canvas card to `GlassCard` |
| `CreatePosterScreen` | Swap editor cards to `GlassCard` |
| `GlobalSearchScreen` | Swap recent search chips and result cards to `GlassCard` |
| `CategoryDetailScreen` | Swap category cards to `GlassCard` |
| `CollectionDetailScreen` | Swap collection cards to `GlassCard` |
| `GroupBotDirectoryScreen` | Swap group cards to `GlassCard` |
| `CreateGroupChatScreen` | Swap form cards to `GlassCard` |
| `PersonalisationScreen` | Swap quiz cards to `GlassCard` |
| `InviteFriendsScreen` | Swap invite cards to `GlassCard` |

---

## New Components (From Inbox/Settings Plans Only)

The only genuinely new components needed across the entire app are:

| Component | From Plan | Used By |
|-----------|-----------|---------|
| `AvatarRing` | `INBOX_UPGRADE_PLAN.md` | Inbox, Profile, ItemDetail, Notifications |
| `PulseDot` | `INBOX_UPGRADE_PLAN.md` | Inbox, Notifications |

Everything else is **adoption of existing components**, not creation.

---

## Implementation Order Recommendation

1. **Phase 1 — Foundation**
   - Create `AvatarRing` and `PulseDot` (from Inbox plan)
   
2. **Phase 2 — Core Flows (GlassCard Sweep)**
   - Home → Browse → ItemDetail → Checkout → Orders → Balance → Closet
   
3. **Phase 3 — Communication**
   - Inbox (detailed in own plan) → Chat (detailed in own plan) → Notifications
   
4. **Phase 4 — Creator Tools**
   - Sell (detailed in own plan) → MyListings → ManageListing → CreateLook → CreatePoster → ListingSuccess
   
5. **Phase 5 — Settings & Support**
   - Settings (detailed in own plan) → AccountSettings (detailed in own plan) → EditProfile → HelpSupport → Payments → Postage → Security screens → PushNotifications
   
6. **Phase 6 — Discovery**
   - GlobalSearch → Filter → CategoryTree → CategoryDetail → CollectionDetail → Personalisation → InviteFriends → Group screens

---

## Feature Preservation Mandate

For every screen:
- All navigation routes and params
- All API calls and data flows
- All form validations
- All state management (Zustand)
- All haptic feedback
- All accessibility labels/roles/hints
- All toast messages
- All bottom sheet pickers
- All modal flows
- All permission requests

---

## Success Criteria
1. All remaining `AppCard` / solid `Colors.surface` wrappers swapped to `GlassCard`
2. No screen feels visually inconsistent
3. All primary CTAs already use gold (`AppButton variant="primary"`) — verify during sweep
4. `AvatarRing` adopted on profile, item detail, notifications
5. `PulseDot` adopted on inbox and notifications unread indicators
6. No new components created beyond `AvatarRing` and `PulseDot`
7. All existing features work identically
8. No inline `IS_LIGHT` color constants added
