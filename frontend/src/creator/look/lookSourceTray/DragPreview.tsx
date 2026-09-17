/**
 * DragPreview — the floating drag preview of LookSourceTray that
 * follows the finger during a product-card pan. Extracted verbatim
 * from LookSourceTray.tsx.
 */
import React from 'react';
import { View, Text, Image, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { type AnimatedStyle } from 'react-native-reanimated';
import { IconGrammar } from '../../../theme/designTokens';
import type { ThemeColors } from '../../../theme/ThemeContext';
import type { TrayItem } from './lookSourceTrayShared';
import { styles } from './lookSourceTrayStyles';

interface DragPreviewProps {
  draggingItem: TrayItem | null;
  previewAnimStyle: StyleProp<AnimatedStyle<ViewStyle>>;
  colors: ThemeColors;
  currencySymbol: string;
}

export function DragPreview({
  draggingItem,
  previewAnimStyle,
  colors,
  currencySymbol }: DragPreviewProps) {
  return (
    /* ── Floating drag preview — follows the finger during pan ── */
    <Reanimated.View
      style={[styles.dragPreview, previewAnimStyle]}
      pointerEvents="none"
    >
      {draggingItem?.imageUrl ? (
        <Image
          source={{ uri: draggingItem.imageUrl }}
          style={styles.previewImage}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.previewImage, { backgroundColor: colors.surfaceAlt }]}>
          <Ionicons name="image-outline" size={IconGrammar.hero} color={colors.textMuted} />
        </View>
      )}
      <Text style={[styles.previewTitle, { color: colors.textPrimary }]} numberOfLines={1}>
        {draggingItem?.title ?? ''}
      </Text>
      {draggingItem?.priceGbp !== undefined && (
        <Text style={[styles.previewPrice, { color: colors.brand }]}>
          {currencySymbol}{draggingItem.priceGbp.toFixed(0)}
        </Text>
      )}
    </Reanimated.View>
  );
}
