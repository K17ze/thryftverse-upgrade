# Phase 5 — Product Readiness Audit (Messaging + Settings Ecosystem)

**Date:** 2026-06-04
**Audited Files:** 25 components / screens
**Method:** Static code review + functional flow tracing + competitive benchmarking
**Benchmarks:** Instagram, Pinterest, Vinted, WhatsApp, Messenger, Telegram

---

## 1. Executive Summary

| Metric | Score | Notes |
|--------|-------|-------|
| **Product Readiness Score** | **52 / 100** | Core text messaging works. Multiple broken flows, missing states, and trust-eroding UI prevent release readiness. |
| **Messaging Readiness** | **48 / 100** | Text send/receive functional. Replies, reactions, and composer are solid. Attachments, message status, search, and media are broken or missing. |
| **Settings Readiness** | **56 / 100** | Navigation and basic forms work. Persistent mock data, dead UI, missing error states, and incomplete payment flows erode trust. |
| **Trust Score** | **38 / 100** | Hardcoded fake data, placeholder QR codes, "coming soon" toasts, and mock message fallbacks make the app feel unreliable and unfinished. |
| **UX Polish Score** | **58 / 100** | Good component reuse, haptics, and animations. Inconsistent card systems, missing empty states, and uneven state coverage create friction. |

**Verdict:** The Messaging and Settings ecosystems are **not production-ready**. While basic text chat and settings navigation function, there are multiple user-blocking issues, significant trust problems, and competitive gaps that would lead to poor retention and negative reviews at launch.

---

## 2. Critical Issues (Block Release)

### C1. Attachment Sending Is Completely Broken
- **Severity:** Critical
- **Scope:** ChatScreen, AttachmentPickerSheet
- **Reproduction:** Open any chat → tap + → select Photo & Video or Camera → pick media → nothing is sent.
- **Root Cause:** `handleAttachmentSelect` in `ChatScreen.tsx` shows a success toast but never constructs an `image`/`video` message or calls `pushMessage()` / `appendConversationMessage()`. The `MsgType` union (`'text' | 'offer' | 'offer_declined' | 'purchase_status'`) has no `image` or `media` case.
- **Fix:** Add `image`/`video` to `MsgType`. Construct a media message after picker selection, append it to `messages`, and scroll to bottom. Ensure `MessageBubble` can render media.
- **User Impact:** Users cannot send photos. This is table stakes for any messaging app.

### C2. SettingsScreen Still Shows Hardcoded Fake Data
- **Severity:** Critical
- **Scope:** SettingsScreen.tsx line ~229
- **Reproduction:** Open Settings → look at "Addresses" row.
- **Root Cause:** The Phase 4 completion report claimed this was fixed to `'Manage'/'None'`, but the code still reads: `value={savedAddress ? '1 saved' : 'None'}`. The `'1 saved'` string is hardcoded and always visible when any address exists.
- **Fix:** Change to `value={savedAddress ? 'Manage' : 'None'}` or display the actual address count.
- **User Impact:** Users immediately see fake numbers. Destroys trust on first contact.

### C3. Two-Factor Setup Shows a Fake QR Code
- **Severity:** Critical
- **Scope:** TwoFactorSetupScreen.tsx lines 107–114
- **Reproduction:** Settings → Account → Two-Factor Authentication → Enable.
- **Root Cause:** Instead of rendering a real QR code from `otpauthUrl`, the screen displays `<Ionicons name="qr-code-outline" size={88} />`. Users cannot actually scan anything.
- **Fix:** Render a real QR code using `react-native-qrcode-svg` or Expo's QR component from the `otpauthUrl`.
- **User Impact:** 2FA setup is impossible. Security-critical feature is completely non-functional.

### C4. Message Forwarding and Bulk Selection Are Dead Actions
- **Severity:** Critical
- **Scope:** ChatScreen.tsx `handleContextMenuAction`, MessageContextMenu.tsx
- **Reproduction:** Long-press any message → tap "Forward" or "Select" → nothing happens.
- **Root Cause:** `handleContextMenuAction` has no implementation for `'forward'` or `'select'` beyond a no-op fallthrough. The context menu shows these actions to the user, but they do nothing.
- **Fix:** Either implement forwarding (contact picker + message copy) and multi-select (checkboxes + bulk delete/forward), or remove the actions from the menu until ready.
- **User Impact:** Dead UI is worse than missing UI. Users will tap repeatedly, assume the app is broken, and leave.

### C5. PaymentsScreen Payment Methods Are Non-Functional Placeholders
- **Severity:** Critical
- **Scope:** PaymentsScreen.tsx `renderPaymentMethodRows`
- **Reproduction:** Settings → Payment Methods → tap any saved card or bank.
- **Root Cause:** Every payment row's `onPress` shows `show('Payment method options coming soon', 'info')`. There is no edit, delete, set-default, or detail view. The `AddCardSheet` is imported but never presented.
- **Fix:** Implement payment method detail sheet (edit nickname, remove, set default) or wire the existing `AddCardSheet` into an "Add" flow. Remove "coming soon" from user-facing UI.
- **User Impact:** Users cannot manage their payment methods. For a commerce app, this blocks checkout trust.

---

## 3. High Priority Issues (Fix Before Launch)

### H1. Chat Has No Real Empty State — Shows Mock Messages Instead
- **Severity:** High
- **Scope:** ChatScreen.tsx `INITIAL_MESSAGES`
- **Issue:** When a conversation has no messages, `hydratedMessages` falls back to `INITIAL_MESSAGES` (an offer, a declined offer, and a purchase status). A new chat appears to contain fake transaction history.
- **Fix:** Return an empty array when `conversation?.messages.length === 0`. Render a real empty state (illustration + "Say hello" prompt).
- **User Impact:** New conversations feel fake and confusing. Users will think they missed messages.

### H2. No Message Search Within Conversation
- **Severity:** High
- **Scope:** ChatScreen.tsx
- **Issue:** `focusQuery` exists in the navigation params but is never used to highlight, filter, or jump to matching messages inside the chat.
- **Fix:** Implement in-chat search header with highlight/jump to results.
- **User Impact:** Users expect to find old messages. Every competitor supports this.

### H3. No Typing Indicators, Read Receipts, or Online Status
- **Severity:** High
- **Scope:** ChatScreen.tsx, ChatHeader.tsx
- **Issue:** `ChatHeader` accepts `isOnline` and `subtitle` props, but `ChatScreen` never wires real presence data. Messages have `status` for outgoing (sent/delivered/read) but incoming messages show no read state. No typing indicator UI exists.
- **Fix:** Wire presence/typing events from backend. Add "read" status to incoming bubble footer when read by counterpart.
- **User Impact:** Users feel like they're talking into a void. Core social proof missing.

### H4. Inbox Has No Loading or Error States
- **Severity:** High
- **Scope:** InboxScreen.tsx
- **Issue:** On first open, if `conversations` is empty, the list simply renders blank until data arrives. `fetchConversationsFromApi` failure is silently caught with no UI feedback.
- **Fix:** Show `SkeletonChatLoader` during initial mount if `conversations.length === 0`. Show a persistent error banner with "Retry" if sync fails.
- **User Impact:** Blank screen on open feels like a crash.

### H5. PushNotificationsScreen Missing Permission-Denied Banner
- **Severity:** High
- **Scope:** PushNotificationsScreen.tsx
- **Issue:** If system push permissions are denied, the screen shows a one-time toast. There is no persistent banner explaining how to re-enable in system settings.
- **Fix:** Add a banner at top: "Push notifications are disabled. Open Settings to enable." with an actionable button linking to app settings.
- **User Impact:** Users who deny permissions once will never know how to recover.

### H6. HelpSupport "My Tickets" Is Fake
- **Severity:** High
- **Scope:** HelpSupportScreen.tsx lines 60–64
- **Issue:** Tapping "My Tickets" hard-scrolls to `y: 760`, shows a toast "No open tickets", and focuses the message form. There is no actual ticket list or history.
- **Fix:** Implement a ticket list (even if local) or remove "My Tickets" button until backend supports it.
- **User Impact:** Users expect to see their support history. The fake scroll is disorienting.

### H7. Support Message Form Has No Validation, No Attachment, No Real API
- **Severity:** High
- **Scope:** HelpSupportScreen.tsx lines 66–70
- **Issue:** `handleSendMessage` just clears the input and shows a toast. No `maxLength`. No character count. No attachment picker. No actual API call.
- **Fix:** Add `maxLength={1000}`, character counter, attachment support, and wire to a real support ticket API.
- **User Impact:** Users cannot actually get help. The form is a placebo.

### H8. AccountSettings "Save Changes" Has No Backend Persistence
- **Severity:** High
- **Scope:** AccountSettingsScreen.tsx lines 173–176
- **Issue:** `handleSaveChanges` calls `updateUserProfile({ email, phone, fullName, birthday })` and shows a toast. No API call to persist changes.
- **Fix:** Wire to `updateUserProfileApi` with loading state, error handling, and optimistic rollback.
- **User Impact:** Users think their data is saved, but it may be lost on logout or reinstall.

### H9. No Offline Handling Anywhere in Messaging or Settings
- **Severity:** High
- **Scope:** All messaging and settings screens
- **Issue:** No offline detection (`NetInfo`). No offline banners. No queued message sending. No retry buttons for failed settings saves.
- **Fix:** Add `NetInfo` wrapper. Queue failed messages. Show "You're offline" banners in Settings and Chat.
- **User Impact:** App feels broken the moment connectivity drops.

---

## 4. Medium Priority Issues (Schedule for Sprint)

### M1. MessageBubble Does Not Render Media, Links, or Voice
- **Scope:** MessageBubble.tsx
- **Issue:** Only `text` is rendered. No image/video attachment rendering. `LinkPreviewCard` exists but is never used inside the bubble. No voice message player.
- **Fix:** Add conditional rendering for `image`, `video`, `audio`, and `link` message types.

### M2. Composer Has No Voice Message Button
- **Scope:** ComposerInput.tsx
- **Issue:** No microphone icon or voice recording UI.
- **Fix:** Add a hold-to-record microphone button next to the send button.

### M3. EmojiReactionsBar Has No Custom Emoji Picker
- **Scope:** EmojiReactionsBar.tsx
- **Issue:** Only 6 fixed emojis. `onShowMore` exists but opens nothing (no emoji picker sheet).
- **Fix:** Integrate a cross-platform emoji picker sheet when "+" is tapped.

### M4. Inbox Empty State Is Text-Only and Unpolished
- **Scope:** InboxScreen.tsx
- **Issue:** "No conversations found" is plain text. No illustration, no CTA to start a chat.
- **Fix:** Add an illustration, "Start messaging" button, and suggested contacts.

### M5. ChatScreen Scroll-to-Bottom FAB May Overlap Keyboard
- **Scope:** ChatScreen.tsx
- **Issue:** `ScrollToBottomFAB` is positioned absolutely outside `KeyboardAvoidingView`. May float above composer when keyboard is open.
- **Fix:** Move FAB inside `KeyboardAvoidingView` or adjust `bottom` offset when keyboard is visible.

### M6. SettingsScreen Commerce Section Visible to Non-Sellers
- **Scope:** SettingsScreen.tsx
- **Issue:** "Commerce" section (Payout Method, Shipping Profiles) is visible to all users regardless of seller status.
- **Fix:** Gate behind `user.isSeller` or hide until first listing is created.

### M7. TwoFactorSetupScreen Lacks ScreenHeader and AppInput
- **Scope:** TwoFactorSetupScreen.tsx
- **Issue:** Uses manual back button and raw `TextInput`. No `ScreenHeader`. No `AppInput`. Styling is one-off.
- **Fix:** Migrate to `ScreenHeader` and `AppInput` for consistency.

### M8. HelpSupportScreen Hardcoded Scroll Position
- **Scope:** HelpSupportScreen.tsx line 61
- **Issue:** `scrollTo({ y: 760 })` breaks on small screens or if FAQ count changes.
- **Fix:** Use `measure` or a ref-based `scrollTo` with `scrollToEnd`.

### M9. AccountSettingsScreen Still Uses Deprecated GlassCard
- **Scope:** AccountSettingsScreen.tsx
- **Issue:** Personal Details, Preferences, Security, and 2FA modal use `GlassCard`. Inconsistent with solid surfaces elsewhere.
- **Fix:** Replace with `SettingsCard` or solid `View` + `Elevation.subtle`.

### M10. PaymentsScreen `renderPaymentMethodRows` Is Unmaintainable
- **Scope:** PaymentsScreen.tsx lines 93–174
- **Issue:** 80+ line inline render function. Duplicated JSX for unavailable/method/empty states.
- **Fix:** Extract into `PaymentMethodRow` component with `variant` prop.

### M11. PostageScreen Carrier Cards Allow Zero Selection
- **Scope:** PostageScreen.tsx
- **Issue:** `selectCarrier` only sets the tapped carrier to `selected=true` and others to `false`. It is possible to have no carrier selected if logic drifts.
- **Fix:** Ensure at least one carrier is always selected, or show validation error.

### M12. No Message Deletion in Chat
- **Scope:** ChatScreen.tsx `handleContextMenuAction`
- **Issue:** "Delete" action in context menu has no implementation.
- **Fix:** Implement `deleteMessage` store action and UI confirmation.

### M13. No Message Editing
- **Scope:** ChatScreen.tsx, MessageContextMenu.tsx
- **Issue:** No "Edit" action in context menu.
- **Fix:** Add edit action, editable message state, and UI treatment for edited messages.

---

## 5. Low Priority Issues (Nice-to-Have)

### L1. SettingsScreen Version Text Is Tiny and Low Contrast
- **Scope:** SettingsScreen.tsx
- **Issue:** App version rendered at `Type.meta.size` with muted color; feels like an afterthought.
- **Fix:** Move to a dedicated "About" footer with proper spacing, build number, and links to Privacy Policy / Terms.

### L2. PushNotificationsScreen Missing Empty State When All Disabled
- **Scope:** PushNotificationsScreen.tsx
- **Issue:** If all toggles are off, the list looks broken with no illustration or explanation.
- **Fix:** Add an empty-state illustration when `enabledCount === 0`.

### L3. PersonalisationScreen Gender Pills Use Custom Styling
- **Scope:** PersonalisationScreen.tsx
- **Issue:** Custom pills instead of shared `AppSegmentControl`. Radius and padding differ from other segmented controls.
- **Fix:** Replace with `AppSegmentControl allowMultiple`.

### L4. ChatHeader `ActiveTheme` Import Is Inline
- **Scope:** ChatHeader.tsx line 143
- **Issue:** `ActiveTheme` is imported at bottom of file after `StyleSheet.create`. Works but is a code smell.
- **Fix:** Move import to top.

### L5. No Archive / Mute / Block from Inbox
- **Scope:** InboxScreen.tsx
- **Issue:** Swipe actions are delete and pin only. No archive, mute, or block.
- **Fix:** Add secondary swipe actions or overflow menu.

### L6. InboxScreen Uses GlassCard for Rows
- **Scope:** InboxScreen.tsx line 193
- **Issue:** `GlassCard` is deprecated visual language per DESIGN_SYSTEM_COMPLIANCE.
- **Fix:** Replace with solid `View` + `Elevation.subtle`.

### L7. TwoFactorSetup Recovery Codes Not Copyable
- **Scope:** TwoFactorSetupScreen.tsx
- **Issue:** Recovery codes shown in `Alert.alert` cannot be copied.
- **Fix:** Use a custom modal with "Copy" button and share sheet.

### L8. Missing About / Legal Section in Settings
- **Scope:** SettingsScreen.tsx
- **Issue:** No Privacy Policy, Terms of Service, or Licenses links.
- **Fix:** Add a footer section with legal links.

---

## 6. Competitive Gaps

### Messaging (vs WhatsApp, Messenger, Telegram, Instagram DM)

#### Missing Core Features
| Feature | Impact | Notes |
|---------|--------|-------|
| Image/Video messages | **Critical** | Picker exists but doesn't send. No media rendering. |
| Voice messages | **High** | No recording UI or audio player. |
| Message search in chat | **High** | `focusQuery` param unused. |
| Read receipts / delivery status | **High** | Outgoing has status; incoming has no read state. |
| Typing indicators | **High** | No UI or backend wiring. |
| Online/presence status | **High** | `ChatHeader` props exist but unwired. |
| Message forwarding | **High** | Menu action is dead. |
| Message deletion | **High** | Menu action is dead. |
| Message editing | **Medium** | Not in menu. Expected in modern chat. |
| In-chat link previews | **Medium** | `LinkPreviewCard` exists but unused. |
| Group management (add/remove) | **Medium** | `CreateGroupChatScreen` exists but no member management. |
| Reply-to-scroll | **Medium** | Reply indicator rendered, but tapping doesn't scroll to original. |
| Message timestamps on outgoing | **Low** | Only incoming shows timestamp. |

#### Missing Premium Features
| Feature | Impact | Notes |
|---------|--------|-------|
| Video calls | Medium | Expected in social commerce for high-value items. |
| Disappearing messages | Low | Differentiator for privacy-conscious users. |
| Chat themes / wallpapers | Low | Brand expression. |
| Pinned messages | Low | Useful for group chats. |
| Message reactions beyond 6 emojis | Low | Custom emoji picker missing. |
| Polls in groups | Low | Community feature. |

#### Overbuilt Features
| Feature | Assessment |
|---------|------------|
| `LinkPreviewCard` | Built but unused. Dead code creating maintenance burden. |
| `CreateGroupChatScreen` | Group creation exists but no group info/member management. Half-feature. |

### Settings (vs Instagram, Vinted, Pinterest)

#### Missing Core Features
| Feature | Impact | Notes |
|---------|--------|-------|
| Security / Active Sessions | **High** | No login history, trusted devices, or "Log out everywhere". |
| Blocked Users list | **High** | Critical for trust & safety. |
| Privacy settings (activity status, profile visibility) | **High** | Only "private profile" toggle exists. No granular controls. |
| Muted accounts / conversations | **Medium** | No mute settings anywhere. |
| Clear search history | **Medium** | Expected in discovery apps. |
| Data export status / download | **Medium** | Can request export but no status tracking or download link. |
| Accessibility settings | **Medium** | No font size, reduce motion, or screen reader settings. |
| Language picker discoverability | **Low** | Hidden in Preferences, not a top-level row. |

#### Missing Premium Features
| Feature | Impact | Notes |
|---------|--------|-------|
| Business / Seller account settings | Medium | No seller dashboard, analytics, or payout schedule. |
| Shipping label integration | Medium | Postage settings exist but no label printing. |
| Promotions / Boost settings | Low | Vinted-style "Wardrobe Spotlight" equivalent. |

#### Overbuilt Features
| Feature | Assessment |
|---------|------------|
| `AddCardSheet` | Imported in PaymentsScreen but never presented. Dead integration. |
| `GroupBotDirectoryScreen` | Exists in navigation but may be orphaned if not linked from group chat. |

---

## 7. Top 20 Highest ROI Improvements

Ranked by **Impact ÷ Effort**. Already-completed fixes from previous phases are excluded.

| Rank | Improvement | Impact | Effort | Category | File(s) |
|------|-------------|--------|--------|----------|---------|
| 1 | **Fix attachment sending** — actually create and send media messages | Critical | Medium | Chat | `ChatScreen.tsx`, `MessageBubble.tsx` |
| 2 | **Replace fake QR code with real QR rendering** in 2FA setup | Critical | Low | Trust | `TwoFactorSetupScreen.tsx` |
| 3 | **Remove or implement dead context-menu actions** (Forward, Select, Delete) | Critical | Low-Medium | Chat | `ChatScreen.tsx`, `MessageContextMenu.tsx` |
| 4 | **Fix hardcoded "1 saved" addresses text** | Critical | Very Low | Trust | `SettingsScreen.tsx` |
| 5 | **Replace mock message fallback with real empty state** in Chat | High | Low | Chat | `ChatScreen.tsx` |
| 6 | **Add persistent error banner + retry** to Inbox sync | High | Low | Messaging | `InboxScreen.tsx` |
| 7 | **Add skeleton loading** to Inbox initial state | High | Low | Messaging | `InboxScreen.tsx` |
| 8 | **Implement push permission-denied banner** with "Open Settings" | High | Low | Settings | `PushNotificationsScreen.tsx` |
| 9 | **Wire AccountSettings save to real backend API** | High | Medium | Settings | `AccountSettingsScreen.tsx` |
| 10 | **Add offline banner + message queue** to Chat | High | Medium | Messaging | `ChatScreen.tsx`, network layer |
| 11 | **Implement payment method management** (remove/edit/default) | High | Medium | Settings | `PaymentsScreen.tsx` |
| 12 | **Add in-chat message search** (highlight/jump) | High | Medium | Chat | `ChatScreen.tsx` |
| 13 | **Wire typing indicators and read receipts** | High | Medium | Chat | Backend + `ChatScreen.tsx` |
| 14 | **Implement real support ticket API** + form validation | High | Medium | Settings | `HelpSupportScreen.tsx` |
| 15 | **Remove or fix "My Tickets" fake scroll** | High | Very Low | Settings | `HelpSupportScreen.tsx` |
| 16 | **Add image/video rendering** to MessageBubble | High | Medium | Chat | `MessageBubble.tsx` |
| 17 | **Add Security section** (active sessions, log out everywhere) | High | Medium | Settings | New screen + `SettingsScreen.tsx` |
| 18 | **Add Blocked Users** screen | High | Low | Settings | New screen + `SettingsScreen.tsx` |
| 19 | **Add message deletion** with confirmation | High | Low | Chat | `ChatScreen.tsx`, store |
| 20 | **Gate Commerce section** behind `isSeller` | Medium | Very Low | Settings | `SettingsScreen.tsx` |

---

## Appendices

### Appendix A: State Coverage Matrix

| Screen | Loading | Empty | Error | Offline | Permission Denied | FTU |
|--------|---------|-------|-------|---------|-------------------|-----|
| InboxScreen | ❌ No | ⚠️ Text-only | ❌ Silent catch | ❌ | — | ❌ |
| ChatScreen | ❌ No | ❌ Mock fallback | ❌ Toast only | ❌ | — | ❌ |
| ComposerInput | — | — | — | — | — | — |
| MessageBubble | — | — | — | — | — | — |
| SettingsScreen | ❌ No | — | ❌ | ❌ | — | ❌ |
| AccountSettingsScreen | ✅ Skeleton | — | ⚠️ Toast | ❌ | — | ❌ |
| PushNotificationsScreen | ❌ No | ❌ | ⚠️ Toast | ❌ | ⚠️ Toast only | ❌ |
| HelpSupportScreen | ❌ No | ✅ FAQ search empty | ❌ | ❌ | — | ❌ |
| PersonalisationScreen | ❌ No | — | — | ❌ | — | ❌ |
| PaymentsScreen | ✅ Skeleton | ✅ Empty state | ⚠️ Toast | ❌ | — | ❌ |
| PostageScreen | ✅ Skeleton | — | — | ❌ | — | ❌ |
| ChangePasswordScreen | ❌ No | — | ⚠️ Toast | ❌ | — | ❌ |
| TwoFactorSetupScreen | ✅ Spinner | — | ✅ Inline | ❌ | — | ❌ |

### Appendix B: Accessibility Checklist

| Screen | Labels | Roles | Touch Targets | Font Scaling | RTL |
|--------|--------|-------|---------------|--------------|-----|
| InboxScreen | ✅ Partial | ✅ Partial | ✅ Mostly | ❌ | ❌ |
| ChatScreen | ✅ Partial | ✅ Partial | ✅ Mostly | ❌ | ❌ |
| MessageBubble | ✅ Yes | ❌ No | ✅ Yes | ❌ | ❌ |
| ComposerInput | ✅ Yes | ✅ Yes | ✅ Yes | ❌ | ❌ |
| SettingsScreen | ✅ Partial | ✅ Partial | ✅ Mostly | ❌ | ❌ |
| TwoFactorSetupScreen | ❌ Code input missing | ❌ | ✅ | ❌ | ❌ |

### Appendix C: Previously Identified Issues — Status

| Issue | Source | Status | Notes |
|-------|--------|--------|-------|
| PulseDot crash in InboxScreen | CHAT_QA_REPORT | ✅ Fixed | `PulseDot.tsx` restored or usage removed. |
| Attachment picker non-functional | CHAT_QA_REPORT | ❌ Still broken | Only toast shown, no message created. |
| Auto-scroll on send | CHAT_QA_REPORT | ✅ Fixed | `scrollToEnd` added after `pushMessage`. |
| Reply reference not rendered | CHAT_QA_REPORT | ✅ Fixed | `MessageBubble` now renders `replyTo`. |
| Existing reactions not tappable | CHAT_QA_REPORT | ✅ Fixed | `onReactionPress` now passed. |
| Composer single-line | CHAT_QA_REPORT | ✅ Fixed | `multiline` support added. |
| Context menu "Info" no-op | CHAT_QA_REPORT | ✅ Fixed | "Info" removed from `ACTIONS` array. |
| Scroll-to-bottom FAB overlap | CHAT_QA_REPORT | ⚠️ Partial | Still absolute positioned; low impact. |
| Fake settings data | SETTINGS_UX_AUDIT | ⚠️ Partial | Payment/Commerce fixed; **Addresses still "1 saved"**. |
| Loading skeletons | UX_RECOMMENDATIONS | ✅ Fixed | Added to Payments, Postage, AccountSettings. |
| Toggle consolidation | UX_RECOMMENDATIONS | ✅ Fixed | All settings toggles use `SettingsCell variant="toggle"`. |
| Linked accounts dead UI | UX_RECOMMENDATIONS | ✅ Fixed | Section removed entirely. |
| Search bar consolidation | UX_RECOMMENDATIONS | ✅ Fixed | `AppSearchBar` created and migrated. |
