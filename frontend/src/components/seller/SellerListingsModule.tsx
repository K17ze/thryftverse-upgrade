import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { SellerThumbRail, type SellerThumbRailItem } from './SellerThumbRail';

export interface SellerListingsModuleProps {
  activeCount: number;
  items: SellerThumbRailItem[];
  onViewAll: () => void;
  onItemPress: (id: string) => void;
  isLoading?: boolean;
  /** Listings fetch rejected — the host renders an inline retry; suppress empty copy. */
  isFailed?: boolean;
}

/**
 * SellerListingsModule — active-listings rail on the Seller Hub overview.
 * Plain typographic header ("Listings · N active" + View all) and an
 * honest empty row — shares the exact grammar with SellerClosetModule.
 * Listed value moved into the financial block's sub-metrics — it answers
 * the money question there, not here.
 */
export const SellerListingsModule: React.FC<SellerListingsModuleProps> = ({
  activeCount,
  items,
  onViewAll,
  onItemPress,
  isLoading = false,
  isFailed = false,
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const hasItems = items.length > 0;
  const showSkeleton = isLoading && !hasItems;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <Text style={styles.sectionTitle}>Listings</Text>
          <Text style={styles.countCaption}>{activeCount} active</Text>
        </View>
        <AnimatedPressable
          onPress={onViewAll}
          activeOpacity={0.7}
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="View all listings"
          style={styles.viewAllHit}
        >
          <Text style={styles.viewAllText}>View all</Text>
        </AnimatedPressable>
      </View>

      {hasItems ? (
        <SellerThumbRail items={items} onItemPress={onItemPress} />
      ) : showSkeleton ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.skeletonRail}
        >
          <View style={styles.skeletonBox} />
          <View style={styles.skeletonBox} />
          <View style={styles.skeletonBox} />
        </ScrollView>
      ) : isFailed ? null : (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>Nothing listed yet</Text>
        </View>
      )}
    </View>
  );
};

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: {
      marginTop: Space.lg,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginHorizontal: Space.md,
      marginBottom: Space.xxs,
    },
    titleWrap: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: Space.sm,
      flexShrink: 1,
    },
    sectionTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: FontFamily.bold,
      letterSpacing: TypographyV2.sectionTitle.letterSpacing,
      color: colors.textPrimary,
    },
    countCaption: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    viewAllHit: {
      minHeight: Control.hit,
      justifyContent: 'center',
    },
    viewAllText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.semibold,
      color: colors.brand,
    },
    emptyRow: {
      minHeight: Control.hit,
      justifyContent: 'center',
      marginHorizontal: Space.md,
    },
    emptyText: {
      fontSize: TypographyV2.caption.size,
      fontFamily: FontFamily.regular,
      color: colors.textSecondary,
    },
    skeletonRail: {
      paddingHorizontal: Space.md,
      gap: Space.sm,
    },
    skeletonBox: {
      width: 96,
      height: 96,
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
    },
  });
}
