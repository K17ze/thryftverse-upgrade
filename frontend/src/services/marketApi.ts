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

export type CoOwnSettlementMode = 'GBP' | 'TVUSD' | 'HYBRID';

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

export async function listCoOwnAssets(
  options: ListCoOwnAssetsOptions = {}
): Promise<MarketCoOwnAsset[]> {
  const query = toQuery({
    openOnly: options.openOnly,
    issuerId: options.issuerId,
    limit: options.limit,
  });
  const payload = await fetchJson<ListCoOwnAssetsResponse>(`/co-own/assets${query}`);
  return payload.items;
}

interface GetCoOwnAssetResponse {
  ok: true;
  item: MarketCoOwnAsset;
}

export async function fetchCoOwnAssetById(assetId: string): Promise<MarketCoOwnAsset> {
  const payload = await fetchJson<GetCoOwnAssetResponse>(
    `/co-own/assets/${encodeURIComponent(assetId)}`
  );
  return payload.item;
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
}

export async function fetchCoOwnOrderBook(
  assetId: string,
  options: { limit?: number } = {}
): Promise<{ bids: CoOwnOrderBookEntry[]; asks: CoOwnOrderBookEntry[] }> {
  const query = toQuery({ limit: options.limit });
  const payload = await fetchJson<GetCoOwnOrderBookResponse>(
    `/co-own/assets/${encodeURIComponent(assetId)}/orderbook${query}`
  );
  return { bids: payload.bids, asks: payload.asks };
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

export interface CreateCoOwnAssetInput {
  id?: string;
  listingId: string;
  issuerId: string;
  title?: string;
  imageUrl?: string;
  totalUnits: number;
  unitPriceGbp: number;
  unitPriceStable?: number;
  settlementMode?: 'GBP' | 'TVUSD' | 'HYBRID';
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

  const payload = await fetchJson<ListCoOwnOrdersResponse>(
    `/co-own/assets/${encodeURIComponent(assetId)}/orders${query}`
  );

  return payload.items;
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
  const payload = await fetchJson<ListCoOwnHoldingsResponse>(
    `/users/${encodeURIComponent(userId)}/co-own/holdings`
  );
  return payload.items;
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

  const payload = await fetchJson<ListUserMarketHistoryResponse>(
    `/users/${encodeURIComponent(userId)}/market-history${query}`
  );

  return {
    items: payload.items,
    pageInfo: payload.pageInfo,
  };
}