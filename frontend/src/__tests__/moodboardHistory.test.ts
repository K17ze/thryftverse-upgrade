import { describe, it, expect } from 'vitest';

import {
  MOODBOARD_HISTORY_LIMIT,
  EMPTY_HISTORY,
  recordEntry,
  moveEntry,
  positionsEqual,
  computeOrderMoves,
  opsForEntry,
  applyEntryToBoard,
  type MoodboardHistoryEntry,
  type MoodboardHistoryState,
} from '../components/moodboard/moodboardHistory';
import type { Moodboard, MoodboardItem, MoodboardItemPosition } from '../services/moodboardApi';

/**
 * R64: client undo/redo for the moodboard editor.
 *
 * The stack semantics and entry→op translation are pure — these tests cover
 * the record/undo/redo transitions, the depth cap, the front/back order-move
 * resolver, and the optimistic board reducer.
 */

const POS: MoodboardItemPosition = { x: 0.5, y: 0.5, scale: 1, rotation: 0 };

function makeItem(id: string, position: MoodboardItemPosition = POS): MoodboardItem {
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
    position,
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
    items: itemIds.map((id) => makeItem(id)),
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

const transformEntry = (id: string): MoodboardHistoryEntry => ({
  kind: 'transform',
  itemId: id,
  undoPosition: { x: 0.2, y: 0.2, scale: 1, rotation: 0 },
  redoPosition: { x: 0.8, y: 0.8, scale: 2, rotation: 45 },
});

// ---------------------------------------------------------------------------
// Stack transitions
// ---------------------------------------------------------------------------

describe('moodboardHistory — stack semantics', () => {
  it('records entries onto the undo stack and clears redo', () => {
    let state = EMPTY_HISTORY;
    const a = transformEntry('a');
    const b = transformEntry('b');
    state = recordEntry(state, a);
    state = moveEntry(state, a, 'undo');
    expect(state.undo).toEqual([]);
    expect(state.redo).toEqual([a]);
    // A new mutation clears the redo stack.
    state = recordEntry(state, b);
    expect(state.undo).toEqual([b]);
    expect(state.redo).toEqual([]);
  });

  it('moves the entry undo→redo→undo', () => {
    const a = transformEntry('a');
    let state: MoodboardHistoryState = { undo: [a], redo: [] };
    state = moveEntry(state, a, 'undo');
    expect(state).toEqual({ undo: [], redo: [a] });
    state = moveEntry(state, a, 'redo');
    expect(state).toEqual({ undo: [a], redo: [] });
  });

  it('ignores a transition for an entry no longer on the stack', () => {
    const a = transformEntry('a');
    const b = transformEntry('b');
    const state: MoodboardHistoryState = { undo: [a], redo: [] };
    expect(moveEntry(state, b, 'undo')).toBe(state);
  });

  it('caps the undo stack at the limit, dropping the oldest entries', () => {
    let state = EMPTY_HISTORY;
    for (let i = 0; i < MOODBOARD_HISTORY_LIMIT + 5; i += 1) {
      state = recordEntry(state, transformEntry(`item-${i}`));
    }
    expect(state.undo).toHaveLength(MOODBOARD_HISTORY_LIMIT);
    expect(state.undo[0]).toMatchObject({ itemId: 'item-5' });
    expect(state.undo[MOODBOARD_HISTORY_LIMIT - 1]).toMatchObject({
      itemId: `item-${MOODBOARD_HISTORY_LIMIT + 4}`,
    });
  });
});

// ---------------------------------------------------------------------------
// Position comparison
// ---------------------------------------------------------------------------

describe('moodboardHistory — positionsEqual', () => {
  it('treats effectively identical transforms as equal', () => {
    expect(positionsEqual(POS, { ...POS })).toBe(true);
    expect(positionsEqual(POS, { ...POS, x: 0.5005 })).toBe(true);
    expect(positionsEqual(POS, { ...POS, x: 0.6 })).toBe(false);
    expect(positionsEqual(POS, { ...POS, scale: 1.5 })).toBe(false);
    expect(positionsEqual(POS, { ...POS, rotation: 30 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Order restoration via front/back moves
// ---------------------------------------------------------------------------

describe('moodboardHistory — computeOrderMoves', () => {
  it('returns no moves when the order already matches', () => {
    expect(computeOrderMoves(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual([]);
  });

  it('undoes a bring-to-front by re-fronting the items that were ahead', () => {
    // 'b' was moved from index 1 to the front: [a,c,d,b] → restore [a,b,c,d].
    const moves = computeOrderMoves(['a', 'c', 'd', 'b'], ['a', 'b', 'c', 'd']);
    expect(moves).toEqual([
      { itemId: 'c', direction: 'front' },
      { itemId: 'd', direction: 'front' },
    ]);
  });

  it('undoes a send-to-back by re-backing the items that were behind', () => {
    // 'a' was sent to back: [b,c,d,a] → restore [a,b,c,d].
    const moves = computeOrderMoves(['b', 'c', 'd', 'a'], ['a', 'b', 'c', 'd']);
    expect(moves).toEqual([{ itemId: 'a', direction: 'back' }]);
  });

  it('restores mid-list order whichever direction is cheaper', () => {
    // 'c' sent to back: [c,a,b,d] → restore [a,b,c,d]. Either direction is
    // two moves — assert correctness by simulation.
    const moves = computeOrderMoves(['c', 'a', 'b', 'd'], ['a', 'b', 'c', 'd']);
    expect(applyMoves(['c', 'a', 'b', 'd'], moves)).toEqual(['a', 'b', 'c', 'd']);
    expect(moves.length).toBeLessThanOrEqual(2);
  });

  it('restores a bring-all-to-front order with a minimal move set', () => {
    // Selected {b,d} brought to front: [a,c,e,b,d] → restore [a,b,c,d,e].
    const moves = computeOrderMoves(['a', 'c', 'e', 'b', 'd'], ['a', 'b', 'c', 'd', 'e']);
    const simulated = applyMoves(['a', 'c', 'e', 'b', 'd'], moves);
    expect(simulated).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(moves.length).toBeLessThanOrEqual(3);
  });

  it('skips desired ids that are not on the board', () => {
    const moves = computeOrderMoves(['a', 'b'], ['a', 'gone', 'b']);
    const simulated = applyMoves(['a', 'b'], moves);
    expect(simulated).toEqual(['a', 'b']);
  });
});

/** Simulates the server-side effect of front/back reorder ops. */
function applyMoves(order: string[], moves: { itemId: string; direction: 'front' | 'back' }[]): string[] {
  const next = [...order];
  for (const m of moves) {
    const i = next.indexOf(m.itemId);
    if (i < 0) continue;
    next.splice(i, 1);
    if (m.direction === 'front') next.push(m.itemId);
    else next.unshift(m.itemId);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Entry → op translation
// ---------------------------------------------------------------------------

describe('moodboardHistory — opsForEntry', () => {
  it('translates a transform undo/redo into item.transform ops', () => {
    const entry = transformEntry('a');
    const [undoOp] = opsForEntry(entry, 'undo', ['a', 'b']);
    expect(undoOp.operation).toBe('item.transform');
    expect(undoOp.payload).toMatchObject({ itemId: 'a', positionX: 0.2, positionY: 0.2, scale: 1 });
    const [redoOp] = opsForEntry(entry, 'redo', ['a', 'b']);
    expect(redoOp.payload).toMatchObject({ itemId: 'a', positionX: 0.8, rotation: 45 });
  });

  it('drops ops for items that no longer exist (concurrent LWW interleave)', () => {
    const entry = transformEntry('gone');
    expect(opsForEntry(entry, 'undo', ['a', 'b'])).toEqual([]);
  });

  it('undoes an add with item.remove and redoes it with item.add', () => {
    const entry: MoodboardHistoryEntry = { kind: 'addItem', item: makeItem('x') };
    expect(opsForEntry(entry, 'undo', ['a', 'x'])).toEqual([
      { operation: 'item.remove', payload: { itemId: 'x' } },
    ]);
    const [add] = opsForEntry(entry, 'redo', ['a']);
    expect(add.operation).toBe('item.add');
    expect(add.payload).toMatchObject({
      itemId: 'x',
      listingId: 'listing-x',
      positionX: 0.5,
      positionY: 0.5,
      scale: 1,
      rotation: 0,
    });
    // No-op when the item is already back on the board.
    expect(opsForEntry(entry, 'redo', ['a', 'x'])).toEqual([]);
  });

  it('undoes a delete by re-adding the item and restoring layer order', () => {
    // Board was [a,b,c,d]; 'b' was deleted leaving [a,c,d].
    const entry: MoodboardHistoryEntry = {
      kind: 'removeItems',
      items: [makeItem('b')],
      orderBefore: ['a', 'b', 'c', 'd'],
    };
    const ops = opsForEntry(entry, 'undo', ['a', 'c', 'd']);
    expect(ops[0]).toMatchObject({ operation: 'item.add', payload: { itemId: 'b' } });
    // Re-added items land at the front, so 'b' must be sent back to index 1:
    // simulated order after re-add is [a,c,d,b] → front c, front d.
    const reorderOps = ops.slice(1);
    expect(
      reorderOps.every((op) => op.operation === 'item.reorder'),
    ).toBe(true);
    const moves = reorderOps.map((op) => ({
      itemId: op.payload.itemId as string,
      direction: op.payload.direction as 'front' | 'back',
    }));
    expect(applyMoves(['a', 'c', 'd', 'b'], moves)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('redoes a delete with item.remove for each present item', () => {
    const entry: MoodboardHistoryEntry = {
      kind: 'removeItems',
      items: [makeItem('a'), makeItem('c')],
      orderBefore: ['a', 'b', 'c', 'd'],
    };
    const ops = opsForEntry(entry, 'redo', ['a', 'b', 'c', 'd']);
    expect(ops).toEqual([
      { operation: 'item.remove', payload: { itemId: 'a' } },
      { operation: 'item.remove', payload: { itemId: 'c' } },
    ]);
  });

  it('translates order and theme entries', () => {
    const orderEntry: MoodboardHistoryEntry = {
      kind: 'order',
      orderBefore: ['a', 'b'],
      orderAfter: ['b', 'a'],
    };
    const ops = opsForEntry(orderEntry, 'undo', ['b', 'a']);
    expect(applyMoves(['b', 'a'], ops.map((op) => ({
      itemId: op.payload.itemId as string,
      direction: op.payload.direction as 'front' | 'back',
    })))).toEqual(['a', 'b']);

    const themeEntry: MoodboardHistoryEntry = {
      kind: 'theme',
      undoTheme: 'theme-linen',
      redoTheme: 'theme-noir',
    };
    expect(opsForEntry(themeEntry, 'undo', [])).toEqual([
      { operation: 'board.theme', payload: { theme: 'theme-linen' } },
    ]);
    expect(opsForEntry(themeEntry, 'redo', [])).toEqual([
      { operation: 'board.theme', payload: { theme: 'theme-noir' } },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Optimistic board reducer
// ---------------------------------------------------------------------------

describe('moodboardHistory — applyEntryToBoard', () => {
  it('restores the prior transform on undo', () => {
    const board = makeBoard(['a']);
    board.items[0] = { ...board.items[0], position: { x: 0.8, y: 0.8, scale: 2, rotation: 45 } };
    const next = applyEntryToBoard(board, transformEntry('a'), 'undo');
    expect(next.items[0].position).toEqual({ x: 0.2, y: 0.2, scale: 1, rotation: 0 });
  });

  it('removes an added item on undo and re-appends it on redo', () => {
    const board = makeBoard(['a', 'x']);
    const entry: MoodboardHistoryEntry = { kind: 'addItem', item: makeItem('x') };
    const undone = applyEntryToBoard(board, entry, 'undo');
    expect(undone.items.map((it) => it.id)).toEqual(['a']);
    const redone = applyEntryToBoard(undone, entry, 'redo');
    expect(redone.items.map((it) => it.id)).toEqual(['a', 'x']);
  });

  it('re-inserts a deleted item at its original layer position on undo', () => {
    const board = makeBoard(['a', 'c', 'd']);
    const entry: MoodboardHistoryEntry = {
      kind: 'removeItems',
      items: [makeItem('b')],
      orderBefore: ['a', 'b', 'c', 'd'],
    };
    const next = applyEntryToBoard(board, entry, 'undo');
    expect(next.items.map((it) => it.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('restores layer order and theme', () => {
    const board = makeBoard(['b', 'a']);
    const orderEntry: MoodboardHistoryEntry = {
      kind: 'order',
      orderBefore: ['a', 'b'],
      orderAfter: ['b', 'a'],
    };
    expect(applyEntryToBoard(board, orderEntry, 'undo').items.map((it) => it.id)).toEqual(['a', 'b']);

    const themeEntry: MoodboardHistoryEntry = {
      kind: 'theme',
      undoTheme: 'theme-linen',
      redoTheme: 'theme-noir',
    };
    expect(applyEntryToBoard(board, themeEntry, 'undo').theme).toBe('theme-linen');
    expect(applyEntryToBoard(board, themeEntry, 'redo').theme).toBe('theme-noir');
  });
});
