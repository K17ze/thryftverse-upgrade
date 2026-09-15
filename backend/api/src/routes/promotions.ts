import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import {
  chargePromotionForToday,
  getSellerPayableBalanceMinor,
  type PromotionChargeOutcome,
} from '../lib/promotionServing.js';

type PromotionRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
};

// ──────────────────────────────────────────────────────────────────────────
// Seller promotions — flat-fee promoted listings (migration 301).
//
// A seller pays a fixed GBP/day fee; the listing then occupies labelled
// "Sponsored" slots blended into discovery/search at a fixed rate by
// `blendPromotedIntoResults` — organic ranking is never altered. The daily
// fee is debited from the seller's `seller_payable` ledger account (the
// Wallet balance) once per active UTC day via `chargePromotionForToday`;
// every debit lands in `promotion_charges` + paired `ledger_entries` rows so
// spend reporting is auditable. A promotion that cannot pay stops serving
// ('exhausted') — it never delivers unbilled impressions.
// ──────────────────────────────────────────────────────────────────────────

/** £1–£500/day in pence — matches the CHECK constraint in migration 301. */
const MIN_DAILY_BUDGET_MINOR = 100;
const MAX_DAILY_BUDGET_MINOR = 50_000;
const ALLOWED_DURATIONS_DAYS = [7, 14, 30] as const;

const createPromotionSchema = z.object({
  listingId: z.string().min(1).max(80),
  /** Flat daily fee in GBP minor units (pence). £1.00–£500.00/day. */
  dailyBudgetMinor: z
    .number()
    .int()
    .min(MIN_DAILY_BUDGET_MINOR)
    .max(MAX_DAILY_BUDGET_MINOR),
  durationDays: z
    .number()
    .int()
    .refine((d): d is (typeof ALLOWED_DURATIONS_DAYS)[number] =>
      (ALLOWED_DURATIONS_DAYS as readonly number[]).includes(d),
    ),
  /** Optional client replay key — a retried POST returns the original row. */
  idempotencyKey: z.string().min(8).max(120).optional(),
});

interface PromotionRow {
  id: string;
  listing_id: string;
  seller_id: string;
  daily_budget_minor: number;
  daily_spend_minor: number;
  spend_day: string | null;
  status: 'active' | 'paused' | 'exhausted' | 'ended';
  /** Machine-readable reason for a system-initiated pause (migration 302);
   *  NULL for seller-initiated pauses and never-paused promotions. */
  paused_reason: string | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
  idempotency_key: string | null;
}

function toPromotionPayload(row: PromotionRow) {
  return {
    id: row.id,
    listingId: row.listing_id,
    status: row.status,
    dailyBudgetMinor: row.daily_budget_minor,
    dailyBudgetGbp: row.daily_budget_minor / 100,
    spendDay: row.spend_day,
    chargedTodayMinor: row.daily_spend_minor,
    pausedReason: row.paused_reason ?? null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
  };
}

function insufficientBalancePayload(availableMinor: number, requiredMinor: number) {
  return {
    ok: false as const,
    code: 'INSUFFICIENT_BALANCE',
    error:
      'Your available balance cannot cover the daily promotion fee. ' +
      'The promotion was not activated.',
    availableMinor,
    requiredMinor,
  };
}

/**
 * Register promotion routes:
 *   POST /seller/promotions              — create + activate (auth)
 *   GET  /seller/promotions              — list with spend (auth)
 *   POST /seller/promotions/:id/pause    — stop serving, stop billing (auth)
 *   POST /seller/promotions/:id/resume   — resume + charge today (auth)
 *   POST /seller/promotions/:id/end      — permanently retire (auth)
 *   GET  /seller/promotions/:id/stats    — impressions/clicks/spend (auth)
 */
export const registerPromotionRoutes = ({ app, db }: PromotionRouteDependencies): void => {
  app.post('/seller/promotions', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const sellerId = request.authUser.userId;

    let body: z.infer<typeof createPromotionSchema>;
    try {
      body = createPromotionSchema.parse(request.body ?? {});
    } catch (err) {
      reply.code(400);
      const first =
        err instanceof z.ZodError ? err.issues[0]?.message : undefined;
      return {
        ok: false,
        error:
          first ??
          `Expected { listingId, dailyBudgetMinor ${MIN_DAILY_BUDGET_MINOR}-${MAX_DAILY_BUDGET_MINOR}, durationDays ${ALLOWED_DURATIONS_DAYS.join('|')} }`,
      };
    }

    // Idempotent replay — the (seller_id, idempotency_key) partial unique
    // index makes the check durable; a retry returns the original row.
    if (body.idempotencyKey) {
      const existing = await db.query<PromotionRow>(
        `SELECT * FROM listing_promotions
         WHERE seller_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [sellerId, body.idempotencyKey]
      );
      if (existing.rows[0]) {
        return { ok: true, promotion: toPromotionPayload(existing.rows[0]), replayed: true };
      }
    }

    // Listing must exist, belong to the seller, and be live.
    const listingResult = await db.query<{
      id: string;
      seller_id: string;
      status: string;
    }>(`SELECT id, seller_id, status FROM listings WHERE id = $1`, [
      body.listingId,
    ]);
    const listing = listingResult.rows[0];
    if (!listing) {
      reply.code(404);
      return { ok: false, error: 'Listing not found' };
    }
    if (listing.seller_id !== sellerId) {
      reply.code(403);
      return { ok: false, error: 'You can only promote your own listings' };
    }
    if (listing.status !== 'active') {
      reply.code(409);
      return {
        ok: false,
        code: 'LISTING_NOT_PROMOTABLE',
        error: `Only active listings can be promoted (current status: ${listing.status})`,
      };
    }

    // Fail-closed budget check before the row exists — a promotion that
    // cannot pay its first day must not be created.
    const availableMinor = await getSellerPayableBalanceMinor(db, sellerId);
    if (availableMinor < body.dailyBudgetMinor) {
      reply.code(402);
      return insufficientBalancePayload(availableMinor, body.dailyBudgetMinor);
    }

    const promotionId = `prm_${randomUUID()}`;
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + body.durationDays * 86_400_000);

    let inserted: PromotionRow;
    try {
      const insertResult = await db.query<PromotionRow>(
        `INSERT INTO listing_promotions
           (id, listing_id, seller_id, daily_budget_minor, status,
            starts_at, ends_at, idempotency_key)
         VALUES ($1, $2, $3, $4, 'active', $5, $6, $7)
         RETURNING *`,
        [
          promotionId,
          body.listingId,
          sellerId,
          body.dailyBudgetMinor,
          startsAt.toISOString(),
          endsAt.toISOString(),
          body.idempotencyKey ?? null,
        ]
      );
      inserted = insertResult.rows[0];
    } catch (err) {
      const pgErr = err as { code?: string; constraint?: string };
      if (
        pgErr.code === '23505' &&
        pgErr.constraint === 'listing_promotions_active_listing_idx'
      ) {
        reply.code(409);
        return {
          ok: false,
          code: 'PROMOTION_ALREADY_ACTIVE',
          error: 'This listing already has an active promotion',
        };
      }
      if (
        pgErr.code === '23505' &&
        pgErr.constraint === 'listing_promotions_idempotency_idx' &&
        body.idempotencyKey
      ) {
        // Lost the insert race to a concurrent retry — return that row.
        const replay = await db.query<PromotionRow>(
          `SELECT * FROM listing_promotions
           WHERE seller_id = $1 AND idempotency_key = $2
           LIMIT 1`,
          [sellerId, body.idempotencyKey]
        );
        if (replay.rows[0]) {
          return { ok: true, promotion: toPromotionPayload(replay.rows[0]), replayed: true };
        }
      }
      throw err;
    }

    // Charge the first day immediately — the promotion only becomes
    // serveable once today's fee posts.
    const chargeOutcome: PromotionChargeOutcome = await chargePromotionForToday(
      db,
      promotionId
    );
    if (chargeOutcome === 'insufficient_balance') {
      // Balance was consumed between the check and the charge. The row now
      // exists as 'exhausted' — report that honestly.
      reply.code(402);
      return {
        ...insufficientBalancePayload(availableMinor, body.dailyBudgetMinor),
        promotion: { ...toPromotionPayload(inserted), status: 'exhausted' as const },
      };
    }
    if (chargeOutcome === 'unservable') {
      // The listing/seller became unservable between the create-time check
      // and the charge (sold, held, or lost distribution). The charge path
      // auto-paused the promotion with a paused_reason; nothing was billed.
      const pausedRow = (
        await db.query<PromotionRow>(
          `SELECT * FROM listing_promotions WHERE id = $1`,
          [promotionId]
        )
      ).rows[0];
      reply.code(409);
      return {
        ok: false as const,
        code: 'LISTING_UNSERVABLE',
        error: 'This listing can no longer be promoted right now',
        promotion: pausedRow ? toPromotionPayload(pausedRow) : undefined,
      };
    }

    const fresh = await db.query<PromotionRow>(
      `SELECT * FROM listing_promotions WHERE id = $1`,
      [promotionId]
    );
    reply.code(201);
    return {
      ok: true,
      promotion: toPromotionPayload(fresh.rows[0] ?? inserted),
      charge: { outcome: chargeOutcome, amountMinor: body.dailyBudgetMinor },
    };
  });

  app.get('/seller/promotions', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const sellerId = request.authUser.userId;

    const result = await db.query<
      PromotionRow & {
        listing_title: string | null;
        listing_image_url: string | null;
        total_spend_minor: string;
      }
    >(
      `SELECT p.*, l.title AS listing_title, l.image_url AS listing_image_url,
              (SELECT COALESCE(SUM(c.amount_minor), 0)
                 FROM promotion_charges c
                WHERE c.promotion_id = p.id AND c.status = 'charged'
              )::text AS total_spend_minor
       FROM listing_promotions p
       LEFT JOIN listings l ON l.id = p.listing_id
       WHERE p.seller_id = $1
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [sellerId]
    );

    return {
      ok: true,
      promotions: result.rows.map((row) => ({
        ...toPromotionPayload(row),
        listingTitle: row.listing_title,
        listingImageUrl: row.listing_image_url,
        totalSpendMinor: Number(row.total_spend_minor),
        totalSpendGbp: Number(row.total_spend_minor) / 100,
      })),
    };
  });

  // ── Lifecycle actions ──────────────────────────────────────────────────
  // Each loads the promotion, verifies ownership, applies the allowed
  // transition, and returns the fresh row — never a fabricated status.

  const loadOwnedPromotion = async (
    sellerId: string,
    promotionId: string
  ): Promise<PromotionRow | null> => {
    const result = await db.query<PromotionRow>(
      `SELECT * FROM listing_promotions WHERE id = $1`,
      [promotionId]
    );
    const row = result.rows[0];
    if (!row || row.seller_id !== sellerId) return null;
    return row;
  };

  app.post('/seller/promotions/:id/pause', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const { id } = request.params as { id: string };
    const promotion = await loadOwnedPromotion(request.authUser.userId, id);
    if (!promotion) {
      reply.code(404);
      return { ok: false, error: 'Promotion not found' };
    }
    if (promotion.status !== 'active') {
      reply.code(409);
      return {
        ok: false,
        code: 'INVALID_TRANSITION',
        error: `Cannot pause a promotion in status '${promotion.status}'`,
      };
    }
    const updated = await db.query<PromotionRow>(
      `UPDATE listing_promotions
       SET status = 'paused', paused_reason = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    return { ok: true, promotion: toPromotionPayload(updated.rows[0]) };
  });

  app.post('/seller/promotions/:id/resume', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const sellerId = request.authUser.userId;
    const { id } = request.params as { id: string };
    const promotion = await loadOwnedPromotion(sellerId, id);
    if (!promotion) {
      reply.code(404);
      return { ok: false, error: 'Promotion not found' };
    }
    // 'exhausted' is resumable too — one insufficient-balance day must not
    // permanently kill a promotion. The balance check below is the fresh
    // gate: without funds the resume still fails with 402.
    if (promotion.status !== 'paused' && promotion.status !== 'exhausted') {
      reply.code(409);
      return {
        ok: false,
        code: 'INVALID_TRANSITION',
        error: `Cannot resume a promotion in status '${promotion.status}'`,
      };
    }
    if (new Date(promotion.ends_at).getTime() <= Date.now()) {
      // Past its window — resume is meaningless; mark it ended honestly.
      await db.query(
        `UPDATE listing_promotions SET status = 'ended', updated_at = NOW() WHERE id = $1`,
        [id]
      );
      reply.code(409);
      return {
        ok: false,
        code: 'INVALID_TRANSITION',
        error: 'This promotion has already ended',
      };
    }

    const availableMinor = await getSellerPayableBalanceMinor(db, sellerId);
    if (availableMinor < promotion.daily_budget_minor) {
      reply.code(402);
      return insufficientBalancePayload(availableMinor, promotion.daily_budget_minor);
    }

    const updated = await db.query<PromotionRow>(
      `UPDATE listing_promotions
       SET status = 'active', paused_reason = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    // Resuming bills today's flat fee (no-op if already charged today).
    // The charge path also re-checks serveability — if the listing/seller
    // can no longer serve it auto-pauses with a paused_reason, which the
    // caller must see rather than a fabricated 'active'.
    const chargeOutcome = await chargePromotionForToday(db, id);
    if (chargeOutcome === 'unservable') {
      const pausedRow = (
        await db.query<PromotionRow>(
          `SELECT * FROM listing_promotions WHERE id = $1`,
          [id]
        )
      ).rows[0];
      reply.code(409);
      return {
        ok: false as const,
        code: 'LISTING_UNSERVABLE',
        error: 'This listing can no longer be promoted right now',
        promotion: pausedRow ? toPromotionPayload(pausedRow) : undefined,
      };
    }
    const fresh =
      chargeOutcome === 'insufficient_balance'
        ? (
            await db.query<PromotionRow>(
              `SELECT * FROM listing_promotions WHERE id = $1`,
              [id]
            )
          ).rows[0]
        : updated.rows[0];

    return {
      ok: true,
      promotion: toPromotionPayload(fresh),
      charge: {
        outcome: chargeOutcome,
        amountMinor: promotion.daily_budget_minor,
      },
    };
  });

  app.post('/seller/promotions/:id/end', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const { id } = request.params as { id: string };
    const promotion = await loadOwnedPromotion(request.authUser.userId, id);
    if (!promotion) {
      reply.code(404);
      return { ok: false, error: 'Promotion not found' };
    }
    if (promotion.status === 'ended') {
      reply.code(409);
      return {
        ok: false,
        code: 'INVALID_TRANSITION',
        error: 'This promotion has already ended',
      };
    }
    const updated = await db.query<PromotionRow>(
      `UPDATE listing_promotions SET status = 'ended', updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    return { ok: true, promotion: toPromotionPayload(updated.rows[0]) };
  });

  app.get('/seller/promotions/:id/stats', async (request, reply) => {
    if (!request.authUser) {
      reply.code(401);
      return { ok: false, error: 'Unauthorized' };
    }
    const { id } = request.params as { id: string };
    const promotion = await loadOwnedPromotion(request.authUser.userId, id);
    if (!promotion) {
      reply.code(404);
      return { ok: false, error: 'Promotion not found' };
    }

    const [eventsResult, chargesResult] = await Promise.all([
      db.query<{ impressions: string; clicks: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE event_type = 'impression')::text AS impressions,
           COUNT(*) FILTER (WHERE event_type = 'click')::text AS clicks
         FROM promotion_impressions
         WHERE promotion_id = $1`,
        [id]
      ),
      db.query<{
        total_spend_minor: string;
        charged_days: string;
        last_charge_day: string | null;
      }>(
        `SELECT COALESCE(SUM(amount_minor), 0)::text AS total_spend_minor,
                COUNT(*)::text AS charged_days,
                MAX(charge_day)::text AS last_charge_day
         FROM promotion_charges
         WHERE promotion_id = $1 AND status = 'charged'`,
        [id]
      ),
    ]);

    const events = eventsResult.rows[0];
    const charges = chargesResult.rows[0];
    const todayUtc = new Date().toISOString().slice(0, 10);

    return {
      ok: true,
      stats: {
        promotionId: id,
        status: promotion.status,
        // Real posted spend only — never an estimate.
        totalSpendMinor: Number(charges?.total_spend_minor ?? '0'),
        totalSpendGbp: Number(charges?.total_spend_minor ?? '0') / 100,
        chargedDays: Number(charges?.charged_days ?? '0'),
        lastChargeDay: charges?.last_charge_day ?? null,
        chargedTodayMinor:
          promotion.spend_day != null &&
          String(promotion.spend_day).slice(0, 10) === todayUtc
            ? promotion.daily_spend_minor
            : 0,
        impressions: Number(events?.impressions ?? '0'),
        clicks: Number(events?.clicks ?? '0'),
      },
    };
  });

  // Buyer-side click on a Sponsored unit. The unit payload carries
  // promotionId when promoted === true — the client fires this on tap-through
  // to the listing. Dedupes per viewer per promotion so repeated taps can't
  // inflate the metric; anonymous clicks (no auth) are recorded once per
  // request since there's no stable viewer id to dedupe on.
  app.post('/promotions/:id/click', async (request, reply) => {
    const { id } = request.params as { id: string };
    const viewerId = request.authUser?.userId ?? null;

    const promoResult = await db.query<{ listing_id: string }>(
      `SELECT listing_id FROM listing_promotions WHERE id = $1`,
      [id],
    );
    const promo = promoResult.rows[0];
    if (!promo) {
      reply.code(404);
      return { ok: false, error: 'Promotion not found', code: 'NOT_FOUND' };
    }

    if (viewerId) {
      await db.query(
        `INSERT INTO promotion_impressions
           (promotion_id, listing_id, viewer_id, event_type, surface)
         SELECT $1, $2, $3, 'click', 'tap_through'
         WHERE NOT EXISTS (
           SELECT 1 FROM promotion_impressions
           WHERE promotion_id = $1 AND viewer_id = $3 AND event_type = 'click'
         )`,
        [id, promo.listing_id, viewerId],
      );
    } else {
      await db.query(
        `INSERT INTO promotion_impressions
           (promotion_id, listing_id, viewer_id, event_type, surface)
         VALUES ($1, $2, NULL, 'click', 'tap_through')`,
        [id, promo.listing_id],
      );
    }

    return { ok: true };
  });
};
