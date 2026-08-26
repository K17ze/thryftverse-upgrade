import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Dimensions,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { NativeStackScreenProps, RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, TypeStyles, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';
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
  createListingImageOnApi,
} from '../services/listingsApi';
import { MediaUploadQueue } from '../services/mediaUploadQueue';
import { consumeEnhancementResult } from '../services/enhancementResultHandoff';
import { SmartSellCard } from '../components/sell/SmartSellCard';
import { ListingQualityMeter } from '../components/sell/ListingQualityMeter';
import { ListingPreviewCard } from '../components/sell/ListingPreviewCard';
import { SustainabilityTags } from '../components/sell/SustainabilityTags';
import {
  fetchSmartSellPolicy,
  type SmartSellPolicy,
} from '../services/smartSellApi';
import {
  type FieldSuggestion,
  type ListingField,
} from '../services/aiListingApi';
import {
  scoreListing,
  type ListingQualityScore,
} from '../services/listingQualityApi';
import { useTaxonomy } from '../context/TaxonomyContext';
import { useFormattedPrice } from '../hooks/useFormattedPrice';

const { width: SCREEN_W } = Dimensions.get('window');

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
    getField,
  } = useAIListingSuggestion(photoUris);

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
      showInfo('Photo enhanced', handoff.appliedOperationLabel);
    }, [showInfo]),
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
        showError('Photo access needed', 'Photo access is required to add listing photos.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: 8,
        quality: 0.85,
        exif: false,
      });
      if (result.canceled) return;
      const assets = result.assets.map((a) => ({
        uri: a.uri,
        width: a.width,
        height: a.height,
      }));
      setPhotos((prev) => [...prev, ...assets].slice(0, 8));
    } catch {
      showError('Pick failed', 'Could not pick photos. Try again.');
    }
  }, [showError]);

  const handlePickFromCamera = useCallback(async () => {
    haptics.tap();
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        showError('Camera access needed', 'Camera access is required to take listing photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: false,
        exif: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      setPhotos((prev) =>
        [...prev, { uri: asset.uri, width: asset.width, height: asset.height }].slice(0, 8),
      );
    } catch {
      showError('Capture failed', 'Could not take a photo. Try again.');
    }
  }, [showError]);

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
      setPublishError('Sign in to publish a listing.');
      haptics.error();
      return;
    }
    if (isOffline) {
      setPublishError('You appear to be offline. Check your connection and try again.');
      haptics.error();
      return;
    }
    const trimmedTitle = title.trim();
    const numericPrice = Number(sanitizeDecimalInput(price));
    if (!trimmedTitle || !numericPrice || photos.length === 0) {
      setPublishError('Add at least one photo, a title and a price before publishing.');
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
        height: p.height,
      }));
      queue.addAssets(assets);
      await queue.run();
      const queueItems = queue.getItems();
      const coverUpload = queueItems.find(
        (item) => item.state === 'uploaded' && item.publicUrl && item.finalizationId,
      );
      if (!coverUpload) {
        throw new Error('A verified cover image is required before publishing.');
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
        weightKg: weightKg ? parseFloat(weightKg) : undefined,
      });

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
          finalizationId: verifiedUpload.finalizationId!,
        });
      }

      queue.reset();
      haptics.success();
      // Honest preview message when Smart Sell is enabled in preview mode
      if (smartSellPolicy.enabled && smartSellPolicy.capability.kind === 'preview') {
        showInfo(
          'Smart Sell saved (preview)',
          'Your settings will be activated when Smart Sell is fully available.',
        );
      }
      navigation.replace('ListingSuccess', {
        listingId,
        title: trimmedTitle,
        price: numericPrice,
        categoryId: category,
        photoUri: coverImage,
        smartSellEnabled: smartSellPolicy.enabled,
      });
    } catch (e: unknown) {
      const isNetwork =
        isOffline ||
        (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'NETWORK_ERROR');
      const rawMsg =
        typeof e === 'object' && e && 'message' in e && typeof (e as Error).message === 'string'
          ? (e as Error).message
          : 'Failed to publish. Try again.';
      setPublishError(isNetwork ? 'You appear to be offline. Check your connection and try again.' : rawMsg);
      haptics.error();
    } finally {
      setIsSubmitting(false);
    }
  }, [currentUser, isOffline, photos, title, price, description, category, brand, condition, materialComposition, weightKg, navigation, smartSellPolicy, showInfo]);

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
      shippingMethod: 'standard',
    });
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
  const conditionField = getField('condition');
  const priceGuidance = suggestion?.priceGuidance;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* -- Header -- product language, not AI branding */}
      <ScreenHeader
        title="Quick list"
        subtitle="Snap photos · review · publish"
        backIcon="arrow-back"
        onBack={() => navigation.goBack()}
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
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
              <FieldLabel label="Title" colors={colors} styles={styles} />
              <TextInput
                style={[styles.fieldInput, { color: colors.textPrimary, borderColor: colors.border }]}
                value={title}
                onChangeText={handleTitleChange}
                placeholder="e.g. Vintage Levi's 501 Denim Jacket"
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
              <FieldLabel label="Description" colors={colors} styles={styles} />
              <TextInput
                style={[styles.fieldTextarea, { color: colors.textPrimary, borderColor: colors.border }]}
                value={description}
                onChangeText={handleDescriptionChange}
                placeholder="Describe your item…"
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
                  <FieldLabel label="Category" colors={colors} styles={styles} />
                  <Pressable
                    style={({ pressed }) => [styles.pickerField, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
                    onPress={() => setPickerMode('Category')}
                    accessibilityRole="button"
                    accessibilityLabel="Select category"
                    accessibilityHint="Opens category picker"
                  >
                    <Text
                      style={[
                        styles.pickerValue,
                        { color: category ? colors.textPrimary : colors.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {category || 'Select category'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={colors.textMuted} aria-hidden={true} />
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
                  <FieldLabel label="Brand" colors={colors} styles={styles} />
                  <TextInput
                    style={[styles.fieldInput, { color: colors.textPrimary, borderColor: colors.border }]}
                    value={brand}
                    onChangeText={handleBrandChange}
                    placeholder="Brand"
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
                  <FieldLabel label="Condition" colors={colors} styles={styles} />
                  <Pressable
                    style={({ pressed }) => [styles.pickerField, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
                    onPress={() => setPickerMode('Condition')}
                    accessibilityRole="button"
                    accessibilityLabel="Select condition"
                    accessibilityHint="Opens condition picker"
                  >
                    <Text
                      style={[
                        styles.pickerValue,
                        { color: condition ? colors.textPrimary : colors.textMuted },
                      ]}
                      numberOfLines={1}
                    >
                      {condition || 'Select condition'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color={colors.textMuted} aria-hidden={true} />
                  </Pressable>
                  {/* Condition always requires seller attestation — no suggestion */}
                  {conditionField?.abstained && !condition && (
                    <Text style={[styles.attentionHint, { color: colors.warning }]}>
                      {conditionField.reason}
                    </Text>
                  )}
                </View>

                <View style={{ flex: 1 }}>
                  <FieldLabel label="Price (GBP)" colors={colors} styles={styles} />
                  <TextInput
                    style={[styles.fieldInput, { color: colors.textPrimary, borderColor: colors.border }]}
                    value={price}
                    onChangeText={(v) => {
                      markDirty('price');
                      setPrice(sanitizeDecimalInput(v));
                    }}
                    placeholder="0.00"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              {/* Price guidance — communicates uncertainty as a range */}
              {priceGuidance && !dirtyFieldsRef.current.has('price') && (
                <Text style={[styles.priceRangeHint, { color: colors.textMuted }]}>
                  {priceGuidance.basis}: {currencySymbol}{priceGuidance.min}–{currencySymbol}{priceGuidance.max}
                </Text>
              )}

              {/* Smart Sell — compact row */}
              <View style={styles.smartSellWrap}>
                <SmartSellCard
                  listingId={`draft_${currentUser?.id ?? 'anon'}`}
                  policy={smartSellPolicy}
                  onPolicyChange={setSmartSellPolicy}
                  listingPrice={Number(sanitizeDecimalInput(price)) || undefined}
                />
              </View>

              {/* Tags */}
              <FieldLabel label="Tags" colors={colors} styles={styles} />
              <View style={styles.tagsWrap}>
                {tags.map((tag) => (
                  <View key={tag} style={[styles.tagChip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.tagText, { color: colors.brand }]}>{tag}</Text>
                    <Pressable
                      hitSlop={8}
                      onPress={() => handleRemoveTag(tag)}
                      style={({ pressed }) => pressed && { opacity: 0.5 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove tag ${tag}`}
                      accessibilityHint={`Remove the tag ${tag} from this listing`}
                    >
                      <Ionicons name="close" size={14} color={colors.textMuted} aria-hidden={true} />
                    </Pressable>
                  </View>
                ))}
                <View style={[styles.tagInputWrap, { borderColor: colors.border }]}>
                  <TextInput
                    style={[styles.tagInput, { color: colors.textPrimary }]}
                    value={tagInput}
                    onChangeText={setTagInput}
                    placeholder="Add tag"
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
                      accessibilityLabel="Add tag"
                      accessibilityHint="Add this tag to the listing"
                    >
                      <Ionicons name="add-circle" size={18} color={colors.brand} aria-hidden={true} />
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
              <FieldLabel label="Material composition" colors={colors} styles={styles} />
              <TextInput
                style={[styles.fieldInput, { color: colors.textPrimary, borderColor: colors.border }]}
                value={materialComposition}
                onChangeText={setMaterialComposition}
                placeholder="e.g. cotton, polyester, wool..."
                placeholderTextColor={colors.textMuted}
              />
              <FieldLabel label="Weight (kg)" colors={colors} styles={styles} />
              <TextInput
                style={[styles.fieldInput, { color: colors.textPrimary, borderColor: colors.border }]}
                value={weightKg}
                onChangeText={(v) => setWeightKg(sanitizeDecimalInput(v))}
                placeholder="e.g. 0.45"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
              />
              <Text style={[styles.impactHelperText, { color: colors.textMuted }]}>
                Used to calculate real environmental impact. Optional but recommended.
              </Text>

              {/* Listing preview */}
              <View style={styles.sectionLabelWrap}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                  Preview
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
                  Completeness
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
            title={isSubmitting ? 'Publishing…' : 'Review & publish'}
            onPress={handlePublish}
            disabled={!canPublish}
            loading={isSubmitting}
            variant="primary"
            size="lg"
            accessibilityLabel="Publish listing"
            accessibilityHint="Submit your listing for publishing"
            icon={<Ionicons name="checkmark-circle-outline" size={18} color={colors.textInverse} aria-hidden={true} />}
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
          title={pickerMode === 'Category' ? 'Select category' : 'Select condition'}
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
  const candidateText = useMemo(() => {
    if (typeof suggestion.candidate === 'string') return suggestion.candidate;
    if (Array.isArray(suggestion.candidate)) return (suggestion.candidate as string[]).join(', ');
    return '';
  }, [suggestion.candidate]);

  const evidenceText = suggestion.evidence.length > 0
    ? suggestion.evidence[0].ref
    : 'Suggested';

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
          accessibilityLabel={`Accept suggestion: ${candidateText}`}
          accessibilityHint="Apply this suggestion to the field"
        >
          <Text style={[styles.suggestionAcceptText, { color: colors.brand }]}>
            Use
          </Text>
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={onDismiss}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss suggestion"
          accessibilityHint="Hide this suggestion without applying it"
        >
          <Ionicons name="close" size={16} color={colors.textMuted} aria-hidden={true} />
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
  styles,
}: {
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
  styles,
}: PhotoCaptureSectionProps) {
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
                  <Text style={[styles.coverBadgeText, { color: colors.textInverse }]}>Cover</Text>
                </View>
              )}
              <Pressable
                style={({ pressed }) => [styles.photoRemoveBtn, pressed && { opacity: 0.5 }]}
                onPress={() => onRemovePhoto(photo.uri)}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                accessibilityHint="Remove this photo from the listing"
              >
                <Ionicons name="close-circle" size={22} color={colors.textInverse} aria-hidden={true} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.photoEnhanceBtn, { backgroundColor: `${colors.background}E6` }, pressed && { opacity: 0.6 }]}
                onPress={() => onEnhancePhoto(photo.uri)}
                accessibilityRole="button"
                accessibilityLabel="Enhance photo"
                accessibilityHint="Opens photo enhancement to improve this listing image"
              >
                <Ionicons name="color-filter-outline" size={12} color={colors.brand} aria-hidden={true} />
                <Text style={[styles.photoEnhanceText, { color: colors.brand }]}>Enhance</Text>
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
          accessibilityLabel="Take a photo with the camera"
          accessibilityHint="Open camera to capture a photo"
        >
          <Ionicons name="camera-outline" size={22} color={colors.textPrimary} aria-hidden={true} />
          <Text style={[styles.captureBtnText, { color: colors.textPrimary }]}>Camera</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.captureBtn, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && { opacity: 0.6 }]}
          onPress={onPickFromLibrary}
          accessibilityRole="button"
          accessibilityLabel="Pick photos from gallery"
          accessibilityHint="Open gallery to select photos"
        >
          <Ionicons name="images-outline" size={22} color={colors.textPrimary} aria-hidden={true} />
          <Text style={[styles.captureBtnText, { color: colors.textPrimary }]}>Gallery</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ===========================================================================
// Listing form skeleton — field geometry, no scanning animation
// ===========================================================================

function ListingFormSkeleton({
  styles,
}: {
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View
      accessibilityLabel="Loading suggestions"
      accessibilityHint="Suggestions are being generated"
      accessibilityState={{ busy: true }}
    >
      <View style={styles.skeletonFieldGroup}>
        <PremiumSkeletonTile width="30%" height={Type.caption.size + 2} borderRadius={Radius.sm} />
        <PremiumSkeletonTile
          width="100%"
          height={Type.body.size + Space.sm * 2 + 4}
          borderRadius={Radius.md}
          style={styles.skeletonFieldBlock}
        />
      </View>

      <View style={[styles.fieldRow, styles.skeletonFieldGroup]}>
        <View style={{ flex: 1, marginRight: Space.sm }}>
          <PremiumSkeletonTile width="40%" height={Type.caption.size + 2} borderRadius={Radius.sm} />
          <PremiumSkeletonTile
            width="100%"
            height={Type.body.size + Space.sm * 2 + 4}
            borderRadius={Radius.md}
            style={styles.skeletonFieldBlock}
          />
        </View>
        <View style={{ flex: 1 }}>
          <PremiumSkeletonTile width="40%" height={Type.caption.size + 2} borderRadius={Radius.sm} />
          <PremiumSkeletonTile
            width="100%"
            height={Type.body.size + Space.sm * 2 + 4}
            borderRadius={Radius.md}
            style={styles.skeletonFieldBlock}
          />
        </View>
      </View>

      <View style={[styles.fieldRow, styles.skeletonFieldGroup]}>
        <View style={{ flex: 1, marginRight: Space.sm }}>
          <PremiumSkeletonTile width="40%" height={Type.caption.size + 2} borderRadius={Radius.sm} />
          <PremiumSkeletonTile
            width="100%"
            height={Type.body.size + Space.sm * 2 + 4}
            borderRadius={Radius.md}
            style={styles.skeletonFieldBlock}
          />
        </View>
        <View style={{ flex: 1 }}>
          <PremiumSkeletonTile width="40%" height={Type.caption.size + 2} borderRadius={Radius.sm} />
          <PremiumSkeletonTile
            width="100%"
            height={Type.body.size + Space.sm * 2 + 4}
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
  styles,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="camera-outline" size={28} color={colors.textMuted} aria-hidden={true} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
        Snap to list
      </Text>
      <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
        Add photos above and we'll suggest a title, description, category and
        price range. Review and edit everything before publishing.
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
  return (
    <View style={[styles.errorBanner, { backgroundColor: colors.dangerSubtle, borderColor: colors.dangerBorder }]}>
      <View style={styles.errorHeader}>
        <Ionicons name="alert-circle-outline" size={18} color={colors.danger} aria-hidden={true} />
        <Text style={[styles.errorText, { color: colors.danger }]} numberOfLines={3}>
          {message}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={onDismiss}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss error"
          accessibilityHint="Dismiss this error message"
        >
          <Ionicons name="close" size={16} color={colors.textMuted} aria-hidden={true} />
        </Pressable>
      </View>
      <Pressable
        style={({ pressed }) => [styles.errorRetryBtn, { borderColor: colors.danger }, pressed && { opacity: 0.6 }]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry"
        accessibilityHint="Retry the failed action"
      >
        <Text style={[styles.errorRetryText, { color: colors.danger }]}>Retry</Text>
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
  return (
    <Pressable style={[pickerStyles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close picker" accessibilityHint="Close the picker sheet">
      <Pressable
        style={[
          pickerStyles.sheet,
          {
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + Space.md,
            borderTopColor: colors.border,
          },
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
                accessibilityLabel={`Select ${opt}`}
                accessibilityHint={`Choose ${opt} as the selected option`}
              >
                <Text
                  style={[
                    pickerStyles.rowText,
                    { color: selected ? colors.brand : colors.textPrimary },
                  ]}
                >
                  {opt}
                </Text>
                {selected && <Ionicons name="checkmark" size={18} color={colors.brand} aria-hidden={true} />}
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
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: Space.md,
      paddingTop: Space.md,
    },
    // Photo capture
    photoSection: {
      marginBottom: Space.md,
    },
    photoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginHorizontal: -Space.sm / 2,
      marginBottom: Space.sm,
    },
    photoThumb: {
      margin: Space.sm / 2,
      borderRadius: Radius.md,
      overflow: 'hidden',
      backgroundColor: colors.surfaceAlt,
    },
    photoImage: {
      width: '100%',
      height: '100%',
    },
    coverBadge: {
      position: 'absolute',
      top: Space.xs,
      left: Space.xs,
      paddingHorizontal: Space.xs,
      paddingVertical: Space.xs,
      borderRadius: Radius.sm,
    },
    coverBadgeText: {
      fontSize: Type.meta.size,
      fontWeight: '700',
      letterSpacing: LetterSpacing.wide + 0.18,
    },
    photoRemoveBtn: {
      position: 'absolute',
      top: Space.xs,
      right: Space.xs,
      width: Control.hit - Space.lg,
      height: Control.hit - Space.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoEnhanceBtn: {
      position: 'absolute',
      bottom: Space.xs,
      left: Space.xs,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.sm,
    },
    photoEnhanceText: {
      fontSize: Type.meta.size,
      fontWeight: '700',
      letterSpacing: LetterSpacing.wide + 0.08,
    },
    captureRow: {
      flexDirection: 'row',
      gap: Space.sm,
    },
    captureBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
      paddingVertical: Space.sm + 2,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      minHeight: Control.hit,
    },
    captureBtnText: {
      fontSize: Type.body.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600',
    },
    // Form fields
    fieldLabel: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      fontWeight: '500',
      marginBottom: Space.xs,
      marginTop: Space.md,
    },
    fieldInput: {
      borderWidth: Stroke.standard,
      borderRadius: Radius.md,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm + 2,
      fontSize: Type.body.size,
      fontFamily: TypeStyles.body.fontFamily,
      minHeight: Control.hit + Space.sm,
    },
    fieldTextarea: {
      borderWidth: Stroke.standard,
      borderRadius: Radius.md,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm + 2,
      fontSize: Type.body.size,
      fontFamily: TypeStyles.body.fontFamily,
      minHeight: Space.xxl + Space.xxl + Space.sm,
    },
    fieldRow: {
      flexDirection: 'row',
    },
    pickerField: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: Stroke.standard,
      borderRadius: Radius.md,
      paddingHorizontal: Space.sm + 2,
      paddingVertical: Space.sm + 2,
      minHeight: Control.hit + Space.sm,
    },
    pickerValue: {
      fontSize: Type.body.size,
      fontFamily: TypeStyles.body.fontFamily,
      flex: 1,
    },
    priceRangeHint: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      marginTop: Space.xs,
      marginBottom: Space.md,
    },
    attentionHint: {
      fontSize: Type.meta.size,
      fontFamily: TypeStyles.body.fontFamily,
      marginTop: Space.xs,
      lineHeight: Type.meta.lineHeight,
    },
    impactHelperText: {
      fontSize: Type.meta.size,
      fontFamily: TypeStyles.body.fontFamily,
      marginTop: Space.xs,
      lineHeight: Type.meta.lineHeight,
    },
    // Suggestion row — inline, restrained
    suggestionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.xs,
      paddingVertical: Space.sm,
      paddingHorizontal: Space.sm + 2,
      borderRadius: Radius.md,
      backgroundColor: colors.surfaceAlt,
    },
    suggestionRowCompact: {
      paddingVertical: Space.xs + 2,
    },
    suggestionContent: {
      flex: 1,
    },
    suggestionCandidate: {
      fontSize: Type.body.size,
      fontFamily: TypeStyles.body.fontFamily,
      lineHeight: Type.body.lineHeight,
    },
    suggestionEvidence: {
      fontSize: Type.meta.size,
      fontFamily: TypeStyles.body.fontFamily,
      marginTop: Space.xxs,
    },
    suggestionActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    suggestionAcceptBtn: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.sm,
      borderWidth: Stroke.standard,
    },
    suggestionAcceptText: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600',
    },
    // Smart Sell
    smartSellWrap: {
      marginTop: Space.md,
      marginBottom: Space.md,
    },
    // Tags
    tagsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs,
      marginTop: Space.xs,
    },
    tagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
      borderWidth: Stroke.hairline,
    },
    tagText: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600',
    },
    tagInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
      borderWidth: Stroke.hairline,
    },
    tagInput: {
      minWidth: Space.xxl + Space.lg - 2,
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      padding: 0,
    },
    // Section labels
    sectionLabelWrap: {
      marginTop: Space.md,
      marginBottom: Space.xs,
    },
    sectionLabel: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      fontWeight: '600',
      letterSpacing: LetterSpacing.wide + 0.28,
      textTransform: 'uppercase',
    },
    // Skeleton
    skeletonFieldGroup: {
      marginBottom: Space.md,
    },
    skeletonFieldBlock: {
      marginTop: Space.xs,
    },
    // Empty state
    emptyState: {
      alignItems: 'center',
      paddingVertical: Space.xl,
      paddingHorizontal: Space.md,
    },
    emptyIcon: {
      width: Space.xxl + Space.lg,
      height: Space.xxl + Space.lg,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: Space.md,
    },
    emptyTitle: {
      fontSize: Type.subtitle.size,
      fontFamily: TypeStyles.title.fontFamily,
      fontWeight: '700',
      marginBottom: Space.xs,
    },
    emptyDesc: {
      fontSize: Type.body.size,
      fontFamily: TypeStyles.body.fontFamily,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: Type.body.lineHeight,
    },
    // Error banner
    errorBanner: {
      borderRadius: Radius.md,
      borderWidth: Stroke.hairline,
      padding: Space.sm + 2,
      marginBottom: Space.md,
    },
    errorHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.xs,
    },
    errorText: {
      flex: 1,
      fontSize: Type.body.size,
      fontFamily: TypeStyles.body.fontFamily,
    },
    errorRetryBtn: {
      alignSelf: 'flex-start',
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs,
      borderRadius: Radius.sm,
      borderWidth: Stroke.standard,
      marginTop: Space.xs,
    },
    errorRetryText: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600',
    },
    // Footer
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingHorizontal: Space.md,
      paddingTop: Space.sm,
      paddingBottom: Space.md,
    },
  });
}

const pickerStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Space.sm,
    paddingHorizontal: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  handle: {
    width: Space.xxl + Space.sm,
    height: Stroke.standard * 4,
    borderRadius: Radius.sm,
    backgroundColor: 'transparent',
    alignSelf: 'center',
    marginBottom: Space.sm,
  },
  title: {
    fontSize: Type.subtitle.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    fontWeight: '600',
    marginBottom: Space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit,
  },
  rowText: {
    fontSize: Type.body.size,
    fontFamily: TypeStyles.body.fontFamily,
  },
});
