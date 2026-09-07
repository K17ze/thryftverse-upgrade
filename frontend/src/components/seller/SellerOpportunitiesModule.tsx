import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppIcon } from '../common/AppIcon';
import { CachedImage } from '../CachedImage';
import { IconSize } from '../../theme/iconTokens';
import type { SellerHubOpportunity } from '../../services/sellerHubApi';

export interface SellerOpportunitiesModuleProps {
  /** Near-winners from the overview aggregate. Null/empty renders nothing. */
  opportunities: SellerHubOpportunity[] | null;
  formatMoney: (value: number | null | undefined) => string;
  onItemPress: (id: string) => void;
  onViewAll: () => void;
}

const THUMB = 112;
const CARD = 120;

/**
 * SellerOpportunitiesModule — the Etsy 2026 near-winner play: active
 * listings earning real views but no sales in 30 days. One quiet header
 * stating the mechanism, one media rail at catalog scale. Null (source
 * unavailable) and empty (none found) both render nothing — no lecture.
 */
export const SellerOpportunitiesModule: React.FC<SellerOpportunitiesModuleProps> = ({
  opportunities,
  formatMoney,
  onItemPress,
  onViewAll,
}) => {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!opportunities || opportunities.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLead}>
          <AppIcon concept="trending" size={IconSize.xs} color="textSecondary" opticalCenter accessible={false} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Worth a look</Text>
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
          <Text style={[styles.viewAllText, { color: colors.brand }]}>View all</Text>
        </AnimatedPressable>
      </View>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>
        Views without sales in 30 days
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.railContent}
      >
        {opportunities.map((item) => (
          <AnimatedPressable
            key={item.listingId}
            onPress={() => onItemPress(item.listingId)}
            activeOpacity={0.7}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.views30d} views in 30 days, no sales`}
            style={styles.card}
          >
            {item.imageUrl ? (
              <CachedImage
                uri={item.imageUrl}
                style={styles.thumb}
                containerStyle={styles.thumbSurface}
                contentFit="cover"
                downscaleWidth={224}
              />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <AppIcon concept="tag" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
              </View>
            )}
            <Text style={[styles.itemLabel, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.itemMeta, { color: colors.textMuted }]} numberOfLines={1}>
              {item.priceGbp != null ? `${formatMoney(item.priceGbp)} · ` : ''}{item.views30d} views
            </Text>
          </AnimatedPressable>
        ))}
      </ScrollView>
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
      paddingHorizontal: Space.md,
    },
    headerLead: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    title: {
      fontSize: TypographyV2.sectionTitle.size,
      lineHeight: TypographyV2.sectionTitle.lineHeight,
      fontFamily: FontFamily.bold,
      letterSpacing: -0.2,
    },
    viewAllHit: {
      minHeight: Control.hit,
      justifyContent: 'center',
      paddingLeft: Space.sm,
    },
    viewAllText: {
      fontSize: TypographyV2.caption.size,
      lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.semibold,
    },
    subtitle: {
      paddingHorizontal: Space.md,
      marginTop: Space.xxs,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.regular,
      letterSpacing: TypographyV2.meta.letterSpacing,
    },
    railContent: {
      paddingHorizontal: Space.md,
      gap: Space.sm,
      paddingVertical: Space.xxs,
      marginTop: Space.xs,
    },
    card: {
      width: CARD,
    },
    thumb: {
      width: THUMB,
      height: THUMB,
      borderRadius: Radius.md,
      overflow: 'hidden',
    },
    thumbSurface: {
      backgroundColor: colors.surfaceAlt,
    },
    thumbPlaceholder: {
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemLabel: {
      marginTop: Space.xs,
      fontSize: TypographyV2.caption.size,
      lineHeight: TypographyV2.caption.lineHeight,
      fontFamily: FontFamily.medium,
      letterSpacing: TypographyV2.caption.letterSpacing,
    },
    itemMeta: {
      marginTop: Space.xxs,
      fontSize: TypographyV2.meta.size,
      lineHeight: TypographyV2.meta.lineHeight,
      fontFamily: FontFamily.semibold,
      letterSpacing: TypographyV2.meta.letterSpacing,
      fontVariant: ['tabular-nums'],
    },
  });
}
