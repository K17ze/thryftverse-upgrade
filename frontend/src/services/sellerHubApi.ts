/**
 * Seller Hub API — server-backed aggregate for the Seller Hub OS (v2).
 *
 * Per closure program 05_SELLER_HUB_AND_PROFILE_OS and Report 17:
 * no frontend approximation of financial KPIs. All money, tasks, and
 * inventory counts come from the server aggregate endpoint.
 *
 * The v2 contract adds:
 * - schemaVersion, freshness per source
 * - cross-domain tasks (ship orders, offers, listing issues, payout holds)
 * - money posture (available, processing, held, next payout)
 * - business pulse from settled order/ledger facts (not asking price)
 * - topTask for the first-viewport dominant object
 */

import { fetchJson } from '../lib/apiClient';

// ── Task types ──
export type SellerHubTaskType =
  | 'ship_order'
  | 'respond_offer'
  | 'listing_issue'
  | 'catalogue_awaiting'
  | 'payout_hold';

export type SellerHubTaskPriority = 'critical' | 'high' | 'normal' | 'low';

export interface SellerHubTask {
  id: string;
  type: SellerHubTaskType;
  priority: SellerHubTaskPriority;
  count: number;
  dueAt: string | null;
  consequence: { kind: 'money' | 'buyer' | 'trust' | 'listing'; amountGbp?: number } | null;
  actionRoute: string;
  actionLabel: string;
}

export interface SellerHubFreshnessEntry {
  asOf: string;
  state: 'fresh' | 'stale' | 'unavailable';
}

export interface SellerHubMoney {
  currency: 'GBP';
  availableGbp: number;
  processingGbp: number;
  heldGbp: number;
  nextPayoutAt: string | null;
}

export interface SellerHubBusinessPulse {
  period: '30d';
  grossSalesGbp: number;
  refundsGbp: number;
  feesGbp: number;
  netSalesGbp: number;
  orders: number;
  completeness: 'complete' | 'partial';
}

export interface SellerHubOverview {
  schemaVersion: 2;
  generatedAt: string;
  freshness: Record<string, SellerHubFreshnessEntry>;
  tasks: SellerHubTask[];
  topTask: SellerHubTask | null;
  taskSummary: Record<string, number>;
  money: SellerHubMoney | null;
  inventory: {
    active: number;
    drafts: number;
    paused: number;
    sold: number;
    listedValueGbp: number;
  };
  businessPulse: SellerHubBusinessPulse | null;
}

interface SellerHubOverviewResponse {
  ok: boolean;
  overview: SellerHubOverview;
}

export async function fetchSellerHubOverview(): Promise<SellerHubOverview> {
  const response = await fetchJson<SellerHubOverviewResponse>('/seller-hub/overview');
  return response.overview;
}

// ── Batch command types ──

export type SellerHubBatchCommand = 'pause' | 'resume' | 'delete' | 'mark_sold_external';

export interface SellerHubBatchItem {
  listingId: string;
  expectedVersion?: number;
}

export interface SellerHubBatchResult {
  listingId: string;
  state: 'applied' | 'rejected' | 'conflict' | 'unknown';
  code?: string;
  currentStatus?: string;
}

export interface SellerHubBatchResponse {
  ok: boolean;
  batchId: string;
  state: 'complete' | 'partial';
  results: SellerHubBatchResult[];
}

export async function submitSellerHubBatchCommand(
  command: SellerHubBatchCommand,
  items: SellerHubBatchItem[],
  idempotencyKey: string,
): Promise<SellerHubBatchResponse> {
  return fetchJson<SellerHubBatchResponse>('/seller-hub/batch-command', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ command, items, idempotencyKey }),
  });
}
