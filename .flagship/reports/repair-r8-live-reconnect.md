# Repair R8 — Live viewer resnapshot / reconnecting — Repair Report

Scope owned: `frontend/src/hooks/livestream/useLiveStreamSession.ts` and its
direct consumers/helpers. Finding sourced from the validation audit:
`useLiveStreamSession` never subscribed to the realtime `onResnapshot`
signal and exposed no `reconnecting` state, while sibling consumers
(`useConversationMessages`, `useCoOwnOrderBookStream`) already implement the
resnapshot/gap-recovery pattern.

Status: **complete** — `npm run typecheck` clean, focused vitest file green
(5/5). Not committed.

---

## Root cause

The viewer session hook managed its own connection state machine
(`connecting → live | error | ended | scheduled | removed`) and subscribed
to per-event realtime streams, but had **no recovery path for transport
gaps**. `RealtimeClient.checkAndReplayGaps`
(`frontend/src/platform/realtime/RealtimeClient.ts:447-508`) replays missed
events after a reconnect and emits a `resnapshot` signal when the gap
overflows the server's 200-event ring buffer
(`RealtimeClient.ts:472-484`). The hook never registered an
`onResnapshot` handler and never mirrored the transport's
`reconnecting` state — so after a long background/offline gap the viewer
silently kept a stale lot, stale chat and stale viewer count with no
indication the feed had fallen behind.

## Pattern mirrored

- `useCoOwnOrderBookStream`
  (`frontend/src/hooks/useCoOwnOrderBookStream.ts:266-279`): registers
  `client.onStateChange` (marks stale + refetches on `reconnecting`) and
  `client.onResnapshot` (topic-matched → `fetchSnapshot()`), with a
  `snapshotRequestRef` epoch guard on async writes (`:103-123`).
- `useConversationMessages`
  (`frontend/src/hooks/chat/useConversationMessages.ts:915-925`): consumes
  `useRealtimeResnapshot(topic)` → re-syncs the canonical list.
- Chat keeps topic naming in the service (`chatConversationTopic`); the
  live equivalent `liveSessionTopic` existed but was module-private.

## Changes

### `frontend/src/services/liveShoppingApi.ts`

- `liveSessionTopic` is now exported (`liveShoppingApi.ts:934-940`) so the
  hook can match resnapshot signals against the session's canonical topic
  (`live.session:{id}`) instead of duplicating the string.

### `frontend/src/hooks/livestream/useLiveStreamSession.ts`

- **Realtiming flag**: `reconnecting` state (`:55`), `realtimeClient` from
  `useRealtimeSafe()` (`:56`), and `resnapshotEpochRef` (`:60`) — the
  epoch guard matching `snapshotRequestRef` in the Co-Own hook.
- **`onStateChange` subscription** (`:301-308`): `reconnecting` → flag on;
  `connected`/`disconnected` → flag off. `disconnected` clears rather than
  promising a recovery the client's backoff has abandoned. Small gaps are
  still healed by the transport's own replay — the hook only refetches on
  the `resnapshot` signal, not on every reconnect.
- **`onResnapshot` subscription** (`:310-314`): topic-matched to
  `liveSessionTopic(sessionId)`; raises `reconnecting` and runs the
  resnapshot fetch.
- **`resnapshot()`** (`:264-295`): refetches the canonical snapshot through
  the same primitives the initial connect uses — `connectToStream`
  (session + fresh viewer token + current lot) and
  `fetchStreamChatHistory`. Applies the same status transitions as the
  initial connect (`ended`/`scheduled`/`live`, current-lot replacement,
  viewer count, chat history). Epoch-guarded at both await boundaries so a
  superseded fetch resolves to a no-op (also skips the chat fetch when the
  session snapshot is already stale). `finally` clears `reconnecting` only
  for the latest epoch; a null snapshot surfaces the honest `error` state.
- **`retry()`** (`:339-352`): bumps the epoch (invalidating any in-flight
  resnapshot write) and clears `reconnecting` alongside the existing reset.
- Cleanup unsubscribes both transport listeners (`:331-332`); effect deps
  now include `realtimeClient` (`:335`) so the wiring re-attaches if the
  provider's client arrives after mount (previously the event
  subscriptions silently no-op'd in that window).
- `reconnecting` added to the return contract (`:361`).

### `frontend/src/screens/LiveStreamViewerScreen.tsx`

- Destructures `reconnecting` (`:91`) and passes it as
  `sessionReconnecting` into `resolveStageCaption` (`:131`) — the existing
  stage-caption status surface; no new chrome invented.

### `frontend/src/components/livestream/livestreamUtils.ts`

- `resolveStageCaption` accepts `sessionReconnecting?: boolean`
  (`:94-105`): while the session feed is recovering it returns
  `t('session.reconnecting')` — the data-stale truth takes precedence over
  the video-room captions because bids/chat/lot are stale even when video
  still plays. Optional param; the single existing caller updated.

### `frontend/src/i18n/locales/en.json`

- `liveStreamViewer.session.reconnecting` = `"Reconnecting…"` (`:1287-1289`).
  Non-English locales resolve via i18next `fallbackLng: 'en'`
  (`src/i18n/i18n.ts:165`).

## Regression tests — `frontend/src/__tests__/liveStreamSessionResnapshot.test.tsx`

Runtime tests in the established dialect (`react-test-renderer` + `act`,
service/realtime boundaries mocked like `liveStreamReplayRace.test.tsx`).
All five fail on the pre-fix hook (no `reconnecting`, no `onResnapshot`):

1. `marks the feed reconnecting while the transport recovers` —
   `reconnecting` mirrors `reconnecting`/`connected` transport states.
2. `refetches the canonical snapshot on resnapshot and clears reconnecting` —
   resnapshot → `connectToStream` + `fetchStreamChatHistory` re-invoked,
   flag true while in flight, cleared with the new snapshot applied
   (viewerCount 100 → 250).
3. `ignores resnapshot signals addressed to other topics` — no refetch, no
   flag for foreign topics.
4. `a superseded resnapshot fetch never overwrites the newer snapshot` —
   two overlapping resnapshots; the stale fetch resolving last is dropped
   by the epoch guard.
5. `converges to ended when the resnapshot discovers the stream finished` —
   the stream can end while the viewer is disconnected; the resnapshot
   applies the `ended` state.

## Verification

- `cd frontend && npm run typecheck` → clean (tsc --noEmit, exit 0).
- `npx vitest run src/__tests__/liveStreamSessionResnapshot.test.tsx` →
  5/5 pass.
- `npx vitest run src/__tests__/liveStreamReplayRace.test.tsx` → 2/2 pass
  (adjacent livestream coverage, no regression).

## Notes / residual

- On transport `reconnecting` without a resnapshot (replayable gap), the
  flag still shows for the gap window — honest staleness signalling; the
  transport's own replay heals the delta stream.
- The resnapshot re-requests a viewer token via `connectToStream` — the
  same thing `retry()` already does, and it refreshes potentially-expired
  LiveKit credentials after a long disconnect. No new backend dependency.
- Demo mode is unaffected: resnapshot/state signals only fire for topics
  the shared client subscribes to.
