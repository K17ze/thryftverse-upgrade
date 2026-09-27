/**
 * Co-Own secondary-market transfer primitive.
 *
 * Extracted from routes/coOwn.ts so the settlement path is callable from
 * invariant tests — the conservation proof must exercise the REAL holding
 * swap + wallet legs, not a mirrored SQL block that can drift from the
 * production implementation.
 *
 * Behaviour is identical to the former closure: canonical lock order
 * (both party wallets in wallet-id order → buyer reservations in id order
 * → holding rows in user-id order), DvP settlement through the segment-aware
 * wallet primitives, lockup backstop, trade row, and optional double-entry
 * fee legs via the injected ledger deps.
 */
import type { PoolClient } from 'pg';
import {
  createApiError,
  roundTo,
  type DbQueryable,
} from './workerHelpers.js';
import {
  assertCoOwnLockupPermitted,
  creditCoOwnOnezeUnits,
  debitCoOwnOnezeUnits,
} from './coOwnSettlement.js';
import {
  computeSpendableOnezeUnits,
  lockWalletRowsForUpdate,
} from './walletMoneyPath.js';
import {
  computeCoOwnSettlementUnits,
  type CoOwnSettlementRateContext,
} from './pricingEngine.js';

export interface CoOwnHoldingRow {
  user_id: string;
  asset_id: string;
  units_owned: number;
  avg_entry_price_gbp: number | string;
  realized_pnl_gbp: number | string;
}

/**
 * Ledger deps injected by the route host (index.ts) or by tests
 * (workerRuntime implementations). `sourceType` is narrowed to the literals
 * this primitive emits so both the index.ts (`string`) and workerRuntime
 * (union) implementations remain assignable.
 */
export interface CoOwnTransferLedgerDeps {
  ledgerTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  ensureLedgerAccount: (
    client: DbQueryable,
    ownerType: 'platform' | 'user',
    ownerId: string,
    accountCode:
      | 'escrow_liability'
      | 'platform_revenue'
      | 'platform_operating'
      | 'seller_payable'
      | 'buyer_spend'
      | 'withdrawal_pending'
      | 'withdrawable_balance'
      | 'ize_wallet'
      | 'ize_pending_redemption'
      | 'ize_outstanding'
      | 'ize_fiat_received'
      | 'reserve_hold'
      | 'provider_cash_clearing'
      | 'revenue_fx',
    currency?: string,
  ) => Promise<number>;
  appendLedgerEntry: (
    client: DbQueryable,
    input: {
      accountId: number;
      counterpartyAccountId: number;
      direction: 'debit' | 'credit';
      amountGbp?: number;
      amount?: number;
      currency?: string;
      sourceType: 'coOwn_trade' | 'buyout';
      sourceId: string;
      lineType: string;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<void>;
}

export async function getCoOwnHoldingForUpdate(
  client: DbQueryable,
  userId: string,
  assetId: string
): Promise<CoOwnHoldingRow | null> {
  const result = await client.query<CoOwnHoldingRow>(
    `
      SELECT
        user_id,
        asset_id,
        units_owned,
        avg_entry_price_gbp,
        realized_pnl_gbp
      FROM coOwn_holdings
      WHERE user_id = $1
        AND asset_id = $2
      LIMIT 1
      FOR UPDATE
    `,
    [userId, assetId]
  );

  return result.rows[0] ?? null;
}

async function saveCoOwnHolding(
  client: DbQueryable,
  input: {
    userId: string;
    assetId: string;
    unitsOwned: number;
    avgEntryPriceGbp: number;
    realizedPnlGbp: number;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO coOwn_holdings (
        user_id,
        asset_id,
        units_owned,
        avg_entry_price_gbp,
        realized_pnl_gbp,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (user_id, asset_id)
      DO UPDATE
        SET
          units_owned = EXCLUDED.units_owned,
          avg_entry_price_gbp = EXCLUDED.avg_entry_price_gbp,
          realized_pnl_gbp = EXCLUDED.realized_pnl_gbp,
          updated_at = NOW()
    `,
    [
      input.userId,
      input.assetId,
      Math.max(0, Math.floor(input.unitsOwned)),
      roundTo(Math.max(0, input.avgEntryPriceGbp), 4),
      roundTo(input.realizedPnlGbp, 4),
    ]
  );
}

export async function applyCoOwnTransfer(
  client: PoolClient,
  deps: CoOwnTransferLedgerDeps,
  input: {
    assetId: string;
    buyerId: string;
    sellerId: string;
    units: number;
    unitPriceGbp: number;
    feeGbp: number;
    sourceType: 'coOwn_trade' | 'buyout';
    buyOrderId?: number | null;
    sellOrderId?: number | null;
    enforceSellerHolding: boolean;
    /**
     * FIN-02: the resolved GBP→1ZE settlement rate context for this
     * transaction. Callers resolve it once per tx (multi-fill executions
     * price every leg at the same rate — no FX TOCTOU across fills) and pass
     * it in; both legs derive from computeCoOwnSettlementUnits so trade and
     * DRIP share one versioned quote path.
     */
    settlement: CoOwnSettlementRateContext;
  }
): Promise<{ notionalGbp: number; feeGbp: number }> {
  const units = Math.max(0, Math.floor(input.units));
  if (units <= 0) {
    return {
      notionalGbp: 0,
      feeGbp: 0,
    };
  }

  // FIN-07 / SEP21-FIN-E backstop: the settlement primitive itself refuses
  // to settle a SECONDARY resale while the asset lockup is in force, so a
  // resting order placed before a lockup (or any future caller bypassing
  // the route-level capability check) cannot settle a transfer. Primary
  // issuance fills (enforceSellerHolding:false — the counterparty is the
  // issuer's available_units pool, not a locked holder) are permitted
  // during lockup per the resolved lockup contract.
  await assertCoOwnLockupPermitted(
    client,
    input.assetId,
    input.enforceSellerHolding ? 'secondary' : 'primary'
  );

  const notionalGbp = roundTo(units * input.unitPriceGbp, 4);

  // ── Atomic DvP settlement (1ZE payment side) ──
  // FIN-02: GBP→1ZE goes through the versioned settlement quote
  // (GBP → USD anchor at par → 1ZE minor units), never a raw ×1000. The
  // payer leg rounds up, the payee leg rounds down; sub-unit dust is
  // absorbed by the platform side (same convention as the GBP fee split).
  // Computed up-front: the leg sizes decide which locks must be taken.
  const settlementLegs = computeCoOwnSettlementUnits(input.settlement, {
    notionalGbp,
    feeGbp: input.feeGbp,
  });
  const buyerPays1zeUnits = settlementLegs.buyerDebitUnits;
  const sellerReceives1zeUnits = settlementLegs.sellerCreditUnits;
  const settlementQuoteMetadata = {
    quoteVersion: input.settlement.quoteVersion,
    settlementCurrency: input.settlement.settlementCurrency,
    anchorCurrency: input.settlement.anchorCurrency,
    anchorValue: input.settlement.anchorValue,
    anchorToSettlementRate: input.settlement.anchorToSettlementRate,
    rateSource: input.settlement.rateSource,
    rateResolvedAt: input.settlement.rateResolvedAt,
  };

  // Canonical lock order (shared with computeSpendableOnezeUnits and the
  // reserve/placement routes): wallets first — both counterparty wallets
  // locked in wallet-id order so two opposite-direction trades between the
  // same pair cannot deadlock — then the buyer's reservation rows in id
  // order, then both holding rows in deterministic user-id order.
  // Previously holdings and wallets were each locked buyer → seller, an
  // arbitrary direction that deadlocks against the reverse trade.
  const partyWalletRows = await client.query<{ id: string }>(
    `SELECT id FROM wallets WHERE user_id = ANY($1::text[])`,
    [[input.buyerId, input.sellerId]]
  );
  await lockWalletRowsForUpdate(client, partyWalletRows.rows.map((row) => row.id));

  if (buyerPays1zeUnits > 0) {
    // Lock the buyer's enforceable reservation rows (wallet → reservations
    // in id order) BEFORE the holding rows below — reservations precede
    // holdings in the canonical tail order. debitCoOwnOnezeUnits
    // re-verifies spendable under these same locks.
    await computeSpendableOnezeUnits(client, {
      userId: input.buyerId,
      excludePlacedOrderId: input.buyOrderId ?? null,
    });
  }

  const [firstPartyId, secondPartyId] =
    input.buyerId <= input.sellerId
      ? [input.buyerId, input.sellerId]
      : [input.sellerId, input.buyerId];
  const firstPartyHolding = await getCoOwnHoldingForUpdate(client, firstPartyId, input.assetId);
  const secondPartyHolding = firstPartyId === secondPartyId
    ? firstPartyHolding
    : await getCoOwnHoldingForUpdate(client, secondPartyId, input.assetId);
  const buyerHolding = firstPartyId === input.buyerId ? firstPartyHolding : secondPartyHolding;
  const sellerHolding = firstPartyId === input.buyerId ? secondPartyHolding : firstPartyHolding;

  if (input.enforceSellerHolding) {
    const sellerUnits = sellerHolding?.units_owned ?? 0;
    if (sellerUnits < units) {
      throw createApiError('CO_OWN_SELLER_UNITS_INSUFFICIENT', 'Seller does not have enough units', {
        sellerId: input.sellerId,
        availableUnits: sellerUnits,
        requestedUnits: units,
      });
    }
  }

  const buyerUnitsBefore = buyerHolding?.units_owned ?? 0;
  const buyerAvgBefore = Number(buyerHolding?.avg_entry_price_gbp ?? 0);
  const buyerRealizedBefore = Number(buyerHolding?.realized_pnl_gbp ?? 0);
  const buyerUnitsAfter = buyerUnitsBefore + units;
  const buyerAvgAfter =
    buyerUnitsAfter > 0
      ? (buyerAvgBefore * buyerUnitsBefore + input.unitPriceGbp * units) / buyerUnitsAfter
      : input.unitPriceGbp;

  await saveCoOwnHolding(client, {
    userId: input.buyerId,
    assetId: input.assetId,
    unitsOwned: buyerUnitsAfter,
    avgEntryPriceGbp: buyerAvgAfter,
    realizedPnlGbp: buyerRealizedBefore,
  });

  if (input.enforceSellerHolding) {
    const sellerUnitsBefore = sellerHolding?.units_owned ?? 0;
    const sellerAvgBefore = Number(sellerHolding?.avg_entry_price_gbp ?? 0);
    const sellerRealizedBefore = Number(sellerHolding?.realized_pnl_gbp ?? 0);
    const sellerUnitsAfter = sellerUnitsBefore - units;
    const realizedDelta = (input.unitPriceGbp - sellerAvgBefore) * units;

    await saveCoOwnHolding(client, {
      userId: input.sellerId,
      assetId: input.assetId,
      unitsOwned: sellerUnitsAfter,
      avgEntryPriceGbp: sellerUnitsAfter > 0 ? sellerAvgBefore : 0,
      realizedPnlGbp: sellerRealizedBefore + realizedDelta,
    });
  }

  await client.query(
    `
      INSERT INTO coOwn_trades (
        asset_id,
        buy_order_id,
        sell_order_id,
        buyer_id,
        seller_id,
        units,
        unit_price_gbp,
        notional_gbp,
        fee_gbp,
        settlement_status,
        settled_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'settled', NOW())
    `,
    [
      input.assetId,
      input.buyOrderId ?? null,
      input.sellOrderId ?? null,
      input.buyerId,
      input.sellerId,
      units,
      input.unitPriceGbp,
      notionalGbp,
      input.feeGbp,
    ]
  );

  if (buyerPays1zeUnits > 0) {
    const tradeTxId = `coown_trade_${input.buyOrderId ?? 'x'}_${input.sellOrderId ?? 'x'}_${Date.now()}`;

    // FIN-05: route both legs through the segment-aware settlement
    // primitives — reservation-aware debit (the reservation bound to this
    // buy order is excluded: those units are reserved FOR this trade), and
    // an explicit-segment credit. Every mutation writes wallet_ledger via
    // applyWalletLedgerDelta and keeps oneze_wallet_segments converged.
    await debitCoOwnOnezeUnits(client, {
      userId: input.buyerId,
      txId: tradeTxId,
      amountUnits: buyerPays1zeUnits,
      kind: 'CO_OWN_TRADE',
      refType: 'coOwn_trade',
      refId: String(input.buyOrderId ?? ''),
      excludePlacedOrderId: input.buyOrderId ?? null,
      metadata: {
        assetId: input.assetId,
        units,
        side: 'buy',
        notionalGbp,
        feeGbp: input.feeGbp,
        ...settlementQuoteMetadata,
      },
    });

    if (sellerReceives1zeUnits > 0) {
      // FIN-06: a missing seller/issuer wallet throws WALLET_NOT_FOUND —
      // the caller's transaction rolls back, so a buyer debit can never
      // commit without its balancing seller credit.
      await creditCoOwnOnezeUnits(client, {
        userId: input.sellerId,
        txId: tradeTxId,
        amountUnits: sellerReceives1zeUnits,
        kind: 'CO_OWN_TRADE',
        refType: 'coOwn_trade',
        refId: String(input.sellOrderId ?? ''),
        segment: 'earned',
        metadata: {
          assetId: input.assetId,
          units,
          side: 'sell',
          notionalGbp,
          feeGbp: input.feeGbp,
          ...settlementQuoteMetadata,
        },
      });
    }
  }

  if (input.feeGbp > 0 && await deps.ledgerTablesAvailable(client)) {
    const platformRevenueAccountId = await deps.ensureLedgerAccount(
      client,
      'platform',
      'platform',
      'platform_revenue'
    );
    const buyerSpendAccountId = await deps.ensureLedgerAccount(
      client,
      'user',
      input.buyerId,
      'buyer_spend'
    );
    const sellerFeeAccountId = await deps.ensureLedgerAccount(
      client,
      'user',
      input.sellerId,
      'seller_payable'
    );

    await deps.appendLedgerEntry(client, {
      accountId: buyerSpendAccountId,
      counterpartyAccountId: platformRevenueAccountId,
      direction: 'debit',
      amountGbp: input.feeGbp,
      sourceType: 'coOwn_trade',
      sourceId: input.buyOrderId ? `buy_${input.buyOrderId}` : `trade_${input.assetId}`,
      lineType: 'coOwn_trade_fee_credit',
    });

    await deps.appendLedgerEntry(client, {
      accountId: sellerFeeAccountId,
      counterpartyAccountId: platformRevenueAccountId,
      direction: 'debit',
      amountGbp: input.feeGbp,
      sourceType: 'coOwn_trade',
      sourceId: input.sellOrderId ? `sell_${input.sellOrderId}` : `issuance_${input.assetId}`,
      lineType: 'coOwn_trade_seller_fee_debit',
    });

    await deps.appendLedgerEntry(client, {
      accountId: platformRevenueAccountId,
      counterpartyAccountId: sellerFeeAccountId,
      direction: 'credit',
      amountGbp: input.feeGbp,
      sourceType: 'coOwn_trade',
      sourceId: input.sellOrderId ? `sell_${input.sellOrderId}` : `issuance_${input.assetId}`,
      lineType: 'coOwn_trade_seller_fee_credit',
    });

    await deps.appendLedgerEntry(client, {
      accountId: platformRevenueAccountId,
      counterpartyAccountId: buyerSpendAccountId,
      direction: 'credit',
      amountGbp: input.feeGbp,
      sourceType: 'coOwn_trade',
      sourceId: input.buyOrderId ? `buy_${input.buyOrderId}` : `trade_${input.assetId}`,
      lineType: 'coOwn_trade_fee_credit',
    });
  }

  // ── Track total traded value for recourse liability ──
  await client.query(
    `UPDATE coOwn_assets
     SET total_traded_value_gbp = total_traded_value_gbp + $2,
         updated_at = NOW()
     WHERE id = $1`,
    [input.assetId, notionalGbp]
  );

  return {
    notionalGbp,
    feeGbp: input.feeGbp,
  };
}
