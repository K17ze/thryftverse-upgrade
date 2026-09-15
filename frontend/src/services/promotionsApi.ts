import { fetchJson } from '../lib/apiClient';
import { createStableId } from '../utils/createStableId';

// ────────────────────────────────────────────────────────────────────────────
// Seller listing promotions — flat-fee "Sponsored" placement (backend routes
// in /seller/promotions, migrations 301–302). The seller pays a fixed GBP/day fee
// debited from their seller_payable ledger balance once per active day; the
// listing then occupies labelled Sponsored slots in discovery. Organic ranking
// is never altered and every sponsored unit carries a server-stamped
// `disclosure` label — the client renders it verbatim and never infers it.
// ────────────────────────────────────────────────────────────────────────────

export type PromotionStatus = 'active' | 'paused' | 'exhausted' | 'ended';

export type PromotionDurationDays = 7 | 14 | 30;

export const PROMOTION_MIN_DAILY_BUDGET_MINOR = 100;
export const PROMOTION_MAX_DAILY_BUDGET_MINOR = 50_000;
export const PROMOTION_DURATIONS_DAYS: readonly PromotionDurationDays[] = [7, 14, 30];

export interface SellerPromotion {
  id: string;
  listingId: string;
  status: PromotionStatus;
  dailyBudgetMinor: number;
  dailyBudgetGbp: number;
  spendDay: string | null;
  chargedTodayMinor: number;
  /**
   * Machine-readable reason for a system-initiated pause (migration 302):
   * 'listing_unservable' | 'seller_restricted'. NULL for seller-initiated
   * pauses and never-paused promotions — 'exhausted' is not a pause and
   * never carries a reason.
   */
  pausedReason?: string | null;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  listingTitle?: string | null;
  listingImageUrl?: string | null;
  totalSpendMinor?: number;
  totalSpendGbp?: number;
}

export interface PromotionStats {
  promotionId: string;
  status: PromotionStatus;
  totalSpendMinor: number;
  totalSpendGbp: number;
  chargedDays: number;
  lastChargeDay: string | null;
  chargedTodayMinor: number;
  impressions: number;
  clicks: number;
}

export interface CreatePromotionResult {
  ok: boolean;
  promotion: SellerPromotion;
  charge: { outcome: 'charged' | 'already_charged' | 'insufficient_balance' | 'not_active'; amountMinor: number };
  replayed?: boolean;
}

export interface PromotionActionResult {
  ok: boolean;
  promotion: SellerPromotion;
  charge?: { outcome: string; amountMinor: number };
}

/**
 * Create + activate a flat-fee promotion. `dailyBudgetMinor` is the GBP/day
 * fee in pence (£1–£500). The first day's fee is debited immediately from
 * the seller's payable balance; subsequent days are charged lazily when the
 * promotion is served. `idempotencyKey` defaults to a stable client id so a
 * retried submit never double-creates or double-charges.
 */
export async function createListingPromotion(input: {
  listingId: string;
  dailyBudgetMinor: number;
  durationDays: PromotionDurationDays;
  idempotencyKey?: string;
}): Promise<CreatePromotionResult> {
  return fetchJson<CreatePromotionResult>('/seller/promotions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listingId: input.listingId,
      dailyBudgetMinor: input.dailyBudgetMinor,
      durationDays: input.durationDays,
      idempotencyKey: input.idempotencyKey ?? createStableId('promotion'),
    }),
  });
}

export async function fetchSellerPromotions(): Promise<SellerPromotion[]> {
  const payload = await fetchJson<{ ok: boolean; promotions: SellerPromotion[] }>(
    '/seller/promotions'
  );
  return payload.promotions ?? [];
}

export async function pauseListingPromotion(promotionId: string): Promise<PromotionActionResult> {
  return fetchJson<PromotionActionResult>(
    `/seller/promotions/${encodeURIComponent(promotionId)}/pause`,
    { method: 'POST' }
  );
}

export async function resumeListingPromotion(promotionId: string): Promise<PromotionActionResult> {
  return fetchJson<PromotionActionResult>(
    `/seller/promotions/${encodeURIComponent(promotionId)}/resume`,
    { method: 'POST' }
  );
}

export async function endListingPromotion(promotionId: string): Promise<PromotionActionResult> {
  return fetchJson<PromotionActionResult>(
    `/seller/promotions/${encodeURIComponent(promotionId)}/end`,
    { method: 'POST' }
  );
}

export async function fetchPromotionStats(promotionId: string): Promise<PromotionStats> {
  const payload = await fetchJson<{ ok: boolean; stats: PromotionStats }>(
    `/seller/promotions/${encodeURIComponent(promotionId)}/stats`
  );
  return payload.stats;
}

/**
 * Record a buyer tap-through on a Sponsored unit. Fire-and-forget from the
 * tile's press handler — the server dedupes per viewer so a double-tap can't
 * inflate clicks, and the tile never blocks navigation on this call.
 */
export function recordPromotionClick(promotionId: string): void {
  fetchJson(`/promotions/${encodeURIComponent(promotionId)}/click`, {
    method: 'POST',
  }).catch(() => {
    // Analytics-only: a failed click record never surfaces to the user and
    // never blocks the listing navigation it accompanied.
  });
}
