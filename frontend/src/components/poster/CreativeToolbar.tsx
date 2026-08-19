import React, { useMemo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useReducedMotion,
} from 'react-native-reanimated';
import { Typography, Radius, Space } from '../../theme/designTokens';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { useHaptic } from '../../hooks/useHaptic';
import { useMotionConfig } from '../../hooks/useMotionConfig';

export type CreativeTool = 'text' | 'stickers' | 'draw' | 'filter' | 'preview' | null;

interface CreativeToolbarProps {
  activeTool: CreativeTool;
  onToolSelect: (tool: CreativeTool) => void;
  visible: boolean;
}

// ── Tool definitions with grouping ─────────────────────────────────
// Group 1: Creative (Text, Stickers, Draw) — primary, 44pt
// Group 2: Adjust (Filter) — secondary, 36pt
// Group 3: Manage (Preview) — secondary, 36pt
interface ToolDef {
  key: CreativeTool;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  primary: boolean;
  group: 'creative' | 'adjust' | 'manage';
}

const TOOLS: ToolDef[] = [
  { key: 'text', icon: 'text-outline', label: 'Text', primary: true, group: 'creative' },
  { key: 'stickers', icon: 'happy-outline', label: 'Stickers', primary: true, group: 'creative' },
  { key: 'draw', icon: 'pencil-outline', label: 'Draw', primary: true, group: 'creative' },
  { key: 'filter', icon: 'color-filter-outline', label: 'Filter', primary: false, group: 'adjust' },
  { key: 'preview', icon: 'eye-outline', label: 'Preview', primary: false, group: 'manage' },
];

// ── ToolButton — per-tool animated button with spring scale on active ──
interface ToolButtonProps {
  tool: ToolDef;
  isActive: boolean;
  onPress: () => void;
}

const ToolButton = React.memo(function ToolButton({ tool, isActive, onPress }: ToolButtonProps) {
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const scaleSV = useSharedValue(isActive ? 1.08 : 1);
  const haptic = useHaptic();

  React.useEffect(() => {
    if (reduceMotion) {
      scaleSV.value = isActive ? 1.08 : 1;
    } else {
      scaleSV.value = withSpring(isActive ? 1.08 : 1, spring.tap);
    }
  }, [isActive, reduceMotion, scaleSV, spring]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleSV.value }],
  }));

  const size = tool.primary ? 44 : 36;
  const iconSize = tool.primary ? 22 : 18;

  return (
    <AnimatedPressable
      style={[styles.toolBtn, { minWidth: size + 12, minHeight: size + 12 }]}
      onPress={() => {
        haptic.selection();
        onPress();
      }}
      scaleValue={0.92}
      activeOpacity={0.85}
      hapticFeedback="selection"
      accessibilityLabel={`${tool.label} tool${isActive ? ', active' : ''}`}
      accessibilityHint={`Toggles the ${tool.label.toLowerCase()} creative tool`}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
    >
      <Reanimated.View style={[styles.toolIconWrap, animStyle]}>
        {isActive ? (
          // Active: simple brand-tinted background (no gradient chrome)
          <View
            style={[
              styles.toolIconBg,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: colors.brandSubtle,
              },
            ]}
          >
            <Ionicons name={tool.icon} size={iconSize} color={colors.brand} />
          </View>
        ) : (
          // Inactive: transparent with subtle border
          <View
            style={[
              styles.toolIconBg,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.18)',
                backgroundColor: 'transparent',
              },
            ]}
          >
            <Ionicons name={tool.icon} size={iconSize} color="rgba(255,255,255,0.9)" />
          </View>
        )}
      </Reanimated.View>
      <Text style={[styles.toolLabel, isActive && styles.toolLabelActive, !tool.primary && styles.toolLabelSecondary]}>
        {tool.label}
      </Text>
    </AnimatedPressable>
  );
});

export default function CreativeToolbar({ activeTool, onToolSelect, visible }: CreativeToolbarProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  if (!visible) return null;

  // Group tools for rendering with dividers
  const groups = useMemo(() => {
    const groupOrder: ('creative' | 'adjust' | 'manage')[] = ['creative', 'adjust', 'manage'];
    return groupOrder
      .map((groupKey) => TOOLS.filter((t) => t.group === groupKey))
      .filter((group) => group.length > 0);
  }, []);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.toolbar}>
        {groups.map((group, groupIndex) => (
          <React.Fragment key={groupIndex}>
            {group.map((tool) => (
              <ToolButton
                key={tool.key}
                tool={tool}
                isActive={activeTool === tool.key}
                onPress={() => onToolSelect(activeTool === tool.key ? null : tool.key)}
              />
            ))}
            {/* Hairline divider between groups (not after the last group) */}
            {groupIndex < groups.length - 1 && (
              <View style={styles.groupDivider} />
            )}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Space.lg,
    paddingHorizontal: 12,
    zIndex: 15,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.overlay,
    borderRadius: Radius.xxl,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignSelf: 'center',
  },
  toolBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: Space.xs,
    borderRadius: Radius.lg,
  },
  toolIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolIconBg: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Hairline divider between tool groups
  groupDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  toolLabel: {
    fontSize: 10,
    fontFamily: Typography.family.semibold,
    color: 'rgba(255,255,255,0.75)',
  },
  toolLabelActive: {
    color: colors.brand,
    fontFamily: Typography.family.bold,
  },
  toolLabelSecondary: {
    fontSize: 9,
    fontFamily: Typography.family.medium,
  },
  });
}
