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
import { appendDomainEvent } from '../../lib/domainOutbox.js';
import {
  computeCoOwnSettlementUnits,
  resolveCoOwnSettlementRateContext,
} from '../../lib/pricingEngine.js';
import {
  assertCoOwnLockupPermitted,
  creditCoOwnOnezeUnits,
  debitCoOwnOnezeUnits,
  getCoOwnSpendableUnits,
} from '../../lib/coOwnSettlement.js';
import {
  evaluateCoOwnTradingPolicy,
  type CoOwnTradingPolicyDeps,
} from '../../lib/coOwnEligibility.js';

export type CoOwnDripExecutionHandlerDeps = {
  /** Uses shared db singleton. */
  /**
   * SEP21-FIN-F: optional injection for the shared pre-settlement trading
   * policy (halt-flag read, market eligibility, wallet capability).
   * Production callers omit it — the policy defaults to the real compliance
   * evaluators and the Redis-backed halt flag. Tests inject in-memory
   * doubles so no Redis/compliance tables are needed.
   */
  tradingPolicy?: CoOwnTradingPolicyDeps;
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
  deps: CoOwnDripExecutionHandlerDeps = {},
): Promise<{
  processed: number;
  reinvested: number;
  failed: number;
  retried: number;
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
  let retried = 0;
  let errors = 0;

  for (const item of items) {
    try {
      const outcome = await reinvestDistribution(item, reason, deps.tradingPolicy);
      if (outcome === 'reinvested') reinvested += 1;
      else if (outcome === 'failed') failed += 1;
      else if (outcome === 'retried') retried += 1;
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
    { processed, reinvested, failed, retried, errors, reason },
    'coOwnDripExecution: pass complete',
  );
  return { processed, reinvested, failed, retried, errors };
}

type ReinvestOutcome = 'reinvested' | 'failed' | 'skipped' | 'retried';

/**
 * Failure causes that can self-resolve between passes — a paused market
 * reopens, a first trade establishes a price, the issuer restocks the pool,
 * the holder sells below the cap. The distribution stays 'settled' and the
 * next pass retries; reinvest_attempts bounds the loop before the row
 * dead-letters to 'reinvest_failed'.
 */
const RETRYABLE_DISTRIBUTION_FAILURES = new Set([
  'asset_not_open',
  'no_market_price',
  'invalid_market_price',
  'no_available_units',
  'holding_cap_reached',
]);

/** ~24h at the 5-minute worker cadence before a retryable cause dead-letters. */
const MAX_REINVEST_ATTEMPTS = 288;

/**
 * Reinvest a single distribution inside its own transaction.
 */
async function reinvestDistribution(
  item: DripWorkItem,
  reason: 'interval' | 'manual',
  tradingPolicy?: CoOwnTradingPolicyDeps,
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
      await markDistributionFailed(client, item,
        'asset_not_found',
      );
      await client.query('COMMIT');
      return 'failed';
    }

    if (!asset.is_open) {
      const outcome = await markDistributionRetryableOrFailed(client, item, 'asset_not_open');
      await client.query('COMMIT');
      return outcome;
    }

    // SEP21-FIN-E: declare the settlement kind explicitly. A DRIP
    // reinvestment buys from the asset's primary available_units pool —
    // under the resolved lockup contract (secondary-market resale only) the
    // guard permits 'drip' even while the window is in force. The call stays
    // so the policy is applied at the worker entry point rather than assumed.
    await assertCoOwnLockupPermitted(client, item.asset_id, 'drip');

    // Current market price: last settled trade, else reference price.
    const priceGbp = await resolveCurrentPriceGbp(client, item.asset_id, asset.unit_price_gbp);
    if (priceGbp === null || priceGbp <= 0) {
      const outcome = await markDistributionRetryableOrFailed(client, item, 'no_market_price');
      await client.query('COMMIT');
      return outcome;
    }

    const priceMinor = Math.round(priceGbp * 100);
    if (priceMinor <= 0) {
      const outcome = await markDistributionRetryableOrFailed(client, item, 'invalid_market_price');
      await client.query('COMMIT');
      return outcome;
    }

    // Whole units only — the holdings schema stores integer units.
    let unitsToBuy = Math.floor(amountMinor / priceMinor);
    if (unitsToBuy < 1) {
      await markDistributionFailed(client, item,
        `insufficient_amount_for_one_unit:amount_minor=${amountMinor}:price_minor=${priceMinor}`,
      );
      await client.query('COMMIT');
      return 'failed';
    }

    // Cap by available asset units and the per-user holding cap.
    //
    // Canonical lock order on the co-own money path is asset → wallets →
    // reservations → holdings, so the holding row is read here WITHOUT a
    // lock for the headroom estimate; the FOR UPDATE read happens after
    // the wallet/reservation locks below and re-verifies headroom there.
    const holdingEstimateResult = await client.query<HoldingRow>(
      `
        SELECT units_owned, avg_entry_price_gbp::text, realized_pnl_gbp::text
        FROM coOwn_holdings
        WHERE user_id = $1 AND asset_id = $2
      `,
      [item.user_id, item.asset_id],
    );
    let holding: HoldingRow | null = holdingEstimateResult.rows[0] ?? null;
    let currentOwned = holding?.units_owned ?? 0;
    const headroom = MAX_HOLDING_UNITS - currentOwned;
    const maxByAvailability = Math.min(unitsToBuy, asset.available_units, headroom);

    if (maxByAvailability < 1) {
      const cause =
        asset.available_units < 1
          ? 'no_available_units'
          : headroom < 1
            ? 'holding_cap_reached'
            : 'insufficient_amount_for_one_unit';
      // 'insufficient_amount_for_one_unit' can never self-resolve (the
      // distribution amount is fixed) — it stays terminal. Pool/holding
      // conditions can change between passes and are retried.
      const outcome = RETRYABLE_DISTRIBUTION_FAILURES.has(cause)
        ? await markDistributionRetryableOrFailed(client, item, cause)
        : await markDistributionFailed(client, item, cause).then(() => 'failed' as const);
      await client.query('COMMIT');
      return outcome;
    }

    unitsToBuy = maxByAvailability;
    let notionalGbp = roundTo(unitsToBuy * priceGbp, 4);

    // SEP21-FIN-F: the SAME pre-settlement trading policy manual order
    // placement enforces — reconciliation halt, active corporate exit,
    // market eligibility, wallet settlement capability — evaluated on this
    // transaction before any wallet/share effect. Denials are
    // state-dependent (a halt lifts, KYC completes, a suspension clears):
    // leave the distribution 'settled', bump reinvest_attempts and let the
    // bounded retry ceiling dead-letter a permanently blocked row. An
    // announced/executing exit is terminal for the asset, so the
    // distribution retains cash instead of dead-retrying a closed market.
    const policyDenial = await evaluateCoOwnTradingPolicy(client, {
      assetId: item.asset_id,
      buyerUserId: item.user_id,
      orderNotionalGbp: notionalGbp,
      deps: tradingPolicy,
    });
    if (policyDenial) {
      const cause = `policy_${policyDenial.reason}:${policyDenial.code}`;
      if (policyDenial.reason === 'exit_action_active') {
        await markDistributionRetainedCash(client, item, cause);
        await client.query('COMMIT');
        logger.warn(
          {
            distributionId: item.distribution_id,
            assetId: item.asset_id,
            userId: item.user_id,
            policyCode: policyDenial.code,
          },
          'coOwnDripExecution: active exit corporate action — retaining distribution cash',
        );
        return 'failed';
      }
      const outcome = await markDistributionRetryableOrFailed(client, item, cause);
      await client.query('COMMIT');
      return outcome;
    }

    // FIN-02: the GBP→1ZE conversion goes through the versioned settlement
    // quote (GBP → USD anchor at par → 1ZE minor units), resolved once per
    // distribution so both legs agree on pair, rate and rounding — the same
    // path the order book settles with. The raw ×1000 milli-GBP assumption
    // was unsound (the wallet is USD-anchored, not GBP-anchored).
    //
    // A missing/invalid FX configuration is NOT a permanent distribution
    // failure — throwing here rolls the transaction back, leaves the
    // distribution 'settled', and the next pass retries once the rate is
    // restored (see the catch path: CO_OWN_FX_RATE_UNAVAILABLE is treated
    // as retryable).
    const settlementRate = await resolveCoOwnSettlementRateContext(client);
    // DRIP has no fee leg: the payer leg rounds UP, the payee leg rounds
    // DOWN — sub-unit dust is absorbed by the platform, matching the trade
    // settlement convention.
    let settlementLegs = computeCoOwnSettlementUnits(settlementRate, {
      notionalGbp,
      feeGbp: 0,
    });
    let dripDebit1zeUnits = settlementLegs.buyerDebitUnits;
    let issuerCredit1zeUnits = settlementLegs.sellerCreditUnits;
    const settlementQuoteMetadata = {
      quoteVersion: settlementRate.quoteVersion,
      settlementCurrency: settlementRate.settlementCurrency,
      anchorCurrency: settlementRate.anchorCurrency,
      anchorValue: settlementRate.anchorValue,
      anchorToSettlementRate: settlementRate.anchorToSettlementRate,
      rateSource: settlementRate.rateSource,
      rateResolvedAt: settlementRate.rateResolvedAt,
    };

    if (dripDebit1zeUnits > 0) {
      // Canonical multi-wallet order: BOTH wallets are locked in a single
      // wallet-id-ordered scan — the same order lockWalletRowsForUpdate /
      // applyCoOwnTransfer use. Locking the issuer wallet before the user's
      // wallet+reservations was a different multi-wallet order than the
      // trade path and could deadlock a DRIP ↔ trade between related
      // parties.
      const partyWallets = await client.query<{ id: string; user_id: string }>(
        `
          SELECT id, user_id
          FROM wallets
          WHERE user_id = ANY($1::text[])
          ORDER BY id
          FOR UPDATE
        `,
        [[item.user_id, asset.issuer_id]],
      );
      // FIN-06: the issuer (seller of the pool units) MUST have a creditable
      // wallet BEFORE the buyer is debited. The old path credited the issuer
      // only `if (issuerWallet)` and committed the buyer debit anyway — an
      // unbalanced settled trade. Missing counteraccount now marks the
      // distribution reinvest_failed explicitly; it is never left
      // half-settled and the failure is visible instead of silent.
      const issuerWallet = partyWallets.rows.find((row) => row.user_id === asset.issuer_id) ?? null;
      if (!issuerWallet && issuerCredit1zeUnits > 0) {
        await markDistributionFailed(client, item, 'issuer_wallet_not_found');
        await client.query('COMMIT');
        logger.error(
          {
            distributionId: item.distribution_id,
            assetId: item.asset_id,
            issuerId: asset.issuer_id,
            issuerCredit1zeUnits,
          },
          'coOwnDripExecution: issuer wallet missing — refusing unbalanced settlement',
        );
        return 'failed';
      }

      // FIN-05: the debit is reservation-aware AND segment-aware —
      // spendable = gross balance minus other live order reservations, and
      // the debit drains 'earned' before 'purchased' inside
      // oneze_wallet_segments via debitCoOwnOnezeUnits. The user wallet is
      // already locked (no-op re-lock); this adds the reservation rows in
      // id order — still before the holding lock below.
      const spendable = await getCoOwnSpendableUnits(client, { userId: item.user_id });
      if (!spendable) {
        await markDistributionFailed(client, item, 'wallet_not_found');
        await client.query('COMMIT');
        return 'failed';
      }
      if (spendable.spendableUnits < dripDebit1zeUnits) {
        // Insufficient SPENDABLE balance — mark 'retained_cash' so the
        // distribution is not retried forever. The receipt carries the
        // observed ledger evidence (spendable vs required) so the user
        // notification can state the true state instead of claiming a cash
        // credit that may not exist (SEP20-FIN-14).
        await markDistributionRetainedCash(client, item, 'insufficient_balance', {
          spendableUnits: spendable.spendableUnits,
          requiredUnits: dripDebit1zeUnits,
        });
        await client.query('COMMIT');
        logger.warn(
          {
            distributionId: item.distribution_id,
            userId: item.user_id,
            spendableUnits: spendable.spendableUnits,
            reservedForOtherOrdersUnits: spendable.reservedForOtherOrdersUnits,
            dripDebit1zeUnits,
          },
          'coOwnDripExecution: insufficient spendable wallet balance for DRIP — retaining cash',
        );
        return 'failed';
      }

      // Lock the holding row in canonical position — AFTER the wallets and
      // reservation rows — then re-verify headroom under the lock. The
      // unlocked estimate above cannot shrink a concurrent buy out of the
      // cap; this re-check can only reduce the purchase, never grow it.
      const holdingResult = await client.query<HoldingRow>(
        `
          SELECT units_owned, avg_entry_price_gbp::text, realized_pnl_gbp::text
          FROM coOwn_holdings
          WHERE user_id = $1 AND asset_id = $2
          FOR UPDATE
        `,
        [item.user_id, item.asset_id],
      );
      holding = holdingResult.rows[0] ?? null;
      currentOwned = holding?.units_owned ?? 0;
      const lockedHeadroom = MAX_HOLDING_UNITS - currentOwned;
      const lockedMaxByAvailability = Math.min(unitsToBuy, asset.available_units, lockedHeadroom);
      if (lockedMaxByAvailability < 1) {
        // Headroom under the lock is zero — available_units can restock and
        // the holder can sell below the cap, so this retries until the
        // attempt ceiling dead-letters it.
        const lockedCause =
          asset.available_units < 1 ? 'no_available_units' : 'holding_cap_reached';
        const outcome = await markDistributionRetryableOrFailed(client, item, lockedCause);
        await client.query('COMMIT');
        return outcome;
      }
      if (lockedMaxByAvailability !== unitsToBuy) {
        // Headroom shrank under the estimate — re-derive notional and both
        // settlement legs so the debit/credit math matches the units
        // actually purchased.
        unitsToBuy = lockedMaxByAvailability;
        notionalGbp = roundTo(unitsToBuy * priceGbp, 4);
        settlementLegs = computeCoOwnSettlementUnits(settlementRate, {
          notionalGbp,
          feeGbp: 0,
        });
        dripDebit1zeUnits = settlementLegs.buyerDebitUnits;
        issuerCredit1zeUnits = settlementLegs.sellerCreditUnits;
      }

      // Deterministic ledger tx id — the distribution row lock serializes
      // execution, and a stable id means a replay can never mint a second
      // debit even if the status transition were bypassed.
      const dripTxId = `coown_drip_${item.distribution_id}`;

      // P0 fix: debit the user's wallet BEFORE crediting shares. Without
      // this, the user receives new units while keeping the distribution
      // cash — a double-credit / free-share bug. The distribution cash was
      // credited to the wallet when the distribution settled; DRIP now
      // spends it through the segment-aware primitive (FIN-05).
      await debitCoOwnOnezeUnits(client, {
        userId: item.user_id,
        txId: dripTxId,
        amountUnits: dripDebit1zeUnits,
        kind: 'CO_OWN_DRIP',
        refType: 'coOwn_distribution',
        refId: item.distribution_id,
        metadata: {
          assetId: item.asset_id,
          units: unitsToBuy,
          priceGbp,
          notionalGbp,
          ...settlementQuoteMetadata,
        },
      });

      // P0-1 fix / FIN-06: credit the issuer's wallet — they are selling
      // units from the available pool and must receive payment. The credit
      // throws WALLET_NOT_FOUND if the wallet vanished between the
      // pre-check and here, rolling the whole distribution leg back rather
      // than committing an unbalanced trade.
      if (issuerCredit1zeUnits > 0) {
        await creditCoOwnOnezeUnits(client, {
          userId: asset.issuer_id,
          txId: dripTxId,
          amountUnits: issuerCredit1zeUnits,
          kind: 'CO_OWN_DRIP',
          refType: 'coOwn_trade',
          refId: item.distribution_id,
          segment: 'earned',
          metadata: {
            assetId: item.asset_id,
            units: unitsToBuy,
            priceGbp,
            notionalGbp,
            buyerId: item.user_id,
            ...settlementQuoteMetadata,
          },
        });
      }
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

    // Durable receipt — same commit as the status transition so the
    // notification can never be lost or emitted for a rolled-back write.
    await emitDripReceiptEvent(client, item, 'reinvested', {
      tradeId,
      units: unitsToBuy,
      unitPriceGbp: priceGbp,
      notionalGbp,
    });

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
    // CO_OWN_FX_RATE_UNAVAILABLE is likewise retryable: a missing FX rate
    // is an environment/config condition, not a bad distribution — leave
    // it 'settled' so the next pass retries once the rate is restored.
    // CO_OWN_HALT_STATE_UNAVAILABLE (SEP21-FIN-F) is the same shape: a Redis
    // blip while reading the reconciliation halt flag must not permanently
    // fail the distribution.
    const isTransient =
      isTransientPgError(error) ||
      (error as { code?: string } | null)?.code === 'CO_OWN_FX_RATE_UNAVAILABLE' ||
      (error as { code?: string } | null)?.code === 'CO_OWN_HALT_STATE_UNAVAILABLE';
    if (!isTransient) {
      try {
        await markDistributionFailedStandalone(
          item,
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
 * Append the durable DRIP receipt event. Called inside the same transaction
 * as the distribution status transition (or standalone after a rolled-back
 * attempt) so every settled distribution produces exactly one receipt the
 * outbox drain turns into a user notification. The deduplication key makes
 * replays and duplicate passes idempotent.
 */
async function emitDripReceiptEvent(
  queryable: PoolClient | typeof db,
  item: DripWorkItem,
  outcome: 'reinvested' | 'retained_cash' | 'reinvest_failed',
  extra: {
    tradeId?: string | null;
    units?: number;
    unitPriceGbp?: number;
    notionalGbp?: number;
    cause?: string;
    /** Ledger evidence for the retained_cash outcome (SEP20-FIN-14). */
    spendableUnits?: number;
    requiredUnits?: number;
  } = {},
): Promise<void> {
  await appendDomainEvent(queryable, {
    aggregateType: 'coown_distribution',
    aggregateId: item.distribution_id,
    eventType: 'coown_drip_receipt',
    deduplicationKey: `coown_drip_receipt:${item.distribution_id}`,
    idempotencyKey: `coown_drip_receipt:${item.distribution_id}`,
    actorId: item.user_id,
    payload: {
      distributionId: item.distribution_id,
      userId: item.user_id,
      assetId: item.asset_id,
      outcome,
      amountGbpMinor: Number(item.amount_gbp_minor),
      tradeId: extra.tradeId ?? null,
      units: extra.units,
      unitPriceGbp: extra.unitPriceGbp,
      notionalGbp: extra.notionalGbp,
      cause: extra.cause,
      spendableUnits: extra.spendableUnits,
      requiredUnits: extra.requiredUnits,
      recordedAt: new Date().toISOString(),
    },
  });
}

/**
 * Record a state-dependent failure: bump reinvest_attempts and leave the
 * distribution 'settled' so the next pass retries. Once the attempt ceiling
 * is reached the row dead-letters to 'reinvest_failed' with a receipt —
 * a permanently stuck condition cannot retry forever.
 */
async function markDistributionRetryableOrFailed(
  client: PoolClient,
  item: DripWorkItem,
  cause: string,
): Promise<'retried' | 'failed'> {
  const bumped = await client.query<{ reinvest_attempts: number }>(
    `
      UPDATE coOwn_distributions
      SET reinvest_attempts = reinvest_attempts + 1,
          updated_at = NOW()
      WHERE id = $1
      RETURNING reinvest_attempts
    `,
    [item.distribution_id],
  );
  const attempts = bumped.rows[0]?.reinvest_attempts ?? 0;
  if (attempts >= MAX_REINVEST_ATTEMPTS) {
    await markDistributionFailed(client, item, `attempts_exhausted:${cause}`);
    return 'failed';
  }
  logger.warn(
    { distributionId: item.distribution_id, cause, attempts },
    'coOwnDripExecution: retryable reinvestment condition — will retry next pass',
  );
  return 'retried';
}

/**
 * Mark a distribution as failed inside the current transaction.
 */
async function markDistributionFailed(
  client: PoolClient,
  item: DripWorkItem,
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
    [item.distribution_id, `drip_failed:${cause}`.slice(0, 255)],
  );
  await emitDripReceiptEvent(client, item, 'reinvest_failed', { cause });
  logger.warn(
    { distributionId: item.distribution_id, cause },
    'coOwnDripExecution: distribution reinvestment failed',
  );
}

/**
 * Mark a distribution as failed outside the rolled-back transaction (used when
 * the reinvestment attempt threw and we still want a durable failure marker).
 *
 * SEP20-FIN-13: the status transition AND the receipt event append run inside
 * ONE transaction on a dedicated connection. The previous version issued the
 * UPDATE and the outbox insert as two separate autocommit statements — a crash
 * between them left a terminal 'reinvest_failed' distribution with no receipt,
 * which nothing would ever repair.
 */
async function markDistributionFailedStandalone(
  item: DripWorkItem,
  cause: string,
): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `
        UPDATE coOwn_distributions
        SET status = 'reinvest_failed',
            reference = $2,
            updated_at = NOW()
        WHERE id = $1 AND status = 'settled'
      `,
      [item.distribution_id, `drip_failed:${cause}`.slice(0, 255)],
    );
    if (result.rowCount && result.rowCount > 0) {
      await emitDripReceiptEvent(client, item, 'reinvest_failed', { cause });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Mark a distribution as 'retained_cash' — the user keeps the cash and the
 * distribution is not retried. Used when the wallet balance is insufficient
 * for DRIP, indicating the user withdrew the distribution cash.
 */
async function markDistributionRetainedCash(
  client: PoolClient,
  item: DripWorkItem,
  cause: string,
  evidence: { spendableUnits?: number; requiredUnits?: number } = {},
): Promise<void> {
  await client.query(
    `
      UPDATE coOwn_distributions
      SET status = 'retained_cash',
          reference = $2,
          updated_at = NOW()
      WHERE id = $1
    `,
    [item.distribution_id, `drip_retained:${cause}`.slice(0, 255)],
  );
  await emitDripReceiptEvent(client, item, 'retained_cash', { cause, ...evidence });
  logger.info(
    { distributionId: item.distribution_id, cause },
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
