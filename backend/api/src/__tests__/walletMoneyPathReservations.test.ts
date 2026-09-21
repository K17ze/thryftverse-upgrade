import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  applyWalletLedgerDelta,
  assertP2pTransferContextAuthorized,
  assertSpendableOnezeUnits,
  claimWalletIdempotencyKey,
  completeWalletIdempotencyClaim,
  computeSpendableOnezeUnits,
  hashWalletIdempotencyPayload,
  lockWalletRowsForUpdate,
} from '../lib/walletMoneyPath.js';
import type { DbQueryable } from '../lib/workerHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// PKG-02 money-path invariants under test:
//   (a) FIN-04 — two concurrent transfers racing the same idempotency key
//       produce exactly one debit+credit pair; the loser replays.
//   (b) FIN-03 — spendable = gross − enforceable coown_order_reservations;
//       reserved funds cannot be debited a second time.
//   (c) a recycled idempotency key carrying a different payload is rejected.
//   (d) FIN-08 — privileged transfer contexts (coOwn_trade, platform_reward)
//       require a real domain event / caller authority; forged or mismatched
//       contexts are rejected.
//
// The fake DB below models just enough Postgres READ COMMITTED behavior to
// exercise the claim-before-mutate contract honestly:
//   * uncommitted INSERT ... ON CONFLICT claims block until the holder's
//     transaction commits (row becomes visible) or aborts (claim succeeds);
//   * SELECT ... FOR UPDATE serializes on a per-row async lock;
//   * writes are staged per-transaction and applied atomically at COMMIT.
// ─────────────────────────────────────────────────────────────────────────────

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

interface LedgerRow {
  id: number;
  wallet_id: string;
  tx_id: string;
  asset: string;
  amount: number;
  balance_after: number;
  kind: string;
  ref_type: string | null;
  ref_id: string | null;
  metadata: Record<string, unknown>;
}

interface IdempotencyRow {
  user_id: string;
  operation: string;
  idempotency_key: string;
  request_hash: string;
  response_payload: Record<string, unknown>;
}

interface ReservationRow {
  id: string;
  user_id: string;
  status: string;
  reserved_1ze_units: string;
  reserved_units: number;
  placed_order_id: number | null;
  /** null → no expiry; number → epoch ms compared against Date.now() */
  expires_at_ms: number | null;
}

interface TradeRow {
  id: number;
  buyer_id: string;
  seller_id: string;
  notional_gbp: string;
  fee_gbp: string;
  settlement_status: string;
}

interface IzeTransferRow {
  id: string;
  status: string;
  metadata: Record<string, unknown>;
}

interface CommittedState {
  wallets: WalletRow[];
  ledger: LedgerRow[];
  idempotency: IdempotencyRow[];
  reservations: ReservationRow[];
  trades: TradeRow[];
  izeTransfers: IzeTransferRow[];
}

function cloneState(state: CommittedState): CommittedState {
  return {
    wallets: state.wallets.map((r) => ({ ...r })),
    ledger: state.ledger.map((r) => ({ ...r })),
    idempotency: state.idempotency.map((r) => ({ ...r })),
    reservations: state.reservations.map((r) => ({ ...r })),
    trades: state.trades.map((r) => ({ ...r })),
    izeTransfers: state.izeTransfers.map((r) => ({ ...r })),
  };
}

const IDEM_MARKER = '__walletIdempotencyClaim';

function createFakeDb(
  initial: CommittedState,
  opts?: { onInflightWait?: (key: string) => void }
) {
  const committed = cloneState(initial);
  let ledgerSeq = committed.ledger.length;
  let txSeq = 0;

  // Per-row async locks for FOR UPDATE emulation: each acquirer chains onto
  // the tail promise for that key and holds a release until tx end.
  const rowLockTails = new Map<string, Promise<void>>();
  // Uncommitted idempotency claims: key → resolve when owner tx ends.
  const inflightClaims = new Map<
    string,
    { ownerTx: number; outcome: Promise<'committed' | 'aborted'> }
  >();

  interface Tx {
    id: number;
    overlay: CommittedState;
    /** wallet ids this tx actually wrote — commit applies only these */
    dirtyWalletIds: Set<string>;
    /** ledger rows appended by this tx */
    appendedLedger: LedgerRow[];
    /** idempotency rows inserted or updated by this tx */
    upsertedIdempotency: IdempotencyRow[];
    heldLockKeys: Set<string>;
    releases: Array<() => void>;
    claimKeys: string[];
    ended: boolean;
    outcomeResolves: Array<(o: 'committed' | 'aborted') => void>;
  }

  const acquireRowLock = async (tx: Tx, key: string): Promise<void> => {
    if (tx.heldLockKeys.has(key)) {
      return; // same tx re-locking its own row is a no-op in Postgres
    }
    const prior = rowLockTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    rowLockTails.set(key, prior.then(() => mine));
    await prior;
    tx.heldLockKeys.add(key);
    tx.releases.push(release);
  };

  const keyFor = (userId: string, operation: string, key: string) =>
    `${userId}|${operation}|${key}`;

  const findIdempotency = (
    rows: IdempotencyRow[],
    userId: string,
    operation: string,
    key: string
  ) =>
    rows.find(
      (r) =>
        r.user_id === userId &&
        r.operation === operation &&
        r.idempotency_key === key
    );

  const runQuery = async (
    tx: Tx,
    text: string,
    params?: unknown[]
  ): Promise<{ rows: any[]; rowCount: number }> => {
    const sql = text.replace(/\s+/g, ' ').trim();
    const state = tx.overlay;

    // ── wallet_idempotency_keys: claim insert ──
    if (sql.startsWith('INSERT INTO wallet_idempotency_keys')) {
      const [userId, operation, key, requestHash, responsePayload] = params as [
        string,
        string,
        string,
        string,
        string,
      ];
      const composite = keyFor(userId, operation, key);

      // Speculative insert blocks while another tx holds an uncommitted
      // claim on the same key — Postgres waits for it to commit or abort.
      for (;;) {
        const inflight = inflightClaims.get(composite);
        if (!inflight || inflight.ownerTx === tx.id) break;
        opts?.onInflightWait?.(composite);
        await inflight.outcome;
      }

      const staged = findIdempotency(state.idempotency, userId, operation, key);
      const committedRow = findIdempotency(
        committed.idempotency,
        userId,
        operation,
        key
      );
      if (staged || committedRow) {
        // ON CONFLICT DO NOTHING
        return { rows: [], rowCount: 0 };
      }

      const row: IdempotencyRow = {
        user_id: userId,
        operation,
        idempotency_key: key,
        request_hash: requestHash,
        response_payload: JSON.parse(responsePayload),
      };
      state.idempotency.push(row);
      tx.upsertedIdempotency.push(row);
      tx.claimKeys.push(composite);
      let outcomeResolve!: (o: 'committed' | 'aborted') => void;
      const outcome = new Promise<'committed' | 'aborted'>((resolve) => {
        outcomeResolve = resolve;
      });
      inflightClaims.set(composite, { ownerTx: tx.id, outcome });
      tx.outcomeResolves.push(outcomeResolve);
      return { rows: [{ idempotency_key: key }], rowCount: 1 };
    }

    // ── wallet_idempotency_keys: read (replay / FOR UPDATE) ──
    if (
      sql.startsWith('SELECT request_hash, response_payload') &&
      sql.includes('FROM wallet_idempotency_keys')
    ) {
      const [userId, operation, key] = params as [string, string, string];
      const row =
        findIdempotency(state.idempotency, userId, operation, key) ??
        findIdempotency(committed.idempotency, userId, operation, key);
      if (row && sql.includes('FOR UPDATE')) {
        await acquireRowLock(tx, `wallet_idempotency_keys:${keyFor(userId, operation, key)}`);
      }
      return { rows: row ? [{ ...row }] : [], rowCount: row ? 1 : 0 };
    }

    // ── wallet_idempotency_keys: complete claim ──
    if (sql.startsWith('UPDATE wallet_idempotency_keys')) {
      const [userId, operation, key, requestHash, responsePayload] = params as [
        string,
        string,
        string,
        string,
        string,
      ];
      const row =
        findIdempotency(state.idempotency, userId, operation, key) ??
        findIdempotency(committed.idempotency, userId, operation, key);
      if (row && row.request_hash === requestHash) {
        row.response_payload = JSON.parse(responsePayload);
        if (!tx.upsertedIdempotency.includes(row)) {
          tx.upsertedIdempotency.push(row);
        }
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }

    // ── wallets: FOR UPDATE selects ──
    if (sql.includes('FROM wallets') && sql.includes('FOR UPDATE')) {
      if (sql.includes('WHERE id = ANY')) {
        const ids = [...(params![0] as string[])].sort();
        const rows: Array<{ id: string }> = [];
        for (const id of ids) {
          const w =
            state.wallets.find((r) => r.id === id) ??
            committed.wallets.find((r) => r.id === id);
          if (w) {
            await acquireRowLock(tx, `wallets:${id}`);
            rows.push({ id });
          }
        }
        return { rows, rowCount: rows.length };
      }
      const whereId = sql.includes('WHERE id = $1');
      const key = params![0] as string;
      const wallet = whereId
        ? state.wallets.find((r) => r.id === key) ??
          committed.wallets.find((r) => r.id === key)
        : state.wallets.find((r) => r.user_id === key) ??
          committed.wallets.find((r) => r.user_id === key);
      if (wallet) {
        await acquireRowLock(tx, `wallets:${wallet.id}`);
      }
      return { rows: wallet ? [{ ...wallet }] : [], rowCount: wallet ? 1 : 0 };
    }

    // ── wallets: balance updates ──
    if (sql.startsWith('UPDATE wallets SET oneze_balance_units')) {
      const wallet = state.wallets.find((r) => r.id === params![0]);
      if (wallet) {
        wallet.oneze_balance_units = String(params![1]);
        wallet.version += 1;
        tx.dirtyWalletIds.add(wallet.id);
      }
      return { rows: [], rowCount: wallet ? 1 : 0 };
    }
    if (sql.startsWith('UPDATE wallets SET fiat_balance_minor')) {
      const wallet = state.wallets.find((r) => r.id === params![0]);
      if (wallet) {
        wallet.fiat_balance_minor = String(params![1]);
        wallet.version += 1;
        tx.dirtyWalletIds.add(wallet.id);
      }
      return { rows: [], rowCount: wallet ? 1 : 0 };
    }

    // ── wallet_ledger inserts ──
    if (sql.startsWith('INSERT INTO wallet_ledger')) {
      const [
        walletId,
        txId,
        asset,
        amount,
        balanceAfter,
        kind,
        refType,
        refId,
        ,
        metadata,
      ] = params as [
        string,
        string,
        string,
        number,
        number,
        string,
        string | null,
        string | null,
        number | null,
        string,
      ];
      const row: LedgerRow = {
        id: ++ledgerSeq,
        wallet_id: walletId,
        tx_id: txId,
        asset,
        amount,
        balance_after: balanceAfter,
        kind,
        ref_type: refType,
        ref_id: refId,
        metadata: JSON.parse(metadata),
      };
      state.ledger.push(row);
      tx.appendedLedger.push(row);
      return { rows: [], rowCount: 1 };
    }

    // ── coown_order_reservations: FOR UPDATE hold scan ──
    if (
      sql.includes('FROM coown_order_reservations') &&
      sql.includes('FOR UPDATE')
    ) {
      const userId = params![0] as string;
      const now = Date.now();
      const rows = [...state.reservations, ...committed.reservations]
        .filter(
          (r) =>
            r.user_id === userId &&
            (r.status === 'active' || r.status === 'placed') &&
            (r.expires_at_ms === null || r.expires_at_ms > now)
        )
        // de-dup overlay/committed overlap by id
        .filter(
          (r, idx, all) => all.findIndex((x) => x.id === r.id) === idx
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      for (const r of rows) {
        await acquireRowLock(tx, `coown_order_reservations:${r.id}`);
      }
      return {
        rows: rows.map((r) => ({
          id: r.id,
          reserved_units: r.reserved_1ze_units,
          placed_order_id:
            r.placed_order_id === null ? null : String(r.placed_order_id),
        })),
        rowCount: rows.length,
      };
    }

    // ── coOwn_trades: context verification read ──
    if (sql.includes('FROM coOwn_trades')) {
      const trade = committed.trades.find((t) => t.id === params![0]);
      return {
        rows: trade
          ? [
              {
                id: String(trade.id),
                buyer_id: trade.buyer_id,
                seller_id: trade.seller_id,
                notional_gbp: trade.notional_gbp,
                fee_gbp: trade.fee_gbp,
                settlement_status: trade.settlement_status,
              },
            ]
          : [],
        rowCount: trade ? 1 : 0,
      };
    }

    // ── wallet_ize_transfers: context single-use check ──
    if (sql.includes('FROM wallet_ize_transfers')) {
      const [contextType, contextId] = params as [string, string];
      const found = [...state.izeTransfers, ...committed.izeTransfers].some(
        (r) =>
          r.status === 'committed' &&
          r.metadata?.contextType === contextType &&
          r.metadata?.contextId === contextId
      );
      return { rows: found ? [{ '?column?': 1 }] : [], rowCount: found ? 1 : 0 };
    }

    return { rows: [], rowCount: 0 };
  };

  const begin = () => {
    const tx: Tx = {
      id: ++txSeq,
      overlay: cloneState(committed),
      dirtyWalletIds: new Set(),
      appendedLedger: [],
      upsertedIdempotency: [],
      heldLockKeys: new Set(),
      releases: [],
      claimKeys: [],
      ended: false,
      outcomeResolves: [],
    };

    const client = {
      query: (text: string, params?: unknown[]) => runQuery(tx, text, params),
    } as unknown as DbQueryable;

    const finish = (outcome: 'committed' | 'aborted') => {
      tx.ended = true;
      for (const key of tx.claimKeys) {
        const inflight = inflightClaims.get(key);
        if (inflight?.ownerTx === tx.id) {
          inflightClaims.delete(key);
        }
      }
      for (const resolveOutcome of tx.outcomeResolves) {
        resolveOutcome(outcome);
      }
      for (const release of tx.releases) {
        release();
      }
    };

    return {
      client,
      tx,
      commit: async () => {
        // Apply only this transaction's writes — a read-only or replayed tx
        // commits without clobbering concurrent committed state.
        for (const walletId of tx.dirtyWalletIds) {
          const overlayRow = tx.overlay.wallets.find((w) => w.id === walletId);
          const target = committed.wallets.find((w) => w.id === walletId);
          if (overlayRow && target) {
            Object.assign(target, overlayRow);
          } else if (overlayRow) {
            committed.wallets.push(overlayRow);
          }
        }
        committed.ledger.push(...tx.appendedLedger);
        for (const row of tx.upsertedIdempotency) {
          const existing = committed.idempotency.find(
            (r) =>
              r.user_id === row.user_id &&
              r.operation === row.operation &&
              r.idempotency_key === row.idempotency_key
          );
          if (existing) {
            Object.assign(existing, row);
          } else {
            committed.idempotency.push({ ...row });
          }
        }
        finish('committed');
      },
      rollback: async () => {
        finish('aborted');
      },
    };
  };

  return { begin, committed };
};

// ─── helpers ────────────────────────────────────────────────────────────────

function seedWallet(state: CommittedState, id: string, userId: string, units: number) {
  state.wallets.push({
    id,
    user_id: userId,
    oneze_balance_units: String(units),
    fiat_balance_minor: '0',
    fiat_currency: 'GBP',
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
}

function emptyState(): CommittedState {
  return {
    wallets: [],
    ledger: [],
    idempotency: [],
    reservations: [],
    trades: [],
    izeTransfers: [],
  };
}

/**
 * Mirrors the money-path tail of POST /wallet/1ze/transfer: claim the
 * idempotency key, lock both wallets, assert spendable, post the balanced
 * TRANSFER_SEND/TRANSFER_RECEIVE pair, then store the response on the claim
 * — all inside one transaction.
 */
async function runTransferMoneyPath(
  db: ReturnType<typeof createFakeDb>,
  input: {
    senderWalletId: string;
    recipientWalletId: string;
    amountUnits: number;
    idempotencyKey: string;
    requestHash: string;
    senderUserId: string;
    // test hook: pause after claiming so a rival tx can race the same key
    holdAfterClaim?: Promise<void>;
  }
): Promise<{ result: 'committed' | 'replayed' | 'in_progress' | 'failed'; response?: unknown }> {
  const { client, commit, rollback } = db.begin();
  try {
    const claim = await claimWalletIdempotencyKey(client, {
      userId: input.senderUserId,
      operation: 'p2p_transfer',
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
    });

    if (claim.status === 'replay') {
      await commit();
      return { result: 'replayed', response: claim.responsePayload };
    }
    if (claim.status === 'in_progress') {
      await commit();
      return { result: 'in_progress' };
    }

    if (input.holdAfterClaim) {
      await input.holdAfterClaim;
    }

    await lockWalletRowsForUpdate(client, [
      input.senderWalletId,
      input.recipientWalletId,
    ]);
    await assertSpendableOnezeUnits(client, {
      walletId: input.senderWalletId,
      requiredUnits: input.amountUnits,
    });

    const txId = `wtx_${Math.random().toString(36).slice(2)}`;
    await applyWalletLedgerDelta(client, {
      walletId: input.senderWalletId,
      txId,
      asset: '1ZE',
      amount: -input.amountUnits,
      kind: 'TRANSFER_SEND',
      refType: 'coOwn_trade',
      refId: '1',
      metadata: {},
    });
    await applyWalletLedgerDelta(client, {
      walletId: input.recipientWalletId,
      txId,
      asset: '1ZE',
      amount: input.amountUnits,
      kind: 'TRANSFER_RECEIVE',
      refType: 'coOwn_trade',
      refId: '1',
      metadata: {},
    });

    const responsePayload = { ok: true, transfer: { txId } };
    await completeWalletIdempotencyClaim(client, {
      userId: input.senderUserId,
      operation: 'p2p_transfer',
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      responsePayload,
    });

    await commit();
    return { result: 'committed', response: responsePayload };
  } catch (error) {
    await rollback();
    return { result: 'failed' };
  }
}

// ─── (a) concurrent same-key transfer: exactly one debit+credit ─────────────

test('concurrent transfers with the same idempotency key yield one debit+credit', async () => {
  const state = emptyState();
  seedWallet(state, 'wal_a', 'user_a', 10_000);
  seedWallet(state, 'wal_b', 'user_b', 0);

  // Deterministic race: tx1 claims the key, then holds its transaction open
  // until tx2 is verifiably blocked on the same-key speculative insert —
  // exactly what Postgres does under READ COMMITTED.
  let tx2BlockedResolve!: () => void;
  const tx2Blocked = new Promise<void>((resolve) => {
    tx2BlockedResolve = resolve;
  });
  const db = createFakeDb(state, {
    onInflightWait: () => tx2BlockedResolve(),
  });

  const requestHash = hashWalletIdempotencyPayload({
    senderUserId: 'user_a',
    recipientUserId: 'user_b',
    amountUnits: 4_000,
  });

  const tx1 = runTransferMoneyPath(db, {
    senderWalletId: 'wal_a',
    recipientWalletId: 'wal_b',
    amountUnits: 4_000,
    idempotencyKey: 'race-key-0001',
    requestHash,
    senderUserId: 'user_a',
    holdAfterClaim: tx2Blocked,
  });

  const tx2 = runTransferMoneyPath(db, {
    senderWalletId: 'wal_a',
    recipientWalletId: 'wal_b',
    amountUnits: 4_000,
    idempotencyKey: 'race-key-0001',
    requestHash,
    senderUserId: 'user_a',
  });

  const [r1, r2] = await Promise.all([tx1, tx2]);

  const outcomes = [r1.result, r2.result].sort();
  assert.deepEqual(outcomes, ['committed', 'replayed']);

  const sends = db.committed.ledger.filter((r) => r.kind === 'TRANSFER_SEND');
  const receives = db.committed.ledger.filter(
    (r) => r.kind === 'TRANSFER_RECEIVE'
  );
  assert.equal(sends.length, 1, 'exactly one sender debit may be posted');
  assert.equal(receives.length, 1, 'exactly one recipient credit may be posted');
  assert.equal(sends[0].amount, -4_000);
  assert.equal(receives[0].amount, 4_000);

  const sender = db.committed.wallets.find((w) => w.id === 'wal_a')!;
  const recipient = db.committed.wallets.find((w) => w.id === 'wal_b')!;
  assert.equal(sender.oneze_balance_units, '6000');
  assert.equal(recipient.oneze_balance_units, '4000');

  assert.equal(db.committed.idempotency.length, 1);
  const stored = db.committed.idempotency[0];
  assert.equal(stored.response_payload.ok, true);
  assert.equal(
    stored.response_payload[IDEM_MARKER],
    undefined,
    'the pending claim marker must never be visible in the stored response'
  );

  // The replayed call returns the stored committed response.
  const replayed = r1.result === 'replayed' ? r1 : r2;
  assert.deepEqual(replayed.response, stored.response_payload);
});

test('an aborted claim frees the key for a clean retry', async () => {
  const state = emptyState();
  seedWallet(state, 'wal_a', 'user_a', 10_000);
  seedWallet(state, 'wal_b', 'user_b', 0);
  const db = createFakeDb(state);

  const requestHash = hashWalletIdempotencyPayload({ amountUnits: 1_000 });

  // tx1 claims, then "crashes" before mutating — rollback discards the claim.
  const t1 = db.begin();
  const firstClaim = await claimWalletIdempotencyKey(t1.client, {
    userId: 'user_a',
    operation: 'p2p_transfer',
    idempotencyKey: 'crash-key-01',
    requestHash,
  });
  assert.equal(firstClaim.status, 'claimed');
  await t1.rollback();

  // tx2 must claim fresh — the aborted attempt left no residue.
  const result = await runTransferMoneyPath(db, {
    senderWalletId: 'wal_a',
    recipientWalletId: 'wal_b',
    amountUnits: 1_000,
    idempotencyKey: 'crash-key-01',
    requestHash,
    senderUserId: 'user_a',
  });
  assert.equal(result.result, 'committed');
  assert.equal(db.committed.ledger.length, 2);
});

// ─── (b) reservation-covered funds are unspendable ──────────────────────────

test('spendable balance excludes active and placed reservations', async () => {
  const state = emptyState();
  seedWallet(state, 'wal_a', 'user_a', 10_000);
  state.reservations.push(
    {
      id: 'res_active',
      user_id: 'user_a',
      status: 'active',
      reserved_1ze_units: '4000',
      reserved_units: 0,
      placed_order_id: null,
      expires_at_ms: Date.now() + 60_000,
    },
    {
      id: 'res_placed',
      user_id: 'user_a',
      status: 'placed',
      reserved_1ze_units: '2000',
      reserved_units: 0,
      placed_order_id: 77,
      expires_at_ms: Date.now() + 60_000,
    },
    {
      id: 'res_expired',
      user_id: 'user_a',
      status: 'active',
      reserved_1ze_units: '5000',
      reserved_units: 0,
      placed_order_id: null,
      expires_at_ms: Date.now() - 1_000,
    },
    {
      id: 'res_cancelled',
      user_id: 'user_a',
      status: 'cancelled',
      reserved_1ze_units: '9000',
      reserved_units: 0,
      placed_order_id: null,
      expires_at_ms: Date.now() + 60_000,
    }
  );
  const db = createFakeDb(state);
  const { client } = db.begin();

  const funds = await computeSpendableOnezeUnits(client, {
    walletId: 'wal_a',
  });
  assert.equal(funds.grossUnits, 10_000);
  assert.equal(funds.reservedUnits, 6_000, 'expired/cancelled holds do not bind funds');
  assert.equal(funds.spendableUnits, 4_000);

  // Exactly the spendable amount is allowed; one unit more is refused.
  await assertSpendableOnezeUnits(client, {
    walletId: 'wal_a',
    requiredUnits: 4_000,
  });
  await assert.rejects(
    assertSpendableOnezeUnits(client, {
      walletId: 'wal_a',
      requiredUnits: 4_001,
    }),
    (err: unknown) => (err as { code?: string }).code === 'WALLET_INSUFFICIENT_BALANCE'
  );
});

test('the settler exclusion frees the reservation being consumed', async () => {
  const state = emptyState();
  seedWallet(state, 'wal_a', 'user_a', 10_000);
  state.reservations.push({
    id: 'res_placed',
    user_id: 'user_a',
    status: 'placed',
    reserved_1ze_units: '7000',
    reserved_units: 0,
    placed_order_id: 77,
    expires_at_ms: Date.now() + 60_000,
  });
  const db = createFakeDb(state);
  const { client } = db.begin();

  const funds = await computeSpendableOnezeUnits(client, {
    userId: 'user_a',
    excludePlacedOrderId: 77,
  });
  assert.equal(funds.reservedUnits, 0);
  assert.equal(funds.spendableUnits, 10_000);

  const byId = await computeSpendableOnezeUnits(client, {
    walletId: 'wal_a',
    excludeReservationIds: ['res_placed'],
  });
  assert.equal(byId.spendableUnits, 10_000);
});

// ─── (c) recycled key with a different payload is rejected ──────────────────

test('same idempotency key with a different payload is rejected', async () => {
  const state = emptyState();
  seedWallet(state, 'wal_a', 'user_a', 10_000);
  seedWallet(state, 'wal_b', 'user_b', 0);
  const db = createFakeDb(state);

  const first = await runTransferMoneyPath(db, {
    senderWalletId: 'wal_a',
    recipientWalletId: 'wal_b',
    amountUnits: 2_000,
    idempotencyKey: 'reuse-key-01',
    requestHash: hashWalletIdempotencyPayload({ amountUnits: 2_000 }),
    senderUserId: 'user_a',
  });
  assert.equal(first.result, 'committed');

  await assert.rejects(
    (async () => {
      const { client, rollback } = db.begin();
      try {
        await claimWalletIdempotencyKey(client, {
          userId: 'user_a',
          operation: 'p2p_transfer',
          idempotencyKey: 'reuse-key-01',
          requestHash: hashWalletIdempotencyPayload({ amountUnits: 9_999 }),
        });
      } finally {
        await rollback();
      }
    })(),
    (err: unknown) => (err as { code?: string }).code === 'IDEMPOTENCY_KEY_REUSED'
  );

  assert.equal(
    db.committed.ledger.filter((r) => r.kind === 'TRANSFER_SEND').length,
    1,
    'the rejected retry must not post a second debit'
  );
});

// ─── (d) privileged context policy ──────────────────────────────────────────

test('platform_reward context requires administrative authority', async () => {
  const state = emptyState();
  const db = createFakeDb(state);
  const { client } = db.begin();

  await assert.rejects(
    assertP2pTransferContextAuthorized(client, {
      contextType: 'platform_reward',
      contextId: 'reward_batch_9',
      senderUserId: 'user_platform',
      recipientUserId: 'user_a',
      amountUnits: 500,
      callerRole: 'user',
    }),
    (err: unknown) =>
      (err as { code?: string }).code === 'P2P_TRANSFER_CONTEXT_BLOCKED'
  );

  // An admin acting on the platform wallet passes the authority gate.
  await assertP2pTransferContextAuthorized(client, {
    contextType: 'platform_reward',
    contextId: 'reward_batch_9',
    senderUserId: 'user_platform',
    recipientUserId: 'user_a',
    amountUnits: 500,
    callerRole: 'admin',
  });
});

test('coOwn_trade context must reference a real settled trade with matching participants and amount', async () => {
  const state = emptyState();
  state.trades.push({
    id: 42,
    buyer_id: 'user_a',
    seller_id: 'user_b',
    notional_gbp: '10.0000',
    fee_gbp: '0.3000',
    settlement_status: 'settled',
  });
  const db = createFakeDb(state);
  const { client } = db.begin();

  // buyer leg = ceil((10.0 + 0.3) * 1000) = 10_300 units
  const validInput = {
    contextType: 'coOwn_trade',
    contextId: '42',
    senderUserId: 'user_a',
    recipientUserId: 'user_b',
    amountUnits: 10_300,
    callerRole: 'user',
  };

  await assertP2pTransferContextAuthorized(client, validInput);

  await assert.rejects(
    assertP2pTransferContextAuthorized(client, {
      ...validInput,
      contextId: '9999',
    }),
    (err: unknown) =>
      (err as { code?: string }).code === 'P2P_TRANSFER_CONTEXT_NOT_FOUND'
  );

  await assert.rejects(
    assertP2pTransferContextAuthorized(client, {
      ...validInput,
      recipientUserId: 'user_c',
    }),
    (err: unknown) =>
      (err as { code?: string }).code === 'P2P_TRANSFER_CONTEXT_BLOCKED'
  );

  await assert.rejects(
    assertP2pTransferContextAuthorized(client, {
      ...validInput,
      amountUnits: 5_000,
    }),
    (err: unknown) =>
      (err as { code?: string }).code === 'P2P_TRANSFER_CONTEXT_BLOCKED'
  );
});

test('a privileged context reference is single-use once a transfer commits', async () => {
  const state = emptyState();
  state.trades.push({
    id: 42,
    buyer_id: 'user_a',
    seller_id: 'user_b',
    notional_gbp: '10.0000',
    fee_gbp: '0.3000',
    settlement_status: 'settled',
  });
  state.izeTransfers.push({
    id: 'ize_transfer_prev',
    status: 'committed',
    metadata: { contextType: 'coOwn_trade', contextId: '42' },
  });
  const db = createFakeDb(state);
  const { client } = db.begin();

  await assert.rejects(
    assertP2pTransferContextAuthorized(client, {
      contextType: 'coOwn_trade',
      contextId: '42',
      senderUserId: 'user_a',
      recipientUserId: 'user_b',
      amountUnits: 10_300,
      callerRole: 'user',
    }),
    (err: unknown) =>
      (err as { code?: string }).code === 'P2P_TRANSFER_CONTEXT_BLOCKED'
  );
});

test('an unknown context type is rejected', async () => {
  const state = emptyState();
  const db = createFakeDb(state);
  const { client } = db.begin();

  await assert.rejects(
    assertP2pTransferContextAuthorized(client, {
      contextType: 'marketplace_sale',
      contextId: 'ord_1',
      senderUserId: 'user_a',
      recipientUserId: 'user_b',
      amountUnits: 100,
      callerRole: 'admin',
    }),
    (err: unknown) =>
      (err as { code?: string }).code === 'P2P_TRANSFER_CONTEXT_INVALID'
  );
});

// ─── FIN-03 wiring — every remaining 1ZE debit path is reservation-aware ──
//
// index.ts cannot be imported in unit tests, so these are source-level
// assertions (same pattern as moderationImportSafety.test.ts /
// checkoutMoneyPathGuards.test.ts): each debit site must route its spend
// decision through the shared spendable primitive inside the mutation
// transaction, BEFORE the ledger/segment debit runs. A path that reverts to
// a gross oneze_balance_units read fails these tests.

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(join(here, '..', 'index.ts'), 'utf8');

/** Slice index.ts between two stable route/function markers. */
function sliceBetween(startMarker: string, endMarker: string): string {
  const start = indexSource.indexOf(startMarker);
  assert.notEqual(start, -1, `marker not found: ${startMarker}`);
  const end = indexSource.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `marker not found after ${startMarker}: ${endMarker}`);
  return indexSource.slice(start, end);
}

test('burn path asserts spendable before the segment and ledger debits', () => {
  const burn = sliceBetween(
    "app.post('/wallet/1ze/burn'",
    "app.post('/wallet/convert-1ze-to-fiat'"
  );
  const assertIdx = burn.indexOf('assertSpendableOnezeUnits');
  assert.notEqual(assertIdx, -1, 'burn must assert spendable funds');
  const segmentIdx = burn.indexOf('debitWalletSegmentBalance');
  const ledgerIdx = burn.indexOf("kind: 'BURN'");
  assert.ok(segmentIdx > assertIdx, 'spendable assert precedes the segment debit');
  assert.ok(ledgerIdx > assertIdx, 'spendable assert precedes the wallet ledger debit');
});

test('convert path gates on spendable units, not the gross balance', () => {
  const convert = sliceBetween(
    "app.post('/wallet/convert-1ze-to-fiat'",
    "app.post('/wallet/buy-1ze'"
  );
  const spendableIdx = convert.indexOf('computeSpendableOnezeUnits');
  assert.notEqual(spendableIdx, -1, 'convert must compute spendable funds');
  const insufficientIdx = convert.indexOf('INSUFFICIENT_1ZE_BALANCE');
  assert.ok(insufficientIdx > spendableIdx, 'the balance check consumes the spendable figure');
  assert.ok(
    convert.includes('spendableFunds.spendableUnits < amountUnits'),
    'the conversion guard compares against spendable units'
  );
});

test('withdrawal accept asserts spendable before the WITHDRAWAL_RESERVED debit', () => {
  const accept = sliceBetween(
    "app.post('/wallet/1ze/withdrawals/:withdrawalId/accept'",
    "app.post('/wallet/1ze/withdrawals/:withdrawalId/execute'"
  );
  const assertIdx = accept.indexOf('assertSpendableOnezeUnits');
  assert.notEqual(assertIdx, -1, 'withdrawal accept must assert spendable funds');
  const debitIdx = accept.indexOf("kind: 'WITHDRAWAL_RESERVED'");
  assert.ok(debitIdx > assertIdx, 'spendable assert precedes the WITHDRAWAL_RESERVED debit');
  // The QUOTED request stage must NOT assert — it moves no funds.
  const quote = sliceBetween(
    "app.post('/wallet/1ze/withdrawals/quote'",
    "app.post('/wallet/1ze/withdrawals/:withdrawalId/accept'"
  );
  assert.equal(
    quote.includes('assertSpendableOnezeUnits'),
    false,
    'the quote stage writes pricing only — the spend decision is at accept'
  );
});

test('oneze_internal checkout preflight computes spendable, settlement asserts it', () => {
  const settle = sliceBetween(
    'async function settlePaymentIntent',
    'async function reconcileStaleProviderSubmissions'
  );
  const onezeBranch = settle.indexOf("updatedIntent.gateway_id === 'oneze_internal'");
  assert.notEqual(onezeBranch, -1);
  const assertIdx = settle.indexOf('assertSpendableOnezeUnits', onezeBranch);
  assert.notEqual(assertIdx, -1, 'the oneze_internal debit must assert spendable funds');
  const debitIdx = settle.indexOf("kind: 'PURCHASE'", onezeBranch);
  assert.ok(debitIdx > assertIdx, 'spendable assert precedes the PURCHASE debit');

  const preflight = sliceBetween(
    "if (gatewayId === 'oneze_internal' && channel === 'commerce' && orderId) {",
    'if (availableUnits < debitQuote.debitUnits)'
  );
  assert.ok(
    preflight.includes('computeSpendableOnezeUnits'),
    'the checkout balance preflight must read spendable funds'
  );
  assert.equal(
    preflight.includes('readOnezeBalanceUnitsForUpdate'),
    false,
    'the preflight must not gate on the gross balance alone'
  );
});
