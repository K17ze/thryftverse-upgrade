import React from 'react';
import {
  type MarketCoOwnAsset,
  type CoOwnOrderBookSnapshot,
} from '../services/marketApi';
import {
  buildTradeQuote,
  CO_OWN_FEE_RATE,
  CO_OWN_MAX_UNITS,
  type TradeOrderMode,
} from '../utils/tradeFlow';

export type TradeSide = 'buy' | 'sell';

/**
 * Trade mode — superset of the backend order types and the legacy
 * market/limit binary. 'protected_market' and 'protected_instant' both
 * map to a marketable order with a protection price; 'limit' is a
 * resting order; 'market' is the legacy uncapped mode (rarely used in
 * Co-Own where protected instant is preferred).
 */
export type TradeMode = 'market' | 'limit' | 'protected_market' | 'protected_instant';

export type TradeDuration = 'GFD' | 'GTC90';

export interface UseAssetDetailTradeStateOptions {
  asset: MarketCoOwnAsset | null;
  orderBook: CoOwnOrderBookSnapshot | null;
}

export interface UseAssetDetailTradeStateResult {
  // Intent
  tradeSide: TradeSide;
  setTradeSide: (side: TradeSide) => void;

  tradeMode: TradeMode;
  setTradeMode: (mode: TradeMode) => void;

  limitPrice: string;
  setLimitPrice: (price: string) => void;

  units: string;
  setUnits: (units: string) => void;

  duration: TradeDuration;
  setDuration: (d: TradeDuration) => void;

  // Derived
  parsedLimitPrice: number | null;
  parsedUnits: number | null;
  estimatedCost: number | null;
  estimatedFillPrice: number | null;
  isSubmitEnabled: boolean;

  // Actions
  reset: () => void;
  prefillFromBookLevel: (side: 'buy' | 'sell', price: number) => void;
}

const DEFAULT_SIDE: TradeSide = 'buy';
const DEFAULT_MODE: TradeMode = 'protected_instant';
const DEFAULT_UNITS = '1';
const DEFAULT_PRICE = '';
const DEFAULT_DURATION: TradeDuration = 'GFD';

/**
 * useAssetDetailTradeState — manages trade intent state for the Co-Own
 * asset detail surface. Encapsulates the side, order type, limit price,
 * units, and duration that the trade composer edits, along with the
 * derived quote estimates.
 *
 * The state shape mirrors TradeScreen's ticket state so the patterns
 * stay aligned across the detail → trade flow. When the asset changes
 * (navigation to a different instrument) all intent resets to defaults
 * so stale drafts never leak across assets.
 */
export function useAssetDetailTradeState(
  options: UseAssetDetailTradeStateOptions,
): UseAssetDetailTradeStateResult {
  const { asset, orderBook } = options;

  const [tradeSide, setTradeSide] = React.useState<TradeSide>(DEFAULT_SIDE);
  const [tradeMode, setTradeMode] = React.useState<TradeMode>(DEFAULT_MODE);
  const [limitPrice, setLimitPrice] = React.useState<string>(DEFAULT_PRICE);
  const [units, setUnits] = React.useState<string>(DEFAULT_UNITS);
  const [duration, setDuration] =
    React.useState<TradeDuration>(DEFAULT_DURATION);

  // Reset all intent when the asset changes — a draft from a previous
  // instrument must never survive navigation to a new one.
  const assetIdRef = React.useRef<string | null>(asset?.id ?? null);
  React.useEffect(() => {
    const nextId = asset?.id ?? null;
    if (assetIdRef.current !== nextId) {
      assetIdRef.current = nextId;
      setTradeSide(DEFAULT_SIDE);
      setTradeMode(DEFAULT_MODE);
      setLimitPrice(DEFAULT_PRICE);
      setUnits(DEFAULT_UNITS);
      setDuration(DEFAULT_DURATION);
    }
  }, [asset?.id]);

  // ── Derived values ──

  const parsedLimitPrice = React.useMemo<number | null>(() => {
    const n = Number(limitPrice);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }, [limitPrice]);

  const parsedUnits = React.useMemo<number | null>(() => {
    const n = Math.floor(Number(units));
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }, [units]);

  // Map the UI trade mode to the quote engine's binary order mode.
  // 'limit' is a resting order; everything else is marketable.
  const orderMode: TradeOrderMode =
    tradeMode === 'limit' ? 'limit' : 'market';

  const marketPrice = asset?.unitPriceGbp ?? 0;
  const feeRate = asset?.tradingFeeRate ?? CO_OWN_FEE_RATE;

  // For protected_instant, derive a protection price from the live book
  // (best ask × 1.02 for buys, best bid × 0.98 for sells), falling back
  // to the reference price when the book is empty.
  const bestBid = orderBook?.bids[0]?.unitPriceGbp ?? 0;
  const bestAsk = orderBook?.asks[0]?.unitPriceGbp ?? 0;
  const protectedReferencePrice =
    tradeSide === 'buy'
      ? bestAsk > 0
        ? bestAsk
        : marketPrice
      : bestBid;
  const protectedLimitPrice =
    protectedReferencePrice > 0
      ? Number(
          (protectedReferencePrice * (tradeSide === 'buy' ? 1.02 : 0.98)).toFixed(4),
        )
      : 0;

  // The effective limit price depends on the order type:
  //  - protected_instant / protected_market → the computed protection price
  //  - limit → the user-entered price
  //  - market → 0 (uncapped; quote uses marketPrice)
  const effectiveLimitPrice =
    tradeMode === 'protected_instant' || tradeMode === 'protected_market'
      ? protectedLimitPrice
      : tradeMode === 'limit'
        ? parsedLimitPrice ?? 0
        : 0;

  const quote = React.useMemo(
    () =>
      buildTradeQuote({
        orderMode,
        side: tradeSide,
        quantityInput: units,
        limitPriceInput: effectiveLimitPrice > 0 ? String(effectiveLimitPrice) : '',
        marketPrice,
        feeRate,
      }),
    [orderMode, tradeSide, units, effectiveLimitPrice, marketPrice, feeRate],
  );

  const estimatedFillPrice: number | null = React.useMemo(() => {
    if (quote.executionPrice > 0) return quote.executionPrice;
    return null;
  }, [quote.executionPrice]);

  const estimatedCost: number | null = React.useMemo(() => {
    if (parsedUnits == null) return null;
    if (quote.grossValue > 0) return quote.grossValue;
    return null;
  }, [parsedUnits, quote.grossValue]);

  // Submit is enabled when the asset is loaded, the quantity is valid
  // within the max-units cap, and either the order is marketable or a
  // positive limit price has been entered. Server-authoritative
  // eligibility is evaluated at submission time, not here.
  const isSubmitEnabled = React.useMemo(() => {
    if (!asset) return false;
    if (parsedUnits == null || parsedUnits <= 0) return false;
    if (parsedUnits > CO_OWN_MAX_UNITS) return false;
    if (tradeMode === 'limit') return parsedLimitPrice != null;
    return true;
  }, [asset, parsedUnits, parsedLimitPrice, tradeMode]);

  const reset = React.useCallback(() => {
    setTradeSide(DEFAULT_SIDE);
    setTradeMode(DEFAULT_MODE);
    setLimitPrice(DEFAULT_PRICE);
    setUnits(DEFAULT_UNITS);
    setDuration(DEFAULT_DURATION);
  }, []);

  // Pre-fill the ticket from a tapped order book level. Tapping an ask
  // implies a buy at that price; tapping a bid implies a sell. The mode
  // switches to 'limit' so the user sees and can adjust the exact price.
  const prefillFromBookLevel = React.useCallback(
    (side: 'buy' | 'sell', price: number) => {
      setTradeSide(side);
      setLimitPrice(String(price));
      setTradeMode('limit');
    },
    [],
  );

  return {
    tradeSide,
    setTradeSide,
    tradeMode,
    setTradeMode,
    limitPrice,
    setLimitPrice,
    units,
    setUnits,
    duration,
    setDuration,
    parsedLimitPrice,
    parsedUnits,
    estimatedCost,
    estimatedFillPrice,
    isSubmitEnabled,
    reset,
    prefillFromBookLevel,
  };
}
