import { fetchJson } from '../lib/apiClient';
import { ENABLE_RUNTIME_MOCKS } from '../constants/runtimeFlags';

export type AuctionLifecycle = 'upcoming' | 'live' | 'ended' | 'cancelled' | 'settled';
export type AuctionStatus = AuctionLifecycle;
export type AuctionTerminalReason = 'cancelled' | 'settled' | 'buy_now' | 'scheduled_end' | null;
export type AuctionViewerState = 'not_participating' | 'watching' | 'leading' | 'outbid' | 'won' | 'lost' | 'seller';
export type AuctionSortMode = 'endingSoon' | 'newest' | 'mostBids' | 'priceLow' | 'priceHigh';

export interface AuctionSeller {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface MarketAuction {
  id: string;
  listingId: string;
  seller: AuctionSeller;
  title: string;
  imageUrl: string | null;
  brand: string | null;
  category: string | null;
  conditionLabel: string | null;
  startsAt: string;
  endsAt: string;
  startingBidGbp: number;
  currentBidGbp: number;
  minimumNextBidGbp: number;
  buyNowPriceGbp: number | null;
  reservePriceGbp: number | null;
  bidCount: number;
  lifecycle: AuctionLifecycle;
  terminalReason: AuctionTerminalReason;
  viewerState: AuctionViewerState;
  isWatched: boolean;
  winnerBidderId: string | null;
  cancelledAt: string | null;
  settledAt: string | null;
  createdAt: string;
}

export interface AuctionBidActivity {
  id: number;
  bidderId: string;
  bidderUsername: string;
  amountGbp: number;
  createdAt: string;
  isViewer: boolean;
}

export interface AuctionDetail {
  id: string;
  listingId: string;
  seller: AuctionSeller;
  title: string;
  imageUrl: string | null;
  brand: string | null;
  category: string | null;
  conditionLabel: string | null;
  description: string | null;
  listingPriceGbp: number | null;
  startsAt: string;
  endsAt: string;
  startingBidGbp: number;
  currentBidGbp: number;
  minimumNextBidGbp: number;
  buyNowPriceGbp: number | null;
  reservePriceGbp: number | null;
  bidCount: number;
  lifecycle: AuctionLifecycle;
  terminalReason: AuctionTerminalReason;
  viewerState: AuctionViewerState;
  isWatched: boolean;
  winnerBidderId: string | null;
  settledAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export interface AuctionDetailResponse {
  ok: true;
  auction: AuctionDetail;
  bidActivity: AuctionBidActivity[];
  serverNow: string;
}

export interface MyAuctionBid {
  id: number;
  auctionId: string;
  amountGbp: number;
  createdAt: string;
  bidState: 'active' | 'leading' | 'outbid' | 'won' | 'lost';
  auction: {
    id: string;
    title: string;
    imageUrl: string | null;
    currentBidGbp: number;
    bidCount: number;
    lifecycle: AuctionLifecycle;
    terminalReason: AuctionTerminalReason;
    winnerBidderId: string | null;
    sellerId: string;
    sellerUsername: string;
    endsAt: string;
  };
}

export interface MarketAuctionBid {
  id: number;
  auctionId: string;
  bidderId: string;
  amountGbp: number;
  createdAt: string;
}

export interface MarketAuctionBidResult {
  bid: MarketAuctionBid;
  auction: {
    id: string;
    currentBidGbp: number;
    bidCount: number;
    isBuyNow?: boolean;
  };
  aml?: {
    alertId: string;
    status: string;
  } | null;
}

export type CoOwnSettlementMode = 'GBP' | 'TVUSD' | 'HYBRID' | 'ONEZE';

export interface MarketCoOwnAsset {
  id: string;
  listingId: string;
  issuerId: string;
  title: string;
  imageUrl: string | null;
  totalUnits: number;
  availableUnits: number;
  unitPriceGbp: number;
  unitPriceStable: number;
  settlementMode: CoOwnSettlementMode;
  issuerJurisdiction: string | null;
  marketMovePct24h: number;
  holders: number;
  volume24hGbp: number;
  isOpen: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CoOwnOrderSide = 'buy' | 'sell';

export interface MarketCoOwnOrder {
  id: number;
  assetId: string;
  userId: string;
  side: CoOwnOrderSide;
  orderType?: 'market' | 'limit';
  limitPriceGbp?: number | null;
  units: number;
  remainingUnits?: number;
  filledUnits?: number;
  unitPriceGbp: number;
  feeGbp: number;
  totalGbp: number;
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected';
  createdAt: string;
  updatedAt?: string;
}

export interface MarketCoOwnBuyoutOffer {
  id: string;
  assetId: string;
  bidderUserId: string;
  offerPriceGbp: number;
  targetUnits: number;
  acceptedUnits: number;
  status: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export type MarketHistoryChannel = 'auction' | 'co-own';
export type MarketHistoryAction = 'bid' | 'buy-units' | 'sell-units';

export interface MarketHistoryItem {
  id: string;
  channel: MarketHistoryChannel;
  action: MarketHistoryAction;
  referenceId: string;
  amountGbp: number;
  units: number | null;
  filledUnits?: number | null;
  remainingUnits?: number | null;
  unitPriceGbp: number | null;
  feeGbp: number | null;
  status: 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected' | null;
  orderType: 'market' | 'limit' | null;
  note: string | null;
  timestamp: string;
}

export interface MarketHistoryCursor {
  cursorTs: string;
  cursorId: string;
}

export interface MarketHistoryPage {
  items: MarketHistoryItem[];
  pageInfo: {
    hasMore: boolean;
    nextCursor?: MarketHistoryCursor;
  };
}

interface ListAuctionsResponse {
  ok: true;
  items: MarketAuction[];
  nextCursor: string | null;
  serverNow: string;
}

interface GetAuctionDetailResponse extends AuctionDetailResponse {}

interface GetWatchlistResponse {
  ok: true;
  items: MarketAuction[];
  nextCursor: string | null;
}

interface WatchToggleResponse {
  ok: true;
  isWatched: boolean;
}

interface GetMyAuctionBidsResponse {
  ok: true;
  items: MyAuctionBid[];
  nextCursor: string | null;
}

interface PlaceAuctionBidResponse {
  ok: true;
  bid: MarketAuctionBid;
  auction: MarketAuctionBidResult['auction'];
  aml?: {
    alertId: string;
    status: string;
  } | null;
}

interface ListAuctionBidsResponse {
  ok: true;
  items: MarketAuctionBid[];
}

interface ListCoOwnAssetsResponse {
  ok: true;
  items: MarketCoOwnAsset[];
}

interface PlaceCoOwnOrderResponse {
  ok: true;
  order: MarketCoOwnOrder;
  asset: {
    id: string;
    availableUnits: number;
    holders: number;
    volume24hGbp: number;
    updatedAt: string;
  };
  aml?: {
    alertId: string;
    status: string;
  } | null;
}

interface CreateCoOwnBuyoutOfferResponse {
  ok: true;
  offer: MarketCoOwnBuyoutOffer;
  aml?: {
    alertId: string;
    status: string;
  } | null;
}

interface ListCoOwnOrdersResponse {
  ok: true;
  items: MarketCoOwnOrder[];
}

interface ListUserMarketHistoryResponse {
  ok: true;
  items: MarketHistoryItem[];
  pageInfo: {
    hasMore: boolean;
    nextCursor?: MarketHistoryCursor;
  };
}

interface ListAuctionsOptions {
  status?: 'live' | 'scheduled' | 'ended' | 'all';
  query?: string;
  category?: string;
  sort?: AuctionSortMode;
  watchedOnly?: boolean;
  seller?: 'me';
  cursor?: string;
  limit?: number;
}

// ── Auction House home aggregate ──

export type AttentionReason =
  | 'won_action'
  | 'outbid'
  | 'leading_ending'
  | 'leading'
  | 'watching_ending'
  | null;

export interface AuctionHomeActivity {
  activeCount: number;
  needsAttentionCount: number;
  leadingCount: number;
  outbidCount: number;
  watchingCount: number;
  unresolvedWonCount: number;
}

export interface CategoryWorld {
  categoryKey: string;
  displayName: string;
  representativeImageUrl: string | null;
  availableCount?: number;
}

export interface SellerSummary {
  liveCount: number;
  scheduledCount: number;
  completedCount: number;
}

export interface AuctionHomeResponse {
  ok: true;
  serverNow: string;
  attention: {
    item: MarketAuction | null;
    reason: AttentionReason;
  };
  activity: AuctionHomeActivity;
  closingSoon: MarketAuction[];
  live: MarketAuction[];
  upcoming: MarketAuction[];
  categoryWorlds: CategoryWorld[];
  recentlyClosed: MarketAuction[];
  sellerSummary?: SellerSummary;
  sellerAuctions: MarketAuction[];
  watchlist: MarketAuction[];
}

interface ListAuctionBidsOptions {
  limit?: number;
}

interface ListCoOwnAssetsOptions {
  openOnly?: boolean;
  issuerId?: string;
  limit?: number;
}

interface ListCoOwnAssetOrdersOptions {
  limit?: number;
}

interface ListUserMarketHistoryOptions {
  channel?: 'all' | MarketHistoryChannel;
  limit?: number;
  cursorTs?: string;
  cursorId?: string;
}

export interface PlaceAuctionBidInput {
  amountGbp: number;
  idempotencyKey?: string;
}

interface PlaceCoOwnOrderInput {
  userId: string;
  side: CoOwnOrderSide;
  units: number;
  orderType?: 'market' | 'limit';
  limitPriceGbp?: number;
  /** Active server reservation created immediately before confirmation. */
  reservationId: string;
  /** Client-supplied idempotency key per spec 10 §1. Prevents duplicate orders on retry. */
  idempotencyKey?: string;
}

interface CreateCoOwnBuyoutOfferInput {
  bidderUserId: string;
  offerPriceGbp: number;
  targetUnits?: number;
  expiresInHours?: number;
  metadata?: Record<string, unknown>;
}

function toQuery(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    search.set(key, String(value));
  });

  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export interface CreateAuctionInput {
  listingId: string;
  startsAt: string;
  endsAt: string;
  startingBidGbp: number;
  buyNowPriceGbp?: number;
  minIncrementGbp?: number;
  idempotencyKey?: string;
}

export interface CreateAuctionResponse {
  ok: true;
  auction: MarketAuction;
  idempotent?: boolean;
}

export async function createAuction(input: CreateAuctionInput): Promise<MarketAuction> {
  const payload = await fetchJson<CreateAuctionResponse>('/auctions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return payload.auction;
}

export async function listAuctions(options: ListAuctionsOptions = {}): Promise<{ items: MarketAuction[]; nextCursor: string | null; serverNow: string }> {
  const query = toQuery({
    status: options.status,
    query: options.query,
    category: options.category,
    sort: options.sort,
    watchedOnly: options.watchedOnly,
    seller: options.seller,
    cursor: options.cursor,
    limit: options.limit,
  });
  const payload = await fetchJson<ListAuctionsResponse>(`/auctions${query}`);
  return { items: payload.items, nextCursor: payload.nextCursor, serverNow: payload.serverNow };
}

// ── Dev mock fallback for /auctions/home ──
// Used only when ENABLE_RUNTIME_MOCKS is true and the backend is unreachable.
// Follows the same pattern as BackendDataContext falling back to MOCK_LISTINGS.
const MOCK_SELLER: AuctionSeller = {
  id: 'mock-seller-1',
  username: 'atelier_vault',
  displayName: 'Atelier Vault',
  avatarUrl: null,
};

const MOCK_SELLER_2: AuctionSeller = {
  id: 'mock-seller-2',
  username: 'curated_archive',
  displayName: 'Curated Archive',
  avatarUrl: null,
};

function isoFromNow(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

function mockAuction(
  id: string,
  title: string,
  opts: {
    seller?: AuctionSeller;
    startsInMin?: number;
    endsInMin?: number;
    startingBidGbp?: number;
    currentBidGbp?: number;
    bidCount?: number;
    buyNowPriceGbp?: number | null;
    reservePriceGbp?: number | null;
    lifecycle?: AuctionLifecycle;
    viewerState?: AuctionViewerState;
    isWatched?: boolean;
    category?: string | null;
    brand?: string | null;
    imageUrl?: string | null;
  } = {}
): MarketAuction {
  const startsInMin = opts.startsInMin ?? -60;
  const endsInMin = opts.endsInMin ?? 30;
  return {
    id,
    listingId: `listing-${id}`,
    seller: opts.seller ?? MOCK_SELLER,
    title,
    imageUrl: opts.imageUrl ?? null,
    brand: opts.brand ?? null,
    category: opts.category ?? null,
    conditionLabel: 'Excellent',
    startsAt: isoFromNow(startsInMin),
    endsAt: isoFromNow(endsInMin),
    startingBidGbp: opts.startingBidGbp ?? 50,
    currentBidGbp: opts.currentBidGbp ?? 80,
    minimumNextBidGbp: (opts.currentBidGbp ?? 80) + 5,
    buyNowPriceGbp: opts.buyNowPriceGbp ?? null,
    reservePriceGbp: opts.reservePriceGbp ?? null,
    bidCount: opts.bidCount ?? 3,
    lifecycle: opts.lifecycle ?? 'live',
    terminalReason: null,
    viewerState: opts.viewerState ?? 'not_participating',
    isWatched: opts.isWatched ?? false,
    winnerBidderId: null,
    cancelledAt: null,
    settledAt: null,
    createdAt: isoFromNow(-1440),
  };
}

function getMockAuctionHome(): AuctionHomeResponse {
  const now = new Date();
  return {
    ok: true,
    serverNow: now.toISOString(),
    attention: {
      item: mockAuction('mock-att-1', 'Vintage Rolex Datejust', {
        seller: MOCK_SELLER_2,
        startsInMin: -120,
        endsInMin: 8,
        startingBidGbp: 1200,
        currentBidGbp: 1850,
        bidCount: 12,
        viewerState: 'outbid',
        isWatched: true,
        brand: 'Rolex',
        category: 'Watches',
        reservePriceGbp: 1500,
      }),
      reason: 'outbid',
    },
    activity: {
      activeCount: 3,
      needsAttentionCount: 1,
      leadingCount: 1,
      outbidCount: 1,
      watchingCount: 4,
      unresolvedWonCount: 0,
    },
    closingSoon: [
      mockAuction('mock-cs-1', 'Vintage Rolex Datejust', {
        seller: MOCK_SELLER_2,
        startsInMin: -120,
        endsInMin: 8,
        startingBidGbp: 1200,
        currentBidGbp: 1850,
        bidCount: 12,
        viewerState: 'outbid',
        isWatched: true,
        brand: 'Rolex',
        category: 'Watches',
        reservePriceGbp: 1500,
      }),
      mockAuction('mock-cs-2', 'Hermès Birkin 30 Togo', {
        seller: MOCK_SELLER,
        startsInMin: -90,
        endsInMin: 22,
        startingBidGbp: 4000,
        currentBidGbp: 5200,
        bidCount: 8,
        viewerState: 'leading',
        isWatched: true,
        brand: 'Hermès',
        category: 'Bags',
        reservePriceGbp: 6000,
      }),
      mockAuction('mock-cs-3', 'Leica M6 Black Paint', {
        seller: MOCK_SELLER_2,
        startsInMin: -45,
        endsInMin: 35,
        startingBidGbp: 800,
        currentBidGbp: 1100,
        bidCount: 5,
        brand: 'Leica',
        category: 'Cameras',
      }),
    ],
    live: [
      mockAuction('mock-live-1', 'Nike Dunk Low Panda', {
        seller: MOCK_SELLER,
        startsInMin: -30,
        endsInMin: 120,
        startingBidGbp: 60,
        currentBidGbp: 95,
        bidCount: 4,
        brand: 'Nike',
        category: 'Sneakers',
      }),
      mockAuction('mock-live-2', 'Supreme Box Logo Tee FW23', {
        seller: MOCK_SELLER_2,
        startsInMin: -20,
        endsInMin: 180,
        startingBidGbp: 40,
        currentBidGbp: 72,
        bidCount: 6,
        brand: 'Supreme',
        category: 'Streetwear',
      }),
    ],
    upcoming: [
      mockAuction('mock-up-1', 'Patek Philippe Calatrava 5196', {
        seller: MOCK_SELLER_2,
        startsInMin: 240,
        endsInMin: 1440,
        startingBidGbp: 5000,
        currentBidGbp: 5000,
        bidCount: 0,
        lifecycle: 'upcoming',
        brand: 'Patek Philippe',
        category: 'Watches',
      }),
      mockAuction('mock-up-2', 'Chanel Classic Flap Medium', {
        seller: MOCK_SELLER,
        startsInMin: 720,
        endsInMin: 2880,
        startingBidGbp: 3000,
        currentBidGbp: 3000,
        bidCount: 0,
        lifecycle: 'upcoming',
        brand: 'Chanel',
        category: 'Bags',
      }),
    ],
    categoryWorlds: [
      { categoryKey: 'watches', displayName: 'Watches', representativeImageUrl: null, availableCount: 12 },
      { categoryKey: 'bags', displayName: 'Bags', representativeImageUrl: null, availableCount: 8 },
      { categoryKey: 'sneakers', displayName: 'Sneakers', representativeImageUrl: null, availableCount: 15 },
      { categoryKey: 'cameras', displayName: 'Cameras', representativeImageUrl: null, availableCount: 5 },
    ],
    recentlyClosed: [
      mockAuction('mock-rc-1', 'Omega Speedmaster Pro', {
        seller: MOCK_SELLER,
        startsInMin: -2880,
        endsInMin: -120,
        startingBidGbp: 1000,
        currentBidGbp: 2400,
        bidCount: 18,
        lifecycle: 'ended',
        viewerState: 'lost',
        brand: 'Omega',
        category: 'Watches',
      }),
    ],
    sellerSummary: {
      liveCount: 1,
      scheduledCount: 0,
      completedCount: 2,
    },
    sellerAuctions: [
      mockAuction('mock-sa-1', 'Nike Dunk Low Panda', {
        seller: MOCK_SELLER,
        startsInMin: -30,
        endsInMin: 120,
        startingBidGbp: 60,
        currentBidGbp: 95,
        bidCount: 4,
        viewerState: 'seller',
        brand: 'Nike',
        category: 'Sneakers',
      }),
    ],
    watchlist: [
      mockAuction('mock-w-1', 'Vintage Rolex Datejust', {
        seller: MOCK_SELLER_2,
        startsInMin: -120,
        endsInMin: 8,
        startingBidGbp: 1200,
        currentBidGbp: 1850,
        bidCount: 12,
        viewerState: 'outbid',
        isWatched: true,
        brand: 'Rolex',
        category: 'Watches',
      }),
      mockAuction('mock-w-2', 'Hermès Birkin 30 Togo', {
        seller: MOCK_SELLER,
        startsInMin: -90,
        endsInMin: 22,
        startingBidGbp: 4000,
        currentBidGbp: 5200,
        bidCount: 8,
        viewerState: 'leading',
        isWatched: true,
        brand: 'Hermès',
        category: 'Bags',
      }),
    ],
  };
}

export async function getAuctionHome(): Promise<AuctionHomeResponse> {
  try {
    return await fetchJson<AuctionHomeResponse>('/auctions/home');
  } catch (err) {
    if (ENABLE_RUNTIME_MOCKS) {
      console.warn('[marketApi] /auctions/home failed — returning dev mock fallback:', err instanceof Error ? err.message : err);
      return getMockAuctionHome();
    }
    throw err;
  }
}

export async function getAuctionDetail(auctionId: string): Promise<AuctionDetailResponse> {
  const payload = await fetchJson<GetAuctionDetailResponse>(
    `/auctions/${encodeURIComponent(auctionId)}`
  );
  return payload;
}

export async function getWatchlist(cursor?: string): Promise<{ items: MarketAuction[]; nextCursor: string | null }> {
  const query = toQuery({ cursor });
  const payload = await fetchJson<GetWatchlistResponse>(`/auctions/watchlist${query}`);
  return { items: payload.items, nextCursor: payload.nextCursor };
}

export async function addToWatchlist(auctionId: string): Promise<boolean> {
  const payload = await fetchJson<WatchToggleResponse>(
    `/auctions/${encodeURIComponent(auctionId)}/watch`,
    { method: 'POST' }
  );
  return payload.isWatched;
}

export async function removeFromWatchlist(auctionId: string): Promise<boolean> {
  const payload = await fetchJson<WatchToggleResponse>(
    `/auctions/${encodeURIComponent(auctionId)}/watch`,
    { method: 'DELETE' }
  );
  return payload.isWatched;
}

export async function getMyAuctionBids(
  status?: 'active' | 'leading' | 'outbid' | 'won' | 'lost' | 'all',
  cursor?: string
): Promise<{ items: MyAuctionBid[]; nextCursor: string | null }> {
  const query = toQuery({ status, cursor });
  const payload = await fetchJson<GetMyAuctionBidsResponse>(`/users/me/auction-bids${query}`);
  return { items: payload.items, nextCursor: payload.nextCursor };
}

export async function placeAuctionBid(
  auctionId: string,
  input: PlaceAuctionBidInput
): Promise<MarketAuctionBidResult> {
  const payload = await fetchJson<PlaceAuctionBidResponse>(
    `/auctions/${encodeURIComponent(auctionId)}/bids`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  return {
    bid: payload.bid,
    auction: payload.auction,
    aml: payload.aml ?? null,
  };
}

export interface BuyNowResult {
  ok: true;
  isBuyNow: true;
  idempotent?: boolean;
  bid: MarketAuctionBid;
  auction: {
    id: string;
    currentBidGbp: number;
    bidCount: number;
    isBuyNow: true;
    status: string;
    winnerBidderId: string | null;
  };
  aml: { alertId: string; status: string } | null;
}

export interface BuyNowInput {
  idempotencyKey: string;
  expectedPriceGbp: number;
}

export async function buyAuctionNow(
  auctionId: string,
  input: BuyNowInput
): Promise<BuyNowResult> {
  const payload = await fetchJson<BuyNowResult>(
    `/auctions/${encodeURIComponent(auctionId)}/buy-now`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  return payload;
}

export async function listAuctionBids(
  auctionId: string,
  options: ListAuctionBidsOptions = {}
): Promise<MarketAuctionBid[]> {
  const query = toQuery({
    limit: options.limit,
  });

  const payload = await fetchJson<ListAuctionBidsResponse>(
    `/auctions/${encodeURIComponent(auctionId)}/bids${query}`
  );

  return payload.items;
}

// ── Dev mock fallback for Co-Own assets ──
// Used only when ENABLE_RUNTIME_MOCKS is true and the backend is unreachable.
// Follows the same pattern as getAuctionHome() dev mock fallback.
const MOCK_COOWN_ISSUER_1 = 'mock-issuer-1';
const MOCK_COOWN_ISSUER_2 = 'mock-issuer-2';

function mockCoOwnAsset(
  id: string,
  title: string,
  opts: {
    issuerId?: string;
    totalUnits?: number;
    availableUnits?: number;
    unitPriceGbp?: number;
    unitPriceStable?: number;
    settlementMode?: CoOwnSettlementMode;
    issuerJurisdiction?: string | null;
    holders?: number;
    volume24hGbp?: number;
    isOpen?: boolean;
    imageUrl?: string | null;
    createdAtMinAgo?: number;
  } = {}
): MarketCoOwnAsset {
  const total = opts.totalUnits ?? 100;
  const available = opts.availableUnits ?? Math.floor(total * 0.4);
  return {
    id,
    listingId: `listing-${id}`,
    issuerId: opts.issuerId ?? MOCK_COOWN_ISSUER_1,
    title,
    imageUrl: opts.imageUrl ?? null,
    totalUnits: total,
    availableUnits: available,
    unitPriceGbp: opts.unitPriceGbp ?? 25,
    unitPriceStable: opts.unitPriceStable ?? 30,
    settlementMode: opts.settlementMode ?? 'HYBRID',
    issuerJurisdiction: opts.issuerJurisdiction ?? 'United Kingdom',
    marketMovePct24h: 0,
    holders: opts.holders ?? total - available,
    volume24hGbp: opts.volume24hGbp ?? 0,
    isOpen: opts.isOpen ?? true,
    createdAt: new Date(Date.now() - (opts.createdAtMinAgo ?? 180) * 60_000).toISOString(),
    updatedAt: new Date(Date.now() - (opts.createdAtMinAgo ?? 60) * 60_000).toISOString(),
  };
}

function getMockCoOwnAssets(): MarketCoOwnAsset[] {
  return [
    mockCoOwnAsset('mock-coown-1', 'Hermès Birkin 30 Togo Etoupe', {
      issuerId: MOCK_COOWN_ISSUER_1,
      totalUnits: 100,
      availableUnits: 35,
      unitPriceGbp: 85,
      unitPriceStable: 102,
      settlementMode: 'HYBRID',
      holders: 65,
      volume24hGbp: 1200,
      imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800',
      createdAtMinAgo: 320,
    }),
    mockCoOwnAsset('mock-coown-2', 'Rolex Submariner Date 126610LN', {
      issuerId: MOCK_COOWN_ISSUER_2,
      totalUnits: 50,
      availableUnits: 12,
      unitPriceGbp: 180,
      unitPriceStable: 216,
      settlementMode: 'GBP',
      holders: 38,
      volume24hGbp: 2400,
      imageUrl: 'https://images.unsplash.com/photo-1547996160-81dfa63595aa?w=800',
      createdAtMinAgo: 240,
    }),
    mockCoOwnAsset('mock-coown-3', 'Louis Vuitton Multi Pochette Accessoires', {
      issuerId: MOCK_COOWN_ISSUER_1,
      totalUnits: 200,
      availableUnits: 200,
      unitPriceGbp: 22,
      unitPriceStable: 26,
      settlementMode: 'TVUSD',
      holders: 0,
      volume24hGbp: 0,
      imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800',
      createdAtMinAgo: 30,
    }),
    mockCoOwnAsset('mock-coown-4', 'Patek Philippe Nautilus 5711/1A', {
      issuerId: MOCK_COOWN_ISSUER_2,
      totalUnits: 30,
      availableUnits: 5,
      unitPriceGbp: 650,
      unitPriceStable: 780,
      settlementMode: 'HYBRID',
      holders: 25,
      volume24hGbp: 5200,
      imageUrl: 'https://images.unsplash.com/photo-1547996160-81dfa63595aa?w=800',
      createdAtMinAgo: 480,
    }),
    mockCoOwnAsset('mock-coown-5', 'Chanel Classic Flap Medium Black', {
      issuerId: MOCK_COOWN_ISSUER_1,
      totalUnits: 80,
      availableUnits: 28,
      unitPriceGbp: 95,
      unitPriceStable: 114,
      settlementMode: 'GBP',
      holders: 52,
      volume24hGbp: 1800,
      imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800',
      createdAtMinAgo: 200,
    }),
    mockCoOwnAsset('mock-coown-6', 'Audemars Piguet Royal Oak 15500ST', {
      issuerId: MOCK_COOWN_ISSUER_2,
      totalUnits: 40,
      availableUnits: 40,
      unitPriceGbp: 420,
      unitPriceStable: 504,
      settlementMode: 'TVUSD',
      holders: 0,
      volume24hGbp: 0,
      imageUrl: 'https://images.unsplash.com/photo-1547996160-81dfa63595aa?w=800',
      createdAtMinAgo: 15,
    }),
    mockCoOwnAsset('mock-coown-7', 'Gucci Dionysus Small GG Supreme', {
      issuerId: MOCK_COOWN_ISSUER_1,
      totalUnits: 120,
      availableUnits: 48,
      unitPriceGbp: 18,
      unitPriceStable: 22,
      settlementMode: 'HYBRID',
      holders: 72,
      volume24hGbp: 600,
      imageUrl: 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800',
      createdAtMinAgo: 120,
    }),
    mockCoOwnAsset('mock-coown-8', 'Cartier Santos Large Steel', {
      issuerId: MOCK_COOWN_ISSUER_2,
      totalUnits: 60,
      availableUnits: 18,
      unitPriceGbp: 140,
      unitPriceStable: 168,
      settlementMode: 'GBP',
      holders: 42,
      volume24hGbp: 900,
      imageUrl: 'https://images.unsplash.com/photo-1547996160-81dfa63595aa?w=800',
      createdAtMinAgo: 360,
    }),
  ];
}

function getMockCoOwnHoldings(userId: string): MarketCoOwnHolding[] {
  return [
    {
      userId,
      assetId: 'mock-coown-1',
      unitsOwned: 5,
      avgEntryPriceGbp: 82,
      realizedPnlGbp: 0,
      updatedAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    },
    {
      userId,
      assetId: 'mock-coown-2',
      unitsOwned: 2,
      avgEntryPriceGbp: 175,
      realizedPnlGbp: 10,
      updatedAt: new Date(Date.now() - 120 * 60_000).toISOString(),
    },
    {
      userId,
      assetId: 'mock-coown-5',
      unitsOwned: 3,
      avgEntryPriceGbp: 92,
      realizedPnlGbp: 0,
      updatedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    },
  ];
}

export async function listCoOwnAssets(
  options: ListCoOwnAssetsOptions = {}
): Promise<MarketCoOwnAsset[]> {
  const query = toQuery({
    openOnly: options.openOnly,
    issuerId: options.issuerId,
    limit: options.limit,
  });
  try {
    const payload = await fetchJson<ListCoOwnAssetsResponse>(`/co-own/assets${query}`);
    return payload.items;
  } catch (err) {
    if (ENABLE_RUNTIME_MOCKS) {
      console.warn('[marketApi] /co-own/assets failed — returning dev mock fallback:', err instanceof Error ? err.message : err);
      return getMockCoOwnAssets();
    }
    throw err;
  }
}

interface GetCoOwnAssetResponse {
  ok: true;
  item: MarketCoOwnAsset;
}

export async function fetchCoOwnAssetById(assetId: string): Promise<MarketCoOwnAsset> {
  try {
    const payload = await fetchJson<GetCoOwnAssetResponse>(
      `/co-own/assets/${encodeURIComponent(assetId)}`
    );
    return payload.item;
  } catch (err) {
    if (ENABLE_RUNTIME_MOCKS) {
      console.warn('[marketApi] /co-own/assets/:id failed — returning dev mock fallback:', err instanceof Error ? err.message : err);
      const mockAssets = getMockCoOwnAssets();
      const found = mockAssets.find((a) => a.id === assetId);
      if (found) return found;
    }
    throw err;
  }
}

export interface CoOwnOrderBookEntry {
  side: 'buy' | 'sell';
  unitPriceGbp: number;
  units: number;
  orderCount: number;
}

interface GetCoOwnOrderBookResponse {
  ok: true;
  bids: CoOwnOrderBookEntry[];
  asks: CoOwnOrderBookEntry[];
  snapshotSequence?: number;
  eventSequence?: number;
  serverTimestamp?: string;
  lastExecutionTimestamp?: string | null;
  stalenessThresholdSeconds?: number;
  reconciliationState?: 'reconciled' | 'reconciling' | 'break';
}

export interface CoOwnOrderBookSnapshot {
  bids: CoOwnOrderBookEntry[];
  asks: CoOwnOrderBookEntry[];
  snapshotSequence: number;
  eventSequence: number;
  serverTimestamp: string;
  lastExecutionTimestamp: string | null;
  stalenessThresholdSeconds: number;
  reconciliationState: 'reconciled' | 'reconciling' | 'break';
  source: 'live' | 'development-fallback';
}

export interface MarketCoOwnExecution {
  id: number;
  assetId: string;
  units: number;
  unitPriceGbp: number;
  notionalGbp: number;
  executedAt: string;
}

interface ListCoOwnExecutionsResponse {
  ok: true;
  serverTimestamp: string;
  items: MarketCoOwnExecution[];
}

export async function fetchCoOwnOrderBook(
  assetId: string,
  options: { limit?: number } = {}
): Promise<CoOwnOrderBookSnapshot> {
  const query = toQuery({ limit: options.limit });
  try {
    const payload = await fetchJson<GetCoOwnOrderBookResponse>(
      `/co-own/assets/${encodeURIComponent(assetId)}/orderbook${query}`
    );
    return {
      bids: payload.bids,
      asks: payload.asks,
      snapshotSequence: payload.snapshotSequence ?? 0,
      eventSequence: payload.eventSequence ?? payload.snapshotSequence ?? 0,
      serverTimestamp: payload.serverTimestamp ?? '',
      lastExecutionTimestamp: payload.lastExecutionTimestamp ?? null,
      stalenessThresholdSeconds: payload.stalenessThresholdSeconds ?? 30,
      reconciliationState: payload.reconciliationState ?? 'reconciling',
      source: 'live',
    };
  } catch (err) {
    if (ENABLE_RUNTIME_MOCKS) {
      console.warn('[marketApi] /co-own/orderbook failed — returning dev mock fallback:', err instanceof Error ? err.message : err);
      const mockAsset = getMockCoOwnAssets().find((a) => a.id === assetId);
      const basePrice = mockAsset?.unitPriceGbp ?? 50;
      const now = new Date().toISOString();
      return {
        bids: [
          { side: 'buy', unitPriceGbp: basePrice - 1, units: 8, orderCount: 3 },
          { side: 'buy', unitPriceGbp: basePrice - 2, units: 15, orderCount: 5 },
          { side: 'buy', unitPriceGbp: basePrice - 3, units: 22, orderCount: 7 },
        ],
        asks: [
          { side: 'sell', unitPriceGbp: basePrice + 1, units: 5, orderCount: 2 },
          { side: 'sell', unitPriceGbp: basePrice + 2, units: 12, orderCount: 4 },
          { side: 'sell', unitPriceGbp: basePrice + 3, units: 18, orderCount: 6 },
        ],
        snapshotSequence: 0,
        eventSequence: 0,
        serverTimestamp: now,
        lastExecutionTimestamp: null,
        stalenessThresholdSeconds: 30,
        reconciliationState: 'reconciling',
        source: 'development-fallback',
      };
    }
    throw err;
  }
}

export async function placeCoOwnOrder(
  assetId: string,
  input: PlaceCoOwnOrderInput
): Promise<PlaceCoOwnOrderResponse> {
  return fetchJson<PlaceCoOwnOrderResponse>(
    `/co-own/assets/${encodeURIComponent(assetId)}/orders`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}

// ── Order preview (authoritative server-side) ──
// Replaces the client-side generateSimulatedBook() with a server-side
// preview that walks the real order book. Non-binding — the actual order
// may differ if the book changes between preview and placement.

export interface CoOwnOrderPreviewInput {
  userId: string;
  side: CoOwnOrderSide;
  units: number;
  orderType?: 'market' | 'limit';
  limitPriceGbp?: number;
}

export interface CoOwnOrderPreviewResponse {
  ok: true;
  preview: {
    assetId: string;
    side: CoOwnOrderSide;
    units: number;
    orderType: 'market' | 'limit';
    limitPriceGbp: number | null;
    referencePriceGbp: number;
    orderPriceGbp: number;
    estimatedFill: {
      filledUnits: number;
      remainingUnits: number;
      avgFillPrice: number;
      worstPrice: number;
      grossNotional: number;
      slippageBeyondDepth: boolean;
    };
    fee: number;
    total: number;
    feeRate: number;
    availableUnits: number;
    totalUnits: number;
    eligibility: {
      allowed: boolean;
      code: string | null;
      message: string;
    };
    binding: boolean;
    validUntil: string;
  };
}

export async function previewCoOwnOrder(
  assetId: string,
  input: CoOwnOrderPreviewInput
): Promise<CoOwnOrderPreviewResponse> {
  return fetchJson<CoOwnOrderPreviewResponse>(
    `/co-own/assets/${encodeURIComponent(assetId)}/orders/preview`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}

// ── Order reservation ──
// Reserves funds (for buys) or units (for sells) for a pending order.
// The reservation holds the funds so a concurrent order cannot overspend.
// Reservations expire after 60s.

export interface CoOwnOrderReservationInput {
  userId: string;
  side: CoOwnOrderSide;
  units: number;
  orderType?: 'market' | 'limit';
  limitPriceGbp?: number;
  idempotencyKey?: string;
}

export interface CoOwnOrderReservationResponse {
  ok: true;
  reservation: {
    id: string;
    assetId: string;
    userId: string;
    side: CoOwnOrderSide;
    reserved1zeMg: number;
    reservedUnits: number;
    referencePriceGbp: number;
    estimatedTotalGbp: number;
    estimatedFeeGbp: number;
    expiresAt: string;
    status: 'active' | 'placed' | 'cancelled' | 'expired';
  };
}

export async function reserveCoOwnOrder(
  assetId: string,
  input: CoOwnOrderReservationInput
): Promise<CoOwnOrderReservationResponse> {
  return fetchJson<CoOwnOrderReservationResponse>(
    `/co-own/assets/${encodeURIComponent(assetId)}/orders/reserve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}

export async function cancelCoOwnOrderReservation(
  assetId: string,
  reservationId: string
): Promise<{ ok: true; reservationId: string }> {
  return fetchJson<{ ok: true; reservationId: string }>(
    `/co-own/assets/${encodeURIComponent(assetId)}/orders/reserve/${encodeURIComponent(reservationId)}`,
    { method: 'DELETE' }
  );
}

export async function cancelCoOwnOrder(
  assetId: string,
  orderId: number,
  userId: string
): Promise<{
  ok: true;
  order: { id: number; status: 'cancelled'; filledUnits: number; remainingUnits: 0 };
}> {
  return fetchJson(
    `/co-own/assets/${encodeURIComponent(assetId)}/orders/${orderId}/cancel`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    }
  );
}

// ── Settlement status ──
// Returns the settlement state of a user's trades. With atomic DvP, all
// trades are settled at execution time.

export type CoOwnSettlementStatus = 'pending' | 'settled' | 'failed' | 'reversed';

export interface CoOwnSettlement {
  id: string;
  assetId: string;
  buyerId: string;
  sellerId: string;
  units: number;
  unitPriceGbp: number;
  notionalGbp: number;
  feeGbp: number;
  settlementStatus: CoOwnSettlementStatus;
  settledAt: string | null;
  createdAt: string;
  role: 'buyer' | 'seller';
}

export interface CoOwnSettlementsResponse {
  ok: true;
  settlements: CoOwnSettlement[];
  nextCursor: string | null;
}

export async function fetchCoOwnSettlements(
  params: {
    userId: string;
    status?: CoOwnSettlementStatus;
    limit?: number;
    cursor?: string;
  }
): Promise<CoOwnSettlementsResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('userId', params.userId);
  if (params.status) searchParams.set('status', params.status);
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.cursor) searchParams.set('cursor', params.cursor);
  return fetchJson<CoOwnSettlementsResponse>(
    `/co-own/settlements?${searchParams.toString()}`
  );
}

export interface CreateCoOwnAssetInput {
  id?: string;
  listingId: string;
  issuerId: string;
  title?: string;
  imageUrl?: string;
  totalUnits: number;
  unitPriceGbp: number;
  unitPriceStable?: number;
  settlementMode?: 'GBP' | 'TVUSD' | 'HYBRID' | 'ONEZE';
  issuerJurisdiction?: string;
}

interface CreateCoOwnAssetResponse {
  ok: true;
  assetId: string;
}

export async function createCoOwnAsset(
  input: CreateCoOwnAssetInput
): Promise<CreateCoOwnAssetResponse> {
  return fetchJson<CreateCoOwnAssetResponse>(
    '/co-own/assets',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}

export async function createCoOwnBuyoutOffer(
  assetId: string,
  input: CreateCoOwnBuyoutOfferInput
): Promise<CreateCoOwnBuyoutOfferResponse> {
  return fetchJson<CreateCoOwnBuyoutOfferResponse>(
    `/co-own/assets/${encodeURIComponent(assetId)}/buyout-offers`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );
}

export async function listCoOwnAssetOrders(
  assetId: string,
  options: ListCoOwnAssetOrdersOptions = {}
): Promise<MarketCoOwnOrder[]> {
  const query = toQuery({
    limit: options.limit,
  });

  try {
    const payload = await fetchJson<ListCoOwnOrdersResponse>(
      `/co-own/assets/${encodeURIComponent(assetId)}/orders${query}`
    );
    return payload.items;
  } catch (err) {
    if (ENABLE_RUNTIME_MOCKS) {
      console.warn('[marketApi] /co-own/orders failed — returning dev mock fallback:', err instanceof Error ? err.message : err);
      const mockAsset = getMockCoOwnAssets().find((a) => a.id === assetId);
      const basePrice = mockAsset?.unitPriceGbp ?? 50;
      return [
        { id: 1, assetId, userId: 'mock-user-1', side: 'buy', units: 3, unitPriceGbp: basePrice, feeGbp: basePrice * 3 * 0.01, totalGbp: basePrice * 3 * 1.01, status: 'filled', createdAt: new Date(Date.now() - 120 * 60_000).toISOString() },
        { id: 2, assetId, userId: 'mock-user-2', side: 'sell', units: 2, unitPriceGbp: basePrice + 1, feeGbp: (basePrice + 1) * 2 * 0.01, totalGbp: (basePrice + 1) * 2 * 1.01, status: 'filled', createdAt: new Date(Date.now() - 90 * 60_000).toISOString() },
        { id: 3, assetId, userId: 'mock-user-3', side: 'buy', units: 5, unitPriceGbp: basePrice - 1, feeGbp: (basePrice - 1) * 5 * 0.01, totalGbp: (basePrice - 1) * 5 * 1.01, status: 'filled', createdAt: new Date(Date.now() - 60 * 60_000).toISOString() },
        { id: 4, assetId, userId: 'mock-user-4', side: 'buy', units: 1, unitPriceGbp: basePrice + 2, feeGbp: (basePrice + 2) * 0.01, totalGbp: (basePrice + 2) * 1.01, status: 'open', createdAt: new Date(Date.now() - 15 * 60_000).toISOString() },
      ] as MarketCoOwnOrder[];
    }
    throw err;
  }
}

export interface MarketCoOwnHolding {
  userId: string;
  assetId: string;
  unitsOwned: number;
  avgEntryPriceGbp: number;
  realizedPnlGbp: number;
  updatedAt: string;
}

interface ListCoOwnHoldingsResponse {
  ok: true;
  items: MarketCoOwnHolding[];
}

export async function fetchCoOwnHoldings(userId: string): Promise<MarketCoOwnHolding[]> {
  try {
    const payload = await fetchJson<ListCoOwnHoldingsResponse>(
      `/users/${encodeURIComponent(userId)}/co-own/holdings`
    );
    return payload.items;
  } catch (err) {
    if (ENABLE_RUNTIME_MOCKS) {
      console.warn('[marketApi] /co-own/holdings failed — returning dev mock fallback:', err instanceof Error ? err.message : err);
      return getMockCoOwnHoldings(userId);
    }
    throw err;
  }
}

export async function listUserMarketHistory(
  userId: string,
  options: ListUserMarketHistoryOptions = {}
): Promise<MarketHistoryPage> {
  const query = toQuery({
    channel: options.channel,
    limit: options.limit,
    cursorTs: options.cursorTs,
    cursorId: options.cursorId,
  });

  try {
    const payload = await fetchJson<ListUserMarketHistoryResponse>(
      `/users/${encodeURIComponent(userId)}/market-history${query}`
    );

    return {
      items: payload.items,
      pageInfo: payload.pageInfo,
    };
  } catch (err) {
    if (ENABLE_RUNTIME_MOCKS) {
      console.warn('[marketApi] /market-history failed — returning dev mock fallback:', err instanceof Error ? err.message : err);
      const mockItems: MarketHistoryItem[] = [
        { id: 'mock-hist-1', channel: 'co-own', action: 'buy-units', referenceId: 'mock-coown-1', amountGbp: 255, units: 3, unitPriceGbp: 85, feeGbp: 2.55, status: 'filled', orderType: 'market', note: null, timestamp: new Date(Date.now() - 120 * 60_000).toISOString() },
        { id: 'mock-hist-2', channel: 'co-own', action: 'buy-units', referenceId: 'mock-coown-2', amountGbp: 360, units: 2, unitPriceGbp: 180, feeGbp: 3.60, status: 'filled', orderType: 'limit', note: null, timestamp: new Date(Date.now() - 300 * 60_000).toISOString() },
        { id: 'mock-hist-3', channel: 'co-own', action: 'sell-units', referenceId: 'mock-coown-2', amountGbp: 185, units: 1, unitPriceGbp: 185, feeGbp: 1.85, status: 'filled', orderType: 'market', note: null, timestamp: new Date(Date.now() - 600 * 60_000).toISOString() },
        { id: 'mock-hist-4', channel: 'co-own', action: 'buy-units', referenceId: 'mock-coown-5', amountGbp: 285, units: 3, unitPriceGbp: 95, feeGbp: 2.85, status: 'filled', orderType: 'market', note: null, timestamp: new Date(Date.now() - 1440 * 60_000).toISOString() },
      ];
      return { items: mockItems, pageInfo: { hasMore: false } };
    }
    throw err;
  }
}

export async function listCoOwnExecutions(
  assetId: string,
  options?: { limit?: number }
): Promise<ListCoOwnExecutionsResponse> {
  return fetchJson<ListCoOwnExecutionsResponse>(
    `/co-own/assets/${encodeURIComponent(assetId)}/executions${toQuery({ limit: options?.limit ?? 200 })}`
  );
}
