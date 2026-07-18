export type CoOwnedAssetStatus = 'offering' | 'active' | 'buyout_pending' | 'delisted';

export interface CoOwnedAsset {
  id: string;
  listingId: string;
  sellerId: string;
  title: string;
  image: string;
  totalShares: number;
  availableShares: number;
  initialPricePerShare: number;
  currentPricePerShare: number;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  status: CoOwnedAssetStatus;
  authPhotos: string[];
  createdAt: string;
  offeringEndsAt: string;
}

export interface ShareHolding {
  id: string;
  userId: string;
  assetId: string;
  sharesOwned: number;
  averageBuyPrice: number;
  currentValue: number;
  unrealizedPnL: number;
  percentageOfTotal: number;
}

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';

/**
 * Full order lifecycle state machine per spec 10 §2.1-2.2.
 *
 *   draft → submitted → accepted → open → partial → filled
 *                                            ├── cancel_pending → cancelled
 *                                            └── (market halt) → halted_open → [reopen or cancelled]
 *   submitted → rejected          (validation fail)
 *   accepted  → rejected          (pre-trade risk fail)
 *   open      → expired           (GFD end-of-session / GTT timeout)
 *
 * Terminal states: filled, cancelled, expired, rejected (immutable).
 */
export type OrderStatus =
  | 'draft'
  | 'submitted'
  | 'accepted'
  | 'open'
  | 'partial'
  | 'filled'
  | 'cancel_pending'
  | 'cancelled'
  | 'replace_pending'
  | 'halted_open'
  | 'expired'
  | 'rejected';

/**
 * Settlement lifecycle per spec 10 §3.1.
 *
 *   matched → confirmed → settlement_pending → settled
 *                │              ├── settlement_failed → [retry or reversed]
 *                └── broken     └── reversed
 *                                   └── corrected (compensating entries)
 *
 * "Executed" = matched/confirmed/settlement_pending (not yet owned).
 * "Owned" = settled (legally/economically effective).
 */
export type TradeSettlementStatus =
  | 'matched'
  | 'confirmed'
  | 'settlement_pending'
  | 'settled'
  | 'settlement_failed'
  | 'reversed'
  | 'corrected'
  | 'broken';

export interface TradeOrder {
  id: string;
  userId: string;
  assetId: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  pricePerShare: number;
  totalAmount: number;
  fee: number;
  status: OrderStatus;
  filledQuantity: number;
  createdAt: string;
  filledAt?: string;
  /** Settlement lifecycle per spec 10 §3.1. Optional — fail closed when backend doesn't expose. */
  settlementStatus?: TradeSettlementStatus;
  /** Settled quantity vs pending settlement (spec 10 §3.5). settledQty + pendingSettlementQty = filledQuantity. */
  settledQty?: number;
  pendingSettlementQty?: number;
  /** Idempotency key supplied by client (spec 10 §1). */
  idempotencyKey?: string;
  /** Rejection reason if status === 'rejected'. */
  rejectionReason?: string;
}

export interface OrderBookEntry {
  price: number;
  quantity: number;
  side: 'bid' | 'ask';
  orderCount: number;
}

export interface PricePoint {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Wallet {
  userId: string;
  izeBalance: number;
  fiatBalance: number;
  totalPortfolioValue: number;
  lockedBalance: number;
}

export type WalletTransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'trade_buy'
  | 'trade_sell'
  | 'fee'
  | 'buyout';

export interface WalletTransaction {
  id: string;
  userId: string;
  type: WalletTransactionType;
  amount: number;
  currency: '1ze' | 'GBP' | 'USD' | 'EUR';
  relatedOrderId?: string;
  relatedAssetId?: string;
  createdAt: string;
}

export interface BuyoutOffer {
  id: string;
  assetId: string;
  buyerId: string;
  sharesOwned: number;
  sharesNeeded: number;
  offerPricePerShare: number;
  totalCost: number;
  status: 'draft' | 'open' | 'accepted' | 'expired' | 'cancelled';
  expiresAt: string;
}

// ============================================================================
// EXCHANGE MODEL EXTENSIONS — Phase 0 truth scaffolding
// These types extend the display model so the UI can render exchange-grade
// facts truthfully, failing closed ("—" / "Not available") where the backend
// does not yet expose them. The existing CoOwnedAsset.currentPricePerShare
// is deprecated — kept temporarily for migration, not rendered.
// See docs/coown/flagship-exchange-upgrade/01 + 05 + 10.
// ============================================================================

/** Market mode — the venue state, not the asset lifecycle. */
export type CoOwnMarketMode = 'continuous' | 'call_auction' | 'rfq' | 'halted' | 'closed';

/** Reconciliation state — governs whether money movement is safe. */
export type CoOwnReconciliationState = 'reconciled' | 'reconciling' | 'break';

/** A single price level in the order book. */
export interface CoOwnBookLevel {
  price: number;
  size: number;
  orderCount?: number;
  cumulative?: number;
}

/** Market data with sequencing — prevents inconsistent book/last renders. */
export interface CoOwnMarketData {
  // Sequencing — mandatory on every snapshot (audit blocker 4)
  marketId: string;
  instrumentId: string;
  snapshotSequence: number;
  lastEventSequence: number;
  serverTimestamp: string;
  dataAgeSeconds: number;
  stalenessThresholdSeconds: number;
  reconciliationState: CoOwnReconciliationState;

  // Price facts — all optional; missing = "—" in the UI
  last?: { price: number; executedAt: string };
  bestBid?: { price: number; size: number };
  bestAsk?: { price: number; size: number };
  spread?: number;
  spreadBps?: number;
  mid?: number;
  depthWithin2Pct?: number;
  turnover24h?: number;
  change24h?: { pct: number; referencePrice: number; windowStart: string };
  officialClose?: { price: number; closedAt: string };
  indicativeAuctionPrice?: number;

  // Market microstructure
  tickSize: number;
  lotSize: number;
  tradingSessionState: CoOwnMarketMode;
}

/** Valuation provenance — every displayed valuation exposes its source. */
export interface CoOwnValuation {
  navPerUnit?: number;
  valuedAt: string;
  method: string;
  valuer?: string;
  rangeLow?: number;
  rangeHigh?: number;
  nextScheduled?: string;
}

/** Market state — session, halt, disclosure. */
export interface CoOwnMarketState {
  mode: CoOwnMarketMode;
  sessionLabel: string;
  countdownSeconds?: number | null;
  haltReason?: string;
  nextSessionAt?: string;
  tickSize: number;
  lotSize: number;
  priceBandPct: number;
  disclosureVersion: string;
}

/** 1ZE balance — nonnegative buckets with strict invariant.
 *  withdrawable ≤ available ≤ settledCustomerClaim
 *  settledCustomerClaim = available + reservedForOrders + redemptionInProgress + otherHolds
 *  Pending deposits/proceeds are separate, not in settled claim. */
export interface CoOwn1ZeBalance {
  // Settled claim (safeguarded) — nonnegative buckets
  available: number;
  reservedForOrders: number;
  redemptionInProgress: number;
  otherHolds: number;
  settledCustomerClaim: number;

  // Pending — separate, not part of settled claim until settled
  pendingDeposit: number;
  unsettledSaleProceeds: number;

  // Derived
  withdrawable: number;

  // Trust
  safeguarded: boolean;
  safeguardingPartner?: string;

  // Sequencing
  snapshotSequence: number;
  serverTimestamp: string;
  reconciliationState: CoOwnReconciliationState;
}

/** Position state — settled/reserved/pending split.
 *  These are states of existing issued units, not separate supply buckets.
 *  invariant: settled + reservedForSale + pendingIn + pendingOut ≤ issuedUnits */
export interface CoOwnPositionState {
  settled: number;
  reservedForSale: number;
  pendingIn: number;
  pendingOut: number;
  outstandingUnits: number;
}

/** Rights row — each must have an answer for live instruments.
 *  "To be confirmed" only for prelaunch preview; blocks trading on live. */
export interface CoOwnRightsRow {
  key: string;
  label: string;
  answer: string;
  documentUrl?: string;
  isTbc: boolean;
}

/** Rights version — the disclosure version accepted by the user. */
export interface CoOwnRightsVersion {
  version: string;
  effectiveDate: string;
  acceptedByUser: boolean;
  rows: CoOwnRightsRow[];
}