# 12 — Live Shopping and Streaming

**Engineering decision document**
**Research cut-off:** 25 August 2026
**Audited baseline:** `f82f74a54be79a1721017380ddd5472d856f1679`
**Decision owners:** Realtime media + Commerce/Auctions + Native + Trust & Safety + SRE
**Status:** **P1 department / P0 media, bid atomicity and presence-truth blockers**

---

## 1. Executive verdict

ThryftVerse has three useful but disconnected planes:

- a LiveKit-oriented provider and a native connection hook;
- persistent stream/chat/current-lot/bid routes with sequenced realtime events;
- polished demo seller/viewer experiences.

They do not compose into a production live-shopping product. The seller screen's camera is an explicit placeholder (`LiveStreamSellerScreen.tsx:240–247` — a `videocam-outline` icon with "Camera Preview" text, no capture or publish path). The viewer requests a real LiveKit token and immediately discards both the token and WebSocket URL (`liveShoppingApi.ts:603–604` — `await fetchJson(...)` with no assignment of the token response). Neither canonical screen imports `useLiveKitRoom`. No video track is rendered or published. Server-side room management sends a base64 string as a Bearer token (`streamProvider.ts:360–364` — `Buffer.from(`${this.apiKey}:${Date.now()}`).toString('base64')`) rather than a LiveKit server JWT, so real room RPCs are not production-capable even though participant token generation correctly uses `livekit-server-sdk` (`streamProvider.ts:231–244`).

The commerce plane is more dangerous: bid insert (`streaming.ts:571–576`) and current-price update (`streaming.ts:578–584`) are separate non-transactional `db.query` calls with no row lock, compare-and-set or idempotency key. The UPDATE sets `current_price = $2` unconditionally (line 580) — not `GREATEST(current_price, $2)` — so a lower concurrent bid can overwrite a higher one. Presence is incremented on token issuance (`streaming.ts:351–352`) — not confirmed media join — and any authenticated leave call decrements it (`streaming.ts:381–382`), enabling drift and manipulation.

The decision is to block public launch and money-bearing claims. Build a three-plane architecture with explicit boundaries: LiveKit media, sequenced application realtime, and an authoritative transactional lot/auction engine. Ship real one-way video without bidding first; add bidding only after concurrency, idempotency, unknown-outcome, settlement and moderation gates pass.

### 1.1 Maturity scorecard

| Capability | Score | Evidence-based judgement |
|---|---:|---|
| Session persistence | 3/5 | Session table and lifecycle routes exist; provider/DB transitions can diverge |
| Host media | 0.5/5 | Seller camera is placeholder (`LiveStreamSellerScreen.tsx:240–247`); no permissions, capture, publish or token path |
| Viewer media | 1/5 | Token endpoint and unused LiveKit hook exist; viewer discards token/wsUrl (`liveShoppingApi.ts:603–604`) and renders placeholder (`LiveStreamViewerScreen.tsx:515–517`) |
| Provider integration | 1.5/5 | Participant JWT generation is real (`streamProvider.ts:231–244`); room RPC auth is base64 placeholder (`streamProvider.ts:360–364`); mock is default/fallback |
| Realtime app events | 3/5 | Shared realtime topic, sequence/version envelopes and subscriptions exist |
| Presence/viewer count | 1/5 | Token issuance increments (`streaming.ts:351–352`); unaffiliated leave decrements (`streaming.ts:381–382`); no webhook reconciliation |
| Chat | 2.5/5 | Persistent/rate-limited/realtime, but identity display, status/moderation/idempotency are incomplete |
| Current-lot management | 2/5 | Host-authorized upsert/realtime event; listing validity/ownership/snapshot not enforced |
| Bidding correctness | 0.5/5 | Non-transactional (`streaming.ts:571–584`), race-prone, non-idempotent, no settlement or unknown-outcome |
| Buy-now/settlement | 0/5 | Production service explicitly returns unavailable |
| Recording/replay | 1/5 | Columns/flags only; no egress lifecycle/webhooks or replay product |
| Moderation/safety | 1/5 | No live roles, mute/ban/report/slow-mode/emergency audit workflow |
| Native state/accessibility | 2.5/5 | Some connection/error/ended UI; media/device/commerce state machines incomplete |
| **Overall** | **1.6/5** | **Useful scaffold, unsafe and disconnected production path** |

---

## 2. Precise code evidence register

All line numbers verified against `f82f74a54be79a1721017380ddd5472d856f1679`.

### 2.1 Frontend — seller screen

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `LiveStreamSellerScreen.tsx` / header comment | 8 | `Camera preview is a placeholder until real WebRTC is wired` — honest comment | Foundation |
| `LiveStreamSellerScreen.tsx` / `SellerPhase` | 47 | `type SellerPhase = 'setup' | 'live' | 'summary'` — omits permissions, preflight, backstage, publishing, reconnecting, degraded, unknown end, recording-processing | P1 |
| `LiveStreamSellerScreen.tsx` / `DEMO_LOTS` | 57–62 | Three hardcoded demo lots with Unsplash images and starting prices | P1 |
| `LiveStreamSellerScreen.tsx` / `isDemo` | 74 | `const isDemo = LIVE_SHOPPING_DEMO_MODE;` — gates all production paths | P1 |
| `LiveStreamSellerScreen.tsx` / `handleGoLive` | 130 | Calls `createLiveStream()`; production branch returns unavailable | P0 |
| `LiveStreamSellerScreen.tsx` / camera placeholder | 240–247 | `View` with `videocam-outline` icon, "Camera Preview" text, and a non-functional "Flip camera" button | P0 media missing |
| `LiveStreamSellerScreen.tsx` / camera styles | 488–500 | `cameraPreview` style: 9/16 aspect ratio, `surfaceAlt` background, `maxHeight: 300` | P0 |

**Critical quote — the camera placeholder (`LiveStreamSellerScreen.tsx:240–247`):**
```tsx
            {/* Camera preview placeholder */}
            <View style={[styles.cameraPreview, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="videocam-outline" size={40} color={colors.textMuted} />
              <Text style={[styles.cameraPreviewText, { color: colors.textMuted }]}>Camera Preview</Text>
              <Pressable style={({ pressed }) => [styles.flipCameraBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel="Flip camera">
                <Ionicons name="camera-reverse-outline" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>
```
No camera permission request, no `Camera` component, no `useLiveKitRoom` import, no video track publish. The "Flip camera" button is decorative — it has no `onPress` handler that switches cameras.

### 2.2 Frontend — viewer screen

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `LiveStreamViewerScreen.tsx` / `floatingHearts` | 118 | `useState<{ id: number; x: number }[]>([])` — decorative heart animation state | P1 anti-AI |
| `LiveStreamViewerScreen.tsx` / heart animation | 120–135 | `setFloatingHearts((prev) => [...prev.slice(-4), { id, x: xOffset }])` (line 129) — floating hearts on double-tap/like | P1 anti-AI |
| `LiveStreamViewerScreen.tsx` / connecting state | 420–421 | `"Connecting to stream"` / `"Setting up real-time connection"` — shown during initial load | P1 |
| `LiveStreamViewerScreen.tsx` / video placeholder | 515–517 | `videoPlaceholder` view with `"Connecting to stream..."` text — permanent state when no real video | P0 media missing |
| `LiveStreamViewerScreen.tsx` / floating hearts render | 594–603 | `floatingHearts.map(...)` renders `Reanimated.View` with heart icon at `left: 50 + heart.x` | P1 anti-AI |
| `LiveStreamViewerScreen.tsx` / product showcase | 627–686 | `productShowcasePanel` — floating semi-transparent panel over video | P1 |
| `LiveStreamViewerScreen.tsx` / `floatingHeart` style | 1010–1013 | `position: 'absolute', bottom: 0` — heart animation style | P1 |

**Critical quote — the permanent video placeholder (`LiveStreamViewerScreen.tsx:515–517`):**
```tsx
          <View style={styles.videoPlaceholder}>
            <Text style={styles.videoPlaceholderText}>Connecting to stream...</Text>
          </View>
```
This is not a transient loading state — it is the permanent viewer experience when `LIVE_SHOPPING_DEMO_MODE` is false. No `VideoTrack` component, no `useLiveKitRoom` import, no actual media subscription.

**Critical quote — the floating hearts animation (`LiveStreamViewerScreen.tsx:120–135`):**
```tsx
  // ── Heart animation — floating heart on double-tap or like ──
  const heartIdRef = useRef(0);
  const heartScale = useSharedValue(0);
  const heartOpacity = useSharedValue(0);
  // ...
    if (reducedMotion) return;
    const id = ++heartIdRef.current;
    const xOffset = Math.random() * 60 - 30;
    setFloatingHearts((prev) => [...prev.slice(-4), { id, x: xOffset }]);
    heartScale.value = withSpring(1, { damping: 12, stiffness: 200 });
    heartOpacity.value = withTiming(0, { duration: 1200 }, () => {
      runOnJS(setFloatingHearts)((prev) => prev.filter((h) => h.id !== id));
    });
```
Decorative motion that occludes commerce-critical state. Per AGENTS.md §4 (Anti-AI Design): "Excessive motion. Every mount animates, every press bounces, every transition slides. Flagship apps animate rarely and meaningfully." Floating hearts in a live auction where bid state is authoritative is decorative chrome over composition.

### 2.3 Frontend — live shopping API service

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `liveShoppingApi.ts` / `LIVE_SHOPPING_DEMO_MODE` | 93–94 | `__DEV__ || process.env.EXPO_PUBLIC_MOCK_MODE === 'fixture-design'` — demo mode is default in dev | P1 |
| `liveShoppingApi.ts` / `LiveJoinToken` | 72–77 | `token: string; isDemo: boolean` — token interface exists but is discarded by `connectToStreamFromBackend` | P0 |
| `liveShoppingApi.ts` / `joinLiveSessionFromBackend` | 378–399 | Requests token, returns `{ sessionId, token: response.token.token, isDemo: false }` — correctly returns token | Foundation |
| `liveShoppingApi.ts` / `connectToStreamFromBackend` | 600–604 | `await fetchJson(...)` — requests viewer token but **does not assign the response**; token and wsUrl are discarded | P0 broken media handoff |
| `liveShoppingApi.ts` / `placeBidOnBackend` | 545–595 | Calls `POST /streaming/sessions/:id/bids` with amount; no client bid ID or idempotency key | P0 |
| `liveShoppingApi.ts` / `placeBid` (demo) | 821–823 | Production branch returns `{ success: false, currentBid: 0, bidCount: 0, isHighBidder: false }` — unavailable | P0 |
| `liveShoppingApi.ts` / `fetchLiveStream` | 1177–1181 | Production branch returns `null` — unavailable | P0 |
| `liveShoppingApi.ts` / `subscribeToStreamEvents` | 1284–1288 | Production branch subscribes to realtime client — functional | Foundation |

**Critical quote — the token discard (`liveShoppingApi.ts:600–604`):**
```ts
async function connectToStreamFromBackend(streamId: string): Promise<LiveStream | null> {
  try {
    // Request a viewer token (increments viewer count on the backend).
    await fetchJson<BackendStreamTokenResponse>(
      `/streaming/sessions/${encodeURIComponent(streamId)}/token`,
```
The `await fetchJson(...)` call requests a viewer token — which increments `viewer_count` on the backend — but the response (containing `token`, `wsUrl`, `roomId`, `identity`) is never assigned to a variable. The token and WebSocket URL are discarded. The viewer screen never receives connection credentials. Meanwhile, the backend has already incremented the viewer count (`streaming.ts:351–352`), so presence is inflated with no actual viewer.

### 2.4 Frontend — LiveKit hook (orphaned)

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `useLiveKitRoom.ts` / `useLiveKitRoom` | — | Creates a room, connects, tracks participants and cleanup; **not imported by seller/viewer screens** | P0 orphaned scaffold |
| `useLiveKitRoom.ts` / track metadata | — | Exposes track metadata only, not actual `VideoTrack`/audio renderer or local publish controls | P0 incomplete |
| `useLiveKitRoom.ts` / `listenersRef` | — | Stores only callbacks then calls `off` for every event/callback combination — incorrect unregister matrix | P1 |

### 2.5 Backend — streaming routes

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `streaming.ts` / session row | 27 | `viewer_count: number` — mutable counter column | P1 |
| `streaming.ts` / upsert session | 124–137 | `INSERT ... ON CONFLICT DO UPDATE` — provider room created before DB persistence | P1 ordering |
| `streaming.ts` / token route | 347–365 | `SET viewer_count = viewer_count + 1` (line 352) when role=viewer — increments on token issuance, before media connection | P0 fabricated count |
| `streaming.ts` / leave route | 370–397 | `SET viewer_count = GREATEST(0, viewer_count - 1)` (line 382) — any authenticated caller can decrement; no membership/lease/token proof or idempotency | P0 count manipulation |
| `streaming.ts` / current-lot upsert | 489–506 | `INSERT INTO live_shopping_current_lots ... ON CONFLICT DO UPDATE` — host/admin only, but listing existence/ownership/status/auction contract not validated; starts price at provided value | P0 commerce |
| `streaming.ts` / bid INSERT | 571–576 | `INSERT INTO live_shopping_bids (id, session_id, listing_id, lot_number, bidder_id, amount) VALUES ($1, $2, $3, $4, $5, $6)` — separate `db.query` call, no transaction | P0 money correctness |
| `streaming.ts` / bid UPDATE | 578–584 | `UPDATE live_shopping_current_lots SET current_price = $2, bid_count = bid_count + 1` — unconditional set, not `GREATEST(current_price, $2)`; separate `db.query` call | P0 race/lower overwrite |
| `streaming.ts` / bid ID | 568 | `const bidId = randomUUID()` — server-generated, no client bid ID or idempotency key | P0 duplicate risk |

**Critical quote — the non-transactional bid write (`streaming.ts:571–584`):**
```ts
    await db.query(
      `INSERT INTO live_shopping_bids
         (id, session_id, listing_id, lot_number, bidder_id, amount)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [bidId, sessionId, currentLot.listing_id, currentLot.lot_number, userId, amount],
    );

    const updated = await db.query<LiveShoppingCurrentLotRow>(
      `UPDATE live_shopping_current_lots
         SET current_price = $2, bid_count = bid_count + 1, updated_at = NOW()
       WHERE session_id = $1
       RETURNING *`,
      [sessionId, amount],
    );
```
Two separate `db.query` calls. No `BEGIN`/`COMMIT`, no `SELECT ... FOR UPDATE`, no `WHERE current_price < $2` guard. The `current_price = $2` assignment is unconditional — if bid A (£60) and bid B (£55) race, both INSERTs succeed, and whichever UPDATE runs last wins. The visible high bid can regress from £60 to £55. Per [GavelLive on Aurora DSQL](https://dev.to/amoghsingh130/proving-a-live-auction-cant-lose-your-bid-gavellive-on-aurora-dsql-vercel-43ni): "Read-then-write without isolation is a textbook lost-update bug: two bidders read $100, both bid $110, one write silently clobbers the other."

**Critical quote — the viewer_count increment on token issuance (`streaming.ts:349–356`):**
```ts
    if (role === "viewer") {
      const updated = await db.query<LiveShoppingSessionRow>(
        `UPDATE live_shopping_sessions
           SET viewer_count = viewer_count + 1
         WHERE id = $1
         RETURNING *`,
        [roomId],
      );
```
Incremented when a token is issued — before the viewer connects to LiveKit, before any media join event. A client that requests a token and never connects still inflates the count. Per [LiveKit webhooks](https://docs.livekit.io/intro/basics/rooms-participants-tracks/webhooks-events/): presence should be driven by `participant.joined` / `participant.left` webhook events, not token issuance.

**Critical quote — the unauthenticated leave decrement (`streaming.ts:380–386`):**
```ts
    const updated = await db.query<LiveShoppingSessionRow>(
      `UPDATE live_shopping_sessions
         SET viewer_count = GREATEST(0, viewer_count - 1)
       WHERE id = $1
       RETURNING *`,
      [sessionId],
    );
```
Any authenticated user can call `POST /streaming/sessions/:sessionId/leave` for any session — there is no check that the caller actually joined, no membership lease, no token-use proof, no idempotency. An attacker can decrement viewer_count to zero for any active stream.

### 2.6 Backend — stream provider

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `streamProvider.ts` / `LiveKitStreamProvider` | 115–365 | Implements `LiveStreamProvider` interface | Foundation |
| `streamProvider.ts` / `createStream` | 127–165 | Room ID: `stream_${Date.now()}_${Math.random()...}` (line 128) — predictable/collidable; metadata includes title/host/recording | P1 |
| `streamProvider.ts` / `startStream` | 167–191 | `UpdateRoomMetadata` with `metadata: JSON.stringify({ status: 'live', startedAt: ... })` (line 180) — **replaces** metadata, dropping title/hostUserId/recordingEnabled written at create | P0 metadata corruption |
| `streamProvider.ts` / `endStream` | 193–219 | `DeleteRoom` then `getStream(roomId)` (line 205) — queries room after deletion; fallback loses host/title | P1 lifecycle truth |
| `streamProvider.ts` / `generateToken` | 221–258 | Uses `livekit-server-sdk` `AccessToken` with `canPublish: request.role === 'host'` (line 241), `canSubscribe: true` (line 242), TTL 2h (line 236) | Good foundation |
| `streamProvider.ts` / `generateAuthHeader` | 351–358 | `return 'Bearer ' + this.generateSimpleToken()` — uses placeholder, not real LiveKit JWT signing | P0 |
| `streamProvider.ts` / `generateSimpleToken` | 360–364 | `Buffer.from(`${this.apiKey}:${Date.now()}`).toString('base64')` — base64 of API key + timestamp; comments say "placeholder that should be replaced with proper JWT signing" | P0 provider nonfunctional |

**Critical quote — the base64 placeholder auth (`streamProvider.ts:351–364`):**
```ts
  private generateAuthHeader(method: string, path: string): string {
    // In production, this should use the livekit-server-sdk's
    // RoomServiceClient which handles auth automatically.
    // This manual implementation is a fallback for when the SDK
    // is not yet installed.
    const token = this.generateSimpleToken();
    return `Bearer ${token}`;
  }

  private generateSimpleToken(): string {
    // Simplified token — in production, use livekit-server-sdk AccessToken
    // This is a placeholder that should be replaced with proper JWT signing
    return Buffer.from(`${this.apiKey}:${Date.now()}`).toString('base64');
  }
```
LiveKit's RoomService API expects a JWT signed with the API secret using the `LiveKit-Signature` header format. A base64 string of `apiKey:timestamp` is not a valid LiveKit auth token. Every room management RPC (`CreateRoom`, `UpdateRoomMetadata`, `DeleteRoom`, `ListRooms`) will fail with 401 Unauthorized against a real LiveKit server. Per [LiveKit server SDK docs](https://docs.livekit.io/home/server-api/): use `RoomServiceClient` from `livekit-server-sdk` which handles authentication automatically.

**Critical quote — the startStream metadata replacement (`streamProvider.ts:178–181`):**
```ts
      body: JSON.stringify({
        room: roomId,
        metadata: JSON.stringify({ status: 'live', startedAt: new Date().toISOString() }),
      }),
```
`UpdateRoomMetadata` replaces the entire metadata field. The metadata written at `createStream` (line 135–140: `title`, `hostUserId`, `recordingEnabled`) is overwritten with just `{ status: 'live', startedAt }`. After `startStream`, the room no longer knows its title, host or recording policy. This is a provider identity/lifecycle corruption bug.

### 2.7 Backend — config and production readiness

| File / symbol | Lines | Exact finding | Severity |
|---|---|---|---|
| `config.ts` / `getStreamProvider` | — | Defaults to `mock`; missing LiveKit credentials logs then falls back to mock | P0 fail-open |
| `productionReadiness.ts` | — | No audited live-stream provider/credential prohibition surfaced | P0 capability truth |

### 2.8 Migrations

| Migration | Finding |
|---|---|
| `113_live_shopping_sessions.sql` | Lifecycle fields exist; `status` has no CHECK constraint; `host_user_id` has no FK; timestamps/recording state sparse |
| `130_live_shopping_chat_bids.sql` | `live_shopping_current_lots`: one mutable row/session; no status, opens/closes, currency, increment, version or sequence. `live_shopping_bids`: no `client_bid_id`, no idempotency key, no `status`/`rejection_code`, no `lot_version` |

---

## 3. End-to-end flow traces

### 3.1 Seller today

```text
LiveStreamSellerScreen setup
  → local title + DEMO_LOTS (LiveStreamSellerScreen.tsx:57-62)
  → createLiveStream()
     dev/demo: create in-memory MOCK_STREAM
     production: return unavailable
  → connectToStream(mock)
  → local phase='live' and duration timer
  → camera placeholder (LiveStreamSellerScreen.tsx:240-247) — no capture/publish
  → demo lot sell/advance/end functions
  → local/demo summary
```

### 3.2 Viewer today, production-shaped branch

```text
LiveStreamViewerScreen(sessionId)
  → connectToStreamFromBackend (liveShoppingApi.ts:600)
  → POST token(role=viewer) (liveShoppingApi.ts:603-604)
     backend increments viewer_count immediately (streaming.ts:351-352)
     client discards token + wsUrl — response not assigned
  → GET session + GET current-lot
  → subscribe app realtime topic
  → phase='live'
  → non-demo video placeholder forever (LiveStreamViewerScreen.tsx:515-517)
  → floating hearts animation (LiveStreamViewerScreen.tsx:594-603)
  → chat/bid HTTP mutations + realtime updates
  → unmount POST leave (best effort decrement, streaming.ts:380-386)
```

### 3.3 Concurrent bid failure example

```text
lot current_price = £50
A reads £50; bids £60 → passes check (streaming.ts:565)
B reads £50; bids £55 → passes check (streaming.ts:565)
A INSERT bid £60 (streaming.ts:571-576)
B INSERT bid £55 (streaming.ts:571-576)
A UPDATE current_price=£60 (streaming.ts:578-584)
B UPDATE current_price=£55 (streaming.ts:578-584)  ← unconditional set, last writer wins
result: ledger contains both; visible high price can regress to £55
```

Even if update order happens differently, both requests were accepted against stale state. This cannot be fixed in the UI or realtime layer. Per [GavelLive](https://github.com/amoghsingh130/gavellive): "Every bid runs as a single serializable transaction... read auction snapshot, validate, insert bid, update high bid, extend clock if inside anti-snipe window."

### 3.4 Intended bottom-up commerce flow

```text
listing/auction eligibility
  → immutable lot snapshot + authoritative server clock
  → lot.opened event
  → transactional bid commands (idempotent, serialized)
  → bid.accepted/rejected ledger + outbox sequence
  → realtime projection/viewer reconciliation
  → lot.closed winner transaction
  → checkout/order/payment reservation
  → settlement / failure / dispute lifecycle
```

---

## 4. August 2026 benchmark research

### 4.1 Whatnot — largest live shopping stream in US history (Feb 2026)

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Whatnot Engineering — Scaling MrBeast Big Game Sunday 2026](https://medium.com/whatnot-engineering/scaling-whatnot-behind-the-largest-live-shopping-stream-in-us-history-040a458f538c) | 583K concurrent viewers on a single show; 555K entries in a single giveaway; hundreds of thousands of new signups in 24h; zero major incidents. Built Client Admission Service (CAS) for admission control, connection pooling, feed resilience, video infrastructure. 60+ engineers, months of preparation | ThryftVerse's current architecture (single Fastify process, no admission control, no connection pooling strategy) cannot handle even 1% of this scale. Plan for admission control and progressive load testing from day one |
| [Whatnot — Evolving Feed Ranking](https://medium.com/whatnot-engineering/evolving-feed-ranking-at-whatnot-25adb116aeb6) | 65% of GMV comes from feeds; 50% from For You Feed alone. Real-time retrieval and ranking, Kafka stream processing. "A buyer may be interested in a show selling Air Jordans in their size right now, but much less interested when the seller starts selling Crocs 5 minutes later" | Live shopping discovery must be real-time, not batch. ThryftVerse's live session discovery should integrate with the recommendation system (#10) for real-time show surfacing |
| [TechCrunch — Whatnot acquires Shaped, Jul 2026](https://techcrunch.com/2026/07/15/whatnot-acquires-shaped-to-power-real-time-live-shopping-recommendations/) | Whatnot acquired Shaped for real-time recommendation and search. "Live commerce is a uniquely hard recommendation problem. Inventory changes by the second, shows start and end continuously, and buyer intent shifts throughout a show." 500K+ hours of live video per week | Real-time recommendation is a competitive necessity for live commerce, not a nice-to-have. ThryftVerse should plan for real-time show/product recommendation integration |

### 4.2 Live commerce platform architecture (2026)

| Source | Finding | ThryftVerse application |
|---|---|---|
| [Let's Build — Live Commerce Platform Design](https://letsbuildsolutions.com/blog/system-design/designing-a-live-commerce-platform-real-time-bidding-inventory-reservation-and-multi-channel-product-sync-at-scale/) | Separate bid processing from fan-out. Bids processed by stateless service writing to Redis Stream; fan-out tier subscribes and pushes over WebSocket. Consistent hashing at load balancer routes viewers to fan-out nodes by auction ID | ThryftVerse's current bid processing is in the HTTP route handler with no separation from realtime fan-out. At scale, bid processing and fan-out must be separate services |
| [RaftLabs — How to Build a Live Shopping Marketplace Like Whatnot (2026)](https://www.raftlabs.com/blog/how-to-build-an-app-like-whatnot) | "Sub-1-second streaming latency is not optional. Latency above 3 seconds breaks auction psychology and kills bid conversion." MVP: 18–24 weeks, $90K–$150K. Full platform: 32–44 weeks, $220K–$380K | ThryftVerse's current placeholder video has infinite latency. Sub-1-second is the target for auction-quality live shopping |

### 4.3 LiveKit React Native production (2026)

| Source | Finding | ThryftVerse application |
|---|---|---|
| [LiveKit RN SDK docs, accessed 25 Aug 2026](https://docs.livekit.io/transport/sdk-platforms/react-native/) | Requires `@livekit/react-native` + `@livekit/react-native-webrtc`; `LiveKitReactNative.setup()` in `MainApplication.java` with `AudioType.CommunicationAudioType()`; `registerGlobals()` in `index.js`; wrap component in `LiveKitRoom` with `serverUrl` + `token` + `connect={true}` | ThryftVerse has the packages installed but never calls `registerGlobals()`, never wraps screens in `LiveKitRoom`, and never uses `VideoTrack` |
| [LiveKit Community — Session management best practices, Jan 2026](https://community.livekit.io/t/best-practices-for-livekit-session-management-in-react-native-apps/130) | For 1M MAU RN app: background LiveKit requires Foreground Service on Android; starting new session has 2–3s delay; recommendation: start new session each time unless telephone-like use case | ThryftVerse live shopping is not telephone-like; start new session each time. Plan for 2–3s connection delay in UX |
| [Forasoft — RN Video Chat 2026 SDK](https://www.forasoft.com/blog/article/react-native-video-chat) | RN 0.85 (Expo SDK 55) ships New Architecture (Fabric + JSI + TurboModules) by default; legacy bridge removed. LiveKit Cloud: ~$0.0004/min after build tier; free on self-host. "Most teams should start on managed SDK for time-to-market" | ThryftVerse should use LiveKit Cloud managed SDK first, migrate to self-host when usage justifies |

### 4.4 Real-time auction concurrency patterns (2026)

| Source | Finding | ThryftVerse application |
|---|---|---|
| [GavelLive on Aurora DSQL](https://dev.to/amoghsingh130/proving-a-live-auction-cant-lose-your-bid-gavellive-on-aurora-dsql-vercel-43ni) | Every bid is one serializable transaction: read snapshot, validate, insert bid, update high bid, extend clock if anti-snipe. OCC aborts on conflict (PostgreSQL error 40001), retry loop handles it. "Zero lost writes, a price that only moves up, and exactly one winner" | ThryftVerse's bid path (`streaming.ts:571–584`) is the textbook lost-update bug they describe. Must move to serializable transaction with retry loop |
| [Realtime Auction Backend (FastAPI + Redis + PostgreSQL)](https://github.com/Young-Keun-LEE/realtime-auction-backend) | Redis Lua scripts for atomic check-and-set (sub-100ms p99); Kafka for event streaming; Go for high-throughput ingestion, Python for async broadcasting. "Traditional database-first approaches fail due to locking overhead" at thousands of bids/sec | For ThryftVerse's expected scale (not thousands of bids/sec initially), PostgreSQL serializable transactions are sufficient. Redis Lua is the path for extreme contention |
| [Supabase Realtime bidding engine, Apr 2026](https://socialanimal.dev/blog/build-real-time-bidding-engine-supabase-realtime/) | PostgreSQL triggers broadcast bid updates on commit; no separate WebSocket server needed; every connected client sees same state within 50ms. "The only auction system I didn't have to rebuild after launch" | ThryftVerse already has a realtime topic system; the key insight is that bid updates must be broadcast only after commit, not optimistically |

---

## 5. Capability, state and ownership matrices

### 5.1 Three-plane architecture

| Concern | Media plane (LiveKit) | Application realtime | Commerce plane |
|---|---|---|---|
| Video/audio tracks | Authoritative transport state | Publishes health summaries only | Never trusts frames as auction time |
| Participant connection | Webhook/provider truth | Presence projection + fan-out | Eligibility only |
| Chat/reactions | Optional data path, not authority | Sequenced messages/moderation | No money effects |
| Current product | Display marker only | Fan-out snapshot/version | Lot engine authority |
| Bid | Must not travel as authoritative peer data | Delivers accepted/rejected events | Serializable transaction authority |
| Clock/close | Media latency irrelevant | Server time/event sequence | Authoritative monotonic deadline |
| Viewer count | Provider participant/webhook source | Reconciled public projection | Analytics only |
| Recording | Egress state | Processing notifications | Replay product availability joins listing state |

### 5.2 Source-of-truth matrix

| State | Current owner | Failure | Target authority |
|---|---|---|---|
| Stream lifecycle | Provider metadata + DB status | Provider/DB split brain (`streamProvider.ts:167–191`) | DB state machine; provider is reconciled side effect |
| Host identity | DB + provider metadata | startStream replaces metadata (`streamProvider.ts:180`) | DB; signed host token derives from it |
| Viewer presence | token/leave counters (`streaming.ts:351–352, 381–382`) | Inflated on token, manipulated on leave | Provider webhooks + short-lived membership lease |
| Current lot | mutable one-row table (`streaming.ts:489–506`) | No listing validation, no version | Versioned lot state/auction engine |
| Highest bid | mutable price + bid rows (`streaming.ts:578–584`) | Race-prone, non-monotonic | Append-only bid ledger + serialized lot aggregate |
| Winner/order | absent | No settlement path | Transactional lot close + order/payment workflow |
| Native media state | absent/placeholders (`LiveStreamSellerScreen.tsx:240–247`, `LiveStreamViewerScreen.tsx:515–517`) | No real video | LiveKit room/track state adapter |
| Post-live summary | demo/local | Not backend-reconciled | Backend reconciled aggregates |

---

## 6. User psychology, JTBD and trust

### 6.1 Seller jobs

- "Know my camera, mic, network and lots are ready before I risk going live."
- "Keep selling through temporary media degradation without losing commerce truth."
- "Move between lots quickly while always knowing what buyers see and can bid on."
- "End safely and trust the summary, orders and recording status."

### 6.2 Viewer jobs

- "Join quickly and know whether I am live, delayed, reconnecting or watching replay."
- "See the actual item, authoritative price and time without chat obscuring it."
- "Place one bid and know whether it was accepted, rejected or outcome unknown."
- "Recover after a disconnect without duplicate bids or missing the winner."

### 6.3 Trust principles

- Video is evidence, not the auction clock. Always render server time/state.
- Do not render viewer count, verified seller, stock, "sold," winner or revenue unless backend-evidenced.
- A disconnected bid response is **unknown outcome**, not failed; show `Check result` and use the same idempotency key.
- Latency honesty matters: indicate `Live`, `Delayed`, `Reconnecting`, `Audio only`, `Replay` as distinct states.
- Ending a stream is reputational and commercial. Require a deliberate confirmation when a lot/bid is open.

---

## 7. Strict anti-AI native design direction

### 7.1 Seller first viewport

- Dominant real camera preview (roughly 55–65% height), edge-to-edge within safe area.
- Top: transparent Close, camera/mic status, connectivity status only when degraded.
- Bottom: current selected lot row and one restrained `Go live` action. Preflight issues appear inline at the affected control—not a grid of green cards.
- Backstage state looks almost identical to live state to avoid geometry shift.

### 7.2 Viewer first viewport

- Video dominates full viewport. Top transparent targets: leave, seller identity, truthful live/delay state.
- Bottom dock: current product media/title, authoritative price/time and one primary bid/buy action.
- Chat is a bounded translucent text region that can collapse; do not place card-on-card commerce over media.
- **Remove floating hearts animation** (`LiveStreamViewerScreen.tsx:118–135, 594–603, 1010–1013`). Reactions cannot occlude product or bid state in commerce-critical moments. Per AGENTS.md §4: "Excessive motion. Every mount animates, every press bounces, every transition slides. Flagship apps animate rarely and meaningfully."

### 7.3 Visual grammar

- Transparent 44pt targets with 20–24pt icons; visible circles only for contrast/primary state.
- One dock radius and one sheet radius; hairline separators; no glow/gradient/live-dashboard cards.
- `LIVE` is a status label, not decorative red chrome. No pulsing.
- Haptics: selection for camera/lot, success only after authoritative bid acceptance, warning for outbid/unknown outcome, destructive confirmation for end.

### 7.4 Accessibility

- Caption toggle and transcript/chat separation; never make chat the only representation of spoken product facts.
- Bid updates are polite announcements; outbid/closing/accepted use bounded priority without flooding screen readers.
- All overlay actions retain contrast across arbitrary video and Dynamic Type.
- Reduce Motion removes hearts and sliding chat; preserve state change through text/haptic.
- Audio-only users receive product media, title, price, timer and lot status; blind users receive product descriptions and ordered focus independent of video.

---

## 8. Complete state machines

### 8.1 Seller/media

```text
draft
 → permissions(camera,mic)
 → preflight(device, audio route, network, lots, policy)
 → creating_session
   → backstage(token, local preview)
   → create_failed | unknown_create_outcome
 → publishing
   → live_healthy
   → live_degraded(video|audio|network)
   → reconnecting
   → publish_failed
 → ending_requested
   → ending_commerce
   → ending_media
   → ended
   → unknown_end_outcome
 → recording_processing → replay_ready | recording_failed
```

### 8.2 Viewer/media

```text
upcoming | joining
 → connected_waiting_for_track
 → live
   ↔ audio_only
   ↔ reconnecting(previous lot retained)
 → host_ended | removed | restricted
 → replay_processing | replay_ready
error/token_expired/capacity/network → bounded retry
```

### 8.3 Lot/bid

```text
no_lot → scheduled → open(version, deadline)
bid stable
 → submitting(clientBidId)
   → accepted(sequence, highBid)
   → accepted_but_outbid(sequence)
   → rejected(code, authoritative snapshot)
   → unknown_outcome(operation lookup)
open → closing → sold | reserve_not_met | passed | cancelled
sold → checkout_reserved → order_created | payment_failed/expired
```

Media reconnect cannot reopen or extend a lot unless the commerce engine explicitly emits a versioned policy action.

---

## 9. Target architecture and source-of-truth boundaries

```text
Native host/viewer
  ├─ Media: LiveKit RN room/tracks/WebRTC stats
  ├─ Realtime: authenticated sequenced topic + gap recovery
  └─ Commerce: HTTPS idempotent commands + authoritative snapshots

Session service (DB state machine)
  → outbox saga → LiveKit RoomServiceClient/Egress
  ← verified LiveKit webhooks → provider projection/presence

Lot/Auction engine
  → serialized aggregate/transaction
  → bid ledger + current state + outbox event
  → reservation/order/payment settlement

Moderation service
  → roles, chat policy, mute/ban/report/terminate audit
```

### 9.1 Boundaries

- Database session state is product authority; provider state is reconciled infrastructure truth.
- LiveKit webhooks are provider-presence evidence; public counts are privacy-thresholded projections.
- Lot engine alone accepts/closes bids. Realtime only broadcasts committed events.
- Orders/payments remain canonical commerce systems; live shopping orchestrates, never duplicates them.
- Native never calculates authoritative deadline, winner, revenue or viewer count.

---

## 10. Proposed schemas, contracts and events

### 10.1 Session model

```text
live_sessions:
 id, host_id, title, status(draft|backstage|live|ending|ended|failed),
 scheduled_at, started_at, ended_at, provider, provider_room_id,
 provider_region, version, moderation_state, recording_policy,
 replay_media_asset_id, failure_code, idempotency_key, created_at, updated_at

live_session_transitions:
 session_id, from_status, to_status, actor_id, reason, version, event_id, at

live_participant_leases:
 session_id, actor_id, provider_participant_sid, role, joined_at,
 last_seen_at, left_at, connection_state, UNIQUE(session_id, actor_id, active lease)
```

### 10.2 Lot aggregate

```text
live_lots:
 id, session_id, listing_id, listing_snapshot_id, position,
 status, currency, start_price_minor, reserve_price_minor,
 min_increment_policy, opens_at, closes_at, version,
 high_bid_id, high_bid_minor, winner_id, order_id

live_bids:
 id, client_bid_id, session_id, lot_id, bidder_id,
 amount_minor, max_amount_minor, status, rejection_code,
 accepted_sequence, lot_version, created_at,
 UNIQUE(bidder_id, client_bid_id)
```

Use integer minor units/canonical money contract, not unconstrained `NUMERIC(14,2)` at client boundaries. Lot opening snapshots listing title/media/condition/seller/currency while retaining canonical listing ID.

### 10.3 Bid command/result

```ts
interface PlaceLiveBidCommand {
  clientBidId: string; sessionId: string; lotId: string;
  expectedLotVersion: number; amountMinor: number;
}
interface PlaceLiveBidResult {
  operationId: string;
  outcome: 'accepted' | 'rejected' | 'unknown';
  code?: 'OUTBID'|'TOO_LOW'|'LOT_CLOSED'|'VERSION_CONFLICT'|'INELIGIBLE';
  authoritativeLot?: LiveLotSnapshot;
  eventSequence?: number;
}
```

**Transaction pattern (per GavelLive/Aurora DSQL model):**
```text
BEGIN
  SELECT * FROM live_lots WHERE id = $lotId FOR UPDATE;
  validate (status=open · amount ≥ high_bid + increment · deadline not passed)
  INSERT INTO live_bids (client_bid_id, ...) ON CONFLICT DO NOTHING
  UPDATE live_lots SET high_bid = GREATEST(high_bid, $amount), version = version + 1
  extend closes_at if inside anti-snipe window
  INSERT INTO outbox (event_type='live.bid.accepted.v1', ...)
COMMIT
-- on 40001 (serialization conflict): retry with backoff
-- on client_bid_id conflict: return existing result (idempotent)
```

Only then acknowledge acceptance. Realtime broadcasts the outbox event after commit.

### 10.4 Events

```text
live.session.created.v1 / backstage_ready.v1 / started.v1
live.session.media_degraded.v1 / ended.v1 / failed.v1
live.participant.joined.v1 / left.v1 / reconciled.v1
live.track.published.v1 / unpublished.v1
live.lot.opened.v1 / updated.v1 / closing.v1 / closed.v1
live.bid.accepted.v1 / rejected.v1 / outbid.v1
live.checkout.reserved.v1 / order.created.v1 / reservation.expired.v1
live.chat.message.created.v1 / moderated.v1
live.moderation.action.v1
live.recording.started.v1 / ready.v1 / failed.v1
```

Every envelope carries session ID, aggregate version, global/session sequence, schema version, event ID and server timestamp. Client detects gaps and refetches `/snapshot?afterSequence=`.

---

## 11. Provider/media implementation decisions

- **Replace `generateAuthHeader`/`generateSimpleToken`** (`streamProvider.ts:351–364`) with `RoomServiceClient` from `livekit-server-sdk`. The base64 placeholder is not a valid LiveKit auth token.
- **Fix `startStream` metadata replacement** (`streamProvider.ts:180`): merge new fields into existing metadata, don't replace. Or stop treating provider metadata as canonical and use DB as source of truth.
- **Fix `endStream` post-deletion query** (`streamProvider.ts:205`): don't query a room after `DeleteRoom`; return a synthetic ended state from DB.
- Participant JWT TTL should be shorter (currently 2h, `streamProvider.ts:236`), scoped to role and refreshable; host tokens include only required publish sources.
- Integrate `registerGlobals`/audio session per [LiveKit RN docs](https://docs.livekit.io/transport/sdk-platforms/react-native/) before room use.
- Host: local camera preview, publish/unpublish, camera flip, mute, audio-route handling, phone-call/background interruption and reconnect.
- Viewer: actual subscribed video track and room audio renderer, track priority/adaptive subscription, audio-only fallback.
- Collect standardized WebRTC stats: RTT, packet loss, jitter, bitrate, frames, freezes and reconnects; map to coarse UI quality state.
- Webhook handler verifies signature, deduplicates event ID, records provider transitions and reconciles leases/counts.
- For scale, decide WebRTC fan-out vs HLS/LL-HLS spectator path only from capacity/latency tests; do not assume one transport fits all audiences. Per [RaftLabs](https://www.raftlabs.com/blog/how-to-build-an-app-like-whatnot): "Sub-1-second streaming latency is not optional. Latency above 3 seconds breaks auction psychology."

---

## 12. Moderation, security and privacy

- Roles: host, co-host, moderator, viewer, restricted viewer, egress service. Authorize every command server-side.
- Chat: client message ID, idempotency, live/membership check, slow mode, mute/ban, report, link/spam policy and immutable moderation audit.
- Emergency terminate revokes publishing/token refresh, closes commerce first and records actor/reason.
- Token endpoint checks session status, capacity, blocks, geography/age/category and device/risk policy.
- Prevent seller self-bidding, related-account bidding, collusion/shill patterns and rapid high-value abuse; trust/risk decision is recorded, not UI-inferred.
- Bid names/public identity are privacy-minimized; avoid broadcasting full buyer IDs.
- Recording requires explicit seller/user policy, visible state, storage retention, chat/identity redaction and takedown propagation.
- Secrets never enter client logs/analytics; provider webhook and server API credentials rotate.

---

## 13. Threat/failure-mode analysis

| Failure | Current exposure | Required control |
|---|---|---|
| Provider room RPC auth fails | Base64 placeholder (`streamProvider.ts:360–364`) | Official SDK `RoomServiceClient` |
| Mock silently serves production | Default/fallback mock (`config.ts`) | Production assertion and capability unavailable response |
| Token count inflation | Count increments on token request (`streaming.ts:351–352`) | Webhook-confirmed lease and dedupe |
| Malicious leave decrement | No membership link (`streaming.ts:380–386`) | Lease-scoped idempotent leave; webhook authority |
| Bid race/lower overwrite | Separate read/insert/update (`streaming.ts:571–584`), unconditional `current_price = $2` | Serialized transaction with `FOR UPDATE` + `GREATEST` |
| Duplicate bid after retry | No idempotency (`streaming.ts:568`) | Client bid ID unique per actor |
| Unknown mobile outcome | Generic error toast | Operation lookup + warning/check-result state |
| Provider/DB split brain | Provider-first lifecycle writes (`streamProvider.ts:127–191`) | Outbox saga, transition state and reconciler |
| Metadata corruption | startStream replaces metadata (`streamProvider.ts:180`) | Merge metadata or use DB as canonical |
| Listing substitution | Lot references loose listing ID (`streaming.ts:489–506`) | Immutable lot snapshot and seller ownership checks |
| Realtime gap | No visible snapshot recovery | Sequence tracking + snapshot endpoint |
| Stream ends while lot open | Independent media/commerce | End orchestration closes/pauses commerce before media |
| Host disconnect | No lease/policy state | Grace window and explicit pause/end policy |
| Replay shows removed item | No replay mapping | Timed markers join current listing eligibility |
| Chat abuse/PII | Basic rate limit only | Moderation roles, filters, reports, audit, privacy |
| Decorative hearts occlude bid state | Floating hearts (`LiveStreamViewerScreen.tsx:594–603`) | Remove or severely bound; never occlude commerce state |

---

## 14. SLOs, SLIs and observability

| SLI | Target |
|---|---:|
| Session API availability | 99.95% monthly |
| Provider create/backstage readiness | p95 <3s |
| Viewer join to first audio/video | p50 <1.5s, p95 <3s on supported networks |
| Media reconnect success | >99% within 10s for recoverable disruptions |
| Bid command availability | 99.99% during open lots |
| Bid accepted/rejected response | p95 <300ms region-local, p99 <700ms |
| Duplicate bid effects | exactly 0 |
| High-bid monotonicity violations | exactly 0 |
| Realtime committed event fan-out | p95 <250ms after commit |
| Sequence-gap recovery | p95 <1s |
| Presence reconciliation drift | <1% and corrected <30s |
| Stream close → bids disabled | p99 <250ms, before ended event |
| Timer/track/listener leaks | 0 in 2-hour soak/repeated join tests |

Observability separates provider media, app realtime and commerce. Correlate session/room/participant/lot/bid/order IDs with trace IDs while redacting secrets and buyer identity. Dashboards: join success/TTFF, packet loss/jitter/freeze, reconnects, webhook lag/dedupe, presence drift, sequence gaps, bid latency/rejections/unknown outcomes, lock contention, lot close/order conversion, chat reports, egress status and mobile crashes.

---

## 15. Migration, feature flags, compatibility and rollback

### 15.1 Flags

```text
live_provider_required_v1
live_native_viewer_media_v1
live_native_host_media_v1
live_webhook_presence_v1
live_lot_engine_v1
live_bidding_v1
live_recording_replay_v1
live_remove_floating_hearts_v1
```

### 15.2 Safe sequence

1. Production readiness rejects mock/placeholder room auth; internal demo remains explicit fixture mode.
2. Replace `generateAuthHeader`/`generateSimpleToken` with `RoomServiceClient`; fix `startStream` metadata merge.
3. Implement provider SDK client/webhook/reconciler and session transition ledger.
4. **Remove floating hearts** (`LiveStreamViewerScreen.tsx:118–135, 594–603`); replace with bounded reaction count.
5. Viewer-only real media launch with commerce controls disabled; measure join/soak/accessibility.
6. Host backstage/publish launch to staff sellers; no bidding.
7. Shadow presence against provider participants, then replace token counters.
8. Migrate lots to versioned snapshots; dual-write old/new state in non-money rehearsals.
9. Shadow new bid engine with synthetic/internal traffic; concurrency and failure injection.
10. Canary bidding by seller/category/value limits; existing auction/order/payment systems handle settlement.
11. Add recording/replay only after consent/storage/takedown and egress capacity gates.

Rollback disables host/bid flags, closes new commerce commands, preserves sessions/replays already committed, and falls back to browse/listing detail—not fake video. Schemas are additive. Old app versions cannot join money-bearing live lots after minimum-version gate; token endpoint enforces capability version.

---

## 16. Phased implementation plan mapped to files/owners

### Phase 0 — P0 shutdown/hardening (1 sprint)

- **Backend/SRE:** `streamProvider.ts` (lines 351–364, 167–191, 193–219), `productionReadiness.ts`, capability health and official SDK client.
- **Commerce:** transactionally fix/disable `/bids` (`streaming.ts:571–584`); add idempotency and concurrency tests before any exposure.
- **Native:** hide production seller/buy-now controls that are unavailable; **remove floating hearts** (`LiveStreamViewerScreen.tsx:118–135, 594–603`); retain explicit demo mode internally.

### Phase 1 — real media + session saga (2–4 sprints)

- **Native media:** integrate `useLiveKitRoom` or replace with idiomatic LiveKit components in both screens; `registerGlobals()`, `AudioSession`, permissions, `VideoTrack` renderer, publish controls, cleanup.
- **Backend realtime:** webhook route, dedupe, presence leases and provider reconciler.
- **Data:** session transition/provider-event migrations.
- **Design/accessibility:** backstage/live/reconnect/audio-only compositions.

### Phase 2 — authoritative lots and bidding (3–5 sprints)

- **Auctions/Commerce:** versioned lot aggregate, bid ledger/idempotency/locking (serializable transaction per GavelLive pattern), settlement and order/payment integration.
- **Realtime:** event schemas, sequence snapshot/gap recovery.
- **Trust:** bidding eligibility/collusion/moderation.
- Likely changes: `routes/streaming.ts` split into session/chat/lot modules, migrations, frontend contract/service/state hooks.

### Phase 3 — operations/replay (2–4 sprints)

- **Media platform:** egress lifecycle/webhooks/storage.
- **Seller ops:** schedule, rehearsal, co-host/moderator, incident controls and backend summaries.
- **Replay:** timed product markers, current eligibility and privacy-safe transcript/chat policy.

---

## 17. Test, chaos, eval and release gates

- Real LiveKit create/start/join/publish/subscribe/end integration in staging with official credentials.
- Host/viewer device matrix: iOS/Android, camera/mic denied, Bluetooth/wired audio, phone call, background/foreground, rotation, low-power and poor networks.
- Concurrency test thousands of simultaneous bids proves monotonic high bid, one effect per client ID and deterministic close boundary (per GavelLive pattern).
- Fault injection at every transaction/provider boundary proves no orphan or fabricated success; reconcilers converge.
- Token replay/role escalation/capacity/block/ended-session tests fail closed.
- Realtime disconnect/gap/duplicate/out-of-order events recover to authoritative snapshot.
- Two-hour broadcast + 100 repeated joins show no track/timer/listener/audio-session leak.
- Chat spam/mute/ban/report/emergency terminate and immutable audit tests.
- VoiceOver/TalkBack, captions, Dynamic Type, contrast-over-video, reduced motion and audio-only test matrix.
- Load test join storm, realtime fan-out, chat burst and bid burst independently; media load cannot starve bid API.
- Canary has staffed incident owner, automatic kill switches and a rehearsed rollback.
- No floating hearts or decorative motion renders on any live commerce state.

---

## 18. Explicit non-goals

- Building a custom SFU or WebRTC protocol.
- Sending authoritative bids over peer/data channels.
- Simulating viewer counts, purchases, sellers or revenue in production.
- Launching open-to-all sellers before staff/curated operational validation.
- Treating recording as automatic or indefinite.
- Copying Whatnot auction rules without product/legal decisions.
- Combining this work with the broader auctions lifecycle beyond directly coupled lot/settlement boundaries.

---

## 19. Decisions requiring product, legal/trust and operations input

1. Live sale model: auction, max-bid, fixed-price, flash sale or a constrained combination.
2. Bid increment, anti-sniping, reserve, cancellation/retraction and tie rules.
3. Seller eligibility, rehearsal, moderation staffing and emergency ownership.
4. Age/geography/category restrictions and high-value/KYC thresholds.
5. Recording consent, retention, replay chat/identity and takedown rules.
6. Public viewer-count privacy threshold and definition.
7. Host-disconnect grace/pause policy and whether lots auto-extend.
8. Captions/transcription obligations, provider and retention.
9. WebRTC vs LL-HLS spectator strategy at expected concurrency/latency.

---

## 20. Final decision

**BLOCK PUBLIC/MONEY-BEARING LAUNCH.** The immediate product milestone is a staff-only real media session with provider health, native track rendering/publishing, webhook presence and no commerce controls. In parallel, replace the current bid endpoint (`streaming.ts:571–584`) with a serialized idempotent lot engine (per GavelLive's serializable transaction pattern) and complete settlement/unknown-outcome semantics. Fix the provider auth (`streamProvider.ts:360–364`), metadata corruption (`streamProvider.ts:180`), token discard (`liveShoppingApi.ts:603–604`), and remove decorative hearts (`LiveStreamViewerScreen.tsx:118–135`). Only when both planes independently pass their SLOs—and the sequenced realtime projection reconciles them—does ThryftVerse have live shopping rather than a demo UI around disconnected scaffolding.
