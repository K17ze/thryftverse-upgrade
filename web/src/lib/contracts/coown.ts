/**
 * Co-Own contracts — fractional ownership traded like a market.
 * Ported from the mobile platform: services/coownV2Contract.ts,
 * services/marketApi.ts (MarketCoOwnAsset), utils/tradeFlow.ts.
 *
 * Monetary values arrive as exact decimal strings on the wire (v2
 * contract). The web layer parses once at the data boundary and works
 * in numbers; trade math uses integer minor units (see utils/trade.ts).
 */

// ── Asset ─────────────────────────────────────────────────────────────

export type CoOwnSettlementMode = 'ONEZE';

/** Backend lifecycle — offering stage. */
export type CoOwnOfferingStatus = 'offering' | 'allocated' | 'failed' | 'closed';
/** Backend lifecycle — secondary-market stage. */
export type CoOwnMarketStatus = 'pre_market' | 'trading' | 'paused' | 'closed';

export interface CoOwnIssuer {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  location: string | null;
  /** WS2 tiered verification — fail closed, no badge when null. */
  verificationTier: 'email' | 'id' | 'seller' | null;
}

export interface CoOwnAsset {
  id: string;
  listingId: string | null;
  issuer: CoOwnIssuer;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  category: string;
  totalUnits: number;
  availableUnits: number;
  unitPriceGbp: number;
  settlementMode: CoOwnSettlementMode;
  issuerJurisdiction: string | null;
  marketMovePct24h: number | null;
  holders: number;
  volume24hGbp: number | null;
  /** Top-of-book; null price means no orders on that side. */
  bestBidGbp: number | null;
  bestAskGbp: number | null;
  bidDepthUnits: number;
  askDepthUnits: number;
  offeringStatus: CoOwnOfferingStatus;
  marketStatus: CoOwnMarketStatus;
  /** Custody/provenance one-liner shown in the dossier. */
  custodyNote: string | null;
  createdAt: string;
}

/**
 * Asset lifecycle — derived with the mobile's priority:
 * marketStatus → offeringStatus → isOpen/availableUnits fallback.
 */
export type AssetLifecycleState =
  | 'initialOffering'
  | 'secondaryTrading'
  | 'tradingPaused'
  | 'exitUnderway';

export function deriveLifecycleState(asset: CoOwnAsset): AssetLifecycleState {
  if (asset.offeringStatus === 'failed') return 'tradingPaused';
  switch (asset.marketStatus) {
    case 'closed':
      return 'exitUnderway';
    case 'paused':
      return 'tradingPaused';
    case 'trading':
      return 'secondaryTrading';
    case 'pre_market':
      return 'initialOffering';
  }
  switch (asset.offeringStatus) {
    case 'offering':
      return 'initialOffering';
    case 'allocated':
    case 'closed':
      return 'secondaryTrading';
  }
  return asset.availableUnits > 0 ? 'initialOffering' : 'secondaryTrading';
}

// ── Order book ────────────────────────────────────────────────────────

export interface OrderBookLevel {
  side: 'buy' | 'sell';
  unitPriceGbp: number;
  units: number;
  orderCount: number;
}

export interface OrderBookSnapshot {
  assetId: string;
  bids: OrderBookLevel[]; // descending price
  asks: OrderBookLevel[]; // ascending price
  serverTime: string;
  source: 'live' | 'fallback';
  reconciliationState: 'reconciled' | 'stale';
}

// ── Price history ─────────────────────────────────────────────────────

export interface CandlePoint {
  /** Unix ms. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type PriceWindow = '1D' | '1W' | '1M' | 'ALL';

// ── Trade flow ────────────────────────────────────────────────────────

export type TradeSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'protected_market';
export type OrderDuration = 'day' | 'gtc';

export interface FillEstimate {
  filledUnits: number;
  remainingUnits: number;
  avgFillPriceGbp: number;
  worstPriceGbp: number;
}

export interface TradeQuote {
  side: TradeSide;
  orderType: OrderType;
  units: number;
  limitPriceGbp: number | null;
  referencePriceGbp: number;
  orderPriceGbp: number;
  estimate: FillEstimate | null;
  grossNotionalGbp: number;
  feeGbp: number;
  totalGbp: number;
}

export interface FeeSchedule {
  rate: number;
  fixed: number;
}

export interface CoOwnOrder {
  id: string;
  assetId: string;
  side: TradeSide;
  orderType: OrderType;
  unitPriceGbp: number;
  units: number;
  filledUnits: number;
  status: 'open' | 'filled' | 'partially_filled' | 'cancelled';
  feeGbp: number;
  totalGbp: number;
  placedAt: string;
}

// ── Positions & portfolio ─────────────────────────────────────────────

export interface CoOwnPosition {
  assetId: string;
  units: number;
  avgEntryPriceGbp: number;
  /** Settled cash proceeds awaiting withdrawal from partial exits. */
  realizedProfitGbp: number;
}

export interface ActivityEvent {
  id: string;
  assetId: string;
  kind: 'buy' | 'sell' | 'listing' | 'distribution' | 'corporate_action';
  actorUsername: string | null;
  units: number | null;
  unitPriceGbp: number | null;
  note: string | null;
  at: string;
}

// ── Income & governance ───────────────────────────────────────────────

export interface Distribution {
  id: string;
  assetId: string;
  kind: 'rental_income' | 'resale_gain' | 'licensing';
  amountPerUnitGbp: number;
  totalPotGbp: number;
  status: 'paid' | 'scheduled';
  paidAt: string | null;
  scheduledFor: string;
}

export interface CorporateAction {
  id: string;
  assetId: string;
  kind: 'sale_vote' | 'insurance_renewal' | 'authentication' | 'exit';
  title: string;
  description: string;
  closesAt: string;
  status: 'open' | 'passed' | 'rejected' | 'pending_tally';
  yourVote: 'for' | 'against' | null;
  votesFor: number;
  votesAgainst: number;
}

// ── Watchlist & alerts ────────────────────────────────────────────────

export interface PriceAlert {
  id: string;
  assetId: string;
  direction: 'above' | 'below';
  targetPriceGbp: number;
  active: boolean;
}

/** An alert as the client stores it — wire shape plus local lifecycle. */
export interface StoredPriceAlert extends PriceAlert {
  createdAt: string;
}

// ── Due diligence ─────────────────────────────────────────────────────

export type DiligenceDocKind =
  | 'authentication'
  | 'condition'
  | 'custody'
  | 'insurance'
  | 'appraisal';

export interface DiligenceDocument {
  id: string;
  assetId: string;
  title: string;
  kind: DiligenceDocKind;
  /** Issuing lab, custodian or underwriter. */
  issuer: string;
  /** ISO date. */
  issuedAt: string;
  /** Independently verified on-chain record — fails closed when false. */
  verified: boolean;
}

/** The trust layer for one asset — what collectors check before buying. */
export interface DueDiligenceProfile {
  assetId: string;
  authenticatedBy: string | null;
  /** ISO date of the last successful authentication; null while pending. */
  authenticatedAt: string | null;
  conditionGrade: string | null;
  conditionSummary: string | null;
  documents: DiligenceDocument[];
}

// ── Market ledger ─────────────────────────────────────────────────────

/** A public tape print — counterparties masked, one row per execution. */
export interface TradeLedgerEntry {
  id: string;
  assetId: string;
  side: TradeSide;
  units: number;
  unitPriceGbp: number;
  executedAt: string;
}

// ── Buyout offers ─────────────────────────────────────────────────────
// Ported from mobile BuyoutScreen (services/marketApi.ts
// MarketCoOwnBuyoutOffer): a bidder posts a per-unit price for the units
// they don't hold; holders accept partial quantities against the target.
// 'expired' is derived at render from expiresAt — never stored.

export type CoOwnBuyoutOfferStatus = 'open' | 'filled' | 'withdrawn';

export interface CoOwnBuyoutOffer {
  id: string;
  assetId: string;
  bidderUsername: string;
  /** Fixture-mode identity — true when the viewer placed the offer. */
  mine: boolean;
  offerPriceGbp: number;
  /** Units the bidder wants to acquire across all holders. */
  targetUnits: number;
  /** Units holders have already committed against the offer. */
  acceptedUnits: number;
  status: CoOwnBuyoutOfferStatus;
  expiresAt: string;
  createdAt: string;
}

// ── Issue reports ─────────────────────────────────────────────────────
// Ported from mobile CoOwnIssueScreen: a holder or watcher flags a
// problem on one asset — dispute, technical, fraud or other. The
// submitted case returns a reference id for follow-up.

export type CoOwnIssueCategory = 'dispute' | 'technical' | 'fraud' | 'other';

export interface CoOwnIssueReport {
  id: string;
  assetId: string;
  category: CoOwnIssueCategory;
  description: string;
  createdAt: string;
}

// ── Distribution receipts (viewer's income history) ───────────────────

/** One income line per distribution the viewer was entitled to. */
export interface DistributionReceipt {
  id: string;
  assetId: string;
  kind: Distribution['kind'];
  amountPerUnitGbp: number;
  /** Units the viewer held on the ex-date snapshot. */
  unitsHeld: number;
  totalGbp: number;
  /** ISO date — entitlement snapshot. */
  exDate: string;
  paidAt: string | null;
  status: 'paid' | 'scheduled';
}
