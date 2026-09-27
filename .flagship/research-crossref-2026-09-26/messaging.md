# Messaging Department — Cross-Reference Research Audit

**Scope:** `web/src/app/inbox/**`, `app/notifications/**`, `components/inbox/**`, `components/notifications/**`, `components/support/**`, `lib/store/inboxPrefs.ts`, `lib/store/notificationCursor.ts`.
**Reference:** mobile `frontend/src/components/chat/**`, `services/chatApi.ts`, `services/realtimeClient.ts` + live grammar research (Instagram DMs, eBay Messages, Vinted, WhatsApp, Messenger Marketplace, Airbnb).
**Date:** 2026-09-26.

---

## 1. Reference Grammar (distilled from live research)

### Conversation-list grammar
- **Instagram:** Chats list + **Requests folder** (non-follower DMs arrive as text-only requests; Accept/Delete/Delete-all; accept promotes to Chats). Pin up to 3 chats. Mute. Read receipts toggleable per-chat or globally.
- **WhatsApp:** Filter chips — **All / Unread / Groups / Favorites**; pin (≤3), archive, mark unread (viewer intent flag, not a count), mute durations (8h/1w/always), long-press multi-select.
- **Vinted:** single linear inbox mixing DMs + transactional updates; notorious gap — no filter/sort/deal-state separation (published UX critiques).
- **eBay:** threaded conversations grouped per counterparty (not per item), **custom folders**, delete messages, unread counts.
- **Airbnb:** category filters (All/Unread/Starred/trip-stage/per-listing), search by name/word/confirmation code, time-sensitive threads surfaced to top.

### In-thread grammar
- **Instagram:** press-and-hold → Reply (quoted), react (emoji incl. custom), forward, edit ≤15 min, unsend, vanish mode / view-once media, "Seen"/"Active now", date separators, sender-name clusters in groups.
- **WhatsApp:** swipe/long-press quote reply; tap quote → jump to parent; pinned *messages* banner (≤3); edit ≤15 min + delete for everyone (tombstone); voice notes w/ waveform + transcript + playback speed; starred messages; "message info" per-recipient receipts in groups.
- **eBay:** item context card pinned under the header (thumb, title, price) with **Send offer / Make offer** shortcut; order details alongside order-linked threads; up to 5 images.
- **Vinted:** offer cards in-thread (Accept/Decline/counter via Make offer); **accepted offer → "Buy now" CTA in-thread**; per-message delete-for-everyone.
- **Airbnb:** reservation context (Details link), quick replies (saved templates w/ placeholders), AI auto-replies labeled as Airbnb, read receipts, edit/unsend, photo+video attach.

### Safety / trust grammar
- Vinted: "keep the conversation on platform" prompts, report-scam affordance, block member, delete conversation.
- Mobile app (our reference): `utils/chatSafetyWarnings.ts` — `detectChatSafetyWarning` (conversation banner), `detectComposerSafetyWarning`, `containsOffPlatformPaymentPattern` — a real off-platform-payment detector rendered via `ChatSafetyBanner` (info/caution/danger levels) above the message list.
- Messenger Marketplace: "don't share personal info" nudges in stranger threads.

### Composer grammar
- WhatsApp/IG: text, photo, video, voice note, document, stickers/GIFs, emoji picker, reply staging bar.
- eBay: images ≤5 + AI-suggested reply draft; Airbnb: quick replies.
- Marketplace baseline: attach photo, offer CTA near composer, quick replies for sellers.

### Message status grammar
- sending (clock) → sent (single check) → delivered (muted double) → read (accented double / "Seen" caption under last read). Group "seen by" at depth.

### Notifications grammar
- **Instagram:** grouped/aggregated rows ("X and 3 others liked…"), follow rows carry in-row Follow back, day + type sections, per-kind push settings (Everyone/Follow/Off), no true "clear all".
- **eBay selling alerts:** order-linked, actionable deep links (offer → offers surface, order → order detail).
- Baseline: unread dot + weight, mark-read on open, mark-all, filter chips (All/Unread/Orders).

---

## 2. Our Implementation — verified against code

### Conversation list — `ConversationList.tsx` / `ConversationRow.tsx` / `ConversationRowMenu.tsx`
- **Search** field filtering title/preview/member names/listing title (`ConversationList.tsx:102-112`).
- **Tabs: All / Requests · N / Archived** (`:34`, `:205-216`) — IG requests + archive grammar; no Unread/Groups filters (WhatsApp/Airbnb have them).
- **Pinned sort** — pinned lead the list via stable sort, pin icon on row (`:114-121`, `ConversationRow.tsx:127-129`).
- **Row menu** (hover kebab, keyboard-navigable): Pin, Mute, Mark read/unread, Archive, Delete w/ ConfirmSheet (`ConversationRowMenu.tsx:166-217`). Live edges: PATCH pin, PATCH unread, POST/DELETE mute/archive (`useConversationPrefs.ts`, `groupAdmin.ts:406-424`).
- **Unread grammar:** count badge w/ `99+` cap, muted = dimmed badge not suppressed row (`ConversationRow.tsx:153-164`), bold preview, delivery glyph (clock/check/double-check, `ConversationRow.tsx:35-54`), per-kind previews from `inboxModel.ts:100-149` ("You sent an offer · £32", "Photo", "@handle: text", tombstone labels — never leaks deleted payloads).
- **Requests:** accent-edge rows w/ inline Accept/Decline (`ConversationList.tsx:286-332`); resolutions persisted in `inboxPrefs.requests`; live POST accept/decline; accept clears `isRequest` fixture-side.
- **Listing thumb** right-side on marketplace rows (`ConversationRow.tsx:168-176`). Group 2×2 mosaic + "N members".
- Guest → sign-in wall; skeleton rows match layout; real error/retry state.

### Thread — `ChatPanel.tsx` / `MessageBubble.tsx`
- **Header:** avatar/mosaic → info surface, online dot, verified badge, "Active now / Last seen X" (DMs) or "N members" (groups) (`ChatPanel.tsx:505-570`). Phone control removed rather than faked (honest — no call backend).
- **In-thread search:** client-side filter + `<mark>` highlighting + live result count (`:282-298`, `:574-609`); deleted payloads never surface.
- **Listing context card** pinned under header → `/item/[id]` (`:628-657`) — eBay/Vinted grammar.
- **"New messages" divider** anchored at first unread incoming, snapshotted once per visit so mark-read refetch can't move it (`:157-170`, `:344-360`).
- **Mark-read on open** — fires `useMarkConversationRead`, clears row/header/tab badges (`:253-256`, `queries.ts:120-156`).
- **Reply quotes (recently added):** hover gutter Reply + right-click/long-press `MessageActionsMenu` (Reply/Copy), quoted compose bar w/ brand edge + sender + 1-line preview, `replyToMessageId` sent through the real write path, tap-quote → scroll + 1.4s flash, out-of-window parent → honest toast (`:362-374`, `MessageBubble.tsx:317-391`, `Composer.tsx:129-150`).
- **Clustering:** same-sender runs tighten to 2px, tail corner on last bubble only (`MessageBubble.tsx:444-445`, `ChatPanel.tsx:675-687`) — IG pressure-cluster grammar.
- **Receipts:** per-message clock/check/double-check + "Seen" under final read outgoing (`MessageBubble.tsx:45-70`, `:558-560`).
- **Reactions rendered** as overlapping emoji chips, max 3 + count (`MessageBubble.tsx:564-587`) — **display only; no send affordance.**
- **Tombstones** (`DeletedMessageTombstone`), **Edited** marker, system captions, group sender labels on cluster-first incoming.
- **Media rendering:** image (AppImage / blob img for local picks), video (native player + poster), voice (play toggle + waveform bars + m:ss, `VoiceAttachment`), document (download row, `DocumentAttachment`).
- **Optimistic sends** reconcile on text+media+time match (`:263-280`); send failure removes the pending bubble + error toast.
- **Composer gates:** blocked counterparty → "You blocked X — unblock" bar (`:801-813`); admins-only group → read-only notice (`:814-817`).

### Composer — `Composer.tsx`
- Autogrow ≤128px, Enter send / Shift+Enter newline / Escape cancels reply, staged photo preview w/ remove, **quick-replies bolt picker** (persisted store + "Manage quick replies" → /seller-hub, Airbnb grammar), send disabled while in flight.
- `accept="image/*"` only — no video/voice/document attach.

### Commerce cards — `OfferCard.tsx` / `ListingShareCard.tsx` / `useChatOffers.ts`
- **OfferCard:** item anchor row, "Offer £X ~~on £Y~~" hero, status badge (OFFER_STATUS_LABEL — 'cancelled' reads "Withdrawn"), role-derived actions from the canonical `resolveOfferActions` matrix — Accept/Counter/Decline for the responder, "sent · waiting" + Withdraw for own move.
- **Offer → order wiring: VERIFIED.** `useChatOfferActions.respond` → `acceptOffer(offer, viewerId)` resolves `{ orderId }` **before** success toast, then `router.push('/orders/{orderId}')` (`useChatOffers.ts:121-131`). Decline/cancel → `respondToOffer` live / fixture mutation w/ revert-free honest labeling. Counter → shared `OfferSheet` + `sendCounter` w/ `conversationId` (`ChatPanel.tsx:833-847`). Standing record resolves via `message.offerId` else thread's listing w/ live-status preference (`offerForMessage`, `useChatOffers.ts:78-94`); lazy-expiry via shared 30s clock; unresolvable cards render status-only (no fabricated actions).
- **ListingShareCard:** product tile (image/title/brand·size/price/Sold) deep-links `/item/[id]`; meta row + receipts match bubbles.
- 15s offer-list poll in live mode (`useChatOffers.ts:68`).

### Info surface — `ConversationInfoPanel.tsx` + group admin
- DM: hero w/ presence, Profile/Media/Mute quick actions, shared-media grid + links/offers counts, Marketplace row, mute/archive rows, **Privacy and safety** section — Block/Unblock, Report (ReportSheet), Remove from inbox (`:595-618`).
- Group: hero (cover/photo/desc edit), member directory w/ owner/admin badges, permissions rows (edit info / send / add members — `capabilitiesFor` mirrors backend formula `groupAdmin.ts:229-239`), add/remove members, member action sheets (message/DM/toggle-admin/remove), leave (owner → "transfer ownership" guard toast, honest), report group, clear chat, created-at.
- Authority resolution: live `memberRoles` → session overrides → fixture creator provenance; flat members when data carries no roles (`groupAdmin.ts:177-194`).

### Notifications — `app/notifications/page.tsx` / `viewModel.ts` / `NotificationRow.tsx` / `notificationCursor.ts`
- Row: leading visual (actor avatar round / item thumb square), unread dot top-right + kind accent badge bottom-right, 2-line text, right-aligned time — no row tint (`NotificationRow.tsx`).
- **Grouping:** day buckets (Today/Yesterday/Earlier) ≤6 rows → **type sections (Follows/Orders/Offers/Activity)** >6 (`viewModel.ts:189-215`) — IG activity grammar.
- **Filters:** All/Unread/Orders chips (orders covers offers).
- **Read model:** `clearedIds` persisted overlay + `sourceUnreadIds` reseeded per fetch; open or hover-check marks read (live POST + optimistic); **Mark all read** clears exactly the fetched unread set, live POST + invalidate (`notificationCursor.ts:45-66`, `page.tsx:71-78`).
- **Deep links:** `href` per row — offers→/offers, orders→/orders[/id], follow→/u/{user} (in-row FollowButton), item→/item/{id}, wallet, category; **live mapper routes `conversation`/`chat` events → `/inbox/{id}`** (`mappers.ts:810-814`).
- Fixtures include aggregated grammar: "ellawears and 3 others liked…" (`fixtures.ts:957`).

### Support — `TicketThread.tsx` / `SupportMessageRow.tsx` / `SupportHub.tsx`
- Case ref + status badge + lifecycle stepper (`TicketTimeline`), order link → `/orders/{ref}`, thread (customer right/brand, agent left/surfaceAlt + author caption, system captions), optimistic composer w/ clock + "Not sent / Retry" on failure (`SupportMessageRow.tsx:55-74`), resolution block (Accept/Escalate — **fixture-mode gated honestly**: "no accept/escalate endpoints exist yet" `:190-216`), CSAT after close, sticky composer above tab bar.

---

## 3. Gap Table

| Capability | Reference grammar | Our state | File:line | Verdict |
|---|---|---|---|---|
| Requests folder (accept/decline) | IG Requests | Segmented tab + inline Accept/Decline + persisted resolution + live edges | `ConversationList.tsx:258-264`, `inboxPrefs.ts:39-46` | MATCHED |
| Pin / mute / archive / delete / mark read-unread | IG+WA row grammar | Kebab menu, live edges w/ revert, pinned-first sort, dimmed-muted badge | `ConversationRowMenu.tsx:166-217` | MATCHED |
| Unread filter on inbox | WA/Airbnb Unread chip | All/Requests/Archived only | `ConversationList.tsx:205-216` | PARTIAL |
| Listing context card in-thread | eBay/Vinted/Airbnb details | Pinned card → /item/[id] | `ChatPanel.tsx:628-657` | MATCHED |
| Order/transaction strip in DM | eBay order context; mobile `ChatTransactionStrip` | Not rendered — listing card only | — | MISSING |
| Offer card lifecycle | Vinted in-thread offer card | Full role matrix, real order on accept → /orders/[id] | `useChatOffers.ts:117-131` | MATCHED (verified) |
| Post-accept "Buy now" CTA | Vinted | Navigates to order on accept instead — equivalent closure, different grammar | `useChatOffers.ts:129` | PARTIAL/DIVERGENT |
| Reply quotes + jump-to-parent | WA/IG quote reply | Gutter + context menu + quoted composer + scroll/flash | `ChatPanel.tsx:330-374` | MATCHED (recent) |
| Right-click/long-press actions menu | IG hover options | Reply/Copy only | `MessageBubble.tsx:317-391` | PARTIAL — no React/Edit/Delete/Forward |
| Emoji reactions | IG/WA react; backend POST/DELETE `/reactions` exists (`chatApi.ts:675,690`) | Chips render; no send affordance | `MessageBubble.tsx:564-587` | PARTIAL (backend ready, UI read-only) |
| Message edit (≤15 min) | IG/WA/Airbnb; backend `editConversationMessageOnApi` exists | `isEdited` renders; no edit action | `domain.ts:327`; menu lacks Edit | MISSING (backend ready) |
| Delete-for-everyone | IG unsend/WA delete; backend `deleteConversationMessageOnApi(scope)` exists | Tombstone renders; no delete action | `MessageBubble.tsx:113-138` | MISSING (backend ready) |
| Forward message | IG/WA | Absent | — | MISSING (low priority for marketplace) |
| Typing indicator | IG/WA; mobile `useTypingIndicator` via `realtimeClient.ts` websocket | Absent — 15s poll only | `queries.ts:96` | MISSING (no web realtime client) |
| Load-older pagination | WA scroll-up load; backend `oldestCursor/hasMore` exists (mobile `useConversationMessages.ts:169-323`) | `fetchConversationMessages` drops cursors, no UI; out-of-window quote → honest toast | `services/chat.ts:44-56`, `ChatPanel.tsx:362-368` | MISSING (contract exists, unwired) |
| Safety prompts (off-platform payment, scam warnings) | Vinted/Messenger; mobile `chatSafetyWarnings.ts` + `ChatSafetyBanner` | Block/Report in info panel only; no in-thread banner or composer warning | `inboxSafety.ts` (block only) | MISSING |
| Voice message send | WA voice notes; mobile `onVoiceRecord` | Renders (waveform/play/duration); can't record | `MessageBubble.tsx:152-220` vs `Composer.tsx` | PARTIAL |
| Voice transcription | WA transcripts; mobile `VoiceTranscriptionPanel` | Absent | — | MISSING |
| Video/document attach | WA/IG; render path exists | `accept="image/*"` only | `Composer.tsx:175` | PARTIAL |
| Vanish mode / view-once | IG | Absent (no contract) | — | MISSING (acceptable omission) |
| In-thread pinned messages | WA pinned-message banner | Absent | — | MISSING |
| Presence (Active now / Last seen) | IG/WA | Rendered from `isOnline`/`lastSeen` | `ChatPanel.tsx:472-480` | MATCHED (poll-driven) |
| Read receipts per message + "Seen" | IG/WA | Full tick grammar + Seen caption | `MessageBubble.tsx:45-70` | MATCHED |
| Delivery glyph in list row | WA/IG preview glyph | check/double-check/clock | `ConversationRow.tsx:35-54` | MATCHED |
| Quick replies | Airbnb quick replies; eBay templates | Bolt picker + manage link (seller hub) | `Composer.tsx:187-233` | MATCHED |
| Group admin depth | WA group settings | Roles, permission scopes, add/remove, leave w/ ownership guard | `groupAdmin.ts`, `ConversationInfoPanel.tsx` | MATCHED (no transfer-ownership surface — honest guard) |
| Notification grouping | IG day/type sections + aggregation | Auto day-buckets → type sections >6; fixture aggregates ("and 3 others") | `viewModel.ts:213-215` | MATCHED |
| Notification filters + mark-all | Baseline | All/Unread/Orders + mark-all (overlay + live) | `page.tsx:91-106` | MATCHED |
| Notification deep links | eBay order-linked alerts | href per row; live `chat` events → `/inbox/[id]` | `mappers.ts:786-821` | MATCHED (fixture feed has no message-kind rows) |
| Notification feed pagination | Infinite feed | `nextCursor` exists in service; UI fetches one page only | `services/notifications.ts:30-48` vs `client.ts:284-291` | PARTIAL |
| Notification settings | IG per-kind Everyone/Follow/Off | Absent in dept | — | MISSING |
| Per-message delete in thread | Vinted/eBay | Absent | — | MISSING |
| Support thread | Intercom-class | Ref/badge/stepper/order link/optimistic reply/retry/CSAT | `TicketThread.tsx` | MATCHED (accept/escalate fixture-gated — honest) |
| Support attachments | Baseline | Text only | `TicketThread.tsx:260-275` | PARTIAL |

---

## 4. Top Caveats (honest audit)

1. **Typing indicator + load-older are NOT "contract gaps" — the contract exists.** Backend returns `oldestCursor`/`newestCursor`/`hasMore` (mobile `chatApi.ts:483-500`, consumed by `useConversationMessages.ts:169-323`) and pushes typing events over the realtime client (`realtimeClient.ts:516`). Web's `fetchConversationMessages` (`services/chat.ts:44-56`) requests no cursor and discards the pagination envelope; there is no web realtime client — the thread polls at 15s (`queries.ts:96`). Both are **unwired capabilities**, not absent contracts. The out-of-window reply toast (`ChatPanel.tsx:367`) is the honest symptom.
2. **Offer card → order wiring verified.** Accept goes through `acceptOffer`, waits for `orderId`, then routes to `/orders/{orderId}` (`useChatOffers.ts:121-131`) — the "recently fixed" claim holds. Caveat: `offerForMessage` falls back to *the standing offer on the thread's listing* when `offerId` is absent — in a thread with repeated offers on the same listing, a historical offer card may resolve to the current record rather than its own (live payloads threading `offerId` are immune).
3. **Reactions are read-only.** Chips render (`reactedByMe` tinting included) but neither the gutter nor the context menu offers React — despite live POST/DELETE `/messages/{id}/reactions` existing. Biggest "surface renders the contract but can't write it" gap after edit/delete.
4. **Message edit + delete-for-everyone are render-only.** Backend endpoints exist (`chatApi.ts:631-657`, 15-min edit window); the actions menu ships only Reply/Copy. Same class of gap.
5. **No in-thread safety prompts.** Mobile has `detectChatSafetyWarning`/`containsOffPlatformPaymentPattern` + `ChatSafetyBanner`; Vinted/Messenger grammar expects off-platform-payment nudges. Web's safety surface is block/report in the info panel only — the *proactive* prompt layer is absent.
6. **Composer is photo-only.** Voice recording, video and document attach are rendered-incoming but can't be sent; mobile composer records voice. Fine for marketplace baseline, below WhatsApp grammar.
7. **Mark-all-read is correct but the overlay is unbounded.** `clearedIds` persists forever in localStorage (`notificationCursor.ts`) — functionally fine, grows monotonically; a server cursor makes it redundant in live mode anyway.
8. **Notification feed fetches one page.** `fetchNotificationEvents` supports `cursor`/`limit` and returns `nextCursor`; `useNotificationEntries` takes page 1 only — long feeds truncate silently.
9. **Mark-unread is honest** (viewer-intent flag, no fabricated count — `ConversationRowMenu.tsx:96-132`) — matches WA semantics.
10. **Muted threads suppress badges via display-time transform** (`queries.ts:79-87`) while the row keeps a dimmed badge — correct and deliberate, verified.
11. **Support composer is text-only** and resolution accept/escalate is fixture-gated — labeled honestly in code (`TicketThread.tsx:190-192`).
12. **No message-kind notifications in the feed contract** (`NotificationKind` lacks 'message', `domain.ts:394-403`) — though the live href mapper *can* route `conversation` events to `/inbox/[id]`. Inbox badges carry that signal instead; a fixture feed demonstrating the route doesn't exist.
