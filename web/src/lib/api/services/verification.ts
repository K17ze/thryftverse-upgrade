/**
 * Web verification service — mirrors the mobile endpoints in
 * frontend/src/services/marketApi.ts (seller verification demands) and
 * frontend/src/services/complianceApi.ts (DAC7). Paths hit the same
 * versioned namespace; payloads are the contract shapes — no mapping.
 */

import { fetchJson } from '../http';
import type {
  Dac7TaxInfo,
  Dac7TaxInfoInput,
  SellerVerificationDemand,
  VerificationDemandType,
} from '@/lib/contracts/verification';

// ── Seller verification demands ─────────────────────────────────────────────

/** GET /co-own/seller/:userId/verification-demands */
export async function fetchSellerVerificationDemands(
  userId: string,
  signal?: AbortSignal,
): Promise<SellerVerificationDemand[]> {
  const payload = await fetchJson<{ ok: boolean; demands?: SellerVerificationDemand[] }>(
    `/co-own/seller/${encodeURIComponent(userId)}/verification-demands`,
    undefined,
    { signal },
  );
  return payload.demands ?? [];
}

/**
 * POST /co-own/assets/:assetId/verification-demand/:demandId/respond —
 * the seller submits evidence; the demand transitions to 'responded'.
 */
export async function respondToVerificationDemand(
  assetId: string,
  demandId: number,
  evidenceUrl: string,
  evidenceNotes?: string,
): Promise<Partial<SellerVerificationDemand>> {
  const payload = await fetchJson<{ ok: boolean; demand?: Partial<SellerVerificationDemand> }>(
    `/co-own/assets/${encodeURIComponent(assetId)}/verification-demand/${demandId}/respond`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidenceUrl, evidenceNotes }),
    },
  );
  return payload.demand ?? {};
}

// ── DAC7 tax information ────────────────────────────────────────────────────

/** GET /compliance/dac7/:userId — null taxInfo means never provided. */
export async function fetchDac7TaxInfo(
  userId: string,
  signal?: AbortSignal,
): Promise<Dac7TaxInfo | null> {
  const payload = await fetchJson<{ ok: boolean; taxInfo?: Dac7TaxInfo | null }>(
    `/compliance/dac7/${encodeURIComponent(userId)}`,
    undefined,
    { signal },
  );
  return payload.taxInfo ?? null;
}

/** POST /compliance/dac7/:userId */
export async function saveDac7TaxInfo(
  userId: string,
  data: Dac7TaxInfoInput,
): Promise<Dac7TaxInfo> {
  const payload = await fetchJson<{ ok: boolean; taxInfo?: Dac7TaxInfo }>(
    `/compliance/dac7/${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
  );
  if (!payload.taxInfo) throw new Error('Tax information was not saved');
  return payload.taxInfo;
}

// ── KYC identity verification ────────────────────────────────────────────────

/** Mirrors frontend/src/services/complianceApi.ts — the provider-hosted
 *  session the real flow redirects to. Document capture happens on the
 *  provider's page; ThryftVerse never handles the media. */
export interface KycSession {
  id: string;
  verificationUrl: string | null;
  vendor: string;
  status: 'pending' | 'in_review' | 'approved' | 'declined' | 'expired';
}

export interface KycStatusResult {
  status: 'not_started' | 'pending' | 'verified' | 'rejected' | 'expired';
  level: 'none' | 'basic' | 'enhanced';
  vendor: string | null;
  documentStatus: 'unsubmitted' | 'submitted' | 'approved' | 'rejected';
  livenessStatus: 'unsubmitted' | 'pending' | 'passed' | 'failed';
  tradingEnabled: boolean;
}

/** GET /compliance/kyc-status/:userId — the account's real KYC state. */
export async function fetchKycStatus(
  userId: string,
  signal?: AbortSignal,
): Promise<KycStatusResult | null> {
  const payload = await fetchJson<{ ok: boolean; kycStatus?: KycStatusResult }>(
    `/compliance/kyc-status/${encodeURIComponent(userId)}`,
    undefined,
    { signal },
  );
  return payload.kycStatus ?? null;
}

/** POST /compliance/kyc-session — starts a provider-hosted verification.
 *  `dateOfBirth` is ISO `YYYY-MM-DD`. */
export async function createKycSession(data: {
  legalName?: string;
  dateOfBirth?: string;
  countryCode?: string;
}): Promise<KycSession> {
  const payload = await fetchJson<{ ok: boolean; session?: KycSession }>(
    '/compliance/kyc-session',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
  );
  if (!payload.session) throw new Error('Verification session was not created');
  return payload.session;
}

// ── Age assurance (18+ self-declaration) ────────────────────────────────────
//
// The backend has no dedicated age-attestation endpoint — the mobile gate
// (frontend/src/screens/AgeVerificationScreen.tsx) is device-local
// SecureStore only and posts nothing. The real authenticated write surface
// that can carry the declaration is PATCH /compliance/profile/:userId, whose
// `metadata` field is merged (not replaced) onto user_compliance_profiles.
// GET /compliance/age-assurance/:userId remains the read contract for the
// ICO/Ofcom waterfall level (self_declared → pending → kyc_verified).

/** PATCH /compliance/profile/:userId — records the member's 18+ self-
 *  declaration on the account's compliance profile metadata. Self-scoped:
 *  the server rejects any userId other than the session's own. */
export async function recordAgeAttestation(userId: string): Promise<void> {
  await fetchJson<{ ok: boolean }>(
    `/compliance/profile/${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        metadata: {
          ageAttestation: {
            declared18OrOver: true,
            declaredAt: new Date().toISOString(),
            surface: 'web',
          },
        },
      }),
    },
  );
}

export type { VerificationDemandType };
