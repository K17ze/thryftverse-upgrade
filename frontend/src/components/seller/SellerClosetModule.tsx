import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { SellerThumbRail, type SellerThumbRailItem } from './SellerThumbRail';
import { IconSize } from '../../theme/iconTokens';

export interface SellerClosetModuleProps {
  savedCount: number;
  items: SellerThumbRailItem[];
  onViewAll: () => void;
  onItemPress: (id: string) => void;
  isLoading?: boolean;
}

/**
 * SellerClosetModule — saved-pieces rail on the Seller Hub overview.
 * Shares the exact header grammar, View all control and honest empty-row
 * treatment with SellerListingsModule — one system, two sections.
 */
export const SellerClosetModule: React.FC<SellerClosetModuleProps> = ({
  savedCount,
  items,
  onViewAll,
  onItemPress,
  isLoading = false,
}) => {
  const { colors } = useAppTheme();
  const styles = createStyles(colors);
  const hasItems = items.length > 0;
  const showSkeleton = isLoading && !hasItems;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <AppIcon
            concept="bookmark"
            size={IconSize.xs}
            color="textSecondary"
            opticalCenter
            accessible={false}
          />
          <Text style={styles.sectionTitle}>Closet</Text>
          <Text style={styles.countCaption}>{savedCount} saved</Text>
        </View>
        <AnimatedPressable
          onPress={onViewAll}
          activeOpacity={0.7}
          scaleValue={0.97}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="View all saved items"
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
      ) : (
        <View style={styles.emptyRow}>
          <AppIcon
            concept="bookmark"
            size={IconSize.sm}
            color="textMuted"
            opticalCenter
            accessible={false}
          />
          <Text style={styles.emptyText}>Save pieces you love</Text>
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
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: Space.md,
    },
    titleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
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
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      minHeight: Control.hit,
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
