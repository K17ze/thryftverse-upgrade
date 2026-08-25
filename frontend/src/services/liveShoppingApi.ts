/**
 * Live Shopping API — discovery & session layer
 *
 * This service provides the data contract and mock implementation for the
 * ThryftVerse live-stream auction discovery surface (Whatnot/Tilt-style live
 * commerce). The full interface mirrors what a real RTMP/WebRTC backend would
 * expose; the functions currently return clearly-labelled mock data so the UI
 * can be built and validated before streaming infrastructure is wired.
 *
 * Per AGENTS.md §11 (Truthful UI): the mock data is flagged via
 * `LIVE_SHOPPING_DEMO_MODE` and every session carries `isDemo: true` so the UI
 * can show an honest "Demo mode" banner. We never fabricate that a stream is
 * genuinely live.
 */

import { formatFiatAmount } from '../utils/currency';
import { DEFAULT_CURRENCY_CODE } from '../constants/currencies';
import { fetchJson } from '../lib/apiClient';
import { getRealtimeClient, type RealtimeEnvelope } from '../platform/realtime';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LiveSessionStatus = 'live' | 'upcoming' | 'ended';

export interface LiveSession {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerAvatar: string;
  sellerVerified: boolean;
  title: string;
  thumbnail: string;
  category: string;
  viewerCount: number;
  likeCount: number;
  status: LiveSessionStatus;
  startedAt?: string;
  scheduledAt?: string;
  endedAt?: string;
  currentItemId?: string;
  currentItemTitle?: string;
  currentItemImage?: string;
  currentBid?: number;
  bidCount?: number;
  /** Seconds remaining for the current item auction (live sessions only). */
  itemTimeRemainingSec?: number;
  watchers: number;
  isFollowing: boolean;
  /** Honest flag — true while this session comes from mock data, not a real stream. */
  isDemo: boolean;
}

export interface LiveSessionSummary {
  sessions: LiveSession[];
  featured: LiveSession | null;
  cursor: string | null;
}

export interface LiveChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  text: string;
  isSeller?: boolean;
  isSystem?: boolean;
  timestamp: string;
}

export interface LiveJoinToken {
  sessionId: string;
  token: string;
  /** Mock-only — the UI uses this to show the demo banner. */
  isDemo: boolean;
}

// ---------------------------------------------------------------------------
// Demo flag — the UI reads this to decide whether to show a "Demo mode" banner.
// When a real backend is wired, set this to false (or remove the mock branch).
//
// Environment-aware (AGENTS.md §11 — Truthful UI):
//   - In production builds Metro strips `__DEV__` to `false` and the
//     `EXPO_PUBLIC_MOCK_MODE` env var is not set, so demo mode is OFF and the
//     mock data is unreachable.
//   - In dev (`__DEV__`) demo mode is ON so the UI can be built and validated.
//   - QA can force demo mode in a production-shaped build by setting
//     `EXPO_PUBLIC_MOCK_MODE=fixture-design` at build time.
// The `isDemo` flag on every mock session remains truthful: it is only `true`
// when the data actually comes from this mock branch.
// ---------------------------------------------------------------------------
export const LIVE_SHOPPING_DEMO_MODE =
  __DEV__ || process.env.EXPO_PUBLIC_MOCK_MODE === 'fixture-design';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const LIVE_CATEGORIES = [
  'All',
  'Fashion',
  'Sneakers',
  'Collectibles',
  'Vintage',
  'Art',
] as const;

export type LiveCategory = (typeof LIVE_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------
// Thumbnails use Unsplash source URLs (the same pattern as marketApi mock
// assets). Seller avatars use UI-avatars.com so they render without a backend.

const NOW = Date.now();
const isoMinutesFromNow = (mins: number) => new Date(NOW + mins * 60_000).toISOString();
const isoMinutesAgo = (mins: number) => new Date(NOW - mins * 60_000).toISOString();

const MOCK_SESSIONS: LiveSession[] = [
  {
    id: 'live-1',
    sellerId: 'u3',
    sellerName: 'dankdunksuk',
    sellerAvatar: 'https://ui-avatars.com/api/?name=Dank+Dunks&background=1C5631&color=fff&size=128',
    sellerVerified: true,
    title: 'Friday Night Heat — Rare Sneaker Drop',
    thumbnail: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800',
    category: 'Sneakers',
    viewerCount: 1284,
    likeCount: 3420,
    status: 'live',
    startedAt: isoMinutesAgo(18),
    currentItemId: 'l6',
    currentItemTitle: 'Nike Air Max 90 White',
    currentItemImage: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800',
    currentBid: 92,
    bidCount: 14,
    itemTimeRemainingSec: 47,
    watchers: 318,
    isFollowing: false,
    isDemo: LIVE_SHOPPING_DEMO_MODE,
  },
  {
    id: 'live-2',
    sellerId: 'u1',
    sellerName: 'mariefullery',
    sellerAvatar: 'https://ui-avatars.com/api/?name=Marie+F&background=7B0E1E&color=fff&size=128',
    sellerVerified: true,
    title: 'Vintage Archive Sale — Curated Pieces',
    thumbnail: 'https://images.unsplash.com/photo-1551232864-3f32cf812878?w=800',
    category: 'Vintage',
    viewerCount: 642,
    likeCount: 1890,
    status: 'live',
    startedAt: isoMinutesAgo(6),
    currentItemId: 'l1',
    currentItemTitle: 'Yves Saint Laurent Sweater',
    currentItemImage: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800',
    currentBid: 210,
    bidCount: 8,
    itemTimeRemainingSec: 92,
    watchers: 156,
    isFollowing: true,
    isDemo: LIVE_SHOPPING_DEMO_MODE,
  },
  {
    id: 'live-3',
    sellerId: 'u2',
    sellerName: 'scott_art',
    sellerAvatar: 'https://ui-avatars.com/api/?name=Scott+Art&background=06489A&color=fff&size=128',
    sellerVerified: true,
    title: 'Streetwear Bidding Wars — Live',
    thumbnail: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800',
    category: 'Fashion',
    viewerCount: 389,
    likeCount: 760,
    status: 'live',
    startedAt: isoMinutesAgo(32),
    currentItemId: 'l4',
    currentItemTitle: 'Stüssy Logo Tee',
    currentItemImage: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800',
    currentBid: 68,
    bidCount: 21,
    itemTimeRemainingSec: 12,
    watchers: 94,
    isFollowing: false,
    isDemo: LIVE_SHOPPING_DEMO_MODE,
  },
  {
    id: 'upcoming-1',
    sellerId: 'u3',
    sellerName: 'dankdunksuk',
    sellerAvatar: 'https://ui-avatars.com/api/?name=Dank+Dunks&background=1C5631&color=fff&size=128',
    sellerVerified: true,
    title: 'Saturday Sneaker Grail Auction',
    thumbnail: 'https://images.unsplash.com/photo-1600269452121-4f241c7e958d?w=800',
    category: 'Sneakers',
    viewerCount: 0,
    likeCount: 540,
    status: 'upcoming',
    scheduledAt: isoMinutesFromNow(180),
    watchers: 412,
    isFollowing: false,
    isDemo: LIVE_SHOPPING_DEMO_MODE,
  },
  {
    id: 'upcoming-2',
    sellerId: 'u2',
    sellerName: 'scott_art',
    sellerAvatar: 'https://ui-avatars.com/api/?name=Scott+Art&background=06489A&color=fff&size=128',
    sellerVerified: true,
    title: 'Art & Collectibles Showcase',
    thumbnail: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=800',
    category: 'Art',
    viewerCount: 0,
    likeCount: 230,
    status: 'upcoming',
    scheduledAt: isoMinutesFromNow(1440),
    watchers: 87,
    isFollowing: false,
    isDemo: LIVE_SHOPPING_DEMO_MODE,
  },
  {
    id: 'upcoming-3',
    sellerId: 'u1',
    sellerName: 'mariefullery',
    sellerAvatar: 'https://ui-avatars.com/api/?name=Marie+F&background=7B0E1E&color=fff&size=128',
    sellerVerified: true,
    title: 'Designer Handbag Live Auction',
    thumbnail: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800',
    category: 'Fashion',
    viewerCount: 0,
    likeCount: 910,
    status: 'upcoming',
    scheduledAt: isoMinutesFromNow(60),
    watchers: 203,
    isFollowing: true,
    isDemo: LIVE_SHOPPING_DEMO_MODE,
  },
  {
    id: 'ended-1',
    sellerId: 'u3',
    sellerName: 'dankdunksuk',
    sellerAvatar: 'https://ui-avatars.com/api/?name=Dank+Dunks&background=1C5631&color=fff&size=128',
    sellerVerified: true,
    title: 'Wednesday Night Heat — Sold Out',
    thumbnail: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800',
    category: 'Sneakers',
    viewerCount: 0,
    likeCount: 2100,
    status: 'ended',
    startedAt: isoMinutesAgo(180),
    endedAt: isoMinutesAgo(120),
    watchers: 0,
    isFollowing: false,
    isDemo: LIVE_SHOPPING_DEMO_MODE,
  },
];

const MOCK_CHAT_SEED: Omit<LiveChatMessage, 'id' | 'timestamp'>[] = [
  { senderId: 'viewer-1', senderName: 'sophie_k', senderAvatar: 'https://ui-avatars.com/api/?name=SK&background=4A7AC4&color=fff&size=64', text: 'These are fire 🔥' },
  { senderId: 'viewer-2', senderName: 'jordan_b', senderAvatar: 'https://ui-avatars.com/api/?name=JB&background=8A6A3F&color=fff&size=64', text: 'What size is the current item?' },
  { senderId: 'u3', senderName: 'dankdunksuk', senderAvatar: 'https://ui-avatars.com/api/?name=Dank+Dunks&background=1C5631&color=fff&size=64', text: 'Size 10 UK! Bidding open now', isSeller: true },
  { senderId: 'viewer-3', senderName: 'mike_thrfts', senderAvatar: 'https://ui-avatars.com/api/?name=MT&background=9A6B7A&color=fff&size=64', text: '£95' },
  { senderId: 'viewer-4', senderName: 'amelia_v', senderAvatar: 'https://ui-avatars.com/api/?name=AV&background=C9A46A&color=fff&size=64', text: 'Going for the win 💪' },
  { senderId: 'viewer-5', senderName: 'chris_p', senderAvatar: 'https://ui-avatars.com/api/?name=CP&background=5F1616&color=fff&size=64', text: 'Last chance!' },
];

const MOCK_CHAT_FOLLOWUPS: Omit<LiveChatMessage, 'id' | 'timestamp'>[] = [
  { senderId: 'viewer-6', senderName: 'nora_b', senderAvatar: 'https://ui-avatars.com/api/?name=NB&background=06489A&color=fff&size=64', text: 'Nice pickup!' },
  { senderId: 'viewer-7', senderName: 'leo_d', senderAvatar: 'https://ui-avatars.com/api/?name=LD&background=1C5631&color=fff&size=64', text: '£100' },
  { senderId: 'viewer-8', senderName: 'kai_w', senderAvatar: 'https://ui-avatars.com/api/?name=KW&background=7B0E1E&color=fff&size=64', text: 'These are clean' },
  { senderId: 'viewer-9', senderName: 'ruby_s', senderAvatar: 'https://ui-avatars.com/api/?name=RS&background=8A6A3F&color=fff&size=64', text: 'Following! 🙌' },
  { senderId: 'u3', senderName: 'dankdunksuk', senderAvatar: 'https://ui-avatars.com/api/?name=Dank+Dunks&background=1C5631&color=fff&size=64', text: 'Next item coming up — stay tuned', isSeller: true },
  { senderId: 'viewer-10', senderName: 'finn_m', senderAvatar: 'https://ui-avatars.com/api/?name=FM&background=4A7AC4&color=fff&size=64', text: '£110' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function filterByCategory(sessions: LiveSession[], category?: string): LiveSession[] {
  if (!category || category === 'All') return sessions;
  return sessions.filter((s) => s.category === category);
}

let chatMessageCounter = 0;
function makeChatMessage(
  base: Omit<LiveChatMessage, 'id' | 'timestamp'>,
  offsetSec: number,
): LiveChatMessage {
  chatMessageCounter += 1;
  return {
    ...base,
    id: `chat-${chatMessageCounter}`,
    timestamp: new Date(Date.now() - offsetSec * 1000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface BackendStreamRoom {
  roomId: string;
  title: string;
  hostUserId: string;
  status: 'created' | 'live' | 'ended' | 'failed';
  roomUrl: string;
  viewerCount: number;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
}

interface BackendStreamSessionsResponse {
  ok: boolean;
  sessions: BackendStreamRoom[];
}

interface BackendStreamTokenResponse {
  ok: boolean;
  token: {
    token: string;
    wsUrl: string;
    roomId: string;
    identity: string;
  };
  error?: string;
}

const mapBackendSessionToLiveSession = (room: BackendStreamRoom): LiveSession => ({
  id: room.roomId,
  sellerId: room.hostUserId,
  sellerName: '',
  sellerAvatar: '',
  sellerVerified: false,
  title: room.title,
  thumbnail: '',
  category: 'All',
  viewerCount: room.viewerCount,
  likeCount: 0,
  status: room.status === 'live' ? 'live' : room.status === 'ended' ? 'ended' : 'upcoming',
  startedAt: room.startedAt,
  endedAt: room.endedAt,
  watchers: room.viewerCount,
  isFollowing: false,
  isDemo: false,
});

/**
 * Fetch live sessions from the real backend streaming API.
 */
async function fetchLiveSessionsFromBackend(
  opts: { cursor?: string | null; category?: string } = {},
): Promise<LiveSessionSummary> {
  void opts.cursor;
  void opts.category;
  try {
    const response = await fetchJson<BackendStreamSessionsResponse>('/streaming/sessions');
    const sessions = (response.sessions ?? []).map(mapBackendSessionToLiveSession);
    const featured = sessions.find((s) => s.status === 'live') ?? null;
    return { sessions, featured, cursor: null };
  } catch {
    return { sessions: [], featured: null, cursor: null };
  }
}

/**
 * Join a live session by requesting a connection token from the backend.
 */
async function joinLiveSessionFromBackend(id: string): Promise<LiveJoinToken> {
  try {
    const response = await fetchJson<BackendStreamTokenResponse>(
      `/streaming/sessions/${encodeURIComponent(id)}/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'viewer' }),
      },
    );
    if (!response.ok || !response.token) {
      return { sessionId: id, token: '', isDemo: false };
    }
    return {
      sessionId: id,
      token: response.token.token,
      isDemo: false,
    };
  } catch {
    return { sessionId: id, token: '', isDemo: false };
  }
}

// ---------------------------------------------------------------------------
// Backend API — live chat, current lot, in-stream bids (P0 #6)
// ---------------------------------------------------------------------------
// These functions call the real backend streaming endpoints and are used
// when LIVE_SHOPPING_DEMO_MODE is false. The mock branches above remain
// for dev/fixture builds.

interface BackendChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  message: string;
  type: string;
  isSeller: boolean;
  createdAt: string;
}

interface BackendChatResponse {
  ok: boolean;
  messages: BackendChatMessage[];
  message?: BackendChatMessage;
}

interface BackendCurrentLot {
  sessionId: string;
  listingId: string;
  lotNumber: number;
  currentPrice: number;
  bidCount: number;
  updatedAt: string;
}

interface BackendCurrentLotResponse {
  ok: boolean;
  lot: BackendCurrentLot | null;
}

interface BackendBidResponse {
  ok: boolean;
  bid: {
    id: string;
    sessionId: string;
    listingId: string;
    lotNumber: number;
    bidderId: string;
    bidderName: string;
    amount: number;
    createdAt: string;
  };
  lot: BackendCurrentLot;
  error?: string;
}

interface BackendViewerCountResponse {
  ok: boolean;
  viewerCount: number;
}

const mapBackendChatMessage = (msg: BackendChatMessage): LiveStreamChatMessage => ({
  id: msg.id,
  streamId: msg.sessionId,
  userId: msg.userId,
  userName: msg.userName,
  message: msg.message,
  type: msg.type as LiveStreamChatMessage['type'],
  isSeller: msg.isSeller,
  timestamp: msg.createdAt,
});

/** Fetch recent chat messages from the backend (paginated). */
async function fetchChatMessagesFromBackend(
  sessionId: string,
  limit = 50,
): Promise<LiveStreamChatMessage[]> {
  try {
    const response = await fetchJson<BackendChatResponse>(
      `/streaming/sessions/${encodeURIComponent(sessionId)}/chat?limit=${limit}`,
    );
    return (response.messages ?? []).map(mapBackendChatMessage);
  } catch {
    return [];
  }
}

/** Send a chat message via the backend. */
async function sendChatMessageToBackend(
  sessionId: string,
  message: string,
): Promise<{ success: boolean; message: LiveStreamChatMessage | null }> {
  try {
    const response = await fetchJson<BackendChatResponse>(
      `/streaming/sessions/${encodeURIComponent(sessionId)}/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      },
    );
    if (!response.ok || !response.message) {
      return { success: false, message: null };
    }
    return { success: true, message: mapBackendChatMessage(response.message) };
  } catch {
    return { success: false, message: null };
  }
}

/** Fetch the current lot for a session from the backend. */
async function fetchCurrentLotFromBackend(
  sessionId: string,
): Promise<BackendCurrentLot | null> {
  try {
    const response = await fetchJson<BackendCurrentLotResponse>(
      `/streaming/sessions/${encodeURIComponent(sessionId)}/current-lot`,
    );
    return response.lot ?? null;
  } catch {
    return null;
  }
}

/** Set the current lot (host action) via the backend. */
async function setCurrentLotOnBackend(
  sessionId: string,
  listingId: string,
  lotNumber: number,
): Promise<BackendCurrentLot | null> {
  try {
    const response = await fetchJson<BackendCurrentLotResponse>(
      `/streaming/sessions/${encodeURIComponent(sessionId)}/current-lot`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, lotNumber }),
      },
    );
    return response.lot ?? null;
  } catch {
    return null;
  }
}

/** Place a bid on the current lot via the backend. */
async function placeBidOnBackend(
  sessionId: string,
  amount: number,
): Promise<{ success: boolean; lot: LiveLot | null; bid: LiveBid | null; error?: string }> {
  try {
    const response = await fetchJson<BackendBidResponse>(
      `/streaming/sessions/${encodeURIComponent(sessionId)}/bids`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      },
    );
    if (!response.ok || !response.bid) {
      return { success: false, lot: null, bid: null, error: response.error ?? 'Bid failed' };
    }
    const bid: LiveBid = {
      id: response.bid.id,
      lotId: response.bid.listingId,
      bidderId: response.bid.bidderId,
      bidderName: response.bid.bidderName,
      amount: response.bid.amount,
      timestamp: response.bid.createdAt,
    };
    const lot: LiveLot = {
      id: response.lot.listingId,
      listingId: response.lot.listingId,
      title: '',
      imageUri: '',
      startingPrice: response.lot.currentPrice,
      currentPrice: response.lot.currentPrice,
      bidCount: response.lot.bidCount,
      status: 'active',
    };
    return { success: true, lot, bid };
  } catch {
    return { success: false, lot: null, bid: null, error: 'Could not place bid' };
  }
}

/** Notify the backend that a viewer has left the session. */
async function leaveSessionOnBackend(sessionId: string): Promise<void> {
  try {
    await fetchJson<BackendViewerCountResponse>(
      `/streaming/sessions/${encodeURIComponent(sessionId)}/leave`,
      { method: 'POST' },
    );
  } catch {
    // Best-effort — viewer count will reconcile on session end.
  }
}

/** Connect to a live stream from the backend: fetch the session, request
 *  a viewer token, and load the current lot. Returns a LiveStream
 *  snapshot suitable for the viewer screen. */
async function connectToStreamFromBackend(streamId: string): Promise<LiveStream | null> {
  try {
    // Request a viewer token (increments viewer count on the backend).
    await fetchJson<BackendStreamTokenResponse>(
      `/streaming/sessions/${encodeURIComponent(streamId)}/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'viewer' }),
      },
    );

    // Fetch the session metadata.
    const sessionResponse = await fetchJson<{
      ok: boolean;
      session: BackendStreamRoom | null;
    }>(`/streaming/sessions/${encodeURIComponent(streamId)}`);
    const session = sessionResponse.session;
    if (!session) return null;

    // Fetch the current lot (if set).
    const currentLot = await fetchCurrentLotFromBackend(streamId);
    const lots: LiveLot[] = currentLot
      ? [{
          id: currentLot.listingId,
          listingId: currentLot.listingId,
          title: '',
          imageUri: '',
          startingPrice: currentLot.currentPrice,
          currentPrice: currentLot.currentPrice,
          bidCount: currentLot.bidCount,
          status: 'active',
        }]
      : [];

    const stream: LiveStream = {
      id: session.roomId,
      sellerId: session.hostUserId,
      sellerName: '',
      title: session.title,
      status: session.status === 'live' ? 'live' : session.status === 'ended' ? 'ended' : 'scheduled',
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      viewerCount: session.viewerCount,
      likeCount: 0,
      currentLotIndex: 0,
      lots,
      chatEnabled: true,
      isDemo: false,
    };
    return stream;
  } catch {
    return null;
  }
}

// ── Realtime topic + event type constants ──

const LIVE_SESSION_TOPIC_PREFIX = 'live.session:';

function liveSessionTopic(sessionId: string): string {
  return `${LIVE_SESSION_TOPIC_PREFIX}${sessionId}`;
}

const LIVE_CHAT_EVENT = 'live.chat.message';
const LIVE_BID_EVENT = 'live.bid.placed';
const LIVE_CURRENT_LOT_EVENT = 'live.current_lot.update';
const LIVE_VIEWER_COUNT_EVENT = 'live.viewer_count.update';

/** Subscribe to a live session realtime topic. Returns an unsubscribe
 *  function. Returns a no-op if the realtime client is not available. */
function subscribeToLiveSessionTopic(
  sessionId: string,
  eventType: string,
  handler: (payload: Record<string, unknown>, envelope: RealtimeEnvelope) => void,
): () => void {
  const client = getRealtimeClient();
  if (!client) return () => {};

  const topic = liveSessionTopic(sessionId);
  client.subscribe([topic]);
  const unsubscribe = client.on(topic, (envelope) => {
    if (envelope.type !== eventType) return;
    handler(envelope.payload as Record<string, unknown>, envelope as RealtimeEnvelope);
  });

  return () => {
    unsubscribe();
    client.unsubscribe([topic]);
  };
}

/** Map backend realtime event types to the frontend StreamEventType union. */
function backendToStreamEventType(type: string): StreamEventType | null {
  switch (type) {
    case LIVE_CHAT_EVENT:
      return 'chat';
    case LIVE_BID_EVENT:
      return 'bid';
    case LIVE_CURRENT_LOT_EVENT:
      return 'lot_change';
    case LIVE_VIEWER_COUNT_EVENT:
      return 'viewer_count';
    default:
      return null;
  }
}

/**
 * Fetch live + upcoming sessions for the discovery surface.
 * Supports optional cursor pagination and category filtering.
 */
export async function fetchLiveSessions(
  opts: { cursor?: string | null; category?: string } = {},
): Promise<LiveSessionSummary> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    return fetchLiveSessionsFromBackend(opts);
  }
  await delay(420); // simulate network latency for honest loading states

  let sessions = [...MOCK_SESSIONS];
  sessions = filterByCategory(sessions, opts.category);

  // Sort: live first (by viewer count desc), then upcoming (by scheduled time),
  // then ended (most recent first).
  sessions.sort((a, b) => {
    const order = { live: 0, upcoming: 1, ended: 2 };
    if (order[a.status] !== order[b.status]) {
      return order[a.status] - order[b.status];
    }
    if (a.status === 'live' && b.status === 'live') {
      return b.viewerCount - a.viewerCount;
    }
    if (a.status === 'upcoming' && b.status === 'upcoming') {
      return new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime();
    }
    return new Date(b.endedAt ?? 0).getTime() - new Date(a.endedAt ?? 0).getTime();
  });

  // Cursor pagination — mock: first page returns everything, cursor is null.
  const cursor = opts.cursor ? null : null;
  const featured = sessions.find((s) => s.status === 'live') ?? null;

  return { sessions, featured, cursor };
}

/**
 * Fetch a single live session with full detail (including chat seed).
 */
export async function fetchLiveSession(id: string): Promise<LiveSession | null> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return null;
  }
  await delay(360);
  const session = MOCK_SESSIONS.find((s) => s.id === id) ?? null;
  return session;
}

/**
 * Fetch the initial chat messages for a session.
 */
export async function fetchLiveChatMessages(sessionId: string): Promise<LiveChatMessage[]> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return [];
  }
  await delay(200);
  // Both params acknowledged — sessionId selects the room in a real backend.
  void sessionId;
  return MOCK_CHAT_SEED.map((base, i) => makeChatMessage(base, (MOCK_CHAT_SEED.length - i) * 8));
}

/**
 * Generate the next mock chat message (simulates a live viewer chatting).
 * Returns null when the cycle is exhausted — the UI can restart from seed.
 */
export function nextMockChatMessage(): LiveChatMessage | null {
  const pool = MOCK_CHAT_FOLLOWUPS;
  const idx = chatMessageCounter % pool.length;
  const base = pool[idx];
  return makeChatMessage(base, 0);
}

/**
 * Join a live session — returns a mock join token.
 * In production this would negotiate an RTMP/WebRTC viewer token.
 */
export async function joinLiveSession(id: string): Promise<LiveJoinToken> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    return joinLiveSessionFromBackend(id);
  }
  await delay(180);
  return {
    sessionId: id,
    token: `mock-join-${id}-${Date.now()}`,
    isDemo: LIVE_SHOPPING_DEMO_MODE,
  };
}

/**
 * Leave a live session — cleanup hook for analytics / viewer-count decrement.
 * Mock: resolves immediately.
 */
export async function leaveLiveSession(id: string): Promise<void> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return;
  }
  void id;
  await delay(80);
}

/**
 * Place a bid on the current item in a live session.
 * Mock: simulates network round-trip and returns the updated bid state.
 */
export async function placeLiveBid(
  sessionId: string,
  amount: number,
): Promise<{ success: boolean; currentBid: number; bidCount: number; isHighBidder: boolean }> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return { success: false, currentBid: 0, bidCount: 0, isHighBidder: false };
  }
  await delay(520);
  const session = MOCK_SESSIONS.find((s) => s.id === sessionId);
  if (!session) {
    return { success: false, currentBid: 0, bidCount: 0, isHighBidder: false };
  }
  const newBid = Math.max(session.currentBid ?? 0, amount);
  const newCount = (session.bidCount ?? 0) + 1;
  session.currentBid = newBid;
  session.bidCount = newCount;
  return { success: true, currentBid: newBid, bidCount: newCount, isHighBidder: true };
}

// ---------------------------------------------------------------------------
// REAL-TIME LIVE STREAM INFRASTRUCTURE (2026 upgrade)
// ---------------------------------------------------------------------------
// Three-plane architecture: video stream + real-time chat + synced product
// catalog. In production these are delivered over a WebSocket side-channel
// (metadata sync) with WebRTC for active bidders and LL-HLS for spectators.
//
// Per AGENTS.md §11 (Truthful UI): the mock implementation simulates real-time
// events with timers and is clearly labelled via `isDemo`. We never fabricate
// that a stream is genuinely live — every simulated stream carries the Demo
// badge in the UI.
// ---------------------------------------------------------------------------

// ── Stream types ──

export interface LiveStream {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerAvatar?: string;
  sellerVerified?: boolean;
  title: string;
  status: 'scheduled' | 'live' | 'ended';
  startedAt?: string;
  scheduledStartAt?: string;
  endedAt?: string;
  viewerCount: number;
  likeCount: number;
  currentLotIndex: number;
  lots: LiveLot[];
  chatEnabled: boolean;
  /** Truthful flag — true while this stream comes from mock data. */
  isDemo: boolean;
}

export interface LiveLot {
  id: string;
  listingId: string;
  title: string;
  imageUri: string;
  startingPrice: number;
  currentPrice: number;
  currentHighBidder?: string;
  bidCount: number;
  status: 'upcoming' | 'active' | 'sold' | 'passed';
  /** Seconds remaining for the active auction (null when not active). */
  timeRemaining?: number;
  buyNowPrice?: number;
}

export interface LiveBid {
  id: string;
  lotId: string;
  bidderId: string;
  bidderName: string;
  amount: number;
  timestamp: string;
}

export interface LiveStreamChatMessage {
  id: string;
  streamId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  message: string;
  timestamp: string;
  type: 'message' | 'system' | 'bid' | 'purchase';
  isSeller?: boolean;
}

// ── Real-time event types ──

export type StreamEventType =
  | 'bid'
  | 'chat'
  | 'lot_change'
  | 'viewer_count'
  | 'like'
  | 'purchase'
  | 'stream_end'
  | 'lot_sold'
  | 'lot_passed';

export interface StreamEvent<T = unknown> {
  type: StreamEventType;
  streamId: string;
  payload: T;
  timestamp: string;
}

export type BidEventPayload = {
  lotId: string;
  bid: LiveBid;
  newCurrentPrice: number;
  newBidCount: number;
};

export type ChatEventPayload = {
  message: LiveStreamChatMessage;
};

export type LotChangeEventPayload = {
  previousLotIndex: number;
  newLotIndex: number;
  lot: LiveLot;
};

export type ViewerCountEventPayload = {
  count: number;
};

export type LikeEventPayload = {
  totalLikes: number;
};

export type PurchaseEventPayload = {
  lotId: string;
  buyerId: string;
  buyerName: string;
  price: number;
};

export type StreamEndEventPayload = {
  endedAt: string;
  totalViewers: number;
  totalSales: number;
  lotsSold: number;
};

export type LotSoldEventPayload = {
  lotId: string;
  finalPrice: number;
  winnerId: string;
  winnerName: string;
};

export type LotPassedEventPayload = {
  lotId: string;
};

// ── Subscription manager ──

type Listener<T = unknown> = (event: StreamEvent<T>) => void;

interface StreamConnection {
  streamId: string;
  listeners: Set<Listener>;
  timers: ReturnType<typeof setInterval>[];
  chatFollowupIndex: number;
  viewerCount: number;
  likeCount: number;
  stream: LiveStream;
  isActive: boolean;
}

// In-memory connection registry (mock). In production this would be a
// WebSocket connection pool keyed by streamId.
const connections = new Map<string, StreamConnection>();

// ── Mock stream data (lots) ──

const MOCK_LOTS: LiveLot[] = [
  {
    id: 'lot-1',
    listingId: 'l1',
    title: 'Yves Saint Laurent Sweater',
    imageUri: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800',
    startingPrice: 150,
    currentPrice: 210,
    currentHighBidder: 'mariefullery',
    bidCount: 8,
    status: 'active',
    timeRemaining: 92,
    buyNowPrice: 320,
  },
  {
    id: 'lot-2',
    listingId: 'l6',
    title: 'Nike Air Max 90 White',
    imageUri: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800',
    startingPrice: 60,
    currentPrice: 92,
    currentHighBidder: 'sophie_k',
    bidCount: 14,
    status: 'upcoming',
    buyNowPrice: 140,
  },
  {
    id: 'lot-3',
    listingId: 'l4',
    title: 'Stüssy Logo Tee',
    imageUri: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800',
    startingPrice: 30,
    currentPrice: 68,
    currentHighBidder: 'jordan_b',
    bidCount: 21,
    status: 'upcoming',
    buyNowPrice: 95,
  },
  {
    id: 'lot-4',
    listingId: 'l2',
    title: 'Vintage Levi\'s Denim Jacket',
    imageUri: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800',
    startingPrice: 80,
    currentPrice: 80,
    bidCount: 0,
    status: 'upcoming',
    buyNowPrice: 180,
  },
  {
    id: 'lot-5',
    listingId: 'l3',
    title: 'Supreme Box Logo Hoodie',
    imageUri: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800',
    startingPrice: 120,
    currentPrice: 120,
    bidCount: 0,
    status: 'upcoming',
    buyNowPrice: 250,
  },
];

const MOCK_STREAMS: Record<string, LiveStream> = {
  'live-1': {
    id: 'live-1',
    sellerId: 'u3',
    sellerName: 'dankdunksuk',
    sellerAvatar: 'https://ui-avatars.com/api/?name=Dank+Dunks&background=1C5631&color=fff&size=128',
    sellerVerified: true,
    title: 'Friday Night Heat — Rare Sneaker Drop',
    status: 'live',
    startedAt: isoMinutesAgo(18),
    viewerCount: 1284,
    likeCount: 3420,
    currentLotIndex: 1,
    lots: MOCK_LOTS,
    chatEnabled: true,
    isDemo: LIVE_SHOPPING_DEMO_MODE,
  },
  'live-2': {
    id: 'live-2',
    sellerId: 'u1',
    sellerName: 'mariefullery',
    sellerAvatar: 'https://ui-avatars.com/api/?name=Marie+F&background=7B0E1E&color=fff&size=128',
    sellerVerified: true,
    title: 'Vintage Archive Sale — Curated Pieces',
    status: 'live',
    startedAt: isoMinutesAgo(6),
    viewerCount: 642,
    likeCount: 1890,
    currentLotIndex: 0,
    lots: MOCK_LOTS,
    chatEnabled: true,
    isDemo: LIVE_SHOPPING_DEMO_MODE,
  },
  'live-3': {
    id: 'live-3',
    sellerId: 'u2',
    sellerName: 'scott_art',
    sellerAvatar: 'https://ui-avatars.com/api/?name=Scott+Art&background=06489A&color=fff&size=128',
    sellerVerified: true,
    title: 'Streetwear Bidding Wars — Live',
    status: 'live',
    startedAt: isoMinutesAgo(32),
    viewerCount: 389,
    likeCount: 760,
    currentLotIndex: 2,
    lots: MOCK_LOTS,
    chatEnabled: true,
    isDemo: LIVE_SHOPPING_DEMO_MODE,
  },
};

// ── Mock chat followup pool (for simulated real-time chat) ──
const STREAM_CHAT_FOLLOWUPS: Omit<LiveStreamChatMessage, 'id' | 'timestamp'>[] = [
  { streamId: 'live-1', userId: 'viewer-6', userName: 'nora_b', userAvatar: 'https://ui-avatars.com/api/?name=NB&background=06489A&color=fff&size=64', message: 'Nice pickup!', type: 'message' },
  { streamId: 'live-1', userId: 'viewer-7', userName: 'leo_d', userAvatar: 'https://ui-avatars.com/api/?name=LD&background=1C5631&color=fff&size=64', message: '£100', type: 'message' },
  { streamId: 'live-1', userId: 'viewer-8', userName: 'kai_w', userAvatar: 'https://ui-avatars.com/api/?name=KW&background=7B0E1E&color=fff&size=64', message: 'These are clean', type: 'message' },
  { streamId: 'live-1', userId: 'viewer-9', userName: 'ruby_s', userAvatar: 'https://ui-avatars.com/api/?name=RS&background=8A6A3F&color=fff&size=64', message: 'Following! 🙌', type: 'message' },
  { streamId: 'live-1', userId: 'viewer-10', userName: 'finn_m', userAvatar: 'https://ui-avatars.com/api/?name=FM&background=4A7AC4&color=fff&size=64', message: '£110', type: 'message' },
  { streamId: 'live-1', userId: 'viewer-11', userName: 'ava_t', userAvatar: 'https://ui-avatars.com/api/?name=AT&background=9A6B7A&color=fff&size=64', message: 'Got my eye on the next lot', type: 'message' },
];

let streamChatCounter = 0;
function makeStreamChatMessage(
  base: Omit<LiveStreamChatMessage, 'id' | 'timestamp'>,
): LiveStreamChatMessage {
  streamChatCounter += 1;
  return {
    ...base,
    id: `stream-chat-${streamChatCounter}`,
    timestamp: new Date().toISOString(),
  };
}

let bidCounter = 0;
function makeBid(
  lotId: string,
  bidderId: string,
  bidderName: string,
  amount: number,
): LiveBid {
  bidCounter += 1;
  return {
    id: `bid-${bidCounter}`,
    lotId,
    bidderId,
    bidderName,
    amount,
    timestamp: new Date().toISOString(),
  };
}

// ── Seed chat messages for a stream ──
const STREAM_CHAT_SEED: Omit<LiveStreamChatMessage, 'id' | 'timestamp'>[] = [
  { streamId: 'live-1', userId: 'viewer-1', userName: 'sophie_k', userAvatar: 'https://ui-avatars.com/api/?name=SK&background=4A7AC4&color=fff&size=64', message: 'These are fire 🔥', type: 'message' },
  { streamId: 'live-1', userId: 'viewer-2', userName: 'jordan_b', userAvatar: 'https://ui-avatars.com/api/?name=JB&background=8A6A3F&color=fff&size=64', message: 'What size is the current item?', type: 'message' },
  { streamId: 'live-1', userId: 'u3', userName: 'dankdunksuk', userAvatar: 'https://ui-avatars.com/api/?name=Dank+Dunks&background=1C5631&color=fff&size=64', message: 'Size 10 UK! Bidding open now', type: 'message', isSeller: true },
  { streamId: 'live-1', userId: 'viewer-3', userName: 'mike_thrfts', userAvatar: 'https://ui-avatars.com/api/?name=MT&background=9A6B7A&color=fff&size=64', message: '£95', type: 'bid' },
  { streamId: 'live-1', userId: 'viewer-4', userName: 'amelia_v', userAvatar: 'https://ui-avatars.com/api/?name=AV&background=C9A46A&color=fff&size=64', message: 'Going for the win 💪', type: 'message' },
  { streamId: 'live-1', userId: 'viewer-5', userName: 'chris_p', userAvatar: 'https://ui-avatars.com/api/?name=CP&background=5F1616&color=fff&size=64', message: 'Last chance!', type: 'message' },
];

/**
 * Fetch the initial seed chat messages for a stream (pre-realtime history).
 */
export async function fetchStreamChatHistory(streamId: string): Promise<LiveStreamChatMessage[]> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    return fetchChatMessagesFromBackend(streamId);
  }
  await delay(200);
  void streamId;
  return STREAM_CHAT_SEED.map((base) => makeStreamChatMessage(base));
}

/**
 * Fetch a full LiveStream object by ID (with lots and real-time state).
 */
export async function fetchLiveStream(streamId: string): Promise<LiveStream | null> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return null;
  }
  await delay(300);
  const stream = MOCK_STREAMS[streamId];
  if (!stream) return null;
  // Return a deep copy so callers can't mutate the mock source
  return {
    ...stream,
    lots: stream.lots.map((lot) => ({ ...lot })),
  };
}

// ── Real-time connection management ──

/**
 * Connect to a live stream's real-time channel.
 * In production this opens a WebSocket to the streaming server.
 * In demo mode, this sets up timer-based event simulation.
 *
 * Returns the LiveStream snapshot at connection time.
 */
export async function connectToStream(streamId: string): Promise<LiveStream | null> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    return connectToStreamFromBackend(streamId);
  }
  await delay(150);
  const stream = MOCK_STREAMS[streamId];
  if (!stream) return null;

  // Don't double-connect
  if (connections.has(streamId)) {
    return { ...stream, lots: stream.lots.map((l) => ({ ...l })) };
  }

  const connection: StreamConnection = {
    streamId,
    listeners: new Set(),
    timers: [],
    chatFollowupIndex: 0,
    viewerCount: stream.viewerCount,
    likeCount: stream.likeCount,
    stream: { ...stream, lots: stream.lots.map((l) => ({ ...l })) },
    isActive: true,
  };

  // ── Simulate real-time events (demo mode only) ──
  if (LIVE_SHOPPING_DEMO_MODE) {
    // Chat messages every 4-8 seconds
    const chatTimer = setInterval(() => {
      if (!connection.isActive) return;
      const pool = STREAM_CHAT_FOLLOWUPS;
      const base = pool[connection.chatFollowupIndex % pool.length];
      connection.chatFollowupIndex += 1;
      const msg = makeStreamChatMessage({ ...base, streamId });
      emitEvent(connection, 'chat', { message: msg });
    }, 6000);
    connection.timers.push(chatTimer);

    // Emit the initial viewer count once — no fabricated drift (AGENTS.md §11).
    // The demo mode banner already tells users this is simulated; the count
    // stays static at the session's initial value rather than fabricating
    // engagement with random changes.
    emitEvent(connection, 'viewer_count', { count: connection.viewerCount });

    // Lot timer countdown every 1 second (for the active lot)
    const lotTimer = setInterval(() => {
      if (!connection.isActive) return;
      const lot = connection.stream.lots[connection.stream.currentLotIndex];
      if (lot && lot.status === 'active' && lot.timeRemaining != null) {
        lot.timeRemaining -= 1;
        if (lot.timeRemaining <= 0) {
          // Auto-sell the lot when time runs out
          lot.status = 'sold';
          lot.timeRemaining = undefined;
          const winnerName = lot.currentHighBidder ?? 'No bidder';
          emitEvent(connection, 'lot_sold', {
            lotId: lot.id,
            finalPrice: lot.currentPrice,
            winnerId: lot.currentHighBidder ? 'mock-winner' : '',
            winnerName,
          });
          // Emit a system chat message
          const sysMsg = makeStreamChatMessage({
            streamId,
            userId: 'system',
            userName: 'ThryftVerse',
            message: `Sold! ${lot.title} — ${winnerName} at ${formatFiatAmount(lot.currentPrice, DEFAULT_CURRENCY_CODE, 0)}`,
            type: 'system',
          });
          emitEvent(connection, 'chat', { message: sysMsg });
        }
      }
    }, 1000);
    connection.timers.push(lotTimer);
  }

  connections.set(streamId, connection);
  return { ...connection.stream, lots: connection.stream.lots.map((l) => ({ ...l })) };
}

/**
 * Subscribe to all real-time events for a stream.
 * Returns an unsubscribe function.
 */
export function subscribeToStreamEvents(streamId: string, callback: Listener): () => void {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    // Subscribe to all live.session events via the realtime client.
    const client = getRealtimeClient();
    if (!client) return () => {};

    const topic = liveSessionTopic(streamId);
    client.subscribe([topic]);
    const unsubscribe = client.on(topic, (envelope) => {
      const streamEventType = backendToStreamEventType(envelope.type);
      if (!streamEventType) return;
      const event: StreamEvent = {
        type: streamEventType,
        streamId,
        payload: envelope.payload,
        timestamp: envelope.timestamp,
      };
      callback(event);
    });

    return () => {
      unsubscribe();
      client.unsubscribe([topic]);
    };
  }

  const conn = connections.get(streamId);
  if (!conn) {
    // No active connection — return a no-op unsubscribe
    return () => {};
  }
  conn.listeners.add(callback);
  return () => {
    conn.listeners.delete(callback);
  };
}

/**
 * Subscribe to real-time bid updates for a stream.
 */
export function subscribeToBids(
  streamId: string,
  callback: (payload: BidEventPayload) => void,
): () => void {
  return subscribeToStreamEvents(streamId, (event) => {
    if (event.type === 'bid') {
      const raw = event.payload as Record<string, unknown>;
      // Backend sends lot: BackendCurrentLot — map lotId from the top-level
      // field or from bid.listingId for compatibility.
      const lotId = (raw.lotId as string) ?? (raw.bid as Record<string, unknown>)?.listingId as string;
      const bid = raw.bid as LiveBid;
      callback({
        lotId,
        bid,
        newCurrentPrice: raw.newCurrentPrice as number,
        newBidCount: raw.newBidCount as number,
      });
    }
  });
}

/**
 * Subscribe to real-time chat messages for a stream.
 */
export function subscribeToChat(
  streamId: string,
  callback: (payload: ChatEventPayload) => void,
): () => void {
  return subscribeToStreamEvents(streamId, (event) => {
    if (event.type === 'chat') {
      const raw = event.payload as Record<string, unknown>;
      const msg = raw.message as LiveStreamChatMessage;
      // Backend sends createdAt; demo sends timestamp. Normalise.
      if (msg && !msg.timestamp && (raw.message as Record<string, unknown>)?.createdAt) {
        msg.timestamp = (raw.message as Record<string, unknown>).createdAt as string;
      }
      callback({ message: msg });
    }
  });
}

/**
 * Subscribe to lot status changes (active lot switching, sold, passed).
 */
export function subscribeToLotChanges(
  streamId: string,
  callback: (payload: LotChangeEventPayload) => void,
): () => void {
  return subscribeToStreamEvents(streamId, (event) => {
    if (event.type === 'lot_change') {
      const raw = event.payload as Record<string, unknown>;
      const backendLot = raw.lot as BackendCurrentLot | undefined;
      // Map BackendCurrentLot → LiveLot for the frontend contract.
      const lot: LiveLot = backendLot
        ? {
            id: backendLot.listingId,
            listingId: backendLot.listingId,
            title: '',
            imageUri: '',
            startingPrice: backendLot.currentPrice,
            currentPrice: backendLot.currentPrice,
            bidCount: backendLot.bidCount,
            status: 'active',
          }
        : (raw.lot as LiveLot);
      callback({
        previousLotIndex: raw.previousLotIndex as number,
        newLotIndex: raw.newLotIndex as number,
        lot,
      });
    }
  });
}

/**
 * Subscribe to viewer count updates.
 */
export function subscribeToViewerCount(
  streamId: string,
  callback: (payload: ViewerCountEventPayload) => void,
): () => void {
  return subscribeToStreamEvents(streamId, (event) => {
    if (event.type === 'viewer_count') {
      callback(event.payload as ViewerCountEventPayload);
    }
  });
}

/**
 * Subscribe to like count updates.
 */
export function subscribeToLikes(
  streamId: string,
  callback: (payload: LikeEventPayload) => void,
): () => void {
  return subscribeToStreamEvents(streamId, (event) => {
    if (event.type === 'like') {
      callback(event.payload as LikeEventPayload);
    }
  });
}

// ── Real-time actions ──

/**
 * Place a bid on a lot during a live stream.
 * In production this sends a bid message over the WebSocket and awaits
 * confirmation from the auction engine.
 */
export async function placeStreamBid(
  streamId: string,
  lotId: string,
  amount: number,
): Promise<{ success: boolean; lot: LiveLot | null; bid: LiveBid | null; error?: string }> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    // lotId is the current lot's listingId — the backend operates on the
    // session's current lot, so we only need the amount here.
    void lotId;
    return placeBidOnBackend(streamId, amount);
  }
  await delay(400);
  const conn = connections.get(streamId);
  if (!conn) {
    return { success: false, lot: null, bid: null, error: 'Not connected to stream' };
  }
  const lot = conn.stream.lots.find((l) => l.id === lotId);
  if (!lot) {
    return { success: false, lot: null, bid: null, error: 'Lot not found' };
  }
  if (lot.status !== 'active') {
    return { success: false, lot, bid: null, error: 'Lot is not active' };
  }
  if (amount <= lot.currentPrice) {
    return { success: false, lot, bid: null, error: 'Bid must be higher than current price' };
  }

  const bid = makeBid(lotId, 'me', 'You', amount);
  lot.currentPrice = amount;
  lot.currentHighBidder = 'You';
  lot.bidCount += 1;

  // Emit bid event to all subscribers
  emitEvent(conn, 'bid', {
    lotId,
    bid,
    newCurrentPrice: lot.currentPrice,
    newBidCount: lot.bidCount,
  });

  // Emit a system chat message for the bid
  const bidMsg = makeStreamChatMessage({
    streamId,
    userId: 'me',
    userName: 'You',
    userAvatar: 'https://ui-avatars.com/api/?name=You&background=4A7AC4&color=fff&size=64',
    message: `Bid ${formatFiatAmount(amount, DEFAULT_CURRENCY_CODE, 0)} on ${lot.title}`,
    type: 'bid',
  });
  emitEvent(conn, 'chat', { message: bidMsg });

  return { success: true, lot, bid };
}

/**
 * Send a chat message to a live stream.
 */
export async function sendStreamChatMessage(
  streamId: string,
  message: string,
): Promise<{ success: boolean; message: LiveStreamChatMessage | null }> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    return sendChatMessageToBackend(streamId, message);
  }
  await delay(100);
  const conn = connections.get(streamId);
  if (!conn) {
    return { success: false, message: null };
  }
  const msg = makeStreamChatMessage({
    streamId,
    userId: 'me',
    userName: 'You',
    userAvatar: 'https://ui-avatars.com/api/?name=You&background=4A7AC4&color=fff&size=64',
    message,
    type: 'message',
  });
  emitEvent(conn, 'chat', { message: msg });
  return { success: true, message: msg };
}

/**
 * Fetch the current lot for a live session. Returns null if no lot is set.
 */
export async function fetchCurrentLot(
  streamId: string,
): Promise<LiveLot | null> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    const lot = await fetchCurrentLotFromBackend(streamId);
    if (!lot) return null;
    return {
      id: lot.listingId,
      listingId: lot.listingId,
      title: '',
      imageUri: '',
      startingPrice: lot.currentPrice,
      currentPrice: lot.currentPrice,
      bidCount: lot.bidCount,
      status: 'active',
    };
  }
  const conn = connections.get(streamId);
  if (!conn) return null;
  const lot = conn.stream.lots[conn.stream.currentLotIndex];
  return lot ? { ...lot } : null;
}

/** Alias for fetchStreamChatHistory — fetch recent chat messages. */
export async function fetchChatMessages(
  streamId: string,
): Promise<LiveStreamChatMessage[]> {
  return fetchStreamChatHistory(streamId);
}

/** Alias for sendStreamChatMessage — send a chat message. */
export async function sendChatMessage(
  streamId: string,
  message: string,
): Promise<{ success: boolean; message: LiveStreamChatMessage | null }> {
  return sendStreamChatMessage(streamId, message);
}

/**
 * Set the current lot for a live session (host action).
 */
export async function setCurrentLot(
  streamId: string,
  listingId: string,
  lotNumber: number,
): Promise<{ success: boolean; lot: LiveLot | null; error?: string }> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    const lot = await setCurrentLotOnBackend(streamId, listingId, lotNumber);
    if (!lot) return { success: false, lot: null, error: 'Could not set current lot' };
    return {
      success: true,
      lot: {
        id: lot.listingId,
        listingId: lot.listingId,
        title: '',
        imageUri: '',
        startingPrice: lot.currentPrice,
        currentPrice: lot.currentPrice,
        bidCount: lot.bidCount,
        status: 'active',
      },
    };
  }
  // Demo mode: no-op (lot management is handled via advanceToNextLot)
  return { success: false, lot: null, error: 'Not available in demo mode' };
}

/**
 * Buy now during a stream — instant purchase at the buy-now price.
 */
export async function buyNowDuringStream(
  streamId: string,
  lotId: string,
): Promise<{ success: boolean; lot: LiveLot | null; error?: string }> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return { success: false, lot: null, error: 'Live Shopping not available' };
  }
  await delay(350);
  const conn = connections.get(streamId);
  if (!conn) {
    return { success: false, lot: null, error: 'Not connected to stream' };
  }
  const lot = conn.stream.lots.find((l) => l.id === lotId);
  if (!lot) {
    return { success: false, lot: null, error: 'Lot not found' };
  }
  if (lot.status !== 'active') {
    return { success: false, lot, error: 'Lot is not active' };
  }
  if (lot.buyNowPrice == null) {
    return { success: false, lot, error: 'Buy now not available' };
  }

  lot.status = 'sold';
  lot.currentPrice = lot.buyNowPrice;
  lot.currentHighBidder = 'You';
  const finalPrice = lot.buyNowPrice;

  // Emit purchase event
  emitEvent(conn, 'purchase', {
    lotId,
    buyerId: 'me',
    buyerName: 'You',
    price: finalPrice,
  });

  // Emit lot sold
  emitEvent(conn, 'lot_sold', {
    lotId,
    finalPrice,
    winnerId: 'me',
    winnerName: 'You',
  });

  // System chat message
  const sysMsg = makeStreamChatMessage({
    streamId,
    userId: 'system',
    userName: 'ThryftVerse',
    message: `Sold! ${lot.title} — You bought it now at ${formatFiatAmount(finalPrice, DEFAULT_CURRENCY_CODE, 0)}`,
    type: 'purchase',
  });
  emitEvent(conn, 'chat', { message: sysMsg });

  return { success: true, lot };
}

/**
 * Like a live stream. Returns the new total like count.
 */
export async function likeStream(streamId: string): Promise<{ success: boolean; totalLikes: number }> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return { success: false, totalLikes: 0 };
  }
  await delay(80);
  const conn = connections.get(streamId);
  if (!conn) {
    return { success: false, totalLikes: 0 };
  }
  conn.likeCount += 1;
  emitEvent(conn, 'like', { totalLikes: conn.likeCount });
  return { success: true, totalLikes: conn.likeCount };
}

// ── Seller actions ──

/**
 * Advance to the next lot in the stream (seller action).
 */
export async function advanceToNextLot(
  streamId: string,
): Promise<{ success: boolean; lot: LiveLot | null; error?: string }> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return { success: false, lot: null, error: 'Live Shopping not available' };
  }
  await delay(200);
  const conn = connections.get(streamId);
  if (!conn) {
    return { success: false, lot: null, error: 'Not connected to stream' };
  }
  const currentIndex = conn.stream.currentLotIndex;
  const nextIndex = currentIndex + 1;
  if (nextIndex >= conn.stream.lots.length) {
    return { success: false, lot: null, error: 'No more lots' };
  }

  // Mark current lot as passed if still active
  const currentLot = conn.stream.lots[currentIndex];
  if (currentLot && currentLot.status === 'active') {
    currentLot.status = 'passed';
    currentLot.timeRemaining = undefined;
    emitEvent(conn, 'lot_passed', { lotId: currentLot.id });
  }

  // Activate next lot
  const nextLot = conn.stream.lots[nextIndex];
  nextLot.status = 'active';
  nextLot.timeRemaining = 120; // 2 minute default
  conn.stream.currentLotIndex = nextIndex;

  emitEvent(conn, 'lot_change', {
    previousLotIndex: currentIndex,
    newLotIndex: nextIndex,
    lot: { ...nextLot },
  });

  // System chat message
  const sysMsg = makeStreamChatMessage({
    streamId,
    userId: 'system',
    userName: 'ThryftVerse',
    message: `Now showing: ${nextLot.title} — Starting at ${formatFiatAmount(nextLot.startingPrice, DEFAULT_CURRENCY_CODE, 0)}`,
    type: 'system',
  });
  emitEvent(conn, 'chat', { message: sysMsg });

  return { success: true, lot: { ...nextLot } };
}

/**
 * Skip the current lot without selling (seller action).
 */
export async function skipCurrentLot(
  streamId: string,
): Promise<{ success: boolean; error?: string }> {
  return advanceToNextLot(streamId);
}

/**
 * End the current lot's auction early and sell to the current high bidder
 * (seller action).
 */
export async function endCurrentLot(
  streamId: string,
): Promise<{ success: boolean; lot: LiveLot | null; error?: string }> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return { success: false, lot: null, error: 'Live Shopping not available' };
  }
  await delay(200);
  const conn = connections.get(streamId);
  if (!conn) {
    return { success: false, lot: null, error: 'Not connected to stream' };
  }
  const lot = conn.stream.lots[conn.stream.currentLotIndex];
  if (!lot || lot.status !== 'active') {
    return { success: false, lot: lot ?? null, error: 'No active lot' };
  }

  lot.status = 'sold';
  lot.timeRemaining = undefined;
  const winnerName = lot.currentHighBidder ?? 'No bidder';

  emitEvent(conn, 'lot_sold', {
    lotId: lot.id,
    finalPrice: lot.currentPrice,
    winnerId: lot.currentHighBidder ? 'mock-winner' : '',
    winnerName,
  });

  const sysMsg = makeStreamChatMessage({
    streamId,
    userId: 'system',
    userName: 'ThryftVerse',
    message: `Sold! ${lot.title} — ${winnerName} at ${formatFiatAmount(lot.currentPrice, DEFAULT_CURRENCY_CODE, 0)}`,
    type: 'system',
  });
  emitEvent(conn, 'chat', { message: sysMsg });

  return { success: true, lot };
}

/**
 * End the live stream (seller action).
 */
export async function endLiveStream(
  streamId: string,
): Promise<{ success: boolean; summary: StreamEndEventPayload | null }> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return { success: false, summary: null };
  }
  await delay(300);
  const conn = connections.get(streamId);
  if (!conn) {
    return { success: false, summary: null };
  }

  conn.stream.status = 'ended';
  conn.stream.endedAt = new Date().toISOString();
  const lotsSold = conn.stream.lots.filter((l) => l.status === 'sold').length;
  const totalSales = conn.stream.lots
    .filter((l) => l.status === 'sold')
    .reduce((sum, l) => sum + l.currentPrice, 0);

  const summary: StreamEndEventPayload = {
    endedAt: conn.stream.endedAt,
    totalViewers: conn.viewerCount,
    totalSales,
    lotsSold,
  };

  emitEvent(conn, 'stream_end', summary);
  return { success: true, summary };
}

/**
 * Create a new live stream (seller pre-stream setup).
 * In production this would register the stream with the streaming server
 * and return RTMP ingest credentials.
 */
export async function createLiveStream(params: {
  sellerId: string;
  sellerName: string;
  title: string;
  lotListingIds: string[];
  scheduledStartAt?: string;
}): Promise<{ success: boolean; stream: LiveStream | null; error?: string }> {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    // Backend not yet available — return empty result (AGENTS.md §truthful-UI)
    return { success: false, stream: null, error: 'Live Shopping not available' };
  }
  await delay(500);
  if (!params.title.trim()) {
    return { success: false, stream: null, error: 'Title is required' };
  }
  if (params.lotListingIds.length === 0) {
    return { success: false, stream: null, error: 'Select at least one lot' };
  }

  const streamId = `stream-${Date.now()}`;
  const lots: LiveLot[] = params.lotListingIds.map((listingId, i) => ({
    id: `lot-${streamId}-${i}`,
    listingId,
    title: `Lot ${i + 1}`,
    imageUri: 'https://images.unsplash.com/photo-1551232864-3f32cf812878?w=800',
    startingPrice: 50,
    currentPrice: 50,
    bidCount: 0,
    status: i === 0 ? 'active' : 'upcoming',
    timeRemaining: i === 0 ? 120 : undefined,
    buyNowPrice: 100,
  }));

  const stream: LiveStream = {
    id: streamId,
    sellerId: params.sellerId,
    sellerName: params.sellerName,
    sellerAvatar: 'https://ui-avatars.com/api/?name=You&background=4A7AC4&color=fff&size=128',
    title: params.title,
    status: params.scheduledStartAt ? 'scheduled' : 'live',
    scheduledStartAt: params.scheduledStartAt,
    startedAt: params.scheduledStartAt ? undefined : new Date().toISOString(),
    viewerCount: 0,
    likeCount: 0,
    currentLotIndex: 0,
    lots,
    chatEnabled: true,
    isDemo: LIVE_SHOPPING_DEMO_MODE,
  };

  MOCK_STREAMS[streamId] = stream;
  return { success: true, stream };
}

/**
 * Disconnect from a live stream — cleans up all timers and listeners.
 */
export function disconnectFromStream(streamId: string): void {
  if (!LIVE_SHOPPING_DEMO_MODE) {
    // Best-effort viewer count decrement on the backend.
    void leaveSessionOnBackend(streamId);
    return;
  }
  const conn = connections.get(streamId);
  if (!conn) return;
  conn.isActive = false;
  conn.timers.forEach((t) => clearInterval(t));
  conn.timers = [];
  conn.listeners.clear();
  connections.delete(streamId);
}

// ── Internal event emitter ──

function emitEvent<T>(conn: StreamConnection, type: StreamEventType, payload: T): void {
  const event: StreamEvent<T> = {
    type,
    streamId: conn.streamId,
    payload,
    timestamp: new Date().toISOString(),
  };
  // Clone listeners to avoid mutation during iteration
  const listeners = Array.from(conn.listeners);
  for (const listener of listeners) {
    try {
      listener(event as StreamEvent<unknown>);
    } catch {
      // Listener errors don't crash the stream
    }
  }
}
