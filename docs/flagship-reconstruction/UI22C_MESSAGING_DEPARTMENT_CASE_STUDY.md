# UI-22C — Messaging Department Reconstruction Case Study

## Scope
- Canonical screen consolidation (settings V2s)
- Messaging department shell upgrade
- Shared component consolidation

---

## A. Canonical Screen Consolidation

### Duplicate families eliminated

| Legacy file | Canonical file | Action |
|-------------|---------------|--------|
| `SettingsScreenV2.tsx` | `SettingsScreen.tsx` | Moved content, deleted V2 |
| `AccountSettingsScreenV2.tsx` | `AccountSettingsScreen.tsx` | Moved content, deleted V2 |
| `ChangePasswordScreenV2.tsx` | `ChangePasswordScreen.tsx` | Moved content, deleted V2 |
| `PushNotificationsScreenV2.tsx` | `PushNotificationsScreen.tsx` | Moved content, deleted V2 |
| `PrivacySettingsScreenV2.tsx` | `PrivacySettingsScreen.tsx` | Moved content, deleted V2 |
| `ChatSettingsScreenV2.tsx` | `ChatSettingsScreen.tsx` | Moved content, deleted V2 |
| `ActiveSessionsScreenV2.tsx` | `ActiveSessionsScreen.tsx` | Moved content, deleted V2 |
| `BlockedUsersScreenV2.tsx` | `BlockedUsersScreen.tsx` | Moved content, deleted V2 |
| `HelpSupportScreenV2.tsx` | `HelpSupportScreen.tsx` | Moved content, deleted V2 |
| `TwoFactorSetupScreenV2.tsx` | `TwoFactorSetupScreen.tsx` | Moved content, deleted V2 |
| `SellScreenV2.tsx` | `SellScreen.tsx` | Moved content, deleted V2 |
| `CreatePosterScreenV2.tsx` | `CreatePosterScreen.tsx` | Moved content, deleted V2 |

### Navigator imports updated
- `AppNavigator.tsx` — all settings/poster imports changed to canonical paths
- `TabNavigator.tsx` — `SellScreenV2` → `SellScreen`
- `RuntimeSmokeTestScreen.tsx` — label updated

### Component rename
- `ChatBubbleV2.tsx` → `MessageBubble.tsx`
- `ChatScreen.tsx` import and JSX usage updated
- Old `ChatBubbleV2.tsx` deleted

---

## B. Messaging Department Shell Upgrade

### Screens upgraded to `FlagshipScreen` + `FlagshipHeader`

| Screen | Legacy wrapper | New wrapper | Notes |
|--------|---------------|-------------|-------|
| `InboxScreen.tsx` | `SafeAreaView` + custom header | `FlagshipScreen` `scrollEnabled={false}` | Search + segments remain in content; actions moved to `FlagshipHeader` rightAction |
| `ChatScreen.tsx` | `SafeAreaView` + `StatusBar` + `ChatTopBar` + `KeyboardAvoidingView` | `FlagshipScreen` `keyboardAvoiding` `scrollEnabled={false}` | Header props mapped to `FlagshipHeader`; composer + FlatList now inside FlagshipScreen keyboard handling |
| `MessageRequestsScreen.tsx` | `SafeAreaView` + `ScreenHeader` | `FlagshipScreen` `scrollEnabled={false}` | Preserved accept/decline workflow and honest empty state |
| `ConversationInfoScreen.tsx` | `SafeAreaView` + `ScreenHeader` | `FlagshipScreen` `scrollEnabled={false}` | Two occurrences (not-found + main render) both replaced |
| `ChatMediaPreviewScreen.tsx` | `SafeAreaView` + `StatusBar` | `FlagshipScreen` `scrollEnabled={false}` | Full-screen media preserved |

### Group chat screens upgraded

| Screen | Legacy wrapper | New wrapper |
|--------|---------------|-------------|
| `CreateGroupChatScreen.tsx` | `SafeAreaView` + `ScreenHeader` | `FlagshipScreen` |
| `GroupChatInfoScreen.tsx` | `SafeAreaView` + `ScreenHeader` | `FlagshipScreen` |
| `GroupMembersScreen.tsx` | `SafeAreaView` + `ScreenHeader` | `FlagshipScreen` |
| `EditGroupScreen.tsx` | `SafeAreaView` + `ScreenHeader` | `FlagshipScreen` |
| `GroupBotDirectoryScreen.tsx` | `SafeAreaView` + `ScreenHeader` | `FlagshipScreen` |
| `GroupBotManagementScreen.tsx` | `SafeAreaView` + `ScreenHeader` | `FlagshipScreen` |

---

## C. Shared Component Changes

### `FlagshipHeader` enhanced
- Added optional `avatar?: React.ReactNode` prop for chat/profile contexts
- Added `avatarWrap` style
- Zero breaking change — existing callers unaffected

### `MessageBubble` (formerly `ChatBubbleV2`)
- Preserved all props: `text`, `isMe`, `senderLabel`, `timestamp`, `status`, `reactions`, `mediaUri`, `mediaType`, `uploadStatus`, `replyTo`, `isFirstInCluster`, `isLastInCluster`, `showAvatar`, `onLongPress`, `onReactionPress`, `onRetry`, `onMediaPress`
- Preserved honest failed/retry state UI

---

## D. Architecture Before / After

### Inbox
**Before:**
- `SafeAreaView` with custom title row + icon buttons + `StatusBar`
- Search bar and segment control inside custom header View

**After:**
- `FlagshipScreen` with `FlagshipHeader` (title + right actions for create-group/settings)
- Search bar and `AppSegmentControl` in content area below header
- `scrollEnabled={false}` so `FlashList` controls its own scroll

### Chat
**Before:**
- `SafeAreaView` + `StatusBar` + `ChatTopBar` (custom header with avatar/initials)
- `KeyboardAvoidingView` wrapping `FlatList` + `ChatComposerBar`
- `ChatBubbleV2` imported

**After:**
- `FlagshipScreen` `keyboardAvoiding` `scrollEnabled={false}` — header outside keyboard area, content inside
- `FlagshipHeader` with title/subtitle/onBack/rightAction (search + info icons)
- `MessageBubble` imported (canonical name)
- Marketplace context card preserved in timeline
- Composer bar preserved at bottom

### Message Requests
**Before:**
- `SafeAreaView` + `ScreenHeader`

**After:**
- `FlagshipScreen` + `FlagshipHeader`
- Preserved: card layout, avatar, accept/decline actions, confirmation dialog on decline

### Conversation Info
**Before:**
- `SafeAreaView` + `ScreenHeader` + `ScrollView`

**After:**
- `FlagshipScreen` + `FlagshipHeader` + `ScrollView`
- Preserved: identity card, linked item gallery, mute/archive/block/delete actions, danger zone styling

---

## E. Product Truth / Feature Depth

### Preserved real functionality
- `fetchConversationsFromApi` / `fetchConversationMessagesFromApi`
- `sendConversationMessageOnApi`
- `deleteConversationMessageOnApi`
- `deleteConversationOnApi`
- `createGroupConversationOnApi`
- `updateConversationOnApi`
- `deployBotToConversationOnApi` / `undeployBotFromConversationOnApi`
- `acceptMessageRequest` / `declineMessageRequest`
- `toggleMutedConversation` / `toggleArchivedConversation` / `toggleConversationPinned`
- `deleteConversation`
- `markConversationRead`
- Real `conversations` store data (not faked)
- Real `messageRequests` store data

### Honest unavailable states preserved
- "Backend sync unavailable. Created locally." (group chat)
- "Avatar editing requires backend support."
- "No bots available for this group."
- "Group not found" / "Conversation not found" (honest empty/error)

### Not faked
- No fake read receipts
- No fake typing indicators
- No fake online/presence state
- No fake delivery confirmations

---

## F. Backend Dependencies Discovered

1. **Conversation search** — current search is local text filter over `conversation.messages`. Backend search would enable searching full history.
2. **Message request backend sync** — `acceptMessageRequest` and `declineMessageRequest` are store-level; no API call visible.
3. **Media upload progress** — `uploadStatus` prop exists on `MessageBubble` but upload pipeline is not fully wired.
4. **Avatar editing** — group avatars not wired to backend.
5. **Add member to group** — UI exists but backend integration not wired.

---

## G. Known Limitations / Deferred Work

- `ProductCardV2.tsx` still exists and is used by multiple screens (outside UI-22C scope)
- Many non-messaging screens still use `SafeAreaView` + `ScreenHeader` (to be addressed in future sectors)
- Test files still contain string references to deleted V2 files (to be updated in validation phase)
- `FlagshipHeader` avatar prop is basic; advanced avatar treatments (presence dot, online ring) not implemented until backend supports presence
