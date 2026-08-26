import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { BottomSheet } from '../BottomSheet';
import { Headline } from '../ui/Text';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  isWatched: boolean;
  isUpcoming: boolean;
  isSavedToCollection: boolean;
  isLiked: boolean;
  onToggleWatch: () => void;
  onShare: () => void;
  onOpenCollectionPicker: () => void;
  onToggleLike: () => void;
}

/**
 * Overflow sheet — Watchlist, Save to collection, wishlist (lower-frequency
 * actions kept off the hero per spec 04 §1).
 */
export function AuctionOverflowSheet({
  visible,
  onDismiss,
  isWatched,
  isUpcoming,
  isSavedToCollection,
  isLiked,
  onToggleWatch,
  onShare,
  onOpenCollectionPicker,
  onToggleLike,
}: Props) {
  const { colors } = useAppTheme();

  return (
    <BottomSheet
      visible={visible}
      onDismiss={onDismiss}
      snapPoint={0.4}
    >
      <View style={styles.sheetHeader}>
        <Headline style={styles.sheetTitle}>More actions</Headline>
      </View>
      <Pressable
        style={[styles.overflowRow, { borderColor: colors.borderSubtle }]}
        onPress={() => {
          onDismiss();
          onToggleWatch();
        }}
        accessibilityRole="button"
        accessibilityLabel={isWatched ? 'Remove from watchlist' : (isUpcoming ? 'Get notified when this goes live' : 'Add to watchlist')}
        accessibilityState={{ selected: isWatched }}
      >
        <Ionicons
          name={isWatched ? 'eye' : 'eye-outline'}
          size={20}
          color={isWatched ? colors.brand : colors.textPrimary}
        />
        <Text style={[styles.overflowRowText, { color: colors.textPrimary }]}>
          {isWatched ? 'Remove from watchlist' : (isUpcoming ? 'Get notified when live' : 'Add to watchlist')}
        </Text>
      </Pressable>
      <Pressable
        style={[styles.overflowRow, { borderColor: colors.borderSubtle }]}
        onPress={() => {
          onDismiss();
          onShare();
        }}
        accessibilityRole="button"
        accessibilityLabel="Share auction"
      >
        <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
        <Text style={[styles.overflowRowText, { color: colors.textPrimary }]}>Share auction</Text>
      </Pressable>
      <Pressable
        style={[styles.overflowRow, { borderColor: colors.borderSubtle }]}
        onPress={() => {
          onDismiss();
          onOpenCollectionPicker();
        }}
        accessibilityRole="button"
        accessibilityLabel={isSavedToCollection ? 'Saved to collection' : 'Save to collection'}
        accessibilityState={{ selected: isSavedToCollection }}
      >
        <Ionicons
          name={isSavedToCollection ? 'bookmark' : 'bookmark-outline'}
          size={20}
          color={isSavedToCollection ? colors.brand : colors.textPrimary}
        />
        <Text style={[styles.overflowRowText, { color: colors.textPrimary }]}>
          {isSavedToCollection ? 'Saved to collection' : 'Save to collection'}
        </Text>
      </Pressable>
      <Pressable
        style={[styles.overflowRow, { borderColor: colors.borderSubtle }]}
        onPress={() => {
          onDismiss();
          onToggleLike();
        }}
        accessibilityRole="button"
        accessibilityLabel={isLiked ? 'Remove from wishlist' : 'Add to wishlist'}
        accessibilityState={{ selected: isLiked }}
      >
        <Ionicons
          name={isLiked ? 'heart' : 'heart-outline'}
          size={20}
          color={isLiked ? colors.danger : colors.textPrimary}
        />
        <Text style={[styles.overflowRowText, { color: colors.textPrimary }]}>
          {isLiked ? 'Remove from wishlist' : 'Add to wishlist'}
        </Text>
      </Pressable>
      <View style={{ height: Space.md }} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: Space.md,
  },
  sheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.bold,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
  },
  overflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Space.xxl,
  },
  overflowRowText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
  },
});
