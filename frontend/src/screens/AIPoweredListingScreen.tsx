import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  useWindowDimensions,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

import { NativeStackScreenProps, RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, TypeStyles, Stroke, Control, LetterSpacing, FontFamily } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import { useAIListingSuggestion } from '../hooks/useAIListingSuggestion';
import { useConnectivity } from '../hooks/useConnectivity';
import { useStore } from '../store/useStore';
import { useNotifications } from '../hooks/useNotifications';
import { haptics } from '../utils/haptics';
import { makeStableId } from '../utils/createStableId';
import { sanitizeDecimalInput } from '../utils/currencyAuthoringFlows';
import {
  createListingOnApi,
  createListingImageOnApi } from '../services/listingsApi';
import { MediaUploadQueue } from '../services/mediaUploadQueue';
import { consumeEnhancementResult } from '../services/enhancementResultHandoff';
import { SmartSellCard } from '../components/sell/SmartSellCard';
import { ListingQualityMeter } from '../components/sell/ListingQualityMeter';
import { ListingPreviewCard } from '../components/sell/ListingPreviewCard';
import { SustainabilityTags } from '../components/sell/SustainabilityTags';
import {
  fetchSmartSellPolicy,
  type SmartSellPolicy } from '../services/smartSellApi';
import {
  type FieldSuggestion,
  type ListingField } from '../services/aiListingApi';
import {
  scoreListing,
  type ListingQualityScore } from '../services/listingQualityApi';
import { useTaxonomy } from '../context/TaxonomyContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';
import { useAppTranslation } from '../i18n/useAppTranslation';

type Props = NativeStackScreenProps<RootStackParamList, 'AIPoweredListing'>;

interface DraftPhoto {
  uri: string;
  width?: number;
  height?: number;
}

export default function AIPoweredListingScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { isOffline } = useConnectivity();
  const currentUser = useStore((s) => s.currentUser);
  const { showError, showInfo } = useNotifications();
  const { categories, conditions } = useTaxonomy();
  const { currencySymbol } = useFormattedPrice();
  const { t } = useAppTranslation('aiListing');
  const categoryOptions = useMemo(
    () => categories.filter((n) => n.parentId === null).map((n) => n.name),
    [categories],
  );
  const conditionOptions = useMemo(() => conditions.map((n) => n.name), [conditions]);

  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [condition, setCondition] = useState('');
  const [price, setPrice] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [pickerMode, setPickerMode] = useState<'Category' | 'Condition' | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [smartSellPolicy, setSmartSellPolicy] = useState<SmartSellPolicy>(() =>
    fetchSmartSellPolicy(`draft_${currentUser?.id ?? 'anon'}`),
  );
  const [sustainabilityTags, setSustainabilityTags] = useState<string[]>([]);
  const [materialComposition, setMaterialComposition] = useState<string>('');
  const [weightKg, setWeightKg] = useState<string>('');

  // Track which fields the seller has manually edited — these are never
  // overwritten by suggestions. This is the dirty-field protection (P0).
  const dirtyFieldsRef = useRef<Set<ListingField>>(new Set());
  // Track which suggestions have been dismissed by the seller.
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<ListingField>>(new Set());

  const photoUris = useMemo(() => photos.map((p) => p.uri), [photos]);

  const {
    suggestion,
    isLoading: isAnalyzing,
    error: analysisError,
    analyze,
    clearError,
    reset: resetSuggestion,
    getField } = useAIListingSuggestion(photoUris);

  // -- Consume enhancement result when returning from AIPhotoEnhancement ----
  // The enhancement modal writes the result to a module-level handoff store
  // before goBack(). We consume it here when this screen regains focus.
  useFocusEffect(
    useCallback(() => {
      const handoff = consumeEnhancementResult();
      if (!handoff) return;
      setPhotos((prev) =>
        prev.map((p) =>
          p.uri === handoff.originalUri
            ? { ...p, uri: handoff.enhancedUri }
            : p,
        ),
      );
      showInfo(t('toast.photoEnhanced'), handoff.appliedOperationLabel);
    }, [showInfo, t]),
  );

  // -- Auto-analyze whenever the photo set changes --------------------------
  // NOTE: This does NOT auto-apply suggestions. It only triggers analysis.
  // The seller must explicitly accept each suggestion via the inline row.
  const analyzeSignatureRef = useRef<string>('');
  useEffect(() => {
    if (photoUris.length === 0) {
      resetSuggestion();
      return;
    }
    const sig = photoUris.join('|');
    if (sig === analyzeSignatureRef.current) return;
    analyzeSignatureRef.current = sig;
    analyze();
  }, [photoUris, analyze, resetSuggestion]);

  // -- Photo capture / pick ------------------------------------------------
  const handlePickFromLibrary = useCallback(async () => {
    haptics.tap();
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showError(t('toast.photoAccessTitle'), t('toast.photoAccessBody'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 8,
        quality: 0.85,
        exif: false });
      if (result.canceled) return;
      const assets = result.assets.map((a) => ({
        uri: a.uri,
        width: a.width,
        height: a.height }));
      setPhotos((prev) => [...prev, ...assets].slice(0, 8));
    } catch {
      showError(t('toast.pickFailedTitle'), t('toast.pickFailedBody'));
    }
  }, [showError, t]);

  const handlePickFromCamera = useCallback(async () => {
    haptics.tap();
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        showError(t('toast.cameraAccessTitle'), t('toast.cameraAccessBody'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
        exif: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      setPhotos((prev) =>
        [...prev, { uri: asset.uri, width: asset.width, height: asset.height }].slice(0, 8),
      );
    } catch {
      showError(t('toast.captureFailedTitle'), t('toast.captureFailedBody'));
    }
  }, [showError, t]);

  const handleRemovePhoto = useCallback((uri: string) => {
    haptics.tap();
    setPhotos((prev) => prev.filter((p) => p.uri !== uri));
  }, []);

  // -- Enhance photo (navigate to AI Photo Enhancement) --------------------
  const handleEnhancePhoto = useCallback(
    (uri: string) => {
      haptics.tap();
      navigation.navigate('AIPhotoEnhancement', { imageUri: uri });
    },
    [navigation],
  );

  // -- Suggestion accept / dismiss -----------------------------------------
  const handleAcceptSuggestion = useCallback(
    (field: ListingField, candidate: FieldSuggestion['candidate']) => {
      haptics.selection();
      if (field === 'title' && typeof candidate === 'string') setTitle(candidate);
      else if (field === 'description' && typeof candidate === 'string') setDescription(candidate);
      else if (field === 'category' && typeof candidate === 'string') setCategory(candidate);
      else if (field === 'brand' && typeof candidate === 'string') setBrand(candidate);
      else if (field === 'tags' && Array.isArray(candidate)) setTags(candidate as string[]);
      else if (field === 'color' && Array.isArray(candidate)) {
        // Colors are informational; don't fill a form field, just dismiss
      }
      // Condition is never suggested — it requires seller attestation
      // Price is never auto-filled — the range is shown as guidance

      // Mark as dismissed so the suggestion row hides after accepting
      setDismissedSuggestions((prev) => new Set(prev).add(field));
    },
    [],
  );

  const handleDismissSuggestion = useCallback((field: ListingField) => {
    haptics.tap();
    setDismissedSuggestions((prev) => new Set(prev).add(field));
  }, []);

  // -- Mark fields dirty when the seller edits them ------------------------
  const markDirty = useCallback((field: ListingField) => {
    dirtyFieldsRef.current.add(field);
    // Dismiss the suggestion for this field since the seller is editing manually
    setDismissedSuggestions((prev) => {
      if (prev.has(field)) return prev;
      return new Set(prev).add(field);
    });
  }, []);

  const handleTitleChange = useCallback((v: string) => {
    markDirty('title');
    setTitle(v);
  }, [markDirty]);
  const handleDescriptionChange = useCallback((v: string) => {
    markDirty('description');
    setDescription(v);
  }, [markDirty]);
  const handleCategorySelect = useCallback((val: string) => {
    markDirty('category');
    setCategory(val);
    setPickerMode(null);
    haptics.selection();
  }, [markDirty]);
  const handleConditionSelect = useCallback((val: string) => {
    markDirty('condition');
    setCondition(val);
    setPickerMode(null);
    haptics.selection();
  }, [markDirty]);
  const handleBrandChange = useCallback((v: string) => {
    markDirty('brand');
    setBrand(v);
  }, [markDirty]);
  const handlePriceChange = useCallback((v: string) => {
    markDirty('price');
    setPrice(v);
  }, [markDirty]);

  // -- Tags ----------------------------------------------------------------
  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase();
    if (!trimmed) return;
    if (tags.includes(trimmed)) {
      setTagInput('');
      return;
    }
    markDirty('tags');
    setTags((prev) => [...prev, trimmed]);
    setTagInput('');
    haptics.tap();
  }, [tagInput, tags, markDirty]);

  const handleRemoveTag = useCallback((tag: string) => {
    haptics.tap();
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  // -- Picker --------------------------------------------------------------
  const pickerOptions = useMemo(() => {
    if (pickerMode === 'Category') return categoryOptions;
    if (pickerMode === 'Condition') return conditionOptions;
    return [];
  }, [pickerMode, categoryOptions, conditionOptions]);

  // -- Publish -------------------------------------------------------------
  const uploadQueueRef = useRef<MediaUploadQueue | null>(null);
  if (uploadQueueRef.current === null) {
    uploadQueueRef.current = new MediaUploadQueue();
  }

  const canPublish = useMemo(() => {
    return (
      photos.length > 0 &&
      title.trim().length > 0 &&
      price.trim().length > 0 &&
      Number(sanitizeDecimalInput(price)) > 0 &&
      !!currentUser?.id &&
      !isSubmitting
    );
  }, [photos, title, price, currentUser?.id, isSubmitting]);

  const handlePublish = useCallback(async () => {
    if (!currentUser?.id) {
      setPublishError(t('publish.signInToPublish'));
      haptics.error();
      return;
    }
    if (isOffline) {
      setPublishError(t('publish.offline'));
      haptics.error();
      return;
    }
    const trimmedTitle = title.trim();
    const numericPrice = Number(sanitizeDecimalInput(price));
    if (!trimmedTitle || !numericPrice || photos.length === 0) {
      setPublishError(t('publish.missingFields'));
      haptics.error();
      return;
    }

    setIsSubmitting(true);
    setPublishError(null);

    try {
      const queue = uploadQueueRef.current!;
      const assets = photos.map((p, i) => ({
        id: `ai_photo_${Date.now()}_${i}`,
        uri: p.uri,
        fileName: p.uri.split('/').pop() || `photo_${i}.jpg`,
        mimeType: 'image/jpeg',
        kind: 'image' as const,
        width: p.width,
        height: p.height }));
      queue.addAssets(assets);
      await queue.run();
      const queueItems = queue.getItems();
      const coverUpload = queueItems.find(
        (item) => item.state === 'uploaded' && item.publicUrl && item.finalizationId,
      );
      if (!coverUpload) {
        throw new Error(t('publish.missingCover'));
      }
      const coverImage = coverUpload.publicUrl!;
      const uploadedUrls = queueItems
        .filter((it) => it.state === 'uploaded' && it.publicUrl)
        .map((it) => it.publicUrl!);

      const listingId = makeStableId('listing');
      await createListingOnApi({
        id: listingId,
        sellerId: currentUser.id,
        title: trimmedTitle,
        description: description.trim(),
        priceGbp: numericPrice,
        imageUrl: coverImage,
        coverFinalizationId: coverUpload.finalizationId!,
        status: 'active',
        category: category || undefined,
        brand: brand || undefined,
        condition: condition || undefined,
        shippingMethod: 'standard',
        shippingPayer: 'buyer',
        materialComposition: materialComposition.trim() || undefined,
        weightKg: weightKg ? parseFloat(weightKg) : undefined });

      for (let i = 0; i < uploadedUrls.length; i++) {
        const verifiedUpload = queueItems.find(
          (item) => item.publicUrl === uploadedUrls[i] && item.finalizationId,
        );
        if (!verifiedUpload) continue;
        await createListingImageOnApi({
          id: `${listingId}_img_${i}`,
          listingId,
          imageUrl: uploadedUrls[i],
          sortOrder: i,
          mediaWidth: verifiedUpload.asset.width,
          mediaHeight: verifiedUpload.asset.height,
          finalizationId: verifiedUpload.finalizationId! });
      }

      queue.reset();
      haptics.success();
      // Honest preview message when Smart Sell is enabled in preview mode
      if (smartSellPolicy.enabled && smartSellPolicy.capability.kind === 'preview') {
        showInfo(
          t('toast.smartSellSavedPreviewTitle'),
          t('toast.smartSellSavedPreviewBody'),
        );
      }
      navigation.replace('ListingSuccess', {
        listingId,
        title: trimmedTitle,
        price: numericPrice,
        categoryId: category,
        photoUri: coverImage,
        smartSellEnabled: smartSellPolicy.enabled });
    } catch (e: unknown) {
      const isNetwork =
        isOffline ||
        (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'NETWORK_ERROR');
      const rawMsg =
        typeof e === 'object' && e && 'message' in e && typeof (e as Error).message === 'string'
          ? (e as Error).message
          : t('publish.failed');
      setPublishError(isNetwork ? t('publish.offline') : rawMsg);
      haptics.error();
    } finally {
      setIsSubmitting(false);
    }
  }, [currentUser, isOffline, photos, title, price, description, category, brand, condition, materialComposition, weightKg, navigation, smartSellPolicy, showInfo, t]);

  // -- Listing quality score (heuristic, updates live as the form fills) -----
  const qualityScore: ListingQualityScore = useMemo(() => {
    const numericPrice = Number(sanitizeDecimalInput(price)) || 0;
    return scoreListing({
      images: photoUris,
      title,
      description,
      price: numericPrice,
      category: category || undefined,
      condition: (condition || undefined) as
        | import('../services/listingsApi').ListingCondition
        | undefined,
      brand: brand || undefined,
      shippingMethod: 'standard' });
  }, [photoUris, title, description, price, category, condition, brand]);

  const numericPriceForPreview = Number(sanitizeDecimalInput(price)) || 0;
  const previewCoverUri = photoUris[0] ?? null;
  const sellerName = currentUser?.username ?? currentUser?.handle ?? null;
  const sellerAvatar = currentUser?.avatar ?? null;
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Helper: should we show a suggestion row for this field?
  const shouldShowSuggestion = useCallback(
    (field: ListingField): FieldSuggestion | null => {
      if (dismissedSuggestions.has(field)) return null;
      if (dirtyFieldsRef.current.has(field)) return null;
      const s = getField(field);
      if (!s || s.abstained) return null;
      return s;
    },
    [dismissedSuggestions, getField],
  );

  const titleSuggestion = shouldShowSuggestion('title');
  const descSuggestion = shouldShowSuggestion('description');
  const categorySuggestion = shouldShowSuggestion('category');
  const brandSuggestion = shouldShowSuggestion('brand');
  const tagsSuggestion = shouldShowSuggestion('tags');
  const priceSuggestion = shouldShowSuggestion('price');
  const conditionField = getField('condition');
  const priceGuidance = suggestion?.priceGuidance;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* -- Header -- product language, not AI branding */}
      <ScreenHeader
        title={t('header.title')}
        subtitle={t('header.subtitle')}
        backIcon="arrow-back"
        onBack={() => navigation.goBack()}
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + Space.xxl }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* -- 1. PHOTO CAPTURE SECTION -- */}
          <PhotoCaptureSection
            photos={photos}
            onPickFromLibrary={handlePickFromLibrary}
            onPickFromCamera={handlePickFromCamera}
            onRemovePhoto={handleRemovePhoto}
            onEnhancePhoto={handleEnhancePhoto}
            colors={colors}
            styles={styles}
          />

          {/* -- 2. ANALYSIS ERROR -- */}
          {analysisError && photos.length > 0 && !isAnalyzing && (
            <ErrorBanner
              message={analysisError}
              onRetry={() => {
                clearError();
                analyze();
              }}
              onDismiss={clearError}
              colors={colors}
              styles={styles}
            />
          )}

          {/* -- 3. PUBLISH ERROR -- */}
          {publishError && (
            <ErrorBanner
              message={publishError}
              onRetry={() => {
                setPublishError(null);
                handlePublish();
              }}
              onDismiss={() => setPublishError(null)}
              colors={colors}
              styles={styles}
            />
          )}

          {/* -- 4. EMPTY STATE (no photos) -- */}
          {photos.length === 0 && (
            <EmptyState colors={colors} styles={styles} />
          )}

          {/* -- 5. LOADING SKELETON (field geometry, no scanning animation) -- */}
          {isAnalyzing && photos.length > 0 && (
            <ListingFormSkeleton styles={styles} />
          )}

          {/* -- 6. FORM FIELDS -- always visible when photos exist, not hidden behind analysis */}
          {photos.length > 0 && !isAnalyzing && (
            <View>
              {/* Title */}
              <FieldLabel label={t('fields.title')} colors={colors} styles={styles} />
              <TextInput
                style={[styles.fieldInput, { color: colors.textPrimary, borderColor: colors.border }]}
                value={title}
                onChangeText={handleTitleChange}
                placeholder={t('placeholders.title')}
                placeholderTextColor={colors.textMuted}
                returnKeyType="next"
              />
              {titleSuggestion && (
                <SuggestionRow
                  suggestion={titleSuggestion}
                  onAccept={() => handleAcceptSuggestion('title', titleSuggestion.candidate)}
                  onDismiss={() => handleDismissSuggestion('title')}
                  colors={colors}
                  styles={styles}
                />
              )}

              {/* Description */}
              <FieldLabel label={t('fields.description')} colors={colors} styles={styles} />
              <TextInput
                style={[styles.fieldTextarea, { color: colors.textPrimary, borderColor: colors.border }]}
                value={description}
                onChangeText={handleDescriptionChange}
                placeholder={t('placeholders.description')}
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              {descSuggestion && (
                <SuggestionRow
                  suggestion={descSuggestion}
                  onAccept={() => handleAcceptSuggestion('description', descSuggestion.candidate)}
                  onDismiss={() => handleDismissSuggestion('description')}
                  colors={colors}
                  styles={styles}
                />
              )}

              {/* Category + Brand row */}
              <View style={styles.fieldRow}>
                <View style={{ flex: 1, marginRight: Space.sm }}>
                  <FieldLabel label={t('fields.category')} colors={colors} styles={styles} />
                  <Pressable
                    style={({ pressed }) => [styles.pickerField, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
                    onPress={() => setPickerMode('Category')}
                    accessibilityRole="button"
                    accessibilityLabel={t('accessibility.selectCategory')}
                    accessibilityHint={t('accessibility.opensCategoryPicker')}
                  >
                    <Text
                      style={[
                        styles.pickerValue,
                        { color: category ? colors.textPrimary : colors.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {category || t('placeholders.selectCategory')}
                    </Text>
                    <AppIcon name="chevronDown" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
                  </Pressable>
                  {categorySuggestion && (
                    <SuggestionRow
                      suggestion={categorySuggestion}
                      onAccept={() => handleAcceptSuggestion('category', categorySuggestion.candidate)}
                      onDismiss={() => handleDismissSuggestion('category')}
                      colors={colors}
                      styles={styles}
                      compact
                    />
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <FieldLabel label={t('fields.brand')} colors={colors} styles={styles} />
                  <TextInput
                    style={[styles.fieldInput, { color: colors.textPrimary, borderColor: colors.border }]}
                    value={brand}
                    onChangeText={handleBrandChange}
                    placeholder={t('placeholders.brand')}
                    placeholderTextColor={colors.textMuted}
                  />
                  {brandSuggestion && (
                    <SuggestionRow
                      suggestion={brandSuggestion}
                      onAccept={() => handleAcceptSuggestion('brand', brandSuggestion.candidate)}
                      onDismiss={() => handleDismissSuggestion('brand')}
                      colors={colors}
                      styles={styles}
                      compact
                    />
                  )}
                </View>
              </View>

              {/* Condition + Price row */}
              <View style={styles.fieldRow}>
                <View style={{ flex: 1, marginRight: Space.sm }}>
                  <FieldLabel label={t('fields.condition')} colors={colors} styles={styles} />
                  <Pressable
                    style={({ pressed }) => [styles.pickerField, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
                    onPress={() => setPickerMode('Condition')}
                    accessibilityRole="button"
                    accessibilityLabel={t('accessibility.selectCondition')}
                    accessibilityHint={t('accessibility.opensConditionPicker')}
                  >
                    <Text
                      style={[
                        styles.pickerValue,
                        { color: condition ? colors.textPrimary : colors.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {condition || t('placeholders.selectCondition')}
                    </Text>
                    <AppIcon name="chevronDown" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
                  </Pressable>
                  {/* Condition always requires seller attestation — no suggestion */}
                  {conditionField?.abstained && !condition && (
                    <Text style={[styles.attentionHint, { color: colors.warning }]}>
                      {conditionField.reason}
                    </Text>
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <FieldLabel label={t('fields.price')} colors={colors} styles={styles} />
                  <TextInput
                    style={[styles.fieldInput, { color: colors.textPrimary, borderColor: colors.border }]}
                    value={price}
                    onChangeText={handlePriceChange}
                    placeholder="0.00"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                  />
                  {priceSuggestion && (
                    <SuggestionRow
                      suggestion={priceSuggestion}
                      onAccept={() => handleAcceptSuggestion('price', priceSuggestion.candidate)}
                      onDismiss={() => handleDismissSuggestion('price')}
                      colors={colors}
                      styles={styles}
                      compact
                    />
                  )}
                </View>
              </View>

              {/* Dynamic pricing intelligence card */}
              <View style={{ marginTop: Space.sm }}>
                <SmartSellCard
                  category={category}
                  condition={condition}
                  listingPrice={Number(sanitizeDecimalInput(price)) || undefined}
                />
              </View>

              {/* Tags */}
              <FieldLabel label={t('fields.tags')} colors={colors} styles={styles} />
              <View style={styles.tagsWrap}>
                {tags.map((tag) => (
                  <View key={tag} style={[styles.tagChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.tagText, { color: colors.brand }]}>{tag}</Text>
                    <Pressable
                      hitSlop={8}
                      onPress={() => handleRemoveTag(tag)}
                      style={({ pressed }) => pressed && { opacity: 0.5 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('accessibility.removeTag', { tag })}
                      accessibilityHint={t('accessibility.removeTagHint', { tag })}
                    >
                      <AppIcon name="close" size={IconSize.xs} color="textMuted" opticalCenter accessible={false} />
                    </Pressable>
                  </View>
                ))}
                <View style={[styles.tagInputWrap, { borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.tagInput, { color: colors.textPrimary }]}
                    value={tagInput}
                    onChangeText={setTagInput}
                    placeholder={t('placeholders.addTag')}
                    placeholderTextColor={colors.textMuted}
                    onSubmitEditing={handleAddTag}
                    returnKeyType="done"
                  />
                  {tagInput.trim().length > 0 && (
                    <Pressable
                      hitSlop={8}
                      onPress={handleAddTag}
                      style={({ pressed }) => pressed && { opacity: 0.5 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('accessibility.addTag')}
                      accessibilityHint={t('accessibility.addTagHint')}
                    >
                      <AppIcon name="plus" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
                    </Pressable>
                  )}
                </View>
              </View>
              {tagsSuggestion && (
                <SuggestionRow
                  suggestion={tagsSuggestion}
                  onAccept={() => handleAcceptSuggestion('tags', tagsSuggestion.candidate)}
                  onDismiss={() => handleDismissSuggestion('tags')}
                  colors={colors}
                  styles={styles}
                />
              )}

              {/* Sustainability tags */}
              <SustainabilityTags
                selectedTags={sustainabilityTags}
                onTagsChange={setSustainabilityTags}
              />

              {/* Material composition + weight — used to calculate real environmental impact */}
              <FieldLabel label={t('fields.materialComposition')} colors={colors} styles={styles} />
              <TextInput
                style={[styles.fieldInput, { color: colors.textPrimary, borderColor: colors.border }]}
                value={materialComposition}
                onChangeText={setMaterialComposition}
                placeholder={t('placeholders.material')}
                placeholderTextColor={colors.textMuted}
              />
              <FieldLabel label={t('fields.weight')} colors={colors} styles={styles} />
              <TextInput
                style={[styles.fieldInput, { color: colors.textPrimary, borderColor: colors.border }]}
                value={weightKg}
                onChangeText={(v) => setWeightKg(sanitizeDecimalInput(v))}
                placeholder={t('placeholders.weight')}
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.impactHelperText, { color: colors.textMuted }]}>
                {t('impact.helper')}
              </Text>

              {/* Listing preview */}
              <View style={styles.sectionLabelWrap}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                  {t('preview.label')}
                </Text>
              </View>
              <ListingPreviewCard
                coverPhotoUri={previewCoverUri}
                title={title}
                price={numericPriceForPreview}
                condition={condition || null}
                sellerName={sellerName}
                sellerAvatar={sellerAvatar}
              />

              {/* Listing quality meter */}
              <View style={styles.sectionLabelWrap}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                  {t('preview.completeness')}
                </Text>
              </View>
              <ListingQualityMeter score={qualityScore} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* -- Sticky publish footer -- */}
      {photos.length > 0 && (
        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <AppButton
            title={isSubmitting ? t('publish.publishing') : t('publish.reviewPublish')}
            onPress={handlePublish}
            disabled={!canPublish}
            loading={isSubmitting}
            variant="primary"
            size="lg"
            accessibilityLabel={t('accessibility.publishListing')}
            accessibilityHint={t('accessibility.publishListingHint')}
            icon={<AppIcon name="verified" focused size={IconSize.sm} color={colors.textInverse} opticalCenter accessible={false} />}
          />
        </View>
      )}

      {/* -- Picker bottom sheet -- */}
      {pickerMode && (
        <PickerSheet
          options={pickerOptions}
          selectedValue={pickerMode === 'Category' ? category : condition}
          onSelect={pickerMode === 'Category' ? handleCategorySelect : handleConditionSelect}
          onClose={() => setPickerMode(null)}
          title={pickerMode === 'Category' ? t('picker.selectCategory') : t('picker.selectCondition')}
          colors={colors}
        />
      )}
    </View>
  );
}

// ===========================================================================
// Suggestion row — inline, restrained, one row per field
// ===========================================================================

interface SuggestionRowProps {
  suggestion: FieldSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  compact?: boolean;
}

function SuggestionRow({ suggestion, onAccept, onDismiss, colors, styles, compact }: SuggestionRowProps) {
  const { t } = useAppTranslation('aiListing');
  const candidateText = useMemo(() => {
    if (typeof suggestion.candidate === 'string') return suggestion.candidate;
    if (Array.isArray(suggestion.candidate)) return (suggestion.candidate as string[]).join(', ');
    return '';
  }, [suggestion.candidate]);

  const evidenceText = suggestion.evidence.length > 0
    ? suggestion.evidence[0].ref
    : t('suggestion.suggested');

  return (
    <View style={[styles.suggestionRow, compact && styles.suggestionRowCompact]}>
      <View style={styles.suggestionContent}>
        <Text
          style={[styles.suggestionCandidate, { color: colors.textSecondary }]}
          numberOfLines={compact ? 1 : 2}
        >
          {candidateText}
        </Text>
        <Text style={[styles.suggestionEvidence, { color: colors.textMuted }]}>
          {evidenceText}
        </Text>
      </View>
      <View style={styles.suggestionActions}>
        <Pressable
          hitSlop={8}
          onPress={onAccept}
          style={({ pressed }) => [
            styles.suggestionAcceptBtn,
            { borderColor: colors.brand },
            pressed && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t('accessibility.acceptSuggestion', { text: candidateText })}
          accessibilityHint={t('accessibility.acceptSuggestionHint')}
        >
          <Text style={[styles.suggestionAcceptText, { color: colors.brand }]}>
            {t('suggestion.use')}
          </Text>
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={onDismiss}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
          accessibilityRole="button"
          accessibilityLabel={t('accessibility.dismissSuggestion')}
          accessibilityHint={t('accessibility.dismissSuggestionHint')}
        >
          <AppIcon name="close" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
        </Pressable>
      </View>
    </View>
  );
}

// ===========================================================================
// Field label — simple, no AI badge
// ===========================================================================

function FieldLabel({
  label,
  colors,
  styles }: {
  label: string;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
      {label}
    </Text>
  );
}

// ===========================================================================
// Photo capture section
// ===========================================================================

interface PhotoCaptureSectionProps {
  photos: DraftPhoto[];
  onPickFromLibrary: () => void;
  onPickFromCamera: () => void;
  onRemovePhoto: (uri: string) => void;
  onEnhancePhoto: (uri: string) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function PhotoCaptureSection({
  photos,
  onPickFromLibrary,
  onPickFromCamera,
  onRemovePhoto,
  onEnhancePhoto,
  colors,
  styles }: PhotoCaptureSectionProps) {
  const { t } = useAppTranslation('aiListing');
  const { width: SCREEN_W } = useWindowDimensions();
  const thumbSize = (SCREEN_W - Space.md * 2 - Space.sm * 2) / 3;

  return (
    <View style={styles.photoSection}>
      {photos.length > 0 && (
        <View style={styles.photoGrid}>
          {photos.map((photo, index) => (
            <View
              key={photo.uri}
              style={[styles.photoThumb, { width: thumbSize, height: thumbSize }]}
            >
              <Image source={{ uri: photo.uri }} style={styles.photoImage} />
              {index === 0 && (
                <View style={[styles.coverBadge, { backgroundColor: colors.brand }]}>
                  <Text style={[styles.coverBadgeText, { color: colors.textInverse }]}>{t('photo.cover')}</Text>
                </View>
              )}
              <Pressable
                style={({ pressed }) => [styles.photoRemoveBtn, pressed && { opacity: 0.5 }]}
                onPress={() => onRemovePhoto(photo.uri)}
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.removePhoto')}
                accessibilityHint={t('accessibility.removePhotoHint')}
              >
                <AppIcon name="close" size={IconSize.md} color={colors.textInverse} opticalCenter accessible={false} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.photoEnhanceBtn, { backgroundColor: colors.overlay }, pressed && { opacity: 0.6 }]}
                onPress={() => onEnhancePhoto(photo.uri)}
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.enhancePhoto')}
                accessibilityHint={t('accessibility.enhancePhotoHint')}
              >
                <AppIcon name="palette" size={IconSize.micro} color="brand" opticalCenter accessible={false} />
                <Text style={[styles.photoEnhanceText, { color: colors.brand }]}>{t('photo.enhance')}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      <View style={styles.captureRow}>
        <Pressable
          style={({ pressed }) => [styles.captureBtn, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && { opacity: 0.6 }]}
          onPress={onPickFromCamera}
          accessibilityRole="button"
          accessibilityLabel={t('accessibility.takePhotoWithCamera')}
          accessibilityHint={t('accessibility.takePhotoWithCameraHint')}
        >
          <AppIcon name="camera" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
          <Text style={[styles.captureBtnText, { color: colors.textPrimary }]}>{t('photo.camera')}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.captureBtn, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && { opacity: 0.6 }]}
          onPress={onPickFromLibrary}
          accessibilityRole="button"
          accessibilityLabel={t('accessibility.pickPhotosFromGallery')}
          accessibilityHint={t('accessibility.pickPhotosFromGalleryHint')}
        >
          <AppIcon name="image" size={IconSize.md} color="textPrimary" opticalCenter accessible={false} />
          <Text style={[styles.captureBtnText, { color: colors.textPrimary }]}>{t('photo.library')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ===========================================================================
// Listing form skeleton — field geometry, no scanning animation
// ===========================================================================

function ListingFormSkeleton({
  styles }: {
  styles: ReturnType<typeof createStyles>;
}) {
  const { t } = useAppTranslation('aiListing');
  return (
    <View
      accessibilityLabel={t('accessibility.loadingSuggestions')}
      accessibilityHint={t('accessibility.loadingSuggestionsHint')}
      accessibilityState={{ busy: true }}
    >
      <View style={styles.skeletonFieldGroup}>
        <PremiumSkeletonTile width="30%" height={TypographyV2.meta.size + 2} borderRadius={Radius.sm} />
        <PremiumSkeletonTile
          width="100%"
          height={TypographyV2.body.size + Space.sm * 2 + 4}
          borderRadius={Radius.md}
          style={styles.skeletonFieldBlock}
        />
      </View>

      <View style={[styles.fieldRow, styles.skeletonFieldGroup]}>
        <View style={{ flex: 1, marginRight: Space.sm }}>
          <PremiumSkeletonTile width="40%" height={TypographyV2.meta.size + 2} borderRadius={Radius.sm} />
          <PremiumSkeletonTile
            width="100%"
            height={TypographyV2.body.size + Space.sm * 2 + 4}
            borderRadius={Radius.md}
            style={styles.skeletonFieldBlock}
          />
        </View>
        <View style={{ flex: 1 }}>
          <PremiumSkeletonTile width="40%" height={TypographyV2.meta.size + 2} borderRadius={Radius.sm} />
          <PremiumSkeletonTile
            width="100%"
            height={TypographyV2.body.size + Space.sm * 2 + 4}
            borderRadius={Radius.md}
            style={styles.skeletonFieldBlock}
          />
        </View>
      </View>

      <View style={[styles.fieldRow, styles.skeletonFieldGroup]}>
        <View style={{ flex: 1, marginRight: Space.sm }}>
          <PremiumSkeletonTile width="40%" height={TypographyV2.meta.size + 2} borderRadius={Radius.sm} />
          <PremiumSkeletonTile
            width="100%"
            height={TypographyV2.body.size + Space.sm * 2 + 4}
            borderRadius={Radius.md}
            style={styles.skeletonFieldBlock}
          />
        </View>
        <View style={{ flex: 1 }}>
          <PremiumSkeletonTile width="40%" height={TypographyV2.meta.size + 2} borderRadius={Radius.sm} />
          <PremiumSkeletonTile
            width="100%"
            height={TypographyV2.body.size + Space.sm * 2 + 4}
            borderRadius={Radius.md}
            style={styles.skeletonFieldBlock}
          />
        </View>
      </View>
    </View>
  );
}

// ===========================================================================
// Empty state
// ===========================================================================

function EmptyState({
  colors,
  styles }: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  const { t } = useAppTranslation('aiListing');
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceAlt }]}>
        <AppIcon name="camera" size={IconSize.xl} color="textMuted" opticalCenter accessible={false} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
        {t('empty.title')}
      </Text>
      <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
        {t('empty.body')}
      </Text>
    </View>
  );
}

// ===========================================================================
// Error banner
// ===========================================================================

interface ErrorBannerProps {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}

function ErrorBanner({ message, onRetry, onDismiss, colors, styles }: ErrorBannerProps) {
  const { t } = useAppTranslation('aiListing');
  return (
    <View style={[styles.errorBanner, { backgroundColor: colors.dangerSubtle, borderColor: colors.dangerBorder }]}>
      <View style={styles.errorHeader}>
        <AppIcon name="warning" size={IconSize.sm} color="danger" opticalCenter accessible={false} />
        <Text style={[styles.errorText, { color: colors.danger }]} numberOfLines={3}>
          {message}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={onDismiss}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
          accessibilityRole="button"
          accessibilityLabel={t('accessibility.dismissError')}
          accessibilityHint={t('accessibility.dismissErrorHint')}
        >
          <AppIcon name="close" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
        </Pressable>
      </View>
      <Pressable
        style={({ pressed }) => [styles.errorRetryBtn, { borderColor: colors.danger }, pressed && { opacity: 0.6 }]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={t('error.retry')}
        accessibilityHint={t('accessibility.retryHint')}
      >
        <Text style={[styles.errorRetryText, { color: colors.danger }]}>{t('error.retry')}</Text>
      </Pressable>
    </View>
  );
}

// ===========================================================================
// Picker sheet
// ===========================================================================

interface PickerSheetProps {
  options: string[];
  selectedValue: string;
  onSelect: (val: string) => void;
  onClose: () => void;
  title: string;
  colors: ThemeColors;
}

function PickerSheet({ options, selectedValue, onSelect, onClose, title, colors }: PickerSheetProps) {
  const insets = useSafeAreaInsets();
  const { t } = useAppTranslation('aiListing');
  return (
    <Pressable style={[pickerStyles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('accessibility.closePicker')} accessibilityHint={t('accessibility.closePickerHint')}>
      <Pressable
        style={[
          pickerStyles.sheet,
          {
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + Space.md,
            borderTopColor: colors.border },
        ]}
        onPress={(e) => e.stopPropagation()}
        accessibilityRole="button"
      >
        <View style={[pickerStyles.handle, { backgroundColor: colors.border }]} />
        <Text style={[pickerStyles.title, { color: colors.textPrimary }]}>{title}</Text>
        <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
          {options.map((opt) => {
            const selected = opt === selectedValue;
            return (
              <Pressable
                key={opt}
                style={({ pressed }) => [
                  pickerStyles.row,
                  { borderBottomColor: colors.border },
                  pressed && { opacity: 0.5 },
                ]}
                onPress={() => onSelect(opt)}
                accessibilityRole="button"
                accessibilityLabel={t('accessibility.selectOption', { option: opt })}
                accessibilityHint={t('accessibility.chooseOption', { option: opt })}
              >
                <Text
                  style={[
                    pickerStyles.rowText,
                    { color: selected ? colors.brand : colors.textPrimary },
                  ]}
                >
                  {opt}
                </Text>
                {selected && <AppIcon name="verified" focused size={IconSize.sm} color="brand" opticalCenter accessible={false} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </Pressable>
    </Pressable>
  );
}

// ===========================================================================
// Styles
// ===========================================================================

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1 },
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md },
    // Photo capture
    photoSection: {
      marginBottom: Space.md },
    photoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -Space.sm / 2,
      marginBottom: Space.sm },
    photoThumb: {
      margin: Space.sm / 2,
      borderRadius: Radius.md,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt },
    photoImage: {
      width: '100%',
      height: '100%' },
    coverBadge: {
      position: 'absolute',
      top: Space.xs,
      left: Space.xs,
      paddingHorizontal: Space.xs,
      paddingVertical: Space.xs,
      borderRadius: Radius.sm },
    coverBadgeText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.bold,
      letterSpacing: LetterSpacing.wide + 0.18 },
    photoRemoveBtn: {
      position: 'absolute',
      top: Space.xs,
      right: Space.xs,
      width: Control.hit - Space.lg,
      height: Control.hit - Space.lg,
      alignItems: 'center',
      justifyContent: 'center' },
    photoEnhanceBtn: {
      position: 'absolute',
      bottom: Space.xs,
      left: Space.xs,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.sm },
    photoEnhanceText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.bold,
      letterSpacing: LetterSpacing.wide + 0.08 },
    captureRow: {
      flexDirection: 'row',
      gap: Space.sm },
    captureBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      minHeight: Control.hit },
    captureBtnText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold },
    // Form fields
    fieldLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      marginBottom: Space.xs,
      marginTop: Space.md },
    fieldInput: {
      borderWidth: Stroke.standard,
      borderRadius: Radius.md,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm + 2,
      fontSize: TypographyV2.body.size,
      fontFamily: TypeStyles.body.fontFamily,
      minHeight: Control.hit + Space.sm },
    fieldTextarea: {
      borderWidth: Stroke.standard,
      borderRadius: Radius.md,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm + 2,
      fontSize: TypographyV2.body.size,
      fontFamily: TypeStyles.body.fontFamily,
      minHeight: Space.xxl + Space.xxl + Space.sm },
    fieldRow: {
      flexDirection: 'row' },
    pickerField: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: Stroke.standard,
      borderRadius: Radius.md,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm + 2,
      minHeight: Control.hit + Space.sm },
    pickerValue: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypeStyles.body.fontFamily,
      flex: 1 },
    priceRangeHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.body.fontFamily,
      marginTop: Space.xs,
      marginBottom: Space.md },
    attentionHint: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.body.fontFamily,
      marginTop: Space.xs,
      lineHeight: TypographyV2.meta.lineHeight },
    impactHelperText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.body.fontFamily,
      marginTop: Space.xs,
      lineHeight: TypographyV2.meta.lineHeight },
    // Suggestion row — inline, restrained
    suggestionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.xs,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.sm + 2,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt },
    suggestionRowCompact: {
      paddingVertical: Space.xs + 2 },
    suggestionContent: {
      flex: 1 },
    suggestionCandidate: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypeStyles.body.fontFamily,
      lineHeight: TypographyV2.body.lineHeight },
    suggestionEvidence: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.body.fontFamily,
      marginTop: Space.xxs },
    suggestionActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm },
    suggestionAcceptBtn: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.sm,
      borderWidth: Stroke.standard },
    suggestionAcceptText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold },
    // Smart Sell
    smartSellWrap: {
      marginTop: Space.md,
      marginBottom: Space.md },
    // Tags
    tagsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs,
      marginTop: Space.xs },
    tagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
      borderWidth: Stroke.hairline },
    tagText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold },
    tagInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
      borderWidth: Stroke.hairline },
    tagInput: {
      minWidth: Space.xxl + Space.lg - 2,
      fontSize: TypographyV2.meta.size,
      fontFamily: TypeStyles.body.fontFamily,
      padding: 0 },
    // Section labels
    sectionLabelWrap: {
      marginTop: Space.md,
      marginBottom: Space.xs },
    sectionLabel: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold,
      letterSpacing: LetterSpacing.wide + 0.28,
      textTransform: 'uppercase' },
    // Skeleton
    skeletonFieldGroup: {
      marginBottom: Space.md },
    skeletonFieldBlock: {
      marginTop: Space.xs },
    // Empty state
    emptyState: {
      alignItems: 'center',
      paddingVertical: Space.xl,
      paddingHorizontal: Space.md },
    emptyIcon: {
      width: Space.xxl + Space.lg,
      height: Space.xxl + Space.lg,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Space.md },
    emptyTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: FontFamily.bold,
      marginBottom: Space.xs },
    emptyDesc: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypeStyles.body.fontFamily,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: TypographyV2.body.lineHeight },
    // Error banner
    errorBanner: {
      borderRadius: Radius.md,
      borderWidth: Stroke.hairline,
      padding: Space.sm + 2,
      marginBottom: Space.md },
    errorHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs },
    errorText: {
      flex: 1,
      fontSize: TypographyV2.body.size,
      fontFamily: TypeStyles.body.fontFamily },
    errorRetryBtn: {
      alignSelf: 'flex-start',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      borderRadius: Radius.sm,
      borderWidth: Stroke.standard,
      marginTop: Space.xs },
    errorRetryText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.semibold },
    // Footer
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md } });
}

const pickerStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Space.sm,
    paddingHorizontal: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth },
  handle: {
    width: Space.xxl + Space.sm,
    height: Stroke.standard * 4,
    borderRadius: Radius.sm,
    backgroundColor: 'transparent',
    alignSelf: 'center',
    marginBottom: Space.sm },
  title: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    marginBottom: Space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit },
  rowText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypeStyles.body.fontFamily } });
