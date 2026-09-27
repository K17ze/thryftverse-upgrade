# Audit — Messaging (mobile) — 2026-09-26

## Verdict
DM threads are flagship-grade — date separators, unread divider, per-message ticks, "Seen" on cluster tail, search highlight with match navigation, caption-staged media, quick replies, and full loading/error/offline coverage — and match or exceed the upgraded web thread. The group thread is a materially weaker second implementation (no receipt ticks, no voice bubble support, dead media taps), inbox group rows lack the mosaic avatar and kind-aware preview grammar, and the shared-media "delete" is a dishonest local-only control.

## Findings

### MSG-01 — Shared-media "delete" never reaches the server [P0]
- Screens: `frontend/src/screens/SharedConversationMediaScreen.tsx`
- Evidence: `handleDelete` (lines 189–197) calls `replaceConversationMessages(conversationId, remaining)` — a local store write only. No API call, no confirmation sheet, no undo. Long-press → select → trash icon (lines 271–290, 295–320) claims deletion.
- Web parity: web has no shared-media delete surface; still violates the dishonest-control bar.
- Competitor: WhatsApp/Telegram shared-media delete calls a tombstone endpoint with confirm ("Delete for me / for everyone").
- Root cause: grid was built on the local message cache; the delete control was wired to the cache mutation instead of a delete-message API.
- Fix: route delete through the conversation message-delete API (or hide the control), add a destructive `ConfirmationSheet`, refresh `remoteMedia` post-delete.
- Acceptance: deleted items stay removed after `fetchConversationMediaFromApi` refetch; confirm sheet precedes deletion; deleting is a no-op offline with an explanatory state.

### MSG-02 — Group thread drops receipt ticks, voice bubbles, media taps, and failure UI [P0]
- Screens: `frontend/src/screens/GroupChatScreen.tsx`
- Evidence: render (lines 322–352) passes `senderLabel, isMe, mediaUri, mediaType, voiceUri, offerPrice, systemTitle` but **omits** `status, readStatus, readBy, uploadStatus, voiceDurationMs, onMediaPress, onToggleReaction, onRetryMessage, searchHighlightQuery`. Contrast `ChatScreen.tsx:563–591` which passes all of them. `showTimestamp` is true for every message (line 346) vs DM cluster-tail-only.
- Consequences:
  - Own group messages never show sending/sent/delivered/read ticks — despite hydration carrying `readStatus`/`readBy` (`hydrateConversationMessages.ts:139–147`) and `markConversationAsReadOnApi` being called (line 62).
  - `voiceUri` is passed but `voiceDurationMs` is not — `MessageBubble`'s voice branch requires `item.voiceDurationMs` (bubble contract in `MessageBubble.tsx:79–89`), so a voice note recorded by this very screen's composer (`onVoiceRecord={handleSendVoice}`, line 420) renders as an empty bubble. Broken, dishonest content.
  - `onMediaPress` undefined → tapping a group photo does nothing (dead control); DM opens `ChatMediaPreview` (`ChatScreen.tsx:486–498`).
  - Failed sends get no failure badge/retry (DM has `retryNow`/`onRetryMessage`).
- Web parity: web `ChatPanel`/`MessageBubble` render ticks and media taps in group threads.
- Competitor: WhatsApp group ticks + "Read by" sheet; Instagram group "Seen by".
- Root cause: `GroupChatScreen` is a forked, older thread implementation that was not brought along when `ChatMessageItem`/`MessageBubble` gained receipt/voice/media affordances; two divergent group thread paths exist (inbox → `Chat` renders the good implementation; CreateGroupChat/GroupChatInfo/agent flows → `GroupChat` renders the degraded one).
- Fix: either route all group conversations through `ChatScreen` (it already sets `variant='group'` when `conversation.type === 'group'`, `ChatScreen.tsx:144–148`), or converge `GroupChatScreen` onto `ChatMessageItem`/`useChatMessageRenderer` and pass the full prop set.
- Acceptance: group own messages show clock→check→double-check→"Seen by N"; voice notes play; media taps open `ChatMediaPreview`; failed sends show alert + retry; timestamps cluster like DMs.

### MSG-03 — Inbox group rows skip the mosaic avatar [P1]
- Screens: `frontend/src/components/inbox/InboxRow.tsx`
- Evidence: `avatarEl` (lines 134–152) renders a 40px circle with group photo or `initialsFromName` on a `colorForId` fill — no member mosaic. `GroupAvatarMosaic` exists (`components/chat/GroupAvatarMosaic.tsx`, "composites 2–4 member avatars into a 2×2 grid") and is used in `GroupInfoHero`, `GroupDetailsStage`, `EditGroupMediaSection` — but not the inbox.
- Web parity: `web/src/components/inbox/ConversationRow.tsx:84–92` renders `GroupAvatarMosaic` (members, groupPhoto, fallbackName) for every group row.
- Competitor: WhatsApp group rows show composite/member avatars; iMessage mosaic is canonical.
- Root cause: `InboxRow` predates the mosaic component and was never migrated.
- Fix: use `GroupAvatarMosaic` with `conversation.participantProfiles` (up to 4) + `item.avatar` override, keeping the bot indicator.
- Acceptance: group inbox rows render a 2×2 member mosaic when no group photo exists; group photo still wins; DM rows unchanged.

### MSG-04 — Inbox preview line lacks kind-aware and sender-prefix grammar [P1]
- Screens: `frontend/src/components/inbox/InboxRow.tsx`, `frontend/src/components/chat/InboxConversationRow.tsx`, `frontend/src/services/chatApi.ts`
- Evidence: row renders raw `item.lastMessage` (`InboxRow.tsx:218`). `lastMessage` is set verbatim from `payload.lastMessage` (`chatApi.ts:340`). There is no mobile equivalent of web `lastMessagePreview`, which emits "You sent an offer · £32", "📷 Photo", "🎥 Video", and `{@handle}: text` for group senders (`web/src/components/inbox/inboxModel.ts:97–123`).
- Web parity: as above — web previews are offer/media/system-aware and sender-prefixed in groups.
- Competitor: WhatsApp "Alice: …" prefix, media nouns ("Photo"); Instagram offer/context labels.
- Root cause: mobile never built a preview view-model; the API string is displayed as-is.
- Fix: port `inboxModel.lastMessagePreview` logic into `components/inbox/inboxViewModels.ts`, keyed off the last stored message type/mediaType/offerPrice and group sender handle; fall back to `item.lastMessage`.
- Acceptance: photo message previews as "📷 Photo" (sender-prefixed in groups), offers as "…offer · £32", group text as "{@handle}: …".

### MSG-05 — Group in-thread search has no highlight or match navigation [P2]
- Screens: `frontend/src/screens/GroupChatScreen.tsx`
- Evidence: `filteredGroupMessages` (lines 243–257) filters the list in place — matches only count; non-matching messages are hidden but no `searchHighlightQuery` is passed and there is no "n of m" count or prev/next chevron. DM search (`ChatScreen.tsx:597–654`, `MessageBubble.tsx:33–76`) highlights matches and navigates hits.
- Web parity: web `ChatPanel` search highlights + navigates.
- Competitor: WhatsApp/Telegram jump-to-match.
- Fix: pass `searchQuery` as `searchHighlightQuery`, render a match counter + prev/next navigation like `ChatTopBar`.
- Acceptance: matched text highlights; header shows "2 of 7" with chevron navigation; empty result shows a no-match state.

### MSG-06 — Video tiles in shared media render blank when no poster exists [P2]
- Screens: `frontend/src/screens/SharedConversationMediaScreen.tsx`
- Evidence: lines 246–258 — `item.thumbnailUri` is `undefined` today (`posterUri` not yet in the `Message` contract, per the comment at lines 41–48), so every video tile renders an empty `surfaceAlt` box plus the play badge — placeholder-grade media.
- Fix: derive a client-side video thumbnail (expo-video-thumbnails) or thread `posterUri` through `fetchConversationMediaFromApi`/message mapping; keep the documented forward-compat path.
- Acceptance: video tiles show real first-frame imagery; no solid grey tiles in populated grids.

## Non-findings (verified good)
- DM receipt ticks on **every** own message + "Seen" on cluster tail; exceeds web's last-only "Seen" (`MessageBubble.tsx:510–553`).
- Date separators Today/Yesterday/weekday/older and pinned unread divider with `scrollToIndex` anchoring (`hooks/chat/types.ts:48–80`, `useChatSearchScroll`, `ChatMessageItem.tsx`).
- In-thread DM search: case-insensitive highlight, match count, prev/next, jump scroll (`ChatScreen.tsx:597–654`, `MessageBubble.tsx:33–76`).
- Photo staging with caption via `AttachmentReviewSheet` (`uri`, `mediaType`, `onSend(caption)`; lines 21–117).
- Message requests with inline Accept/Decline, listing context, Requests segment + banner (`InboxRow.tsx:163–206`, `useInboxFilters.ts:70–119`).
- Archive/mute/pin/read-receipts/quick replies all wired (`ChatSettingsScreen.tsx`, `ConversationInfoScreen.tsx`, `useInboxActions`).
- Server-authoritative unread badge count incl. `markedUnread` merge (`chatApi.ts:361–367`).
- Full state machine in `ChatMessageList` (skeleton/error-retry/empty/populated, lines 71–143).
- Prior fixes intact: group media grid composes multi-media without overlap (`ChatMessageItem` grid + `GroupAvatarMosaic`), and `EditGroupScreen` is a thin orchestrator over extracted hooks/components — no scaffold remnants.
- `GroupPermissionsScreen` is fail-closed with optimistic update + server reconcile (lines 91–124); `GroupMembersScreen`, `GroupBotManagementScreen`, `CreateGroupChatScreen` all decomposed with real states.
