import type {
  CapabilityPaymentMethodType,
  UserCountryCapabilities,
} from '../services/capabilitiesApi';

export function toClusterLabel(cluster: string): string {
  return cluster
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

export function formatCountryPolicyScope(
  capabilities: Pick<UserCountryCapabilities, 'effectiveCountryCode' | 'countryCluster'> | null | undefined
): string | null {
  if (!capabilities) {
    return null;
  }

  return `${capabilities.effectiveCountryCode} · ${toClusterLabel(capabilities.countryCluster)}`;
}

/**
 * Whether the regional capability payload permits `methodType`.
 *
 * `capabilities === null/undefined` means the capability fetch did not
 * produce a verified payload — the method's status is UNVERIFIED, not
 * allowed. `fallback` decides how an unverified capability resolves:
 * callers default to `true` (fail-open) because the card rail predates
 * capabilities and must stay usable when verification is unavailable,
 * but branded affordances that claim a specific tender (Apple Pay /
 * Google Pay CTAs) must pass `false` — an unverified capability can
 * never back a branded promise.
 */
export function isPaymentMethodAllowed(
  capabilities: Pick<UserCountryCapabilities, 'payments'> | null | undefined,
  methodType: CapabilityPaymentMethodType,
  fallback = true
): boolean {
  if (!capabilities) {
    return fallback;
  }

  return capabilities.payments.methodTypes?.includes(methodType) ?? fallback;
}

export function formatPayoutPolicyHint(capabilities: UserCountryCapabilities | null | undefined): string | null {
  if (!capabilities) {
    return null;
  }

  return `Payout default ${capabilities.payouts.defaultCurrency} · Supported ${capabilities.payouts.supportedCurrencies.join(', ')}`;
}