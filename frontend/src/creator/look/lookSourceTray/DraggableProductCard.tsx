/**
 * DraggableProductCard — a flat product thumbnail for LookSourceTray
 * supporting both tap (add to center) and pan (drag to canvas). Uses
 * Gesture.Race so a tap doesn't trigger the pan and vice versa.
 * Extracted verbatim from LookSourceTray.tsx.
 */
import React, { useMemo } from 'react';
import { View, Text, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  withTiming,
  runOnJS,
  type SharedValue } from 'react-native-reanimated';
import { IconGrammar } from '../../../theme/designTokens';
import { Motion } from '../../../theme/motionTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import { useFormattedPrice } from '../../../hooks/useFormattedPrice';
import type { TrayItem } from './lookSourceTrayShared';
import { styles } from './lookSourceTrayStyles';

interface DraggableProductCardProps {
  item: TrayItem;
  onPress: (item: TrayItem) => void;
  onDragStart: (item: TrayItem) => void;
  onDragEnd: (item: TrayItem, x: number, y: number, isOverCanvas: boolean) => void;
  previewX: SharedValue<number>;
  previewY: SharedValue<number>;
  previewVisible: SharedValue<number>;
  trayYSV: SharedValue<number>;
  colors: ThemeColors;
  /** Whether this item is already on the canvas (dedup indicator). */
  onCanvas: boolean;
}

export const DraggableProductCard = React.memo(function DraggableProductCard({
  item,
  onPress,
  onDragStart,
  onDragEnd,
  previewX,
  previewY,
  previewVisible,
  trayYSV,
  colors,
  onCanvas }: DraggableProductCardProps) {
  const { currencySymbol } = useFormattedPrice();
  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd(() => {
        runOnJS(onPress)(item);
      }),
    [item, onPress]
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(8)
        .onStart((e) => {
          'worklet';
          previewX.value = e.absoluteX;
          previewY.value = e.absoluteY;
          previewVisible.value = withTiming(1, { duration: Motion.duration.fast });
          runOnJS(onDragStart)(item);
        })
        .onUpdate((e) => {
          'worklet';
          previewX.value = e.absoluteX;
          previewY.value = e.absoluteY;
        })
        .onEnd((e) => {
          'worklet';
          previewVisible.value = withTiming(0, { duration: Motion.duration.fast });
          const isOverCanvas = e.absoluteY < trayYSV.value;
          runOnJS(onDragEnd)(item, e.absoluteX, e.absoluteY, isOverCanvas);
        }),
    [item, onDragStart, onDragEnd, previewX, previewY, previewVisible, trayYSV]
  );

  const composedGesture = useMemo(
    () => Gesture.Race(panGesture, tapGesture),
    [panGesture, tapGesture]
  );

  return (
    <GestureDetector gesture={composedGesture}>
      <View
        style={styles.itemCard}
        accessibilityLabel={`Add ${item.title} to look${onCanvas ? ' — already on canvas' : ''}`}
        accessibilityHint="Tap to add or drag onto the canvas"
        accessibilityRole="button"
      >
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.itemImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.itemImagePlaceholder, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="image-outline" size={IconGrammar.standard} color={colors.textMuted} />
          </View>
        )}
        {/* Dedup indicator — subtle dot on items already on canvas */}
        {onCanvas && (
          <View style={[styles.onCanvasDot, { backgroundColor: colors.brand }]} />
        )}
        <Text
          style={[styles.itemTitle, { color: onCanvas ? colors.textMuted : colors.textSecondary }]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        {item.priceGbp !== undefined && (
          <Text style={[styles.itemPrice, { color: onCanvas ? colors.textMuted : colors.textPrimary }]}>
            {currencySymbol}{item.priceGbp.toFixed(0)}
          </Text>
        )}
      </View>
    </GestureDetector>
  );
});
