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

/** Server-computed command capabilities for the asset's current market
 *  state (list + detail payloads). The command endpoints enforce the
 *  same policy — these gates only shape the UI early. */
export interface CoOwnCapabilities {
  buy: boolean;
  sell: boolean;
  cancel: boolean;
  buyoutAccept: boolean;
  vote: boolean;
}

/** GET /co-own/assets/:id → item.marketSnapshot — freshness + provenance
 *  for the market figures. `sourceAsOf` is the newest timestamp the
 *  snapshot's sources report (not the response assembly time), and
 *  `connectionStatus` is the server's live/stale/closed verdict. Detail
 *  reads only — absent on list items and fixtures. */
export interface CoOwnMarketSnapshot {
  asOf: string;
  sourceAsOf: string;
  connectionStatus: 'live' | 'stale' | 'closed';
  lastExecutionPriceGbp: number | null;
  lastExecutionAt: string | null;
  volume24hGbp: number | null;
  marketMovePct24h: number | null;
  bestBidGbp: number | null;
  bestAskGbp: number | null;
}

/** GET /co-own/assets/:id → item.rights — the published rights sheet:
 *  what a unit actually entitles the holder to. Versioned; null fields
 *  mean that class of rights is silent in the published version. */
export interface CoOwnAssetRights {
  version: number;
  rightsType: string;
  jurisdiction: string;
  governingLaw: string | null;
  summaryTerms: string;
  transferable: boolean;
  minHoldingUnits: number;
  economicRights: string | null;
  votingRights: string | null;
  exitRights: string | null;
  feeRights: string | null;
}

/** GET /co-own/assets/:id → item.riskDisclosures — the published
 *  per-asset risk text. Distinct from the platform risk_disclosure
 *  legal document (the consent gate) — this is the asset's own risk
 *  narrative under the dossier. */
export interface CoOwnRiskDisclosures {
  marketRisk: string | null;
  liquidityRisk: string | null;
  custodyRisk: string | null;
  regulatoryRisk: string | null;
  counterpartyRisk: string | null;
  otherRisks: string | null;
  publishedAt: string;
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
  /** Issuance price — the primary-pool reference. Not the market mark
   *  once secondary trading has printed; use `coOwnMarkGbp` for that. */
  unitPriceGbp: number;
  /** Issuance price in the settlement stable (1ZE) — list/detail wire
   *  field; absent under fixtures. */
  unitPriceStable?: number | null;
  /** Most recent settled secondary-trade price — the real market mark.
   *  Null until the market has printed. */
  lastTradePriceGbp?: number | null;
  /** Server-computed command capabilities — list/detail wire field. */
  capabilities?: CoOwnCapabilities | null;
  /** Detail read only — freshness/provenance for the market figures. */
  marketSnapshot?: CoOwnMarketSnapshot | null;
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
  /** Detail-endpoint dossier fields — absent on list reads and
   *  fixtures; render nothing rather than inventing terms. */
  rights?: CoOwnAssetRights | null;
  riskDisclosures?: CoOwnRiskDisclosures | null;
  dossier?: CoOwnAssetDossier;
  createdAt: string;
}

/** The mark surfaces should quote: the last settled secondary trade where
 *  the market has printed, otherwise the issuance unit price. Never shows
 *  a stale issuance price as "last" once real trades exist. */
export function coOwnMarkGbp(asset: {
  lastTradePriceGbp?: number | null;
  unitPriceGbp: number;
}): number {
  return asset.lastTradePriceGbp != null && asset.lastTradePriceGbp > 0
    ? asset.lastTradePriceGbp
    : asset.unitPriceGbp;
}

/** Trust dossier rows the detail endpoint emits — custody, authenticity,
 *  appraisal, protection. Every field is optional and rendered only
 *  when present; null on the wire means "not on file". */
export interface CoOwnAssetDossier {
  authenticityStatus: 'unverified' | 'pending' | 'verified' | null;
  authenticityMethod: string | null;
  authenticityVerifiedAt: string | null;
  conditionGrade: string | null;
  provenance: string | null;
  custodianName: string | null;
  custodianLocation: string | null;
  custodyInsured: boolean | null;
  custodyInsurer: string | null;
  custodyCoverageGbp: number | null;
  appraisalValueGbp: number | null;
  appraisalValuedAt: string | null;
  appraisalValuer: string | null;
  buyerProtection: string | null;
  escrowPartner: string | null;
  safeguardingPartner: string | null;
  legalVehicleName: string | null;
  legalVehicleType: string | null;
  legalVehicleJurisdiction: string | null;
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
  /** Backend book-health verdict — 'reconciled' is canonical,
   *  'reconciling' means a halt/settlement sync is in flight,
   *  'break' means the delta chain broke and a resnapshot is pending. */
  reconciliationState: 'reconciled' | 'reconciling' | 'break';
  /** Monotonic book-version markers — the realtime client compares
   *  incoming deltas against these to detect gaps. Absent on fixture
   *  snapshots and cache writes. */
  snapshotSequence?: number;
  eventSequence?: number;
  lastExecutionTimestamp?: string | null;
  /** Seconds of silence after which the backend considers the book
   *  stale — drives the reconciliation banner's honesty. */
  stalenessThresholdSeconds?: number;
  /** The per-side level caps the server applied to this snapshot — the
   *  ladder is truncated at these bounds, so surfaces can say so rather
   *  than implying the visible depth is the whole book. */
  depthLimits?: { bid: number; ask: number };
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
  /** Time-in-force for the resting remainder (limit orders only);
   *  'day' → GFD, 'gtc' → GTC90 on the wire. Absent on market fills. */
  duration?: OrderDuration;
  placedAt: string;
}

// ── Positions & portfolio ─────────────────────────────────────────────

export interface CoOwnPosition {
  assetId: string;
  units: number;
  avgEntryPriceGbp: number;
  /** Realised cash P&L. The live `/co-own/portfolio` projection does not
   *  carry a realised figure — null means "not reported", never a
   *  fabricated zero. Fixture/session rows write real values. */
  realizedProfitGbp: number | null;

  // ── Live projection fields (GET /co-own/portfolio) — absent on
  //    fixture/session rows; render nothing rather than inventing. ──
  title?: string;
  imageUrl?: string | null;
  /** Units not locked by live sell orders or reservations — the real
   *  sell-side cap. `units` overstates it while orders are resting. */
  sellableUnits?: number;
  /** The server's mark price and where it came from. */
  markPriceGbp?: number | null;
  markBasis?: 'last_trade' | 'reference' | 'offering' | 'none';
  markTimestamp?: string | null;
  marketValueGbp?: number | null;
  costBasisGbp?: number;
  unrealisedPnlGbp?: number | null;
  marketStatus?: string;
  offeringStatus?: string;
  /** Some units are locked by live orders/reservations. */
  partialLiquidity?: boolean;
  lockupEndDate?: string | null;
}

export interface ActivityEvent {
  id: string;
  assetId: string;
  /** 'buy'/'sell' exist for fixture-authored events only — no live wire
   *  carries an aggressor side (the executions tape is a side-less match
   *  print). 'trade' is the honest kind for live prints. */
  kind: 'buy' | 'sell' | 'trade' | 'listing' | 'distribution' | 'corporate_action';
  actorUsername: string | null;
  units: number | null;
  unitPriceGbp: number | null;
  note: string | null;
  at: string;
}

// ── Income & governance ───────────────────────────────────────────────

/** Backend wire vocabulary for coown_distributions.status (migration
 *  279). `settled` is the paid-out state — the UI label still reads
 *  "Paid". The column is free TEXT on the wire, so the open tail keeps
 *  an unexpected status assignable rather than collapsing it into a
 *  friendly-but-wrong state; label lookups must fall back honestly. */
export type DistributionStatus =
  | 'scheduled'
  | 'pending'
  | 'settled'
  | 'reversed'
  | 'reinvested'
  | 'reinvest_failed'
  | 'retained_cash'
  | (string & {});

export interface Distribution {
  id: string;
  assetId: string;
  kind: 'rental_income' | 'resale_gain' | 'licensing' | 'revenue_share' | 'dividend' | 'other';
  /** The wire `distribution_type` verbatim — the label source for
   *  kinds the UI doesn't name ('other'). */
  rawType?: string;
  amountPerUnitGbp: number;
  totalPotGbp: number;
  /** Units the recipient held at the record-date snapshot — live wire
   *  only; the receipt total derives from this when present. */
  unitsAtRecord?: number;
  status: DistributionStatus;
  /** Wire `settledAt` — null until the distribution actually settles. */
  paidAt: string | null;
  /** Best known payable/record date — `projectedPayableDate`, then
   *  `exDate`, then `createdAt`; never null on live reads. */
  scheduledFor: string;
  /** Wire `exDate` verbatim — null stays null, never a NaN date. */
  exDate?: string | null;
}

/** Per-asset payout facts for anonymous callers — the public aggregates
 *  the distributions endpoint returns instead of per-recipient rows. */
export interface CoOwnDistributionAggregate {
  assetId: string;
  totalDistributedGbp: number;
  distributionCount: number;
  latestPerUnitGbp: number | null;
  latestDistributionAt: string | null;
}

/** Ballot choices — the wire carries 'abstain' too (mobile
 *  castGovernanceVote); it maps to no seat change but still counts
 *  toward quorum. */
export type VoteChoice = 'for' | 'against' | 'abstain';

/** Backend wire vocabulary for coown_corporate_actions.status —
 *  'announced' is the insert default; 'executing'/'completed' mark a
 *  passed resolution in flight/done. Free TEXT on the wire, so the open
 *  tail keeps an unexpected status truthful instead of crashing or
 *  mapping it to a friendly-wrong badge; label lookups fall back to the
 *  humanized raw value. 'pending_tally' is NOT a wire state — a ballot
 *  past its deadline is still 'open' until an outcome is recorded. */
export type CorporateActionStatus =
  | 'announced'
  | 'open'
  | 'executing'
  | 'executed'
  | 'completed'
  | 'passed'
  | 'rejected'
  | 'cancelled'
  | (string & {});

export interface CorporateAction {
  id: string;
  assetId: string;
  kind:
    | 'sale_vote'
    | 'insurance_renewal'
    | 'authentication'
    | 'exit'
    | 'governance'
    | 'buyback'
    | 'dividend'
    | 'split'
    | 'other';
  /** The wire `actionType` verbatim — the label source for 'other'. */
  actionType: string;
  title: string;
  description: string;
  /** Voting deadline — ISO timestamp. */
  closesAt: string;
  status: CorporateActionStatus;
  yourVote: VoteChoice | null;
  /** Units of voting power tallied per side. */
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  /** Units that must vote for the ballot to count — null when the
   *  resolution carries no quorum rule. Fails closed: never invented. */
  quorumUnits: number | null;
  /** Share of votes cast needed to pass (0–100) — null when unset. */
  passThresholdPct: number | null;
  /** Cash value per unit if the resolution passes — null when the
   *  action carries no per-unit figure. */
  perUnitValueGbp: number | null;
  /** Total pot/resolution value — null when absent from the record. */
  totalValueGbp: number | null;
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

/** The trust layer for one asset — what collectors check before buying.
 *  Optional fields are detail-endpoint dossier rows the live wire
 *  carries; fixtures leave them absent and the UI omits the line. */
export interface DueDiligenceProfile {
  assetId: string;
  authenticatedBy: string | null;
  /** ISO date of the last successful authentication; null while pending. */
  authenticatedAt: string | null;
  conditionGrade: string | null;
  conditionSummary: string | null;
  documents: DiligenceDocument[];
  /** Wire dossier (live detail endpoint) — custody, authenticity,
   *  appraisal, protection rows. Absent under fixtures. */
  dossier?: CoOwnAssetDossier;
}

// ── Market ledger ─────────────────────────────────────────────────────

/** A public tape print — counterparties masked, one row per execution.
 *  `side` is null on live wire data: the executions feed deliberately
 *  carries no aggressor direction (a print is a match between both
 *  sides), so render a price-tick direction instead of a Buy/Sell label.
 *  Fixture prints may carry an authored side. */
export interface TradeLedgerEntry {
  id: string;
  assetId: string;
  side: TradeSide | null;
  units: number;
  unitPriceGbp: number;
  executedAt: string;
  /** Wire `settlement_status` — 'settled' | 'failed' | 'reversed' on live
   *  reads. A non-settled print is rendered as such, never silently
   *  treated as money that moved. */
  settlementStatus?: string;
  /** Wire `notional_gbp` — the matched value as the ledger recorded it. */
  notionalGbp?: number;
  /** Wire `failure_reason` — why a failed print didn't clear. */
  failureReason?: string | null;
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
  /** The wire `distributionType` verbatim — label source for 'other'. */
  rawType?: string;
  amountPerUnitGbp: number;
  /** Units the viewer held on the ex-date snapshot. */
  unitsHeld: number;
  totalGbp: number;
  /** ISO date — entitlement snapshot. */
  exDate: string;
  paidAt: string | null;
  status: DistributionStatus;
}

// ── Recourse (holder protection) ──────────────────────────────────────
// Mirrors the mobile AssetDueDiligence recourse panel — the signed
// agreement terms, the seller's liability profile, outstanding
// verification demands and the visible recourse event trail.
// GET /co-own/assets/:assetId/recourse — authenticated; fails closed.

export interface CoOwnRecourseAgreement {
  id: string;
  version: number;
  signedAt: string;
  maxLiabilityGbp: number;
  personalGuarantee: boolean;
  /** Backend lifecycle — 'active' | 'triggered' | 'settled' | … */
  status: string;
  triggeredAt: string | null;
  triggeredReason: string | null;
  settledAt: string | null;
  settledAmountGbp: number | null;
}

export interface CoOwnSellerLiability {
  totalActiveLiabilityGbp: number;
  activeAgreementCount: number;
  totalAgreementsSigned: number;
  totalRecourseTriggered: number;
  totalDebtRecoveredGbp: number;
  riskTier: string;
  backgroundCheckStatus: string;
}

export interface CoOwnVerificationDemand {
  id: number;
  demandType: string;
  deadline: string;
  status: string;
  inspectorVerdict: string | null;
  createdAt: string;
}

export interface CoOwnRecourseEvent {
  id: number;
  eventType: string;
  amountGbp: number | null;
  createdAt: string;
}

export interface CoOwnRecourse {
  assetId: string;
  /** Null when no recourse agreement exists for this asset. */
  agreement: CoOwnRecourseAgreement | null;
  sellerLiability: CoOwnSellerLiability | null;
  verificationDemands: CoOwnVerificationDemand[];
  events: CoOwnRecourseEvent[];
}

// ── Trade eligibility & DRIP ──────────────────────────────────────────

/** GET /co-own/assets/:id/eligibility — the server's pre-trade verdict. */
export interface CoOwnEligibility {
  eligible: boolean;
  reason: string | null;
  maxUnits: number | null;
}

/** GET /co-own/drip/enrollments — per-asset dividend reinvestment flag. */
export interface CoOwnDripEnrollment {
  assetId: string;
  enrolled: boolean;
  enrolledAt: string | null;
}

// ── Risk disclosure consent ───────────────────────────────────────────

/** GET /compliance/consents/documents?docType=risk_disclosure — the
 *  currently-effective legal document the trader must accept. */
export interface RiskDisclosureDocument {
  id: string;
  version: string;
  title: string;
  contentUrl: string | null;
  effectiveAt: string;
}
