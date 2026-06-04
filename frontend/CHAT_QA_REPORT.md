# Phase 1 — Chat QA Report

**Date:** 2026-06-04
**Audited Files:** 12 components/screens
**Total Issues Found:** 8
**Critical:** 1 | **High:** 3 | **Medium:** 3 | **Low:** 1

---

## Critical

### 1. Runtime Crash: InboxScreen imports deleted `PulseDot`
- **Issue:** `InboxScreen.tsx` imports and renders `PulseDot` from `components/chat/PulseDot.tsx`, which was deleted during consolidation.
- **Root Cause:** Deletion script removed `PulseDot.tsx` but the import and JSX usage in `InboxScreen.tsx` were not cleaned up.
- **Severity:** Critical — App will crash when navigating to Inbox.
- **Affected Files:** `src/screens/InboxScreen.tsx`
- **Fix:** Replace `<PulseDot size={8} color={Colors.brand} />` with an inline `<View>` dot.

---

## High

### 2. Attachment Picker Is Non-Functional
- **Issue:** Tapping gallery/camera in `AttachmentPickerSheet` obtains the media URI but never creates or sends a message containing the attachment. Only a toast is shown.
- **Root Cause:** `handleAttachmentSelect` in `ChatScreen.tsx` logs success but doesn't call `pushMessage()` or `appendToConversationStore()` with the image URI.
- **Severity:** High — Users cannot send photos/videos.
- **Affected Files:** `src/screens/ChatScreen.tsx`
- **Fix:** Create an `image` type message and push it to the conversation after media selection.

### 3. No Auto-Scroll on Send
- **Issue:** After the user sends a message, the message list does not scroll to the bottom. The new message is added off-screen.
- **Root Cause:** `sendMessage()` adds the message to state but never calls `scrollToEnd()` on the FlatList.
- **Severity:** High — Users must manually scroll after every send to see their message.
- **Affected Files:** `src/screens/ChatScreen.tsx`
- **Fix:** Call `listRef.current?.scrollToEnd({ animated: true })` after `pushMessage()`.

### 4. Reply Reference Never Rendered in Message Bubble
- **Issue:** When a user replies to a message, the outgoing message sets `replyToMessageId`, but `MessageBubble` does not render the quoted reply text above the message body.
- **Root Cause:** `MessageBubble` has no `replyTo` prop or reply UI. The `ReplyQuote` component is only shown in the composer, not in the message history.
- **Severity:** High — Replies are sent but appear as plain text; context is lost.
- **Affected Files:** `src/components/chat/MessageBubble.tsx`, `src/screens/ChatScreen.tsx`
- **Fix:** Add `replyTo` prop to `MessageBubble` and render a mini `ReplyIndicator` above the bubble text when present.

---

## Medium

### 5. Existing Reactions Are Not Tappable
- **Issue:** `MessageReactionsSummary` (shown below a bubble) accepts an `onPress` prop, but `MessageBubble` never passes one. Users cannot tap an existing reaction to add/remove their own.
- **Root Cause:** `MessageBubble` renders `<MessageReactionsSummary reactions={reactions} style={...} />` without `onPress`.
- **Severity:** Medium — Discoverability of reaction interaction is broken.
- **Affected Files:** `src/components/chat/MessageBubble.tsx`
- **Fix:** Pass `onPress={() => setReactingToMessage(msg)}` or equivalent to open the reaction bar.

### 6. Composer Input Is Single-Line Only
- **Issue:** The `ComposerInput` does not pass `multiline` to `AppInput`, so long messages never wrap and the input field does not grow vertically.
- **Root Cause:** `ComposerInput` never sets `multiline={true}` or `numberOfLines`.
- **Severity:** Medium — Poor UX for writing paragraphs.
- **Affected Files:** `src/components/chat/ComposerInput.tsx`
- **Fix:** Add `multiline` support to `AppInput` and use it in `ComposerInput`.

### 7. Context Menu "Info" Action Is a No-Op
- **Issue:** Tapping "Message Info" in the context menu does nothing. It falls through the `switch` statement with no feedback.
- **Root Cause:** `ChatScreen.tsx` `handleContextMenuAction` has no case for `'info'`.
- **Severity:** Medium — Confusing dead button.
- **Affected Files:** `src/screens/ChatScreen.tsx`
- **Fix:** Either implement a message-info modal or remove the action from the menu.

---

## Low

### 8. Scroll-to-Bottom FAB May Overlap Keyboard
- **Issue:** `ScrollToBottomFAB` is positioned absolutely outside `KeyboardAvoidingView`. When the keyboard is open, the FAB may float above the composer or be hidden behind the keyboard depending on platform.
- **Root Cause:** FAB is a sibling of `KeyboardAvoidingView`, not a child.
- **Severity:** Low — Visual glitch, not blocking.
- **Affected Files:** `src/screens/ChatScreen.tsx`
- **Fix:** Move FAB inside `KeyboardAvoidingView` or add `keyboardVerticalOffset` to account for composer height.

---

## Verdict

4 of 8 issues are user-blocking (Critical + High). The remaining 4 degrade UX but don't block core flows.

Recommended fix order: 1 → 3 → 2 → 4 → 7 → 5 → 6 → 8
