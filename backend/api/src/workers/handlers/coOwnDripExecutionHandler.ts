/**
 * Co-Own DRIP (Dividend Reinvestment Plan) execution consumer.
 *
 * B12 (P1): The system stores DRIP enrollments and settled distributions but
 * previously had no background job to reinvest them. This consumer runs
 * periodically (wired up by the main worker entry point) and reinvests settled
 * distributions into additional asset units for enrolled users.
 *
 * Design notes:
 *   - Eligible work items are (user, asset, distribution) triples where the
 *     user is enrolled in DRIP for the asset and the distribution is settled
 *     but not yet reinvested.
 *   - The `coown_distributions` table has no dedicated reinvestment-state
 *     column, so the existing `status` column is reused: 'settled' →
 *     'reinvested' (success) or 'reinvest_failed' (permanent failure). The
 *     free-text `reference` column stores the resulting trade id on success or
 *     a short error description on failure. There is no check constraint on
 *     `status`, so these values are safe to write.
 *   - Reinvestment buys whole units from the asset's available pool at the
 *     current market price (last settled trade, else the asset reference
 *     price). Fractional units are not supported by the holdings schema.
 *   - Each distribution is processed in its own transaction with a row lock on
 *     the distribution, making reinvestment idempotent and concurrency-safe.
 *   - One enrollment/distribution failure never aborts the batch.
 */
import type { PoolClient } from 'pg';
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';

export type CoOwnDripExecutionHandlerDeps = {
  /** Uses shared db singleton. */
};

interface DripWorkItem {
  user_id: string;
  asset_id: string;
  distribution_id: string;
  amount_gbp_minor: string;
}

interface AssetRow {
  id: string;
  issuer_id: string;
  total_units: number;
  available_units: number;
  unit_price_gbp: string;
  is_open: boolean;
}

interface HoldingRow {
  units_owned: number;
  avg_entry_price_gbp: string;
  realized_pnl_gbp: string;
}

interface PriceRow {
  unit_price_gbp: string;
}

/** Hard cap on holding units enforced by the schema (CHECK units_owned <= 20). */
const MAX_HOLDING_UNITS = 20;

/**
 * Process pending DRIP reinvestments for all enrolled users.
 *
 * @param reason `'interval'` for scheduled runs, `'manual'` for ad-hoc triggers.
 * @returns `{ processed, reinvested, failed, errors }` summary for monitoring.
 */
export async function processCoOwnDripReinvestment(
  reason: 'interval' | 'manual' = 'interval',
): Promise<{
  processed: number;
  reinvested: number;
  failed: number;
  errors: number;
}> {
  // Snapshot eligible (enrollment, distribution) pairs outside the per-item
  // transactions so we never hold locks while enumerating the batch.
  const workResult = await db.query<DripWorkItem>(
    `
      SELECT e.user_id,
             e.asset_id,
             d.id AS distribution_id,
             d.amount_gbp_minor::text
      FROM coOwn_drip_enrollments e
      INNER JOIN coOwn_distributions d
        ON d.asset_id = e.asset_id
       AND d.recipient_user_id = e.user_id
      WHERE e.enrolled = TRUE
        AND d.status = 'settled'
        AND d.settled_at IS NOT NULL
      ORDER BY d.settled_at ASC
    `,
  );

  const items = workResult.rows;
  let reinvested = 0;
  let failed = 0;
  let errors = 0;

  for (const item of items) {
    try {
      const outcome = await reinvestDistribution(item, reason);
      if (outcome === 'reinvested') reinvested += 1;
      else if (outcome === 'failed') failed += 1;
      // 'skipped' contributes to neither counter.
    } catch (error) {
      errors += 1;
      logger.error(
        {
          distributionId: item.distribution_id,
          assetId: item.asset_id,
          userId: item.user_id,
          reason,
          err: error,
        },
        'coOwnDripExecution: unexpected error processing distribution',
      );
    }
  }

  const processed = items.length;
  logger.info(
    { processed, reinvested, failed, errors, reason },
    'coOwnDripExecution: pass complete',
  );
  return { processed, reinvested, failed, errors };
}

type ReinvestOutcome = 'reinvested' | 'failed' | 'skipped';

/**
 * Reinvest a single distribution inside its own transaction.
 */
async function reinvestDistribution(
  item: DripWorkItem,
  reason: 'interval' | 'manual',
): Promise<ReinvestOutcome> {
  const amountMinor = Number(item.amount_gbp_minor);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 'skipped';

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Lock the distribution and re-check it is still settled. This makes the
    // operation idempotent: a concurrent run or a already-processed distribution
    // resolves to 'skipped'.
    const lockedDist = await client.query<{ id: string }>(
      `
        SELECT id FROM coOwn_distributions
        WHERE id = $1 AND status = 'settled'
        FOR UPDATE
      `,
      [item.distribution_id],
    );
    if (!lockedDist.rowCount) {
      await client.query('ROLLBACK');
      return 'skipped';
    }

    const assetResult = await client.query<AssetRow>(
      `
        SELECT id, issuer_id, total_units, available_units,
               unit_price_gbp::text, is_open
        FROM coOwn_assets
        WHERE id = $1
        FOR UPDATE
      `,
      [item.asset_id],
    );
    const asset = assetResult.rows[0];
    if (!asset) {
      await markDistributionFailed(
        client,
        item.distribution_id,
        'asset_not_found',
      );
      await client.query('COMMIT');
      return 'failed';
    }

    if (!asset.is_open) {
      await markDistributionFailed(
        client,
        item.distribution_id,
        'asset_not_open',
      );
      await client.query('COMMIT');
      return 'failed';
    }

    // Current market price: last settled trade, else reference price.
    const priceGbp = await resolveCurrentPriceGbp(client, item.asset_id, asset.unit_price_gbp);
    if (priceGbp === null || priceGbp <= 0) {
      await markDistributionFailed(
        client,
        item.distribution_id,
        'no_market_price',
      );
      await client.query('COMMIT');
      return 'failed';
    }

    const priceMinor = Math.round(priceGbp * 100);
    if (priceMinor <= 0) {
      await markDistributionFailed(
        client,
        item.distribution_id,
        'invalid_market_price',
      );
      await client.query('COMMIT');
      return 'failed';
    }

    // Whole units only — the holdings schema stores integer units.
    let unitsToBuy = Math.floor(amountMinor / priceMinor);
    if (unitsToBuy < 1) {
      await markDistributionFailed(
        client,
        item.distribution_id,
        `insufficient_amount_for_one_unit:amount_minor=${amountMinor}:price_minor=${priceMinor}`,
      );
      await client.query('COMMIT');
      return 'failed';
    }

    // Cap by available asset units and the per-user holding cap.
    const holdingResult = await client.query<HoldingRow>(
      `
        SELECT units_owned, avg_entry_price_gbp::text, realized_pnl_gbp::text
        FROM coOwn_holdings
        WHERE user_id = $1 AND asset_id = $2
        FOR UPDATE
      `,
      [item.user_id, item.asset_id],
    );
    const holding = holdingResult.rows[0] ?? null;
    const currentOwned = holding?.units_owned ?? 0;
    const headroom = MAX_HOLDING_UNITS - currentOwned;
    const maxByAvailability = Math.min(unitsToBuy, asset.available_units, headroom);

    if (maxByAvailability < 1) {
      const cause =
        asset.available_units < 1
          ? 'no_available_units'
          : headroom < 1
            ? 'holding_cap_reached'
            : 'insufficient_amount_for_one_unit';
      await markDistributionFailed(client, item.distribution_id, cause);
      await client.query('COMMIT');
      return 'failed';
    }

    unitsToBuy = maxByAvailability;
    const notionalGbp = roundTo(unitsToBuy * priceGbp, 4);

    // P0 fix: Debit the user's wallet BEFORE crediting shares. Without this,
    // the user receives new units while keeping the distribution cash — a
    // double-credit / free-share bug. The distribution cash was credited to
    // the wallet when the distribution settled; DRIP must now spend it.
    // 1ZE units are milli-GBP (1 GBP = 1000 1ZE units).
    //
    // P0-1 fix: The issuer (seller) must be credited the same amount, since
    // they are selling units from the available pool. Without this, the
    // debited cash vanishes from circulation.
    const dripDebit1zeUnits = Math.ceil(roundTo(notionalGbp, 4) * 1000);
    if (dripDebit1zeUnits > 0) {
      const walletResult = await client.query<{ id: string; oneze_balance_units: string }>(
        `SELECT id, oneze_balance_units::text FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [item.user_id],
      );
      const wallet = walletResult.rows[0];
      if (!wallet) {
        await markDistributionFailed(client, item.distribution_id, 'wallet_not_found');
        await client.query('COMMIT');
        return 'failed';
      }
      const balanceUnits = Number(wallet.oneze_balance_units);
      if (balanceUnits < dripDebit1zeUnits) {
        // P1-1 fix: Insufficient balance — mark as 'retained_cash' so the
        // distribution is not retried forever. The user keeps the cash (if
        // it was credited) and can manually reinvest later.
        await markDistributionRetainedCash(client, item.distribution_id, 'insufficient_balance');
        await client.query('COMMIT');
        logger.warn(
          {
            distributionId: item.distribution_id,
            userId: item.user_id,
            balanceUnits,
            dripDebit1zeUnits,
          },
          'coOwnDripExecution: insufficient wallet balance for DRIP — retaining cash',
        );
        return 'failed';
      }
      const balanceAfter = balanceUnits - dripDebit1zeUnits;
      const dripTxId = `coown_drip_${item.distribution_id}_${Date.now()}`;
      await client.query(
        `UPDATE wallets SET oneze_balance_units = $2, version = version + 1, updated_at = NOW() WHERE id = $1`,
        [wallet.id, balanceAfter],
      );
      await client.query(
        `
          INSERT INTO wallet_ledger (wallet_id, tx_id, asset, amount, balance_after, kind, ref_type, ref_id, metadata)
          VALUES ($1, $2, '1ZE', $3, $4, 'CO_OWN_DRIP', 'coOwn_distribution', $5, $6::jsonb)
        `,
        [
          wallet.id,
          dripTxId,
          -dripDebit1zeUnits,
          balanceAfter,
          item.distribution_id,
          JSON.stringify({ assetId: item.asset_id, units: unitsToBuy, priceGbp, notionalGbp }),
        ],
      );

      // P0-1 fix: Credit the issuer's wallet — they are selling units from
      // the available pool and must receive payment. Fee is 0 for DRIP, so
      // the full notional goes to the seller.
      const issuerWalletResult = await client.query<{ id: string; oneze_balance_units: string }>(
        `SELECT id, oneze_balance_units::text FROM wallets WHERE user_id = $1 FOR UPDATE`,
        [asset.issuer_id],
      );
      const issuerWallet = issuerWalletResult.rows[0];
      if (issuerWallet) {
        const issuerBalanceAfter = Number(issuerWallet.oneze_balance_units) + dripDebit1zeUnits;
        await client.query(
          `UPDATE wallets SET oneze_balance_units = $2, version = version + 1, updated_at = NOW() WHERE id = $1`,
          [issuerWallet.id, issuerBalanceAfter],
        );
        await client.query(
          `
            INSERT INTO wallet_ledger (wallet_id, tx_id, asset, amount, balance_after, kind, ref_type, ref_id, metadata)
            VALUES ($1, $2, '1ZE', $3, $4, 'CO_OWN_DRIP', 'coOwn_trade', $5, $6::jsonb)
          `,
          [
            issuerWallet.id,
            dripTxId,
            dripDebit1zeUnits,
            issuerBalanceAfter,
            item.distribution_id,
            JSON.stringify({ assetId: item.asset_id, units: unitsToBuy, priceGbp, notionalGbp, buyerId: item.user_id }),
          ],
        );
      }
      // If issuer wallet doesn't exist, the debit still proceeds — the
      // issuer may not have a wallet in this system (e.g., external custodian).
      // The buyer debit is the critical correctness path.
    }

    // Record the reinvestment trade. The issuer is the counterparty (selling
    // from the asset's available issuance pool).
    const tradeInsert = await client.query<{ id: string }>(
      `
        INSERT INTO coOwn_trades (
          asset_id, buy_order_id, sell_order_id,
          buyer_id, seller_id,
          units, unit_price_gbp, notional_gbp, fee_gbp,
          settlement_status, settled_at
        )
        VALUES ($1, NULL, NULL, $2, $3, $4, $5, $6, 0, 'settled', NOW())
        RETURNING id::text
      `,
      [item.asset_id, item.user_id, asset.issuer_id, unitsToBuy, priceGbp, notionalGbp],
    );
    const tradeId = tradeInsert.rows[0].id;

    // Update the buyer's holding (upsert).
    const avgBefore = Number(holding?.avg_entry_price_gbp ?? 0);
    const realizedBefore = Number(holding?.realized_pnl_gbp ?? 0);
    const unitsAfter = currentOwned + unitsToBuy;
    const avgAfter =
      unitsAfter > 0
        ? (avgBefore * currentOwned + priceGbp * unitsToBuy) / unitsAfter
        : priceGbp;

    await client.query(
      `
        INSERT INTO coOwn_holdings (
          user_id, asset_id, units_owned, avg_entry_price_gbp, realized_pnl_gbp, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (user_id, asset_id)
        DO UPDATE SET
          units_owned = EXCLUDED.units_owned,
          avg_entry_price_gbp = EXCLUDED.avg_entry_price_gbp,
          realized_pnl_gbp = EXCLUDED.realized_pnl_gbp,
          updated_at = NOW()
      `,
      [item.user_id, item.asset_id, unitsAfter, roundTo(avgAfter, 4), realizedBefore],
    );

    // Decrement available units and track traded value.
    await client.query(
      `
        UPDATE coOwn_assets
        SET available_units = available_units - $2,
            total_traded_value_gbp = total_traded_value_gbp + $3,
            updated_at = NOW()
        WHERE id = $1
      `,
      [item.asset_id, unitsToBuy, notionalGbp],
    );

    // Recompute holder count for the asset.
    await client.query(
      `
        UPDATE coOwn_assets a
        SET holders = (
          SELECT COUNT(*)::int
          FROM coOwn_holdings h
          WHERE h.asset_id = a.id AND h.units_owned > 0
        ),
        updated_at = NOW()
        WHERE a.id = $1
      `,
      [item.asset_id],
    );

    // Mark the distribution as reinvested with the trade reference. The
    // distributions table has no updated_at column.
    await client.query(
      `
        UPDATE coOwn_distributions
        SET status = 'reinvested',
            reference = $2,
            updated_at = NOW()
        WHERE id = $1
      `,
      [item.distribution_id, `drip_trade:${tradeId}`],
    );

    await client.query('COMMIT');

    logger.info(
      {
        distributionId: item.distribution_id,
        assetId: item.asset_id,
        userId: item.user_id,
        tradeId,
        units: unitsToBuy,
        unitPriceGbp: priceGbp,
        notionalGbp,
        amountGbpMinor: amountMinor,
        reason,
      },
      'coOwnDripExecution: distribution reinvested',
    );
    return 'reinvested';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);

    // Only mark permanent failures — transient errors (serialization,
    // deadlock, lock timeout, connection blips) should be retried by
    // BullMQ, not permanently poisoning the distribution.
    const isTransient = isTransientPgError(error);
    if (!isTransient) {
      try {
        await markDistributionFailedStandalone(
          item.distribution_id,
          error instanceof Error ? error.message : String(error),
        );
      } catch (markError) {
        logger.error(
          { distributionId: item.distribution_id, err: markError },
          'coOwnDripExecution: failed to record failure marker',
        );
      }
    } else {
      logger.warn(
        { distributionId: item.distribution_id, err: error },
        'coOwnDripExecution: transient failure — will be retried',
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Resolve the current market price for an asset in major GBP. Prefers the last
 * settled trade price; falls back to the asset reference price.
 */
async function resolveCurrentPriceGbp(
  client: PoolClient,
  assetId: string,
  fallbackRefPriceGbp: string,
): Promise<number | null> {
  const lastTrade = await client.query<PriceRow>(
    `
      SELECT unit_price_gbp::text
      FROM coOwn_trades
      WHERE asset_id = $1 AND settlement_status = 'settled'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [assetId],
  );

  const priceStr =
    (lastTrade.rowCount && lastTrade.rows[0]?.unit_price_gbp) || fallbackRefPriceGbp;
  if (!priceStr) return null;
  const price = Number(priceStr);
  return Number.isFinite(price) ? price : null;
}

/**
 * Mark a distribution as failed inside the current transaction.
 */
async function markDistributionFailed(
  client: PoolClient,
  distributionId: string,
  cause: string,
): Promise<void> {
  await client.query(
    `
      UPDATE coOwn_distributions
      SET status = 'reinvest_failed',
          reference = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [distributionId, `drip_failed:${cause}`.slice(0, 255)],
  );
  logger.warn(
    { distributionId, cause },
    'coOwnDripExecution: distribution reinvestment failed',
  );
}

/**
 * Mark a distribution as failed outside the rolled-back transaction (used when
 * the reinvestment attempt threw and we still want a durable failure marker).
 */
async function markDistributionFailedStandalone(
  distributionId: string,
  cause: string,
): Promise<void> {
  await db.query(
    `
      UPDATE coOwn_distributions
      SET status = 'reinvest_failed',
          reference = $2,
          updated_at = NOW()
      WHERE id = $1 AND status = 'settled'
    `,
    [distributionId, `drip_failed:${cause}`.slice(0, 255)],
  );
}

/**
 * Mark a distribution as 'retained_cash' — the user keeps the cash and the
 * distribution is not retried. Used when the wallet balance is insufficient
 * for DRIP, indicating the user withdrew the distribution cash.
 */
async function markDistributionRetainedCash(
  client: PoolClient,
  distributionId: string,
  cause: string,
): Promise<void> {
  await client.query(
    `
      UPDATE coOwn_distributions
      SET status = 'retained_cash',
          reference = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [distributionId, `drip_retained:${cause}`.slice(0, 255)],
  );
  logger.info(
    { distributionId, cause },
    'coOwnDripExecution: distribution retained as cash (not reinvested)',
  );
}

/** Round to a fixed number of decimal places (half-up via Number.toFixed). */
function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Determine whether a PostgreSQL error is transient (worth retrying).
 * Covers serialization failures, deadlocks, lock timeouts, and connection
 * errors. Non-transient errors (constraint violations, bad data, etc.)
 * return false so the caller can permanently mark the item as failed.
 */
function isTransientPgError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  if (!code) return false;
  // 40001 = serialization_failure
  // 40P01 = deadlock_detected
  // 55P03 = lock_not_available
  // 08000/08003/08006 = connection exceptions
  // 57P03 = cannot_connect_now
  return ['40001', '40P01', '55P03', '08000', '08003', '08006', '57P03'].includes(code);
}
