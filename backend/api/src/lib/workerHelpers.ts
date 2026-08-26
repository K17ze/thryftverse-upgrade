/**
 * Self-contained helpers and shared types extracted from `src/index.ts` so
 * that the standalone BullMQ worker process (and its handler modules) can run
 * the real background-job implementations without importing the Fastify
 * monolith entry point (which starts the API server as a side effect).
 *
 * Everything here is a verbatim copy of the small, dependency-free helpers
 * defined inline in `src/index.ts`. Keeping them in one importable module
 * avoids duplicating them across each handler file.
 */
import type { PoolClient } from 'pg';
import { currencyExponent } from './money.js';

// ─── JSON / numeric helpers ────────────────────────────────────────────────

export function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function formatGbpAmount(amountGbp: number): string {
  return `£${roundTo(Math.max(0, amountGbp), 2).toFixed(2)}`;
}

// ─── Auction fee helpers ───────────────────────────────────────────────────

export const AUCTION_PLATFORM_FEE_RATE = 0.03;

export function calculateAuctionPlatformFeeGbp(winningBidGbp: number): number {
  return roundTo(Math.max(0, winningBidGbp) * AUCTION_PLATFORM_FEE_RATE, 2);
}

// ─── Runtime id / date helpers ─────────────────────────────────────────────

export function createRuntimeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

export function toUtcDateString(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function parseRunDateOrToday(runDate?: string): string {
  if (!runDate) {
    return toUtcDateString(new Date());
  }

  const parsed = new Date(`${runDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return toUtcDateString(new Date());
  }

  return toUtcDateString(parsed);
}

// ─── 1ze amount / fiat helpers ─────────────────────────────────────────────

export const ONEZE_MG_PER_IZE = 1_000;
export const DEFAULT_WALLET_FIAT_CURRENCY = 'INR';

export function mgToOnezeAmount(amountMg: number): number {
  return Number((amountMg / ONEZE_MG_PER_IZE).toFixed(6));
}

export function getFiatMinorDigits(currency: string): number {
  return currencyExponent(currency);
}

export function toFiatMinor(amountMajor: number, currency: string): number {
  const digits = getFiatMinorDigits(currency);
  const factor = 10 ** digits;
  const minor = Math.round(amountMajor * factor);
  if (!Number.isSafeInteger(minor)) {
    throw createApiError('FIAT_AMOUNT_INVALID', 'Fiat amount cannot be represented safely in minor units');
  }

  return minor;
}

export function fromFiatMinor(amountMinor: number, currency: string): number {
  const digits = getFiatMinorDigits(currency);
  const factor = 10 ** digits;
  return Number((amountMinor / factor).toFixed(Math.max(2, digits)));
}

export function normalizeOnezeCountryTag(country: string | null | undefined): string {
  const raw = (country ?? '').trim().toUpperCase();
  return raw.length >= 2 ? raw : 'GLOBAL';
}

// ─── Notification push category helpers ────────────────────────────────────

export const NOTIFICATION_PUSH_CATEGORIES = [
  'messages', 'offers', 'wishlist', 'followers', 'orderUpdates', 'priceDrops', 'auctionAlerts', 'news',
] as const;
export type NotificationPushCategory = typeof NOTIFICATION_PUSH_CATEGORIES[number];

/**
 * Map a notification event type to its push preference category.
 *
 * Every registered event type MUST map to a category. Unmapped (unknown)
 * event types return null, and the caller MUST fail closed — i.e. suppress
 * push and deliver in-app only. This prevents preference bypass where an
 * unmapped event defaults to shouldPush=true.
 *
 * `generic` maps to `news` so test/manual notifications are controlled by
 * the marketing/news preference rather than bypassing all preferences.
 */
export function mapEventToPushCategory(eventType: string): NotificationPushCategory | null {
  // Messages
  if (eventType === 'chat_message') return 'messages';

  // Offers
  if (eventType === 'offer_accepted') return 'offers';

  // Orders and resolution (transactional commerce)
  if (eventType.startsWith('order_')) return 'orderUpdates';
  if (eventType === 'resolution_opened' || eventType === 'resolution_status_changed') return 'orderUpdates';
  if (eventType === 'payout_processed' || eventType === 'refund_completed') return 'orderUpdates';

  // Price drops
  if (eventType === 'price_drop') return 'priceDrops';

  // Auction alerts
  if (eventType === 'auction_outbid' || eventType === 'auction_won' || eventType === 'auction_ending_soon') return 'auctionAlerts';

  // Social — followers and new listings from followed sellers
  if (eventType === 'new_follower') return 'followers';
  if (eventType === 'new_listing_from_followed_seller') return 'followers';

  // Reviews — social/wishlist activity (someone liked/reviewed your item)
  if (eventType === 'review_received') return 'wishlist';

  // Generic and safety map to news (controllable, non-critical)
  if (eventType === 'generic') return 'news';
  if (eventType === 'safety_outcome') return 'news';

  // Unknown event type — fail closed (in-app only, no push)
  return null;
}

/**
 * Check whether an event type is eligible for push at all.
 * Unknown event types are not eligible for push — they are in-app only.
 * This is the fail-closed gate that prevents preference bypass.
 */
export function isPushEligibleEventType(eventType: string): boolean {
  return mapEventToPushCategory(eventType) !== null;
}

/**
 * Map a notification event type to an Android notification channel ID.
 * The channel IDs match the client-side channel definitions in pushPermission.ts:
 *   orders, auctions, messages, social, news, default
 *
 * This ensures Android users see notifications in the correct channel with
 * the correct importance level (HIGH for orders/auctions, DEFAULT for
 * messages/social, LOW for news).
 */
export function mapEventTypeToChannelId(eventType: string): string {
  if (eventType.startsWith('order_') || eventType === 'payout_processed' || eventType === 'refund_completed') return 'orders';
  if (eventType.startsWith('auction_')) return 'auctions';
  if (eventType === 'chat_message') return 'messages';
  if (eventType === 'new_follower' || eventType === 'new_listing_from_followed_seller' || eventType === 'review_received') return 'social';
  if (eventType === 'price_drop' || eventType === 'offer_accepted' || eventType === 'generic' || eventType === 'safety_outcome') return 'news';
  if (eventType === 'resolution_opened' || eventType === 'resolution_status_changed') return 'orders';
  return 'default';
}

/**
 * Map a notification event type to an iOS interruption level.
 * Apple HIG defines: passive, active, timeSensitive, critical.
 * - passive: no sound, no screen wake (marketing, social)
 * - active: default sound + banner (most commerce)
 * - timeSensitive: breaks through Focus (auction ending, order dispatched)
 * - critical: bypasses Focus AND ringer (requires entitlement — not used)
 */
export function mapEventTypeToInterruptionLevel(eventType: string): 'passive' | 'active' | 'timeSensitive' {
  // Time-sensitive: events where the user needs to act soon
  if (eventType === 'auction_ending_soon' || eventType === 'auction_outbid') return 'timeSensitive';
  if (eventType === 'auction_won') return 'timeSensitive';
  if (eventType === 'order_dispatched' || eventType === 'order_out_for_delivery') return 'timeSensitive';
  if (eventType === 'resolution_opened' || eventType === 'safety_outcome') return 'timeSensitive';

  // Passive: low-urgency, no sound, no screen wake
  if (eventType === 'new_follower' || eventType === 'new_listing_from_followed_seller') return 'passive';
  if (eventType === 'price_drop') return 'passive';
  if (eventType === 'generic' || eventType === 'review_received') return 'passive';

  // Active: default for most commerce events
  return 'active';
}

/**
 * Map a notification event type to a relevance score (0.0–1.0).
 * Apple uses this for Notification Summary ranking.
 */
export function mapEventTypeToRelevanceScore(eventType: string): number {
  if (eventType === 'auction_won') return 1.0;
  if (eventType === 'auction_ending_soon' || eventType === 'auction_outbid') return 0.9;
  if (eventType.startsWith('order_') || eventType === 'payout_processed' || eventType === 'refund_completed') return 0.8;
  if (eventType === 'resolution_opened' || eventType === 'safety_outcome') return 0.8;
  if (eventType === 'offer_accepted') return 0.7;
  if (eventType === 'chat_message') return 0.6;
  if (eventType === 'price_drop') return 0.4;
  if (eventType === 'review_received') return 0.3;
  if (eventType === 'new_follower' || eventType === 'new_listing_from_followed_seller') return 0.2;
  return 0.1; // generic / unknown
}

/**
 * Event types that bypass quiet hours (server-side enforcement).
 * These are time-sensitive or critical events that must reach the user
 * even during their configured quiet window.
 */
const CRITICAL_EVENT_TYPES = new Set([
  'auction_won',
  'auction_ending_soon',
  'auction_outbid',
  'order_cancelled',
  'resolution_opened',
  'safety_outcome',
]);

export function isCriticalEventType(eventType: string): boolean {
  return CRITICAL_EVENT_TYPES.has(eventType);
}

// ─── API error helpers ─────────────────────────────────────────────────────

export interface ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

export function statusCodeForApiError(code: string): number {
  if (code === 'ONEZE_OPERATIONS_HALTED' || code === 'RECONCILIATION_TABLES_UNAVAILABLE' || code === 'PAYOUTS_PAUSED') {
    return 503;
  }

  if (code === 'PAYMENT_PROVIDER_UNAVAILABLE' || code === 'SHIPPING_PROVIDER_UNAVAILABLE') {
    return 503;
  }

  if (code === 'PAYOUT_PROVIDER_UNAVAILABLE') {
    return 503;
  }

  if (code === 'UNAUTHORIZED') {
    return 401;
  }

  if (code === 'FORBIDDEN_USER_CONTEXT') {
    return 403;
  }

  if (code === 'ORDER_ACCESS_DENIED' || code === 'REFUND_REQUIRES_OPERATOR') {
    return 403;
  }

  if (code === 'ORDER_ACTION_NOT_ALLOWED' || code === 'RESOLUTION_ALREADY_OPEN' || code === 'REVIEW_ALREADY_EXISTS') {
    return 409;
  }

  if (code === 'IDEMPOTENCY_KEY_REUSED') {
    return 409;
  }

  if (code === 'NOTIFICATION_ACCESS_DENIED') {
    return 403;
  }

  if (code === 'NOTIFICATION_NOT_FOUND') {
    return 404;
  }

  if (code === 'INVALID_NOTIFICATION_CURSOR' || code === 'INVALID_PREFERENCE_CATEGORY') {
    return 400;
  }

  if (code.endsWith('_NOT_FOUND') || code === 'USER_NOT_FOUND') {
    return 404;
  }

  if (code.endsWith('_INVALID') || code.endsWith('_MISMATCH') || code.endsWith('_REQUIRED')) {
    return 400;
  }

  if (code.startsWith('P2P_TRANSFER_') && code.endsWith('_BLOCKED')) {
    return 403;
  }

  return 409;
}

export function createApiError(code: string, message: string, details?: Record<string, unknown>): ApiError {
  const error = new Error(message) as ApiError;
  error.code = code;
  error.statusCode = statusCodeForApiError(code);
  if (details) {
    error.details = details;
  }
  return error;
}

// ─── Redis key constants ───────────────────────────────────────────────────

export const PAYOUTS_PAUSED_REDIS_KEY = 'ops:payouts_paused';
export const ALERT_DEDUP_REDIS_PREFIX = 'ops:alerted:';

// ─── Shared DB queryable / ledger types ────────────────────────────────────

export type DbQueryable = Pick<PoolClient, 'query'>;
export type LedgerOwnerType = 'platform' | 'user';
export type LedgerAccountCode =
  | 'escrow_liability'
  | 'platform_revenue'
  | 'platform_operating'
  | 'seller_payable'
  | 'buyer_spend'
  | 'withdrawal_pending'
  | 'withdrawable_balance'
  | 'ize_wallet'
  | 'ize_pending_redemption'
  | 'ize_outstanding'
  | 'ize_fiat_received'
  | 'reserve_hold';

// ─── Table-availability probes ─────────────────────────────────────────────

export async function ledgerTablesAvailable(client: DbQueryable): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT
        to_regclass('public.ledger_accounts') IS NOT NULL
        AND to_regclass('public.ledger_entries') IS NOT NULL AS exists
    `
  );

  return Boolean(result.rows[0]?.exists);
}

export async function onezeArchitectureTablesAvailable(client: DbQueryable): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT
        to_regclass('public.wallets') IS NOT NULL
        AND to_regclass('public.wallet_ledger') IS NOT NULL
        AND to_regclass('public.payout_corridors') IS NOT NULL
        AND to_regclass('public.fx_rates') IS NOT NULL
        AND to_regclass('public.withdrawals') IS NOT NULL
        AND to_regclass('public.wallet_idempotency_keys') IS NOT NULL
        AND to_regclass('public.oneze_reconciliation_snapshots') IS NOT NULL
        AND to_regclass('public.jurisdiction_policies') IS NOT NULL AS exists
    `
  );

  return Boolean(result.rows[0]?.exists);
}

export async function onezeMintFlowTablesAvailable(client: DbQueryable): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT
        to_regclass('public.mint_operations') IS NOT NULL
        AND to_regclass('public.payment_intents') IS NOT NULL
        AND to_regclass('public.wallets') IS NOT NULL
        AND to_regclass('public.wallet_ledger') IS NOT NULL AS exists
    `
  );

  return Boolean(result.rows[0]?.exists);
}

// ─── Row types ─────────────────────────────────────────────────────────────

export type MintOperationState =
  | 'INITIATED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_CONFIRMED'
  | 'RESERVE_PURCHASING'
  | 'RESERVE_ALLOCATED'
  | 'WALLET_CREDITED'
  | 'SETTLED'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REFUNDED'
  | 'RESERVE_FAILED'
  | 'RECONCILIATION_HOLD'
  | 'RESERVE_UNKNOWN';

export interface MintOperationRow {
  id: string;
  user_id: string;
  state: MintOperationState;
  fiat_amount_minor: number | string;
  fiat_currency: string;
  net_fiat_amount_minor: number | string;
  platform_fee_minor: number | string;
  ize_amount_mg: number | string;
  rate_per_gram: number | string;
  rate_source: string;
  rate_locked_at: string;
  rate_expires_at: string;
  payment_intent_id: string | null;
  lot_id: string | null;
  custodian_ref: string | null;
  escrow_ledger_tx_id: string | null;
  wallet_credit_tx_id: string | null;
  purchase_attempted_at: string | null;
  settled_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const MINT_OPERATION_TERMINAL_STATES = new Set<string>([
  'SETTLED',
  'PAYMENT_FAILED',
  'PAYMENT_REFUNDED',
  'RESERVE_FAILED',
  'RESERVE_UNKNOWN',
]);

export interface WalletRow {
  id: string;
  user_id: string;
  oneze_balance_mg: number | string;
  fiat_balance_minor: number | string;
  fiat_currency: string;
  version: number | string;
  created_at: string;
  updated_at: string;
}

export interface WalletSegmentRow {
  wallet_id: string;
  purchased_balance_mg: number | string;
  earned_balance_mg: number | string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WithdrawalRow {
  id: string;
  user_id: string;
  burn_tx_id: string | null;
  amount_mg: number | string;
  target_currency: string;
  gross_minor: number | string;
  spread_minor: number | string;
  network_fee_minor: number | string;
  net_minor: number | string;
  rate_locked: number | string;
  rate_expires_at: string;
  rail: string;
  rail_ref: string | null;
  status: 'QUOTED' | 'ACCEPTED' | 'RESERVED' | 'PAID_OUT' | 'FAILED' | 'REVERSED';
  payout_destination: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
}
