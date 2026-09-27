import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

/**
 * S20-04 — moodboard undo/redo must only advance on a persisted inverse.
 *
 * submitBoardOps now returns a discriminated outcome
 * (applied | queued | conflict | forbidden | failed). History advances the
 * stack ONLY on 'applied'/'queued' — a failed or conflicted multi-op inverse
 * may have persisted just a prefix, so the optimistic board update must be
 * reconciled against server truth and the entry kept on its stack (the
 * command stays recoverable, never silently consumed).
 *
 * These tests FAIL on the pre-fix hook: the old undo/redo moved the stack
 * entry unconditionally after `await submitBoardOps(ops)` resolved, and
 * submitBoardOps resolved without an outcome — a half-persisted inverse
 * displayed as fully undone.
 */

import { useMoodboardHistory } from '../components/moodboard/useMoodboardHistory';
import type { useMoodboardBoard, SubmitBoardOpsOutcome } from '../components/moodboard/useMoodboardBoard';
import type { useMoodboardMutations } from '../components/moodboard/useMoodboardMutations';
import type { useMoodboardSelection } from '../components/moodboard/useMoodboardSelection';
import type { Moodboard, MoodboardItem, MoodboardItemPosition } from '../services/moodboardApi';
import type { MoodboardQueuedOp } from '../components/moodboard/moodboardHistory';

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

// ── Injectable fakes — the hook consumes board/selection/mutations as
//    already-composed objects, so the persistence boundary is mockable
//    without touching storage or the network. ──
let boardState: Moodboard;
const submitBoardOpsMock = vi.fn<(ops: MoodboardQueuedOp[]) => Promise<SubmitBoardOpsOutcome>>();
const reconcileBoardMock = vi.fn<() => Promise<void>>();

const board = {
  get moodboard() {
    return boardState;
  },
  setMoodboard: (next: Moodboard | null) => {
    if (next) boardState = next;
  },
  setActiveThemeId: vi.fn(),
  submitBoardOps: (ops: MoodboardQueuedOp[]) => submitBoardOpsMock(ops),
  reconcileBoard: () => reconcileBoardMock(),
} as unknown as ReturnType<typeof useMoodboardBoard>;

const selection = {
  selectedItemId: null,
  selectedItemIds: new Set<string>(),
  setSelectedItemId: vi.fn(),
  setSelectedItemIds: vi.fn(),
} as unknown as ReturnType<typeof useMoodboardSelection>;

// The delete mutation reports success and the "server" applies the remove —
// the optimistic board is updated by the test to mirror persisted truth.
const mutations = {
  handleDeleteItem: vi.fn(async (_id: string) => true),
} as unknown as ReturnType<typeof useMoodboardMutations>;

let latest: ReturnType<typeof useMoodboardHistory>;

function Harness() {
  latest = useMoodboardHistory({ board, selection, mutations });
  return null;
}

async function mount() {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Harness />);
  });
  return renderer;
}

/** Mirror the post-mutation server truth into the board prop and re-render
 *  so the hook's moodboardRef observes it. */
async function applyServerBoard(
  renderer: TestRenderer.ReactTestRenderer,
  itemIds: string[],
) {
  boardState = makeBoard(itemIds);
  await act(async () => {
    renderer.update(<Harness />);
  });
}

beforeEach(() => {
  boardState = makeBoard(['a', 'b', 'c', 'd']);
  submitBoardOpsMock.mockReset();
  reconcileBoardMock.mockReset();
  (mutations.handleDeleteItem as ReturnType<typeof vi.fn>).mockClear();
});

// ---------------------------------------------------------------------------
// S20-04 — failed/conflicted inverse never advances the stack
// ---------------------------------------------------------------------------

describe('useMoodboardHistory — S20-04 outcome gating', () => {
  it('a multi-op undo that fails part-way does not advance the stack and reconciles the board', async () => {
    submitBoardOpsMock.mockResolvedValue('failed');
    // Reconcile restores the server-side truth (item 'b' stayed deleted
    // because only a prefix of the inverse persisted).
    reconcileBoardMock.mockImplementation(async () => {
      boardState = makeBoard(['a', 'c', 'd']);
    });

    const renderer = await mount();

    // Record a delete of 'b' — the inverse is multi-op (item.add + layer
    // order restoration), exactly the partial-persistence hazard.
    await act(async () => {
      await latest.handleDeleteItem('b');
    });
    await applyServerBoard(renderer, ['a', 'c', 'd']);
    expect(latest.canUndo).toBe(true);

    await act(async () => {
      await latest.undo();
    });

    // The inverse went through the canonical op path — a multi-op batch
    // (item.add for 'b' plus layer-order restoration).
    expect(submitBoardOpsMock).toHaveBeenCalledTimes(1);
    const ops = submitBoardOpsMock.mock.calls[0][0];
    expect(ops.length).toBeGreaterThan(1);
    expect(ops[0]).toMatchObject({ operation: 'item.add', payload: { itemId: 'b' } });

    // Stack did NOT advance — the undo stays recoverable.
    expect(latest.canUndo).toBe(true);
    expect(latest.canRedo).toBe(false);

    // The optimistic inverse was reconciled against server truth — the
    // canvas must not keep claiming a state that never persisted.
    expect(reconcileBoardMock).toHaveBeenCalledTimes(1);
    expect(boardState.items.map((it) => it.id)).toEqual(['a', 'c', 'd']);
  });

  it('a conflicted undo keeps the entry and reconciles', async () => {
    submitBoardOpsMock.mockResolvedValue('conflict');
    reconcileBoardMock.mockImplementation(async () => {
      boardState = makeBoard(['a', 'c', 'd']);
    });

    const renderer = await mount();
    await act(async () => {
      await latest.handleDeleteItem('b');
    });
    await applyServerBoard(renderer, ['a', 'c', 'd']);

    await act(async () => {
      await latest.undo();
    });

    expect(latest.canUndo).toBe(true);
    expect(latest.canRedo).toBe(false);
    expect(reconcileBoardMock).toHaveBeenCalledTimes(1);
  });

  it('an applied inverse advances the stack without reconciling', async () => {
    submitBoardOpsMock.mockResolvedValue('applied');

    const renderer = await mount();
    await act(async () => {
      await latest.handleDeleteItem('b');
    });
    await applyServerBoard(renderer, ['a', 'c', 'd']);

    await act(async () => {
      await latest.undo();
    });

    expect(latest.canUndo).toBe(false);
    expect(latest.canRedo).toBe(true);
    expect(reconcileBoardMock).not.toHaveBeenCalled();
  });

  it('a queued inverse (durable outbox intent) advances the stack', async () => {
    submitBoardOpsMock.mockResolvedValue('queued');

    const renderer = await mount();
    await act(async () => {
      await latest.handleDeleteItem('b');
    });
    await applyServerBoard(renderer, ['a', 'c', 'd']);

    await act(async () => {
      await latest.undo();
    });

    expect(latest.canUndo).toBe(false);
    expect(latest.canRedo).toBe(true);
    expect(reconcileBoardMock).not.toHaveBeenCalled();
  });
});
