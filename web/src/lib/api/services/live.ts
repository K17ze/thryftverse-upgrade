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
  return {
    id: room.roomId,
    sellerId: room.hostUserId,
    sellerName: room.hostUsername ?? '',
    sellerAvatar: room.hostAvatarUrl ?? '',
    sellerVerified: room.hostVerified ?? false,
    title: room.title,
    category: 'All',
    coverUri: room.thumbnailUrl ?? '',
    aspectRatio: 16 / 10,
    viewers: room.viewerCount,
    likeCount: 0,
    status:
      room.status === 'live' || (room.status as string) === 'ending'
        ? 'live'
        : room.status === 'ended' || room.status === 'failed'
          ? 'ended'
          : 'upcoming',
    startedAt: room.startedAt,
    scheduledAt: scheduledStartAt,
    endedAt: room.endedAt,
    currentItemTitle: room.currentLotTitle ?? undefined,
    currentBid: room.currentLotPriceMinor != null ? room.currentLotPriceMinor / 100 : undefined,
    recordingUrl: room.recordingUrl ?? null,
    recordingEnabled: room.recordingEnabled ?? false,
    isFollowing: false,
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
