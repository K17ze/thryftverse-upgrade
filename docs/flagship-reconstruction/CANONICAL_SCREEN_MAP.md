# Canonical Screen Map

Generated: UI-22C consolidation phase.

## Methodology
- Audited `AppNavigator.tsx`, `TabNavigator.tsx`, `types.ts`
- Scanned `frontend/src/screens/` for all `.tsx` files
- Scanned `frontend/src/components/` for suffixed component files
- Checked every import path for active vs dead usage

---

## Settings Department

| Product journey | Route name | Current navigator target | Canonical screen file | Duplicate/legacy files | Current callers | Consolidation action |
|-----------------|------------|--------------------------|----------------------|------------------------|-----------------|----------------------|
| Settings root | `Settings` | `SettingsScreenV2` | `SettingsScreen.tsx` | `SettingsScreenV2.tsx` | AppNavigator | **Case 1** — Move V2 → canonical, update import, delete V2 |
| Account details | `AccountSettings` | `AccountSettingsScreenV2` | `AccountSettingsScreen.tsx` | `AccountSettingsScreenV2.tsx` | AppNavigator | **Case 1** — Move V2 → canonical, update import, delete V2 |
| Change password | `ChangePassword` | `ChangePasswordScreenV2` | `ChangePasswordScreen.tsx` | `ChangePasswordScreenV2.tsx` | AppNavigator | **Case 1** — Move V2 → canonical, update import, delete V2 |
| Push notifications | `PushNotifications` | `PushNotificationsScreenV2` | `PushNotificationsScreen.tsx` | `PushNotificationsScreenV2.tsx` | AppNavigator | **Case 1** — Move V2 → canonical, update import, delete V2 |
| Privacy settings | `PrivacySettings` | `PrivacySettingsScreenV2` | `PrivacySettingsScreen.tsx` | `PrivacySettingsScreenV2.tsx` | AppNavigator | **Case 1** — Move V2 → canonical, update import, delete V2 |
| Chat settings | `ChatSettings` | `ChatSettingsScreenV2` | `ChatSettingsScreen.tsx` | `ChatSettingsScreenV2.tsx` | AppNavigator | **Case 1** — Move V2 → canonical, update import, delete V2 |
| Active sessions | `ActiveSessions` | `ActiveSessionsScreenV2` | `ActiveSessionsScreen.tsx` | `ActiveSessionsScreenV2.tsx` | AppNavigator | **Case 1** — Move V2 → canonical, update import, delete V2 |
| Blocked users | `BlockedUsers` | `BlockedUsersScreenV2` | `BlockedUsersScreen.tsx` | `BlockedUsersScreenV2.tsx` | AppNavigator | **Case 1** — Move V2 → canonical, update import, delete V2 |
| Help & support | `HelpSupport` | `HelpSupportScreenV2` | `HelpSupportScreen.tsx` | `HelpSupportScreenV2.tsx` | AppNavigator | **Case 1** — Move V2 → canonical, update import, delete V2 |
| Two-factor setup | `TwoFactorSetup` | `TwoFactorSetupScreenV2` | `TwoFactorSetupScreen.tsx` | `TwoFactorSetupScreenV2.tsx` | AppNavigator | **Case 1** — Move V2 → canonical, update import, delete V2 |
| About | `About` | `AboutScreen` | `AboutScreen.tsx` | — | AppNavigator | Already canonical (upgraded in UI-22B) |
| Edit profile | `EditProfile` | `EditProfileScreen` | `EditProfileScreen.tsx` | — | AppNavigator | Already canonical (upgraded in UI-22B) |
| Payments | `Payments` | `PaymentsScreen` | `PaymentsScreen.tsx` | — | AppNavigator | Already canonical (upgraded in UI-22B) |
| Postage | `Postage` | `PostageScreen` | `PostageScreen.tsx` | — | AppNavigator | Already canonical (upgraded in UI-22B) |
| Personalisation | `Personalisation` | `PersonalisationScreen` | `PersonalisationScreen.tsx` | — | AppNavigator | Already canonical (upgraded in UI-22B) |

## Sell Department

| Product journey | Route name | Current navigator target | Canonical screen file | Duplicate/legacy files | Current callers | Consolidation action |
|-----------------|------------|--------------------------|----------------------|------------------------|-----------------|----------------------|
| Create listing | `Sell` (tab) | `SellScreenV2` | `SellScreen.tsx` | `SellScreenV2.tsx` | TabNavigator | **Case 1** — Move V2 → canonical, update import, delete V2 |
| Create poster | `CreatePoster` | `CreatePosterScreenV2` | `CreatePosterScreen.tsx` | `CreatePosterScreenV2.tsx` | AppNavigator | **Case 1** — Move V2 → canonical, update import, delete V2 |

## Messaging Department

| Product journey | Route name | Current navigator target | Canonical screen file | Duplicate/legacy files | Current callers | Consolidation action |
|-----------------|------------|--------------------------|----------------------|------------------------|-----------------|----------------------|
| Inbox | `Inbox` (tab) | `InboxScreen` | `InboxScreen.tsx` | — | TabNavigator | Already canonical — **reconstruct in place** |
| Chat | `Chat` | `ChatScreen` | `ChatScreen.tsx` | — | AppNavigator | Already canonical — **reconstruct in place** |
| Message requests | `MessageRequests` | `MessageRequestsScreen` | `MessageRequestsScreen.tsx` | — | AppNavigator | Already canonical — **reconstruct in place** |
| Conversation info | `ConversationInfo` | `ConversationInfoScreen` | `ConversationInfoScreen.tsx` | — | AppNavigator | Already canonical — **reconstruct in place** |
| Chat media preview | `ChatMediaPreview` | `ChatMediaPreviewScreen` | `ChatMediaPreviewScreen.tsx` | — | AppNavigator | Already canonical — **reconstruct in place** |
| Create group chat | `CreateGroupChat` | `CreateGroupChatScreen` | `CreateGroupChatScreen.tsx` | — | AppNavigator | Already canonical |
| Group chat info | `GroupChatInfo` | `GroupChatInfoScreen` | `GroupChatInfoScreen.tsx` | — | AppNavigator | Already canonical |
| Group members | `GroupMembers` | `GroupMembersScreen` | `GroupMembersScreen.tsx` | — | AppNavigator | Already canonical |
| Edit group | `EditGroup` | `EditGroupScreen` | `EditGroupScreen.tsx` | — | AppNavigator | Already canonical |
| Group bot directory | `GroupBotDirectory` | `GroupBotDirectoryScreen` | `GroupBotDirectoryScreen.tsx` | — | AppNavigator | Already canonical |
| Group bot management | `GroupBotManagement` | `GroupBotManagementScreen` | `GroupBotManagementScreen.tsx` | — | AppNavigator | Already canonical |

## Messaging Components

| Component | Current file | Duplicate/legacy | Action |
|-----------|-------------|------------------|--------|
| Chat bubble | `ChatBubbleV2.tsx` | — | Rename to `MessageBubble.tsx` after caller migration, or consolidate into canonical `MessageBubble` |
| Chat top bar | `ChatTopBar.tsx` (assumed) | — | Audit and rename to `ChatHeader` if appropriate |
| Composer | `ChatComposerBar.tsx` (assumed) | — | Rename to `ChatComposer` if appropriate |
| Marketplace context | `MarketplaceChatCard.tsx` | — | Rename to `MarketplaceChatContext` if appropriate |
| Inbox row | (assumed) | — | Create/rename to `ConversationRow` |

## Summary of Duplicates Found

- **10** settings screen pairs (V2 active, legacy dead)
- **1** sell screen pair (V2 active, no legacy)
- **1** create poster screen pair (V2 active, no legacy)
- **1** chat component suffix (`ChatBubbleV2`)

## Consolidation Order

1. Settings family (10 screens)
2. Sell + CreatePoster family (2 screens)
3. Messaging components (1 component rename)
4. Messaging screens reconstruction (5 screens)
