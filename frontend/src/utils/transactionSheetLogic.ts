import {
  convertDisplayToGbpAmount,
  convertGbpToDisplayAmount,
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
  | 'auction_not_started'
  | 'auction_settled'
  | 'seller_restricted'
  | 'auth_required'
  | 'eligibility_blocked'
  | 'aml_blocked'
  | 'buy_now_price_changed'
  | 'buy_now_review_required'
  | 'network_failure'
  | 'unknown_backend';

export interface TransactionError {
  kind: TransactionErrorKind;
  message: string;
  updatedMinimumGbp?: number;
  currentBuyNowPriceGbp?: number;
  canRetry: boolean;
  transactionPossible: boolean;
  isAmbiguous: boolean;
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
        isAmbiguous: false,
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
        isAmbiguous: false,
      },
    };
  }

  if (ctx.effectiveState === 'settled') {
    return {
      valid: false,
      gbpAmount: null,
      error: {
        kind: 'auction_settled',
        message: 'This auction has been settled.',
        canRetry: false,
        transactionPossible: false,
        isAmbiguous: false,
      },
    };
  }

  if (ctx.effectiveState === 'ended') {
    return {
      valid: false,
      gbpAmount: null,
      error: {
        kind: 'auction_ended',
        message: 'This auction has ended. Bidding is no longer available.',
        canRetry: false,
        transactionPossible: false,
        isAmbiguous: false,
      },
    };
  }

  if (ctx.effectiveState === 'upcoming') {
    return {
      valid: false,
      gbpAmount: null,
      error: {
        kind: 'auction_not_started',
        message: 'This auction has not started yet.',
        canRetry: false,
        transactionPossible: false,
        isAmbiguous: false,
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
        isAmbiguous: false,
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
        isAmbiguous: false,
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
        isAmbiguous: false,
      },
    };
  }

  return {
    valid: true,
    gbpAmount: Number(gbpAmount.toFixed(2)),
    error: null,
  };
}

// ── Quick increments — PASS 8: currency-correct fallback ──

export function applyQuickIncrement(
  currentInput: string,
  pct: number,
  fallbackCurrentBidGbp: number,
  currencyCode: SupportedCurrencyCode = 'GBP',
  goldRates: Partial<GoldRates> = {},
): string {
  const base = Number(currentInput);
  if (Number.isFinite(base) && base > 0) {
    const nextValue = Number((base * (1 + pct)).toFixed(2));
    return nextValue.toFixed(2);
  }
  // Empty/invalid input — convert fallback bid from GBP to display currency, then apply increment
  // Do NOT use getSuggestedBidDisplayAmount which adds its own 3% step
  const displayBase = convertGbpToDisplayAmount(fallbackCurrentBidGbp, currencyCode, goldRates);
  const nextValue = Number((displayBase * (1 + pct)).toFixed(2));
  return nextValue.toFixed(2);
}

// ── Error mapping from API — PASS 7: correct auth copy, ambiguous classification ──

export function mapApiErrorToTransactionError(
  error: unknown,
  fallbackMessage: string,
  parsedCode: string | null,
  parsedStatus: number | undefined,
  parsedMessage: string,
  isNetworkError: boolean,
): TransactionError {
  // Network/timeout — ambiguous: commit status unknown
  if (isNetworkError) {
    return {
      kind: 'network_failure',
      message: 'Network error. Your bid may have been processed. Check your connection and try again with the same bid.',
      canRetry: true,
      transactionPossible: true,
      isAmbiguous: true,
    };
  }

  // 401 — authentication/session failure, NOT account verification
  if (parsedStatus === 401) {
    return {
      kind: 'auth_required',
      message: 'Your session has expired. Sign in again to continue.',
      canRetry: false,
      transactionPossible: false,
      isAmbiguous: false,
    };
  }

  // AML blocked — definitive rejection
  if (parsedCode === 'AML_BLOCKED') {
    return {
      kind: 'aml_blocked',
      message: parsedMessage || 'Bid blocked by AML controls. Please contact support for manual review.',
      canRetry: false,
      transactionPossible: false,
      isAmbiguous: false,
    };
  }

  // 403 — eligibility or verification restriction (not auth)
  if (parsedStatus === 403) {
    return {
      kind: 'eligibility_blocked',
      message: parsedMessage || 'You are not eligible to bid on this auction.',
      canRetry: false,
      transactionPossible: false,
      isAmbiguous: false,
    };
  }

  if (parsedStatus === 400) {
    // Seller restricted — definitive
    if (parsedCode === 'SELLER_RESTRICTED' || parsedMessage.toLowerCase().includes('seller')) {
      return {
        kind: 'seller_restricted',
        message: 'You cannot bid on your own auction.',
        canRetry: false,
        transactionPossible: false,
        isAmbiguous: false,
      };
    }
    // Minimum changed — definitive rejection, no transaction occurred
    if (parsedCode === 'BUY_NOW_REVIEW_REQUIRED' || parsedMessage.toLowerCase().includes('buy now')) {
      return {
        kind: 'buy_now_review_required',
        message: 'Your bid meets or exceeds the Buy Now price. Use Buy Now to purchase this item immediately.',
        canRetry: false,
        transactionPossible: false,
        isAmbiguous: false,
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
        isAmbiguous: false,
      };
    }
    // Auction ended/cancelled via 400 — definitive
    if (parsedMessage.toLowerCase().includes('ended') || parsedMessage.toLowerCase().includes('closed')) {
      return {
        kind: 'auction_ended',
        message: 'This auction has ended. Bidding is no longer available.',
        canRetry: false,
        transactionPossible: false,
        isAmbiguous: false,
      };
    }
    if (parsedMessage.toLowerCase().includes('cancelled')) {
      return {
        kind: 'auction_cancelled',
        message: 'This auction has been cancelled.',
        canRetry: false,
        transactionPossible: false,
        isAmbiguous: false,
      };
    }
  }

  if (parsedStatus === 409) {
    // Buy Now price changed — definitive rejection
    if (parsedCode === 'BUY_NOW_PRICE_CHANGED') {
      const priceMatch = parsedMessage.match(/£?([\d.]+)/);
      const updatedPrice = priceMatch ? Number(priceMatch[1]) : undefined;
      return {
        kind: 'buy_now_price_changed',
        message: 'The Buy Now price has changed. Please review the updated price.',
        currentBuyNowPriceGbp: updatedPrice,
        canRetry: true,
        transactionPossible: true,
        isAmbiguous: false,
      };
    }
    // Auction ended/cancelled/settled via 409 — definitive
    if (parsedCode === 'AUCTION_CANCELLED' || parsedMessage.toLowerCase().includes('cancelled')) {
      return {
        kind: 'auction_cancelled',
        message: 'This auction has been cancelled.',
        canRetry: false,
        transactionPossible: false,
        isAmbiguous: false,
      };
    }
    if (parsedCode === 'AUCTION_SETTLED' || parsedMessage.toLowerCase().includes('settled')) {
      return {
        kind: 'auction_settled',
        message: 'This auction has been settled.',
        canRetry: false,
        transactionPossible: false,
        isAmbiguous: false,
      };
    }
    if (parsedCode === 'AUCTION_NOT_STARTED' || parsedMessage.toLowerCase().includes('not started')) {
      return {
        kind: 'auction_not_started',
        message: 'This auction has not started yet.',
        canRetry: false,
        transactionPossible: false,
        isAmbiguous: false,
      };
    }
    // Default 409 — auction ended
    return {
      kind: 'auction_ended',
      message: parsedMessage || 'This auction has ended. Bidding is no longer available.',
      canRetry: false,
      transactionPossible: false,
      isAmbiguous: false,
    };
  }

  // 5xx — potentially ambiguous: commit status uncertain
  if (parsedStatus !== undefined && parsedStatus >= 500) {
    return {
      kind: 'unknown_backend',
      message: 'Server error. Your bid may have been processed. Please check your activity before retrying.',
      canRetry: true,
      transactionPossible: true,
      isAmbiguous: true,
    };
  }

  // Unknown — do not classify as safe new attempt
  return {
    kind: 'unknown_backend',
    message: parsedMessage || fallbackMessage,
    canRetry: true,
    transactionPossible: true,
    isAmbiguous: true,
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
