import React, { useState, useEffect } from 'react';
import {
  AnimatedPressable,
} from '../components/AnimatedPressable';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  StatusBar,
  Platform,
  Dimensions,
  Pressable,
  TextInput,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../theme/ThemeContext';
import { Typography } from '../theme/designTokens';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useBackendData } from '../context/BackendDataContext';
import { SyncStatusPill } from '../components/SyncStatusPill';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { SyncRetryBanner } from '../components/SyncRetryBanner';
import { getBackendSyncStatus } from '../utils/syncStatus';
import { AppButton } from '../components/ui/AppButton';
import { AppSegmentControl } from '../components/ui/AppSegmentControl';
import { useToast } from '../context/ToastContext';
import { useSettingsPreferences } from '../context/SettingsPreferencesContext';
import { haptics } from '../utils/haptics';

const { height, width } = Dimensions.get('window');
const SNAP_HALF = height * 0.5;
const SNAP_FULL = height * 0.1;
const OVERLAY_BG = 'rgba(0,0,0,0.45)';

type SortOption = 'Recommended' | 'Newest' | 'Price: Low to High' | 'Price: High to Low';
type ConditionOption = 'Any' | 'New with tags' | 'Very good' | 'Good' | 'Satisfactory';
type FilterRoute = RouteProp<RootStackParamList, 'Filter'>;

const SORT_OPTIONS: Array<{ value: SortOption; label: string; accessibilityLabel: string }> = [
  { value: 'Recommended', label: 'Recommended', accessibilityLabel: 'Sort by recommended' },
  { value: 'Newest', label: 'Newest', accessibilityLabel: 'Sort by newest items' },
  { value: 'Price: Low to High', label: 'Price: Low to High', accessibilityLabel: 'Sort by price low to high' },
  { value: 'Price: High to Low', label: 'Price: High to Low', accessibilityLabel: 'Sort by price high to low' },
];

const CONDITION_OPTIONS: Array<{ value: ConditionOption; label: string; accessibilityLabel: string }> = [
  { value: 'Any', label: 'Any', accessibilityLabel: 'Filter any condition' },
  { value: 'New with tags', label: 'New with tags', accessibilityLabel: 'Filter new with tags' },
  { value: 'Very good', label: 'Very good', accessibilityLabel: 'Filter very good condition' },
  { value: 'Good', label: 'Good', accessibilityLabel: 'Filter good condition' },
  { value: 'Satisfactory', label: 'Satisfactory', accessibilityLabel: 'Filter satisfactory condition' },
];

const toKey = (value: string) => value.trim().toLowerCase();

function getSubcategoryToken(categoryId: string, subcategoryId?: string, title?: string) {
  if (subcategoryId) {
    return subcategoryId
      .toLowerCase()
      .replace(/^[^-]+-/, '')
      .replace(/-/g, ' ')
      .trim();
  }

  if (!title) {
    return '';
  }

  const loweredTitle = title.toLowerCase().replace(/["']/g, '').trim();
  if (loweredTitle.startsWith('all ')) {
    return '';
  }

  const cleanedCategoryId = categoryId.toLowerCase();
  if (loweredTitle.startsWith(cleanedCategoryId)) {
    return loweredTitle.slice(cleanedCategoryId.length).trim();
  }

  return loweredTitle;
}

export default function FilterScreen() {
  const { colors, isDark } = useAppTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<FilterRoute>();
  const browseFilters = useStore((state) => state.browseFilters);
  const updateBrowseFilters = useStore((state) => state.updateBrowseFilters);
  const { listings, source, isSyncing, lastError, refreshListings } = useBackendData();
  const { show } = useToast();
  const { mySizes, setMySizes, toggleMySize, filterPresets, saveFilterPreset, removeFilterPreset } = useSettingsPreferences();
  const categoryId = route.params?.categoryId ?? 'search';
  const title = route.params?.title;
  const subcategoryId = route.params?.subcategoryId;

  const [activeSort, setActiveSort] = useState<SortOption>(browseFilters.sort);
  const [selectedBrands, setSelectedBrands] = useState<string[]>(browseFilters.brands);
  const [selectedSizes, setSelectedSizes] = useState<string[]>(browseFilters.sizes);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [selectedCondition, setSelectedCondition] = useState<ConditionOption>(browseFilters.condition);
  const [showAllBrands, setShowAllBrands] = useState(false);

  const translateY = useSharedValue(height);
  const contextY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withTiming(SNAP_HALF, { duration: 200 });
  }, []);

  const closeBottomSheet = () => {
    translateY.value = withTiming(height, { duration: 180 }, () => {
      runOnJS(navigation.goBack)();
    });
  };

  const gesture = Gesture.Pan()
    .onStart(() => {
      contextY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(SNAP_FULL, contextY.value + e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 100 && e.velocityY > 500) {
        runOnJS(closeBottomSheet)();
      } else if (translateY.value > SNAP_HALF + 100) {
        runOnJS(closeBottomSheet)();
      } else if (translateY.value < SNAP_HALF - 50) {
        // Snap to full (90% height)
        translateY.value = withTiming(SNAP_FULL, { duration: 180 });
      } else {
        // Snap back to half
        translateY.value = withTiming(SNAP_HALF, { duration: 180 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayStyle = useAnimatedStyle(() => {
    const opacity = interpolate(translateY.value, [SNAP_FULL, height], [0.6, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  const MOCK_BRANDS = ['Nike', 'Adidas', 'Stussy', 'Carhartt', 'Arc\'teryx', 'Levi\'s', 'Off-White', 'Zara'];
  const MOCK_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

  const brandOptions = React.useMemo(() => {
    const derived = Array.from(
      new Set(
        listings
          .map((listing) => listing.brand?.trim())
          .filter((brand): brand is string => Boolean(brand)),
      ),
    );

    return derived.length > 0 ? derived : MOCK_BRANDS;
  }, [listings]);

  const visibleBrandOptions = React.useMemo(() => {
    if (showAllBrands) {
      return brandOptions;
    }

    return brandOptions.slice(0, 8);
  }, [brandOptions, showAllBrands]);

  const sizeOptions = React.useMemo(() => {
    const derived = Array.from(
      new Set(
        listings
          .map((listing) => listing.size?.trim())
          .filter((size): size is string => Boolean(size)),
      ),
    );

    return derived.length > 0 ? derived : MOCK_SIZES;
  }, [listings]);

  const filterStatus = React.useMemo(
    () =>
      getBackendSyncStatus({
        isSyncing,
        source,
        hasError: Boolean(lastError),
        labels: {
          live: 'Live data',
        },
      }),
    [isSyncing, lastError, source],
  );

  const showFilterLoadingState = isSyncing && listings.length === 0 && !lastError;

  const renderLoadingState = () => (
    <View style={styles.loadingStateWrap}>
      <View style={styles.loadingSection}>
        <SkeletonLoader width="32%" height={14} borderRadius={7} style={{ marginBottom: 12 }} />
        <View style={styles.loadingChipRow}>
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonLoader key={`filter_sort_loading_${index}`} width={120} height={42} borderRadius={21} />
          ))}
        </View>
      </View>

      <View style={styles.loadingSection}>
        <SkeletonLoader width="24%" height={14} borderRadius={7} style={{ marginBottom: 12 }} />
        <View style={styles.loadingChipWrap}>
          {Array.from({ length: 8 }).map((_, index) => (
            <SkeletonLoader key={`filter_brand_loading_${index}`} width={104} height={42} borderRadius={21} />
          ))}
        </View>
      </View>
    </View>
  );

  const toggleBrand = (b: string) => {
    setSelectedBrands(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b]);
  };

  const toggleSize = (s: string) => {
    setSelectedSizes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const getResultsCount = () => {
    const normalizedCategory = toKey(categoryId);
    const normalizedSubcategory = getSubcategoryToken(categoryId, subcategoryId, title);
    const query = browseFilters.query.trim().toLowerCase();
    const selectedBrandKeys = new Set(selectedBrands.map((brand) => brand.toLowerCase()));
    const selectedSizeKeys = new Set(selectedSizes.map((size) => size.toLowerCase()));

    return listings.filter((listing) => {
      if (normalizedCategory !== 'search' && listing.category?.toLowerCase() !== normalizedCategory) {
        return false;
      }

      if (normalizedCategory !== 'search' && normalizedSubcategory) {
        if (!listing.subcategory?.toLowerCase()?.includes(normalizedSubcategory)) {
          return false;
        }
      }

      if (query) {
        const searchable = [
          listing.title,
          listing.brand,
          listing.description,
          listing.category,
          listing.subcategory,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!searchable?.includes(query)) {
          return false;
        }
      }

      if (selectedBrandKeys.size > 0 && !selectedBrandKeys.has(listing.brand?.toLowerCase() ?? '')) {
        return false;
      }

      if (selectedSizeKeys.size > 0 && !selectedSizeKeys.has(listing.size?.toLowerCase() ?? '')) {
        return false;
      }

      if (selectedCondition !== 'Any' && listing.condition !== selectedCondition) {
        return false;
      }

      return true;
    }).length;
  };

  const handleClear = () => {
    setActiveSort('Recommended');
    setSelectedBrands([]);
    setSelectedSizes([]);
    setSelectedCondition('Any');
  };

  const handleApply = () => {
    updateBrowseFilters({
      sort: activeSort,
      brands: selectedBrands,
      sizes: selectedSizes,
      condition: selectedCondition,
    });
    closeBottomSheet();
  };

  const handleApplyPreset = (preset: typeof filterPresets[number]) => {
    setActiveSort(preset.sort as SortOption);
    setSelectedBrands(preset.brands);
    setSelectedSizes(preset.sizes);
    setSelectedCondition(preset.condition as ConditionOption);
    show(`Applied preset "${preset.name}"`, 'success');
  };

  const handleSavePreset = () => {
    const trimmed = presetName.trim();
    if (!trimmed) return;
    saveFilterPreset({
      name: trimmed,
      sort: activeSort,
      brands: selectedBrands,
      sizes: selectedSizes,
      condition: selectedCondition,
    });
    show(`Saved preset "${trimmed}"`, 'success');
    setPresetName('');
    setIsSavingPreset(false);
  };

  const hasActiveSelection =
    selectedBrands.length > 0 || selectedSizes.length > 0 || selectedCondition !== 'Any' || activeSort !== 'Recommended';

  const resultCount = getResultsCount();
  const applyLabel = showFilterLoadingState ? 'Loading options...' : `Show ${resultCount} items`;

  return (
    <View style={styles.container}>
      <Reanimated.View style={[StyleSheet.absoluteFill, { backgroundColor: OVERLAY_BG }, overlayStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeBottomSheet} />
      </Reanimated.View>

      <GestureDetector gesture={gesture}>
        <Reanimated.View style={[styles.sheet, { backgroundColor: colors.surface }, sheetStyle]}>
          {/* Drag Handle */}
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: colors.borderSubtle }]} />
          </View>

          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Filter & Sort</Text>
            <AppButton
              title="Clear"
              onPress={handleClear}
              variant="secondary"
              size="sm"
              style={styles.clearBtn}
              titleStyle={[styles.clearText, { color: colors.brand }]}
              accessibilityLabel="Clear selected filters"
            />
          </View>

          <View style={styles.statusRow}>
            <Text style={[styles.statusMeta, { color: colors.textMuted }]}>{resultCount} matches currently</Text>
            <SyncStatusPill tone={filterStatus.tone} label={filterStatus.label} compact />
          </View>

          <View style={styles.contextActionRow}>
            <AnimatedPressable
              style={[styles.contextIdentity, { borderColor: colors.border, backgroundColor: colors.surface }]}
              onPress={() => navigation.navigate('CategoryTree', { categoryPrefix: categoryId === 'search' ? '' : categoryId })}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Open category tree"
              accessibilityHint="Shows the full category tree for this filter context"
            >
              <Ionicons name="funnel-outline" size={14} color={colors.textPrimary} />
              <Text style={[styles.contextText, { color: colors.textPrimary }]} numberOfLines={1}>
                {title ?? categoryId}
              </Text>
            </AnimatedPressable>

          </View>

          {/* Filter presets — quick apply chips + save current */}
          {(filterPresets.length > 0 || isSavingPreset) && (
            <View style={[styles.presetsWrap, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
              <View style={styles.presetsHeaderRow}>
                <Text style={[styles.presetsLabel, { color: colors.textMuted }]}>Presets</Text>
                {!isSavingPreset && hasActiveSelection && (
                  <AnimatedPressable
                    onPress={() => setIsSavingPreset(true)}
                    accessibilityLabel="Save current filters as a preset"
                    accessibilityRole="button"
                  >
                    <Text style={[styles.presetsSaveLink, { color: colors.brand }]}>+ Save current</Text>
                  </AnimatedPressable>
                )}
              </View>

              {isSavingPreset ? (
                <View style={styles.presetInputWrap}>
                  <TextInput
                    style={[styles.presetInput, { borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary }]}
                    placeholder="Preset name (e.g. Streetwear M)"
                    placeholderTextColor={colors.textMuted}
                    value={presetName}
                    onChangeText={setPresetName}
                    autoFocus
                    maxLength={30}
                    returnKeyType="done"
                    onSubmitEditing={handleSavePreset}
                  />
                  <AnimatedPressable
                    style={[styles.presetSaveBtn, { backgroundColor: colors.brand }, !presetName.trim() && styles.presetSaveBtnDisabled]}
                    onPress={handleSavePreset}
                    accessibilityLabel="Save preset"
                    accessibilityRole="button"
                  >
                    <Ionicons name="checkmark" size={18} color={colors.surface} />
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={styles.presetCancelBtn}
                    onPress={() => { setIsSavingPreset(false); setPresetName(''); }}
                    accessibilityLabel="Cancel saving preset"
                    accessibilityRole="button"
                  >
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </AnimatedPressable>
                </View>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsScroll}>
                  {filterPresets.map((preset) => (
                    <View key={preset.id} style={[styles.presetChipWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <AnimatedPressable
                        style={styles.presetChip}
                        onPress={() => handleApplyPreset(preset)}
                        accessibilityLabel={`Apply filter preset ${preset.name}`}
                        accessibilityRole="button"
                      >
                        <Ionicons name="bookmark" size={12} color={colors.brand} />
                        <Text style={[styles.presetChipText, { color: colors.textPrimary }]} numberOfLines={1}>{preset.name}</Text>
                      </AnimatedPressable>
                      <AnimatedPressable
                        style={styles.presetRemoveBtn}
                        onPress={() => removeFilterPreset(preset.id)}
                        accessibilityLabel={`Remove filter preset ${preset.name}`}
                        accessibilityRole="button"
                      >
                        <Ionicons name="close-circle" size={14} color={colors.textMuted} />
                      </AnimatedPressable>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          {/* Inline "Save current" entry when no presets exist yet */}
          {filterPresets.length === 0 && !isSavingPreset && hasActiveSelection && (
            <AnimatedPressable
              style={[styles.presetsEmptyCta, { backgroundColor: `${colors.brand}0A`, borderColor: `${colors.brand}30` }]}
              onPress={() => setIsSavingPreset(true)}
              accessibilityLabel="Save current filters as a preset"
              accessibilityRole="button"
            >
              <Ionicons name="bookmark-outline" size={14} color={colors.brand} />
              <Text style={[styles.presetsEmptyCtaText, { color: colors.brand }]}>Save current filters as a preset</Text>
            </AnimatedPressable>
          )}

          {lastError ? (
            <SyncRetryBanner
              message="Live filter data is delayed. Showing cached catalog options."
              onRetry={() => void refreshListings()}
              isRetrying={isSyncing}
              telemetryContext="filter_sync"
              containerStyle={[styles.syncRetryBanner, { backgroundColor: colors.surface }]}
              actionStyle={[styles.syncRetryBtn, { backgroundColor: colors.surface }]}
            />
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {showFilterLoadingState ? (
              renderLoadingState()
            ) : (
              <>
                {/* Sort Section */}
                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Sort By</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                  <AppSegmentControl
                    options={SORT_OPTIONS}
                    value={activeSort}
                    onChange={setActiveSort}
                    optionStyle={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    optionActiveStyle={[styles.chipActive, { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary }]}
                    optionTextStyle={[styles.chipText, { color: colors.textPrimary }]}
                    optionTextActiveStyle={[styles.chipTextActive, { color: colors.background }]}
                  />
                </ScrollView>

                <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

                {/* Brand Section */}
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Brand</Text>
                  {brandOptions.length > 8 ? (
                    <AppButton
                      title={showAllBrands ? 'Show less' : 'See all'}
                      onPress={() => setShowAllBrands((current) => !current)}
                      variant="secondary"
                      size="sm"
                      style={styles.seeAllBtn}
                      titleStyle={[styles.seeAllText, { color: colors.brand }]}
                      accessibilityLabel={showAllBrands ? 'Show fewer brand options' : 'Show all brand options'}
                    />
                  ) : null}
                </View>
                <View style={styles.wrapContainer}>
                  {visibleBrandOptions.map(b => {
                    const isActive = selectedBrands.includes(b);
                    return (
                      <AppButton
                        key={b}
                        title={b}
                        variant="secondary"
                        size="sm"
                        style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }, isActive && [styles.chipActive, { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary }]]}
                        titleStyle={[styles.chipText, { color: colors.textPrimary }, isActive && [styles.chipTextActive, { color: colors.background }]]}
                        onPress={() => toggleBrand(b)}
                        accessibilityLabel={`Toggle brand filter ${b}`}
                      />
                    );
                  })}
                </View>

                <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

                {/* Size Section */}
                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Size</Text>

                {/* My Sizes — saved size profile for quick application */}
                {mySizes.length > 0 ? (
                  <View style={styles.mySizesRow}>
                    <Text style={[styles.mySizesLabel, { color: colors.textSecondary }]}>My sizes:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mySizesScroll}>
                      {mySizes.map(s => {
                        const isActive = selectedSizes.includes(s);
                        return (
                          <AppButton
                            key={s}
                            title={s}
                            variant="secondary"
                            size="sm"
                            style={[styles.chip, styles.sizeChip, styles.mySizeChip, { backgroundColor: colors.surface, borderColor: colors.border }, isActive && [styles.chipActive, { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary }]]}
                            titleStyle={[styles.chipText, { color: colors.textPrimary }, isActive && [styles.chipTextActive, { color: colors.background }]]}
                            onPress={() => toggleSize(s)}
                            accessibilityLabel={`Toggle your saved size ${s}`}
                          />
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}

                <View style={styles.wrapContainer}>
                  {sizeOptions.map(s => {
                    const isActive = selectedSizes.includes(s);
                    const isMySize = mySizes.includes(s);
                    return (
                      <Pressable
                        key={s}
                        onLongPress={() => {
                          toggleMySize(s);
                          haptics.press();
                          show(
                            mySizes.includes(s) ? `Removed ${s} from your sizes` : `Saved ${s} to your sizes`,
                            'success'
                          );
                        }}
                        delayLongPress={400}
                      >
                        <AppButton
                          title={s}
                          icon={isMySize ? <Ionicons name="star" size={11} color={colors.brand} /> : undefined}
                          iconContainerStyle={styles.chipIconWrap}
                          variant="secondary"
                          size="sm"
                          style={[styles.chip, styles.sizeChip, { backgroundColor: colors.surface, borderColor: colors.border }, isActive && [styles.chipActive, { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary }], isMySize && [styles.mySizeMarkedChip, { borderColor: colors.brand }]]}
                          titleStyle={[styles.chipText, { color: colors.textPrimary }, isActive && [styles.chipTextActive, { color: colors.background }]]}
                          onPress={() => toggleSize(s)}
                          accessibilityLabel={`Toggle size filter ${s}. Long press to ${mySizes.includes(s) ? 'remove from' : 'save to'} your sizes.`}
                        />
                      </Pressable>
                    );
                  })}
                </View>

                {/* Save current sizes as my sizes */}
                {selectedSizes.length > 0 ? (
                  <View style={styles.saveSizesRow}>
                    <AppButton
                      title={selectedSizes.every(s => mySizes.includes(s)) ? 'All saved' : 'Save as my sizes'}
                      icon={selectedSizes.every(s => mySizes.includes(s)) ? <Ionicons name="checkmark-circle" size={14} color={colors.brand} /> : undefined}
                      iconContainerStyle={styles.chipIconWrap}
                      variant="secondary"
                      size="sm"
                      style={[styles.saveSizesBtn, { borderColor: colors.brand }]}
                      titleStyle={[styles.saveSizesBtnText, { color: colors.brand }]}
                      onPress={() => {
                        // Merge current selection into my sizes
                        const merged = [...new Set([...mySizes, ...selectedSizes])];
                        setMySizes(merged);
                        show(`Saved ${selectedSizes.length} size${selectedSizes.length === 1 ? '' : 's'} to your profile`, 'success');
                      }}
                      accessibilityLabel="Save current size selection to your profile"
                    />
                  </View>
                ) : null}

                <View style={[styles.sectionDivider, { backgroundColor: colors.border }]} />

                {/* Condition Section */}
                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>Condition</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
                  <AppSegmentControl
                    options={CONDITION_OPTIONS}
                    value={selectedCondition}
                    onChange={setSelectedCondition}
                    optionStyle={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                    optionActiveStyle={[styles.chipActive, { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary }]}
                    optionTextStyle={[styles.chipText, { color: colors.textPrimary }]}
                    optionTextActiveStyle={[styles.chipTextActive, { color: colors.background }]}
                  />
                </ScrollView>
              </>
            )}

            {/* Sticky Bottom Action */}
            <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
              <AppButton
                style={[styles.applyBtn, showFilterLoadingState && styles.applyBtnDisabled]}
                title={applyLabel}
                titleStyle={[styles.applyBtnText, { color: colors.textPrimary }, showFilterLoadingState && [styles.applyBtnTextDisabled, { color: colors.textMuted }]]}
                onPress={handleApply}
                disabled={showFilterLoadingState}
                variant="primary"
                size="lg"
                align="center"
                accessibilityLabel={applyLabel}
              />
            </View>
          </ScrollView>
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    width: width,
    height: height,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 16,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  headerTitle: { fontSize: 20, fontFamily: Typography.family.bold, letterSpacing: -0.3 },
  clearBtn: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 8,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  clearText: { fontSize: 15, fontFamily: Typography.family.semibold },
  statusRow: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statusMeta: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },
  contextActionRow: {
    marginHorizontal: 24,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  contextIdentity: {
    flex: 1,
    minHeight: 32,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  contextText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },

  // Filter presets
  presetsWrap: {
    marginHorizontal: 24,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  presetsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  presetsLabel: {
    fontSize: 11,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  presetsSaveLink: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
  },
  presetsScroll: {
    gap: 8,
  },
  presetChipWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 3,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  presetChipText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    maxWidth: 120,
  },
  presetRemoveBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  presetInput: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: Typography.family.regular,
  },
  presetSaveBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetSaveBtnDisabled: {
    opacity: 0.4,
  },
  presetCancelBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetsEmptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 24,
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  presetsEmptyCtaText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
  },

  syncRetryBanner: {
    marginHorizontal: 24,
    marginBottom: 8,
  },
  syncRetryBtn: {
  },

  scrollContent: { paddingTop: 8, paddingBottom: 40 },
  loadingStateWrap: {
    paddingHorizontal: 20,
    gap: 22,
  },
  loadingSection: {
    gap: 8,
  },
  loadingChipRow: {
    flexDirection: 'row',
    gap: 10,
  },
  loadingChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  sectionHeading: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    paddingHorizontal: 20,
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: 20,
    marginBottom: 12,
  },
  seeAllBtn: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 8,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  seeAllText: { fontSize: 14, fontFamily: Typography.family.semibold },

  hScroll: { paddingHorizontal: 20, gap: 8 },

  wrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 8,
  },

  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sizeChip: { minWidth: 56, alignItems: 'center' },
  mySizeChip: {
    borderWidth: 1.5,
  },
  mySizeMarkedChip: {
    borderWidth: 1.5,
  },
  mySizesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
    gap: 8,
  },
  mySizesLabel: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },
  mySizesScroll: {
    gap: 6,
  },
  saveSizesRow: {
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 4,
  },
  saveSizesBtn: {
    alignSelf: 'flex-start',
    minHeight: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'transparent',
  },
  saveSizesBtnText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
  },
  chipActive: {},

  chipIconWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },

  chipText: { fontSize: 14, fontFamily: Typography.family.semibold },
  chipTextActive: { fontFamily: Typography.family.bold },

  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 20,
    marginHorizontal: 20,
  },

  footer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 32 : 22,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  applyBtn: {
    width: '100%',
    minHeight: 52,
    borderRadius: 16,
  },
  applyBtnDisabled: {
    opacity: 0.6,
  },
  applyBtnText: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    letterSpacing: 0.2,
  },
  applyBtnTextDisabled: {
  },
});
