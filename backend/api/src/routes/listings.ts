import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AuthenticatedUser } from '../lib/auth.js';
import { recordConsumerReport } from '../lib/safetyCaseService.js';

// ── Listing interaction endpoints ──────────────────────────────────
//
// This module previously also exported registerListingRoutes — a dead
// mirror of the listing routes registered inline in index.ts. It was
// removed; mounting it would have crashed boot on duplicate
// registrations. This registrar exposes ONLY the endpoints that have no
// inline equivalent in index.ts, and is safe to mount alongside the
// inline listing routes without collisions. The frontend fires the
// interaction endpoints from the item-detail surface
// (trackListingView / trackListingInteraction) to feed the
// `interactions` table behind seller analytics. The report endpoint was
// moved here from index.ts so the report write could be bridged into the
// safety case graph atomically and exercised by route tests.

type ListingInteractionRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  readDb: Pool;
  optionalAuthenticate: (
    request: {
      headers: Record<string, string | string[] | undefined>;
      authUser?: AuthenticatedUser;
    },
    requestPath: string
  ) => Promise<void>;
  ensureUserExists: (userId: string) => Promise<void>;
};

export const registerListingInteractionRoutes = ({
  app,
  db,
  readDb,
  optionalAuthenticate,
  ensureUserExists,
}: ListingInteractionRouteDependencies) => {

// ── POST /listings/:listingId/view — record a listing view interaction ──
// Feeds the `interactions` table so seller analytics (views, conversion
// rate, top performers) have real data. Idempotent via a per-view
// idempotency key. Self-views (seller viewing own listing) are skipped.
app.post('/listings/:listingId/view', async (request, reply) => {
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const { listingId } = paramsSchema.parse(request.params);

  // Optional auth — anonymous views are still useful for aggregate counts.
  await optionalAuthenticate(request, '/listings/:listingId/view');
  const viewerUserId = (request as any).authUser?.userId as string | undefined;

  const bodySchema = z.object({
    idempotencyKey: z.string().min(4).max(200).optional(),
    qualified: z.boolean().optional(),
  });
  const body = bodySchema.parse(request.body ?? {});

  // Verify the listing exists and is public
  const listingResult = await readDb.query<{ seller_id: string; status: string }>(
    `SELECT seller_id, status FROM listings WHERE id = $1 LIMIT 1`,
    [listingId],
  );
  if (!listingResult.rows[0]) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }

  // Skip self-views — a seller viewing their own listing is not a
  // meaningful engagement signal for their analytics.
  if (viewerUserId && viewerUserId === listingResult.rows[0].seller_id) {
    return { ok: true, recorded: false, reason: 'self_view' };
  }

  // Only record views for public listings
  if (!['active', 'sold'].includes(listingResult.rows[0].status)) {
    return { ok: true, recorded: false, reason: 'not_public' };
  }

  // Anonymous views record with a NULL user_id — still counted in
  // aggregate analytics. (A synthetic 'anon_<ip>' id used to be inserted
  // here, but interactions.user_id references users(id) so every insert
  // FK-violated and the endpoint lied about recorded:true.) Authed
  // viewers are existence-checked first — a JWT without a users row
  // fails the write path and reports recorded:false rather than lying.
  const action = body.qualified ? 'qualified_detail_view' : 'view';
  const idempotencyKey = body.idempotencyKey ?? `view_${listingId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    if (viewerUserId) {
      await ensureUserExists(viewerUserId);
    }
    await db.query(
      `INSERT INTO interactions (user_id, listing_id, action, strength, idempotency_key, created_at)
       VALUES ($1, $2, $3, 1.0, $4, NOW())
       ON CONFLICT DO NOTHING`,
      [viewerUserId ?? null, listingId, action, idempotencyKey],
    );
  } catch {
    // Best-effort — analytics must never break the viewing flow — but the
    // caller gets the truth: the write failed, so recorded is false.
    return { ok: true, recorded: false, reason: 'write_failed' };
  }

  return { ok: true, recorded: true };
});

// ── POST /listings/:listingId/interact — record a like/save/share ──
// Feeds the `interactions` table for seller analytics engagement metrics.
app.post('/listings/:listingId/interact', async (request, reply) => {
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const { listingId } = paramsSchema.parse(request.params);

  await optionalAuthenticate(request, '/listings/:listingId/interact');
  const userId = (request as any).authUser?.userId as string | undefined;

  if (!userId) {
    reply.code(401);
    return { ok: false, error: 'Authentication required' };
  }

  const bodySchema = z.object({
    action: z.enum(['like', 'save', 'share']),
    idempotencyKey: z.string().min(4).max(200).optional(),
  });
  const body = bodySchema.parse(request.body ?? {});

  // Verify the listing exists
  const listingResult = await readDb.query<{ seller_id: string; status: string }>(
    `SELECT seller_id, status FROM listings WHERE id = $1 LIMIT 1`,
    [listingId],
  );
  if (!listingResult.rows[0]) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }

  // Skip self-interactions
  if (userId === listingResult.rows[0].seller_id) {
    return { ok: true, recorded: false, reason: 'self_interaction' };
  }

  // The interactions CHECK constraint (migration 143) has no 'like' —
  // likes are stored as 'wishlist', which is what seller analytics count
  // (sellers.ts). Map the public vocabulary onto the stored one so a
  // 'like' write actually lands instead of CHECK-violating into the catch.
  const storedAction = body.action === 'like' ? 'wishlist' : body.action;
  const idempotencyKey = body.idempotencyKey ?? `${body.action}_${listingId}_${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    await ensureUserExists(userId);
    await db.query(
      `INSERT INTO interactions (user_id, listing_id, action, strength, idempotency_key, created_at)
       VALUES ($1, $2, $3, 1.0, $4, NOW())
       ON CONFLICT DO NOTHING`,
      [userId, listingId, storedAction, idempotencyKey],
    );
  } catch {
    // Best-effort — but report the failure honestly.
    return { ok: true, recorded: false, reason: 'write_failed' };
  }

  return { ok: true, recorded: true };
});

// ── POST /listings/:listingId/report — consumer report → safety notice ──
// Moved here verbatim-in-contract from the inline index.ts handler. The
// report row and its safety notice now persist atomically via
// recordConsumerReport so a consumer report always enters the safety
// pipeline; the response additionally returns the notice id.
app.post('/listings/:listingId/report', async (request, reply) => {
  if (!request.authUser) {
    reply.code(401);
    return { ok: false, error: 'Unauthorized' };
  }
  const paramsSchema = z.object({ listingId: z.string().min(2) });
  const bodySchema = z.object({
    reason: z.enum([
      'spam', 'inappropriate', 'counterfeit', 'unresponsive', 'harassment',
      'off_platform', 'hate_speech', 'prohibited', 'scam', 'misinformation',
      'privacy', 'impersonation', 'minor_safety', 'other',
    ]),
    details: z.string().trim().max(500).optional(),
    // Client-supplied dedupe key (migration 294): a retried submission
    // resolves the original report row instead of double-filing.
    idempotencyKey: z.string().min(2).max(200).optional(),
  });
  const { listingId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body);
  const listingResult = await db.query<{ seller_id: string; title: string; status: string }>(
    `SELECT seller_id, title, status FROM listings WHERE id = $1 LIMIT 1`,
    [listingId]
  );
  if (!listingResult.rowCount) {
    reply.code(404);
    return { ok: false, error: 'Listing not found' };
  }
  if (listingResult.rows[0].seller_id === request.authUser.userId) {
    reply.code(403);
    return { ok: false, error: 'You cannot report your own listing' };
  }
  const listing = listingResult.rows[0];
  const reportId = `listing_report_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const { reportId: effectiveReportId, noticeId } = await recordConsumerReport(db, {
    kind: 'listing',
    reportId,
    reporterId: request.authUser.userId,
    subjectId: listingId,
    reason: payload.reason,
    details: payload.details ?? null,
    idempotencyKey: payload.idempotencyKey ?? null,
    subjectSnapshot: {
      sellerId: listing.seller_id,
      title: listing.title,
      status: listing.status,
    },
  });
  reply.code(201);
  return { ok: true, reportId: effectiveReportId, noticeId };
});

};
