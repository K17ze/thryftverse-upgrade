import React from 'react';
import { Pressable, StyleSheet, View, Text } from 'react-native';
import Reanimated, {
  SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Radius, Typography, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useAppTheme } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { RecordingRing } from './RecordingRing';

// 2026 Apple HIG: the capture button is the hero control. 78pt outer with
// a 5pt brand-color ring and 60pt inner fill — large enough to dominate
// the bottom bar, small enough to leave the viewfinder unobstructed.
const SHUTTER_SIZE = 78;
const SHUTTER_INNER = 60;
const SHUTTER_RING_WIDTH = 4;

export interface ShutterButtonProps {
  /** Called when the user presses the shutter. The press spring animation
   *  runs automatically before this callback fires. */
  onPress: () => void;
  /** Called when the user long-presses the shutter (start video recording). */
  onLongPress?: () => void;
  /** Called when the user releases the shutter (stop video recording). */
  onPressOut?: () => void;
  /** Whether a recording is currently in progress (changes inner shape). */
  isRecording: boolean;
  /** Disables the shutter (e.g. during countdown). */
  disabled?: boolean;
  /** Recording progress 0→1 — drives the ring stroke. */
  recordingProgress: SharedValue<number>;
  /** Optional ring scale spring (pulse on recording start). */
  recordingRingScale: SharedValue<number>;
  /** Hands-free mode — changes the shutter visual to indicate tap-to-start. */
  handsFreeMode?: boolean;
  /** Current speed mode label (e.g. '1', '0.3', '2', '3') for the ring indicator. */
  speedMode?: string;
  /** Exposes hold-for-video only when the native camera mode, microphone
   *  permission and downstream composition contract are all available. */
  videoCaptureEnabled?: boolean;
}

/**
 * Large 80pt shutter button with press-spring animation.
 *
 * On press, the outer ring springs down to 0.92× (snappy) then back to 1×
 * (smooth). When recording, a `RecordingRing` wraps the button and fills
 * over the recording duration. Tap = photo, press-and-hold = video.
 *
 * All spring configs come from `useMotionConfig`. Respects reduced-motion.
 */
export function ShutterButton({
  onPress,
  onLongPress,
  onPressOut,
  isRecording,
  disabled,
  recordingProgress,
  recordingRingScale,
  handsFreeMode,
  speedMode,
  videoCaptureEnabled = true,
}: ShutterButtonProps) {
  const { spring } = useMotionConfig();
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const shutterScale = useSharedValue(1);

  const shutterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterScale.value }],
  }));

  const handlePressIn = React.useCallback(() => {
    if (!reducedMotion) {
      shutterScale.value = withSpring(0.92, spring.tap);
    }
  }, [reducedMotion, shutterScale, spring]);

  const handlePress = React.useCallback(() => {
    if (!reducedMotion) {
      shutterScale.value = withSpring(1, spring.entrance);
    }
    onPress();
  }, [reducedMotion, shutterScale, spring, onPress]);

  const showRing = isRecording;
  const showSpeedIndicator = speedMode && speedMode !== '1';

  const accessibilityLabel = isRecording
    ? 'Stop recording'
    : handsFreeMode
      ? 'Start hands-free capture with 3 second countdown'
      : videoCaptureEnabled
        ? 'Take photo or hold for video'
        : 'Take photo';

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onLongPress={videoCaptureEnabled && !handsFreeMode ? onLongPress : undefined}
      onPressOut={videoCaptureEnabled ? onPressOut : undefined}
      delayLongPress={250}
      hitSlop={24}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
    >
      <Reanimated.View
        style={[
          styles.outer,
          { borderColor: handsFreeMode && !isRecording ? colors.brand : colors.brand },
          shutterStyle,
        ]}
      >
        {showRing && (
          <RecordingRing
            progress={recordingProgress}
            scale={recordingRingScale}
          />
        )}
        <View
          style={[
            styles.inner,
            { backgroundColor: colors.scrimTextPrimary },
            isRecording && styles.innerRecording,
            isRecording && { backgroundColor: colors.danger },
            handsFreeMode && !isRecording && { backgroundColor: colors.brand },
          ]}
        />
        {/* Speed indicator badge — shows the current speed multiplier
            on the shutter when a non-1× speed is selected */}
        {showSpeedIndicator && !isRecording && (
          <View style={[styles.speedBadge, { backgroundColor: colors.mediaOverlayScrim }]}>
            <Text style={[styles.speedBadgeText, { color: colors.scrimTextPrimary }]}>{speedMode}×</Text>
          </View>
        )}
      </Reanimated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Camera overlay — shutter ring + inner fill use scrim text tokens for
  // high contrast on the dark camera preview in both themes.
  // Outer ring — brand color border (applied inline via colors.brand).
  outer: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: SHUTTER_RING_WIDTH,
    // borderColor applied inline via colors.brand (theme token)
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  inner: {
    width: SHUTTER_INNER,
    height: SHUTTER_INNER,
    borderRadius: SHUTTER_INNER / 2,
    // backgroundColor applied inline via colors.scrimTextPrimary (theme token)
  },
  innerRecording: {
    width: SHUTTER_INNER * 0.6,
    height: SHUTTER_INNER * 0.6,
    borderRadius: Radius.sm,
    // backgroundColor applied inline via colors.danger (theme token)
  },
  // Speed badge — small pill on the shutter showing the speed multiplier
  speedBadge: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
    paddingHorizontal: Space.xs,
    paddingVertical: Space.xxs,
    borderRadius: Radius.full,
    // backgroundColor applied inline via colors.mediaOverlayScrim (theme token)
  },
  speedBadgeText: {
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.meta.size,
    // color applied inline via colors.scrimTextPrimary (theme token)
  },
});
