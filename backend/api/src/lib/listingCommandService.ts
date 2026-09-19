import crypto from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { appendDomainEvent } from './domainOutbox.js';
import { logger } from './logger.js';

// ── Command + result types ──────────────────────────────────────────────
//
// `executeListingCommand` is the single canonical entry point for mutating
// listing lifecycle state. Every status transition (delete, pause, resume,
// mark-sold-external) MUST go through this service so the side effects
// (search index, offer cancellation, audit) are always consistent.
//
// Bypassing this service — e.g. running `UPDATE listings SET status = ...`
// directly from a route — is the root cause of P0-10: the search index
// keeps stale documents, active offers linger on deleted listings, and no
// audit trail is recorded.

export type ListingCommand =
  | { type: 'delete'; listingId: string; reason?: string; actorId?: string }
  | { type: 'pause'; listingId: string; reason?: string; actorId?: string }
  | { type: 'resume'; listingId: string; reason?: string; actorId?: string }
  | {
      type: 'mark_sold_external';
      listingId: string;
      salePrice?: number;
      reason?: string;
      actorId?: string;
    };

export type CommandResult =
  | { status: 'applied'; listingId: string; newStatus: string }
  | { status: 'rejected'; listingId: string; reason: string; currentStatus: string }
  | { status: 'conflict'; listingId: string; reason: string; currentStatus: string };

// ── Allowed status transitions ──────────────────────────────────────────
//
// `sold` and `deleted` are terminal — no command may move a listing out of
// them. `draft` may be activated or deleted (publish / discard). `active`
// may be paused, deleted, or marked sold. `paused` may be resumed, deleted,
// or marked sold externally (a seller can complete a sale while hidden).
// `risk_pending` is an operator/system hold: the owner cannot move a held
// listing in ANY direction — including delete — until the risk review
// resolves it. This mirrors the CHECK constraint on listings.status from
// migration 031 and the canonical state machine documented in AGENTS.md.
//
// Exported so the owner-facing PATCH /listings/:listingId status write
// validates against the same table — the two surfaces must never drift.

export const LISTING_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  active: ['paused', 'deleted', 'sold'],
  paused: ['active', 'deleted', 'sold'],
  draft: ['active', 'deleted'],
  risk_pending: [], // held pending risk review — owner transitions blocked
  sold: [], // terminal
  deleted: [], // terminal
};

/** True when `fromStatus -> toStatus` is a permitted lifecycle transition. */
export function canListingTransition(fromStatus: string, toStatus: string): boolean {
  return (LISTING_STATUS_TRANSITIONS[fromStatus] ?? []).includes(toStatus);
}

const COMMAND_TARGET_STATUS: Record<ListingCommand['type'], string> = {
  delete: 'deleted',
  pause: 'paused',
  resume: 'active',
  mark_sold_external: 'sold',
};

// ── Publish-risk gate ───────────────────────────────────────────────────
//
// A command whose TARGET is 'active' (resume, draft activation, any future
// reactivation) is a publish transition and must clear the same
// `listing.publish.requested` evaluation POST /listings and the PATCH
// →active path enforce. `evaluatePublishRisk` is injectable for tests; the
// default lazily wires the real risk-decision service (dynamic imports keep
// the module graph acyclic — same convention as the search-sync side
// effects below).

/** Minimal decision shape the gate enforces — structurally compatible with
 *  `RiskDecision` from lib/riskDecision.js. */
export interface ListingPublishRiskDecision {
  decisionId: string;
  ownerDecision: string;
}

export type ListingPublishRiskEvaluator = (input: {
  subjectRef: string;
  actionRef: string;
  amountMinor: number;
  currency: 'GBP';
  userId: string;
  headers: Record<string, string | string[] | undefined>;
  ip: string;
  context: Record<string, unknown>;
}) => Promise<ListingPublishRiskDecision>;

export interface ListingCommandExecutionOptions {
  /** Request-scoped signals (headers/ip) fed into the risk evaluation. */
  requestContext?: {
    headers?: Record<string, string | string[] | undefined>;
    ip?: string;
  };
  /** Test seam — production callers leave this unset. */
  evaluatePublishRisk?: ListingPublishRiskEvaluator;
}

let cachedPublishRiskEvaluator: ListingPublishRiskEvaluator | null = null;

/**
 * Lazily build the production evaluator. The dependency set mirrors exactly
 * what index.ts hands to evaluateRisk for the publish routes: the shared
 * redis singleton, the config-gated shadow scorer and the governed IP
 * reputation provider.
 */
async function resolvePublishRiskEvaluator(db: Pool): Promise<ListingPublishRiskEvaluator> {
  if (cachedPublishRiskEvaluator) return cachedPublishRiskEvaluator;
  const [
    { evaluateRisk },
    { redis },
    { config },
    { FraudShadowScoringService },
    { createIpReputationProvider },
  ] = await Promise.all([
    import('./riskDecision.js'),
    import('./redis.js'),
    import('../config.js'),
    import('./fraudShadowScoring.js'),
    import('./ipReputationProviders.js'),
  ]);
  const shadowService = config.fraudShadowEnabled
    ? new FraudShadowScoringService({
        db,
        mlServiceUrl: config.decisionServiceUrl,
        mlServiceToken: config.decisionServiceToken,
        timeoutMs: config.fraudShadowTimeoutMs,
      })
    : null;
  const ipReputationProvider = createIpReputationProvider(config, logger);
  const evaluator: ListingPublishRiskEvaluator = (input) =>
    evaluateRisk(
      { db, redis, logger, shadowService, ipReputationProvider },
      { eventType: 'listing.publish.requested', ...input },
    );
  cachedPublishRiskEvaluator = evaluator;
  return evaluator;
}

/**
 * Best-effort execution bookkeeping (FR-13) — mirrors how the routes call
 * recordExecution after enforcing a publish decision. Never throws.
 */
async function recordPublishExecution(
  db: Pool,
  decision: ListingPublishRiskDecision | null,
  listingId: string,
): Promise<void> {
  if (!decision) return;
  try {
    const { recordExecution } = await import('./riskDecision.js');
    await recordExecution(db, {
      decisionId: decision.decisionId,
      ownerService: 'listings',
      executionStatus: 'executed',
      domainEntityType: 'listing',
      domainEntityId: listingId,
    });
  } catch {
    // Execution bookkeeping must never block the command outcome.
  }
}

interface ListingLockRow {
  id: string;
  seller_id: string;
  status: string;
  version: number;
  price_gbp: number | string;
}

/**
 * Execute a single canonical listing lifecycle command inside a transaction.
 *
 * Guarantees:
 *  1. Row-level `FOR UPDATE` lock so concurrent commands serialize.
 *  2. Optimistic concurrency precondition when `expectedVersion` is given.
 *  3. Transition validation against `LISTING_STATUS_TRANSITIONS`, plus the
 *     publish-risk gate for any transition targeting 'active'.
 *  4. Status mutation + version bump committed atomically.
 *  5. Side effects fired after commit:
 *     - search index removal (delete/sold) or re-sync (pause/resume)
 *     - cancellation of active pending offers (delete/sold)
 *     - audit log entry
 *
 * Side-effect failures are logged but never throw — the status mutation is
 * already durable by the time they run, and a stale search document is
 * recoverable by the periodic re-sync, whereas rolling back a committed
 * status change would corrupt the source of truth.
 */
export async function executeListingCommand(
  db: Pool,
  command: ListingCommand,
  expectedVersion?: number,
  options?: ListingCommandExecutionOptions,
): Promise<CommandResult> {
  const { listingId, type } = command;
  const targetStatus = COMMAND_TARGET_STATUS[type];

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Load + lock the listing row.
    const lockResult = await client.query<ListingLockRow>(
      `SELECT id, seller_id, status, version, price_gbp
         FROM listings
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
      [listingId],
    );

    if (!lockResult.rowCount || lockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        status: 'rejected',
        listingId,
        reason: 'not_found',
        currentStatus: 'unknown',
      };
    }

    const current = lockResult.rows[0];

    // 2. Optimistic concurrency precondition.
    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      await client.query('ROLLBACK');
      return {
        status: 'conflict',
        listingId,
        reason: `version mismatch (expected ${expectedVersion}, found ${current.version})`,
        currentStatus: current.status,
      };
    }

    // 3. Transition validation.
    if (!canListingTransition(current.status, targetStatus)) {
      await client.query('ROLLBACK');
      return {
        status: 'rejected',
        listingId,
        reason: `transition ${current.status} -> ${targetStatus} is not allowed`,
        currentStatus: current.status,
      };
    }

    // 3b. Publish-risk gate — runs for every transition whose target is
    // 'active' (resume, draft activation, any future reactivation). This is
    // the same `listing.publish.requested` decision POST /listings and the
    // PATCH →active path enforce, so a batch resume cannot bypass a hold:
    //   allow               → transition proceeds to 'active'
    //   any other non-deny  → the listing lands on 'risk_pending' — a real,
    //     seller-visible hold state hidden from search/feed — never 'active'
    //   deny                → the command is rejected outright
    // Evaluation failure fails open to allow — the same convention the
    // routes use when evaluateRisk throws.
    let publishDecision: ListingPublishRiskDecision | null = null;
    let effectiveTargetStatus = targetStatus;
    if (targetStatus === 'active') {
      try {
        const evaluate =
          options?.evaluatePublishRisk ?? (await resolvePublishRiskEvaluator(db));
        publishDecision = await evaluate({
          subjectRef: command.actorId ?? current.seller_id,
          actionRef: listingId,
          amountMinor: Math.round(Number(current.price_gbp ?? 0) * 100),
          currency: 'GBP',
          userId: command.actorId ?? current.seller_id,
          headers: options?.requestContext?.headers ?? {},
          ip: options?.requestContext?.ip ?? '',
          context: {
            listingId,
            previousStatus: current.status,
            command: type,
          },
        });
      } catch (riskError) {
        logger.error(
          { err: riskError, listingId, command: type },
          'listingCommandService: publish risk evaluation failed — failing open to allow',
        );
      }
      const outcome = publishDecision?.ownerDecision ?? 'allow';
      if (outcome === 'deny') {
        await client.query('ROLLBACK');
        // Truthful bookkeeping: the decision was enforced (the publish was
        // refused). Best-effort — the rejection stands regardless.
        await recordPublishExecution(db, publishDecision, listingId);
        return {
          status: 'rejected',
          listingId,
          reason: 'risk_publish_denied',
          currentStatus: current.status,
        };
      }
      if (outcome !== 'allow') {
        effectiveTargetStatus = 'risk_pending';
      }
    }

    // 4. Apply the status mutation + version bump. Pause provenance
    //    (migration 305): commands reach this service only through seller /
    //    admin intent, so a 'paused' landing is 'seller'-owned — expiry
    //    sweeps must never undo it. Any other status clears automated
    //    pause ownership.
    await client.query(
      `UPDATE listings
          SET status = $2,
              pause_source = CASE WHEN $2 = 'paused' THEN 'seller' ELSE NULL END,
              version = version + 1,
              updated_at = NOW()
        WHERE id = $1`,
      [listingId, effectiveTargetStatus],
    );

    // A publish that lands on 'risk_pending' must not leave live lots
    // biddable — the bid path also re-checks the listing, but the lot rows
    // themselves would otherwise close 'sold' and then fail settlement on
    // the held listing. Cancel every non-terminal lot in this transaction.
    if (effectiveTargetStatus === 'risk_pending') {
      await cancelBiddableLiveLotsForListing(client, {
        listingId,
        actorId: command.actorId ?? null,
        reason: `listing_risk_hold:${type}`,
      });
    }

    // Cancel active pending offers for terminal transitions (delete/sold).
    // Non-terminal transitions (pause/resume) leave offers intact — a
    // paused listing may still have a pending offer that resumes if the
    // listing is reactivated before the offer expires.
    let cancelledOffers = 0;
    if (type === 'delete' || type === 'mark_sold_external') {
      const cancelResult = await client.query<{
        id: string;
        buyer_id: string;
        seller_id: string;
        offer_price_gbp: string;
        conversation_id: string | null;
        offered_by_user_id: string | null;
      }>(
        `UPDATE listing_offers
            SET status = 'cancelled',
                cancelled_at = NOW(),
                updated_at = NOW()
          WHERE listing_id = $1
            AND status = 'pending'
          RETURNING id, buyer_id, seller_id, offer_price_gbp::text,
                    conversation_id, offered_by_user_id`,
        [listingId],
      );
      cancelledOffers = cancelResult.rowCount ?? 0;

      // One `offer.cancelled` domain event per cancelled offer — the same
      // event the buyer-initiated cancel route emits — so the outbox drain
      // notifies each buyer. The events are appended inside this transaction
      // (outbox pattern) and the deduplication key is derived from the offer
      // id, so a retried command cannot double-notify.
      for (const cancelledOffer of cancelResult.rows) {
        await appendDomainEvent(client, {
          aggregateType: 'offer',
          aggregateId: cancelledOffer.id,
          eventType: 'offer.cancelled',
          actorId: command.actorId ?? null,
          deduplicationKey: `offer.cancelled:${cancelledOffer.id}`,
          payload: {
            offerId: cancelledOffer.id,
            listingId,
            buyerId: cancelledOffer.buyer_id,
            sellerId: cancelledOffer.seller_id,
            offerPriceGbp: Number(cancelledOffer.offer_price_gbp),
            conversationId: cancelledOffer.conversation_id,
            offeredByUserId: cancelledOffer.offered_by_user_id ?? cancelledOffer.buyer_id,
            // Seller-side cancellation (listing delete/mark-sold) — the
            // drain notifies the author, not the actor.
            cancelledByUserId: command.actorId ?? null,
            cancellationReason: 'listing_unavailable',
          },
        });
      }
    }

    // Record an audit entry inside the same transaction so the audit trail
    // and the status mutation commit (or roll back) together. The audited
    // target is the EFFECTIVE status — a risk-held publish is recorded as
    // landing on 'risk_pending', never claimed as 'active'.
    await recordListingCommandAudit(
      client,
      command,
      current.status,
      effectiveTargetStatus,
      cancelledOffers,
      publishDecision?.decisionId ?? null,
    );

    await client.query('COMMIT');

    // 5. Post-commit side effects. These are best-effort: the mutation is
    // already durable. A failure here is logged and left for the periodic
    // search re-sync / offer sweep to reconcile.
    await firePostCommitSideEffects(db, command, effectiveTargetStatus);

    // Record how the publish decision was enforced (FR-13 separation).
    await recordPublishExecution(db, publishDecision, listingId);

    return { status: 'applied', listingId, newStatus: effectiveTargetStatus };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback failure — the connection will be reset on release
    }
    logger.error(
      { err: error, listingId, command: type },
      'listingCommandService: failed to execute command',
    );
    // Unknown outcome — surface as a conflict so the caller reconciles.
    return {
      status: 'conflict',
      listingId,
      reason: 'server_error',
      currentStatus: 'unknown',
    };
  } finally {
    client.release();
  }
}

// ── Live-lot cancellation on hold ───────────────────────────────────────
//
// When a listing lands on 'risk_pending' — whether via this service's
// publish gate, the PATCH risk gate, or a visibility_restriction
// enforcement — any live lot still in a non-terminal state would keep
// taking bids it can never settle. This helper cancels them inside the
// caller's transaction and appends a 'lot.cancelled' row to the engine's
// `live_lot_events` audit log so the lot record stays truthful about why
// it died.

export async function cancelBiddableLiveLotsForListing(
  client: PoolClient,
  input: { listingId: string; actorId: string | null; reason: string },
): Promise<{ id: string; session_id: string }[]> {
  const cancelled = await client.query<{
    id: string;
    session_id: string;
    version: number;
  }>(
    `UPDATE live_lots
        SET status = 'cancelled',
            version = version + 1,
            updated_at = NOW()
      WHERE listing_id = $1
        AND status IN ('scheduled', 'open', 'closing', 'passed')
      RETURNING id, session_id, version`,
    [input.listingId],
  );
  for (const lot of cancelled.rows) {
    await client.query(
      `INSERT INTO live_lot_events
         (id, lot_id, session_id, event_type, event_version, actor_id, payload)
       VALUES ($1, $2, $3, 'lot.cancelled', $4, $5, $6::jsonb)`,
      [
        crypto.randomUUID(),
        lot.id,
        lot.session_id,
        lot.version,
        input.actorId,
        JSON.stringify({ lotId: lot.id, reason: input.reason }),
      ],
    );
  }
  return cancelled.rows.map((row) => ({ id: row.id, session_id: row.session_id }));
}

// ── Audit ───────────────────────────────────────────────────────────────
//
// We write to `admin_audit_logs` when an actorId is present (admin-driven
// commands) and otherwise record a lightweight row in `listing_batch_items`
// via the batch endpoint. For seller-initiated commands the actorId is the
// seller's own user id, which is still a valid `admin_user_id` value for
// audit purposes — the column name is historical.

async function recordListingCommandAudit(
  client: PoolClient,
  command: ListingCommand,
  fromStatus: string,
  toStatus: string,
  cancelledOffers: number,
  riskDecisionId: string | null,
): Promise<void> {
  const actorId = (command as { actorId?: string }).actorId;
  if (!actorId) return;

  const metadata = {
    command: command.type,
    fromStatus,
    toStatus,
    cancelledOffers,
    reason: (command as { reason?: string }).reason ?? null,
    salePrice: (command as { salePrice?: number }).salePrice ?? null,
    riskDecisionId,
  };

  try {
    await client.query(
      `INSERT INTO admin_audit_logs
          (admin_user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        actorId,
        `listing.${command.type}`,
        'listing',
        command.listingId,
        JSON.stringify(metadata),
      ],
    );
  } catch (error) {
    // Audit failure must not block the command — the mutation is the
    // source of truth. Log and continue.
    logger.warn(
      { err: (error as Error).message, listingId: command.listingId, command: command.type },
      'listingCommandService: failed to record audit entry',
    );
  }
}

// ── Post-commit side effects ────────────────────────────────────────────
//
// Dynamic imports avoid a static import cycle: searchSync re-exports
// adapter helpers that other route modules import, and those route modules
// are what register the endpoints that call this service. Lazy loading
// keeps the dependency graph acyclic at module-eval time.

async function firePostCommitSideEffects(
  db: Pool,
  command: ListingCommand,
  newStatus: string,
): Promise<void> {
  const { listingId, type } = command;

  try {
    const searchSync = await import('./searchSync.js');

    if (type === 'delete' || type === 'mark_sold_external' || newStatus === 'risk_pending') {
      // Terminal states must be removed from the search index — a deleted
      // or sold listing must never appear in discovery results. A
      // risk-held publish likewise must leave the index, not enter it.
      await searchSync.removeListingFromIndex(listingId);
    } else {
      // pause/resume — re-sync so the document reflects the new status
      // filter value. A paused listing is filtered out of active results
      // but remains in the index for seller-facing views.
      await searchSync.syncSingleListing(db, listingId);
    }
  } catch (error) {
    logger.warn(
      { err: (error as Error).message, listingId, newStatus },
      'listingCommandService: post-commit search sync failed',
    );
  }
}
