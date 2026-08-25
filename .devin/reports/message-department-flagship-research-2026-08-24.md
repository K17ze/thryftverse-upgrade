# ThryftVerse Message Department — Flagship Research and Upgrade Strategy

**Original research date:** 24 August 2026
**Latest revalidation:** 25 August 2026; official-source cutoff 25 August 2026
**Scope:** Inbox, direct messages, group chat, composer, media, realtime, notifications, privacy, safety, commerce context, server contracts, persistence and multi-device behavior  
**Repository state reviewed:** `f82f74a54be79a1721017380ddd5472d856f1679` on `feat/product-detail-contract-media-device-closure`
**Delta reviewed:** messaging implementation in `cbf8abf1afae0b8b6e5159bbffbc471f9afc0100`, including migrations 135 and 149
**Assessment type:** code-backed product and architecture audit; no native visual claim

---

## 1. Executive decision

**Direct answer: no.** ThryftVerse is not 1:1 with WhatsApp or Telegram in feature breadth, reliability, multi-device behavior, privacy architecture or native interaction quality. It also does not yet meet the smaller and more important bar of **flagship baseline parity** for every visible core messaging action.

This is not a recommendation to clone both products. Telegram's channels, giant communities and exhaustive power-user surface are not automatically useful to a marketplace. The correct target is:

1. **Non-negotiable baseline parity:** messages, media and user state remain truthful across failure, reload, reconnect and another device.
2. **Selective capability parity:** voice, files, history search, edits, deletion, receipts, requests, pins and useful group coordination.
3. **ThryftVerse differentiation:** listing identity, structured offers, order milestones, evidence, protected checkout and dispute handoff.

ThryftVerse does not chiefly have a feature-count problem. It has a **truth, lifecycle and source-of-truth problem**.

The repository already contains a broad-looking message department: inbox segments, DMs, groups, typing, realtime, optimistic sending, replies, reactions, media, offers, order cards, message requests, mute/archive, quick replies, shared media, safety warnings, AI agents and group administration. That breadth is misleading. Some visible capabilities remain local simulations, the two conversation surfaces have different guarantees, and several new backend lifecycle entities are not used by the client.

The current department therefore feels less complete than its component inventory suggests. Users do not judge messaging by how many controls exist. They judge it by whether:

1. the right message appears exactly once;
2. it survives reload, reconnect and another device;
3. delivery state is unambiguous;
4. media works for the recipient, not just the sender's phone;
5. read, mute, request, delete and report semantics are truthful;
6. conversation context remains clear without crowding the chat;
7. privacy claims match the cryptographic architecture;
8. the interface recedes and the people, objects and transaction dominate.

Today those guarantees are not consistently met.

### 1.1 Revalidation verdict after the chat-outbox implementation

The implementation added real foundations. It did **not** close the department:

| Area | 24 August finding | 25 August code-backed status |
|---|---|---|
| DM idempotency and realtime reconciliation | optimistic/realtime duplicates | **Substantially fixed** with `clientMessageId` in API, realtime and local reconciliation |
| Unknown HTTP outcome | shown as failure | **Fixed only in canonical DM text**; group, media and agent sends still use false-failure behavior |
| Latest history page | oldest page returned | **Backend fixed** with newest-first keyset queries; client does not consume cursors or prepend older history |
| Text offline outbox | absent | **Foundation added, integration incomplete**; durable rows exist, but reconnect initialization is never called and the group path bypasses it |
| Cross-device photo/video | sender-local URI persisted | **Improved but not hardened**; upload now precedes DM send, but the server accepts arbitrary URLs and does not bind the new attachment table or finalized asset receipt |
| Reply | local only | **Fixed in DM; still broken in GroupChat** because the group send omits `replyToMessageId` |
| Reactions | local only | **Database/API added; convergence incomplete** because reaction realtime events are not consumed and optimistic failures are not rolled back |
| Delete | endpoint absent | **API added; semantics still defective** because delete-for-me tombstones are not excluded by message reads, and the UI does not offer an honest me/everyone choice |
| Read receipts | decorative | **Backend cursor/event added; client remains decorative** because the read event hook is unused and per-message receipt rows are never written |
| Report | fabricated success | **Real route added**; idempotency and unknown-outcome reconciliation remain absent |
| Mute/archive/request hydration | discarded | **Mute/archive/request hydration fixed**; pin and mark-unread still mutate only local state |
| Request creation policy | not enforced | **Creation policy added**; pending chats can still send repeatedly, rich attachments are not gated, and ordinary push ignores request state |
| Fake translation | same text relabeled | **Removed from the canonical chat path** |
| DM/group architecture | two drifting engines | **Still open and now the largest immediate risk** |
| E2EE | absent | **Unchanged**; canonical chat is server-readable plaintext |

### 1.2 New release-blocking findings from the revalidation

1. **GroupChat is a second, weaker messaging product.** It removes an optimistic message on an ambiguous send outcome, has no durable outbox, does not pass reply metadata, ignores delete failures, and injects local demo-agent responses into the visible transcript.
2. **Group typing is untruthful.** The screen derives `isTyping` from the current user's own composer, then displays `typing…` in the header and above the composer as though another participant is typing.
3. **Delete for me is not durable in the read model.** The mutation inserts `chat_message_deletions`, but every message query omits the anti-join/filter. Deleted content returns after reload.
4. **Lifecycle tables exceed lifecycle behavior.** Migration 149 creates revisions, attachments and per-message receipts, while current routes do not write or consume those entities. Schema presence is not a shipped capability.
5. **Notification policy violates mute/request semantics.** The send handler queues ordinary push for every other participant without checking per-user mute or pending-request state.
6. **The outbox promise is overstated.** `initChatOutboxDrain()` exists but has no application call site. Mount-time drain is not connectivity-driven background recovery, and GroupChat never enters the outbox.
7. **Realtime mutations are publish-only.** Delete, reaction and read events are emitted, but the conversation UI subscribes only to created messages. A second device does not converge live for these mutations.

### 1.3 Current code evidence map

| Guarantee | Current owner/evidence | Result |
|---|---|---|
| DM send/reconcile | `frontend/src/hooks/chat/useConversationMessages.ts`; `POST /chat/conversations/:id/messages` | Improved; DM text only |
| Group send/reconcile | `frontend/src/screens/GroupChatScreen.tsx` | Separate weaker engine; P0 |
| Durable queue | `frontend/src/services/chatOutbox.ts` | Persist/drain functions exist; reconnect initializer has no call site |
| Message paging | `GET /chat/conversations/:id/messages`; `frontend/src/services/chatApi.ts` | Server cursors exist; client discards them |
| Delete | migration 149; `DELETE /chat/conversations/:id/messages/:messageId` | Mutations exist; delete-for-me omitted from read queries |
| Reactions | `chat_message_reactions`; add/remove routes | Fetch persistence exists; no live client convergence |
| Receipts | `chat_members.last_read_at`; read endpoint/event | Conversation cursor exists; UI and privacy integration absent |
| Attachments | `chat_message_attachments`; DM upload/send hook | Table unused; server trusts client URL metadata |
| Requests | DM creation transaction; `chat_conversation_user_state` | Creation/hydration improved; send/push gates incomplete |
| AI agents | backend bot runtime plus `frontend/src/services/chatAgentsApi.ts` | Real runtime foundations coexist with a separate demo transcript path |

### Recommendation

Do **not** start by adding polls, stickers, calls or more attachment buttons. First finish the reliable message platform already begun, converge DM and group into one engine, and prove it on two devices. Then add expressive and coordination features in deliberate waves.

The strategic product position should not be “another WhatsApp.” It should be:

> **The safest, clearest place to turn a marketplace conversation into a trusted transaction—without making the conversation feel like a dashboard.**

That means matching the baseline quality of WhatsApp, Telegram, Signal and iMessage in message lifecycle and interaction polish, while differentiating through listing context, truthful offers, order milestones, evidence, dispute handoff and scam resistance.

---

## 2. Method and evidence boundaries

The audit followed both directions:

```text
route → screen → components → hooks → store → service → API → DB → realtime/push
DB → API → mapper → service → store → hook → rendered state → navigation
```

Primary implementation surfaces reviewed include:

- `frontend/src/screens/InboxScreen.tsx`
- `frontend/src/screens/ChatScreen.tsx`
- `frontend/src/screens/GroupChatScreen.tsx`
- `frontend/src/screens/ConversationInfoScreen.tsx`
- `frontend/src/screens/SharedConversationMediaScreen.tsx`
- `frontend/src/components/chat/*`
- `frontend/src/hooks/chat/*`
- `frontend/src/services/chatApi.ts`
- `frontend/src/services/chatOutbox.ts`
- `frontend/src/services/realtimeClient.ts`
- `frontend/src/platform/realtime/*`
- `frontend/src/domain/conversation.ts`
- `frontend/src/store/useStore.ts`
- `backend/api/src/index.ts`
- `backend/api/src/routes/realtime.ts`
- `backend/api/src/routes/secureMessages.ts`
- chat-related database migrations

### Validation completed

- 25 August frontend TypeScript revalidation: passed (`npm run typecheck`).
- 25 August messaging-focused frontend revalidation: 71/71 passed across three files. These are helper/behavior tests, not two-device lifecycle proof.
- 25 August backend TypeScript build: passed (`npm run build`).
- The original backend test attempt did not produce a clean result: it ran beyond the intended filter, hit an unrelated media-finalization failure, and remained alive retrying unavailable Redis connections until stopped. No live chat endpoint or two-device test was completed in either pass.
- The two checked-in “golden” chat screenshots are 67-byte, 1×1 PNGs. They are not visual evidence.
- No native device or emulator render was available in this research pass.

Accordingly, visual findings below are code- and composition-based. Native geometry, keyboard behavior, animation feel and physical crop quality remain to be validated on-device.

---

## 3. The 2026 benchmark: what flagship messaging now means

Feature parity is not the goal, but the baseline has moved materially.

### 3.1 WhatsApp

WhatsApp's strength is not maximum feature density. It is a highly legible core loop, widespread behavioral familiarity, cross-device continuity, restrained controls and strong privacy positioning.

By 2026, its relevant baseline includes:

- default end-to-end encryption for personal messages and calls;
- reactions, replies, editing/deletion, voice notes, HD media and large-file sharing;
- message translation with on-device processing;
- groups with polls, events, reminders, member tags, `@all`, group history and side-group creation;
- voice/video calls, screen sharing and cross-device call transfer;
- disappearing messages, View Once, Chat Lock, hidden notification contents and stricter unknown-sender protections;
- per-chat storage management and cross-platform history transfer;
- direct iPad account creation, upgraded in-car continuity, and inline PDF viewing/annotation on web and desktop;
- increasingly private AI assistance that does not need to clutter the main conversation.

Official 2026 references:

- [WhatsApp group upgrades: polls, @all and side groups](https://about.fb.com/news/2026/08/were-upgrading-your-whatsapp-group-chats/amp/)
- [Member tags, text stickers and event reminders](https://about.fb.com/news/2026/01/whatsapp-group-chats-member-tags-text-stickers-event-reminders/)
- [Storage management, cross-platform transfer and private writing help](https://about.fb.com/news/2026/03/whatsapp-new-features-simplify-storage-switch-accounts/)
- [Web calling, device transfer, waiting rooms and noise suppression](https://about.fb.com/news/2026/07/whatsapp-web-calling-new-features/)
- [iPad account creation, in-car continuity and inline PDF tools](https://about.fb.com/news/2026/07/new-whatsapp-features-keep-up-with-the-way-you-actually-live/)
- [On-device message translation](https://about.fb.com/news/2025/09/introducing-message-translations-whatsapp/)
- [Strict protections for unknown attachments and callers](https://about.fb.com/news/2026/01/whatsapp-strict-account-settings-safeguarding-against-cyber-attacks/amp/)

**Lesson for ThryftVerse:** calm, familiar interaction is a competitive advantage. Do not confuse flagship with visible complexity.

### 3.2 Telegram

Telegram is the benchmark for power, coordination, search, large communities, automation and multi-device cloud continuity.

Relevant 2026 capabilities include:

- scheduled and repeating messages, including silent delivery;
- rich editing, large messages, formatting and inline media;
- communities that group chats, channels and bots under one navigable object;
- topics, polls, checklists, member tags, invite systems and highly developed group permissions;
- guest AI bots, streaming AI output, automation and private ephemeral bot replies;
- deep GIF/sticker search, media quality selection, voice trimming and large/full-resolution files;
- powerful global and in-chat search, folders and saved messages;
- calls, group calls, screen sharing and cross-platform clients.

Official references:

- [Telegram's July 2026 rich editor, communities and private bot replies](https://telegram.org/blog/communities-editor-invisible-messages/ar?setln=en)
- [Guest AI bots, silent scheduling and reaction moderation](https://telegram.org/blog/ai-bot-revolution-11-new-features)
- [Topic tabs, voice trimming and HD photos](https://telegram.org/blog/direct-to-channel-trim-voice-and-more/tr?setln=en)
- [Repeated scheduled messages](https://telegram.org/blog/live-stories-gift-auctions/be?setln=en)
- [Secure group calls](https://telegram.org/blog/group-calls-made-easy/fa?setln=en)
- [Telegram official release feed](https://telegram.org/blog?offset=0)

As of the 25 August 2026 cutoff, Telegram's official feed lists 14 July 2026 as its latest product release; no August 2026 Telegram release was available to include. This report does not invent or extrapolate unreleased capability.

**Lesson for ThryftVerse:** power should be progressive. The main composer stays simple; advanced behavior lives behind long-press, attachment context, search or group tools.

### 3.3 Signal

Signal is the benchmark for privacy that is implemented as an architecture, not a badge.

Relevant capabilities include:

- end-to-end encryption with per-message ratcheting and multi-device session management;
- automatic key transparency and manual safety-number verification;
- privacy-preserving usernames and message requests;
- edits with visible history, delivered/read status after editing;
- pins, polls, scheduled messages on Android, disappearing messages and sealed-sender controls;
- groups, stories, calls, call links, screen sharing, themes and secure backups;
- clear distinctions between Delete for me and Delete for everyone.

Official references:

- [Signal protocol specifications](https://signal.org/docs/)
- [Multi-device asynchronous session management](https://signal.org/docs/specifications/sesame/)
- [Automatic key verification](https://signal.org/blog/automatic-key-verification/)
- [Edit limits and visible edit history](https://support.signal.org/hc/en-us/articles/6255134251546-Edit-Message)
- [Pinned-message semantics](https://support.signal.org/hc/en-us/articles/10270961459226-Signal-Pinned-Messages)
- [Poll behavior](https://support.signal.org/hc/en-us/articles/9971667844506-Signal-Polls)
- [Privacy-preserving usernames and requests](https://support.signal.org/hc/en-us/articles/6712070553754-Phone-Number-Privacy-and-Usernames)

**Lesson for ThryftVerse:** encryption at rest on a server is not end-to-end encryption. Do not use “secure” as a visual adjective without a threat model and verifiable key architecture.

### 3.4 Apple Messages / iMessage

iMessage is the benchmark for native integration, low-friction expression and high-quality microinteraction.

Its 2026 baseline includes:

- inline replies, edits, unsend, scheduling, reactions and polls;
- audio messages, location, Check In, collaboration and app integrations;
- rich effects that are available but do not dominate ordinary conversation;
- typing/read states and continuity across Apple devices;
- end-to-end encryption and optional Contact Key Verification;
- RCS/SMS fallback with visible transport distinction;
- unknown-sender screening and spam reporting.

Official references:

- [Messages features in iOS 26](https://support.apple.com/guide/iphone/about-imessage-iph4e9799206/26/ios/26)
- [Edit and Undo Send semantics](https://support.apple.com/en-asia/guide/iphone/iphe67195653/26/ios/26)
- [Contact Key Verification](https://support.apple.com/en-ie/118246)

**Lesson for ThryftVerse:** native quality is mostly invisible—keyboard continuity, tactile targets, stable geometry, careful animation and reliable state—not ornament.

---

## 4. Competitive capability matrix

Legend: **Yes** = mature product capability; **Partial** = constrained, divergent or not proven end-to-end; **No** = materially absent; **Local** = current ThryftVerse UI/store only; **Broken** = visible contract conflicts with backend/runtime. ThryftVerse status reflects current `f82f74a5`, not schema intent.

| Capability | WhatsApp | Telegram | Signal | iMessage | ThryftVerse now |
|---|---:|---:|---:|---:|---:|
| Idempotent text send | Yes | Yes | Yes | Yes | Partial; DM fixed, GroupChat divergent |
| Persistent offline outbox | Yes | Yes | Yes | Yes | Partial; DM text rows exist, reconnect/group integration absent |
| Delivered/read lifecycle | Yes | Yes | Yes | Yes | Partial; server read cursor exists, bubble lifecycle not hydrated |
| Correct latest-message pagination | Yes | Yes | Yes | Yes | Partial; server fixed, client history pagination absent |
| Reply persistence | Yes | Yes | Yes | Yes | Partial; DM yes, GroupChat no |
| Reactions persistence | Yes | Yes | Yes | Yes | Partial; DB/API yes, realtime/rollback no |
| Edit with history | Yes | Yes | Yes | Yes | No |
| Delete for me / everyone | Yes | Yes | Yes | Yes | Broken; tombstone read filter and UI semantics missing |
| Voice messages | Yes | Yes | Yes | Yes | Component exists; not wired end-to-end |
| Cross-device media | Yes | Yes | Yes | Yes | Partial; canonical URL upload, no server asset binding |
| Documents/files | Yes | Yes | Yes | Yes | No in canonical chat |
| Location/contact sharing | Yes | Yes | Partial | Yes | No in canonical chat |
| In-chat search across history | Yes | Yes | Yes | Yes | Loaded-page only |
| Pins/bookmarks | Yes | Yes | Yes | Partial | Conversation pin remains local; no message pins |
| Polls/events/coordination | Yes | Yes | Yes | Yes | No |
| Topics/side conversations | Emerging | Yes | No | No | No |
| Calls | Yes | Yes | Yes | Yes | No |
| Message requests | Yes | Yes | Yes | Yes | Partial; creation/hydration yes, send/push/privacy gates incomplete |
| Per-chat mute/archive hydration | Yes | Yes | Yes | Yes | Yes for state; push suppression still broken |
| Disappearing/View Once | Yes | Yes | Yes | Partial | No |
| Default E2EE | Yes | Secret-chat dependent | Yes | Yes | No |
| Multi-device crypto identity | Yes | Cloud/secret-chat model | Yes | Yes | No |
| AI help without group clutter | Sidechat/incognito direction | Private ephemeral bot replies | No | Writing tools | Broken in GroupChat; demo response enters transcript |
| Native marketplace transaction context | No | No | No | No | Partial and strategically valuable |

The conclusion is not that ThryftVerse should ship every cell. Calls, channels and giant communities may be low-value. The non-negotiable parity layer is: exactly-once appearance, history, receipts, offline behavior, replies, reactions, edit/delete semantics, media, search, request/privacy enforcement and truthful security.

---

## 5. Current ThryftVerse: what is already strong

The department is not a blank slate. Several foundations are worth preserving:

1. **FlashList and memoization are used.** The inbox and conversation lists are virtualized, with stable callbacks and explicit attempts to prevent historical message reanimation.
2. **Realtime authorization exists.** Conversation topics are authorized server-side before WS/SSE subscription.
3. **Redis pub/sub supports cross-instance fan-out.** Sequence numbers use Redis with fallback, and the client can request a resnapshot after gaps.
4. **Send idempotency has begun.** `client_message_id` and a partial unique index exist, which is the correct direction.
5. **Typing is server-fanned and ephemeral.** The API does not waste durable rows on typing state.
6. **Composer drafts have a cross-device persistence design.** The schema can retain draft text, reply target and finalized attachment references.
7. **Group administration is unusually developed.** Membership, roles, ownership transfer and invite links have server routes.
8. **Commerce context is recognized as a first-class need.** Listing bars, offer cards, order milestones and safety warnings point toward the right differentiation.
9. **Accessibility effort is visible.** Many controls have roles, labels, state and practical targets.
10. **The visual direction has some restraint.** Inbox rows are flat rather than card-on-card, header utilities generally use transparent hit areas, and new-message/reaction animation attempts respect reduced motion.

The upgrade should consolidate and complete these strengths—not discard them.

---

## 6. Critical findings: source-of-truth and lifecycle

Status vocabulary in this section is deliberately strict: **resolved** means the complete visible path is closed; **partial** means useful code landed but the cross-device state machine is not complete; **open** means the user-facing guarantee is still absent.

### P0.1 DM optimistic/realtime reconciliation — substantially resolved, GroupChat open

The canonical DM path now echoes `clientMessageId` from create, fetch and realtime and reconciles the optimistic bubble by that identity. The server has a matching unique conflict backstop. This is the correct architecture.

GroupChat still deduplicates only by server ID and keeps a separate send engine. It can append the realtime message and later rename the optimistic message, recreating the original race.

**Owner fix:** delete the independent GroupChat send/realtime state machine. Route DM and group through one conversation controller and one tested reconciliation function.

### P0.2 Unknown network outcome — partial

DM text now enters `reconciling`, which is honest. GroupChat removes the bubble and says it failed; media marks upload failed even when upload succeeded and only the message response was lost; agent drafts also collapse ambiguous outcome into failure.

**Owner fix:** apply `queued → sending → accepted → delivered → read`, plus `reconciling`, to every message kind and conversation type. Query/replay by idempotency key before declaring failure.

### P0.3 Latest history and pagination — server resolved, client partial

The server correctly selects the newest page and supports keyset `before`, `after` and `aroundMessageId`. The frontend service still exposes only `limit`, discards `hasMore` and both cursors, and replaces the loaded list with at most 120 messages. Scroll-back history and jump-to-unloaded-result are therefore not shipped.

**Owner fix:** expose a typed page contract, prepend older pages while preserving the visible anchor, and use `aroundMessageId` for search/reply jumps.

### P0.4 Media delivery — improved, still not a trusted asset pipeline

Canonical DM photo/video now uploads before message send and sends the returned public URL, so the original sender-local URI defect is improved. The server still accepts any client URL, persists it inside metadata, and does not bind or authorize `chat_message_attachments`. A finalized upload receipt, ownership check and moderation/scan state are not enforced at message commit.

Media message unknown outcomes are also unsafe: retry reuploads and generates a new `clientMessageId`, which can create duplicate messages after a dropped response.

**Owner fix:** `pick/capture → local preview → upload/finalize receipt → message attachment asset ID → server authorization → canonical renditions → idempotent retry`. Never accept an arbitrary URL as attachment authority.

### P0.5 Delete for me/everyone — endpoint added, behavior broken

The backend now separates `scope=me` and `scope=everyone`. However, reads never filter `chat_message_deletions`, so delete-for-me content returns on reload. The canonical UI exposes one generic “Delete” action and always calls `scope=me`; GroupChat immediately says “Message deleted” and discards API failure.

**Owner fix:** apply the per-user tombstone to every list, around-message, search, shared-media and reply-target read. Present explicit “Delete for me” and policy-gated “Delete for everyone” choices, with unknown-outcome handling and realtime convergence.

### P0.6 Conversation deletion/leave semantics — partially resolved, needs product verification

The client can now send explicit `scope=me` or `scope=leave`, and the backend has separate paths. Every inbox/info label and navigation outcome must still be verified against that distinction, especially for DMs versus groups.

**Owner fix:** use Archive/Clear from inbox-management context and Leave group only from group membership context. Never render group-leave semantics in a DM.

### P0.7 Read receipts — backend foundation, client still decorative

`chat_members.last_read_at` now exists, mark-read writes it, and the server publishes `chat.message.read`. But `useChatReadReceiptEvent` has no caller, fetched messages do not derive delivered/read status, and `chat_message_read_receipts` is never written. The server also does not enforce `read_receipts_enabled` or request-pending privacy when publishing the receipt.

**Owner fix:** use a message/sequence read cursor, consume it in the active conversation and details views, hide receipts before request acceptance, and make privacy reciprocal and server-enforced.

### P0.8 Reply persistence — DM resolved, GroupChat open

The DM contract now sends and validates `replyToMessageId`. GroupChat sets the local reply target but calls `sendConversationMessageOnApi` without the option, so its reply disappears after refresh.

**Owner fix:** converge engines. Reply rendering must also fetch context around an unloaded parent and handle a deleted parent with an honest tombstone.

### P0.9 Reactions — persistence added, convergence partial

Reaction table and add/remove routes now exist, and fetched messages serialize aggregated reactions. Client mutations are fire-and-forget without rollback, and the published add/remove realtime events have no subscriber. Other devices update only after refetch.

**Owner fix:** use optimistic mutation IDs, rollback/reconcile on failure, consume mutation events, and cover deleted/request-restricted messages.

### P0.10 Fake translation — resolved by removal

The prior action that relabeled unchanged text as “Translated” is absent from the canonical current path. Keep it absent until real translation can preserve original text, language provenance, privacy mode and failure state.

### P0.11 Conversation reports — route resolved, mutation semantics partial

The server now returns a real report ID and status, and current group reporting waits for the response before success. Submission has no idempotency key or unknown-outcome reconciliation, so a dropped response can create duplicate reports or encourage unsafe retry.

**Owner fix:** idempotent report submission, evidence authorization, safe retry, explicit unknown outcome, and a canonical report sheet shared by DM/group.

### P0.12 Per-user conversation state — partial

Mute, archive and request status now hydrate into the conversation projection. Pin and manual mark-unread have schema/projection fields but the store toggle remains local and there are no matching chat routes. Hydrated values therefore overwrite rather than validate those local promises.

**Owner fix:** one server projection and mutation API for mute, archive, request, pin and private mark-unread, with optimistic rollback and cross-device events.

### P0.13 Message requests/privacy — creation fixed, enforcement incomplete

DM creation now reads `allow_messages_from` and relationship state and seeds a pending request for the recipient. The send route does not enforce request state, limit the sender to an initial request, block rich attachments, or suppress read receipts. Notification fan-out also ignores pending status.

`allow_messages_from = nobody` currently means “create a pending request,” which may contradict user intent; product policy must explicitly decide whether it means no requests or requests-only.

**Owner fix:** authorize every send and attachment against sender/recipient request state, trust tier and rate limits; suppress ordinary push and receipt leakage until acceptance.

### P0.14 Offline outbox — foundation added, runtime promise not closed

DM text failures can persist in `mutation_outbox` with the original `clientMessageId`, and a drain function can replay idempotently. But `initChatOutboxDrain()` is never called, the conversation's reconnect listener only resyncs messages, GroupChat bypasses the outbox, media is not queued safely, and terminal outbox failures have no recovery UI.

**Owner fix:** one app-owned drain lifecycle covering startup, reconnect and foreground; a message-kind-safe payload; per-entry reconciliation callback; backoff/terminal retry UI; app-kill tests.

### P0.15 Production chat is not end-to-end encrypted — open

Canonical messages are stored as plaintext `body` plus metadata in `chat_messages`. A separate `secure_messages` route uses server-side envelope encryption and server-side decryption, is not used by the main chat, and is still not E2EE because the server holds decryption capability.

The separate route also accepts a client-supplied `senderId` and does not visibly perform conversation-membership authorization inside the route module. Even if a global auth hook protects it, sender binding and conversation access must be explicit.

**Owner fix:** choose and document the security model before making claims:

- Near term: TLS + database/KMS encryption at rest + strict access controls, described honestly.
- Future E2EE: client device identities, prekeys, ratcheting, multi-device fan-out, attachment keys, group key management, key verification, backup recovery, reporting flow and key-change UX.

Signal's published architecture shows why this cannot be implemented as one encrypted column.

---

## 7. Important P1 findings

### 7.1 Two canonical chat screens are drifting

`ChatScreen.tsx` already has group-aware branches, while `GroupChatScreen.tsx` independently implements another send, realtime, typing, reply, reaction and agent path. Their capability sets and failure behavior differ materially. The second engine is responsible for multiple P0 defects listed above.

**Recommendation:** one conversation engine and one rendered conversation surface, parameterized by conversation capabilities. Group-specific headers and management remain focused components.

### 7.2 Domain types are fragmented

`frontend/src/domain/conversation.ts` and `hooks/chat/types.ts` still define different message shapes. Mapping now preserves replies and reactions, but still drops client identity, edit state, deletion state, attachment identity, delivery state and reload-safe structured commerce state. Backend metadata remains an unbounded escape hatch.

**Recommendation:** generate or share one versioned message contract. Do not use JSON metadata as an unbounded substitute for domain modeling.

### 7.3 Search is not history search

Inbox search scans title, last message and only the last ten locally stored message texts. In-chat search only searches the loaded array. Results change depending on what happened to be hydrated.

**Recommendation:** server search with cursor pagination and filters for sender, media, links, offers and date. If future E2EE is chosen, define a local encrypted index instead of silently weakening privacy.

### 7.4 Realtime replay is not durable across restart/instance

Sequence numbers and pub/sub are Redis-backed, but the replay ring buffer is process memory. A reconnect routed to another instance or after restart may know there is a gap but cannot replay it.

**Recommendation:** durable conversation event log/outbox, or always canonical-resnapshot on chat gaps. Do not imply durable replay from an in-memory buffer.

### 7.5 Push behavior is not visibly coupled to per-chat mute/request state

The send handler queues notifications for every other participant. Per-chat mute and pending-request policy are not visibly checked in that transaction.

**Recommendation:** notification projection must read per-user state and mention priority. Muted means no ordinary push; request notifications should be low-detail and rate-limited; `@all`/urgent semantics need separate user controls.

### 7.6 Voice is scaffolding, not a capability

A recorder and player exist, but canonical `ChatScreen` does not pass `onVoiceSend`; the backend message union accepts only text/image/video. Waveforms use random visual bars rather than decoded/recorded amplitude data.

**Recommendation:** either remove the dormant surface or finish audio upload, duration/waveform extraction, playback progress, background audio, speed, seek, trim/cancel, retry and accessibility.

### 7.7 Commerce cards are promising but not reload-safe

Offer and order UI exists, but the chat message mapper does not reconstruct these typed states from the backend. A rich card that degrades to text after reload is prototype behavior.

**Recommendation:** commerce events should be immutable, server-authored message/event projections linked to offer/order IDs. The frontend must never infer a protected milestone from message text.

### 7.8 Loading geometry and visual evidence are not proved

Skeletons and state components exist, but the checked-in golden assets are 1×1 images. No credible before/after or parity gate currently protects the inbox/chat silhouette.

**Recommendation:** real device-sized baselines for light/dark, loading/populated/empty/error/offline, large text and keyboard-open states. Keep captures local unless explicitly requested for source control.

### 7.9 GroupChat violates truthful AI and anti-AI composition policy

The group composer shows an agent-chip rail, a separate “Manage AI agents” row and explanatory caption, then injects a deterministic demo response into the human transcript after send. This simultaneously creates label duplication, chrome around secondary controls, and a false participant/history object. The UI comments openly identify the runtime as demo-mode.

**Recommendation:** remove the demo injection and production entry point until a deployed backend runtime is verified. When enabled, use one quiet, capability-gated entry point. Default to private draft/sidecar results, disclose context and retention, label agent identity at the message boundary, and require confirmation for send or commerce actions.

### 7.10 Schema completion is being mistaken for product completion

Migration 149 creates edit revisions, attachment identity and per-message read receipts, but current route coverage has no edit mutation/history API, does not bind the attachment table, and does not write per-message receipts. Comments say gaps are closed before the execution paths exist.

**Recommendation:** capability status must be derived from the vertical live-sign chain—migration, transaction, serializer, client contract, mutation, realtime, state matrix and two-device proof—not from table presence or comments.

---

## 8. Psychology: why flagship messaging feels flagship

Messaging is a social nervous system. Its psychology differs from browsing or dashboards.

### 8.1 Reduce uncertainty before adding delight

The user silently asks: “Did it send? Did they get it? Did they see it? Am I replying to the right thing?” A trustworthy lifecycle lowers cognitive load. False certainty damages trust more than a slower but honest state.

Design implication:

- paint the optimistic bubble immediately;
- distinguish queued, sending, unknown/reconciling, accepted, delivered, read and failed;
- keep status quiet unless action is needed;
- never show success just because local state changed.

### 8.2 Read receipts help coordination and create social pressure

Research shows responsiveness is strongly situational, not just a stable personal trait. Read receipts reduce uncertainty, but other studies associate them with tension, accountability and pressure to respond.

- [Responsiveness in WhatsApp varies strongly by situation and relationship](https://journals.sagepub.com/doi/pdf/10.1177/2050157920943926)
- [Read-receipt attentiveness and negative emotion in workplace messaging](https://journals.sagepub.com/doi/10.1089/cyber.2023.0354)
- [Young people's tactics for avoiding read-receipt pressure](https://journals.sagepub.com/doi/10.1177/1354856520918987)

Design implication:

- read receipts must be reciprocal and controllable;
- message requests should not leak read state before acceptance;
- group receipts belong in message details, not beside every bubble;
- “mark unread” is a private reminder, not a reversal of what the sender already knows.

### 8.3 Typing indicators are turn-taking signals, not decoration

Typing signals tell the receiver whether to wait before sending another thought. They should appear only for a live, authorized participant and expire quickly after disconnect or inactivity.

Design implication:

- render one quiet `typing…`/name cue near the conversation title or composer;
- do not run decorative infinite animation in every inbox row;
- never fabricate presence from “recently active.”

### 8.4 Reactions are low-cost “listenership”

A reaction communicates acknowledgment without adding another message. Research on instant-message listenership identifies minimal responses and stickers/reactions as important ways people show they are attending.

- [Listenership in instant messaging](https://journals.sagepub.com/doi/10.1177/1461445618770471)

Design implication:

- make the first reaction one gesture away;
- do not show a large picker before the user expresses intent;
- animate the changed reaction, not the whole bubble/list;
- persist and synchronize it or do not expose it.

### 8.5 Stable spatial memory is emotional calm

Inbox rows moving unpredictably, unread counts changing after reload, or duplicated messages create a feeling that the product is unsafe. A stable ordering and deterministic scroll anchor matter more than flourish.

Design implication:

- deterministic `(created_at, id)` ordering;
- preserve viewport anchor while prepending history;
- merge optimistic and server identities;
- avoid layout shift between skeleton and final content.

### 8.6 Context prevents costly mistakes

Marketplace conversations have higher stakes than social chat. The buyer may be discussing several visually similar products; the seller may handle many buyers. Identity, listing and order context prevent sending money, promises or evidence into the wrong thread.

Design implication:

- one slim listing/transaction context strip, not a dashboard stack;
- show the current listing image/title/price or current order milestone only when evidenced;
- keep a durable audit trail for structured offers and order events;
- separate human text from server-authored commerce events.

### 8.7 Safety works at the decision point

Permanent warning banners become wallpaper. The useful intervention appears when the user is about to share payment details, leave the platform, open unknown media or accept a risky request.

Design implication:

- progressive, context-specific nudges;
- explain consequence and recovery in one sentence;
- provide Report/Block/Keep on ThryftVerse actions;
- do not over-badge every ordinary message.

### 8.8 Interruption is a cost

Large-scale notification research shows quieter, context-aware intervention can reduce unnecessary actions without materially destroying opt-in value.

- [Google's large-scale study of quieter notification prompting](https://research.google/pubs/shhhbe-quiet-reducing-the-unwanted-interruptions-of-notification-permission-prompts-on-chrome/)

Design implication:

- ask for push after demonstrated value, not on first app open;
- group bursts, suppress muted chats, respect quiet hours;
- escalate only trusted transaction deadlines, direct mentions or safety events;
- notification preview privacy is a user choice.

### 8.9 AI must preserve human agency

AI inside a personal conversation creates a new audience. If it appears as another participant, users can reasonably assume it reads the thread. Flagship systems make scope, visibility, retention and authority explicit.

Design implication:

- default AI to a private sidecar or local draft assistant;
- never inject mock AI replies into production history;
- show exactly what context will be shared before invocation;
- require user confirmation for sends and all commerce actions;
- use private ephemeral results for summaries/errors instead of group clutter.

---

## 9. Anti-AI-made design policy for messaging

### 9.1 Inbox composition

The dominant object is the conversation identity and its latest meaningful state. The inbox should be a flat, fast list—not a set of equal rounded cards.

Rules:

- Header: title plus at most search and compose; settings moves behind overflow/profile.
- First viewport: about 5–6 useful conversation rows on a normal phone.
- Segment rail: `All`, `Buying`, `Selling`; unread/requests/archive live in filters unless count/action makes them urgent.
- Row: avatar/media identity, name, one preview line, time, one quiet state marker.
- Do not show member count, bot badge, draft badge, pin, mute, unread count, item thumbnail and “needs action” simultaneously. Resolve a priority order.
- Pinned and unread affect order/weight; they should not turn rows into decorated panels.
- Search expands in place and preserves list position.

### 9.2 Conversation composition

The dominant object is message history. Header, listing context and composer must recede.

Rules:

- Transparent 44pt Back/search/overflow hit areas with 20–24pt glyphs.
- One slim contextual strip above the history for listing/order context; never stack listing bar + transaction strip + warnings + AI status above the fold.
- Human bubbles use a simple two-party grammar. System commerce events use a separate, flatter grammar.
- Real media is the visual color. No grey placeholder as the dominant object.
- Timestamps appear at cluster endings or on detail/gesture—not on every line.
- Delivery status appears only on the latest relevant outgoing bubble unless message details are opened.
- Keep reaction badges attached to the bubble edge and visually lighter than the message.

### 9.3 Composer composition

The composer is one input boundary, not a toolbar of possibilities.

Rules:

- Left: one transparent `+` target.
- Center: one expanding text field.
- Right: camera/mic when empty; send when text/attachment exists.
- Reply/edit/attachment/AI states occupy one contextual slot directly above the field.
- Attachment sheet prioritizes Photo, Camera, Listing, Document, then More. Avoid a grid of 80pt colored circles.
- Avoid labels and descriptions for familiar actions. “Photo,” “Camera,” “Listing” is enough.
- AI is not a permanent sparkle control in the primary composer.

### 9.4 Motion

- Input-to-bubble feedback should feel immediate.
- New bubble: subtle 160–220ms fade/scale, only for genuinely new messages.
- Reaction: animate only the reaction.
- Typing: low-amplitude and finite after lost heartbeat.
- Prepending history: no animation.
- Respect reduced motion with instant state or simple fade.
- No continuous pulsing inbox rows.

### 9.5 Current visual/code smells to remove

- Two attachment-sheet systems with divergent capabilities.
- Multiple message type definitions and duplicated group/DM engines.
- Attachment/action rows wrapped in equal surfaces with icon circles, subtitles and chevrons.
- Permanent agent chips, a separate management row and explanatory caption around one secondary capability.
- Demo-agent transcript messages that visually impersonate canonical participants/history.
- Randomly generated voice waveforms that look active but do not represent audio.
- Screen-local compensation for backend gaps.

---

## 10. Target product architecture

### 10.1 Canonical entities

```text
Conversation
  id, type, title, listing/order context, created_at, latest_sequence

ConversationMember
  conversation_id, user_id, role, joined_sequence, left_sequence

ConversationUserState (private)
  archived_at, muted_until, pinned_rank, marked_unread_message_id,
  last_read_message_id, notification_policy, request_status

Message (immutable identity)
  id, conversation_id, client_message_id, sender_id/device_id,
  kind, body/document, reply_to_id, created_at, server_sequence,
  edit_version, deleted_for_everyone_at

MessageRevision
  message_id, version, body/document, edited_at, actor_id

MessageRecipientState
  message_id, user_id/device_id, delivered_at, read_at

MessageReaction
  message_id, actor_id, emoji, created_at

MessageAttachment
  message_id, media_asset_id, kind, dimensions, duration,
  rendition manifest, moderation state

ConversationEvent
  durable sequence, typed payload, created_at
```

Commerce messages should reference canonical offer/order entities. The chat projection renders those entities; it does not duplicate financial truth in arbitrary message metadata.

### 10.2 Send protocol

```text
1. Client persists outbox row with clientMessageId.
2. UI paints queued/optimistic bubble from outbox.
3. Attachments finalize before message commit, or message is committed as an explicit uploading state.
4. POST message with idempotency key and typed payload.
5. Server transaction:
   authorize membership/request policy
   validate reply/attachments/commerce references
   insert or replay idempotent message
   allocate durable conversation sequence
   append outbox/realtime event
   commit
6. Response and realtime both echo clientMessageId + server ID + sequence.
7. Client reconciles one bubble by clientMessageId.
8. Delivery/read events advance recipient cursors.
9. Unknown HTTP outcome enters reconciling; client queries by clientMessageId.
```

### 10.3 Realtime

- Redis pub/sub remains fan-out, not truth.
- Durable DB/outbox sequence remains truth.
- Reconnect uses `afterSequence`; server replays durable events or orders a canonical resnapshot.
- Every mutation—create, edit, tombstone, reaction, receipt, pin, membership—has a versioned event.
- Clients ignore unknown versions and refetch on schema incompatibility.

### 10.4 Media

- Reuse the canonical upload/finalization and media-binding platform.
- Bind only finalized assets owned/authorized for the actor.
- Generate message-appropriate thumbnails and streaming renditions.
- Preserve original aspect ratio and focal metadata.
- Scan documents and unknown media; gate downloads from requests.
- Support cancellable progress and retry without creating duplicate messages.

### 10.5 Security model

Make an explicit product decision, not a marketing decision.

**Recommended near-term launch position:** authenticated TLS transport, KMS-backed encryption at rest, strict row authorization, limited retention and truthful privacy copy. Do not claim E2EE.

**E2EE exploration track:** use a reviewed protocol/library rather than inventing crypto. The design must include multi-device sessions, forward secrecy, post-compromise recovery, attachment encryption, group membership changes, backups, key transparency and report-with-consent. Structured commerce events can remain server-signed objects whose business truth is independently verifiable.

### 10.6 Search

- Non-E2EE model: Postgres FTS/trigram or dedicated index scoped by membership, with durable deletion handling.
- E2EE model: encrypted local device index and optional cross-device encrypted index strategy.
- Filters: people, media, links, offers/orders and dates.
- “Jump to result” fetches context around the message ID.

---

## 11. Recommended implementation program

Timings are sequencing guidance, not a commitment. Each wave should ship vertically across DB, API, realtime, client and states.

### Wave 0 — Truth and data integrity (P0)

Foundations already landed: DM `clientMessageId` reconciliation, newest-page server pagination, typed DM reply target, photo/video pre-upload, message lifecycle schema, reaction/report/delete APIs, read cursor, mute/archive/request hydration, request creation policy, removal of fake translation, and a text outbox module.

They are not Wave 0 exit evidence. Complete the following in order:

1. Freeze new visible chat features and remove/feature-gate demo agent UI from production.
2. Converge `ChatScreen` and `GroupChatScreen` on one conversation controller before fixing more screen-local symptoms.
3. Define one versioned message/page/mutation contract and eliminate metadata-only lifecycle fields.
4. Apply `clientMessageId`, unknown-outcome reconciliation and durable outbox behavior to DM, group, media, agent-confirmed and structured commerce messages.
5. Mount one application-owned outbox drain; prove reconnect, foreground, app-kill and terminal retry behavior.
6. Expose history cursors to the client, preserve scroll anchor, and use around-message fetch.
7. Bind only finalized, owned and authorized media assets at message commit; queue/retry media without duplicate upload or message creation.
8. Apply delete-for-me tombstones to every read projection; add explicit delete-for-everyone UI and live mutation handling.
9. Consume reaction, delete and read realtime events; reconcile optimistic mutations and second-device state.
10. Enforce read-receipt privacy and request-pending gates server-side.
11. Persist pin and private mark-unread; make notification fan-out honor mute, request, mention and quiet-hour policy.
12. Make report submission idempotent and unknown-outcome safe.
13. Remove the false GroupChat self-typing indicator and subscribe to authorized remote typers only.
14. Harden or remove the unused `secure_messages` route and document canonical chat's server-readable security model.

**Exit gate:** two devices can exchange 1,000 messages with induced duplicate requests, dropped responses, reconnects and app restarts with zero duplicates, zero lost accepted messages and truthful final state.

### Wave 1 — Core parity

1. Edit with bounded window, edit history and receipt preservation.
2. Server-backed in-chat/inbox search with around-message jump.
3. Delivered/read message details and group read-details sheet.
4. Real voice messages: permission, lock/pause/trim, real waveform, upload, background playback, speed, seek and retry.
5. Documents and safe file handling with scanning and request-state gates.
6. Shared-media/links/docs views backed by server pagination and deletion propagation.
7. Message pins/bookmarks with permissions and cross-device state.
8. Notification quiet hours, bundling and private preview controls.

**Exit gate:** reload, second-device and offline parity for every visible action.

### Wave 2 — Group coordination

Prioritize features that serve marketplace collaboration rather than copying social apps wholesale:

1. message pins;
2. `@mentions` and notification controls;
3. polls for group buying/style decisions;
4. member tags/roles;
5. side conversation from selected members;
6. optional topics only if real group usage demonstrates overload;
7. event/reminder objects only where they map to drops, meetups or fulfilment.

### Wave 3 — ThryftVerse differentiation

1. **Listing-aware conversation identity:** unmistakable item/person pairing.
2. **Structured offer thread:** offer, counter, expiry and acceptance from canonical commerce state.
3. **Transaction milestone strip:** only the next actionable milestone; full history in details.
4. **Evidence request/send:** “Send another photo,” serial/condition evidence, shipping proof.
5. **Protected handoff:** checkout and dispute start with correct context and no fabricated success.
6. **Scam-resistant requests:** trust context, shared history, account age only when backend-evidenced.
7. **Seller workflow:** labels/folders/quick replies/SLA tools that do not leak fabricated response rates.

### Wave 4 — Private AI, only after the message core is trusted

1. Private draft assistant or sidechat by default.
2. Explicit context selector: current message, selected messages, listing, order.
3. Server runtime readiness; no keyword mock presented as AI.
4. Human confirmation for sends and commerce actions.
5. Ephemeral private errors/menus in groups.
6. Auditable tool calls and permission scopes.
7. Incognito mode/retention choice if the backend can actually guarantee it.

---

## 12. What not to build yet

- A visible calls tab before text/media reliability is proven.
- Decorative chat themes, gradients or bubble effects.
- A giant attachment grid full of disabled/future actions.
- AI summaries of a history that is not correctly paginated.
- “Encrypted” badges for server-decryptable data.
- Presence/response-rate/verified seller signals without backend evidence.
- Channels or 100k-member communities without product demand and moderation infrastructure.
- End-to-end encryption via bespoke cryptography.

---

## 13. Quality and acceptance gates

### Reliability SLOs

- Accepted message loss: 0 in fault-injection suite.
- Duplicate visible messages: 0 in fault-injection suite.
- Send feedback paint: under 100ms on target devices.
- Warm conversation open to useful content: target under 1s p95.
- Cold open: target under 2s p95 on supported network profile.
- Reconnect converges without manual refresh.
- Every mutation idempotent or safely reconcilable.
- No timer, listener, recorder or subscription leaks.

### UX gates

- Inbox exposes 5–6 useful rows on target viewport.
- Conversation first viewport is dominated by people/media/messages, not chrome.
- At most one persistent non-media context strip above history.
- Loading skeleton and final layout have negligible geometry shift.
- Keyboard open/close preserves draft and scroll anchor.
- Large text keeps names, price, composer and primary actions reachable.
- Light/dark geometry is identical.
- Thumbnail and squint tests pass.

### State matrix

Every touched feature must cover:

```text
loading, populated, empty, filtered-empty, offline, reconnecting,
queued, sending, unknown/reconciling, accepted, delivered, read,
failed-retryable, failed-terminal, permission denied, missing media,
partial history, deleted, edited, blocked/request-pending
```

### Security gates

- Sender identity comes only from authenticated server context.
- Membership/request authorization on every read and mutation.
- Attachments must be finalized, owned, scanned and authorized.
- Rate limits by user, conversation, device and trust state.
- Abuse reporting returns a real report ID and preserves evidence.
- Privacy settings enforced by server projections/events, not only UI.
- Threat model and data-retention policy reviewed before any security claim.

### Test program

1. Contract tests for every chat route and mapper.
2. Two-device native E2E tests for send/reply/react/edit/delete/read/media.
3. Dropped-response and duplicate-request tests.
4. Offline queue/app-kill/restart tests.
5. Multi-instance realtime/replay tests.
6. Pagination at 0, 1, 120, 121, 10k messages.
7. Request/block/privacy matrix.
8. Media virus/moderation/ownership/finalization tests.
9. Accessibility and large-text native tests.
10. Real screenshot baselines, not source-string or 1×1 placeholders.

---

## 14. Metrics that matter

Do not use number of shipped chat features as the success metric.

### Trust and reliability

- send acceptance rate;
- unknown-outcome frequency and reconciliation time;
- duplicate and missing-message incidents;
- media upload completion/retry rate;
- reconnect convergence time;
- report success/failure/abandonment;
- block-after-request and spam-request rates.

### Conversation quality

- conversation start → first human reply;
- reply latency distribution by relationship/context, not pressure-inducing public scores;
- percentage of conversations using replies/reactions instead of duplicate clarification;
- search-to-jump success;
- mute rate after burst notifications;
- group mention/poll completion without notification overload.

### Marketplace outcome

- listing message → protected offer;
- offer → checkout conversion;
- time to resolve buyer question;
- off-platform-payment warning → protected-flow retention;
- evidence request → evidence supplied;
- dispute contact → correct order-context handoff.

Metrics must be privacy-minimized and should never become unsupported trust badges in the UI.

---

## 15. Final product direction

The flagship ThryftVerse message department should feel:

- as calm and immediately legible as WhatsApp;
- as reliable and privacy-explicit as Signal;
- as powerful under progressive disclosure as Telegram;
- as native and tactile as iMessage;
- more transaction-aware and scam-resistant than any of them.

The winning surface is not the one with the most icons. It is the one where a buyer can ask a question, receive evidence, negotiate, pay, track and recover from a problem without ever wondering whether the message, person, product or transaction state is real.

That requires a deliberate order:

```text
truth → lifecycle → cross-device continuity → core parity → coordination → differentiation → private AI
```

Anything else produces a feature-rich prototype. This order produces a flagship product.

---

## 16. Audit status

**Report status:** COMPLETE — TARGET MET  
**Implementation status:** PARTIAL — meaningful Wave 0 foundations landed, but cross-surface and cross-device guarantees remain open
**Competitive parity verdict:** NO — neither 1:1 feature parity nor flagship core-quality parity is currently met
**Native visual validation:** PENDING  
**Live endpoint validation:** PENDING  
**Static validation at reviewed HEAD:** frontend TypeScript passed; backend TypeScript build passed; 71/71 messaging-focused frontend tests passed
**Primary blockers:** converge DM/group engines; finish the outbox runtime; filter delete tombstones; consume read/reaction/delete events; enforce mute/request/privacy in push and send; bind canonical media assets; remove demo AI transcript behavior
**Product completion status:** PARTIAL — INTERACTION FAILURES REMAIN
