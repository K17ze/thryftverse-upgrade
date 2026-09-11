import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import { EmptyState } from '../EmptyState';
import { PremiumSkeletonTile } from '../discover/PremiumSkeletonTile';
import { OfflineBanner } from '../OfflineBanner';
import { SyncRetryBanner } from '../SyncRetryBanner';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { useHaptic } from '../../hooks/useHaptic';
import type { DynamicSignalChip } from '../../services/algorithmicSignalsService';
import type { PosterStory } from '../../services/postersApi';
import { HomeStoryRail } from './HomeStoryRail';

export type FeedMode = 'foryou' | 'following';

// Skeleton variation communicates loading without inventing media geometry.
const SKELETON_HEIGHT_RATIOS = [1.25, 1.08, 1.32, 1.16] as const;

export interface HomeFeedHeaderProps {
  // Feed tabs
  feedMode: FeedMode;
  onFeedModeChange: (mode: FeedMode) => void;
  followingListingsCount: number;

  // Signal chips
  signals: DynamicSignalChip[];
  selectedSignal: DynamicSignalChip;
  onSelectSignal: (signal: DynamicSignalChip) => void;

  // Editorial header
  newHomeFeedEnabled: boolean;

  // Story rail
  postersLoading: boolean;
  posters: PosterStory[];

  // New listings banner
  newListingCount: number;
  onAcknowledgeNewListings: () => void;

  // Status surface
  isOffline: boolean;
  hasSyncError: boolean;
  isSyncing: boolean;
  isRefreshing: boolean;
  forYouIsDegraded: boolean;
  onRetry: () => void;

  // Loading/empty/error states
  showLoadingSkeleton: boolean;
  showFollowingLoading: boolean;
  showForYouLoading: boolean;
  feedDataLength: number;

  // Following feed state
  followingError: string | null;
  followingHasFollowing: boolean;
  onFollowingRefresh: () => void;

  // For You feed state
  forYouError: string | null;
  forYouIsEmpty: boolean;
  forYouHasError: boolean;
  onForYouRefresh: () => void;

  // Navigation
  onBrowse: () => void;

  // Grid
  gridTileWidth: number;
}

export function HomeFeedHeader({
  feedMode,
  onFeedModeChange,
  followingListingsCount,
  signals,
  selectedSignal,
  onSelectSignal,
  newHomeFeedEnabled,
  postersLoading,
  posters,
  newListingCount,
  onAcknowledgeNewListings,
  isOffline,
  hasSyncError,
  isSyncing,
  isRefreshing,
  forYouIsDegraded,
  onRetry,
  showLoadingSkeleton,
  showFollowingLoading,
  showForYouLoading,
  feedDataLength,
  followingError,
  followingHasFollowing,
  onFollowingRefresh,
  forYouError,
  forYouIsEmpty,
  forYouHasError,
  onForYouRefresh,
  onBrowse,
  gridTileWidth }: HomeFeedHeaderProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();

  const hasPosters = !postersLoading && posters.length > 0;

  const renderNewListingsBanner = () => {
    if (newListingCount === 0) {
      return null;
    }

    return (
      <View style={styles.newListingsBannerWrap}>
        <AppButton
          title={`${newListingCount} new ${newListingCount === 1 ? 'drop' : 'drops'} ready`}
          variant="primary"
          size="sm"
          align="center"
          style={styles.newListingsBanner}
          contentStyle={styles.newListingsBannerContent}
          titleStyle={styles.newListingsBannerText}
          icon={<Ionicons name="arrow-up-circle-outline" size={14} color={colors.background} />}
          trailingIcon={<Ionicons name="chevron-up" size={14} color={colors.background} />}
          iconContainerStyle={styles.newListingsBannerIconWrap}
          trailingIconContainerStyle={styles.newListingsBannerIconWrap}
          hapticFeedback="selection"
          onPress={onAcknowledgeNewListings}
          accessibilityLabel="Jump to new listings"
          accessibilityHint="Scrolls feed focus to newly added listings"
          accessibilityRole="button"
        />
      </View>
    );
  };

  const renderExploreLoadingState = () => (
    <View style={styles.exploreLoadingGrid}>
      <View style={styles.exploreLoadingColumn}>
        {Array.from({ length: 4 }).map((_, index) => {
          const ratio = SKELETON_HEIGHT_RATIOS[index % SKELETON_HEIGHT_RATIOS.length];
          return (
            <View key={`feed_loading_left_${index}`} style={styles.skeletonTileWrap}>
              <PremiumSkeletonTile width="100%" height={Math.round(gridTileWidth * ratio)} borderRadius={RadiusRoleValue.mediaThumbnail} />
              {/* Identity line skeleton — matches the 14sp identity text height */}
              <PremiumSkeletonTile width="80%" height={14} borderRadius={RadiusRoleValue.compactControl} />
              {/* Price line skeleton — matches the 15sp semibold price height */}
              <PremiumSkeletonTile width="45%" height={16} borderRadius={RadiusRoleValue.compactControl} />
            </View>
          );
        })}
      </View>
      <View style={styles.exploreLoadingColumn}>
        {Array.from({ length: 4 }).map((_, index) => {
          const ratio = SKELETON_HEIGHT_RATIOS[(index + 2) % SKELETON_HEIGHT_RATIOS.length];
          return (
            <View key={`feed_loading_right_${index}`} style={styles.skeletonTileWrap}>
              <PremiumSkeletonTile width="100%" height={Math.round(gridTileWidth * ratio)} borderRadius={RadiusRoleValue.mediaThumbnail} />
              <PremiumSkeletonTile width="70%" height={14} borderRadius={RadiusRoleValue.compactControl} />
              <PremiumSkeletonTile width="50%" height={16} borderRadius={RadiusRoleValue.compactControl} />
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
    <View>
      <View style={styles.feedTabBar} accessibilityRole="tablist">
        {(['foryou', 'following'] as const).map((option) => {
          const isSelected = feedMode === option;
          const labels: Record<typeof option, string> = {
            foryou: 'For you',
            following: 'Following',
          };
          const label = labels[option];
          return (
            <AnimatedPressable
              key={option}
              style={styles.feedTab}
              onPress={() => {
                if (!isSelected) {
                  haptic.selection();
                  onFeedModeChange(option);
                }
              }}
              accessibilityRole="tab"
              accessibilityLabel={option === 'foryou'
                ? 'For you feed'
                : `Following feed${followingListingsCount > 0 ? `, ${followingListingsCount} listings` : ''}`}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.feedTabLabel, isSelected && styles.feedTabLabelActive]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
                {label}
              </Text>
              {option === 'following' && followingListingsCount > 0 ? (
                <Text style={[styles.feedTabCount, isSelected && styles.feedTabCountActive]} maxFontSizeMultiplier={1.5}>
                  {followingListingsCount}
                </Text>
              ) : null}
              {isSelected ? <View style={styles.feedTabIndicator} /> : null}
            </AnimatedPressable>
          );
        })}
      </View>

      {/* G2: Dynamic quick signal chips driven by user algorithm topics & recommendation vectors.
          Horizontal scroll rail with haptic feedback and closed-loop learning. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.signalRail}
        contentContainerStyle={styles.signalRailContent}
        accessibilityRole="tablist"
        accessibilityLabel="Personalized category signals"
      >
        {signals.map((signal) => {
          const active = selectedSignal.filterKey === signal.filterKey;
          return (
            <AnimatedPressable
              key={`signal-${signal.id}-${signal.filterKey}`}
              style={[
                styles.signalChip,
                active && styles.signalChipActive,
                signal.isPersonalized && !active && styles.signalChipPersonalized,
              ]}
              onPress={() => onSelectSignal(signal)}
              activeOpacity={0.85}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${signal.label}${signal.isPersonalized ? ', personalized' : ''}`}
              accessibilityState={{ selected: active }}
            >
              {signal.isPersonalized && signal.kind !== 'all' ? (
                <View style={[styles.signalDot, active && styles.signalDotActive]} />
              ) : null}
              <Text style={[styles.signalChipText, active && styles.signalChipTextActive]} maxFontSizeMultiplier={2}>
                {signal.label}
              </Text>
            </AnimatedPressable>
          );
        })}
      </ScrollView>

      {/* New home feed editorial header — gated by the new_home_feed
          feature flag. Additive enhancement; absent when the flag is
          off (current behaviour). Introduces the feed with a curated
          editorial label so the surface reads as authored, not as a
          generic product grid. */}
      {newHomeFeedEnabled ? (
        <View style={styles.editorialHeader}>
          <Text style={styles.editorialEyebrow} numberOfLines={1} maxFontSizeMultiplier={2}>
            Fresh today
          </Text>
          <Text style={styles.editorialTitle} numberOfLines={1} maxFontSizeMultiplier={2}>
            New listings from sellers you follow
          </Text>
        </View>
      ) : null}

      {hasPosters ? <HomeStoryRail postersLoading={postersLoading} posters={posters} /> : null}

      {renderNewListingsBanner()}

      {/* ── Consolidated status surface — one banner at a time ──
          Priority: offline > sync error > degraded feed.
          Per 2026 research: never stack multiple banners. */}
      {isOffline && feedDataLength > 0 ? (
        <OfflineBanner onRetry={onRetry} />
      ) : hasSyncError ? (
        <SyncRetryBanner
          message="Sync is unavailable. Showing cached items."
          onRetry={onRetry}
          isRetrying={isSyncing || isRefreshing}
          telemetryContext="home_feed_sync"
          containerStyle={styles.feedStatusBanner}
        />
      ) : forYouIsDegraded ? (
        <View style={styles.degradedRow}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} accessible={false} />
          <Text style={styles.degradedText} maxFontSizeMultiplier={1.5}>
            Showing baseline listings — personalised feed is temporarily unavailable.
          </Text>
        </View>
      ) : null}

      {showLoadingSkeleton || showFollowingLoading || showForYouLoading ? (
        renderExploreLoadingState()
      ) : feedDataLength === 0 ? (
        isOffline ? (
          <View style={{ flex: 1 }}>
            <EmptyState
              density="compact"
              icon="cloud-offline-outline"
              title="You are offline"
              subtitle="Connect to the internet to load listings."
              ctaLabel="Retry"
              onCtaPress={onRetry}
              secondaryCtaLabel="Browse cached"
              onSecondaryCtaPress={onBrowse}
            />
          </View>
        ) : feedMode === 'following' && followingError ? (
          <View style={{ flex: 1 }}>
            <EmptyState
              density="compact"
              icon="cloud-offline-outline"
              title="Couldn't load your Following feed"
              subtitle={followingError ?? 'Pull to refresh or browse all listings.'}
              ctaLabel="Retry"
              onCtaPress={onFollowingRefresh}
              secondaryCtaLabel="Browse all"
              onSecondaryCtaPress={onBrowse}
            />
          </View>
        ) : feedMode === 'following' ? (
          <View style={{ flex: 1 }}>
            <EmptyState
              density="compact"
              title={followingHasFollowing ? 'No new drops yet' : 'Follow sellers to see their drops'}
              subtitle={followingHasFollowing
                ? 'Pull to refresh.'
                : 'Tap follow on seller profiles to build your feed.'
              }
              ctaLabel={followingHasFollowing ? 'Refresh' : 'Discover sellers'}
              onCtaPress={followingHasFollowing ? onRetry : onBrowse}
              secondaryCtaLabel={followingHasFollowing ? 'Browse all' : undefined}
              onSecondaryCtaPress={followingHasFollowing ? onBrowse : undefined}
            />
          </View>
        ) : forYouHasError ? (
          <View style={{ flex: 1 }}>
            <EmptyState
              density="compact"
              icon="cloud-offline-outline"
              title="Couldn't load your feed"
              subtitle={forYouError ?? 'Pull to refresh or browse all listings.'}
              ctaLabel="Retry"
              onCtaPress={onForYouRefresh}
              secondaryCtaLabel="Browse all"
              onSecondaryCtaPress={onBrowse}
            />
          </View>
        ) : forYouIsEmpty ? (
          <View style={{ flex: 1 }}>
            <EmptyState
              density="compact"
              icon="thumbs-up-outline"
              title="No recommendations yet"
              subtitle="We're learning what you like. Browse listings and save items to build your feed."
              ctaLabel="Browse all"
              onCtaPress={onBrowse}
              secondaryCtaLabel="Refresh"
              onSecondaryCtaPress={onForYouRefresh}
            />
          </View>
        ) : (
          // Premium empty state — backend returned zero items and we are not
          // loading. Preserves the flagship layout instead of collapsing to
          // a blank masonry. Distinct from the sync-error banner above.
          <View style={{ flex: 1 }}>
            <EmptyState
              density="compact"
              title="No drops live yet"
              subtitle="Pull to refresh or browse categories."
              ctaLabel="Browse all"
              onCtaPress={onBrowse}
              secondaryCtaLabel="Refresh"
              onSecondaryCtaPress={onRetry}
            />
          </View>
        )
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  feedTabBar: {
    minHeight: Control.hit,
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  feedTab: {
    minWidth: 76,
    minHeight: Control.hit,
    paddingHorizontal: Space.xxs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + Space.xxs,
    position: 'relative' },
  feedTabLabel: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
    color: colors.textMuted },
  feedTabLabelActive: {
    fontFamily: FontFamily.semibold,
    color: colors.textPrimary },
  feedTabCount: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: RadiusRoleValue.pillAvatar,
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: TypographyV2.meta.size,
    lineHeight: 20,
    fontFamily: FontFamily.semibold,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceAlt,
    fontVariant: ['tabular-nums'] },
  feedTabCountActive: {
    color: colors.textInverse,
    backgroundColor: colors.textPrimary },
  feedTabIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -1,
    height: 2,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: colors.textPrimary },
  // G2: Quick signal chip styles
  signalRail: {
    maxHeight: 40 },
  signalRailContent: {
    paddingHorizontal: Space.md,
    gap: Space.xs,
    alignItems: 'center' },
  signalChip: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5 },
  signalChipPersonalized: {
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surfaceAlt },
  signalChipActive: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary },
  signalDot: {
    width: 5,
    height: 5,
    borderRadius: Radius.full,
    backgroundColor: colors.brand },
  signalDotActive: {
    backgroundColor: colors.background },
  signalChipText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    color: colors.textSecondary },
  signalChipTextActive: {
    color: colors.background },
  // New home feed editorial header
  editorialHeader: {
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
    gap: Space.xxs },
  editorialEyebrow: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: FontFamily.semibold,
    color: colors.brand,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase' },
  editorialTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing },
  newListingsBannerWrap: {
    marginTop: Space.xs,
    marginBottom: Space.sm + Space.xs,
    paddingHorizontal: Space.md },
  newListingsBanner: {
    alignSelf: 'center',
    minHeight: 40,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + Space.xs,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: colors.brand,
    borderWidth: 0 },
  newListingsBannerContent: {
    gap: Space.xs - Space.xxs },
  newListingsBannerIconWrap: {
    width: 16,
    height: 16,
    borderRadius: RadiusRoleValue.pillAvatar,
    backgroundColor: 'transparent' },
  newListingsBannerText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    color: colors.background,
    letterSpacing: TypographyV2.meta.letterSpacing },
  feedStatusBanner: {
    marginTop: Space.sm,
    marginHorizontal: Space.md,
    marginBottom: Space.xxs },
  degradedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.xs },
  degradedText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },
  exploreLoadingGrid: {
    flexDirection: 'row',
    paddingHorizontal: Space.xs,
    gap: Space.sm },
  exploreLoadingColumn: {
    flex: 1,
    gap: Space.sm },
  // Skeleton tile wrapper: media-only silhouette matching the reduced tile.
  skeletonTileWrap: {
    gap: Space.xs },
});
