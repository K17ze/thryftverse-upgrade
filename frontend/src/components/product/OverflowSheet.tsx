import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Control, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface OverflowSheetProps {
  visible: boolean;
  onDismiss: () => void;
  isFav: boolean;
  onShare: () => void;
  onToggleFav: () => void;
  onReport: () => void;
}

/**
 * Overflow bottom sheet — lower-frequency hero actions (Share, Fav, Report).
 * Extracted from ItemDetailScreen. Each action closes the sheet then
 * dispatches the caller's handler.
 */
export function OverflowSheet({
  visible,
  onDismiss,
  isFav,
  onShare,
  onToggleFav,
  onReport,
}: OverflowSheetProps) {
  const { colors } = useAppTheme();

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} snapPoint={0.4}>
      <View style={[styles.overflowHeader, { borderColor: colors.border }]}>
        <Text style={[styles.overflowTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>More actions</Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.overflowRow, pressed && styles.pressed]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        onPress={() => {
          onDismiss();
          onShare();
        }}
        accessibilityRole="button"
        accessibilityLabel="Share listing"
      >
        <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
        <Text style={[styles.overflowRowText, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>Share listing</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.overflowRow, pressed && styles.pressed]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        onPress={() => {
          onDismiss();
          onToggleFav();
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: isFav }}
        accessibilityLabel={isFav ? 'Remove from wishlist' : 'Add to wishlist'}
      >
        <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? colors.danger : colors.textPrimary} />
        <Text style={[styles.overflowRowText, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>
          {isFav ? 'Remove from wishlist' : 'Add to wishlist'}
        </Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.overflowRow, pressed && styles.pressed]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        onPress={() => {
          onDismiss();
          onReport();
        }}
        accessibilityRole="button"
        accessibilityLabel="Report this listing"
      >
        <Ionicons name="flag-outline" size={20} color={colors.textSecondary} />
        <Text style={[styles.overflowRowText, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>Report listing</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  overflowHeader: {
    paddingBottom: Space.sm,
    marginBottom: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  overflowTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
  overflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    minHeight: Control.hit + Space.xs,
  },
  overflowRowText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
});
