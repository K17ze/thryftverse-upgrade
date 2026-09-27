import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * S21-04 — moodboard command batches must be atomically durable, the
 * failed-inverse reconcile must run under the history lock, and a failed
 * reconcile must report 'unreconciled' rather than 'applied'.
 *
 * Unlike moodboardHistoryOutcome.test.tsx (which stubs submitBoardOps),
 * these tests mount the REAL useMoodboardBoard + useMoodboardHistory and
 * the REAL storage/moodboardOutbox module against an in-memory fake of the
 * op-sqlite boundary (execute + transaction with rollback semantics), so
 * the durable SQLite enqueue path is exercised end to end.
 *
 * Every test FAILS on the pre-fix code:
 *  - pre-fix submitBoardOps enqueued op-by-op → a mid-batch failure left a
 *    durable prefix that drained on reconnect after reporting 'failed';
 *  - pre-fix undo/redo released applyingRef BEFORE the reconcile fetch →
 *    a second command interleaved and was overwritten by the late response;
 *  - pre-fix reconcileBoard swallowed fetch errors → flushOutbox reported
 *    'applied'/'synced' for unverified state.
 */

import { useMoodboardBoard } from '../components/moodboard/useMoodboardBoard';
import { useMoodboardHistory } from '../components/moodboard/useMoodboardHistory';
import {
  drainMoodboardOutbox,
  getMoodboardOutboxPendingCount } from '../storage/moodboardOutbox';
import type { useMoodboardMutations } from '../components/moodboard/useMoodboardMutations';
import type { useMoodboardSelection } from '../components/moodboard/useMoodboardSelection';
import type { Moodboard, MoodboardItem, MoodboardItemPosition } from '../services/moodboardApi';
import type { MoodboardQueuedOp } from '../components/moodboard/moodboardHistory';

// ---------------------------------------------------------------------------
// In-memory fake of the op-sqlite boundary for `mutation_outbox`.
// `transaction()` snapshots the table and restores it on throw — modelling
// BEGIN/COMMIT/ROLLBACK so a mid-batch insert failure truly rolls back.
// ---------------------------------------------------------------------------

interface OutboxRow {
  seq: number;
  operation_id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  payload_json: string;
  base_rev: number;
  state: string;
  attempt_count: number;
  last_error: string | null;
}

const DRAINABLE_STATES = new Set(['pending', 'pushing', 'conflict']);

const fakeDb = vi.hoisted(() => {
  const state = {
    rows: [] as OutboxRow[],
    nextSeq: 1,
    /** Total INSERT attempts (including ones that threw). */
    insertAttempts: 0,
    /** 1-based INSERT call index that throws; -1 = never fail. */
    failInsertAt: -1,
    committedTxns: 0,
    rollbacks: 0,
    snapshot: null as OutboxRow[] | null,
  };

  const result = (rows: unknown[] = []) => ({
    rows: {
      _array: rows,
      length: rows.length,
      item: (i: number) => rows[i],
    },
    rowsAffected: 0,
  });

  return {
    state,
    pendingRows: () => state.rows.filter((r) => DRAINABLE_STATES.has(r.state)),
    reset() {
      state.rows = [];
      state.nextSeq = 1;
      state.insertAttempts = 0;
      state.failInsertAt = -1;
      state.committedTxns = 0;
      state.rollbacks = 0;
      state.snapshot = null;
    },
    async transaction(cb: () => void | Promise<void>) {
      state.snapshot = state.rows.map((r) => ({ ...r }));
      try {
        await cb();
        state.snapshot = null;
        state.committedTxns++;
      } catch (error) {
        if (state.snapshot) state.rows = state.snapshot;
        state.snapshot = null;
        state.rollbacks++;
        throw error;
      }
    },
    execute(sql: string, ...params: (string | number | null)[]) {
      const s = sql.replace(/\s+/g, ' ').trim();

      if (/^INSERT OR REPLACE INTO mutation_outbox/i.test(s)) {
        state.insertAttempts++;
        if (state.insertAttempts === state.failInsertAt) {
          throw new Error('sqlite: write failed');
        }
        const [operationId, entityId, operation, payloadJson, baseRev] = params;
        state.rows = state.rows.filter((r) => r.operation_id !== operationId);
        state.rows.push({
          seq: state.nextSeq++,
          operation_id: String(operationId),
          entity_type: 'moodboard',
          entity_id: String(entityId),
          operation: String(operation),
          payload_json: String(payloadJson),
          base_rev: Number(baseRev),
          state: 'pending',
          attempt_count: 0,
          last_error: null });
        return result();
      }

      if (/^SELECT COUNT\(\*\) AS count FROM mutation_outbox/i.test(s)) {
        const count = state.rows.filter(
          (r) => r.entity_type === 'moodboard' && DRAINABLE_STATES.has(r.state),
        ).length;
        return result([{ count }]);
      }

      if (/^SELECT seq, operation_id/i.test(s)) {
        const rows = state.rows
          .filter((r) => r.entity_type === 'moodboard' && DRAINABLE_STATES.has(r.state))
          .sort((a, b) => a.seq - b.seq);
        return result(rows);
      }

      if (/^DELETE FROM mutation_outbox WHERE seq = \?/i.test(s)) {
        state.rows = state.rows.filter((r) => r.seq !== params[0]);
        return result();
      }

      if (/^DELETE FROM mutation_outbox WHERE operation_id = \?/i.test(s)) {
        state.rows = state.rows.filter((r) => r.operation_id !== params[0]);
        return result();
      }

      if (/^DELETE FROM mutation_outbox/i.test(s)) {
        // clearMoodboardOutboxForBoard — entity_id = ? + drainable/failed states.
        state.rows = state.rows.filter(
          (r) => !(
            r.entity_type === 'moodboard' &&
            r.entity_id === params[0] &&
            ['pending', 'pushing', 'conflict', 'failed'].includes(r.state)),
        );
        return result();
      }

      if (/^UPDATE mutation_outbox SET base_rev = \?/i.test(s)) {
        const [rev, entityId, seq] = params;
        for (const r of state.rows) {
          if (
            r.entity_type === 'moodboard' &&
            r.entity_id === entityId &&
            r.state === 'pending' &&
            r.seq > Number(seq)
          ) {
            r.base_rev = Number(rev);
          }
        }
        return result();
      }

      if (/^UPDATE mutation_outbox SET state = 'pushing'/i.test(s)) {
        const row = state.rows.find((r) => r.seq === params[0]);
        if (row) row.state = 'pushing';
        return result();
      }

      if (/^UPDATE mutation_outbox SET state = '(\w+)'/i.test(s)) {
        const newState = s.match(/SET state = '(\w+)'/i)![1];
        // Shapes: (attempt, seq) or (attempt, lastError, seq) — seq is last.
        const row = state.rows.find((r) => r.seq === params[params.length - 1]);
        if (row) {
          row.state = newState;
          row.attempt_count = Number(params[0]);
          if (params.length === 3) row.last_error = String(params[1]);
        }
        return result();
      }

      throw new Error(`fakeDb: unhandled SQL: ${s}`);
    },
  };
});

// ---------------------------------------------------------------------------
// Module mocks — everything except the real outbox + real hooks.
// ---------------------------------------------------------------------------

const connectivity = vi.hoisted(() => ({ isOffline: false }));
vi.mock('../hooks/useConnectivity', () => ({
  useConnectivity: () => ({
    isOffline: connectivity.isOffline,
    isConnected: !connectivity.isOffline,
    connectionType: 'wifi' }),
}));

vi.mock('../hooks/useHaptic', () => ({
  useHaptic: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    selection: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    patterns: { save: vi.fn() } }),
}));

vi.mock('../platform/realtime/useRealtimeEvent', () => ({
  useRealtimeEvent: () => null,
}));

const storeState = vi.hoisted(() => ({
  currentUser: { id: 'user-1', username: 'viewer' } as { id: string; username: string } | null,
}));
vi.mock('../store/useStore', () => {
  const useStore = (selector: (s: typeof storeState) => unknown) => selector(storeState);
  (useStore as { getState?: () => typeof storeState }).getState = () => storeState;
  return { useStore };
});

vi.mock('../analytics', () => ({ track: vi.fn() }));

const fetchJsonMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/apiClient', () => ({
  fetchJson: (...args: unknown[]) => fetchJsonMock(...args),
}));

// Real storage/moodboardOutbox runs against this fake DB — the tests exercise
// the actual transaction boundary, not a stub of it.
vi.mock('../storage/db', () => ({
  isDbAvailable: () => true,
  getDb: async () => fakeDb,
}));

const fetchMoodboardDetailMock = vi.hoisted(() => vi.fn());
const submitMoodboardOperationMock = vi.hoisted(() => vi.fn());
const THEME = {
  id: 'theme-linen',
  label: 'Linen',
  backgroundColor: '#f5f0e8',
  accentColor: '#333',
  fontColor: '#111',
  isDemo: false };
vi.mock('../services/moodboardApi', () => ({
  fetchMoodboardDetail: (...args: unknown[]) => fetchMoodboardDetailMock(...args),
  fetchMoodboardThemes: async () => [THEME],
  fetchPickerItems: async () => [],
  createMoodboard: vi.fn(),
  getThemeById: () => THEME,
  submitMoodboardOperation: (...args: unknown[]) => submitMoodboardOperationMock(...args),
}));

vi.mock('../utils/createStableId', () => {
  let n = 0;
  return { createStableId: (prefix: string) => `${prefix}-${++n}` };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const POS: MoodboardItemPosition = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };

function makeItem(id: string): MoodboardItem {
  return {
    id,
    sourceType: 'listing',
    listingId: `listing-${id}`,
    sourceLookId: null,
    mediaAssetId: null,
    imageUri: `https://img/${id}.jpg`,
    videoUri: '',
    mediaType: 'image',
    title: `Item ${id}`,
    caption: '',
    price: 10,
    aspectRatio: 1,
    position: POS,
    addedAt: '2026-01-01T00:00:00.000Z',
    isDemo: false,
    revision: 1,
  };
}

function makeBoard(itemIds: string[]): Moodboard {
  return {
    id: 'board-1',
    title: 'Board',
    description: '',
    curator: 'curator',
    curatorAvatar: '',
    items: itemIds.map(makeItem),
    coverImage: '',
    isPublic: false,
    theme: 'theme-linen',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    creatorId: 'user-1',
    viewerRole: 'owner',
    isDemo: false,
    revision: 3,
    deletedAt: null,
  };
}

/** The canonical board the "server" currently holds — fetchMoodboardDetail
 *  resolves this by default so load + reconcile paths share one truth. */
let serverBoard: Moodboard;

const selection = {
  selectedItemId: null,
  selectedItemIds: new Set<string>(),
  setSelectedItemId: vi.fn(),
  setSelectedItemIds: vi.fn(),
  setMultiSelectMode: vi.fn(),
} as unknown as ReturnType<typeof useMoodboardSelection>;

// The delete mutation reports success — history records the inverse; the
// test then mirrors the post-delete server board into the hook state.
const mutations = {
  handleDeleteItem: vi.fn(async (_id: string) => true),
} as unknown as ReturnType<typeof useMoodboardMutations>;

let board!: ReturnType<typeof useMoodboardBoard>;
let history!: ReturnType<typeof useMoodboardHistory>;

function Harness() {
  board = useMoodboardBoard({ moodboardId: 'board-1' });
  history = useMoodboardHistory({ board, selection, mutations });
  return null;
}

async function mount() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Harness />);
  });
  // Drain the mount-time loadAll + empty-queue outbox flush so no in-flight
  // effect write can race the test's own submit.
  await act(async () => {});
  await act(async () => {});
  return renderer;
}

const appliedResponse = (revision: number) => ({
  outcome: 'applied',
  operationId: 'srv-op',
  revision,
  canonicalPatch: {} });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  fakeDb.reset();
  connectivity.isOffline = false;
  serverBoard = makeBoard(['a', 'b', 'c', 'd']);
  fetchMoodboardDetailMock.mockImplementation(async () => serverBoard);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// 1 — Atomic batch enqueue: a mid-batch storage failure is fully rolled back
// ---------------------------------------------------------------------------

describe('S21-04 — atomic command enqueue', () => {
  it('rolls back the whole command when the second storage write fails — zero durable ops, no drainable prefix', async () => {
    const renderer = await mount();
    fakeDb.state.failInsertAt = 2; // the second INSERT throws mid-batch

    const ops: MoodboardQueuedOp[] = [
      { operation: 'item.transform',
        payload: { itemId: 'a', positionX: 0.1, positionY: 0.1, rotation: 0, scale: 1 } },
      { operation: 'board.theme', payload: { theme: 'theme-slate' } }];

    let outcome: unknown;
    await act(async () => {
      outcome = await board.submitBoardOps(ops);
    });

    expect(outcome).toBe('failed');
    // Pre-fix: op 1 stayed durable → pending 1 and would drain later.
    expect(fakeDb.pendingRows()).toHaveLength(0);
    expect(await getMoodboardOutboxPendingCount()).toBe(0);
    expect(fakeDb.state.rollbacks).toBe(1);
    expect(board.syncStatus).toBe('error');

    // Reconnect/drain must not apply the phantom prefix.
    const drain = await drainMoodboardOutbox();
    expect(drain).toEqual({ pushed: 0, conflicts: 0, forbidden: 0, errors: 0 });
    expect(fetchJsonMock).not.toHaveBeenCalled();

    act(() => { renderer.unmount(); });
  });

  it('commits a healthy multi-op command in ONE transaction and drains every op in order', async () => {
    const renderer = await mount();
    let rev = 3;
    fetchJsonMock.mockImplementation(async () => appliedResponse(++rev));

    const ops: MoodboardQueuedOp[] = [
      { operation: 'item.transform',
        payload: { itemId: 'a', positionX: 0.9, positionY: 0.9, rotation: 0, scale: 1 } },
      { operation: 'board.theme', payload: { theme: 'theme-slate' } }];

    let outcome: unknown;
    await act(async () => {
      outcome = await board.submitBoardOps(ops);
    });

    expect(outcome).toBe('applied');
    // Exactly one storage transaction wrapped both inserts.
    expect(fakeDb.state.committedTxns).toBe(1);
    expect(fakeDb.state.insertAttempts).toBe(2);
    expect(fakeDb.state.rollbacks).toBe(0);
    // Both ops pushed to the operations endpoint, in seq order.
    expect(fetchJsonMock).toHaveBeenCalledTimes(2);
    const bodies = fetchJsonMock.mock.calls.map((c) =>
      JSON.parse((c[1] as { body: string }).body) as { clientOperationId: string; type: string });
    expect(bodies.map((b) => b.type)).toEqual(['item.transform', 'board.theme']);
    expect(fakeDb.pendingRows()).toHaveLength(0);

    act(() => { renderer.unmount(); });
  });
});

// ---------------------------------------------------------------------------
// 2 — Ordering: the history lock covers the failed-command reconcile window
// ---------------------------------------------------------------------------

describe('S21-04 — reconcile runs under the history lock', () => {
  it('a second undo while the failed inverse reconciles is ignored — no interleaved submission, no overwrite', async () => {
    const renderer = await mount();

    // Record an undoable delete of 'b', then mirror post-delete server truth.
    await act(async () => {
      await history.handleDeleteItem('b');
      board.setMoodboard((serverBoard = makeBoard(['a', 'c', 'd'])));
    });
    expect(history.canUndo).toBe(true);

    // Every enqueue fails → the inverse reports 'failed' → reconcile runs.
    fakeDb.state.failInsertAt = 1;
    // The reconcile fetch hangs until we release the gate.
    let releaseReconcile!: (mb: Moodboard | null) => void;
    const reconcileGate = new Promise<Moodboard | null>((res) => { releaseReconcile = res; });
    fetchMoodboardDetailMock.mockImplementation(() => reconcileGate);

    const insertsBefore = fakeDb.state.insertAttempts;
    let firstUndo!: Promise<void>;
    await act(async () => {
      firstUndo = history.undo();
    });
    // The first undo reached the pending reconcile (one submit attempt only).
    expect(fakeDb.state.insertAttempts).toBe(insertsBefore + 1);

    // Second undo press DURING the reconcile window — must be serialized,
    // not interleaved (pre-fix released the lock in `finally` first).
    await act(async () => {
      await history.undo();
    });
    expect(fakeDb.state.insertAttempts).toBe(insertsBefore + 1);

    // The optimistic inverse is still on screen — the server never saw it.
    expect(board.moodboard?.items.map((it) => it.id)).toEqual(['a', 'b', 'c', 'd']);

    // Reconcile resolves with server truth — nothing interleaved to lose.
    serverBoard = makeBoard(['a', 'c', 'd']);
    releaseReconcile(serverBoard);
    await act(async () => {
      await firstUndo;
    });
    expect(board.moodboard?.items.map((it) => it.id)).toEqual(['a', 'c', 'd']);
    // The entry stays on the stack — the command is recoverable, not consumed.
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);

    act(() => { renderer.unmount(); });
  });

  it('the redo path holds the same lock — a second redo during the failed-redo reconcile is ignored', async () => {
    const renderer = await mount();

    await act(async () => {
      await history.handleDeleteItem('b');
      board.setMoodboard((serverBoard = makeBoard(['a', 'c', 'd'])));
    });

    // Apply the undo successfully first so the entry lands on the redo stack.
    fetchJsonMock.mockImplementation(async () => appliedResponse(4));
    serverBoard = makeBoard(['a', 'b', 'c', 'd']); // server applies the inverse
    await act(async () => {
      await history.undo();
    });
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);

    // Now make the redo's enqueue fail and hang its reconcile.
    fakeDb.state.failInsertAt = fakeDb.state.insertAttempts + 1;
    let releaseReconcile!: (mb: Moodboard | null) => void;
    const reconcileGate = new Promise<Moodboard | null>((res) => { releaseReconcile = res; });
    fetchMoodboardDetailMock.mockImplementation(() => reconcileGate);

    const insertsBefore = fakeDb.state.insertAttempts;
    let firstRedo!: Promise<void>;
    await act(async () => {
      firstRedo = history.redo();
    });
    expect(fakeDb.state.insertAttempts).toBe(insertsBefore + 1);

    // A second redo during the pending redo-reconcile must not interleave —
    // the entry is still on the redo stack, so pre-fix code re-submits it.
    await act(async () => {
      await history.redo();
    });
    expect(fakeDb.state.insertAttempts).toBe(insertsBefore + 1);

    releaseReconcile(makeBoard(['a', 'b', 'c', 'd']));
    await act(async () => {
      await firstRedo;
    });
    expect(board.moodboard?.items.map((it) => it.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(history.canRedo).toBe(true); // entry kept — recoverable

    act(() => { renderer.unmount(); });
  });
});

// ---------------------------------------------------------------------------
// 3 — Truthful failure: a failed reconcile is 'unreconciled', never 'applied'
// ---------------------------------------------------------------------------

describe('S21-04 — truthful unreconciled outcome', () => {
  it('reports unreconciled (not applied/synced) when the post-drain fetch fails offline', async () => {
    const renderer = await mount();

    fetchJsonMock.mockImplementation(async () => appliedResponse(9));
    // Enqueue + drain succeed, but the canonical re-fetch cannot complete.
    fetchMoodboardDetailMock.mockRejectedValue(new Error('offline'));

    let outcome: unknown;
    await act(async () => {
      outcome = await board.submitBoardOps([
        { operation: 'board.theme', payload: { theme: 'theme-slate' } }]);
    });

    // Pre-fix: 'applied' + 'synced' — unverified optimistic state presented
    // as confirmed truth.
    expect(outcome).toBe('unreconciled');
    expect(board.syncStatus).toBe('error');
    expect(board.syncStatus).not.toBe('synced');
    expect(board.conflictDetail?.message).toContain('verify');

    act(() => { renderer.unmount(); });
  });

  it('keeps the undo entry when the inverse drained but reconcile failed — unverified, recoverable', async () => {
    const renderer = await mount();

    await act(async () => {
      await history.handleDeleteItem('b');
      board.setMoodboard((serverBoard = makeBoard(['a', 'c', 'd'])));
    });
    expect(history.canUndo).toBe(true);

    fetchJsonMock.mockImplementation(async () => appliedResponse(9));
    fetchMoodboardDetailMock.mockRejectedValue(new Error('offline'));

    await act(async () => {
      await history.undo();
    });

    // 'unreconciled' does NOT advance the stack — the command stays
    // recoverable and the canvas is flagged, not silently trusted.
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    expect(board.syncStatus).toBe('error');

    act(() => { renderer.unmount(); });
  });
});
