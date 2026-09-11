/**
 * usePosterEntryTransition — Entry / camera→editor crossfade hook for the
 * Poster composer.
 *
 * Extracted from PosterComposerScreen to separate the entry-screen media
 * handling and the camera→editor crossfade continuity logic from the
 * screen's rendering orchestration.
 *
 * The hook owns:
 *   - `entryComplete` — whether the user has passed the entry screen
 *     (media selected or blank start). Initialised from the route's
 *     `startBlank` param so a blank-start deep link skips the entry screen.
 *   - `entryPinnedUri` / `entryPinnedKind` — the first selected media URI
 *     and kind, captured so the camera→editor crossfade can pin it as a
 *     continuity layer (the media stays in place while editor chrome
 *     fades in around it).
 *   - `entrySourceTransform` — the camera viewport guide rect captured at
 *     the moment of capture. The transition animates the pinned media from
 *     this frame to the editor canvas frame, preserving the focal point.
 *   - `cameraViewportRef` — a ref the camera reports its measured viewport
 *     into via `onViewportChange`, so the source transform is available
 *     when the capture commits.
 *   - `handleEntryMediaSelected` / `handleEntryBlankStart` /
 *     `handleEntryClose` — the entry-screen callbacks.
 *   - `showEntryScreen` — derived: the entry screen is shown when the user
 *     has not yet completed entry, there is no content, and no draft is
 *     loading.
 *
 * Pattern follows usePosterSession.ts and usePosterEffects.ts.
 */

import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';

import type { NativeStackNavigationProp, RootStackParamList, CreatorInitialMedia } from '../../navigation/types';
import type { CreatorContentTransform } from '../CreatorEntryEditorCrossfade';
import type { CaptureViewport } from '../capture/CaptureViewport';

// ── Types ────────────────────────────────────────────────────────────

type Navigation = NativeStackNavigationProp<RootStackParamList, 'CreatorStudio'>;

export interface UsePosterEntryTransitionInput {
  /** Whether the route requested a blank-start (skips the entry screen). */
  startBlank: boolean;
  /** Whether the document already has content (any page with layers). */
  hasContent: boolean;
  /** Whether a draft is currently loading. */
  isLoadingDraft: boolean;
  /** Adds the selected media as poster frames (from CreatorContext). */
  addPosterFrames: (media: CreatorInitialMedia[]) => void;
  /** Stack navigation prop. */
  navigation: Navigation;
}

export interface UsePosterEntryTransitionResult {
  /** Whether the user has passed the entry screen. */
  entryComplete: boolean;
  /** The first selected media URI (for crossfade pinning), or null. */
  entryPinnedUri: string | null;
  /** The kind of the pinned media ('image' | 'video'). */
  entryPinnedKind: 'image' | 'video';
  /** The source content transform (camera viewport guide rect), or null. */
  entrySourceTransform: CreatorContentTransform | null;
  /** Ref the camera reports its measured viewport into. */
  cameraViewportRef: RefObject<CaptureViewport | null>;
  /** Called when the user selects media on the entry screen. */
  handleEntryMediaSelected: (media: CreatorInitialMedia[]) => void;
  /** Called when the user chooses to start with a blank canvas. */
  handleEntryBlankStart: () => void;
  /** Called when the user closes the entry screen without selecting. */
  handleEntryClose: () => void;
  /** Derived: whether the entry screen should be shown. */
  showEntryScreen: boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function usePosterEntryTransition({
  startBlank,
  hasContent,
  isLoadingDraft,
  addPosterFrames,
  navigation,
}: UsePosterEntryTransitionInput): UsePosterEntryTransitionResult {
  // ── Entry completion ────────────────────────────────────────────────
  // Initialised from the route's `startBlank` param so a blank-start deep
  // link skips the entry screen entirely.
  const [entryComplete, setEntryComplete] = useState(startBlank);

  // ── Entry screen media handling ────────────────────────────────────
  // For Poster, each asset becomes its own frame via addPosterFrames.
  // The first selected media URI is captured so the camera→editor
  // crossfade can pin it as a continuity layer (the media stays in place
  // while editor chrome fades in around it — see the creator-poster
  // surface contract).
  const [entryPinnedUri, setEntryPinnedUri] = useState<string | null>(null);
  const [entryPinnedKind, setEntryPinnedKind] = useState<'image' | 'video'>('image');
  // Source content transform — the camera viewport guide rect captured at
  // the moment of capture. The transition animates the pinned media from
  // this frame to the editor canvas frame, preserving the focal point.
  const [entrySourceTransform, setEntrySourceTransform] = useState<CreatorContentTransform | null>(null);
  // The camera reports its measured viewport via onViewportChange so the
  // source transform is available when the capture commits.
  const cameraViewportRef = useRef<CaptureViewport | null>(null);

  const handleEntryMediaSelected = useCallback((media: CreatorInitialMedia[]) => {
    setEntryPinnedUri(media[0]?.uri ?? null);
    setEntryPinnedKind(media[0]?.kind ?? 'image');
    // Build the source content transform from the measured camera viewport
    // so the transition animates from the guide frame, not full-screen.
    const vp = cameraViewportRef.current;
    if (vp) {
      setEntrySourceTransform({
        frame: {
          left: vp.viewRect.x,
          top: vp.viewRect.y,
          width: vp.viewRect.width,
          height: vp.viewRect.height,
        },
        aspectRatio: vp.authoredAspectRatio,
      });
    } else {
      setEntrySourceTransform(null);
    }
    addPosterFrames(media);
    setEntryComplete(true);
  }, [addPosterFrames]);

  const handleEntryBlankStart = useCallback(() => {
    setEntryPinnedUri(null);
    setEntryPinnedKind('image');
    setEntrySourceTransform(null);
    setEntryComplete(true);
  }, []);

  const handleEntryClose = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // ── Derived: entry screen visibility ────────────────────────────────
  const showEntryScreen = !entryComplete && !hasContent && !isLoadingDraft;

  return {
    entryComplete,
    entryPinnedUri,
    entryPinnedKind,
    entrySourceTransform,
    cameraViewportRef,
    handleEntryMediaSelected,
    handleEntryBlankStart,
    handleEntryClose,
    showEntryScreen,
  };
}
