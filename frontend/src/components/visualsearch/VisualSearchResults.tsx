import React from 'react';
import { View, Text, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { AppButton } from '../ui/AppButton';
import { EmptyState } from '../EmptyState';
import { PinterestMasonryGrid } from '../discover/PinterestMasonryGrid';
import { DiscoverySectionHeader } from '../discover/DiscoverySectionHeader';
import { PremiumSkeletonTile } from '../discover/PremiumSkeletonTile';
import type { Listing } from '../../domain';
import type { ResultStatus } from './visualSearchTypes';
import { createVisualSearchStyles } from './visualSearchStyles';

interface Props {
  status: ResultStatus;
  results: Listing[];
  honestNoteText?: string;
  refreshing: boolean;
  onRefresh: () => void;
  onPressItem: (item: Listing) => void;
  isCurrentSaved: boolean;
  onSaveSearch: () => void;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  availableCategories: Array<{ category: string; count: number }>;
  onBrowseCategory: (categoryId: string, categoryTitle: string) => void;
  onRetry: () => void;
}

// ── Results section ───────────────────────────────────────────────────────
// Status machine: loading → skeleton grid (kicker "Matching colours" —
// honest about the heuristic method, never "Analyzing image"), empty →
// recovery state, error → retry, offline/partial → cached-result banners,
// populated → masonry grid. Save-search action labels the current scope.
function VisualSearchResultsBase({
  status,
  results,
  honestNoteText,
  refreshing,
  onRefresh,
  onPressItem,
  isCurrentSaved,
  onSaveSearch,
  hasActiveFilters,
  onClearFilters,
  availableCategories,
  onBrowseCategory,
  onRetry,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createVisualSearchStyles(colors), [colors]);

  // ── Loading skeleton grid ─────────────────────────────────────────────
  const renderSkeletonGrid = () => (
    <View style={styles.skeletonGrid}>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={[
            styles.skeletonTile,
            { aspectRatio: i % 2 === 0 ? 0.8 : 1.2 },
          ]}
        >
          <PremiumSkeletonTile width="100%" height="100%" borderRadius={Radius.lg} />
        </View>
      ))}
    </View>
  );

  // ── Empty / filtered-empty recovery ───────────────────────────────────
  const renderEmptyState = () => (
    <EmptyState
      icon="eye-outline"
      title="No matches found"
      subtitle="Try clearing filters or broadening your description."
      {...(hasActiveFilters
        ? { ctaLabel: 'Clear filters', onCtaPress: onClearFilters }
        : {})}
      {...(availableCategories.length > 0
        ? {
            suggestedActions: availableCategories.slice(0, 4).map(({ category }) => ({
              label: category,
              onPress: () => onBrowseCategory(category, category) })) }
        : {})}
    />
  );

  // ── Error state with retry ────────────────────────────────────────────
  const renderErrorState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="cloud-offline-outline" size={36} color={colors.textMuted} accessible={false} aria-hidden={true} />
      <Text style={styles.emptyTitle}>Couldn't load results</Text>
      <Text style={styles.emptyText}>Check your connection and try again.</Text>
      <AppButton
        title="Retry"
        variant="primary"
        size="md"
        onPress={onRetry}
        style={styles.emptyAction}
      />
    </View>
  );

  const renderOfflineBanner = () => (
    <View style={styles.offlineBanner}>
      <Ionicons name="cloud-offline-outline" size={16} color={colors.textSecondary} accessible={false} aria-hidden={true} />
      <Text style={styles.offlineBannerText}>Offline — showing cached results</Text>
    </View>
  );

  const renderPartialIndicator = () => (
    <View style={styles.partialIndicator}>
      <Ionicons name="save-outline" size={14} color={colors.textMuted} accessible={false} aria-hidden={true} />
      <Text style={styles.partialIndicatorText}>Some results from your saved data</Text>
    </View>
  );

  const renderHonestNote = () => {
    if (!honestNoteText) return null;
    return (
      <View style={styles.honestNote}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} accessible={false} aria-hidden={true} />
        <Text style={styles.honestNoteText}>{honestNoteText}</Text>
      </View>
    );
  };

  const renderGrid = () => (
    <PinterestMasonryGrid
      items={results}
      onPressItem={onPressItem}
      numColumns={2}
      showSaveButton
      horizontalPadding={Space.md}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.brand}
          colors={[colors.brand]}
        />
      }
    />
  );

  const renderHeader = () => (
    <DiscoverySectionHeader
      title="Results"
      kicker={`${results.length} item${results.length === 1 ? '' : 's'}`}
      actionLabel={isCurrentSaved ? 'Saved' : 'Save search'}
      onAction={isCurrentSaved ? undefined : onSaveSearch}
    />
  );

  if (status === 'loading') {
    return (
      <View style={styles.resultsSection}>
        <DiscoverySectionHeader title="Results" kicker="Matching colours…" />
        {renderSkeletonGrid()}
      </View>
    );
  }
  if (status === 'empty') {
    return (
      <View style={styles.resultsSection}>
        <DiscoverySectionHeader title="Results" kicker="No matches" />
        {renderEmptyState()}
      </View>
    );
  }
  if (status === 'error') {
    return (
      <View style={styles.resultsSection}>
        <DiscoverySectionHeader title="Results" kicker="Error" />
        {renderErrorState()}
      </View>
    );
  }
  if (status === 'offline' && results.length > 0) {
    return (
      <View style={styles.resultsSection}>
        {renderHeader()}
        {renderOfflineBanner()}
        {renderHonestNote()}
        {renderGrid()}
      </View>
    );
  }
  if (status === 'partial' && results.length > 0) {
    return (
      <View style={styles.resultsSection}>
        {renderHeader()}
        {renderPartialIndicator()}
        {renderHonestNote()}
        {renderGrid()}
      </View>
    );
  }
  if (status === 'populated' && results.length > 0) {
    return (
      <View style={styles.resultsSection}>
        {renderHeader()}
        {renderHonestNote()}
        {renderGrid()}
      </View>
    );
  }
  return null;
}

const VisualSearchResults = React.memo(VisualSearchResultsBase);
VisualSearchResults.displayName = 'VisualSearchResults';
export { VisualSearchResults };
