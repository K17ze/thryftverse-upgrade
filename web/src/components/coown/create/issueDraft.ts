/**
 * Issue-studio draft model — the single source of truth for the wizard.
 * Field names track the POST /co-own/assets wire schema so the payload
 * builder is a thin projection, and the validators mirror the server's
 * own bounds (coOwn.ts body schema) rather than inventing local rules.
 */

import type { Listing } from '@/lib/contracts/domain';
import {
  unitPriceStableFor,
  type CreateCoOwnAssetInput,
} from '@/lib/api/services/coownIssuance';
import { getListingCoverUri, isUsableUri } from '@/lib/utils/media';

export const ISSUE_STEPS = [
  'verify',
  'listing',
  'economics',
  'structure',
  'authenticity',
  'review',
  'recourse',
] as const;

export type IssueStep = (typeof ISSUE_STEPS)[number];

export const ISSUE_STEP_LABELS: Record<IssueStep, string> = {
  verify: 'Verification',
  listing: 'Listing',
  economics: 'Economics',
  structure: 'Structure',
  authenticity: 'Authenticity',
  review: 'Review',
  recourse: 'Recourse',
};

export const LEGAL_VEHICLE_OPTIONS: ReadonlyArray<{
  value: CreateCoOwnAssetInput['legalVehicleType'];
  label: string;
}> = [
  { value: 'spv', label: 'SPV' },
  { value: 'llc', label: 'LLC' },
  { value: 'trust', label: 'Trust' },
  { value: 'series_llc', label: 'Series LLC' },
  { value: 'none', label: 'None' },
];

export const LEGAL_VEHICLE_LABELS: Record<string, string> = {
  spv: 'SPV',
  llc: 'LLC',
  trust: 'Trust',
  series_llc: 'Series LLC',
  none: 'None',
};

export interface IssueDraft {
  listingId: string | null;
  /** Optional pool title — blank lets the server name it
   *  "<listing> Fraction Pool". */
  title: string;
  /** Optional issuer jurisdiction (schema: 2–10 chars — a country code). */
  issuerJurisdiction: string;
  totalUnits: string;
  unitPriceGbp: string;
  legalVehicleType: CreateCoOwnAssetInput['legalVehicleType'];
  legalVehicleName: string;
  legalVehicleJurisdiction: string;
  custodianName: string;
  custodianLocation: string;
  custodyInsured: boolean;
  custodyInsurer: string;
  custodyPolicyRef: string;
  custodyCoverageGbp: string;
  authenticityStatus: 'unverified' | 'pending';
  authenticityMethod: string;
  provenance: string;
  conditionGrade: string;
  appraisalValueGbp: string;
  /** `date` input value (YYYY-MM-DD) — converted to ISO on the wire. */
  appraisalValuedAt: string;
  appraisalValuer: string;
  buyerProtection: boolean;
  buyerProtectionTermsUrl: string;
}

export const INITIAL_ISSUE_DRAFT: IssueDraft = {
  listingId: null,
  title: '',
  issuerJurisdiction: '',
  totalUnits: '',
  unitPriceGbp: '',
  legalVehicleType: 'spv',
  legalVehicleName: '',
  legalVehicleJurisdiction: '',
  custodianName: '',
  custodianLocation: '',
  custodyInsured: false,
  custodyInsurer: '',
  custodyPolicyRef: '',
  custodyCoverageGbp: '',
  authenticityStatus: 'unverified',
  authenticityMethod: '',
  provenance: '',
  conditionGrade: '',
  appraisalValueGbp: '',
  appraisalValuedAt: '',
  appraisalValuer: '',
  buyerProtection: false,
  buyerProtectionTermsUrl: '',
};

export type IssueFieldErrors = Partial<Record<keyof IssueDraft, string>>;

// ── Field parsing ───────────────────────────────────────────────────

export function parseUnits(raw: string): number {
  const n = Number(raw);
  return Number.isInteger(n) ? n : NaN;
}

export function parseMoney(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

/** Decimal-pad input sanitiser — digits and one dot, two places max
 *  (same grammar as the wallet convert field). */
export function sanitizeDecimal(raw: string): string {
  const dot = raw.indexOf('.');
  if (dot === -1) return raw.replace(/\D/g, '').slice(0, 9);
  const head = raw.slice(0, dot).replace(/\D/g, '').slice(0, 9);
  const tail = raw.slice(dot + 1).replace(/\D/g, '').slice(0, 2);
  return `${head}.${tail}`;
}

export function sanitizeInteger(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 3);
}

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function trimOrUndefined(raw: string): string | undefined {
  const v = raw.trim();
  return v.length ? v : undefined;
}

// ── Per-step validators — same bounds the zod schema enforces ────────

export function validateListingStep(draft: IssueDraft, eligible: readonly Listing[]): IssueFieldErrors {
  if (!draft.listingId || !eligible.some((l) => l.id === draft.listingId)) {
    return { listingId: 'Pick one of your active listings' };
  }
  if (draft.title.trim() && draft.title.trim().length < 3) {
    return { title: 'Pool title needs at least 3 characters' };
  }
  return {};
}

export function validateEconomicsStep(draft: IssueDraft, maxUnits: number): IssueFieldErrors {
  const errors: IssueFieldErrors = {};
  const units = parseUnits(draft.totalUnits);
  if (!Number.isFinite(units) || units < 1) {
    errors.totalUnits = 'Set a whole number of units';
  } else if (units > maxUnits) {
    errors.totalUnits = `Issuance is capped at ${maxUnits} units`;
  }
  const price = parseMoney(draft.unitPriceGbp);
  if (!Number.isFinite(price) || price <= 0) {
    errors.unitPriceGbp = 'Set a unit price above £0';
  } else if (price > 1_000_000) {
    errors.unitPriceGbp = 'Unit price is too high';
  }
  return errors;
}

export function validateStructureStep(draft: IssueDraft): IssueFieldErrors {
  const errors: IssueFieldErrors = {};
  // Server invariant: a non-'none' vehicle must be named
  // (VEHICLE_NAME_REQUIRED).
  if (draft.legalVehicleType !== 'none' && draft.legalVehicleName.trim().length < 2) {
    errors.legalVehicleName = 'Name the legal vehicle — required for this type';
  }
  if (draft.issuerJurisdiction.trim() && draft.issuerJurisdiction.trim().length < 2) {
    errors.issuerJurisdiction = 'Use a jurisdiction code (e.g. GB)';
  }
  // Server invariant: insured custody must name the insurer
  // (INSURER_REQUIRED).
  if (draft.custodyInsured && draft.custodyInsurer.trim().length < 2) {
    errors.custodyInsurer = 'Name the insurer for an insured custody claim';
  }
  if (draft.custodyCoverageGbp.trim()) {
    const coverage = parseMoney(draft.custodyCoverageGbp);
    if (!Number.isFinite(coverage) || coverage < 0) {
      errors.custodyCoverageGbp = 'Coverage must be £0 or more';
    }
  }
  if (draft.buyerProtection && draft.buyerProtectionTermsUrl.trim()
      && !isHttpUrl(draft.buyerProtectionTermsUrl.trim())) {
    errors.buyerProtectionTermsUrl = 'Terms must be a full https:// link';
  }
  return errors;
}

export function validateAuthenticityStep(draft: IssueDraft): IssueFieldErrors {
  const errors: IssueFieldErrors = {};
  if (draft.authenticityMethod.trim() && draft.authenticityMethod.trim().length < 2) {
    errors.authenticityMethod = 'Method needs at least 2 characters';
  }
  if (draft.provenance.trim()) {
    const p = draft.provenance.trim();
    if (p.length < 2) errors.provenance = 'Provenance needs more detail';
    else if (p.length > 2000) errors.provenance = 'Provenance is capped at 2,000 characters';
  }
  if (draft.conditionGrade.trim().length > 64) {
    errors.conditionGrade = 'Keep the grade under 64 characters';
  }
  if (draft.appraisalValueGbp.trim()) {
    const value = parseMoney(draft.appraisalValueGbp);
    if (!Number.isFinite(value) || value < 0) {
      errors.appraisalValueGbp = 'Appraisal must be £0 or more';
    }
  }
  if (draft.appraisalValuedAt.trim() && Number.isNaN(Date.parse(draft.appraisalValuedAt))) {
    errors.appraisalValuedAt = 'Pick a valid date';
  }
  return errors;
}

// ── Wire projection ─────────────────────────────────────────────────

/** Draft → POST body. Optional fields are omitted entirely when blank —
 *  the server applies its own defaults (title, cover image, unverified
 *  status) rather than receiving empty strings. */
export function buildIssuePayload(
  draft: IssueDraft,
  listing: Listing,
  issuerId: string,
  issuanceId: string,
): CreateCoOwnAssetInput {
  const units = parseUnits(draft.totalUnits);
  const unitPriceGbp = Math.round(parseMoney(draft.unitPriceGbp) * 10_000) / 10_000;
  const cover = getListingCoverUri(listing.images);
  const valuedAt = draft.appraisalValuedAt.trim();
  const valuedMs = valuedAt ? Date.parse(valuedAt) : NaN;

  return {
    id: issuanceId,
    listingId: listing.id,
    issuerId,
    title: trimOrUndefined(draft.title),
    imageUrl: isUsableUri(cover) && isHttpUrl(cover) ? cover : undefined,
    totalUnits: units,
    unitPriceGbp,
    unitPriceStable: unitPriceStableFor(unitPriceGbp),
    settlementMode: 'ONEZE',
    issuerJurisdiction: trimOrUndefined(draft.issuerJurisdiction),
    legalVehicleType: draft.legalVehicleType,
    legalVehicleName:
      draft.legalVehicleType !== 'none' ? trimOrUndefined(draft.legalVehicleName) : undefined,
    legalVehicleJurisdiction:
      draft.legalVehicleType !== 'none'
        ? trimOrUndefined(draft.legalVehicleJurisdiction)
        : undefined,
    custodianName: trimOrUndefined(draft.custodianName),
    custodianLocation: trimOrUndefined(draft.custodianLocation),
    custodyInsured: draft.custodyInsured || undefined,
    custodyInsurer: draft.custodyInsured ? trimOrUndefined(draft.custodyInsurer) : undefined,
    custodyPolicyRef: draft.custodyInsured ? trimOrUndefined(draft.custodyPolicyRef) : undefined,
    custodyCoverageGbp:
      draft.custodyInsured && draft.custodyCoverageGbp.trim()
        ? parseMoney(draft.custodyCoverageGbp)
        : undefined,
    authenticityStatus: draft.authenticityStatus,
    authenticityMethod: trimOrUndefined(draft.authenticityMethod),
    provenance: trimOrUndefined(draft.provenance),
    conditionGrade: trimOrUndefined(draft.conditionGrade),
    appraisalValueGbp: draft.appraisalValueGbp.trim()
      ? parseMoney(draft.appraisalValueGbp)
      : undefined,
    appraisalValuedAt: Number.isFinite(valuedMs)
      ? new Date(valuedMs).toISOString()
      : undefined,
    appraisalValuer: trimOrUndefined(draft.appraisalValuer),
    buyerProtection: draft.buyerProtection || undefined,
    buyerProtectionTermsUrl:
      draft.buyerProtection && isHttpUrl(draft.buyerProtectionTermsUrl.trim())
        ? draft.buyerProtectionTermsUrl.trim()
        : undefined,
  };
}

// ── Server-error → owning step ───────────────────────────────────────

/** Maps a rejected submit back to the step that owns the field so the
 *  issuer lands on the fix, not the summary. */
export function stepForSubmitError(code: string | null): IssueStep | null {
  switch (code) {
    case 'ISSUER_KYC_REQUIRED':
      return 'verify';
    case 'LISTING_OWNERSHIP_DENIED':
    case 'LISTING_NOT_COOWNABLE':
      return 'listing';
    case 'VEHICLE_NAME_REQUIRED':
    case 'INSURER_REQUIRED':
      return 'structure';
    case 'AUTHENTICITY_REVIEW_REQUIRED':
      return 'authenticity';
    default:
      return null;
  }
}
