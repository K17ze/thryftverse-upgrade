/**
 * usePosterComposerUiState — transient UI / sheet state for the Poster
 * composer.
 *
 * Extracted from PosterComposerScreen (pure extraction — no behavioral
 * change). Owns the mutually-exclusive sheet union (useActiveSheet), the
 * text color picker + color history, the in-place text editing target,
 * the manipulation / trash-zone shared values, the frame-swipe gesture
 * shared values, the bottom-surface discriminator, the frame organizer
 * and page-menu flags, the compare-to-original toggle, the video player
 * ref, the transient timeline selection ids, and the autosave timestamp
 * tracker.
 */
import { useEffect, useRef, useState } from 'react';
import type { VideoPlayer } from 'expo-video';
import { useSharedValue } from 'react-native-reanimated';

import { useCreatorColorHistory } from '../../color';
import { useActiveSheet } from '../useActiveSheet';

// ── Types ────────────────────────────────────────────────────────────

/**
 * Mutually exclusive bottom surfaces (spec: one at a time).
 * 'tools' = default tool rail (canvas dominant for single-photo)
 * 'timeline' = timeline expanded (video, multiple clips, or explicit)
 * 'effects' = effects/adjust bottom sheet
 * null = no bottom surface (full canvas)
 */
export type PosterBottomSurface = 'tools' | 'timeline' | 'effects' | null;

export interface UsePosterComposerUiStateInput {
  /** Autosave status from CreatorContext. */
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'failed';
  /** Initial value for the templates sheet (route.params?.openTemplates). */
  openTemplates: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterComposerUiState({
  autosaveStatus,
  openTemplates,
}: UsePosterComposerUiStateInput) {
  // Autosave status derivation for the top bar.
  const isAutosaving = autosaveStatus === 'saving';
  const [lastAutosaveAt, setLastAutosaveAt] = useState<number | null>(null);
  useEffect(() => {
    if (autosaveStatus === 'saved') {
      setLastAutosaveAt(Date.now());
    }
  }, [autosaveStatus]);

  // 13 mutually exclusive sheets consolidated into a single discriminated
  // union via useActiveSheet. This replaces 13 independent useState(false)
  // booleans with 1 useReducer, reducing re-renders and enforcing mutual
  // exclusivity at the type level (audit item-29 §5.5).
  const { activeSheet, open: openSheet, close: closeSheet } = useActiveSheet();
  const showLayers = activeSheet === 'layers';
  const showPublish = activeSheet === 'publish';
  const showSettings = activeSheet === 'settings';
  const showOverflow = activeSheet === 'overflow';
  const showHelp = activeSheet === 'help';
  const showA11yMove = activeSheet === 'a11yMove';
  const showA11yZOrder = activeSheet === 'a11yZOrder';
  const showA11yTransform = activeSheet === 'a11yTransform';
  const showTransitions = activeSheet === 'transitions';
  const showKeyframes = activeSheet === 'keyframes';
  const showSpeedCurve = activeSheet === 'speedCurve';
  const showReverse = activeSheet === 'reverse';
  const showFreezeFrame = activeSheet === 'freezeFrame';
  const showAudioFade = activeSheet === 'audioFade';
  // Text color picker sheet (local state — not in useActiveSheet).
  // Opens a CreatorColorPicker sheet for the selected text layer's fill
  // color. Replaces the former hardcoded palette cycling.
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const { recents: colorRecents, commitColor: commitRecentColor } = useCreatorColorHistory();
  // In-place text content editing (Snapchat/Instagram pattern).
  // When set, an InlineTextEditor renders AT the text layer's position on
  // the canvas so the user can type in place. The modal TextEditorSheet is
  // reserved for advanced styling, not for content editing.
  const [editingTextLayerId, setEditingTextLayerId] = useState<string | null>(null);
  // Chrome-recedes-during-manipulation (Snapchat/Instagram pattern).
  // When the user drags/pinches/rotates a layer, the top bar and tool dock
  // fade out so the canvas feels infinite. The shared value is set by
  // CreatorCanvas's gesture handlers (1 = manipulating, 0 = idle).
  const manipulationActiveSV = useSharedValue(0);
  const [isManipulating, setIsManipulating] = useState(false);
  // Drag-to-trash: set to 1 by CreatorCanvas while the dragged layer's
  // center is inside the bottom trash zone. Drives the TrashZone overlay
  // highlight.
  const isInTrashZoneSV = useSharedValue(0);
  // Frame-swipe gesture state. These MUST be shared values, not captured
  // `let` closure variables: react-native-worklets 0.10 captures closure
  // variables by value and cannot serialize `let` reassignment inside a
  // worklet — doing so produces "invalid assignment left-hand side" at
  // worklet compile time. Shared values are the canonical Reanimated 4
  // way to read/write mutable state from the UI thread.
  const frameSwipeStartXSV = useSharedValue(0);
  const frameSwipeStartYSV = useSharedValue(0);
  const frameSwipeLockedDirSV = useSharedValue<'horizontal' | 'vertical' | null>(null);
  const [showTemplates, setShowTemplates] = useState(openTemplates);
  const [showPreview, setShowPreview] = useState(false);
  const [showSafeZone, setShowSafeZone] = useState(false);
  // Multi-select mode — entered via long-press on a layer (Snapchat/IG
  // grammar). Mirrors the Look composer: Done / N-selected / Select-all
  // chrome, tap toggles, drag moves the group, rail switches to bulk ops.
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [pageMenuIndex, setPageMenuIndex] = useState<number | null>(null);
  const [showFrameTray, setShowFrameTray] = useState(false);
  const [videoInfoFrameIndex, setVideoInfoFrameIndex] = useState<number | null>(null);
  const [bottomSurface, setBottomSurface] = useState<PosterBottomSurface>('tools');
  // User explicitly requested the timeline (Edit Clip / Timeline button).
  // For single-photo posters the timeline is hidden by default; this flag
  // records the user's intent so the timeline stays open until dismissed.
  const [, setUserRequestedTimeline] = useState(false);
  // Compare-to-original (Lightroom long-press pattern).
  // While the user long-presses the canvas background, the selected media
  // layer renders without its effect stack — the user sees the original
  // ungraded image. Release restores the graded view. This is the
  // recognition-over-recall pattern: the user doesn't need to remember
  // what the original looked like; they hold to see it.
  const [compareOriginal, setCompareOriginal] = useState(false);

  // Video player ref. The ref is set by whichever video layer is on the
  // currently rendered page (a poster page has at most one media layer,
  // so there is no ambiguity).
  const videoPlayerRef = useRef<VideoPlayer | null>(null);

  // Transient timeline selection. Playhead position and play/pause state
  // are driven by the PlaybackClock (the single authority) — no separate
  // isPlaying state.
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);

  return {
    isAutosaving,
    lastAutosaveAt,
    activeSheet,
    openSheet,
    closeSheet,
    showLayers,
    showPublish,
    showSettings,
    showOverflow,
    showHelp,
    showA11yMove,
    showA11yZOrder,
    showA11yTransform,
    showTransitions,
    showKeyframes,
    showSpeedCurve,
    showReverse,
    showFreezeFrame,
    showAudioFade,
    showTextColorPicker,
    setShowTextColorPicker,
    colorRecents,
    commitRecentColor,
    editingTextLayerId,
    setEditingTextLayerId,
    manipulationActiveSV,
    isManipulating,
    setIsManipulating,
    isInTrashZoneSV,
    frameSwipeStartXSV,
    frameSwipeStartYSV,
    frameSwipeLockedDirSV,
    showTemplates,
    setShowTemplates,
    showPreview,
    setShowPreview,
    showSafeZone,
    setShowSafeZone,
    multiSelectMode,
    setMultiSelectMode,
    pageMenuIndex,
    setPageMenuIndex,
    showFrameTray,
    setShowFrameTray,
    videoInfoFrameIndex,
    setVideoInfoFrameIndex,
    bottomSurface,
    setBottomSurface,
    setUserRequestedTimeline,
    compareOriginal,
    setCompareOriginal,
    videoPlayerRef,
    selectedClipId,
    setSelectedClipId,
    selectedOverlayId,
    setSelectedOverlayId,
  };
}

export type PosterComposerUiState = ReturnType<typeof usePosterComposerUiState>;
