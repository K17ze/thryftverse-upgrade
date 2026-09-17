/**
 * MediaPickerTabs — category tab row with the spring underline indicator.
 *
 * Text-only tabs, 2pt brand underline. Each tab records its layout into
 * `tabLayoutsRef` (Partial<Record<MediaCategory, { x, width }>>) so the
 * indicator can spring to the active tab; the 'recent' tab seeds the
 * indicator width on first layout.
 *
 * Extracted from MediaPicker.tsx (pure move — no behavior change).
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  type SharedValue } from 'react-native-reanimated';
import { type ThemeColors } from '../../../theme/ThemeContext';
import { createStyles } from './pickerShared';
import { MEDIA_CATEGORIES, type MediaCategory, type TabLayoutsRef } from './mediaPickerTypes';

export function MediaPickerTabs({
  activeCategory,
  onSelectCategory,
  tabLayoutsRef,
  tabIndicatorXSV,
  tabIndicatorWidthSV,
  colors,
  styles }: {
  activeCategory: MediaCategory;
  onSelectCategory: (cat: MediaCategory) => void;
  tabLayoutsRef: TabLayoutsRef;
  tabIndicatorXSV: SharedValue<number>;
  tabIndicatorWidthSV: SharedValue<number>;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  // ── Tab indicator animated style ─────────────────────────────────
  const tabIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tabIndicatorXSV.value }],
    width: tabIndicatorWidthSV.value }));

  return (
    <View style={styles.categoryTabRow}>
      <Reanimated.View
        style={[styles.categoryTabIndicator, { backgroundColor: colors.brand }, tabIndicatorStyle]}
      />
      {MEDIA_CATEGORIES.map((cat) => {
        const active = activeCategory === cat.key;
        return (
          <Pressable
            key={cat.key}
            onPress={() => onSelectCategory(cat.key)}
            onLayout={(e) => {
              tabLayoutsRef.current[cat.key] = {
                x: e.nativeEvent.layout.x,
                width: e.nativeEvent.layout.width };
              if (cat.key === 'recent' && tabIndicatorWidthSV.value === 0) {
                tabIndicatorWidthSV.value = e.nativeEvent.layout.width;
              }
            }}
            style={styles.categoryTab}
            accessibilityLabel={cat.label}
            accessibilityHint="Filters media to this category"
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={[
              styles.categoryTabLabel,
              { color: active ? colors.textPrimary : colors.textSecondary },
            ]}>
              {cat.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
