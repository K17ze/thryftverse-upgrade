/**
 * PKG-03 regression coverage — Co-Own DRIP settlement economics.
 *
 * Invariants under test (each fails on the pre-fix behavior):
 *
 *   FIN-02 — the GBP→1ZE conversion goes through the versioned settlement
 *     quote (GBP → USD anchor at par → 1ZE minor units), NOT a raw ×1000
 *     milli-GBP assumption. With anchor USD=1 and USD→GBP=0.8 the correct
 *     rate is 1250 1ZE-units per £1; the old code debited 1000.
 *
 *   FIN-05 — the DRIP debit/credit run through the segment-aware primitive:
 *     'earned' drains before 'purchased', issuer proceeds land in 'earned',
 *     and oneze_wallet_segments stays exactly equal to the wallet balance.
 *
 *   FIN-06 — a missing issuer wallet must fail the distribution honestly:
 *     status 'reinvest_failed', NO trade row, NO buyer debit committed. The
 *     old code committed the buyer debit and skipped the credit, leaving an
 *     unbalanced settled trade.
 *
 *   FIN-05b — the retained-cash decision is reservation-aware: balance
 *     committed to other live order reservations is not spendable.
 *
 *   SEP20-FIN-13 — the standalone failure marker is atomic: a fault between
 *     the status UPDATE and the outbox append rolls back BOTH, leaving the
 *     distribution 'settled' for the next pass instead of a terminal failed
 *     row with no receipt.
 *
 * The fake DB stages writes per transaction and applies them atomically at
 * COMMIT, so the atomicity assertions are honest.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgres://test:test@127.0.0.1:5432/test';

const { processCoOwnDripReinvestment } = await import(
  '../workers/handlers/coOwnDripExecutionHandler.js'
);
const { db } = await import('../db/pool.js');
const { debitCoOwnOnezeUnits, creditCoOwnOnezeUnits } = await import(
  '../lib/coOwnSettlement.js'
);
const { computeCoOwnSettlementUnits } = await import('../lib/pricingEngine.js');

// ─── Fake database ──────────────────────────────────────────────────────────

interface WalletRow {
  id: string;
  user_id: string;
  oneze_balance_units: string;
  fiat_balance_minor: string;
  fiat_currency: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface SegmentRow {
  wallet_id: string;
  purchased_balance_units: string;
  earned_balance_units: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface DistributionRow {
  id: string;
  asset_id: string;
  recipient_user_id: string;
  amount_gbp_minor: string;
  status: string;
  reference: string | null;
  settled_at: string | null;
  reinvest_attempts?: number;
}

interface AssetRow {
  id: string;
  issuer_id: string;
  total_units: number;
  available_units: number;
  unit_price_gbp: string;
  appraisal_value_gbp: string | null;
  is_open: boolean;
  total_traded_value_gbp: string;
  holders: number;
  created_at: string;
  lockup_end_date: string | null;
  lockup_months: number | null;
}

interface HoldingRow {
  user_id: string;
  asset_id: string;
  units_owned: number;
  avg_entry_price_gbp: string;
  realized_pnl_gbp: string;
}

interface TradeRow {
  id: string;
  asset_id: string;
  buyer_id: string;
  seller_id: string;
  units: number;
  unit_price_gbp: string;
  notional_gbp: string;
  fee_gbp: string;
  settlement_status: string;
  created_seq: number;
}

interface OutboxRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  event_version: number;
  payload: Record<string, unknown>;
  actor_id: string | null;
  deduplication_key: string;
  idempotency_key: string | null;
  status: string;
  attempts: number;
}

interface State {
  wallets: WalletRow[];
  segments: SegmentRow[];
  ledger: Array<Record<string, unknown>>;
  originEvents: Array<Record<string, unknown>>;
  reservations: Array<{
    id: string;
    user_id: string;
    status: string;
    reserved_1ze_units: string;
    placed_order_id: string | null;
    expires_at_ms: number | null;
  }>;
  distributions: DistributionRow[];
  dripEnrollments: Array<{ user_id: string; asset_id: string; enrolled: boolean }>;
  assets: AssetRow[];
  holdings: HoldingRow[];
  trades: TradeRow[];
  outbox: OutboxRow[];
}

interface FakeHooks {
  /** Throw when a normalized SQL contains any of these substrings. */
  failOn?: string[];
  onQuery?: (sql: string, values: unknown[] | undefined) => void;
}

function clone(state: State): State {
  return JSON.parse(JSON.stringify(state)) as State;
}

function walletRow(userId: string, balanceUnits: number): WalletRow {
  return {
    id: `wal_${userId}`,
    user_id: userId,
    oneze_balance_units: String(balanceUnits),
    fiat_balance_minor: '0',
    fiat_currency: 'GBP',
    version: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function segmentRow(walletId: string, purchased: number, earned: number): SegmentRow {
  return {
    wallet_id: walletId,
    purchased_balance_units: String(purchased),
    earned_balance_units: String(earned),
    metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function segmentReturning(row: SegmentRow) {
  return { ...row };
}

function createFakeDb(initial: State, hooks: FakeHooks = {}) {
  const committed = clone(initial);
  let tradeSeq = committed.trades.length;
  let outboxSeq = committed.outbox.length;
  let staging: State | null = null;
  const issued: string[] = [];

  const S = () => staging ?? committed;

  async function query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }> {
    const sql = text.replace(/\s+/g, ' ').trim();
    issued.push(sql);
    for (const needle of hooks.failOn ?? []) {
      if (sql.includes(needle)) {
        throw Object.assign(new Error(`injected failure: ${needle}`), {
          code: 'XX999',
        });
      }
    }
    hooks.onQuery?.(sql, values);

    if (sql === 'BEGIN') {
      staging = clone(committed);
      return { rows: [], rowCount: 0 };
    }
    if (sql === 'COMMIT') {
      if (staging) {
        Object.assign(committed, staging);
        staging = null;
      }
      return { rows: [], rowCount: 0 };
    }
    if (sql === 'ROLLBACK') {
      staging = null;
      return { rows: [], rowCount: 0 };
    }

    const state = S();

    // ── Batch snapshot (db.query, outside tx) ──
    if (sql.includes('FROM coOwn_drip_enrollments')) {
      const rows = state.dripEnrollments
        .filter((e) => e.enrolled)
        .flatMap((e) =>
          state.distributions
            .filter(
              (d) =>
                d.asset_id === e.asset_id &&
                d.recipient_user_id === e.user_id &&
                d.status === 'settled' &&
                d.settled_at != null,
            )
            .map((d) => ({
              user_id: e.user_id,
              asset_id: e.asset_id,
              distribution_id: d.id,
              amount_gbp_minor: d.amount_gbp_minor,
            })),
        );
      return { rows: rows as T[], rowCount: rows.length };
    }

    // ── Distribution lock / status updates ──
    if (sql.startsWith('SELECT id FROM coOwn_distributions') && sql.includes('FOR UPDATE')) {
      const dist = state.distributions.find(
        (d) => d.id === values![0] && d.status === 'settled',
      );
      return { rows: (dist ? [{ id: dist.id }] : []) as T[], rowCount: dist ? 1 : 0 };
    }
    if (sql.startsWith('UPDATE coOwn_distributions')) {
      const dist = state.distributions.find((d) => d.id === values![0]);
      if (!dist) return { rows: [], rowCount: 0 };
      // Bounded-retry bump: SET reinvest_attempts = reinvest_attempts + 1
      // ... RETURNING reinvest_attempts (no status/reference mutation).
      if (sql.includes('reinvest_attempts = reinvest_attempts + 1')) {
        dist.reinvest_attempts = (dist.reinvest_attempts ?? 0) + 1;
        return {
          rows: [{ reinvest_attempts: dist.reinvest_attempts }] as T[],
          rowCount: 1,
        };
      }
      const status = sql.match(/status = '([a-z_]+)'/)?.[1];
      // The standalone marker guards AND status = 'settled'.
      if (sql.includes("AND status = 'settled'") && dist.status !== 'settled') {
        return { rows: [], rowCount: 0 };
      }
      if (status) dist.status = status;
      dist.reference = String(values![1]);
      return { rows: [], rowCount: 1 };
    }

    // ── Assets ──
    if (sql.startsWith('SELECT id, issuer_id, total_units, available_units') && sql.includes('FOR UPDATE')) {
      const asset = state.assets.find((a) => a.id === values![0]);
      return {
        rows: (asset
          ? [{
              id: asset.id,
              issuer_id: asset.issuer_id,
              total_units: asset.total_units,
              available_units: asset.available_units,
              unit_price_gbp: asset.unit_price_gbp,
              is_open: asset.is_open,
            }]
          : []) as T[],
        rowCount: asset ? 1 : 0,
      };
    }
    if (sql.startsWith('UPDATE coOwn_assets SET available_units')) {
      const asset = state.assets.find((a) => a.id === values![0]);
      if (asset) {
        asset.available_units -= Number(values![1]);
        asset.total_traded_value_gbp = String(
          Number(asset.total_traded_value_gbp) + Number(values![2]),
        );
      }
      return { rows: [], rowCount: asset ? 1 : 0 };
    }
    if (sql.startsWith('UPDATE coOwn_assets a SET holders')) {
      const asset = state.assets.find((a) => a.id === values![0]);
      if (asset) {
        asset.holders = state.holdings.filter(
          (h) => h.asset_id === asset.id && h.units_owned > 0,
        ).length;
      }
      return { rows: [], rowCount: asset ? 1 : 0 };
    }

    // ── Trades ──
    if (sql.includes('FROM coOwn_trades') && sql.includes("settlement_status = 'settled'")) {
      const settled = state.trades
        .filter((t) => t.asset_id === values![0] && t.settlement_status === 'settled')
        .sort((a, b) => b.created_seq - a.created_seq);
      const last = settled[0];
      return {
        rows: (last
          ? [{ id: last.id, unit_price_gbp: last.unit_price_gbp }]
          : []) as T[],
        rowCount: last ? 1 : 0,
      };
    }
    if (sql.startsWith('INSERT INTO coOwn_trades')) {
      tradeSeq += 1;
      const row: TradeRow = {
        id: `trade_${tradeSeq}`,
        asset_id: String(values![0]),
        buyer_id: String(values![1]),
        seller_id: String(values![2]),
        units: Number(values![3]),
        unit_price_gbp: String(values![4]),
        notional_gbp: String(values![5]),
        fee_gbp: '0',
        settlement_status: 'settled',
        created_seq: tradeSeq,
      };
      state.trades.push(row);
      return { rows: [{ id: row.id }] as T[], rowCount: 1 };
    }

    // ── Holdings ──
    // Covers both the unlocked headroom estimate read and the canonical
    // FOR UPDATE re-verification — same row lookup either way.
    if (sql.includes('FROM coOwn_holdings')) {
      const h = state.holdings.find(
        (x) => x.user_id === values![0] && x.asset_id === values![1],
      );
      return { rows: (h ? [{ ...h }] : []) as T[], rowCount: h ? 1 : 0 };
    }
    if (sql.startsWith('INSERT INTO coOwn_holdings')) {
      const existing = state.holdings.find(
        (x) => x.user_id === values![0] && x.asset_id === values![1],
      );
      if (existing) {
        existing.units_owned = Number(values![2]);
        existing.avg_entry_price_gbp = String(values![3]);
        existing.realized_pnl_gbp = String(values![4]);
      } else {
        state.holdings.push({
          user_id: String(values![0]),
          asset_id: String(values![1]),
          units_owned: Number(values![2]),
          avg_entry_price_gbp: String(values![3]),
          realized_pnl_gbp: String(values![4]),
        });
      }
      return { rows: [], rowCount: 1 };
    }

    // ── Pricing engine tables ──
    if (sql.includes('FROM oneze_anchor_config')) {
      return {
        rows: [{
          anchor_currency: 'USD',
          anchor_value: '1',
          notes: null,
          metadata: {},
          updated_at: '2026-01-01T00:00:00.000Z',
        }] as T[],
        rowCount: 1,
      };
    }
    if (sql.includes('FROM oneze_country_pricing_profiles')) {
      const profile = {
        country_code: 'GB',
        currency: 'GBP',
        fx_fee_bps: 150,
        load_fee_bps: 200,
        withdraw_fee_bps: 200,
        withdrawal_lock_hours: 168,
        daily_redeem_limit_ize: '500',
        weekly_redeem_limit_ize: '2000',
        is_active: true,
        metadata: {},
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      const key = String(values![0]).toUpperCase();
      const match =
        (sql.includes('WHERE currency = $1') && key === 'GBP') ||
        (sql.includes('WHERE country_code = $1') && key === 'GB');
      return { rows: (match ? [profile] : []) as T[], rowCount: match ? 1 : 0 };
    }
    if (sql.includes('FROM oneze_internal_fx_rates')) {
      const base = String(values![0]).toUpperCase();
      const quote = String(values![1]).toUpperCase();
      // USD→GBP = 0.8; GBP→USD = 1.25.
      const direct = base === 'USD' && quote === 'GBP';
      const inverse = base === 'GBP' && quote === 'USD';
      return {
        rows: (direct || inverse
          ? [{ rate: direct ? '0.8' : '1.25', source: 'test' }]
          : []) as T[],
        rowCount: direct || inverse ? 1 : 0,
      };
    }

    // ── Wallets ──
    // Canonical multi-wallet lock: both counterparty wallets in a single
    // wallet-id-ordered FOR UPDATE scan.
    if (sql.includes('FROM wallets') && sql.includes('user_id = ANY')) {
      const ids = new Set((values![0] as string[]).map(String));
      const rows = state.wallets
        .filter((w) => ids.has(w.user_id))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((w) => ({ id: w.id, user_id: w.user_id }));
      return { rows: rows as T[], rowCount: rows.length };
    }
    if (sql.includes('FROM wallets') && sql.includes('WHERE user_id = $1') && sql.includes('FOR UPDATE')) {
      const w = state.wallets.find((x) => x.user_id === values![0]);
      return { rows: (w ? [{ ...w }] : []) as T[], rowCount: w ? 1 : 0 };
    }
    if (sql.includes('FROM wallets') && sql.includes('WHERE id = $1') && sql.includes('FOR UPDATE')) {
      const w = state.wallets.find((x) => x.id === values![0]);
      return { rows: (w ? [{ ...w }] : []) as T[], rowCount: w ? 1 : 0 };
    }
    if (sql.startsWith('UPDATE wallets SET oneze_balance_units')) {
      const w = state.wallets.find((x) => x.id === values![0]);
      if (w) {
        w.oneze_balance_units = String(values![1]);
        w.version += 1;
      }
      return { rows: [], rowCount: w ? 1 : 0 };
    }

    // ── Reservations ──
    if (sql.includes('FROM coown_order_reservations')) {
      const now = Date.now();
      const rows = state.reservations
        .filter(
          (r) =>
            r.user_id === values![0] &&
            (r.status === 'active' || r.status === 'placed') &&
            (r.expires_at_ms == null || r.expires_at_ms > now),
        )
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((r) => ({
          id: r.id,
          reserved_units: r.reserved_1ze_units,
          placed_order_id: r.placed_order_id,
        }));
      return { rows: rows as T[], rowCount: rows.length };
    }

    // ── Ledger ──
    if (sql.startsWith('INSERT INTO wallet_ledger')) {
      state.ledger.push({
        wallet_id: values![0],
        tx_id: values![1],
        asset: values![2],
        amount: values![3],
        balance_after: values![4],
        kind: values![5],
        ref_type: values![6],
        ref_id: values![7],
        anchor_value_in_inr: values![8],
        metadata: values![9],
      });
      return { rows: [], rowCount: 1 };
    }

    // ── Segments ──
    if (sql.startsWith('INSERT INTO oneze_wallet_segments')) {
      const walletId = String(values![0]);
      let seg = state.segments.find((s) => s.wallet_id === walletId);
      if (!seg) {
        seg = segmentRow(walletId, Number(values![1]), 0);
        seg.metadata = JSON.parse(String(values![2] ?? '{}'));
        state.segments.push(seg);
      }
      return { rows: [segmentReturning(seg)] as T[], rowCount: 1 };
    }
    if (sql.includes('FROM oneze_wallet_segments') && sql.includes('FOR UPDATE')) {
      const seg = state.segments.find((s) => s.wallet_id === values![0]);
      return { rows: (seg ? [segmentReturning(seg)] : []) as T[], rowCount: seg ? 1 : 0 };
    }
    if (sql.startsWith('UPDATE oneze_wallet_segments')) {
      const seg = state.segments.find((s) => s.wallet_id === values![0]);
      if (!seg) return { rows: [], rowCount: 0 };
      if (sql.includes('purchased_balance_units = purchased_balance_units + $2')) {
        seg.purchased_balance_units = String(
          Number(seg.purchased_balance_units) + Number(values![1]),
        );
        seg.metadata = { ...seg.metadata, ...JSON.parse(String(values![2] ?? '{}')) };
      } else if (sql.includes('earned_balance_units = earned_balance_units - $2')) {
        seg.earned_balance_units = String(
          Number(seg.earned_balance_units) - Number(values![1]),
        );
        seg.purchased_balance_units = String(
          Number(seg.purchased_balance_units) - Number(values![2]),
        );
        seg.metadata = { ...seg.metadata, ...JSON.parse(String(values![3] ?? '{}')) };
      } else {
        // Absolute set (debit/credit).
        seg.purchased_balance_units = String(values![1]);
        seg.earned_balance_units = String(values![2]);
        seg.metadata = { ...seg.metadata, ...JSON.parse(String(values![3] ?? '{}')) };
      }
      return { rows: [segmentReturning(seg)] as T[], rowCount: 1 };
    }

    // ── Origin events ──
    if (sql.startsWith('INSERT INTO oneze_balance_origin_events')) {
      state.originEvents.push({
        wallet_id: values![0],
        tx_id: values![1],
        amount_units: values![2],
        origin_country: values![3],
        segment: values![4],
        metadata: values![5],
      });
      return { rows: [], rowCount: 1 };
    }

    // ── Domain outbox ──
    if (sql.startsWith('INSERT INTO domain_outbox')) {
      const dedupKey = String(values![10]);
      const existing = state.outbox.find((o) => o.deduplication_key === dedupKey);
      if (existing) {
        return { rows: [{ id: existing.id }] as T[], rowCount: 1 };
      }
      outboxSeq += 1;
      const row: OutboxRow = {
        id: String(values![0] ?? `evt_${outboxSeq}`),
        aggregate_type: String(values![1]),
        aggregate_id: String(values![2]),
        event_type: String(values![3]),
        event_version: Number(values![4]),
        payload: JSON.parse(String(values![5] ?? '{}')),
        actor_id: values![6] == null ? null : String(values![6]),
        deduplication_key: dedupKey,
        idempotency_key: values![9] == null ? null : String(values![9]),
        status: 'pending',
        attempts: 0,
      };
      state.outbox.push(row);
      return { rows: [{ id: row.id }] as T[], rowCount: 1 };
    }

    throw new Error(`Unexpected query in test double: ${sql.slice(0, 140)}`);
  }

  const client = {
    query,
    release() {},
  };

  return { query, connect: async () => client, committed, issued };
}

function patchPool(fake: { query: unknown; connect: unknown }) {
  const target = db as unknown as { query: unknown; connect: unknown };
  const original = { query: target.query, connect: target.connect };
  target.query = fake.query;
  target.connect = fake.connect;
  return () => {
    target.query = original.query;
    target.connect = original.connect;
  };
}

function baseState(overrides: Partial<State> = {}): State {
  return {
    wallets: [],
    segments: [],
    ledger: [],
    originEvents: [],
    reservations: [],
    distributions: [],
    dripEnrollments: [],
    assets: [],
    holdings: [],
    trades: [],
    outbox: [],
    ...overrides,
  };
}

const ASSET: AssetRow = {
  id: 'asset_1',
  issuer_id: 'issuer_1',
  total_units: 20,
  available_units: 10,
  unit_price_gbp: '2.00',
  appraisal_value_gbp: null,
  is_open: true,
  total_traded_value_gbp: '0',
  holders: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  lockup_end_date: null,
  lockup_months: null,
};

const DIST: DistributionRow = {
  id: 'dist_1',
  asset_id: 'asset_1',
  recipient_user_id: 'buyer_1',
  amount_gbp_minor: '1000', // £10 → 5 units at £2.00
  status: 'settled',
  reference: null,
  settled_at: '2026-02-01T00:00:00.000Z',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

test('DRIP settles through the versioned GBP→1ZE quote, segment-aware, balanced', async () => {
  const fake = createFakeDb(baseState({
    dripEnrollments: [{ user_id: 'buyer_1', asset_id: 'asset_1', enrolled: true }],
    distributions: [{ ...DIST }],
    assets: [{ ...ASSET }],
    wallets: [walletRow('buyer_1', 20_000), walletRow('issuer_1', 0)],
    segments: [
      segmentRow('wal_buyer_1', 15_000, 5_000),
      segmentRow('wal_issuer_1', 0, 0),
    ],
  }));
  const restore = patchPool(fake);
  try {
    const result = await processCoOwnDripReinvestment('manual');
    assert.equal(result.reinvested, 1, JSON.stringify(result));

    // FIN-02: £10 notional at USD→GBP 0.8 → 10 × 1250 = 12,500 units —
    // NOT the old ×1000 (=10,000).
    const ledger = fake.committed.ledger;
    const buyerDebit = ledger.find((l) => Number(l.amount) < 0);
    const issuerCredit = ledger.find((l) => Number(l.amount) > 0);
    assert.ok(buyerDebit, 'buyer debit ledger row missing');
    assert.ok(issuerCredit, 'issuer credit ledger row missing');
    assert.equal(Number(buyerDebit!.amount), -12_500);
    assert.equal(Number(issuerCredit!.amount), 12_500);
    assert.equal(buyerDebit!.kind, 'CO_OWN_DRIP');
    assert.equal(issuerCredit!.kind, 'CO_OWN_DRIP');

    // Balanced: debit and credit net to zero across the pair.
    const wallet = (u: string) =>
      fake.committed.wallets.find((w) => w.user_id === u)!;
    assert.equal(Number(wallet('buyer_1').oneze_balance_units), 7_500);
    assert.equal(Number(wallet('issuer_1').oneze_balance_units), 12_500);

    // FIN-05: earned drains before purchased; issuer proceeds land 'earned';
    // segment total converges to the wallet balance on BOTH sides.
    const buyerSeg = fake.committed.segments.find((s) => s.wallet_id === 'wal_buyer_1')!;
    assert.equal(Number(buyerSeg.earned_balance_units), 0);
    assert.equal(Number(buyerSeg.purchased_balance_units), 7_500);
    const issuerSeg = fake.committed.segments.find((s) => s.wallet_id === 'wal_issuer_1')!;
    assert.equal(Number(issuerSeg.earned_balance_units), 12_500);
    for (const w of fake.committed.wallets) {
      const seg = fake.committed.segments.find((s) => s.wallet_id === w.id)!;
      assert.equal(
        Number(seg.purchased_balance_units) + Number(seg.earned_balance_units),
        Number(w.oneze_balance_units),
        `segment parity broken for ${w.user_id}`,
      );
    }

    // Distribution + trade + receipt, all committed atomically.
    const dist = fake.committed.distributions[0];
    assert.equal(dist.status, 'reinvested');
    assert.match(String(dist.reference), /^drip_trade:/);
    assert.equal(fake.committed.trades.length, 1);
    const receipt = fake.committed.outbox.find((o) => o.event_type === 'coown_drip_receipt');
    assert.ok(receipt, 'DRIP receipt event missing');
    assert.equal(receipt!.payload.outcome, 'reinvested');
    assert.equal(receipt!.payload.units, 5);
    assert.ok(receipt!.payload.tradeId, 'receipt must reference the settled trade');
  } finally {
    restore();
  }
});

test('FIN-06: missing issuer wallet fails honestly — no unbalanced settled state', async () => {
  const fake = createFakeDb(baseState({
    dripEnrollments: [{ user_id: 'buyer_1', asset_id: 'asset_1', enrolled: true }],
    distributions: [{ ...DIST }],
    assets: [{ ...ASSET }],
    // Issuer has NO wallet row.
    wallets: [walletRow('buyer_1', 20_000)],
    segments: [segmentRow('wal_buyer_1', 15_000, 5_000)],
  }));
  const restore = patchPool(fake);
  try {
    const result = await processCoOwnDripReinvestment('manual');
    assert.equal(result.failed, 1, JSON.stringify(result));
    assert.equal(result.reinvested, 0);

    const dist = fake.committed.distributions[0];
    assert.equal(dist.status, 'reinvest_failed');
    assert.match(String(dist.reference), /issuer_wallet_not_found/);

    // The critical invariant: the buyer debit did NOT commit — the old code
    // left buyer debited with no issuer credit.
    const wallet = fake.committed.wallets.find((w) => w.user_id === 'buyer_1')!;
    assert.equal(Number(wallet.oneze_balance_units), 20_000);
    assert.equal(fake.committed.ledger.length, 0, 'ledger must be empty');
    assert.equal(fake.committed.trades.length, 0, 'no trade may be recorded');
    // Segments untouched.
    const seg = fake.committed.segments.find((s) => s.wallet_id === 'wal_buyer_1')!;
    assert.equal(Number(seg.purchased_balance_units) + Number(seg.earned_balance_units), 20_000);

    // The failure still produced its durable receipt (same commit as the
    // status transition).
    const receipt = fake.committed.outbox.find((o) => o.event_type === 'coown_drip_receipt');
    assert.ok(receipt, 'failure receipt missing');
    assert.equal(receipt!.payload.outcome, 'reinvest_failed');
    assert.equal(receipt!.payload.cause, 'issuer_wallet_not_found');
  } finally {
    restore();
  }
});

test('FIN-05: retained-cash decision is reservation-aware — reserved funds are not spendable', async () => {
  const fake = createFakeDb(baseState({
    dripEnrollments: [{ user_id: 'buyer_1', asset_id: 'asset_1', enrolled: true }],
    distributions: [{ ...DIST }],
    assets: [{ ...ASSET }],
    wallets: [walletRow('buyer_1', 20_000), walletRow('issuer_1', 0)],
    segments: [segmentRow('wal_buyer_1', 15_000, 5_000)],
    // Gross balance 20,000 ≥ 12,500 needed — but 15,000 is reserved for
    // another live order, leaving 5,000 spendable. Old code compared the
    // GROSS balance and debited anyway.
    reservations: [{
      id: 'resv_1',
      user_id: 'buyer_1',
      status: 'placed',
      reserved_1ze_units: '15000',
      placed_order_id: '42',
      expires_at_ms: Date.now() + 60_000,
    }],
  }));
  const restore = patchPool(fake);
  try {
    const result = await processCoOwnDripReinvestment('manual');
    assert.equal(result.failed, 1, JSON.stringify(result));

    const dist = fake.committed.distributions[0];
    assert.equal(dist.status, 'retained_cash');
    assert.equal(fake.committed.trades.length, 0);
    assert.equal(fake.committed.ledger.length, 0, 'reserved funds must not be debited');
    const wallet = fake.committed.wallets.find((w) => w.user_id === 'buyer_1')!;
    assert.equal(Number(wallet.oneze_balance_units), 20_000);

    const receipt = fake.committed.outbox.find((o) => o.event_type === 'coown_drip_receipt');
    assert.ok(receipt);
    assert.equal(receipt!.payload.outcome, 'retained_cash');
    // SEP20-FIN-14: the receipt carries the observed ledger evidence.
    assert.equal(receipt!.payload.spendableUnits, 5_000);
    assert.equal(receipt!.payload.requiredUnits, 12_500);
  } finally {
    restore();
  }
});

test('SEP20-FIN-13: fault between status UPDATE and receipt append rolls back atomically', async () => {
  // First pass: the trade insert throws inside the reinvestment tx (rolls
  // back), then the standalone failure marker's outbox insert ALSO throws —
  // the status UPDATE must roll back with it, leaving 'settled'.
  const state = baseState({
    dripEnrollments: [{ user_id: 'buyer_1', asset_id: 'asset_1', enrolled: true }],
    distributions: [{ ...DIST }],
    assets: [{ ...ASSET }],
    wallets: [walletRow('buyer_1', 20_000), walletRow('issuer_1', 0)],
    segments: [segmentRow('wal_buyer_1', 15_000, 5_000)],
  });

  const failing = createFakeDb(state, {
    failOn: ['INSERT INTO coOwn_trades', 'INSERT INTO domain_outbox'],
  });
  const restore = patchPool(failing);
  try {
    const first = await processCoOwnDripReinvestment('manual');
    assert.equal(first.errors, 1, JSON.stringify(first));

    // BOTH writes rolled back: the old code autocommitted the UPDATE first,
    // leaving a terminal 'reinvest_failed' row with no receipt.
    assert.equal(failing.committed.distributions[0].status, 'settled');
    assert.equal(failing.committed.outbox.length, 0);
    assert.equal(failing.committed.ledger.length, 0);
    assert.equal(
      Number(failing.committed.wallets.find((w) => w.user_id === 'buyer_1')!.oneze_balance_units),
      20_000,
    );
  } finally {
    restore();
  }

  // Second pass with the fault cleared: the still-settled distribution
  // reinvests normally.
  const healthy = createFakeDb(state);
  const restore2 = patchPool(healthy);
  try {
    const second = await processCoOwnDripReinvestment('manual');
    assert.equal(second.reinvested, 1, JSON.stringify(second));
    assert.equal(healthy.committed.distributions[0].status, 'reinvested');
    assert.equal(healthy.committed.trades.length, 1);
    assert.ok(healthy.committed.outbox.some((o) => o.event_type === 'coown_drip_receipt'));
  } finally {
    restore2();
  }
});

test('FIN-02 pure legs: quote path prices GBP through the USD anchor, not ×1000', async () => {
  // anchor USD=1/1ZE, USD→GBP 0.8 → 1250 units per £1.
  const legs = computeCoOwnSettlementUnits(
    { anchorToSettlementRate: 0.8, anchorValue: 1 },
    { notionalGbp: 10, feeGbp: 0 },
  );
  assert.equal(legs.buyerDebitUnits, 12_500);
  assert.equal(legs.sellerCreditUnits, 12_500);

  // Rounding: payer rounds up, payee rounds down — dust absorbed platform-side.
  const dust = computeCoOwnSettlementUnits(
    { anchorToSettlementRate: 0.8, anchorValue: 1 },
    { notionalGbp: 0.0004, feeGbp: 0 },
  );
  assert.equal(dust.buyerDebitUnits, 1);
  assert.equal(dust.sellerCreditUnits, 0);
});

test('settlement primitives: segment-aware trade legs keep parity on both wallets', async () => {
  // Simulates the shared legs both the order path and DRIP use — earned
  // drains first, proceeds land in 'earned', totals converge to balances.
  const fake = createFakeDb(baseState({
    wallets: [walletRow('buyer_1', 10_000), walletRow('seller_1', 3_000)],
    segments: [
      segmentRow('wal_buyer_1', 4_000, 6_000),
      segmentRow('wal_seller_1', 3_000, 0),
    ],
  }));

  const client = { query: fake.query, release() {} };
  await client.query('BEGIN');
  const debit = await debitCoOwnOnezeUnits(client as never, {
    userId: 'buyer_1',
    txId: 'coown_trade_t1',
    amountUnits: 8_000,
    kind: 'CO_OWN_TRADE',
    refType: 'coOwn_trade',
    refId: '7',
  });
  assert.equal(debit.earnedDebitedUnits, 6_000);
  assert.equal(debit.purchasedDebitedUnits, 2_000);

  await creditCoOwnOnezeUnits(client as never, {
    userId: 'seller_1',
    txId: 'coown_trade_t1',
    amountUnits: 8_000,
    kind: 'CO_OWN_TRADE',
    refType: 'coOwn_trade',
    refId: '9',
  });
  await client.query('COMMIT');

  const buyer = fake.committed.wallets.find((w) => w.user_id === 'buyer_1')!;
  const seller = fake.committed.wallets.find((w) => w.user_id === 'seller_1')!;
  assert.equal(Number(buyer.oneze_balance_units), 2_000);
  assert.equal(Number(seller.oneze_balance_units), 11_000);
  for (const w of fake.committed.wallets) {
    const seg = fake.committed.segments.find((s) => s.wallet_id === w.id)!;
    assert.equal(
      Number(seg.purchased_balance_units) + Number(seg.earned_balance_units),
      Number(w.oneze_balance_units),
      `segment parity broken for ${w.user_id}`,
    );
  }
  const sellerSeg = fake.committed.segments.find((s) => s.wallet_id === 'wal_seller_1')!;
  assert.equal(Number(sellerSeg.earned_balance_units), 8_000);

  // Reservation-aware debit: buyer re-debiting against funds reserved for
  // another order must be rejected even though the gross balance covers it.
  const fake2 = createFakeDb(baseState({
    wallets: [walletRow('buyer_1', 10_000)],
    segments: [segmentRow('wal_buyer_1', 10_000, 0)],
    reservations: [{
      id: 'resv_x',
      user_id: 'buyer_1',
      status: 'active',
      reserved_1ze_units: '9000',
      placed_order_id: '77',
      expires_at_ms: Date.now() + 60_000,
    }],
  }));
  const client2 = { query: fake2.query, release() {} };
  await client2.query('BEGIN');
  await assert.rejects(
    debitCoOwnOnezeUnits(client2 as never, {
      userId: 'buyer_1',
      txId: 'coown_trade_t2',
      amountUnits: 8_000,
      kind: 'CO_OWN_TRADE',
    }),
    (err: unknown) => (err as { code?: string }).code === 'INSUFFICIENT_1ZE_BALANCE',
  );
  await client2.query('ROLLBACK');
});

// ─── W3 / R54: bounded retry for state-dependent reinvestment failures ──────

test('state-dependent failure (asset closed) stays settled and retries — no dead-letter', async () => {
  const fake = createFakeDb(baseState({
    dripEnrollments: [{ user_id: 'buyer_1', asset_id: 'asset_1', enrolled: true }],
    distributions: [{ ...DIST, reinvest_attempts: 0 }],
    assets: [{ ...ASSET, is_open: false }],
    wallets: [walletRow('buyer_1', 20_000), walletRow('issuer_1', 0)],
    segments: [
      segmentRow('wal_buyer_1', 15_000, 5_000),
      segmentRow('wal_issuer_1', 0, 0),
    ],
  }));
  const restore = patchPool(fake);
  try {
    // Pass 1: market closed → retried, distribution stays 'settled'.
    const first = await processCoOwnDripReinvestment('manual');
    assert.equal(first.retried, 1, JSON.stringify(first));
    assert.equal(first.failed, 0);
    const dist = fake.committed.distributions[0];
    assert.equal(dist.status, 'settled', 'retryable cause must not dead-letter');
    assert.equal(dist.reinvest_attempts, 1);
    // No failure receipt, no trade, no debit.
    assert.equal(fake.committed.trades.length, 0);
    assert.equal(
      fake.committed.outbox.filter((o) => o.event_type === 'coown_drip_receipt').length,
      0,
    );

    // Market reopens → pass 2 reinvests the SAME distribution.
    fake.committed.assets[0].is_open = true;
    const second = await processCoOwnDripReinvestment('manual');
    assert.equal(second.reinvested, 1, JSON.stringify(second));
    assert.equal(fake.committed.distributions[0].status, 'reinvested');
    assert.equal(fake.committed.trades.length, 1);
  } finally {
    restore();
  }
});

test('retryable cause dead-letters at the attempt ceiling with a receipt', async () => {
  const fake = createFakeDb(baseState({
    dripEnrollments: [{ user_id: 'buyer_1', asset_id: 'asset_1', enrolled: true }],
    // One attempt below the 288 ceiling — this pass exhausts it.
    distributions: [{ ...DIST, reinvest_attempts: 287 }],
    assets: [{ ...ASSET, is_open: false }],
    wallets: [walletRow('buyer_1', 20_000), walletRow('issuer_1', 0)],
    segments: [
      segmentRow('wal_buyer_1', 15_000, 5_000),
      segmentRow('wal_issuer_1', 0, 0),
    ],
  }));
  const restore = patchPool(fake);
  try {
    const result = await processCoOwnDripReinvestment('manual');
    assert.equal(result.failed, 1, JSON.stringify(result));
    assert.equal(result.retried, 0);
    const dist = fake.committed.distributions[0];
    assert.equal(dist.status, 'reinvest_failed');
    assert.match(String(dist.reference), /attempts_exhausted:asset_not_open/);
    const receipt = fake.committed.outbox.find((o) => o.event_type === 'coown_drip_receipt');
    assert.ok(receipt, 'dead-lettered distribution must emit a receipt');
    assert.equal(receipt!.payload.outcome, 'reinvest_failed');
  } finally {
    restore();
  }
});

test('terminal cause (amount too small for one unit) still fails immediately', async () => {
  const fake = createFakeDb(baseState({
    dripEnrollments: [{ user_id: 'buyer_1', asset_id: 'asset_1', enrolled: true }],
    // £0.50 distribution at £2.00/unit — can never buy a whole unit.
    distributions: [{ ...DIST, amount_gbp_minor: '50', reinvest_attempts: 0 }],
    assets: [{ ...ASSET }],
    wallets: [walletRow('buyer_1', 20_000), walletRow('issuer_1', 0)],
    segments: [
      segmentRow('wal_buyer_1', 15_000, 5_000),
      segmentRow('wal_issuer_1', 0, 0),
    ],
  }));
  const restore = patchPool(fake);
  try {
    const result = await processCoOwnDripReinvestment('manual');
    assert.equal(result.failed, 1, JSON.stringify(result));
    assert.equal(result.retried, 0, 'terminal cause must not consume retry budget');
    assert.equal(fake.committed.distributions[0].status, 'reinvest_failed');
    assert.match(
      String(fake.committed.distributions[0].reference),
      /insufficient_amount_for_one_unit/,
    );
  } finally {
    restore();
  }
});
