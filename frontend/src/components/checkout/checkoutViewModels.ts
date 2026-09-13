import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { CheckoutStage } from '../../utils/checkoutFlow';
import { STAGE_LABELS } from '../../utils/checkoutFlow';
import { isPaymentMethodAllowed } from '../../utils/capabilityPolicy';
import type { UserCountryCapabilities } from '../../services/capabilitiesApi';

// Pure derivations for the checkout screen — keeps the orchestrator thin.
// Mirrors components/seller/hubViewModels.ts.

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// The store's SavedAddress shape is not exported — structural mirrors of
// the fields each derivation reads.
export interface CheckoutAddressLike {
  id?: number;
  name: string;
  streetAddress: string;
  apartment?: string;
  city: string;
  region?: string;
  postalCode: string;
  country: string;
}

export interface CheckoutPaymentMethodLike {
  id?: number;
  type: 'card' | 'bank_account' | 'apple_pay' | 'google_pay';
  label: string;
  details?: string;
}

export interface CheckoutPartialDataPrompt {
  icon: IoniconName;
  message: string;
  action: { label: string; onPress: () => void };
}

interface PartialDataPromptInput {
  isHydrating: boolean;
  isInteractionLocked: boolean;
  shippingError: string | null;
  addressLoaded: boolean;
  paymentLoaded: boolean;
  hasCarrier: boolean;
  onRetryHydrate: () => void;
  onAddAddress: () => void;
  onAddPayment: () => void;
}

export function buildPartialDataPrompt({
  isHydrating,
  isInteractionLocked,
  shippingError,
  addressLoaded,
  paymentLoaded,
  hasCarrier,
  onRetryHydrate,
  onAddAddress,
  onAddPayment,
}: PartialDataPromptInput): CheckoutPartialDataPrompt | null {
  if (isHydrating || isInteractionLocked) return null;

  // Shipping quote failed but address + payment are ready → proceed with
  // standard (estimated) shipping. The carrier is still selected, only the
  // live quote is unavailable.
  if (shippingError && addressLoaded && paymentLoaded && hasCarrier) {
    return {
      icon: 'information-circle-outline' as const,
      message: 'Shipping quote unavailable — proceeding with standard shipping.',
      action: { label: 'Try again', onPress: onRetryHydrate },
    };
  }

  // Address missing but payment methods loaded → prompt to add an address.
  if (!addressLoaded && paymentLoaded) {
    return {
      icon: 'location-outline' as const,
      message: 'Add a delivery address to continue.',
      action: { label: 'Add address', onPress: onAddAddress },
    };
  }

  // Payment methods missing but address loaded → prompt to add a payment method.
  if (!paymentLoaded && addressLoaded) {
    return {
      icon: 'card-outline' as const,
      message: 'Add a payment method to continue.',
      action: {
        label: 'Add payment',
        onPress: onAddPayment,
      },
    };
  }

  return null;
}

export function getCheckoutAddressSubtitle(savedAddress: CheckoutAddressLike | null): string {
  return savedAddress
    ? `${savedAddress.streetAddress}${savedAddress.apartment ? `, ${savedAddress.apartment}` : ''}\n${savedAddress.city}${savedAddress.region ? `, ${savedAddress.region}` : ''} · ${savedAddress.postalCode}\n${savedAddress.country}`
    : 'Required for delivery';
}

export function getCheckoutPayLabel({
  stage,
  isSubmitting,
  useOnezePayment,
  grossTotal,
  walletAvailable,
  formattedTotal,
}: {
  stage: CheckoutStage;
  isSubmitting: boolean;
  useOnezePayment: boolean;
  grossTotal: number;
  walletAvailable: boolean;
  formattedTotal: string;
}): string {
  return isSubmitting
    ? STAGE_LABELS[stage] || 'Processing'
    : stage === 'payment_failed'
      ? 'Retry payment'
      : stage === 'payment_pending'
        ? 'Waiting for confirmation'
        : stage === 'unknown_outcome'
          ? 'Checking payment'
          : useOnezePayment
          ? `Pay ${Math.ceil(grossTotal).toLocaleString()} 1ZE`
          : walletAvailable
            ? 'Pay with card'
            : `Pay ${formattedTotal}`;
}

// ── Progress indicator ──
// Compact 3-dot indicator showing the logical checkout sections. Each dot
// fills when its section is complete, reducing anxiety by showing the user
// what's involved and where they are in the flow (2026 UX research:
// "Progress indicator = reduces anxiety").
export function computeCheckoutStepCompletion({
  hasSavedAddressId,
  hasCarrier,
  useOnezePayment,
  onezeBalance,
  grossTotal,
  savedPaymentMethod,
  checkoutCapabilities,
  useBalance,
  walletBalance,
  checkoutEligible,
}: {
  hasSavedAddressId: boolean;
  hasCarrier: boolean;
  useOnezePayment: boolean;
  onezeBalance: number;
  grossTotal: number;
  savedPaymentMethod: CheckoutPaymentMethodLike | null;
  checkoutCapabilities: UserCountryCapabilities | null;
  useBalance: boolean;
  walletBalance: number;
  checkoutEligible: boolean;
}): { deliveryStepComplete: boolean; paymentStepComplete: boolean; reviewStepComplete: boolean } {
  const deliveryStepComplete = hasSavedAddressId && hasCarrier;
  const paymentStepComplete = useOnezePayment
    ? onezeBalance >= grossTotal
    : (!!savedPaymentMethod?.id && isPaymentMethodAllowed(checkoutCapabilities, savedPaymentMethod.type))
      || (useBalance && walletBalance >= grossTotal);
  const reviewStepComplete = checkoutEligible;
  return { deliveryStepComplete, paymentStepComplete, reviewStepComplete };
}

// Row-level errorText is suppressed when the partial-data banner already
// covers that case (avoids duplicate messaging). Inline validation errors
// show only after the user has attempted to pay (hasAttemptedPay) and
// clear automatically as fields become valid — no manual reset needed.
export function computeCheckoutRowErrors({
  partialDataIcon,
  hasCarrier,
  hasAttemptedPay,
  hasSavedAddressId,
  paymentStepComplete,
  useOnezePayment,
  hasSavedPaymentMethodId,
}: {
  partialDataIcon: IoniconName | undefined;
  hasCarrier: boolean;
  hasAttemptedPay: boolean;
  hasSavedAddressId: boolean;
  paymentStepComplete: boolean;
  useOnezePayment: boolean;
  hasSavedPaymentMethodId: boolean;
}): {
  suppressAddressError: boolean;
  suppressPaymentError: boolean;
  suppressShippingError: boolean;
  inlineAddressError: string | undefined;
  inlinePaymentError: string | undefined;
} {
  const suppressAddressError = partialDataIcon === 'location-outline';
  const suppressPaymentError = partialDataIcon === 'card-outline';
  const suppressShippingError =
    partialDataIcon === 'information-circle-outline' && hasCarrier;

  const inlineAddressError = hasAttemptedPay && !hasSavedAddressId ? 'Delivery address required' : undefined;
  const inlinePaymentError = hasAttemptedPay && !paymentStepComplete && !useOnezePayment
    ? (!hasSavedPaymentMethodId ? 'Payment method required' : undefined)
    : undefined;

  return {
    suppressAddressError,
    suppressPaymentError,
    suppressShippingError,
    inlineAddressError,
    inlinePaymentError,
  };
}
