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
  /**
   * Net sales change vs the previous 30-day period (percentage points).
   * Null when the previous period had zero sales (division by zero avoided).
   */
  netSalesPrevPeriodPct: number | null;
  /**
   * Order count change vs the previous 30-day period (percentage points).
   * Null when the previous period had zero orders.
   */
  ordersPrevPeriodPct: number | null;
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

export interface SellerInventoryTotals {
  active: number;
  drafts: number;
  paused: number;
  sold: number;
  listedValueGbp: number;
}

interface SellerInventoryTotalsResponse {
  ok: boolean;
  totals: SellerInventoryTotals;
}

export async function fetchSellerInventoryTotals(): Promise<SellerInventoryTotals> {
  const response = await fetchJson<SellerInventoryTotalsResponse>('/seller-hub/inventory/totals');
  return response.totals;
}

// ── Batch command types ──

export type SellerHubBatchCommand = 'pause' | 'resume' | 'delete';

export interface SellerHubBatchItem {
  listingId: string;
  expectedVersion?: number;
}

export interface SellerHubBatchResult {
  listingId: string;
  state: 'applied' | 'rejected' | 'conflict';
  newStatus?: string;
  reason?: string;
  currentStatus?: string;
}

export interface SellerHubBatchResponse {
  ok: boolean;
  batchId: string;
  idempotencyKey: string;
  state: 'complete' | 'partial';
  results: SellerHubBatchResult[];
  appliedCount: number;
  rejectedCount: number;
  conflictCount: number;
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
