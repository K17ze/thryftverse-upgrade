/**
 * Verification + trust contracts — web port of the mobile wire shapes in
 * frontend/src/services/marketApi.ts (CoOwnVerificationDemand /
 * SellerVerificationDemand) and frontend/src/services/complianceApi.ts
 * (Dac7TaxInfo). Field names match the backend payloads 1:1 so live mode
 * needs no mapping layer.
 */

// ── Seller verification demands ─────────────────────────────────────────────
// A buyer (or the platform) can demand proof on a Co-Own asset the seller
// issued — authenticity, possession, condition or an in-person inspection.

export type VerificationDemandType =
  | 'authenticity'
  | 'possession'
  | 'condition'
  | 'inspection';

export type VerificationDemandStatus =
  | 'pending'
  | 'responded'
  | 'compliant'
  | 'failed'
  | 'expired'
  | 'withdrawn';

export type InspectorVerdict = 'compliant' | 'failed' | 'inconclusive' | null;

/** GET /co-own/seller/:userId/verification-demands — per-demand row. */
export interface SellerVerificationDemand {
  id: number;
  /** Co-Own asset the demand targets. */
  assetId: string;
  assetTitle: string;
  assetImageUrl: string | null;
  /** Buyer id that raised the demand. */
  requestedBy: string;
  demandType: VerificationDemandType;
  /** ISO deadline — missing it can trigger recourse. */
  deadline: string;
  status: VerificationDemandStatus;
  respondedAt: string | null;
  evidenceUrl: string | null;
  evidenceNotes: string | null;
  inspectorVerdict: InspectorVerdict;
  createdAt: string;
}

// ── DAC7 tax information ────────────────────────────────────────────────────
// EU DAC7 directive: platforms report seller tax data to EU tax authorities.
// GET/POST /compliance/dac7/:userId — mirrors mobile complianceApi.ts.

export type Dac7Status = 'declared' | 'verified' | 'rejected' | 'expired';

export interface Dac7TaxInfo {
  tin: string;
  taxResidenceCountry: string;
  isEuResident: boolean;
  selfDeclared: boolean;
  selfDeclaredAt: string | null;
  status: Dac7Status;
  verifiedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/** POST body for saving DAC7 details. */
export interface Dac7TaxInfoInput {
  tin: string;
  taxResidenceCountry: string;
  isEuResident: boolean;
  selfDeclared: boolean;
}

// ── Country lists (ported from mobile domain/verification.ts) ───────────────

export const EU_COUNTRIES: readonly string[] = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR',
  'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL',
  'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
];

export const UK_COUNTRIES: readonly string[] = ['GB', 'IE'];

/**
 * Tax-residence picker list. 'IE' appears in both the UK list (Common
 * Travel Area grouping) and the EU list — deduped so the chip row never
 * repeats a country.
 */
export const TAX_RESIDENCE_COUNTRIES: readonly string[] = [
  ...new Set([...UK_COUNTRIES, ...EU_COUNTRIES]),
];
