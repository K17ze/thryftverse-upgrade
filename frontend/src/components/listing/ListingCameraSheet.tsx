import React, { useCallback } from 'react';
import { Modal, StyleSheet, StatusBar } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import CreatorCamera from '../../creator/CreatorCamera';
import { useAppTheme } from '../../theme/ThemeContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { Motion } from '../../theme/motionTokens';
import type { CreatorInitialMedia } from '../../navigation/types';

// ── ListingCameraSheet ────────────────────────────────────────────────
// Full-screen modal that bridges the flagship CreatorCamera (vision-camera
// viewfinder with tap-to-focus, multi-capture, effects, grid, timer) into
// the listing authoring flows. Replaces the system camera (ImagePicker
// .launchCameraAsync) which offered none of those affordances.
//
// The sheet opens the camera in poster mode with multi-capture enabled by
// default — every shutter tap accumulates into the staging tray (Snapchat
// Multi Snap pattern). The user finishes via the Done button inside
// CreatorCamera, which fires onCaptureBatch. We forward the photo URIs to
// the caller and close the sheet.
//
// Permissions are handled inside CreatorCamera via its PermissionState
// empty states (art-directed enable / Settings deep-link / gallery
// fallback), so this component stays thin.

export interface ListingCameraSheetProps {
  /** Whether the full-screen camera sheet is visible. */
  visible: boolean;
  /** Called when the user closes the camera without finishing a batch. */
  onClose: () => void;
  /** Called with the captured photo URIs when the user finishes a batch. */
  onCapture: (uris: string[]) => void;
  /** Maximum photos the caller can accept. Used only to short-circuit;
   *  CreatorCamera's staging tray does not enforce an external cap. */
  maxPhotos?: number;
}

export function ListingCameraSheet({
  visible,
  onClose,
  onCapture,
}: ListingCameraSheetProps) {
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  // Fade/slide the camera in on open. Reduced motion collapses to instant.
  const sheetOpacity = useSharedValue(0);
  const sheetTranslate = useSharedValue(1);

  const handleEnter = useCallback(() => {
    if (reducedMotion) {
      sheetOpacity.value = 1;
      sheetTranslate.value = 0;
      return;
    }
    sheetOpacity.value = withTiming(1, {
      duration: Motion.duration.slow,
      easing: Easing.out(Easing.cubic),
    });
    sheetTranslate.value = withTiming(0, {
      duration: Motion.duration.slow,
      easing: Easing.out(Easing.cubic),
    });
  }, [reducedMotion, sheetOpacity, sheetTranslate]);

  const handleExit = useCallback(() => {
    if (reducedMotion) {
      sheetOpacity.value = 0;
      sheetTranslate.value = 1;
      return;
    }
    sheetOpacity.value = withTiming(0, { duration: Motion.duration.normal });
    sheetTranslate.value = withTiming(1, { duration: Motion.duration.normal });
  }, [reducedMotion, sheetOpacity, sheetTranslate]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: sheetOpacity.value,
    transform: [{ translateY: sheetTranslate.value * 40 }],
  }));

  // ── Camera → listing media ──
  // CreatorCamera sends a typed batch (CreatorInitialMedia[]). We extract
  // the URIs — listing flows handle dimensions/MIME downstream via
  // convertCaptureUri. Only image captures are forwarded; video captures
  // from a listing photo session are dropped (listing media supports video
  // but the camera-first flow is photo-oriented).
  const handleCaptureBatch = useCallback(
    (captures: CreatorInitialMedia[]) => {
      if (captures.length === 0) return;
      const uris = captures
        .filter((c) => c.kind === 'image')
        .map((c) => c.uri);
      if (uris.length === 0) return;
      handleExit();
      onCapture(uris);
    },
    [onCapture, handleExit],
  );

  // ── Gallery fallback ──
  // CreatorCamera requires an onGallery handler. For listing flows the
  // gallery picker lives on the host screen, so we close the sheet — the
  // user returns to the form and can tap "Choose from gallery".
  const handleGallery = useCallback(() => {
    handleExit();
    onClose();
  }, [onClose, handleExit]);

  const handleClose = useCallback(() => {
    handleExit();
    onClose();
  }, [onClose, handleExit]);

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={false}
      onRequestClose={handleClose}
      onShow={handleEnter}
      statusBarTranslucent
    >
      <StatusBar hidden />
      <Reanimated.View style={[styles.fill, { backgroundColor: colors.background }, animatedStyle]}>
        <CreatorCamera
          mode="poster"
          onCapture={(uri) => {
            // Single-capture legacy path — forward as a one-element batch.
            handleExit();
            onCapture([uri]);
          }}
          onCaptureBatch={handleCaptureBatch}
          onGallery={handleGallery}
          onClose={handleClose}
        />
      </Reanimated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
