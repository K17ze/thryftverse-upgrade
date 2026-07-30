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
