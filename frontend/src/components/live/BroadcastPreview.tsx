/**
 * BroadcastPreview — the seller's real camera preview.
 *
 * Uses react-native-vision-camera (already a dependency, used by
 * VisualSearchCamera / CreatorCamera) to render the actual device camera.
 * Nothing here pretends to broadcast — this is a local framing preview.
 * Publishing video to the LiveKit room requires the shared streaming layer
 * to expose publish controls (see useLiveKitRoom) — a known gap.
 *
 * States (AGENTS §14):
 *  - permission not yet granted → quiet panel with an "Allow camera" action
 *  - permission denied / no device / web → quiet panel, stream setup still
 *    works (lots, chat, bids do not depend on the camera)
 *  - granted + device → real camera feed
 */

import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius, Space, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';

interface BroadcastPreviewProps {
  /** Whether the camera session should be active (mount/unmount screens). */
  active: boolean;
  /** Camera direction — 'back' shows the items being sold. */
  facing?: 'front' | 'back';
  /** Fixed height; defaults to a 4:3 stage. */
  height?: number;
  /** Accessibility label for the preview surface. */
  accessibilityLabel?: string;
}

export function BroadcastPreview({
  active,
  facing = 'back',
  height,
  accessibilityLabel = 'Camera preview',
}: BroadcastPreviewProps) {
  const { colors } = useAppTheme();
  const device = useCameraDevice(facing);
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'speed' });
  const { hasPermission, requestPermission } = useCameraPermission();
  const [requesting, setRequesting] = React.useState(false);

  const handleRequest = React.useCallback(() => {
    setRequesting(true);
    requestPermission()
      .catch(() => {})
      .finally(() => setRequesting(false));
  }, [requestPermission]);

  const stage = (
    <View
      style={[
        styles.stage,
        { backgroundColor: colors.surfaceAlt },
        height != null && { height },
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
    >
      <AppIcon name="videocam" size={IconSize.xl} color="textMuted" accessible={false} />
      {hasPermission === false ? (
        <>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Camera access needed for preview
          </Text>
          <AnimatedPressable
            onPress={handleRequest}
            disabled={requesting}
            hapticFeedback="light"
            scaleValue={0.97}
            style={styles.allowBtn}
            accessibilityRole="button"
            accessibilityLabel="Allow camera access"
            accessibilityState={{ busy: requesting }}
          >
            <Text style={[styles.allowText, { color: colors.textPrimary }]}>Allow camera</Text>
          </AnimatedPressable>
        </>
      ) : (
        <Text style={[styles.hint, { color: colors.textMuted }]}>No camera on this device</Text>
      )}
    </View>
  );

  if (Platform.OS === 'web' || !device || hasPermission !== true) {
    return stage;
  }

  return (
    <View
      style={[
        styles.stage,
        { backgroundColor: colors.surfaceAlt },
        height != null && { height },
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
    >
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={active}
        outputs={[photoOutput]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: '100%',
    aspectRatio: 3 / 4,
    maxHeight: 320,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  hint: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  allowBtn: {
    marginTop: Space.xs,
    minHeight: Control.hit,
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
  },
  allowText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
});
