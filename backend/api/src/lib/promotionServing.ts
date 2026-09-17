// ─────────────────────────────────────────────────────────────────────────────
// Promoted-listing serving — flat-fee "Sponsored" slots for discovery/search.
//
// Truth model (AGENTS.md §11):
//   * Paid placement is a FIXED SLOT blended into results, never a silent
//     ranking change. `blendPromotedIntoResults` leaves the organic order
//     untouched and stamps every promoted unit with
//     `{ promoted: true, disclosure: 'Sponsored' }` so disclosure is
//     server-decided per item — the client never infers it.
//   * Billing is a flat daily fee: once per UTC day a `promotion_charges`
//     row is claimed (UNIQUE(promotion_id, charge_day) makes it idempotent
//     under concurrency) and the amount is debited from the seller's
//     `seller_payable` ledger account with a matching `platform_revenue`
//     credit — the same legacy `ledger_entries`/`ledger_accounts` pair the
//     Wallet screen and Seller Hub read, so spend is real and auditable.
//   * Fail-closed: a promotion only serves on days its charge actually
//     posted (`spend_day = CURRENT_DATE AND daily_spend_minor > 0`). If the
//     payable balance cannot cover the fee the charge row is recorded as
//     'insufficient_balance' and the promotion flips to 'exhausted' — it
//     never serves unbilled impressions.
//   * Never billed for unservable inventory: before any charge posts, the
//     charge transaction re-checks that the listing is still purchasable
//     (status 'active' — the listings lifecycle marks sold via status, there
//     is no sold_at column) and the seller still has
//     distribution (reach_state 'normal'). A promotion that fails the check
//     is paused with a machine-readable `paused_reason` — 'exhausted' stays
//     reserved for insufficient balance.
//   * Charging is lazy: there is no scheduler job in this wave, so the
//     daily debit happens (a) at creation, (b) on resume, and (c) on the
//     first serving request of a new UTC day via
//     `settlePromotionLifecycle`, called inside
//     `fetchPromotedListingsForQuery`. `GET /seller/promotions` stats read
//     `promotion_charges` + `promotion_impressions` directly, so reported
//     spend is always real posted spend.
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { moneyFromMajorDecimal } from './money.js';

/** Any pg handle that can run a parameterised query. */
type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

/** Paid placement appears once per this many organic results. */
export const DEFAULT_PROMOTED_SLOT_EVERY = 6;

/** Server-stamped disclosure label — the only lawful value. */
export const PROMOTED_DISCLOSURE = 'Sponsored';

/** Reason code added to discovery `decision.reasonCodes` for paid units. */
export const PROMOTED_REASON_CODE = 'paid_placement';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromotionContextFilters {
  category?: string | null;
  /** Exact condition match — same semantics as the search filter sheet. */
  condition?: string | null;
  /** Exact size match (single-select size filter). */
  size?: string | null;
  /** Multi-select brand filter — listing brand must be in the set. */
  brands?: string[] | null;
  /** Multi-select size filter — listing size must be in the set. */
  sizes?: string[] | null;
  /** GBP major-unit price bounds, same semantics as the search filters. */
  priceMin?: number | null;
  priceMax?: number | null;
  /** Restrict to sustainability grades A/B (search's sustainableOnly). */
  sustainableOnly?: boolean | null;
}

export interface FetchPromotedOptions {
  /** Free-text query context (search). Null/empty on feed surfaces. */
  query?: string | null;
  filters?: PromotionContextFilters;
  /** Authenticated viewer — their own promoted listings are never served to them. */
  viewerId?: string | null;
  /** Max promoted placements to return. */
  limit?: number;
}

export interface PromotedListingRow {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  price_gbp: number | string;
  image_url: string | null;
  status: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  condition: string | null;
  original_price_gbp: number | string | null;
  created_at: string;
}

export interface PromotedListingPlacement {
  promotionId: string;
  listing: PromotedListingRow;
}

export type PromotionChargeOutcome =
  | 'charged'
  | 'insufficient_balance'
  | 'already_charged'
  | 'unservable'
  | 'not_active';

// ---------------------------------------------------------------------------
// Ledger helpers — mirror the canonical appendLedgerEntry shape in index.ts
// (kept self-contained so this module stays importable from routes, workers
// and tests without pulling in the index.ts monolith or queue singletons).
// ---------------------------------------------------------------------------

async function ensurePromotionLedgerAccount(
  client: Queryable,
  ownerType: 'platform' | 'user',
  ownerId: string,
  accountCode: string,
  currency = 'GBP'
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO ledger_accounts (owner_type, owner_id, account_code, currency)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (owner_type, owner_id, account_code, currency)
     DO UPDATE SET owner_id = EXCLUDED.owner_id
     RETURNING id`,
    [ownerType, ownerId, accountCode, currency]
  );
  return result.rows[0].id;
}

async function appendPromotionLedgerEntry(
  client: Queryable,
  input: {
    accountId: number;
    counterpartyAccountId: number;
    direction: 'debit' | 'credit';
    amountMinor: number;
    sourceId: string;
    lineType: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const amountGbp = input.amountMinor / 100;
  const money = moneyFromMajorDecimal('GBP', amountGbp.toFixed(2));
  await client.query(
    `INSERT INTO ledger_entries (
       account_id,
       counterparty_account_id,
       direction,
       amount_gbp,
       amount,
       currency,
       amount_base_units,
       asset_code,
       asset_scale,
       asset_registry_version,
       source_type,
       source_id,
       line_type,
       metadata
     )
     VALUES ($1, $2, $3, $4, $5, 'GBP', $6, $7, $8, $9, 'promotion', $10, $11, $12::jsonb)`,
    [
      input.accountId,
      input.counterpartyAccountId,
      input.direction,
      amountGbp,
      amountGbp,
      money.minorAmount,
      money.currency,
      money.exponent,
      money.registryVersion,
      input.sourceId,
      input.lineType,
      JSON.stringify(input.metadata ?? {}),
    ]
  );
}

/**
 * The seller's spendable GBP balance — seller_payable credits minus debits,
 * the exact projection the Wallet screen (/users/:id/wallet/balances) and
 * Seller Hub money posture read. Returned in minor units (pence).
 */
export async function getSellerPayableBalanceMinor(
  db: Queryable,
  sellerId: string
): Promise<number> {
  const result = await db.query<{ available_gbp: string }>(
    `SELECT COALESCE(SUM(
       CASE WHEN le.direction = 'credit' THEN le.amount_gbp ELSE -le.amount_gbp END
     ), 0)::text AS available_gbp
     FROM ledger_entries le
     WHERE le.account_id = (
       SELECT id FROM ledger_accounts
       WHERE owner_type = 'user' AND owner_id = $1 AND account_code = 'seller_payable'
       LIMIT 1
     )`,
    [sellerId]
  );
  return Math.round(Number(result.rows[0]?.available_gbp ?? '0') * 100);
}

// ---------------------------------------------------------------------------
// Daily flat-fee charging
// ---------------------------------------------------------------------------

/**
 * Posts today's flat fee for a promotion if no charge row exists for the
 * current UTC day yet. Idempotent: the (promotion_id, charge_day) UNIQUE
 * claim means concurrent callers cannot double-charge.
 *
 * Order inside the transaction (all under the promotion-row FOR UPDATE):
 *   1. serveability re-check — unservable → 'paused' + paused_reason, no
 *      charge row is claimed, nothing is billed
 *   2. charge-day claim (idempotency)
 *   3. seller_payable account row lock — serializes debits across
 *      promotions and vs payout debits
 *   4. balance read → insufficient → 'exhausted' + 'insufficient_balance'
 *      charge row
 *   5. paired ledger posting + spend_day stamp
 *
 * Ledger posting (inside one transaction):
 *   debit  seller's `seller_payable` account  — reduces withdrawable balance
 *   credit platform `platform_revenue`        — promotion fee revenue
 * Both lines carry source_type 'promotion', line_type 'promotion_daily_fee'
 * and source_id `promotion_charge:<chargeRowId>` for audit.
 */
export async function chargePromotionForToday(
  db: Pool,
  promotionId: string
): Promise<PromotionChargeOutcome> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const promoResult = await client.query<{
      id: string;
      listing_id: string;
      seller_id: string;
      daily_budget_minor: number;
      status: string;
    }>(
      `SELECT id, listing_id, seller_id, daily_budget_minor, status
       FROM listing_promotions
       WHERE id = $1
       FOR UPDATE`,
      [promotionId]
    );
    const promo = promoResult.rows[0];
    if (!promo || promo.status !== 'active' || promo.daily_budget_minor <= 0) {
      await client.query('COMMIT');
      return 'not_active';
    }

    // Serveability re-check, still inside the promotion-row lock: a
    // promotion whose listing can no longer be bought (sold, risk_pending
    // hold, paused, deleted) or whose seller lost distribution (reach_state
    // 'limited'/'suspended') must never be billed for inventory it cannot
    // serve. It flips to 'paused' with a machine-readable paused_reason —
    // 'exhausted' stays reserved for insufficient balance — and no
    // promotion_charges row is claimed for the day.
    const serveableResult = await client.query<{
      listing_status: string;
      reach_state: string;
    }>(
      `SELECT l.status AS listing_status,
              COALESCE(u.reach_state, 'normal') AS reach_state
       FROM listings l
       LEFT JOIN users u ON u.id = $2
       WHERE l.id = $1`,
      [promo.listing_id, promo.seller_id]
    );
    const serveable = serveableResult.rows[0];
    // 'sold'/'paused'/'deleted'/'risk_pending' are all non-'active' statuses —
    // no separate sold_at column exists on listings (status is the lifecycle).
    const unservableReason =
      !serveable || serveable.listing_status !== 'active'
        ? 'listing_unservable'
        : serveable.reach_state !== 'normal'
          ? 'seller_restricted'
          : null;
    if (unservableReason) {
      await client.query(
        `UPDATE listing_promotions
         SET status = 'paused', paused_reason = $2, updated_at = NOW()
         WHERE id = $1`,
        [promo.id, unservableReason]
      );
      await client.query('COMMIT');
      return 'unservable';
    }

    const chargeId = `pch_${randomUUID()}`;
    const claim = await client.query<{ id: string }>(
      `INSERT INTO promotion_charges
         (id, promotion_id, seller_id, charge_day, amount_minor, status)
       VALUES ($1, $2, $3, CURRENT_DATE, $4, 'charged')
       ON CONFLICT (promotion_id, charge_day) DO NOTHING
       RETURNING id`,
      [chargeId, promo.id, promo.seller_id, promo.daily_budget_minor]
    );

    if (claim.rowCount === 0) {
      await client.query('COMMIT');
      return 'already_charged';
    }

    // Serialize every debit against the seller's payable account BEFORE the
    // balance is read. Two promotions of the same seller settled by
    // concurrent serving requests — or a concurrent payout debit — would
    // otherwise each observe the same pre-debit balance and overdraw. The
    // row lock is held to COMMIT; the promotion-row lock above is kept too
    // (claim ordering).
    const sellerAccountId = await ensurePromotionLedgerAccount(
      client, 'user', promo.seller_id, 'seller_payable'
    );
    await client.query(
      `SELECT id FROM ledger_accounts WHERE id = $1 FOR UPDATE`,
      [sellerAccountId]
    );

    const balanceMinor = await getSellerPayableBalanceMinor(client, promo.seller_id);
    if (balanceMinor < promo.daily_budget_minor) {
      // Truthful stop: record why the charge could not post and retire the
      // promotion rather than serving free impressions or overdrawing.
      await client.query(
        `UPDATE promotion_charges SET status = 'insufficient_balance' WHERE id = $1`,
        [chargeId]
      );
      await client.query(
        `UPDATE listing_promotions
         SET status = 'exhausted', updated_at = NOW()
         WHERE id = $1`,
        [promo.id]
      );
      await client.query('COMMIT');
      return 'insufficient_balance';
    }

    const platformAccountId = await ensurePromotionLedgerAccount(
      client, 'platform', 'platform', 'platform_revenue'
    );
    const sourceId = `promotion_charge:${chargeId}`;

    await appendPromotionLedgerEntry(client, {
      accountId: sellerAccountId,
      counterpartyAccountId: platformAccountId,
      direction: 'debit',
      amountMinor: promo.daily_budget_minor,
      sourceId,
      lineType: 'promotion_daily_fee',
      metadata: { promotionId: promo.id, chargeId },
    });
    await appendPromotionLedgerEntry(client, {
      accountId: platformAccountId,
      counterpartyAccountId: sellerAccountId,
      direction: 'credit',
      amountMinor: promo.daily_budget_minor,
      sourceId,
      lineType: 'promotion_daily_fee',
      metadata: { promotionId: promo.id, chargeId },
    });

    await client.query(
      `UPDATE promotion_charges SET ledger_source_id = $2 WHERE id = $1`,
      [chargeId, sourceId]
    );
    await client.query(
      `UPDATE listing_promotions
       SET spend_day = CURRENT_DATE, daily_spend_minor = $2, updated_at = NOW()
       WHERE id = $1`,
      [promo.id, promo.daily_budget_minor]
    );

    await client.query('COMMIT');
    return 'charged';
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Connection may already be broken — nothing further to undo.
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Lazy lifecycle settle, run before serving:
 *   - active promotions past ends_at → 'ended'
 *   - active promotions not yet charged today → charge (or exhaust);
 *     promotions that fail the serveability re-check inside the charge
 *     transaction are auto-paused with a paused_reason instead of billed
 * Safe to call on every serving request; both operations are idempotent.
 */
export async function settlePromotionLifecycle(db: Pool): Promise<void> {
  await db.query(
    `UPDATE listing_promotions
     SET status = 'ended', updated_at = NOW()
     WHERE status = 'active' AND ends_at <= NOW()`
  );

  const due = await db.query<{ id: string }>(
    `SELECT id FROM listing_promotions
     WHERE status = 'active'
       AND (spend_day IS NULL OR spend_day < CURRENT_DATE)`
  );
  for (const row of due.rows) {
    await chargePromotionForToday(db, row.id);
  }
}

// ---------------------------------------------------------------------------
// Serving
// ---------------------------------------------------------------------------

/**
 * Returns promotions eligible to occupy paid slots for the given context.
 *
 * A promotion is serveable only when ALL of the following hold:
 *   - status = 'active' and inside [starts_at, ends_at)
 *   - today's flat fee actually posted (spend_day = CURRENT_DATE,
 *     daily_spend_minor > 0) — settled lazily at the top of this function
 *   - the listing itself is still purchasable (status 'active', unsold)
 *   - the seller still has distribution (COALESCE(reach_state,'normal'))
 *   - the listing matches the query/category context when provided and
 *     satisfies the buyer's explicit filters (price range, condition,
 *     size, brands[], sizes[], sustainableOnly) — a Sponsored unit never
 *     bypasses an explicit filter
 *   - the viewer is not the seller (never serve a seller their own ad)
 */
export async function fetchPromotedListingsForQuery(
  db: Pool,
  options: FetchPromotedOptions = {}
): Promise<PromotedListingPlacement[]> {
  await settlePromotionLifecycle(db);

  const limit = Math.min(Math.max(options.limit ?? 4, 1), 20);
  const params: unknown[] = [];
  const clauses: string[] = [
    `p.status = 'active'`,
    `p.starts_at <= NOW()`,
    `p.ends_at > NOW()`,
    `p.spend_day = CURRENT_DATE`,
    `p.daily_spend_minor > 0`,
    `l.status = 'active'`,
  ];

  if (options.viewerId) {
    params.push(options.viewerId);
    clauses.push(`p.seller_id <> $${params.length}`);
  }

  const query = options.query?.trim();
  if (query) {
    params.push(`%${query}%`);
    const slot = `$${params.length}`;
    clauses.push(
      `(l.title ILIKE ${slot} OR l.brand ILIKE ${slot} OR l.category ILIKE ${slot})`
    );
  }

  // Explicit buyer filters — a Sponsored unit must satisfy the same
  // filter set the organic query applied. Clauses mirror
  // computeSearchResults in routes/searchExtended.ts.
  const filters = options.filters;
  const category = filters?.category?.trim();
  if (category) {
    params.push(category);
    clauses.push(`l.category = $${params.length}`);
  }
  const condition = filters?.condition?.trim();
  if (condition) {
    params.push(condition);
    clauses.push(`l.condition = $${params.length}`);
  }
  const size = filters?.size?.trim();
  if (size) {
    params.push(size);
    clauses.push(`l.size = $${params.length}`);
  }
  const brands = filters?.brands?.map((b) => b.trim()).filter(Boolean);
  if (brands && brands.length > 0) {
    params.push(brands);
    clauses.push(`l.brand = ANY($${params.length})`);
  }
  const sizes = filters?.sizes?.map((s) => s.trim()).filter(Boolean);
  if (sizes && sizes.length > 0) {
    params.push(sizes);
    clauses.push(`l.size = ANY($${params.length})`);
  }
  if (filters?.priceMin != null) {
    params.push(filters.priceMin);
    clauses.push(`l.price_gbp >= $${params.length}`);
  }
  if (filters?.priceMax != null) {
    params.push(filters.priceMax);
    clauses.push(`l.price_gbp <= $${params.length}`);
  }
  if (filters?.sustainableOnly) {
    clauses.push(`l.sustainability_grade IN ('A', 'B')`);
  }

  params.push(limit);

  const result = await db.query<
    PromotedListingRow & { promotion_id: string }
  >(
    `SELECT p.id AS promotion_id,
            l.id, l.seller_id, l.title, l.description, l.price_gbp,
            l.image_url, l.status, l.category, l.brand, l.size,
            l.condition, l.original_price_gbp, l.created_at
     FROM listing_promotions p
     JOIN listings l ON l.id = p.listing_id
     JOIN users reach_u ON reach_u.id = p.seller_id
     WHERE ${clauses.join('\n       AND ')}
       AND COALESCE(reach_u.reach_state, 'normal') = 'normal'
     ORDER BY p.created_at ASC
     LIMIT $${params.length}`,
    params
  );

  return result.rows.map((row) => ({
    promotionId: row.promotion_id,
    listing: {
      id: row.id,
      seller_id: row.seller_id,
      title: row.title,
      description: row.description,
      price_gbp: row.price_gbp,
      image_url: row.image_url,
      status: row.status,
      category: row.category,
      brand: row.brand,
      size: row.size,
      condition: row.condition,
      original_price_gbp: row.original_price_gbp,
      created_at: row.created_at,
    },
  }));
}

// ---------------------------------------------------------------------------
// Blending — fixed-slot interleave, organic order untouched
// ---------------------------------------------------------------------------

/**
 * Interleaves promoted units into an organic result list at a fixed slot
 * rate: after every `slotEvery` organic items, the next promoted unit is
 * inserted. Organic relative order is never changed; promoted units are
 * stamped `{ promoted: true, disclosure: 'Sponsored' }` — and when a unit
 * carries a `data` payload object the stamp lands there too, so both flat
 * search rows and envelope feed units expose the disclosure.
 */
export function blendPromotedIntoResults<T>(
  organic: T[],
  promoted: T[],
  slotEvery: number = DEFAULT_PROMOTED_SLOT_EVERY
): T[] {
  if (promoted.length === 0) return organic.slice();
  const every = Math.max(1, Math.floor(slotEvery));
  // Sponsored-share cap: a page that never reaches a slot boundary carries
  // no paid units at all. A zero-organic page must never be all ads, and a
  // short organic tail is not padded with sponsored units.
  if (organic.length < every) return organic.slice();
  const out: T[] = [];
  let promotedIndex = 0;

  for (let i = 0; i < organic.length; i++) {
    out.push(organic[i]);
    if ((i + 1) % every === 0 && promotedIndex < promoted.length) {
      out.push(stampPromoted(promoted[promotedIndex]));
      promotedIndex += 1;
    }
  }

  // Remaining promoted units trail the tail — still stamped, still a fixed
  // labelled slot — but only because at least one real slot boundary was
  // reached above (organic.length >= every is guaranteed by the cap).
  while (promotedIndex < promoted.length) {
    out.push(stampPromoted(promoted[promotedIndex]));
    promotedIndex += 1;
  }

  return out;
}

function stampPromoted<T>(item: T): T {
  const stamped: Record<string, unknown> = {
    ...(item as Record<string, unknown>),
    promoted: true,
    disclosure: PROMOTED_DISCLOSURE,
  };
  const data = stamped.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    stamped.data = {
      ...(data as Record<string, unknown>),
      promoted: true,
      disclosure: PROMOTED_DISCLOSURE,
    };
  }
  return stamped as T;
}

// ---------------------------------------------------------------------------
// Impression reporting
// ---------------------------------------------------------------------------

/**
 * Records a served-impression fact per placement. Called after a promoted
 * unit is actually included in a response — 'impression' here means
 * "served into a response payload", which is the honest server-side event.
 */
export async function recordPromotionImpressions(
  db: Pool,
  placements: Array<{ promotionId: string; listingId: string }>,
  viewerId: string | null,
  surface: string
): Promise<void> {
  if (placements.length === 0) return;
  const values: string[] = [];
  const params: Array<string | null> = [];
  placements.forEach((p, i) => {
    const base = i * 4;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, 'impression', $${base + 4})`);
    params.push(p.promotionId, p.listingId, viewerId, surface);
  });
  await db.query(
    `INSERT INTO promotion_impressions
       (promotion_id, listing_id, viewer_id, event_type, surface)
     VALUES ${values.join(', ')}`,
    params
  );
}
