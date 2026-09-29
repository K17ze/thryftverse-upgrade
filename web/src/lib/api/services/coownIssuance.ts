/**
 * Web co-own issuance service — the issuer-side surface.
 * Mirrors frontend/src/services/marketApi.ts (fetchIssuerVerification,
 * createCoOwnAsset) against backend/api/src/routes/coOwn.ts:
 *  - GET  /co-own/issuer-verification/:userId  (advisory KYC preflight)
 *  - POST /co-own/assets                       (strict zod create schema)
 *
 * The write is live-only — there is no fixture issuance path.
 */

import { fetchJson } from '../http';
import { mapCoOwnAsset, type MarketCoOwnAssetApi } from '../mappers';
import type { CoOwnAsset } from '@/lib/contracts/coown';
import { GBP_PER_USD } from '@/components/wallet/convertViewModel';

/** Server-enforced issuance cap (backend commercePolicies.ts). The live
 *  policy read (/co-own/policy) is authoritative — this constant is only
 *  the fallback when that read fails. */
export const FALLBACK_MAX_ISSUANCE_UNITS = 20;

// ── Issuer verification — the issuance preflight ──────────────────────
// GET /co-own/issuer-verification/:userId — self-or-admin read of the
// coown_issuer_verification_profile row POST /co-own/assets enforces
// against. Advisory only; the write re-checks the tier server-side.

export interface IssuerVerification {
  tier: 'email' | 'id' | 'seller';
  tierSetAt: string | null;
  kycVerified: boolean;
  sellerStandardsMet: boolean;
}

/** Errors propagate — the caller distinguishes "no profile" (null) from
 *  "couldn't ask" (thrown) rather than collapsing both into a denial. */
export async function fetchIssuerVerification(
  userId: string,
  signal?: AbortSignal,
): Promise<IssuerVerification | null> {
  const payload = await fetchJson<{
    ok: true;
    verification: IssuerVerification | null;
  }>(
    `/co-own/issuer-verification/${encodeURIComponent(userId)}`,
    undefined,
    { signal },
  );
  return payload.verification ?? null;
}

/** The tier the issuance write requires. */
export function canIssueCoOwn(v: IssuerVerification | null | undefined): boolean {
  return v?.tier === 'id' || v?.tier === 'seller';
}

// ── Asset creation ──────────────────────────────────────────────────

/** Strict mirror of the POST /co-own/assets zod schema — every optional
 *  key is omitted (not null'd) when the issuer leaves it blank, and
 *  'verified' authenticity is deliberately unrepresentable: that status
 *  is a platform review outcome, never an issuer assertion. */
export interface CreateCoOwnAssetInput {
  /** Client-minted stable id — reused across retries of the same attempt
   *  so a lost response replays into the same row (the PK refuses a
   *  second insert) instead of double-issuing. */
  id?: string;
  listingId: string;
  issuerId: string;
  title?: string;
  imageUrl?: string;
  totalUnits: number;
  unitPriceGbp: number;
  /** Issuance price in 1ZE — see unitPriceStableFor. */
  unitPriceStable: number;
  settlementMode: 'ONEZE';
  issuerJurisdiction?: string;
  legalVehicleType: 'spv' | 'llc' | 'trust' | 'series_llc' | 'none';
  legalVehicleName?: string;
  legalVehicleJurisdiction?: string;
  custodianName?: string;
  custodianLocation?: string;
  custodyInsured?: boolean;
  custodyInsurer?: string;
  custodyPolicyRef?: string;
  custodyCoverageGbp?: number;
  authenticityStatus?: 'unverified' | 'pending';
  authenticityMethod?: string;
  provenance?: string;
  conditionGrade?: string;
  appraisalValueGbp?: number;
  appraisalValuedAt?: string;
  appraisalValuer?: string;
  buyerProtection?: boolean;
  buyerProtectionTermsUrl?: string;
}

/** Stable client id for one issuance attempt (schema: 4–64 chars). Mint
 *  once per form session and hold it across retries. */
export function newCoOwnIssuanceId(): string {
  return `s_web_${crypto.randomUUID()}`;
}

/** GBP → 1ZE at the codebase's existing rate: 1ZE is USD-par and the
 *  wallet's indicative GBP/USD rate is GBP_PER_USD — the same conversion
 *  the trade panel uses to price the 1ZE obligation. 4dp matches the
 *  server's own storage rounding on this column. */
export function unitPriceStableFor(gbpUnitPrice: number): number {
  if (!Number.isFinite(gbpUnitPrice) || gbpUnitPrice <= 0) return 0;
  return Math.round((gbpUnitPrice / GBP_PER_USD) * 10_000) / 10_000;
}

/** POST /co-own/assets — creates the pool and pauses the source listing
 *  (status='paused', pause_source='coown_asset') in the same transaction.
 *  No transport retries: the route mints a fresh id when none is
 *  supplied, so an auto-replayed POST after an ambiguous failure would
 *  risk double-issuance — the caller holds a stable `id` instead. */
export async function createCoOwnAsset(
  input: CreateCoOwnAssetInput,
): Promise<CoOwnAsset> {
  const payload = await fetchJson<{ ok: true; asset: MarketCoOwnAssetApi }>(
    '/co-own/assets',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    { maxRetries: 0 },
  );
  return mapCoOwnAsset(payload.asset);
}
