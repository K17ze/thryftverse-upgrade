import {
  VERIFICATION_TIERS,
  type VerificationTier,
  type VerificationTierInfo } from '../platform/product/listingDetailContract';

/**
 * Pure view-model derivations for the Verification surface — identity (KYC)
 * and DAC7 tax-residence step machines, status copy, and document metadata.
 * No React, no theme, no services: safe to unit-test and reuse.
 */

export type KycStep = 'status' | 'identity' | 'document' | 'review';
export type Dac7Step = 'status' | 'details' | 'review';
export type KycDocumentType = 'passport' | 'driving_licence' | 'national_id';

export const KYC_DOCUMENT_TYPES: readonly KycDocumentType[] = [
  'passport',
  'driving_licence',
  'national_id',
];

export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
];

export const UK_COUNTRIES = ['GB', 'IE'];

/**
 * DAC7 country-of-residence picker list. 'IE' appears in both the UK list
 * (Common Travel Area grouping) and the EU list — deduped here so the chip
 * row never emits a duplicate React key or a repeated chip.
 */
export const TAX_RESIDENCE_COUNTRIES: readonly string[] = [
  ...new Set([...UK_COUNTRIES, ...EU_COUNTRIES]),
];

export const VERIFICATION_GUIDE_URL = 'https://thryftverse.com/verification';

/**
 * §11 truthfulness: verification status must be backend-authoritative.
 * Local coOwnCompliance.kycVerified is a stale cache that can outlive a
 * revocation — never use it to grant a verified badge.
 */
export function deriveVerificationTierInfo(
  kycBackendVerified: boolean
): VerificationTierInfo {
  const currentTier: VerificationTier | null = kycBackendVerified ? 'id' : null;
  return kycBackendVerified && currentTier
    ? VERIFICATION_TIERS[currentTier]
    : {
        tier: 'email' as const,
        label: 'Unverified',
        icon: 'alert-circle-outline',
        color: 'textSecondary',
        description: 'Verify your identity with a government document to get the trust badge' };
}

export function resolveEmailRowCopy(emailVerified: boolean): {
  subtitle: string;
  value: string;
} {
  return emailVerified
    ? { subtitle: 'Confirmed', value: 'Confirmed' }
    : { subtitle: 'Pending — check your inbox', value: 'Pending' };
}

export function resolveIdentityRowCopy(
  kycBackendVerified: boolean,
  kycBackendPending: boolean
): { subtitle: string; value: string } {
  if (kycBackendVerified) {
    return { subtitle: 'ID verified', value: 'Verified' };
  }
  if (kycBackendPending) {
    return { subtitle: 'Verification under review', value: 'Pending' };
  }
  return {
    subtitle: 'Verify your identity with a government document',
    value: 'Start' };
}

export function resolveDac7RowSubtitle(
  dac7Completed: boolean,
  taxResidenceCountry: string
): string {
  return dac7Completed
    ? `Tax information provided · ${taxResidenceCountry}`
    : 'Required for EU sellers under DAC7 regulation';
}

export function kycStepTitle(step: KycStep): string {
  return step === 'identity' ? 'Your details' : step === 'document' ? 'Document' : 'Review';
}

export function dac7StepTitle(step: Dac7Step): string {
  return step === 'details' ? 'Tax details' : 'Review';
}

export function kycDocumentTypeLabel(type: KycDocumentType): string {
  return type === 'passport' ? 'Passport' : type === 'driving_licence' ? 'Driving licence' : 'National ID';
}

export function kycDocumentTypeIcon(
  type: KycDocumentType
): 'book-outline' | 'car-outline' | 'id-card-outline' {
  return type === 'passport' ? 'book-outline' : type === 'driving_licence' ? 'car-outline' : 'id-card-outline';
}

/** Noun used inside the upload placeholder copy. */
export function kycDocumentTypeNoun(type: KycDocumentType): string {
  return type === 'driving_licence' ? 'licence' : type === 'national_id' ? 'ID card' : 'passport';
}

/** Accessibility label for the document-type option buttons. */
export function kycDocumentSelectLabel(type: KycDocumentType): string {
  return `Select ${type.replace('_', ' ')}`;
}

export interface KycIdentityFields {
  fullName: string;
  dob: string;
  addressLine: string;
  city: string;
  postcode: string;
}

/** The five required identity fields must all be non-empty before submit. */
export function isKycIdentityFormComplete(fields: KycIdentityFields): boolean {
  return Boolean(
    fields.fullName.trim() &&
    fields.dob.trim() &&
    fields.addressLine.trim() &&
    fields.city.trim() &&
    fields.postcode.trim()
  );
}

/**
 * Normalise the user-facing DD/MM/YYYY date-of-birth mask to the ISO 8601
 * `YYYY-MM-DD` format the KYC session endpoint requires (the backend schema
 * rejects `DD/MM/YYYY`). Already-ISO input and anything else passes through
 * unchanged so backend validation stays authoritative.
 */
export function toIsoDateOfBirth(input: string): string {
  const trimmed = input.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return trimmed;
}
