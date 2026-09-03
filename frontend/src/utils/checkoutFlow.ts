import type { CapabilityCarrier } from '../services/capabilitiesApi';
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

export function buildBankAccountPaymentMethod(
  accountLast4: string,
  sortCode: string
): CheckoutSavedPaymentMethod {
  const normalizedLast4 = accountLast4.replace(/\D/g, '').slice(-4).padStart(4, '0');

  return {
    type: 'bank_account',
    label: `Bank •••• ${normalizedLast4}`,
    details: `Sort code ${sortCode}`,
  };
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

// ── Order signature ──────────────────────────────────────────────────────

export function buildOrderSignature(params: {
  buyerId: string;
  listingId: string;
  addressId?: number;
  paymentMethodId?: number;
  carrierId?: string;
  platformCharge: number;
  postageFee: number;
  walletDebit?: number;
  paymentGatewayId?: string;
}): string {
  return [
    params.buyerId,
    params.listingId,
    params.addressId ?? 'none',
    params.paymentMethodId ?? 'none',
    params.carrierId ?? 'none',
    params.platformCharge.toFixed(2),
    params.postageFee.toFixed(2),
    params.walletDebit?.toFixed(2) ?? 'none',
    params.paymentGatewayId ?? 'none',
  ].join('|');
}
