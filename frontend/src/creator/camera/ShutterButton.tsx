import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Reanimated, {
  SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { Radius } from '../../theme/designTokens';
import { useAppTheme } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { RecordingRing } from './RecordingRing';

const SHUTTER_SIZE = 80;
const SHUTTER_INNER = 64;

export type CameraMode = 'photo' | 'video' | 'boomerang';

export interface ShutterButtonProps {
  /** Called when the user presses the shutter. The press spring animation
   *  runs automatically before this callback fires. */
  onPress: () => void;
  /** Whether a recording is currently in progress (changes inner shape). */
  isRecording: boolean;
  /** Current camera mode — determines whether the recording ring is shown. */
  cameraMode: CameraMode;
  /** Disables the shutter (e.g. during countdown). */
  disabled?: boolean;
  /** Recording progress 0→1 — drives the ring stroke. */
  recordingProgress: SharedValue<number>;
  /** Optional ring scale spring (pulse on recording start). */
  recordingRingScale: SharedValue<number>;
}

/**
 * Large 80pt shutter button with press-spring animation.
 *
 * On press, the outer ring springs down to 0.92× (snappy) then back to 1×
 * (smooth). In video/boomerang mode a `RecordingRing` wraps the button and
 * fills over the recording duration.
 *
 * All spring configs come from `useMotionConfig`. Respects reduced-motion.
 */
export function ShutterButton({
  onPress,
  isRecording,
  cameraMode,
  disabled,
  recordingProgress,
  recordingRingScale,
}: ShutterButtonProps) {
  const { spring } = useMotionConfig();
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const shutterScale = useSharedValue(1);

  const shutterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterScale.value }],
  }));

  const handlePress = React.useCallback(() => {
    // Snappy down, smooth back up
    if (!reducedMotion) {
      shutterScale.value = withSpring(0.92, spring.tap);
      shutterScale.value = withSpring(1, spring.entrance);
    }
    onPress();
  }, [reducedMotion, shutterScale, spring, onPress]);

  const showRing = cameraMode === 'video' || cameraMode === 'boomerang';

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={24}
      accessibilityLabel={
        cameraMode === 'video'
          ? isRecording
            ? 'Stop recording'
            : 'Start recording'
          : 'Take photo'
      }
      accessibilityRole="button"
      disabled={disabled}
    >
      <Reanimated.View style={[styles.outer, shutterStyle]}>
        {showRing && (
          <RecordingRing progress={recordingProgress} scale={recordingRingScale} />
        )}
        <View
          style={[
            styles.inner,
            isRecording && styles.innerRecording,
            isRecording && { backgroundColor: colors.danger },
          ]}
        />
      </Reanimated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Camera overlay — always high contrast on dark preview. The shutter ring
  // + inner fill are white on the dark camera preview in both themes; the
  // theme has no `textOnMedia` token, so literal white is retained here.
  outer: {
    width: SHUTTER_SIZE,
    height: SHUTTER_SIZE,
    borderRadius: SHUTTER_SIZE / 2,
    borderWidth: 5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  inner: {
    width: SHUTTER_INNER,
    height: SHUTTER_INNER,
    borderRadius: SHUTTER_INNER / 2,
    backgroundColor: '#fff',
  },
  innerRecording: {
    width: SHUTTER_INNER * 0.6,
    height: SHUTTER_INNER * 0.6,
    borderRadius: Radius.sm,
    // backgroundColor applied inline via colors.danger (theme token)
  },
});
