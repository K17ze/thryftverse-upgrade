/**
 * useMoodboardHistory — client-side undo/redo for the moodboard editor.
 *
 * Wraps the mutation handlers from `useMoodboardMutations` and records an
 * inverse for every edit: add → remove, delete → re-add (same item id via
 * `item.add`), move/resize → restore prior transform, reorder → restore the
 * prior layer order, theme → restore prior theme.
 *
 * Undo/redo re-apply the inverse through the SAME server path as the
 * forward edits — the LWW operation endpoint via `board.submitBoardOps`
 * (durable outbox + drain, or sequential online submit). An undo is
 * therefore recorded in the server op log as a new op, keeping sync
 * truthful; it is never a local-only rewind.
 *
 * Multi-device scope: the stacks only track THIS client's edits. Concurrent
 * collaborator ops are not undoable — they interleave under normal LWW
 * semantics, so an undo that targets an item a collaborator moved lands as
 * the latest write, and ops targeting items that no longer exist are
 * dropped by `opsForEntry`.
 *
 * Stacks are per-board: they reset when the board id changes (and die with
 * the hook on unmount). Depth is capped at MOODBOARD_HISTORY_LIMIT.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  Moodboard,
  MoodboardItem,
  MoodboardItemPosition } from '../../services/moodboardApi';
import {
  EMPTY_HISTORY,
  applyEntryToBoard,
  moveEntry,
  opsForEntry,
  positionsEqual,
  recordEntry,
  type MoodboardHistoryEntry,
  type MoodboardHistoryState } from './moodboardHistory';
import type { useMoodboardBoard } from './useMoodboardBoard';
import type { useMoodboardMutations } from './useMoodboardMutations';
import type { useMoodboardSelection } from './useMoodboardSelection';

interface UseMoodboardHistoryArgs {
  board: ReturnType<typeof useMoodboardBoard>;
  selection: ReturnType<typeof useMoodboardSelection>;
  mutations: ReturnType<typeof useMoodboardMutations>;
}

export function useMoodboardHistory({ board, selection, mutations }: UseMoodboardHistoryArgs) {
  const { moodboard, setMoodboard, setActiveThemeId, submitBoardOps } = board;

  const [stacks, setStacks] = useState<MoodboardHistoryState>(EMPTY_HISTORY);
  // Serializes undo/redo so a second press while an inverse is still
  // applying is ignored rather than interleaved.
  const applyingRef = useRef(false);
  // Refs mirror the latest props/state so the wrappers never read stale
  // board, selection or mutation closures.
  const moodboardRef = useRef(moodboard);
  const mutationsRef = useRef(mutations);
  const selectionRef = useRef(selection);
  const stacksRef = useRef(stacks);
  moodboardRef.current = moodboard;
  mutationsRef.current = mutations;
  selectionRef.current = selection;
  stacksRef.current = stacks;

  // Per-board stacks — switching boards clears history.
  const boardId = moodboard?.id ?? null;
  useEffect(() => {
    setStacks(EMPTY_HISTORY);
  }, [boardId]);

  const record = useCallback((entry: MoodboardHistoryEntry) => {
    setStacks((prev) => recordEntry(prev, entry));
  }, []);

  const clear = useCallback(() => {
    setStacks(EMPTY_HISTORY);
  }, []);

  /** Record an add performed outside the listing picker (look pins, media
   *  imports) once the server has returned the placed item. */
  const recordAddedItem = useCallback(
    (item: MoodboardItem) => {
      record({ kind: 'addItem', item });
    },
    [record],
  );

  // Drop removed items from the live selection so undoing a delete can't
  // leave a phantom selection pointing at a gone item.
  const pruneSelection = useCallback((remainingIds: Set<string>) => {
    const sel = selectionRef.current;
    if (sel.selectedItemId && !remainingIds.has(sel.selectedItemId)) {
      sel.setSelectedItemId(null);
    }
    sel.setSelectedItemIds((prev) => {
      const next = new Set([...prev].filter((id) => remainingIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, []);

  // Apply one side of an entry: optimistic board update first (mirroring the
  // forward mutations), then the inverse ops through the canonical path.
  const applyEntry = useCallback(
    async (entry: MoodboardHistoryEntry, direction: 'undo' | 'redo') => {
      const mb = moodboardRef.current;
      if (!mb) return;
      const currentOrder = mb.items.map((it) => it.id);
      const ops = opsForEntry(entry, direction, currentOrder);

      const next = applyEntryToBoard(mb, entry, direction);
      setMoodboard(next);
      if (entry.kind === 'theme') {
        setActiveThemeId(direction === 'undo' ? entry.undoTheme : entry.redoTheme);
      }
      pruneSelection(new Set(next.items.map((it) => it.id)));

      await submitBoardOps(ops);
    },
    [setMoodboard, setActiveThemeId, submitBoardOps, pruneSelection],
  );

  const undo = useCallback(async () => {
    const entry = stacksRef.current.undo[stacksRef.current.undo.length - 1];
    if (!entry || applyingRef.current) return;
    applyingRef.current = true;
    try {
      await applyEntry(entry, 'undo');
    } finally {
      applyingRef.current = false;
    }
    setStacks((prev) => moveEntry(prev, entry, 'undo'));
  }, [applyEntry]);

  const redo = useCallback(async () => {
    const entry = stacksRef.current.redo[stacksRef.current.redo.length - 1];
    if (!entry || applyingRef.current) return;
    applyingRef.current = true;
    try {
      await applyEntry(entry, 'redo');
    } finally {
      applyingRef.current = false;
    }
    setStacks((prev) => moveEntry(prev, entry, 'redo'));
  }, [applyEntry]);

  // ── Recording wrappers — capture the inverse from pre-mutation state,
  //    then delegate to the real mutation handlers unchanged. ──

  const handlePositionCommit = useCallback(
    (id: string, position: MoodboardItemPosition) => {
      const item = moodboardRef.current?.items.find((it) => it.id === id);
      if (item && !positionsEqual(item.position, position)) {
        record({
          kind: 'transform',
          itemId: id,
          undoPosition: { ...item.position },
          redoPosition: { ...position } });
      }
      return mutationsRef.current.handlePositionCommit(id, position);
    },
    [record],
  );

  const handleAddItem = useCallback(
    async (source: MoodboardItem) => {
      const added = await mutationsRef.current.handleAddItem(source);
      if (added) record({ kind: 'addItem', item: added });
      return added;
    },
    [record],
  );

  const handleDeleteItem = useCallback(
    async (id: string) => {
      const mb = moodboardRef.current;
      const snapshot = mb?.items.find((it) => it.id === id);
      const orderBefore = mb?.items.map((it) => it.id) ?? [];
      const ok = await mutationsRef.current.handleDeleteItem(id);
      if (ok && snapshot) {
        record({ kind: 'removeItems', items: [snapshot], orderBefore });
      }
      return ok;
    },
    [record],
  );

  const handleDeleteSelected = useCallback(async () => {
    const mb = moodboardRef.current;
    const ids = selectionRef.current.selectedItemIds;
    const removed = mb?.items.filter((it) => ids.has(it.id)) ?? [];
    const orderBefore = mb?.items.map((it) => it.id) ?? [];
    const ok = await mutationsRef.current.handleDeleteSelected();
    if (ok && removed.length > 0) {
      record({ kind: 'removeItems', items: removed, orderBefore });
    }
    return ok;
  }, [record]);

  const handleReorder = useCallback(
    async (id: string, direction: 'front' | 'back') => {
      const orderBefore = moodboardRef.current?.items.map((it) => it.id) ?? [];
      const others = orderBefore.filter((x) => x !== id);
      const orderAfter =
        direction === 'front' ? [...others, id] : [id, ...others];
      const changed = orderAfter.length === orderBefore.length &&
        orderAfter.some((x, i) => x !== orderBefore[i]);
      const ok = await mutationsRef.current.handleReorder(id, direction);
      if (ok && changed) {
        record({ kind: 'order', orderBefore, orderAfter });
      }
      return ok;
    },
    [record],
  );

  const handleBringAllToFront = useCallback(async () => {
    const mb = moodboardRef.current;
    const ids = selectionRef.current.selectedItemIds;
    const orderBefore = mb?.items.map((it) => it.id) ?? [];
    const moved = orderBefore.filter((id) => ids.has(id));
    const orderAfter = orderBefore.filter((id) => !ids.has(id)).concat(moved);
    const changed = orderAfter.some((x, i) => x !== orderBefore[i]);
    const ok = await mutationsRef.current.handleBringAllToFront();
    if (ok && changed) {
      record({ kind: 'order', orderBefore, orderAfter });
    }
    return ok;
  }, [record]);

  const handleThemeChange = useCallback(
    (themeId: string) => {
      const prior = moodboardRef.current?.theme;
      if (prior && prior !== themeId) {
        record({ kind: 'theme', undoTheme: prior, redoTheme: themeId });
      }
      return mutationsRef.current.handleThemeChange(themeId);
    },
    [record],
  );

  // Wholesale board replacement invalidates item-level inverses — resolving
  // a conflict clears both stacks.
  const handleKeepLocalVersion = useCallback(
    (snapshot: Moodboard | null) => {
      clear();
      return mutationsRef.current.handleKeepLocalVersion(snapshot);
    },
    [clear],
  );

  const handleKeepServerVersion = useCallback(() => {
    clear();
    return mutationsRef.current.handleKeepServerVersion();
  }, [clear]);

  return {
    canUndo: stacks.undo.length > 0,
    canRedo: stacks.redo.length > 0,
    undo,
    redo,
    clear,
    recordAddedItem,
    handlePositionCommit,
    handleAddItem,
    handleDeleteItem,
    handleReorder,
    handleDeleteSelected,
    handleBringAllToFront,
    handleThemeChange,
    handleKeepLocalVersion,
    handleKeepServerVersion };
}
