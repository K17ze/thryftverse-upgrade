/**
 * moodboardHistory — pure undo/redo core for the moodboard editor.
 *
 * Every editor mutation is recorded as a HistoryEntry that stores both the
 * inverse (undo) and the forward (redo) operation. `opsForEntry` translates
 * an entry into LWW operation-log ops (`item.transform`, `item.remove`,
 * `item.add`, `item.reorder`, `board.theme`) — the same op vocabulary the
 * server endpoint consumes — so an undo is itself a new op, never a local
 * rewind. `applyEntryToBoard` produces the matching optimistic board.
 *
 * Multi-device scope: the stacks only track THIS client's edits. Concurrent
 * collaborator ops interleave under normal LWW semantics — an undo that
 * targets an item a collaborator moved simply lands as the latest write;
 * ops targeting items that no longer exist are filtered out.
 *
 * No React, no I/O — unit-testable in isolation.
 */
import type {
  Moodboard,
  MoodboardItem,
  MoodboardItemPosition,
  MoodboardOperationType } from '../../services/moodboardApi';

/** Deepest undo chain retained per board — oldest entries drop off. */
export const MOODBOARD_HISTORY_LIMIT = 50;

/** A queued operation destined for `/moodboards/:id/operations`. */
export interface MoodboardQueuedOp {
  /** Idempotency key — minted by the submitter when omitted. */
  operationId?: string;
  operation: MoodboardOperationType;
  payload: Record<string, unknown>;
}

export type MoodboardHistoryEntry =
  | {
      kind: 'transform';
      itemId: string;
      undoPosition: MoodboardItemPosition;
      redoPosition: MoodboardItemPosition;
    }
  | {
      /** An item was added — undo removes it, redo re-adds the snapshot. */
      kind: 'addItem';
      item: MoodboardItem;
    }
  | {
      /** One or more items were removed — undo re-adds them and restores
       *  the pre-delete layer order. */
      kind: 'removeItems';
      items: MoodboardItem[];
      /** Full back→front item id order before the delete. */
      orderBefore: string[];
    }
  | {
      /** Layer order changed (reorder / bring-all-to-front). */
      kind: 'order';
      orderBefore: string[];
      orderAfter: string[];
    }
  | {
      kind: 'theme';
      undoTheme: string;
      redoTheme: string;
    };

export interface MoodboardHistoryState {
  undo: MoodboardHistoryEntry[];
  redo: MoodboardHistoryEntry[];
}

export const EMPTY_HISTORY: MoodboardHistoryState = { undo: [], redo: [] };

// ---------------------------------------------------------------------------
// Stack transitions — standard semantics: a new mutation clears redo; the
// undo stack is capped at MOODBOARD_HISTORY_LIMIT (oldest drops off).
// ---------------------------------------------------------------------------

export function recordEntry(
  state: MoodboardHistoryState,
  entry: MoodboardHistoryEntry,
): MoodboardHistoryState {
  const undo = [...state.undo, entry];
  if (undo.length > MOODBOARD_HISTORY_LIMIT) {
    undo.splice(0, undo.length - MOODBOARD_HISTORY_LIMIT);
  }
  return { undo, redo: [] };
}

/**
 * Move an applied entry between stacks. Membership is checked by identity so
 * a transition queued before an intervening `recordEntry`/clear can't pop an
 * unrelated entry.
 */
export function moveEntry(
  state: MoodboardHistoryState,
  entry: MoodboardHistoryEntry,
  direction: 'undo' | 'redo',
): MoodboardHistoryState {
  const from = direction === 'undo' ? state.undo : state.redo;
  const index = from.lastIndexOf(entry);
  if (index < 0) return state;
  const remaining = [...from.slice(0, index), ...from.slice(index + 1)];
  return direction === 'undo'
    ? { undo: remaining, redo: [...state.redo, entry] }
    : { undo: [...state.undo, entry], redo: remaining };
}

// ---------------------------------------------------------------------------
// Position comparison — mirrors the canvas item's sync thresholds so a drag
// that committed an effectively identical transform isn't recorded.
// ---------------------------------------------------------------------------

export function positionsEqual(a: MoodboardItemPosition, b: MoodboardItemPosition): boolean {
  return (
    Math.abs(a.x - b.x) < 0.001 &&
    Math.abs(a.y - b.y) < 0.001 &&
    Math.abs(a.scale - b.scale) < 0.01 &&
    Math.abs(a.rotation - b.rotation) < 0.5
  );
}

// ---------------------------------------------------------------------------
// Order restoration — the reorder surface only offers front/back moves, so
// restoring a prior layer order means finding the cheapest sequence of those
// moves. Two strategies are scored and the shorter wins:
//   A. bring-to-front: the longest prefix of `desired` already ordered in
//      `current` stays; the remaining suffix is appended in order.
//   B. send-to-back: the longest suffix of `desired` already ordered in
//      `current` stays; the remaining prefix is prepended in reverse order.
// Ids present in `desired` but missing from `current` are skipped — a
// concurrently removed item can't be reordered (LWW interleave).
// ---------------------------------------------------------------------------

export interface OrderMove {
  itemId: string;
  direction: 'front' | 'back';
}

export function computeOrderMoves(currentOrder: string[], desiredOrder: string[]): OrderMove[] {
  const pos = new Map(currentOrder.map((id, i) => [id, i] as const));
  const desired = desiredOrder.filter((id) => pos.has(id));
  const n = desired.length;
  if (n === 0) return [];

  let prefixLen = 1;
  while (prefixLen < n && pos.get(desired[prefixLen])! > pos.get(desired[prefixLen - 1])!) {
    prefixLen += 1;
  }
  const movesA: OrderMove[] = desired
    .slice(prefixLen)
    .map((itemId) => ({ itemId, direction: 'front' as const }));

  let suffixStart = n - 1;
  while (suffixStart > 0 && pos.get(desired[suffixStart - 1])! < pos.get(desired[suffixStart])!) {
    suffixStart -= 1;
  }
  const movesB: OrderMove[] = [];
  for (let i = suffixStart - 1; i >= 0; i -= 1) {
    movesB.push({ itemId: desired[i], direction: 'back' });
  }

  return movesA.length <= movesB.length ? movesA : movesB;
}

// ---------------------------------------------------------------------------
// Payload builders — the item.add payload mirrors the conflict-resolution
// re-add path (verified source keys + transform + caption), so a re-added
// item returns with the same id, position and metadata it had.
// ---------------------------------------------------------------------------

export function itemAddPayload(item: MoodboardItem): Record<string, unknown> {
  return {
    itemId: item.id,
    ...(item.listingId ? { listingId: item.listingId } : {}),
    ...(item.sourceLookId ? { lookId: item.sourceLookId } : {}),
    ...(item.mediaAssetId ? { mediaAssetId: item.mediaAssetId } : {}),
    ...(item.imageUri ? { mediaUrl: item.imageUri } : {}),
    mediaType: item.mediaType,
    title: item.title,
    caption: item.caption,
    priceGbp: item.price,
    aspectRatio: item.aspectRatio,
    positionX: item.position.x,
    positionY: item.position.y,
    rotation: item.position.rotation,
    scale: item.position.scale };
}

// ---------------------------------------------------------------------------
// Entry → ops translation. `currentOrder` is the board's live back→front id
// list at apply time, so ops targeting items that no longer exist are
// dropped and order restores are computed against the real arrangement.
// ---------------------------------------------------------------------------

export function opsForEntry(
  entry: MoodboardHistoryEntry,
  direction: 'undo' | 'redo',
  currentOrder: string[],
): MoodboardQueuedOp[] {
  const present = new Set(currentOrder);
  switch (entry.kind) {
    case 'transform': {
      if (!present.has(entry.itemId)) return [];
      const pos = direction === 'undo' ? entry.undoPosition : entry.redoPosition;
      return [{
        operation: 'item.transform',
        payload: {
          itemId: entry.itemId,
          positionX: pos.x,
          positionY: pos.y,
          rotation: pos.rotation,
          scale: pos.scale } }];
    }
    case 'addItem': {
      if (direction === 'undo') {
        return present.has(entry.item.id)
          ? [{ operation: 'item.remove', payload: { itemId: entry.item.id } }]
          : [];
      }
      return present.has(entry.item.id)
        ? []
        : [{ operation: 'item.add', payload: itemAddPayload(entry.item) }];
    }
    case 'removeItems': {
      if (direction === 'redo') {
        return entry.items
          .filter((it) => present.has(it.id))
          .map((it) => ({ operation: 'item.remove' as const, payload: { itemId: it.id } }));
      }
      // Re-add each missing item under its original id, then reorder so the
      // canvas returns to the exact pre-delete layer arrangement.
      const readds = entry.items
        .filter((it) => !present.has(it.id))
        .map((it) => ({ operation: 'item.add' as const, payload: itemAddPayload(it) }));
      const orderAfterReadd = [
        ...currentOrder,
        ...readds.map((op) => op.payload.itemId as string)];
      const orderOps = computeOrderMoves(orderAfterReadd, entry.orderBefore).map((m) => ({
        operation: 'item.reorder' as const,
        payload: { itemId: m.itemId, direction: m.direction } }));
      return [...readds, ...orderOps];
    }
    case 'order': {
      const desired = direction === 'undo' ? entry.orderBefore : entry.orderAfter;
      return computeOrderMoves(currentOrder, desired).map((m) => ({
        operation: 'item.reorder' as const,
        payload: { itemId: m.itemId, direction: m.direction } }));
    }
    case 'theme':
      return [{
        operation: 'board.theme',
        payload: { theme: direction === 'undo' ? entry.undoTheme : entry.redoTheme } }];
  }
}

// ---------------------------------------------------------------------------
// Optimistic board update — mirrors the local updates the forward mutations
// perform so undo/redo feel immediate while the ops persist.
// ---------------------------------------------------------------------------

function reorderItems(items: MoodboardItem[], order: string[]): MoodboardItem[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  const placed = new Set<string>();
  const result: MoodboardItem[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item && !placed.has(id)) {
      result.push(item);
      placed.add(id);
    }
  }
  // Items not mentioned in the order (e.g. added concurrently) keep their
  // relative order at the front.
  for (const item of items) {
    if (!placed.has(item.id)) result.push(item);
  }
  return result;
}

export function applyEntryToBoard(
  board: Moodboard,
  entry: MoodboardHistoryEntry,
  direction: 'undo' | 'redo',
): Moodboard {
  const now = new Date().toISOString();
  switch (entry.kind) {
    case 'transform': {
      const pos = direction === 'undo' ? entry.undoPosition : entry.redoPosition;
      return {
        ...board,
        updatedAt: now,
        items: board.items.map((it) =>
          it.id === entry.itemId ? { ...it, position: { ...pos } } : it) };
    }
    case 'addItem':
      if (direction === 'undo') {
        return {
          ...board,
          updatedAt: now,
          items: board.items.filter((it) => it.id !== entry.item.id) };
      }
      return board.items.some((it) => it.id === entry.item.id)
        ? board
        : { ...board, updatedAt: now, items: [...board.items, entry.item] };
    case 'removeItems': {
      if (direction === 'redo') {
        const ids = new Set(entry.items.map((it) => it.id));
        return {
          ...board,
          updatedAt: now,
          items: board.items.filter((it) => !ids.has(it.id)) };
      }
      const merged = [...board.items];
      for (const item of entry.items) {
        if (!merged.some((it) => it.id === item.id)) merged.push(item);
      }
      return { ...board, updatedAt: now, items: reorderItems(merged, entry.orderBefore) };
    }
    case 'order': {
      const desired = direction === 'undo' ? entry.orderBefore : entry.orderAfter;
      return { ...board, updatedAt: now, items: reorderItems(board.items, desired) };
    }
    case 'theme':
      return {
        ...board,
        updatedAt: now,
        theme: direction === 'undo' ? entry.undoTheme : entry.redoTheme };
  }
}
