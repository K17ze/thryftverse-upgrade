/**
 * MediaPickerGridItem — a single media cell in the picker grid.
 *
 * Spring press feedback + spring scale selection badge.
 * Extracted from MediaPicker.tsx (pure move — no behavior change).
 */

import React, { useEffect } from 'react';
import { View, Text, Pressable, type ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { IconGrammar } from '../../../theme/designTokens';
import { type ThemeColors } from '../../../theme/ThemeContext';
import { useMotionConfig } from '../../../hooks/useMotionConfig';
import { useReducedMotion } from '../../../hooks/useReducedMotion';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation } from 'react-native-reanimated';
import { createStyles } from './pickerShared';
import type { MediaAsset } from './mediaPickerTypes';

export function MediaGridItem({
  asset,
  isSelected,
  selectionOrder,
  onPress,
  onLongPress,
  colors,
  styles }: {
  asset: MediaAsset;
  isSelected: boolean;
  selectionOrder: number;
  onPress: () => void;
  onLongPress?: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const reduceMotion = useReducedMotion();
  const { spring } = useMotionConfig();
  const pressedSV = useSharedValue(0);
  const badgeScaleSV = useSharedValue(isSelected ? 1 : 0);

  useEffect(() => {
    if (isSelected) {
      if (reduceMotion) {
        badgeScaleSV.value = 1;
      } else {
        badgeScaleSV.value = withSpring(1, spring.success);
      }
    } else {
      badgeScaleSV.value = reduceMotion ? 0 : withSpring(0, spring.tap);
    }
  }, [isSelected, reduceMotion, spring, badgeScaleSV]);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressedSV.value, [0, 1], [1, 0.95], Extrapolation.CLAMP) }] }));

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScaleSV.value }],
    opacity: badgeScaleSV.value }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => { pressedSV.value = withSpring(1, spring.tap); }}
      onPressOut={() => { pressedSV.value = withSpring(0, spring.tap); }}
      accessibilityLabel={`Select ${asset.mediaType}${isSelected ? `, selected ${selectionOrder}` : ''}`}
      accessibilityHint="Long-press to preview"
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <Reanimated.View style={[styles.mediaGridCell, pressStyle]}>
        <Image
          source={{ uri: asset.uri }}
          style={styles.mediaGridThumb as ImageStyle}
          contentFit="cover"
        />
        {asset.mediaType === 'video' && (
          <View style={styles.mediaGridVideoBadge}>
            <Ionicons name="play" size={IconGrammar.badge} color={colors.scrimTextPrimary} aria-hidden={true} />
            {asset.durationMs != null && (
              <Text style={styles.mediaGridDuration}>
                {Math.floor(asset.durationMs / 1000)}s
              </Text>
            )}
          </View>
        )}
        {isSelected && (
          <View style={[styles.mediaGridSelectedOverlay, { borderColor: colors.brand }]}>
            <Reanimated.View style={[styles.mediaGridSelectionBadge, { backgroundColor: colors.brand }, badgeStyle]}>
              <Ionicons name="checkmark" size={10} color={colors.scrimTextPrimary} aria-hidden={true} />
            </Reanimated.View>
          </View>
        )}
      </Reanimated.View>
    </Pressable>
  );
}
