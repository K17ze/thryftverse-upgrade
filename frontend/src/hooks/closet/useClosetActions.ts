import { useCallback, useState } from 'react';
import { Share } from 'react-native';
import { useStore } from '../../store/useStore';
import { useHaptic } from '../useHaptic';
import type { ClosetConfirmSheetState } from './types';
import type { ClosetOutfitLike } from '../../domain/closet';

/**
 * Owns the closet action surface that is not plain navigation wiring:
 * the Share sheet for the closet, and the ConfirmationSheet state machine
 * backing the destructive outfit-delete flow (opened from the outfit
 * card long-press).
 */
export function useClosetActions() {
  const haptic = useHaptic();
  const currentUser = useStore((state) => state.currentUser);
  const removeOutfit = useStore((state) => state.removeOutfit);

  const [confirmSheet, setConfirmSheet] = useState<ClosetConfirmSheetState>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const handleShareCloset = useCallback(async () => {
    haptic.light();
    const username = currentUser?.username ?? 'on Thryftverse';
    try {
      await Share.share({
        message: `Check out my closet @${username} on Thryftverse!`,
      });
    } catch {
      /* user cancelled */
    }
  }, [haptic, currentUser]);

  const confirmDeleteOutfit = useCallback(
    (outfit: ClosetOutfitLike) => {
      setConfirmSheet({
        visible: true,
        title: 'Delete Outfit?',
        message: `"${outfit.name}" will be removed from your outfits.`,
        confirmLabel: 'Delete',
        variant: 'danger',
        onConfirm: () => {
          haptic.medium();
          removeOutfit(outfit.id);
        },
      });
    },
    [haptic, removeOutfit]
  );

  const dismissConfirmSheet = useCallback(() => {
    setConfirmSheet((prev) => ({ ...prev, visible: false }));
  }, []);

  return {
    confirmSheet,
    confirmDeleteOutfit,
    dismissConfirmSheet,
    handleShareCloset,
  };
}
