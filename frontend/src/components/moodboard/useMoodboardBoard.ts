/**
 * useMoodboardBoard — board-state orchestration for the moodboard editor.
 *
 * Owns the canonical board state (moodboard / themes / picker items), the
 * per-operation sync status machine, the board revision ref used by the
 * idempotent operation endpoint, the realtime collaboration subscription,
 * and the presence indicator.
 *
 * Truthful UI (AGENTS.md §11): every operation flows through the real
 * moodboards API — an unknown outcome is never presented as success.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useHaptic } from '../../hooks/useHaptic';
import { useConnectivity } from '../../hooks/useConnectivity';
import { useRealtimeEvent } from '../../platform/realtime/useRealtimeEvent';
import { useStore } from '../../store/useStore';
import { track } from '../../analytics';
import { isDbAvailable } from '../../storage/db';
import {
  drainMoodboardOutbox,
  enqueueMoodboardOperation,
  getMoodboardOutboxPendingCount } from '../../storage/moodboardOutbox';
import { createStableId } from '../../utils/createStableId';
import {
  fetchMoodboardDetail,
  fetchMoodboardThemes,
  fetchPickerItems,
  createMoodboard,
  getThemeById,
  submitMoodboardOperation,
  type Moodboard,
  type MoodboardItem,
  type MoodboardTheme,
  type MoodboardOperationResponse } from '../../services/moodboardApi';
import type { MoodboardQueuedOp } from './moodboardHistory';

export const DEFAULT_THEME_ID = 'theme-linen';

// ---------------------------------------------------------------------------
// Sync status state machine
// ---------------------------------------------------------------------------
// Replaces the global `saving` boolean with an honest per-operation status.
// Position commits and theme changes flow through the operation endpoint and
// report their outcome via this state. The status appears only on transition
// (Saving → Synced → recedes; or Saving → Conflict → needs review).
export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'conflict'
  | 'error'
  | 'unknown';

export interface ConflictDetail {
  currentRevision: number;
  message: string;
}

export function useMoodboardBoard({ moodboardId }: { moodboardId?: string }) {
  const haptic = useHaptic();
  const { isOffline } = useConnectivity();

  // ── State ──
  const [moodboard, setMoodboard] = useState<Moodboard | null>(null);
  const [themes, setThemes] = useState<MoodboardTheme[]>([]);
  const [pickerItems, setPickerItems] = useState<MoodboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [conflictDetail, setConflictDetail] = useState<ConflictDetail | null>(null);
  // The local board version captured just before a server reconcile replaced
  // it — shown as "your version" in the conflict compare sheet.
  const [conflictLocalSnapshot, setConflictLocalSnapshot] = useState<Moodboard | null>(null);
  const [activeThemeId, setActiveThemeId] = useState<string>(DEFAULT_THEME_ID);

  // ── Presence indicator ──
  const [collaboratorsOnline, setCollaboratorsOnline] = useState(false);

  // ── Current user (for filtering out our own realtime events) ──
  const currentUserId = useStore((state) => state.currentUser?.id ?? '');

  // Whether the current user may perform owner-level actions — the DTO now
  // carries creatorId and the viewer's membership role from the backend.
  const isOwner = useMemo(() => {
    if (!moodboard) return false;
    return (
      moodboard.creatorId === currentUserId ||
      moodboard.viewerRole === 'owner'
    );
  }, [moodboard, currentUserId]);

  const activeTheme = useMemo(
    () => themes.find((t) => t.id === activeThemeId) ?? getThemeById(activeThemeId),
    [themes, activeThemeId],
  );

  // Track the current board revision for operation submissions. Updated
  // whenever moodboard state changes, so operation handlers always read the
  // latest revision without stale closure issues.
  const boardRevisionRef = useRef(0);
  useEffect(() => {
    if (moodboard) {
      boardRevisionRef.current = moodboard.revision;
    }
  }, [moodboard]);

  // ── Data loading ──
  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [themeList, picker] = await Promise.all([
        fetchMoodboardThemes(),
        fetchPickerItems(),
      ]);
      setThemes(themeList);
      setPickerItems(picker);

      if (moodboardId) {
        const mb = await fetchMoodboardDetail(moodboardId);
        if (!mb) {
          setError('This moodboard could not be found.');
          return;
        }
        setMoodboard(mb);
        setActiveThemeId(mb.theme);
      } else {
        // New moodboard — create immediately so the editor has a real entity.
        const mb = await createMoodboard('Untitled moodboard', DEFAULT_THEME_ID);
        setMoodboard(mb);
        setActiveThemeId(mb.theme);
        track('moodboard_created', { moodboard_id: mb.id });
      }
    } catch {
      setError('We couldn\u2019t load the moodboard editor. Try again.');
    } finally {
      setLoading(false);
    }
  }, [moodboardId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ── Realtime subscription — live collaboration updates ──
  const realtimeOperation = useRealtimeEvent<{
    boardId: string;
    revision: number;
    operationType: string;
    operationId: string;
    actorId: string;
  }>(moodboard ? `moodboard:${moodboard.id}` : '', 'moodboard.operation.applied');

  // Re-fetch the board when a remote operation is applied.
  useEffect(() => {
    if (!realtimeOperation || !moodboard) return;
    // Don't re-fetch for our own operations — we already applied them locally.
    if (realtimeOperation.payload.actorId === currentUserId) return;
    void loadAll();
  }, [realtimeOperation, moodboard, currentUserId, loadAll]);

  // Presence indicator — show a live dot briefly when a remote collaborator is active.
  useEffect(() => {
    if (!realtimeOperation) return;
    if (realtimeOperation.payload.actorId === currentUserId) return;
    setCollaboratorsOnline(true);
    const timer = setTimeout(() => setCollaboratorsOnline(false), 5000);
    return () => clearTimeout(timer);
  }, [realtimeOperation, currentUserId]);

  // ── Reconciliation: re-fetch the board after a conflict or unknown outcome ──
  // The server is the source of truth. When a conflict or unknown outcome
  // occurs, we re-fetch the canonical board state and update local state to
  // match. The user's unsynced work is preserved in the optimistic update
  // until the re-fetch replaces it with the server's version.
  const reconcileBoard = useCallback(async () => {
    if (!moodboard) return;
    // Preserve the pre-reconcile local version so the compare sheet can show
    // "your version" truthfully after the server state replaces it.
    setConflictLocalSnapshot(moodboard);
    try {
      const mb = await fetchMoodboardDetail(moodboard.id);
      if (mb) {
        setMoodboard(mb);
        setActiveThemeId(mb.theme);
        boardRevisionRef.current = mb.revision;
      }
    } catch {
      // Re-fetch failed — leave the user's local state intact. The next
      // successful load or operation will reconcile.
    }
  }, [moodboard]);

  // ── Outbox drain — flush queued offline operations ──
  // Operations enqueued while offline sit in `mutation_outbox` until this
  // runs. After each drain the canonical board is re-fetched so the server
  // remains the source of truth; conflicts, permission failures and leftover
  // pending rows are surfaced honestly through the sync status machine —
  // 'synced' is only reported when the queue is fully drained.
  const drainingRef = useRef(false);
  const flushOutbox = useCallback(async () => {
    if (isOffline || drainingRef.current || !isDbAvailable()) return;
    drainingRef.current = true;
    try {
      for (;;) {
        const pending = await getMoodboardOutboxPendingCount();
        if (pending === 0) break;
        setSyncStatus('syncing');
        const result = await drainMoodboardOutbox();
        // Re-fetch the canonical board so server state reconciles.
        await reconcileBoard();
        if (result.conflicts > 0) {
          setSyncStatus('conflict');
          setConflictDetail({
            currentRevision: boardRevisionRef.current,
            message: 'Another edit changed this board. Your canvas has been updated to the latest version.' });
          haptic.warning();
          return;
        }
        if (result.forbidden > 0) {
          setSyncStatus('error');
          setConflictDetail({
            currentRevision: boardRevisionRef.current,
            message: 'You no longer have permission to edit this board. Your unsaved work is preserved locally.' });
          haptic.error();
          return;
        }
        if (result.errors > 0) {
          setSyncStatus('error');
          haptic.error();
          return;
        }
        // A drain that applied nothing and failed nothing made no progress —
        // stop looping and let the pending check below report honestly.
        if (result.pushed === 0) break;
      }
      const remaining = await getMoodboardOutboxPendingCount();
      if (remaining > 0) {
        // Ops are still queued — do not claim success.
        setSyncStatus('error');
        haptic.error();
      } else {
        setSyncStatus('synced');
        setTimeout(() => setSyncStatus('idle'), 1500);
      }
    } finally {
      drainingRef.current = false;
    }
  }, [isOffline, reconcileBoard, haptic]);

  // Drain once a board load settles — pending rows from a previous session
  // flush without user action.
  useEffect(() => {
    if (!loading) {
      void flushOutbox();
    }
  }, [loading, flushOutbox]);

  // Drain again when connectivity is restored after being offline.
  const wasOfflineRef = useRef(isOffline);
  useEffect(() => {
    if (wasOfflineRef.current && !isOffline) {
      void flushOutbox();
    }
    wasOfflineRef.current = isOffline;
  }, [isOffline, flushOutbox]);

  // ── Handle an operation response from the server ──
  // Centralised handling for all operation outcomes. Updates the board
  // revision on success, surfaces conflicts, and never fabricates success
  // on unknown outcomes.
  const handleOperationResponse = useCallback(
    (response: MoodboardOperationResponse) => {
      if (response.outcome === 'applied' || response.outcome === 'duplicate') {
        boardRevisionRef.current = response.revision;
        setSyncStatus('synced');
        // Recede the "synced" indicator after a brief moment.
        setTimeout(() => setSyncStatus('idle'), 1500);
      } else if (response.outcome === 'conflict') {
        setSyncStatus('conflict');
        setConflictDetail({
          currentRevision: response.currentRevision,
          message: 'Another edit changed this board. Your canvas has been updated to the latest version.' });
        haptic.warning();
        // Re-fetch the canonical board state.
        void reconcileBoard();
      } else if (response.outcome === 'forbidden') {
        setSyncStatus('error');
        setConflictDetail({
          currentRevision: boardRevisionRef.current,
          message: 'You no longer have permission to edit this board. Your unsaved work is preserved locally.' });
        haptic.error();
      }
    },
    [haptic, reconcileBoard],
  );

  // ── Submit a batch of operations through the canonical write path ──
  // Single submission route for multi-op changes (conflict resolution,
  // undo/redo): when the durable outbox is available the ops are enqueued
  // with the current base revision (the drain rebases the tail after each
  // applied op) and flushed immediately — no-oping while offline so queued
  // rows flush on reconnect. Without a local DB the ops are submitted
  // online in order, advancing the base revision from each applied
  // response and stopping on conflict/forbidden.
  const submitBoardOps = useCallback(
    async (ops: MoodboardQueuedOp[], baseRev?: number) => {
      if (!moodboard) return;
      if (ops.length === 0) {
        setSyncStatus('idle');
        return;
      }
      setSyncStatus('syncing');
      setConflictDetail(null);
      const base = baseRev ?? boardRevisionRef.current;

      if (isDbAvailable()) {
        for (const op of ops) {
          await enqueueMoodboardOperation({
            operationId: op.operationId ?? createStableId('op'),
            boardId: moodboard.id,
            operation: op.operation,
            payload: op.payload,
            baseRev: base });
        }
        await flushOutbox();
        return;
      }

      let nextBaseRev = base;
      for (const op of ops) {
        try {
          const response = await submitMoodboardOperation(moodboard.id, {
            clientOperationId: op.operationId ?? createStableId('op'),
            baseRevision: nextBaseRev,
            type: op.operation,
            itemId: typeof op.payload.itemId === 'string' ? op.payload.itemId : undefined,
            payload: op.payload });
          if (response.outcome === 'applied' || response.outcome === 'duplicate') {
            nextBaseRev = response.revision;
            boardRevisionRef.current = response.revision;
          }
          handleOperationResponse(response);
          if (response.outcome === 'conflict' || response.outcome === 'forbidden') break;
        } catch {
          setSyncStatus('error');
          haptic.error();
          break;
        }
      }
    },
    [moodboard, haptic, flushOutbox, handleOperationResponse],
  );

  return {
    moodboard,
    setMoodboard,
    themes,
    pickerItems,
    loading,
    error,
    saving,
    setSaving,
    syncStatus,
    setSyncStatus,
    conflictDetail,
    setConflictDetail,
    conflictLocalSnapshot,
    activeThemeId,
    setActiveThemeId,
    activeTheme,
    collaboratorsOnline,
    isOwner,
    boardRevisionRef,
    loadAll,
    reconcileBoard,
    handleOperationResponse,
    /** Push a batch of LWW ops via the outbox (or sequentially online). */
    submitBoardOps,
    /** Re-run the outbox drain + reconcile. Wired to the sync-error retry. */
    retrySync: flushOutbox };
}
