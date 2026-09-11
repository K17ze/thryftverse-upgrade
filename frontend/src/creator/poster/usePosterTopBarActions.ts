/**
 * usePosterTopBarActions — Top bar / chrome actions hook for the Poster
 * composer.
 *
 * Extracted from PosterComposerScreen to separate the top-bar action
 * handlers (back/discard, audio mute, quick save, undo, redo) and their
 * associated state from the screen's rendering orchestration.
 *
 * The hook owns:
 *   - `confirmSheet` — the save-draft / discard confirmation sheet state.
 *   - `isAudioMuted` — live audio mute state (mirrored onto the video
 *     player via the ref).
 *   - `isQuickSaving` — quick-save-in-flight guard.
 *   - `handleBack` — truthful back: if dirty, shows the save-draft
 *     confirmation; otherwise navigates back immediately.
 *   - `handleToggleAudioMute` — toggles audio mute on the video player
 *     and shows a toast.
 *   - `handleQuickSaveDraft` — saves the draft with haptic + toast
 *     feedback, guarded against double-invocation.
 *   - `handleUndo` / `handleRedo` — undo/redo with haptic feedback and
 *     transient timeline selection reset (the selected clip/overlay may
 *     point to a layer that no longer exists after an undo/redo).
 *
 * Pattern follows usePosterSession.ts and usePosterEffects.ts.
 */

import { useCallback, useState } from 'react';
import type { RefObject } from 'react';

import type { VideoPlayer } from 'expo-video';

import type { NativeStackNavigationProp, RootStackParamList } from '../../navigation/types';
import type { ToastType } from '../../context/ToastContext';
import type { useHaptic } from '../../hooks/useHaptic';

// ── Types ────────────────────────────────────────────────────────────

type Navigation = NativeStackNavigationProp<RootStackParamList, 'CreatorStudio'>;

/**
 * The haptic engine returned by useHaptic.
 */
type Haptic = ReturnType<typeof useHaptic>;

/**
 * The toast `show` function signature from ToastContext.
 */
type ShowToast = (message: string, type?: ToastType) => void;

/**
 * The confirmation sheet state. Drives the ConfirmationSheet rendered at
 * the bottom of the editor tree.
 */
export interface ConfirmSheetState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
}

export interface UsePosterTopBarActionsInput {
  /** Whether the document has unsaved changes. */
  isDirty: boolean;
  /** Stack navigation prop. */
  navigation: Navigation;
  /** Saves the draft (from CreatorContext). */
  saveDraft: () => Promise<void>;
  /** Whether undo is available. */
  canUndo: boolean;
  /** Whether redo is available. */
  canRedo: boolean;
  /** Undo function (from CreatorContext). */
  undo: () => void;
  /** Redo function (from CreatorContext). */
  redo: () => void;
  /** Haptic engine. */
  haptic: Haptic;
  /** Toast show function. */
  show: ShowToast;
  /** Ref to the Expo VideoPlayer (for audio mute). */
  videoPlayerRef: RefObject<VideoPlayer | null>;
  /** Resets the selected timeline clip id (transient selection). */
  setSelectedClipId: (id: string | null) => void;
  /** Resets the selected timeline overlay id (transient selection). */
  setSelectedOverlayId: (id: string | null) => void;
}

export interface UsePosterTopBarActionsResult {
  /** Truthful back handler (save-draft confirmation if dirty). */
  handleBack: () => void;
  /** Toggles live audio mute on the video player. */
  handleToggleAudioMute: () => void;
  /** Quick-save draft with haptic + toast feedback. */
  handleQuickSaveDraft: () => Promise<void>;
  /** Undo with haptic + transient selection reset. */
  handleUndo: () => void;
  /** Redo with haptic + transient selection reset. */
  handleRedo: () => void;
  /** Whether audio is currently muted. */
  isAudioMuted: boolean;
  /** Whether a quick-save is in flight. */
  isQuickSaving: boolean;
  /** Confirmation sheet state (drives the ConfirmationSheet). */
  confirmSheet: ConfirmSheetState;
  /** Setter for the confirmation sheet state. */
  setConfirmSheet: React.Dispatch<React.SetStateAction<ConfirmSheetState>>;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterTopBarActions({
  isDirty,
  navigation,
  saveDraft,
  canUndo,
  canRedo,
  undo,
  redo,
  haptic,
  show,
  videoPlayerRef,
  setSelectedClipId,
  setSelectedOverlayId,
}: UsePosterTopBarActionsInput): UsePosterTopBarActionsResult {
  // ── Confirmation sheet state ────────────────────────────────────────
  const [confirmSheet, setConfirmSheet] = useState<ConfirmSheetState>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // ── Truthful back — Save Draft / Discard / Keep Editing ─────────────
  const handleBack = useCallback(() => {
    if (!isDirty) {
      navigation.goBack();
      return;
    }
    setConfirmSheet({
      visible: true,
      title: 'Save draft?',
      message: 'Unpublished changes.',
      confirmLabel: 'Save draft',
      variant: 'default',
      onConfirm: async () => {
        try {
          await saveDraft();
          navigation.goBack();
        } catch {
          setConfirmSheet({
            visible: true,
            title: 'Could not save draft',
            message: 'Try again.',
            confirmLabel: 'OK',
            variant: 'default',
            onConfirm: () => {},
          });
        }
      },
    });
  }, [isDirty, navigation, saveDraft]);

  // ── Flagship Story Top Bar: Live audio mute & quick save ────────────
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const handleToggleAudioMute = useCallback(() => {
    haptic.selection();
    setIsAudioMuted((prev) => {
      const next = !prev;
      if (videoPlayerRef.current) {
        videoPlayerRef.current.muted = next;
      }
      show(next ? 'Audio muted' : 'Audio unmuted', 'info');
      return next;
    });
  }, [haptic, show]);

  const [isQuickSaving, setIsQuickSaving] = useState(false);
  const handleQuickSaveDraft = useCallback(async () => {
    if (isQuickSaving) return;
    try {
      setIsQuickSaving(true);
      haptic.medium();
      await saveDraft();
      show('Saved to drafts', 'info');
    } catch {
      show('Could not save draft', 'error');
    } finally {
      setIsQuickSaving(false);
    }
  }, [isQuickSaving, haptic, saveDraft, show]);

  // ── Undo / Redo with transient selection reset ──────────────────────
  // Reset transient timeline selection: after an undo the selected
  // clip/overlay may point to a layer that no longer exists (split,
  // delete, replace). bottomSurface and pickerMode are user-intent
  // surfaces and are intentionally NOT reset here.
  const handleUndo = useCallback(() => {
    if (!canUndo) return;
    haptic.light();
    undo();
    setSelectedClipId(null);
    setSelectedOverlayId(null);
  }, [canUndo, undo, haptic, setSelectedClipId, setSelectedOverlayId]);

  // Reset transient timeline selection: a redo may re-introduce or
  // remove layers, so the prior selection can dangle. As with undo,
  // bottomSurface and pickerMode are preserved (user-intent).
  const handleRedo = useCallback(() => {
    if (!canRedo) return;
    haptic.light();
    redo();
    setSelectedClipId(null);
    setSelectedOverlayId(null);
  }, [canRedo, redo, haptic, setSelectedClipId, setSelectedOverlayId]);

  return {
    handleBack,
    handleToggleAudioMute,
    handleQuickSaveDraft,
    handleUndo,
    handleRedo,
    isAudioMuted,
    isQuickSaving,
    confirmSheet,
    setConfirmSheet,
  };
}
