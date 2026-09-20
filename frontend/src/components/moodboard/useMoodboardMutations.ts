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
import { useConnectivity } from '../../hooks/useConnectivity';
import { useToast } from '../../context/ToastContext';
import { isDbAvailable } from '../../storage/db';
import {
  enqueueMoodboardOperation,
  clearMoodboardOutboxForBoard } from '../../storage/moodboardOutbox';
import { createStableId } from '../../utils/createStableId';
import {
  fetchMoodboardDetail,
  addItemToMoodboard,
  removeItemFromMoodboard,
  reorderItem,
  submitMoodboardOperation,
  publishMoodboardAsPoster,
  type Moodboard,
  type MoodboardItem,
  type MoodboardItemPosition,
  type MoodboardOperationType } from '../../services/moodboardApi';
import type { useMoodboardBoard } from './useMoodboardBoard';
import type { useMoodboardSelection } from './useMoodboardSelection';

interface UseMoodboardMutationsArgs {
  board: ReturnType<typeof useMoodboardBoard>;
  selection: ReturnType<typeof useMoodboardSelection>;
}

export function useMoodboardMutations({ board, selection }: UseMoodboardMutationsArgs) {
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();
  const { show } = useToast();

  const {
    moodboard,
    setMoodboard,
    setSaving,
    setSyncStatus,
    setConflictDetail,
    setActiveThemeId,
    boardRevisionRef,
    handleOperationResponse,
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
    async (id: string, position: MoodboardItemPosition) => {
      if (!moodboard) return;
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
      setSyncStatus('syncing');
      setConflictDetail(null);
      // When offline and the local DB is available, enqueue to the outbox
      // instead of making a network call that will fail.
      if (isOffline && isDbAvailable()) {
        try {
          await enqueueMoodboardOperation({
            operationId: `${id}_transform_${Date.now()}`,
            boardId: moodboard.id,
            operation: 'item.transform',
            payload: {
              itemId: id,
              positionX: position.x,
              positionY: position.y,
              rotation: position.rotation,
              scale: position.scale },
            baseRev: moodboard.revision });
          // Status remains 'syncing' — the outbox will flush on reconnect.
          return;
        } catch {
          // Fall through to online path if enqueue fails
        }
      }
      // Submit via the idempotent operation endpoint with the current base
      // revision. The client operation id dedups retries.
      try {
        const response = await submitMoodboardOperation(moodboard.id, {
          clientOperationId: createStableId('pos'),
          baseRevision: boardRevisionRef.current,
          type: 'item.transform',
          itemId: id,
          payload: {
            positionX: position.x,
            positionY: position.y,
            rotation: position.rotation,
            scale: position.scale } });
        handleOperationResponse(response);
      } catch {
        // Network error or server error. The outcome is unknown if the
        // request may have reached the server — do not fabricate success.
        // The optimistic update stays visible; the status communicates the
        // problem. The user can retry by moving the item again.
        setSyncStatus('error');
        haptic.error();
      }
    },
    [moodboard, isOffline, handleOperationResponse, haptic, setMoodboard, setSyncStatus, setConflictDetail, boardRevisionRef],
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
        return false;
      } finally {
        setSaving(false);
      }
    },
    [haptic, moodboard, selectedItemIds, setMultiSelectMode, setSelectedItemIds, setSaving, setMoodboard],
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
        return false;
      } finally {
        setSaving(false);
      }
    },
    [haptic, moodboard, selectedItemIds, setSaving, setMoodboard],
  );

  const handleThemeChange = useCallback(
    async (themeId: string) => {
      if (!moodboard) return;
      haptic.selection();
      setActiveThemeId(themeId);
      // Optimistic local update — the user sees the theme change immediately.
      setMoodboard((prev) =>
        prev ? { ...prev, theme: themeId, updatedAt: new Date().toISOString() } : prev,
      );
      setSyncStatus('syncing');
      setConflictDetail(null);
      // When offline and the local DB is available, enqueue to the outbox
      // instead of making a network call that will fail.
      if (isOffline && isDbAvailable()) {
        try {
          await enqueueMoodboardOperation({
            operationId: `${moodboard.id}_theme_${Date.now()}`,
            boardId: moodboard.id,
            operation: 'board.theme',
            payload: { theme: themeId },
            baseRev: moodboard.revision });
          return;
        } catch {
          // Fall through to online path
        }
      }
      // Submit via the idempotent operation endpoint.
      void submitMoodboardOperation(moodboard.id, {
        clientOperationId: createStableId('theme'),
        baseRevision: boardRevisionRef.current,
        type: 'board.theme',
        payload: { theme: themeId } })
        .then(handleOperationResponse)
        .catch(() => {
          setSyncStatus('error');
          haptic.error();
        });
    },
    [haptic, moodboard, isOffline, handleOperationResponse, setActiveThemeId, setMoodboard, setSyncStatus, setConflictDetail, boardRevisionRef],
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
