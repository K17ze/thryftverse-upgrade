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

export const ONEZE_UNITS_PER_IZE = 1_000;
export const DEFAULT_WALLET_FIAT_CURRENCY = 'INR';

export function unitsToOnezeAmount(amountUnits: number): number {
  return Number((amountUnits / ONEZE_UNITS_PER_IZE).toFixed(6));
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

  // Offers — the whole offer lifecycle (created/countered/accepted/declined/
  // expired/cancelled/sibling_declined) is preference-gated by `offers`.
  // Prefix match mirrors the order_/auction_ handling so a future offer_*
  // event type cannot silently fail closed into in-app-only delivery.
  if (eventType.startsWith('offer_')) return 'offers';
  // Smart Sell acting on the seller's behalf is offer lifecycle — same
  // preference gate. Mirrors the index.ts copy of this mapper; keep the two
  // in sync.
  if (eventType === 'smart_sell_decision') return 'offers';

  // Orders and resolution (transactional commerce)
  if (eventType.startsWith('order_')) return 'orderUpdates';
  if (eventType === 'resolution_opened' || eventType === 'resolution_status_changed') return 'orderUpdates';
  if (eventType === 'payout_processed' || eventType === 'refund_completed') return 'orderUpdates';

  // Price drops
  if (eventType === 'price_drop') return 'priceDrops';

  // Saved-search matches ride the `wishlist` preference — a user who opted
  // into alerts on a saved search is asking for item-interest pushes.
  if (eventType === 'saved_search_match') return 'wishlist';

  // Auction alerts — the full auction_* family (outbid, won, ending soon,
  // bid received, cancelled, reserve not met, sold, payment expired).
  // Prefix match mirrors order_/offer_ so new auction_* types cannot
  // silently fail closed into in-app-only delivery.
  if (eventType.startsWith('auction_')) return 'auctionAlerts';

  // Social — followers, new listings from followed sellers, go-live alerts
  if (eventType === 'new_follower') return 'followers';
  if (eventType === 'new_listing_from_followed_seller') return 'followers';
  if (eventType === 'live_started') return 'followers';

  // Reviews — social/wishlist activity (someone liked/reviewed your item,
  // responded to your review, or a review was moderated)
  if (eventType.startsWith('review_')) return 'wishlist';

  // Checkout/payment failures and dispatch-extension lifecycle ride the
  // orderUpdates preference — they are transactional order events.
  if (eventType === 'payment_failed') return 'orderUpdates';
  if (eventType.startsWith('dispatch_extension_')) return 'orderUpdates';
  if (eventType.startsWith('coown_')) return 'orderUpdates';

  // Support-case lifecycle — the notification IS a message in the support
  // thread (operator reply / information request / resolution), so it is
  // gated by the messages preference.
  if (eventType.startsWith('support.')) return 'messages';

  // Creator scheduled-publication outcomes and internal ops alerts are
  // controllable system traffic — gated by news.
  if (eventType.startsWith('scheduled_publication_')) return 'news';
  if (eventType === 'ops_alert') return 'news';

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

// ─── Quiet hours ────────────────────────────────────────────────────────────

export interface QuietHoursConfig {
  enabled?: boolean;
  startHour?: number;
  endHour?: number;
  /** IANA timezone name written by the preferences PUT ('Europe/London'). */
  timezone?: string;
}

export interface QuietWindowDecision {
  inWindow: boolean;
  /** Milliseconds until the window's endHour in the user's timezone. */
  msUntilEnd: number;
}

/** Current hour-of-day (0-23) in the given IANA timezone, UTC on bad input. */
function hourInTimezone(tz: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hour12: false,
      timeZone: tz,
    }).formatToParts(at);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    return Number.isFinite(hour) ? hour % 24 : at.getUTCHours();
  } catch {
    return at.getUTCHours();
  }
}

/** Milliseconds from `at` until the next `hour`:00 in the given timezone. */
function msUntilHourInTimezone(hour: number, tz: string, at: Date): number {
  try {
    // Wall-clock arithmetic in the zone, mapped back through its current
    // UTC offset. Offsets are stable within a single quiet window.
    const wall = new Date(at.toLocaleString('en-US', { timeZone: tz }));
    const offsetMs = wall.getTime() - at.getTime();
    const target = new Date(wall);
    target.setHours(hour, 0, 0, 0);
    if (target.getTime() <= wall.getTime()) {
      target.setDate(target.getDate() + 1);
    }
    return Math.max(0, target.getTime() - offsetMs - at.getTime());
  } catch {
    const target = new Date(at);
    target.setUTCHours(hour, 0, 0, 0);
    if (target.getTime() <= at.getTime()) {
      target.setUTCDate(target.getUTCDate() + 1);
    }
    return Math.max(0, target.getTime() - at.getTime());
  }
}

/**
 * Evaluate a stored quiet_hours config against `now` in the user's
 * timezone. Returns inWindow=false for malformed/absent config.
 */
export function quietWindowDecision(
  quietHours: unknown,
  now: Date = new Date(),
): QuietWindowDecision {
  const none: QuietWindowDecision = { inWindow: false, msUntilEnd: 0 };
  if (!quietHours || typeof quietHours !== 'object') return none;
  const qh = quietHours as QuietHoursConfig;
  if (!qh.enabled || typeof qh.startHour !== 'number' || typeof qh.endHour !== 'number') {
    return none;
  }
  const tz = typeof qh.timezone === 'string' && qh.timezone.length > 0 ? qh.timezone : 'UTC';
  const currentHour = hourInTimezone(tz, now);
  const { startHour, endHour } = qh;
  const inWindow = startHour <= endHour
    ? currentHour >= startHour && currentHour < endHour
    : currentHour >= startHour || currentHour < endHour;
  return {
    inWindow,
    msUntilEnd: inWindow ? msUntilHourInTimezone(endHour, tz, now) : 0,
  };
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
  if (eventType === 'payment_failed' || eventType.startsWith('dispatch_extension_') || eventType.startsWith('coown_')) return 'orders';
  if (eventType.startsWith('auction_')) return 'auctions';
  if (eventType === 'chat_message' || eventType.startsWith('support.')) return 'messages';
  if (eventType === 'new_follower' || eventType === 'new_listing_from_followed_seller' || eventType.startsWith('review_') || eventType === 'live_started') return 'social';
  if (eventType === 'price_drop' || eventType === 'saved_search_match' || eventType.startsWith('offer_') || eventType === 'generic' || eventType === 'safety_outcome' || eventType === 'ops_alert' || eventType.startsWith('scheduled_publication_')) return 'news';
  if (eventType === 'resolution_opened' || eventType === 'resolution_status_changed') return 'orders';
  // Smart Sell decisions ride the orders channel — mirrors the index.ts
  // copy of this mapper.
  if (eventType === 'smart_sell_decision') return 'orders';
  return 'default';
}

/**
 * Map a notification event type to an iOS notification category identifier.
 * G5: The category identifier must match a category registered via
 * `Notifications.setNotificationCategoryAsync()` in App.tsx. This tells iOS
 * which inline action buttons to show on the notification banner.
 *
 * Returns null for event types that don't have interactive actions — the
 * notification still renders as a plain banner.
 */
export function mapEventTypeToIosCategory(eventType: string): string | null {
  // Message category: Reply + Mark as read
  if (eventType === 'chat_message') return 'message';

  // Order category: Track + Mark as read
  if (eventType.startsWith('order_') || eventType === 'payout_processed' || eventType === 'refund_completed') return 'order';
  if (eventType === 'resolution_opened' || eventType === 'resolution_status_changed') return 'order';
  if (eventType === 'payment_failed' || eventType.startsWith('dispatch_extension_')) return 'order';

  // Auction category: View bid + Dismiss
  if (eventType.startsWith('auction_')) return 'auction';

  // Social category: View + Mark as read
  if (eventType === 'new_follower' || eventType === 'new_listing_from_followed_seller' || eventType.startsWith('review_') || eventType === 'live_started') return 'social';

  // No interactive actions for price drops, offers, or generic news
  return null;
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

  // Passive: low-urgency, no sound, no screen wake.
  // live_started deliberately stays 'active' (the default below): a live show
  // is ephemeral, so a silent/wake-less push would usually arrive too late to
  // be useful.
  if (eventType === 'new_follower' || eventType === 'new_listing_from_followed_seller') return 'passive';
  if (eventType === 'price_drop') return 'passive';
  if (eventType === 'generic' || eventType.startsWith('review_')) return 'passive';
  // A seller ping per bid can be frequent — keep it wake-less.
  if (eventType === 'auction_bid') return 'passive';
  // Successful scheduled publishes are FYI; blocked/failed stay 'active'
  // because the creator needs to intervene.
  if (eventType === 'scheduled_publication_success') return 'passive';

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
  if (eventType === 'ops_alert') return 0.9;
  if (eventType.startsWith('order_') || eventType === 'payout_processed' || eventType === 'refund_completed') return 0.8;
  if (eventType === 'resolution_opened' || eventType === 'safety_outcome') return 0.8;
  if (eventType === 'payment_failed' || eventType.startsWith('dispatch_extension_') || eventType.startsWith('coown_')) return 0.8;
  if (eventType.startsWith('offer_')) return 0.7;
  // Seller-facing auction outcomes (sold, reserve not met, cancelled,
  // payment expired) rank with offers — important but not time-critical.
  if (eventType.startsWith('auction_')) return 0.7;
  if (eventType.startsWith('support.')) return 0.7;
  if (eventType === 'chat_message') return 0.6;
  // Go-live alerts are ephemeral — rank with chat so summary surfaces them.
  if (eventType === 'live_started') return 0.6;
  if (eventType === 'price_drop') return 0.4;
  if (eventType.startsWith('review_') || eventType.startsWith('scheduled_publication_')) return 0.3;
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
  // A dispatch-extension request has a buyer response deadline — suppressing
  // it during quiet hours would silently expire the window.
  'dispatch_extension_proposed',
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
  | 'reserve_hold'
  | 'provider_cash_clearing'
  | 'revenue_fx';

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
  ize_amount_units: number | string;
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
  oneze_balance_units: number | string;
  fiat_balance_minor: number | string;
  fiat_currency: string;
  version: number | string;
  created_at: string;
  updated_at: string;
}

export interface WalletSegmentRow {
  wallet_id: string;
  purchased_balance_units: number | string;
  earned_balance_units: number | string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface WithdrawalRow {
  id: string;
  user_id: string;
  burn_tx_id: string | null;
  amount_units: number | string;
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
