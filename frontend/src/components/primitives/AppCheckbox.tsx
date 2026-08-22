import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useHaptics } from '../../platform/haptics';
import { REDUCED_SPRING } from '../../theme/motionTokens';
import { Radius, Space, Type, Typography } from '../../theme/designTokens';

const ReanimatedView = Reanimated.View;

const BOX_SIZE = 24;
const BOX_RADIUS = 6;
const BORDER_WIDTH = 1.5;
const CHECK_COLOR = '#FFFFFF';
const CHECK_PATH = 'M5 12.5 L10 17.5 L19 7';

export interface AppCheckboxProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  testID?: string;
}

/**
 * AppCheckbox — the canonical checkbox for ThryftVerse.
 *
 * A 24×24pt box with a 6pt radius and a 1.5pt border. When checked, the
 * fill cross-fades to `Colors.brand` and an SVG check mark springs in from
 * scale 0. A selection haptic fires on every toggle, gated by reduced-motion
 * and the haptics rate limiter.
 *
 * Fully accessible: `accessibilityRole="checkbox"` with a checked state, and
 * the optional label is exposed as the accessibility label.
 */
export function AppCheckbox({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  testID,
}: AppCheckboxProps) {
  const { colors } = useAppTheme();
  const { spring } = useMotionConfig();
  const haptics = useHaptics();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const progress = useSharedValue(checked ? 1 : 0);

  React.useEffect(() => {
    progress.value = withSpring(
      checked ? 1 : 0,
      disabled ? REDUCED_SPRING : spring.press,
    );
  }, [checked, disabled, spring.press, progress]);

  const checkScale = useDerivedValue(() => progress.value);

  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['transparent', colors.brand],
    ),
    borderColor: interpolateColor(
      progress.value,
      [0, 1],
      [colors.border, colors.brand],
    ),
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  const handlePress = React.useCallback(() => {
    if (disabled) return;
    haptics.selection();
    onCheckedChange(!checked);
  }, [disabled, haptics, onCheckedChange, checked]);

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      accessibilityHint={checked ? 'Double tap to uncheck' : 'Double tap to check'}
      style={[styles.row, disabled && styles.disabled]}
    >
      <ReanimatedView style={[styles.box, boxStyle]}>
        <ReanimatedView style={[styles.checkHost, checkStyle]}>
          <Svg width={BOX_SIZE} height={BOX_SIZE} viewBox="0 0 24 24">
            <Path
              d={CHECK_PATH}
              stroke={CHECK_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </ReanimatedView>
      </ReanimatedView>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
    },
    disabled: {
      opacity: 0.5,
    },
    box: {
      width: BOX_SIZE,
      height: BOX_SIZE,
      borderRadius: BOX_RADIUS,
      borderWidth: BORDER_WIDTH,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: Space.sm,
    },
    checkHost: {
      width: BOX_SIZE,
      height: BOX_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      flex: 1,
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
      color: colors.textPrimary,
      letterSpacing: Type.body.letterSpacing,
      lineHeight: Type.body.lineHeight,
    },
  });
}
