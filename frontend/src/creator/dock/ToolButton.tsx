import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useReducedMotion } from 'react-native-reanimated';

import { Radius, Typography } from '../../theme/designTokens';
import { useMotionConfig } from '../../hooks/useMotionConfig';
import { useHaptic } from '../../hooks/useHaptic';
import { PressScale } from '../CreatorAnimations';
import { GradientRing } from '../../components/poster/shared/GradientRing';
import { Tooltip } from './Tooltip';
import type { ThemeColors } from '../../theme/ThemeContext';

/**
 * A single contextual tool definition rendered by {@link ToolButton}.
 */
export interface RailTool {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  action: () => void;
  danger?: boolean;
  /** Primary tools get a filled icon background — visual weight */
  primary?: boolean;
}

/**
 * Props for {@link ToolButton}.
 */
export interface ToolButtonProps {
  tool: RailTool;
  isActive: boolean;
  size: number;
  iconSize: number;
  iconColor: string;
  bgColor: string;
  labelColor: string;
  floating: boolean;
  colors: ThemeColors;
  onPress: () => void;
  onLongPressTooltip: (label: string) => void;
}

/**
 * Per-tool animated button with gradient ring + spring tooltip.
 *
 * Extracted from CreatorToolDock so each tool gets its own Reanimated shared
 * values (hooks can't be called inside loops/closures).
 *
 * Uses the shared {@link GradientRing} for the Instagram-style active ring,
 * `useMotionConfig` for all spring configs, `useHaptic` for feedback, and
 * `useReducedMotion` for accessibility.
 */
export const ToolButton = React.memo(function ToolButton({
  tool,
  isActive,
  size,
  iconSize,
  iconColor,
  bgColor,
  labelColor,
  floating,
  colors,
  onPress,
  onLongPressTooltip,
}: ToolButtonProps) {
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const haptic = useHaptic();

  const toolScale = useSharedValue(isActive ? 1.1 : 1);
  const [tooltipVisible, setTooltipVisible] = useState(false);

  // Animate icon scale when active state changes
  useEffect(() => {
    if (reduceMotion) {
      toolScale.value = isActive ? 1.1 : 1;
    } else {
      toolScale.value = withSpring(isActive ? 1.1 : 1, spring.tap);
    }
  }, [isActive, reduceMotion, toolScale, spring]);

  const handleLongPress = useCallback(() => {
    setTooltipVisible(true);
    onLongPressTooltip(tool.label);
  }, [onLongPressTooltip, tool.label]);

  const handleTooltipShow = useCallback(() => {
    haptic.light();
  }, [haptic]);

  const toolIconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: toolScale.value }],
  }));

  // Inactive tools: 0.6 opacity (per spec). Active/danger tools: full opacity.
  const containerOpacity = isActive || tool.danger ? 1 : 0.6;

  return (
    <PressScale
      key={tool.label}
      onPress={() => {
        if (tool.danger) haptic.medium();
        else haptic.selection();
        onPress();
      }}
      onLongPress={handleLongPress}
      style={[styles.toolBtn, { opacity: containerOpacity }]}
      accessibilityLabel={tool.label}
      accessibilityHint={`Opens ${tool.label}`}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      {/* Gradient ring — Instagram-style. Sits behind the icon, animates in/out.
          Uses the shared GradientRing primitive with theme-derived brand gold
          tones instead of hardcoded hex values. */}
      <GradientRing
        isActive={isActive}
        size={size + 6}
        strokeWidth={3}
        borderRadius={(size + 6) / 2}
        style={styles.ringContainer}
      />

      <Reanimated.View
        style={[
          styles.toolIconWrap,
          {
            width: size,
            height: size,
            borderRadius: Radius.full,
            backgroundColor: bgColor,
          },
          toolIconStyle,
        ]}
      >
        <Ionicons
          name={tool.icon}
          size={iconSize}
          color={iconColor}
        />
      </Reanimated.View>

      <Text
        style={[
          styles.toolLabel,
          { color: tool.danger ? colors.danger : labelColor },
          tool.primary && styles.toolLabelPrimary,
        ]}
        numberOfLines={1}
      >
        {tool.label}
      </Text>

      {/* Spring tooltip — appears above the tool on long-press */}
      <Tooltip
        label={tool.label}
        floating={floating}
        colors={colors}
        onShow={handleTooltipShow}
        visible={tooltipVisible}
      />
    </PressScale>
  );
});

const styles = StyleSheet.create({
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 6,
    borderRadius: Radius.full,
    gap: 4,
  },
  toolIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Gradient ring (Instagram-style) ──
  // Sits behind the tool icon, 3pt larger on each side.
  // Animates in/out via GradientRing's spring-driven opacity.
  ringContainer: {
    position: 'absolute',
    top: -3,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolLabel: {
    fontSize: 9,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.1,
    marginTop: 2,
  },
  toolLabelPrimary: {
    fontFamily: Typography.family.semibold,
    fontSize: 9.5,
  },
});

export default ToolButton;
