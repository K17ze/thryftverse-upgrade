import crypto from 'node:crypto';
import type { Pool } from 'pg';
import { logger } from '../lib/logger.js';

// ── Public types ──

export interface PolicyDecision {
  id: string;
  procedureKey: string;
  procedureVersion: number;
  subjectType: string;
  subjectId: string;
  inputsHash: string;
  resultCode: string;
  explanation: Record<string, unknown>;
  createdAt: string;
}

// ── Row types (snake_case, matches DB) ──

interface OrderRow {
  id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  total_gbp: string;
  buyer_protection_fee_gbp: string;
  delivered_at: string | null;
  created_at: string;
}

interface ProcedureRow {
  version: number;
}

interface PolicyDecisionRow {
  id: string;
  procedure_key: string;
  procedure_version: number;
  subject_type: string;
  subject_id: string;
  inputs_hash: string;
  result_code: string;
  explanation_data: Record<string, unknown>;
  created_at: string;
}

// ── Constants ──

const RETURN_WINDOW_DAYS = 14;
const PROTECTION_WINDOW_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ── Helpers ──

function hashInputs(inputs: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(inputs)).digest('hex');
}

function daysSince(deliveredAt: string): number {
  const deliveredMs = new Date(deliveredAt).getTime();
  return Math.floor((Date.now() - deliveredMs) / MS_PER_DAY);
}

async function getActiveProcedureVersion(
  db: Pool,
  key: string,
): Promise<number> {
  const result = await db.query<ProcedureRow>(
    `
      SELECT version
      FROM support_procedures
      WHERE key = $1
        AND state = 'published'
        AND effective_to IS NULL
      ORDER BY version DESC
      LIMIT 1
    `,
    [key],
  );
  return result.rows.length > 0 ? result.rows[0].version : 1;
}

async function persistDecision(
  db: Pool,
  input: {
    procedureKey: string;
    procedureVersion: number;
    subjectType: string;
    subjectId: string;
    inputsHash: string;
    resultCode: string;
    explanation: Record<string, unknown>;
  },
): Promise<PolicyDecision> {
  const id = `pol_${crypto.randomUUID()}`;

  const result = await db.query<PolicyDecisionRow>(
    `
      INSERT INTO support_policy_decisions
        (id, procedure_key, procedure_version, subject_type, subject_id,
         inputs_hash, result_code, explanation_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING id, procedure_key, procedure_version, subject_type, subject_id,
                inputs_hash, result_code, explanation_data, created_at
    `,
    [
      id,
      input.procedureKey,
      input.procedureVersion,
      input.subjectType,
      input.subjectId,
      input.inputsHash,
      input.resultCode,
      JSON.stringify(input.explanation),
    ],
  );

  const row = result.rows[0];
  return {
    id: row.id,
    procedureKey: row.procedure_key,
    procedureVersion: row.procedure_version,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    inputsHash: row.inputs_hash,
    resultCode: row.result_code,
    explanation: row.explanation_data,
    createdAt: row.created_at,
  };
}

async function loadOrder(
  db: Pool,
  orderId: string,
): Promise<OrderRow | null> {
  const result = await db.query<OrderRow>(
    `
      SELECT id, buyer_id, seller_id, status, total_gbp,
             buyer_protection_fee_gbp, delivered_at, created_at
      FROM orders
      WHERE id = $1
    `,
    [orderId],
  );
  return result.rows.length > 0 ? result.rows[0] : null;
}

// ── Public API ──

/**
 * Determines whether a buyer can request or complete cancellation of an
 * order. The order must belong to the given user (buyer_id = userId).
 *
 * Rules:
 *   - status 'created' or 'paid' → ELIGIBLE
 *   - status 'shipped'           → NOT_ELIGIBLE_SHIPPED
 *   - status 'delivered'         → NOT_ELIGIBLE_DELIVERED
 *   - status 'cancelled'         → NOT_ELIGIBLE_ALREADY_CANCELLED
 */
export async function evaluateCancellationEligibility(
  db: Pool,
  orderId: string,
  userId: string,
): Promise<PolicyDecision> {
  const procedureKey = 'cancellation';
  const procedureVersion = await getActiveProcedureVersion(db, procedureKey);

  const order = await loadOrder(db, orderId);
  if (!order) {
    return persistDecision(db, {
      procedureKey,
      procedureVersion,
      subjectType: 'order',
      subjectId: orderId,
      inputsHash: hashInputs({ orderId, userId, orderFound: false }),
      resultCode: 'NOT_ELIGIBLE_ORDER_NOT_FOUND',
      explanation: { reason: 'Order does not exist.', orderId, userId },
    });
  }

  if (order.buyer_id !== userId) {
    return persistDecision(db, {
      procedureKey,
      procedureVersion,
      subjectType: 'order',
      subjectId: orderId,
      inputsHash: hashInputs({ orderId, userId, buyerId: order.buyer_id }),
      resultCode: 'NOT_ELIGIBLE_NOT_BUYER',
      explanation: {
        reason: 'Caller is not the buyer of this order.',
        orderId,
        userId,
        buyerId: order.buyer_id,
      },
    });
  }

  const inputs = {
    orderId: order.id,
    status: order.status,
    deliveredAt: order.delivered_at,
    callerRole: 'buyer',
  };
  const inputsHash = hashInputs(inputs);

  let resultCode: string;
  let explanation: Record<string, unknown>;

  switch (order.status) {
    case 'created':
    case 'paid':
      resultCode = 'ELIGIBLE';
      explanation = {
        reason: `Order status is '${order.status}', which has not yet been shipped. Cancellation is eligible.`,
        status: order.status,
      };
      break;
    case 'shipped':
      resultCode = 'NOT_ELIGIBLE_SHIPPED';
      explanation = {
        reason: 'Order has already been shipped and cannot be cancelled.',
        status: order.status,
      };
      break;
    case 'delivered':
      resultCode = 'NOT_ELIGIBLE_DELIVERED';
      explanation = {
        reason: 'Order has been delivered and cannot be cancelled.',
        status: order.status,
        deliveredAt: order.delivered_at,
      };
      break;
    case 'cancelled':
      resultCode = 'NOT_ELIGIBLE_ALREADY_CANCELLED';
      explanation = {
        reason: 'Order has already been cancelled.',
        status: order.status,
      };
      break;
    default:
      resultCode = 'NOT_ELIGIBLE';
      explanation = {
        reason: `Order status '${order.status}' is not recognised for cancellation.`,
        status: order.status,
      };
      break;
  }

  logger.debug(
    { orderId, userId, procedureKey, resultCode },
    '[policyEngine] cancellation eligibility evaluated',
  );

  return persistDecision(db, {
    procedureKey,
    procedureVersion,
    subjectType: 'order',
    subjectId: orderId,
    inputsHash,
    resultCode,
    explanation,
  });
}

/**
 * Determines whether a buyer can request a return for a delivered order.
 * The order must belong to the given user (buyer_id = userId).
 *
 * Rules:
 *   - status 'delivered' and within 14 days  → ELIGIBLE
 *   - status 'delivered' and beyond 14 days  → NOT_ELIGIBLE_OUTSIDE_WINDOW
 *   - not delivered                          → NOT_ELIGIBLE_NOT_DELIVERED
 *   - status 'cancelled'                     → NOT_ELIGIBLE_ALREADY_CANCELLED
 */
export async function evaluateReturnEligibility(
  db: Pool,
  orderId: string,
  userId: string,
): Promise<PolicyDecision> {
  const procedureKey = 'return';
  const procedureVersion = await getActiveProcedureVersion(db, procedureKey);

  const order = await loadOrder(db, orderId);
  if (!order) {
    return persistDecision(db, {
      procedureKey,
      procedureVersion,
      subjectType: 'order',
      subjectId: orderId,
      inputsHash: hashInputs({ orderId, userId, orderFound: false }),
      resultCode: 'NOT_ELIGIBLE_ORDER_NOT_FOUND',
      explanation: { reason: 'Order does not exist.', orderId, userId },
    });
  }

  if (order.buyer_id !== userId) {
    return persistDecision(db, {
      procedureKey,
      procedureVersion,
      subjectType: 'order',
      subjectId: orderId,
      inputsHash: hashInputs({ orderId, userId, buyerId: order.buyer_id }),
      resultCode: 'NOT_ELIGIBLE_NOT_BUYER',
      explanation: {
        reason: 'Caller is not the buyer of this order.',
        orderId,
        userId,
        buyerId: order.buyer_id,
      },
    });
  }

  if (order.status === 'cancelled') {
    const inputs = { orderId: order.id, status: order.status, callerRole: 'buyer' };
    return persistDecision(db, {
      procedureKey,
      procedureVersion,
      subjectType: 'order',
      subjectId: orderId,
      inputsHash: hashInputs(inputs),
      resultCode: 'NOT_ELIGIBLE_ALREADY_CANCELLED',
      explanation: {
        reason: 'Order has been cancelled; returns do not apply.',
        status: order.status,
      },
    });
  }

  if (order.status !== 'delivered' || !order.delivered_at) {
    const inputs = { orderId: order.id, status: order.status, callerRole: 'buyer' };
    return persistDecision(db, {
      procedureKey,
      procedureVersion,
      subjectType: 'order',
      subjectId: orderId,
      inputsHash: hashInputs(inputs),
      resultCode: 'NOT_ELIGIBLE_NOT_DELIVERED',
      explanation: {
        reason: 'Order has not been delivered; returns are not available.',
        status: order.status,
      },
    });
  }

  const daysElapsed = daysSince(order.delivered_at);
  const inputs = {
    orderId: order.id,
    status: order.status,
    deliveredAt: order.delivered_at,
    daysElapsed,
    returnWindowDays: RETURN_WINDOW_DAYS,
    callerRole: 'buyer',
  };
  const inputsHash = hashInputs(inputs);

  let resultCode: string;
  let explanation: Record<string, unknown>;

  if (daysElapsed <= RETURN_WINDOW_DAYS) {
    resultCode = 'ELIGIBLE';
    explanation = {
      reason: `Order was delivered ${daysElapsed} day(s) ago, within the ${RETURN_WINDOW_DAYS}-day return window.`,
      deliveredAt: order.delivered_at,
      daysElapsed,
      returnWindowDays: RETURN_WINDOW_DAYS,
    };
  } else {
    resultCode = 'NOT_ELIGIBLE_OUTSIDE_WINDOW';
    explanation = {
      reason: `Order was delivered ${daysElapsed} day(s) ago, beyond the ${RETURN_WINDOW_DAYS}-day return window.`,
      deliveredAt: order.delivered_at,
      daysElapsed,
      returnWindowDays: RETURN_WINDOW_DAYS,
    };
  }

  logger.debug(
    { orderId, userId, procedureKey, resultCode, daysElapsed },
    '[policyEngine] return eligibility evaluated',
  );

  return persistDecision(db, {
    procedureKey,
    procedureVersion,
    subjectType: 'order',
    subjectId: orderId,
    inputsHash,
    resultCode,
    explanation,
  });
}

/**
 * Determines whether a buyer can file a buyer-protection claim for a
 * delivered order. The order must belong to the given user (buyer_id =
 * userId).
 *
 * Rules:
 *   - status 'delivered' and within 30 days → ELIGIBLE_WITHIN_PROTECTION_WINDOW
 *   - otherwise                             → NOT_ELIGIBLE_OUTSIDE_WINDOW
 */
export async function evaluateBuyerProtectionEligibility(
  db: Pool,
  orderId: string,
  userId: string,
): Promise<PolicyDecision> {
  const procedureKey = 'buyer_protection';
  const procedureVersion = await getActiveProcedureVersion(db, procedureKey);

  const order = await loadOrder(db, orderId);
  if (!order) {
    return persistDecision(db, {
      procedureKey,
      procedureVersion,
      subjectType: 'order',
      subjectId: orderId,
      inputsHash: hashInputs({ orderId, userId, orderFound: false }),
      resultCode: 'NOT_ELIGIBLE_ORDER_NOT_FOUND',
      explanation: { reason: 'Order does not exist.', orderId, userId },
    });
  }

  if (order.buyer_id !== userId) {
    return persistDecision(db, {
      procedureKey,
      procedureVersion,
      subjectType: 'order',
      subjectId: orderId,
      inputsHash: hashInputs({ orderId, userId, buyerId: order.buyer_id }),
      resultCode: 'NOT_ELIGIBLE_NOT_BUYER',
      explanation: {
        reason: 'Caller is not the buyer of this order.',
        orderId,
        userId,
        buyerId: order.buyer_id,
      },
    });
  }

  if (order.status === 'cancelled') {
    const inputs = { orderId: order.id, status: order.status, callerRole: 'buyer' };
    return persistDecision(db, {
      procedureKey,
      procedureVersion,
      subjectType: 'order',
      subjectId: orderId,
      inputsHash: hashInputs(inputs),
      resultCode: 'NOT_ELIGIBLE_ALREADY_CANCELLED',
      explanation: {
        reason: 'Order has been cancelled; buyer protection does not apply.',
        status: order.status,
      },
    });
  }

  if (order.status !== 'delivered' || !order.delivered_at) {
    const inputs = { orderId: order.id, status: order.status, callerRole: 'buyer' };
    return persistDecision(db, {
      procedureKey,
      procedureVersion,
      subjectType: 'order',
      subjectId: orderId,
      inputsHash: hashInputs(inputs),
      resultCode: 'NOT_ELIGIBLE_OUTSIDE_WINDOW',
      explanation: {
        reason: 'Order has not been delivered; buyer protection is not available.',
        status: order.status,
      },
    });
  }

  const daysElapsed = daysSince(order.delivered_at);
  const inputs = {
    orderId: order.id,
    status: order.status,
    deliveredAt: order.delivered_at,
    daysElapsed,
    protectionWindowDays: PROTECTION_WINDOW_DAYS,
    buyerProtectionFeeGbp: order.buyer_protection_fee_gbp,
    callerRole: 'buyer',
  };
  const inputsHash = hashInputs(inputs);

  let resultCode: string;
  let explanation: Record<string, unknown>;

  if (daysElapsed <= PROTECTION_WINDOW_DAYS) {
    resultCode = 'ELIGIBLE_WITHIN_PROTECTION_WINDOW';
    explanation = {
      reason: `Order was delivered ${daysElapsed} day(s) ago, within the ${PROTECTION_WINDOW_DAYS}-day buyer-protection window.`,
      deliveredAt: order.delivered_at,
      daysElapsed,
      protectionWindowDays: PROTECTION_WINDOW_DAYS,
    };
  } else {
    resultCode = 'NOT_ELIGIBLE_OUTSIDE_WINDOW';
    explanation = {
      reason: `Order was delivered ${daysElapsed} day(s) ago, beyond the ${PROTECTION_WINDOW_DAYS}-day buyer-protection window.`,
      deliveredAt: order.delivered_at,
      daysElapsed,
      protectionWindowDays: PROTECTION_WINDOW_DAYS,
    };
  }

  logger.debug(
    { orderId, userId, procedureKey, resultCode, daysElapsed },
    '[policyEngine] buyer protection eligibility evaluated',
  );

  return persistDecision(db, {
    procedureKey,
    procedureVersion,
    subjectType: 'order',
    subjectId: orderId,
    inputsHash,
    resultCode,
    explanation,
  });
}

export { logger };
