# P2 #28 — Offline-First Mutation Reliability

**Auditor:** Senior full-stack SWE audit (evidence-based)
**Scope:** Drafts, uploads, messages, orders, money operations — durable queues + unknown-outcome reconciliation
**Date:** 2026-01-30
**Repo:** `C:\Users\User\Desktop\thryftverse-upgrade`

---

## Executive Finding

ThryftVerse has **asymmetric maturity**: the backend has production-grade idempotency, webhook deduplication, an unknown-outcome status model, and a transactional domain outbox, while the frontend has a **well-designed but half-wired** offline layer. A durable SQLite `mutation_outbox` table and a pull/push sync engine exist as typed contracts, but the sync engine is a self-described stub whose `runSync` is never invoked, the backend `/sync/push` and `/sync/{domain}` endpoints it targets do not exist, and the `listing_draft` table is defined in schema but never written to. The only domain that actually uses the durable outbox is chat messages (`chatOutbox.ts`), and even there the app-startup drain initialiser (`initChatOutboxDrain`) is never called — the outbox only flushes opportunistically when a conversation screen mounts.

Uploads have two parallel systems: an in-memory `MediaUploadQueue` (lost on process kill) and a persisted `UploadManager` with resumable multipart support that is **disabled by default** because the backend exposes no multipart endpoints. Listing publication relies on an in-memory Zustand recovery object rather than the durable outbox, and `createListingOnApi` sends no idempotency key. Money operations (orders, offers, auctions, payments) have strong server-side idempotency, but several client call sites generate idempotency keys with `Date.now()`, which produces a **new key on every retry** — defeating server-side dedup and creating double-spend/duplicate-order risk on unknown outcomes. There is no generic client-side request journal or unknown-outcome reconciliation protocol outside chat.

**Verdict:** The architecture is ~40% built. The schema and contracts are flagship-shaped; the wiring, backend endpoints, and client-side retry discipline are not. This is a P2 that is one integration pass away from being a real offline-first product — but today, a network drop during checkout, withdrawal, listing publish, or media upload can silently lose the operation or duplicate it.

---

## Evidence Table

### Drafts

| Layer | Path:Line | Assessment |
|---|---|---|
| FE Schema | `frontend/src/storage/schema.ts:111-133` | `listing_draft` table defined with `sync_state` (draft→pending→pushing→synced\|conflict), `base_rev`, `server_rev`. **Well-designed.** |
| FE Schema | `frontend/src/storage/schema.ts:206-210` | Partial index on `listing_draft(sync_state) WHERE sync_state != 'synced'`. Correct for outbox drain queries. |
| FE Usage | *(none)* | **`listing_draft` is never INSERTed, UPDATEd, or SELECTed anywhere in `frontend/src`.** Grep for `INSERT INTO listing_draft`, `UPDATE listing_draft`, `FROM listing_draft` returns zero matches. The table is dead schema. |
| FE Sync | `frontend/src/storage/syncEngine.ts:68-73` | `SyncDomain` includes `'listing_draft'` — the engine claims to reconcile it. |
| FE Sync | `frontend/src/storage/syncEngine.ts:281-299` | `runSync(domain)` orchestrates pull→apply→cursor→pushOutbox. **Never called anywhere** (grep for `runSync(` returns only the definition). |
| FE Publish | `frontend/src/services/listingPublication.ts:94-247` | `executePublication` uses an in-memory `PublicationContext` + Zustand `ListingPublicationRecovery` (`useStore.ts:99-141`). Staged: upload→create listing→attach media→finalise. Recoverable within a session, **not durable across app kill**, and not routed through `mutation_outbox`. |
| FE Publish | `frontend/src/services/listingPublication.ts:193-209` | `createListingOnApi` called with a client-generated `listingId` but **no `idempotencyKey`**. A retry after a dropped response creates a duplicate listing or fails on PK conflict. |
| BE Listings | `backend/api/src/routes/listings.ts:98` | `idempotencyKey` appears only in the notification-queue dependency type, not in the listing creation handler. **No server-side idempotency for `POST /listings`.** |

### Uploads (Media)

| Layer | Path:Line | Assessment |
|---|---|---|
| FE Queue (legacy) | `frontend/src/services/mediaUploadQueue.ts:47-432` | `MediaUploadQueue` — in-memory class. `items: UploadQueueItem[]` is a volatile array (line 48). Concurrency=2, retries=3. **No persistence; lost on app kill.** Used by `listingPublication.ts`. |
| FE Queue (modern) | `frontend/src/creator/core/upload/UploadManager.ts:90-586` | `UploadManager` with `UploadJobStore` persistence, real byte progress via XHR, exponential backoff+jitter, idempotent de-dup on `(projectId, assetId, localPath)` (line 138-166). **Genuine resumable design.** |
| FE Multipart | `frontend/src/creator/core/upload/UploadManager.ts:100-113` | `multipartEnabled` defaults to `false`. Comment: "the backend does not yet expose multipart endpoints." |
| FE Multipart | `frontend/src/creator/core/upload/UploadManager.ts:533-579` | `performMultipartUpload` resumes from persisted session, skips completed parts. **But returns `{ok: false}` (line 576)** — multipart-completed objects cannot finalise because the backend has no multipart finalisation endpoint. The resumable path is wired but blocked at the backend. |
| FE Single-PUT | `frontend/src/creator/core/upload/UploadManager.ts:446-521` | `performSinglePutUpload` — presign→PUT→persist `uploadedObject` checkpoint→finalise. On retry, reuses the same object key (line 451-462) so finalisation is idempotent. **This path is correct and durable.** |
| BE Uploads | *(not inspected in detail)* | `POST /uploads/presign` and `POST /uploads/finalize` exist (referenced by both upload systems). No multipart initiate/upload-part/complete endpoints. |

### Messages

| Layer | Path:Line | Assessment |
|---|---|---|
| FE Outbox | `frontend/src/services/chatOutbox.ts:43-65` | `enqueueChatMessage` — persists to `mutation_outbox` with `entity_type='chat_message'`, `operation_id=clientMessageId`. **Durable.** |
| FE Outbox | `frontend/src/services/chatOutbox.ts:145-167` | `drainChatOutbox` — replays via `sendConversationMessageOnApi` with original `clientMessageId`. Server deduplicates. **Correct idempotent replay.** |
| FE Outbox | `frontend/src/services/chatOutbox.ts:176-191` | `initChatOutboxDrain` — subscribes to NetInfo reconnect. **Never called at app startup** (grep returns only the definition). Outbox only drains when a conversation screen mounts (`useConversationMessages.ts:474`). |
| FE Unknown outcome | `frontend/src/hooks/chat/useConversationMessages.ts:638-659` | On send failure, marks message `"reconciling"` (not `"failed"`), then enqueues to outbox. **Best-in-class unknown-outcome handling within the codebase.** |
| FE Realtime | `frontend/src/hooks/chat/useConversationMessages.ts:313-334` | Realtime `ChatMessageCreatedPayload` reconciled by both server `id` and `clientMessageId` — handles the race where the realtime event arrives before the HTTP response. |
| FE Realtime | `frontend/src/services/realtimeClient.ts` | WebSocket client. No send queue — realtime is receive-only for chat; sends go via HTTP. **Correct architecture** (mutations over HTTP for durability, realtime for fan-out). |

### Orders

| Layer | Path:Line | Assessment |
|---|---|---|
| FE Checkout | `frontend/src/screens/CheckoutScreen.tsx:353,705-711` | `orderIdempotencyKeyRef = useRef<string|null>`. Generated via `createStableId('order')` on first submit, reused on retry. **Stable within session, lost on app kill.** Not persisted to SQLite. |
| FE Checkout | `frontend/src/screens/CheckoutScreen.tsx:737-739` | Payment intent idempotency key is `payment_${orderId}` — deterministic, good. |
| BE Orders | `backend/api/src/routes/orders.ts:492,520-530` | `POST /orders` accepts `idempotencyKey`. On replay, `SELECT ... FOR UPDATE` by `(buyer_id, idempotency_key)`, validates `request_hash`, returns existing order. **Production-grade.** |
| BE Orders | `backend/api/src/routes/orders.ts:533-540` | 409 `IDEMPOTENCY_PAYLOAD_MISMATCH` when the same key is reused with a different payload. Correct. |
| BE Orders | `backend/api/src/routes/orders.ts:906` | Domain outbox event `order.created` appended with `idempotencyKey: payload.idempotencyKey ?? orderId`. |
| FE Trade | `frontend/src/screens/TradeScreen.tsx:296` | `idempotencyKey: reserve_${currentUser.id}_${asset.id}_${Date.now()}` — **`Date.now()` breaks idempotency on retry.** A retry after a dropped response sends a new key → potential duplicate co-own reservation. |

### Money / Payments / Wallet

| Layer | Path:Line | Assessment |
|---|---|---|
| BE Payments | `backend/api/src/db/migrations/131_payment_idempotency_unknown_states.sql:1-102` | Adds `unknown` and `reconciled` to `payment_intents.status`; `unknown` to `payment_attempts.status` and `payment_refunds.status`. Scopes idempotency to `(user_id, idempotency_key)`. Adds refund idempotency. **Flagship-grade unknown-outcome model.** |
| BE Payments | `backend/api/src/routes/payments.ts:464,568-606` | `POST /payment-intents` accepts `idempotencyKey`, replays existing intent. |
| BE Payments | `backend/api/src/routes/payments.ts:1369,1479-1492` | Refunds accept `idempotencyKey`, replay cached refund. |
| BE Webhook | `backend/api/src/index.ts:32358-32391` | Stripe webhook event-ID dedup via `webhook_events` table `ON CONFLICT (event_id) DO NOTHING`. Returns 200 `duplicate: true`. |
| BE Webhook | `backend/api/src/index.ts:32469-32516` | `payment_webhook_events` dedup inside the same transaction as settlement (`ON CONFLICT (gateway_id, provider_event_id) DO NOTHING`). **Double dedup — event-level + gateway-level.** |
| BE Domain Outbox | `backend/api/src/lib/domainOutbox.ts:52-93` | `appendDomainEvent` with `deduplication_key` `ON CONFLICT DO UPDATE SET updated_at`. Transactional outbox pattern. |
| BE Domain Outbox | `backend/api/src/lib/domainOutbox.ts:95-134` | `claimDomainOutboxBatch` — `FOR UPDATE SKIP LOCKED`, status→`processing`, exponential backoff, dead-letter after 10 attempts. **Correct at-least-once delivery.** |
| BE Domain Outbox | `backend/api/src/workers/handlers/outboxDrainHandler.ts:216-231` | `processDomainOutboxBatch` — claims, processes, completes/fails. Drives notifications + realtime fan-out. |
| BE Offers | `backend/api/src/routes/listingOffers.ts:26,142-155,227,246` | `POST /listing-offers` accepts `idempotencyKey`, replays by `(offered_by_user_id, idempotency_key)`, validates `request_hash`. |
| BE Auctions | `backend/api/src/routes/auctions.ts:105-164` | `claimIdempotency` + `storeIdempotencyResponse` against `auction_transaction_idempotency` table. `ON CONFLICT (auction_id, user_id, idempotency_key)`. Stores response status+body for replay. **Full request-response idempotency cache.** |
| FE Offers | `frontend/src/screens/MakeOfferScreen.tsx:163,169` | `idempotencyKey: idempotencyKeyRef.current` — stable ref. Good within session. |
| FE Auctions | `frontend/src/screens/AuctionDetailScreen.tsx:341,369` | Bid/buy-now receive `idempotencyKey` from sheet. |
| FE Withdraw | `frontend/src/screens/WithdrawScreen.tsx:434,446` | `idempotencyKey: payout_${currentUser.id}_${Date.now()}` — **`Date.now()` breaks idempotency on retry. Double-withdraw risk on unknown outcome.** |
| FE Wallet | `frontend/src/components/wallet/AddMoneySheet.tsx:157` | `idempotencyKey: topupIdempotencyRef.current.key` — stable ref. Good within session. |

---

## Gap Analysis

### What exists (and is correct)

1. **Backend idempotency for money operations.** Orders, offers, auctions, payment intents, refunds, payouts, wallet top-ups all accept idempotency keys with `request_hash` validation and replay. Migration 131 introduces a first-class `unknown` status for lost provider responses. This is flagship-grade.
2. **Backend webhook reconciliation.** Stripe webhooks are deduplicated at two levels (event ID + gateway event ID) inside the same transaction as settlement. The domain outbox provides at-least-once delivery for notifications/realtime with dead-lettering.
3. **Chat durable outbox.** `chatOutbox.ts` persists failed sends to `mutation_outbox` with the original `clientMessageId`, drains on reconnect, and the UI marks dropped responses as `"reconciling"` rather than `"failed"`. This is the one domain that is genuinely offline-first.
4. **UploadManager persisted job store.** Single-PUT path checkpoints the post-PUT object key so finalisation is idempotent across retries. Real byte progress, exponential backoff.

### What is missing (flagship needs)

| Gap | Impact | Evidence |
|---|---|---|
| **Sync engine is a dead stub.** `runSync` is never called; backend `/sync/push` and `/sync/{domain}` endpoints do not exist. | The entire pull/push reconciliation loop for `conversation`, `message`, `feed_item`, `listing_draft`, `product` is non-functional. Offline edits to drafts/products never reach the server via the outbox. | `syncEngine.ts:5-8` ("contract + stub"); grep `runSync(` → 0 callers; grep `/sync/push` in backend → 0 matches |
| **`listing_draft` table is dead schema.** Never written to. | Offline listing authoring is not durable. A draft started offline is lost on app kill. | grep `INSERT INTO listing_draft` → 0 matches |
| **`initChatOutboxDrain` never called at startup.** | Messages queued while offline are only flushed when the user opens the conversation that contains them. A message queued in conversation A is not sent until the user re-opens conversation A. | grep `initChatOutboxDrain(` → only the definition at `chatOutbox.ts:176` |
| **Listing publication is not routed through the outbox.** Uses in-memory Zustand `ListingPublicationRecovery`. `createListingOnApi` sends no idempotency key. | A dropped response during publish creates a duplicate listing or fails on PK conflict. Recovery state is lost on app kill. | `listingPublication.ts:193-209`; `listingsApi.ts:459-461` (no idempotency key in body) |
| **`MediaUploadQueue` is in-memory.** | Uploads queued via the legacy path (listing publication) are lost on app kill. | `mediaUploadQueue.ts:48` (`items: UploadQueueItem[] = []`) |
| **Multipart uploads disabled; backend has no multipart endpoints.** | Large video uploads cannot resume from a partial state across app restarts. The resumable code path returns `{ok: false}`. | `UploadManager.ts:100,113,576` |
| **`Date.now()` in idempotency keys for withdraw + trade reserve.** | Retry after a dropped response sends a new key → server cannot dedup → **double-withdraw or duplicate reservation**. This is the single most dangerous gap. | `WithdrawScreen.tsx:434,446`; `TradeScreen.tsx:296` |
| **No client-side request journal.** | Outside chat, there is no record of an in-flight mutation. On unknown outcome (timeout), the client cannot decide whether to retry, wait, or surface failure. Orders/payments rely on the user manually retrying. | No `request_journal` table in `schema.ts`; no generic outbox enqueue for non-chat domains |
| **No conflict resolution UI for non-chat domains.** | The sync engine defines `superseded`/`conflict`/`gone` states, but since `runSync` is never called, no domain ever surfaces a conflict to the user. | `syncEngine.ts:235-259` (handling exists but is unreachable) |
| **Idempotency keys stored in `useRef`, not persisted.** | Even when the client generates a stable key, it is lost on app kill. A retry after a cold start sends no key (or a new key). | `CheckoutScreen.tsx:353`; `MakeOfferScreen.tsx` ref pattern |

---

## Proposed Architecture

### Principle: one durable outbox, every mutation, idempotent by default

The codebase already has the right schema (`mutation_outbox`) and the right server-side idempotency primitives. The work is **wiring**, not invention.

### 1. Client outbox — make `mutation_outbox` the single mutation queue

**Keep SQLite (not WatermelonDB).** The existing `expo-sqlite` store with WAL is sufficient; introducing a new ORM adds risk without benefit.

**Add a generic `enqueueMutation` in `frontend/src/storage/outboxClient.ts`:**
```
enqueueMutation({
  operationId,        // stable UUID — the idempotency key
  entityType,         // 'listing' | 'order' | 'offer' | 'auction_bid' | 'withdrawal' | 'chat_message' | ...
  entityId,
  operation,          // 'create' | 'update' | 'delete' | 'send' | 'reserve' | 'bid' | 'buy_now'
  payloadJson,        // full request body
  baseRev,            // for optimistic-concurrency domains
  httpMethod,         // 'POST' | 'PATCH' | 'DELETE'
  httpPath,           // '/orders' | '/listings' | '/payment-intents/.../refund'
})
```

**Every mutation call site enqueues before issuing HTTP:**
- `createListingOnApi` → enqueue with `operationId = clientPublicationId`, then push.
- `createOrder` → enqueue with `operationId = orderIdempotencyKey`.
- `createListingOfferOnApi` → enqueue with `operationId = offerIdempotencyKey`.
- `placeBid` / `buyNow` → enqueue with `operationId = bidIdempotencyKey`.
- `requestPayout` → enqueue with `operationId = payoutIdempotencyKey`.
- Chat messages already do this — keep `chatOutbox.ts` as the chat-specific wrapper.

**Drain loop:** Replace `pushOutbox()` in `syncEngine.ts` with a generic drain that:
1. Selects `state IN ('pending') ORDER BY seq` (drop `'pushing'`/`'conflict'` from the drain query — see bug below).
2. Marks `pushing`, issues the HTTP call with `Idempotency-Key: operationId` header.
3. On 2xx → delete row.
4. On 409 → mark `conflict`, record `last_error`, surface to UI.
5. On network error / timeout → mark `unknown` (new state), increment `attempt_count`, exponential backoff.
6. On 4xx (non-409) → mark `failed`, stop retrying.

**Startup wiring:** Call `initOutboxDrain()` once in `App.tsx` (alongside `initChatOutboxDrain`). Subscribe to NetInfo reconnect + AppState foreground.

### 2. Fix the `Date.now()` idempotency keys (critical, ship first)

- `WithdrawScreen.tsx:434,446` → `idempotencyKey: payoutIdempotencyRef.current` (generate via `createStableId('payout')` on first submit, persist to outbox).
- `TradeScreen.tsx:296` → `idempotencyKey: reserveIdempotencyRef.current` (same pattern).

This is a **one-day fix** that eliminates the highest-severity risk (double-withdraw). Ship before the full outbox rollout.

### 3. Server-side: add `POST /sync/push` + `GET /sync/{domain}`

The sync engine contract in `syncEngine.ts:10-15` is correct. Implement the backend:

- `POST /sync/push` — accepts `{operationId, entityType, entityId, operation, payload, baseRev}`. Looks up by `(user_id, operationId)` in a `client_operations` table (new). If found, replays the stored response. If not, executes the operation inside a transaction, stores the response, returns `{status: 'applied', rev}` | `{status: 'superseded', rev}` | `{status: 'conflict', rev}` | `{status: 'gone'}`.
- `GET /sync/{domain}?since={rev}` — returns deltas from a `sync_delta` table (or rev-tagged domain tables). This is the larger build; prioritise `listing_draft` and `product` first.

**Alternative (lower risk):** Skip the generic `/sync/push` and instead make every existing mutation endpoint accept `Idempotency-Key` as a header + persist the response in a `client_operations` table for replay. This reuses the existing per-endpoint idempotency (orders, offers, auctions already do this) and only requires adding the header to `listings`, `payouts`, and `payment-intent` confirmations. The outbox drain then just replays the original HTTP request with the same header.

**Recommendation:** the alternative is lower-risk and faster to ship. The generic `/sync/push` is a longer-term consolidation.

### 4. Webhook reconciliation — already sufficient

The Stripe webhook dedup (`index.ts:32358-32516`) and the `unknown`/`reconciled` status model (migration 131) are flagship-grade. The only gap is that the **client does not query the server to reconcile `unknown` states**. Add a `GET /payment-intents/{id}/status` poll (or realtime subscription) so the client can resolve an `unknown` outcome after a timeout. The server already has the data; the client just needs to ask.

### 5. Unknown-outcome protocol (client)

For every mutation, define a timeout (e.g. 15s for orders, 30s for uploads). On timeout:
1. Mark the outbox row `unknown` (not `failed`).
2. Schedule a reconciliation probe: `GET /orders?client_operation_id={operationId}` (or domain-specific lookup).
3. If the server confirms the operation was applied → mark `synced`, delete row.
4. If the server confirms it was not applied → re-enqueue for push.
5. If still unknown after N probes → surface to the user as "We're confirming your [order/payment]. You'll see it in your activity shortly."

Chat already does this implicitly via `clientMessageId` reconciliation. Generalise the pattern.

### 6. Resumable uploads — enable multipart

- Backend: add `POST /uploads/multipart/initiate`, `PUT /uploads/multipart/{uploadId}/part/{partNumber}`, `POST /uploads/multipart/{uploadId}/complete`.
- Frontend: flip `multipartEnabled` default to `true` in `UploadManager` once backend ships.
- Fix `performMultipartUpload` to call `finalizePresignedMedia` after complete (currently returns `{ok: false}`).

### 7. Conflict resolution

For `listing_draft` and `product` (the rev-tagged domains), surface `superseded`/`conflict` states in the UI. For money operations, conflicts are rare (the server is authoritative); a 409 `IDEMPOTENCY_PAYLOAD_MISMATCH` is already handled correctly by the backend — the client just needs to surface it as "This checkout was already completed with different details."

---

## Risk and Rollout

| Phase | Work | Risk | Mitigation |
|---|---|---|---|
| **0 (hotfix)** | Replace `Date.now()` idempotency keys in `WithdrawScreen` and `TradeScreen` with stable refs. | Low — isolated, two files. | Existing server-side idempotency catches the first occurrence; the fix prevents the second. |
| **1** | Wire `initChatOutboxDrain` in `App.tsx`. | Low — the function already exists and is idempotent. | Add a feature flag; the drain is read-only + send-only. |
| **2** | Add `Idempotency-Key` header to `createListingOnApi`, `requestPayout`, and any remaining money endpoints. Add `client_operations` replay table on backend. | Medium — requires a migration + endpoint changes. | Ship per-endpoint (listings first, then payouts). Each endpoint already has idempotency for some callers; this generalises it. |
| **3** | Build generic `outboxClient.ts` + drain loop. Route listing publication through it. | Medium — touches `listingPublication.ts` and `SellScreen`. | Keep the existing `ListingPublicationRecovery` as the in-session optimistic state; the outbox is the durability layer beneath it. |
| **4** | Implement `GET /sync/{domain}` for `listing_draft` and `product`. Wire `runSync`. | Higher — new backend endpoints, delta generation. | Start with `listing_draft` (write-heavy, low-volume). Defer `product` (read-heavy, cache-only). |
| **5** | Enable multipart uploads (backend endpoints + frontend default flip). | Medium — S3 multipart is well-understood but new backend surface. | Behind a feature flag; fall back to single-PUT. |

**Overall risk:** Low-to-medium. The architecture is already shaped correctly; this is integration work, not greenfield design. The highest-risk gap (double-withdraw) is a two-line hotfix.

---

## Evidence Tags

- `FE-SYNC-STUB` — `frontend/src/storage/syncEngine.ts:5-8` (self-described stub), `:281` (`runSync` never called)
- `FE-OUTBOX-SCHEMA` — `frontend/src/storage/schema.ts:167-182` (`mutation_outbox` table)
- `FE-LISTING-DRAFT-DEAD` — grep `INSERT INTO listing_draft` → 0 matches; `schema.ts:111-133`
- `FE-CHAT-OUTBOX` — `frontend/src/services/chatOutbox.ts:43-65` (enqueue), `:145-167` (drain), `:176-191` (init, never called)
- `FE-CHAT-UNKNOWN` — `frontend/src/hooks/chat/useConversationMessages.ts:638-659` (reconciling state)
- `FE-CHAT-REALTIME-RECONCILE` — `frontend/src/hooks/chat/useConversationMessages.ts:313-334`
- `FE-UPLOAD-INMEMORY` — `frontend/src/services/mediaUploadQueue.ts:48` (volatile array)
- `FE-UPLOAD-MANAGER-DURABLE` — `frontend/src/creator/core/upload/UploadManager.ts:90-117` (job store), `:446-521` (single-PUT checkpoint)
- `FE-UPLOAD-MULTIPART-DISABLED` — `frontend/src/creator/core/upload/UploadManager.ts:100,113,576`
- `FE-PUBLISH-NOIDEMPOTENCY` — `frontend/src/services/listingPublication.ts:193-209`, `frontend/src/services/listingsApi.ts:459-461`
- `FE-PUBLISH-RECOVERY-INMEMORY` — `frontend/src/store/useStore.ts:99-141`, `frontend/src/services/listingPublication.ts:94-109`
- `FE-ORDER-IDEMPOTENCY-REF` — `frontend/src/screens/CheckoutScreen.tsx:353,705-711`
- `FE-WITHDRAW-DATE-NOW-KEY` — `frontend/src/screens/WithdrawScreen.tsx:434,446` (**critical**)
- `FE-TRADE-DATE-NOW-KEY` — `frontend/src/screens/TradeScreen.tsx:296` (**critical**)
- `FE-OFFER-IDEMPOTENCY-REF` — `frontend/src/screens/MakeOfferScreen.tsx:163,169`
- `FE-WALLET-TOPUP-IDEMPOTENCY-REF` — `frontend/src/components/wallet/AddMoneySheet.tsx:157`
- `BE-ORDER-IDEMPOTENCY` — `backend/api/src/routes/orders.ts:492,520-530`
- `BE-OFFER-IDEMPOTENCY` — `backend/api/src/routes/listingOffers.ts:26,142-155,227,246`
- `BE-AUCTION-IDEMPOTENCY` — `backend/api/src/routes/auctions.ts:105-164`
- `BE-PAYMENT-UNKNOWN-STATES` — `backend/api/src/db/migrations/131_payment_idempotency_unknown_states.sql:1-102`
- `BE-PAYMENT-INTENT-IDEMPOTENCY` — `backend/api/src/routes/payments.ts:464,568-606`
- `BE-REFUND-IDEMPOTENCY` — `backend/api/src/routes/payments.ts:1369,1479-1492`
- `BE-WEBHOOK-DEDUP` — `backend/api/src/index.ts:32358-32391` (event-level), `:32469-32516` (gateway-level)
- `BE-DOMAIN-OUTBOX` — `backend/api/src/lib/domainOutbox.ts:52-93` (append), `:95-134` (claim), `:152-174` (fail/dead-letter)
- `BE-DOMAIN-OUTBOX-DRAIN` — `backend/api/src/workers/handlers/outboxDrainHandler.ts:216-231`
- `BE-LISTINGS-NO-IDEMPOTENCY` — `backend/api/src/routes/listings.ts:98` (only in notification type, not handler)
- `BE-SYNC-ENDPOINTS-MISSING` — grep `/sync/push` in `backend/api/src` → 0 matches
