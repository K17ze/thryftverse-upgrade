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

export type { VerificationDemandType };
