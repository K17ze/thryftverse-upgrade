import type { CapabilityCarrier } from '../services/capabilitiesApi';
import type { ShippingQuoteItem } from '../services/commerceApi';
import { t } from '../i18n';

export interface CheckoutSavedAddress {
  id?: number;
  name: string;
  streetAddress: string;
  apartment?: string;
  city: string;
  region?: string;
  postalCode: string;
  countryCode: string;
  country: string;
  isDefault?: boolean;
}

export interface CheckoutSavedPaymentMethod {
  id?: number;
  type: 'card' | 'bank_account' | 'apple_pay' | 'google_pay';
  label: string;
  details?: string;
  isDefault?: boolean;
}

export function isCheckoutReady(
  savedAddress: CheckoutSavedAddress | null | undefined,
  savedPaymentMethod: CheckoutSavedPaymentMethod | null | undefined
) {
  return Boolean(savedAddress && savedPaymentMethod?.id);
}

// ── Checkout stage tracking ──────────────────────────────────────────────

export type CheckoutStage =
  | 'idle'
  | 'creating_order'
  | 'opening_payment'
  | 'authenticating'
  | 'awaiting_payment'
  | 'payment_succeeded'
  | 'payment_pending'
  | 'payment_failed'
  | 'unknown_outcome';

export const STAGE_LABELS: Record<CheckoutStage, string> = {
  idle: '',
  creating_order: 'Reviewing your order',
  opening_payment: 'Processing payment',
  authenticating: 'Confirm with your bank',
  awaiting_payment: 'Processing payment',
  payment_succeeded: 'Order confirmed',
  payment_pending: 'Payment is pending. We’ll update this order when your bank confirms it.',
  payment_failed: 'Payment didn’t go through',
  unknown_outcome: 'We’re checking your payment. Please don’t retry yet.',
};

// ── Postage options ──────────────────────────────────────────────────────

export interface CheckoutPostageOption {
  quoteId: string | null;
  carrierId: string | null;
  label: string;
  etaLabel: string;
  priceFromGbp: number;
  liveQuote: boolean;
  tracking: boolean;
}

export const DEFAULT_POSTAGE_OPTION: CheckoutPostageOption = {
  quoteId: null,
  carrierId: null,
  label: t('checkout.postage.default.label'),
  etaLabel: t('checkout.postage.default.eta'),
  priceFromGbp: 2.89,
  liveQuote: false,
  tracking: false,
};

export const UNAVAILABLE_REGION_POSTAGE_OPTION: CheckoutPostageOption = {
  quoteId: null,
  carrierId: null,
  label: 'Shipping not available for your region',
  etaLabel: 'Unavailable',
  priceFromGbp: 0,
  liveQuote: false,
  tracking: false,
};

export function toEtaLabelFromRange(etaMinDays: number, etaMaxDays: number): string {
  if (etaMinDays === etaMaxDays) {
    return `${etaMinDays} working day${etaMinDays === 1 ? '' : 's'}`;
  }
  return `${etaMinDays}-${etaMaxDays} working days`;
}

export function toEtaLabel(carrier: CapabilityCarrier): string {
  return toEtaLabelFromRange(carrier.etaMinDays, carrier.etaMaxDays);
}

/**
 * Maps a persisted server-issued shipping quote to the checkout postage
 * option shape. Quotes returned for a listing-bound request carry a
 * `quoteId` the order-creation route requires — never hand-construct an
 * option without one.
 */
export function toPostageOptionFromQuote(quote: ShippingQuoteItem): CheckoutPostageOption {
  return {
    quoteId: quote.quoteId,
    carrierId: quote.carrierId,
    label: quote.label,
    etaLabel: toEtaLabelFromRange(quote.etaMinDays, quote.etaMaxDays),
    priceFromGbp: quote.priceFromGbp,
    liveQuote: quote.live,
    tracking: quote.tracking,
  };
}

// ── Order signature ──────────────────────────────────────────────────────

export function buildOrderSignature(params: {
  buyerId: string;
  listingId: string;
  addressId?: number;
  paymentMethodId?: number;
  carrierId?: string;
  /** Server-issued shipping quote id — part of the signature so a fresh
   *  quote at the same price still re-keys the order rather than silently
   *  replaying a consumed/stale quote. */
  quoteId?: string | null;
  platformCharge: number;
  postageFee: number;
  walletDebit?: number;
  paymentGatewayId?: string;
  /** Item verification add-on — part of the signature so toggling it
   *  produces a fresh order rather than mutating a stale one. */
  verificationRequested?: boolean;
}): string {
  return [
    params.buyerId,
    params.listingId,
    params.addressId ?? 'none',
    params.paymentMethodId ?? 'none',
    params.carrierId ?? 'none',
    params.quoteId ?? 'none',
    params.platformCharge.toFixed(2),
    params.postageFee.toFixed(2),
    params.walletDebit?.toFixed(2) ?? 'none',
    params.paymentGatewayId ?? 'none',
    params.verificationRequested ? 'verified' : 'none',
  ].join('|');
}
