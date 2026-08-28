import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TextInput,
  RefreshControl,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { Space, Radius, Type, Typography, Control, LetterSpacing } from '../theme/designTokens';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppButton } from '../components/ui/AppButton';
import { EmptyState } from '../components/EmptyState';
import { useToast } from '../context/ToastContext';
import { useBackendData } from '../context/BackendDataContext';
import { useStore } from '../store/useStore';
import { PinterestMasonryGrid } from '../components/discover/PinterestMasonryGrid';
import { DiscoverySectionHeader } from '../components/discover/DiscoverySectionHeader';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import type { Listing } from '../domain';
import { visualSearch } from '../services/listingsApi';
import VisualSearchCamera from '../components/VisualSearchCamera';
import { useFormattedPrice } from '../hooks/useFormattedPrice';

type Props = NativeStackScreenProps<RootStackParamList, 'VisualSearch'>;

type ResultStatus = 'idle' | 'loading' | 'populated' | 'empty' | 'error' | 'offline' | 'partial';

export default function VisualSearchScreen({ navigation, route }: Props) {
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();
  const reducedMotionEnabled = useReducedMotion();
  const haptic = useHaptic();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const [similarityMethod, setSimilarityMethod] = useState<string | undefined>(undefined);
  const [resultNote, setResultNote] = useState<string | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);

  // ── Request sequencing ──────────────────────────────────────────────
  // Monotonic sequence counter ensures a newer crop/filter/refresh request
  // can never be overwritten by a stale response from an older one. Each
  // runSearch increments the counter and captures its sequence number; only
  // the response matching the latest sequence is applied to state.
  // An AbortController cancels the in-flight HTTP request when a newer
  // search starts, so stale fetches don't consume bandwidth or race.
  const requestSequenceRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

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
    haptic.medium();
    setPreviewFailed(false);
    setImageUri(uri);
  }, [haptic]);

  const openGallery = useCallback(async () => {
    haptic.selection();
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
        haptic.light();
        setPreviewFailed(false);
        setImageUri(result.assets[0].uri);
      }
    } catch {
      show('Could not open photo library', 'error');
    }
  }, [haptic, show]);

  const handleRemoveImage = useCallback(() => {
    haptic.warning();
    setPreviewFailed(false);
    setImageUri(null);
    setStatus('idle');
    setResults([]);
    setDescription('');
    setSelectedCategory(null);
    setBrand('');
    setMinPrice('');
    setMaxPrice('');
  }, [haptic]);

  const buildFilterPayload = useCallback(() => {
    const minPriceNum = minPrice.trim() ? Number(minPrice) : undefined;
    const maxPriceNum = maxPrice.trim() ? Number(maxPrice) : undefined;
    return {
      query: description.trim() || undefined,
      category: selectedCategory ?? undefined,
      brand: brand.trim() || undefined,
      minPrice: typeof minPriceNum === 'number' && !Number.isNaN(minPriceNum) ? minPriceNum : undefined,
      maxPrice: typeof maxPriceNum === 'number' && !Number.isNaN(maxPriceNum) ? maxPriceNum : undefined,
      sort: 'similarity' as const,
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

  // Read a local image URI as a base64 string for the backend. Remote/data
  // URIs are passed through as-is via imageUrl where possible. Returns null
  // when the file cannot be read (the backend then falls back to filter-only).
  const readImageAsBase64 = useCallback(async (uri: string): Promise<string | null> => {
    if (/^data:/i.test(uri)) {
      return uri;
    }
    if (/^https?:/i.test(uri)) {
      return null;
    }
    try {
      return await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch {
      return null;
    }
  }, []);

  // Run the visual search: prefer the backend, fall back to cached listings.
  // Uses a monotonic sequence + AbortController so a newer request never gets
  // overwritten by a stale response from an older one. Sets 'error' state
  // when the backend call fails AND the client-side fallback also produces
  // nothing — the error state was previously unreachable.
  const runSearch = useCallback(async () => {
    if (!imageUri) return;
    // Cancel any in-flight request from a previous search.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const mySequence = ++requestSequenceRef.current;
    setStatus('loading');
    const payload = buildFilterPayload();

    const isRemote = /^https?:/i.test(imageUri);
    const imageBase64 = isRemote ? null : await readImageAsBase64(imageUri);
    let apiResult;
    try {
      apiResult = await visualSearch({
        ...payload,
        imageBase64: imageBase64 ?? undefined,
        imageUrl: isRemote ? imageUri : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (!isMountedRef.current || mySequence !== requestSequenceRef.current) return;
      // Network/parse failure — try cached listings before declaring error.
      const cached = filterCachedListings(payload);
      if (cached.length > 0) {
        setResults(cached);
        setVisualMatching(false);
        setSimilarityMethod('filter_only');
        setResultNote('Showing matches from your filters (offline).');
        setStatus('offline');
      } else {
        setStatus('error');
      }
      return;
    }

    // Drop stale responses — a newer crop/filter/refresh may have started.
    if (!isMountedRef.current || mySequence !== requestSequenceRef.current) return;

    let items: Listing[] = apiResult.listings;
    let usedFallback = apiResult.source === 'fallback';

    if (apiResult.source === 'fallback' || items.length === 0) {
      const cached = filterCachedListings(payload);
      if (cached.length > 0) {
        items = cached;
        usedFallback = true;
      }
    }

    // If the backend returned an explicit error AND no items AND the cached
    // fallback also produced nothing, show the error state — not empty.
    if (apiResult.error && items.length === 0 && !usedFallback) {
      setStatus('error');
      return;
    }

    setResults(items);
    setVisualMatching(apiResult.visualMatching);
    setSimilarityMethod(apiResult.similarityMethod);
    setResultNote(
      usedFallback && !apiResult.visualMatching
        ? 'Showing matches from your category, brand, and description filters.'
        : apiResult.note
    );
    const isPartial = usedFallback && (!!apiResult.error || apiResult.source === 'fallback');
    setStatus(items.length > 0 ? (isPartial ? 'partial' : 'populated') : 'empty');
  }, [imageUri, buildFilterPayload, filterCachedListings, readImageAsBase64]);

  // Auto-run search once a photo is selected (initial coarse result set).
  useEffect(() => {
    if (imageUri && status === 'idle') {
      void runSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUri]);

  const handleApplyFilters = useCallback(() => {
    haptic.medium();
    if (imageUri) void runSearch();
  }, [haptic, imageUri, runSearch]);

  const handleRefresh = useCallback(async () => {
    if (!imageUri) return;
    setRefreshing(true);
    await runSearch();
    setTimeout(() => { if (isMountedRef.current) setRefreshing(false); }, 400);
  }, [imageUri, runSearch]);

  const handleClearFilters = useCallback(() => {
    haptic.light();
    setDescription('');
    setSelectedCategory(null);
    setBrand('');
    setMinPrice('');
    setMaxPrice('');
    if (imageUri) {
      setTimeout(() => void runSearch(), 0);
    }
  }, [haptic, imageUri, runSearch]);

  const handleBrowseCategory = useCallback(
    (categoryId: string, categoryTitle: string) => {
      haptic.selection();
      navigation.navigate('Browse', { categoryId, title: categoryTitle });
    },
    [haptic, navigation]
  );

  const handlePressItem = useCallback(
    (item: Listing) => {
      navigation.navigate('ItemDetail', { itemId: item.id });
    },
    [navigation]
  );

  // Save-search: stores text/facet filters truthfully. Visual query images
  // are not yet persisted as a durable query representation, so alerts are
  // disabled — enabling alerts on a visual search with no retained image
  // would be deceptive (the alert would match on text/facets only, not the
  // photo). When a retained visual-query contract exists, this can be
  // upgraded to alertsEnabled: true with a clear disclosure.
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
    haptic.success();
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
      alertsEnabled: false,
    });
    show('Search saved (alerts off — visual alerts coming soon)', 'success');
  }, [imageUri, saveSearchLabel, brand, selectedCategory, minPrice, maxPrice, addSavedSearch, show, haptic]);

  const hasActiveFilters =
    description.trim().length > 0 ||
    selectedCategory !== null ||
    brand.trim().length > 0 ||
    minPrice.trim().length > 0 ||
    maxPrice.trim().length > 0;

  // ── Visual-query header (photo selected) ──────────────────────────────
  // No scanline animation or corner brackets — the backend is a colour
  // heuristic, not AI. A loading indicator on the thumbnail would imply
  // ML analysis that isn't happening. The honest loading state is a
  // progress label on the results section, not AI theatre on the photo.
  const renderVisualQueryHeader = () => (
    <View style={styles.queryHeader}>
      <View style={styles.queryThumbWrap}>
        {previewFailed ? (
          <View style={styles.queryThumb}>
            <Ionicons name="image-outline" size={24} color={colors.textMuted} />
          </View>
        ) : (
          <Image
            source={{ uri: imageUri! }}
            style={styles.queryThumb}
            resizeMode="cover"
            onError={() => setPreviewFailed(true)}
            accessibilityLabel="Your selected image for visual search"
            accessibilityRole="image"
          />
        )}
        <AnimatedPressable
          style={styles.queryThumbRemove}
          onPress={handleRemoveImage}
          activeOpacity={0.85}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Remove photo and start over"
          accessibilityHint="Removes the photo and returns to the camera"
        >
          <Ionicons name="close-circle" size={22} color="#fff" />
        </AnimatedPressable>
      </View>

      <View style={styles.queryActions}>
        <AnimatedPressable
          style={styles.queryActionBtn}
          onPress={() => { haptic.selection(); setImageUri(null); }}
          activeOpacity={0.85}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Retake photo with camera"
          accessibilityHint="Returns to the camera to capture a new photo"
        >
          <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
          <Text style={styles.queryActionText}>Retake</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.queryActionBtn}
          onPress={openGallery}
          activeOpacity={0.85}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Replace photo from gallery"
          accessibilityHint="Opens your photo library to pick a different image"
        >
          <Ionicons name="swap-horizontal-outline" size={18} color={colors.textPrimary} />
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
        <Ionicons name="search-outline" size={18} color={colors.textMuted} style={styles.textInputIcon} />
        <TextInput
          style={styles.textInput}
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. black leather jacket"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.brand}
          returnKeyType="search"
          onSubmitEditing={handleApplyFilters}
          accessibilityLabel="Describe the item in your photo"
        />
        {description.length > 0 && (
          <AnimatedPressable onPress={() => { haptic.light(); setDescription(''); }} hitSlop={12} accessibilityLabel="Clear description" accessibilityRole="button" accessibilityHint="Clears the description text">
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
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
            onPress={() => { haptic.selection(); setSelectedCategory(null); }}
            activeOpacity={0.85}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="All categories"
            accessibilityHint="Clears the category filter to show all categories"
            accessibilityState={{ selected: !selectedCategory }}
          >
            <Text style={[styles.categoryPillText, !selectedCategory && styles.categoryPillTextActive]}>All</Text>
          </AnimatedPressable>
          {availableCategories.map(({ category, count }, idx) => {
            const active = selectedCategory === category;
            return (
              <AnimatedPressable
                key={`vscat-${idx}-${category}`}
                style={[styles.categoryPill, active && styles.categoryPillActive]}
                onPress={() => { haptic.selection(); setSelectedCategory(active ? null : category); }}
                activeOpacity={0.85}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${category}, ${count} items`}
                accessibilityHint={`Filters results to ${category} category`}
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
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.brand}
            returnKeyType="done"
            accessibilityLabel="Filter by brand"
          />
        </View>
        <View style={styles.filterInputWrap}>
          <Text style={styles.filterInputLabel}>Min {currencySymbol}</Text>
          <TextInput
            style={styles.filterInput}
            value={minPrice}
            onChangeText={setMinPrice}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            selectionColor={colors.brand}
            returnKeyType="done"
            accessibilityLabel="Minimum price in pounds"
          />
        </View>
        <View style={styles.filterInputWrap}>
          <Text style={styles.filterInputLabel}>Max {currencySymbol}</Text>
          <TextInput
            style={styles.filterInput}
            value={maxPrice}
            onChangeText={setMaxPrice}
            placeholder="Any"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            selectionColor={colors.brand}
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
              onPress={() => { haptic.selection(); setBrand(b); }}
              activeOpacity={0.85}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={`Set brand to ${b}`}
              accessibilityHint={`Filters results to ${b} brand`}
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
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
            accessibilityHint="Resets all filter fields and re-runs the search"
          >
            <Text style={styles.clearBtnText}>Clear</Text>
          </AnimatedPressable>
        )}
      </View>
    </View>
  );

  // ── Honest integrated note ────────────────────────────────────────────
  // Labels the matching method truthfully. Never claims AI/ML when the
  // backend used a deterministic colour-and-layout heuristic.
  const honestNoteText = useMemo(() => {
    if (similarityMethod === 'heuristic_color_features') {
      return 'Results matched by colour similarity (heuristic, not AI).';
    }
    if (similarityMethod === 'filter_only') {
      return resultNote ?? 'Results matched by category, brand & description.';
    }
    return resultNote;
  }, [similarityMethod, resultNote]);

  const renderHonestNote = () => {
    if (!honestNoteText) return null;
    return (
      <View style={styles.honestNote}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.honestNoteText}>{honestNoteText}</Text>
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
    <EmptyState
      icon="eye-outline"
      title="No matches found"
      subtitle="Try clearing filters, broadening your description, or browse a category instead."
      {...(hasActiveFilters
        ? { ctaLabel: 'Clear filters', onCtaPress: handleClearFilters }
        : {})}
      {...(availableCategories.length > 0
        ? {
            suggestedActions: availableCategories.slice(0, 4).map(({ category }) => ({
              label: category,
              onPress: () => handleBrowseCategory(category, category),
            })),
          }
        : {})}
    />
  );

  // ── Error state with retry ────────────────────────────────────────────
  const renderErrorState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="cloud-offline-outline" size={36} color={colors.textMuted} />
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
  // Loading kicker says "Matching colours" — honest about the heuristic
  // method, never "Analyzing image" which implies AI/ML analysis.
  const renderOfflineBanner = () => (
    <View style={styles.offlineBanner}>
      <Ionicons name="cloud-offline-outline" size={16} color={colors.textSecondary} />
      <Text style={styles.offlineBannerText}>Offline — showing cached results</Text>
    </View>
  );

  const renderPartialIndicator = () => (
    <View style={styles.partialIndicator}>
      <Ionicons name="save-outline" size={14} color={colors.textMuted} />
      <Text style={styles.partialIndicatorText}>Some results from your saved data</Text>
    </View>
  );

  const renderResults = () => {
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
          <DiscoverySectionHeader
            title="Results"
            kicker={`${results.length} item${results.length === 1 ? '' : 's'}`}
            actionLabel={isCurrentSaved ? 'Saved' : 'Save search'}
            onAction={isCurrentSaved ? undefined : handleSaveSearch}
          />
          {renderOfflineBanner()}
          {renderHonestNote()}
          <PinterestMasonryGrid
            items={results}
            onPressItem={handlePressItem}
            numColumns={2}
            showSaveButton
            horizontalPadding={Space.md}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.brand}
                colors={[colors.brand]}
              />
            }
          />
        </View>
      );
    }
    if (status === 'partial' && results.length > 0) {
      return (
        <View style={styles.resultsSection}>
          <DiscoverySectionHeader
            title="Results"
            kicker={`${results.length} item${results.length === 1 ? '' : 's'}`}
            actionLabel={isCurrentSaved ? 'Saved' : 'Save search'}
            onAction={isCurrentSaved ? undefined : handleSaveSearch}
          />
          {renderPartialIndicator()}
          {renderHonestNote()}
          <PinterestMasonryGrid
            items={results}
            onPressItem={handlePressItem}
            numColumns={2}
            showSaveButton
            horizontalPadding={Space.md}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.brand}
                colors={[colors.brand]}
              />
            }
          />
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
            horizontalPadding={Space.md}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.brand}
                colors={[colors.brand]}
              />
            }
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
        <StatusBar style="light" />
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
    <FlagshipScreen
      header={
        <FlagshipHeader title="Visual Search" onBack={() => navigation.goBack()} />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
      <View style={styles.screenRoot}>
        <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeIn.duration(300)} style={styles.headerSection}>
          {renderVisualQueryHeader()}
          {renderRefinementBar()}
        </Reanimated.View>
        <View style={styles.resultsSection}>
          {renderResults()}
        </View>
      </View>
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  scroll: { paddingHorizontal: Space.md, paddingBottom: Space.xxl },
  screenRoot: { flex: 1 },
  headerSection: { paddingHorizontal: Space.md },

  // ── Visual-query header ───────────────────────────────────────────────
  queryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    marginTop: Space.md,
  },
  queryThumbWrap: {
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
    position: 'relative',
  },
  queryThumb: { width: '100%', height: '100%' },
  queryThumbRemove: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: Radius.lg,
    width: Control.icon,
    height: Control.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queryActions: { flexDirection: 'row', gap: Space.sm },
  queryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  queryActionText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
  },

  // ── Refinement bar ────────────────────────────────────────────────────
  refinementWrap: {
    marginTop: Space.lg,
    padding: Space.md,
    borderRadius: Radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: Space.sm,
  },
  refinementLabel: {
    fontSize: Type.label.size,
    fontFamily: Typography.family.semibold,
    color: colors.textSecondary,
    letterSpacing: Type.label.letterSpacing,
    textTransform: 'uppercase',
  },
  textInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.smMd,
    paddingVertical: Space.smMd,
    borderRadius: Radius.md,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  textInputIcon: { marginRight: 2 },
  textInput: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
    padding: 0,
  },

  // ── Category rail ─────────────────────────────────────────────────────
  categoryRail: { marginHorizontal: -Space.xs },
  categoryRailContent: { paddingHorizontal: Space.xs, gap: Space.sm },
  categoryPill: {
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  categoryPillActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  categoryPillText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
  },
  categoryPillTextActive: {
    color: colors.textInverse,
  },

  // ── Filter row ────────────────────────────────────────────────────────
  filterRow: { flexDirection: 'row', gap: Space.sm },
  filterInputWrap: { flex: 1, gap: Space.xs },
  filterInputLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    color: colors.textMuted,
    letterSpacing: LetterSpacing.wide + 0.18,
  },
  filterInput: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: Radius.md,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
  },

  // ── Brand suggestions ─────────────────────────────────────────────────
  suggestionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Space.xs + 2 },
  suggestionLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  suggestionChip: {
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs / 2 + 1,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
  },
  suggestionText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
  },

  // ── Refinement actions ────────────────────────────────────────────────
  refinementActions: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginTop: Space.xs },
  applyBtn: { flex: 1 },
  clearBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd,
    borderRadius: Radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  clearBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
  },

  // ── Honest note ───────────────────────────────────────────────────────
  honestNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    marginBottom: Space.sm,
    backgroundColor: colors.surface,
    borderRadius: Radius.md,
  },
  honestNoteText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    lineHeight: Type.caption.size + 3,
  },

  // ── Offline / partial banners ─────────────────────────────────────────
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs + 2,
    marginBottom: Space.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  offlineBannerText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
  },
  partialIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.xs + 2,
    paddingVertical: Space.xs,
    marginBottom: Space.sm,
  },
  partialIndicatorText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },

  // ── Results ───────────────────────────────────────────────────────────
  resultsSection: { flex: 1, marginTop: Space.lg },
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
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.xs,
  },
  emptyTitle: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: Type.caption.size + 4,
  },
  emptyAction: { marginTop: Space.xs },

  // ── Category chips (capture surface) ──────────────────────────────────
  categoryChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.xxl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  categoryChipText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textPrimary,
  },
  categoryChipCount: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  });
}
