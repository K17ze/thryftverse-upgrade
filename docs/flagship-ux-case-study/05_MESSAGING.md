# Sector 5 — Messaging

## Product Purpose

Inbox, Chat, MessageRequests, and conversation management must feel like a premium messaging experience with clear read states, smooth media handling, and contextual actions.

## Current Strengths

- `InboxScreen` with conversation list, unread badges
- `ChatScreen` with message bubbles, media preview
- `MessageRequests` gate
- `ConversationInfo` with member management
- `ChatMediaPreview` for full-screen media
- Haptic feedback on message send

## Current Weaknesses

1. Message bubble styling varies between sender/receiver
2. Media thumbnails in chat could be larger
3. No typing indicator
4. No message reactions UI (store has reactions but UI is basic)
5. Empty states are functional but not premium

## Root Causes

1. Message bubble styles inline rather than shared component
2. Media preview lacks zoom/pan gesture
3. Typing indicator requires websocket state

## Changes in This Phase

- No messaging changes in UI-21P.2 — focused on Profile, Posters, Settings, Global

## Priority Score

| Screen | Current /10 | Primary Problem | Root Cause | Upgrade Now | Future Upgrade |
| ------ | ----------- | --------------- | ---------- | ----------- | -------------- |
| Inbox | 7 | Good list | — | — | Swipe actions |
| Chat | 6 | Basic bubbles | Inline styles | — | Shared bubble primitive |
| MessageRequests | 6 | Functional | — | — | Preview cards |
| MediaPreview | 7 | Good full-screen | — | — | Zoom/pan gestures |

## Runtime Verification

- No changes made in this phase
