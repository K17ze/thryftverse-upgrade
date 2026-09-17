import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { NativeStackScreenProps, RootStackParamList } from '../../navigation/types';
import { patchListingOnApi, deleteListingOnApi, type ListingApiItem } from '../../services/listingsApi';
import {
  submitSellerHubBatchCommand,
  type SellerHubBatchItem,
  type SellerHubBatchResponse,
} from '../../services/sellerHubApi';
import { parseApiError } from '../../lib/apiClient';
import { createStableId } from '../../utils/createStableId';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../useHaptic';
import type { InventoryConfirmSheetState } from './types';

type InventoryNavigation = NativeStackScreenProps<RootStackParamList, 'InventoryManagement'>['navigation'];

/**
 * Deterministic content hash for batch idempotency keys. Pause/resume/
 * delete key on the sorted selection alone — those commands converge to an
 * idempotent end-state, so replaying the stored receipt for a deliberate
 * re-submit is safe. `edit` is different: it composes the hash with a
 * per-submit nonce (see handleBulkEdit) so two intentional submissions of
 * the same patch are two durable jobs, while transport-level retries of
 * one submission still dedupe.
 */
function hashBatchItems(items: SellerHubBatchItem[]): string {
  const serialized = JSON.stringify(items);
  let hash = 5381;
  for (let i = 0; i < serialized.length; i += 1) {
    hash = ((hash << 5) + hash + serialized.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

interface UseInventoryActionsParams {
  navigation: InventoryNavigation;
  listings: ListingApiItem[];
  setListings: Dispatch<SetStateAction<ListingApiItem[]>>;
  selectedIds: Set<string>;
  exitSelectionMode: () => void;
  load: (silent?: boolean) => Promise<void>;
}

/**
 * Owns the inventory row/bulk action handlers (edit, pause/resume, relist,
 * delete, bulk pause/resume/delete) plus the pending-action tracking and the
 * confirmation-sheet state those handlers open.
 */
export function useInventoryActions({
  navigation,
  listings,
  setListings,
  selectedIds,
  exitSelectionMode,
  load,
}: UseInventoryActionsParams) {
  const { show } = useToast();
  const haptic = useHaptic();

  // Action-in-flight tracking (per-row optimistic status updates)
  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(new Set());

  const [confirmSheet, setConfirmSheet] = useState<InventoryConfirmSheetState>(
    () => ({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' as const }));

  // Bulk edit sheet state — the screen renders <BulkEditSheet> off these.
  const [bulkEditVisible, setBulkEditVisible] = useState(false);
  const [bulkEditSubmitting, setBulkEditSubmitting] = useState(false);

  // ── Row actions ──
  const handleEdit = useCallback((item: ListingApiItem) => {
    haptic.light();
    navigation.navigate('EditListing', { itemId: item.id });
  }, [navigation, haptic]);

  const handleTogglePause = useCallback(async (item: ListingApiItem) => {
    if (pendingActionIds.has(item.id)) return;
    const isPaused = item.status === 'paused';
    const nextStatus = isPaused ? 'active' : 'paused';
    haptic.medium();
    setPendingActionIds((prev) => new Set(prev).add(item.id));
    // Optimistic update
    setListings((prev) =>
      prev.map((l) => (l.id === item.id ? { ...l, status: nextStatus } : l))
    );
    try {
      await patchListingOnApi(item.id, { status: nextStatus as 'active' | 'paused' });
      show(isPaused ? 'Listing resumed' : 'Listing paused', 'success');
    } catch (err) {
      // Revert on failure
      setListings((prev) =>
        prev.map((l) => (l.id === item.id ? { ...l, status: item.status } : l))
      );
      const parsed = parseApiError(err);
      show(parsed.message, 'error');
    } finally {
      setPendingActionIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }, [pendingActionIds, setListings, haptic, show]);

  const handleRelist = useCallback((item: ListingApiItem) => {
    haptic.light();
    navigation.navigate('EditListing', { itemId: item.id });
  }, [navigation, haptic]);

  const handleDelete = useCallback((item: ListingApiItem) => {
    haptic.heavy();
    setConfirmSheet({
      visible: true,
      title: 'Delete listing',
      message: `Delete "${item.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
      onConfirm: async () => {
        if (pendingActionIds.has(item.id)) return;
        setPendingActionIds((prev) => new Set(prev).add(item.id));
        setListings((prev) => prev.filter((l) => l.id !== item.id));
        try {
          await deleteListingOnApi(item.id);
          show('Listing deleted', 'success');
        } catch (err) {
          // Re-fetch to restore on failure
          void load(true);
          const parsed = parseApiError(err);
          show(parsed.message, 'error');
        } finally {
          setPendingActionIds((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
        }
      } });
  }, [pendingActionIds, setListings, haptic, show, load]);

  const handleBulkPause = useCallback(async (resume: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const command = resume ? 'resume' : 'pause';
    const nextStatus = resume ? 'active' : 'paused';
    haptic.medium();
    setPendingActionIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    const originalStatuses = new Map(ids.map((id) => [id, listings.find((l) => l.id === id)?.status ?? 'active']));
    // Optimistic update — apply to all selected
    setListings((prev) =>
      prev.map((l) => (selectedIds.has(l.id) ? { ...l, status: nextStatus } : l))
    );
    try {
      const idempotencyKey = `bulk-${command}-${ids.slice().sort().join('-')}`;
      const response = await submitSellerHubBatchCommand(
        command,
        ids.map((id) => ({ listingId: id })),
        idempotencyKey,
      );
      // Apply per-item receipts truthfully.
      // Per Report 17 P0: partial failure is a firstclass result.
      // The UI never restores a committed row because a sibling failed.
      const applied: string[] = [];
      const rejected: string[] = [];
      const unknown: string[] = [];
      for (const result of response.results) {
        if (result.state === 'applied') applied.push(result.listingId);
        else if (result.state === 'rejected') rejected.push(result.listingId);
        else unknown.push(result.listingId);
      }
      // Revert only rejected and unknown items to their original status
      if (rejected.length > 0 || unknown.length > 0) {
        setListings((prev) =>
          prev.map((l) => {
            if (rejected.includes(l.id) || unknown.includes(l.id)) {
              const orig = originalStatuses.get(l.id);
              return orig ? { ...l, status: orig } : l;
            }
            return l;
          })
        );
        // Re-fetch to reconcile unknown items with server truth
        if (unknown.length > 0) {
          void load(true);
        }
      }
      // Build truthful toast message
      if (response.state === 'complete') {
        show(`${ids.length} listing${ids.length === 1 ? '' : 's'} ${resume ? 'resumed' : 'paused'}`, 'success');
        exitSelectionMode();
      } else {
        const parts: string[] = [];
        if (applied.length > 0) parts.push(`${applied.length} ${resume ? 'resumed' : 'paused'}`);
        if (rejected.length > 0) parts.push(`${rejected.length} failed`);
        if (unknown.length > 0) parts.push(`${unknown.length} checking`);
        show(parts.join(' · '), applied.length > 0 ? 'success' : 'error');
        if (applied.length === ids.length) exitSelectionMode();
      }
    } catch (err) {
      // Network/transport error — revert all to original since we can't
      // confirm any item was committed
      setListings((prev) =>
        prev.map((l) => {
          if (selectedIds.has(l.id)) {
            const orig = originalStatuses.get(l.id);
            return orig ? { ...l, status: orig } : l;
          }
          return l;
        })
      );
      const parsed = parseApiError(err);
      show(parsed.message, 'error');
    } finally {
      setPendingActionIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [selectedIds, listings, setListings, haptic, show, exitSelectionMode, load]);

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    haptic.heavy();
    setConfirmSheet({
      visible: true,
      title: `Delete ${ids.length} listing${ids.length === 1 ? '' : 's'}`,
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      variant: 'danger',
      onConfirm: async () => {
        setPendingActionIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.add(id));
          return next;
        });
        const snapshot = [...listings];
        // Optimistic: remove all selected from the list
        setListings((prev) => prev.filter((l) => !selectedIds.has(l.id)));
        try {
          const idempotencyKey = `bulk-delete-${ids.slice().sort().join('-')}`;
          const response = await submitSellerHubBatchCommand(
            'delete',
            ids.map((id) => ({ listingId: id })),
            idempotencyKey,
          );
          // Apply per-item receipts truthfully
          const applied: string[] = [];
          const rejected: string[] = [];
          const unknown: string[] = [];
          for (const result of response.results) {
            if (result.state === 'applied') applied.push(result.listingId);
            else if (result.state === 'rejected') rejected.push(result.listingId);
            else unknown.push(result.listingId);
          }
          // Restore rejected items to the list
          if (rejected.length > 0 || unknown.length > 0) {
            const itemsToRestore = snapshot.filter(
              (l) => rejected.includes(l.id) || unknown.includes(l.id),
            );
            setListings((prev) => [...prev, ...itemsToRestore]);
            // Re-fetch to reconcile unknown items
            if (unknown.length > 0) {
              void load(true);
            }
          }
          if (response.state === 'complete') {
            show(`${ids.length} listing${ids.length === 1 ? '' : 's'} deleted`, 'success');
            exitSelectionMode();
          } else {
            const parts: string[] = [];
            if (applied.length > 0) parts.push(`${applied.length} deleted`);
            if (rejected.length > 0) parts.push(`${rejected.length} failed`);
            if (unknown.length > 0) parts.push(`${unknown.length} checking`);
            show(parts.join(' · '), applied.length > 0 ? 'success' : 'error');
            if (applied.length === ids.length) exitSelectionMode();
          }
        } catch (err) {
          // Network/transport error — restore all items
          setListings(snapshot);
          const parsed = parseApiError(err);
          show(parsed.message, 'error');
        } finally {
          setPendingActionIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          });
        }
      } });
  }, [selectedIds, listings, setListings, haptic, show, exitSelectionMode, load]);

  const openBulkEdit = useCallback(() => {
    if (selectedIds.size === 0) return;
    haptic.light();
    setBulkEditVisible(true);
  }, [selectedIds, haptic]);

  const closeBulkEdit = useCallback(() => {
    setBulkEditVisible(false);
  }, []);

  /**
   * Submit a batch 'edit' command. Each item carries its own validated
   * patch (the BulkEditSheet computes per-item prices for percent
   * adjustments). Applies patches optimistically, then reconciles against
   * the per-item receipts — rejected/conflict items are reverted to their
   * snapshot, matching the pause/delete convention.
   *
   * Returns the batch response so the sheet can render per-item failure
   * detail, or null on a transport error (toast already shown).
   */
  const handleBulkEdit = useCallback(async (
    items: SellerHubBatchItem[],
  ): Promise<SellerHubBatchResponse | null> => {
    const ids = items.map((i) => i.listingId);
    if (ids.length === 0) return null;
    haptic.medium();
    setBulkEditSubmitting(true);
    setPendingActionIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    const patchById = new Map(items.map((i) => [i.listingId, i.patch ?? {}]));
    // Snapshot the rows being patched so failed items restore truthfully.
    const snapshot = new Map(
      listings.filter((l) => patchById.has(l.id)).map((l) => [l.id, { ...l }]),
    );
    // Optimistic: apply each item's patch locally.
    setListings((prev) =>
      prev.map((l) => {
        const patch = patchById.get(l.id);
        return patch ? { ...l, ...patch } : l;
      })
    );
    try {
      // hash + per-submit nonce: the hash keeps the key descriptive and the
      // nonce makes each deliberate Apply a NEW durable job. Without it, an
      // identical items+patch resubmission replays the stored receipt
      // server-side (no re-apply) while the optimistic update above already
      // showed the values — a silently diverged UI. fetchJson retries reuse
      // this same key, so transport retries still dedupe.
      const idempotencyKey = `bulk-edit-${hashBatchItems(items)}-${createStableId('submit')}`;
      const response = await submitSellerHubBatchCommand('edit', items, idempotencyKey);
      const applied: string[] = [];
      const rejected: string[] = [];
      const unknown: string[] = [];
      for (const result of response.results) {
        if (result.state === 'applied') applied.push(result.listingId);
        else if (result.state === 'rejected') rejected.push(result.listingId);
        else unknown.push(result.listingId);
      }
      // Revert only rejected and unknown items — a committed sibling is
      // never rolled back because another item failed.
      if (rejected.length > 0 || unknown.length > 0) {
        setListings((prev) =>
          prev.map((l) => {
            if (rejected.includes(l.id) || unknown.includes(l.id)) {
              return snapshot.get(l.id) ?? l;
            }
            return l;
          })
        );
        if (unknown.length > 0) {
          void load(true);
        }
      }
      if (response.state === 'complete') {
        show(`${ids.length} listing${ids.length === 1 ? '' : 's'} updated`, 'success');
        // The sheet owns dismissal — a complete batch can still carry
        // client-side skips it needs to report in the result view.
        exitSelectionMode();
      } else {
        const parts: string[] = [];
        if (applied.length > 0) parts.push(`${applied.length} updated`);
        if (rejected.length > 0) parts.push(`${rejected.length} failed`);
        if (unknown.length > 0) parts.push(`${unknown.length} checking`);
        show(parts.join(' · '), applied.length > 0 ? 'success' : 'error');
        if (applied.length === ids.length) {
          exitSelectionMode();
        }
      }
      return response;
    } catch (err) {
      // Transport error — no item can be confirmed, restore everything.
      setListings((prev) => prev.map((l) => snapshot.get(l.id) ?? l));
      const parsed = parseApiError(err);
      show(parsed.message, 'error');
      return null;
    } finally {
      setBulkEditSubmitting(false);
      setPendingActionIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [listings, setListings, haptic, show, exitSelectionMode, load]);

  const dismissConfirmSheet = useCallback(() => {
    setConfirmSheet((s) => ({ ...s, visible: false }));
  }, []);

  return {
    pendingActionIds,
    confirmSheet,
    dismissConfirmSheet,
    bulkEditVisible,
    bulkEditSubmitting,
    openBulkEdit,
    closeBulkEdit,
    handleBulkEdit,
    handleEdit,
    handleTogglePause,
    handleRelist,
    handleDelete,
    handleBulkPause,
    handleBulkDelete,
  };
}
