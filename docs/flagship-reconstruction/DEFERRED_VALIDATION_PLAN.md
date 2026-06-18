# Deferred Validation Plan — UI-22C

Created: UI-22C consolidation + messaging reconstruction phase.
Deferred until: wider reconstruction substantially complete (as per user directive).

---

## 1. Deleted Legacy Files — Import Verification

Files deleted in UI-22C that may still be referenced by tests or stale imports:

- `SettingsScreenV2.tsx`
- `AccountSettingsScreenV2.tsx`
- `ChangePasswordScreenV2.tsx`
- `PushNotificationsScreenV2.tsx`
- `PrivacySettingsScreenV2.tsx`
- `ChatSettingsScreenV2.tsx`
- `ActiveSessionsScreenV2.tsx`
- `BlockedUsersScreenV2.tsx`
- `HelpSupportScreenV2.tsx`
- `TwoFactorSetupScreenV2.tsx`
- `SellScreenV2.tsx`
- `CreatePosterScreenV2.tsx`
- `ChatBubbleV2.tsx`

**Verification command:**
```bash
cd frontend/src
grep -r "ScreenV2" --include="*.tsx" --include="*.ts" .
grep -r "ChatBubbleV2" --include="*.tsx" --include="*.ts" .
```
Expected: zero matches outside `__tests__`.

---

## 2. Routes Requiring Navigation Verification

Test every route registration in `AppNavigator.tsx` and `TabNavigator.tsx`:

| Route | Screen | Verify |
|-------|--------|--------|
| `Settings` | `SettingsScreen` | Navigate from profile → settings opens |
| `AccountSettings` | `AccountSettingsScreen` | Navigate from settings → account opens |
| `ChangePassword` | `ChangePasswordScreen` | Navigate from settings → password opens |
| `PushNotifications` | `PushNotificationsScreen` | Navigate from settings → notifications opens |
| `PrivacySettings` | `PrivacySettingsScreen` | Navigate from settings → privacy opens |
| `ChatSettings` | `ChatSettingsScreen` | Navigate from inbox → chat settings opens |
| `ActiveSessions` | `ActiveSessionsScreen` | Navigate from settings → sessions opens |
| `BlockedUsers` | `BlockedUsersScreen` | Navigate from settings → blocked opens |
| `HelpSupport` | `HelpSupportScreen` | Navigate from settings → help opens |
| `TwoFactorSetup` | `TwoFactorSetupScreen` | Navigate from account → 2FA opens |
| `Sell` (tab) | `SellScreen` | Tap Sell tab opens |
| `CreatePoster` | `CreatePosterScreen` | Navigate to create poster opens |
| `Inbox` (tab) | `InboxScreen` | Tap Inbox tab opens, badge count visible |
| `Chat` | `ChatScreen` | Tap conversation → chat opens, keyboard works |
| `MessageRequests` | `MessageRequestsScreen` | Tap requests banner → requests screen opens |
| `ConversationInfo` | `ConversationInfoScreen` | Tap info icon → info screen opens |
| `ChatMediaPreview` | `ChatMediaPreviewScreen` | Tap media → preview opens, close works |
| `CreateGroupChat` | `CreateGroupChatScreen` | Tap create group → screen opens |
| `GroupChatInfo` | `GroupChatInfoScreen` | Tap group title → info opens |
| `GroupMembers` | `GroupMembersScreen` | Tap members → members list opens |
| `EditGroup` | `EditGroupScreen` | Tap edit group → edit screen opens |
| `GroupBotDirectory` | `GroupBotDirectoryScreen` | Tap manage bots → directory opens |
| `GroupBotManagement` | `GroupBotManagementScreen` | Tap bot management → management opens |

---

## 3. State Flows Requiring Integration Tests

### Messaging store flows
- `loadConversations()` → populates `conversations` array
- `upsertConversation()` → updates or inserts a conversation
- `deleteConversation()` → removes conversation (with optimistic UI + rollback on API failure)
- `markConversationRead()` → clears unread flag
- `toggleConversationPinned()` → toggles pin state
- `toggleMutedConversation()` → toggles mute state
- `toggleArchivedConversation()` → toggles archive state
- `acceptMessageRequest(id)` / `declineMessageRequest(id)` → moves request to/from main inbox

### Chat message flows
- `sendConversationMessageOnApi()` → appends message to conversation
- `deleteConversationMessageOnApi()` → removes message
- `fetchConversationMessagesFromApi()` → loads message history

### Group chat flows
- `createGroupConversationOnApi()` → creates new group
- `updateConversationOnApi()` → updates group metadata
- `deployBotToConversationOnApi()` / `undeployBotFromConversationOnApi()` → bot lifecycle

---

## 4. Messaging Backend Actions Requiring Tests

| API endpoint | Frontend service | Test needed |
|--------------|-----------------|-------------|
| GET /conversations | `fetchConversationsFromApi` | Load, empty, error, retry |
| GET /conversations/:id/messages | `fetchConversationMessagesFromApi` | Pagination, empty, error |
| POST /conversations/:id/messages | `sendConversationMessageOnApi` | Send text, media, reply, offer |
| DELETE /conversations/:id/messages/:msgId | `deleteConversationMessageOnApi` | Delete own message, delete others (permission denied) |
| DELETE /conversations/:id | `deleteConversationOnApi` | Delete with rollback on failure |
| POST /groups | `createGroupConversationOnApi` | Create with title, members |
| PUT /groups/:id | `updateConversationOnApi` | Update name |
| POST /groups/:id/bots | `deployBotToConversationOnApi` | Deploy, duplicate deploy guard |
| DELETE /groups/:id/bots/:botId | `undeployBotFromConversationOnApi` | Undeploy, not-found guard |

---

## 5. Responsive States Requiring Device QA

### Inbox
- Empty state layout on iPhone SE vs iPhone 15 Pro Max
- Search bar + segment control wrapping on narrow screens
- Swipe actions on conversation row (left/right reveal)
- FlashList performance with 100+ conversations

### Chat
- Composer bar + keyboard on iOS vs Android
- Marketplace context card width on small screens
- Media bubble aspect ratio on landscape
- ScrollToBottomFAB position with/without composer
- Selection toolbar + composer overlap

### Message Requests
- Card width and action button stacking on narrow screens
- Avatar + text truncation on small screens

### Conversation Info
- Identity card layout on narrow screens
- Action rows tap target size (min 44pt)

### Chat Media Preview
- Full-screen image on iPhone SE (no clipping)
- Video player controls on landscape
- Close button safe area on devices with dynamic island

---

## 6. Accessibility Checks

### Screen reader walkthrough
- `InboxScreen` — every conversation row announces title, unread state, last message
- `ChatScreen` — message bubble announces sender, text, timestamp
- `MessageRequestsScreen` — accept/decline buttons have distinct labels
- `ConversationInfoScreen` — every action row has `accessibilityRole="button"` and hint
- `ChatMediaPreviewScreen` — close button labeled, media described

### Focus order
- Chat composer → send button → attachment button (logical tab order)
- Inbox search → segment control → first conversation row

### Color contrast
- Verified: `Colors.textPrimary` on `Colors.background` meets WCAG AA
- Verified: `Colors.danger` on `Colors.background` meets WCAG AA
- `Colors.brand` on `Colors.background` — verify in dark mode

---

## 7. Final Validation Commands (run after wider reconstruction)

```bash
cd frontend

# TypeScript
npx tsc --noEmit

# Lint
npm run lint

# Unit tests
npm run test

# Expo Doctor
npx expo-doctor

# Smoke test — ensure every screen imports without error
node -e "require('./src/screens/index')"  # if index exists, or iterate files
```

---

## 8. Test File Updates Required

Test files with stale V2 string references (update import paths / string assertions):

- `__tests__/flagshipComponentsApplied.test.ts` (34 V2 refs)
- `__tests__/ui11cAuthProfileSettings.test.ts` (28 V2 refs)
- `__tests__/screen-import-smoke.test.ts` (11 V2 refs)
- `__tests__/appWideTruthAndVisualGuardrails.test.ts` (10 V2 refs)
- `__tests__/ui19SellCoownChatContextUx.test.ts` (3 V2 refs)
- `__tests__/visual14ReferenceMatchFinalPolish.test.ts` (7 ChatBubbleV2 refs)
- `__tests__/ui21DeviceAudit.test.ts` (2 ChatBubbleV2 refs)

**Note:** These are string-presence tests checking for specific component names. They will fail until updated to canonical names.

---

## 9. Remaining Non-Messaging SafeAreaView Screens (future sectors)

The following screens still use `SafeAreaView` + `ScreenHeader` and are scheduled for future sector upgrades:

- `CheckoutScreen`, `CoOwnIssueScreen`, `EditCollectionScreen`, `MyListingsScreen`, `SupportTicketDetailScreen`
- `AssetDetailScreen`, `BuyoutScreen`, `CreatePosterScreen`, `TradeScreen`
- `BalanceHistoryScreen`, `BalanceScreen`, `BotBuilderScreen`, `BotDirectoryScreen`
- `CollectionDetailScreen`, `CreateCollectionScreen`, `CreateLookScreen`, `CustomBotsScreen`
- `EditListingScreen`, `ForgotPasswordScreen`, `InviteFriendsScreen`, `ListingPreviewScreen`
- `MakeOfferScreen`, `MyOrdersScreen`, `NotificationsScreen`, `OrderDetailScreen`
- `OrderSupportScreen`, `TradeConfirmScreen`, `VisualSearchScreen`, `WithdrawScreen`
- `AddBankAccountScreen`, `AssetLeaderboardScreen`, `AuthLandingScreen`, `BrowseScreen`
- `CategoryDetailScreen`, `CategoryTreeScreen`, `ClosetScreen`, `CreateAuctionScreen`
- `CreateSyndicateScreen`, `GlobalSearchScreen`, `HomeScreen`, `ListingSuccessScreen`
- `LoginScreen`, `MarketLedgerScreen`, `MyBidsScreen`, `OutfitBuilderScreen`
- `PortfolioScreen`, `PosterViewerScreen`, `ReportScreen`, `RuntimeSmokeTestScreen`

---

## 10. ProductCardV2 Deferred

`ProductCardV2.tsx` is still used by:
- `PinterestMasonryGrid.tsx`
- `ClosetScreen.tsx`
- `CollectionDetailScreen.tsx`
- `HomeScreen.tsx`
- `SearchScreen.tsx`
- `VisualSearchScreen.tsx`

Action: consolidate into canonical `ProductCard.tsx` in a future commerce/discovery sector phase.
