import { useCallback, useState } from 'react';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useHaptic } from './useHaptic';
import { useSignupWall } from './useSignupWall';

// Session-scoped guard — a plain module binding so the teaching toast can
// appear at most once per app session across every surface. The persisted
// `hasSeenSaveToListHint` store flag is the cross-session guard.
let hintShownThisSession = false;

/**
 * Two-tier save wiring shared by every discovery surface.
 *
 * Tier 1 — quick-save: `handleQuickSave` toggles the local saved state.
 * Tier 2 — file to a list: `handleSaveLongPress` (or the one-shot teaching
 * toast) opens the collection picker via `savePickerItemId`.
 *
 * Teaching the second gesture (Instagram audit P1): the first time a user
 * quick-saves an item that isn't already filed in a collection, a single
 * quiet toast offers "Add to a list". It shows at most once per session
 * and stops permanently once the picker has been used or the hint has been
 * dismissed — it teaches, it never nags.
 */
export function useSaveToCollectionPicker() {
  const { show } = useToast();
  const haptic = useHaptic();
  const { requireAuth } = useSignupWall();

  const toggleSavedProduct = useStore((s) => s.toggleSavedProduct);
  const isSavedProduct = useStore((s) => s.isSavedProduct);
  const getItemCollections = useStore((s) => s.getItemCollections);
  const hasSeenSaveToListHint = useStore((s) => s.hasSeenSaveToListHint);
  const markSaveToListHintSeen = useStore((s) => s.markSaveToListHintSeen);

  const [savePickerItemId, setSavePickerItemId] = useState<string | null>(null);

  const openSavePicker = useCallback((itemId: string) => {
    // Opening the picker — from any entry point — means the second save
    // gesture has been learned. Never teach it again.
    markSaveToListHintSeen();
    setSavePickerItemId(itemId);
  }, [markSaveToListHintSeen]);

  const closeSavePicker = useCallback(() => setSavePickerItemId(null), []);

  const handleSaveLongPress = useCallback((item: { id: string }) => {
    // "File to a list" is account-backed — collections live on the API.
    if (!requireAuth('save_item')) return;
    haptic.selection();
    openSavePicker(item.id);
  }, [requireAuth, haptic, openSavePicker]);

  const handleQuickSave = useCallback((item: { id: string }) => {
    haptic.light();
    const wasSaved = isSavedProduct(item.id);
    toggleSavedProduct(item.id);

    // Stay quiet when: this was an un-save, the gesture is already
    // learned/dismissed, the hint already ran this session, or the item
    // is already filed in a collection.
    if (wasSaved || hasSeenSaveToListHint || hintShownThisSession) return;
    if (getItemCollections(item.id).length > 0) return;

    hintShownThisSession = true;
    show('Saved', 'success', {
      action: {
        label: 'Add to a list',
        onPress: () => {
          if (!requireAuth('save_item')) return;
          openSavePicker(item.id);
        },
      },
      // Explicit dismissal counts as seen — the hint never returns.
      onDismiss: markSaveToListHintSeen,
    });
  }, [getItemCollections, hasSeenSaveToListHint, haptic, isSavedProduct, markSaveToListHintSeen, openSavePicker, requireAuth, show, toggleSavedProduct]);

  return { savePickerItemId, handleQuickSave, handleSaveLongPress, closeSavePicker };
}
