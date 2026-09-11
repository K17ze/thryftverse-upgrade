/**
 * Co-Own price alert evaluator.
 *
 * B12 (P1): The system stores co-own price alert records but previously had no
 * background job to evaluate them. This consumer runs periodically (wired up by
 * the main worker entry point) and triggers active alerts whose crossing
 * condition is met by the current market price.
 *
 * Design notes:
 *   - "active" alerts are rows with `active = TRUE` and `triggered_at IS NULL`.
 *     The schema has no `status` column; triggering is recorded by setting
 *     `triggered_at` and flipping `active` to false.
 *   - The current price is the last *settled* trade price for the asset, or the
 *     asset reference price (`unit_price_gbp`) when no trades exist yet.
 *   - Alert target prices are stored in GBP minor units (pence). Trade/reference
 *     prices are stored in major GBP, so they are converted to minor for the
 *     comparison.
 *   - Triggering an alert and emitting its notification outbox event happen in
 *     a single per-alert transaction, so a notification failure leaves the
 *     alert active for the next pass (idempotent retry).
 *   - One alert failure never aborts the batch.
 */
import type { PoolClient } from 'pg';
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import { appendDomainEvent } from '../../lib/domainOutbox.js';

export type CoOwnAlertEvaluatorHandlerDeps = {
  /** Uses shared db singleton + domain outbox helper. */
};

interface ActiveAlertRow {
  id: string;
  user_id: string;
  asset_id: string;
  condition: 'above' | 'below';
  target_price_gbp_minor: string;
}

interface PriceRow {
  unit_price_gbp: string;
}

/**
 * Evaluate all active co-own price alerts against the current market price.
 *
 * @param reason `'interval'` for scheduled runs, `'manual'` for ad-hoc triggers.
 * @returns `{ evaluated, triggered, errors }` summary for monitoring.
 */
export async function evaluateCoOwnPriceAlerts(
  reason: 'interval' | 'manual' = 'interval',
): Promise<{
  evaluated: number;
  triggered: number;
  errors: number;
}> {
  // Snapshot the active alert set outside the per-alert transactions so a slow
  // trigger can't hold locks while we enumerate the full batch.
  const activeResult = await db.query<ActiveAlertRow>(
    `
      SELECT id, user_id, asset_id, condition, target_price_gbp_minor::text
      FROM coOwn_price_alerts
      WHERE active = TRUE AND triggered_at IS NULL
      ORDER BY created_at ASC
    `,
  );

  const alerts = activeResult.rows;
  let triggered = 0;
  let errors = 0;

  for (const alert of alerts) {
    try {
      const didTrigger = await evaluateAlert(alert, reason);
      if (didTrigger) triggered += 1;
    } catch (error) {
      errors += 1;
      logger.error(
        {
          alertId: alert.id,
          assetId: alert.asset_id,
          userId: alert.user_id,
          reason,
          err: error,
        },
        'coOwnAlertEvaluator: failed to evaluate alert',
      );
    }
  }

  const evaluated = alerts.length;
  logger.info(
    { evaluated, triggered, errors, reason },
    'coOwnAlertEvaluator: pass complete',
  );
  return { evaluated, triggered, errors };
}

/**
 * Fetch the current market price for an asset in GBP minor units (pence).
 * Prefers the last settled trade price; falls back to the asset reference
 * price. Returns null when the asset no longer exists.
 */
async function fetchCurrentPriceMinor(
  client: PoolClient,
  assetId: string,
): Promise<number | null> {
  const lastTrade = await client.query<PriceRow>(
    `
      SELECT unit_price_gbp::text
      FROM coOwn_trades
      WHERE asset_id = $1 AND settlement_status = 'settled'
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [assetId],
  );

  let priceGbpStr: string | undefined;
  if (lastTrade.rowCount && lastTrade.rows[0]) {
    priceGbpStr = lastTrade.rows[0].unit_price_gbp;
  } else {
    // Fall back to appraisal value first (independent reference), then
    // offering price — matches the portfolio projection mark precedence.
    const ref = await client.query<PriceRow>(
      `SELECT COALESCE(appraisal_value_gbp, unit_price_gbp)::text AS unit_price_gbp
       FROM coOwn_assets WHERE id = $1`,
      [assetId],
    );
    priceGbpStr = ref.rows[0]?.unit_price_gbp;
  }

  if (!priceGbpStr) return null;
  const priceGbp = Number(priceGbpStr);
  if (!Number.isFinite(priceGbp) || priceGbp <= 0) return null;
  return Math.round(priceGbp * 100);
}

/**
 * Evaluate a single alert inside its own transaction. Returns true if the
 * alert was triggered in this pass.
 */
async function evaluateAlert(
  alert: ActiveAlertRow,
  reason: 'interval' | 'manual',
): Promise<boolean> {
  const targetMinor = Number(alert.target_price_gbp_minor);
  if (!Number.isFinite(targetMinor) || targetMinor <= 0) return false;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Re-lock the alert so concurrent evaluators don't double-trigger.
    const locked = await client.query<{ id: string }>(
      `
        SELECT id FROM coOwn_price_alerts
        WHERE id = $1 AND active = TRUE AND triggered_at IS NULL
        FOR UPDATE
      `,
      [alert.id],
    );
    if (!locked.rowCount) {
      // Already triggered or deactivated by a concurrent run — skip.
      await client.query('ROLLBACK');
      return false;
    }

    const currentMinor = await fetchCurrentPriceMinor(client, alert.asset_id);
    if (currentMinor === null) {
      // Asset gone or no usable price — leave active for a future pass.
      await client.query('ROLLBACK');
      return false;
    }

    const crossed =
      alert.condition === 'above'
        ? currentMinor >= targetMinor
        : currentMinor <= targetMinor;

    if (!crossed) {
      await client.query('ROLLBACK');
      return false;
    }

    // Mark triggered. The schema has no dedicated current-price column, so the
    // trigger price (target) and current price are recorded in the outbox event
    // payload for auditability.
    await client.query(
      `
        UPDATE coOwn_price_alerts
        SET active = FALSE,
            triggered_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
      `,
      [alert.id],
    );

    await appendDomainEvent(client, {
      aggregateType: 'coown_price_alert',
      aggregateId: alert.id,
      eventType: 'coown_price_alert_triggered',
      deduplicationKey: `coown_price_alert:${alert.id}`,
      idempotencyKey: `coown_price_alert:${alert.id}`,
      actorId: alert.user_id,
      payload: {
        alertId: alert.id,
        userId: alert.user_id,
        assetId: alert.asset_id,
        condition: alert.condition,
        triggerPriceGbpMinor: targetMinor,
        currentPriceGbpMinor: currentMinor,
        reason,
        triggeredAt: new Date().toISOString(),
      },
    });

    await client.query('COMMIT');

    logger.info(
      {
        alertId: alert.id,
        assetId: alert.asset_id,
        userId: alert.user_id,
        condition: alert.condition,
        triggerPriceGbpMinor: targetMinor,
        currentPriceGbpMinor: currentMinor,
        reason,
      },
      'coOwnAlertEvaluator: alert triggered',
    );
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
