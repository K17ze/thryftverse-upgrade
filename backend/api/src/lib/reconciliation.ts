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
