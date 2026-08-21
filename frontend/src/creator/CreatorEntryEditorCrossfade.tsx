import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Reanimated, {
  cancelAnimation,
  interpolate,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { ResizeMode, Video } from '../components/compat/Video';

// ── Camera → Editor continuity transition ────────────────────────────────
// Per upload-department-convergence-loop.md §5 (Continuity): the captured/
// selected media must appear to stay in place while editor chrome fades in
// around it. A flat opacity crossfade between two full screens does NOT
// achieve this — the viewfinder and the editor canvas are different elements
// at different positions, so the media jumps.
//
// This wrapper mounts both the camera (entry) and the editor simultaneously
// and, when a `pinnedMediaUri` is provided, renders that image as a
// full-bleed pinned layer ON TOP during the entry→editor transition. The
// pinned media holds at full opacity while the editor chrome fades in
// beneath it, then the pinned layer fades out — so the user reads the
// captured media as staying in place while the editor appears around it.
// No black/white flash, no spinner, no blank frame.
//
// Duration: 240ms ease-in-out (within the 220–280ms element-continuity
// band per Apple/Google motion guidance). Reduced motion: instant swap,
// media still lands in the same position (pinned layer is shown briefly
// then removed synchronously).
//
// The destination layer receives pointer events during the transition so the
// user cannot interact with the fading-out layer.

const TRANSITION_MS = 240;
const PIN_HOLD_MS = Math.round(TRANSITION_MS * 0.6);
const PIN_FADE_MS = TRANSITION_MS - PIN_HOLD_MS;

export interface CreatorTransitionFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CreatorEntryEditorCrossfadeProps {
  /** When true, the entry (camera) is the active surface. When it flips to
   *  false, the editor crossfades in while the entry crossfades out. */
  showEntry: boolean;
  /** The camera / entry screen element. */
  entryElement: React.ReactNode;
  /** The editor element. */
  editorElement: React.ReactNode;
  /** Optional URI of the captured/selected media to pin during the
   *  entry→editor transition. When provided, the image is rendered as a
   *  full-bleed layer on top that holds then fades out, so the media reads
   *  as staying in place while editor chrome fades in around it. This is
   *  the element-continuity technique that distinguishes a flagship
   *  capture-to-edit flow from a page swap. */
  pinnedMediaUri?: string | null;
  /** Media kind is required for truthful video continuity. Without it the
   *  pinned layer is rendered as an image for backward compatibility. */
  pinnedMediaKind?: 'image' | 'video';
  /** Destination media bounds in screen coordinates. The pinned media
   *  animates from the full viewfinder into this exact editor frame instead
   *  of jumping between two unrelated crops. */
  pinnedMediaDestination?: CreatorTransitionFrame | null;
}

export function CreatorEntryEditorCrossfade({
  showEntry,
  entryElement,
  editorElement,
  pinnedMediaUri,
  pinnedMediaKind = 'image',
  pinnedMediaDestination,
}: CreatorEntryEditorCrossfadeProps) {
  const reducedMotion = useReducedMotion();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();

  // Mount state — each surface stays mounted while it is either the active
  // surface or mid-transition. This avoids remounting the editor (which
  // would reset its internal state) on every entry↔editor swap.
  const [mountedEditor, setMountedEditor] = useState(!showEntry);
  const [mountedEntry, setMountedEntry] = useState(showEntry);
  // The pinned media layer stays mounted during the entry→editor transition
  // and unmounts once the transition completes. We capture the URI at the
  // moment the transition starts so a later change to `pinnedMediaUri` does
  // not yank the layer mid-fade.
  const [mountedPinnedUri, setMountedPinnedUri] = useState<string | null>(null);
  const [mountedPinnedKind, setMountedPinnedKind] = useState<'image' | 'video'>('image');
  const [mountedDestination, setMountedDestination] = useState<CreatorTransitionFrame | null>(null);

  // The parent stops producing `entryElement` as soon as showEntry flips.
  // Retain the last live camera tree until its exit animation completes;
  // otherwise the wrapper fades an empty layer and the device shows a hard
  // cut despite the opacity values animating correctly.
  const retainedEntryElement = useRef(entryElement);
  if (showEntry && entryElement) {
    retainedEntryElement.current = entryElement;
  }

  const entryOpacity = useSharedValue(showEntry ? 1 : 0);
  const editorOpacity = useSharedValue(showEntry ? 0 : 1);
  // Pinned media: holds at 1 while editor chrome fades in, then fades 1→0.
  const pinnedOpacity = useSharedValue(0);
  const pinnedProgress = useSharedValue(showEntry ? 0 : 1);

  const prevShowEntry = useRef(showEntry);

  useEffect(() => {
    if (prevShowEntry.current === showEntry) return;
    const goingToEditor = !showEntry;
    prevShowEntry.current = showEntry;

    if (goingToEditor) {
      // Entry → Editor: mount editor, crossfade entry out / editor in.
      // If a pinned media URI is available, pin it on top so the captured
      // image reads as staying in place while chrome fades in around it.
      setMountedEditor(true);
      const pinUri = pinnedMediaUri ?? null;
      if (pinUri) {
        setMountedPinnedUri(pinUri);
        setMountedPinnedKind(pinnedMediaKind);
        setMountedDestination(pinnedMediaDestination ?? null);
      }
      cancelAnimation(entryOpacity);
      cancelAnimation(editorOpacity);
      cancelAnimation(pinnedOpacity);
      cancelAnimation(pinnedProgress);
      if (reducedMotion) {
        entryOpacity.value = 0;
        editorOpacity.value = 1;
        pinnedOpacity.value = 0;
        pinnedProgress.value = 1;
        setMountedEntry(false);
        if (pinUri) setMountedPinnedUri(null);
      } else {
        pinnedProgress.value = 0;
        pinnedProgress.value = withTiming(1, {
          duration: TRANSITION_MS,
          easing: Easing.inOut(Easing.cubic),
        });
        editorOpacity.value = withTiming(1, {
          duration: TRANSITION_MS,
          easing: Easing.inOut(Easing.cubic),
        });
        entryOpacity.value = withTiming(
          0,
          { duration: TRANSITION_MS, easing: Easing.inOut(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(setMountedEntry)(false);
          },
        );
        if (pinUri) {
          // Hold the pinned media at full opacity for the first ~60% of the
          // transition so the editor chrome is visibly arriving around it,
          // then fade it out over the remaining ~40%. This produces the
          // "media stays in place, chrome fades in" read.
          pinnedOpacity.value = 1;
          pinnedOpacity.value = withDelay(
            PIN_HOLD_MS,
            withTiming(
              0,
              {
                duration: PIN_FADE_MS,
                easing: Easing.inOut(Easing.cubic),
              },
              (finished) => {
                if (finished) runOnJS(setMountedPinnedUri)(null);
              },
            ),
          );
        } else {
          pinnedOpacity.value = 0;
        }
      }
    } else {
      // Editor → Entry (e.g. user cleared the document): crossfade back.
      // No pinned media on this direction — the editor canvas fades out
      // and the camera viewfinder fades back in.
      setMountedEntry(true);
      setMountedPinnedUri(null);
      cancelAnimation(entryOpacity);
      cancelAnimation(editorOpacity);
      cancelAnimation(pinnedOpacity);
      cancelAnimation(pinnedProgress);
      if (reducedMotion) {
        editorOpacity.value = 0;
        entryOpacity.value = 1;
        setMountedEditor(false);
      } else {
        entryOpacity.value = withTiming(1, {
          duration: TRANSITION_MS,
          easing: Easing.inOut(Easing.cubic),
        });
        editorOpacity.value = withTiming(
          0,
          { duration: TRANSITION_MS, easing: Easing.inOut(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(setMountedEditor)(false);
          },
        );
      }
    }
  }, [
    showEntry,
    reducedMotion,
    entryOpacity,
    editorOpacity,
    pinnedOpacity,
    pinnedProgress,
    pinnedMediaUri,
    pinnedMediaKind,
    pinnedMediaDestination,
  ]);

  const entryStyle = useAnimatedStyle(() => ({
    opacity: entryOpacity.value,
  }));
  const editorStyle = useAnimatedStyle(() => ({
    opacity: editorOpacity.value,
  }));
  const pinnedStyle = useAnimatedStyle(() => ({
    opacity: pinnedOpacity.value,
    left: interpolate(
      pinnedProgress.value,
      [0, 1],
      [0, mountedDestination?.left ?? 0],
    ),
    top: interpolate(
      pinnedProgress.value,
      [0, 1],
      [0, mountedDestination?.top ?? 0],
    ),
    width: interpolate(
      pinnedProgress.value,
      [0, 1],
      [viewportWidth, mountedDestination?.width ?? viewportWidth],
    ),
    height: interpolate(
      pinnedProgress.value,
      [0, 1],
      [viewportHeight, mountedDestination?.height ?? viewportHeight],
    ),
  }), [mountedDestination, viewportHeight, viewportWidth]);

  return (
    <Reanimated.View style={styles.container} pointerEvents="box-none">
      {/* Editor renders below the entry. During the entry→editor transition
          the entry fades out on top while the editor fades in beneath it;
          pointer events are routed to the destination (editor) so the
          fading-out entry cannot capture taps. */}
      {mountedEditor && (
        <Reanimated.View
          style={[styles.layer, editorStyle]}
          pointerEvents={showEntry ? 'none' : 'auto'}
        >
          {editorElement}
        </Reanimated.View>
      )}
      {mountedEntry && (
        <Reanimated.View
          style={[styles.layer, entryStyle]}
          pointerEvents={showEntry ? 'auto' : 'none'}
        >
          {retainedEntryElement.current}
        </Reanimated.View>
      )}
      {/* Pinned media layer — full-bleed, on top of both surfaces. Holds at
          full opacity while the editor chrome fades in beneath it, then
          fades out. pointerEvents none so it never blocks the editor. */}
      {mountedPinnedUri && (
        <Reanimated.View
          style={[styles.pinnedLayer, pinnedStyle]}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {mountedPinnedKind === 'video' ? (
            <Video
              source={{ uri: mountedPinnedUri }}
              style={styles.pinnedImage}
              resizeMode={ResizeMode.COVER}
              shouldPlay={false}
              isMuted
              useNativeControls={false}
            />
          ) : (
            <Image
              source={{ uri: mountedPinnedUri }}
              style={styles.pinnedImage}
              contentFit="cover"
              cachePolicy="memory"
              recyclingKey={mountedPinnedUri}
              enforceEarlyResizing
            />
          )}
        </Reanimated.View>
      )}
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Each layer is absolutely positioned and fills the container so both
  // surfaces overlap during the crossfade. The destination layer sits on
  // top (rendered last) so it receives touches.
  layer: {
    ...StyleSheet.absoluteFill,
  },
  // The pinned media layer sits above the entry/editor layers so the
  // captured image is the topmost visual during the transition. A solid
  // black background ensures the pinned image reads cleanly over both
  // surfaces (the camera viewfinder may still be partially visible as it
  // fades out; the pinned image must not show the viewfinder bleeding
  // through).
  pinnedLayer: {
    position: 'absolute',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  pinnedImage: {
    ...StyleSheet.absoluteFill,
  },
});
