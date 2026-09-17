/**
 * useLookMultiSelectActions — multi-select exit + bulk delete for the
 * Look composer.
 *
 * Extracted from LookComposerScreen — pure relocation, no changes.
 * `exitMultiSelect` is defined early so it's available to the keyboard
 * shortcut handler and hardware back button handler in
 * useLookSurfaceDismiss.
 */

import { useCallback } from 'react';
import { useHaptic } from '../../../hooks/useHaptic';
import type { CreatorContextValue } from '../../studio/CreatorContext';
import type { LookComposerStateResult } from './useLookComposerState';

export type HapticApi = ReturnType<typeof useHaptic>;

export function useLookMultiSelectActions({
  cs,
  creator,
  haptic,
}: {
  cs: LookComposerStateResult;
  creator: CreatorContextValue;
  haptic: HapticApi;
}) {
  const { setMultiSelectMode } = cs;
  const { selectLayers, deleteMultiSelected } = creator;

  // ── Multi-select: exit helper ────────────────────────────────────────
  const exitMultiSelect = useCallback(() => {
    setMultiSelectMode(false);
    selectLayers(null);
    haptic.light();
  }, [setMultiSelectMode, selectLayers, haptic]);

  // Multi-select bulk delete — defined early for keyboard shortcut access.
  const handleMultiDelete = useCallback(() => {
    haptic.medium();
    haptic.warning();
    deleteMultiSelected();
    setMultiSelectMode(false);
  }, [deleteMultiSelected, haptic, setMultiSelectMode]);

  return { exitMultiSelect, handleMultiDelete };
}
