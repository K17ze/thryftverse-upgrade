import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Reanimated, { FadeInDown } from 'react-native-reanimated';

import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Typography, DockConstants, Type, Radius, Stroke, Control } from '../theme/designTokens';
import { useToast } from '../context/ToastContext';
import { useCurrencyPref } from '../hooks/useCurrencyPref';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { CURRENCIES } from '../constants/currencies';
import { sanitizeDecimalInput } from '../utils/currencyAuthoringFlows';
import { convertPickerAsset, validateMediaAssets, ListingMediaDraftItem } from '../utils/mediaUploadAsset';
import { haptics } from '../utils/haptics';
import { useStore } from '../store/useStore';

import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { fetchListingByIdFromApi, patchListingOnApi, createListingImageOnApi } from '../services/listingsApi';
import { MediaUploadQueue } from '../services/mediaUploadQueue';
import { ListingMediaStudio } from '../components/listing/ListingMediaStudio';
import { EditListingFooter } from '../components/listing/EditListingFooter';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useBackendData } from '../context/BackendDataContext';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../platform/server/queryKeys';
import { useSoldComps } from '../hooks/useSoldComps';
import { calculateListingQuality } from '../utils/listingQuality';

const { width: SCREEN_W } = Dimensions.get('window');

const CONDITIONS = ['New with tags', 'Very good', 'Good', 'Satisfactory'];
const SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'One size'];
const BRANDS = ['Nike', 'Adidas', 'Zara', 'H&M', 'Ralph Lauren', 'Off-White', 'Stone Island', 'Stussy', 'Other'];
const CATEGORY_OPTIONS = ['Women', 'Men', 'Designer', 'Kids', 'Home', 'Electronics', 'Entertainment', 'Hobbies & collectables', 'Sports'];

type PickerMode = 'Category' | 'Brand' | 'Size' | 'Condition' | null;
type RouteT = RouteProp<RootStackParamList, 'EditListing'>;
type SaveStage = 'idle' | 'uploading_media' | 'updating_listing' | 'completed' | 'failed_recoverable';

export default function EditListingScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  // Theme-aware color overrides for the static styles. The static
  // StyleSheet contains only non-color properties; colors are applied
  // via this themed proxy so the screen is fully dark-mode compatible.
  const t = useMemo(() => ({
    navStatusText: { color: colors.textMuted },
    navStatusUnsaved: { color: colors.brand },
    errorTitle: { color: colors.textPrimary },
    retryBtn: { backgroundColor: colors.brand },
    retryBtnText: { color: colors.textInverse },
    statusDot: { backgroundColor: colors.textMuted },
    statusDotActive: { backgroundColor: colors.success },
    statusText: { color: colors.textSecondary },
    restrictedText: { color: colors.textMuted },
    sectionHeading: { color: colors.textSecondary },
    fieldLabel: { color: colors.textSecondary },
    fieldInput: { color: colors.textPrimary },
    hairline: { backgroundColor: colors.border },
    pickerValue: { color: colors.textPrimary },
    pickerPlaceholder: { color: colors.textMuted },
    currencySymbol: { color: colors.textMuted },
    discountPreview: { color: colors.success },
    descInput: { color: colors.textPrimary },
    charCount: { color: colors.textMuted },
    inlineErrorText: { color: colors.danger },
    photoGuideCard: { backgroundColor: colors.surface, borderColor: colors.border },
    photoGuideTitle: { color: colors.textSecondary },
    photoGuideTip: { color: colors.textMuted },
    photoGuideMin: { color: colors.textMuted },
    priceSuggestion: { color: colors.brand },
    priceMarketHigh: { color: colors.warning },
    priceMarketLow: { color: colors.textMuted },
    priceMarketGood: { color: colors.success },
    priceNoCompsHint: { color: colors.textMuted },
    fieldValid: { color: colors.success },
    fieldRequiredHint: { color: colors.textMuted },
    charCountWarn: { color: colors.warning },
    qualityBar: { backgroundColor: colors.surface, borderTopColor: colors.border },
    qualityBarLabel: { color: colors.textPrimary },
    qualityBarScore: { color: colors.textPrimary },
    qualityBarTier: { color: colors.textSecondary },
    qualityTipsRow: { backgroundColor: colors.surfaceAlt },
    qualityTipsText: { color: colors.textSecondary },
    qualityTipsLabel: { color: colors.brand },
    soldCompsText: { color: colors.textMuted },
    soldCompsAction: { color: colors.brand },
  }), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { itemId } = route.params;
  const { show: showToast } = useToast();
  const { currencyCode } = useCurrencyPref();
  const currencySymbol = CURRENCIES[currencyCode].symbol;
  const { refreshListings } = useBackendData();
  const queryClient = useQueryClient();
  const reducedMotionEnabled = useReducedMotion();

  const [listing, setListing] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [condition, setCondition] = useState('');
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express' | null>(null);
  const [shippingPayer, setShippingPayer] = useState<'buyer' | 'seller' | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [saveStage, setSaveStage] = useState<SaveStage>('idle');
  const [photoGuideCollapsed, setPhotoGuideCollapsed] = useState(false);
  const [qualityTipsExpanded, setQualityTipsExpanded] = useState(false);

  // Media state — stable-ID based
  const [mediaItems, setMediaItems] = useState<ListingMediaDraftItem[]>([]);

  // Ownership
  const currentUser = useStore((s) => s.currentUser);
  const isOwner = useMemo(() => {
    if (!listing || !currentUser) return false;
    return listing.sellerId === currentUser.id;
  }, [listing, currentUser]);

  /* ── upload queue ── */
  const uploadQueueRef = useRef(new MediaUploadQueue());
  const [queueState, setQueueState] = useState(uploadQueueRef.current.getState());
  useEffect(() => {
    const unsub = uploadQueueRef.current.subscribe((s) => setQueueState(s));
    return () => { unsub(); };
  }, []);

  /* ── fetch listing on mount ── */
  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setLoadError(false);
    fetchListingByIdFromApi(itemId)
      .then((res) => {
        if (!mounted) return;
        if (res.ok && res.listing) {
          const l = res.listing;
          setListing(l);
          setTitle(l.title ?? '');
          setDescription(l.description ?? '');
          setPrice(String(l.priceGbp ?? ''));
          setOriginalPrice(l.originalPriceGbp ? String(l.originalPriceGbp) : '');
          setCategory(l.category ? l.category.charAt(0).toUpperCase() + l.category.slice(1) : '');
          setBrand(l.brand ?? '');
          setSize(l.size ?? '');
          setCondition(l.condition ?? '');
          setShippingMethod((l.shippingMethod as 'standard' | 'express' | null) ?? null);
          setShippingPayer((l.shippingPayer as 'buyer' | 'seller' | null) ?? null);
          const initialPhotos = l.images ?? (l.imageUrl ? [l.imageUrl] : []);
          const items: ListingMediaDraftItem[] = initialPhotos.map((uri: string, i: number) => ({
            id: `remote_${itemId}_${i}`,
            uri,
            kind: 'image' as const,
            source: 'remote' as const,
            status: 'uploaded' as const,
            publicUrl: uri,
          }));
          setMediaItems(items);
        } else {
          setLoadError(true);
          showToast('Could not load listing', 'error');
        }
      })
      .catch(() => {
        if (mounted) {
          setLoadError(true);
          showToast('Could not load listing', 'error');
        }
      })
      .finally(() => { if (mounted) setIsLoading(false); });
    return () => { mounted = false; };
  }, [itemId, showToast]);

  /* ── dirty state ── */
  const hasChanges = useMemo(() => {
    if (!listing) return false;
    const originalCategory = listing.category
      ? listing.category.charAt(0).toUpperCase() + listing.category.slice(1)
      : '';
    const originalOriginalPrice = listing.originalPriceGbp ? String(listing.originalPriceGbp) : '';
    const originalShippingMethod = listing.shippingMethod ?? null;
    const originalShippingPayer = listing.shippingPayer ?? null;

    return (
      title !== listing.title ||
      description !== (listing.description ?? '') ||
      price !== String(listing.priceGbp ?? '') ||
      originalPrice !== originalOriginalPrice ||
      category !== originalCategory ||
      brand !== (listing.brand ?? '') ||
      size !== (listing.size ?? '') ||
      condition !== (listing.condition ?? '') ||
      shippingMethod !== originalShippingMethod ||
      shippingPayer !== originalShippingPayer ||
      mediaItems.some((m) => m.source === 'local')
    );
  }, [listing, title, description, price, originalPrice, category, brand, size, condition, shippingMethod, shippingPayer, mediaItems]);

  /* ── media handling ── */
  const handlePickFromLibrary = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMsg('Allow gallery access to upload media.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        allowsEditing: false,
        quality: 0.9,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const assets = result.assets.map(convertPickerAsset);
        const existing = mediaItems.map((m) => ({ id: m.id, uri: m.uri, fileName: m.fileName || 'existing', mimeType: m.mimeType || 'image/jpeg', kind: m.kind }));
        const validation = validateMediaAssets(assets, existing, { maxTotalCount: 10 });

        if (validation.errors.length > 0) {
          const skipped = validation.errors.map((e) => e.message).join('. ');
          if (skipped) setErrorMsg(skipped);
        }

        const newItems: ListingMediaDraftItem[] = validation.assets.map((asset) => ({
          id: `edit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          uri: asset.uri,
          kind: 'image' as const,
          source: 'local' as const,
          status: 'draft' as const,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
        }));

        setMediaItems((prev) => [...prev, ...newItems].slice(0, 10));
        if (validation.assets.length > 0) {
          haptics.success();
        }
      }
    } catch {
      setErrorMsg('Could not open photo library. Try again.');
    }
  }, [mediaItems]);

  const handlePickFromCamera = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setErrorMsg('Allow camera access to capture listing media.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.9,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const asset = convertPickerAsset(result.assets[0]);
        const existing = mediaItems.map((m) => ({ id: m.id, uri: m.uri, fileName: m.fileName || 'existing', mimeType: m.mimeType || 'image/jpeg', kind: m.kind }));
        const validation = validateMediaAssets([asset], existing, { maxTotalCount: 10 });
        if (validation.errors.length > 0) {
          setErrorMsg(validation.errors.map((e) => e.message).join('. '));
        }
        for (const a of validation.assets) {
          const newItem: ListingMediaDraftItem = {
            id: `edit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            uri: a.uri,
            kind: 'image' as const,
            source: 'local' as const,
            status: 'draft' as const,
            fileName: a.fileName,
            mimeType: a.mimeType,
          };
          setMediaItems((prev) => [...prev, newItem].slice(0, 10));
        }
        if (validation.assets.length > 0) {
          haptics.success();
        }
      }
    } catch {
      setErrorMsg('Could not open camera. Try again.');
    }
  }, [mediaItems]);

  const handleRemoveItem = useCallback((itemId: string) => {
    const item = mediaItems.find((m) => m.id === itemId);
    if (!item) return;
    if (item.source === 'remote') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    uploadQueueRef.current.removeItem(itemId);
    setMediaItems((prev) => prev.filter((m) => m.id !== itemId));
  }, [mediaItems]);

  const handleRetryItem = useCallback((itemId: string) => {
    const queue = uploadQueueRef.current;
    const ok = queue.retryItem(itemId);
    if (ok) {
      setMediaItems((prev) =>
        prev.map((m) =>
          m.id === itemId ? { ...m, status: 'pending', error: undefined } : m
        )
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const handleReorder = useCallback((newOrderedIds: string[]) => {
    setMediaItems((prev) => {
      const itemMap = new Map(prev.map((m) => [m.id, m]));
      return newOrderedIds.map((id) => itemMap.get(id)).filter(Boolean) as ListingMediaDraftItem[];
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const canRemoveItem = useCallback((itemId: string) => {
    const item = mediaItems.find((m) => m.id === itemId);
    return item ? item.source === 'local' : false;
  }, [mediaItems]);

  /* ── validation ── */
  const validate = useCallback(() => {
    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();
    const numericPrice = Number(sanitizeDecimalInput(price));

    if (!trimmedTitle) return 'Add a title.';
    if (!category) return 'Select a category.';
    if (!brand) return 'Select a brand.';
    if (!size) return 'Select a size.';
    if (!condition) return 'Select a condition.';
    if (!trimmedDesc || trimmedDesc.length < 10) return 'Add a description with at least 10 characters.';
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) return 'Enter a valid price greater than 0.';
    if (mediaItems.length === 0) return 'Add at least one photo.';
    return '';
  }, [title, category, brand, size, condition, description, price, mediaItems]);

  /* ── save handler ── */
  const handleSave = useCallback(async () => {
    const error = validate();
    if (error) {
      setErrorMsg(error);
      setSaveStage('failed_recoverable');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }
    if (!isOwner) {
      setErrorMsg('You do not have permission to edit this listing.');
      setSaveStage('failed_recoverable');
      return;
    }
    setErrorMsg('');
    setIsSaving(true);

    try {
      let coverFinalizationId: string | undefined;
      const existingRemotePhotos = mediaItems.filter((m) => m.source === 'remote').map((m) => m.publicUrl || m.uri);
      const newLocalItems = mediaItems.filter((m) => m.source === 'local');

      // 1. Upload new local media via queue (if any)
      if (newLocalItems.length > 0) {
        setSaveStage('uploading_media');
        const queue = uploadQueueRef.current;
        const assets = newLocalItems.map((m) => ({
          id: m.id,
          uri: m.uri,
          fileName: m.fileName || m.uri.split('/').pop() || 'photo.jpg',
          mimeType: m.mimeType || 'image/jpeg',
          kind: m.kind,
          width: m.width,
          height: m.height,
        }));
        queue.addAssets(assets);
        await queue.run();
        const queueItems = queue.getItems();
        setMediaItems((prev) =>
          prev.map((m) => {
            const qi = queueItems.find((q) => q.id === m.id);
            if (!qi) return m;
            return {
              ...m,
              status: qi.state === 'uploaded' ? 'uploaded' : qi.state === 'failed' ? 'failed' : m.status,
              publicUrl: qi.publicUrl || m.publicUrl,
              error: qi.error || m.error,
            };
          })
        );

        const failedItems = queueItems.filter((q) => q.state === 'failed');
        if (failedItems.length > 0) {
          setSaveStage('failed_recoverable');
          setErrorMsg('Some media failed to upload. Retry before saving.');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          return;
        }

        // 2. Attach uploaded images with deterministic IDs
        const uploadedItems = queueItems.filter(
          (q) => q.state === 'uploaded' && q.publicUrl && q.finalizationId,
        );
        const firstMedia = mediaItems[0];
        if (firstMedia?.source === 'local') {
          coverFinalizationId = queueItems.find((item) => item.id === firstMedia.id)?.finalizationId ?? undefined;
        }
        for (let i = 0; i < uploadedItems.length; i++) {
          const qi = uploadedItems[i];
          const attachmentId = `${itemId}_media_${qi.id}`;
          await createListingImageOnApi({
            id: attachmentId,
            listingId: itemId,
            imageUrl: qi.publicUrl!,
            sortOrder: existingRemotePhotos.length + i,
            mediaWidth: qi.asset.width,
            mediaHeight: qi.asset.height,
            finalizationId: qi.finalizationId!,
          });
        }
      }

      // 3. Patch listing metadata (text fields + cover image)
      setSaveStage('updating_listing');
      const coverUri = mediaItems[0]?.publicUrl || mediaItems[0]?.uri;
      await patchListingOnApi(itemId, {
        title: title.trim(),
        description: description.trim(),
        priceGbp: Number(sanitizeDecimalInput(price)),
        category: category.toLowerCase(),
        brand: brand || undefined,
        size: size || undefined,
        condition: condition || undefined,
        originalPriceGbp: originalPrice ? Number(sanitizeDecimalInput(originalPrice)) : undefined,
        shippingMethod: shippingMethod || undefined,
        shippingPayer: shippingPayer || undefined,
        imageUrl: coverUri,
        coverFinalizationId,
      });

      setSaveStage('completed');
      showToast('Listing updated successfully.', 'success');
      // Refresh feed + invalidate cached detail so the edit propagates
      // immediately when the user returns to the feed or profile.
      void refreshListings();
      void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(itemId) });
      navigation.goBack();
    } catch (e) {
      setSaveStage('failed_recoverable');
      setErrorMsg('Failed to update listing. Try again.');
      showToast('Failed to update listing. Try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [validate, isOwner, itemId, title, description, price, brand, size, condition, category, originalPrice, shippingMethod, shippingPayer, mediaItems, showToast, navigation]);

  /* ── preview handler ── */
  const handlePreview = useCallback(() => {
    haptics.press();
    const photos = mediaItems.map((m) => m.publicUrl || m.uri);
    navigation.navigate('ListingPreview', {
      preview: {
        title: title.trim(),
        price: Number(sanitizeDecimalInput(price)) || undefined,
        originalPrice: originalPrice ? Number(sanitizeDecimalInput(originalPrice)) : undefined,
        brand: brand || undefined,
        condition: condition || undefined,
        category: category || undefined,
        size: size || undefined,
        description: description.trim() || undefined,
        photos,
        shippingMethod: shippingMethod || undefined,
        shippingPayer: shippingPayer || undefined,
      },
      origin: 'edit',
    });
  }, [title, price, originalPrice, brand, condition, category, size, description, shippingMethod, shippingPayer, mediaItems, navigation]);

  /* ── discard confirmation ── */
  const handleCancel = useCallback(() => {
    if (hasChanges) {
      Alert.alert(
        'Discard changes?',
        'You have unsaved changes that will be lost.',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
        ]
      );
    } else {
      navigation.goBack();
    }
  }, [hasChanges, navigation]);

  /* ── picker helpers ── */
  const getPickerOptions = useCallback(() => {
    switch (pickerMode) {
      case 'Category': return CATEGORY_OPTIONS;
      case 'Brand': return BRANDS;
      case 'Size': return SIZES;
      case 'Condition': return CONDITIONS;
      default: return [];
    }
  }, [pickerMode]);

  const getPickerSelected = useCallback(() => {
    switch (pickerMode) {
      case 'Category': return category;
      case 'Brand': return brand;
      case 'Size': return size;
      case 'Condition': return condition;
      default: return undefined;
    }
  }, [pickerMode, category, brand, size, condition]);

  const handlePickerSelect = useCallback((val: string) => {
    if (pickerMode === 'Category') setCategory(val);
    if (pickerMode === 'Brand') setBrand(val);
    if (pickerMode === 'Size') setSize(val);
    if (pickerMode === 'Condition') setCondition(val);
    setPickerMode(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [pickerMode]);

  /* ── computed values ── */
  const hasDiscount = useMemo(() => {
    const orig = Number(originalPrice);
    const curr = Number(price);
    return orig > 0 && curr > 0 && curr < orig;
  }, [originalPrice, price]);

  const discountPercent = useMemo(() => {
    const orig = Number(originalPrice);
    const curr = Number(price);
    if (!hasDiscount) return 0;
    return Math.round(((orig - curr) / orig) * 100);
  }, [hasDiscount, originalPrice, price]);

  const saveDisabled = !hasChanges || isSaving;

  /* ── sold comparables for pricing guidance ── */
  const { listings: backendListings } = useBackendData();
  const soldComps = useSoldComps(backendListings, category || undefined, brand || undefined);
  const numericPrice = Number(sanitizeDecimalInput(price));
  const hasValidPrice = Number.isFinite(numericPrice) && numericPrice > 0;
  const priceVsMarket = useMemo(() => {
    if (!soldComps.hasComps || !hasValidPrice) return null;
    if (soldComps.minPrice != null && numericPrice < soldComps.minPrice * 0.8) return 'below' as const;
    if (soldComps.maxPrice != null && numericPrice > soldComps.maxPrice * 1.2) return 'above' as const;
    return 'in_range' as const;
  }, [soldComps, hasValidPrice, numericPrice]);

  /* ── listing quality ── */
  const qualityResult = useMemo(() => calculateListingQuality({
    photos: mediaItems.map((m) => m.publicUrl || m.uri),
    title,
    brand,
    category,
    size,
    condition,
    description,
    price,
    originalPrice,
    tags: [],
    shippingMethod,
    shippingPayer,
    listingMode: 'sell_now',
  }), [mediaItems, title, brand, category, size, condition, description, price, originalPrice, shippingMethod, shippingPayer]);

  /* ── listing status label ── */
  const listingStatusLabel = useMemo(() => {
    if (!listing) return null;
    const status = listing.status;
    switch (status) {
      case 'active': return 'Active listing';
      case 'draft': return 'Draft listing';
      case 'sold': return 'Sold listing';
      case 'paused': return 'Paused listing';
      default: return null;
    }
  }, [listing]);

  const isEditingRestricted = listing?.status === 'sold' || listing?.status === 'deleted' || !isOwner;

  /* ── loading state ── */
  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Edit listing" onBack={() => navigation.goBack()} />}>
        <View style={styles.loadingContainer}>
          <SkeletonLoader width="100%" height={200} borderRadius={Radius.lg} />
          <View style={styles.skeletonFormGap}>
            <SkeletonLoader width="100%" height={48} borderRadius={Radius.md} />
            <SkeletonLoader width="100%" height={48} borderRadius={Radius.md} />
            <SkeletonLoader width="60%" height={48} borderRadius={Radius.md} />
            <SkeletonLoader width="100%" height={120} borderRadius={Radius.md} />
          </View>
        </View>
      </FlagshipScreen>
    );
  }

  if (loadError) {
    return (
      <FlagshipScreen header={<FlagshipHeader title="Edit listing" onBack={() => navigation.goBack()} />}>
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.textMuted} />
          <Text style={[styles.errorTitle, t.errorTitle]}>Could not load listing</Text>
          <Pressable
            style={({ pressed }) => [styles.retryBtn, t.retryBtn, pressed && { opacity: 0.7 }]}
            onPress={() => {
              setLoadError(false);
              setIsLoading(true);
              fetchListingByIdFromApi(itemId)
                .then((res) => {
                  if (res.ok && res.listing) {
                    const l = res.listing;
                    setListing(l);
                    setTitle(l.title ?? '');
                    setDescription(l.description ?? '');
                    setPrice(String(l.priceGbp ?? ''));
                    setOriginalPrice(l.originalPriceGbp ? String(l.originalPriceGbp) : '');
                    setCategory(l.category ? l.category.charAt(0).toUpperCase() + l.category.slice(1) : '');
                    setBrand(l.brand ?? '');
                    setSize(l.size ?? '');
                    setCondition(l.condition ?? '');
                    setShippingMethod((l.shippingMethod as 'standard' | 'express' | null) ?? null);
                    setShippingPayer((l.shippingPayer as 'buyer' | 'seller' | null) ?? null);
                    const initialPhotos = l.images ?? (l.imageUrl ? [l.imageUrl] : []);
                    const items: ListingMediaDraftItem[] = initialPhotos.map((uri: string, i: number) => ({
                      id: `remote_${itemId}_${i}`,
                      uri,
                      kind: 'image' as const,
                      source: 'remote' as const,
                      status: 'uploaded' as const,
                      publicUrl: uri,
                    }));
                    setMediaItems(items);
                  } else {
                    setLoadError(true);
                  }
                })
                .catch(() => setLoadError(true))
                .finally(() => setIsLoading(false));
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading listing"
          >
            <Text style={[styles.retryBtnText, t.retryBtnText]}>Retry</Text>
          </Pressable>
        </View>
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Edit listing"
          onBack={handleCancel}
          backIcon="close"
          rightAction={
            <Text style={[styles.navStatusText, t.navStatusText, hasChanges && styles.navStatusUnsaved, hasChanges && t.navStatusUnsaved]}>
              {hasChanges ? 'Unsaved' : 'Saved'}
            </Text>
          }
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* ── 2. LISTING MEDIA STUDIO ── */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(0)}>
          {isOwner ? (
            <ListingMediaStudio
              items={mediaItems}
              queueItems={queueState.items}
              maxCount={10}
              onPickFromLibrary={handlePickFromLibrary}
              onPickFromCamera={handlePickFromCamera}
              onReorder={handleReorder}
              onRemoveItem={handleRemoveItem}
              onRetryItem={handleRetryItem}
              canRemoveItem={canRemoveItem}
              reorderEnabled={false}
              lockedNote="Existing listing photos cannot be removed or reordered yet."
              removeLabel="Remove"
            />
          ) : (
            <ListingMediaStudio
              items={mediaItems}
              queueItems={queueState.items}
              maxCount={10}
              onReorder={handleReorder}
              onRemoveItem={handleRemoveItem}
              onRetryItem={handleRetryItem}
              onPickFromLibrary={handlePickFromLibrary}
              onPickFromCamera={handlePickFromCamera}
              reorderEnabled={false}
              canRemoveItem={() => false}
              lockedNote="You do not have permission to edit this listing."
            />
          )}
          </Reanimated.View>

          {/* ── 2a. PHOTO UPLOAD GUIDANCE ── */}
          <View style={[styles.photoGuideCard, t.photoGuideCard]}>
            <Pressable
              style={({ pressed }) => [styles.photoGuideHeader, pressed && { opacity: 0.6 }]}
              onPress={() => setPhotoGuideCollapsed((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={photoGuideCollapsed ? 'Expand photo tips' : 'Collapse photo tips'}
            >
              <Ionicons name="camera-outline" size={15} color={colors.textSecondary} />
              <Text style={[styles.photoGuideTitle, t.photoGuideTitle]}>Photo tips</Text>
              <Text style={[styles.photoGuideMin, t.photoGuideMin]}>Min 3 photos recommended</Text>
              <Ionicons name={photoGuideCollapsed ? 'chevron-down' : 'chevron-up'} size={14} color={colors.textMuted} />
            </Pressable>
            {!photoGuideCollapsed && (
              <View style={styles.photoGuideTips}>
                <View style={styles.photoGuideTipRow}>
                  <Ionicons name="sunny-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.photoGuideTip, t.photoGuideTip]}>Good lighting</Text>
                </View>
                <View style={styles.photoGuideTipRow}>
                  <Ionicons name="cube-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.photoGuideTip, t.photoGuideTip]}>Show all angles</Text>
                </View>
                <View style={styles.photoGuideTipRow}>
                  <Ionicons name="leaf-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.photoGuideTip, t.photoGuideTip]}>Natural background</Text>
                </View>
              </View>
            )}
          </View>

          {/* ── 3. LISTING STATUS/CONTEXT ── */}
          {listingStatusLabel && (
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, t.statusDot, listing?.status === 'active' && styles.statusDotActive, listing?.status === 'active' && t.statusDotActive]} />
              <Text style={[styles.statusText, t.statusText]}>{listingStatusLabel}</Text>
            </View>
          )}

          {isEditingRestricted && (
            <View style={styles.restrictedRow}>
              <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
              <Text style={[styles.restrictedText, t.restrictedText]}>Editing is limited for this listing status.</Text>
            </View>
          )}

          {/* ── 4. DETAILS ── */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(60)} style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, t.sectionHeading]}>Details</Text>

            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, t.fieldLabel]}>Title</Text>
                {title.trim().length > 0 ? (
                  <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                ) : (
                  <Text style={[styles.fieldRequiredHint, t.fieldRequiredHint]}>Required</Text>
                )}
              </View>
              <TextInput
                style={[styles.fieldInput, t.fieldInput, isEditingRestricted && styles.fieldInputDisabled]}
                value={title}
                onChangeText={(t) => { setTitle(t); setErrorMsg(''); }}
                placeholder="e.g. Vintage Levi's 501 Denim Jacket"
                placeholderTextColor={colors.textMuted}
                returnKeyType="next"
                editable={!isEditingRestricted}
              />
              <View style={[styles.hairline, t.hairline]} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => !isEditingRestricted && setPickerMode('Category')}
              accessibilityRole="button"
              accessibilityLabel="Select category"
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, t.fieldLabel]}>Category</Text>
                  {category ? (
                    <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  ) : (
                    <Text style={[styles.fieldRequiredHint, t.fieldRequiredHint]}>Required</Text>
                  )}
                </View>
                <Text style={[styles.pickerValue, t.pickerValue, !category && styles.pickerPlaceholder, !category && t.pickerPlaceholder]}>
                  {category || 'Select category'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
            <View style={[styles.hairline, t.hairline]} />

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => !isEditingRestricted && setPickerMode('Brand')}
              accessibilityRole="button"
              accessibilityLabel="Select brand"
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, t.fieldLabel]}>Brand</Text>
                  {brand ? (
                    <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  ) : (
                    <Text style={[styles.fieldRequiredHint, t.fieldRequiredHint]}>Required</Text>
                  )}
                </View>
                <Text style={[styles.pickerValue, t.pickerValue, !brand && styles.pickerPlaceholder, !brand && t.pickerPlaceholder]}>
                  {brand || 'Select brand'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
            <View style={[styles.hairline, t.hairline]} />

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => !isEditingRestricted && setPickerMode('Size')}
              accessibilityRole="button"
              accessibilityLabel="Select size"
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, t.fieldLabel]}>Size</Text>
                  {size ? (
                    <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  ) : (
                    <Text style={[styles.fieldRequiredHint, t.fieldRequiredHint]}>Required</Text>
                  )}
                </View>
                <Text style={[styles.pickerValue, t.pickerValue, !size && styles.pickerPlaceholder, !size && t.pickerPlaceholder]}>
                  {size || 'Select size'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
            <View style={[styles.hairline, t.hairline]} />

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => !isEditingRestricted && setPickerMode('Condition')}
              accessibilityRole="button"
              accessibilityLabel="Select condition"
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, t.fieldLabel]}>Condition</Text>
                  {condition ? (
                    <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  ) : (
                    <Text style={[styles.fieldRequiredHint, t.fieldRequiredHint]}>Required</Text>
                  )}
                </View>
                <Text style={[styles.pickerValue, t.pickerValue, !condition && styles.pickerPlaceholder, !condition && t.pickerPlaceholder]}>
                  {condition || 'Select condition'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          </Reanimated.View>

          {/* ── 5. PRICING ── */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(120)} style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, t.sectionHeading]}>Pricing</Text>

            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, t.fieldLabel]}>Price</Text>
                {hasValidPrice ? (
                  <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                ) : (
                  <Text style={[styles.fieldRequiredHint, t.fieldRequiredHint]}>Required</Text>
                )}
              </View>
              <View style={styles.priceRow}>
                <Text style={[styles.currencySymbol, t.currencySymbol]}>{currencySymbol}</Text>
                <TextInput
                  style={[styles.fieldInput, t.fieldInput, styles.priceInput, isEditingRestricted && styles.fieldInputDisabled]}
                  value={price}
                  onChangeText={(v) => { setPrice(sanitizeDecimalInput(v)); setErrorMsg(''); }}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  editable={!isEditingRestricted}
                />
              </View>
              {hasDiscount && (
                <Text style={[styles.discountPreview, t.discountPreview]}>−{discountPercent}% off original</Text>
              )}
              {soldComps.hasComps && soldComps.minPrice != null && soldComps.maxPrice != null ? (
                <View style={styles.priceSuggestionBlock}>
                  <View style={styles.soldCompsHint}>
                    <Ionicons name="pricetag-outline" size={13} color={colors.textMuted} />
                    <Text style={[styles.soldCompsText, t.soldCompsText]}>
                      Similar items sold for {currencySymbol}{soldComps.minPrice.toFixed(0)}–{currencySymbol}{soldComps.maxPrice.toFixed(0)}
                      {' '}({soldComps.sampleSize} sold)
                    </Text>
                  </View>
                  {soldComps.medianPrice != null && (
                    <View style={styles.soldCompsHint}>
                      <Ionicons name="bulb-outline" size={13} color={colors.brand} />
                      <Text style={[styles.soldCompsText, t.priceSuggestion]}>
                        Suggested price: {currencySymbol}{soldComps.medianPrice.toFixed(0)}
                      </Text>
                    </View>
                  )}
                  {priceVsMarket === 'above' && (
                    <View style={styles.soldCompsHint}>
                      <Ionicons name="trending-up-outline" size={13} color={colors.warning} />
                      <Text style={[styles.soldCompsText, t.priceMarketHigh]}>
                        Priced above recent sold range
                      </Text>
                    </View>
                  )}
                  {priceVsMarket === 'below' && (
                    <View style={styles.soldCompsHint}>
                      <Ionicons name="trending-down-outline" size={13} color={colors.textMuted} />
                      <Text style={[styles.soldCompsText, t.priceMarketLow]}>
                        Priced below recent sold range
                      </Text>
                    </View>
                  )}
                  {priceVsMarket === 'in_range' && (
                    <View style={styles.soldCompsHint}>
                      <Ionicons name="checkmark-circle-outline" size={13} color={colors.success} />
                      <Text style={[styles.soldCompsText, t.priceMarketGood]}>
                        Within recent sold range
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.soldCompsHint}>
                  <Ionicons name="information-circle-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.soldCompsText, t.priceNoCompsHint]}>
                    Price competitively for faster sales
                  </Text>
                </View>
              )}
              <View style={[styles.hairline, t.hairline]} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, t.fieldLabel]}>Original price</Text>
              <View style={styles.priceRow}>
                <Text style={[styles.currencySymbol, t.currencySymbol]}>{currencySymbol}</Text>
                <TextInput
                  style={[styles.fieldInput, t.fieldInput, styles.priceInput, isEditingRestricted && styles.fieldInputDisabled]}
                  value={originalPrice}
                  onChangeText={(v) => { setOriginalPrice(sanitizeDecimalInput(v)); setErrorMsg(''); }}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  editable={!isEditingRestricted}
                />
              </View>
            </View>
          </Reanimated.View>

          {/* ── 6. DESCRIPTION ── */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(180)} style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, t.sectionHeading]}>Description</Text>
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, t.fieldLabel]}>Description</Text>
                {description.trim().length >= 10 ? (
                  <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                ) : (
                  <Text style={[styles.fieldRequiredHint, t.fieldRequiredHint]}>Required</Text>
                )}
              </View>
              <TextInput
                style={[styles.descInput, t.descInput, isEditingRestricted && styles.fieldInputDisabled]}
                value={description}
                onChangeText={(t) => { setDescription(t); setErrorMsg(''); }}
                placeholder="Describe the item, condition, and any notable details…"
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!isEditingRestricted}
              />
              <Text style={[styles.charCount, description.trim().length < 10 ? t.charCountWarn : t.charCount]}>
                {description.trim().length} characters{description.trim().length < 10 ? ' · min 10' : description.length < 60 ? ' · add more detail' : ''}
              </Text>
            </View>
          </Reanimated.View>

          {/* ── 7. SHIPPING ── */}
          <Reanimated.View entering={reducedMotionEnabled ? undefined : FadeInDown.duration(300).delay(240)} style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, t.sectionHeading]}>Shipping</Text>

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => !isEditingRestricted && setShippingMethod(shippingMethod === 'standard' ? 'express' : 'standard')}
              accessibilityRole="button"
              accessibilityLabel="Toggle shipping method"
            >
              <View style={styles.pickerRowInner}>
                <Text style={[styles.fieldLabel, t.fieldLabel]}>Shipping method</Text>
                <Text style={[styles.pickerValue, t.pickerValue, !shippingMethod && styles.pickerPlaceholder, !shippingMethod && t.pickerPlaceholder]}>
                  {shippingMethod === 'standard' ? 'Standard' : shippingMethod === 'express' ? 'Express' : 'Select method'}
                </Text>
              </View>
              <Ionicons name="swap-horizontal" size={16} color={colors.textMuted} />
            </Pressable>
            <View style={[styles.hairline, t.hairline]} />

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => !isEditingRestricted && setShippingPayer(shippingPayer === 'buyer' ? 'seller' : 'buyer')}
              accessibilityRole="button"
              accessibilityLabel="Toggle who pays shipping"
            >
              <View style={styles.pickerRowInner}>
                <Text style={[styles.fieldLabel, t.fieldLabel]}>Who pays</Text>
                <Text style={[styles.pickerValue, t.pickerValue, !shippingPayer && styles.pickerPlaceholder, !shippingPayer && t.pickerPlaceholder]}>
                  {shippingPayer === 'buyer' ? 'Buyer pays' : shippingPayer === 'seller' ? 'I pay' : 'Select payer'}
                </Text>
              </View>
              <Ionicons name="swap-horizontal" size={16} color={colors.textMuted} />
            </Pressable>
          </Reanimated.View>

          {/* ── 8. SAVE/UPDATE FEEDBACK ── */}
          {errorMsg && saveStage !== 'idle' && (
            <View style={styles.inlineErrorRow}>
              <Ionicons name="alert-circle" size={14} color={colors.danger} />
              <Text style={[styles.inlineErrorText, t.inlineErrorText]}>{errorMsg}</Text>
            </View>
          )}

          <View style={{ height: DockConstants.singleActionHeight }} />
        </KeyboardAwareScrollView>

      {/* ── 8b. COMPACT LISTING QUALITY METER (fixed above save footer) ── */}
      {isOwner && (
        <View style={[styles.qualityBar, t.qualityBar]}>
          <View style={styles.qualityBarRow}>
            <View style={styles.qualityBarLeft}>
              <Ionicons
                name={qualityResult.tier === 'excellent' ? 'star' : qualityResult.tier === 'good' ? 'star-half-outline' : 'ellipse-outline'}
                size={14}
                color={colors.textSecondary}
              />
              <Text style={[styles.qualityBarLabel, t.qualityBarLabel]}>Listing quality</Text>
            </View>
            <View style={styles.qualityBarRight}>
              <Text style={[styles.qualityBarScore, t.qualityBarScore]}>{qualityResult.score}%</Text>
              <Text style={[styles.qualityBarTier, t.qualityBarTier]}>{qualityResult.tierLabel}</Text>
              <Pressable
                hitSlop={8}
                onPress={() => setQualityTipsExpanded((v) => !v)}
                style={({ pressed }) => [styles.qualityTipsToggle, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={qualityTipsExpanded ? 'Hide tips to improve' : 'Show tips to improve'}
              >
                <Text style={[styles.qualityTipsLabel, t.qualityTipsLabel]}>Tips to improve</Text>
                <Ionicons name={qualityTipsExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={colors.brand} />
              </Pressable>
            </View>
          </View>
          <View style={styles.qualityBarTrack}>
            <View style={[styles.qualityBarFill, { width: `${qualityResult.score}%`, backgroundColor: colors.brand }]} />
          </View>
          {qualityTipsExpanded && qualityResult.missingItems.length > 0 && (
            <View style={[styles.qualityTipsRow, t.qualityTipsRow]}>
              {qualityResult.missingItems.slice(0, 6).map((item) => (
                <View key={item.key} style={styles.qualityTipChip}>
                  <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={11} color={colors.textMuted} />
                  <Text style={[styles.qualityTipsText, t.qualityTipsText]}>{item.label}</Text>
                </View>
              ))}
            </View>
          )}
          {qualityTipsExpanded && qualityResult.tips.length > 0 && (
            <View style={styles.qualityTipsList}>
              {qualityResult.tips.slice(0, 4).map((tip, i) => (
                <View key={i} style={styles.qualityTipBulletRow}>
                  <Text style={[styles.qualityTipBullet, t.qualityTipsText]}>•</Text>
                  <Text style={[styles.qualityTipsText, t.qualityTipsText]}>{tip}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── 9. STICKY PREVIEW/SAVE FOOTER ── */}
      {isOwner && (
        <EditListingFooter
          isSaving={isSaving}
          saveDisabled={saveDisabled}
          saveStage={saveStage}
          errorMsg={errorMsg || null}
          onPreview={handlePreview}
          onSave={handleSave}
          bottomInset={insets.bottom}
        />
      )}

      <BottomSheetPicker
        visible={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={pickerMode ?? 'Select'}
        options={getPickerOptions()}
        selectedValue={getPickerSelected()}
        onSelect={handlePickerSelect}
        searchable={pickerMode === 'Brand'}
      />
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  navStatusText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  navStatusUnsaved: {
    fontFamily: Typography.family.semibold,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Space.md,
  },
  loadingContainer: {
    flex: 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: Space.md,
  },
  skeletonFormGap: {
    gap: Space.sm,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
    paddingHorizontal: Space.xl,
  },
  errorTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
  },
  retryBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: Radius.xxl,
  },
  retryBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  statusDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: Radius.sm,
  },
  statusDotActive: {},
  statusText: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
  },
  restrictedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  restrictedText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  sectionGroup: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
  },
  sectionHeading: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Space.sm,
  },
  fieldGroup: {
    paddingVertical: Space.xs,
  },
  fieldLabel: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.regular,
    marginBottom: Space.xs,
  },
  fieldInput: {
    fontSize: Typography.size.bodyLarge,
    fontFamily: Typography.family.regular,
    paddingVertical: Space.sm,
    minHeight: Control.hit + Space.sm,
  },
  fieldInputDisabled: {
    opacity: 0.5,
  },
  hairline: {
    height: Stroke.hairline,
    marginVertical: Space.xs,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    minHeight: Control.hit + Space.sm,
  },
  pickerRowInner: {
    flex: 1,
  },
  pickerValue: {
    fontSize: Typography.size.bodyLarge,
    fontFamily: Typography.family.regular,
  },
  pickerPlaceholder: {},
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontSize: Typography.size.bodyLarge,
    fontFamily: Typography.family.bold,
    marginRight: Space.xs + 2,
  },
  priceInput: {
    flex: 1,
    fontSize: Type.priceList.size,
    fontFamily: Typography.family.bold,
  },
  discountPreview: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    marginTop: Space.xs,
  },
  descInput: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.regular,
    minHeight: Space.xxl + Space.xxl + Space.sm,
    paddingVertical: Space.sm,
    lineHeight: Type.bodyEmphasis.lineHeight + 1,
  },
  charCount: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    textAlign: 'right',
  },
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },

  /* -- photo guidance card -- */
  photoGuideCard: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  photoGuideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  photoGuideTitle: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
  },
  photoGuideMin: {
    flex: 1,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
  },
  photoGuideTips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm + 2,
    marginTop: Space.sm,
  },
  photoGuideTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  photoGuideTip: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },

  /* -- price suggestion block -- */
  priceSuggestionBlock: {
    marginTop: Space.xs,
    gap: 0,
  },
  soldCompsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
    paddingVertical: Space.xs,
  },
  soldCompsText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    flex: 1,
  },
  soldCompsAction: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
  },

  /* -- field validation -- */
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  fieldRequiredHint: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
  },

  /* -- compact quality bar (fixed above footer) -- */
  qualityBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
    gap: Space.xs,
  },
  qualityBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  qualityBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  qualityBarLabel: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
  },
  qualityBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  qualityBarScore: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
  },
  qualityBarTier: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  qualityTipsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
  },
  qualityTipsLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.semibold,
  },
  qualityBarTrack: {
    height: Stroke.emphasis,
    borderRadius: Radius.sm,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  qualityBarFill: {
    height: '100%',
    borderRadius: Radius.sm,
  },
  qualityTipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs + 1,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.sm,
    marginTop: Space.xs,
  },
  qualityTipChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
  },
  qualityTipsList: {
    gap: Space.xs - 1,
    marginTop: Space.xs,
  },
  qualityTipBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2,
  },
  qualityTipBullet: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.bold,
  },
  qualityTipsText: {
    flex: 1,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    lineHeight: Type.caption.lineHeight - 1,
  },
});
