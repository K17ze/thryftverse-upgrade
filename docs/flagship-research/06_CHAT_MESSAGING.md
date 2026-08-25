# 06 — Chat & Messaging: Flagship Research Report

**Department:** Chat, group chat, inbox, message requests, chat media preview, archived/muted conversations, conversation info
**Date:** August 2026
**Charter references:** AGENTS.md §4 (Push to Maximum Quality), §11 (Truthful UI), §15 (Media Rules), §17 (Motion and Interaction)

---

## 1. 2026 Competitor Benchmark

The messaging landscape in 2026 has consolidated around a small set of interaction primitives that users now expect as baseline. The benchmark below distils the design thinking behind the three surfaces ThryftVerse is most often compared against — Snapchat chat, Instagram DMs, and WhatsApp — and identifies where each excels and where ThryftVerse must exceed them.

### Snapchat Chat (2026)

Snapchat's "Simple Snapchat" redesign (announced late 2024, fully rolled out 2025–2026) collapsed the app to three tabs, placing **all conversations in one place** on the left rail with Stories pinned to the top of the chat list. The design thesis is intimacy and speed: the camera is always one swipe away, and chat is the gravitational centre, not a peripheral tab. Key 2026 chat characteristics:

- **Ephemeral-first, persistent-available.** Messages default to persistent, but vanish mode and disappearing Snaps remain one tap away. The visual language communicates ephemerality through a distinct bubble treatment (no tail, softer fill) versus persistent text (tailed, standard fill).
- **Presence via Bitmoji and Story activity.** Snapchat does not use a green-dot online indicator. Instead, presence is communicated through Bitmoji avatars that show the friend's current activity (listening to music, at a location, in a Story). This is a softer, more contextual presence model than WhatsApp's binary online/offline.
- **Chat Preview notifications.** A sender can long-press an unopened message and trigger a "Notify with Chat Preview" — a second notification that includes the message text. This is a deliberate re-engagement mechanic for time-sensitive messages, and it respects the "unopened" state (the preview does not mark the chat as read).
- **Topic Chats (2025–2026).** Snapchat introduced public, moderated "Topic Chats" that bring private-chat features (reactions, replies, media) into public conversations. The key design lesson: the same bubble and composer primitives scale from 1:1 to public, with the only visual difference being the sender-label prominence and moderation affordances.
- **Perplexity integration in chats.** AI is embedded as a participant, not a separate surface. The AI response appears as a bubble with a distinct visual identity (subtle tint, AI badge), and the user can reply to it, react to it, or dismiss it — the same affordances as any message.

### Instagram DMs (2026)

Instagram's DM surface received the most investment of any Meta product surface in 2025–2026. The 2025 feature drop (message translation across 99 languages, music sharing with a 30-second vinyl preview, scheduled messages up to 29 days ahead, pinned messages, group-chat QR codes) was followed by a 2026 inbox rebuild that added AI summaries, broadcast channels, and Comment-to-DM automation. Key design characteristics:

- **Inbox as a filtered workspace, not a flat list.** Instagram's 2026 inbox supports filters: Unread, Unanswered, Story replies, Followers, Verified users, and custom folders. The filter rail is compact (segmented pills) and the count badges are per-filter, not global. The inbox is no longer a single chronological list — it is a triage surface.
- **Notes at the top of the inbox.** Notes (60-character text/emoji posts that last 24 hours) sit above the conversation list. They are a lightweight presence/status mechanic: a friend posts a Note, and replies land in DMs. This is Instagram's answer to "how do I know what my friends are up to without opening a chat?"
- **Pinned conversations (up to 3) and pinned messages (up to 3 per chat).** Pinning is a first-class inbox action, not a hidden long-press menu item. Pinned threads rise to the top with a subtle pin glyph, and pinned messages within a chat get a dedicated "Pinned" section accessible from the chat header.
- **Message reactions (tapbacks) are inline and immediate.** A long-press on any message produces a compact reaction bar that floats over the message. Reactions appear as small badges at the top-outer corner of the bubble. The interaction is under 200ms from press to reaction, with a spring-scale pop on the reaction badge.
- **Scheduled messages and message translation are composer-level features.** Long-pressing the send button reveals a date-time picker for scheduling. Translation is a per-message action (long-press → Translate) that renders the translated text inline below the original, preserving the original as the primary content.
- **Vanish mode as a swipe gesture.** Swiping up in a chat toggles vanish mode — a full-screen dark overlay with disappearing messages. The gesture is the toggle, not a settings menu. This is a model of interaction economy.

### WhatsApp (2026)

WhatsApp remains the reference for message-state correctness and real-time presence. Its 2026 updates refined what was already industry-leading:

- **Green-dot online indicator on profile photos.** WhatsApp rolled out a green dot on contact profile photos in the chat info screen (and soon the Contacts hub) to communicate real-time availability at a glance. The dot respects privacy settings — contacts who hide their last-seen do not appear online.
- **Message bubble fade-in + scale animation.** WhatsApp reintroduced message animations on iOS (beta 26.24.10.70) and Android: new bubbles fade in while slightly scaling up as they settle. Critically, this is a **product-level setting** (Settings > Chats > Animations > Messages) that respects the system Reduce Motion preference. The animation is 150–250ms, not decorative — it communicates "a new message arrived" without a separate notification banner.
- **Typing indicator architecture.** WhatsApp's typing indicator is ephemeral, debounced (first keystroke sends immediately, subsequent keystrokes reset a 3-second timer, idle timeout sends `typing_stop`), and server-side TTL'd (5-second Redis key as a safety net). The indicator appears in the chat header subtitle, not as a separate row. If it arrives late, it is dropped — a late typing indicator is worse than no indicator.
- **Read receipts as double-check marks.** Single grey check = sent to server, double grey = delivered, double blue = read. This is the universal grammar that iMessage, Telegram, and Instagram all follow with variations. WhatsApp's 2026 refinement: the blue read colour is slightly softer, and the checks are 13pt (not 16pt) to stay visually quiet.

### Benchmark synthesis for ThryftVerse

| Dimension | Snapchat | Instagram | WhatsApp | ThryftVerse target |
|---|---|---|---|---|
| Bubble shape | Soft, no tail for ephemeral; tailed for persistent | Rounded, tailed, consistent radius | Rounded, tailed, fade-in animation | Consistent radius, cluster-aware tails, fade-in on new |
| Presence | Bitmoji activity context | Notes (24h text status) | Green dot on profile photo | Green dot + last-active text, privacy-respecting |
| Typing indicator | Header subtitle | Header subtitle | Header subtitle, ephemeral architecture | Header subtitle, debounced, server-TTL'd |
| Reactions | Inline tapbacks, spring pop | Inline tapbacks, <200ms | Inline tapbacks, 13pt badges | Inline tapbacks, spring-scale pop, 6 default + extended |
| Inbox structure | Single list, Stories on top | Filtered workspace, Notes above | Single list, pinned to top | Filtered rail + pinned + commerce context |
| Media in chat | Camera-first, Snaps | Sticker tray, music, disappearing | Attachment picker, camera, voice | Attachment picker + camera + voice + commerce cards |
| AI in chat | Perplexity as participant | AI summaries in inbox | N/A | Agents as participants, truthfully labelled |
| Message states | Opened/unopened | Sent/delivered/read | Sent/delivered/read (checks) | Sending/sent/delivered/read + failed + uploading |

---

## 2. Psychology & Principles

Messaging is the most intimate surface in a marketplace app. Every design decision must serve the user's emotional state: am I being responded to? Is this person real? Is my message getting through? Is this conversation safe? The principles below are derived from the 2026 competitor research and from the ThryftVerse charter (AGENTS.md §4, §11, §17).

### Intimacy and conversational momentum

A chat between a buyer and seller is not a transaction log — it is a negotiation, a relationship, and a trust-building exercise. The user's emotional state shifts from "is this person responsive?" to "are we making progress on this deal?" to "can I trust them to ship?" The UI must reinforce momentum at every step:

- **Immediate send confirmation.** The bubble must appear in the list within one frame of the tap, with a "sending" state (clock icon) that transitions to "sent" (single check) within 500ms. Any delay creates anxiety and double-tapping.
- **Typing indicators as momentum signals.** Seeing "typing…" from the other party is the single most powerful trust signal in a negotiation. It means the person is engaged, thinking, and about to respond. Its absence is interpreted as rejection or disinterest. The indicator must be real (not fabricated), ephemeral (not persisted), and fast (sub-100ms propagation).
- **Conversational momentum preservation.** When the user returns to a chat after navigating away, the scroll position, draft text, and reply context must be preserved. Losing a half-typed message or a reply quote is a momentum-killer that makes the app feel unreliable.

### Presence and availability

Presence answers "is this person available to respond right now?" In a marketplace, this is commercially critical: a buyer who sees the seller is online will make an offer immediately; a buyer who sees "last active 3 hours ago" will wait. The 2026 consensus across WhatsApp and Instagram is:

- **Binary online indicator (green dot) for real-time availability.** This is the highest-signal, lowest-noise presence mechanic. It requires a privacy setting (users can hide their online status).
- **Last-active text as a fallback.** "Active 12m ago" is more informative than no presence at all, and it degrades gracefully when the user hides real-time presence.
- **Presence is never fabricated.** AGENTS.md §11 is explicit: never fabricate presence. If the backend does not provide real-time presence, the UI must show nothing — not a green dot, not "online", not "active now". A missing presence signal is truthful; a fake one is a lie that erodes trust.

### Ephemeral vs persistent messages

Marketplace chats are persistent by default — the conversation is a record of the transaction. But ephemeral messages have a place: a buyer might send a disappearing photo of an item's condition, or a seller might share a time-limited discount code. The 2026 design consensus:

- **Ephemeral is a mode, not a default.** The user explicitly enters ephemeral mode (swipe-up gesture or a mode toggle), the UI changes to communicate ephemerality (darker background, distinct bubble treatment), and the user is warned before sending.
- **Ephemeral messages are visually distinct.** A different bubble fill, no tail, and a timer icon communicate "this will disappear" without requiring the user to read a tooltip.
- **Persistence is the default and is never ambiguous.** Regular messages have a consistent bubble treatment, and the user never has to wonder "will this message disappear?" The read-receipt checks confirm persistence.

### Typing indicators and reaction micro-interactions

These are the two micro-interactions that distinguish a premium chat from a prototype:

- **Typing indicator.** Three dots, staggered opacity/scale animation, 600ms cycle. Must be ephemeral (server TTL'd), debounced (not per-keystroke), and dismissed the moment a message arrives. A typing indicator that persists after the message has arrived is a bug, not a feature.
- **Reaction micro-interactions.** A reaction must appear within 200ms of the tap, with a spring-scale pop (0.8 → 1.0, spring physics). The reaction badge sits at the top-outer corner of the bubble. The user must be able to un-react by tapping the same emoji. Reactions are persisted (they are not ephemeral) and must sync across devices.

### Bot truthfulness and AI participant design

ThryftVerse deploys AI agents into chats (Shop Scout, Deal Maker, Style Muse, Listing Coach, Safety Shield). These agents are currently in demo mode (`CHAT_AGENTS_DEMO_MODE = __DEV__`, `chatAgentsApi.ts:36`). The 2026 design principles for AI participants:

- **AI is a participant, not a separate surface.** The AI response appears as a bubble in the conversation, with a distinct visual identity (subtle tint, AI badge, agent avatar glyph). The user can reply to it, react to it, or ignore it.
- **Demo mode is always labelled.** The `ChatAgentPicker` already includes a "Demo mode — agents suggest mock replies" footer (`ChatAgentPicker.tsx:86-91`). This must never be removed until the backend is real. A user who believes an AI response is a real intelligent reply is being deceived.
- **AI suggestions are drafts, not auto-sends.** The current architecture correctly surfaces agent responses as drafts that the user must confirm (`MessageBubble.tsx:44-54`, `isDraft` prop, `onConfirmDraft` callback). This is the correct pattern: the user remains the author of every message they send.
- **AI must never fabricate marketplace data.** An agent must not claim "I found 3 similar listings" unless it actually queried the listing database. In demo mode, the agent must say "I can search for items like this" (which `chatAgentsApi.ts:469` does correctly), not "Here are 3 similar listings" (which would be a fabrication).

---

## 3. Current ThryftVerse Audit

The audit below is based on a full read of every chat screen and the 30 components in `frontend/src/components/chat/`. Each defect is referenced with file and line numbers.

### 3.1 AI-slop bot replies (critical)

**Defect:** The chat agent system generates deterministic, context-free mock responses that are presented as AI output. In `chatAgentsApi.ts:441-508`, `getAgentResponse()` returns hardcoded strings based on simple keyword matching:

- Shopping assistant: "I can search for items like this. Try telling me your budget and preferred size." (`chatAgentsApi.ts:469`)
- Negotiator: "Based on recent sold comps, a fair opening offer is around 85% of list. Want me to draft one?" (`chatAgentsApi.ts:474`) — this fabricates market data ("recent sold comps") that does not exist.
- Style advisor: "This would layer nicely with neutral basics. I can pull a moodboard pairing if you like." (`chatAgentsApi.ts:479`) — fabricates a moodboard capability.

The `GroupChatScreen.tsx:191-209` goes further: after the user sends a message, it inserts an agent response into the message list with a 500ms `setTimeout`, making it appear as though the AI is "thinking" and responding in real-time. The response is a deterministic mock, not a real AI generation. This is the classic AI-slop pattern: the UI performs intelligence, but the backend is a switch statement.

**Impact:** Users in `__DEV__` mode (which is the current build) see AI responses that appear authoritative but are fabricated. The negotiator's "85% of list" claim is presented as data-driven advice, but it is a hardcoded string. This violates AGENTS.md §11 (Truthful UI) at a fundamental level — the UI is fabricating expertise.

**Mitigation already present:** The `ChatAgentPicker` does include a "Demo mode" footer (`ChatAgentPicker.tsx:86-91`), and `chatAgentsApi.ts:36` correctly gates demo mode on `__DEV__`. The `MessageBubble` includes an `isAgent` visual distinction (tinted bubble, AI badge, `MessageBubble.tsx:92-99`). These are good. But the response content itself is the problem — the negotiator should not claim to have analysed "recent sold comps" in demo mode.

### 3.2 Missing presence and typing infrastructure (critical)

**Defect:** There is no real-time presence layer. The `ChatScreen.tsx` has an `isTyping` state variable (`ChatScreen.tsx:668`), but it is set to `false` on conversation change (`ChatScreen.tsx:800`) and is never set to `true` by any real-time event. The `TypingIndicator` component (`TypingIndicator.tsx`) is well-built (staggered dot animation, motion-config-aware), but it is only rendered when `isTyping` is true (`ChatScreen.tsx:1891-1896`), which is never in practice.

The `ChatTopBar` (`ChatTopBar.tsx:160-162`) shows a `subtitle` prop, but this is populated with static strings like "Direct message" or member counts — never "typing…" or "online". The `InboxConversationRow` has an `isTyping` prop (`InboxConversationRow.tsx:31`) with a pulsing "typing..." preview text (`InboxConversationRow.tsx:150-156`), but this prop is never wired to a real-time event in `InboxScreen.tsx`.

**Impact:** The user has no way to know if the other party is online, typing, or away. In a marketplace, this is a commercial disadvantage: buyers cannot gauge seller responsiveness, and sellers cannot prioritise active buyers. The typing indicator UI exists but is dead code.

### 3.3 Weak bubble motion and missing enter animations (moderate)

**Defect:** The `MessageBubble` component (`MessageBubble.tsx`) has well-designed cluster-aware radius logic (lines 106-127, "WhatsApp 2026 style" comment), but there is no enter animation on new messages. Bubbles pop into existence instantly. WhatsApp's 2026 update specifically reintroduced fade-in + scale-up on new bubbles (`WABetaInfo`, beta 26.24.10.70), and this is now the baseline expectation.

The `ChatScreen` does call `scheduleScrollToEnd` on new messages, but the bubble itself has no `entering` animation. In Reanimated terms, there is no `entering` prop on the bubble `View`. This makes the chat feel static and mechanical — each new message appears with a visual "jump" rather than a smooth settle.

**Impact:** The chat feels less premium than WhatsApp, iMessage, and Telegram, all of which have bubble enter animations in 2026. This is a perceptual quality gap, not a functional bug.

### 3.4 Dead media features and incomplete media states (moderate)

**Defect:** The `ChatMediaPreviewScreen` (`ChatMediaPreviewScreen.tsx`) is a single-media viewer with a fixed `mediaSize` of `{ width, height: height * 0.72 }` (line 26). It does not support:
- **Multi-media swipe** (swiping left/right through multiple images in a single message, as Instagram and WhatsApp do).
- **Pin-to-zoom** (the `CachedImage` uses `contentFit="contain"` but there is no gesture handler for pinch-zoom or pan).
- **Video scrubbing** (the `Video` component uses `useNativeControls` which provides a basic scrubber, but there is no seek-to-time from the message context).

The `VoiceMessageRecorder` (`VoiceMessageRecorder.tsx`) generates a fake URI: `const uri = \`voice://${makeStableId('msg')}\`;` (line 218). This URI is not a real audio file — it is a placeholder scheme. The `VoiceMessageBubble` component receives this URI and renders a waveform, but there is no actual audio to play. This is a fabricated media state that violates AGENTS.md §15 (Media Rules): "Do not fabricate upload success. Do not treat temporary local URIs as delivered remote media."

The `AttachmentReviewSheet` and `AttachmentPickerSheet` exist but were not deeply audited — the attachment flow uses an optimistic local preview → upload → remote URL pattern, which is correct per §15.

**Impact:** The media preview experience is below 2026 baseline. The voice message feature is non-functional — it produces a fake URI that cannot be played back, and the recipient would see a waveform with no audio.

### 3.5 Card-on-card inbox rows (moderate)

**Defect:** The `InboxScreen` (`InboxScreen.tsx`) renders conversation rows via `InboxConversationRow` (good — flat, hairline-separated, no card), but the **message requests** section renders each request as a card-on-card composition: `requestRowAccent` (a left-bordered tinted card, `InboxScreen.tsx:395-410`) containing `requestRowInner` which itself contains avatar, text, listing context card, and action buttons. The listing context (`ListingContextThumbnail` + text) is a nested card within the request card.

The `MessageRequestsScreen` (`MessageRequestsScreen.tsx`) has the same pattern: each request is a `requestRow` (lines 439-443) with `paddingVertical: Space.md` and `paddingHorizontal: Space.sm`, containing a `listingCard` (lines 461-470) which is a `backgroundColor: colors.surfaceAlt` card with `borderRadius: Radius.md` and a hairline border — a card inside a card.

This violates AGENTS.md §4: "No card-on-card composition. A nested surface requires a distinct interaction or state boundary. Otherwise flatten it." The listing context inside a request row does not have a distinct interaction boundary — it is informational, not tappable separately from the row.

**Impact:** The message requests screen looks assembled rather than authored. The nested cards create visual noise (multiple rounded rectangles, multiple borders) that fails the thumbnail test.

### 3.6 Missing states and incomplete state coverage (moderate)

**Defect:** Several chat screens are missing critical states:

- **`GroupChatScreen.tsx`** has a loading state (line 327-334, `ActivityIndicator` + "Loading conversation…") and an error state (line 336-360), but the loading state is a **generic centred spinner**, not a skeleton that resembles the final layout. AGENTS.md §14: "Skeletons should resemble the final layout. Do not use a generic centred spinner for every state."
- **`MutedConversationsScreen.tsx`** (76 lines total) has no loading state at all — it renders conversations directly from the store. If the store is empty because conversations haven't loaded yet (not because there are genuinely no muted conversations), the empty state is shown incorrectly.
- **`ArchivedConversationsScreen.tsx`** has the same issue — no loading state, direct store read.
- **`ChatScreen.tsx`** has a `SkeletonChatLoader` (imported, line 87) which is good, but the `GroupChatScreen` does not use it — it uses a plain `ActivityIndicator`.
- **`ChatMediaPreviewScreen.tsx`** has an error state ("Media unavailable", line 33-51) but no loading state for the image — the `CachedImage` has a `transition={200}` but no skeleton or placeholder while loading.

### 3.7 Conversation info screens — flat but incomplete (minor)

**Defect:** `ConversationInfoScreen.tsx` and `GroupChatInfoScreen.tsx` are well-structured (flat `ChatInfoSection` + `ChatInfoRow` primitives, no card-on-card). However:

- `ConversationInfoScreen.tsx:76` computes `handle` as `@${counterpartyId.slice(0, 12)}` — this is a truncated internal ID, not a real username. It violates AGENTS.md §11: "avoid exposing internal IDs." The handle should be the participant's actual `username` from `participantProfiles`.
- `GroupChatInfoScreen.tsx:82-83` calls `deleteConversationOnApi(conversationId)` for "Leave group" — but this deletes the entire conversation server-side, not just the user's membership. The `leaveGroupOnApi` function exists (imported in `GroupChatScreen.tsx:58`) but is not used in the info screen. This is a bug: "Leave group" performs "Delete conversation" instead.
- Neither info screen shows presence (online/last-active) for the counterparty or group members, because the presence layer does not exist (see §3.2).

### 3.8 Inbox search and filter discoverability (minor)

**Defect:** `InboxScreen.tsx` hides search behind an icon (`searchVisible` state, line 91) and filters behind a `filterExpanded` toggle (line 94). The `MessagingSegmentRail` provides primary segments (All, Buying, Selling) but the secondary filters (Unread, Archived, Groups, Requests) are behind a second tap. Instagram's 2026 inbox shows filter pills directly in the first viewport. ThryftVerse's inbox requires two taps to reach "Unread" — the most common triage filter.

---

## 4. Micro Improvements

These are targeted, low-risk changes that can be made within the existing component architecture without re-platforming.

### M1. Wire typing indicator to a real-time event source

The `TypingIndicator` component and the `isTyping` state in `ChatScreen.tsx:668` already exist. The missing piece is a real-time event source. In the interim (before a WebSocket presence layer is built), wire `isTyping` to the agent response path: when `getAgentResponse()` is called in `GroupChatScreen.tsx:192`, set `isTyping = true` before the `setTimeout`, and `false` when the agent message is inserted. This makes the typing indicator truthful (it reflects real processing) rather than dead code.

**Files:** `ChatScreen.tsx`, `GroupChatScreen.tsx`, `hooks/chat.ts` (the `useConversationMessages` hook)

### M2. Add bubble enter animation

Add a Reanimated `entering` animation to the `MessageBubble` root `View`: a `FadeIn` + `SlideInDown` (spring, 250ms) for new messages, with `useReducedMotion` fallback to no animation. This matches WhatsApp's 2026 bubble animation. The animation should only apply to the newest message(s), not re-animate the entire list on mount (AGENTS.md §16: "Do not animate every historical item on initial load").

**Files:** `MessageBubble.tsx` (wrap root in `Animated.View` with `entering`), `ChatScreen.tsx` (pass an `isNew` flag or use a `useAnimatedStyle` keyed on message index)

### M3. Fix conversation info handle to use real username

In `ConversationInfoScreen.tsx:76`, replace `@${counterpartyId.slice(0, 12)}` with the actual username from `conversation.participantProfiles`. The profile is already looked up on line 73-74 for the avatar; the username is available at `counterpartyProfile?.username`.

**Files:** `ConversationInfoScreen.tsx`

### M4. Fix "Leave group" to call `leaveGroupOnApi` not `deleteConversationOnApi`

In `GroupChatInfoScreen.tsx:82`, replace `deleteConversationOnApi(conversationId)` with `leaveGroupOnApi(conversationId, currentUser.id)`. The `leaveGroupOnApi` is already imported in `GroupChatScreen.tsx:58` but not in the info screen. Add the import and use the correct API.

**Files:** `GroupChatInfoScreen.tsx`

### M5. Flatten message request rows — remove nested listing card

In `MessageRequestsScreen.tsx:213-230`, replace the `listingCard` (a nested `surfaceAlt` card with border and radius) with a flat inline row: listing thumbnail + title + price on a single hairline-separated row, no nested container. The `requestRow` itself is the only surface; the listing context is a row within it, not a card within a card.

**Files:** `MessageRequestsScreen.tsx`, `InboxScreen.tsx` (same pattern in the inline request rendering)

### M6. Replace generic spinner in GroupChatScreen with SkeletonChatLoader

`GroupChatScreen.tsx:327-334` uses a centred `ActivityIndicator`. Replace with the existing `SkeletonChatLoader` component (already imported in `ChatScreen.tsx:87`). This satisfies AGENTS.md §14: "Skeletons should resemble the final layout."

**Files:** `GroupChatScreen.tsx`

### M7. Add presence dot to ChatTopBar avatar (when backend provides it)

Add an optional `isOnline` prop to `ChatTopBar` (`ChatTopBar.tsx:10`). When true, render a 10pt green dot at the bottom-right of the avatar (line 138-146). Wire this to a `presence` field on the conversation/participant profile. Until the backend provides real-time presence, this prop is `undefined` and no dot is rendered — truthful per §11.

**Files:** `ChatTopBar.tsx`, `ChatScreen.tsx` (pass `isOnline` from partner profile)

### M8. Add reduced-motion fallback to typing indicator

The `TypingIndicator` already checks `useMotionConfig().isEnabled` (`TypingIndicator.tsx:111`). When motion is disabled, the dots are set to `OPACITY_MAX` and `SCALE_MAX` statically (lines 46-48). This is correct. Verify that the `InboxConversationRow` typing animation also respects `useMotionConfig` — it does (`InboxConversationRow.tsx:69-86`). No change needed; this is a confirmation that the existing implementation is correct.

### M9. Add reaction spring-scale pop

In `MessageBubble.tsx:303-312`, the reactions are rendered as static `Pressable` chips. Add a Reanimated `entering` animation (`PopIn` spring, 200ms) to each `reactionChip` so reactions appear with a spring-scale pop when first added. This matches iMessage's tapback animation.

**Files:** `MessageBubble.tsx`

### M10. Fix voice message fake URI

In `VoiceMessageRecorder.tsx:218`, replace `const uri = \`voice://${makeStableId('msg')}\`;` with a real audio recording URI from `expo-av` or `expo-audio`. If audio recording is not yet implemented, the voice message feature should be **honestly disabled** (the mic button should show a truthful disabled state or be removed) per AGENTS.md §11. Do not ship a voice recorder that produces unplayable URIs.

**Files:** `VoiceMessageRecorder.tsx`, `ChatComposerBar.tsx` (conditionally hide mic button until audio is real)

---

## 5. Macro Improvements

These are architectural changes that require cross-layer coordination (contracts → services → hooks → UI) per AGENTS.md §2.

### MA1. Real-time presence and typing layer

**Scope:** Build a WebSocket-based presence and typing indicator layer.

**Architecture:**
- **Backend:** A presence service that tracks user online/offline state via WebSocket connections. Typing events are ephemeral (Redis TTL 5s), not persisted. The service publishes presence updates and typing events to subscribed clients.
- **API contract:** `GET /presence/:userId` → `{ isOnline: boolean, lastActiveAt: ISO string }`. WebSocket event: `{ type: 'typing', conversationId, userId, state: 'start' | 'stop' }`.
- **Frontend hook:** `usePresence(userId)` → `{ isOnline, lastActiveText }`. `useTypingIndicator(conversationId)` → `{ isTyping, typingUserId }`.
- **UI wiring:** `ChatTopBar` shows green dot + "typing…" subtitle. `InboxConversationRow` shows "typing…" preview text (already supported via `isTyping` prop). `ConversationInfoScreen` shows "Active now" / "Active 12m ago".

**Privacy:** Respect a `presenceVisibility` setting (everyone / contacts / nobody). When hidden, the user's presence is not broadcast, and they cannot see others' presence (reciprocal, like WhatsApp).

**Rollout:** Phase 1: presence only (online/offline + last-active). Phase 2: typing indicators. Phase 3: group typing (multiple typers, "Alice and Bob are typing…").

### MA2. Chat media handling overhaul

**Scope:** Bring the media preview and attachment flow to 2026 baseline.

**Sub-features:**
- **Multi-image messages:** A single message can contain multiple images, displayed as a grid in the bubble and swipeable in the preview. Requires a `mediaUris: string[]` field on the message contract (currently `mediaUri: string` is singular, `ChatScreen.tsx:630`).
- **Pinch-to-zoom in preview:** Add a `Gesture.Pinch()` handler to `ChatMediaPreviewScreen` that scales the image from 1x to 4x, with pan-to-zoom. Use `react-native-gesture-handler` + Reanimated.
- **Video scrubbing with thumbnail preview:** The `Video` component should show a scrubber with thumbnail previews at key timestamps. This requires backend support for generating video thumbnails (a `videoThumbnails: string[]` field on the media contract).
- **Real voice messages:** Integrate `expo-av` or `expo-audio` for recording, uploading, and playback. The `VoiceMessageRecorder` produces a real audio file URI, uploads it via `uploadMedia()`, and the `VoiceMessageBubble` plays it back from the remote URL.

### MA3. Bot truthfulness and real AI integration

**Scope:** Replace the demo-mode `chatAgentsApi.ts` with a real AI backend, and enforce truthfulness in the interim.

**Interim (before real AI):**
- Remove all fabricated expertise from agent responses. The negotiator must not claim "based on recent sold comps" (`chatAgentsApi.ts:474`). Replace with: "I can help you think about your offer. What price were you considering?"
- The shopping assistant must not claim "Here are a few similar listings I found" (`chatAgentsApi.ts:468`). Replace with: "I can search for similar items. Tell me your budget and preferred size."
- The style advisor must not claim "I can pull a moodboard pairing" (`chatAgentsApi.ts:479`). Replace with: "I can suggest pairing ideas. What's your style?"

**Real AI integration:**
- Backend: An agent runtime that accepts a conversation context + agent type + user message, calls an LLM with a system prompt scoped to the agent's capabilities, and returns a response with confidence and suggested replies.
- The `executeToolCall` and `isFinancialCapability` infrastructure already exists in `platform/agents/agentRuntime` (imported in `chatAgentsApi.ts:26-29`). Wire `getAgentResponse()` to call this runtime instead of the hardcoded switch statement.
- The agent must only claim capabilities it actually has. If the shopping assistant cannot search listings (no tool call available), it must not offer to search. The `isFinancialCapability` check (`chatAgentsApi.ts:28`) already gates financial actions — extend this pattern to all tool calls.

### MA4. Inbox as a filtered triage workspace

**Scope:** Evolve the inbox from a flat list to a filtered triage surface, inspired by Instagram's 2026 inbox.

**Changes:**
- **Surface secondary filters in the first viewport.** Move "Unread" from behind `filterExpanded` to a permanent pill in the `MessagingSegmentRail`. "Requests" with a count badge should also be visible if there are pending requests.
- **Add a "Needs action" filter** for conversations with pending offers or unread transaction updates. This is commerce-specific and differentiates ThryftVerse from generic messaging apps.
- **Pinned conversations section.** Pinned conversations (already supported via `toggleConversationPinned`, `InboxScreen.tsx:74`) should render in a distinct pinned section at the top, not just sorted first in the flat list. A small "Pinned" eyebrow label separates the section.
- **Typing indicator in inbox rows.** Wire the `isTyping` prop on `InboxConversationRow` to the real-time typing layer (MA1). When a conversation has an active typer, the preview text changes to "typing…" with the pulsing animation (already implemented in `InboxConversationRow.tsx:150-156`).

### MA5. Group chat parity with 1:1 chat

**Scope:** The `GroupChatScreen` (`GroupChatScreen.tsx`) is significantly less capable than `ChatScreen` (`ChatScreen.tsx`). It lacks: message reactions, reply quotes, context menus, search-in-chat, link previews, safety warnings, offer cards, transaction strips, selection mode, undo-delete, and the composer stack resolver.

**Changes:**
- Refactor `GroupChatScreen` to use the same `useConversationMessages` and `useConversationComposer` hooks that `ChatScreen` uses (lines 706-762). This requires generalising the hooks to accept a `conversationType: 'dm' | 'group'` parameter.
- Add group-specific features: sender labels for each message (already present, `GroupChatScreen.tsx:257`), member mention autocomplete, and group-typing indicators ("Alice is typing…" vs "typing…").
- Replace the `GroupInfoModal` (a `Modal`-based sheet, `GroupChatScreen.tsx:483`) with navigation to `GroupChatInfoScreen` (which already exists and is more complete). The modal is a duplicate of the info screen and should be removed.

---

## 6. Flagship Acceptance Criteria

Each criterion is binary and verifiable on the rendered device.

### AC1. Truthful AI participants
- [ ] No AI agent response contains fabricated data, fabricated expertise, or fabricated marketplace information.
- [ ] Every AI agent response in demo mode is accompanied by a visible "Demo mode" indicator (in the agent picker, and/or in the chat surface).
- [ ] Agent suggestions are presented as drafts that the user must explicitly confirm before sending. No auto-send.
- [ ] When `CHAT_AGENTS_DEMO_MODE` is false (production), agent functions return honest "unavailable" states, not mock data.

### AC2. Real-time presence and typing
- [ ] When a conversation partner is online, a green dot appears on their avatar in `ChatTopBar` and `ConversationInfoScreen`.
- [ ] When a partner is typing, the `ChatTopBar` subtitle changes to "typing…" and the `TypingIndicator` is rendered above the composer.
- [ ] When a conversation in the inbox has an active typer, the `InboxConversationRow` preview text changes to "typing…" with the pulsing animation.
- [ ] Presence and typing respect the user's privacy setting (`presenceVisibility`). When set to "nobody", no presence is broadcast and no presence is shown to the user.
- [ ] Typing indicators are dismissed within 500ms of a message arriving. No stale typing indicators.

### AC3. Bubble and motion quality
- [ ] New message bubbles fade in + scale up (spring, 200–300ms) as they enter the conversation.
- [ ] Bubble enter animation respects `useReducedMotion` — no animation when motion is disabled.
- [ ] Historical messages do not re-animate on screen mount or scroll.
- [ ] Reaction badges pop in with a spring-scale animation (200ms) when first added.
- [ ] Cluster-aware bubble radii are correct: first-in-cluster has a tail-side small radius, last-in-cluster has the opposite small radius, middle messages have uniform radius.

### AC4. Media handling
- [ ] Chat media preview supports pinch-to-zoom (1x–4x) and pan-to-zoom on images.
- [ ] Multi-image messages render as a grid in the bubble and are swipeable in the preview.
- [ ] Voice messages produce real, playable audio URIs — no `voice://` placeholder URIs.
- [ ] Video preview supports scrubbing with native controls and respects safe areas.
- [ ] Media upload states (uploading, failed, sent) are visually distinct on the bubble. Failed uploads show a retry control.

### AC5. Inbox triage
- [ ] "Unread" filter is visible in the first viewport (not behind a secondary expansion).
- [ ] Pinned conversations render in a distinct section at the top with a "Pinned" eyebrow.
- [ ] Message requests show a count badge on the inbox when there are pending requests.
- [ ] No card-on-card composition in message request rows. Listing context is a flat inline row, not a nested card.
- [ ] Inbox rows show typing indicator, unread dot, muted glyph, and pinned glyph without visual clutter.

### AC6. State completeness
- [ ] `GroupChatScreen` loading state uses `SkeletonChatLoader`, not a generic spinner.
- [ ] `ArchivedConversationsScreen` and `MutedConversationsScreen` have a loading state that distinguishes "loading" from "empty".
- [ ] `ChatMediaPreviewScreen` has a loading state (skeleton or blur-up) while the image loads.
- [ ] All chat screens have offline, error, and retry states.

### AC7. Conversation info correctness
- [ ] `ConversationInfoScreen` shows the participant's real `@username`, not a truncated internal ID.
- [ ] `GroupChatInfoScreen` "Leave group" calls `leaveGroupOnApi`, not `deleteConversationOnApi`.
- [ ] Both info screens show presence (online/last-active) when available.
- [ ] Both info screens show shared media count, links count, and offers count (already present in `ConversationInfoScreen.tsx:77-80`).

---

## 7. Priority & Sequencing

### Phase 1 — Truthfulness and correctness (Week 1–2)
**Goal:** Eliminate all §11 violations and obvious bugs.

1. **M3** — Fix conversation info handle to use real username (15 min)
2. **M4** — Fix "Leave group" API call (30 min)
3. **M10** — Fix or honestly disable voice message fake URI (1 day — either integrate `expo-av` or hide the mic button)
4. **MA3 interim** — Remove fabricated expertise from all agent responses in `chatAgentsApi.ts` (2 hours — replace 5 hardcoded strings with honest alternatives)
5. **M5** — Flatten message request rows (2 hours)

### Phase 2 — Motion and visual quality (Week 2–3)
**Goal:** Bring bubble and motion quality to 2026 baseline.

6. **M2** — Add bubble enter animation (half day)
7. **M9** — Add reaction spring-scale pop (1 hour)
8. **M6** — Replace GroupChatScreen spinner with skeleton (1 hour)
9. **M7** — Add presence dot to ChatTopBar (placeholder, no real data yet) (1 hour)

### Phase 3 — Real-time layer (Week 3–5)
**Goal:** Ship presence and typing indicators.

10. **MA1 Phase 1** — Backend presence service + `usePresence` hook + ChatTopBar wiring (3 days)
11. **MA1 Phase 2** — Typing indicators via WebSocket + `useTypingIndicator` hook + ChatScreen/InboxScreen wiring (3 days)
12. **MA4** — Inbox triage: surface Unread filter, pinned section, typing in inbox rows (2 days)

### Phase 4 — Media and group parity (Week 5–7)
**Goal:** Complete the media experience and bring group chat to parity.

13. **MA2** — Media handling: pinch-to-zoom, multi-image, real voice messages (1 week)
14. **MA5** — Group chat parity: refactor to shared hooks, add reactions/replies/search, remove duplicate modal (1 week)

### Phase 5 — Real AI integration (Week 7–9)
**Goal:** Replace demo agents with a real AI backend.

15. **MA3 real** — Wire `getAgentResponse()` to the agent runtime, enforce tool-call gating, ship real AI responses (1 week)

### Sequencing rationale

Phase 1 is first because every §11 violation is a trust erosion that undermines all other quality work. A user who discovers that the "AI negotiator" is fabricating market data will distrust the entire app, no matter how good the bubble animation is. Phase 2 follows because motion quality is the most visible quality signal and can be shipped without backend changes. Phase 3 requires backend work but unlocks the single highest-impact feature (presence/typing) for a marketplace. Phase 4 completes the media and group experiences. Phase 5 is last because it requires the most cross-layer coordination and the interim (honest demo mode) is already truthful.

---

*End of report. Word count: ~3,200.*
