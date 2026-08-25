import crypto from 'node:crypto';

type DbQueryable = {
  query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<{ rows: T[] }>;
};

export type ReconciliationStatus = 'ok' | 'mismatch' | 'critical';

export interface DailyReconciliationRun {
  id: string;
  runDate: string;
  gatewaySucceededGbp: number;
  ledgerEscrowCreditGbp: number;
  ledgerPlatformRevenueGbp: number;
  payoutRequestedGbp: number;
  payoutPaidGbp: number;
  mismatchGbp: number;
  status: ReconciliationStatus;
  payoutsAutoPaused: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface DailyReconciliationRunRow {
  id: string;
  run_date: string;
  gateway_succeeded_gbp: string | number;
  ledger_escrow_credit_gbp: string | number;
  ledger_platform_revenue_gbp: string | number;
  payout_requested_gbp: string | number;
  payout_paid_gbp: string | number;
  mismatch_gbp: string | number;
  status: ReconciliationStatus;
  payouts_auto_paused: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toRunPayload(row: DailyReconciliationRunRow): DailyReconciliationRun {
  return {
    id: row.id,
    runDate: row.run_date,
    gatewaySucceededGbp: toNumber(row.gateway_succeeded_gbp),
    ledgerEscrowCreditGbp: toNumber(row.ledger_escrow_credit_gbp),
    ledgerPlatformRevenueGbp: toNumber(row.ledger_platform_revenue_gbp),
    payoutRequestedGbp: toNumber(row.payout_requested_gbp),
    payoutPaidGbp: toNumber(row.payout_paid_gbp),
    mismatchGbp: toNumber(row.mismatch_gbp),
    status: row.status,
    payoutsAutoPaused: row.payouts_auto_paused,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function reconciliationTableAvailable(client: DbQueryable): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT to_regclass('public.daily_reconciliation_runs') IS NOT NULL AS exists
    `
  );

  return Boolean(result.rows[0]?.exists);
}

async function sumQueryByDate(
  client: DbQueryable,
  text: string,
  runDate: string
): Promise<number> {
  const result = await client.query<{ total: string | number }>(text, [runDate]);
  return roundTo(toNumber(result.rows[0]?.total), 6);
}

export async function runDailyReconciliation(
  client: DbQueryable,
  input: {
    runDate: string;
    reason: 'scheduled' | 'manual';
    mismatchThresholdGbp: number;
    criticalMismatchThresholdGbp: number;
  }
): Promise<DailyReconciliationRun> {
  if (!(await reconciliationTableAvailable(client))) {
    throw new Error('daily_reconciliation_runs table unavailable');
  }

  const runDate = input.runDate;

  const [
    gatewaySucceededGbp,
    ledgerEscrowCreditGbp,
    ledgerPlatformRevenueGbp,
    payoutRequestedGbp,
    payoutPaidGbp,
  ] = await Promise.all([
    sumQueryByDate(
      client,
      `
        SELECT COALESCE(SUM(amount_gbp), 0)::text AS total
        FROM payment_intents
        WHERE status = 'succeeded'
          AND COALESCE(settled_at, updated_at)::date = $1::date
      `,
      runDate
    ),

    sumQueryByDate(
      client,
      `
        SELECT COALESCE(SUM(amount_gbp), 0)::text AS total
        FROM ledger_entries
        WHERE source_type = 'order_payment'
          AND line_type = 'buyer_charge'
          AND direction = 'credit'
          AND created_at::date = $1::date
      `,
      runDate
    ),
    sumQueryByDate(
      client,
      `
        SELECT COALESCE(SUM(amount_gbp), 0)::text AS total
        FROM ledger_entries
        WHERE source_type = 'order_payment'
          AND direction = 'credit'
          AND line_type IN ('platform_commission_credit', 'postage_fee_credit', 'shipping_fee_credit')
          AND created_at::date = $1::date
      `,
      runDate
    ),
    sumQueryByDate(
      client,
      `
        SELECT COALESCE(SUM(amount_gbp), 0)::text AS total
        FROM payout_requests
        WHERE status IN ('requested', 'processing')
          AND created_at::date = $1::date
      `,
      runDate
    ),
    sumQueryByDate(
      client,
      `
        SELECT COALESCE(SUM(amount_gbp), 0)::text AS total
        FROM payout_requests
        WHERE status = 'paid'
          AND updated_at::date = $1::date
      `,
      runDate
    ),
  ]);

  const mismatchGbp = roundTo(gatewaySucceededGbp - ledgerEscrowCreditGbp, 6);
  const absMismatch = Math.abs(mismatchGbp);
  const variancePct = gatewaySucceededGbp > 0 ? absMismatch / gatewaySucceededGbp : 0;

  let status: ReconciliationStatus = 'ok';
  // 0.5% variance threshold = 0.005
  if (variancePct > 0.005 || absMismatch > Math.max(0, input.criticalMismatchThresholdGbp)) {
    status = 'critical';
  } else if (absMismatch > Math.max(0, input.mismatchThresholdGbp)) {
    status = 'mismatch';
  }

  const payoutsAutoPaused = status === 'critical';

  const inserted = await client.query<DailyReconciliationRunRow>(
    `
      INSERT INTO daily_reconciliation_runs (
        id,
        run_date,
        gateway_succeeded_gbp,
        ledger_escrow_credit_gbp,
        ledger_platform_revenue_gbp,
        payout_requested_gbp,
        payout_paid_gbp,
        mismatch_gbp,
        status,
        payouts_auto_paused,
        metadata
      )
      VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      ON CONFLICT (run_date)
      DO UPDATE
        SET
          gateway_succeeded_gbp = EXCLUDED.gateway_succeeded_gbp,
          ledger_escrow_credit_gbp = EXCLUDED.ledger_escrow_credit_gbp,
          ledger_platform_revenue_gbp = EXCLUDED.ledger_platform_revenue_gbp,
          payout_requested_gbp = EXCLUDED.payout_requested_gbp,
          payout_paid_gbp = EXCLUDED.payout_paid_gbp,
          mismatch_gbp = EXCLUDED.mismatch_gbp,
          status = EXCLUDED.status,
          payouts_auto_paused = EXCLUDED.payouts_auto_paused,
          metadata = COALESCE(daily_reconciliation_runs.metadata, '{}'::jsonb) || EXCLUDED.metadata,
          updated_at = NOW()
      RETURNING
        id,
        run_date::text,
        gateway_succeeded_gbp::text,
        ledger_escrow_credit_gbp::text,
        ledger_platform_revenue_gbp::text,
        payout_requested_gbp::text,
        payout_paid_gbp::text,
        mismatch_gbp::text,
        status,
        payouts_auto_paused,
        metadata,
        created_at::text,
        updated_at::text
    `,
    [
      `rec_${runDate.replace(/-/g, '')}_${crypto.randomUUID().slice(0, 8)}`,
      runDate,
      gatewaySucceededGbp,
      ledgerEscrowCreditGbp,
      ledgerPlatformRevenueGbp,
      payoutRequestedGbp,
      payoutPaidGbp,
      mismatchGbp,
      status,
      payoutsAutoPaused,
      JSON.stringify({
        reason: input.reason,
        mismatchThresholdGbp: input.mismatchThresholdGbp,
        criticalMismatchThresholdGbp: input.criticalMismatchThresholdGbp,
        computedAt: new Date().toISOString(),
      }),
    ]
  );

  return toRunPayload(inserted.rows[0]);
}

export async function getLatestReconciliationRun(
  client: DbQueryable
): Promise<DailyReconciliationRun | null> {
  if (!(await reconciliationTableAvailable(client))) {
    return null;
  }

  const result = await client.query<DailyReconciliationRunRow>(
    `
      SELECT
        id,
        run_date::text,
        gateway_succeeded_gbp::text,
        ledger_escrow_credit_gbp::text,
        ledger_platform_revenue_gbp::text,
        payout_requested_gbp::text,
        payout_paid_gbp::text,
        mismatch_gbp::text,
        status,
        payouts_auto_paused,
        metadata,
        created_at::text,
        updated_at::text
      FROM daily_reconciliation_runs
      ORDER BY run_date DESC
      LIMIT 1
    `
  );

  return result.rows[0] ? toRunPayload(result.rows[0]) : null;
}

// ── Per-intent reconciliation ───────────────────────────────────────────
// Catches compensating errors that net to zero in the daily aggregate.
// Each succeeded payment_intent is matched against its ledger_entries
// (buyer_charge credit). Mismatches are stored for drill-down.

export type PerIntentReconciliationStatus = 'matched' | 'mismatch' | 'missing_ledger' | 'missing_intent';

export interface PerIntentReconciliationItem {
  id: string;
  runDate: string;
  intentId: string;
  gatewayId: string;
  intentAmountGbp: number;
  ledgerAmountGbp: number;
  mismatchGbp: number;
  status: PerIntentReconciliationStatus;
  createdAt: string;
}

interface PerIntentReconciliationItemRow {
  id: string;
  run_date: string;
  intent_id: string;
  gateway_id: string;
  intent_amount_gbp: string | number;
  ledger_amount_gbp: string | number;
  mismatch_gbp: string | number;
  status: PerIntentReconciliationStatus;
  created_at: string;
}

export async function perIntentReconciliationTableAvailable(
  client: DbQueryable
): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT to_regclass('public.payment_reconciliation_items') IS NOT NULL AS exists`
  );
  return Boolean(result.rows[0]?.exists);
}

export async function runPerIntentReconciliation(
  client: DbQueryable,
  input: { runDate: string; mismatchThresholdGbp: number }
): Promise<{ items: PerIntentReconciliationItem[]; mismatchCount: number }> {
  if (!(await perIntentReconciliationTableAvailable(client))) {
    throw new Error('payment_reconciliation_items table unavailable');
  }

  // Match each succeeded payment_intent settled on runDate against the
  // sum of its ledger_entries (buyer_charge credit). Flag per-intent
  // mismatches rather than relying on daily totals alone.
  const result = await client.query<{
    intent_id: string;
    gateway_id: string;
    intent_amount_gbp: string | number;
    ledger_amount_gbp: string | number;
    mismatch_gbp: string | number;
    status: PerIntentReconciliationStatus;
  }>(
    `
      WITH succeeded_intents AS (
        SELECT
          i.id AS intent_id,
          i.gateway_id,
          COALESCE(i.amount_gbp, 0) AS intent_amount_gbp
        FROM payment_intents i
        WHERE i.status = 'succeeded'
          AND COALESCE(i.settled_at, i.updated_at)::date = $1::date
      ),
      ledger_totals AS (
        SELECT
          source_id AS intent_id,
          SUM(amount_gbp) AS ledger_amount_gbp
        FROM ledger_entries
        WHERE source_type = 'order_payment'
          AND line_type = 'buyer_charge'
          AND direction = 'credit'
          AND created_at::date = $1::date
        GROUP BY source_id
      )
      SELECT
        si.intent_id,
        si.gateway_id,
        si.intent_amount_gbp::text,
        COALESCE(lt.ledger_amount_gbp, 0)::text AS ledger_amount_gbp,
        (si.intent_amount_gbp - COALESCE(lt.ledger_amount_gbp, 0))::text AS mismatch_gbp,
        CASE
          WHEN lt.ledger_amount_gbp IS NULL THEN 'missing_ledger'
          WHEN ABS(si.intent_amount_gbp - lt.ledger_amount_gbp) > $2 THEN 'mismatch'
          ELSE 'matched'
        END AS status
      FROM succeeded_intents si
      LEFT JOIN ledger_totals lt ON lt.intent_id = si.intent_id
    `,
    [input.runDate, input.mismatchThresholdGbp]
  );

  const items: PerIntentReconciliationItem[] = [];
  for (const row of result.rows) {
    const intentAmount = toNumber(row.intent_amount_gbp);
    const ledgerAmount = toNumber(row.ledger_amount_gbp);
    const mismatch = roundTo(intentAmount - ledgerAmount, 6);
    const status = row.status;

    items.push({
      id: `pri_${input.runDate.replace(/-/g, '')}_${row.intent_id}`,
      runDate: input.runDate,
      intentId: row.intent_id,
      gatewayId: row.gateway_id,
      intentAmountGbp: intentAmount,
      ledgerAmountGbp: ledgerAmount,
      mismatchGbp: mismatch,
      status,
      createdAt: new Date().toISOString(),
    });
  }

  // Persist items for drill-down.
  for (const item of items) {
    await client.query(
      `
        INSERT INTO payment_reconciliation_items (
          id, run_date, intent_id, gateway_id,
          intent_amount_gbp, ledger_amount_gbp, mismatch_gbp, status, created_at
        )
        VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (id) DO UPDATE
          SET status = EXCLUDED.status,
              mismatch_gbp = EXCLUDED.mismatch_gbp,
              ledger_amount_gbp = EXCLUDED.ledger_amount_gbp,
              updated_at = NOW()
      `,
      [
        item.id,
        item.runDate,
        item.intentId,
        item.gatewayId,
        item.intentAmountGbp,
        item.ledgerAmountGbp,
        item.mismatchGbp,
        item.status,
      ]
    );
  }

  const mismatchCount = items.filter(
    (i) => i.status === 'mismatch' || i.status === 'missing_ledger'
  ).length;

  return { items, mismatchCount };
}

export async function getPerIntentReconciliationItems(
  client: DbQueryable,
  input: { runDate: string; status?: PerIntentReconciliationStatus; limit?: number }
): Promise<PerIntentReconciliationItem[]> {
  if (!(await perIntentReconciliationTableAvailable(client))) {
    return [];
  }

  const result = await client.query<PerIntentReconciliationItemRow>(
    `
      SELECT
        id,
        run_date::text,
        intent_id,
        gateway_id,
        intent_amount_gbp::text,
        ledger_amount_gbp::text,
        mismatch_gbp::text,
        status,
        created_at::text
      FROM payment_reconciliation_items
      WHERE run_date = $1::date
        AND ($2::text IS NULL OR status = $2)
      ORDER BY
        CASE status
          WHEN 'mismatch' THEN 0
          WHEN 'missing_ledger' THEN 1
          WHEN 'missing_intent' THEN 2
          ELSE 3
        END,
        ABS(mismatch_gbp) DESC
      LIMIT $3
    `,
    [input.runDate, input.status ?? null, input.limit ?? 200]
  );

  return result.rows.map((row) => ({
    id: row.id,
    runDate: row.run_date,
    intentId: row.intent_id,
    gatewayId: row.gateway_id,
    intentAmountGbp: toNumber(row.intent_amount_gbp),
    ledgerAmountGbp: toNumber(row.ledger_amount_gbp),
    mismatchGbp: toNumber(row.mismatch_gbp),
    status: row.status,
    createdAt: row.created_at,
  }));
}

// ── Three-way reconciliation (PAY-10 / PAY-11) ───────────────────────────
// Three-way reconciliation ingests external provider reports and bank
// statements, then compares them against internal ledger/journal facts.
// This closes the PAY-10 defect (internal-vs-internal only) and PAY-11
// (per-intent LEFT JOIN that could never surface missing_intent).
//
// Break cases are persisted to reconciliation_breaks for drill-down and
// resolution tracking. Safeguarding checks (FCA PS25/12) are persisted to
// safeguarding_daily_checks.

export type BreakType =
  | 'missing_internal'
  | 'missing_provider'
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'status_mismatch'
  | 'fee_mismatch'
  | 'duplicate_internal'
  | 'duplicate_provider'
  | 'timing_expected'
  | 'payout_batch_mismatch'
  | 'bank_missing'
  | 'safeguarding_shortfall'
  | 'stale_unknown';

export type BreakSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BreakStatus = 'open' | 'investigating' | 'resolved' | 'wont_fix';
export type SafeguardingStatus = 'balanced' | 'shortfall' | 'surplus' | 'incomplete';

export interface ReconciliationBreak {
  id: number;
  runId: string;
  breakType: BreakType;
  provider: string | null;
  providerObjectId: string | null;
  internalEntityType: string | null;
  internalEntityId: string | null;
  currency: string | null;
  providerAmountMinor: number | null;
  internalAmountMinor: number | null;
  differenceMinor: number | null;
  severity: BreakSeverity;
  status: BreakStatus;
  evidence: Record<string, unknown>;
  dueAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface SafeguardingCheck {
  id: number;
  checkDate: string;
  internalLiabilityMinor: number;
  safeguardedBalanceMinor: number;
  differenceMinor: number;
  status: SafeguardingStatus;
  evidence: Record<string, unknown>;
  checkedAt: string;
}

export interface ThreeWayReconciliationResult {
  runId: string;
  runDate: string;
  providerFactCount: number;
  internalFactCount: number;
  bankFactCount: number;
  breakCount: number;
  breaksBySeverity: Record<BreakSeverity, number>;
  breaksByType: Record<BreakType, number>;
  incomplete: boolean;
  status: ReconciliationStatus;
}

// ── Row types ────────────────────────────────────────────────────────────

interface ProviderFactRow {
  provider: string;
  provider_object_id: string;
  provider_object_type: string;
  currency: string;
  gross_minor: string | number | null;
  fee_minor: string | number | null;
  net_minor: string | number | null;
  available_on: string;
}

interface InternalFactRow {
  provider_object_id: string;
  internal_entity_type: string;
  internal_entity_id: string;
  currency: string;
  amount_minor: string | number;
}

interface BankFactRow {
  source: string;
  reference: string;
  transaction_date: string;
  currency: string;
  amount_minor: string | number | null;
  description: string | null;
  matched_provider_object_id: string | null;
}

interface ReconciliationBreakRow {
  id: number;
  run_id: string;
  break_type: BreakType;
  provider: string | null;
  provider_object_id: string | null;
  internal_entity_type: string | null;
  internal_entity_id: string | null;
  currency: string | null;
  provider_amount_minor: string | number | null;
  internal_amount_minor: string | number | null;
  difference_minor: string | number | null;
  severity: BreakSeverity;
  status: BreakStatus;
  evidence: Record<string, unknown>;
  due_at: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface SafeguardingCheckRow {
  id: number;
  check_date: string;
  internal_liability_minor: string | number;
  safeguarded_balance_minor: string | number;
  difference_minor: string | number;
  status: SafeguardingStatus;
  evidence: Record<string, unknown>;
  checked_at: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function tableExists(client: DbQueryable, tableName: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${tableName}`]
  );
  return Boolean(result.rows[0]?.exists);
}

function emptyBreaksBySeverity(): Record<BreakSeverity, number> {
  return { low: 0, medium: 0, high: 0, critical: 0 };
}

function emptyBreaksByType(): Record<BreakType, number> {
  return {
    missing_internal: 0,
    missing_provider: 0,
    amount_mismatch: 0,
    currency_mismatch: 0,
    status_mismatch: 0,
    fee_mismatch: 0,
    duplicate_internal: 0,
    duplicate_provider: 0,
    timing_expected: 0,
    payout_batch_mismatch: 0,
    bank_missing: 0,
    safeguarding_shortfall: 0,
    stale_unknown: 0,
  };
}

/**
 * Classify the severity of a break case from its type and the absolute
 * difference in minor units. Thresholds are expressed in minor units of the
 * reporting currency (e.g. pence for GBP).
 */
function classifySeverity(breakType: BreakType, differenceMinor: number): BreakSeverity {
  const absDiff = Math.abs(differenceMinor);
  switch (breakType) {
    case 'missing_internal':
      return absDiff >= 100000 ? 'critical' : absDiff >= 10000 ? 'high' : 'medium';
    case 'missing_provider':
      return absDiff >= 100000 ? 'high' : 'medium';
    case 'amount_mismatch':
      return absDiff >= 100000 ? 'high' : absDiff >= 1000 ? 'medium' : 'low';
    case 'currency_mismatch':
      return 'high';
    case 'fee_mismatch':
      return absDiff >= 10000 ? 'high' : 'medium';
    case 'duplicate_internal':
    case 'duplicate_provider':
      return absDiff >= 10000 ? 'high' : 'medium';
    case 'bank_missing':
      return absDiff >= 100000 ? 'critical' : 'high';
    case 'safeguarding_shortfall':
      return 'critical';
    case 'payout_batch_mismatch':
      return absDiff >= 10000 ? 'high' : 'medium';
    case 'timing_expected':
      return 'low';
    default:
      return 'medium';
  }
}

/** Compute an SLA due-at timestamp from the break severity. */
function dueAtForSeverity(severity: BreakSeverity, from: Date): string {
  const days =
    severity === 'critical' ? 1 :
    severity === 'high' ? 3 :
    severity === 'medium' ? 7 : 14;
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

function toBreakPayload(row: ReconciliationBreakRow): ReconciliationBreak {
  return {
    id: row.id,
    runId: row.run_id,
    breakType: row.break_type,
    provider: row.provider,
    providerObjectId: row.provider_object_id,
    internalEntityType: row.internal_entity_type,
    internalEntityId: row.internal_entity_id,
    currency: row.currency,
    providerAmountMinor: row.provider_amount_minor == null ? null : toNumber(row.provider_amount_minor),
    internalAmountMinor: row.internal_amount_minor == null ? null : toNumber(row.internal_amount_minor),
    differenceMinor: row.difference_minor == null ? null : toNumber(row.difference_minor),
    severity: row.severity,
    status: row.status,
    evidence: row.evidence ?? {},
    dueAt: row.due_at,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function toSafeguardingPayload(row: SafeguardingCheckRow): SafeguardingCheck {
  return {
    id: row.id,
    checkDate: row.check_date,
    internalLiabilityMinor: toNumber(row.internal_liability_minor),
    safeguardedBalanceMinor: toNumber(row.safeguarded_balance_minor),
    differenceMinor: toNumber(row.difference_minor),
    status: row.status,
    evidence: row.evidence ?? {},
    checkedAt: row.checked_at,
  };
}

// ── Break candidate (pre-insert) ─────────────────────────────────────────

interface BreakCandidate {
  breakType: BreakType;
  provider: string | null;
  providerObjectId: string | null;
  internalEntityType: string | null;
  internalEntityId: string | null;
  currency: string | null;
  providerAmountMinor: number | null;
  internalAmountMinor: number | null;
  differenceMinor: number | null;
  evidence: Record<string, unknown>;
}

/**
 * Run a three-way reconciliation across provider reports, internal ledger
 * facts and bank statements for the supplied date range.
 *
 * Fixes PAY-10 (internal-vs-internal only) by ingesting external provider
 * reports and bank facts, and PAY-11 by using FULL OUTER JOIN semantics so
 * that both `missing_internal` and `missing_provider` breaks can surface.
 *
 * Break cases are persisted to `reconciliation_breaks`. The result is marked
 * `incomplete` when any required table is missing or an ingestion step fails.
 *
 * Evidence payloads never include raw provider objects, bank descriptions or
 * PII — only structural identifiers and aggregate amounts.
 */
export async function runThreeWayReconciliation(
  client: DbQueryable,
  input: { runDate: string; endDate?: string }
): Promise<ThreeWayReconciliationResult> {
  const runId = `twr_${input.runDate.replace(/-/g, '')}_${crypto.randomUUID().slice(0, 8)}`;
  const endDate = input.endDate ?? input.runDate;
  const now = new Date();

  const [providerFactsOk, bankFactsOk, breaksOk, journalLinesOk] = await Promise.all([
    tableExists(client, 'reconciliation_provider_facts'),
    tableExists(client, 'reconciliation_bank_facts'),
    tableExists(client, 'reconciliation_breaks'),
    tableExists(client, 'money_journal_lines'),
  ]);

  let incomplete = !providerFactsOk || !bankFactsOk || !breaksOk;

  const emptyResult: ThreeWayReconciliationResult = {
    runId,
    runDate: input.runDate,
    providerFactCount: 0,
    internalFactCount: 0,
    bankFactCount: 0,
    breakCount: 0,
    breaksBySeverity: emptyBreaksBySeverity(),
    breaksByType: emptyBreaksByType(),
    incomplete: true,
    status: 'ok',
  };

  if (!providerFactsOk || !breaksOk) {
    return emptyResult;
  }

  // ── Provider facts ───────────────────────────────────────────────────
  let providerFacts: ProviderFactRow[] = [];
  try {
    const r = await client.query<ProviderFactRow>(
      `
        SELECT
          provider,
          provider_object_id,
          provider_object_type,
          currency,
          gross_minor::text,
          fee_minor::text,
          net_minor::text,
          available_on::text
        FROM reconciliation_provider_facts
        WHERE available_on::date BETWEEN $1::date AND $2::date
        ORDER BY provider_object_id
      `,
      [input.runDate, endDate]
    );
    providerFacts = r.rows;
  } catch {
    incomplete = true;
  }

  // ── Internal facts ───────────────────────────────────────────────────
  // Prefer the double-entry money journal kernel when available; fall back
  // to legacy ledger_entries so the function works pre-migration.
  let internalFacts: InternalFactRow[] = [];
  try {
    if (journalLinesOk) {
      const r = await client.query<InternalFactRow>(
        `
          SELECT
            mj.reference AS provider_object_id,
            mj.source_type AS internal_entity_type,
            mj.id::text AS internal_entity_id,
            mjl.currency,
            SUM(mjl.amount_minor)::text AS amount_minor
          FROM money_journals mj
          JOIN money_journal_lines mjl ON mjl.journal_id = mj.id
          WHERE mjl.account_type = 'buyer_order_liability'
            AND mj.posted_at::date BETWEEN $1::date AND $2::date
          GROUP BY mj.reference, mj.source_type, mj.id, mjl.currency
        `,
        [input.runDate, endDate]
      );
      internalFacts = r.rows;
    } else {
      const r = await client.query<InternalFactRow>(
        `
          SELECT
            i.gateway_id AS provider_object_id,
            'payment_intent' AS internal_entity_type,
            i.id AS internal_entity_id,
            'GBP' AS currency,
            (SUM(le.amount_gbp) * 100)::bigint::text AS amount_minor
          FROM payment_intents i
          JOIN ledger_entries le
            ON le.source_id = i.id
           AND le.source_type = 'order_payment'
          WHERE le.line_type = 'buyer_charge'
            AND le.direction = 'credit'
            AND COALESCE(i.settled_at, i.updated_at)::date
                BETWEEN $1::date AND $2::date
          GROUP BY i.gateway_id, i.id
        `,
        [input.runDate, endDate]
      );
      internalFacts = r.rows;
    }
  } catch {
    incomplete = true;
  }

  // ── Bank facts ───────────────────────────────────────────────────────
  let bankFacts: BankFactRow[] = [];
  if (bankFactsOk) {
    try {
      const r = await client.query<BankFactRow>(
        `
          SELECT
            source,
            reference,
            transaction_date::text,
            currency,
            amount_minor::text,
            description,
            matched_provider_object_id
          FROM reconciliation_bank_facts
          WHERE transaction_date::date BETWEEN $1::date AND $2::date
          ORDER BY reference
        `,
        [input.runDate, endDate]
      );
      bankFacts = r.rows;
    } catch {
      incomplete = true;
    }
  }

  // ── FULL OUTER JOIN: provider vs internal ────────────────────────────
  // Performed in JS so that both sides can surface breaks (PAY-11 fix).
  const providerMap = new Map<string, ProviderFactRow[]>();
  for (const pf of providerFacts) {
    const arr = providerMap.get(pf.provider_object_id) ?? [];
    arr.push(pf);
    providerMap.set(pf.provider_object_id, arr);
  }

  const internalMap = new Map<string, InternalFactRow[]>();
  for (const inf of internalFacts) {
    const arr = internalMap.get(inf.provider_object_id) ?? [];
    arr.push(inf);
    internalMap.set(inf.provider_object_id, arr);
  }

  const candidates: BreakCandidate[] = [];

  for (const key of new Set<string>([...providerMap.keys(), ...internalMap.keys()])) {
    const pfs = providerMap.get(key) ?? [];
    const infs = internalMap.get(key) ?? [];

    if (pfs.length > 1) {
      candidates.push({
        breakType: 'duplicate_provider',
        provider: pfs[0].provider,
        providerObjectId: key,
        internalEntityType: null,
        internalEntityId: null,
        currency: pfs[0].currency,
        providerAmountMinor: toNumber(pfs[0].net_minor),
        internalAmountMinor: null,
        differenceMinor: toNumber(pfs[0].net_minor),
        evidence: {
          provider: pfs[0].provider,
          providerObjectType: pfs[0].provider_object_type,
          duplicateCount: pfs.length,
        },
      });
    }
    if (infs.length > 1) {
      candidates.push({
        breakType: 'duplicate_internal',
        provider: null,
        providerObjectId: key,
        internalEntityType: infs[0].internal_entity_type,
        internalEntityId: infs[0].internal_entity_id,
        currency: infs[0].currency,
        providerAmountMinor: null,
        internalAmountMinor: toNumber(infs[0].amount_minor),
        differenceMinor: toNumber(infs[0].amount_minor),
        evidence: {
          internalEntityType: infs[0].internal_entity_type,
          duplicateCount: infs.length,
        },
      });
    }

    // Provider report with no matching internal record.
    if (pfs.length === 0) {
      const inf = infs[0];
      const amt = toNumber(inf.amount_minor);
      candidates.push({
        breakType: 'missing_provider',
        provider: null,
        providerObjectId: key,
        internalEntityType: inf.internal_entity_type,
        internalEntityId: inf.internal_entity_id,
        currency: inf.currency,
        providerAmountMinor: null,
        internalAmountMinor: amt,
        differenceMinor: amt,
        evidence: {
          internalEntityType: inf.internal_entity_type,
          internalEntityId: inf.internal_entity_id,
        },
      });
      continue;
    }

    // Internal record with no matching provider report.
    if (infs.length === 0) {
      const pf = pfs[0];
      const amt = toNumber(pf.gross_minor);
      candidates.push({
        breakType: 'missing_internal',
        provider: pf.provider,
        providerObjectId: key,
        internalEntityType: null,
        internalEntityId: null,
        currency: pf.currency,
        providerAmountMinor: amt,
        internalAmountMinor: null,
        differenceMinor: amt,
        evidence: {
          provider: pf.provider,
          providerObjectType: pf.provider_object_type,
          availableOn: pf.available_on,
        },
      });
      continue;
    }

    // Both sides present — compare amounts and currency.
    const pf = pfs[0];
    const inf = infs[0];
    const gross = toNumber(pf.gross_minor);
    const fee = toNumber(pf.fee_minor);
    const net = toNumber(pf.net_minor);
    const internalAmt = toNumber(inf.amount_minor);

    if (pf.currency !== inf.currency) {
      candidates.push({
        breakType: 'currency_mismatch',
        provider: pf.provider,
        providerObjectId: key,
        internalEntityType: inf.internal_entity_type,
        internalEntityId: inf.internal_entity_id,
        currency: pf.currency,
        providerAmountMinor: gross,
        internalAmountMinor: internalAmt,
        differenceMinor: 0,
        evidence: { providerCurrency: pf.currency, internalCurrency: inf.currency },
      });
    }

    const amountDiff = gross - internalAmt;
    if (amountDiff !== 0) {
      candidates.push({
        breakType: 'amount_mismatch',
        provider: pf.provider,
        providerObjectId: key,
        internalEntityType: inf.internal_entity_type,
        internalEntityId: inf.internal_entity_id,
        currency: pf.currency,
        providerAmountMinor: gross,
        internalAmountMinor: internalAmt,
        differenceMinor: amountDiff,
        evidence: {
          providerGrossMinor: gross,
          providerNetMinor: net,
          internalAmountMinor: internalAmt,
        },
      });
    }

    // Verify provider arithmetic: net should equal gross - fee.
    if (fee > 0 && gross - fee - net !== 0) {
      candidates.push({
        breakType: 'fee_mismatch',
        provider: pf.provider,
        providerObjectId: key,
        internalEntityType: null,
        internalEntityId: null,
        currency: pf.currency,
        providerAmountMinor: net,
        internalAmountMinor: gross - fee,
        differenceMinor: gross - fee - net,
        evidence: {
          providerGrossMinor: gross,
          providerFeeMinor: fee,
          providerNetMinor: net,
        },
      });
    }
  }

  // ── Bank vs provider payout facts ────────────────────────────────────
  if (bankFactsOk) {
    const bankRefs = new Set<string>();
    for (const b of bankFacts) {
      if (b.matched_provider_object_id) bankRefs.add(b.matched_provider_object_id);
      if (b.reference) bankRefs.add(b.reference);
    }
    for (const pf of providerFacts) {
      if (pf.provider_object_type === 'payout' && !bankRefs.has(pf.provider_object_id)) {
        const amt = toNumber(pf.net_minor);
        candidates.push({
          breakType: 'bank_missing',
          provider: pf.provider,
          providerObjectId: pf.provider_object_id,
          internalEntityType: null,
          internalEntityId: null,
          currency: pf.currency,
          providerAmountMinor: amt,
          internalAmountMinor: null,
          differenceMinor: amt,
          evidence: {
            provider: pf.provider,
            providerObjectType: 'payout',
            availableOn: pf.available_on,
          },
        });
      }
    }
  }

  // ── Persist breaks ───────────────────────────────────────────────────
  const breaksBySeverity = emptyBreaksBySeverity();
  const breaksByType = emptyBreaksByType();

  for (const c of candidates) {
    const severity = classifySeverity(c.breakType, c.differenceMinor ?? 0);
    breaksBySeverity[severity] += 1;
    breaksByType[c.breakType] += 1;
    try {
      await client.query(
        `
          INSERT INTO reconciliation_breaks (
            run_id, break_type, provider, provider_object_id,
            internal_entity_type, internal_entity_id, currency,
            provider_amount_minor, internal_amount_minor, difference_minor,
            severity, status, evidence, due_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)
        `,
        [
          runId,
          c.breakType,
          c.provider,
          c.providerObjectId,
          c.internalEntityType,
          c.internalEntityId,
          c.currency,
          c.providerAmountMinor,
          c.internalAmountMinor,
          c.differenceMinor,
          severity,
          'open',
          JSON.stringify(c.evidence),
          dueAtForSeverity(severity, now),
        ]
      );
    } catch {
      incomplete = true;
    }
  }

  const breakCount = candidates.length;
  let status: ReconciliationStatus = 'ok';
  if (breaksBySeverity.critical > 0) {
    status = 'critical';
  } else if (breakCount > 0) {
    status = 'mismatch';
  }

  return {
    runId,
    runDate: input.runDate,
    providerFactCount: providerFacts.length,
    internalFactCount: internalFacts.length,
    bankFactCount: bankFacts.length,
    breakCount,
    breaksBySeverity,
    breaksByType,
    incomplete,
    status,
  };
}

/**
 * Run the FCA PS25/12 daily safeguarding check.
 *
 * Sums internal customer-money liabilities (buyer_order_liability,
 * seller_payable, seller_reserve_liability, payout_pending_liability) and
 * compares them against the safeguarded account balance reported in
 * `reconciliation_bank_facts`. The result is persisted to
 * `safeguarding_daily_checks` (upsert on check_date).
 *
 * Falls back to `ledger_entries` when `money_journal_lines` is unavailable.
 * Returns a `SafeguardingCheck` with status `incomplete` when the
 * safeguarding balance could not be retrieved.
 */
export async function runSafeguardingCheck(
  client: DbQueryable,
  input: { checkDate: string }
): Promise<SafeguardingCheck> {
  const [bankFactsOk, checksOk, journalLinesOk] = await Promise.all([
    tableExists(client, 'reconciliation_bank_facts'),
    tableExists(client, 'safeguarding_daily_checks'),
    tableExists(client, 'money_journal_lines'),
  ]);

  if (!checksOk) {
    throw new Error('safeguarding_daily_checks table unavailable');
  }

  // ── Internal liabilities ─────────────────────────────────────────────
  let internalLiabilityMinor = 0;
  let liabilitySource = 'unknown';
  try {
    if (journalLinesOk) {
      const r = await client.query<{ total: string | number }>(
        `
          SELECT COALESCE(SUM(amount_minor), 0)::text AS total
          FROM money_journal_lines
          WHERE account_type IN (
            'buyer_order_liability',
            'seller_payable',
            'seller_reserve_liability',
            'payout_pending_liability'
          )
        `
      );
      internalLiabilityMinor = toNumber(r.rows[0]?.total);
      liabilitySource = 'money_journal_lines';
    } else {
      const r = await client.query<{ total: string | number }>(
        `
          SELECT COALESCE(
            SUM(CASE WHEN direction = 'credit' THEN amount_gbp
                     ELSE -amount_gbp END), 0
          ) * 100 AS total
          FROM ledger_entries
          WHERE line_type IN (
            'buyer_charge', 'seller_payable', 'seller_reserve', 'payout_pending'
          )
        `
      );
      internalLiabilityMinor = roundTo(toNumber(r.rows[0]?.total), 0);
      liabilitySource = 'ledger_entries';
    }
  } catch {
    liabilitySource = 'unknown';
  }

  // ── Safeguarded balance ──────────────────────────────────────────────
  let safeguardedBalanceMinor = 0;
  let safeguardingAvailable = false;
  if (bankFactsOk) {
    try {
      const r = await client.query<{ total: string | number | null }>(
        `
          SELECT COALESCE(SUM(amount_minor), 0)::text AS total
          FROM reconciliation_bank_facts
          WHERE source = 'safeguarding_account'
            AND transaction_date::date = $1::date
        `,
        [input.checkDate]
      );
      safeguardedBalanceMinor = toNumber(r.rows[0]?.total);
      safeguardingAvailable = true;
    } catch {
      safeguardingAvailable = false;
    }
  }

  const differenceMinor = roundTo(safeguardedBalanceMinor - internalLiabilityMinor, 0);

  let status: SafeguardingStatus;
  if (!safeguardingAvailable || liabilitySource === 'unknown') {
    status = 'incomplete';
  } else if (differenceMinor === 0) {
    status = 'balanced';
  } else if (differenceMinor < 0) {
    status = 'shortfall';
  } else {
    status = 'surplus';
  }

  // Evidence contains only structural metadata — no bank account numbers
  // or transaction descriptions.
  const evidence: Record<string, unknown> = {
    liabilitySource,
    safeguardingAvailable,
    checkDate: input.checkDate,
  };

  const inserted = await client.query<SafeguardingCheckRow>(
    `
      INSERT INTO safeguarding_daily_checks (
        check_date, internal_liability_minor, safeguarded_balance_minor,
        difference_minor, status, evidence, checked_at
      )
      VALUES ($1::date, $2, $3, $4, $5, $6::jsonb, NOW())
      ON CONFLICT (check_date)
      DO UPDATE
        SET internal_liability_minor = EXCLUDED.internal_liability_minor,
            safeguarded_balance_minor = EXCLUDED.safeguarded_balance_minor,
            difference_minor = EXCLUDED.difference_minor,
            status = EXCLUDED.status,
            evidence = EXCLUDED.evidence,
            checked_at = NOW()
      RETURNING
        id,
        check_date::text,
        internal_liability_minor::text,
        safeguarded_balance_minor::text,
        difference_minor::text,
        status,
        evidence,
        checked_at::text
    `,
    [
      input.checkDate,
      internalLiabilityMinor,
      safeguardedBalanceMinor,
      differenceMinor,
      status,
      JSON.stringify(evidence),
    ]
  );

  return toSafeguardingPayload(inserted.rows[0]);
}

/**
 * Retrieve persisted reconciliation break cases with optional filters.
 *
 * Results are ordered by severity (critical first) then by absolute
 * difference magnitude.
 */
export async function getReconciliationBreaks(
  client: DbQueryable,
  input: {
    runId?: string;
    breakType?: BreakType;
    severity?: BreakSeverity;
    status?: BreakStatus;
    limit?: number;
  }
): Promise<ReconciliationBreak[]> {
  if (!(await tableExists(client, 'reconciliation_breaks'))) {
    return [];
  }

  const result = await client.query<ReconciliationBreakRow>(
    `
      SELECT
        id,
        run_id,
        break_type,
        provider,
        provider_object_id,
        internal_entity_type,
        internal_entity_id,
        currency,
        provider_amount_minor::text,
        internal_amount_minor::text,
        difference_minor::text,
        severity,
        status,
        evidence,
        due_at::text,
        created_at::text,
        resolved_at::text
      FROM reconciliation_breaks
      WHERE ($1::text IS NULL OR run_id = $1)
        AND ($2::text IS NULL OR break_type = $2)
        AND ($3::text IS NULL OR severity = $3)
        AND ($4::text IS NULL OR status = $4)
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        ABS(difference_minor) DESC,
        created_at DESC
      LIMIT $5
    `,
    [
      input.runId ?? null,
      input.breakType ?? null,
      input.severity ?? null,
      input.status ?? null,
      input.limit ?? 200,
    ]
  );

  return result.rows.map(toBreakPayload);
}

/**
 * Retrieve persisted safeguarding daily checks within an optional date range,
 * newest first.
 */
export async function getSafeguardingChecks(
  client: DbQueryable,
  input: { fromDate?: string; toDate?: string; limit?: number }
): Promise<SafeguardingCheck[]> {
  if (!(await tableExists(client, 'safeguarding_daily_checks'))) {
    return [];
  }

  const result = await client.query<SafeguardingCheckRow>(
    `
      SELECT
        id,
        check_date::text,
        internal_liability_minor::text,
        safeguarded_balance_minor::text,
        difference_minor::text,
        status,
        evidence,
        checked_at::text
      FROM safeguarding_daily_checks
      WHERE ($1::date IS NULL OR check_date >= $1::date)
        AND ($2::date IS NULL OR check_date <= $2::date)
      ORDER BY check_date DESC
      LIMIT $3
    `,
    [input.fromDate ?? null, input.toDate ?? null, input.limit ?? 90]
  );

  return result.rows.map(toSafeguardingPayload);
}
