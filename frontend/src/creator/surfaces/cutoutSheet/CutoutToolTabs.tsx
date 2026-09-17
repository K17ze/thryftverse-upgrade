/**
 * CutoutToolTabs — the trace-toolbar tab row of CreatorCutoutSheet:
 * text-only Trace/Erase tabs with the spring-animated underline
 * indicator. Extracted verbatim from CreatorCutoutSheet.tsx.
 */
import React from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { type SharedValue, type AnimatedStyle } from 'react-native-reanimated';
import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import type { Tool } from './cutoutSheetShared';
import { styles } from './cutoutSheetStyles';

interface CutoutToolTabsProps {
  tool: Tool;
  colors: ThemeColors;
  toolTabLayouts: React.MutableRefObject<Map<Tool, { x: number; width: number }>>;
  toolUnderlineXSV: SharedValue<number>;
  toolUnderlineWSV: SharedValue<number>;
  toolUnderlineStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  onToolSwitch: (tool: Tool) => void;
}

export function CutoutToolTabs({
  tool,
  colors,
  toolTabLayouts,
  toolUnderlineXSV,
  toolUnderlineWSV,
  toolUnderlineStyle,
  onToolSwitch }: CutoutToolTabsProps) {
  return (
    /* Tool selector — text-only tabs with spring underline */
    <View style={styles.toolSelectorRow}>
      <PressScale
        onPress={() => onToolSwitch('scissors')}
        onLayout={(e) => {
          toolTabLayouts.current.set('scissors', {
            x: e.nativeEvent.layout.x,
            width: e.nativeEvent.layout.width });
          if (tool === 'scissors') {
            toolUnderlineXSV.value = e.nativeEvent.layout.x;
            toolUnderlineWSV.value = e.nativeEvent.layout.width;
          }
        }}
        style={styles.toolSelectorBtn}
        accessibilityLabel="Scissors tool"
        accessibilityHint="Switches to the trace tool"
        accessibilityRole="button"
        accessibilityState={{ selected: tool === 'scissors' }}
      >
        <Ionicons
          name="cut-outline"
          size={IconGrammar.standard}
          color={tool === 'scissors' ? colors.brand : colors.textSecondary}
        />
        <Text style={[styles.toolSelectorLabel, { color: tool === 'scissors' ? colors.brand : colors.textSecondary }]}>
          Trace
        </Text>
      </PressScale>
      <PressScale
        onPress={() => onToolSwitch('eraser')}
        onLayout={(e) => {
          toolTabLayouts.current.set('eraser', {
            x: e.nativeEvent.layout.x,
            width: e.nativeEvent.layout.width });
          if (tool === 'eraser') {
            toolUnderlineXSV.value = e.nativeEvent.layout.x;
            toolUnderlineWSV.value = e.nativeEvent.layout.width;
          }
        }}
        style={styles.toolSelectorBtn}
        accessibilityLabel="Eraser tool"
        accessibilityHint="Switches to the eraser tool"
        accessibilityRole="button"
        accessibilityState={{ selected: tool === 'eraser' }}
      >
        <Ionicons
          name="brush-outline"
          size={IconGrammar.standard}
          color={tool === 'eraser' ? colors.brand : colors.textSecondary}
        />
        <Text style={[styles.toolSelectorLabel, { color: tool === 'eraser' ? colors.brand : colors.textSecondary }]}>
          Erase
        </Text>
      </PressScale>
      {/* Spring-animated underline indicator (brand color, 2pt) */}
      <Reanimated.View
        style={[styles.toolUnderline, toolUnderlineStyle, { backgroundColor: colors.brand }]}
        pointerEvents="none"
      />
    </View>
  );
}
