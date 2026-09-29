/**
 * Web live-shopping service — mirrors the mobile liveShoppingApi.
 * `/streaming/sessions` returns BackendStreamRoom rows; map them onto the
 * web LiveSession contract. `reminded` merges from localStorage when the
 * backend does not echo a per-viewer flag (same merge as mobile).
 */

import { fetchJson, parseApiError } from '../http';
import type { LiveSession } from '@/lib/data/fixtures-media';

interface BackendStreamRoom {
  roomId: string;
  title: string;
  hostUserId: string;
  status: 'created' | 'live' | 'ended' | 'failed';
  roomUrl: string;
  recordingUrl?: string | null;
  recordingEnabled?: boolean;
  viewerCount: number;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  scheduledStartAt?: string | null;
  scheduled_start_at?: string | null;
  hostUsername?: string | null;
  hostAvatarUrl?: string | null;
  hostVerified?: boolean | null;
  currentLotTitle?: string | null;
  currentLotPriceMinor?: number | null;
  thumbnailUrl?: string | null;
  reminded?: boolean | null;
}

interface BackendStreamSessionsResponse {
  ok: boolean;
  sessions: BackendStreamRoom[];
}

const REMIND_KEY = 'thryftverse.live.reminders.v1';

function readLocalReminders(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(REMIND_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeLocalReminder(id: string, on: boolean) {
  if (typeof window === 'undefined') return;
  const set = readLocalReminders();
  if (on) set.add(id);
  else set.delete(id);
  try {
    window.localStorage.setItem(REMIND_KEY, JSON.stringify([...set]));
  } catch {
    // best-effort
  }
}

function mapRoom(room: BackendStreamRoom): LiveSession {
  const scheduledStartAt = room.scheduledStartAt ?? room.scheduled_start_at ?? undefined;
  const remindedFlag = room.reminded ?? (readLocalReminders().has(room.roomId) ? true : undefined);
  const startedMs = room.startedAt ? Date.parse(room.startedAt) : NaN;
  const endedMs = room.endedAt ? Date.parse(room.endedAt) : NaN;
  // Replay length is derivable truth — render it only when both stamps
  // resolved, never a placeholder number.
  const durationMinutes =
    Number.isFinite(startedMs) && Number.isFinite(endedMs) && endedMs > startedMs
      ? Math.max(1, Math.round((endedMs - startedMs) / 60_000))
      : undefined;
  return {
    id: room.roomId,
    sellerId: room.hostUserId,
    sellerName: room.hostUsername ?? '',
    sellerAvatar: room.hostAvatarUrl ?? '',
    sellerVerified: room.hostVerified ?? false,
    title: room.title,
    // No category field on the room contract — the hub's segment filter
    // stays absent in live mode rather than inventing a taxonomy value.
    category: undefined,
    coverUri: room.thumbnailUrl ?? '',
    aspectRatio: 16 / 10,
    viewers: room.viewerCount,
    status:
      room.status === 'live' || (room.status as string) === 'ending'
        ? 'live'
        : room.status === 'ended' || room.status === 'failed'
          ? 'ended'
          : 'upcoming',
    startedAt: room.startedAt,
    scheduledAt: scheduledStartAt,
    endedAt: room.endedAt,
    durationMinutes,
    currentItemTitle: room.currentLotTitle ?? undefined,
    currentBid: room.currentLotPriceMinor != null ? room.currentLotPriceMinor / 100 : undefined,
    recordingUrl: room.recordingUrl ?? null,
    recordingEnabled: room.recordingEnabled ?? false,
    reminderSet: remindedFlag,
    isDemo: false,
  };
}

export async function fetchLiveSessions(signal?: AbortSignal): Promise<LiveSession[]> {
  const res = await fetchJson<BackendStreamSessionsResponse>(
    '/streaming/sessions',
    undefined,
    { signal },
  );
  return (res.sessions ?? []).map(mapRoom);
}

// ── Host lifecycle — mirrors mobile liveBroadcastApi.ts. Web creates,
//    schedules, starts and ends sessions; the host console at
//    /live/host/[id] publishes camera/mic over a 'host' LiveKit grant. ───

/** GET /streaming/sessions/:id — the session snapshot the host console
 *  resolves before rendering. Returns null when neither the persisted row
 *  nor the provider know the room (the route answers ok:false + null). */
export async function fetchStreamSession(
  sessionId: string,
  signal?: AbortSignal,
): Promise<LiveSession | null> {
  const res = await fetchJson<{ ok: boolean; session?: BackendStreamRoom | null }>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}`,
    undefined,
    { signal },
  );
  return res.session ? mapRoom(res.session) : null;
}

/** POST /streaming/sessions/:id/start — host/admin only; the real go-live.
 *  Flips the session to 'live' (there is no webhook status transition —
 *  this call is the contract), re-creates a provider room that was reaped
 *  while idle, and fans out live_started notifications. */
export async function startStreamSession(sessionId: string): Promise<LiveSession> {
  const res = await fetchJson<{ ok: boolean; session?: BackendStreamRoom }>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/start`,
    { method: 'POST' },
  );
  if (!res.session) throw new Error('Stream session did not start');
  return mapRoom(res.session);
}

/** POST /streaming/sessions/:id/end — host/admin only. Deletes the provider
 *  room, persists 'ended', and broadcasts `live.session.ended` with the
 *  real totals (viewers, lots sold, sales) on the session topic. */
export async function endStreamSession(sessionId: string): Promise<LiveSession> {
  const res = await fetchJson<{ ok: boolean; session?: BackendStreamRoom }>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/end`,
    { method: 'POST' },
  );
  if (!res.session) throw new Error('Stream session did not end');
  return mapRoom(res.session);
}

/** POST /streaming/sessions — seller/admin only. When `scheduledStartAt`
 *  is a future ISO the row persists in 'created' status and surfaces under
 *  Coming up on every platform's hub; omitting it creates the provider room
 *  immediately. */
export async function createBroadcastSession(input: {
  title: string;
  recordingEnabled?: boolean;
  maxViewers?: number;
  scheduledStartAt?: string;
}): Promise<LiveSession> {
  const res = await fetchJson<{ ok: boolean; session?: BackendStreamRoom }>(
    '/streaming/sessions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: input.title,
        recordingEnabled: input.recordingEnabled ?? false,
        maxViewers: input.maxViewers ?? 0,
        ...(input.scheduledStartAt ? { scheduledStartAt: input.scheduledStartAt } : {}),
      }),
    },
  );
  if (!res.session) throw new Error('Stream session was not created');
  return mapRoom(res.session);
}

/** POST /streaming/sessions/:sessionId/lots — schedule one pinned listing as
 *  a lot. Amounts arrive in GBP major units; the wire speaks minor units. */
export async function scheduleStreamLot(
  sessionId: string,
  input: { listingId: string; lotNumber: number; position: number; startPriceGbp: number },
): Promise<void> {
  await fetchJson(`/streaming/sessions/${encodeURIComponent(sessionId)}/lots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listingId: input.listingId,
      lotNumber: input.lotNumber,
      position: input.position,
      startPriceMinor: Math.round(input.startPriceGbp * 100),
      currency: 'GBP',
    }),
  });
}

// ── Room join / leave — POST /streaming/sessions/:roomId/token mints the
//    LiveKit credentials; the viewer grant is subscribe-only. The backend
//    gates viewer tokens server-side: 401 unauthenticated, 409 while the
//    session is not live (STREAM_NOT_LIVE), 403 for muted viewers
//    (STREAM_VIEWER_MUTED) — callers map those to honest states, never a
//    simulated feed. ────────────────────────────────────────────────────

/** Mirrors the backend StreamTokenResult — wsUrl is the LiveKit websocket
 *  URL the token is scoped to. */
export interface StreamJoinToken {
  token: string;
  wsUrl: string;
  roomId: string;
  identity: string;
}

export async function fetchStreamToken(
  sessionId: string,
  role: 'host' | 'viewer' = 'viewer',
): Promise<StreamJoinToken> {
  const res = await fetchJson<{ ok: boolean; token?: StreamJoinToken }>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    },
  );
  if (!res.ok || !res.token?.token) {
    throw new Error('Stream token was not issued');
  }
  return res.token;
}

/** POST /streaming/sessions/:id/leave — drops the caller from the room's
 *  authoritative viewer set. Fire-and-forget on overlay close; the server
 *  no-ops when the caller was never counted. */
export async function leaveStreamSession(sessionId: string): Promise<void> {
  await fetchJson(`/streaming/sessions/${encodeURIComponent(sessionId)}/leave`, {
    method: 'POST',
  });
}

// ── Live chat — GET returns recent visible messages (block-filtered for
//    signed-in viewers), POST persists + fans out `live.chat.message` on
//    the session's realtime topic. Sends are server-moderated: 403 for
//    muted/blocked viewers, 422 for rejected content, 400 for scam
//    patterns — surface the server's reason verbatim. ───────────────────

export interface StreamChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  message: string;
  type: string;
  isSeller: boolean;
  moderationState: string;
  createdAt: string;
}

interface BackendChatResponse {
  ok: boolean;
  messages?: StreamChatMessage[];
  message?: StreamChatMessage;
}

export async function fetchStreamChatMessages(
  sessionId: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<StreamChatMessage[]> {
  const res = await fetchJson<BackendChatResponse>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/chat?limit=${limit}`,
    undefined,
    { signal },
  );
  return res.messages ?? [];
}

export async function sendStreamChatMessage(
  sessionId: string,
  message: string,
): Promise<StreamChatMessage> {
  const res = await fetchJson<BackendChatResponse>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    },
  );
  if (!res.message) throw new Error('Message was not sent');
  return res.message;
}

// ── Host viewer moderation — host/admin only (fail-closed 403). Mute is
//    reversible and blocks chat + fresh viewer tokens; kick ejects the
//    viewer from the in-memory room set now. Consumed by the host console
//    moderation panel at /live/host/[id]. ────────────────────────────────

export interface MutedStreamViewer {
  userId: string;
  mutedAt: string | null;
  mutedBy: string | null;
}

export async function fetchMutedStreamViewers(
  sessionId: string,
  signal?: AbortSignal,
): Promise<MutedStreamViewer[]> {
  const res = await fetchJson<{ ok: boolean; muted?: MutedStreamViewer[] }>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/moderation/viewers`,
    undefined,
    { signal },
  );
  return res.muted ?? [];
}

export async function setStreamViewerMuted(
  sessionId: string,
  userId: string,
  muted: boolean,
): Promise<void> {
  await fetchJson(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/moderation/${
      muted ? 'mute' : 'unmute'
    }`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    },
  );
}

/** Kick ejects the viewer now — they may rejoin with a fresh token unless
 *  also muted. Returns the room's post-kick viewer count. */
export async function kickStreamViewer(
  sessionId: string,
  userId: string,
): Promise<number> {
  const res = await fetchJson<{ ok: boolean; viewerCount?: number }>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/moderation/kick`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    },
  );
  return res.viewerCount ?? 0;
}

export async function setLiveReminder(sessionId: string, on: boolean): Promise<void> {
  try {
    if (on) {
      await fetchJson(`/streaming/sessions/${encodeURIComponent(sessionId)}/remind`, {
        method: 'POST',
      });
    } else {
      await fetchJson(`/streaming/sessions/${encodeURIComponent(sessionId)}/remind`, {
        method: 'DELETE',
      });
    }
  } finally {
    // Local flag always lands — it merges back on the next fetch when the
    // backend doesn't echo `reminded`.
    writeLocalReminder(sessionId, on);
  }
}

// ── In-show lots — the real lot engine contract, mirrored from
//    frontend/src/services/liveShoppingApi.ts. Viewer side only: the lot
//    queue, the lot on the table, and bidding. No fixture path exists for
//    these — fixture sessions (isDemo) never reach this code.

export type LiveLotStatus =
  | 'scheduled'
  | 'open'
  | 'closing'
  | 'sold'
  | 'passed'
  | 'cancelled';

/** One row of the show's lot queue — GBP major units at the boundary,
 *  the backend speaks minor units. */
export interface LiveLot {
  id: string;
  sessionId: string;
  listingId: string;
  lotNumber: number;
  position: number;
  status: LiveLotStatus;
  /** Seller's opening price. */
  startPrice: number;
  /** Standing high bid — 0 until the first bid lands. */
  highBid: number;
  highBidderId: string | null;
  winnerId: string | null;
  /** Bid count where the projection reports it — the queue aggregate has
   *  none, so queue rows carry null rather than a fake zero. */
  bidCount: number | null;
  /** Minimum step the server enforces on the next bid. */
  minIncrement: number;
  /** Reserve floor — never rendered as a number, only met/not-met. */
  reservePrice: number | null;
  title: string;
  imageUrl: string;
  /** Server-set auto-close deadline. Null means the host closes it by
   *  hand — render no countdown rather than an invented one (the same
   *  honesty rule the mobile dock follows). */
  closesAt: string | null;
  /** Anti-snipe extensions applied so far. */
  extensionCount: number;
}

interface BackendLotSnapshot {
  title?: string | null;
  imageUrl?: string | null;
  priceGbp?: number | null;
}

interface BackendLotAggregate {
  id: string;
  sessionId: string;
  listingId: string;
  lotNumber: number;
  position: number;
  status: LiveLotStatus;
  startPriceMinor: number;
  reservePriceMinor: number | null;
  minIncrementMinor: number;
  highBidMinor: number;
  highBidderId: string | null;
  winnerId: string | null;
  opensAt: string | null;
  closesAt: string | null;
  extensionCount: number;
  snapshot: BackendLotSnapshot | null;
}

interface BackendLotListResponse {
  ok: boolean;
  lots?: BackendLotAggregate[];
}

function mapBackendLot(lot: BackendLotAggregate): LiveLot {
  return {
    id: lot.id,
    sessionId: lot.sessionId,
    listingId: lot.listingId,
    lotNumber: lot.lotNumber,
    position: lot.position,
    status: lot.status,
    startPrice: lot.startPriceMinor / 100,
    highBid: lot.highBidMinor / 100,
    highBidderId: lot.highBidderId,
    winnerId: lot.winnerId,
    bidCount: null,
    minIncrement: lot.minIncrementMinor / 100,
    reservePrice: lot.reservePriceMinor != null ? lot.reservePriceMinor / 100 : null,
    title: lot.snapshot?.title ?? '',
    imageUrl: lot.snapshot?.imageUrl ?? '',
    closesAt: lot.closesAt,
    extensionCount: lot.extensionCount ?? 0,
  };
}

/** The pinned-lot projection — leaner than the aggregate: no position,
 *  the listing carries the identity. */
interface BackendCurrentLot {
  sessionId: string;
  listingId: string;
  lotNumber: number;
  currentPrice: number;
  bidCount: number;
  /** Authoritative live_lots linkage (joined server-side). */
  lotId?: string | null;
  lotStatus?: string | null;
  winnerId?: string | null;
  highBidderId?: string | null;
  title?: string | null;
  imageUrl?: string | null;
  closesAt?: string | null;
  extensionCount?: number;
  minIncrementMinor?: number | null;
  startPriceMinor?: number | null;
}

interface BackendCurrentLotResponse {
  ok: boolean;
  lot?: BackendCurrentLot | null;
}

function currentLotStatus(status: string | null | undefined): LiveLotStatus {
  switch (status) {
    case 'open':
    case 'closing':
      return status;
    case 'sold':
      return 'sold';
    case 'passed':
      return 'passed';
    case 'cancelled':
      return 'cancelled';
    case 'scheduled':
      return 'scheduled';
    default:
      // A pinned lot with no engine row is on the table by definition.
      return 'open';
  }
}

function mapBackendCurrentLot(lot: BackendCurrentLot): LiveLot {
  return {
    id: lot.lotId ?? `${lot.sessionId}:${lot.lotNumber}`,
    sessionId: lot.sessionId,
    listingId: lot.listingId,
    lotNumber: lot.lotNumber,
    position: lot.lotNumber,
    status: currentLotStatus(lot.lotStatus),
    startPrice: (lot.startPriceMinor ?? 0) / 100,
    highBid: lot.currentPrice,
    highBidderId: lot.highBidderId ?? null,
    winnerId: lot.winnerId ?? null,
    bidCount: lot.bidCount ?? null,
    minIncrement: (lot.minIncrementMinor ?? 100) / 100,
    reservePrice: null,
    title: lot.title ?? '',
    imageUrl: lot.imageUrl ?? '',
    closesAt: lot.closesAt ?? null,
    extensionCount: lot.extensionCount ?? 0,
  };
}

/** The show's full lot queue — scheduled → open → settled, in position
 *  order. Drives the "Next up" card and the run-of-show rail. */
export async function fetchSessionLots(
  sessionId: string,
  signal?: AbortSignal,
): Promise<LiveLot[]> {
  const res = await fetchJson<BackendLotListResponse>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/lots`,
    undefined,
    { signal },
  );
  return (res.lots ?? [])
    .map(mapBackendLot)
    .sort((a, b) => a.position - b.position);
}

/** The lot currently on the table — null when nothing is pinned. */
export async function fetchCurrentLot(
  sessionId: string,
  signal?: AbortSignal,
): Promise<LiveLot | null> {
  const res = await fetchJson<BackendCurrentLotResponse>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/current-lot`,
    undefined,
    { signal },
  );
  return res.lot ? mapBackendCurrentLot(res.lot) : null;
}

interface BackendBidResponse {
  ok: boolean;
  bid?: {
    id: string;
    listingId: string;
    bidderId: string;
    bidderName: string;
    amount: number;
    createdAt: string;
  };
  lot?: BackendCurrentLot;
  error?: string;
  idempotent?: boolean;
}

export interface StreamBidResult {
  success: boolean;
  /** The lot after the bid — carries the post-extension closesAt when a
   *  snipe bid pushed the close out. */
  lot: LiveLot | null;
  /** The server's rejection reason when the bid didn't land — surfaced
   *  verbatim, never flattened to "Bid failed". */
  error?: string;
  clientBidId: string;
  idempotent?: boolean;
}

/** Place a bid on the pinned lot — POST /streaming/sessions/:id/bids,
 *  idempotent on clientBidId like the mobile placeStreamBid. */
export async function placeStreamBid(
  sessionId: string,
  amountGbp: number,
  clientBidId: string,
): Promise<StreamBidResult> {
  try {
    const res = await fetchJson<BackendBidResponse>(
      `/streaming/sessions/${encodeURIComponent(sessionId)}/bids`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountGbp, clientBidId }),
      },
    );
    const lot = res.lot ? mapBackendCurrentLot(res.lot) : null;
    if (!res.ok) {
      return {
        success: false,
        lot,
        error: res.error ?? 'Bid was not accepted',
        clientBidId,
        idempotent: res.idempotent,
      };
    }
    return { success: true, lot, clientBidId, idempotent: res.idempotent };
  } catch (error) {
    return {
      success: false,
      lot: null,
      error: parseApiError(error, 'Bid could not be placed').message,
      clientBidId,
    };
  }
}

// ── Host lot controls — the same lot-engine contracts the mobile seller
//    console drives (routes/liveLotEngine.ts). Open sends a duration so the
//    server deadline + anti-snipe sweep apply; close decides sold/passed
//    through the shared close path; cancel and settle are their own
//    explicit transitions. All are host/admin only (fail-closed 403). ────

/** Mirrors mobile DEFAULT_LOT_DURATION_SECONDS — the bidding window the
 *  server sets when the host opens a lot. */
export const DEFAULT_LOT_DURATION_SECONDS = 60;

interface BackendLotMutationResponse {
  ok: boolean;
  lot?: BackendLotAggregate;
  /** Action responses carry the snapshot as a sibling (mapLotRow has no
   *  inline snapshot — the list endpoint is the one that joins it). */
  snapshot?: BackendLotSnapshot | null;
  outcome?: 'sold' | 'passed';
  winnerId?: string | null;
}

function mapMutationLot(res: BackendLotMutationResponse): LiveLot {
  if (!res.lot) throw new Error('The lot action returned no lot');
  return mapBackendLot({
    ...res.lot,
    snapshot: res.snapshot ?? res.lot.snapshot ?? null,
  });
}

/** PUT /streaming/sessions/:id/current-lot — pins a lot onto the table so
 *  viewers see it as the thing being sold. Host/admin only. */
export async function setStreamCurrentLot(
  sessionId: string,
  input: { listingId: string; lotNumber: number },
): Promise<LiveLot> {
  const res = await fetchJson<{ ok: boolean; lot?: BackendCurrentLot }>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/current-lot`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listingId: input.listingId, lotNumber: input.lotNumber }),
    },
  );
  if (!res.lot) throw new Error('The current lot was not set');
  return mapBackendCurrentLot(res.lot);
}

/** POST .../lots/:lotId/open — opens bidding on a scheduled (or passed)
 *  lot. `durationSeconds` sets the server-side closes_at deadline so the
 *  auto-close sweep can finish the lot if the host walks away. */
export async function openStreamLot(
  sessionId: string,
  lotId: string,
  options?: { durationSeconds?: number },
): Promise<LiveLot> {
  const res = await fetchJson<BackendLotMutationResponse>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/lots/${encodeURIComponent(lotId)}/open`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        options?.durationSeconds != null ? { durationSeconds: options.durationSeconds } : {},
      ),
    },
  );
  return mapMutationLot(res);
}

/** POST .../lots/:lotId/close — resolves the open lot: 'sold' when a bid
 *  cleared reserve, 'passed' otherwise. Returns the outcome + winner. */
export async function closeStreamLot(
  sessionId: string,
  lotId: string,
): Promise<{ lot: LiveLot; outcome: 'sold' | 'passed' | null; winnerId: string | null }> {
  const res = await fetchJson<BackendLotMutationResponse>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/lots/${encodeURIComponent(lotId)}/close`,
    { method: 'POST' },
  );
  return {
    lot: mapMutationLot(res),
    outcome: res.outcome ?? null,
    winnerId: res.winnerId ?? null,
  };
}

/** POST .../lots/:lotId/cancel — pulls a lot out of the show entirely
 *  (anything except already-sold/cancelled). */
export async function cancelStreamLot(sessionId: string, lotId: string): Promise<LiveLot> {
  const res = await fetchJson<BackendLotMutationResponse>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/lots/${encodeURIComponent(lotId)}/cancel`,
    { method: 'POST' },
  );
  return mapMutationLot(res);
}

interface BackendSettleLotResponse {
  ok: boolean;
  idempotent?: boolean;
  lot?: BackendLotAggregate;
  order?: { id: string; status?: string };
  checkout?: { reservationId?: string };
}

/** POST .../lots/:lotId/settle — creates the winner's order on a sold lot.
 *  Host/admin or the winner; idempotent on an existing order. */
export async function settleStreamLot(
  sessionId: string,
  lotId: string,
): Promise<{ orderId: string | null; reservationId: string | null }> {
  const res = await fetchJson<BackendSettleLotResponse>(
    `/streaming/sessions/${encodeURIComponent(sessionId)}/lots/${encodeURIComponent(lotId)}/settle`,
    { method: 'POST' },
  );
  return {
    orderId: res.order?.id ?? null,
    reservationId: res.checkout?.reservationId ?? null,
  };
}
