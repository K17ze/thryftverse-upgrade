import { fetchJson } from '../lib/apiClient';

export type CapabilityCountryCluster =
  | 'IN'
  | 'US'
  | 'UK'
  | 'EUROPE'
  | 'MIDDLE_EAST'
  | 'CHINA_NEARBY'
  | 'GLOBAL';

export type CapabilityPaymentGatewayId =
  | 'stripe_americas'
  | 'razorpay_in'
  | 'mollie_eu'
  | 'flutterwave_africa'
  | 'tap_gulf'
  | 'wise_global'
  | 'mock_fiat_gbp';

export type CapabilityPaymentChannel = 'commerce' | 'co-own' | 'wallet_topup' | 'wallet_withdrawal';
export type CapabilityPaymentMethodType = 'card' | 'bank_account' | 'wallet' | 'apple_pay' | 'google_pay';

export interface CapabilityCarrier {
  id: string;
  label: string;
  priceFromGbp: number;
  etaMinDays: number;
  etaMaxDays: number;
  tracking: boolean;
}

export type CapabilityTaxType = 'vat' | 'gst' | 'sales_tax' | 'none';
export type CapabilityTaxBasis = 'destination' | 'origin';

export interface CapabilityTaxRule {
  type: CapabilityTaxType;
  basis: CapabilityTaxBasis;
  standardRate: number;
  reducedRate: number | null;
  zeroRatedCategories: string[];
  registrationThresholdGbp: number | null;
  digitalServicesRate: number | null;
}

export type CapabilityRestrictedItemCategory =
  | 'weapons'
  | 'firearms'
  | 'knives'
  | 'alcohol'
  | 'tobacco'
  | 'pharmaceuticals'
  | 'cosmetics_restricted'
  | 'electronics_uncertified'
  | 'ivory_wildlife'
  | 'counterfeit'
  | 'hazardous_materials'
  | 'adult_content'
  | 'precious_metals_bulk';

export interface CapabilityRestrictedItem {
  category: CapabilityRestrictedItemCategory;
  reason: string;
  severity: 'prohibited' | 'restricted';
  requiresLicense: boolean;
}

export interface CapabilityAgeRestriction {
  minimumAge: number;
  categories: string[];
  verificationRequired: boolean;
}

export type CapabilityShippingZone =
  | 'domestic'
  | 'regional'
  | 'europe'
  | 'north_america'
  | 'asia_pacific'
  | 'middle_east'
  | 'global';

export interface UserCountryCapabilities {
  policyVersion: string;
  generatedAt: string;
  countryCode: string;
  residencyCountryCode: string | null;
  effectiveCountryCode: string;
  countryCluster: CapabilityCountryCluster;
  jurisdictionGroups: string[];
  currency: {
    defaultCurrency: string;
    supportedCurrencies: string[];
  };
  payments: {
    stableCoinEnabled: boolean;
    methodTypes: CapabilityPaymentMethodType[];
    gatewaysByChannel: Record<CapabilityPaymentChannel, CapabilityPaymentGatewayId[]>;
  };
  payouts: {
    defaultCurrency: string;
    supportedCurrencies: string[];
    gatewayPriority: CapabilityPaymentGatewayId[];
  };
  postage: {
    carriers: CapabilityCarrier[];
  };
  tax: CapabilityTaxRule;
  restrictedItems: CapabilityRestrictedItem[];
  ageRestrictions: CapabilityAgeRestriction[];
  shippingZones: CapabilityShippingZone[];
}

interface UserCapabilitiesResponse {
  ok: true;
  userId: string;
  profile: {
    countryCode: string;
    residencyCountryCode: string | null;
    kycStatus: string;
  };
  capabilities: UserCountryCapabilities;
}

export async function getUserCountryCapabilities(userId: string): Promise<UserCountryCapabilities> {
  const payload = await fetchJson<UserCapabilitiesResponse>(
    `/users/${encodeURIComponent(userId)}/capabilities`
  );

  return payload.capabilities;
}