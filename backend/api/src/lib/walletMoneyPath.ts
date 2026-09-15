import crypto from 'node:crypto';
import {
  createApiError,
  createRuntimeId,
  toJsonString,
  unitsToOnezeAmount,
  ONEZE_UNITS_PER_IZE,
  type DbQueryable,
  type WalletRow,
} from './workerHelpers.js';
import {
  resolveCountryPricingQuoteByCurrency,
  resolveInternalFxRate,
} from './pricingEngine.js';

// ─── Canonical wallet balance mutation ───────────────────────────────────────
// This is THE wallet ledger primitive: it locks the wallet row, applies the
// delta with a negative-balance guard, and appends the wallet_ledger entry —
// all on the caller's transaction. index.ts delegates to this copy; a stale
// duplicate remains in lib/workerRuntime.ts for the standalone worker
// process, but new money paths must use this one.

async function loadWalletForUpdate(client: DbQueryable, walletId: string): Promise<WalletRow> {
  const result = await client.query<WalletRow>(
    `
      SELECT
        id,
        user_id,
        oneze_balance_units,
        fiat_balance_minor,
        fiat_currency,
        version,
        created_at::text,
        updated_at::text
      FROM wallets
      WHERE id = $1
      LIMIT 1
      FOR UPDATE
    `,
    [walletId]
  );

  const wallet = result.rows[0];
  if (!wallet) {
    throw createApiError('WALLET_NOT_FOUND', 'Wallet not found', { walletId });
  }

  return wallet;
}

export async function applyWalletLedgerDelta(
  client: DbQueryable,
  input: {
    walletId: string;
    txId: string;
    asset: '1ZE' | 'FIAT';
    amount: number;
    kind: string;
    refType?: string;
    refId?: string;
    anchorValueInInr?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<number> {
  if (!Number.isSafeInteger(input.amount)) {
    throw createApiError('WALLET_AMOUNT_INVALID', 'Wallet ledger amount must be an integer unit');
  }

  const wallet = await loadWalletForUpdate(client, input.walletId);
  const currentBalance = Number(
    input.asset === '1ZE' ? wallet.oneze_balance_units : wallet.fiat_balance_minor
  );
  const nextBalance = currentBalance + input.amount;

  if (nextBalance < 0) {
    throw createApiError('WALLET_INSUFFICIENT_BALANCE', 'Wallet balance is insufficient for this operation', {
      walletId: input.walletId,
      asset: input.asset,
      currentBalance,
      attemptedDelta: input.amount,
    });
  }

  if (input.asset === '1ZE') {
    await client.query(
      `
        UPDATE wallets
        SET
          oneze_balance_units = $2,
          version = version + 1,
          updated_at = NOW()
        WHERE id = $1
      `,
      [input.walletId, nextBalance]
    );
  } else {
    await client.query(
      `
        UPDATE wallets
        SET
          fiat_balance_minor = $2,
          version = version + 1,
          updated_at = NOW()
        WHERE id = $1
      `,
      [input.walletId, nextBalance]
    );
  }

  await client.query(
    `
      INSERT INTO wallet_ledger (
        wallet_id,
        tx_id,
        asset,
        amount,
        balance_after,
        kind,
        ref_type,
        ref_id,
        anchor_value_in_inr,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
    `,
    [
      input.walletId,
      input.txId,
      input.asset,
      input.amount,
      nextBalance,
      input.kind,
      input.refType ?? null,
      input.refId ?? null,
      input.anchorValueInInr ?? null,
      toJsonString(input.metadata ?? {}),
    ]
  );

  return nextBalance;
}

// ─── Wallet idempotency helpers ──────────────────────────────────────────────
// Shared by every wallet money-mutating route (mint, burn, convert, buy,
// transfers). The stored request_hash is compared before a replay is served
// so a recycled key with a different payload is rejected, not silently
// replayed.

export function hashWalletIdempotencyPayload(payload: unknown): string {
  return crypto.createHash('sha256').update(toJsonString(payload ?? {})).digest('hex');
}

export async function getWalletIdempotentResponse(
  client: DbQueryable,
  input: {
    userId: string;
    operation: string;
    idempotencyKey: string;
    requestHash: string;
  }
): Promise<Record<string, unknown> | null> {
  const result = await client.query<{
    request_hash: string;
    response_payload: Record<string, unknown>;
  }>(
    `
      SELECT request_hash, response_payload
      FROM wallet_idempotency_keys
      WHERE user_id = $1
        AND operation = $2
        AND idempotency_key = $3
      LIMIT 1
    `,
    [input.userId, input.operation, input.idempotencyKey]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  if (row.request_hash !== input.requestHash) {
    throw createApiError(
      'IDEMPOTENCY_KEY_REUSED',
      'Idempotency key was already used with a different request payload'
    );
  }

  return row.response_payload;
}

export async function saveWalletIdempotentResponse(
  client: DbQueryable,
  input: {
    userId: string;
    operation: string;
    idempotencyKey: string;
    requestHash: string;
    responsePayload: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `
      INSERT INTO wallet_idempotency_keys (
        user_id,
        operation,
        idempotency_key,
        request_hash,
        response_payload
      )
      VALUES ($1, $2, $3, $4, $5::jsonb)
      ON CONFLICT (user_id, operation, idempotency_key)
      DO NOTHING
    `,
    [
      input.userId,
      input.operation,
      input.idempotencyKey,
      input.requestHash,
      toJsonString(input.responsePayload),
    ]
  );
}

// ─── 1ZE unit helpers ────────────────────────────────────────────────────────

export function onezeAmountToUnits(amount: number): number {
  const units = Math.round(amount * ONEZE_UNITS_PER_IZE);
  if (!Number.isSafeInteger(units) || units <= 0) {
    throw createApiError('IZE_AMOUNT_INVALID', '1ze amount cannot be represented safely in minor units');
  }

  return units;
}

// ─── Convert-1ZE-to-fiat quote ───────────────────────────────────────────────
// Single source of truth for the convert quote. Both the preview branch and
// the execution branch of POST /wallet/convert-1ze-to-fiat call this — a
// preview MUST return the same numbers an execution would charge, so the math
// lives here exactly once. This function only reads pricing state; it never
// writes ledger entries or mutates balances.

export interface OnezeToFiatConversionQuote {
  normalizedIzeAmount: number;
  amountUnits: number;
  fiatCurrency: string;
  pricingQuote: Awaited<ReturnType<typeof resolveCountryPricingQuoteByCurrency>>;
  fxRate: number;
  principalAmount: number;
  feeBps: number;
  feeAmount: number;
  netRedemption: number;
}

export async function computeOnezeToFiatConversionQuote(
  client: DbQueryable,
  input: {
    izeAmount: number;
    fiatCurrency: string;
    feeBps: number;
  }
): Promise<OnezeToFiatConversionQuote> {
  const fiatCurrency = input.fiatCurrency.toUpperCase();
  const normalizedIzeAmount = Number(input.izeAmount.toFixed(6));
  const amountUnits = onezeAmountToUnits(normalizedIzeAmount);

  // At-par pricing model: 1 1ZE = $1.00 USD. Convert to the target fiat
  // currency via the USD→local FX rate. The platform spread is applied as a
  // separate transparent fee, not baked into the exchange rate.
  const pricingQuote = await resolveCountryPricingQuoteByCurrency(client, fiatCurrency);
  const onezeAmountFromUnits = unitsToOnezeAmount(amountUnits);
  const fxRate = (await resolveInternalFxRate(client, 'USD', fiatCurrency)).rate;
  const principalAmount = Number((onezeAmountFromUnits * fxRate).toFixed(6));

  const feeBps = input.feeBps;
  const feeAmount = Number(((principalAmount * feeBps) / 10_000).toFixed(6));
  const netRedemption = Number((principalAmount - feeAmount).toFixed(6));

  return {
    normalizedIzeAmount,
    amountUnits,
    fiatCurrency,
    pricingQuote,
    fxRate,
    principalAmount,
    feeBps,
    feeAmount,
    netRedemption,
  };
}

// ─── wallet_ize_operations replay lookup ─────────────────────────────────────
// Used when the unique index on wallet_ize_operations.payment_intent_id turns
// a mint retry into a 23505 — the committed operation is replayed instead of
// minting a second time.

export interface WalletIzeOperationRow {
  id: string;
  user_id: string;
  operation_type: string;
  fiat_amount: number | string;
  fiat_currency: string;
  ize_amount: number | string;
  rate_per_gram: number | string;
  status: string;
  payment_intent_id: string | null;
  payout_request_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  committed_at: string | null;
}

export async function findWalletIzeOperationByPaymentIntentId(
  client: DbQueryable,
  paymentIntentId: string
): Promise<WalletIzeOperationRow | null> {
  const result = await client.query<WalletIzeOperationRow>(
    `
      SELECT
        id,
        user_id,
        operation_type,
        fiat_amount::text,
        fiat_currency,
        ize_amount::text,
        rate_per_gram::text,
        status,
        payment_intent_id,
        payout_request_id,
        metadata,
        created_at::text,
        committed_at::text
      FROM wallet_ize_operations
      WHERE payment_intent_id = $1
      LIMIT 1
    `,
    [paymentIntentId]
  );

  return result.rows[0] ?? null;
}

export function isPostgresUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null | undefined)?.code === '23505';
}

// ─── oneze_internal refund ───────────────────────────────────────────────────
// A oneze_internal commerce payment debited the buyer's
// wallets.oneze_balance_units inside settlePaymentIntent (kind 'PURCHASE',
// asset '1ZE', metadata.intentId = the settled intent). Refunding must
// re-credit the SAME wallet in 1ZE units — there is no external provider call
// because the money never left the platform.
//
// Idempotency is anchored on refundOperationId: a second call with the same
// operation id finds the existing ONEZE_REFUND ledger entry and returns its
// reference without crediting again. A cumulative cap keeps partial refunds
// from ever exceeding the original debit.

export interface OnezeInternalRefundResult {
  providerRefundRef: string;
  creditedUnits: number;
  walletLedgerId: string | null;
  alreadyCredited: boolean;
}

export async function refundOnezeInternalWalletDebit(
  client: DbQueryable,
  input: {
    intentId: string;
    refundAmount: number;
    refundOperationId: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<OnezeInternalRefundResult> {
  const providerRefundRef = `oneze_refund_${input.refundOperationId}`;

  // Replay guard: this exact refund operation already credited.
  const existingRefund = await client.query<{ id: string; amount: string }>(
    `
      SELECT id::text AS id, amount::text AS amount
      FROM wallet_ledger
      WHERE asset = '1ZE'
        AND kind = 'ONEZE_REFUND'
        AND metadata->>'refundOperationId' = $1
      LIMIT 1
    `,
    [input.refundOperationId]
  );

  if (existingRefund.rows[0]) {
    return {
      providerRefundRef,
      creditedUnits: Number(existingRefund.rows[0].amount),
      walletLedgerId: existingRefund.rows[0].id,
      alreadyCredited: true,
    };
  }

  // Load the original purchase debit for this intent. The entry records the
  // exact GBP total, the GBP→USD rate used, and the units debited — the
  // refund re-credits at that same locked rate.
  const purchase = await client.query<{
    id: string;
    wallet_id: string;
    amount: string;
    metadata: Record<string, unknown> | null;
    user_id: string;
  }>(
    `
      SELECT wl.id::text AS id, wl.wallet_id, wl.amount::text AS amount,
             wl.metadata, w.user_id
      FROM wallet_ledger wl
      JOIN wallets w ON w.id = wl.wallet_id
      WHERE wl.asset = '1ZE'
        AND wl.kind = 'PURCHASE'
        AND wl.metadata->>'intentId' = $1
      ORDER BY wl.id DESC
      LIMIT 1
    `,
    [input.intentId]
  );

  const purchaseRow = purchase.rows[0];
  if (!purchaseRow) {
    throw createApiError(
      'REFUND_SOURCE_NOT_FOUND',
      'No 1ZE purchase debit found for this payment intent — cannot refund through the internal rail',
      { intentId: input.intentId }
    );
  }

  const purchaseMetadata =
    purchaseRow.metadata && typeof purchaseRow.metadata === 'object'
      ? purchaseRow.metadata
      : {};
  const originalDebitUnits = Math.abs(Number(purchaseRow.amount));
  const originalTotalGbp = Number(purchaseMetadata.totalGbp ?? 0);
  const gbpToUsdRate = Number(purchaseMetadata.gbpToUsdRate ?? 0);

  // Cumulative cap: partial refunds already credited against this intent
  // count toward the original debit.
  const refundedSoFarResult = await client.query<{ total: string }>(
    `
      SELECT COALESCE(SUM(amount), 0)::text AS total
      FROM wallet_ledger
      WHERE asset = '1ZE'
        AND kind = 'ONEZE_REFUND'
        AND metadata->>'intentId' = $1
    `,
    [input.intentId]
  );
  const refundedUnitsSoFar = Number(refundedSoFarResult.rows[0]?.total ?? '0');
  const remainingRefundableUnits = Math.max(0, originalDebitUnits - refundedUnitsSoFar);

  if (remainingRefundableUnits <= 0) {
    throw createApiError(
      'REFUND_AMOUNT_EXCEEDS_REMAINING',
      'This 1ZE payment has already been fully refunded',
      { intentId: input.intentId }
    );
  }

  // Refund units: proportional to the refunded GBP share of the original
  // total when the purchase metadata is available; otherwise derive from the
  // original locked rate. A full refund always returns every unit debited.
  const refundAmount = Number(input.refundAmount.toFixed(6));
  let refundUnits: number;
  if (
    Number.isFinite(originalTotalGbp) && originalTotalGbp > 0
    && refundAmount >= originalTotalGbp - 0.005
  ) {
    refundUnits = originalDebitUnits;
  } else if (Number.isFinite(originalTotalGbp) && originalTotalGbp > 0) {
    refundUnits = Math.max(1, Math.round(originalDebitUnits * (refundAmount / originalTotalGbp)));
  } else if (Number.isFinite(gbpToUsdRate) && gbpToUsdRate > 0) {
    refundUnits = Math.max(1, Math.round((refundAmount / gbpToUsdRate) * ONEZE_UNITS_PER_IZE));
  } else {
    throw createApiError(
      'REFUND_RATE_UNAVAILABLE',
      'Unable to derive the 1ZE refund amount — original purchase rate metadata is missing',
      { intentId: input.intentId }
    );
  }
  refundUnits = Math.min(refundUnits, remainingRefundableUnits);

  const txId = createRuntimeId('wtx');
  const orderId =
    typeof purchaseMetadata.orderId === 'string' ? purchaseMetadata.orderId : input.intentId;

  const balanceAfter = await applyWalletLedgerDelta(client, {
    walletId: purchaseRow.wallet_id,
    txId,
    asset: '1ZE',
    amount: refundUnits,
    kind: 'ONEZE_REFUND',
    refType: 'commerce_order_refund',
    refId: orderId,
    metadata: {
      intentId: input.intentId,
      orderId,
      refundOperationId: input.refundOperationId,
      refundAmountGbp: refundAmount,
      originalDebitUnits,
      refundedUnitsSoFar,
      gbpToUsdRate: Number.isFinite(gbpToUsdRate) ? gbpToUsdRate : null,
      reason: input.reason ?? null,
      source: 'oneze_internal_refund',
      ...(input.metadata ?? {}),
    },
  });

  const inserted = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM wallet_ledger WHERE wallet_id = $1 AND tx_id = $2 LIMIT 1`,
    [purchaseRow.wallet_id, txId]
  );

  return {
    providerRefundRef,
    creditedUnits: refundUnits,
    walletLedgerId: inserted.rows[0]?.id ?? null,
    alreadyCredited: false,
  };
}

// ─── Refund-after-payout recovery planner ────────────────────────────────────
// Pure decision model for postCommerceOrderRefundLedgerReversal. When seller
// escrow was already released, the buyer_refund legs drive escrow_liability
// negative — the seller must return the goods value they received. The
// recovery is the goods subtotal only: platform fees and postage are reversed
// by their own legs and never leave the seller's pocket.

export interface RefundRecoveryInput {
  sellerEscrowReleased: boolean;
  sellerId: string | null;
  subtotalGbp: number;
  platformChargeGbp: number;
  postageFeeGbp: number;
  totalGbp: number;
}

export interface RefundRecoveryPlan {
  postBuyerRefund: boolean;
  postSellerRecovery: boolean;
  sellerRecoveryAmount: number;
  reversePlatformFee: boolean;
  reversePostage: boolean;
  escrowGoesNegative: boolean;
}

export function planCommerceOrderRefundRecovery(input: RefundRecoveryInput): RefundRecoveryPlan {
  const sellerShare = Math.max(
    0,
    Number((input.totalGbp - input.platformChargeGbp - input.postageFeeGbp).toFixed(6))
  );
  const sellerRecoveryAmount = input.sellerEscrowReleased && input.sellerId && input.subtotalGbp > 0
    ? Number(Math.min(input.subtotalGbp, sellerShare).toFixed(6))
    : 0;

  return {
    postBuyerRefund: input.totalGbp > 0,
    postSellerRecovery: sellerRecoveryAmount > 0,
    sellerRecoveryAmount,
    reversePlatformFee: input.platformChargeGbp > 0,
    reversePostage: input.postageFeeGbp > 0,
    escrowGoesNegative: input.sellerEscrowReleased,
  };
}

// ─── Mint operation lazy materialization ─────────────────────────────────────
// The mint quote route no longer persists a mint_operations row per quote
// (debounced previews used to leak one row per keystroke). The quote metadata
// — including the locked rate — rides on the payment intent, and the mint
// operation is materialized here only when a real payment event arrives.

export interface MintQuoteIntentMetadata {
  mintOperationId?: string;
  mintQuote?: {
    ratePerGram?: number;
    rateSource?: string;
    rateLockedAt?: string;
    rateExpiresAt?: string;
    fiatAmountMinor?: number;
    netFiatAmountMinor?: number;
    platformFeeMinor?: number;
    izeAmountUnits?: number;
  };
  [key: string]: unknown;
}

export interface MintOperationInsertRow {
  id: string;
  user_id: string;
  state: string;
  fiat_amount_minor: string;
  fiat_currency: string;
  net_fiat_amount_minor: string;
  platform_fee_minor: string;
  ize_amount_units: string;
  rate_per_gram: string;
  rate_source: string;
  rate_locked_at: string;
  rate_expires_at: string;
  payment_intent_id: string | null;
  lot_id: string | null;
  custodian_ref: string | null;
  escrow_ledger_tx_id: string | null;
  wallet_credit_tx_id: string | null;
  purchase_attempted_at: string | null;
  settled_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Materialize a mint_operations row for a settled wallet_topup intent whose
 * quote was never persisted. Returns null when the intent is not a mint-quote
 * intent (no mintOperationId/mintQuote metadata) or the required quote fields
 * are missing — in that case the webhook caller keeps its null-op behavior.
 */
export async function materializeMintOperationForPaymentIntent(
  client: DbQueryable,
  paymentIntentId: string
): Promise<MintOperationInsertRow | null> {
  const intentResult = await client.query<{
    id: string;
    user_id: string;
    channel: string;
    amount_gbp: string;
    amount_currency: string;
    amount_minor: string | null;
    metadata: Record<string, unknown> | null;
  }>(
    `
      SELECT id, user_id, channel, amount_gbp::text, amount_currency,
             amount_minor::text, metadata
      FROM payment_intents
      WHERE id = $1
      LIMIT 1
    `,
    [paymentIntentId]
  );

  const intent = intentResult.rows[0];
  if (!intent || intent.channel !== 'wallet_topup') {
    return null;
  }

  const metadata = (intent.metadata ?? {}) as MintQuoteIntentMetadata;
  const quote = metadata.mintQuote ?? {};
  const mintOperationId =
    typeof metadata.mintOperationId === 'string' && metadata.mintOperationId.length > 0
      ? metadata.mintOperationId
      : null;

  const izeAmountUnits = Number(quote.izeAmountUnits);
  const ratePerGram = Number(quote.ratePerGram);
  const rateLockedAt = typeof quote.rateLockedAt === 'string' ? quote.rateLockedAt : null;
  const rateExpiresAt = typeof quote.rateExpiresAt === 'string' ? quote.rateExpiresAt : null;
  const fiatAmountMinor = Number(quote.fiatAmountMinor ?? intent.amount_minor ?? NaN);
  const netFiatAmountMinor = Number(quote.netFiatAmountMinor);
  const platformFeeMinor = Number(quote.platformFeeMinor ?? 0);

  if (
    !mintOperationId
    || !Number.isFinite(izeAmountUnits) || izeAmountUnits <= 0
    || !Number.isFinite(ratePerGram) || ratePerGram <= 0
    || !rateLockedAt
    || !rateExpiresAt
    || !Number.isFinite(fiatAmountMinor)
    || !Number.isFinite(netFiatAmountMinor)
  ) {
    return null;
  }

  // Insert in PAYMENT_PENDING — the state the old quote route left the row in
  // after binding the payment intent — so the caller's existing transition
  // logic (PAYMENT_PENDING → PAYMENT_CONFIRMED → reserve enqueue) applies
  // verbatim. ON CONFLICT covers the race where two webhook deliveries both
  // materialize the same intent.
  const insert = await client.query<MintOperationInsertRow>(
    `
      INSERT INTO mint_operations (
        id,
        user_id,
        state,
        fiat_amount_minor,
        fiat_currency,
        net_fiat_amount_minor,
        platform_fee_minor,
        ize_amount_units,
        rate_per_gram,
        rate_source,
        rate_locked_at,
        rate_expires_at,
        payment_intent_id,
        metadata
      )
      VALUES (
        $1, $2, 'PAYMENT_PENDING', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
      )
      ON CONFLICT (payment_intent_id) DO NOTHING
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
      mintOperationId,
      intent.user_id,
      fiatAmountMinor,
      intent.amount_currency,
      netFiatAmountMinor,
      platformFeeMinor,
      izeAmountUnits,
      ratePerGram,
      typeof quote.rateSource === 'string' ? quote.rateSource : 'internal_pricing:GB:buy',
      rateLockedAt,
      rateExpiresAt,
      paymentIntentId,
      toJsonString({
        materializedFrom: 'payment_intent_quote_metadata',
        quoteHash: metadata.quoteHash ?? null,
        canonicalMoney: metadata.canonicalMoney ?? null,
        targetAssetAmount: metadata.targetAssetAmount ?? null,
      }),
    ]
  );

  if (insert.rows[0]) {
    return insert.rows[0];
  }

  // Lost the conflict race — read the winner.
  const existing = await client.query<MintOperationInsertRow>(
    `
      SELECT
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
      FROM mint_operations
      WHERE payment_intent_id = $1
      LIMIT 1
    `,
    [paymentIntentId]
  );

  return existing.rows[0] ?? null;
}
