import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { EditorRadius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { useHaptic } from '../../hooks/useHaptic';
import { PressScale } from '../CreatorAnimations';
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
  /** Visual weight — primary tools get a filled backplate, secondary tools are transparent. */
  weight?: 'primary' | 'secondary';
}

/**
 * Props for {@link ToolButton}.
 */
export interface ToolButtonProps {
  tool: RailTool;
  size: number;
  iconSize: number;
  iconColor: string;
  bgColor: string;
  labelColor: string;
  floating: boolean;
  colors: ThemeColors;
  onPress: () => void;
}

/**
 * Per-tool button with long-press tooltip.
 *
 * Extracted from CreatorToolDock so each tool gets its own Reanimated shared
 * values (hooks can't be called inside loops/closures).
 *
 * Uses one radius grammar (EditorRadius.plate) and one press feedback
 * (PressScale) across all tool buttons. The parent (CreatorToolDock) is the
 * source of truth for bgColor/iconColor — ToolButton does not override them
 * based on its own weight.
 */
export const ToolButton = React.memo(function ToolButton({
  tool,
  size,
  iconSize,
  iconColor,
  bgColor,
  labelColor,
  floating,
  colors,
  onPress,
}: ToolButtonProps) {
  const haptic = useHaptic();
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const handleLongPress = useCallback(() => {
    setTooltipVisible(true);
  }, []);

  return (
    <PressScale
      key={tool.label}
      onPress={() => {
        // Haptic fires on committed release, not on press-start.
        if (tool.danger) haptic.medium();
        else haptic.selection();
        onPress();
      }}
      onLongPress={handleLongPress}
      style={styles.toolBtn}
      accessibilityLabel={tool.label}
      accessibilityHint={`Opens ${tool.label}`}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <View
        style={[
          styles.toolIconWrap,
          {
            width: size,
            height: size,
            borderRadius: EditorRadius.plate,
            backgroundColor: bgColor,
          },
        ]}
      >
        <Ionicons
          name={tool.icon}
          size={iconSize}
          color={iconColor}
        />
      </View>

      <Text
        style={[
          styles.toolLabel,
          { color: tool.danger ? colors.danger : labelColor },
        ]}
        numberOfLines={1}
      >
        {tool.label}
      </Text>

      <Tooltip
        label={tool.label}
        floating={floating}
        colors={colors}
        onShow={() => {}}
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
    borderRadius: EditorRadius.plate,
    gap: 6,
  },
  toolIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: 2,
  },
});

export default ToolButton;
