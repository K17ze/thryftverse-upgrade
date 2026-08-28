import { sanitizeDecimalInput, sanitizeIntegerInput } from './currencyAuthoringFlows';
import { gbpToMinor, mulGbpUnits, feeGbp, addGbp, subGbp, minorToGbp, parseGbpToMinor } from './money';

export const CO_OWN_FEE_RATE = 0.01;
export const CO_OWN_MAX_UNITS = 20;

// ── Wallet fee rates — single source of truth for all fee percentages ──
/** 1% platform fee on Co-Own trades (buy/sell). */
export const CO_OWN_TRADE_FEE_RATE = 0.01;

export type TradeOrderMode = 'market' | 'limit';
export type TradeSide = 'buy' | 'sell';

// ── Phase 2.5: exchange-grade order ticket types ──

/**
 * Order ticket mode — replaces the binary market/limit with exchange-grade
 * semantics. "Protected instant" = marketable limit with a visible protection
 * price (never an uncapped market order in an illiquid asset, source §6.3).
 * "Limit" = resting order. GTT in Phase 3.
 *
 * P0.1: The backend order type for protected_instant is 'protected_market'.
 * The frontend ticket type remains 'protected_instant' for UX labeling, but
 * the backend contract uses 'protected_market' with maxPriceGbp/minPriceGbp.
 */
export type CoOwnOrderType = 'protected_market' | 'limit' | 'protected_instant';

/**
 * P0.1: The backend order instruction for a protected_market order.
 * Uses maxPriceGbp (buy) or minPriceGbp (sell) as the protection cap —
 * never limitPriceGbp, which is reserved for resting limit orders.
 */
export interface ProtectedMarketInstruction {
  type: 'protected_market';
  side: 'buy' | 'sell';
  units: number;
  /** Worst acceptable price for a buy (cap). */
  maxPriceGbp?: number;
  /** Worst acceptable price for a sell (floor). */
  minPriceGbp?: number;
}

/**
 * P0.1: Build a protected_market order instruction. The protection cap is
 * the worst-case price the order will fill at — buys use maxPriceGbp, sells
 * use minPriceGbp. The order walks the book like a market order but will
 * not fill beyond the cap; any unfilled remainder is cancelled (never rests).
 */
export function buildProtectedMarketInstruction(
  side: TradeSide,
  units: number,
  protectionPriceGbp: number,
): ProtectedMarketInstruction {
  return side === 'buy'
    ? { type: 'protected_market', side, units, maxPriceGbp: protectionPriceGbp }
    : { type: 'protected_market', side, units, minPriceGbp: protectionPriceGbp };
}

/** Duration for resting orders. */
export type CoOwnOrderDuration = 'GFD' | 'GTC90';

/** Fee schedule — the authoritative fee structure. */
export interface CoOwnFeeSchedule {
  /** Proportional fee rate (e.g. 0.01 = 1%). */
  rate: number;
  /** Fixed fee per order (0 for now). */
  fixed: number;
}

/** The default fee schedule — 1% proportional, no fixed. */
export const DEFAULT_FEE_SCHEDULE: CoOwnFeeSchedule = {
  rate: CO_OWN_FEE_RATE,
  fixed: 0,
};

/**
 * The single authoritative reservation calculation (audit blocker 2).
 *
 * For a buy: the full maximum obligation — protection_price × qty + max_fees
 * + buffer — moved from available 1ZE to order-reserved on acceptance.
 *
 * For a sell: the full unit quantity moved from settled-available to
 * reserved-for-sale. The 1ZE reservation is 0 (units are reserved, not cash).
 *
 * Every preview, confirmation and ledger entry must derive from this function.
 * Do not manually reproduce example totals across screens.
 *
 * @param side 'buy' or 'sell'
 * @param quantity units
 * @param protectionPrice the protection/limit price per unit
 * @param feeSchedule the fee schedule
 * @param buffer optional buffer (default 0)
 * @returns the reservation breakdown
 */
export interface ReservationBreakdown {
  /** For buy: protection_price × quantity. For sell: 0 (units reserved, not cash). */
  principal: number;
  /** For buy: max fee = principal × rate + fixed. For sell: 0. */
  maxFee: number;
  /** Optional buffer. */
  buffer: number;
  /** Total 1ZE to reserve (buy) or 0 (sell — units reserved instead). */
  totalReserve1ZE: number;
  /** Total units to reserve (sell) or 0 (buy — cash reserved instead). */
  totalReserveUnits: number;
  /** Gross before fees. */
  gross: number;
  /** Fee amount. */
  fee: number;
  /** Total cost (buy) or net proceeds (sell). */
  total: number;
}

export function computeReservation(
  side: TradeSide,
  quantity: number,
  protectionPrice: number,
  feeSchedule: CoOwnFeeSchedule = DEFAULT_FEE_SCHEDULE,
  buffer: number = 0,
): ReservationBreakdown {
  // Use BigInt minor units for exact arithmetic — no IEEE 754 drift.
  // The BigInt math is internal only; we convert back to numbers at the
  // return boundary so UI components keep their existing number contracts.
  const priceMinor = gbpToMinor(protectionPrice);
  const bufferMinor = gbpToMinor(buffer);

  if (side === 'buy') {
    const principalMinor = mulGbpUnits(priceMinor, quantity);
    const maxFeeMinor = addGbp(
      feeGbp(principalMinor, feeSchedule.rate),
      gbpToMinor(feeSchedule.fixed),
    );
    const totalReserve1ZEMinor = addGbp(addGbp(principalMinor, maxFeeMinor), bufferMinor);
    return {
      principal: minorToGbp(principalMinor),
      maxFee: minorToGbp(maxFeeMinor),
      buffer,
      totalReserve1ZE: minorToGbp(totalReserve1ZEMinor),
      totalReserveUnits: 0,
      gross: minorToGbp(principalMinor),
      fee: minorToGbp(maxFeeMinor),
      total: minorToGbp(subGbp(totalReserve1ZEMinor, bufferMinor)),
    };
  } else {
    // Sell: units are reserved, not cash. Proceeds are computed but not reserved.
    const grossMinor = mulGbpUnits(priceMinor, quantity);
    const feeMinor = addGbp(
      feeGbp(grossMinor, feeSchedule.rate),
      gbpToMinor(feeSchedule.fixed),
    );
    const netMinor = subGbp(grossMinor, feeMinor);
    return {
      principal: 0,
      maxFee: 0,
      buffer: 0,
      totalReserve1ZE: 0,
      totalReserveUnits: quantity,
      gross: minorToGbp(grossMinor),
      fee: minorToGbp(feeMinor),
      total: minorToGbp(netMinor),
    };
  }
}

/**
 * Walk a simulated book to estimate fill price and worst price.
 * Used for the "Estimated fill" section in the expanded order ticket.
 *
 * This is a CLIENT-SIDE PREVIEW only — the server's matching engine
 * determines final execution. The preview walks visible depth and
 * reports slippage if the order would exceed visible depth.
 */
export interface BookLevel {
  price: number;
  size: number;
}

export interface SimulatedBook {
  bids: BookLevel[]; // sorted descending by price
  asks: BookLevel[]; // sorted ascending by price
}

export interface FillEstimate {
  /** Average fill price across consumed levels. */
  avgFillPrice: number;
  /** Worst price level the order would execute at. */
  worstPrice: number;
  /** Total units filled (may be less than requested if depth exhausted). */
  unitsFilled: number;
  /** True if the order would slip beyond visible depth. */
  slippageBeyondDepth: boolean;
  /** Gross value at avg fill price. */
  gross: number;
}

export function estimateFill(
  side: TradeSide,
  quantity: number,
  book: SimulatedBook,
): FillEstimate {
  // Buy: walk asks (ascending). Sell: walk bids (descending).
  const levels = side === 'buy' ? book.asks : book.bids;
  let remaining = quantity;
  let totalCostMinor = 0n; // BigInt accumulator — no floating point drift
  let worstPrice = 0;
  let unitsFilled = 0;

  for (const level of levels) {
    if (remaining <= 0) break;
    const fillQty = Math.min(remaining, level.size);
    // Exact: price_minor * units
    totalCostMinor = addGbp(totalCostMinor, mulGbpUnits(gbpToMinor(level.price), fillQty));
    unitsFilled += fillQty;
    worstPrice = level.price;
    remaining -= fillQty;
  }

  const slippageBeyondDepth = remaining > 0;
  const totalCost = minorToGbp(totalCostMinor);
  const avgFillPrice = unitsFilled > 0 ? totalCost / unitsFilled : 0;

  return {
    avgFillPrice,
    worstPrice,
    unitsFilled,
    slippageBeyondDepth,
    gross: totalCost,
  };
}

/**
 * Compute depth ±2% from midpoint — executable quantity inside ±2% of mid.
 * Used for the depth-impact preview bar.
 */
export function computeDepthWithinBand(
  side: TradeSide,
  book: SimulatedBook,
  bandPct: number = 0.02,
): { depthUnits: number; midPrice: number } {
  const bestBid = book.bids[0]?.price ?? 0;
  const bestAsk = book.asks[0]?.price ?? 0;
  if (bestBid <= 0 || bestAsk <= 0) return { depthUnits: 0, midPrice: 0 };

  const mid = (bestBid + bestAsk) / 2;
  const lowerBand = mid * (1 - bandPct);
  const upperBand = mid * (1 + bandPct);

  const levels = side === 'buy' ? book.asks : book.bids;
  const depthUnits = levels
    .filter((l) => side === 'buy' ? l.price <= upperBand : l.price >= lowerBand)
    .reduce((sum, l) => sum + l.size, 0);

  return { depthUnits, midPrice: mid };
}

/**
 * P0.2: Check whether an order book snapshot is fresh enough to be
 * considered authoritative for trading decisions.
 *
 * A book is fresh if:
 *   - it has a valid serverTimestamp (not null/empty/invalid)
 *   - the age of the timestamp is within the staleness threshold
 *
 * @param book the order book snapshot (or any object exposing
 *             `serverTimestamp` and `stalenessThresholdSeconds`)
 * @param nowMs current time in milliseconds (Date.now())
 * @param stalenessThresholdSeconds max acceptable age in seconds; when
 *        omitted, falls back to `book.stalenessThresholdSeconds`, then 15s
 * @returns true if the book is fresh, false if stale or invalid
 */
export function isBookFresh(
  book: { serverTimestamp?: string | null; stalenessThresholdSeconds?: number } | null | undefined,
  nowMs: number,
  stalenessThresholdSeconds?: number,
): boolean {
  if (!book) {
    return false;
  }

  const serverTimestamp = book.serverTimestamp;
  if (!serverTimestamp) {
    return false;
  }

  const timestampMs = Date.parse(serverTimestamp);
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  // If no threshold is provided, fall back to the book's own
  // stalenessThresholdSeconds, then to a 15-second default.
  const thresholdSeconds = stalenessThresholdSeconds ?? book.stalenessThresholdSeconds ?? 15;
  const ageSeconds = (nowMs - timestampMs) / 1000;

  return ageSeconds <= thresholdSeconds;
}

/**
 * Generate a deterministic simulated book from a market price.
 * Used for Phase 2.5 client-side preview only — the backend will
 * provide the real book in Phase 2.
 *
 * Deterministic: same price → same book. No random values during render.
 */
export function generateSimulatedBook(marketPrice: number): SimulatedBook {
  if (marketPrice <= 0) return { bids: [], asks: [] };

  // Generate 5 levels each side, deterministic spreads and sizes.
  const tickSize = Math.max(0.01, marketPrice * 0.001); // ~10 bps tick
  const baseSize = 50; // deterministic base size per level

  const asks: BookLevel[] = [];
  const bids: BookLevel[] = [];

  for (let i = 0; i < 5; i++) {
    asks.push({
      price: Number((marketPrice + tickSize * (i + 1)).toFixed(2)),
      size: baseSize * (1 + i * 0.3), // increasing size with distance
    });
    bids.push({
      price: Number((marketPrice - tickSize * (i + 1)).toFixed(2)),
      size: baseSize * (1 + i * 0.3),
    });
  }

  return { bids, asks };
}

export interface TradeEligibility {
  ok: boolean;
  message?: string;
}

export interface TradeQuoteInput {
  orderMode: TradeOrderMode;
  side: TradeSide;
  quantityInput: string;
  /** User-entered limit price in GBP (the storage/settlement currency). */
  limitPriceInput: string;
  /** Authoritative unit price in GBP from the backend (NOT 1ze). */
  marketPrice: number;
}

export interface TradeQuote {
  orderMode: TradeOrderMode;
  quantity: number;
  isValidQty: boolean;
  /** Limit price in GBP (only valid when orderMode is 'limit'). */
  limitPrice: number;
  hasLimitPrice: boolean;
  /** Execution price in GBP — market orders use the backend unit price, limit orders use the entered price. */
  executionPrice: number;
  /** Gross value in GBP (quantity × executionPrice). */
  grossValue: number;
  /** Platform fee in GBP. */
  fee: number;
  /** Buy: grossValue + fee (total cost). Sell: grossValue - fee (net proceeds). */
  netValue: number;
}

export interface TradeSubmitInput extends TradeQuoteInput {
  assetFound: boolean;
  eligibility: TradeEligibility;
  maxSellUnits: number;
}

export interface TradeSubmitDecision {
  ok: boolean;
  kind: 'error' | 'queue' | 'execute';
  message: string;
}

export function sanitizeTradeQuantityInput(rawValue: string) {
  const sanitized = sanitizeIntegerInput(rawValue);
  if (!sanitized) {
    return '';
  }

  const parsed = Math.floor(Number(sanitized));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return '1';
  }

  return String(Math.min(CO_OWN_MAX_UNITS, parsed));
}

export function sanitizeTradePriceInput(rawValue: string) {
  return sanitizeDecimalInput(rawValue);
}

export function buildTradeQuote(input: TradeQuoteInput): TradeQuote {
  const quantity = Math.floor(Number(input.quantityInput));
  const isValidQty = Number.isFinite(quantity) && quantity > 0;

  const limitPrice = Number(input.limitPriceInput);
  const hasLimitPrice = Number.isFinite(limitPrice) && limitPrice > 0;

  // Market orders use the authoritative backend unit price directly.
  // The server's matching engine determines final execution price — the
  // client must NOT invent a slippage/adjustment factor.
  const executionPrice =
    input.orderMode === 'limit' && hasLimitPrice
      ? limitPrice
      : input.marketPrice;

  const grossValue = isValidQty ? quantity * executionPrice : 0;
  const fee = grossValue * CO_OWN_FEE_RATE;
  const netValue = input.side === 'buy' ? grossValue + fee : grossValue - fee;

  return {
    orderMode: input.orderMode,
    quantity,
    isValidQty,
    limitPrice,
    hasLimitPrice,
    executionPrice,
    grossValue,
    fee,
    netValue,
  };
}

export function isTradeSubmitEnabled(input: {
  assetFound: boolean;
  eligibility: TradeEligibility;
  quote: TradeQuote;
}) {
  return (
    input.assetFound
    && input.eligibility.ok
    && input.quote.isValidQty
    && input.quote.quantity <= CO_OWN_MAX_UNITS
    && (input.quote.orderMode === 'market' || input.quote.hasLimitPrice)
  );
}

/** Returns the first reason the submit button is disabled, or null if enabled.
 *  Per spec 05 §1: "Review button disabled-with-reason for all 7 failure conditions." */
export function getTradeSubmitDisabledReason(input: {
  assetFound: boolean;
  eligibility: TradeEligibility;
  quote: TradeQuote;
  hasIncompleteRights?: boolean;
}): string | null {
  if (!input.assetFound) return 'Asset not loaded';
  if (input.hasIncompleteRights) return 'Rights incomplete — not yet tradable';
  if (!input.eligibility.ok) return input.eligibility.message ?? 'Trading restricted';
  if (!input.quote.isValidQty) return 'Enter a valid quantity';
  if (input.quote.quantity > CO_OWN_MAX_UNITS) return `Maximum ${CO_OWN_MAX_UNITS} units per order`;
  if (input.quote.orderMode === 'limit' && !input.quote.hasLimitPrice) return 'Enter a limit price';
  return null;
}

export function evaluateTradeSubmit(input: TradeSubmitInput): TradeSubmitDecision {
  const quote = buildTradeQuote(input);

  if (!input.assetFound) {
    return {
      ok: false,
      kind: 'error',
      message: 'Asset not found',
    };
  }

  if (!input.eligibility.ok) {
    return {
      ok: false,
      kind: 'error',
      message: input.eligibility.message ?? 'Compliance checks required',
    };
  }

  if (!quote.isValidQty) {
    return {
      ok: false,
      kind: 'error',
      message: 'Enter a valid quantity',
    };
  }

  if (quote.quantity > CO_OWN_MAX_UNITS) {
    return {
      ok: false,
      kind: 'error',
      message: `Quantity must be between 1 and ${CO_OWN_MAX_UNITS}`,
    };
  }

  if (input.side === 'sell' && quote.quantity > input.maxSellUnits) {
    return {
      ok: false,
      kind: 'error',
      message: 'Not enough units in holdings',
    };
  }

  if (input.orderMode === 'limit') {
    if (!quote.hasLimitPrice) {
      return {
        ok: false,
        kind: 'error',
        message: 'Enter a valid offer price',
      };
    }

    const buyNotCrossing = input.side === 'buy' && quote.limitPrice < input.marketPrice * 0.995;
    const sellNotCrossing = input.side === 'sell' && quote.limitPrice > input.marketPrice * 1.005;

    if (buyNotCrossing || sellNotCrossing) {
      return {
        ok: true,
        kind: 'queue',
        message: input.side === 'buy'
          ? 'Offer sent to owners. Raise your offer for instant fill.'
          : 'Ask sent to owners. Lower your ask for instant fill.',
      };
    }
  }

  return {
    ok: true,
    kind: 'execute',
    message: 'Order can execute',
  };
}