import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  StatusBar,
  TextInput,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { StackScreenProps } from '@react-navigation/stack';
import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useToast } from '../context/ToastContext';
import { useBackendData } from '../context/BackendDataContext';
import { useStore } from '../store/useStore';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import { DiscoverySectionHeader } from '../components/discover/DiscoverySectionHeader';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import { Listing } from '../data/mockData';
import { visualSearch } from '../services/listingsApi';
import VisualSearchCamera from '../components/VisualSearchCamera';

type Props = StackScreenProps<RootStackParamList, 'VisualSearch'>;

type ResultStatus = 'idle' | 'loading' | 'populated' | 'empty' | 'error';

export default function VisualSearchScreen({ navigation, route }: Props) {
  const { isDark } = useAppTheme();
  const initialImageUri = route.params?.initialImageUri;
  const { show } = useToast();
  const { listings } = useBackendData();
  const addSavedSearch = useStore((state) => state.addSavedSearch);
  const savedSearches = useStore((state) => state.savedSearches);

  const [imageUri, setImageUri] = useState<string | null>(initialImageUri ?? null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [description, setDescription] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [brand, setBrand] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [status, setStatus] = useState<ResultStatus>('idle');
  const [results, setResults] = useState<Listing[]>([]);
  const [visualMatching, setVisualMatching] = useState(false);
  const [resultNote, setResultNote] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  // Derive available categories from listings for refinement chips.
  const availableCategories = useMemo(() => {
    const categoryMap = new Map<string, number>();
    for (const listing of listings) {
      const cat = (listing.category ?? '').trim();
      if (cat) {
        categoryMap.set(cat, (categoryMap.get(cat) ?? 0) + 1);
      }
    }
    return Array.from(categoryMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([category, count]) => ({ category, count }));
  }, [listings]);

  // Derive brand suggestions from listings (top brands).
  const brandSuggestions = useMemo(() => {
    const brandMap = new Map<string, number>();
    for (const listing of listings) {
      const b = (listing.brand ?? '').trim();
      if (b) {
        brandMap.set(b, (brandMap.get(b) ?? 0) + 1);
      }
    }
    return Array.from(brandMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([b]) => b);
  }, [listings]);

  // Reset preview-failed flag whenever a new image is set.
  useEffect(() => {
    if (imageUri) setPreviewFailed(false);
  }, [imageUri]);

  const handlePhotoCapture = useCallback((uri: string) => {
    setPreviewFailed(false);
    setImageUri(uri);
  }, []);

  const openGallery = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        show('Photo library access required', 'error');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.92,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setPreviewFailed(false);
        setImageUri(result.assets[0].uri);
      }
    } catch {
      show('Could not open photo library', 'error');
    }
  }, [show]);

  const handleRemoveImage = useCallback(() => {
    setPreviewFailed(false);
    setImageUri(null);
    setStatus('idle');
    setResults([]);
    setDescription('');
    setSelectedCategory(null);
    setBrand('');
    setMinPrice('');
    setMaxPrice('');
  }, []);

  // Build the active filter payload from current refinement inputs.
  const buildFilterPayload = useCallback(() => {
    const minPriceNum = minPrice.trim() ? Number(minPrice) : undefined;
    const maxPriceNum = maxPrice.trim() ? Number(maxPrice) : undefined;
    return {
      query: description.trim() || undefined,
      category: selectedCategory ?? undefined,
      brand: brand.trim() || undefined,
      minPrice: typeof minPriceNum === 'number' && !Number.isNaN(minPriceNum) ? minPriceNum : undefined,
      maxPrice: typeof maxPriceNum === 'number' && !Number.isNaN(maxPriceNum) ? maxPriceNum : undefined,
      sort: 'newest' as const,
      limit: 48,
    };
  }, [description, selectedCategory, brand, minPrice, maxPrice]);

  // Client-side fallback filter over cached listings — mirrors BrowseScreen logic.
  const filterCachedListings = useCallback(
    (payload: ReturnType<typeof buildFilterPayload>): Listing[] => {
      const q = (payload.query ?? '').trim().toLowerCase();
      const cat = (payload.category ?? '').trim().toLowerCase();
      const b = (payload.brand ?? '').trim().toLowerCase();
      const min = payload.minPrice;
      const max = payload.maxPrice;

      return listings.filter((listing) => {
        if (cat && (listing.category ?? '').toLowerCase() !== cat) return false;
        if (b && !(listing.brand ?? '').toLowerCase().includes(b)) return false;
        if (typeof min === 'number' && listing.price < min) return false;
        if (typeof max === 'number' && listing.price > max) return false;
        if (q) {
          const searchable = [listing.title, listing.description, listing.brand, listing.category]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!searchable.includes(q)) return false;
        }
        return true;
      });
    },
    [listings]
  );

  // Run the visual search: prefer the backend, fall back to cached listings.
  const runSearch = useCallback(async () => {
    if (!imageUri) return;
    setStatus('loading');
    const payload = buildFilterPayload();

    const apiResult = await visualSearch(payload);
    let items = apiResult.listings;
    let usedFallback = apiResult.source === 'fallback';

    if (apiResult.source === 'fallback' || items.length === 0) {
      // Try client-side filtering over cached listings before declaring empty.
      const cached = filterCachedListings(payload);
      if (cached.length > 0) {
        items = cached;
        usedFallback = true;
      }
    }

    setResults(items);
    setVisualMatching(apiResult.visualMatching);
    setResultNote(
      usedFallback && !apiResult.visualMatching
        ? 'Showing matches from your category, brand, and description filters.'
        : apiResult.note
    );
    setStatus(items.length > 0 ? 'populated' : 'empty');
  }, [imageUri, buildFilterPayload, filterCachedListings]);

  // Auto-run search once a photo is selected (initial coarse result set).
  useEffect(() => {
    if (imageUri && status === 'idle') {
      void runSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUri]);

  // Re-run when refinement inputs change (debounced via the user's explicit "Apply").
  const handleApplyFilters = useCallback(() => {
    if (imageUri) void runSearch();
  }, [imageUri, runSearch]);

  const handleRefresh = useCallback(async () => {
    if (!imageUri) return;
    setRefreshing(true);
    await runSearch();
    setTimeout(() => setRefreshing(false), 400);
  }, [imageUri, runSearch]);

  const handleClearFilters = useCallback(() => {
    setDescription('');
    setSelectedCategory(null);
    setBrand('');
    setMinPrice('');
    setMaxPrice('');
    if (imageUri) {
      // Re-run with cleared filters on next tick to flush state.
      setTimeout(() => void runSearch(), 0);
    }
  }, [imageUri, runSearch]);

  const handleBrowseCategory = useCallback(
    (categoryId: string, categoryTitle: string) => {
      navigation.navigate('Browse', { categoryId, title: categoryTitle });
    },
    [navigation]
  );

  const handlePressItem = useCallback(
    (item: Listing) => {
      navigation.navigate('ItemDetail', { itemId: item.id });
    },
    [navigation]
  );

  // Save-search: mirrors BrowseScreen/GlobalSearchScreen truthfully.
  const saveSearchLabel = useMemo(() => {
    const parts: string[] = [];
    if (description.trim()) parts.push(description.trim());
    else if (selectedCategory) parts.push(selectedCategory);
    if (brand.trim()) parts.push(brand.trim());
    return parts.join(' · ') || 'Visual search';
  }, [description, selectedCategory, brand]);

  const isCurrentSaved = useMemo(() => {
    return savedSearches.some(
      (s) =>
        s.query === saveSearchLabel &&
        (s.filters.category ?? '') === (selectedCategory ?? '') &&
        s.filters.brands.join(',') === (brand.trim() ? [brand.trim()].join(',') : '')
    );
  }, [savedSearches, saveSearchLabel, selectedCategory, brand]);

  const handleSaveSearch = useCallback(() => {
    if (!imageUri) return;
    const minPriceNum = minPrice.trim() ? Number(minPrice) : undefined;
    const maxPriceNum = maxPrice.trim() ? Number(maxPrice) : undefined;
    addSavedSearch({
      query: saveSearchLabel,
      filters: {
        brands: brand.trim() ? [brand.trim()] : [],
        sizes: [],
        condition: 'Any',
        sort: 'Newest',
        category: selectedCategory ?? undefined,
        minPrice: typeof minPriceNum === 'number' && !Number.isNaN(minPriceNum) ? minPriceNum : undefined,
        maxPrice: typeof maxPriceNum === 'number' && !Number.isNaN(maxPriceNum) ? maxPriceNum : undefined,
      },
      alertsEnabled: true,
    });
    show('Search saved with alerts enabled', 'success');
  }, [imageUri, saveSearchLabel, brand, selectedCategory, minPrice, maxPrice, addSavedSearch, show]);

  const hasActiveFilters =
    description.trim().length > 0 ||
    selectedCategory !== null ||
    brand.trim().length > 0 ||
    minPrice.trim().length > 0 ||
    maxPrice.trim().length > 0;

  // ── Visual-query header (photo selected) ──────────────────────────────
  const renderVisualQueryHeader = () => (
    <View style={styles.queryHeader}>
      <View style={styles.queryThumbWrap}>
        {previewFailed ? (
          <View style={styles.queryThumb}>
            <Ionicons name="image-outline" size={24} color={Colors.textMuted} />
          </View>
        ) : (
          <Image
            source={{ uri: imageUri! }}
            style={styles.queryThumb}
            resizeMode="cover"
            onError={() => setPreviewFailed(true)}
          />
        )}
        <AnimatedPressable
          style={styles.queryThumbRemove}
          onPress={handleRemoveImage}
          activeOpacity={0.85}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Remove photo and start over"
        >
          <Ionicons name="close-circle" size={22} color="#fff" />
        </AnimatedPressable>
      </View>

      <View style={styles.queryActions}>
        <AnimatedPressable
          style={styles.queryActionBtn}
          onPress={() => setImageUri(null)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Retake photo with camera"
        >
          <Ionicons name="camera-outline" size={18} color={Colors.textPrimary} />
          <Text style={styles.queryActionText}>Retake</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.queryActionBtn}
          onPress={openGallery}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Replace photo from gallery"
        >
          <Ionicons name="swap-horizontal-outline" size={18} color={Colors.textPrimary} />
          <Text style={styles.queryActionText}>Replace</Text>
        </AnimatedPressable>
      </View>
    </View>
  );

  // ── Multi-modal refinement bar ────────────────────────────────────────
  const renderRefinementBar = () => (
    <View style={styles.refinementWrap}>
      <Text style={styles.refinementLabel}>Describe your photo</Text>
      <View style={styles.textInputWrap}>
        <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={styles.textInputIcon} />
        <TextInput
          style={styles.textInput}
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. black leather jacket"
          placeholderTextColor={Colors.textMuted}
          selectionColor={Colors.brand}
          returnKeyType="search"
          onSubmitEditing={handleApplyFilters}
          accessibilityLabel="Describe the item in your photo"
        />
        {description.length > 0 && (
          <AnimatedPressable onPress={() => setDescription('')} hitSlop={8} accessibilityLabel="Clear description">
            <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
          </AnimatedPressable>
        )}
      </View>

      {availableCategories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryRail}
          contentContainerStyle={styles.categoryRailContent}
        >
          <AnimatedPressable
            style={[styles.categoryPill, !selectedCategory && styles.categoryPillActive]}
            onPress={() => setSelectedCategory(null)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="All categories"
            accessibilityState={{ selected: !selectedCategory }}
          >
            <Text style={[styles.categoryPillText, !selectedCategory && styles.categoryPillTextActive]}>All</Text>
          </AnimatedPressable>
          {availableCategories.map(({ category, count }) => {
            const active = selectedCategory === category;
            return (
              <AnimatedPressable
                key={category}
                style={[styles.categoryPill, active && styles.categoryPillActive]}
                onPress={() => setSelectedCategory(active ? null : category)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${category}, ${count} items`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>{category}</Text>
              </AnimatedPressable>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.filterRow}>
        <View style={styles.filterInputWrap}>
          <Text style={styles.filterInputLabel}>Brand</Text>
          <TextInput
            style={styles.filterInput}
            value={brand}
            onChangeText={setBrand}
            placeholder="Any brand"
            placeholderTextColor={Colors.textMuted}
            selectionColor={Colors.brand}
            returnKeyType="done"
            accessibilityLabel="Filter by brand"
          />
        </View>
        <View style={styles.filterInputWrap}>
          <Text style={styles.filterInputLabel}>Min £</Text>
          <TextInput
            style={styles.filterInput}
            value={minPrice}
            onChangeText={setMinPrice}
            placeholder="0"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
            selectionColor={Colors.brand}
            returnKeyType="done"
            accessibilityLabel="Minimum price in pounds"
          />
        </View>
        <View style={styles.filterInputWrap}>
          <Text style={styles.filterInputLabel}>Max £</Text>
          <TextInput
            style={styles.filterInput}
            value={maxPrice}
            onChangeText={setMaxPrice}
            placeholder="Any"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
            selectionColor={Colors.brand}
            returnKeyType="done"
            accessibilityLabel="Maximum price in pounds"
          />
        </View>
      </View>

      {brandSuggestions.length > 0 && brand.trim().length === 0 && (
        <View style={styles.suggestionRow}>
          <Text style={styles.suggestionLabel}>Popular:</Text>
          {brandSuggestions.slice(0, 4).map((b) => (
            <AnimatedPressable
              key={b}
              style={styles.suggestionChip}
              onPress={() => setBrand(b)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Set brand to ${b}`}
            >
              <Text style={styles.suggestionText}>{b}</Text>
            </AnimatedPressable>
          ))}
        </View>
      )}

      <View style={styles.refinementActions}>
        <AppButton
          title="Apply filters"
          variant="primary"
          size="md"
          onPress={handleApplyFilters}
          style={styles.applyBtn}
        />
        {hasActiveFilters && (
          <AnimatedPressable
            style={styles.clearBtn}
            onPress={handleClearFilters}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </AnimatedPressable>
        )}
      </View>
    </View>
  );

  // ── Honest integrated note ────────────────────────────────────────────
  const renderHonestNote = () => {
    if (!resultNote) return null;
    return (
      <View style={styles.honestNote}>
        <Ionicons name="information-circle-outline" size={16} color={Colors.textSecondary} />
        <Text style={styles.honestNoteText}>{resultNote}</Text>
      </View>
    );
  };

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
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="search-outline" size={36} color={Colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>No items match your photo filters</Text>
      <Text style={styles.emptyText}>
        Try clearing filters, broadening your description, or browse a category instead.
      </Text>
      {hasActiveFilters && (
        <AppButton
          title="Clear filters"
          variant="secondary"
          size="md"
          onPress={handleClearFilters}
          style={styles.emptyAction}
        />
      )}
      {availableCategories.length > 0 && (
        <View style={styles.emptyCategoryRow}>
          {availableCategories.slice(0, 4).map(({ category }) => (
            <AnimatedPressable
              key={category}
              style={styles.emptyCategoryChip}
              onPress={() => handleBrowseCategory(category, category)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Browse ${category} instead`}
            >
              <Text style={styles.emptyCategoryText}>{category}</Text>
            </AnimatedPressable>
          ))}
        </View>
      )}
    </View>
  );

  // ── Error state with retry ────────────────────────────────────────────
  const renderErrorState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="cloud-offline-outline" size={36} color={Colors.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>Couldn't load results</Text>
      <Text style={styles.emptyText}>Check your connection and try again.</Text>
      <AppButton
        title="Retry"
        variant="primary"
        size="md"
        onPress={runSearch}
        style={styles.emptyAction}
      />
    </View>
  );

  // ── Results section ───────────────────────────────────────────────────
  const renderResults = () => {
    if (status === 'loading') {
      return (
        <View style={styles.resultsSection}>
          <DiscoverySectionHeader title="Results" kicker="Searching" />
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
    if (status === 'populated' && results.length > 0) {
      return (
        <View style={styles.resultsSection}>
          <DiscoverySectionHeader
            title="Results"
            kicker={`${results.length} item${results.length === 1 ? '' : 's'}`}
            actionLabel={isCurrentSaved ? 'Saved' : 'Save search'}
            onAction={isCurrentSaved ? undefined : handleSaveSearch}
          />
          {renderHonestNote()}
          <PinterestMasonryGrid
            items={results}
            onPressItem={handlePressItem}
            numColumns={2}
            showSaveButton
            horizontalPadding={0}
          />
        </View>
      );
    }
    return null;
  };

  // When no photo is selected, show the full-screen Google Lens-style camera.
  if (!imageUri) {
    return (
      <>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <VisualSearchCamera
          onPhotoCapture={handlePhotoCapture}
          onGallery={openGallery}
          onClose={() => navigation.goBack()}
          onSavedSearches={() => navigation.navigate('SavedSearches')}
        />
      </>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={Colors.background} />
      <ScreenHeader title="Visual Search" onBack={() => navigation.goBack()} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.brand}
            colors={[Colors.brand]}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <Reanimated.View entering={FadeIn.duration(300)}>
          {renderVisualQueryHeader()}
          {renderRefinementBar()}
          {renderResults()}
        </Reanimated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: Space.md, paddingBottom: Space.xxl },

  // ── Visual-query header ───────────────────────────────────────────────
  queryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.md,
  },
  queryThumbWrap: {
    width: 72,
    height: 72,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
    position: 'relative',
  },
  queryThumb: { width: '100%', height: '100%' },
  queryThumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 11,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queryActions: { flexDirection: 'row', gap: Space.sm },
  queryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  queryActionText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },

  // ── Refinement bar ────────────────────────────────────────────────────
  refinementWrap: {
    marginTop: Space.lg,
    padding: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    gap: Space.sm,
  },
  refinementLabel: {
    fontSize: Type.metaElevated.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    letterSpacing: Type.metaElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  textInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  textInputIcon: { marginRight: 2 },
  textInput: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    padding: 0,
  },

  // ── Category rail ─────────────────────────────────────────────────────
  categoryRail: { marginHorizontal: -4 },
  categoryRailContent: { paddingHorizontal: 4, gap: 8 },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  categoryPillActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  categoryPillText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  categoryPillTextActive: {
    color: Colors.textInverse,
  },

  // ── Filter row ────────────────────────────────────────────────────────
  filterRow: { flexDirection: 'row', gap: 8 },
  filterInputWrap: { flex: 1, gap: 4 },
  filterInputLabel: {
    fontSize: 11,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
    letterSpacing: 0.3,
  },
  filterInput: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
  },

  // ── Brand suggestions ─────────────────────────────────────────────────
  suggestionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  suggestionLabel: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  suggestionChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
  },
  suggestionText: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },

  // ── Refinement actions ────────────────────────────────────────────────
  refinementActions: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginTop: 4 },
  applyBtn: { flex: 1 },
  clearBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
  },
  clearBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },

  // ── Honest note ───────────────────────────────────────────────────────
  honestNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: Space.sm,
    paddingVertical: 10,
    marginBottom: Space.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
  },
  honestNoteText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    lineHeight: 17,
  },

  // ── Results ───────────────────────────────────────────────────────────
  resultsSection: { marginTop: Space.lg },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  skeletonTile: {
    width: '48%',
    flexGrow: 1,
  },

  // ── Empty / error ─────────────────────────────────────────────────────
  emptyState: { alignItems: 'center', gap: Space.sm, paddingVertical: Space.xl, paddingHorizontal: Space.md },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: Radius.full,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xs,
  },
  emptyTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyAction: { marginTop: Space.xs },
  emptyCategoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: Space.sm,
  },
  emptyCategoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  emptyCategoryText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },

  // ── Category chips (capture surface) ──────────────────────────────────
  categoryChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  categoryChipText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  categoryChipCount: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
});
