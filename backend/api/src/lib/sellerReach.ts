import type { Pool, PoolClient } from 'pg';
import { writeAuditEvent } from './immutableAudit.js';

// ── Seller reach state ──────────────────────────────────────────────────
//
// The distribution half of the safety enforcement pipeline (migration 300).
// The safety case graph (notices → cases → decisions → enforcement_actions
// → appeals) is the ledger; `users.reach_state` is what actually reduces a
// flagged seller's distribution. `executeEnforcement` writes it for
// `visibility_restriction` actions and `reverseEnforcement` / an overturned
// appeal restores the snapshot stored in the action's scope.
//
//   normal     — full distribution (column default)
//   limited    — down-ranked in serving surfaces; applied automatically on
//                severity>=3 safety signals PENDING operator review, and by
//                operators via visibility_restriction enforcement. Reversible
//                through the existing appeals machinery.
//   suspended  — excluded from distribution entirely. The harder state; set
//                by operators, never by the auto-limit trigger.
//
// This is intentionally separate from `users.account_risk_state`
// (migration 155): that column is the ATO/compromise state machine; this is
// the trust-and-safety distribution state. Never conflate them.
//
// ── Serving-layer adoption ──────────────────────────────────────────────
//
// Any query that serves listings to buyers must join the seller row and
// apply the reach contract. Drop-in recipe for a listings query:
//
//   FROM listings l
//   JOIN users u ON u.id = l.seller_id        -- reachJoinSql('u', 'l.seller_id')
//   WHERE l.status = 'active'
//     AND COALESCE(u.reach_state, 'normal') <> 'suspended'
//                                             -- reachExcludedSql('u')
//                                              -- = REACH_EXCLUDED_SQL when the
//                                             --   users alias is 'u'
//
// For ranked surfaces, multiply the rank/score expression by:
//
//   CASE COALESCE(u.reach_state, 'normal')
//     WHEN 'limited' THEN 0.3 WHEN 'suspended' THEN 0.0 ELSE 1.0 END
//                                             -- reachRankMultiplierExpr('u')
//
// (suspended rows are already filtered out; the 0.0 arm is belt-and-braces
// for call sites that select the expression without the WHERE filter.)
//
// Chronological feeds (no score to multiply) apply only the suspended
// exclusion; 'limited' rows still appear — the state reduces ranked
// distribution, it is not a content takedown.
//
// Adopted in routes/feed.ts. searchExtended.ts adopts the same fragments.

export type SellerReachState = 'normal' | 'limited' | 'suspended';

export interface SellerReachSnapshot {
  state: SellerReachState;
  reason: string | null;
  setAt: string | null;
}

export interface ReachActor {
  /** immutable_audit_events.principal_type — 'workforce' | 'system' | 'consumer'. */
  principalType: string;
  /** Actor id; NULL for fully automated (system) applications — the column
   *  references users(id), so a synthetic 'system' id would FK-violate. */
  principalId: string | null;
  workforceSessionId?: string;
  /** Optional safety-case linkage for the global audit chain. */
  caseId?: string | null;
}

const REACH_STATES: ReadonlySet<string> = new Set(['normal', 'limited', 'suspended']);

function asReachState(value: unknown): SellerReachState {
  return REACH_STATES.has(value as string) ? (value as SellerReachState) : 'normal';
}

/** COALESCE-wrapped reach_state reference for a given users-table alias. */
function reachStateRef(usersAlias: string): string {
  return `COALESCE(${usersAlias}.reach_state, 'normal')`;
}

/**
 * WHERE fragment excluding suspended sellers. `usersAlias` is the alias the
 * query joined the users table under. Suspended sellers are removed from
 * distribution entirely; 'limited' rows remain but are down-ranked via
 * reachRankMultiplierExpr on scored surfaces.
 */
export function reachExcludedSql(usersAlias: string): string {
  return `AND ${reachStateRef(usersAlias)} <> 'suspended'`;
}

/**
 * Ready-to-use exclusion fragment for queries where the seller's users row
 * is joined under the conventional alias `u`
 * (`JOIN users u ON u.id = l.seller_id`).
 */
export const REACH_EXCLUDED_SQL = reachExcludedSql('u');

/**
 * JOIN fragment binding the seller's users row.
 *   reachJoinSql('u', 'l.seller_id')
 *   → "JOIN users u ON u.id = l.seller_id"
 */
export function reachJoinSql(usersAlias: string, sellerRefColumn: string): string {
  return `JOIN users ${usersAlias} ON ${usersAlias}.id = ${sellerRefColumn}`;
}

/**
 * Rank multiplier expression for scored serving surfaces. Multiply the
 * existing score/velocity expression by this CASE so 'limited' sellers keep
 * 30% of their ranked distribution. `usersAlias` is the alias the users
 * table is joined under.
 */
export function reachRankMultiplierExpr(usersAlias: string): string {
  return (
    `CASE ${reachStateRef(usersAlias)} ` +
    `WHEN 'limited' THEN 0.3 WHEN 'suspended' THEN 0.0 ELSE 1.0 END`
  );
}

/** In-code mirror of reachRankMultiplierExpr for JS-computed scores. */
export const REACH_LIMITED_MULTIPLIER = 0.3;

/**
 * Read the seller's current reach snapshot. Pass `forUpdate: true` when the
 * caller intends to overwrite it inside the same transaction (serialises
 * concurrent enforcement/reversal on the same user).
 */
export async function getSellerReach(
  db: Pool | PoolClient,
  userId: string,
  options?: { forUpdate?: boolean },
): Promise<SellerReachSnapshot | null> {
  const result = await db.query<{
    reach_state: string | null;
    reach_reason: string | null;
    reach_set_at: string | Date | null;
  }>(
    `SELECT reach_state, reach_reason, reach_set_at
     FROM users
     WHERE id = $1
     LIMIT 1
     ${options?.forUpdate ? 'FOR UPDATE' : ''}`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    state: asReachState(row.reach_state),
    reason: row.reach_reason,
    setAt: row.reach_set_at ? new Date(row.reach_set_at).toISOString() : null,
  };
}

/**
 * Apply a reach state to a seller and record the change on the immutable
 * audit chain (same transaction — fail-closed per the audit writer's
 * contract). Returns the PRIOR snapshot so the caller can persist it (e.g.
 * in enforcement_actions.scope) for a truthful reversal.
 *
 * `state` must be 'limited' or 'suspended' — clearing goes through
 * clearSellerReach / restoreSellerReach so intent stays explicit.
 */
export async function setSellerReach(
  db: Pool | PoolClient,
  input: {
    userId: string;
    state: Exclude<SellerReachState, 'normal'>;
    reason: string;
    actor: ReachActor;
  },
): Promise<SellerReachSnapshot> {
  const prior = await getSellerReach(db, input.userId, { forUpdate: true });
  if (!prior) {
    throw new Error(`[sellerReach] setSellerReach: user ${input.userId} not found`);
  }

  await db.query(
    `UPDATE users
     SET reach_state = $2, reach_reason = $3, reach_set_at = NOW()
     WHERE id = $1`,
    [input.userId, input.state, input.reason],
  );

  await writeAuditEvent(db, {
    principalType: input.actor.principalType,
    principalId: input.actor.principalId ?? undefined,
    workforceSessionId: input.actor.workforceSessionId,
    action: 'seller_reach.set',
    resourceType: 'user',
    resourceId: input.userId,
    caseId: input.actor.caseId ?? undefined,
    reason: input.reason,
    outcome: 'success',
    retentionClass: 'standard',
  });

  return prior;
}

/** Clear a reach restriction entirely (back to 'normal'). */
export async function clearSellerReach(
  db: Pool | PoolClient,
  input: {
    userId: string;
    reason?: string;
    actor: ReachActor;
  },
): Promise<SellerReachSnapshot> {
  const prior = await getSellerReach(db, input.userId, { forUpdate: true });
  if (!prior) {
    throw new Error(`[sellerReach] clearSellerReach: user ${input.userId} not found`);
  }

  await db.query(
    `UPDATE users
     SET reach_state = 'normal', reach_reason = NULL, reach_set_at = NULL
     WHERE id = $1`,
    [input.userId],
  );

  await writeAuditEvent(db, {
    principalType: input.actor.principalType,
    principalId: input.actor.principalId ?? undefined,
    workforceSessionId: input.actor.workforceSessionId,
    action: 'seller_reach.cleared',
    resourceType: 'user',
    resourceId: input.userId,
    caseId: input.actor.caseId ?? undefined,
    reason: input.reason ?? 'reach restriction cleared',
    outcome: 'success',
    retentionClass: 'standard',
  });

  return prior;
}

/**
 * Restore a previously captured snapshot (enforcement reversal / overturned
 * appeal). Writes the exact prior triple so reversal is truthful — the user
 * returns to whatever reach state they had before the action executed.
 */
export async function restoreSellerReach(
  db: Pool | PoolClient,
  input: {
    userId: string;
    prior: SellerReachSnapshot;
    reason: string;
    actor: ReachActor;
  },
): Promise<void> {
  await db.query(
    `UPDATE users
     SET reach_state = $2, reach_reason = $3, reach_set_at = $4
     WHERE id = $1`,
    [
      input.userId,
      input.prior.state,
      input.prior.reason,
      input.prior.setAt ? new Date(input.prior.setAt) : null,
    ],
  );

  await writeAuditEvent(db, {
    principalType: input.actor.principalType,
    principalId: input.actor.principalId ?? undefined,
    workforceSessionId: input.actor.workforceSessionId,
    action: 'seller_reach.restored',
    resourceType: 'user',
    resourceId: input.userId,
    caseId: input.actor.caseId ?? undefined,
    reason: input.reason,
    outcome: 'success',
    retentionClass: 'standard',
  });
}
