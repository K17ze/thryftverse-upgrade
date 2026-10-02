import type { OrderType, TradeSide } from '@/lib/contracts/coown';
import type { IzePocket } from '@/components/wallet/useWalletData';

export const HOLD_NOTIONAL_IZE = 5000;
export const HOLD_FLOAT_PCT = 0.05;

export interface EvaluateTradeGateParams {
  units: number;
  maxOrderUnits: number;
  orderType: OrderType;
  limitPriceGbp: number | null;
  isOffline: boolean;
  eligibility?: { eligible: boolean; reason?: string | null } | null;
  isGuest: boolean;
  wallet?: { ize?: IzePocket | null } | null;
  side: TradeSide;
  holdingUnits: number;
  filledUnits: number;
  izeAvailable: number | null;
  requiredIze: number;
  totalUnits: number;
}

export interface TradeGateResult {
  canSubmit: boolean;
  reason: string | null;
  requireHold: boolean;
  holdReason: string;
}

export function evaluateTradeGate({
  units,
  maxOrderUnits,
  orderType,
  limitPriceGbp,
  isOffline,
  eligibility,
  isGuest,
  wallet,
  side,
  holdingUnits,
  filledUnits,
  izeAvailable,
  requiredIze,
  totalUnits,
}: EvaluateTradeGateParams): TradeGateResult {
  let canSubmit = false;
  let reason: string | null = null;

  if (!Number.isInteger(units) || units <= 0) {
    reason = 'Enter a whole number of units';
  } else if (units > maxOrderUnits) {
    reason = `Maximum ${maxOrderUnits} units per order`;
  } else if (orderType === 'limit' && (limitPriceGbp == null || limitPriceGbp <= 0)) {
    reason = 'Set a limit price';
  } else if (isOffline) {
    reason = "You're offline — orders can't be placed until you reconnect";
  } else if (eligibility && !eligibility.eligible) {
    reason = eligibility.reason ?? "This order isn't available for your account";
  } else if (isGuest) {
    canSubmit = true;
  } else if (!wallet) {
    reason = 'Checking your 1ZE balance…';
  } else if (side === 'buy' && wallet.ize == null) {
    reason = "Your 1ZE balance couldn't be loaded — buys are unavailable";
  } else if (side === 'sell' && units > holdingUnits) {
    reason =
      holdingUnits > 0
        ? `You hold ${holdingUnits} ${holdingUnits === 1 ? 'unit' : 'units'} — can't sell more than that`
        : 'You hold no units to sell';
  } else if (orderType !== 'limit' && filledUnits < units) {
    reason =
      filledUnits === 0
        ? 'No orders on the book within range'
        : `Only ${filledUnits} units available${
            orderType === 'protected_market'
              ? ' within your protection price'
              : ' on the book'
          }`;
  } else if (
    side === 'buy' &&
    (izeAvailable == null || requiredIze > izeAvailable + 0.005)
  ) {
    reason =
      izeAvailable == null
        ? 'Checking your 1ZE balance…'
        : 'Not enough 1ZE — convert GBP in your wallet to fund this order';
  } else {
    canSubmit = true;
  }

  const exceedsValueBand = side === 'buy' && requiredIze > HOLD_NOTIONAL_IZE;
  const exceedsFloatBand =
    totalUnits > 0 && units / totalUnits > HOLD_FLOAT_PCT;
  const requireHold = exceedsValueBand || exceedsFloatBand;
  const holdReason = exceedsFloatBand
    ? 'Large order relative to asset supply — press and hold to confirm.'
    : 'High-value order — press and hold to confirm.';

  return { canSubmit, reason, requireHold, holdReason };
}
