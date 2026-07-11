// Global address format supporting all countries
export interface CheckoutSavedAddress {
  id?: number;
  name: string;
  // Address lines
  streetAddress: string; // Primary street address
  apartment?: string;    // Apartment, suite, unit, floor, etc.
  // Location hierarchy
  city: string;        // City / Town / Village
  region?: string;      // State (US), Province (CA), County (UK), Prefecture (JP), etc.
  postalCode: string;  // ZIP (US), Postcode (UK), PIN (IN), etc.
  countryCode: string;   // ISO 3166-1 alpha-2 (e.g., 'US', 'GB', 'IN', 'JP')
  country: string;       // Display name (e.g., 'United States', 'United Kingdom')
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
  return Boolean(savedAddress && savedPaymentMethod);
}

export function buildCardPaymentMethod(
  cardLast4: string,
  expiry: string,
  brand: string = 'Visa'
): CheckoutSavedPaymentMethod {
  const normalizedLast4 = cardLast4.replace(/\D/g, '').slice(-4).padStart(4, '0');

  return {
    type: 'card',
    label: `${brand} •••• ${normalizedLast4}`,
    details: `Expires ${expiry}`,
  };
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