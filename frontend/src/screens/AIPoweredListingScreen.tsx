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
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
  cancelAnimation,
} from 'react-native-reanimated';

import { NativeStackScreenProps, RootStackParamList } from '../navigation/types';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { Space, Radius, Type, TypeStyles, Stroke, Control, LetterSpacing } from '../theme/designTokens';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { AppButton } from '../components/ui/AppButton';
import { PremiumSkeletonTile } from '../components/discover/PremiumSkeletonTile';
import { useAIListingSuggestion } from '../hooks/useAIListingSuggestion';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { Motion } from '../theme/motionTokens';
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
import {
  type ListingMediaDraftItem,
} from '../utils/mediaUploadAsset';
import { SmartSellCard } from '../components/sell/SmartSellCard';
import { ListingQualityMeter } from '../components/sell/ListingQualityMeter';
import { ListingPreviewCard } from '../components/sell/ListingPreviewCard';
import { SustainabilityTags } from '../components/sell/SustainabilityTags';
import {
  fetchSmartSellConfig,
  SMART_SELL_DEMO_MODE,
  type SmartSellConfig,
} from '../services/smartSellApi';
import {
  scoreListing,
  type ListingQualityScore,
} from '../services/listingQualityApi';

const { width: SCREEN_W } = Dimensions.get('window');

const CONDITION_OPTIONS = ['New with tags', 'Very good', 'Good', 'Satisfactory'];
const CATEGORY_OPTIONS = [
  'Women', 'Men', 'Kids', 'Home', 'Vintage', 'Accessories',
  'Beauty', 'Sportswear', 'Luxury',
];

type Props = NativeStackScreenProps<RootStackParamList, 'AIPoweredListing'>;

type ScreenPhase =
  | 'empty' // no photos yet
  | 'analyzing' // AI analysis in progress
  | 'populated' // suggestions loaded, form editable
  | 'submitting' // publishing listing
  | 'success' // listing created
  | 'error'; // analysis or publish error

interface DraftPhoto {
  uri: string;
  width?: number;
  height?: number;
}

export default function AIPoweredListingScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const { isOffline } = useConnectivity();
  const currentUser = useStore((s) => s.currentUser);
  const { showError, showInfo } = useNotifications();

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
  const [smartSellConfig, setSmartSellConfig] = useState<SmartSellConfig>(() =>
    fetchSmartSellConfig(`draft_${currentUser?.id ?? 'anon'}`),
  );
  const [sustainabilityTags, setSustainabilityTags] = useState<string[]>([]);

  const photoUris = useMemo(() => photos.map((p) => p.uri), [photos]);

  const {
    suggestion,
    isLoading: isAnalyzing,
    error: analysisError,
    analyze,
    clearError,
    reset: resetSuggestion,
  } = useAIListingSuggestion(photoUris);

  // -- Apply suggestions to form fields when they arrive -------------------
  const appliedSignatureRef = useRef<string>('');
  useEffect(() => {
    if (!suggestion) return;
    const sig = JSON.stringify(suggestion);
    if (sig === appliedSignatureRef.current) return;
    appliedSignatureRef.current = sig;

    setTitle(suggestion.suggestedTitle);
    setDescription(suggestion.suggestedDescription);
    setCategory(suggestion.suggestedCategory);
    setBrand(suggestion.suggestedBrand ?? '');
    setCondition(suggestion.suggestedCondition);
    // Price is NOT auto-filled — the suggested range is shown as guidance so
    // the seller picks their own price (communicates uncertainty honestly).
    setTags(suggestion.suggestedTags);
    haptics.tap();
  }, [suggestion]);

  // -- Auto-analyze whenever the photo set changes --------------------------
  const analyzeSignatureRef = useRef<string>('');
  useEffect(() => {
    if (photoUris.length === 0) {
      resetSuggestion();
      appliedSignatureRef.current = '';
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

  // -- Tags ----------------------------------------------------------------
  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase();
    if (!trimmed) return;
    if (tags.includes(trimmed)) {
      setTagInput('');
      return;
    }
    setTags((prev) => [...prev, trimmed]);
    setTagInput('');
    haptics.tap();
  }, [tagInput, tags]);

  const handleRemoveTag = useCallback((tag: string) => {
    haptics.tap();
    setTags((prev) => prev.filter((t) => t !== tag));
  }, []);

  // -- Picker --------------------------------------------------------------
  const pickerOptions = useMemo(() => {
    if (pickerMode === 'Category') return CATEGORY_OPTIONS;
    if (pickerMode === 'Condition') return CONDITION_OPTIONS;
    return [];
  }, [pickerMode]);

  const handlePickerSelect = useCallback(
    (val: string) => {
      if (pickerMode === 'Category') setCategory(val);
      if (pickerMode === 'Condition') setCondition(val);
      setPickerMode(null);
      haptics.selection();
    },
    [pickerMode],
  );

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
      // Truthful demo message when Smart Sell is enabled — the setting is
      // illustrative only (SMART_SELL_DEMO_MODE) and is not sent to a backend.
      if (smartSellConfig.enabled && SMART_SELL_DEMO_MODE) {
        showInfo(
          'Smart Sell enabled (demo)',
          'Auto-negotiation settings are illustrative.',
        );
      }
      navigation.replace('ListingSuccess', {
        listingId,
        title: trimmedTitle,
        price: numericPrice,
        categoryId: category,
        photoUri: coverImage,
        smartSellEnabled: smartSellConfig.enabled,
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
  }, [currentUser, isOffline, photos, title, price, description, category, brand, condition, navigation, smartSellConfig, showInfo]);

  // -- Derived phase -------------------------------------------------------
  const phase: ScreenPhase = useMemo(() => {
    if (isSubmitting) return 'submitting';
    if (publishError) return 'error';
    if (photos.length === 0) return 'empty';
    if (isAnalyzing) return 'analyzing';
    if (suggestion) return 'populated';
    if (analysisError) return 'error';
    return 'empty';
  }, [isSubmitting, publishError, photos.length, isAnalyzing, suggestion, analysisError]);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const confidencePct = suggestion
    ? Math.round(suggestion.confidenceScore * 100)
    : 0;

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

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* -- Header -- */}
      <ScreenHeader
        title="AI Quick List"
        subtitle="Snap photos · review · publish"
        backIcon="arrow-back"
        onBack={() => navigation.goBack()}
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        }}
      />

      {SMART_SELL_DEMO_MODE && (
        <View style={[styles.demoBanner, { backgroundColor: `${colors.warning}15`, borderBottomColor: `${colors.warning}30` }]}>
          <Ionicons name="flask-outline" size={16} color={colors.warning} />
          <Text style={[styles.demoBannerText, { color: colors.textPrimary }]}>
            Demo Mode — AI suggestions are illustrative and not sent to a backend.
          </Text>
        </View>
      )}

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
            reducedMotion={reducedMotion}
          />

          {/* -- 2. AI ANALYSIS / SCANNING STATE -- */}
          {phase === 'analyzing' && (
            <>
              <AnalyzingOverlay colors={colors} styles={styles} reducedMotion={reducedMotion} />
              <ListingFormSkeleton colors={colors} styles={styles} reducedMotion={reducedMotion} />
            </>
          )}

          {/* -- 3. EMPTY STATE -- */}
          {phase === 'empty' && photos.length === 0 && (
            <EmptyState colors={colors} styles={styles} reducedMotion={reducedMotion} />
          )}

          {/* -- 4. ANALYSIS ERROR -- */}
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

          {/* -- 5. PUBLISH ERROR -- */}
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

          {/* -- 6. SUGGESTED FIELDS -- */}
          {suggestion && !isAnalyzing && (
            <View>
              {/* AI confidence banner — truthful labelling (§11) */}
              <View style={[styles.confidenceBanner, { backgroundColor: `${colors.brand}10`, borderColor: `${colors.brand}30` }]}>
                <Ionicons name="document-text-outline" size={16} color={colors.brand} />
                <View style={styles.confidenceTextWrap}>
                  <Text style={[styles.confidenceTitle, { color: colors.brand }]}>
                    Suggestions — review before publishing
                  </Text>
                  <Text style={[styles.confidenceSub, { color: colors.textSecondary }]}>
                    Confidence {confidencePct}% · heuristic preview, not image recognition
                  </Text>
                </View>
                <View style={[styles.confidencePill, { backgroundColor: colors.brand }]}>
                  <Text style={[styles.confidencePillText, { color: colors.textInverse }]}>
                    {confidencePct}%
                  </Text>
                </View>
              </View>

              {/* Title */}
              <AIBadgeField
                label="Title"
                isAISuggested={title === suggestion.suggestedTitle}
                colors={colors}
                styles={styles}
              >
                <TextInput
                  style={[styles.fieldInput, { color: colors.textPrimary, borderColor: colors.border }]}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g. Vintage Levi's 501 Denim Jacket"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="next"
                />
              </AIBadgeField>

              {/* Description */}
              <AIBadgeField
                label="Description"
                isAISuggested={description === suggestion.suggestedDescription}
                colors={colors}
                styles={styles}
              >
                <TextInput
                  style={[styles.fieldTextarea, { color: colors.textPrimary, borderColor: colors.border }]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe your item…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </AIBadgeField>

              {/* Category + Brand row */}
              <View style={styles.fieldRow}>
                <AIBadgeField
                  label="Category"
                  isAISuggested={category === suggestion.suggestedCategory}
                  colors={colors}
                  styles={styles}
                  style={{ flex: 1, marginRight: Space.sm }}
                >
                  <Pressable
                    style={({ pressed }) => [styles.pickerField, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
                    onPress={() => setPickerMode('Category')}
                    accessibilityRole="button"
                    accessibilityLabel="Select category"
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
                    <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                  </Pressable>
                </AIBadgeField>

                <AIBadgeField
                  label="Brand"
                  isAISuggested={brand === (suggestion.suggestedBrand ?? '')}
                  colors={colors}
                  styles={styles}
                  style={{ flex: 1 }}
                >
                  <TextInput
                    style={[styles.fieldInput, { color: colors.textPrimary, borderColor: colors.border }]}
                    value={brand}
                    onChangeText={setBrand}
                    placeholder="Brand"
                    placeholderTextColor={colors.textMuted}
                  />
                </AIBadgeField>
              </View>

              {/* Condition + Price row */}
              <View style={styles.fieldRow}>
                <AIBadgeField
                  label="Condition"
                  isAISuggested={condition === suggestion.suggestedCondition}
                  colors={colors}
                  styles={styles}
                  style={{ flex: 1, marginRight: Space.sm }}
                >
                  <Pressable
                    style={({ pressed }) => [styles.pickerField, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
                    onPress={() => setPickerMode('Condition')}
                    accessibilityRole="button"
                    accessibilityLabel="Select condition"
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
                    <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                  </Pressable>
                </AIBadgeField>

                <AIBadgeField
                  label="Price (GBP)"
                  isAISuggested={false}
                  colors={colors}
                  styles={styles}
                  style={{ flex: 1 }}
                >
                  <TextInput
                    style={[styles.fieldInput, { color: colors.textPrimary, borderColor: colors.border }]}
                    value={price}
                    onChangeText={(v) => setPrice(sanitizeDecimalInput(v))}
                    placeholder="0.00"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                  />
                </AIBadgeField>
              </View>

              {/* Suggested price range helper — communicates uncertainty as a
                  range, not a single number (§3.2 truthfulness) */}
              {suggestion.suggestedPriceRange && (
                <Text style={[styles.priceRangeHint, { color: colors.textMuted }]}>
                  Suggested range £{suggestion.suggestedPriceRange.min}–£{suggestion.suggestedPriceRange.max} · pick a price within this range
                </Text>
              )}

              {/* Smart Sell — auto-negotiation (demo mode) */}
              <SmartSellCard
                listingId={`draft_${currentUser?.id ?? 'anon'}`}
                config={smartSellConfig}
                onConfigChange={setSmartSellConfig}
                listingPrice={Number(sanitizeDecimalInput(price)) || undefined}
              />

              {/* Detected attributes */}
              {(suggestion.detectedAttributes.color.length > 0 ||
                suggestion.detectedAttributes.material ||
                suggestion.detectedAttributes.style ||
                suggestion.detectedAttributes.season) && (
                <View style={styles.attributeWrap}>
                  <Text style={[styles.attributeLabel, { color: colors.textSecondary }]}>
                    Detected attributes
                  </Text>
                  <View style={styles.attributeChips}>
                    {suggestion.detectedAttributes.color.map((c) => (
                      <View key={`color-${c}`} style={[styles.attributeChip, { backgroundColor: colors.surfaceAlt }]}>
                        <Text style={[styles.attributeChipText, { color: colors.textPrimary }]}>{c}</Text>
                      </View>
                    ))}
                    {suggestion.detectedAttributes.material && (
                      <View style={[styles.attributeChip, { backgroundColor: colors.surfaceAlt }]}>
                        <Text style={[styles.attributeChipText, { color: colors.textPrimary }]}>
                          {suggestion.detectedAttributes.material}
                        </Text>
                      </View>
                    )}
                    {suggestion.detectedAttributes.style && (
                      <View style={[styles.attributeChip, { backgroundColor: colors.surfaceAlt }]}>
                        <Text style={[styles.attributeChipText, { color: colors.textPrimary }]}>
                          {suggestion.detectedAttributes.style}
                        </Text>
                      </View>
                    )}
                    {suggestion.detectedAttributes.season && (
                      <View style={[styles.attributeChip, { backgroundColor: colors.surfaceAlt }]}>
                        <Text style={[styles.attributeChipText, { color: colors.textPrimary }]}>
                          {suggestion.detectedAttributes.season}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Tags */}
              <View style={styles.tagsSection}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Tags</Text>
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
                      >
                        <Ionicons name="close" size={14} color={colors.textMuted} />
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
                      >
                        <Ionicons name="add-circle" size={18} color={colors.brand} />
                      </Pressable>
                    )}
                  </View>
                </View>
              </View>

              {/* -- Sustainability tags -- */}
              <SustainabilityTags
                selectedTags={sustainabilityTags}
                onTagsChange={setSustainabilityTags}
              />

              {/* -- Listing preview -- */}
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

              {/* -- Listing quality meter -- */}
              <View style={styles.sectionLabelWrap}>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                  Quality
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
            accessibilityLabel="Publish AI-assisted listing"
            icon={<Ionicons name="checkmark-circle-outline" size={18} color={colors.textInverse} />}
          />
        </View>
      )}

      {/* -- Picker bottom sheet -- */}
      {pickerMode && (
        <PickerSheet
          options={pickerOptions}
          selectedValue={pickerMode === 'Category' ? category : condition}
          onSelect={handlePickerSelect}
          onClose={() => setPickerMode(null)}
          title={pickerMode === 'Category' ? 'Select category' : 'Select condition'}
          colors={colors}
        />
      )}
    </View>
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
  reducedMotion: boolean;
}

function PhotoCaptureSection({
  photos,
  onPickFromLibrary,
  onPickFromCamera,
  onRemovePhoto,
  onEnhancePhoto,
  colors,
  styles,
  reducedMotion,
}: PhotoCaptureSectionProps) {
  const thumbSize = (SCREEN_W - Space.md * 2 - Space.sm * 2) / 3;

  return (
    <View style={styles.photoSection}>
      {/* Photo grid */}
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
              >
                <Ionicons name="close-circle" size={22} color={colors.textInverse} />
              </Pressable>
              {/* Enhance affordance — entry point to AI Photo Enhancement */}
              <Pressable
                style={({ pressed }) => [styles.photoEnhanceBtn, { backgroundColor: `${colors.background}E6` }, pressed && { opacity: 0.6 }]}
                onPress={() => onEnhancePhoto(photo.uri)}
                accessibilityRole="button"
                accessibilityLabel="Enhance photo"
                accessibilityHint="Opens AI photo enhancement to improve this listing image"
              >
                <Ionicons name="color-filter-outline" size={13} color={colors.brand} />
                <Text style={[styles.photoEnhanceText, { color: colors.brand }]}>Enhance</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Capture actions */}
      <View style={styles.captureRow}>
        <Pressable
          style={({ pressed }) => [styles.captureBtn, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && { opacity: 0.6 }]}
          onPress={onPickFromCamera}
          accessibilityRole="button"
          accessibilityLabel="Take a photo with the camera"
        >
          <Ionicons name="camera-outline" size={22} color={colors.textPrimary} />
          <Text style={[styles.captureBtnText, { color: colors.textPrimary }]}>Camera</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.captureBtn, { borderColor: colors.border, backgroundColor: colors.surface }, pressed && { opacity: 0.6 }]}
          onPress={onPickFromLibrary}
          accessibilityRole="button"
          accessibilityLabel="Pick photos from gallery"
        >
          <Ionicons name="images-outline" size={22} color={colors.textPrimary} />
          <Text style={[styles.captureBtnText, { color: colors.textPrimary }]}>Gallery</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ===========================================================================
// Analyzing overlay — scanning animation
// ===========================================================================

interface AnalyzingOverlayProps {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  reducedMotion: boolean;
}

function AnalyzingOverlay({ colors, styles, reducedMotion }: AnalyzingOverlayProps) {
  const scanY = useSharedValue(0);
  const dotOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (reducedMotion) return;
    scanY.value = withRepeat(
      withSequence(
        withTiming(1, { duration: Motion.duration.crawl, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: Motion.duration.crawl, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
    dotOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: Motion.duration.slower }),
        withTiming(0.3, { duration: Motion.duration.slower }),
      ),
      -1,
      true,
    );
    return () => {
      cancelAnimation(scanY);
      cancelAnimation(dotOpacity);
    };
  }, [reducedMotion, scanY, dotOpacity]);

  const scanStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: interpolate(scanY.value, [0, 1], [0, 56]),
      },
    ],
  }));

  const dotStyle = useAnimatedStyle(() => ({ opacity: dotOpacity.value }));

  return (
    <View
      style={[styles.analyzingCard, { backgroundColor: colors.surface, borderColor: `${colors.brand}30` }]}
    >
      <View style={styles.analyzingHeader}>
        <Ionicons name="analytics-outline" size={18} color={colors.brand} />
        <Text style={[styles.analyzingTitle, { color: colors.textPrimary }]}>Analyzing photos…</Text>
      </View>

      {/* Scanning window */}
      <View style={[styles.scanWindow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
        <View style={styles.scanFrame}>
          <Reanimated.View
            style={[
              styles.scanLine,
              { backgroundColor: colors.brand },
              reducedMotion ? undefined : scanStyle,
            ]}
          />
        </View>
        <View style={styles.scanDots}>
          <Reanimated.View style={[styles.scanDot, { backgroundColor: colors.brand }, reducedMotion ? undefined : dotStyle]} />
          <Reanimated.View style={[styles.scanDot, { backgroundColor: colors.brand }, reducedMotion ? undefined : dotStyle]} />
          <Reanimated.View style={[styles.scanDot, { backgroundColor: colors.brand }, reducedMotion ? undefined : dotStyle]} />
        </View>
      </View>

      <Text style={[styles.analyzingHint, { color: colors.textMuted }]}>
        Reading photo metadata for brand, category and colour hints
      </Text>
    </View>
  );
}

// ===========================================================================
// Listing form skeleton — placeholder layout while AI analyses photos
// ===========================================================================

function ListingFormSkeleton({
  colors,
  styles,
  reducedMotion,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  reducedMotion: boolean;
}) {
  const thumbSize = (SCREEN_W - Space.md * 2 - Space.sm * 2) / 3;
  return (
    <View
      accessibilityLabel="Loading AI suggestions"
      accessibilityState={{ busy: true }}
    >
      {/* Photo placeholder row */}
      <View style={styles.skeletonPhotoRow}>
        <PremiumSkeletonTile width={thumbSize} height={thumbSize} borderRadius={Radius.md} />
        <PremiumSkeletonTile width={thumbSize} height={thumbSize} borderRadius={Radius.md} />
        <PremiumSkeletonTile width={thumbSize} height={thumbSize} borderRadius={Radius.md} />
      </View>

      {/* Title field placeholder */}
      <View style={styles.skeletonFieldGroup}>
        <PremiumSkeletonTile width="30%" height={Type.caption.size + 2} borderRadius={Radius.sm} />
        <PremiumSkeletonTile
          width="100%"
          height={Type.body.size + Space.sm * 2 + 4}
          borderRadius={Radius.md}
          style={styles.skeletonFieldBlock}
        />
      </View>

      {/* Category + Brand row placeholder */}
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

      {/* Condition + Price row placeholder */}
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
  reducedMotion,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  reducedMotion: boolean;
}) {
  return (
    <View
      style={styles.emptyState}
    >
      <View style={[styles.emptyIcon, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="camera-outline" size={32} color={colors.textMuted} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
        Snap to list
      </Text>
      <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
        Add photos above and AI will suggest a title, description, category and
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
    <View style={[styles.errorBanner, { backgroundColor: `${colors.danger}10`, borderColor: `${colors.danger}30` }]}>
      <View style={styles.errorHeader}>
        <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
        <Text style={[styles.errorText, { color: colors.danger }]} numberOfLines={3}>
          {message}
        </Text>
        <Pressable
          hitSlop={8}
          onPress={onDismiss}
          style={({ pressed }) => pressed && { opacity: 0.5 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss error"
        >
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </Pressable>
      </View>
      <Pressable
        style={({ pressed }) => [styles.errorRetryBtn, { borderColor: colors.danger }, pressed && { opacity: 0.6 }]}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry"
      >
        <Text style={[styles.errorRetryText, { color: colors.danger }]}>Retry</Text>
      </Pressable>
    </View>
  );
}

// ===========================================================================
// AI badge field wrapper
// ===========================================================================

interface AIBadgeFieldProps {
  label: string;
  /** Whether the field still holds the unedited AI suggestion. When false
   *  (the seller has edited the field), the "Suggested" badge is hidden —
   *  the field is now user-authored. */
  isAISuggested: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

function AIBadgeField({ label, isAISuggested, colors, styles, style, children }: AIBadgeFieldProps) {
  return (
    <View style={[styles.fieldGroup, style]}>
      <View style={styles.fieldLabelRow}>
        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
        {isAISuggested && (
          <View style={[styles.aiBadge, { backgroundColor: `${colors.brand}15` }]}>
            <Ionicons name="bulb-outline" size={10} color={colors.brand} />
            <Text style={[styles.aiBadgeText, { color: colors.brand }]}>Suggested</Text>
          </View>
        )}
      </View>
      {children}
    </View>
  );
}

// ===========================================================================
// Picker sheet (lightweight bottom sheet)
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
    <Pressable style={[pickerStyles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close picker">
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
              >
                <Text
                  style={[
                    pickerStyles.rowText,
                    { color: selected ? colors.brand : colors.textPrimary },
                  ]}
                >
                  {opt}
                </Text>
                {selected && <Ionicons name="checkmark" size={18} color={colors.brand} />}
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
    demoBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: Stroke.standard,
    },
    demoBannerText: {
      flex: 1,
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      lineHeight: Type.caption.lineHeight,
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
    // Analyzing
    analyzingCard: {
      borderRadius: Radius.lg,
      borderWidth: Stroke.standard,
      padding: Space.md,
      marginBottom: Space.md,
    },
    analyzingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.sm,
    },
    analyzingTitle: {
      fontSize: Type.bodyStrong.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600',
    },
    scanWindow: {
      height: Space.xxl + Space.xxl + Space.sm,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      overflow: 'hidden',
      justifyContent: 'center',
      alignItems: 'center',
    },
    scanFrame: {
      width: '70%',
      height: Space.xxl + Space.lg + Space.xs,
      justifyContent: 'flex-start',
    },
    scanLine: {
      width: '100%',
      height: Stroke.emphasis,
      borderRadius: Radius.sm,
    },
    scanDots: {
      flexDirection: 'row',
      gap: Space.xs,
      marginTop: Space.sm,
    },
    scanDot: {
      width: Space.xs + 2,
      height: Space.xs + 2,
      borderRadius: Radius.sm,
    },
    analyzingHint: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      marginTop: Space.sm,
      textAlign: 'center',
    },
    // Form skeleton
    skeletonPhotoRow: {
      flexDirection: 'row',
      gap: Space.sm,
      marginBottom: Space.md,
    },
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
    // Confidence banner
    confidenceBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      padding: Space.sm + 2,
      marginBottom: Space.md,
    },
    confidenceTextWrap: {
      flex: 1,
    },
    confidenceTitle: {
      fontSize: Type.bodyStrong.size,
      fontFamily: TypeStyles.bodyEmphasis.fontFamily,
      fontWeight: '600',
    },
    confidenceSub: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      marginTop: Space.xs,
    },
    confidencePill: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
    },
    confidencePillText: {
      fontSize: Type.meta.size,
      fontWeight: '700',
    },
    // Fields
    fieldGroup: {
      marginBottom: Space.md,
    },
    fieldLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      marginBottom: Space.xs,
    },
    fieldLabel: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      fontWeight: '500',
    },
    aiBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.xs,
      paddingVertical: Space.xs,
      borderRadius: Radius.sm,
    },
    aiBadgeText: {
      fontSize: Type.meta.size,
      fontWeight: '700',
      letterSpacing: LetterSpacing.wide + 0.28,
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
      marginTop: -Space.xs,
      marginBottom: Space.md,
    },
    // Attributes
    attributeWrap: {
      marginBottom: Space.md,
    },
    attributeLabel: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
      fontWeight: '500',
      marginBottom: Space.xs,
    },
    attributeChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.xs,
    },
    attributeChip: {
      paddingHorizontal: Space.sm,
      paddingVertical: Space.xs,
      borderRadius: Radius.full,
    },
    attributeChipText: {
      fontSize: Type.caption.size,
      fontFamily: TypeStyles.body.fontFamily,
    },
    // Tags
    tagsSection: {
      marginBottom: Space.md,
    },
    // Section labels (Preview / Quality)
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
    // Error banner
    errorBanner: {
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
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
