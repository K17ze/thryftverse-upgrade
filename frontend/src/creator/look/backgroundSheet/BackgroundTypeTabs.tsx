/**
 * BackgroundTypeTabs — the type-tab row of BackgroundSheet: text-only
 * Solid/Gradient/Image/Blurred tabs with the spring-animated underline
 * indicator. Extracted verbatim from BackgroundSheet.tsx.
 */
import React from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { type SharedValue, type AnimatedStyle } from 'react-native-reanimated';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { PressScale } from '../../shared/CreatorAnimations';
import type { CreatorBackground } from '../../core/projectStore/composition';
import { TYPE_CHIPS, type BgType } from './backgroundSheetShared';
import type { createStyles } from './backgroundSheetStyles';

interface BackgroundTypeTabsProps {
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
  activeType: CreatorBackground['type'];
  typeTabLayouts: React.MutableRefObject<Map<BgType, { x: number; width: number }>>;
  typeUnderlineXSV: SharedValue<number>;
  typeUnderlineWSV: SharedValue<number>;
  typeUnderlineStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  onTypeSelect: (type: BgType) => void;
}

export function BackgroundTypeTabs({
  styles,
  colors,
  activeType,
  typeTabLayouts,
  typeUnderlineXSV,
  typeUnderlineWSV,
  typeUnderlineStyle,
  onTypeSelect }: BackgroundTypeTabsProps) {
  return (
    /* Type tabs — text-only with spring-animated underline */
    <View style={styles.typeTabRow}>
      {TYPE_CHIPS.map((chip) => {
        const isActive = activeType === chip.id;
        return (
          <PressScale
            key={chip.id}
            onPress={() => onTypeSelect(chip.id)}
            onLayout={(e) => {
              typeTabLayouts.current.set(chip.id, {
                x: e.nativeEvent.layout.x,
                width: e.nativeEvent.layout.width });
              if (activeType === chip.id) {
                typeUnderlineXSV.value = e.nativeEvent.layout.x;
                typeUnderlineWSV.value = e.nativeEvent.layout.width;
              }
            }}
            style={styles.typeTab}
            accessibilityLabel={`${chip.label} background type${isActive ? ', selected' : ''}`}
            accessibilityHint="Switches the background type"
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={[
                styles.typeTabLabel,
                { color: isActive ? colors.brand : colors.textSecondary },
              ]}
            >
              {chip.label}
            </Text>
          </PressScale>
        );
      })}
      {/* Spring-animated underline indicator (brand color, 2pt) */}
      <Reanimated.View
        style={[styles.typeUnderline, typeUnderlineStyle, { backgroundColor: colors.brand }]}
        pointerEvents="none"
      />
    </View>
  );
}
