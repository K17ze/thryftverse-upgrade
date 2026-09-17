/**
 * Seller away-state — single source of truth for holiday-mode semantics.
 *
 * Holiday mode is a HARD pause, matching what the product already promises
 * on every surface:
 *   - Settings toggle: "Pause your listings and hide your shop while you're
 *     away" (PrivacySettingsScreen)
 *   - Seller's own profile banner: "Your seller account is paused."
 *   - Buyer-facing profile banner: "Listings are paused and will return when
 *     they are back."
 *
 * Effective away = holiday_mode is on AND (holiday_mode_until IS NULL OR
 * holiday_mode_until > now). A declared return date therefore auto-expires
 * the pause — the seller cannot stay "away" past the date they published,
 * and buyers are never shown a stale away state. No sweep job is needed;
 * expiry is computed at read time.
 *
 * Commerce gates (POST /orders, POST /listings/:listingId/offers) reject new
 * purchase intent with 409 SELLER_AWAY while the seller is effectively away.
 * Pre-existing paid orders keep their paid_at + ship_within_days dispatch
 * deadline — going away does not excuse orders already sold (same rule as
 * eBay Time Away).
 */

export type Queryable = {
  query: <T = unknown>(text: string, params?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }>;
};

export interface SellerAwayState {
  /** True when the seller is effectively away right now. */
  away: boolean;
  /** Seller-declared return instant (ISO-8601), or null when undeclared.
   *  Only meaningful when `away` is true — a past date already expired the
   *  away state and is never surfaced to buyers. */
  awayUntil: string | null;
  /** Seller-authored away message, or null. */
  awayMessage: string | null;
}

/**
 * Pure predicate — is a seller with these stored flags effectively away at
 * `now`? Kept side-effect free so projections (profile aggregate, seller
 * payload) and commerce gates share exactly one definition.
 */
export function isEffectivelyAway(
  holidayMode: boolean | null | undefined,
  holidayModeUntil: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (holidayMode !== true) return false;
  if (holidayModeUntil == null) return true;
  const untilMs = holidayModeUntil instanceof Date
    ? holidayModeUntil.getTime()
    : Date.parse(holidayModeUntil);
  if (Number.isNaN(untilMs)) {
    // An unparseable stored date must not silently extend the pause — treat
    // as no declared return date rather than expiring the away state.
    return true;
  }
  return untilMs > now.getTime();
}

/**
 * Reads the seller's away state inside an existing transaction/connection.
 * Used by commerce gates so the check shares the caller's connection (and
 * its snapshot semantics) rather than opening a second pool connection.
 */
export async function fetchSellerAwayState(
  client: Queryable,
  sellerId: string,
): Promise<SellerAwayState> {
  const result = await client.query<{
    holiday_mode: boolean | null;
    holiday_mode_until: string | null;
    away_message: string | null;
  }>(
    `SELECT holiday_mode, holiday_mode_until::text, away_message
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [sellerId],
  );
  const row = result.rows[0];
  if (!row || !isEffectivelyAway(row.holiday_mode, row.holiday_mode_until)) {
    return { away: false, awayUntil: null, awayMessage: null };
  }
  return {
    away: true,
    awayUntil: row.holiday_mode_until
      ? new Date(row.holiday_mode_until).toISOString()
      : null,
    awayMessage: row.away_message,
  };
}
