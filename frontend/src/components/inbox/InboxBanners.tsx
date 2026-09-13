import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { useHaptic } from '../../hooks/useHaptic';

export interface InboxSyncBannerProps {
  onRetry: () => Promise<void>;
}

/**
 * Slim sync banner rendered only when content is already on screen — with an
 * empty list the EmptyState carries the error + retry instead.
 */
export function InboxSyncBanner({ onRetry }: InboxSyncBannerProps) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.errorBanner, { backgroundColor: colors.dangerSubtle, borderBottomColor: colors.border }]}>
      <Ionicons name="alert-circle-outline" size={16} color={colors.danger} accessible={false} />
      <View style={styles.errorBannerCopy}>
        <Text style={[styles.errorBannerTitle, { color: colors.danger }]} accessibilityLiveRegion="polite">Couldn't sync messages</Text>
        <Text style={[styles.errorBannerSub, { color: colors.textMuted }]}>Check your connection or retry.</Text>
      </View>
      <AnimatedPressable
        onPress={() => void onRetry()}
        activeOpacity={0.7}
        scaleValue={0.95}
        hapticFeedback="light"
        accessibilityLabel="Retry loading conversations"
        accessibilityRole="button"
        style={styles.errorBannerRetryBtn}
      >
        <Text style={[styles.errorBannerRetry, { color: colors.brand }]}>Retry</Text>
      </AnimatedPressable>
    </View>
  );
}

export interface InboxListingFilterBannerProps {
  title: string;
  onShowAll: () => void;
}

export function InboxListingFilterBanner({ title, onShowAll }: InboxListingFilterBannerProps) {
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  return (
    <View style={[styles.listingFilterBanner, { backgroundColor: colors.surfaceAlt, borderBottomColor: colors.border }]}>
      <Ionicons name="pricetag-outline" size={16} color={colors.brand} accessible={false} />
      <View style={styles.listingFilterCopy}>
        <Text style={[styles.listingFilterTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.listingFilterSub, { color: colors.textMuted }]}>
          Showing conversations about this listing
        </Text>
      </View>
      <AnimatedPressable
        onPress={() => {
          haptic.light();
          onShowAll();
        }}
        activeOpacity={0.7}
        scaleValue={0.95}
        hapticFeedback="light"
        accessibilityLabel="Show all conversations"
        accessibilityHint="Clear the listing filter and show all conversations"
        accessibilityRole="button"
        style={styles.listingFilterShowAll}
      >
        <Text style={[styles.listingFilterShowAllText, { color: colors.brand }]}>Show all</Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  errorBannerCopy: {
    flex: 1,
    gap: Space.xs / 4,
  },
  errorBannerTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
  errorBannerSub: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.regular,
  },
  errorBannerRetryBtn: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  errorBannerRetry: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
  listingFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listingFilterCopy: {
    flex: 1,
    gap: Space.xs / 4,
  },
  listingFilterTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  listingFilterSub: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
  },
  listingFilterShowAll: {
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
    minHeight: 36,
    justifyContent: 'center',
  },
  listingFilterShowAllText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
});
