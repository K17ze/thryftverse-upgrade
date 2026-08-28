/**
 * Queued 1ze mint reserve allocation handler.
 *
 * Extracted verbatim from `src/index.ts`
 * (`processQueuedOnezeMintReserveAllocation`). Allocates reserve, credits the
 * user wallet, and settles a confirmed mint operation.
 */
import { db } from '../../db/pool.js';
import { logger } from '../../lib/logger.js';
import {
  pricingTablesAvailable as onezePricingTablesAvailable,
  resolveCountryPricingQuoteByCurrency,
} from '../../lib/pricingEngine.js';
import {
  type MintOperationRow,
  MINT_OPERATION_TERMINAL_STATES,
  createApiError,
  createRuntimeId,
  normalizeOnezeCountryTag,
  onezeMintFlowTablesAvailable,
  toJsonString,
} from '../../lib/workerHelpers.js';
import {
  applyWalletLedgerDelta,
  creditWalletSegmentBalance,
  ensureWallet,
  loadMintOperationById,
} from '../../lib/workerRuntime.js';

export type OnezeMintReserveHandlerDeps = {
  /** Uses shared db singleton + worker runtime helpers. */
};

export async function processQueuedOnezeMintReserveAllocation(input: {
  mintOperationId: string;
  initiatedBy: string;
  reason: 'webhook_confirmed' | 'manual_retry';
}): Promise<void> {
  if (!(await onezeMintFlowTablesAvailable(db))) {
    logger.warn(
      {
        mintOperationId: input.mintOperationId,
      },
      'Skipped queued 1ze mint allocation because mint flow tables are unavailable'
    );
    return;
  }

  if (!(await onezePricingTablesAvailable(db))) {
    logger.warn(
      {
        mintOperationId: input.mintOperationId,
      },
      'Skipped queued 1ze mint allocation because controlled pricing tables are unavailable'
    );
    return;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const operation = await loadMintOperationById(client, input.mintOperationId, {
      forUpdate: true,
    });

    if (!operation) {
      throw createApiError('MINT_OPERATION_NOT_FOUND', 'Mint operation not found', {
        mintOperationId: input.mintOperationId,
      });
    }

    if (MINT_OPERATION_TERMINAL_STATES.has(operation.state) && operation.state !== 'WALLET_CREDITED') {
      await client.query('COMMIT');
      return;
    }

    if (
      operation.state !== 'PAYMENT_CONFIRMED'
      && operation.state !== 'RESERVE_PURCHASING'
      && operation.state !== 'RESERVE_ALLOCATED'
      && operation.state !== 'WALLET_CREDITED'
      && operation.state !== 'SETTLED'
    ) {
      throw createApiError('MINT_OPERATION_STATE_INVALID', 'Mint operation is not ready for allocation', {
        mintOperationId: input.mintOperationId,
        state: operation.state,
      });
    }

    let mutableOperation: MintOperationRow = operation;

    if (mutableOperation.state === 'PAYMENT_CONFIRMED') {
      const purchasingResult = await client.query<MintOperationRow>(
        `
          UPDATE mint_operations
          SET
            state = 'RESERVE_PURCHASING',
            purchase_attempted_at = NOW(),
            metadata = metadata || $2::jsonb,
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            user_id,
            state,
            fiat_amount_minor::text,
            fiat_currency,
            net_fiat_amount_minor::text,
            platform_fee_minor::text,
            ize_amount_units::text,
            rate_per_gram::text,
            rate_source,
            rate_locked_at::text,
            rate_expires_at::text,
            payment_intent_id,
            lot_id,
            custodian_ref,
            escrow_ledger_tx_id,
            wallet_credit_tx_id,
            purchase_attempted_at::text,
            settled_at::text,
            last_error,
            metadata,
            created_at::text,
            updated_at::text
        `,
        [
          mutableOperation.id,
          toJsonString({
            reserveWorker: {
              initiatedBy: input.initiatedBy,
              reason: input.reason,
              startedAt: new Date().toISOString(),
            },
          }),
        ]
      );

      mutableOperation = purchasingResult.rows[0];
    }

    if (mutableOperation.state === 'PAYMENT_CONFIRMED' || mutableOperation.state === 'RESERVE_PURCHASING') {
      const allocationTxId = mutableOperation.escrow_ledger_tx_id ?? createRuntimeId('mintalloc');

      const allocatedResult = await client.query<MintOperationRow>(
        `
          UPDATE mint_operations
          SET
            state = 'RESERVE_ALLOCATED',
            escrow_ledger_tx_id = COALESCE(escrow_ledger_tx_id, $2),
            metadata = metadata || $3::jsonb,
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            user_id,
            state,
            fiat_amount_minor::text,
            fiat_currency,
            net_fiat_amount_minor::text,
            platform_fee_minor::text,
            ize_amount_units::text,
            rate_per_gram::text,
            rate_source,
            rate_locked_at::text,
            rate_expires_at::text,
            payment_intent_id,
            lot_id,
            custodian_ref,
            escrow_ledger_tx_id,
            wallet_credit_tx_id,
            purchase_attempted_at::text,
            settled_at::text,
            last_error,
            metadata,
            created_at::text,
            updated_at::text
        `,
        [
          mutableOperation.id,
          allocationTxId,
          toJsonString({
            allocationMode: 'closed_loop_no_custody',
            allocationRecordedAt: new Date().toISOString(),
            allocationTxId,
          }),
        ]
      );

      mutableOperation = allocatedResult.rows[0];
    }

    if (!mutableOperation.wallet_credit_tx_id) {
      const wallet = await ensureWallet(client, mutableOperation.user_id, mutableOperation.fiat_currency);
      const walletCreditTxId = createRuntimeId('mintcred');
      const amountUnits = Number(mutableOperation.ize_amount_units);
      const pricingQuote = await resolveCountryPricingQuoteByCurrency(client, mutableOperation.fiat_currency);

      await applyWalletLedgerDelta(client, {
        walletId: wallet.id,
        txId: walletCreditTxId,
        asset: '1ZE',
        amount: amountUnits,
        kind: 'MINT',
        refType: 'mint_operation',
        refId: mutableOperation.id,
        anchorValueInInr: pricingQuote.anchorValueInInr,
        metadata: {
          mintOperationId: mutableOperation.id,
          paymentIntentId: mutableOperation.payment_intent_id,
          allocationMode: 'closed_loop_no_custody',
          initiatedBy: input.initiatedBy,
          pricingSource: `internal_pricing:${pricingQuote.countryCode}:buy`,
        },
      });

      await creditWalletSegmentBalance(client, {
        wallet,
        txId: walletCreditTxId,
        purchasedCreditUnits: amountUnits,
        originCountry: normalizeOnezeCountryTag(
          typeof mutableOperation.metadata?.originCountry === 'string'
            ? mutableOperation.metadata.originCountry
            : null
        ),
        metadata: {
          mintOperationId: mutableOperation.id,
          source: 'mint_queue_credit',
        },
      });

      const creditedResult = await client.query<MintOperationRow>(
        `
          UPDATE mint_operations
          SET
            state = 'WALLET_CREDITED',
            wallet_credit_tx_id = $2,
            metadata = metadata || $3::jsonb,
            updated_at = NOW()
          WHERE id = $1
          RETURNING
            id,
            user_id,
            state,
            fiat_amount_minor::text,
            fiat_currency,
            net_fiat_amount_minor::text,
            platform_fee_minor::text,
            ize_amount_units::text,
            rate_per_gram::text,
            rate_source,
            rate_locked_at::text,
            rate_expires_at::text,
            payment_intent_id,
            lot_id,
            custodian_ref,
            escrow_ledger_tx_id,
            wallet_credit_tx_id,
            purchase_attempted_at::text,
            settled_at::text,
            last_error,
            metadata,
            created_at::text,
            updated_at::text
        `,
        [
          mutableOperation.id,
          walletCreditTxId,
          toJsonString({
            walletCreditedAt: new Date().toISOString(),
            walletCreditTxId,
          }),
        ]
      );

      mutableOperation = creditedResult.rows[0];
    }

    if (mutableOperation.state !== 'SETTLED') {
      await client.query(
        `
          UPDATE mint_operations
          SET
            state = 'SETTLED',
            settled_at = NOW(),
            metadata = metadata || $2::jsonb,
            updated_at = NOW()
          WHERE id = $1
        `,
        [
          mutableOperation.id,
          toJsonString({
            settledAt: new Date().toISOString(),
            settlementMode: 'closed_loop_credit_issue',
          }),
        ]
      );

    }

    await client.query('COMMIT');

    logger.info(
      {
        mintOperationId: input.mintOperationId,
        initiatedBy: input.initiatedBy,
        reason: input.reason,
      },
      'Processed queued 1ze mint allocation'
    );
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(
      {
        err: error,
        mintOperationId: input.mintOperationId,
        reason: input.reason,
      },
      'Failed queued 1ze mint allocation'
    );
    throw error;
  } finally {
    client.release();
  }
}
