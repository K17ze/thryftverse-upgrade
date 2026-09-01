import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { Radius, Space, Stroke } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AnimatedPressable } from './AnimatedPressable';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { AppIcon } from './common/AppIcon';
import { IconSize } from '../theme/iconTokens';

interface SuggestedAction {
  label: string;
  onPress: () => void;
}

interface Props {
  icon?: keyof typeof Ionicons.glyphMap | string;
  title: string;
  subtitle?: string;
  /** Contextual hint shown below the subtitle as a subtle tip */
  hint?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  secondaryCtaLabel?: string;
  onSecondaryCtaPress?: () => void;
  suggestedActions?: SuggestedAction[];
  iconColor?: string;
  graphic?: React.ReactNode;
  /** Compact states preserve first-viewport context inside feeds and tabs. */
  density?: 'default' | 'compact';
}
export function EmptyState({ icon, title, subtitle, hint, ctaLabel, onCtaPress, secondaryCtaLabel, onSecondaryCtaPress, suggestedActions, iconColor, graphic, density = 'default' }: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const resolvedIconColor = iconColor ?? colors.brand;
  const reducedMotionEnabled = useReducedMotion();
  const enter = reducedMotionEnabled ? undefined : FadeIn.duration(300);
  const compact = density === 'compact';

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {graphic ? (
        <Reanimated.View entering={enter}>
          {graphic}
        </Reanimated.View>
      ) : icon ? (
        <Reanimated.View entering={enter}>
          <AppIcon
            name={icon}
            size={compact ? IconSize.lg : IconSize.hero}
            color={resolvedIconColor}
            opticalCenter
            accessible={false}
          />
        </Reanimated.View>
      ) : null}

      <Reanimated.Text
        entering={enter}
        style={[styles.title, compact && styles.titleCompact]}
      >
        {title}
      </Reanimated.Text>

      {subtitle && (
        <Reanimated.Text
          entering={enter}
          style={[styles.subtitle, compact && styles.subtitleCompact]}
        >
          {subtitle}
        </Reanimated.Text>
      )}

      {hint ? (
        <Reanimated.View entering={enter} style={styles.hintWrap}>
          <AppIcon name="image-outline" size={IconSize.micro} color="textMuted" opticalCenter accessible={false} />
          <Text style={styles.hintText}>{hint}</Text>
        </Reanimated.View>
      ) : null}

      {ctaLabel && onCtaPress && (
        <Reanimated.View entering={enter}>
          <AnimatedPressable style={[styles.cta, compact && styles.ctaCompact]} onPress={onCtaPress} hapticFeedback="selection">
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </AnimatedPressable>
        </Reanimated.View>
      )}

      {secondaryCtaLabel && onSecondaryCtaPress && (
        <Reanimated.View entering={enter}>
          <AnimatedPressable style={styles.ctaSecondary} onPress={onSecondaryCtaPress} hapticFeedback="light">
            <Text style={styles.ctaSecondaryText}>{secondaryCtaLabel}</Text>
          </AnimatedPressable>
        </Reanimated.View>
      )}

      {suggestedActions && suggestedActions.length > 0 && (
        <Reanimated.View entering={enter} style={styles.suggestedWrap}>
          <Text style={styles.suggestedLabel}>Suggested</Text>
          <View style={styles.chipRow}>
            {suggestedActions.map((action, i) => (
              <AnimatedPressable
                key={i}
                style={styles.chip}
                onPress={action.onPress}
                hapticFeedback="light"
              >
                <Text style={styles.chipText}>{action.label}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </Reanimated.View>
      )}
    </View>
  );
}

// ── Preset templates ─────────────────────────────────────────────────────────
// Common empty-state configurations that can be spread into <EmptyState {...preset} />.
// These encode UX-research-backed copy and icon choices for the three most
// common empty-state scenarios in the app.

export interface EmptyStatePreset {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
}

/**
 * "Nothing here yet" — for screens where the user hasn't created or saved
 * any content (e.g. empty closet, no listings, no collections).
 * The CTA should be the primary creation action.
 */
export const EMPTY_PRESET_FIRST_TIME: EmptyStatePreset = {
  icon: 'bag-handle-outline',
  title: 'Nothing here yet',
  subtitle: 'Your saves and creations will show up here once you get started.' };

/**
 * "No results" — for search and filter screens where the user's query
 * returned no matches. The CTA should clear filters or broaden the search.
 */
export const EMPTY_PRESET_NO_RESULTS: EmptyStatePreset = {
  icon: 'search-outline',
  title: 'No matches found',
  subtitle: 'Try adjusting your filters or search for something different.' };

/**
 * "All caught up" — for feed and notification screens where there's no
 * new content to show. This is a positive empty state — the user has
 * seen everything available.
 */
export const EMPTY_PRESET_CAUGHT_UP: EmptyStatePreset = {
  icon: 'checkmark-done-outline',
  title: "You're all caught up",
  subtitle: 'Check back later for new activity.' };

/**
 * "No search results" — for search screens with a specific query.
 * Use by spreading {...EMPTY_PRESET_SEARCH_NO_RESULTS(query)}.
 */
export const EMPTY_PRESET_SEARCH_NO_RESULTS = (query: string): EmptyStatePreset => ({
  icon: 'search-outline',
  title: `No matches for "${query}"`,
  subtitle: 'Try broader terms or clear your filters to see more items.' });

/**
 * "No filtered results" — for browse/discover with active filters.
 */
export const EMPTY_PRESET_FILTERED_NO_RESULTS: EmptyStatePreset = {
  icon: 'filter-outline',
  title: 'No items match your filters',
  subtitle: 'Try adjusting your filters or clearing them to see all items.' };

/**
 * "No listings yet" — for seller's own shop with no listings.
 */
export const EMPTY_PRESET_NO_LISTINGS: EmptyStatePreset = {
  icon: 'bag-handle-outline',
  title: 'Your shop is empty',
  subtitle: 'List your first item to start selling. It takes less than a minute.' };

/**
 * "No sold items" — for seller's sold items list.
 */
export const EMPTY_PRESET_NO_SALES: EmptyStatePreset = {
  icon: 'checkmark-done-outline',
  title: 'No sales yet',
  subtitle: 'Your sold items will appear here once you make your first sale.' };

/**
 * "No followers" — for profile followers list.
 */
export const EMPTY_PRESET_NO_FOLLOWERS: EmptyStatePreset = {
  icon: 'people-outline',
  title: 'No followers yet',
  subtitle: 'Share your profile and list great items to attract followers.' };

/**
 * "No following" — for profile following list.
 */
export const EMPTY_PRESET_NO_FOLLOWING: EmptyStatePreset = {
  icon: 'people-outline',
  title: "You're not following anyone",
  subtitle: 'Discover sellers you love and follow them to see their latest items.' };

/**
 * "No messages" — for inbox with no conversations.
 */
export const EMPTY_PRESET_NO_MESSAGES: EmptyStatePreset = {
  icon: 'chatbubble-outline',
  title: 'No messages yet',
  subtitle: 'Start a conversation with a seller or buyer to see your messages here.' };

/**
 * "No notifications" — for notifications screen.
 */
export const EMPTY_PRESET_NO_NOTIFICATIONS: EmptyStatePreset = {
  icon: 'notifications-outline',
  title: 'No notifications',
  subtitle: "You're all caught up. We'll notify you when there's something new." };

/**
 * "No wishlist items" — for saved/favorited items.
 */
export const EMPTY_PRESET_NO_WISHLIST: EmptyStatePreset = {
  icon: 'heart-outline',
  title: 'No saved items yet',
  subtitle: 'Tap the heart on any item to save it here for later.' };

/**
 * "No orders" — for order history.
 */
export const EMPTY_PRESET_NO_ORDERS: EmptyStatePreset = {
  icon: 'receipt-outline',
  title: 'No orders yet',
  subtitle: 'Your purchase history will appear here once you buy your first item.' };


const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl + Space.sm,
    paddingVertical: Space.xxl + Space.sm,
    gap: Space.sm + 2 },
  containerCompact: {
    flex: 0,
    minHeight: 228,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md + Space.sm,
    gap: Space.xs + 2 },
  title: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    letterSpacing: -0.2,
    color: colors.textPrimary,
    textAlign: 'center' },
  titleCompact: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight },
  subtitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: 0.08,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: TypographyV2.body.lineHeight + 1,
    maxWidth: 260 },
  subtitleCompact: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 1,
    maxWidth: 310 },
  hintWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
    marginTop: Space.xs,
    maxWidth: 280 },
  hintText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    lineHeight: TypographyV2.meta.lineHeight + 1 },
  cta: {
    marginTop: Space.md + 4,
    backgroundColor: colors.textPrimary,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md - 2,
    borderRadius: Radius.xxl },
  ctaCompact: {
    minHeight: 44,
    marginTop: Space.smMd,
    paddingVertical: Space.sm + 3,
    borderRadius: Radius.xl },
  ctaText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: 0.3,
    color: colors.background },
  ctaSecondary: {
    marginTop: Space.sm + 2,
    paddingHorizontal: Space.md + Space.sm,
    paddingVertical: Space.smMd,
    borderRadius: Radius.xxl,
    borderWidth: Stroke.standard,
    borderColor: colors.border },
  ctaSecondaryText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary },
  suggestedWrap: {
    marginTop: Space.md + 4,
    alignItems: 'center',
    gap: Space.sm + 2 },
  suggestedLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md + 4 },
  chip: {
    paddingHorizontal: Space.sm + 6,
    paddingVertical: Space.sm,
    borderRadius: Radius.xxl,
    backgroundColor: colors.surface,
    borderWidth: Stroke.standard,
    borderColor: colors.border },
  chipText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary } });
