import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';

import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useHaptics } from '../../platform/haptics';
import { REDUCED_SPRING } from '../../theme/motionTokens';
import { Radius, Space, Type, Typography, Elevation } from '../../theme/designTokens';

const ReanimatedView = Reanimated.View;

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 32;
const TRACK_RADIUS = 16;
const THUMB_SIZE = 28;
const THUMB_INSET = 2;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_INSET * 2;

export interface AppSwitchProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  testID?: string;
}

/**
 * AppSwitch — the canonical toggle switch for ThryftVerse.
 *
 * A 52×32pt pill track with a 28pt thumb that travels on a Reanimated
 * spring. The track colour cross-fades between `Colors.border` (off) and
 * `Colors.brand` (on); the thumb stays white for clear state contrast in
 * both themes. A light impact haptic fires on every toggle, gated by
 * reduced-motion and the haptics rate limiter.
 *
 * Fully accessible: `accessibilityRole="switch"` with a checked state, and
 * the optional label is exposed as the accessibility label so screen
 * readers announce the control's purpose before its state.
 */
export function AppSwitch({
  value,
  onValueChange,
  disabled = false,
  label,
  testID,
}: AppSwitchProps) {
  const { colors } = useAppTheme();
  const { spring } = useMotionConfig();
  const haptics = useHaptics();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const progress = useSharedValue(value ? 1 : 0);

  React.useEffect(() => {
    progress.value = withSpring(
      value ? 1 : 0,
      disabled ? REDUCED_SPRING : spring.press,
    );
  }, [value, disabled, spring.press, progress]);

  const translateX = useDerivedValue(() => progress.value * THUMB_TRAVEL);

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.border, colors.brand],
    ),
  }));

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const handlePress = React.useCallback(() => {
    if (disabled) return;
    haptics.impact('light');
    onValueChange(!value);
  }, [disabled, haptics, onValueChange, value]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      accessibilityHint={value ? 'Double tap to turn off' : 'Double tap to turn on'}
      style={[styles.row, disabled && styles.disabled]}
    >
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.trackHost}>
        <ReanimatedView style={[styles.track, trackStyle]}>
          <ReanimatedView style={[styles.thumb, thumbStyle]} />
        </ReanimatedView>
      </View>
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
    },
    disabled: {
      opacity: 0.5,
    },
    label: {
      flex: 1,
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      color: colors.textPrimary,
      letterSpacing: Type.body.letterSpacing,
      lineHeight: Type.body.lineHeight,
      marginRight: Space.sm,
    },
    trackHost: {
      padding: Space.xxs,
    },
    track: {
      width: TRACK_WIDTH,
      height: TRACK_HEIGHT,
      borderRadius: TRACK_RADIUS,
      justifyContent: 'center',
      paddingHorizontal: THUMB_INSET,
    },
    thumb: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: THUMB_SIZE / 2,
      backgroundColor: colors.scrimTextPrimary,
      ...Elevation.modal,
    },
  });
}
