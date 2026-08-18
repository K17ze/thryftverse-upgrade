import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { useReducedMotion } from '../hooks/useReducedMotion';

// ── Camera → Editor crossfade ────────────────────────────────────────────
// Per the human-flow reconstruction spec: "The selected/captured media
// should appear to stay in place while editor chrome appears around it.
// Avoid decorative hero transitions, spinner pages or black/white flashes."
//
// This wrapper mounts both the camera (entry) and the editor simultaneously
// during a 200ms crossfade so the media appears to stay in place while the
// editor chrome fades in around it. No black/white flash, no spinner.
//
// Both composers (LookComposerScreen, PosterComposerScreen) render the
// camera as a CreatorEntryScreen and swap to the editor when media is
// selected. Previously this was an abrupt conditional return. This wrapper
// makes the swap a smooth crossfade while keeping the rest of the composer
// logic untouched.
//
// Reduced motion: the swap is instant (no fade), matching the OS preference.
//
// The destination layer receives pointer events during the transition so the
// user cannot interact with the fading-out layer.

const TRANSITION_MS = 200;

export interface CreatorEntryEditorCrossfadeProps {
  /** When true, the entry (camera) is the active surface. When it flips to
   *  false, the editor crossfades in while the entry crossfades out. */
  showEntry: boolean;
  /** The camera / entry screen element. */
  entryElement: React.ReactNode;
  /** The editor element. */
  editorElement: React.ReactNode;
}

export function CreatorEntryEditorCrossfade({
  showEntry,
  entryElement,
  editorElement,
}: CreatorEntryEditorCrossfadeProps) {
  const reducedMotion = useReducedMotion();

  // Mount state — each surface stays mounted while it is either the active
  // surface or mid-transition. This avoids remounting the editor (which
  // would reset its internal state) on every entry↔editor swap.
  const [mountedEditor, setMountedEditor] = useState(!showEntry);
  const [mountedEntry, setMountedEntry] = useState(showEntry);

  const entryOpacity = useSharedValue(showEntry ? 1 : 0);
  const editorOpacity = useSharedValue(showEntry ? 0 : 1);

  const prevShowEntry = useRef(showEntry);

  useEffect(() => {
    if (prevShowEntry.current === showEntry) return;
    const goingToEditor = !showEntry;
    prevShowEntry.current = showEntry;

    if (goingToEditor) {
      // Entry → Editor: mount editor, crossfade entry out / editor in.
      setMountedEditor(true);
      if (reducedMotion) {
        entryOpacity.value = 0;
        editorOpacity.value = 1;
        setMountedEntry(false);
      } else {
        editorOpacity.value = withTiming(1, {
          duration: TRANSITION_MS,
          easing: Easing.inOut(Easing.ease),
        });
        entryOpacity.value = withTiming(
          0,
          { duration: TRANSITION_MS, easing: Easing.inOut(Easing.ease) },
          (finished) => {
            if (finished) runOnJS(setMountedEntry)(false);
          },
        );
      }
    } else {
      // Editor → Entry (e.g. user cleared the document): crossfade back.
      setMountedEntry(true);
      if (reducedMotion) {
        editorOpacity.value = 0;
        entryOpacity.value = 1;
        setMountedEditor(false);
      } else {
        entryOpacity.value = withTiming(1, {
          duration: TRANSITION_MS,
          easing: Easing.inOut(Easing.ease),
        });
        editorOpacity.value = withTiming(
          0,
          { duration: TRANSITION_MS, easing: Easing.inOut(Easing.ease) },
          (finished) => {
            if (finished) runOnJS(setMountedEditor)(false);
          },
        );
      }
    }
  }, [showEntry, reducedMotion, entryOpacity, editorOpacity]);

  const entryStyle = useAnimatedStyle(() => ({
    opacity: entryOpacity.value,
  }));
  const editorStyle = useAnimatedStyle(() => ({
    opacity: editorOpacity.value,
  }));

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
          {entryElement}
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
});
