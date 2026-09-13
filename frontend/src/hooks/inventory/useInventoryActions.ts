import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { NativeStackScreenProps, RootStackParamList } from '../../navigation/types';
import { patchListingOnApi, deleteListingOnApi, type ListingApiItem } from '../../services/listingsApi';
import { submitSellerHubBatchCommand } from '../../services/sellerHubApi';
import { parseApiError } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import { useHaptic } from '../useHaptic';
import type { InventoryConfirmSheetState } from './types';

type InventoryNavigation = NativeStackScreenProps<RootStackParamList, 'InventoryManagement'>['navigation'];

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

  const dismissConfirmSheet = useCallback(() => {
    setConfirmSheet((s) => ({ ...s, visible: false }));
  }, []);

  return {
    pendingActionIds,
    confirmSheet,
    dismissConfirmSheet,
    handleEdit,
    handleTogglePause,
    handleRelist,
    handleDelete,
    handleBulkPause,
    handleBulkDelete,
  };
}
