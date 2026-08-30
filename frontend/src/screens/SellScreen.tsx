import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, FontFamily, DockConstants, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { CURRENCIES } from '../constants/currencies';
import { useStore, useIsGuest } from '../store/useStore';
import { useSignupWall } from '../hooks/useSignupWall';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useSellerTrust } from '../platform/product';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useCurrencyPref } from '../hooks/useCurrencyPref';
import { useToast } from '../context/ToastContext';
import { useA11yAudit } from '../hooks/useA11yAudit';
import { DebouncedTextInput } from '../components/ui/DebouncedTextInput';
import { sanitizeDecimalInput, calculatePlatformChargeGbp } from '../utils/currencyAuthoringFlows';
import {
  getPickerOptionsForMode,
  computeCoOwnPricing,
  evaluatePriceVsMarket,
  computeDiscount,
  buildContextualPhotoPrompts,
  formatShippingSummary,
  formatReviewSummary,
  sanitizeShareCountInput,
  type PickerMode } from '../utils/sellScreenLogic';
import { haptics } from '../utils/haptics';
import { convertPickerAsset, validateMediaAssets, ListingMediaDraftItem } from '../utils/mediaUploadAsset';
import type { MediaUploadAsset } from '../utils/mediaUploadAsset';
import { uploadMedia } from '../services/mediaUpload';
import { MediaUploadQueue } from '../services/mediaUploadQueue';
import { ListingMediaStudio } from '../components/listing/ListingMediaStudio';
import { EmptyState } from '../components/EmptyState';
import { ListingModeSelector, ListingMode, getListingModeFromLabel, getListingModeLabel } from '../components/listing/ListingModeSelector';
import { ListingPublishFooter } from '../components/listing/ListingPublishFooter';
import { useListingAutofill } from '../hooks/useListingAutofill';
import { useSoldComps } from '../hooks/useSoldComps';
import { useConnectivity } from '../hooks/useConnectivity';
import { useBackendData } from '../context/BackendDataContext';
import { useTaxonomy } from '../context/TaxonomyContext';
import { useFeatureFlag, trackFunnelStep } from '../analytics';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import type { AutocompleteSuggestion } from '../services/searchAutocompleteApi';
import {
  evaluateListingCompleteness,
  type ListingFieldValues,
  type ListingFieldKey } from '../contracts/listingCategoryPolicy';
import { t } from '../i18n';
import { useSellFormState } from '../hooks/sell/useSellFormState';
import { useListingPublishPipeline } from '../hooks/sell/useListingPublishPipeline';
import { useSellDraftPersistence } from '../hooks/sell/useSellDraftPersistence';
import { useTagAutocomplete } from '../hooks/sell/useTagAutocomplete';
import AuctionFieldsSection from '../components/sell/AuctionFieldsSection';
import SellerTipsBanner from '../components/sell/SellerTipsBanner';
import ShippingPickerSheet from '../components/sell/ShippingPickerSheet';
import TagInputWithSuggestions from '../components/sell/TagInputWithSuggestions';

export default function SellScreen() {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'SellScreen');
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();
  const isGuest = useIsGuest();
  const { requireAuth } = useSignupWall();
  const reducedMotion = useReducedMotion();

  // Guest gating: creating a listing requires an account. Show the soft
  // signup wall and dismiss the sell screen back to where the user came
  // from. The wall is rendered by the SignupWallProvider at the app root,
  // so it persists after this screen unmounts.
  useEffect(() => {
    if (isGuest) {
      requireAuth('create_listing');
      navigation.goBack();
    } else {
      trackFunnelStep('listing_creation', 'listing_started');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme-aware color overrides for the static styles. The static
  // StyleSheet contains only non-color properties; colors are applied
  // via this themed proxy so the screen is fully dark-mode compatible.
  const themed = useMemo(() => ({
    root: { backgroundColor: colors.background },
    navHeader: { borderBottomColor: colors.border, backgroundColor: colors.background },
    navTitle: { color: colors.textPrimary },
    navDraftText: { color: colors.textMuted },
    autofillDesc: { color: colors.textMuted },
    autofillApplyText: { color: colors.brand },
    sectionHeading: { color: colors.textSecondary },
    fieldLabel: { color: colors.textMuted },
    fieldInput: { color: colors.textPrimary },
    fieldHelper: { color: colors.textMuted },
    fieldError: { color: colors.danger },
    hairline: { backgroundColor: colors.border },
    pickerValue: { color: colors.textPrimary },
    pickerPlaceholder: { color: colors.textMuted },
    currencySymbol: { color: colors.textMuted },
    priceInput: { color: colors.textPrimary },
    discountPreview: { color: colors.danger },
    soldCompsText: { color: colors.textMuted },
    soldCompsAction: { color: colors.brand },
    togglePill: { backgroundColor: colors.surface, borderColor: colors.border },
    togglePillActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    toggleText: { color: colors.textPrimary },
    toggleTextActive: { color: colors.textInverse },
    authThumb: { backgroundColor: colors.surfaceAlt },
    authAddBtn: { borderColor: colors.border, backgroundColor: colors.surface },
    inlineErrorText: { color: colors.danger },
    mediaHintText: { color: colors.textMuted },
    priceSuggestion: { color: colors.brand },
    priceMarketHigh: { color: colors.warning },
    priceMarketLow: { color: colors.textMuted },
    priceMarketGood: { color: colors.success },
    priceNoCompsHint: { color: colors.textMuted },
    charCountWarn: { color: colors.warning },
    fieldRequiredHint: { color: colors.textMuted },
    autofillCard: { backgroundColor: colors.brandSubtle },
    autofillTitle: { color: colors.textPrimary },
    autofillChip: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    autofillChipLabel: { color: colors.textMuted },
    autofillChipValue: { color: colors.textPrimary },
    autofillApplyBtn: { borderColor: colors.brandBorder, backgroundColor: colors.brandSubtle } }), [colors]);

  const updateSellDraft = useStore((s) => s.updateSellDraft);
  const currentUser = useStore((s) => s.currentUser);
  const { data: sellerTrust } = useSellerTrust(currentUser?.id);

  const [photos, setPhotos] = useState<string[]>([]);

  const { values, setters } = useSellFormState();
  const {
    title, desc, price, originalPrice, tags, tagInput, category, brand, size, condition,
    shippingMethod, shippingPayer, shippingSheetOpen, listingMode, coOwnEnabled,
    shareCountInput, sharePriceInput, offeringWindowHours, authPhotos,
    startingBid, reservePrice, auctionDurationHours } = values;
  const {
    setTitle, setDesc, setPrice, setOriginalPrice, setTags, setTagInput, setCategory,
    setBrand, setSize, setCondition, setShippingMethod, setShippingPayer, setShippingSheetOpen,
    setListingMode, setCoOwnEnabled, setShareCountInput, setSharePriceInput, setOfferingWindowHours,
    setAuthPhotos, setStartingBid, setReservePrice, setAuctionDurationHours } = setters;

  const {
    tagSuggestions, tagSuggestionsVisible, setTagSuggestionsVisible, setTagSuggestions } = useTagAutocomplete(tagInput);

  const [pickerMode, setPickerMode] = useState<PickerMode>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [mediaDraftItems, setMediaDraftItems] = useState<ListingMediaDraftItem[]>([]);

  const uploadQueueRef = useRef(new MediaUploadQueue());
  const [queueState, setQueueState] = useState(uploadQueueRef.current.getState());
  useEffect(() => {
    const unsub = uploadQueueRef.current.subscribe((s) => setQueueState(s));
    return () => { unsub(); };
  }, []);

  const currency = useCurrencyPref();
  const currencySymbol = CURRENCIES[currency.currencyCode].symbol;
  const { isOffline } = useConnectivity();

  // ── Draft persistence (restore on mount, persist on change) ──
  // Owns the transient "Saved" indicator state and the draft save/load
  // effects. Restores any persisted draft from the store on mount, then
  // persists on every change with a subtle 1.5s "Saved" flash.
  const { draftSavedVisible } = useSellDraftPersistence(
    { photos, mediaDraftItems, ...values },
    { setMediaDraftItems, setPhotos, ...setters },
  );

  // AI autofill suggestions from first photo filename
  const autofillSuggestion = useListingAutofill(mediaDraftItems);
  const [autofillDismissed, setAutofillDismissed] = useState(false);
  const [photoGuideCollapsed, setPhotoGuideCollapsed] = useState(true);
  const [sellerTipsDismissed, setSellerTipsDismissed] = useState(false);

  // Feature flag — gates the enhanced AI listing assist banner. Defaults to
  // false (current autofill-only behaviour) when PostHog is not loaded.
  const aiListingAssistEnabled = useFeatureFlag('ai_listing_assist');

  // ── New seller detection ──
  // Per research: new seller tips/guidance if first-time seller.
  // Uses real backend data (completedSales) — no fabricated thresholds.
  const isNewSeller = !sellerTrust?.completedSales || sellerTrust.completedSales === 0;

  // ── Draft content detection ──
  // Shows a "draft in progress" hint when the user has meaningful draft
  // content (at least a title or photos). The draft is auto-restored on
  // mount, so this confirms to the user that their previous work is back.
  const hasDraftContent = useMemo(() =>
    Boolean(title.trim() || mediaDraftItems.length > 0 || price.trim()),
    [title, mediaDraftItems.length, price],
  );

  // Reset dismiss when photos change (new photo -> new suggestions)
  useEffect(() => {
    if (mediaDraftItems.length === 0) {
      setAutofillDismissed(false);
    }
  }, [mediaDraftItems.length]);

  const handleApplyAutofill = useCallback(() => {
    if (autofillSuggestion.title && !title) setTitle(autofillSuggestion.title);
    if (autofillSuggestion.brand && !brand) setBrand(autofillSuggestion.brand);
    if (autofillSuggestion.category && !category) setCategory(autofillSuggestion.category);
    setAutofillDismissed(true);
    haptics.tap();
  }, [autofillSuggestion, title, brand, category]);

  // Sold comparables for pricing guidance -- derived from real backend data
  const { listings: backendListings } = useBackendData();
  const soldComps = useSoldComps(backendListings, category || undefined, brand || undefined);

  // Taxonomy — single source of truth for category/brand/size/condition
  // picker vocabulary. Replaces the per-screen hard-coded arrays that had
  // diverged from the canonical set (audit P2 #25).
  const { categories, conditions, sizes, brands } = useTaxonomy();
  const pickerTaxonomy = useMemo(
    () => ({
      category: categories.filter((n) => n.parentId === null).map((n) => n.name),
      brand: brands.map((n) => n.name),
      size: sizes.map((n) => n.name),
      condition: conditions.map((n) => n.name) }),
    [categories, conditions, sizes, brands],
  );

  /* -- co-own bidirectional math -- */
  useEffect(() => {
    if (listingMode !== 'co_own') return;
    const { calculatedPrice, calculatedSharePrice } = computeCoOwnPricing(price, shareCountInput, sharePriceInput);
    if (calculatedPrice !== null && calculatedPrice !== price) {
      setPrice(calculatedPrice);
      return;
    }
    if (calculatedSharePrice !== null && calculatedSharePrice !== sharePriceInput) {
      setSharePriceInput(calculatedSharePrice);
    }
  }, [price, shareCountInput, sharePriceInput, listingMode]);

  useEffect(() => {
    setCoOwnEnabled(listingMode === 'co_own');
  }, [listingMode]);

  /* -- validation computed -- */
  const hasBasePhotos = photos.length > 0;
  const hasRequiredDetails = Boolean(title.trim() && category && size && condition);
  const hasDescription = desc.trim().length >= 10;
  const numericPrice = Number(sanitizeDecimalInput(price));
  const hasValidPrice = Number.isFinite(numericPrice) && numericPrice > 0;
  const numericStartingBid = Number(sanitizeDecimalInput(startingBid));
  const hasValidStartingBid = Number.isFinite(numericStartingBid) && numericStartingBid > 0;
  const parsedShareCount = Math.floor(Number(shareCountInput));
  const hasValidShareCount = Number.isFinite(parsedShareCount) && parsedShareCount > 0;
  const parsedSharePrice = Number(sanitizeDecimalInput(sharePriceInput));
  const hasValidSharePrice = Number.isFinite(parsedSharePrice) && parsedSharePrice > 0;
  const coOwnFinancialReady = listingMode !== 'co_own' || (hasValidShareCount && hasValidSharePrice);
  const coOwnAuthReady = listingMode !== 'co_own' || authPhotos.length > 0;

  const priceVsMarket = useMemo(() => {
    return evaluatePriceVsMarket(soldComps.hasComps, hasValidPrice, numericPrice, soldComps.minPrice, soldComps.maxPrice);
  }, [soldComps, hasValidPrice, numericPrice]);

  // ── Category-aware completeness (Phase 5 WP7) ──
  // Truthful completeness indicators based on the category policy, not
  // universal brand/size assumptions. Brandless vintage and sizeless home
  // goods are valid when the policy says so.
  const completeness = useMemo(() => {
    const values: ListingFieldValues = {
      title: title.trim() || null,
      description: desc.trim() || null,
      price: numericPrice > 0 ? numericPrice : null,
      category: category || null,
      brand: brand || null,
      size: size || null,
      condition: condition || null,
      images: photos.length > 0 ? photos : null,
      shippingMethod: shippingMethod || null,
      shippingPayer: shippingPayer || null };
    return evaluateListingCompleteness(values);
  }, [title, desc, numericPrice, category, brand, size, condition, photos, shippingMethod, shippingPayer]);

  const publishReady = useMemo(() => {
    // Category-aware: use the policy's canActivate as the base floor,
    // then add mode-specific financial requirements.
    if (!completeness.canActivate) return false;
    if (!hasDescription) return false;
    if (listingMode === 'auction') return hasValidStartingBid;
    if (listingMode === 'co_own') return hasValidPrice && coOwnFinancialReady && coOwnAuthReady;
    return hasValidPrice;
  }, [completeness, hasDescription, listingMode, hasValidPrice, hasValidStartingBid, coOwnFinancialReady, coOwnAuthReady]);

  // Human-readable field labels for the completeness indicator
  const fieldLabelMap: Record<ListingFieldKey, string> = {
    title: 'title',
    description: 'description',
    price: 'price',
    category: 'category',
    subcategory: 'subcategory',
    brand: 'brand',
    size: 'size',
    condition: 'condition',
    images: 'photos',
    shippingMethod: 'shipping method',
    shippingPayer: 'shipping payer' };

  const completenessLabel = useMemo(() => completeness.canActivate
    ? 'Ready to publish'
    : `Missing: ${completeness.missingRequired.map((f) => fieldLabelMap[f]).join(', ')}`,
    [completeness.canActivate, completeness.missingRequired, fieldLabelMap]);

  const recommendedLabel = useMemo(() => completeness.missingRecommended.length > 0
    ? `Suggested: ${completeness.missingRecommended.map((f) => fieldLabelMap[f]).join(', ')}`
    : null,
    [completeness.missingRecommended, fieldLabelMap]);

  useEffect(() => {
    if (publishReady && (errorMsg || Object.keys(errors).length > 0)) {
      setErrorMsg(null);
      setErrors({});
    }
  }, [publishReady, errorMsg, errors]);

  /* -- tag handling -- */
  const handleTagSubmit = useCallback(() => {
    const raw = tagInput.trim().toLowerCase();
    if (!raw) return;
    const parts = raw.split(/[,\s]+/).filter(Boolean);
    const next = [...new Set([...tags, ...parts])].slice(0, 8);
    setTags(next);
    setTagInput('');
    haptics.tap();
  }, [tagInput, tags]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((x) => x !== tag));
  }, []);

  const handleTagSuggestionPick = useCallback((suggestion: AutocompleteSuggestion) => {
    const raw = suggestion.query.trim().toLowerCase();
    if (!raw) return;
    const parts = raw.split(/[,\s]+/).filter(Boolean);
    setTags((prev) => [...new Set([...prev, ...parts])].slice(0, 8));
    setTagInput('');
    setTagSuggestions([]);
    setTagSuggestionsVisible(false);
    haptics.tap();
  }, []);

  /* -- photo handling -- */
  const appendPhotoAsset = useCallback((asset: MediaUploadAsset) => {
    setMediaDraftItems((prev) => {
      if (prev.some((m) => m.uri === asset.uri)) return prev;
      const draftItem: ListingMediaDraftItem = {
        id: asset.id,
        uri: asset.uri,
        kind: asset.kind,
        source: 'local',
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        fileSize: asset.fileSize,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
        status: 'draft' };
      const next = [...prev, draftItem].slice(0, 10);
      // Keep photos in sync for backward compat
      setPhotos(next.map((m) => m.uri));
      if (listingMode === 'co_own' && coOwnEnabled && authPhotos.length === 0) {
        setAuthPhotos(next.filter((m) => m.kind === 'image').map((m) => m.uri).slice(0, 2));
      }
      return next;
    });
  }, [listingMode, coOwnEnabled, authPhotos.length]);

  const handlePickFromLibrary = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMsg('Allow gallery access to upload media.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        allowsEditing: false,
        quality: 0.9 });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const assets = result.assets.map(convertPickerAsset);
        const existing = mediaDraftItems.map((m) => ({
          id: m.id,
          uri: m.uri,
          fileName: m.fileName ?? 'existing',
          mimeType: m.mimeType ?? 'image/jpeg',
          kind: m.kind,
          fileSize: m.fileSize,
          width: m.width,
          height: m.height,
          durationMs: m.durationMs }));
        const validation = validateMediaAssets(assets, existing, { maxTotalCount: 10 });

        if (validation.errors.length > 0) {
          const skipped = validation.errors.map((e) => e.message).join('. ');
          if (skipped) setErrorMsg(skipped);
        }

        for (const asset of validation.assets) {
          appendPhotoAsset(asset);
        }
        if (validation.assets.length > 0) {
          haptics.success();
        }
      }
    } catch (e) {
      setErrorMsg('Could not open photo library. Try again.');
    }
  }, [appendPhotoAsset, mediaDraftItems]);

  const handlePickFromCamera = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setErrorMsg('Allow camera access to capture listing media.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.9 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const asset = convertPickerAsset(result.assets[0]);
        const existing = mediaDraftItems.map((m) => ({
          id: m.id,
          uri: m.uri,
          fileName: m.fileName ?? 'existing',
          mimeType: m.mimeType ?? 'image/jpeg',
          kind: m.kind,
          fileSize: m.fileSize,
          width: m.width,
          height: m.height,
          durationMs: m.durationMs }));
        const validation = validateMediaAssets([asset], existing, { maxTotalCount: 10 });
        if (validation.errors.length > 0) {
          setErrorMsg(validation.errors.map((e) => e.message).join('. '));
        }
        for (const a of validation.assets) {
          appendPhotoAsset(a);
        }
        if (validation.assets.length > 0) {
          haptics.success();
        }
      }
    } catch (e) {
      setErrorMsg('Could not open camera. Try again.');
    }
  }, [appendPhotoAsset, mediaDraftItems]);

  const removeItem = useCallback((itemId: string) => {
    setMediaDraftItems((prev) => {
      const item = prev.find((m) => m.id === itemId);
      if (!item) return prev;
      const removedUri = item.publicUrl || item.uri;
      setPhotos((ps) => ps.filter((u) => u !== removedUri));
      return prev.filter((m) => m.id !== itemId);
    });
    haptics.tap();
  }, []);

  const handleRetryItem = useCallback((itemId: string) => {
    const queue = uploadQueueRef.current;
    const ok = queue.retryItem(itemId);
    if (ok) {
      setMediaDraftItems((prev) =>
        prev.map((m) =>
          m.id === itemId ? { ...m, status: 'pending', error: undefined } : m
        )
      );
      haptics.tap();
    } else {
      haptics.warning();
    }
  }, []);

  const handleReorderIds = useCallback((newOrderedIds: string[]) => {
    setMediaDraftItems((prev) => {
      const itemMap = new Map(prev.map((m) => [m.id, m]));
      const reordered = newOrderedIds.map((id) => itemMap.get(id)).filter(Boolean) as ListingMediaDraftItem[];
      setPhotos(reordered.map((m) => m.publicUrl || m.uri));
      return reordered;
    });
    haptics.tap();
  }, []);

  // ── Set as cover ──
  // Per audit 04 P0: "Add cover-photo semantics and explicit reorder affordance."
  // Moves the selected item to position 0 (cover) and shifts the previous
  // cover and intervening items down. This is an explicit, discoverable
  // action — not only achievable via drag reorder.
  const handleSetCover = useCallback((itemId: string) => {
    setMediaDraftItems((prev) => {
      const idx = prev.findIndex((m) => m.id === itemId);
      if (idx <= 0) return prev; // already cover or not found
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.unshift(item);
      setPhotos(next.map((m) => m.publicUrl || m.uri));
      return next;
    });
    haptics.press();
  }, []);

  const handlePriceChange = useCallback((text: string) => {
    setPrice(sanitizeDecimalInput(text));
  }, []);

  const handleShareCountChange = useCallback((value: string) => {
    setShareCountInput(sanitizeShareCountInput(value));
  }, []);

  /* -- publish pipeline (media-upload → create-listing → attach-media) -- */
  const { isPublishing, publicationStage, handlePublish } = useListingPublishPipeline({
    listingMode,
    title,
    desc,
    price,
    originalPrice,
    category,
    brand,
    size,
    condition,
    startingBid,
    shareCountInput,
    sharePriceInput,
    offeringWindowHours,
    authPhotos,
    shippingMethod,
    shippingPayer,
    photos,
    mediaDraftItems,
    completeness,
    isOffline,
    currentUser,
    navigation,
    uploadQueueRef,
    setMediaDraftItems,
    setPhotos,
    setErrors,
    setErrorMsg });

  /* -- picker helpers -- */
  const getPickerOptions = useCallback(() => {
    return getPickerOptionsForMode(pickerMode, pickerTaxonomy);
  }, [pickerMode, pickerTaxonomy]);

  const getPickerSelected = useCallback(() => {
    switch (pickerMode) {
      case 'Category': return category;
      case 'Brand': return brand;
      case 'Size': return size;
      case 'Condition': return condition;
      case 'Format': return getListingModeLabel(listingMode);
      default: return '';
    }
  }, [pickerMode, category, brand, size, condition, listingMode]);

  const handlePickerSelect = useCallback((val: string) => {
    if (pickerMode === 'Category') { setCategory(val); updateSellDraft({ categoryId: val, subcategoryId: undefined }); }
    if (pickerMode === 'Brand') { setBrand(val); updateSellDraft({ brand: val }); }
    if (pickerMode === 'Size') { setSize(val); updateSellDraft({ size: val }); }
    if (pickerMode === 'Condition') { setCondition(val); updateSellDraft({ condition: val }); }
    if (pickerMode === 'Format') {
      const newMode = getListingModeFromLabel(val);
      setListingMode(newMode);
      updateSellDraft({ listingMode: newMode });
      haptics.press();
    }
    setPickerMode(null);
    if (pickerMode !== 'Format') {
      haptics.tap();
    }
  }, [pickerMode, updateSellDraft]);

  /* -- computed values -- */
  const { hasDiscount, discountPercent } = useMemo(
    () => computeDiscount(originalPrice, price),
    [originalPrice, price],
  );

  const publishDisabled = isPublishing || (!publishReady && !isPublishing);

  /* -- preview handler -- */
  const handlePreview = useCallback(() => {
    haptics.press();
    navigation.navigate('ListingPreview', {
      preview: {
        title: title.trim(),
        price: Number(sanitizeDecimalInput(price)) || undefined,
        originalPrice: originalPrice ? Number(sanitizeDecimalInput(originalPrice)) : undefined,
        brand: brand || undefined,
        condition: condition || undefined,
        category: category || undefined,
        size: size || undefined,
        description: desc.trim() || undefined,
        photos,
        shippingMethod: shippingMethod || undefined,
        shippingPayer: shippingPayer || undefined },
      origin: 'sell' });
  }, [title, price, originalPrice, brand, condition, category, size, desc, photos, shippingMethod, shippingPayer, navigation]);

  return (
    <SafeAreaView ref={a11yRef} testID="sell-screen" style={[styles.root, themed.root]} edges={['top']}>
        {/* -- 1. COMPACT NAVIGATION HEADER -- */}
        <View style={[styles.navHeader, themed.navHeader, { paddingTop: 0 }]}>
          <Pressable
            style={({ pressed }) => [styles.navCloseBtn, pressed && { opacity: 0.5 }]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Close and go back"
          >
            <Ionicons name="close" size={22} color={colors.textPrimary} aria-hidden={true} />
          </Pressable>
          <Text style={[styles.navTitle, themed.navTitle]}>{t('listing.create.title')}</Text>
          {/* Transient "Saved" indicator — per audit 04: "visible 'Saved'
              only briefly; never spam toasts on every field." A subtle
              checkmark that fades after 1.5s. Not a permanent label. */}
          <View style={styles.navDraftStatus}>
            {draftSavedVisible ? (
              <Reanimated.View
                entering={reducedMotion ? undefined : FadeIn.duration(200)}
                exiting={reducedMotion ? undefined : FadeOut.duration(200)}
                style={styles.navDraftSavedRow}
              >
                <Ionicons name="checkmark" size={12} color={colors.success} aria-hidden={true} />
                <Text style={[styles.navDraftText, { color: colors.success }]}>{t('listing.create.saved')}</Text>
              </Reanimated.View>
            ) : null}
          </View>
        </View>

        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* -- 1a. DRAFT IN PROGRESS HINT -- */}
          {/* Shows when the user has meaningful draft content restored from
              the store. Confirms their previous work is back without being
              intrusive. Auto-hides once the user starts editing. */}
          {hasDraftContent && !title.trim() && mediaDraftItems.length > 0 && (
            <View style={styles.draftHintRow}>
              <Ionicons name="document-text-outline" size={16} color={colors.brand} aria-hidden={true} />
              <Text style={[styles.draftHintText, { color: colors.textSecondary }]}>
                {t('listing.create.draftRestored')}
              </Text>
            </View>
          )}

          {/* -- 2. LISTING MEDIA (dominant first-viewport object) -- */}
          {/* The media empty state is the primary action — it leads the
              first viewport. Utility rows (quick actions, import, tips)
              follow below so the media area dominates, not a stack of
              secondary affordances. */}
          {mediaDraftItems.length === 0 ? (
            <EmptyState
              icon="camera-outline"
              title={t('listing.create.addPhotosTitle')}
              subtitle={t('listing.create.addPhotosSubtitle')}
              ctaLabel={t('listing.create.uploadFromLibrary')}
              onCtaPress={handlePickFromLibrary}
              secondaryCtaLabel={t('listing.create.takePhoto')}
              onSecondaryCtaPress={handlePickFromCamera}
            />
          ) : (
            <ListingMediaStudio
              items={mediaDraftItems}
              queueItems={queueState.items}
              maxCount={10}
              errorText={errors.photos}
              onPickFromLibrary={handlePickFromLibrary}
              onPickFromCamera={handlePickFromCamera}
              onReorder={handleReorderIds}
              onRemoveItem={removeItem}
              onRetryItem={handleRetryItem}
              onSetCover={handleSetCover}
            />
          )}

          {/* -- 2a. CONTEXTUAL PHOTO ASSISTANT (consolidated) -- */}
          {/* One system, not three. Shows only the most relevant guidance
              for the current media state: an expandable tips affordance
              before any photos, a count nudge + contextual prompts once
              photos exist. No redundant labels or stacked hint rows. */}
          {(() => {
            const count = mediaDraftItems.length;
            const prompts = buildContextualPhotoPrompts(brand, condition, count, category);
            const needsMore = count > 0 && count < 3;

            if (count === 0) {
              // EmptyState dominates; tips remain accessible via a single
              // subtle expandable affordance — no stacked hint rows.
              return (
                <Pressable
                  style={({ pressed }) => [styles.photoAssistantToggle, pressed && { opacity: 0.6 }]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() => setPhotoGuideCollapsed((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={photoGuideCollapsed ? 'Expand photo tips' : 'Collapse photo tips'}
                  accessibilityHint="Tips for taking great listing photos"
                >
                  <Ionicons name="camera-outline" size={16} color={colors.textSecondary} aria-hidden={true} />
                  <Text style={[styles.photoAssistantToggleText, { color: colors.textSecondary }]}>
                    {t('listing.create.photoTips')}
                  </Text>
                  <Ionicons name={photoGuideCollapsed ? 'chevron-down' : 'chevron-up'} size={12} color={colors.textMuted} aria-hidden={true} />
                </Pressable>
              );
            }

            if (prompts.length === 0 && !needsMore) return null;

            return (
              <View style={styles.contextualPrompts}>
                {needsMore && (
                  <View style={styles.contextualPromptRow}>
                    <Ionicons name="camera-outline" size={16} color={colors.brand} aria-hidden={true} />
                    <Text style={[styles.contextualPromptText, { color: colors.textSecondary }]}>
                      {t('listing.create.addMorePhotos', { count: 3 - count, plural: 3 - count > 1 ? 's' : '' })}
                    </Text>
                  </View>
                )}
                {prompts.map((prompt, i) => (
                  <View key={i} style={styles.contextualPromptRow}>
                    <Ionicons name={prompt.icon as React.ComponentProps<typeof Ionicons>['name']} size={16} color={colors.brand} aria-hidden={true} />
                    <Text style={[styles.contextualPromptText, { color: colors.textSecondary }]}>
                      {prompt.text}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })()}

          {/* Photo tips detail — expandable, only before the first photo */}
          {mediaDraftItems.length === 0 && !photoGuideCollapsed && (
            <View style={styles.photoAssistantTips}>
              <View style={styles.contextualPromptRow}>
                <Ionicons name="sunny-outline" size={12} color={colors.textMuted} aria-hidden={true} />
                <Text style={[styles.photoAssistantTip, { color: colors.textMuted }]}>{t('listing.create.photoTipLighting')}</Text>
              </View>
              <View style={styles.contextualPromptRow}>
                <Ionicons name="camera-reverse-outline" size={12} color={colors.textMuted} aria-hidden={true} />
                <Text style={[styles.photoAssistantTip, { color: colors.textMuted }]}>{t('listing.create.photoTipAngles')}</Text>
              </View>
              <View style={styles.contextualPromptRow}>
                <Ionicons name="leaf-outline" size={12} color={colors.textMuted} aria-hidden={true} />
                <Text style={[styles.photoAssistantTip, { color: colors.textMuted }]}>{t('listing.create.photoTipBackground')}</Text>
              </View>
            </View>
          )}
          {/* -- 2b. QUICK ACTIONS ROW -- */}
          {/* Per research: quick actions for related seller tasks.
              Transparent 44pt targets with 20-24pt glyphs (AGENTS.md §4).
              Only shows when the form is empty (no draft content) to avoid
              cluttering an in-progress listing. */}
          {!hasDraftContent && (
            <View style={styles.sellQuickActions}>
              <Pressable
                style={({ pressed }) => [styles.sellQuickAction, pressed && { opacity: 0.6 }]}
                onPress={() => { haptics.tap(); navigation.navigate('BulkListing'); }}
                accessibilityRole="button"
                accessibilityLabel="Bulk listing — list multiple items at once"
                accessibilityHint="Opens the bulk listing tool"
              >
                <Ionicons name="layers-outline" size={22} color={colors.brand} aria-hidden={true} />
                <Text style={[styles.sellQuickActionLabel, { color: colors.textSecondary }]}>{t('listing.create.bulkList')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.sellQuickAction, pressed && { opacity: 0.6 }]}
                onPress={() => { haptics.tap(); navigation.navigate('InventoryManagement'); }}
                accessibilityRole="button"
                accessibilityLabel="Inventory dashboard"
                accessibilityHint="Opens the inventory management screen"
              >
                <Ionicons name="grid-outline" size={22} color={colors.brand} aria-hidden={true} />
                <Text style={[styles.sellQuickActionLabel, { color: colors.textSecondary }]}>{t('listing.create.inventory')}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.sellQuickAction, pressed && { opacity: 0.6 }]}
                onPress={() => { haptics.tap(); navigation.navigate('SellerHub'); }}
                accessibilityRole="button"
                accessibilityLabel="Seller hub"
                accessibilityHint="Opens the seller hub dashboard"
              >
                <Ionicons name="storefront-outline" size={22} color={colors.brand} aria-hidden={true} />
                <Text style={[styles.sellQuickActionLabel, { color: colors.textSecondary }]}>{t('listing.create.hub')}</Text>
              </Pressable>
            </View>
          )}

          {/* -- 2c. IMPORT A SHOP -- secondary action below the primary
              listing flow. A single flat row (not a card) with a hairline
              separator above. Restrained — does not compete with the
              primary camera/listing action (blueprint §5.1). -- */}
          {!hasDraftContent && (
            <AnimatedPressable
              style={styles.importShopRow}
              onPress={() => { haptics.tap(); navigation.navigate('CatalogImportStart'); }}
              activeOpacity={0.6}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Import a shop"
              accessibilityHint="Bring your existing listings from eBay or a file"
            >
              <View style={[styles.importShopSeparator, { backgroundColor: colors.borderSubtle }]} />
              <View style={styles.importShopContent}>
                <Ionicons name="download-outline" size={22} color={colors.brand} aria-hidden={true} />
                <View style={styles.importShopText}>
                  <Text style={[styles.importShopTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {t('listing.create.importShop')}
                  </Text>
                  <Text style={[styles.importShopSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                    {t('listing.create.importShopSubtitle')}
                  </Text>
                </View>
              </View>
            </AnimatedPressable>
          )}

          {/* -- 2d. NEW SELLER TIPS -- */}
          {/* Per research: new seller tips/guidance if first-time seller.
              Dismissible, only shows when isNewSeller and not dismissed.
              Flat inline — no card chrome (§4 surface budget). */}
          {isNewSeller && !sellerTipsDismissed && !hasDraftContent && (
            <SellerTipsBanner onDismiss={() => setSellerTipsDismissed(true)} />
          )}

          {/* -- 2c. TITLE FIELD (first identity field, in first viewport) -- */}
          {/* Per spec: first viewport shows close, Sell title, media studio,
              first identity fields (title). Placed immediately after media
              so the user can start describing their item right away. */}
          <View style={styles.sectionGroup}>
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.listingTitle')}</Text>
                {title.trim().length > 0 ? (
                  <Ionicons name="checkmark-circle" size={12} color={colors.success} aria-hidden={true} />
                ) : (
                  <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                )}
              </View>
              <DebouncedTextInput
                style={[styles.fieldInput, themed.fieldInput]}
                value={title}
                debounceMs={300}
                onImmediateChange={() => { if (errors.title) setErrors((p) => ({ ...p, title: '' })); }}
                onChangeText={setTitle}
                placeholder={t('listing.create.titlePlaceholder')}
                placeholderTextColor={colors.textMuted}
                returnKeyType="next"
              />
              {errors.title ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.title}</Text> : null}
              {title.trim().length > 0 && title.trim().length < 10 && (
                <Text style={[styles.fieldHelper, themed.fieldHelper]}>{t('listing.create.descriptionHelper')}</Text>
              )}
              <View style={[styles.hairline, themed.hairline]} />
            </View>
          </View>

          {/* -- 2d. AI LISTING ASSIST (enhanced, gated by feature flag) -- */}
          {/* Additive banner — only shown when ai_listing_assist is enabled.
              When the flag is off, the current autofill-only behaviour runs. */}
          {aiListingAssistEnabled && mediaDraftItems.length > 0 ? (
            <View style={[styles.autofillCard, themed.autofillCard, { flexDirection: 'row', alignItems: 'center', gap: Space.sm }]}>
              <Ionicons name="create-outline" size={18} color={colors.brand} aria-hidden={true} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.autofillTitle, themed.autofillTitle]}>{t('listing.create.aiAssist')}</Text>
                <Text style={[themed.autofillDesc, { marginTop: 2 }]}>
                  {t('listing.create.aiAssistDesc')}
                </Text>
              </View>
            </View>
          ) : null}

          {/* -- 2d. SUGGESTED DETAILS (neutral, from photo filename) -- */}
          {/* Inline suggestion — subtle tint, no heavy card chrome (§4 surface budget).
              Reads as a helpful nudge, not a separate panel. */}
          {autofillSuggestion.hasSuggestions && !autofillDismissed && (
            <View style={[styles.autofillCard, themed.autofillCard]}>
              <View style={styles.autofillHeader}>
                <Ionicons name="bulb-outline" size={16} color={colors.brand} aria-hidden={true} />
                <Text style={[styles.autofillTitle, themed.autofillTitle]}>{t('listing.create.suggestedDetails')}</Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => setAutofillDismissed(true)}
                  style={({ pressed }) => pressed && { opacity: 0.5 }}
                  accessibilityLabel="Dismiss suggestions"
                  accessibilityRole="button"
                >
                  <Ionicons name="close" size={16} color={colors.textMuted} aria-hidden={true} />
                </Pressable>
              </View>
              {/* Flattened rows — no nested bordered chips (AGENTS.md §4: no card-on-card) */}
              {autofillSuggestion.title && (
                <View style={styles.autofillRow}>
                  <Text style={[styles.autofillRowLabel, themed.autofillChipLabel]}>{t('listing.create.listingTitle')}</Text>
                  <Text style={[styles.autofillRowValue, themed.autofillChipValue]} numberOfLines={2}>{autofillSuggestion.title}</Text>
                </View>
              )}
              {autofillSuggestion.brand && (
                <View style={styles.autofillRow}>
                  <Text style={[styles.autofillRowLabel, themed.autofillChipLabel]}>{t('listing.create.brand')}</Text>
                  <Text style={[styles.autofillRowValue, themed.autofillChipValue]} numberOfLines={2}>{autofillSuggestion.brand}</Text>
                </View>
              )}
              {autofillSuggestion.category && (
                <View style={styles.autofillRow}>
                  <Text style={[styles.autofillRowLabel, themed.autofillChipLabel]}>{t('listing.create.category')}</Text>
                  <Text style={[styles.autofillRowValue, themed.autofillChipValue]} numberOfLines={2}>{autofillSuggestion.category}</Text>
                </View>
              )}
              <Pressable
                style={({ pressed }) => [styles.autofillApplyBtn, themed.autofillApplyBtn, pressed && { opacity: 0.6 }]}
                onPress={handleApplyAutofill}
                accessibilityLabel="Apply suggested fields"
                accessibilityRole="button"
              >
                <Ionicons name="checkmark" size={16} color={colors.brand} aria-hidden={true} />
                <Text style={[styles.autofillApplyText, themed.autofillApplyText]}>{t('listing.create.applyToEmptyFields')}</Text>
              </Pressable>
            </View>
          )}

          {/* -- 3. LISTING FORMAT (compact disclosure row) -- */}
          {/* Per audit 04: progressive disclosure, not three equal tabs.
              The compact row opens the BottomSheetPicker to change format.
              Only relevant fields render after selection. */}
          <View style={styles.sectionSpacing}>
            <ListingModeSelector
              mode={listingMode}
              onChange={() => { setPickerMode('Format'); haptics.tap(); }}
            />
          </View>

          {/* -- 4. PRODUCT DETAILS (classification — what the item is) -- */}
          <View style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, themed.sectionHeading]}>{t('listing.create.details')}</Text>

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => setPickerMode('Category')}
              accessibilityRole="button"
              accessibilityLabel="Select category"
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.category')}</Text>
                  {category ? (
                    <Ionicons name="checkmark-circle" size={12} color={colors.success} aria-hidden={true} />
                  ) : (
                    <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                  )}
                </View>
                <Text style={[styles.pickerValue, themed.pickerValue, !category && styles.pickerPlaceholder, !category && themed.pickerPlaceholder]}>
                  {category || t('listing.create.selectCategory')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
            </Pressable>
            {errors.category ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.category}</Text> : null}
            <View style={[styles.hairline, themed.hairline]} />

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => setPickerMode('Brand')}
              accessibilityRole="button"
              accessibilityLabel="Select brand"
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.brand')}</Text>
                  {brand ? (
                    <Ionicons name="checkmark-circle" size={12} color={colors.success} aria-hidden={true} />
                  ) : completeness.policy.brandlessValid ? (
                    <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.optional')}</Text>
                  ) : (
                    <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                  )}
                </View>
                <Text style={[styles.pickerValue, themed.pickerValue, !brand && styles.pickerPlaceholder, !brand && themed.pickerPlaceholder]}>
                  {brand || t('listing.create.selectBrand')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
            </Pressable>
            {!brand && (
              <Text style={[styles.fieldHelper, themed.fieldHelper]}>
                {completeness.policy.brandlessValid
                  ? t('listing.create.brandHelperOptional')
                  : t('listing.create.brandHelperRequired')}
              </Text>
            )}
            <View style={[styles.hairline, themed.hairline]} />

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => setPickerMode('Size')}
              accessibilityRole="button"
              accessibilityLabel="Select size"
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.size')}</Text>
                  {size ? (
                    <Ionicons name="checkmark-circle" size={12} color={colors.success} aria-hidden={true} />
                  ) : completeness.policy.sizelessValid ? (
                    <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.optional')}</Text>
                  ) : (
                    <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                  )}
                </View>
                <Text style={[styles.pickerValue, themed.pickerValue, !size && styles.pickerPlaceholder, !size && themed.pickerPlaceholder]}>
                  {size || t('listing.create.selectSize')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
            </Pressable>
            {errors.size ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.size}</Text> : null}
            <View style={[styles.hairline, themed.hairline]} />
          </View>

          {/* -- 5. PRICE & CONDITION (deal terms — the two fields buyers decide on) -- */}
          {/* Per 2026 research: pair price + condition as "deal terms" so the
              user sets their commercial position in one grouped section, rather
              than burying condition among classification details. */}
          <View style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, themed.sectionHeading]}>{t('listing.create.priceAndCondition')}</Text>

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => setPickerMode('Condition')}
              accessibilityRole="button"
              accessibilityLabel="Select condition"
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.condition')}</Text>
                  {condition ? (
                    <Ionicons name="checkmark-circle" size={12} color={colors.success} aria-hidden={true} />
                  ) : (
                    <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                  )}
                </View>
                <Text style={[styles.pickerValue, themed.pickerValue, !condition && styles.pickerPlaceholder, !condition && themed.pickerPlaceholder]}>
                  {condition || t('listing.create.selectCondition')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
            </Pressable>
            {errors.condition ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.condition}</Text> : null}
            <View style={[styles.hairline, themed.hairline]} />

            {listingMode === 'sell_now' && (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.price')}</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={[styles.currencySymbol, themed.currencySymbol]}>{currencySymbol}</Text>
                    <TextInput
                      style={[styles.priceInput, themed.priceInput]}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      value={price}
                      onChangeText={(t) => { handlePriceChange(t); setErrors((p) => ({ ...p, price: '' })); }}
                      maxLength={8}
                    />
                  </View>
                  {errors.price ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.price}</Text> : null}

                  {/* Sold comparables hint -- truthful pricing guidance from real data */}
                  {soldComps.hasComps && soldComps.minPrice != null && soldComps.maxPrice != null ? (
                    <View style={styles.priceSuggestionBlock}>
                      <View style={styles.soldCompsHint}>
                        <Ionicons name="pricetag-outline" size={12} color={colors.textMuted} aria-hidden={true} />
                        <Text style={[styles.soldCompsText, themed.soldCompsText]}>
                          Similar items sold for {currencySymbol}{soldComps.minPrice.toFixed(0)}–{currencySymbol}{soldComps.maxPrice.toFixed(0)}
                          {' '}({soldComps.sampleSize} sold)
                        </Text>
                      </View>
                      {soldComps.medianPrice != null && (
                        <Pressable
                          style={({ pressed }) => [styles.soldCompsHint, pressed && { opacity: 0.6 }]}
                          onPress={() => {
                            if (!price) {
                              handlePriceChange(soldComps.medianPrice!.toFixed(2));
                              haptics.tap();
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Suggested price ${currencySymbol}${soldComps.medianPrice.toFixed(0)}. Tap to set suggested price.`}
                        >
                          <Ionicons name="bulb-outline" size={12} color={colors.brand} aria-hidden={true} />
                          <Text style={[styles.soldCompsText, themed.priceSuggestion]}>
                            Suggested price: {currencySymbol}{soldComps.medianPrice.toFixed(0)}
                          </Text>
                          {!price && (
                            <Text style={[styles.soldCompsAction, themed.soldCompsAction]}>Tap to set</Text>
                          )}
                        </Pressable>
                      )}
                      {priceVsMarket === 'above' && (
                        <View style={styles.soldCompsHint}>
                          <Ionicons name="trending-up-outline" size={12} color={colors.warning} aria-hidden={true} />
                          <Text style={[styles.soldCompsText, themed.priceMarketHigh]}>
                            Priced above recent sold range
                          </Text>
                        </View>
                      )}
                      {priceVsMarket === 'below' && (
                        <View style={styles.soldCompsHint}>
                          <Ionicons name="trending-down-outline" size={12} color={colors.textMuted} aria-hidden={true} />
                          <Text style={[styles.soldCompsText, themed.priceMarketLow]}>
                            Priced below recent sold range
                          </Text>
                        </View>
                      )}
                      {priceVsMarket === 'in_range' && (
                        <View style={styles.soldCompsHint}>
                          <Ionicons name="checkmark-circle" size={12} color={colors.success} aria-hidden={true} />
                          <Text style={[styles.soldCompsText, themed.priceMarketGood]}>
                            Within recent sold range
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.soldCompsHint}>
                      <Ionicons name="information-circle-outline" size={12} color={colors.textMuted} aria-hidden={true} />
                      <Text style={[styles.soldCompsText, themed.priceNoCompsHint]}>
                        Price competitively for faster sales
                      </Text>
                    </View>
                  )}

                  {/* ── Seller proceeds estimate ──
                      Per audit 04 P1: "Add seller-proceeds preview beside price."
                      Shows the estimated amount the seller will receive after
                      platform fees. Uses the same fee structure as checkout
                      (calculatePlatformChargeGbp). Only shows when price is valid.
                      Per audit: "Price guidance explains source as market
                      comparables, not artificial certainty." */}
                  {hasValidPrice && numericPrice > 0 && (
                    <View style={styles.proceedsRow}>
                      <View style={styles.proceedsLeft}>
                        <Ionicons name="wallet-outline" size={16} color={colors.textSecondary} aria-hidden={true} />
                        <Text style={[styles.proceedsLabel, themed.fieldHelper]}>
                          You receive
                        </Text>
                      </View>
                      <View style={styles.proceedsRight}>
                        <Text style={[styles.proceedsAmount, { color: colors.success }]}>
                          {currencySymbol}{(numericPrice - calculatePlatformChargeGbp(numericPrice)).toFixed(2)}
                        </Text>
                        <Text style={[styles.proceedsFeeHint, themed.fieldHelper]}>
                          after {currencySymbol}{calculatePlatformChargeGbp(numericPrice).toFixed(2)} fee
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={[styles.hairline, themed.hairline]} />
                  <View style={styles.priceInputRow}>
                    <Text style={[styles.currencySymbol, themed.currencySymbol]}>{currencySymbol}</Text>
                    <TextInput
                      style={[styles.priceInput, themed.priceInput]}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      value={originalPrice}
                      onChangeText={(t) => setOriginalPrice(sanitizeDecimalInput(t))}
                      maxLength={8}
                    />
                  </View>
                  {hasDiscount && (
                    <Text style={[styles.discountPreview, themed.discountPreview]}>-{discountPercent}% off original</Text>
                  )}
                  {!originalPrice && hasValidPrice && (
                    <Text style={[styles.fieldHelper, themed.fieldHelper]}>Add original price to show value</Text>
                  )}
                  <View style={[styles.hairline, themed.hairline]} />
                </View>
              </>
            )}

            {listingMode === 'auction' && (
              <AuctionFieldsSection
                currencySymbol={currencySymbol}
                startingBid={startingBid}
                onStartingBidChange={(t) => { setStartingBid(sanitizeDecimalInput(t)); setErrors((p) => ({ ...p, startingBid: '' })); }}
                reservePrice={reservePrice}
                onReservePriceChange={(t) => setReservePrice(sanitizeDecimalInput(t))}
                auctionDurationHours={auctionDurationHours}
                onAuctionDurationHoursChange={setAuctionDurationHours}
                errors={errors}
                hasValidStartingBid={hasValidStartingBid}
                numericStartingBid={numericStartingBid}
              />
            )}

            {listingMode === 'co_own' && (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>Total valuation</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={[styles.currencySymbol, themed.currencySymbol]}>{currencySymbol}</Text>
                    <TextInput
                      style={[styles.priceInput, themed.priceInput]}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      value={price}
                      onChangeText={(t) => { handlePriceChange(t); setErrors((p) => ({ ...p, price: '' })); }}
                      maxLength={8}
                    />
                  </View>
                  {errors.price ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.price}</Text> : null}
                  <View style={[styles.hairline, themed.hairline]} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>Share count</Text>
                  <TextInput
                    style={[styles.fieldInput, themed.fieldInput]}
                    placeholder="20"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    value={shareCountInput}
                    onChangeText={(t) => { handleShareCountChange(t); setErrors((p) => ({ ...p, shareCount: '' })); }}
                  />
                  <Text style={[styles.fieldHelper, themed.fieldHelper]}>Maximum 20 units per co-own</Text>
                  {errors.shareCount ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.shareCount}</Text> : null}
                  <View style={[styles.hairline, themed.hairline]} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>Share price ({currency.currencyCode})</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={[styles.currencySymbol, themed.currencySymbol]}>{currencySymbol}</Text>
                    <TextInput
                      style={[styles.priceInput, themed.priceInput]}
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      value={sharePriceInput}
                      onChangeText={(t) => { setSharePriceInput(sanitizeDecimalInput(t)); setErrors((p) => ({ ...p, sharePrice: '' })); }}
                      maxLength={8}
                    />
                  </View>
                  {errors.sharePrice ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.sharePrice}</Text> : null}
                  {Number(price) > 0 && Number(shareCountInput) > 0 && (
                    <Text style={[styles.fieldHelper, themed.fieldHelper]}>
                      {currencySymbol}{(Number(price) / Number(shareCountInput)).toFixed(2)} per share
                    </Text>
                  )}
                  <View style={[styles.hairline, themed.hairline]} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>Offering window</Text>
                  <View style={styles.toggleRow}>
                    {[24, 48, 72, 168].map((h) => {
                      const active = offeringWindowHours === h;
                      return (
                        <Pressable
                          key={h}
                          style={({ pressed }) => [styles.togglePill, themed.togglePill, active && styles.togglePillActive, active && themed.togglePillActive, pressed && { opacity: 0.7 }]}
                          onPress={() => setOfferingWindowHours(h)}
                          accessibilityRole="button"
                          accessibilityLabel={`Set offering window to ${h} hours`}
                        >
                          <Text style={[styles.toggleText, themed.toggleText, active && styles.toggleTextActive, active && themed.toggleTextActive]}>
                            {h < 72 ? `${h}h` : `${h / 24}d`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={[styles.hairline, themed.hairline]} />
                </View>
              </>
            )}
          </View>

          {/* -- 6. DESCRIPTION AND TAGS -- */}
          <View style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, themed.sectionHeading]}>Description</Text>

            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, themed.fieldLabel]}>Description</Text>
                {desc.trim().length >= 10 ? (
                  <Ionicons name="checkmark-circle" size={12} color={colors.success} aria-hidden={true} />
                ) : (
                  <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>Required</Text>
                )}
              </View>
              <DebouncedTextInput
                style={[styles.fieldInput, themed.fieldInput, styles.fieldInputMultiline]}
                value={desc}
                debounceMs={400}
                onImmediateChange={() => { if (errors.description) setErrors((p) => ({ ...p, description: '' })); }}
                onChangeText={setDesc}
                placeholder="Describe the fit, fabric, flaws, and why you love it..."
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
              />
              <Text style={[styles.fieldHelper, desc.trim().length < 10 ? themed.charCountWarn : themed.fieldHelper]}>
                {desc.length} characters{desc.trim().length < 10 ? ' · min 10' : desc.length < 60 ? ' · add more detail' : ''}
              </Text>
              {errors.description ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.description}</Text> : null}
              <View style={[styles.hairline, themed.hairline]} />
            </View>

            <Text style={[styles.fieldLabel, themed.fieldLabel]}>Tags</Text>
            <TagInputWithSuggestions
              tags={tags}
              tagInput={tagInput}
              onTagInputChange={setTagInput}
              onTagSubmit={handleTagSubmit}
              onRemoveTag={removeTag}
              tagSuggestions={tagSuggestions}
              tagSuggestionsVisible={tagSuggestionsVisible}
              onSuggestionsVisibleChange={setTagSuggestionsVisible}
              onSuggestionsClear={() => setTagSuggestions([])}
              onSuggestionPick={handleTagSuggestionPick}
            />
            <Text style={[styles.fieldHelper, themed.fieldHelper]}>Press space or comma to add. Up to 8 tags.</Text>
            {tags.length > 0 && tags.length < 3 && (
              <Text style={[styles.fieldHelper, themed.fieldHelper]}>Add {3 - tags.length} more tag{3 - tags.length > 1 ? 's' : ''} to improve discovery</Text>
            )}
          </View>

          {/* -- 7. SHIPPING -- */}
          <View style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, themed.sectionHeading]}>Shipping</Text>
            {!shippingMethod && (
              <View style={styles.contextualHintRow}>
                <Ionicons name="cube-outline" size={16} color={colors.brand} aria-hidden={true} />
                <Text style={[styles.contextualHintText, { color: colors.textSecondary }]}>
                  Set a shipping method so buyers know how it'll arrive
                </Text>
              </View>
            )}
            {shippingMethod && !shippingPayer && (
              <View style={styles.contextualHintRow}>
                <Ionicons name="card-outline" size={16} color={colors.brand} aria-hidden={true} />
                <Text style={[styles.contextualHintText, { color: colors.textSecondary }]}>
                  Specify who pays for shipping
                </Text>
              </View>
            )}

            <Pressable
              onPress={() => { setShippingSheetOpen(true); haptics.tap(); }}
              style={({ pressed }) => [styles.shippingSummaryRow, { borderBottomColor: colors.border }, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Configure delivery"
              accessibilityHint="Opens shipping method and payment options"
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.shippingSummaryLabel, { color: colors.textPrimary }]}>Delivery</Text>
                <Text style={[styles.shippingSummaryValue, { color: shippingMethod ? colors.textSecondary : colors.textMuted }]}>
                  {formatShippingSummary(shippingMethod, shippingPayer)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} aria-hidden={true} />
            </Pressable>
          </View>

          {/* -- SHIPPING BOTTOM SHEET -- */}
          <ShippingPickerSheet
            visible={shippingSheetOpen}
            onClose={() => setShippingSheetOpen(false)}
            shippingMethod={shippingMethod}
            shippingPayer={shippingPayer}
            onSetShippingMethod={setShippingMethod}
            onSetShippingPayer={setShippingPayer}
          />

          {/* -- CO-OWN AUTHENTICATION MEDIA -- */}
          {listingMode === 'co_own' && (
            <View style={styles.sectionGroup}>
              <Text style={[styles.sectionHeading, themed.sectionHeading]}>Authentication photos</Text>
              <Text style={[styles.fieldHelper, themed.fieldHelper]}>Attach proof-of-authenticity photos for investor confidence.</Text>
              {errors.authPhotos ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.authPhotos}</Text> : null}
              <View style={styles.authPhotoRow}>
                {authPhotos.map((uri, i) => (
                  <View key={`auth_${i}_${uri}`} style={[styles.authThumb, themed.authThumb]}>
                    <Image source={{ uri }} style={styles.authThumbImage} resizeMode="cover" />
                    <Pressable
                      style={[styles.authThumbRemove, { backgroundColor: colors.background }]}
                      onPress={() => {
                        setAuthPhotos((prev) => prev.filter((_, idx) => idx !== i));
                        haptics.tap();
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Remove authentication photo"
                    >
                      <Ionicons name="close-circle" size={22} color={colors.textPrimary} aria-hidden={true} />
                    </Pressable>
                  </View>
                ))}
                {authPhotos.length < 2 && (
                  <Pressable
                    style={[styles.authAddBtn, themed.authAddBtn]}
                    onPress={handlePickFromLibrary}
                    accessibilityRole="button"
                    accessibilityLabel="Add authentication photo"
                  >
                    <Ionicons name="add" size={22} color={colors.textMuted} aria-hidden={true} />
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* -- error message (inline, above footer) -- */}
          {errorMsg && publicationStage === 'idle' && (
            <View style={styles.inlineErrorRow}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} aria-hidden={true} />
              <Text style={[styles.inlineErrorText, themed.inlineErrorText]}>{errorMsg}</Text>
            </View>
          )}

          {/* ── Category-aware completeness indicator ──
              Per Phase 5 WP7: truthful completeness based on the category
              policy, not universal brand/size assumptions. Shows "Ready
              to publish" when canActivate=true, or "Missing: size, condition"
              when required fields are absent. Non-blocking recommended
              suggestions appear below when present.
              Flat inline — no card chrome (§4 surface budget). */}
          <View style={styles.completenessRow}>
            <Ionicons
              name={completeness.canActivate ? 'checkmark-circle' : 'alert-circle-outline'}
              size={16}
              color={completeness.canActivate ? colors.success : colors.warning}
            />
            <View style={styles.completenessTextWrap}>
              <Text style={[styles.completenessLabel, { color: completeness.canActivate ? colors.success : colors.textSecondary }]}>
                {completenessLabel}
              </Text>
              {recommendedLabel && !completeness.canActivate ? (
                <Text style={[styles.completenessHint, { color: colors.textMuted }]}>
                  {recommendedLabel}
                </Text>
              ) : null}
            </View>
          </View>

          {/* ── Compact review summary for high-value/auction/Co-Own ──
              Per audit 04 P1: "Compact review state before publish for
              high-value/auction/Co-Own." A flat inline summary row that
              surfaces the key listing facts before the publish footer,
              so sellers of complex formats can verify without scrolling
              back up. Only renders for auction and co_own modes (sell_now
              is simple enough that the Preview button suffices).
              Flat inline — no card chrome (§4 surface budget). */}
          {(listingMode === 'auction' || listingMode === 'co_own') && publishReady && (
            <View style={styles.reviewSummaryRow}>
              <Ionicons
                name={listingMode === 'auction' ? 'hammer-outline' : 'people-outline'}
                size={16}
                color={colors.textSecondary}
              />
              <Text style={[styles.reviewSummaryText, { color: colors.textSecondary }]} numberOfLines={2}>
                {formatReviewSummary(
                  listingMode,
                  auctionDurationHours,
                  numericStartingBid,
                  reservePrice,
                  currencySymbol,
                  parsedShareCount,
                  parsedSharePrice,
                  authPhotos.length,
                )}
              </Text>
            </View>
          )}

          <View style={{ height: DockConstants.singleActionHeight }} />
        </KeyboardAwareScrollView>

      {/* -- 9. RECOVERABLE PUBLICATION FEEDBACK + 10. STICKY PREVIEW / PUBLISH FOOTER -- */}
      {/* No quality score or dashboard — the footer shows readiness state
          and primary CTA only. Contextual guidance lives next to each field. */}
      <ListingPublishFooter
        mode={listingMode}
        isPublishing={isPublishing}
        publishDisabled={publishDisabled}
        publicationStage={publicationStage}
        errorMsg={errorMsg}
        onPreview={handlePreview}
        onPublish={handlePublish}
        bottomInset={insets.bottom}
      />

      {/* -- picker -- */}
      <BottomSheetPicker
        visible={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={pickerMode ?? ''}
        options={getPickerOptions()}
        selectedValue={getPickerSelected()}
        onSelect={handlePickerSelect}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1 },

  /* -- nav header -- */
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth },
  navCloseBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  navTitle: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.priceList.letterSpacing },
  navDraftStatus: {
    minWidth: Space.xl + Space.sm,
    alignItems: 'flex-end' },
  navDraftSavedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 },
  navDraftText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold },

  /* -- scroll -- */
  scroll: {
    flex: 1 },
  scrollContent: {
    paddingBottom: Space.md },

  /* -- sections -- */
  autofillCard: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    padding: Space.md,
    borderRadius: RadiusRoleValue.sheetDialog,
    borderWidth: 0 },
  autofillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginBottom: Space.xs },
  autofillTitle: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  autofillDesc: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginBottom: Space.sm },
  autofillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.xs + 2,
    borderBottomWidth: Stroke.hairline },
  autofillRowLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    textTransform: 'uppercase',
    letterSpacing: TypographyV2.label.letterSpacing },
  autofillRowValue: {
    flex: 1,
    marginLeft: Space.sm,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textAlign: 'right' },
  autofillChipLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    textTransform: 'uppercase',
    letterSpacing: TypographyV2.label.letterSpacing },
  autofillChipValue: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs },
  autofillApplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: 0,
    alignSelf: 'flex-start',
    marginTop: Space.xs },
  autofillApplyText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing },
  sectionSpacing: {
    paddingTop: Space.lg },
  /* Section spacing 24pt (Space.lg). Section heading is a restrained eyebrow. */
  sectionGroup: {
    paddingTop: Space.lg,
    paddingHorizontal: Space.md },
  sectionHeading: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: FontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: TypographyV2.label.letterSpacing,
    marginBottom: Space.sm },

  /* -- fields -- */
  /* Field spacing 16pt: paddingVertical 8 + hairline marginTop 8 = 16pt rhythm. */
  fieldGroup: {
    paddingVertical: Space.sm },
  /* Labels: TypographyV2.bodyStrong — clear, legible, heavier than input text. */
  fieldLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    marginBottom: Space.xs },
  /* Inputs: TypographyV2.body — comfortable reading weight. */
  fieldInput: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
    paddingVertical: Space.sm,
    paddingHorizontal: 0,
    minHeight: Control.hit + Space.sm },
  fieldInputMultiline: {
    minHeight: Space.xxl + Space.xl,
    textAlignVertical: 'top',
    paddingTop: Space.sm },
  /* Hints: TypographyV2.meta — supportive but recessed. */
  fieldHelper: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs },
  fieldError: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    marginTop: Space.xs },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginTop: Space.sm },

  /* -- picker rows -- */
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    minHeight: Control.hit + Space.sm },
  pickerRowInner: {
    flex: 1 },
  pickerValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing },
  pickerPlaceholder: {},

  /* -- price input -- */
  /* The price field is the financial center of the listing — larger
     currency symbol matches the input size for visual cohesion. */
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm,
    minHeight: Control.hit + Space.sm },
  currencySymbol: {
    fontSize: TypographyV2.priceHero.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
    marginRight: Space.xs + 2 },
  priceInput: {
    fontSize: TypographyV2.priceHero.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
    minWidth: Space.xxl + Space.lg + Space.sm,
    padding: 0 },
  discountPreview: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    marginTop: Space.xs },
  soldCompsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
    paddingVertical: Space.xs },
  soldCompsText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    flex: 1,
    fontVariant: ['tabular-nums'] },
  soldCompsAction: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold },

  /* -- toggles -- */
  toggleRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs },
  togglePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit },
  togglePillActive: {},
  toggleText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium },
  toggleTextActive: {
    fontFamily: FontFamily.bold },

  /* -- co-own auth photos -- */
  authPhotoRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.sm },
  authThumb: {
    width: Space.xxl + Space.xs,
    height: Space.xxl + Space.xs,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    overflow: 'hidden' },
  authThumbImage: {
    width: Space.xxl + Space.xs,
    height: Space.xxl + Space.xs },
  authThumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full },
  authAddBtn: {
    width: Space.xxl + Space.xs,
    height: Space.xxl + Space.xs,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: Stroke.standard,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center' },

  /* -- inline error -- */
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  inlineErrorText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold },

  /* -- compact review summary (auction/co_own) -- */
  /* Per audit 04 P1: compact review state before publish for high-value
     formats. Flat inline — no card chrome (§4 surface budget). */
  reviewSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  reviewSummaryText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing },

  /* -- contextual authenticity prompts -- */
  /* Per audit 04 P1: contextual prompts by category/value.
     Flat inline — no card chrome (§4 surface budget). */
  contextualPrompts: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    gap: Space.xs },
  contextualPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1 },
  contextualPromptText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing },

  /* -- contextual photo assistant (consolidated) -- */
  /* One system replacing the former contextualHintRow, PhotoGuideCollapse,
     and contextualPrompts. Flat inline — no card chrome (§4 surface budget). */
  photoAssistantToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    minHeight: Control.hit },
  photoAssistantToggleText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing },
  photoAssistantTips: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
    gap: Space.xs },
  photoAssistantTip: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing },

  /* -- price suggestion block -- */
  priceSuggestionBlock: {
    marginTop: Space.xs,
    gap: 0 },

  /* -- seller proceeds estimate -- */
  /* Per audit 04 P1: seller-proceeds preview beside price.
     Flat inline row — no card chrome (§4 surface budget).
     The amount uses priceList weight to read as a financial figure. */
  proceedsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    marginTop: Space.xs },
  proceedsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1 },
  proceedsLabel: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.medium,
    marginTop: 0 },
  proceedsRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs },
  proceedsAmount: {
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'] },
  proceedsFeeHint: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    marginTop: 0 },

  /* -- field validation -- */
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs },
  fieldRequiredHint: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing },

  /* -- contextual hints (field-specific, not a dashboard) -- */
  contextualHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs },
  contextualHintText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing },

  /* -- category-aware completeness indicator (flat inline) -- */
  completenessRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  completenessTextWrap: {
    flex: 1,
    gap: Space.xs / 2 },
  completenessLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing },
  completenessHint: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing },

  /* -- shipping summary row + bottom sheet -- */
  shippingSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + Space.xs,
    paddingHorizontal: Space.md,
    minHeight: Control.hit,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000000', // themed inline
  },
  shippingSummaryLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    marginBottom: Space.xxs },
  shippingSummaryValue: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight },
  /* -- draft hint (flat inline) -- */
  draftHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2 },
  draftHintText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing },

  /* -- quick actions row (transparent targets, no chrome) -- */
  sellQuickActions: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.xs },
  sellQuickAction: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs - 2,
    paddingVertical: Space.sm,
    minHeight: Control.hit,
    justifyContent: 'center' },
  sellQuickActionLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing },

  /* -- import a shop row (flat, hairline-separated, 44pt target) -- */
  importShopRow: {
    paddingHorizontal: Space.md,
    minHeight: Control.hit,
    justifyContent: 'center' },
  importShopSeparator: {
    height: Stroke.hairline,
    marginBottom: Space.sm + Space.xs },
  importShopContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Control.hit },
  importShopText: {
    flex: 1,
    justifyContent: 'center',
    gap: Space.xxs },
  importShopTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  importShopSubtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    lineHeight: TypographyV2.meta.lineHeight,
    letterSpacing: TypographyV2.meta.letterSpacing } });
