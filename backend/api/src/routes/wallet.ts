import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import type Stripe from 'stripe';
import { config } from '../config.js';
import {
  assertOnezeOperatorToken,
  createOnezeReconciliationAttestation,
} from '../lib/onezeGovernance.js';
import {
  getCountryPricingProfile,
  pricingTablesAvailable as onezePricingTablesAvailable,
  resolveCountryPricingQuote,
  resolveCountryPricingQuoteByCurrency,
  resolveInternalFxRate,
  listCountryPricingQuotes,
  setInternalFxRate,
  getOnezeAnchorConfig,
  setOnezeAnchorConfig,
  upsertCountryPricingProfile,
  validatePricingProfileInput,
} from '../lib/pricingEngine.js';
import {
  encryptJsonPayload,
  decryptJsonPayload,
} from '../lib/keyService.js';
import {
  allocateMoneyByBasisPoints,
  moneyFromMajorDecimal,
  moneyFromMinor,
  moneyToMajorDecimal,
  type Money,
} from '../lib/money.js';
import {
  getOrCreateStripeCustomer,
  resolveActiveStripeMethod,
} from '../lib/stripePaymentMethods.js';
import {
  enqueueOnezeMintReserveJob,
  enqueueOnezeWithdrawalExecuteJob,
} from '../lib/queues.js';
import {
  createAmlAlert,
  evaluateAmlRisk,
  evaluateMarketEligibility,
  evaluateWalletCapability,
} from '../lib/compliance.js';
import type { AuthenticatedUser } from '../lib/auth.js';

// â”€â”€ Local helpers (mirrored from index.ts) â”€â”€

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function computeRequestHash(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function createRuntimeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function toJsonString(value: unknown): string {
  return JSON.stringify(value);
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// â”€â”€ Local types â”€â”€

interface ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

type DbQueryable = Pick<PoolClient, 'query'>;

type PaymentIntentChannel = 'commerce' | 'co-own' | 'wallet_topup' | 'wallet_withdrawal' | 'oneze_wallet';
type PaymentIntentStatus = 'requires_payment_method' | 'requires_confirmation' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

interface PaymentIntentRow {
  id: string;
  user_id: string;
  gateway_id: string;
  channel: PaymentIntentChannel;
  order_id: string | null;
  coOwn_order_id: number | null;
  instrument_id: number | null;
  amount_gbp: number | string;
  amount_currency: string;
  amount_minor: string;
  currency_exponent: number;
  money_registry_version: string;
  provider_amount: string | null;
  provider_amount_unit: string | null;
  money_conversion_trace: Record<string, unknown> | null;
  money_quarantined: boolean;
  status: PaymentIntentStatus;
  provider_intent_ref: string | null;
  client_secret: string | null;
  provider_status: string | null;
  next_action_url: string | null;
  sca_expires_at: string | null;
  settled_at: string | null;
  failure_code: string | null;
  failure_message: string | null;
  request_hash: string | null;
  created_at: string;
  updated_at: string;
}

interface MintOperationRow {
  id: string;
  user_id: string;
  state: string;
  fiat_amount_minor: string;
  fiat_currency: string;
  net_fiat_amount_minor: string;
  platform_fee_minor: string;
  ize_amount_mg: string;
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

interface WithdrawalRow {
  id: string;
  user_id: string;
  burn_tx_id: string | null;
  amount_mg: string;
  target_currency: string;
  gross_minor: string;
  spread_minor: string;
  network_fee_minor: string;
  net_minor: string;
  rate_locked: string;
  rate_expires_at: string;
  rail: string | null;
  rail_ref: string | null;
  status: string;
  payout_destination: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
}

interface WalletLedgerRow {
  id: number;
  wallet_id: string;
  tx_id: string;
  asset: string;
  amount: string;
  balance_after: string;
  kind: string;
  ref_type: string | null;
  ref_id: string | null;
  anchor_value_in_inr: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface WalletIzeTransferRow {
  id: string;
  sender_user_id: string;
  recipient_user_id: string;
  ize_amount: string;
  fiat_amount: string;
  fiat_currency: string;
  rate_per_gram: string;
  status: string;
  eligibility_code: string;
  aml_risk_score: string;
  aml_risk_level: string;
  aml_alert_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  committed_at: string | null;
}

type PayoutRequestStatus = 'requested' | 'processing' | 'paid' | 'failed' | 'cancelled';

interface PayoutCorridorRow {
  currency: string;
  rail: string;
  min_amount_minor: number | string;
  max_amount_minor: number | string;
  spread_bps: number;
  network_fee_minor: number | string;
  enabled: boolean;
  settlement_sla_hours: number;
}

interface OnezeReservePolicyState {
  enabled: boolean;
  minRatio: number;
  maxRatio: number;
  configuredOperationalReserveMg: number;
  reservedWithdrawalMg: number;
  operationalLiquidityMg: number;
  configuredReserveRatio: number | null;
  effectiveReserveRatio: number | null;
  withinPolicy: boolean;
}

interface OnezeRiskDashboardMetrics {
  evaluatedAt: string;
  lookbackHours: number;
  countryFlows: Array<{
    countryCode: string;
    inflowMg: number;
    outflowMg: number;
    netFlowMg: number;
  }>;
  totals: {
    inflowMg: number;
    outflowMg: number;
    netFlowMg: number;
  };
  redemption: {
    mintedIze: number;
    burnedIze: number;
    mintCount: number;
    burnCount: number;
    redemptionRate: number | null;
  };
  crossBorder: {
    transferIze: number;
    burnIze: number;
    totalIze: number;
    transferCount: number;
    burnCount: number;
    totalCount: number;
  };
  liquidity: {
    pendingWithdrawalMg: number;
    operationalLiquidityMg: number;
    stressIndex: number | null;
    stressSignal: number;
    stressLevel: 'normal' | 'elevated' | 'high' | 'critical';
  };
  exposure: {
    circulatingMg: number;
    reserveActiveMg: number;
    supplyDeltaMg: number;
    toleranceMg: number;
    withinSupplyInvariant: boolean;
    netExposureMg: number;
    netExposureIze: number;
  };
  reservePolicy: OnezeReservePolicyState;
}

// â”€â”€ Dependency injection â”€â”€

type WalletRouteDependencies = {
  app: FastifyInstance;
  db: Pool;
  stripe: Stripe | null;
  resolveAuthenticatedUserId: (request: { authUser?: AuthenticatedUser }, requestedUserId?: string) => string;
  createApiError: (code: string, message: string, details?: Record<string, unknown>) => ApiError;
  getApiError: (error: unknown) => ApiError | null;
  statusCodeForApiError: (code: string) => number;
  ensureUserExists: (userId: string) => Promise<void>;
  ensureSecurityAdminAccess: (
    request: { headers: Record<string, string | string[] | undefined>; authUser?: AuthenticatedUser },
    reply: { code: (statusCode: number) => unknown }
  ) => { ok: false; error: string } | null;
  ensureWallet: (client: DbQueryable, userId: string, fiatCurrency?: string) => Promise<any>;
  applyWalletLedgerDelta: (client: DbQueryable, input: any) => Promise<number>;
  creditWalletSegmentBalance: (client: DbQueryable, input: any) => Promise<void>;
  debitWalletSegmentBalance: (client: DbQueryable, input: any) => Promise<any>;
  toWalletPayload: (row: any) => any;
  toWalletLedgerPayload: (row: WalletLedgerRow) => any;
  toWalletIzeTransferPayload: (row: WalletIzeTransferRow) => any;
  toMintOperationPayload: (row: MintOperationRow) => any;
  toPaymentIntentPayload: (row: PaymentIntentRow) => any;
  toWithdrawalPayload: (row: WithdrawalRow) => any;
  toPayoutRequestPayload: (row: any) => any;
  onezeTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  onezeArchitectureTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  onezeP2pTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  onezeMintFlowTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  paymentTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  ledgerTablesAvailable: (client: DbQueryable) => Promise<boolean>;
  getLedgerAccountBalance: (client: DbQueryable, ownerType: string, ownerId: string, accountCode: string, currency?: string) => Promise<number>;
  getPlatformIzeReserveSnapshot: (client: DbQueryable) => Promise<any>;
  getUserCumulativeWithdrawnGbp: (client: DbQueryable, userId: string) => Promise<number>;
  calculateWalletTopupFeeBreakdown: (grossFiatAmount: number) => { grossFiatAmount: number; platformFeeRate: number; platformFeeAmount: number; netFiatAmount: number };
  hashWalletIdempotencyPayload: (payload: unknown) => string;
  getWalletIdempotentResponse: (client: DbQueryable, input: any) => Promise<any>;
  saveWalletIdempotentResponse: (client: DbQueryable, input: any) => Promise<void>;
  toFiatMinor: (amountMajor: number, currency: string) => number;
  onezeAmountToMg: (amount: number) => number;
  mgToOnezeAmount: (amountMg: number) => number;
  normalizeOnezeCountryTag: (country: string | null | undefined) => string;
  assertOnezeMintBurnNotHalted: () => Promise<void>;
  getOnezeMintBurnHaltState: () => Promise<any>;
  captureOnezeReconciliationSnapshot: (client: DbQueryable, source: string, metadata?: Record<string, unknown>) => Promise<any>;
  loadMintOperationById: (client: DbQueryable, operationId: string, opts?: any) => Promise<MintOperationRow | null>;
  loadWithdrawalById: (client: DbQueryable, withdrawalId: string, opts?: any) => Promise<WithdrawalRow | null>;
  canTransitionWithdrawalStatus: (from: string, to: string) => boolean;
  executeReservedWithdrawal: (client: DbQueryable, input: any) => Promise<any>;
  recordIzeMint: (client: DbQueryable, input: any) => Promise<void>;
  recordIzeBurn: (client: DbQueryable, input: any) => Promise<void>;
  recordIzeTransfer: (client: DbQueryable, input: any) => Promise<void>;
  evaluateP2pPolicyEligibility: (client: DbQueryable, input: any) => Promise<any>;
  appendComplianceAuditSafe: (request: FastifyRequest, input: any) => Promise<void>;
  resolveDefaultGatewayForChannel: (channel: PaymentIntentChannel) => string;
  createGatewayPaymentIntent: (input: any) => Promise<any>;
  assertSettledWalletTopupIntent: (client: DbQueryable, input: any) => Promise<any>;
  assertRedeemablePayoutRequest: (client: DbQueryable, input: any) => Promise<any>;
  getCommittedBurnIzeInWindow: (client: DbQueryable, userId: string, hours: number) => Promise<number>;
  resolvePayoutCorridor: (client: DbQueryable, currency: string) => Promise<PayoutCorridorRow | null>;
  resolveOnezeFiatFxRate: (client: DbQueryable, currency: string, options?: { forceRefresh?: boolean }) => Promise<{ rate: number; source: string; observedAt: string }>;
  collectOnezeRiskDashboardMetrics: (client: DbQueryable, lookbackHours: number) => Promise<OnezeRiskDashboardMetrics>;
};

const DEFAULT_WALLET_FIAT_CURRENCY = 'GBP';
const WALLET_TOPUP_PLATFORM_FEE_RATE = 0;

export const registerWalletRoutes = ({
  app,
  db,
  stripe,
  resolveAuthenticatedUserId,
  createApiError,
  getApiError,
  statusCodeForApiError,
  ensureUserExists,
  ensureSecurityAdminAccess,
  ensureWallet,
  applyWalletLedgerDelta,
  creditWalletSegmentBalance,
  debitWalletSegmentBalance,
  toWalletPayload,
  toWalletLedgerPayload,
  toWalletIzeTransferPayload,
  toMintOperationPayload,
  toPaymentIntentPayload,
  toWithdrawalPayload,
  toPayoutRequestPayload,
  onezeTablesAvailable,
  onezeArchitectureTablesAvailable,
  onezeP2pTablesAvailable,
  onezeMintFlowTablesAvailable,
  paymentTablesAvailable,
  ledgerTablesAvailable,
  getLedgerAccountBalance,
  getPlatformIzeReserveSnapshot,
  getUserCumulativeWithdrawnGbp,
  calculateWalletTopupFeeBreakdown,
  hashWalletIdempotencyPayload,
  getWalletIdempotentResponse,
  saveWalletIdempotentResponse,
  toFiatMinor,
  onezeAmountToMg,
  mgToOnezeAmount,
  normalizeOnezeCountryTag,
  assertOnezeMintBurnNotHalted,
  getOnezeMintBurnHaltState,
  captureOnezeReconciliationSnapshot,
  loadMintOperationById,
  loadWithdrawalById,
  canTransitionWithdrawalStatus,
  executeReservedWithdrawal,
  recordIzeMint,
  recordIzeBurn,
  recordIzeTransfer,
  evaluateP2pPolicyEligibility,
  appendComplianceAuditSafe,
  resolveDefaultGatewayForChannel,
  createGatewayPaymentIntent,
  assertSettledWalletTopupIntent,
  assertRedeemablePayoutRequest,
  getCommittedBurnIzeInWindow,
  resolvePayoutCorridor,
  resolveOnezeFiatFxRate,
  collectOnezeRiskDashboardMetrics,
}: WalletRouteDependencies) => {
app.post('/wallets/:userId/snapshot', async (request, reply) => {
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const bodySchema = z.object({
    balanceGbp: z.number().nonnegative(),
    availableGbp: z.number().nonnegative(),
    pendingGbp: z.number().nonnegative().default(0),
    currency: z.string().length(3).default('GBP'),
  });

  const { userId } = paramsSchema.parse(request.params);
  resolveAuthenticatedUserId(request, userId);
  const payload = bodySchema.parse(request.body);
  await ensureUserExists(userId);

  const aad = `wallet-snapshot:${userId}`;
  const encrypted = await encryptJsonPayload(
    'wallet',
    {
      userId,
      balanceGbp: payload.balanceGbp,
      availableGbp: payload.availableGbp,
      pendingGbp: payload.pendingGbp,
      currency: payload.currency,
      updatedAt: new Date().toISOString(),
    },
    aad
  );

  const result = await db.query<{ id: number; created_at: string }>(
    `
      INSERT INTO wallet_secure_snapshots (user_id, ciphertext, key_version)
      VALUES ($1, $2, $3)
      RETURNING id, created_at
    `,
    [userId, encrypted.ciphertext, encrypted.keyVersion]
  );

  reply.code(201);
  return {
    ok: true,
    id: result.rows[0].id,
    createdAt: result.rows[0].created_at,
  };
});

// â”€â”€ Seller wallet: pending vs available balance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns the seller's pending balance (escrow not yet released) and
// available balance (released, ready for payout), with a per-order
// breakdown of pending items and their scheduled release times.
app.get('/users/:userId/wallet/balances', async (request, reply) => {
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const { userId } = paramsSchema.parse(request.params);
  resolveAuthenticatedUserId(request, userId);

  if (!(await paymentTablesAvailable(db)) || !(await ledgerTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: 'Payment settlement or ledger tables are unavailable. Run migrations first.',
    };
  }

  // Available balance: sum of seller_payable credits minus debits (payouts,
  // reserve holds). This is what the seller can withdraw.
  const availableResult = await db.query<{ available_gbp: string }>(
    `
      SELECT COALESCE(SUM(
        CASE WHEN direction = 'credit' THEN amount_gbp ELSE -amount_gbp END
      ), 0)::text AS available_gbp
      FROM ledger_entries
      WHERE account_id = (
        SELECT id FROM ledger_accounts
        WHERE owner_type = 'user' AND owner_id = $1 AND account_code = 'seller_payable'
        LIMIT 1
      )
    `,
    [userId]
  );
  const availableGbp = Number(availableResult.rows[0]?.available_gbp ?? '0');

  // Pending balance: orders that are paid/shipped but not yet delivered,
  // or delivered but within the buyer-protection hold window.
  const pendingOrders = await db.query<{
    id: string;
    listing_title: string | null;
    subtotal_gbp: string;
    status: string;
    delivered_at: string | null;
    escrow_release_scheduled_at: string | null;
    escrow_released_at: string | null;
  }>(
    `
      SELECT
        o.id,
        l.title AS listing_title,
        o.subtotal_gbp::text,
        o.status,
        o.delivered_at::text,
        o.escrow_release_scheduled_at::text,
        o.escrow_released_at::text
      FROM orders o
      LEFT JOIN listings l ON l.id = o.listing_id
      WHERE o.seller_id = $1
        AND o.status IN ('paid', 'shipped', 'delivered')
        AND o.escrow_released_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM ledger_entries le
          WHERE le.source_id = o.id
            AND le.line_type = 'seller_payable_release'
            AND le.direction = 'credit'
        )
      ORDER BY
        COALESCE(o.escrow_release_scheduled_at, o.delivered_at, o.created_at) ASC
      LIMIT 50
    `,
    [userId]
  );

  const pendingGbp = pendingOrders.rows.reduce(
    (sum, row) => sum + Number(row.subtotal_gbp),
    0
  );

  // Reserve holds: amounts held in rolling reserve, not yet released.
  const reserveResult = await db.query<{ held_gbp: string }>(
    `
      SELECT COALESCE(SUM(held_amount_gbp), 0)::text AS held_gbp
      FROM payout_reserve_holds
      WHERE user_id = $1 AND released_at IS NULL
    `,
    [userId]
  );
  const heldInReserveGbp = Number(reserveResult.rows[0]?.held_gbp ?? '0');

  return {
    ok: true,
    balances: {
      availableGbp: roundTo(Math.max(0, availableGbp), 2),
      pendingGbp: roundTo(pendingGbp, 2),
      heldInReserveGbp: roundTo(heldInReserveGbp, 2),
    },
    pendingBreakdown: pendingOrders.rows.map((row) => ({
      orderId: row.id,
      listingTitle: row.listing_title,
      amountGbp: Number(row.subtotal_gbp),
      orderStatus: row.status,
      deliveredAt: row.delivered_at,
      releaseScheduledAt: row.escrow_release_scheduled_at,
    })),
  };
});

app.get('/wallets/:userId/snapshot', async (request, reply) => {
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const { userId } = paramsSchema.parse(request.params);
  resolveAuthenticatedUserId(request, userId);

  const result = await db.query<{
    id: number;
    ciphertext: string;
    key_version: number;
    created_at: string;
  }>(
    `
      SELECT id, ciphertext, key_version, created_at
      FROM wallet_secure_snapshots
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    reply.code(404);
    return {
      ok: false,
      error: 'Wallet snapshot not found',
    };
  }

  const snapshot = await decryptJsonPayload<{
    userId: string;
    balanceGbp: number;
    availableGbp: number;
    pendingGbp: number;
    currency: string;
    updatedAt?: string;
  }>(row.ciphertext, `wallet-snapshot:${userId}`);

  let payoutSummary = {
    currentPendingWithdrawalGbp: 0,
    cumulativeWithdrawnGbp: 0,
  };

  if (await ledgerTablesAvailable(db)) {
    const [currentPendingWithdrawalGbp, cumulativeWithdrawnGbp] = await Promise.all([
      getLedgerAccountBalance(db, 'user', userId, 'withdrawal_pending'),
      getUserCumulativeWithdrawnGbp(db, userId),
    ]);

    payoutSummary = {
      currentPendingWithdrawalGbp,
      cumulativeWithdrawnGbp,
    };
  }

  return {
    ok: true,
    keyVersion: row.key_version,
    createdAt: row.created_at,
    snapshot,
    payoutSummary,
  };
});

app.get('/oracle/gold/latest', async (_request, reply) => {
  reply.code(410);
  return {
    ok: false,
    error: 'Gold oracle endpoint has been decommissioned for 1ze controlled pricing.',
    code: 'GOLD_ORACLE_DECOMMISSIONED',
  };
});

app.post('/oracle/gold/override', async (_request, reply) => {
  reply.code(410);
  return {
    ok: false,
    error: 'Gold rate overrides are disabled. Use /update-anchor and /update-pricing controls instead.',
    code: 'GOLD_ORACLE_DECOMMISSIONED',
  };
});

app.get('/price', async (request, reply) => {
  const querySchema = z.object({
    country: z.string().min(2).max(3).default('IN'),
  });

  const payload = querySchema.parse(request.query);

  if (!(await onezePricingTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze controlled pricing tables are unavailable. Run migrations first.',
    };
  }

  try {
    const quote = await resolveCountryPricingQuote(db, payload.country);
    return {
      ok: true,
      quote: {
        country: quote.countryCode,
        currency: quote.currency,
        buyPrice: quote.totalCost,
        sellPrice: quote.netRedemption,
        crossBorderPrice: quote.netRedemption,
        loadFeeBps: quote.loadFeeBps,
        withdrawFeeBps: quote.withdrawFeeBps,
        source: quote.source,
      },
    };
  } catch (error) {
    request.log.error({ err: error, payload }, 'Failed to resolve controlled 1ze price');
    reply.code(404);
    return {
      ok: false,
      error: 'Unable to resolve 1ze price for requested country',
    };
  }
});

app.get('/wallet/1ze/quote', async (request, reply) => {
  const querySchema = z.object({
    country: z.string().min(2).max(3).optional(),
    originCountry: z.string().min(2).max(3).optional(),
    redeemCountry: z.string().min(2).max(3).optional(),
    fiatCurrency: z.string().length(3).default('GBP'),
    fiatAmount: z.coerce.number().positive().optional(),
    izeAmount: z.coerce.number().positive().optional(),
  });

  const payload = querySchema.parse(request.query);
  const providedCount = Number(payload.fiatAmount !== undefined) + Number(payload.izeAmount !== undefined);
  if (providedCount !== 1) {
    reply.code(400);
    return {
      ok: false,
      error: 'Provide exactly one of fiatAmount or izeAmount for quote resolution',
    };
  }

  if (!(await onezeTablesAvailable(db)) || !(await onezePricingTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze controlled pricing tables are unavailable. Run migrations first.',
    };
  }

  try {
    const direction = payload.fiatAmount !== undefined ? 'mint' : 'burn';
    const fiatCurrency = payload.fiatCurrency.toUpperCase();
    const countryQuote = payload.country
      ? await resolveCountryPricingQuote(db, payload.country)
      : await resolveCountryPricingQuoteByCurrency(db, fiatCurrency);

    let fiatAmount: number;
    let izeAmount: number;
    let netFiatAmount: number;
    let platformFeeAmount = 0;
    let platformFeeRate = 0;
    let effectiveRate = countryQuote.principalAmount;
    let effectiveRateMode: 'load' | 'withdraw' | 'cross_border_withdraw' = 'load';

    if (direction === 'mint') {
      const feeBreakdown = calculateWalletTopupFeeBreakdown(payload.fiatAmount ?? 0);
      fiatAmount = feeBreakdown.grossFiatAmount;
      netFiatAmount = feeBreakdown.netFiatAmount;
      platformFeeAmount = feeBreakdown.platformFeeAmount;
      platformFeeRate = feeBreakdown.platformFeeRate;

      if (!Number.isFinite(netFiatAmount) || netFiatAmount <= 0) {
        throw createApiError('IZE_MINT_INVALID', 'Top-up amount is too low after platform fee');
      }

      effectiveRate = fiatCurrency === 'GBP' ? 1 : countryQuote.totalCost;
      effectiveRateMode = 'load';
      izeAmount = Number((netFiatAmount / effectiveRate).toFixed(6));
    } else {
      const isCrossBorder =
        Boolean(payload.originCountry)
        && Boolean(payload.redeemCountry)
        && payload.originCountry?.toUpperCase() !== payload.redeemCountry?.toUpperCase();

      effectiveRate = fiatCurrency === 'GBP'
        ? 1
        : isCrossBorder ? countryQuote.netRedemption : countryQuote.netRedemption;
      effectiveRateMode = isCrossBorder ? 'cross_border_withdraw' : 'withdraw';
      fiatAmount = Number(((payload.izeAmount ?? 0) * effectiveRate).toFixed(6));
      netFiatAmount = fiatAmount;
      izeAmount = Number((payload.izeAmount ?? 0).toFixed(6));
    }

    return {
      ok: true,
      quote: {
        direction,
        country: countryQuote.countryCode,
        fiatCurrency,
        fiatAmount,
        netFiatAmount,
        izeAmount,
        platformFeeRate,
        platformFeeAmount,
        ratePerGram: effectiveRate,
        rateSource: fiatCurrency === 'GBP'
          ? 'fixed_par:GBP:1ZE'
          : `internal_pricing:${countryQuote.countryCode}:${effectiveRateMode}`,
        buyPrice: countryQuote.totalCost,
        sellPrice: countryQuote.netRedemption,
        crossBorderPrice: countryQuote.netRedemption,
        money: moneyFromMinor(fiatCurrency, String(toFiatMinor(fiatAmount, fiatCurrency))),
        assetAmount: {
          asset: '1ZE',
          baseUnitAmount: String(onezeAmountToMg(izeAmount)),
          baseUnit: 'mg',
          scale: 3,
        },
      },
    };
  } catch (error) {
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, payload }, 'Failed to resolve 1ze quote');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to resolve 1ze quote',
    };
  }
});

app.get('/auctions/1ze-rates', async (request, reply) => {
  try {
    if (!(await onezeTablesAvailable(db)) || !(await onezePricingTablesAvailable(db))) {
      reply.code(503);
      return {
        ok: false,
        error: '1ze controlled pricing tables are unavailable.',
      };
    }

    const quotes = await listCountryPricingQuotes(db);
    const anchor = await getOnezeAnchorConfig(db);

    const rates: Record<string, {
      rate: number;
      source: string;
      updatedAt: string;
      settlementSupported: boolean;
    }> = {};

    for (const quote of quotes) {
      rates[quote.currency] = {
        rate: quote.netRedemption,
        source: quote.source,
        updatedAt: quote.updatedAt,
        settlementSupported: true,
      };
    }

    return {
      ok: true,
      anchorCurrency: anchor.anchorCurrency,
      anchorValue: anchor.anchorValue,
      rates,
      source: 'internal_pricing',
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    request.log.error({ err: error }, 'Failed to resolve 1ze display rates');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to resolve 1ze display rates',
    };
  }
});

app.get('/wallet/1ze/fx-quote', async (request, reply) => {
  const querySchema = z.object({
    fromCurrency: z.string().length(3),
    toCurrency: z.string().length(3),
    amount: z.coerce.number().positive(),
  });

  const payload = querySchema.parse(request.query);

  if (!(await onezePricingTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze controlled pricing tables are unavailable. Run migrations first.',
    };
  }

  const fromCurrency = payload.fromCurrency.toUpperCase();
  const toCurrency = payload.toCurrency.toUpperCase();

  try {
    const fx = await resolveInternalFxRate(db, fromCurrency, toCurrency);
    const convertedAmount = Number((payload.amount * fx.rate).toFixed(6));

    return {
      ok: true,
      quote: {
        fromCurrency,
        toCurrency,
        inputAmount: Number(payload.amount.toFixed(6)),
        fxRate: fx.rate,
        convertedAmount,
        source: fx.source,
        usedInverse: fx.usedInverse,
      },
    };
  } catch (error) {
    request.log.error({ err: error, payload }, 'Failed to resolve 1ze FX quote');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to resolve FX quote',
    };
  }
});

app.post('/update-pricing', async (request, reply) => {
  const bodySchema = z.object({
    country: z.string().min(2).max(3),
    currency: z.string().length(3),
    loadFeeBps: z.number().int(),
    withdrawFeeBps: z.number().int(),
    fxFeeBps: z.number().int(),
    withdrawalLockHours: z.number().int().min(0).max(336).optional(),
    dailyRedeemLimitIze: z.number().positive().optional(),
    weeklyRedeemLimitIze: z.number().positive().optional(),
    isActive: z.boolean().optional(),
    reason: z.string().max(240).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  try {
    const operatorToken = request.headers['x-platform-operator-token'] as string | undefined;
    assertOnezeOperatorToken(operatorToken);
  } catch {
    reply.code(401);
    return {
      ok: false,
      error: 'Missing or invalid operator token',
    };
  }

  if (!(await onezePricingTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze controlled pricing tables are unavailable. Run migrations first.',
    };
  }

  const payload = bodySchema.parse(request.body ?? {});

  try {
    validatePricingProfileInput({
      loadFeeBps: payload.loadFeeBps,
      withdrawFeeBps: payload.withdrawFeeBps,
      fxFeeBps: payload.fxFeeBps,
    });
  } catch (error) {
    reply.code(400);
    return {
      ok: false,
      error: (error as Error).message,
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const profile = await upsertCountryPricingProfile(client, {
      countryCode: payload.country,
      currency: payload.currency,
      loadFeeBps: payload.loadFeeBps,
      withdrawFeeBps: payload.withdrawFeeBps,
      fxFeeBps: payload.fxFeeBps,
      withdrawalLockHours: payload.withdrawalLockHours,
      dailyRedeemLimitIze: payload.dailyRedeemLimitIze,
      weeklyRedeemLimitIze: payload.weeklyRedeemLimitIze,
      isActive: payload.isActive,
      metadata: {
        ...(payload.metadata ?? {}),
        reason: payload.reason ?? null,
        updatedBy: request.authUser?.userId ?? 'operator',
      },
    });

    const quotes = await listCountryPricingQuotes(client);

    const quote = quotes.find((entry) => entry.countryCode === profile.countryCode)
      ?? await resolveCountryPricingQuote(client, profile.countryCode);

    await client.query('COMMIT');
    return {
      ok: true,
      profile,
      quote,
      matrixSize: quotes.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, payload }, 'Failed to update country pricing profile');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to update pricing profile',
    };
  } finally {
    client.release();
  }
});

app.post('/update-anchor', async (request, reply) => {
  const bodySchema = z.object({
    anchorValueInInr: z.number().positive(),
    reason: z.string().max(240).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  try {
    const operatorToken = request.headers['x-platform-operator-token'] as string | undefined;
    assertOnezeOperatorToken(operatorToken);
  } catch {
    reply.code(401);
    return {
      ok: false,
      error: 'Missing or invalid operator token',
    };
  }

  if (!(await onezePricingTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze controlled pricing tables are unavailable. Run migrations first.',
    };
  }

  const payload = bodySchema.parse(request.body ?? {});
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const anchor = await setOnezeAnchorConfig(client, {
      anchorValue: payload.anchorValueInInr,
      notes: payload.reason,
      metadata: {
        ...(payload.metadata ?? {}),
        updatedBy: request.authUser?.userId ?? 'operator',
      },
    });

    const quotes = await listCountryPricingQuotes(client);

    await client.query('COMMIT');
    return {
      ok: true,
      anchor,
      matrixSize: quotes.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, payload }, 'Failed to update 1ze anchor');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to update 1ze anchor',
    };
  } finally {
    client.release();
  }
});

app.post('/admin/1ze/fx-rate', async (request, reply) => {
  const bodySchema = z.object({
    baseCurrency: z.string().length(3),
    quoteCurrency: z.string().length(3),
    rate: z.number().positive(),
    reason: z.string().max(240).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  try {
    const operatorToken = request.headers['x-platform-operator-token'] as string | undefined;
    assertOnezeOperatorToken(operatorToken);
  } catch {
    reply.code(401);
    return {
      ok: false,
      error: 'Missing or invalid operator token',
    };
  }

  if (!(await onezePricingTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze controlled pricing tables are unavailable. Run migrations first.',
    };
  }

  const payload = bodySchema.parse(request.body ?? {});
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await setInternalFxRate(client, {
      baseCurrency: payload.baseCurrency,
      quoteCurrency: payload.quoteCurrency,
      rate: payload.rate,
      source: 'operator',
      metadata: {
        ...(payload.metadata ?? {}),
        reason: payload.reason ?? null,
        updatedBy: request.authUser?.userId ?? 'operator',
      },
    });

    const quotes = await listCountryPricingQuotes(client);

    await client.query('COMMIT');
    return {
      ok: true,
      fx: {
        baseCurrency: payload.baseCurrency.toUpperCase(),
        quoteCurrency: payload.quoteCurrency.toUpperCase(),
        rate: Number(payload.rate.toFixed(8)),
      },
      matrixSize: quotes.length,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, payload }, 'Failed to update internal FX rate');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to update internal FX rate',
    };
  } finally {
    client.release();
  }
});

app.post('/adjust-spread', async (request, reply) => {
  const bodySchema = z.object({
    country: z.string().min(2).max(3),
    loadFeeBps: z.number().int().optional(),
    withdrawFeeBps: z.number().int().optional(),
    fxFeeBps: z.number().int().optional(),
    reason: z.string().max(240).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  try {
    const operatorToken = request.headers['x-platform-operator-token'] as string | undefined;
    assertOnezeOperatorToken(operatorToken);
  } catch {
    reply.code(401);
    return {
      ok: false,
      error: 'Missing or invalid operator token',
    };
  }

  if (!(await onezePricingTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze controlled pricing tables are unavailable. Run migrations first.',
    };
  }

  const payload = bodySchema.parse(request.body ?? {});

  if (
    payload.loadFeeBps === undefined
    && payload.withdrawFeeBps === undefined
    && payload.fxFeeBps === undefined
  ) {
    reply.code(400);
    return {
      ok: false,
      error: 'Provide at least one spread field to adjust',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const current = await getCountryPricingProfile(client, payload.country);
    if (!current) {
      reply.code(404);
      await client.query('ROLLBACK');
      return {
        ok: false,
        error: 'Country pricing profile not found',
      };
    }

    const nextLoadFeeBps = payload.loadFeeBps ?? current.loadFeeBps;
    const nextWithdrawFeeBps = payload.withdrawFeeBps ?? current.withdrawFeeBps;
    const nextFxFeeBps = payload.fxFeeBps ?? current.fxFeeBps;

    try {
      validatePricingProfileInput({
        loadFeeBps: nextLoadFeeBps,
        withdrawFeeBps: nextWithdrawFeeBps,
      });
    } catch (error) {
      throw createApiError('PRICING_PROFILE_INVALID', (error as Error).message);
    }

    const profile = await upsertCountryPricingProfile(client, {
      countryCode: current.countryCode,
      currency: current.currency,
      loadFeeBps: nextLoadFeeBps,
      withdrawFeeBps: nextWithdrawFeeBps,
      fxFeeBps: nextFxFeeBps,
      withdrawalLockHours: current.withdrawalLockHours,
      dailyRedeemLimitIze: current.dailyRedeemLimitIze,
      weeklyRedeemLimitIze: current.weeklyRedeemLimitIze,
      isActive: current.isActive,
      metadata: {
        ...(payload.metadata ?? {}),
        reason: payload.reason ?? null,
        updatedBy: request.authUser?.userId ?? 'operator',
      },
    });

    const quotes = await listCountryPricingQuotes(client);

    const quote = quotes.find((entry) => entry.countryCode === profile.countryCode)
      ?? await resolveCountryPricingQuote(client, profile.countryCode);

    await client.query('COMMIT');
    return {
      ok: true,
      profile,
      quote,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, payload }, 'Failed to adjust country spread');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to adjust pricing spread',
    };
  } finally {
    client.release();
  }
});

app.get('/admin/1ze/pricing-health', async (request, reply) => {
  try {
    const operatorToken = request.headers['x-platform-operator-token'] as string | undefined;
    assertOnezeOperatorToken(operatorToken);
  } catch {
    reply.code(401);
    return {
      ok: false,
      error: 'Missing or invalid operator token',
    };
  }

  if (!(await onezePricingTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze controlled pricing tables are unavailable. Run migrations first.',
    };
  }

  try {
    const quotes = await listCountryPricingQuotes(db);

    return {
      ok: true,
      matrixSize: quotes.length,
      quotes,
    };
  } catch (error) {
    request.log.error({ err: error }, 'Failed to evaluate 1ze pricing health');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to evaluate pricing health',
    };
  }
});

app.get('/admin/1ze/risk-dashboard', async (request, reply) => {
  const querySchema = z.object({
    lookbackHours: z.coerce.number().int().min(1).max(24 * 30).default(24),
  });

  try {
    const operatorToken = request.headers['x-platform-operator-token'] as string | undefined;
    assertOnezeOperatorToken(operatorToken);
  } catch {
    reply.code(401);
    return {
      ok: false,
      error: 'Missing or invalid operator token',
    };
  }

  if (
    !(await onezePricingTablesAvailable(db))
    || !(await onezeArchitectureTablesAvailable(db))
    || !(await onezeTablesAvailable(db))
  ) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze risk dashboard dependencies are unavailable. Run migrations first.',
    };
  }

  const payload = querySchema.parse(request.query);

  try {
    const metrics = await collectOnezeRiskDashboardMetrics(db, payload.lookbackHours);

    return {
      ok: true,
      dashboard: {
        evaluatedAt: metrics.evaluatedAt,
        lookbackHours: metrics.lookbackHours,
        countryFlows: metrics.countryFlows,
        totals: metrics.totals,
        redemption: metrics.redemption,
        crossBorder: metrics.crossBorder,
        liquidity: {
          pendingWithdrawalMg: metrics.liquidity.pendingWithdrawalMg,
          operationalLiquidityMg: metrics.liquidity.operationalLiquidityMg,
          stressIndex: metrics.liquidity.stressIndex,
          stressLevel: metrics.liquidity.stressLevel,
        },
        reservePolicy: metrics.reservePolicy,
        exposure: metrics.exposure,
      },
    };
  } catch (error) {
    request.log.error({ err: error, payload }, 'Failed to evaluate 1ze risk dashboard');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to evaluate 1ze risk dashboard',
    };
  }
});

app.post('/wallet/1ze/mint/quote', async (request, reply) => {
  const bodySchema = z.object({
    userId: z.string().min(2).optional(),
    fiatAmount: z.number().positive(),
    fiatCurrency: z.string().length(3).default('INR'),
    gatewayId: z.string().min(2).max(80).optional(),
    instrumentId: z.coerce.number().int().positive().optional(),
    returnUrl: z.string().url().optional(),
    webhookUrl: z.string().url().optional(),
    forceRefresh: z.coerce.boolean().default(false),
    idempotencyKey: z.string().min(8).max(140).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});
  const actorUserId = resolveAuthenticatedUserId(request, payload.userId);

  if (!(await onezeMintFlowTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze mint flow tables are unavailable. Run migrations first.',
    };
  }

  if (!(await paymentTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: 'Payment settlement tables are unavailable. Run migrations first.',
    };
  }

  if (!(await onezePricingTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze controlled pricing tables are unavailable. Run migrations first.',
    };
  }

  try {
    await assertOnezeMintBurnNotHalted();
  } catch (error) {
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    throw error;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureUserExists(actorUserId);

    const fiatCurrency = payload.fiatCurrency.toUpperCase();

    // Compliance gate: verify the user is permitted to issue (mint) 1ZE.
    const issueCapability = await evaluateWalletCapability(client, actorUserId, 'issue', {
      amountUsd: payload.fiatAmount,
      currency: fiatCurrency,
    });
    if (!issueCapability.allowed) {
      throw createApiError(issueCapability.code, issueCapability.reason ?? 'Wallet capability check failed', {
        capability: 'issue',
        restrictions: issueCapability.restrictions,
      });
    }

    const topupMoney = moneyFromMinor(
      fiatCurrency,
      String(toFiatMinor(payload.fiatAmount, fiatCurrency))
    );
    const feeAllocation = allocateMoneyByBasisPoints(topupMoney, 100);
    const feeBreakdown = {
      grossFiatAmount: Number(moneyToMajorDecimal(feeAllocation.gross)),
      platformFeeRate: WALLET_TOPUP_PLATFORM_FEE_RATE,
      platformFeeAmount: feeAllocation.fee
        ? Number(moneyToMajorDecimal(feeAllocation.fee))
        : 0,
      netFiatAmount: Number(moneyToMajorDecimal(feeAllocation.net)),
    };
    if (feeBreakdown.netFiatAmount <= 0) {
      throw createApiError('IZE_MINT_INVALID', 'Top-up amount is too low after platform fee');
    }

    const idempotencyRequestHash = payload.idempotencyKey
      ? hashWalletIdempotencyPayload({
          userId: actorUserId,
          fiatAmount: Number(payload.fiatAmount.toFixed(6)),
          fiatCurrency,
          gatewayId: payload.gatewayId ?? null,
          instrumentId: payload.instrumentId ?? null,
          metadata: payload.metadata ?? {},
        })
      : null;

    if (payload.idempotencyKey && idempotencyRequestHash) {
      const idempotentResponse = await getWalletIdempotentResponse(client, {
        userId: actorUserId,
        operation: 'mint_quote',
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
      });

      if (idempotentResponse) {
        await client.query('COMMIT');
        return idempotentResponse;
      }
    }

    const pricingQuote = await resolveCountryPricingQuoteByCurrency(client, fiatCurrency);
    const mintUnitPrice = fiatCurrency === 'GBP' ? 1 : pricingQuote.totalCost;

    const amountMg = onezeAmountToMg(
      Number((feeBreakdown.netFiatAmount / mintUnitPrice).toFixed(6))
    );

    const gatewayId = payload.gatewayId ?? resolveDefaultGatewayForChannel('wallet_topup');
    const gateway = await client.query<{ id: string }>(
      'SELECT id FROM payment_gateways WHERE id = $1 AND is_active = TRUE LIMIT 1',
      [gatewayId]
    );

    if (!gateway.rowCount) {
      throw createApiError('PAYMENT_GATEWAY_INVALID', 'Gateway is not available for wallet top-up minting', {
        gatewayId,
      });
    }

    if (payload.instrumentId) {
      const instrument = await client.query<{ id: number }>(
        `
          SELECT id
          FROM payment_instruments
          WHERE id = $1 AND user_id = $2
          LIMIT 1
        `,
        [payload.instrumentId, actorUserId]
      );

      if (!instrument.rowCount) {
        throw createApiError('PAYMENT_INSTRUMENT_INVALID', 'Instrument does not belong to this user');
      }
    }

    const mintOperationId = createRuntimeId('mintop');
    const rateLockedAt = new Date();
    const rateExpiresAt = new Date(rateLockedAt.getTime() + config.onezeMintQuoteTtlSeconds * 1_000);
    const quoteHash = computeRequestHash({
      version: 'wallet-topup-quote-v1',
      userId: actorUserId,
      sourceMoney: topupMoney,
      platformFeeMinor: feeAllocation.fee?.minorAmount ?? '0',
      netFiatMinor: feeAllocation.net.minorAmount,
      targetAsset: '1ZE',
      targetBaseUnit: 'mg',
      targetBaseUnitAmount: String(amountMg),
      ratePerGram: String(mintUnitPrice),
      rateSource:
        fiatCurrency === 'GBP'
          ? 'fixed_par:GBP:1ZE'
          : `internal_pricing:${pricingQuote.countryCode}:buy`,
      expiresAt: rateExpiresAt.toISOString(),
    });

    await client.query(
      `
        INSERT INTO mint_operations (
          id,
          user_id,
          state,
          fiat_amount_minor,
          fiat_currency,
          net_fiat_amount_minor,
          platform_fee_minor,
          ize_amount_mg,
          rate_per_gram,
          rate_source,
          rate_locked_at,
          rate_expires_at,
          payment_intent_id,
          metadata
        )
        VALUES (
          $1,
          $2,
          'INITIATED',
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          NULL,
          $12::jsonb
        )
      `,
      [
        mintOperationId,
        actorUserId,
        toFiatMinor(feeBreakdown.grossFiatAmount, fiatCurrency),
        fiatCurrency,
        toFiatMinor(feeBreakdown.netFiatAmount, fiatCurrency),
        toFiatMinor(feeBreakdown.platformFeeAmount, fiatCurrency),
        amountMg,
        mintUnitPrice,
        fiatCurrency === 'GBP' ? 'fixed_par:GBP:1ZE' : `internal_pricing:${pricingQuote.countryCode}:buy`,
        rateLockedAt.toISOString(),
        rateExpiresAt.toISOString(),
        toJsonString({
          quoteRequestedAt: rateLockedAt.toISOString(),
          quoteValidForSeconds: config.onezeMintQuoteTtlSeconds,
          feeBreakdown,
          pricingCountry: pricingQuote.countryCode,
          pricingCurrency: pricingQuote.currency,
          pricingModel: 'controlled_anchor',
          quoteHash,
          sourceMoney: topupMoney,
          targetAssetAmount: {
            asset: '1ZE',
            baseUnitAmount: String(amountMg),
            baseUnit: 'mg',
            scale: 3,
          },
          ...(payload.metadata ?? {}),
        }),
      ]
    );

    let stripeCustomerId: string | null = null;
    let stripePaymentMethodId: string | null = null;
    if (gatewayId === 'stripe_americas') {
      if (!stripe) {
        throw createApiError(
          'PAYMENT_PROVIDER_UNAVAILABLE',
          'Stripe payment collection is not configured'
        );
      }
      const customer = await getOrCreateStripeCustomer({
        db: client,
        stripe,
        userId: actorUserId,
      });
      stripeCustomerId = customer.customerId;
      if (payload.instrumentId) {
        const selectedMethod = await resolveActiveStripeMethod({
          db: client,
          userId: actorUserId,
          projectionId: payload.instrumentId,
        });
        if (!selectedMethod || selectedMethod.customerId !== stripeCustomerId) {
          throw createApiError(
            'PAYMENT_METHOD_RECOLLECTION_REQUIRED',
            'The selected payment method must be added again before top-up'
          );
        }
        stripePaymentMethodId = selectedMethod.paymentMethodId;
      }
    }

    const paymentIntentId = createRuntimeId('pi');
    const gatewayIntent = await createGatewayPaymentIntent({
      gatewayId,
      intentId: paymentIntentId,
      channel: 'wallet_topup',
      money: topupMoney,
      stripeCustomerId,
      stripePaymentMethodId,
      returnUrl: payload.returnUrl,
      webhookUrl: payload.webhookUrl,
      metadata: {
        userId: actorUserId,
        mintOperationId,
        quoteHash,
        ...(payload.metadata ?? {}),
      },
    });

    const paymentIntentResult = await client.query<PaymentIntentRow>(
      `
        INSERT INTO payment_intents (
          id,
          user_id,
          gateway_id,
          channel,
          order_id,
          coOwn_order_id,
          instrument_id,
          amount_gbp,
          amount_currency,
          amount_minor,
          currency_exponent,
          money_registry_version,
          provider_amount,
          provider_amount_unit,
          money_conversion_trace,
          status,
          provider_intent_ref,
          client_secret,
          provider_status,
          next_action_url,
          sca_expires_at,
          idempotency_key,
          request_hash,
          metadata
        )
        VALUES (
          $1, $2, $3, 'wallet_topup', NULL, NULL, $4, $5, $6,
          $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17, $18,
          $19, $20, $21::jsonb
        )
        RETURNING
          id,
          user_id,
          gateway_id,
          channel,
          order_id,
          coOwn_order_id,
          instrument_id,
          amount_gbp,
          amount_currency,
          amount_minor,
          currency_exponent,
          money_registry_version,
          provider_amount,
          provider_amount_unit,
          money_conversion_trace,
          money_quarantined,
          status,
          provider_intent_ref,
          client_secret,
          provider_status,
          next_action_url,
          sca_expires_at,
          settled_at,
          failure_code,
          failure_message,
          created_at,
          updated_at
      `,
      [
        paymentIntentId,
        actorUserId,
        gatewayId,
        payload.instrumentId ?? null,
        moneyToMajorDecimal(topupMoney),
        topupMoney.currency,
        topupMoney.minorAmount,
        topupMoney.exponent,
        topupMoney.registryVersion,
        gatewayIntent.providerAmount,
        gatewayIntent.providerAmountUnit,
        toJsonString(gatewayIntent.conversionTrace),
        gatewayIntent.initialStatus,
        gatewayIntent.providerIntentRef,
        gatewayIntent.clientSecret,
        gatewayIntent.providerStatus ?? null,
        gatewayIntent.nextActionUrl ?? null,
        gatewayIntent.scaExpiresAt ?? null,
        payload.idempotencyKey
          ? `wallet_mint:${actorUserId}:${payload.idempotencyKey}`
          : null,
        idempotencyRequestHash ?? quoteHash,
        toJsonString({
          mintOperationId,
          quoteHash,
          canonicalMoney: topupMoney,
          targetAssetAmount: {
            asset: '1ZE',
            baseUnitAmount: String(amountMg),
            baseUnit: 'mg',
            scale: 3,
          },
          quoteRateSource: `internal_pricing:${pricingQuote.countryCode}:buy`,
          ...(payload.metadata ?? {}),
        }),
      ]
    );

    const operationResult = await client.query<MintOperationRow>(
      `
        UPDATE mint_operations
        SET
          state = 'PAYMENT_PENDING',
          payment_intent_id = $2,
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
          ize_amount_mg::text,
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
        paymentIntentId,
        toJsonString({
          paymentIntentCreatedAt: new Date().toISOString(),
          paymentIntentId,
          gatewayId,
        }),
      ]
    );

    const operation = toMintOperationPayload(operationResult.rows[0]);
    const intent = toPaymentIntentPayload(paymentIntentResult.rows[0]);
    const responsePayload: Record<string, unknown> = {
      ok: true,
      operation,
      intent,
      quote: {
        validForSeconds: config.onezeMintQuoteTtlSeconds,
        expiresAt: operation.rateExpiresAt,
        quoteHash,
        sourceMoney: topupMoney,
        targetAssetAmount: {
          asset: '1ZE',
          baseUnitAmount: String(amountMg),
          baseUnit: 'mg',
          scale: 3,
        },
      },
    };

    if (payload.idempotencyKey && idempotencyRequestHash) {
      await saveWalletIdempotentResponse(client, {
        userId: actorUserId,
        operation: 'mint_quote',
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
        responsePayload,
      });
    }

    await client.query('COMMIT');
    reply.code(201);
    return responsePayload;
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, userId: actorUserId }, 'Failed to create 1ze mint quote operation');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to create 1ze mint quote operation',
    };
  } finally {
    client.release();
  }
});

app.get('/wallet/1ze/mint/:operationId', async (request, reply) => {
  const paramsSchema = z.object({
    operationId: z.string().min(3),
  });

  const { operationId } = paramsSchema.parse(request.params);

  if (!(await onezeMintFlowTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze mint flow tables are unavailable. Run migrations first.',
    };
  }

  const operationResult = await db.query<MintOperationRow>(
    `
      SELECT
        id,
        user_id,
        state,
        fiat_amount_minor::text,
        fiat_currency,
        net_fiat_amount_minor::text,
        platform_fee_minor::text,
        ize_amount_mg::text,
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
      WHERE id = $1
      LIMIT 1
    `,
    [operationId]
  );

  const row = operationResult.rows[0];
  if (!row) {
    reply.code(404);
    return {
      ok: false,
      error: 'Mint operation not found',
    };
  }

  if (!request.authUser || (request.authUser.role !== 'admin' && request.authUser.userId !== row.user_id)) {
    reply.code(403);
    return {
      ok: false,
      error: 'Forbidden: mint operation access denied',
    };
  }

  let intent: ReturnType<typeof toPaymentIntentPayload> | null = null;
  if (row.payment_intent_id) {
    const intentResult = await db.query<PaymentIntentRow>(
      `
        SELECT
          id,
          user_id,
          gateway_id,
          channel,
          order_id,
          coOwn_order_id,
          instrument_id,
          amount_gbp,
          amount_currency,
          amount_minor,
          currency_exponent,
          money_registry_version,
          provider_amount,
          provider_amount_unit,
          money_conversion_trace,
          money_quarantined,
          status,
          provider_intent_ref,
          client_secret,
          provider_status,
          next_action_url,
          sca_expires_at,
          settled_at,
          failure_code,
          failure_message,
          created_at,
          updated_at
        FROM payment_intents
        WHERE id = $1
        LIMIT 1
      `,
      [row.payment_intent_id]
    );

    if (intentResult.rowCount) {
      intent = toPaymentIntentPayload(intentResult.rows[0]);
    }
  }

  const operation = toMintOperationPayload(row);
  const expiresAtMs = Date.parse(operation.rateExpiresAt);
  const remainingSeconds = Number.isFinite(expiresAtMs)
    ? Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1_000))
    : null;

  return {
    ok: true,
    operation,
    intent,
    quote: {
      expiresInSeconds: remainingSeconds,
      expired: remainingSeconds !== null ? remainingSeconds <= 0 : null,
    },
  };
});

app.post('/ops/oneze/mint/:operationId/retry', async (request, reply) => {
  const securityAdminError = ensureSecurityAdminAccess(request, reply);
  if (securityAdminError) {
    return securityAdminError;
  }

  const paramsSchema = z.object({
    operationId: z.string().min(3),
  });

  const { operationId } = paramsSchema.parse(request.params);

  if (!(await onezeMintFlowTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze mint flow tables are unavailable. Run migrations first.',
    };
  }

  const operation = await loadMintOperationById(db, operationId, {
    forUpdate: false,
  });

  if (!operation) {
    reply.code(404);
    return {
      ok: false,
      error: 'Mint operation not found',
    };
  }

  await enqueueOnezeMintReserveJob({
    mintOperationId: operation.id,
    initiatedBy: request.authUser?.userId ?? 'security_admin',
    reason: 'manual_retry',
  });

  return {
    ok: true,
    enqueued: true,
    operation: toMintOperationPayload(operation),
  };
});

app.post('/wallet/1ze/mint', async (request, reply) => {
  const bodySchema = z.object({
    userId: z.string().min(2).optional(),
    fiatAmount: z.number().positive(),
    fiatCurrency: z.string().length(3).default('GBP'),
    paymentIntentId: z.string().min(4).max(120).optional(),
    idempotencyKey: z.string().min(8).max(140).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});
  const actorUserId = resolveAuthenticatedUserId(request, payload.userId);
  const feeBreakdown = calculateWalletTopupFeeBreakdown(payload.fiatAmount);

  if (!(await onezeTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze money-layer tables are unavailable. Run migrations first.',
    };
  }

  if (!(await onezePricingTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze controlled pricing tables are unavailable. Run migrations first.',
    };
  }

  try {
    await assertOnezeMintBurnNotHalted();
  } catch (error) {
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    throw error;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureUserExists(actorUserId);

    const idempotencyRequestHash = payload.idempotencyKey
      ? hashWalletIdempotencyPayload({
          userId: actorUserId,
          fiatAmount: Number(payload.fiatAmount.toFixed(6)),
          fiatCurrency: payload.fiatCurrency.toUpperCase(),
          paymentIntentId: payload.paymentIntentId ?? null,
          metadata: payload.metadata ?? {},
        })
      : null;

    if (payload.idempotencyKey && idempotencyRequestHash) {
      const idempotentResponse = await getWalletIdempotentResponse(client, {
        userId: actorUserId,
        operation: 'mint',
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
      });

      if (idempotentResponse) {
        await client.query('COMMIT');
        return idempotentResponse;
      }
    }

    if (feeBreakdown.netFiatAmount <= 0) {
      throw createApiError('IZE_MINT_INVALID', 'Top-up amount is too low after platform fee');
    }

    if (config.nodeEnv === 'production' && !payload.paymentIntentId) {
      throw createApiError(
        'IZE_MINT_PAYMENT_REQUIRED',
        'A settled wallet_topup paymentIntentId is required to credit 1ze in production'
      );
    }

    let fundingGatewayId: string | null = null;
    if (payload.paymentIntentId) {
      const settledIntent = await assertSettledWalletTopupIntent(client, {
        paymentIntentId: payload.paymentIntentId,
        userId: actorUserId,
        fiatAmount: feeBreakdown.grossFiatAmount,
        fiatCurrency: payload.fiatCurrency,
      });

      fundingGatewayId = settledIntent.gatewayId;
    }

    const fiatCurrency = payload.fiatCurrency.toUpperCase();
    const pricingQuote = await resolveCountryPricingQuoteByCurrency(client, fiatCurrency);
    const mintUnitPrice = fiatCurrency === 'GBP' ? 1 : pricingQuote.totalCost;
    const izeAmount = Number((feeBreakdown.netFiatAmount / mintUnitPrice).toFixed(6));

    if (!Number.isFinite(izeAmount) || izeAmount <= 0) {
      throw createApiError('IZE_MINT_INVALID', 'Unable to derive a valid 1ze mint amount');
    }

    const operationId = createRuntimeId('ize_mint');
    await recordIzeMint(client, {
      operationId,
      userId: actorUserId,
      fiatAmount: feeBreakdown.netFiatAmount,
      fiatCurrency,
      izeAmount,
      ratePerGram: mintUnitPrice,
      paymentIntentId: payload.paymentIntentId,
      metadata: {
        ...(payload.metadata ?? {}),
        pricingCountry: pricingQuote.countryCode,
        pricingModel: fiatCurrency === 'GBP' ? 'fixed_par' : 'controlled_anchor',
        pricingSource: fiatCurrency === 'GBP'
          ? 'fixed_par:GBP:1ZE'
          : `internal_pricing:${pricingQuote.countryCode}:buy`,
        walletTopup: {
          grossFiatAmount: feeBreakdown.grossFiatAmount,
          netFiatAmount: feeBreakdown.netFiatAmount,
          platformFeeRate: feeBreakdown.platformFeeRate,
          platformFeeAmount: feeBreakdown.platformFeeAmount,
        },
      },
    });

    const architectureEnabled = await onezeArchitectureTablesAvailable(client);
    let architectureWalletId: string | null = null;
    let architectureWalletBalanceMg: number | null = null;

    if (architectureEnabled) {
      const amountMg = onezeAmountToMg(izeAmount);
      const wallet = await ensureWallet(client, actorUserId, fiatCurrency);
      const walletTxId = createRuntimeId('wtx');

      architectureWalletId = wallet.id;
      architectureWalletBalanceMg = await applyWalletLedgerDelta(client, {
        walletId: wallet.id,
        txId: walletTxId,
        asset: '1ZE',
        amount: amountMg,
        kind: 'MINT',
        refType: 'wallet_ize_operation',
        refId: operationId,
        anchorValueInInr: pricingQuote.anchorValueInInr,
        metadata: {
          operationId,
          userId: actorUserId,
          paymentIntentId: payload.paymentIntentId ?? null,
          fiatAmount: feeBreakdown.netFiatAmount,
          fiatCurrency,
          pricingReferenceSource: `internal_pricing:${pricingQuote.countryCode}:buy`,
          ...(payload.metadata ?? {}),
        },
      });

      await creditWalletSegmentBalance(client, {
        wallet,
        txId: walletTxId,
        purchasedCreditMg: amountMg,
        originCountry: normalizeOnezeCountryTag(
          typeof payload.metadata?.originCountry === 'string'
            ? payload.metadata.originCountry
            : null
        ),
        metadata: {
          operationId,
          source: 'wallet_mint',
        },
      });
    }

    const [walletBalanceIze, reserveSnapshot] = await Promise.all([
      getLedgerAccountBalance(client, 'user', actorUserId, 'ize_wallet', 'IZE'),
      getPlatformIzeReserveSnapshot(client),
    ]);

    const responsePayload: Record<string, unknown> = {
      ok: true,
      operation: {
        id: operationId,
        type: 'mint',
        userId: actorUserId,
        fiatAmount: feeBreakdown.netFiatAmount,
        grossFiatAmount: feeBreakdown.grossFiatAmount,
        netFiatAmount: feeBreakdown.netFiatAmount,
        platformFeeRate: feeBreakdown.platformFeeRate,
        platformFeeAmount: feeBreakdown.platformFeeAmount,
        fiatCurrency,
        izeAmount,
        ratePerGram: mintUnitPrice,
        rateSource: `internal_pricing:${pricingQuote.countryCode}:buy`,
        fundingGatewayId,
      },
      balances: {
        userIze: walletBalanceIze,
        outstandingIze: reserveSnapshot.outstandingIze,
        circulatingIze: reserveSnapshot.circulatingIze,
        supplyDeltaIze: reserveSnapshot.supplyDeltaIze,
        supplyParityRatio: reserveSnapshot.supplyParityRatio,
        liquidityBufferIze: reserveSnapshot.liquidityBufferIze,
      },
      architecture: architectureEnabled
        ? {
            walletId: architectureWalletId,
            walletBalanceMg: architectureWalletBalanceMg,
            walletBalanceOneze:
              architectureWalletBalanceMg === null
                ? null
                : mgToOnezeAmount(architectureWalletBalanceMg),
          }
        : null,
    };

    if (payload.idempotencyKey && idempotencyRequestHash) {
      await saveWalletIdempotentResponse(client, {
        userId: actorUserId,
        operation: 'mint',
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
        responsePayload,
      });
    }

    await client.query('COMMIT');
    reply.code(201);
    return responsePayload;
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, userId: actorUserId }, 'Failed to mint 1ze');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to mint 1ze',
    };
  } finally {
    client.release();
  }
});

app.post('/wallet/1ze/burn', async (request, reply) => {
  const bodySchema = z.object({
    userId: z.string().min(2).optional(),
    izeAmount: z.number().positive(),
    fiatCurrency: z.string().length(3).default('GBP'),
    payoutRequestId: z.string().min(4).max(140).optional(),
    idempotencyKey: z.string().min(8).max(140).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});
  const actorUserId = resolveAuthenticatedUserId(request, payload.userId);

  if (!(await onezeTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze money-layer tables are unavailable. Run migrations first.',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureUserExists(actorUserId);

    const idempotencyRequestHash = payload.idempotencyKey
      ? hashWalletIdempotencyPayload({
          userId: actorUserId,
          izeAmount: Number(payload.izeAmount.toFixed(6)),
          fiatCurrency: payload.fiatCurrency.toUpperCase(),
          payoutRequestId: payload.payoutRequestId ?? null,
          metadata: payload.metadata ?? {},
        })
      : null;

    if (payload.idempotencyKey && idempotencyRequestHash) {
      const idempotentResponse = await getWalletIdempotentResponse(client, {
        userId: actorUserId,
        operation: 'burn',
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
      });

      if (idempotentResponse) {
        await client.query('COMMIT');
        return idempotentResponse;
      }
    }

    if (config.nodeEnv === 'production' && !payload.payoutRequestId) {
      throw createApiError(
        'IZE_WITHDRAWAL_PAYOUT_REQUIRED',
        'A requested/processing/paid payoutRequestId is required to settle a sale-proceeds withdrawal in production'
      );
    }

    let payoutGatewayId: string | null = null;
    let payoutStatus: PayoutRequestStatus | null = null;
    let payoutAmountCurrency: string | null = null;
    let payoutAmountGbp: number | null = null;
    if (payload.payoutRequestId) {
      const payout = await assertRedeemablePayoutRequest(client, {
        payoutRequestId: payload.payoutRequestId,
        userId: actorUserId,
      });

      payoutGatewayId = payout.gatewayId;
      payoutStatus = payout.status;
      payoutAmountCurrency = payout.amountCurrency.toUpperCase();
      payoutAmountGbp = payout.amountGbp;
    }

    const fiatCurrency = payload.fiatCurrency.toUpperCase();
    const normalizedIzeAmount = Number(payload.izeAmount.toFixed(6));
    const amountMg = onezeAmountToMg(normalizedIzeAmount);
    const pricingQuote = await resolveCountryPricingQuoteByCurrency(client, fiatCurrency);
    const pricingProfile = await getCountryPricingProfile(client, pricingQuote.countryCode);

    if (!pricingProfile) {
      throw createApiError('PRICING_PROFILE_NOT_FOUND', 'Country pricing profile is unavailable for burn execution', {
        fiatCurrency,
      });
    }

    const redeemCountry = normalizeOnezeCountryTag(
      typeof payload.metadata?.redeemCountry === 'string'
        ? payload.metadata.redeemCountry
        : pricingQuote.countryCode
    );
    const originCountry = normalizeOnezeCountryTag(
      typeof payload.metadata?.originCountry === 'string'
        ? payload.metadata.originCountry
        : redeemCountry
    );
    const isCrossBorder = originCountry !== redeemCountry;
    const redemptionUnitPrice = fiatCurrency === 'GBP'
      ? 1
      : isCrossBorder
        ? pricingQuote.netRedemption
        : pricingQuote.netRedemption;
    const fiatAmount = Number((normalizedIzeAmount * redemptionUnitPrice).toFixed(6));

    // Compliance gate: verify the user is permitted to redeem (burn) 1ZE.
    const redeemCapability = await evaluateWalletCapability(client, actorUserId, 'redeem', {
      amountUsd: fiatAmount,
      currency: fiatCurrency,
    });
    if (!redeemCapability.allowed) {
      throw createApiError(redeemCapability.code, redeemCapability.reason ?? 'Wallet capability check failed', {
        capability: 'redeem',
        restrictions: redeemCapability.restrictions,
      });
    }

    const [dailyBurnedIze, weeklyBurnedIze] = await Promise.all([
      getCommittedBurnIzeInWindow(client, actorUserId, 24),
      getCommittedBurnIzeInWindow(client, actorUserId, 7 * 24),
    ]);

    if (dailyBurnedIze + normalizedIzeAmount > pricingProfile.dailyRedeemLimitIze) {
      throw createApiError('DAILY_REDEEM_LIMIT_EXCEEDED', 'Daily redemption cap exceeded for this country profile', {
        dailyRedeemLimitIze: pricingProfile.dailyRedeemLimitIze,
        dailyBurnedIze,
        requestedIze: normalizedIzeAmount,
      });
    }

    if (weeklyBurnedIze + normalizedIzeAmount > pricingProfile.weeklyRedeemLimitIze) {
      throw createApiError('WEEKLY_REDEEM_LIMIT_EXCEEDED', 'Weekly redemption cap exceeded for this country profile', {
        weeklyRedeemLimitIze: pricingProfile.weeklyRedeemLimitIze,
        weeklyBurnedIze,
        requestedIze: normalizedIzeAmount,
      });
    }

    if (payoutAmountCurrency && payoutAmountCurrency !== fiatCurrency) {
      throw createApiError(
        'PAYOUT_REQUEST_CURRENCY_MISMATCH',
        'Payout request currency does not match requested 1ze burn currency',
        {
          payoutRequestId: payload.payoutRequestId,
          payoutAmountCurrency,
          burnCurrency: fiatCurrency,
        }
      );
    }

    if (payoutAmountGbp !== null) {
      let redemptionAmountGbp = fiatAmount;
      if (fiatCurrency !== 'GBP') {
        const gbpFx = await resolveInternalFxRate(client, fiatCurrency, 'GBP');
        redemptionAmountGbp = Number((fiatAmount * gbpFx.rate).toFixed(6));
      }

      const tolerance = Math.max(0.5, payoutAmountGbp * 0.03);
      if (Math.abs(redemptionAmountGbp - payoutAmountGbp) > tolerance) {
        throw createApiError(
          'PAYOUT_REQUEST_AMOUNT_MISMATCH',
          'Computed redemption value does not match payout request amount',
          {
            payoutRequestId: payload.payoutRequestId,
            payoutAmountGbp,
            redemptionAmountGbp,
            tolerance,
          }
        );
      }
    }

    const architectureEnabled = await onezeArchitectureTablesAvailable(client);
    let architectureWalletId: string | null = null;
    let architectureWalletBalanceMg: number | null = null;
    let segmentDebitResult:
      | {
          purchasedDebitedMg: number;
          earnedDebitedMg: number;
          lockedPurchasedMg: number;
          redeemableMg: number;
          purchasedBalanceMg: number;
          earnedBalanceMg: number;
        }
      | null = null;

    if (architectureEnabled) {
      const wallet = await ensureWallet(client, actorUserId, fiatCurrency);
      segmentDebitResult = await debitWalletSegmentBalance(client, {
        wallet,
        txId: `seg_${createRuntimeId('ize_burn')}`,
        amountMg,
        originCountry,
        lockHours: pricingProfile.withdrawalLockHours,
        metadata: {
          operation: 'burn',
          redeemCountry,
          isCrossBorder,
          payoutRequestId: payload.payoutRequestId ?? null,
        },
      });

      architectureWalletId = wallet.id;
    }

    const operationId = createRuntimeId('ize_burn');
    await recordIzeBurn(client, {
      operationId,
      userId: actorUserId,
      fiatAmount,
      fiatCurrency,
      izeAmount: normalizedIzeAmount,
      ratePerGram: redemptionUnitPrice,
      payoutRequestId: payload.payoutRequestId,
      metadata: {
        ...(payload.metadata ?? {}),
        country: pricingQuote.countryCode,
        originCountry,
        redeemCountry,
        isCrossBorder,
      },
    });

    if (architectureEnabled) {
      const wallet = await ensureWallet(client, actorUserId, fiatCurrency);
      const walletTxId = createRuntimeId('wtx');

      architectureWalletBalanceMg = await applyWalletLedgerDelta(client, {
        walletId: wallet.id,
        txId: walletTxId,
        asset: '1ZE',
        amount: -amountMg,
        kind: 'BURN',
        refType: 'wallet_ize_operation',
        refId: operationId,
        anchorValueInInr: pricingQuote.anchorValueInInr,
        metadata: {
          operationId,
          userId: actorUserId,
          payoutRequestId: payload.payoutRequestId ?? null,
          fiatAmount,
          fiatCurrency,
          pricingReferenceSource: `internal_pricing:${pricingQuote.countryCode}:${isCrossBorder ? 'cross_border_sell' : 'sell'}`,
          ...(payload.metadata ?? {}),
        },
      });
    }

    const [walletBalanceIze, reserveSnapshot] = await Promise.all([
      getLedgerAccountBalance(client, 'user', actorUserId, 'ize_wallet', 'IZE'),
      getPlatformIzeReserveSnapshot(client),
    ]);

    const responsePayload: Record<string, unknown> = {
      ok: true,
      operation: {
        id: operationId,
        type: 'burn',
        userId: actorUserId,
        fiatAmount,
        fiatCurrency,
        izeAmount: normalizedIzeAmount,
        ratePerGram: redemptionUnitPrice,
        rateSource: `internal_pricing:${pricingQuote.countryCode}:${isCrossBorder ? 'cross_border_sell' : 'sell'}`,
        country: pricingQuote.countryCode,
        originCountry,
        redeemCountry,
        isCrossBorder,
        payoutGatewayId,
        payoutStatus,
        payoutAmountCurrency,
        payoutAmountGbp,
        dailyRedeemLimitIze: pricingProfile.dailyRedeemLimitIze,
        weeklyRedeemLimitIze: pricingProfile.weeklyRedeemLimitIze,
      },
      balances: {
        userIze: walletBalanceIze,
        outstandingIze: reserveSnapshot.outstandingIze,
        circulatingIze: reserveSnapshot.circulatingIze,
        supplyDeltaIze: reserveSnapshot.supplyDeltaIze,
        supplyParityRatio: reserveSnapshot.supplyParityRatio,
        liquidityBufferIze: reserveSnapshot.liquidityBufferIze,
      },
      architecture: architectureEnabled
        ? {
            walletId: architectureWalletId,
            walletBalanceMg: architectureWalletBalanceMg,
            walletBalanceOneze:
              architectureWalletBalanceMg === null
                ? null
                : mgToOnezeAmount(architectureWalletBalanceMg),
            segmentDebit: segmentDebitResult,
          }
        : null,
    };

    if (payload.idempotencyKey && idempotencyRequestHash) {
      await saveWalletIdempotentResponse(client, {
        userId: actorUserId,
        operation: 'burn',
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
        responsePayload,
      });
    }

    await client.query('COMMIT');
    reply.code(201);
    return responsePayload;
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, userId: actorUserId }, 'Failed to burn 1ze');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to burn 1ze',
    };
  } finally {
    client.release();
  }
});

// Convert 1ze to Fiat (for withdrawal)
app.post('/wallet/convert-1ze-to-fiat', async (request, reply) => {
  const bodySchema = z.object({
    userId: z.string().min(2).optional(),
    izeAmount: z.number().positive(),
    fiatCurrency: z.string().length(3).default('GBP'),
    idempotencyKey: z.string().min(8).max(140).optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});
  const actorUserId = resolveAuthenticatedUserId(request, payload.userId);

  if (!(await onezeArchitectureTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze wallet architecture tables are unavailable. Run migrations first.',
    };
  }

  await assertOnezeMintBurnNotHalted();

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureUserExists(actorUserId);

    const normalizedIzeAmount = Number(payload.izeAmount.toFixed(6));
    const amountMg = onezeAmountToMg(normalizedIzeAmount);

    const fiatCurrency = payload.fiatCurrency.toUpperCase();
    const pricingQuote = await resolveCountryPricingQuoteByCurrency(client, fiatCurrency);
    const onezeAmountFromMg = mgToOnezeAmount(amountMg);

    // At-par model: principal at FX rate, fee = principal * feeBps, net = principal - fee
    const principalAmount = fiatCurrency === 'GBP'
      ? onezeAmountFromMg
      : Number((onezeAmountFromMg * pricingQuote.fxRate).toFixed(6));
    const feeAmount = Number((principalAmount * (pricingQuote.platformFeeBps / 10_000)).toFixed(6));
    const netFiatAmount = Number((principalAmount - feeAmount).toFixed(6));

    // Compliance gate
    const redeemCapability = await evaluateWalletCapability(client, actorUserId, 'redeem', {
      amountUsd: netFiatAmount,
      currency: fiatCurrency,
    });
    if (!redeemCapability.allowed) {
      throw createApiError(redeemCapability.code, redeemCapability.reason ?? 'Wallet capability check failed', {
        capability: 'redeem',
        restrictions: redeemCapability.restrictions,
      });
    }

    // Idempotency
    const idempotencyRequestHash = payload.idempotencyKey
      ? hashWalletIdempotencyPayload({
          userId: actorUserId,
          izeAmount: normalizedIzeAmount,
          fiatCurrency,
          operation: 'convert-1ze-to-fiat',
        })
      : null;

    if (idempotencyRequestHash) {
      const idempotentResponse = await getWalletIdempotentResponse(client, {
        userId: actorUserId,
        requestHash: idempotencyRequestHash,
      });
      if (idempotentResponse) {
        await client.query('COMMIT');
        return idempotentResponse.response;
      }
    }

    // Validate 1ze balance
    const wallet = await ensureWallet(client, actorUserId, fiatCurrency);
    const currentIzeBalance = Number(wallet.oneze_balance_mg);

    if (currentIzeBalance < amountMg) {
      reply.code(400);
      return {
        ok: false,
        error: 'INSUFFICIENT_1ZE_BALANCE',
        message: 'Insufficient 1ze balance for conversion',
        currentBalanceMg: currentIzeBalance,
        requestedAmountMg: amountMg,
      };
    }

    const txId = createRuntimeId('wtx');

    // Burn 1ze from wallet
    await applyWalletLedgerDelta(client, {
      walletId: wallet.id,
      txId,
      asset: '1ZE',
      amount: -amountMg,
      kind: 'CONVERT_TO_FIAT',
      refType: '1ze_conversion',
      refId: txId,
      anchorValueInInr: pricingQuote.anchorValueInInr,
      metadata: {
        convertedIzeAmount: normalizedIzeAmount,
        principalAmount,
        feeAmount,
        netFiatAmount,
        fiatCurrency,
        rateUsed: pricingQuote.fxRate,
        feeBps: pricingQuote.platformFeeBps,
      },
    });

    // Debit segment balance (purchased first, then earned)
    await debitWalletSegmentBalance(client, {
      walletId: wallet.id,
      amountMg,
      lockHours: 0,
      reason: 'convert_to_fiat',
      refId: txId,
    });

    // Credit fiat to wallet (net of fee)
    const netFiatAmountMinor = Math.round(netFiatAmount * 100);
    await applyWalletLedgerDelta(client, {
      walletId: wallet.id,
      txId,
      asset: 'FIAT',
      amount: netFiatAmountMinor,
      kind: 'CONVERT_FROM_1ZE',
      refType: '1ze_conversion',
      refId: txId,
      anchorValueInInr: pricingQuote.anchorValueInInr,
      metadata: {
        convertedIzeAmount: normalizedIzeAmount,
        principalAmount,
        feeAmount,
        netFiatAmount,
        fiatCurrency,
        rateUsed: pricingQuote.fxRate,
        feeBps: pricingQuote.platformFeeBps,
      },
    });

    await client.query('COMMIT');

    const updatedWallet = await ensureWallet(client, actorUserId, fiatCurrency);

    const response = {
      ok: true,
      userId: actorUserId,
      wallet: toWalletPayload(updatedWallet),
      conversion: {
        izeAmount: normalizedIzeAmount,
        principalAmount,
        feeAmount,
        feeBps: pricingQuote.platformFeeBps,
        netFiatAmount,
        fiatCurrency,
        rateUsed: pricingQuote.fxRate,
      },
    };

    if (idempotencyRequestHash) {
      await saveWalletIdempotentResponse(client, {
        userId: actorUserId,
        requestHash: idempotencyRequestHash,
        response,
      });
    }

    return response;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// Buy 1ze using Fiat Balance
app.post('/wallet/buy-1ze', async (request, reply) => {
  const bodySchema = z.object({
    userId: z.string().min(2).optional(),
    fiatAmount: z.number().positive(),
    fiatCurrency: z.string().length(3).default('GBP'),
    idempotencyKey: z.string().min(8).max(140).optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});
  const actorUserId = resolveAuthenticatedUserId(request, payload.userId);

  if (!(await onezeArchitectureTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze wallet architecture tables are unavailable. Run migrations first.',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureUserExists(actorUserId);

    const fiatCurrency = payload.fiatCurrency.toUpperCase();
    const fiatAmountMinor = Math.round(payload.fiatAmount * 100);

    // Compliance gate: verify the user is permitted to issue (buy) 1ZE.
    const issueCapability = await evaluateWalletCapability(client, actorUserId, 'issue', {
      amountUsd: payload.fiatAmount,
      currency: fiatCurrency,
    });
    if (!issueCapability.allowed) {
      throw createApiError(issueCapability.code, issueCapability.reason ?? 'Wallet capability check failed', {
        capability: 'issue',
        restrictions: issueCapability.restrictions,
      });
    }

    // Validate fiat balance
    const wallet = await ensureWallet(client, actorUserId, fiatCurrency);
    const currentFiatBalance = Number(wallet.fiat_balance_minor);

    if (currentFiatBalance < fiatAmountMinor) {
      reply.code(400);
      return {
        ok: false,
        error: 'INSUFFICIENT_FIAT_BALANCE',
        message: 'Insufficient fiat balance to buy 1ze',
        currentBalanceMinor: currentFiatBalance,
        requestedAmountMinor: fiatAmountMinor,
      };
    }

    // Get pricing for conversion rate (at-par model)
    const pricingQuote = await resolveCountryPricingQuoteByCurrency(client, fiatCurrency);

    // At-par: user pays totalCost = principal + fee, receives principal in 1ZE
    const principalFiat = fiatCurrency === 'GBP'
      ? payload.fiatAmount
      : Number((payload.fiatAmount / (1 + pricingQuote.platformFeeBps / 10_000)).toFixed(6));
    const feeFiat = Number((payload.fiatAmount - principalFiat).toFixed(6));
    const izeAmount = fiatCurrency === 'GBP'
      ? principalFiat
      : Number((principalFiat / pricingQuote.fxRate).toFixed(6));
    const amountMg = onezeAmountToMg(izeAmount);

    const txId = createRuntimeId('wtx');

    // Debit fiat from wallet (total cost including fee)
    await applyWalletLedgerDelta(client, {
      walletId: wallet.id,
      txId,
      asset: 'FIAT',
      amount: -fiatAmountMinor,
      kind: 'BUY_1ZE',
      refType: '1ze_purchase',
      refId: txId,
      anchorValueInInr: pricingQuote.anchorValueInInr,
      metadata: {
        spentFiatAmount: payload.fiatAmount,
        principalFiat,
        feeFiat,
        receivedIzeAmount: izeAmount,
        fiatCurrency,
        rateUsed: pricingQuote.fxRate,
        feeBps: pricingQuote.platformFeeBps,
      },
    });

    // Mint 1ze to wallet (principal only)
    await applyWalletLedgerDelta(client, {
      walletId: wallet.id,
      txId,
      asset: '1ZE',
      amount: amountMg,
      kind: 'BUY_1ZE',
      refType: '1ze_purchase',
      refId: txId,
      anchorValueInInr: pricingQuote.anchorValueInInr,
      metadata: {
        spentFiatAmount: payload.fiatAmount,
        principalFiat,
        feeFiat,
        receivedIzeAmount: izeAmount,
        fiatCurrency,
        rateUsed: pricingQuote.fxRate,
        feeBps: pricingQuote.platformFeeBps,
      },
    });

    await client.query('COMMIT');

    // Reload wallet to get updated balances
    const updatedWallet = await ensureWallet(client, actorUserId, fiatCurrency);

    return {
      ok: true,
      userId: actorUserId,
      wallet: toWalletPayload(updatedWallet),
      purchase: {
        fiatAmount: payload.fiatAmount,
        principalFiat,
        feeFiat,
        feeBps: pricingQuote.platformFeeBps,
        fiatCurrency,
        izeAmount,
        rateUsed: pricingQuote.fxRate,
      },
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

// ── 1ze marketplace checkout ─────────────────────────────────────────
// Settles a marketplace order by debiting 1ze from the buyer's wallet and
// crediting the seller, marking the order as paid.  Uses the at-par pricing
// model so that for GBP orders 1 1ZE == 1 GBP; for other currencies the
// pricing engine fxRate is used to derive the 1ZE amount from the fiat total.
app.post('/wallet/1ze/checkout', async (request, reply) => {
  const bodySchema = z.object({
    orderId: z.string().min(2).max(140),
    idempotencyKey: z.string().min(8).max(140).optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});

  await assertOnezeMintBurnNotHalted();

  if (
    !(await onezeTablesAvailable(db))
    || !(await onezeP2pTablesAvailable(db))
    || !(await onezeArchitectureTablesAvailable(db))
  ) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze wallet architecture tables are unavailable. Run migrations first.',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Load the order from the orders table.
    const orderResult = await client.query<{
      buyer_id: string;
      seller_id: string;
      total_gbp: number | string;
      status: string;
    }>(
      `SELECT buyer_id, seller_id, total_gbp, status
       FROM orders
       WHERE id = $1
       LIMIT 1`,
      [payload.orderId]
    );

    const order = orderResult.rows[0];
    if (!order) {
      throw createApiError('ORDER_NOT_FOUND', `Order ${payload.orderId} was not found`, {
        orderId: payload.orderId,
      });
    }

    const buyerId = order.buyer_id;
    const sellerId = order.seller_id;
    const totalGbp = Number(order.total_gbp);

    if (buyerId === sellerId) {
      throw createApiError('CHECKOUT_INVALID_PARTIES', 'Buyer and seller must be different users', {
        orderId: payload.orderId,
      });
    }

    if (order.status === 'paid') {
      // Already paid — return idempotent success.
      await client.query('COMMIT');
      return {
        ok: true,
        orderId: payload.orderId,
        alreadyPaid: true,
      };
    }

    await ensureUserExists(buyerId);
    await ensureUserExists(sellerId);

    // 2. Evaluate wallet capability for the buyer (spend).
    const spendCapability = await evaluateWalletCapability(client, buyerId, 'spend', {
      amountUsd: totalGbp,
      currency: 'GBP',
      market: 'marketplace',
    });
    if (!spendCapability.allowed) {
      throw createApiError(spendCapability.code, spendCapability.reason ?? 'Wallet capability check failed', {
        capability: 'spend',
        restrictions: spendCapability.restrictions,
      });
    }

    // 3. Derive the 1ze amount from the GBP total using the at-par model.
    //    For GBP, 1 1ZE == 1 GBP at par.  For other currencies the pricing
    //    engine fxRate would be used, but orders are stored in GBP so we
    //    use the GBP quote directly.
    const pricingQuote = await resolveCountryPricingQuoteByCurrency(client, 'GBP');
    const izeAmount = totalGbp;
    const amountMg = onezeAmountToMg(izeAmount);

    if (!Number.isFinite(amountMg) || amountMg <= 0) {
      throw createApiError('CHECKOUT_INVALID_AMOUNT', 'Unable to derive a valid 1ze amount for checkout', {
        totalGbp,
        izeAmount,
      });
    }

    // 4. Idempotency: check for a previously-saved response.
    const idempotencyRequestHash = payload.idempotencyKey
      ? hashWalletIdempotencyPayload({
        orderId: payload.orderId,
        buyerId,
        sellerId,
        amountMg,
        izeAmount,
        totalGbp,
      })
      : null;

    if (payload.idempotencyKey && idempotencyRequestHash) {
      const idempotentResponse = await getWalletIdempotentResponse(client, {
        userId: buyerId,
        operation: '1ze_checkout',
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
      });

      if (idempotentResponse) {
        await client.query('COMMIT');
        return idempotentResponse;
      }
    }

    // 5. Load buyer wallet and check 1ze balance.
    const buyerWallet = await ensureWallet(client, buyerId, 'GBP');
    const buyerIzeBalanceMg = await getLedgerAccountBalance(client, 'user', buyerId, 'ize_wallet', 'IZE');
    if (buyerIzeBalanceMg < amountMg) {
      throw createApiError('INSUFFICIENT_1ZE_BALANCE', 'Insufficient 1ze balance to complete checkout', {
        currentBalanceMg: buyerIzeBalanceMg,
        requiredMg: amountMg,
        currentBalanceOneze: mgToOnezeAmount(buyerIzeBalanceMg),
        requiredOneze: izeAmount,
      });
    }

    const sellerWallet = await ensureWallet(client, sellerId, 'GBP');

    // 6. Debit 1ze from buyer (marketplace purchase).
    const walletTxId = createRuntimeId('wtx');
    const transferId = createRuntimeId('ize_checkout');

    const [buyerBalanceAfterMg, sellerBalanceAfterMg] = await Promise.all([
      applyWalletLedgerDelta(client, {
        walletId: buyerWallet.id,
        txId: walletTxId,
        asset: '1ZE',
        amount: -amountMg,
        kind: 'MARKETPLACE_PURCHASE',
        refType: 'marketplace_order',
        refId: payload.orderId,
        anchorValueInInr: pricingQuote.anchorValueInInr,
        metadata: {
          orderId: payload.orderId,
          sellerId,
          izeAmount,
          totalGbp,
          rateUsed: pricingQuote.fxRate,
        },
      }),
      applyWalletLedgerDelta(client, {
        walletId: sellerWallet.id,
        txId: walletTxId,
        asset: '1ZE',
        amount: amountMg,
        kind: 'MARKETPLACE_SALE',
        refType: 'marketplace_order',
        refId: payload.orderId,
        anchorValueInInr: pricingQuote.anchorValueInInr,
        metadata: {
          orderId: payload.orderId,
          buyerId,
          izeAmount,
          totalGbp,
          rateUsed: pricingQuote.fxRate,
        },
      }),
    ]);

    // 7. Update the order status to 'paid'.
    await client.query(`UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = $1`, [
      payload.orderId,
    ]);

    // 8. Debit segment balance for buyer, credit segment balance for seller (earned).
    await debitWalletSegmentBalance(client, {
      wallet: buyerWallet,
      txId: walletTxId,
      amountMg,
      originCountry: normalizeOnezeCountryTag(null),
      metadata: {
        operation: 'marketplace_purchase',
        orderId: payload.orderId,
        counterpartyUserId: sellerId,
      },
    });

    await creditWalletSegmentBalance(client, {
      wallet: sellerWallet,
      txId: walletTxId,
      earnedCreditMg: amountMg,
      originCountry: normalizeOnezeCountryTag(null),
      metadata: {
        operation: 'marketplace_sale',
        orderId: payload.orderId,
        counterpartyUserId: buyerId,
      },
    });

    // 9. Record the 1ze transfer for audit / reconciliation.
    await recordIzeTransfer(client, {
      transferId,
      senderUserId: buyerId,
      recipientUserId: sellerId,
      izeAmount,
      fiatAmount: totalGbp,
      fiatCurrency: 'GBP',
      ratePerGram: pricingQuote.principalAmount,
      eligibilityCode: 'ALLOWED',
      amlRiskScore: 0,
      amlRiskLevel: 'low',
      amlAlertId: null,
      senderCountry: normalizeOnezeCountryTag(null),
      recipientCountry: normalizeOnezeCountryTag(null),
      travelRulePayload: {},
      metadata: {
        contextType: 'marketplace_sale',
        contextId: payload.orderId,
        amountMg,
        orderId: payload.orderId,
      },
    });

    // 10. Build the response payload.
    const responsePayload: Record<string, unknown> = {
      ok: true,
      orderId: payload.orderId,
      buyerWallet: toWalletPayload(await ensureWallet(client, buyerId, 'GBP')),
      sellerWallet: toWalletPayload(await ensureWallet(client, sellerId, 'GBP')),
      payment: {
        izeAmount,
        fiatAmount: totalGbp,
        rateUsed: pricingQuote.fxRate,
      },
      balances: {
        buyerIzeMg: buyerBalanceAfterMg,
        buyerIzeOneze: mgToOnezeAmount(buyerBalanceAfterMg),
        sellerIzeMg: sellerBalanceAfterMg,
        sellerIzeOneze: mgToOnezeAmount(sellerBalanceAfterMg),
      },
    };

    if (payload.idempotencyKey && idempotencyRequestHash) {
      await saveWalletIdempotentResponse(client, {
        userId: buyerId,
        operation: '1ze_checkout',
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
        responsePayload,
      });
    }

    await client.query('COMMIT');

    await appendComplianceAuditSafe(request, {
      eventType: 'wallet.ize.checkout.committed',
      subjectUserId: buyerId,
      payload: {
        orderId: payload.orderId,
        buyerId,
        sellerId,
        izeAmount,
        totalGbp,
        amountMg,
        rateUsed: pricingQuote.fxRate,
      },
    });

    reply.code(201);
    return responsePayload;
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, orderId: payload.orderId }, 'Failed to execute 1ze marketplace checkout');
    reply.code(500);
    return {
      ok: false,
      error: 'Failed to execute 1ze marketplace checkout',
    };
  } finally {
    client.release();
  }
});

app.post('/wallet/1ze/transfer', async (request, reply) => {
  const bodySchema = z.object({
    senderUserId: z.string().min(2).optional(),
    recipientUserId: z.string().min(2),
    izeAmount: z.number().positive(),
    fiatCurrency: z.string().length(3).default('GBP'),
    contextType: z.enum(['marketplace_sale', 'coOwn_trade', 'platform_reward']),
    contextId: z.string().min(2).max(140),
    note: z.string().max(280).optional(),
    idempotencyKey: z.string().min(8).max(140).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});

  // 1ze Context: marketplace checkout, co-own trading, and platform rewards
  const ALLOWED_1ZE_CONTEXTS = ['marketplace_sale', 'coOwn_trade', 'platform_reward'] as const;
  if (!ALLOWED_1ZE_CONTEXTS.includes(payload.contextType as typeof ALLOWED_1ZE_CONTEXTS[number])) {
    reply.code(400);
    return {
      ok: false,
      error: 'IZE_TRANSFER_INVALID_CONTEXT',
      message: '1ze can only be transferred for marketplace sales, co-own trading, or platform rewards.',
      allowedContexts: ALLOWED_1ZE_CONTEXTS,
      providedContext: payload.contextType,
    };
  }

  const senderUserId = resolveAuthenticatedUserId(request, payload.senderUserId);
  const recipientUserId = payload.recipientUserId;

  if (senderUserId === recipientUserId) {
    reply.code(400);
    return {
      ok: false,
      error: 'Sender and recipient must be different users',
    };
  }

  if (
    !(await onezeTablesAvailable(db))
    || !(await onezeP2pTablesAvailable(db))
    || !(await onezeArchitectureTablesAvailable(db))
  ) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze P2P transfer architecture tables are unavailable. Run migrations first.',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await ensureUserExists(senderUserId);
    await ensureUserExists(recipientUserId);

    const normalizedIzeAmount = Number(payload.izeAmount.toFixed(6));
    if (!Number.isFinite(normalizedIzeAmount) || normalizedIzeAmount <= 0) {
      throw createApiError('P2P_TRANSFER_INVALID', 'Unable to derive a valid 1ze amount for transfer');
    }

    const amountMg = onezeAmountToMg(normalizedIzeAmount);

    const idempotencyRequestHash = payload.idempotencyKey
      ? hashWalletIdempotencyPayload({
        senderUserId,
        recipientUserId,
        amountMg,
        fiatCurrency: payload.fiatCurrency.toUpperCase(),
        contextType: payload.contextType ?? null,
        contextId: payload.contextId ?? null,
        note: payload.note ?? null,
      })
      : null;

    if (payload.idempotencyKey && idempotencyRequestHash) {
      const idempotentResponse = await getWalletIdempotentResponse(client, {
        userId: senderUserId,
        operation: 'p2p_transfer',
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
      });

      if (idempotentResponse) {
        await client.query('COMMIT');
        return idempotentResponse;
      }
    }

    const fiatCurrency = payload.fiatCurrency.toUpperCase();
    const pricingQuote = await resolveCountryPricingQuoteByCurrency(client, fiatCurrency);
    const fxToGbp = await resolveInternalFxRate(client, fiatCurrency, 'GBP');

    const onezeAmountFromMg = mgToOnezeAmount(amountMg);
    const fiatAmount = Number((onezeAmountFromMg * pricingQuote.principalAmount).toFixed(6));
    const amountGbp = Number((fiatAmount * fxToGbp.rate).toFixed(6));
    const eligibilityAmountGbp = roundTo(amountGbp, 2);

    const policyDecision = await evaluateP2pPolicyEligibility(client, {
      senderUserId,
      recipientUserId,
      amountMg,
      contextType: payload.contextType,
      contextId: payload.contextId,
    });

    const [senderEligibility, recipientEligibility] = await Promise.all([
      evaluateMarketEligibility(client, {
        userId: senderUserId,
        market: 'p2p',
        orderNotionalGbp: eligibilityAmountGbp,
      }),
      evaluateMarketEligibility(client, {
        userId: recipientUserId,
        market: 'p2p',
        orderNotionalGbp: eligibilityAmountGbp,
      }),
    ]);

    if (!senderEligibility.allowed) {
      throw createApiError('P2P_TRANSFER_SENDER_BLOCKED', senderEligibility.message, {
        senderDecision: senderEligibility,
      });
    }

    if (!recipientEligibility.allowed) {
      throw createApiError('P2P_TRANSFER_RECIPIENT_BLOCKED', recipientEligibility.message, {
        recipientDecision: recipientEligibility,
      });
    }

    // Wallet capability gates for P2P transfer
    const [senderWalletCap, recipientWalletCap] = await Promise.all([
      evaluateWalletCapability(client, senderUserId, 'p2p_send', {
        amountUsd: eligibilityAmountGbp,
        counterpartyUserId: recipientUserId,
      }),
      evaluateWalletCapability(client, recipientUserId, 'p2p_receive', {
        amountUsd: eligibilityAmountGbp,
        counterpartyUserId: senderUserId,
      }),
    ]);
    if (!senderWalletCap.allowed) {
      throw createApiError(senderWalletCap.code, senderWalletCap.reason ?? 'Wallet capability check failed', {
        capability: 'p2p_send',
        restrictions: senderWalletCap.restrictions,
      });
    }
    if (!recipientWalletCap.allowed) {
      throw createApiError(recipientWalletCap.code, recipientWalletCap.reason ?? 'Wallet capability check failed', {
        capability: 'p2p_receive',
        restrictions: recipientWalletCap.restrictions,
      });
    }

    const transferId = createRuntimeId('ize_transfer');
    const amlAssessment = await evaluateAmlRisk(client, {
      userId: senderUserId,
      market: 'p2p',
      amountGbp: eligibilityAmountGbp,
      counterpartyUserId: recipientUserId,
    });

    let amlAlert: { alertId: string; status: string } | null = null;
    if (amlAssessment.shouldCreateAlert) {
      amlAlert = await createAmlAlert(client, {
        userId: senderUserId,
        relatedUserId: recipientUserId,
        market: 'p2p',
        eventType: 'transfer',
        amountGbp: eligibilityAmountGbp,
        referenceId: transferId,
        ruleCode: 'P2P_TRANSFER',
        notes: payload.note,
        context: {
          senderUserId,
          recipientUserId,
          izeAmount: normalizedIzeAmount,
          fiatAmount,
          fiatCurrency,
          ratePerGram: pricingQuote.principalAmount,
        },
        assessment: amlAssessment,
      });
    }

    if (amlAssessment.shouldBlock) {
      throw createApiError('P2P_TRANSFER_AML_BLOCKED', 'P2P transfer blocked by AML controls', {
        riskScore: amlAssessment.riskScore,
        riskLevel: amlAssessment.riskLevel,
        reasons: amlAssessment.reasons,
        alertId: amlAlert?.alertId ?? null,
      });
    }

    await recordIzeTransfer(client, {
      transferId,
      senderUserId,
      recipientUserId,
      izeAmount: normalizedIzeAmount,
      fiatAmount,
      fiatCurrency,
      ratePerGram: pricingQuote.principalAmount,
      eligibilityCode: 'ALLOWED',
      amlRiskScore: amlAssessment.riskScore,
      amlRiskLevel: amlAssessment.riskLevel,
      amlAlertId: amlAlert?.alertId ?? null,
      senderCountry: policyDecision.senderCountry,
      recipientCountry: policyDecision.recipientCountry,
      travelRulePayload: policyDecision.requiresTravelRule
        ? {
          thresholdMg: config.onezeTravelRuleThresholdUnits,
          originator: {
            userId: senderUserId,
            country: policyDecision.senderCountry,
          },
          beneficiary: {
            userId: recipientUserId,
            country: policyDecision.recipientCountry,
          },
          contextType: payload.contextType ?? null,
          contextId: payload.contextId ?? null,
        }
        : {},
      metadata: {
        note: payload.note,
        contextType: payload.contextType ?? null,
        contextId: payload.contextId ?? null,
        amountMg,
        ...(payload.metadata ?? {}),
      },
    });

    const senderWallet = await ensureWallet(client, senderUserId, fiatCurrency);
    const recipientWallet = await ensureWallet(client, recipientUserId, fiatCurrency);
    const walletTxId = createRuntimeId('wtx');

    const [senderBalanceAfterMg, recipientBalanceAfterMg] = await Promise.all([
      applyWalletLedgerDelta(client, {
        walletId: senderWallet.id,
        txId: walletTxId,
        asset: '1ZE',
        amount: -amountMg,
        kind: 'TRANSFER_SEND',
        refType: payload.contextType ?? 'p2p_transfer',
        refId: payload.contextId ?? transferId,
        anchorValueInInr: pricingQuote.anchorValueInInr,
        metadata: {
          transferId,
          counterpartyUserId: recipientUserId,
          note: payload.note ?? null,
          pricingSource: `internal_pricing:${pricingQuote.countryCode}:buy`,
        },
      }),
      applyWalletLedgerDelta(client, {
        walletId: recipientWallet.id,
        txId: walletTxId,
        asset: '1ZE',
        amount: amountMg,
        kind: 'TRANSFER_RECEIVE',
        refType: payload.contextType ?? 'p2p_transfer',
        refId: payload.contextId ?? transferId,
        anchorValueInInr: pricingQuote.anchorValueInInr,
        metadata: {
          transferId,
          counterpartyUserId: senderUserId,
          note: payload.note ?? null,
          pricingSource: `internal_pricing:${pricingQuote.countryCode}:buy`,
        },
      }),
    ]);

    await debitWalletSegmentBalance(client, {
      wallet: senderWallet,
      txId: walletTxId,
      amountMg,
      originCountry: policyDecision.senderCountry,
      metadata: {
        operation: 'transfer_send',
        transferId,
        counterpartyUserId: recipientUserId,
      },
    });

    await creditWalletSegmentBalance(client, {
      wallet: recipientWallet,
      txId: walletTxId,
      earnedCreditMg: amountMg,
      originCountry: policyDecision.senderCountry,
      metadata: {
        operation: 'transfer_receive',
        transferId,
        counterpartyUserId: senderUserId,
      },
    });

    const [senderIzeBalance, recipientIzeBalance] = await Promise.all([
      getLedgerAccountBalance(client, 'user', senderUserId, 'ize_wallet', 'IZE'),
      getLedgerAccountBalance(client, 'user', recipientUserId, 'ize_wallet', 'IZE'),
    ]);

    const responsePayload: Record<string, unknown> = {
      ok: true,
      transfer: {
        id: transferId,
        senderUserId,
        recipientUserId,
        amountMg,
        izeAmount: onezeAmountFromMg,
        fiatAmount,
        fiatCurrency,
        amountGbp: eligibilityAmountGbp,
        ratePerGram: pricingQuote.principalAmount,
        rateSource: `internal_pricing:${pricingQuote.countryCode}:buy`,
        fxRateToGbp: fxToGbp.rate,
        fxSourceToGbp: fxToGbp.source,
        senderEligibilityCode: senderEligibility.code,
        recipientEligibilityCode: recipientEligibility.code,
        senderCountry: policyDecision.senderCountry,
        recipientCountry: policyDecision.recipientCountry,
        isCrossBorder: policyDecision.senderCountry !== policyDecision.recipientCountry,
        travelRuleApplied: policyDecision.requiresTravelRule,
        amlRiskScore: amlAssessment.riskScore,
        amlRiskLevel: amlAssessment.riskLevel,
        amlAlertId: amlAlert?.alertId ?? null,
      },
      balances: {
        senderIze: senderIzeBalance,
        recipientIze: recipientIzeBalance,
        senderWalletMg: senderBalanceAfterMg,
        senderWalletOneze: mgToOnezeAmount(senderBalanceAfterMg),
        recipientWalletMg: recipientBalanceAfterMg,
        recipientWalletOneze: mgToOnezeAmount(recipientBalanceAfterMg),
      },
    };

    if (payload.idempotencyKey && idempotencyRequestHash) {
      await saveWalletIdempotentResponse(client, {
        userId: senderUserId,
        operation: 'p2p_transfer',
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
        responsePayload,
      });
    }

    await client.query('COMMIT');

    await appendComplianceAuditSafe(request, {
      eventType: 'wallet.ize.transfer.committed',
      subjectUserId: senderUserId,
      payload: {
        transferId,
        senderUserId,
        recipientUserId,
        izeAmount: normalizedIzeAmount,
        fiatAmount,
        fiatCurrency,
        amountGbp: eligibilityAmountGbp,
        amountMg,
        senderCountry: policyDecision.senderCountry,
        recipientCountry: policyDecision.recipientCountry,
        contextType: payload.contextType ?? null,
        contextId: payload.contextId ?? null,
        amlRiskScore: amlAssessment.riskScore,
        amlRiskLevel: amlAssessment.riskLevel,
        amlAlertId: amlAlert?.alertId ?? null,
      },
    });

    reply.code(201);
    return responsePayload;
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, senderUserId, recipientUserId }, 'Failed to execute P2P 1ze transfer');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to execute P2P 1ze transfer',
    };
  } finally {
    client.release();
  }
});

app.post('/wallet/1ze/withdrawals/quote', async (request, reply) => {
  const bodySchema = z.object({
    userId: z.string().min(2).optional(),
    amountMg: z.number().int().positive().optional(),
    amountOneze: z.number().positive().optional(),
    targetCurrency: z.string().length(3).default('INR'),
    payoutDestination: z.record(z.unknown()).optional(),
    forceRefresh: z.coerce.boolean().default(false),
    idempotencyKey: z.string().min(8).max(140).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  const payload = bodySchema.parse(request.body ?? {});
  const actorUserId = resolveAuthenticatedUserId(request, payload.userId);

  const providedAmountCount = Number(payload.amountMg !== undefined) + Number(payload.amountOneze !== undefined);
  if (providedAmountCount !== 1) {
    reply.code(400);
    return {
      ok: false,
      error: 'Provide exactly one of amountMg or amountOneze',
    };
  }

  if (!(await onezeArchitectureTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze wallet architecture tables are unavailable. Run migrations first.',
    };
  }

  try {
    await assertOnezeMintBurnNotHalted();
  } catch (error) {
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    throw error;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureUserExists(actorUserId);

    const amountMg = payload.amountMg ?? onezeAmountToMg(Number((payload.amountOneze ?? 0).toFixed(6)));
    if (!Number.isSafeInteger(amountMg) || amountMg <= 0) {
      throw createApiError('WITHDRAWAL_AMOUNT_INVALID', 'Withdrawal amount cannot be represented safely in mg');
    }

    const targetCurrency = payload.targetCurrency.toUpperCase();
    const idempotencyRequestHash = payload.idempotencyKey
      ? hashWalletIdempotencyPayload({
          userId: actorUserId,
          amountMg,
          targetCurrency,
          payoutDestination: payload.payoutDestination ?? {},
        })
      : null;

    if (payload.idempotencyKey && idempotencyRequestHash) {
      const idempotentResponse = await getWalletIdempotentResponse(client, {
        userId: actorUserId,
        operation: 'withdraw_quote',
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
      });

      if (idempotentResponse) {
        await client.query('COMMIT');
        return idempotentResponse;
      }
    }

    const corridor = await resolvePayoutCorridor(client, targetCurrency);
    if (!corridor || !corridor.enabled) {
      throw createApiError('WITHDRAWAL_CORRIDOR_UNAVAILABLE', 'Target payout corridor is unavailable', {
        targetCurrency,
      });
    }

    const fxRate = await resolveOnezeFiatFxRate(client, targetCurrency, {
      forceRefresh: payload.forceRefresh,
    });

    const amountOneze = mgToOnezeAmount(amountMg);
    const grossMinor = toFiatMinor(amountOneze * fxRate.rate, targetCurrency);
    const spreadMinor = Math.round((grossMinor * Number(corridor.spread_bps)) / 10_000);
    const networkFeeMinor = Number(corridor.network_fee_minor);
    const netMinor = grossMinor - spreadMinor - networkFeeMinor;
    const minAmountMinor = Number(corridor.min_amount_minor);
    const maxAmountMinor = Number(corridor.max_amount_minor);

    if (grossMinor < minAmountMinor || grossMinor > maxAmountMinor) {
      throw createApiError(
        'WITHDRAWAL_AMOUNT_OUT_OF_RANGE',
        'Withdrawal amount is outside corridor limits',
        {
          targetCurrency,
          minAmountMinor,
          maxAmountMinor,
          requestedGrossMinor: grossMinor,
        }
      );
    }

    if (netMinor <= 0) {
      throw createApiError('WITHDRAWAL_NET_AMOUNT_INVALID', 'Withdrawal net payout must be positive', {
        targetCurrency,
        grossMinor,
        spreadMinor,
        networkFeeMinor,
        netMinor,
      });
    }

    const withdrawalId = createRuntimeId('wdq');
    const rateExpiresAt = new Date(Date.now() + config.onezeWithdrawalQuoteTtlSeconds * 1_000).toISOString();
    const withdrawalResult = await client.query<WithdrawalRow>(
      `
        INSERT INTO withdrawals (
          id,
          user_id,
          burn_tx_id,
          amount_mg,
          target_currency,
          gross_minor,
          spread_minor,
          network_fee_minor,
          net_minor,
          rate_locked,
          rate_expires_at,
          rail,
          rail_ref,
          status,
          payout_destination,
          metadata
        )
        VALUES (
          $1,
          $2,
          NULL,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          NULL,
          'QUOTED',
          $12::jsonb,
          $13::jsonb
        )
        RETURNING
          id,
          user_id,
          burn_tx_id,
          amount_mg::text,
          target_currency,
          gross_minor::text,
          spread_minor::text,
          network_fee_minor::text,
          net_minor::text,
          rate_locked::text,
          rate_expires_at::text,
          rail,
          rail_ref,
          status,
          payout_destination,
          metadata,
          created_at::text,
          completed_at::text
      `,
      [
        withdrawalId,
        actorUserId,
        amountMg,
        targetCurrency,
        grossMinor,
        spreadMinor,
        networkFeeMinor,
        netMinor,
        fxRate.rate,
        rateExpiresAt,
        corridor.rail,
        toJsonString(payload.payoutDestination ?? {}),
        toJsonString({
          quoteSource: fxRate.source,
          quoteObservedAt: fxRate.observedAt,
          quoteValidForSeconds: config.onezeWithdrawalQuoteTtlSeconds,
          corridor: {
            currency: targetCurrency,
            rail: corridor.rail,
            spreadBps: corridor.spread_bps,
            settlementSlaHours: corridor.settlement_sla_hours,
          },
          ...(payload.metadata ?? {}),
        }),
      ]
    );

    const withdrawal = toWithdrawalPayload(withdrawalResult.rows[0]);
    const responsePayload: Record<string, unknown> = {
      ok: true,
      withdrawal,
      quote: {
        validForSeconds: config.onezeWithdrawalQuoteTtlSeconds,
        expiresAt: withdrawal.rateExpiresAt,
        source: fxRate.source,
        // At-par transparent fee breakdown
        principalMinor: grossMinor - spreadMinor,
        feeMinor: spreadMinor,
        feeBps: Number(corridor.spread_bps),
        netMinor,
      },
      corridor: {
        currency: targetCurrency,
        rail: corridor.rail,
        spreadBps: corridor.spread_bps,
        networkFeeMinor,
        minAmountMinor,
        maxAmountMinor,
      },
    };

    if (payload.idempotencyKey && idempotencyRequestHash) {
      await saveWalletIdempotentResponse(client, {
        userId: actorUserId,
        operation: 'withdraw_quote',
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
        responsePayload,
      });
    }

    await client.query('COMMIT');
    reply.code(201);
    return responsePayload;
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, userId: actorUserId }, 'Failed to quote 1ze withdrawal');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to quote 1ze withdrawal',
    };
  } finally {
    client.release();
  }
});

app.post('/wallet/1ze/withdrawals/:withdrawalId/accept', async (request, reply) => {
  const paramsSchema = z.object({
    withdrawalId: z.string().min(3),
  });

  const bodySchema = z.object({
    userId: z.string().min(2).optional(),
    idempotencyKey: z.string().min(8).max(140).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  const { withdrawalId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body ?? {});
  const actorUserId = resolveAuthenticatedUserId(request, payload.userId);

  if (!(await onezeArchitectureTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze wallet architecture tables are unavailable. Run migrations first.',
    };
  }

  try {
    await assertOnezeMintBurnNotHalted();
  } catch (error) {
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    throw error;
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const idempotencyRequestHash = payload.idempotencyKey
      ? hashWalletIdempotencyPayload({
          actorUserId,
          withdrawalId,
        })
      : null;

    if (payload.idempotencyKey && idempotencyRequestHash) {
      const idempotentResponse = await getWalletIdempotentResponse(client, {
        userId: actorUserId,
        operation: 'withdraw_accept',
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
      });

      if (idempotentResponse) {
        await client.query('COMMIT');
        return idempotentResponse;
      }
    }

    const withdrawal = await loadWithdrawalById(client, withdrawalId, { forUpdate: true });
    if (!withdrawal) {
      throw createApiError('WITHDRAWAL_NOT_FOUND', 'Withdrawal quote not found', { withdrawalId });
    }

    if (request.authUser?.role !== 'admin' && withdrawal.user_id !== actorUserId) {
      throw createApiError('FORBIDDEN_USER_CONTEXT', 'Forbidden: withdrawal does not belong to user context', {
        authUserId: actorUserId,
        withdrawalUserId: withdrawal.user_id,
      });
    }

    if (withdrawal.status === 'RESERVED' || withdrawal.status === 'PAID_OUT') {
      const wallet = await ensureWallet(client, withdrawal.user_id, withdrawal.target_currency);
      const responsePayload: Record<string, unknown> = {
        ok: true,
        alreadyReserved: true,
        withdrawal: toWithdrawalPayload(withdrawal),
        wallet: toWalletPayload(wallet),
      };

      if (payload.idempotencyKey && idempotencyRequestHash) {
        await saveWalletIdempotentResponse(client, {
          userId: actorUserId,
          operation: 'withdraw_accept',
          idempotencyKey: payload.idempotencyKey,
          requestHash: idempotencyRequestHash,
          responsePayload,
        });
      }

      await client.query('COMMIT');
      return responsePayload;
    }

    if (!canTransitionWithdrawalStatus(withdrawal.status, 'RESERVED')) {
      throw createApiError('WITHDRAWAL_STATE_INVALID', 'Withdrawal cannot be reserved from current status', {
        withdrawalId,
        status: withdrawal.status,
      });
    }

    const expiresAtMs = Date.parse(withdrawal.rate_expires_at);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      throw createApiError('WITHDRAWAL_QUOTE_EXPIRED', 'Withdrawal quote has expired', {
        withdrawalId,
        rateExpiresAt: withdrawal.rate_expires_at,
      });
    }

    const amountMg = Number(withdrawal.amount_mg);
    const requiresQueuedExecution = amountMg > config.onezeWithdrawalInstantLimitUnits;
    const wallet = await ensureWallet(client, withdrawal.user_id, withdrawal.target_currency);
    const pricingQuote = await resolveCountryPricingQuoteByCurrency(client, withdrawal.target_currency);
    const burnTxId = withdrawal.burn_tx_id ?? createRuntimeId('wdburn');

    // Compliance gate: verify the user is permitted to redeem (withdraw) 1ZE.
    const redeemCapability = await evaluateWalletCapability(client, withdrawal.user_id, 'redeem', {
      amountUsd: Number(withdrawal.net_minor) / 100,
      currency: withdrawal.target_currency,
    });
    if (!redeemCapability.allowed) {
      throw createApiError(redeemCapability.code, redeemCapability.reason ?? 'Wallet capability check failed', {
        capability: 'redeem',
        restrictions: redeemCapability.restrictions,
      });
    }

    const walletBalanceAfterMg = await applyWalletLedgerDelta(client, {
      walletId: wallet.id,
      txId: burnTxId,
      asset: '1ZE',
      amount: -amountMg,
      kind: 'WITHDRAWAL_RESERVED',
      refType: 'withdrawal',
      refId: withdrawal.id,
      anchorValueInInr: pricingQuote.anchorValueInInr,
      metadata: {
        withdrawalId: withdrawal.id,
        actorUserId,
        targetCurrency: withdrawal.target_currency,
        pricingSource: `internal_pricing:${pricingQuote.countryCode}:sell`,
        ...(payload.metadata ?? {}),
      },
    });

    // Debit segment balance (purchased first, then earned)
    await debitWalletSegmentBalance(client, {
      walletId: wallet.id,
      amountMg,
      lockHours: 0,
      reason: 'withdrawal_reserved',
      refId: withdrawal.id,
    });

    const updatedResult = await client.query<WithdrawalRow>(
      `
        UPDATE withdrawals
        SET
          burn_tx_id = $2,
          status = 'RESERVED',
          metadata = metadata || $3::jsonb
        WHERE id = $1
        RETURNING
          id,
          user_id,
          burn_tx_id,
          amount_mg::text,
          target_currency,
          gross_minor::text,
          spread_minor::text,
          network_fee_minor::text,
          net_minor::text,
          rate_locked::text,
          rate_expires_at::text,
          rail,
          rail_ref,
          status,
          payout_destination,
          metadata,
          created_at::text,
          completed_at::text
      `,
      [
        withdrawal.id,
        burnTxId,
        toJsonString({
          acceptedAt: new Date().toISOString(),
          acceptedBy: actorUserId,
          ...(payload.metadata ?? {}),
        }),
      ]
    );

    const updatedWithdrawal = updatedResult.rows[0];
    const responsePayload: Record<string, unknown> = {
      ok: true,
      withdrawal: toWithdrawalPayload(updatedWithdrawal),
      wallet: {
        walletId: wallet.id,
        onezeBalanceMg: walletBalanceAfterMg,
        onezeBalance: mgToOnezeAmount(walletBalanceAfterMg),
      },
      execution: {
        mode: requiresQueuedExecution ? 'queued' : 'manual',
        queued: requiresQueuedExecution,
        instantLimitMg: config.onezeWithdrawalInstantLimitUnits,
      },
    };

    await client.query('COMMIT');

    if (requiresQueuedExecution) {
      try {
        await enqueueOnezeWithdrawalExecuteJob({
          withdrawalId: updatedWithdrawal.id,
          initiatedBy: actorUserId,
          reason: 'threshold_queue',
        });
      } catch (queueError) {
        request.log.error(
          { err: queueError, withdrawalId: updatedWithdrawal.id },
          'Failed to enqueue threshold-based 1ze withdrawal execution'
        );

        const execution = responsePayload.execution as Record<string, unknown>;
        execution.queued = false;
        execution.queueError = 'queue_enqueue_failed';
      }
    }

    if (payload.idempotencyKey && idempotencyRequestHash) {
      await saveWalletIdempotentResponse(client, {
        userId: actorUserId,
        operation: 'withdraw_accept',
        idempotencyKey: payload.idempotencyKey,
        requestHash: idempotencyRequestHash,
        responsePayload,
      });
    }

    return responsePayload;
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, withdrawalId, userId: actorUserId }, 'Failed to accept 1ze withdrawal');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to accept 1ze withdrawal',
    };
  } finally {
    client.release();
  }
});

app.post('/wallet/1ze/withdrawals/:withdrawalId/execute', async (request, reply) => {
  const paramsSchema = z.object({
    withdrawalId: z.string().min(3),
  });

  const bodySchema = z.object({
    railRef: z.string().min(4).max(180).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  const securityAdminError = ensureSecurityAdminAccess(request, reply);
  if (securityAdminError) {
    return securityAdminError;
  }

  const { withdrawalId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body ?? {});

  if (!(await onezeArchitectureTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze wallet architecture tables are unavailable. Run migrations first.',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const execution = await executeReservedWithdrawal(client, {
      withdrawalId,
      railRef: payload.railRef,
      metadata: {
        ...(payload.metadata ?? {}),
        source: 'admin_execute_endpoint',
      },
    });

    await client.query('COMMIT');

    if (execution.alreadySettled) {
      return {
        ok: true,
        alreadySettled: true,
        withdrawal: execution.withdrawal,
      };
    }

    return {
      ok: true,
      withdrawal: execution.withdrawal,
      settlement: execution.settlement,
      wallet: execution.wallet,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, withdrawalId }, 'Failed to execute 1ze withdrawal');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to execute 1ze withdrawal',
    };
  } finally {
    client.release();
  }
});

app.post('/wallet/1ze/withdrawals/:withdrawalId/fail', async (request, reply) => {
  const paramsSchema = z.object({
    withdrawalId: z.string().min(3),
  });

  const bodySchema = z.object({
    reason: z.string().min(3).max(280).optional(),
    metadata: z.record(z.unknown()).optional(),
  });

  const securityAdminError = ensureSecurityAdminAccess(request, reply);
  if (securityAdminError) {
    return securityAdminError;
  }

  const { withdrawalId } = paramsSchema.parse(request.params);
  const payload = bodySchema.parse(request.body ?? {});

  if (!(await onezeArchitectureTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze wallet architecture tables are unavailable. Run migrations first.',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const withdrawal = await loadWithdrawalById(client, withdrawalId, { forUpdate: true });
    if (!withdrawal) {
      throw createApiError('WITHDRAWAL_NOT_FOUND', 'Withdrawal not found', { withdrawalId });
    }

    if (withdrawal.status === 'FAILED' || withdrawal.status === 'REVERSED') {
      await client.query('COMMIT');
      return {
        ok: true,
        alreadyFailed: true,
        withdrawal: toWithdrawalPayload(withdrawal),
      };
    }

    if (!canTransitionWithdrawalStatus(withdrawal.status, 'FAILED')) {
      throw createApiError('WITHDRAWAL_STATE_INVALID', 'Withdrawal cannot be failed from current status', {
        withdrawalId,
        status: withdrawal.status,
      });
    }

    const amountMg = Number(withdrawal.amount_mg);
    let walletInfo: { walletId: string; onezeBalanceMg: number; onezeBalance: number } | null = null;

    if (withdrawal.status === 'RESERVED') {
      const pricingQuote = await resolveCountryPricingQuoteByCurrency(client, withdrawal.target_currency);

      const wallet = await ensureWallet(client, withdrawal.user_id, withdrawal.target_currency);
      const walletBalanceAfterMg = await applyWalletLedgerDelta(client, {
        walletId: wallet.id,
        txId: withdrawal.burn_tx_id ?? createRuntimeId('wdburn'),
        asset: '1ZE',
        amount: amountMg,
        kind: 'WITHDRAWAL_REVERSED',
        refType: 'withdrawal',
        refId: withdrawal.id,
        anchorValueInInr: pricingQuote.anchorValueInInr,
        metadata: {
          withdrawalId,
          reason: payload.reason ?? 'execution_failed',
          pricingSource: `internal_pricing:${pricingQuote.countryCode}:sell`,
          ...(payload.metadata ?? {}),
        },
      });

      walletInfo = {
        walletId: wallet.id,
        onezeBalanceMg: walletBalanceAfterMg,
        onezeBalance: mgToOnezeAmount(walletBalanceAfterMg),
      };
    }

    const updatedResult = await client.query<WithdrawalRow>(
      `
        UPDATE withdrawals
        SET
          status = 'FAILED',
          completed_at = NOW(),
          metadata = metadata || $2::jsonb
        WHERE id = $1
        RETURNING
          id,
          user_id,
          burn_tx_id,
          amount_mg::text,
          target_currency,
          gross_minor::text,
          spread_minor::text,
          network_fee_minor::text,
          net_minor::text,
          rate_locked::text,
          rate_expires_at::text,
          rail,
          rail_ref,
          status,
          payout_destination,
          metadata,
          created_at::text,
          completed_at::text
      `,
      [
        withdrawal.id,
        toJsonString({
          failedAt: new Date().toISOString(),
          reason: payload.reason ?? 'execution_failed',
          ...(payload.metadata ?? {}),
        }),
      ]
    );

    await client.query('COMMIT');
    return {
      ok: true,
      withdrawal: toWithdrawalPayload(updatedResult.rows[0]),
      wallet: walletInfo,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, withdrawalId }, 'Failed to fail/reverse 1ze withdrawal');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to fail/reverse 1ze withdrawal',
    };
  } finally {
    client.release();
  }
});

app.get('/wallet/1ze/:userId/withdrawals', async (request, reply) => {
  const paramsSchema = z.object({
    userId: z.string().min(2),
  });

  const querySchema = z.object({
    status: z
      .enum(['all', 'QUOTED', 'ACCEPTED', 'RESERVED', 'PAID_OUT', 'FAILED', 'REVERSED'])
      .default('all'),
    limit: z.coerce.number().int().min(1).max(200).default(60),
  });

  const { userId } = paramsSchema.parse(request.params);
  const { status, limit } = querySchema.parse(request.query);
  resolveAuthenticatedUserId(request, userId);

  if (!(await onezeArchitectureTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze wallet architecture tables are unavailable. Run migrations first.',
    };
  }

  const result = await db.query<WithdrawalRow>(
    `
      SELECT
        id,
        user_id,
        burn_tx_id,
        amount_mg::text,
        target_currency,
        gross_minor::text,
        spread_minor::text,
        network_fee_minor::text,
        net_minor::text,
        rate_locked::text,
        rate_expires_at::text,
        rail,
        rail_ref,
        status,
        payout_destination,
        metadata,
        created_at::text,
        completed_at::text
      FROM withdrawals
      WHERE user_id = $1
        AND ($2 = 'all' OR status = $2)
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [userId, status, limit]
  );

  return {
    ok: true,
    items: result.rows.map((row) => toWithdrawalPayload(row)),
  };
});

app.get('/wallet/1ze/:userId/balance', async (request, reply) => {
  const paramsSchema = z.object({
    userId: z.string().min(2),
  });

  const querySchema = z.object({
    fiatCurrency: z.string().length(3).optional(),
  });

  const { userId } = paramsSchema.parse(request.params);
  const { fiatCurrency } = querySchema.parse(request.query);
  resolveAuthenticatedUserId(request, userId);

  if (!(await onezeArchitectureTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze wallet architecture tables are unavailable. Run migrations first.',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureUserExists(userId);

    const wallet = await ensureWallet(client, userId, fiatCurrency?.toUpperCase() ?? DEFAULT_WALLET_FIAT_CURRENCY);
    const [legacyIzeBalance, latestReconciliation] = await Promise.all([
      (await ledgerTablesAvailable(client))
        ? getLedgerAccountBalance(client, 'user', userId, 'ize_wallet', 'IZE')
        : Promise.resolve(0),
      client.query<{
        id: string;
        circulating_mg: string;
        reserve_active_mg: string;
        within_invariant: boolean;
        metadata: Record<string, unknown>;
        created_at: string;
      }>(
        `
          SELECT id, circulating_mg::text, reserve_active_mg::text, within_invariant, metadata, created_at::text
          FROM oneze_reconciliation_snapshots
          ORDER BY created_at DESC
          LIMIT 1
        `
      ),
    ]);

    await client.query('COMMIT');

    const latestSnapshot = latestReconciliation.rows[0];
    const latestSnapshotMetadata = asObject(latestSnapshot?.metadata);
    const computedSupplyDeltaMg =
      latestSnapshot
        ? Number(latestSnapshot.circulating_mg) - Number(latestSnapshot.reserve_active_mg)
        : null;
    return {
      ok: true,
      userId,
      wallet: toWalletPayload(wallet),
      legacyLedgerIzeBalance: legacyIzeBalance,
      reconciliation: latestSnapshot
        ? {
            id: latestSnapshot.id,
            circulatingMg: Number(latestSnapshot.circulating_mg),
            referenceSupplyMg: Number(latestSnapshot.reserve_active_mg),
            supplyDeltaMg:
              asFiniteNumber(latestSnapshotMetadata.supplyDeltaMg)
              ?? computedSupplyDeltaMg,
            toleranceMg: asFiniteNumber(latestSnapshotMetadata.toleranceMg),
            operationalLiquidityMg: asFiniteNumber(latestSnapshotMetadata.operationalLiquidityMg),
            configuredOperationalReserveMg: asFiniteNumber(
              asObject(latestSnapshotMetadata.reservePolicy).configuredOperationalReserveMg
            ),
            reservedWithdrawalMg: asFiniteNumber(
              asObject(latestSnapshotMetadata.reservePolicy).reservedWithdrawalMg
            ),
            configuredReserveRatio: asFiniteNumber(
              asObject(latestSnapshotMetadata.reservePolicy).configuredReserveRatio
            ),
            effectiveReserveRatio: asFiniteNumber(
              asObject(latestSnapshotMetadata.reservePolicy).effectiveReserveRatio
            ),
            withinReservePolicy:
              typeof asObject(latestSnapshotMetadata.reservePolicy).withinPolicy === 'boolean'
                ? (asObject(latestSnapshotMetadata.reservePolicy).withinPolicy as boolean)
                : null,
            withinSupplyTolerance:
              typeof latestSnapshotMetadata.withinSupplyInvariant === 'boolean'
                ? (latestSnapshotMetadata.withinSupplyInvariant as boolean)
                : latestSnapshot.within_invariant,
            withinSupplyInvariant:
              typeof latestSnapshotMetadata.withinSupplyInvariant === 'boolean'
                ? (latestSnapshotMetadata.withinSupplyInvariant as boolean)
                : latestSnapshot.within_invariant,
            reserveActiveMg: Number(latestSnapshot.reserve_active_mg),
            withinInvariant: latestSnapshot.within_invariant,
            createdAt: latestSnapshot.created_at,
          }
        : null,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, userId }, 'Failed to load 1ze wallet balance');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to load 1ze wallet balance',
    };
  } finally {
    client.release();
  }
});

app.get('/wallet/1ze/:userId/ledger', async (request, reply) => {
  const paramsSchema = z.object({
    userId: z.string().min(2),
  });

  const querySchema = z.object({
    asset: z.enum(['ALL', '1ZE', 'FIAT']).default('ALL'),
    limit: z.coerce.number().int().min(1).max(300).default(100),
  });

  const { userId } = paramsSchema.parse(request.params);
  const { asset, limit } = querySchema.parse(request.query);
  resolveAuthenticatedUserId(request, userId);

  if (!(await onezeArchitectureTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze wallet architecture tables are unavailable. Run migrations first.',
    };
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await ensureUserExists(userId);
    const wallet = await ensureWallet(client, userId);

    const result = await client.query<WalletLedgerRow>(
      `
        SELECT
          id,
          wallet_id,
          tx_id,
          asset,
          amount::text,
          balance_after::text,
          kind,
          ref_type,
          ref_id,
            anchor_value_in_inr::text,
          metadata,
          created_at::text
        FROM wallet_ledger
        WHERE wallet_id = $1
          AND ($2 = 'ALL' OR asset = $2)
        ORDER BY id DESC
        LIMIT $3
      `,
      [wallet.id, asset, limit]
    );

    await client.query('COMMIT');
    return {
      ok: true,
      wallet: toWalletPayload(wallet),
      items: result.rows.map((row) => toWalletLedgerPayload(row)),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    const apiError = getApiError(error);
    if (apiError) {
      reply.code(statusCodeForApiError(apiError.code));
      return {
        ok: false,
        error: apiError.message,
        details: apiError.details,
      };
    }

    request.log.error({ err: error, userId }, 'Failed to load 1ze wallet ledger');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to load 1ze wallet ledger',
    };
  } finally {
    client.release();
  }
});

app.get('/wallet/1ze/:userId/transfers', async (request, reply) => {
  const paramsSchema = z.object({
    userId: z.string().min(2),
  });
  const querySchema = z.object({
    direction: z.enum(['all', 'inbound', 'outbound']).default('all'),
    limit: z.coerce.number().int().min(1).max(200).default(60),
  });

  const { userId } = paramsSchema.parse(request.params);
  const { direction, limit } = querySchema.parse(request.query);
  resolveAuthenticatedUserId(request, userId);

  if (!(await onezeTablesAvailable(db)) || !(await onezeP2pTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze P2P transfer tables are unavailable. Run migrations first.',
    };
  }

  const result = await db.query<WalletIzeTransferRow>(
    `
      SELECT
        id,
        sender_user_id,
        recipient_user_id,
        ize_amount::text,
        fiat_amount::text,
        fiat_currency,
        rate_per_gram::text,
        status,
        eligibility_code,
        aml_risk_score::text,
        aml_risk_level,
        aml_alert_id,
        metadata,
        created_at::text,
        committed_at::text
      FROM wallet_ize_transfers
      WHERE (
        ($2 = 'all' AND (sender_user_id = $1 OR recipient_user_id = $1))
        OR ($2 = 'outbound' AND sender_user_id = $1)
        OR ($2 = 'inbound' AND recipient_user_id = $1)
      )
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [userId, direction, limit]
  );

  return {
    ok: true,
    items: result.rows.map((row) => {
      const payload = toWalletIzeTransferPayload(row);
      const transferDirection = payload.senderUserId === userId ? 'outbound' : 'inbound';

      return {
        ...payload,
        direction: transferDirection,
      };
    }),
  };
});

app.get('/wallet/1ze/:userId/position', async (request, reply) => {
  const paramsSchema = z.object({ userId: z.string().min(2) });
  const querySchema = z.object({
    fiatCurrency: z.string().length(3).default('GBP'),
  });

  const { userId } = paramsSchema.parse(request.params);
  resolveAuthenticatedUserId(request, userId);
  const { fiatCurrency } = querySchema.parse(request.query);

  if (!(await onezeTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze money-layer tables are unavailable. Run migrations first.',
    };
  }

  const [pricingQuote, userIze, reserveSnapshot, reservedResult, redemptionResult, sequenceResult, haltState] = await Promise.all([
    resolveCountryPricingQuoteByCurrency(db, fiatCurrency),
    getLedgerAccountBalance(db, 'user', userId, 'ize_wallet', 'IZE'),
    getPlatformIzeReserveSnapshot(db),
    db.query<{ reserved_1ze_mg: string }>(
      `
        SELECT COALESCE(SUM(reserved_1ze_mg), 0)::text AS reserved_1ze_mg
        FROM coown_order_reservations
        WHERE user_id = $1 AND status IN ('active', 'placed')
      `,
      [userId]
    ),
    db.query<{ redemption_ize: string }>(
      `
        SELECT COALESCE(SUM(operation.ize_amount), 0)::text AS redemption_ize
        FROM wallet_ize_operations operation
        JOIN payout_requests payout ON payout.id = operation.payout_request_id
        WHERE operation.user_id = $1
          AND operation.operation_type = 'burn'
          AND operation.status = 'committed'
          AND payout.status IN ('requested', 'processing')
      `,
      [userId]
    ),
    db.query<{ snapshot_sequence: string }>(
      `
        SELECT COALESCE(MAX(id), 0)::text AS snapshot_sequence
        FROM ledger_entries
        WHERE account_id = (
          SELECT id FROM ledger_accounts
          WHERE owner_type = 'user' AND owner_id = $1 AND account_code = 'ize_wallet' AND currency = 'IZE'
          LIMIT 1
        )
      `,
      [userId]
    ),
    getOnezeMintBurnHaltState(),
  ]);
  const reservedForOrdersMg = Number(reservedResult.rows[0]?.reserved_1ze_mg ?? 0);
  const reservedForOrders = reservedForOrdersMg / 1000;
  const redemptionInProgress = Number(redemptionResult.rows[0]?.redemption_ize ?? 0);
  const availableIze = Math.max(0, userIze - reservedForOrders);
  const settledCustomerClaim = userIze + redemptionInProgress;
  const serverTimestamp = new Date().toISOString();
  const positionRate = fiatCurrency.toUpperCase() === 'GBP' ? 1 : pricingQuote.netRedemption;

  // â”€â”€ WS4: Wallet safeguarding (backend-backed, no longer hardcoded) â”€â”€
  // Query the user's safeguarding profile. Default to safeguarded=false
  // when no row exists (fail closed â€” never assert safeguarding without
  // a backend row).
  const safeguardingResult = await db.query<{
    safeguarded: boolean;
    safeguarding_partner: string | null;
    safeguarding_evidence_url: string | null;
    safeguarding_terms_url: string | null;
  }>(
    'SELECT safeguarded, safeguarding_partner, safeguarding_evidence_url, safeguarding_terms_url FROM wallet_safeguarding_profile WHERE user_id = $1',
    [userId]
  );
  const safeguarding = safeguardingResult.rows[0];

  const quote = {
    currency: pricingQuote.currency,
    ratePerGram: positionRate,
    source: fiatCurrency.toUpperCase() === 'GBP'
      ? 'fixed_par:GBP:1ZE'
      : `internal_pricing:${pricingQuote.countryCode}:sell`,
    fetchedAt: new Date().toISOString(),
    expiresAt: null,
    isFallback: false,
    isOverride: false,
    country: pricingQuote.countryCode,
    model: 'controlled_anchor',
  };

  return {
    ok: true,
    userId,
    rate: quote,
    balances: {
      userIze,
      userFiatValue: Number((userIze * positionRate).toFixed(2)),
      availableIze,
      reservedForOrders,
      redemptionInProgress,
      otherHolds: 0,
      pendingDeposit: 0,
      unsettledSaleProceeds: 0,
      settledCustomerClaim,
      withdrawable: availableIze,
      safeguarded: safeguarding?.safeguarded ?? false,
      safeguardingPartner: safeguarding?.safeguarding_partner ?? null,
      safeguardingEvidenceUrl: safeguarding?.safeguarding_evidence_url ?? null,
      safeguardingTermsUrl: safeguarding?.safeguarding_terms_url ?? null,
      snapshotSequence: Number(sequenceResult.rows[0]?.snapshot_sequence ?? 0),
      serverTimestamp,
      reconciliationState: haltState.halted ? 'reconciling' : 'reconciled',
      outstandingIze: reserveSnapshot.outstandingIze,
      circulatingIze: reserveSnapshot.circulatingIze,
      supplyDeltaIze: reserveSnapshot.supplyDeltaIze,
      supplyParityRatio: reserveSnapshot.supplyParityRatio,
      liquidityBufferIze: reserveSnapshot.liquidityBufferIze,
    },
  };
});

app.post('/wallet/1ze/reconcile', async (request, reply) => {
  const bodySchema = z.object({
    metadata: z.record(z.unknown()).optional(),
  });

  try {
    const operatorToken = request.headers['x-platform-operator-token'] as string | undefined;
    assertOnezeOperatorToken(operatorToken);
  } catch {
    reply.code(401);
    return {
      ok: false,
      error: 'Missing or invalid operator token',
    };
  }

  if (!(await onezeTablesAvailable(db)) || !(await onezeArchitectureTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze reconciliation tables are unavailable. Run migrations first.',
    };
  }

  const payload = bodySchema.parse(request.body ?? {});
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const snapshot = await captureOnezeReconciliationSnapshot(client, 'operator_manual', {
      source: 'wallet_reconcile_endpoint',
      ...(payload.metadata ?? {}),
    });

    const attestation = await createOnezeReconciliationAttestation(client, {
      attestedBy: 'operator',
      metadata: {
        source: 'wallet_reconcile_endpoint',
        snapshotId: snapshot.id,
        ...(payload.metadata ?? {}),
      },
      thresholdIze: config.onezeSupplyDriftThresholdIze,
    });

    const warnings: string[] = [];
    if (!snapshot.withinSupplyInvariant) {
      warnings.push('supply_invariant_violation');
    }
    if (!snapshot.withinReservePolicy) {
      warnings.push('reserve_policy_violation');
    }

    await client.query('COMMIT');
    return {
      ok: true,
      snapshot,
      attestation,
      warnings,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    request.log.error({ err: error }, 'Failed to reconcile 1ze closed-loop supply');
    reply.code(500);
    return {
      ok: false,
      error: 'Unable to reconcile 1ze closed-loop supply',
    };
  } finally {
    client.release();
  }
});

app.get('/wallet/1ze/attestations', async (request, reply) => {
  const querySchema = z.object({
    limit: z.coerce.number().int().min(1).max(120).default(30),
  });

  const { limit } = querySchema.parse(request.query);

  if (!(await onezeTablesAvailable(db))) {
    reply.code(503);
    return {
      ok: false,
      error: '1ze money-layer tables are unavailable. Run migrations first.',
    };
  }

  const result = await db.query<{
    id: string;
    liquidity_buffer_ize: string;
    outstanding_ize: string;
    supply_delta_ize: string;
    within_threshold: boolean;
    attested_by: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
  }>(
    `
      SELECT
        id,
        liquidity_buffer_ize::text,
        outstanding_ize::text,
        supply_delta_ize::text,
        within_threshold,
        attested_by,
        metadata,
        created_at::text
      FROM ize_reconciliation_snapshots
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit]
  );

  return {
    ok: true,
    items: result.rows.map((row) => {
      const metadata = asObject(row.metadata);
      const supplyDeltaIze = asFiniteNumber(metadata.supplyDeltaIze) ?? Number(row.supply_delta_ize);

      return {
        id: row.id,
        liquidityBufferIze: Number(row.liquidity_buffer_ize),
        outstandingIze: Number(row.outstanding_ize),
        supplyDeltaIze,
        driftIze: Number(row.supply_delta_ize),
        withinSupplyTolerance: row.within_threshold,
        withinThreshold: row.within_threshold,
        attestedBy: row.attested_by,
        metadata: row.metadata,
        createdAt: row.created_at,
      };
    }),
  };
});
};
