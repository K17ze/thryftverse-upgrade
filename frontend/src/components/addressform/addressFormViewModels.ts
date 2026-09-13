import {
  lookupUKPostcode,
  isUKPostcode,
  type PostcodeLookupResult } from '../../utils/postcodeLookup';

// Pure derivations for the address form — keeps the orchestrator thin.
// Mirrors components/checkout/checkoutViewModels.ts.

// The store's SavedAddress shape is not exported — structural mirror of
// the fields the form reads when seeding an edit session.
export interface AddressFormSavedAddress {
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

export interface CountryOption {
  code: string;
  name: string;
  flag: string;
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪' },
];

export const COUNTRY_NAMES = COUNTRY_OPTIONS.map((c) => `${c.flag}  ${c.name}`);

export interface AddressFormState {
  name: string;
  streetAddress: string;
  apartment: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  country: string;
  isDefault: boolean;
}

export const ADDRESS_FORM_DEFAULTS: AddressFormState = {
  name: '',
  streetAddress: '',
  apartment: '',
  city: '',
  region: '',
  postalCode: '',
  countryCode: '',
  country: '',
  isDefault: true };

export function normaliseAddressForm(f: AddressFormState): AddressFormState {
  return {
    name: f.name.trim(),
    streetAddress: f.streetAddress.trim(),
    apartment: f.apartment.trim(),
    city: f.city.trim(),
    region: f.region.trim(),
    postalCode: f.postalCode.trim().toUpperCase(),
    countryCode: f.countryCode,
    country: f.country,
    isDefault: f.isDefault };
}

export function addressFormsEqual(a: AddressFormState, b: AddressFormState): boolean {
  const na = normaliseAddressForm(a);
  const nb = normaliseAddressForm(b);
  return (
    na.name === nb.name &&
    na.streetAddress === nb.streetAddress &&
    na.apartment === nb.apartment &&
    na.city === nb.city &&
    na.region === nb.region &&
    na.postalCode === nb.postalCode &&
    na.countryCode === nb.countryCode &&
    na.country === nb.country &&
    // isDefault is persisted by handleSave — excluding it here would let the
    // "Save as default" toggle be silently discarded on back-navigation.
    na.isDefault === nb.isDefault
  );
}

export interface AddressFieldErrors {
  name?: string;
  streetAddress?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

export function validateAddressForm(f: AddressFormState): AddressFieldErrors {
  const errors: AddressFieldErrors = {};
  if (f.name.trim().length < 2) {
    errors.name = 'Enter a full name (at least 2 characters).';
  }
  if (f.streetAddress.trim().length < 3) {
    errors.streetAddress = 'Enter a street address (at least 3 characters).';
  }
  if (f.city.trim().length < 2) {
    errors.city = 'Enter a city or town (at least 2 characters).';
  }
  if (f.postalCode.trim().length < 2) {
    errors.postalCode = 'Enter a valid postal code (at least 2 characters).';
  }
  if (f.postalCode.trim().length > 12) {
    errors.postalCode = 'Postal code seems too long.';
  }
  if (!f.countryCode || !f.country) {
    errors.country = 'Select a country.';
  }
  return errors;
}

/**
 * Seeds the form state from a saved address in edit mode, otherwise
 * returns the add-mode defaults.
 */
export function buildInitialAddressForm(
  isEditing: boolean,
  savedAddress: AddressFormSavedAddress | null,
): AddressFormState {
  if (isEditing && savedAddress) {
    return {
      name: savedAddress.name,
      streetAddress: savedAddress.streetAddress,
      apartment: savedAddress.apartment ?? '',
      city: savedAddress.city,
      region: savedAddress.region ?? '',
      postalCode: savedAddress.postalCode,
      countryCode: savedAddress.countryCode,
      country: savedAddress.country,
      isDefault: savedAddress.isDefault ?? true };
  }
  return { ...ADDRESS_FORM_DEFAULTS };
}

/**
 * Postcode autocomplete suggestion — non-null when a UK postcode is
 * detected and the suggested city/region differs from what's already
 * entered.
 */
export function derivePostcodeSuggestion(
  form: Pick<AddressFormState, 'postalCode' | 'countryCode' | 'city' | 'region'>,
): PostcodeLookupResult | null {
  if (!form.postalCode || form.postalCode.trim().length < 2) return null;
  if (!isUKPostcode(form.postalCode)) return null;
  if (form.countryCode && form.countryCode !== 'GB') return null;
  const result = lookupUKPostcode(form.postalCode);
  if (!result) return null;
  // Only show if city or region is empty or different from suggestion
  const cityDiffers = form.city.trim().toLowerCase() !== result.city.toLowerCase();
  const regionDiffers = form.region.trim().toLowerCase() !== result.region.toLowerCase();
  if (!cityDiffers && !regionDiffers) return null;
  return result;
}

/**
 * The picker returns "🇬🇧  United Kingdom" — strip the flag prefix and
 * resolve back to the option.
 */
export function findCountryOption(displayValue: string): CountryOption | undefined {
  const strippedName = displayValue.replace(/^[^\s]+\s+/, '');
  return COUNTRY_OPTIONS.find((c) => c.name === strippedName);
}

/**
 * The picker's selectedValue for the current form country — reattaches
 * the flag prefix so the option row matches.
 */
export function countryPickerSelectedValue(country: string): string | undefined {
  return country
    ? `${COUNTRY_OPTIONS.find((c) => c.name === country)?.flag ?? ''}  ${country}`
    : undefined;
}
