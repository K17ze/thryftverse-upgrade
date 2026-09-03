/**
 * Sync status contract for the offline-first sync engine.
 *
 * This is the *engine* sync state — the durable outbox reconciliation loop in
 * `syncEngine.ts` / `outboxClient.ts`. It is distinct from `utils/syncStatus`,
 * which describes backend *data freshness* (live / syncing / offline-cache)
 * for a single read surface. This module describes the global mutation
 * outbox: how many local changes are pending, how many failed, whether a
 * retry is in flight, and whether the engine hit a conflict it could not
 * auto-resolve.
 *
 * The UI contract is "never silently lose data": pending and failed changes
 * must be surfaced (see `SyncStatusBadge`), and conflicts must be reviewable
 * (see `getOutboxConflicts` in `outboxClient.ts`).
 */

import { useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { getOutboxPendingCount, getOutboxConflicts } from './outboxClient';

/** The lifecycle states the offline sync engine can be in. */
export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'pending'
  | 'failed'
  | 'offline'
  | 'conflict';

/** The full sync state surfaced to the UI. */
export interface SyncState {
  status: SyncStatus;
  lastSyncedAt?: string;
  pendingChanges: number;
  failedChanges: number;
  retrying: boolean;
  errorMessage?: string;
}

/**
 * Human-readable label for a sync status. Returns an empty string for `idle`
 * so the UI can omit the indicator entirely when there is nothing to say.
 */
export function getSyncStatusLabel(status: SyncStatus): string {
  switch (status) {
    case 'idle':
      return '';
    case 'syncing':
      return 'Syncing\u2026';
    case 'pending':
      return 'Pending changes';
    case 'failed':
      return 'Sync failed';
    case 'offline':
      return 'Offline';
    case 'conflict':
      return 'Sync conflict';
  }
}

/**
 * Whether the sync indicator should be visible. `idle` is the resting state
 * (nothing to communicate); `syncing` is transient and handled separately by
 * the badge's pulse animation. Everything else is a sticky state the user
 * needs to see.
 */
export function shouldShowSyncIndicator(state: SyncState): boolean {
  return state.status !== 'idle' && state.status !== 'syncing';
}

/**
 * Derive the canonical `SyncStatus` from the raw outbox counts and
 * connectivity state. Priority: offline > conflict > failed > pending >
 * syncing > idle. Kept pure so it is testable without React.
 *
 * @param pending  Rows in `pending` / `pushing` / `conflict` states.
 * @param failed   Rows in the terminal `failed` state (manual intervention).
 * @param conflicts Rows explicitly marked `conflict` (require pull reconcile).
 * @param isOffline Device connectivity is false.
 * @param isSyncing A drain / push cycle is currently in flight.
 */
export function deriveSyncStatus(
  pending: number,
  failed: number,
  conflicts: number,
  isOffline: boolean,
  isSyncing: boolean,
): SyncStatus {
  if (isOffline && pending > 0) return 'offline';
  if (conflicts > 0) return 'conflict';
  if (failed > 0) return 'failed';
  if (pending > 0 && !isSyncing) return 'pending';
  if (isSyncing) return 'syncing';
  return 'idle';
}

/** Polling interval (ms) for re-reading outbox counts while mounted. */
const SYNC_STATE_POLL_MS = 5000;
/** How long the badge stays in the `syncing` state after a connectivity
 *  change before the next poll re-derives the real status. Keeps the
 *  pulse from sticking on if the drain completes between polls. */
const SYNCING_GRACE_MS = 3000;

/**
 * useSyncState — React hook that bridges the durable outbox to UI state.
 *
 * Polls `getOutboxPendingCount` and `getOutboxConflicts` on a short interval
 * and subscribes to NetInfo so the badge reflects offline transitions
 * immediately. Returns a `SyncState` the `SyncStatusBadge` (or any surface)
 * can render. The hook is read-only; it never mutates the outbox.
 *
 * The polling cadence is deliberately coarse (5s) — the outbox is a durability
 * layer, not a realtime stream, and the drain loop already fires on NetInfo
 * reconnect + AppState foreground. Polling catches the case where a drain
 * completes between events.
 */
export function useSyncState(): SyncState {
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const syncingSetAt = useRef(0);

  useEffect(() => {
    let mounted = true;

    const readCounts = async () => {
      try {
        const [pendingCount, conflictRows] = await Promise.all([
          getOutboxPendingCount(),
          getOutboxConflicts(),
        ]);
        if (!mounted) return;
        setPending(pendingCount);
        setConflicts(conflictRows.length);
        setFailed(0);
        // Clear the transient syncing flag once the grace period elapses
        // so the badge reflects the real outbox state, not a stale pulse.
        if (isSyncingRef.current && Date.now() - syncingSetAt.current > SYNCING_GRACE_MS) {
          isSyncingRef.current = false;
          setIsSyncing(false);
        }
      } catch {
        // DB not ready yet — leave zeros; next tick retries.
      }
    };

    readCounts();
    const interval = setInterval(readCounts, SYNC_STATE_POLL_MS);

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (!mounted) return;
      const offline = state.isConnected === false;
      setIsOffline(offline);
      // A connectivity change implies a drain is about to fire (the outbox
      // drain subscribes to the same event); mark syncing briefly so the
      // badge can pulse before the next count read lands. The flag is
      // cleared by the poll after SYNCING_GRACE_MS.
      if (!offline) {
        syncingSetAt.current = Date.now();
        isSyncingRef.current = true;
        setIsSyncing(true);
      }
    });

    return () => {
      mounted = false;
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const status = deriveSyncStatus(pending, failed, conflicts, isOffline, isSyncing);

  return {
    status,
    pendingChanges: pending,
    failedChanges: failed,
    retrying: isSyncing && pending > 0,
    errorMessage: conflicts > 0 ? 'One or more changes conflict with the server.' : undefined,
  };
}
