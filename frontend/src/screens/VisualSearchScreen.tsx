import React, { useCallback, useMemo, useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useHaptic } from '../hooks/useHaptic';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import type { Listing } from '../domain';
import VisualSearchCamera from '../components/VisualSearchCamera';
import { openProductDetail } from '../platform/product/openProductDetail';
import {
  useVisualSearchImage,
  useVisualSearchFilters,
  useVisualSearchResults,
  useVisualSearchSaveSearch } from '../hooks/visualsearch';
import { createVisualSearchStyles } from '../components/visualsearch/visualSearchStyles';
import { VisualSearchQueryHeader } from '../components/visualsearch/VisualSearchQueryHeader';
import { VisualSearchRefinementBar } from '../components/visualsearch/VisualSearchRefinementBar';
import { VisualSearchResults } from '../components/visualsearch/VisualSearchResults';

type Props = NativeStackScreenProps<RootStackParamList, 'VisualSearch'>;

export default function VisualSearchScreen({ navigation, route }: Props) {
  const { colors } = useAppTheme();
  const { currencySymbol } = useFormattedPrice();
  const reducedMotionEnabled = useReducedMotion();
  const haptic = useHaptic();
  const styles = useMemo(() => createVisualSearchStyles(colors), [colors]);
  const initialImageUri = route.params?.initialImageUri;

  const {
    imageUri,
    setImageUri,
    previewFailed,
    setPreviewFailed,
    handlePhotoCapture,
    openGallery } = useVisualSearchImage(initialImageUri);

  const {
    description,
    setDescription,
    selectedCategory,
    setSelectedCategory,
    brand,
    setBrand,
    minPrice,
    setMinPrice,
    maxPrice,
    setMaxPrice,
    selectedColor,
    setSelectedColor,
    selectedStyle,
    setSelectedStyle,
    availableCategories,
    brandSuggestions,
    buildFilterPayload,
    filterCachedListings,
    hasActiveFilters,
    clearFields } = useVisualSearchFilters();

  const {
    status,
    results,
    facetCounts,
    refreshing,
    runSearch,
    handleRefresh,
    resetResults,
    honestNoteText } = useVisualSearchResults({ imageUri, buildFilterPayload, filterCachedListings });

  const {
    isCurrentSaved,
    handleSaveSearch } = useVisualSearchSaveSearch({
    imageUri,
    description,
    selectedCategory,
    brand,
    minPrice,
    maxPrice });

  // Reset preview-failed flag whenever a new image is set.
  useEffect(() => {
    if (imageUri) setPreviewFailed(false);
  }, [imageUri, setPreviewFailed]);

  // Auto-run search once a photo is selected (initial coarse result set).
  useEffect(() => {
    if (imageUri && status === 'idle') {
      void runSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUri]);

  const handleRemoveImage = useCallback(() => {
    haptic.warning();
    setPreviewFailed(false);
    setImageUri(null);
    resetResults();
    clearFields();
  }, [haptic, setPreviewFailed, setImageUri, resetResults, clearFields]);

  const handleRetake = useCallback(() => {
    haptic.selection();
    setImageUri(null);
  }, [haptic, setImageUri]);

  const handlePreviewError = useCallback(() => {
    setPreviewFailed(true);
  }, [setPreviewFailed]);

  const handleApplyFilters = useCallback(() => {
    haptic.medium();
    if (imageUri) void runSearch();
  }, [haptic, imageUri, runSearch]);

  const handleClearFilters = useCallback(() => {
    haptic.light();
    clearFields();
    if (imageUri) {
      setTimeout(() => void runSearch(), 0);
    }
  }, [haptic, clearFields, imageUri, runSearch]);

  const handleBrowseCategory = useCallback(
    (categoryId: string, categoryTitle: string) => {
      haptic.selection();
      navigation.navigate('Browse', { categoryId, title: categoryTitle });
    },
    [haptic, navigation]
  );

  const handlePressItem = useCallback(
    (item: Listing) => {
      openProductDetail(navigation, { referenceKind: 'listing', canonicalId: item.id, sourceSurface: 'VisualSearch' });
    },
    [navigation]
  );

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
          <VisualSearchQueryHeader
            imageUri={imageUri}
            previewFailed={previewFailed}
            onPreviewError={handlePreviewError}
            onRemove={handleRemoveImage}
            onRetake={handleRetake}
            onReplace={openGallery}
          />
          <VisualSearchRefinementBar
            description={description}
            onChangeDescription={setDescription}
            availableCategories={availableCategories}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            selectedColor={selectedColor}
            onSelectColor={setSelectedColor}
            colorCounts={facetCounts?.colors}
            selectedStyle={selectedStyle}
            onSelectStyle={setSelectedStyle}
            styleCounts={facetCounts?.styles}
            brand={brand}
            onChangeBrand={setBrand}
            minPrice={minPrice}
            onChangeMinPrice={setMinPrice}
            maxPrice={maxPrice}
            onChangeMaxPrice={setMaxPrice}
            currencySymbol={currencySymbol}
            brandSuggestions={brandSuggestions}
            hasActiveFilters={hasActiveFilters}
            onApply={handleApplyFilters}
            onClear={handleClearFilters}
          />
        </Reanimated.View>
        <View style={styles.resultsSection}>
          <VisualSearchResults
            status={status}
            results={results}
            honestNoteText={honestNoteText}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            onPressItem={handlePressItem}
            isCurrentSaved={isCurrentSaved}
            onSaveSearch={handleSaveSearch}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={handleClearFilters}
            availableCategories={availableCategories}
            onBrowseCategory={handleBrowseCategory}
            onRetry={runSearch}
          />
        </View>
      </View>
    </FlagshipScreen>
  );
}
