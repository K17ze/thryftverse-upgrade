import React, { useMemo, useState, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from 'react-native';
// Note: ScrollView is retained for the horizontal subcategory rail only.
// The vertical scroll surface is owned by the FlashList inside PinterestMasonryGrid.
import { useNavigation, useRoute } from '@react-navigation/native';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTaxonomy } from '../context/TaxonomyContext';
import { useBackendData } from '../context/BackendDataContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useAppTheme } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { EmptyState } from '../components/EmptyState';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { Space, Typography, Type, Control, Stroke, Radius } from '../theme/designTokens';
import { useStore, type BrowseSortOption } from '../store/useStore';
import { useHaptic } from '../hooks/useHaptic';

const normalize = (value?: string) =>
  (value ?? '').trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-');

const SORT_OPTIONS: Array<{ value: BrowseSortOption; label: string }> = [
  { value: 'Most liked', label: 'Most liked' },
  { value: 'Newest', label: 'Newest' },
  { value: 'Price: Low to High', label: 'Price: Low to High' },
  { value: 'Price: High to Low', label: 'Price: High to Low' },
];

export default function CategoryDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { listings, isSyncing, lastError, refreshListings } = useBackendData();
  const { colors } = useAppTheme();
  const reducedMotionEnabled = useReducedMotion();
  const categoryId = route.params?.categoryId as string | undefined;
  const browseFilters = useStore((state) => state.browseFilters);
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);
  const haptic = useHaptic();
  const { categories } = useTaxonomy();
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const handleSortSelect = useCallback((sortValue: BrowseSortOption) => {
    updateBrowseFilters({ sort: sortValue });
    setSortMenuOpen(false);
  }, [updateBrowseFilters]);

  const hasActiveFilters =
    browseFilters.brands.length > 0 ||
    browseFilters.sizes.length > 0 ||
    browseFilters.condition !== 'Any' ||
    browseFilters.sustainableOnly ||
    browseFilters.priceMin != null ||
    browseFilters.priceMax != null;

  const category = useMemo(() => {
    const target = normalize(categoryId);
    return categories
      .filter((candidate) => candidate.parentId === null)
      .find(
        (candidate) =>
          normalize(candidate.id) === target || normalize(candidate.name) === target
      );
  }, [categoryId, categories]);

  const subcategories = useMemo(
    () => (category ? categories.filter((candidate) => candidate.parentId === category.id) : []),
    [category, categories],
  );

  const gridData = useMemo(() => {
    if (!category) return [];
    const categoryTokens = new Set([
      normalize(category.id),
      normalize(category.name),
      ...subcategories.flatMap((subcategory) => [
        normalize(subcategory.id),
        normalize(subcategory.name),
      ]),
    ]);

    const selectedBrands = new Set(browseFilters.brands.map((brand) => brand.toLowerCase()));
    const selectedSizes = new Set(browseFilters.sizes.map((size) => size.toLowerCase()));

    const filtered = listings.filter((listing) => {
      const categoryToken = normalize(listing.category);
      const subcategoryToken = normalize(listing.subcategory ?? undefined);
      if (!(categoryTokens.has(categoryToken) || categoryTokens.has(subcategoryToken))) {
        return false;
      }

      // Apply browse filters
      if (selectedBrands.size > 0 && !selectedBrands.has(listing.brand?.toLowerCase() ?? '')) {
        return false;
      }
      if (selectedSizes.size > 0 && !selectedSizes.has(listing.size?.toLowerCase() ?? '')) {
        return false;
      }
      if (browseFilters.condition !== 'Any' && listing.condition !== browseFilters.condition) {
        return false;
      }
      if (browseFilters.priceMin != null && listing.price < browseFilters.priceMin) return false;
      if (browseFilters.priceMax != null && listing.price > browseFilters.priceMax) return false;

      return true;
    });

    // Apply sort
    const sorted = [...filtered];
    switch (browseFilters.sort) {
      case 'Price: Low to High':
        sorted.sort((a, b) => a.price - b.price);
        break;
      case 'Price: High to Low':
        sorted.sort((a, b) => b.price - a.price);
        break;
      case 'Newest':
        sorted.sort((a, b) => {
          const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bDate - aDate;
        });
        break;
      case 'Most liked':
      case 'Recommended':
      default:
        sorted.sort((a, b) => b.likes - a.likes);
        break;
    }

    return sorted;
  }, [category, subcategories, listings, browseFilters.brands, browseFilters.sizes, browseFilters.condition, browseFilters.sort, browseFilters.priceMin, browseFilters.priceMax]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: {
          flex: 1,
        },
        summary: {
          paddingHorizontal: Space.md,
          paddingTop: Space.xs,
          paddingBottom: Space.sm,
          gap: Space.xs,
        },
        count: {
          color: colors.textPrimary,
          fontFamily: Typography.family.semibold,
          fontSize: Type.body.size,
          lineHeight: Type.body.lineHeight,
        },
        categoryRail: {
          paddingHorizontal: Space.md,
          paddingBottom: Space.sm,
          gap: Space.sm,
        },
        categoryChip: {
          paddingHorizontal: Space.sm + 2,
          paddingVertical: Space.sm,
          borderRadius: Radius.full,
          backgroundColor: colors.surface,
          borderWidth: Stroke.hairline,
          borderColor: colors.border,
          minHeight: Control.chrome,
          alignItems: 'center',
          justifyContent: 'center',
        },
        categoryChipText: {
          color: colors.textPrimary,
          fontFamily: Typography.family.medium,
          fontSize: Type.caption.size,
        },
        filterBar: {
          paddingBottom: Space.sm,
        },
        filterRow: {
          paddingHorizontal: Space.md,
          gap: Space.sm,
          alignItems: 'center',
        },
        filterPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Space.xs + 2,
          paddingHorizontal: Space.sm + 2,
          paddingVertical: Space.sm,
          borderRadius: Radius.full,
          backgroundColor: 'transparent',
          minHeight: Control.chrome,
        },
        filterPillActive: {
          backgroundColor: colors.surfaceAlt,
        },
        filterPillText: {
          color: colors.textMuted,
          fontSize: Type.caption.size,
          fontFamily: Typography.family.medium,
        },
        filterPillTextActive: {
          color: colors.textPrimary,
          fontFamily: Typography.family.semibold,
        },
        sortMenu: {
          marginHorizontal: Space.md,
          marginBottom: Space.sm,
          borderRadius: Radius.md,
          overflow: 'hidden',
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        sortMenuItem: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: Space.sm + 2,
          paddingHorizontal: Space.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        sortMenuItemText: {
          fontSize: Type.body.size,
          fontFamily: Typography.family.regular,
          color: colors.textPrimary,
        },
        sortMenuItemTextActive: {
          color: colors.brand,
          fontFamily: Typography.family.semibold,
        },
        grid: {
          flex: 1,
          paddingTop: Space.xs,
        },
        loadingGrid: {
          flex: 1,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: Space.sm,
          paddingHorizontal: Space.md,
        },
        loadingColumn: {
          width: '48%',
          marginBottom: Space.md,
        },
        skeletonLine: {
          marginTop: Space.sm,
        },
        skeletonMeta: {
          marginTop: Space.xs + 2,
        },
        emptyWrap: {
          flex: 1,
          minHeight: Space.xxl * 7 + Space.lg,
          justifyContent: 'center',
        },
      }),
    [colors]
  );

  if (!category) {
    return (
      <FlagshipScreen
        scrollEnabled={false}
        contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
        header={<FlagshipHeader title="Category" onBack={() => navigation.goBack()} />}
      >
        <EmptyState
          icon="grid-outline"
          title="Category unavailable"
          subtitle="This category may have moved. Browse the current marketplace categories instead."
          ctaLabel="Browse marketplace"
          onCtaPress={() =>
            navigation.replace('Browse', { categoryId: 'all', title: 'Browse' })
          }
        />
      </FlagshipScreen>
    );
  }

  const listingCountText = `${gridData.length} ${gridData.length === 1 ? 'listing' : 'listings'}`;
  // "Recommended" is the store default but sorts by likes — display it as
  // "Most liked" so the label is truthful (no recommendation engine exists).
  const displaySort: string = browseFilters.sort === 'Recommended' ? 'Most liked' : browseFilters.sort;

  return (
    <FlagshipScreen
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
      header={
        <FlagshipHeader
          title={category.name}
          subtitle={listingCountText}
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              style={{ width: Control.hit, height: Control.hit, alignItems: 'center', justifyContent: 'center' }}
              onPress={() => navigation.navigate('GlobalSearch')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Search listings"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="search" size={20} color={colors.textPrimary} />
            </AnimatedPressable>
          }
        />
      }
    >
      <View style={styles.content}>
        {/* Subcategory chips — pill-style */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRail}
        >
          {subcategories.map((subcategory) => (
            <AnimatedPressable
              key={subcategory.id}
              style={styles.categoryChip}
              onPress={() =>
                navigation.navigate('Browse', {
                  categoryId: category.id,
                  subcategoryId: subcategory.id,
                  title: subcategory.name,
                })
              }
              activeOpacity={0.7}
              scaleValue={0.97}
              accessibilityRole="button"
              accessibilityLabel={`Browse ${subcategory.name}`}
            >
              <Text style={styles.categoryChipText}>{subcategory.name}</Text>
            </AnimatedPressable>
          ))}
        </ScrollView>

        {/* Sort/filter bar — pill-style matching discovery category bar */}
        <View style={styles.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <AnimatedPressable
              style={[styles.filterPill, hasActiveFilters && styles.filterPillActive]}
              onPress={() => navigation.navigate('Filter', { categoryId: category.id, title: category.name })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Open filters"
              accessibilityState={{ selected: hasActiveFilters }}
              accessibilityHint={hasActiveFilters ? 'Filters are applied' : 'Opens filter options'}
            >
              <Ionicons name="options-outline" size={14} color={hasActiveFilters ? colors.textPrimary : colors.textMuted} />
              <Text style={[styles.filterPillText, hasActiveFilters && styles.filterPillTextActive]}>
                {hasActiveFilters ? 'Filter on' : 'Filter'}
              </Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.filterPill, browseFilters.sort !== 'Recommended' && styles.filterPillActive]}
              onPress={() => setSortMenuOpen((v) => !v)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Sort by ${displaySort}`}
              accessibilityState={{ expanded: sortMenuOpen }}
            >
              <Ionicons name="swap-vertical" size={14} color={browseFilters.sort !== 'Recommended' ? colors.textPrimary : colors.textMuted} />
              <Text style={[styles.filterPillText, browseFilters.sort !== 'Recommended' && styles.filterPillTextActive]}>
                {displaySort}
              </Text>
              <Ionicons name={sortMenuOpen ? 'chevron-up' : 'chevron-down'} size={12} color={browseFilters.sort !== 'Recommended' ? colors.textPrimary : colors.textMuted} />
            </AnimatedPressable>
            {browseFilters.condition !== 'Any' && (
              <AnimatedPressable
                style={[styles.filterPill, styles.filterPillActive]}
                onPress={() => navigation.navigate('Filter', { categoryId: category.id, title: category.name })}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Condition: ${browseFilters.condition}`}
              >
                <Text style={[styles.filterPillText, styles.filterPillTextActive]}>{browseFilters.condition}</Text>
              </AnimatedPressable>
            )}
            {browseFilters.sustainableOnly && (
              <AnimatedPressable
                style={[styles.filterPill, styles.filterPillActive]}
                onPress={() => { haptic.light(); updateBrowseFilters({ sustainableOnly: false }); }}
                activeOpacity={0.85}
                accessibilityRole="switch"
                accessibilityState={{ checked: browseFilters.sustainableOnly }}
                accessibilityLabel="Toggle sustainable items only"
              >
                <Ionicons name="leaf" size={14} color={colors.textPrimary} />
                <Text style={[styles.filterPillText, styles.filterPillTextActive]}>Sustainable</Text>
              </AnimatedPressable>
            )}
          </ScrollView>
        </View>

        {sortMenuOpen ? (
          <View style={styles.sortMenu}>
            {SORT_OPTIONS.map((opt, idx) => {
              const isActive = browseFilters.sort === opt.value ||
                (browseFilters.sort === 'Recommended' && opt.value === 'Most liked');
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => handleSortSelect(opt.value)}
                  style={[styles.sortMenuItem, idx === SORT_OPTIONS.length - 1 && { borderBottomWidth: 0 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Sort by ${opt.label}`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[styles.sortMenuItemText, isActive && styles.sortMenuItemTextActive]}>
                    {opt.label}
                  </Text>
                  {isActive ? <Ionicons name="checkmark" size={16} color={colors.brand} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {isSyncing && gridData.length === 0 ? (
          <View style={styles.loadingGrid} accessibilityLabel="Loading category listings">
            {Array.from({ length: 4 }).map((_, index) => (
              <View key={index} style={styles.loadingColumn}>
                <SkeletonLoader width="100%" height={index % 2 === 0 ? 220 : 180} borderRadius={Radius.lg} />
                <SkeletonLoader width="78%" height={14} borderRadius={Radius.sm} style={styles.skeletonLine} />
                <SkeletonLoader width="46%" height={12} borderRadius={Radius.sm} style={styles.skeletonMeta} />
              </View>
            ))}
          </View>
        ) : gridData.length > 0 ? (
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(220)} style={styles.grid}>
            <PinterestMasonryGrid
              items={gridData}
              onPressItem={(item) =>
                navigation.push('ItemDetail', { itemId: item.id })
              }
              numColumns={2}
              showSaveButton
              enableEntranceAnimation
            />
          </Reanimated.View>
        ) : hasActiveFilters ? (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon="filter-outline"
              title="No items match your filters"
              subtitle="Try adjusting your filters or clearing them."
              ctaLabel="Clear filters"
              onCtaPress={() => {
                updateBrowseFilters({
                  brands: [],
                  sizes: [],
                  condition: 'Any',
                  sustainableOnly: false,
                  priceMin: null,
                  priceMax: null,
                  sort: 'Recommended',
                });
              }}
            />
          </View>
        ) : (
          <View style={styles.emptyWrap}>
            <EmptyState
              icon={lastError ? 'cloud-offline-outline' : 'shirt-outline'}
              title={lastError ? 'Couldn’t load listings' : 'No listings yet'}
              subtitle={
                lastError
                  ? 'Check your connection and try loading this category again.'
                  : `New ${category.name.toLocaleLowerCase()} listings will appear here as sellers publish them.`
              }
              ctaLabel={lastError ? 'Try again' : 'Browse all'}
              onCtaPress={
                lastError
                  ? refreshListings
                  : () =>
                      navigation.navigate('Browse', {
                        categoryId: 'all',
                        title: 'Browse',
                      })
              }
            />
          </View>
        )}
      </View>
    </FlagshipScreen>
  );
}

