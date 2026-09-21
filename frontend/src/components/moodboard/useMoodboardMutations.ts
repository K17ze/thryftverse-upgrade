/**
 * useMoodboardMutations — mutation handlers for the moodboard editor.
 *
 * Optimistic + op-endpoint + outbox logic, moved verbatim from
 * MoodboardEditorScreen. Position commits and theme changes flow through
 * the idempotent operation endpoint (with the offline outbox as the
 * no-network path); add/delete/reorder re-fetch the full board.
 */
import { useCallback, useState } from 'react';

import { useHaptic } from '../../hooks/useHaptic';
import { useToast } from '../../context/ToastContext';
import { isDbAvailable } from '../../storage/db';
import { clearMoodboardOutboxForBoard } from '../../storage/moodboardOutbox';
import { createStableId } from '../../utils/createStableId';
import {
  fetchMoodboardDetail,
  addItemToMoodboard,
  removeItemFromMoodboard,
  reorderItem,
  publishMoodboardAsPoster,
  type Moodboard,
  type MoodboardItem,
  type MoodboardItemPosition,
  type MoodboardOperationType } from '../../services/moodboardApi';
import type { SubmitBoardOpsOutcome, useMoodboardBoard } from './useMoodboardBoard';
import type { useMoodboardSelection } from './useMoodboardSelection';

interface UseMoodboardMutationsArgs {
  board: ReturnType<typeof useMoodboardBoard>;
  selection: ReturnType<typeof useMoodboardSelection>;
}

export function useMoodboardMutations({ board, selection }: UseMoodboardMutationsArgs) {
  const haptic = useHaptic();
  const { show } = useToast();

  const {
    moodboard,
    setMoodboard,
    setSaving,
    setSyncStatus,
    setConflictDetail,
    setActiveThemeId,
    boardRevisionRef,
    submitBoardOps,
    loadAll } = board;
  const {
    selectedItemIds,
    setSelectedItemIds,
    setSelectedItemId,
    setMultiSelectMode } = selection;

  // ── Publication state ──
  const [publishing, setPublishing] = useState(false);

  const handlePositionCommit = useCallback(
    async (id: string, position: MoodboardItemPosition): Promise<SubmitBoardOpsOutcome> => {
      if (!moodboard) return 'failed';
      // Optimistic local update — the user sees the item move immediately.
      setMoodboard((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((it) =>
                it.id === id ? { ...it, position } : it,
              ),
              updatedAt: new Date().toISOString() }
          : prev,
      );
      // Submit through the canonical op path — the durable outbox + drain
      // when a local DB exists (offline-safe), sequential online submit
      // otherwise. The discriminated outcome lets the history layer record
      // the inverse ONLY on applied/queued: a transform that never
      // persisted no longer lands on the undo stack claiming an applied
      // edit (P2). A non-applied outcome already surfaced honestly through
      // the sync status machine inside submitBoardOps.
      return submitBoardOps([{
        operationId: createStableId('pos'),
        operation: 'item.transform',
        payload: {
          itemId: id,
          positionX: position.x,
          positionY: position.y,
          rotation: position.rotation,
          scale: position.scale } }]);
    },
    [moodboard, setMoodboard, submitBoardOps],
  );

  const handleAddItem = useCallback(
    async (source: MoodboardItem): Promise<MoodboardItem | null> => {
      if (!moodboard) return null;
      haptic.light();
      setSaving(true);
      try {
        const added = await addItemToMoodboard(moodboard.id, { source: 'listing', listingId: source.listingId });
        if (added) {
          // Re-fetch to get the full updated item list with the new item
          const mb = await fetchMoodboardDetail(moodboard.id);
          if (mb) {
            setMoodboard(mb);
            setSelectedItemId(added.id);
          }
        }
        // Returned so the history layer can record the inverse (remove).
        return added;
      } catch {
        haptic.error();
        return null;
      } finally {
        setSaving(false);
      }
    },
    [haptic, moodboard, setSaving, setMoodboard, setSelectedItemId],
  );

  const handleDeleteItem = useCallback(
    async (id: string): Promise<boolean> => {
      if (!moodboard) return false;
      haptic.warning();
      setSaving(true);
      setSelectedItemId(null);
      try {
        const ok = await removeItemFromMoodboard(moodboard.id, id);
        if (ok) {
          const mb = await fetchMoodboardDetail(moodboard.id);
          if (mb) setMoodboard(mb);
        }
        return ok;
      } catch {
        haptic.error();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [haptic, moodboard, setSaving, setMoodboard, setSelectedItemId],
  );

  const handleReorder = useCallback(
    async (id: string, direction: 'front' | 'back'): Promise<boolean> => {
      if (!moodboard) return false;
      haptic.selection();
      setSaving(true);
      try {
        const ok = await reorderItem(moodboard.id, id, direction);
        if (ok) {
          const mb = await fetchMoodboardDetail(moodboard.id);
          if (mb) setMoodboard(mb);
        }
        return ok;
      } catch {
        haptic.error();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [haptic, moodboard, setSaving, setMoodboard],
  );

  // Re-fetch the canonical board after a partially-applied multi-item
  // mutation — the deletes/reorders that already resolved persisted
  // server-side, so the server board is the truth the canvas must return
  // to. A failed re-fetch leaves local state untouched; the sync affordance
  // still communicates trouble and the next load reconciles.
  const reconcileLocalBoard = useCallback(async () => {
    if (!moodboard) return;
    try {
      const mb = await fetchMoodboardDetail(moodboard.id);
      if (mb) setMoodboard(mb);
    } catch {
      // Keep local state — the next load or mutation reconciles.
    }
  }, [moodboard, setMoodboard]);

  const handleDeleteSelected = useCallback(
    async (): Promise<boolean> => {
      if (!moodboard || selectedItemIds.size === 0) return false;
      haptic.warning();
      const ids = Array.from(selectedItemIds);
      setMultiSelectMode(false);
      setSelectedItemIds(new Set());
      setSaving(true);
      try {
        await Promise.all(ids.map((id) => removeItemFromMoodboard(moodboard.id, id)));
        const mb = await fetchMoodboardDetail(moodboard.id);
        if (mb) setMoodboard(mb);
        return true;
      } catch {
        haptic.error();
        // Partial failure is possible — the deletes that already resolved
        // persisted server-side while the local board was never updated.
        // Reconcile against the canonical board so the canvas doesn't keep
        // rendering items the server no longer has (P2).
        await reconcileLocalBoard();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [haptic, moodboard, selectedItemIds, setMultiSelectMode, setSelectedItemIds, setSaving, setMoodboard, reconcileLocalBoard],
  );

  const handleBringAllToFront = useCallback(
    async (): Promise<boolean> => {
      if (!moodboard || selectedItemIds.size === 0) return false;
      haptic.selection();
      // Preserve relative layer order: bring to front in back→front (array) order.
      const ids = moodboard.items
        .map((it) => it.id)
        .filter((id) => selectedItemIds.has(id));
      setSaving(true);
      try {
        for (const id of ids) {
          await reorderItem(moodboard.id, id, 'front');
        }
        const mb = await fetchMoodboardDetail(moodboard.id);
        if (mb) setMoodboard(mb);
        return true;
      } catch {
        haptic.error();
        // A prefix of the reorders may have persisted — the local layer
        // order no longer matches the server. Reconcile so the canvas
        // shows the real arrangement (P2).
        await reconcileLocalBoard();
        return false;
      } finally {
        setSaving(false);
      }
    },
    [haptic, moodboard, selectedItemIds, setSaving, setMoodboard, reconcileLocalBoard],
  );

  const handleThemeChange = useCallback(
    async (themeId: string): Promise<SubmitBoardOpsOutcome> => {
      if (!moodboard) return 'failed';
      haptic.selection();
      setActiveThemeId(themeId);
      // Optimistic local update — the user sees the theme change immediately.
      setMoodboard((prev) =>
        prev ? { ...prev, theme: themeId, updatedAt: new Date().toISOString() } : prev,
      );
      // Same canonical op path as position commits — the outcome is awaited
      // so the history layer only records an undoable inverse when the
      // theme change actually persisted or is durably queued (P2).
      return submitBoardOps([{
        operationId: createStableId('theme'),
        operation: 'board.theme',
        payload: { theme: themeId } }]);
    },
    [haptic, moodboard, setActiveThemeId, setMoodboard, submitBoardOps],
  );

  // ── "Keep my version" — re-apply the preserved local snapshot via ops ──
  // Honest resolution: the snapshot is diffed against the current (server)
  // board and the difference is pushed through the same operation endpoint —
  // via the durable outbox when available so it also survives offline. The
  // canonical board is then re-fetched and the outcome is reported through
  // the sync status machine. Nothing here fabricates persistence.
  const handleKeepLocalVersion = useCallback(
    async (snapshot: Moodboard | null) => {
      if (!moodboard || !snapshot) {
        setSyncStatus('idle');
        setConflictDetail(null);
        return;
      }
      // The re-application supersedes anything still queued for this board.
      if (isDbAvailable()) {
        try {
          await clearMoodboardOutboxForBoard(moodboard.id);
        } catch {
          // Proceed — stale rows would re-conflict, but the ops below are
          // the user's explicit resolution and should still be attempted.
        }
      }

      const serverItems = new Map(moodboard.items.map((it) => [it.id, it]));
      const snapshotIds = new Set(snapshot.items.map((it) => it.id));
      const baseRev = boardRevisionRef.current;
      const ops: {
        operationId: string;
        operation: MoodboardOperationType;
        payload: Record<string, unknown> }[] = [];

      // Items the server has that the local version does not → remove.
      for (const it of moodboard.items) {
        if (!snapshotIds.has(it.id)) {
          ops.push({
            operationId: createStableId('keep-remove'),
            operation: 'item.remove',
            payload: { itemId: it.id } });
        }
      }
      // Local items missing on the server → re-add at the same id; items
      // present on both but moved → transform to the local position.
      for (const it of snapshot.items) {
        const serverItem = serverItems.get(it.id);
        if (!serverItem) {
          ops.push({
            operationId: createStableId('keep-add'),
            operation: 'item.add',
            payload: {
              itemId: it.id,
              ...(it.listingId ? { listingId: it.listingId } : {}),
              ...(it.sourceLookId ? { lookId: it.sourceLookId } : {}),
              ...(it.mediaAssetId ? { mediaAssetId: it.mediaAssetId } : {}),
              ...(it.imageUri ? { mediaUrl: it.imageUri } : {}),
              mediaType: it.mediaType,
              title: it.title,
              caption: it.caption,
              priceGbp: it.price,
              aspectRatio: it.aspectRatio,
              positionX: it.position.x,
              positionY: it.position.y,
              rotation: it.position.rotation,
              scale: it.position.scale } });
        } else if (
          serverItem.position.x !== it.position.x ||
          serverItem.position.y !== it.position.y ||
          serverItem.position.rotation !== it.position.rotation ||
          serverItem.position.scale !== it.position.scale
        ) {
          ops.push({
            operationId: createStableId('keep-transform'),
            operation: 'item.transform',
            payload: {
              itemId: it.id,
              positionX: it.position.x,
              positionY: it.position.y,
              rotation: it.position.rotation,
              scale: it.position.scale } });
        }
      }
      if (snapshot.theme !== moodboard.theme) {
        ops.push({
          operationId: createStableId('keep-theme'),
          operation: 'board.theme',
          payload: { theme: snapshot.theme } });
      }

      // Optimistic: show the local version while the ops persist.
      setMoodboard(snapshot);
      setActiveThemeId(snapshot.theme);
      setConflictDetail(null);

      // Push through the shared op-submission path — outbox + drain when a
      // local DB exists (offline-safe), sequential online submit otherwise.
      // `baseRev` is passed explicitly because the optimistic setMoodboard
      // above can regress boardRevisionRef.
      await submitBoardOps(ops, baseRev);
    },
    [moodboard, haptic, submitBoardOps, setMoodboard, setActiveThemeId, setSyncStatus, setConflictDetail, boardRevisionRef],
  );

  // ── "Keep server version" — discard queued local intent, re-fetch ──
  const handleKeepServerVersion = useCallback(
    async () => {
      setSyncStatus('idle');
      setConflictDetail(null);
      // Drop not-yet-applied ops for this board — the user chose the server
      // version, so queued local edits must not re-apply on the next drain.
      if (moodboard && isDbAvailable()) {
        try {
          await clearMoodboardOutboxForBoard(moodboard.id);
        } catch {
          // Still re-fetch — the board below is already the server version.
        }
      }
      await loadAll();
    },
    [moodboard, loadAll, setSyncStatus, setConflictDetail],
  );

  // ── Publish the moodboard as a poster to the user's feed ──
  const handlePublishAsPoster = useCallback(async () => {
    if (!moodboard) return;
    haptic.medium();
    setPublishing(true);
    try {
      await publishMoodboardAsPoster(moodboard.id);
      haptic.success();
      show('Published as poster', 'success');
    } catch {
      haptic.error();
      show('Could not publish', 'error');
    } finally {
      setPublishing(false);
    }
  }, [moodboard, haptic, show]);

  return {
    publishing,
    handlePositionCommit,
    handleAddItem,
    handleDeleteItem,
    handleReorder,
    handleDeleteSelected,
    handleBringAllToFront,
    handleThemeChange,
    handleKeepLocalVersion,
    handleKeepServerVersion,
    handlePublishAsPoster };
}
