import {
  convertDisplayToGbpAmount,
  getSuggestedBidDisplayAmount,
  sanitizeDecimalInput,
} from './currencyAuthoringFlows';
import type { SupportedCurrencyCode } from '../constants/currencies';
import type { GoldRates } from './currency';

// ── Types ──

export type BidSheetStage = 'entry' | 'review' | 'submitting' | 'success' | 'error';

export interface BidSheetState {
  stage: BidSheetStage;
  input: string;
  displayAmount: number | null;
  gbpAmount: number | null;
  error: TransactionError | null;
}

export type TransactionErrorKind =
  | 'invalid_amount'
  | 'below_minimum'
  | 'minimum_changed'
  | 'auction_ended'
  | 'auction_cancelled'
  | 'seller_restricted'
  | 'auth_required'
  | 'eligibility_blocked'
  | 'aml_blocked'
  | 'network_failure'
  | 'unknown_backend';

export interface TransactionError {
  kind: TransactionErrorKind;
  message: string;
  updatedMinimumGbp?: number;
  canRetry: boolean;
  transactionPossible: boolean;
}

// ── Validation ──

export interface BidValidationContext {
  minimumNextBidGbp: number;
  isSeller: boolean;
  effectiveState: 'upcoming' | 'live' | 'ended' | 'cancelled' | 'settled';
  isSubmitting: boolean;
}

export interface BidValidationResult {
  valid: boolean;
  gbpAmount: number | null;
  error: TransactionError | null;
}

export function validateBidEntry(
  rawInput: string,
  currencyCode: SupportedCurrencyCode,
  goldRates: Partial<GoldRates>,
  ctx: BidValidationContext,
): BidValidationResult {
  if (ctx.isSubmitting) {
    return { valid: false, gbpAmount: null, error: null };
  }

  if (ctx.isSeller) {
    return {
      valid: false,
      gbpAmount: null,
      error: {
        kind: 'seller_restricted',
        message: 'You cannot bid on your own auction.',
        canRetry: false,
        transactionPossible: false,
      },
    };
  }

  if (ctx.effectiveState === 'ended' || ctx.effectiveState === 'settled') {
    return {
      valid: false,
      gbpAmount: null,
      error: {
        kind: 'auction_ended',
        message: 'This auction has ended. Bidding is no longer available.',
        canRetry: false,
        transactionPossible: false,
      },
    };
  }

  if (ctx.effectiveState === 'cancelled') {
    return {
      valid: false,
      gbpAmount: null,
      error: {
        kind: 'auction_cancelled',
        message: 'This auction has been cancelled.',
        canRetry: false,
        transactionPossible: false,
      },
    };
  }

  if (ctx.effectiveState !== 'live') {
    return {
      valid: false,
      gbpAmount: null,
      error: {
        kind: 'auction_ended',
        message: 'This auction is not live yet.',
        canRetry: false,
        transactionPossible: false,
      },
    };
  }

  const amount = Number(rawInput);
  if (!Number.isFinite(amount) || amount <= 0) {
    return {
      valid: false,
      gbpAmount: null,
      error: {
        kind: 'invalid_amount',
        message: 'Enter a valid bid amount.',
        canRetry: true,
        transactionPossible: true,
      },
    };
  }

  const gbpAmount = convertDisplayToGbpAmount(amount, currencyCode, goldRates);
  if (!Number.isFinite(gbpAmount) || gbpAmount <= 0) {
    return {
      valid: false,
      gbpAmount: null,
      error: {
        kind: 'invalid_amount',
        message: 'Invalid bid amount for this currency.',
        canRetry: true,
        transactionPossible: true,
      },
    };
  }

  if (gbpAmount < ctx.minimumNextBidGbp) {
    return {
      valid: false,
      gbpAmount: null,
      error: {
        kind: 'below_minimum',
        message: `Bid must be at least £${ctx.minimumNextBidGbp.toFixed(2)}.`,
        canRetry: true,
        transactionPossible: true,
      },
    };
  }

  return {
    valid: true,
    gbpAmount: Number(gbpAmount.toFixed(2)),
    error: null,
  };
}

// ── Quick increments ──

export function applyQuickIncrement(
  currentInput: string,
  pct: number,
  fallbackCurrentBidGbp: number,
): string {
  const base = Number(currentInput);
  const current = Number.isFinite(base) && base > 0 ? base : fallbackCurrentBidGbp;
  const nextValue = Number((current * (1 + pct)).toFixed(2));
  return nextValue.toFixed(2);
}

// ── Error mapping from API ──

export function mapApiErrorToTransactionError(
  error: unknown,
  fallbackMessage: string,
  parsedCode: string | null,
  parsedStatus: number | undefined,
  parsedMessage: string,
  isNetworkError: boolean,
): TransactionError {
  if (isNetworkError) {
    return {
      kind: 'network_failure',
      message: 'Network error. Check your connection and try again.',
      canRetry: true,
      transactionPossible: true,
    };
  }

  if (parsedStatus === 401) {
    return {
      kind: 'auth_required',
      message: 'Your account needs additional verification before bidding.',
      canRetry: false,
      transactionPossible: false,
    };
  }

  if (parsedCode === 'AML_BLOCKED') {
    return {
      kind: 'aml_blocked',
      message: parsedMessage || 'Bid blocked by AML controls. Please contact support for manual review.',
      canRetry: false,
      transactionPossible: false,
    };
  }

  if (parsedStatus === 403) {
    return {
      kind: 'eligibility_blocked',
      message: parsedMessage || 'You are not eligible to bid on this auction.',
      canRetry: false,
      transactionPossible: false,
    };
  }

  if (parsedStatus === 400) {
    if (parsedMessage.toLowerCase().includes('seller')) {
      return {
        kind: 'seller_restricted',
        message: 'You cannot bid on your own auction.',
        canRetry: false,
        transactionPossible: false,
      };
    }
    if (parsedMessage.toLowerCase().includes('minimum') || parsedMessage.toLowerCase().includes('at least')) {
      const minMatch = parsedMessage.match(/£?([\d.]+)/);
      const updatedMin = minMatch ? Number(minMatch[1]) : undefined;
      return {
        kind: 'minimum_changed',
        message: updatedMin
          ? `The minimum bid is now £${updatedMin.toFixed(2)}. Review your amount and try again.`
          : 'The minimum bid has changed. Review your amount and try again.',
        updatedMinimumGbp: updatedMin,
        canRetry: true,
        transactionPossible: true,
      };
    }
    if (parsedMessage.toLowerCase().includes('ended') || parsedMessage.toLowerCase().includes('closed')) {
      return {
        kind: 'auction_ended',
        message: 'This auction has ended. Bidding is no longer available.',
        canRetry: false,
        transactionPossible: false,
      };
    }
  }

  if (parsedStatus === 409) {
    return {
      kind: 'auction_ended',
      message: parsedMessage || 'This auction has ended. Bidding is no longer available.',
      canRetry: false,
      transactionPossible: false,
    };
  }

  return {
    kind: 'unknown_backend',
    message: parsedMessage || fallbackMessage,
    canRetry: true,
    transactionPossible: true,
  };
}

// ── Buy Now validation ──

export interface BuyNowValidationContext {
  buyNowPriceGbp: number | null;
  isSeller: boolean;
  effectiveState: 'upcoming' | 'live' | 'ended' | 'cancelled' | 'settled';
  isSubmitting: boolean;
}

export function isBuyNowValid(ctx: BuyNowValidationContext): boolean {
  if (ctx.isSubmitting) return false;
  if (ctx.isSeller) return false;
  if (!ctx.buyNowPriceGbp || ctx.buyNowPriceGbp <= 0) return false;
  if (ctx.effectiveState !== 'live') return false;
  return true;
}

// ── GBP equivalent display ──

export function formatGbpEquivalent(
  displayAmount: number,
  gbpAmount: number,
  currencyCode: SupportedCurrencyCode,
): string | null {
  if (currencyCode === 'GBP') return null;
  return `Submitted as approximately £${gbpAmount.toFixed(2)}`;
}

// ── Suggested bid ──

export function getSuggestedBid(
  minimumNextBidGbp: number,
  currencyCode: SupportedCurrencyCode,
  goldRates: Partial<GoldRates>,
): string {
  const suggested = getSuggestedBidDisplayAmount(minimumNextBidGbp, currencyCode, goldRates);
  return suggested.toFixed(2);
}

// ── Lifecycle guard for open sheet ──

export function shouldCloseSheetDueToLifecycle(
  effectiveState: 'upcoming' | 'live' | 'ended' | 'cancelled' | 'settled',
): boolean {
  return effectiveState === 'ended' || effectiveState === 'cancelled' || effectiveState === 'settled';
}

// ── Stale state check ──

export function isSheetStateStale(
  sheetOpenedAtMs: number,
  currentTimeMs: number,
  staleThresholdMs: number = 30_000,
): boolean {
  return (currentTimeMs - sheetOpenedAtMs) > staleThresholdMs;
}
