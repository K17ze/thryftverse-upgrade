/**
 * Seller Standards API — Gate 12 performance-program surface.
 *
 * Wraps the backend endpoints in routes/sellers.ts:
 *   GET  /sellers/:sellerId/standards         — recomputed operational
 *     metrics, program tier, and per-criterion defects (threshold/actual/gap)
 *   POST /sellers/:sellerId/standards/appeal  — file an appeal against a
 *     defect; creates a review record, never mutates the tier
 *
 * Every field is a verbatim projection of the endpoint payload — the client
 * never recomputes thresholds or fabricates a passing state.
 */

import { fetchJson } from '../lib/apiClient';

// ── Standards (GET) ─────────────────────────────────────────────────────────

export type SellerStandardsTier = 'standard' | 'performer' | 'top_performer';

/**
 * The seller's operational metrics over the program window, recomputed from
 * authoritative order/carrier facts on every request. `salesVolume` is GBP;
 * `averageShipTimeDays`, `cancellationRate` and `returnCaseRate` are already
 * normalised server-side (days / percent). Null when the seller has no
 * committed orders in the 90-day window.
 */
export interface SellerStandardsMetrics {
  ordersShipped: number;
  salesVolume: number;
  averageShipTimeDays: number;
  cancellationRate: number;
  returnCaseRate: number;
}

/** A failing program criterion — threshold, actual and the gap to close. */
export interface SellerStandardsDefect {
  metric: string;
  threshold: number;
  actual: number;
  gap: number;
}

export interface SellerStandards {
  metrics: SellerStandardsMetrics | null;
  tier: SellerStandardsTier;
  defects: SellerStandardsDefect[];
  /** True only when at least one defect exists to appeal. */
  appealsAvailable: boolean;
}

interface SellerStandardsResponse {
  ok: boolean;
  metrics: SellerStandardsMetrics | null;
  tier: SellerStandardsTier;
  defects: SellerStandardsDefect[];
  appealsAvailable: boolean;
}

export async function fetchSellerStandards(sellerId: string): Promise<SellerStandards> {
  const response = await fetchJson<SellerStandardsResponse>(
    `/sellers/${encodeURIComponent(sellerId)}/standards`,
  );
  return {
    metrics: response.metrics,
    tier: response.tier,
    defects: response.defects,
    appealsAvailable: response.appealsAvailable,
  };
}

// ── Appeals (POST) ──────────────────────────────────────────────────────────

export type StandardsAppealGrounds =
  | 'factual_error'
  | 'carrier_delay'
  | 'system_error'
  | 'mitigating_circumstance';

export interface SubmitStandardsAppealInput {
  /** The defect metric being appealed — one of SellerStandardsDefect.metric. */
  defectMetric: string;
  grounds: StandardsAppealGrounds;
  details: string;
  evidenceUrls?: string[];
}

interface SubmitStandardsAppealResponse {
  ok: boolean;
  appealId: string;
}

export async function submitStandardsAppeal(
  sellerId: string,
  input: SubmitStandardsAppealInput,
): Promise<{ appealId: string }> {
  const response = await fetchJson<SubmitStandardsAppealResponse>(
    `/sellers/${encodeURIComponent(sellerId)}/standards/appeal`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        defectMetric: input.defectMetric,
        grounds: input.grounds,
        details: input.details,
        evidenceUrls: input.evidenceUrls,
      }),
    },
  );
  return { appealId: response.appealId };
}
