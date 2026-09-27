/**
 * Verification domain model — pure view-model derivations for the web KYC
 * flow. Ports the mobile `src/domain/verification.ts` step machine, document
 * metadata and copy so the two surfaces stay in lockstep. No React, no
 * storage: safe to unit-test and reuse.
 */

import type { AppIconName } from '@/components/ui/Icon';

// ── Steps & status ──────────────────────────────────────────────────────────

/** Flow steps — mirrors mobile KycStep ('status' renders as StatusView). */
export type VerificationStep = 'intro' | 'identity' | 'document' | 'review' | 'status';

/** Persisted KYC outcome — maps mobile KycStatus onto the four UI states. */
export type VerificationStatus = 'not_started' | 'in_review' | 'approved' | 'rejected';

export type VerificationTier = 'none' | 'email' | 'identity' | 'seller';

// ── Documents ───────────────────────────────────────────────────────────────

export type KycDocumentType = 'passport' | 'driving_licence' | 'national_id';

export const KYC_DOCUMENT_TYPES: readonly KycDocumentType[] = [
  'passport',
  'driving_licence',
  'national_id',
];

export function kycDocumentTypeLabel(type: KycDocumentType): string {
  return type === 'passport'
    ? 'Passport'
    : type === 'driving_licence'
      ? 'Driving licence'
      : 'National ID card';
}

/** Noun used inside upload copy ("a photo of your licence"). */
export function kycDocumentTypeNoun(type: KycDocumentType): string {
  return type === 'driving_licence'
    ? 'licence'
    : type === 'national_id'
      ? 'ID card'
      : 'passport';
}

/** AppIcon stand-ins for mobile's book/car/id-card document glyphs. */
export function kycDocumentTypeIcon(type: KycDocumentType): AppIconName {
  return type === 'passport' ? 'globe' : type === 'driving_licence' ? 'card' : 'document';
}

// ── Upload constraints ──────────────────────────────────────────────────────

export const DOCUMENT_ACCEPT = 'image/jpeg,image/png,image/webp';
export const DOCUMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_DOCUMENT_MB = 8;

/** Validate a picked file — type, size and non-empty. */
export function documentFileError(file: { type: string; size: number }): string | null {
  if (file.size === 0) return 'That file looks empty — try another photo';
  if (!DOCUMENT_MIME_TYPES.includes(file.type)) {
    return 'Upload a JPG, PNG or WebP image of your document';
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `Keep the file under ${MAX_DOCUMENT_MB} MB`;
  }
  return null;
}

// ── Identity fields ─────────────────────────────────────────────────────────

export interface KycIdentityFields {
  fullName: string;
  dob: string;
  addressLine: string;
  city: string;
  postcode: string;
}

export type IdentityErrorMap = Partial<Record<keyof KycIdentityFields, string>>;

/** Minimum verification age — ThryftVerse marketplace is 18+. */
export const MIN_AGE = 18;

/** Mask raw input to the friendly DD/MM/YYYY display format (mobile parity). */
export function formatDobInput(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * Parse a DD/MM/YYYY string into a real calendar Date — rejects impossible
 * dates (31/02, month 13, future years) rather than coercing them.
 */
export function parseDob(input: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1900 || year > new Date().getFullYear()) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

/** Whole years old on `now`, birthday-aware. */
export function ageOn(date: Date, now: Date = new Date()): number {
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) age -= 1;
  return age;
}

/** Field-level DOB error — required, format, calendar validity, 18+. */
export function dobError(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return 'Date of birth is required';
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return 'Use DD/MM/YYYY format';
  const date = parseDob(trimmed);
  if (!date) return 'Enter a valid date of birth';
  if (date.getTime() > Date.now()) return 'Date of birth can’t be in the future';
  if (ageOn(date) < MIN_AGE) return 'You must be 18 or older to verify';
  return null;
}

/** Full identity-step validation — all five fields are required. */
export function identityErrors(fields: KycIdentityFields): IdentityErrorMap {
  const errors: IdentityErrorMap = {};
  const name = fields.fullName.trim();
  if (!name) errors.fullName = 'Legal full name is required';
  else if (name.length < 3) errors.fullName = 'Enter your name exactly as shown on your ID';
  const dob = dobError(fields.dob);
  if (dob) errors.dob = dob;
  if (!fields.addressLine.trim()) errors.addressLine = 'Street address is required';
  if (!fields.city.trim()) errors.city = 'City is required';
  if (!fields.postcode.trim()) errors.postcode = 'Postcode is required';
  return errors;
}

// ── Unlock copy ─────────────────────────────────────────────────────────────

export interface VerificationUnlock {
  icon: AppIconName;
  title: string;
  detail: string;
}

/** What the ID tier unlocks — honest fixture copy, matches mobile tiers. */
export const VERIFICATION_UNLOCKS: readonly VerificationUnlock[] = [
  {
    icon: 'verified',
    title: 'ID Verified badge',
    detail: 'A trust mark on your profile, listings and offers',
  },
  {
    icon: 'people',
    title: 'Co-Own trading',
    detail: 'Buy and trade shared ownership in grail pieces',
  },
  {
    icon: 'store',
    title: 'Sell with higher limits',
    detail: 'The first step towards Trusted Seller status',
  },
];
