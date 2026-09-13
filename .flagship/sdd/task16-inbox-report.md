# Task 16 — Inbox: conversation rows + unread semantics

## Status: DONE (with documented data-limitation concerns)

`tsc --noEmit -p frontend/tsconfig.json` → **exit 0, zero errors** (whole project clean, not just touched files).

---

## Case-study findings (before)

| Concern | Finding |
|---|---|
| Row content | Avatar (unread ring) + name + pin/mute icons + timestamp / preview + commerce thumb. Reasonable structure, flat canvas, hairline separators. |
| Unread state | Present: brand ring on avatar, bold name, bold timestamp, unread pill. |
| Delivery state | **Missing entirely** — no Sending/Sent/Delivered/Read/Failed semantics anywhere in the row. |
| Timestamp | **Broken** — `lastMessageTime` is a raw ISO timestamp from `/chat/conversations` (`last_message_created_at`) rendered verbatim; every row showed `2024-01-15T10:30:00…`. Optimistic appends write the literal string `"just now"`. |
| Unread count | **Fabricated** — `unreadCount` was computed as `messages.filter(m => m.sender !== 'me').length`, i.e. total incoming history, not unread count. Fresh fetches carry only a synthetic placeholder message (count 0); a visited thread marked unread could show e.g. "47". |
| Preview | `numberOfLines={1}` truncation OK, but voice messages produced an **empty preview** (`text: ''` + `??` chains never reached fallbacks). |
| States | Loading skeleton ✓, per-segment empty states ✓, offline banner ✓, slim error banner ✓ — but an empty list with a failed load showed "No conversations yet" **alongside** the error banner (contradictory). |
| Dead code | Unused `searchVisible`, `filterSheetVisible`, `sellerFilter` state + unused imports (`MessagingSegmentRail`, `getCommerceStatus`, `needsResponse`, `hasActiveOffer`, `needsShipment`, `CommerceStatusTone`) + dead styles (`newMessageBtn*`, `unreadPill*`) — leftovers from an abandoned rail/sheet iteration. |

## What changed

### `frontend/src/components/chat/InboxConversationRow.tsx`
- New exported type `InboxDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'` and prop `deliveryStatus`.
- Renders one 13pt status glyph before the preview (matches thread receipt grammar): `time-outline` (muted) sending · `checkmark` (muted) sent · `checkmark-done` (muted) delivered · `checkmark-done` (brand) read · `alert-circle` (danger) failed.
- Unread pill is subdued (`surfaceAlt` bg / `textMuted` fg) when the conversation is **muted** — "unread" stays true but quiet.
- Delivery state appended to `accessibilityLabel` ("last message sending/read/not delivered").

### `frontend/src/screens/InboxScreen.tsx`
- `formatInboxTimestamp()`: ISO → `formatActivityTimestamp` (time-of-day today, "12 Aug" otherwise — the util documented for conversation lists); non-parseable labels like `"just now"` pass through. Applied to both the conversation row and the message-request row.
- `deriveInboxDeliveryStatus()`: reads only the last stored message; returns a status **only** when `sender === 'me'` — synthetic preview messages and others' messages yield no glyph (never claims unverifiable state).
- `unreadCount={undefined}` — honest unread dot instead of the fabricated history count. Prop kept for a future server-supplied count.
- Realtime `nextLastMessage` fixed: `??` → `||` so empty-string bodies reach fallbacks; added `🎤 Voice message`.
- `ListEmptyComponent` now leads with an error empty state (`cloud-offline-outline`, "Couldn't load messages", Retry → `loadConversations`) when `syncError` is set; the slim error banner only renders when rows are on screen (no double error display).
- Removed dead state, dead imports, dead styles (see findings).

### `frontend/src/services/chatApi.ts`
- `mapApiMessageToConversationMessage` now maps `readBy` and `isReadByMe` (previously dropped although the API returns them) and derives `readStatus: 'read'` for own messages another participant has read. `readStatus` was previously hardcoded `'sent'` — read receipts were invisible on cold loads.

### `frontend/src/store/useStore.ts`
- New action `patchConversationMessage(conversationId, {id?, clientMessageId?}, patch)` — in-place message patch by server id or stable `clientMessageId` (survives the optimistic→confirmed id rename); preserves list order and preview fields.
- `appendConversationMessage` / `replaceConversationMessages` `nextLastMessage`: `??` → `||` + voice fallbacks so media/voice previews never render empty.

### `frontend/src/hooks/chat/useConversationMessages.ts`
- `appendToConversationStore` now carries `status`, `readStatus`, `clientMessageId`, `voiceUri`, `voiceDurationMs`, and `type: 'voice'` into the store copy — the inbox can show a truthful "Sending" for optimistic sends.
- `patchStoreMessage` helper patches the store copy at every send resolution: text send then/catch (400 → `failed`, unknown → `reconciling`), media + voice upload-fail/send-then/catch, retry start (`sending`) and retry resolution, and the realtime `clientMessageId` reconcile branch.
- Read-receipt handler now also patches the newest own message in the store to `readStatus: 'read'` + `readBy` when the event covers it — the inbox shows "Read" after navigating back.

### `frontend/src/screens/ChatScreen.tsx`, `frontend/src/hooks/chat/useChatScreenData.ts`
- Hydration maps now pass through `status`, `readStatus`, `readBy`, `isReadByMe`, `clientMessageId`, `voiceUri`, `voiceDurationMs`, `replyToMessageId`, and `type: 'voice'`. Previously every store write reset the local list to stripped copies, silently dropping pending state, receipts, reply context and voice payloads — the reset is now faithful. (GroupChatScreen already spreads `...entry`.)

## Resulting composition

Flat canvas, hairline separators, 68pt rows: `[unread-ring avatar] [bold name + pin/mute · timestamp] [delivery glyph · preview · commerce badge · unread dot] [listing thumb]`. Unread = ring + bold name/time/preview + accent dot (subdued when muted). Delivery = single honest glyph, only when the store proves it.

## Concerns / follow-ups (for parent agent)

1. **Unread count needs a server field.** The list payload (`GET /chat/conversations`) has no per-message read cursor or unread count; the backend already computes `last_read_at` per conversation — adding `unreadCount` (or `lastReadAt`) to that payload would let the row show a truthful number. Until then the dot is correct.
2. **Delivery glyph coverage is bounded by what's in the store.** Fresh list fetches carry a synthetic placeholder (`sender: 'system'`) → no glyph (honest). Glyphs appear after a thread visit, optimistic send, or realtime echo. Extending the list payload with `lastMessageSenderId`/`lastMessageReadBy` would make "Sent/Read" persistent across refreshes.
3. **`upsertConversation` clobbers real messages** with the single synthetic preview message on every inbox refresh (`conversation.messages.length ? …` keeps the 1-element synthetic array). Pre-existing behavior; it also means ChatScreen rehydrates from one placeholder message until its own sync. Worth a follow-up audit, not changed here.
4. **No "Delivered" source exists.** The backend never emits a delivered receipt; the UI claims `sent` until `read` — deliberately never fabricated.
5. Untouched per constraints: `components/coown/**`, all navigation/haptics/analytics preserved; no new features.
