import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { RootStackParamList } from '../navigation/types';
import { Colors } from '../constants/colors';
import { Space, Typography } from '../theme/designTokens';
import { useToast } from '../context/ToastContext';
import { useCurrencyPref } from '../hooks/useCurrencyPref';
import { CURRENCIES } from '../constants/currencies';
import { sanitizeDecimalInput } from '../utils/currencyAuthoringFlows';
import { convertPickerAsset, validateMediaAssets, ListingMediaDraftItem } from '../utils/mediaUploadAsset';
import { haptics } from '../utils/haptics';

import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { fetchListingByIdFromApi, patchListingOnApi, createListingImageOnApi } from '../services/listingsApi';
import { MediaUploadQueue } from '../services/mediaUploadQueue';
import { ListingMediaStudio } from '../components/listing/ListingMediaStudio';
import { EditListingFooter } from '../components/listing/EditListingFooter';

const { width: SCREEN_W } = Dimensions.get('window');

const CONDITIONS = ['New with tags', 'Very good', 'Good', 'Satisfactory'];
const SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'One size'];
const BRANDS = ['Nike', 'Adidas', 'Zara', 'H&M', 'Ralph Lauren', 'Off-White', 'Stone Island', 'Stussy', 'Other'];
const CATEGORY_OPTIONS = ['Women', 'Men', 'Designer', 'Kids', 'Home', 'Electronics', 'Entertainment', 'Hobbies & collectables', 'Sports'];

type PickerMode = 'Category' | 'Brand' | 'Size' | 'Condition' | null;
type RouteT = RouteProp<RootStackParamList, 'EditListing'>;
type SaveStage = 'idle' | 'uploading_media' | 'updating_listing' | 'removing_media' | 'saving_order' | 'completed' | 'failed_recoverable';

export default function EditListingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { itemId } = route.params;
  const { show: showToast } = useToast();
  const { currencyCode } = useCurrencyPref();
  const currencySymbol = CURRENCIES[currencyCode].symbol;

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
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express' | null>(null);
  const [shippingPayer, setShippingPayer] = useState<'buyer' | 'seller' | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [saveStage, setSaveStage] = useState<SaveStage>('idle');

  // Media state — stable-ID based
  const [mediaItems, setMediaItems] = useState<ListingMediaDraftItem[]>([]);
  const [originalMediaItems, setOriginalMediaItems] = useState<ListingMediaDraftItem[]>([]);
  const [pendingRemovalIds, setPendingRemovalIds] = useState<Set<string>>(new Set());

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
          setOriginalMediaItems(items);
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

    const activeItems = mediaItems.filter((m) => !pendingRemovalIds.has(m.id));
    const originalActiveUris = originalMediaItems.map((m) => m.publicUrl || m.uri);
    const currentActiveUris = activeItems.map((m) => m.publicUrl || m.uri);

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
      pendingRemovalIds.size > 0 ||
      activeItems.length !== originalMediaItems.length ||
      currentActiveUris.some((u: string, i: number) => u !== originalActiveUris[i]) ||
      mediaItems.some((m) => m.source === 'local')
    );
  }, [listing, title, description, price, originalPrice, category, brand, size, condition, shippingMethod, shippingPayer, mediaItems, pendingRemovalIds, originalMediaItems]);

  /* ── tag handling ── */
  const handleTagSubmit = useCallback(() => {
    const raw = tagInput.trim().toLowerCase();
    if (!raw) return;
    const parts = raw.split(/[,\s]+/).filter(Boolean);
    const next = [...new Set([...tags, ...parts])].slice(0, 8);
    setTags(next);
    setTagInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [tagInput, tags]);

  const removeTag = useCallback((t: string) => {
    setTags((prev) => prev.filter((x) => x !== t));
  }, []);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (item.source === 'remote') {
      setPendingRemovalIds((prev) => new Set([...prev, itemId]));
    } else {
      uploadQueueRef.current.removeItem(itemId);
      setMediaItems((prev) => prev.filter((m) => m.id !== itemId));
    }
  }, [mediaItems]);

  const handleUndoRemoveItem = useCallback((itemId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingRemovalIds((prev) => {
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

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

  const isPendingRemoval = useCallback((itemId: string) => pendingRemovalIds.has(itemId), [pendingRemovalIds]);

  /* ── validation ── */
  const validate = useCallback(() => {
    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();
    const numericPrice = Number(sanitizeDecimalInput(price));

    if (!trimmedTitle) return 'Please provide a title.';
    if (!category) return 'Please select a category.';
    if (!brand) return 'Please select a brand.';
    if (!size) return 'Please select a size.';
    if (!condition) return 'Please select a condition.';
    if (!trimmedDesc || trimmedDesc.length < 10) return 'Add a description with at least 10 characters.';
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) return 'Enter a valid price greater than 0.';
    const activeItems = mediaItems.filter((m) => !pendingRemovalIds.has(m.id));
    if (activeItems.length === 0) return 'Add at least one photo.';
    return '';
  }, [title, category, brand, size, condition, description, price, mediaItems, pendingRemovalIds]);

  /* ── save handler ── */
  const handleSave = useCallback(async () => {
    const error = validate();
    if (error) {
      setErrorMsg(error);
      setSaveStage('failed_recoverable');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return;
    }
    setErrorMsg('');
    setIsSaving(true);
    setSaveStage('updating_listing');

    try {
      const activeItems = mediaItems.filter((m) => !pendingRemovalIds.has(m.id));
      const existingRemotePhotos = activeItems.filter((m) => m.source === 'remote').map((m) => m.publicUrl || m.uri);
      const newLocalItems = activeItems.filter((m) => m.source === 'local');
      const removedOriginals = originalMediaItems.filter((m) => pendingRemovalIds.has(m.id));

      // 1. Patch text metadata
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
      });

      // 2. Upload new local media via queue
      if (newLocalItems.length > 0) {
        setSaveStage('uploading_media');
        const queue = uploadQueueRef.current;
        const assets = newLocalItems.map((m) => ({
          id: m.id,
          uri: m.uri,
          fileName: m.fileName || m.uri.split('/').pop() || 'photo.jpg',
          mimeType: m.mimeType || 'image/jpeg',
          kind: m.kind,
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

        const urls = queue.getUploadedUrls();
        setSaveStage('saving_order');
        for (let i = 0; i < urls.length; i++) {
          await createListingImageOnApi({
            id: `${itemId}_img_new_${Date.now()}_${i}`,
            listingId: itemId,
            imageUrl: urls[i],
            sortOrder: existingRemotePhotos.length + i,
          });
        }
      }

      // 3. Handle removed originals
      if (removedOriginals.length > 0) {
        setSaveStage('removing_media');
        showToast('Note: removed original photos may still appear until backend deletion is supported.', 'info');
      }

      setSaveStage('completed');
      showToast('Listing updated successfully.', 'success');
      navigation.goBack();
    } catch (e) {
      setSaveStage('failed_recoverable');
      setErrorMsg('Failed to update listing. Please try again.');
      showToast('Failed to update listing. Please try again.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [validate, itemId, title, description, price, brand, size, condition, category, originalPrice, shippingMethod, shippingPayer, mediaItems, pendingRemovalIds, originalMediaItems, showToast, navigation]);

  /* ── preview handler ── */
  const handlePreview = useCallback(() => {
    haptics.press();
    const activeItems = mediaItems.filter((m) => !pendingRemovalIds.has(m.id));
    const photos = activeItems.map((m) => m.publicUrl || m.uri);
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
        tags,
        shippingMethod: shippingMethod || undefined,
        shippingPayer: shippingPayer || undefined,
      },
    });
  }, [title, price, originalPrice, brand, condition, category, size, description, tags, shippingMethod, shippingPayer, mediaItems, pendingRemovalIds, navigation]);

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

  const isEditingRestricted = listing?.status === 'sold' || listing?.status === 'deleted';

  /* ── loading state ── */
  if (isLoading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.brand} />
          <Text style={styles.loadingText}>Loading listing…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.navHeader}>
          <Pressable
            style={styles.navCloseBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.navTitle}>Edit listing</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="cloud-offline-outline" size={40} color={Colors.textMuted} />
          <Text style={styles.errorTitle}>Could not load listing</Text>
          <Pressable
            style={styles.retryBtn}
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
                    setOriginalMediaItems(items);
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
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ── 1. COMPACT NAVIGATION HEADER ── */}
        <View style={styles.navHeader}>
          <Pressable
            style={styles.navCloseBtn}
            onPress={handleCancel}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Cancel and go back"
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.navTitle}>Edit listing</Text>
          <View style={styles.navStatusWrap}>
            <Text style={[styles.navStatusText, hasChanges && styles.navStatusUnsaved]}>
              {hasChanges ? 'Unsaved' : 'Saved'}
            </Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── 2. LISTING MEDIA STUDIO ── */}
          <ListingMediaStudio
            items={mediaItems}
            queueItems={queueState.items}
            maxCount={10}
            errorText={errorMsg && !isSaving ? undefined : undefined}
            onPickFromLibrary={handlePickFromLibrary}
            onPickFromCamera={handlePickFromCamera}
            onReorder={handleReorder}
            onRemoveItem={handleRemoveItem}
            onRetryItem={handleRetryItem}
            onUndoRemoveItem={handleUndoRemoveItem}
            isPendingRemoval={isPendingRemoval}
            removeLabel="Remove"
          />

          {/* ── 3. LISTING STATUS/CONTEXT ── */}
          {listingStatusLabel && (
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, listing?.status === 'active' && styles.statusDotActive]} />
              <Text style={styles.statusText}>{listingStatusLabel}</Text>
            </View>
          )}

          {isEditingRestricted && (
            <View style={styles.restrictedRow}>
              <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
              <Text style={styles.restrictedText}>Editing is limited for this listing status.</Text>
            </View>
          )}

          {/* ── 4. DETAILS ── */}
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionHeading}>Details</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={[styles.fieldInput, isEditingRestricted && styles.fieldInputDisabled]}
                value={title}
                onChangeText={(t) => { setTitle(t); setErrorMsg(''); }}
                placeholder="e.g. Vintage Levi's 501 Denim Jacket"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
                editable={!isEditingRestricted}
              />
              <View style={styles.hairline} />
            </View>

            <Pressable
              style={styles.pickerRow}
              onPress={() => !isEditingRestricted && setPickerMode('Category')}
              accessibilityRole="button"
              accessibilityLabel="Select category"
            >
              <View style={styles.pickerRowInner}>
                <Text style={styles.fieldLabel}>Category</Text>
                <Text style={[styles.pickerValue, !category && styles.pickerPlaceholder]}>
                  {category || 'Select category'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>
            <View style={styles.hairline} />

            <Pressable
              style={styles.pickerRow}
              onPress={() => !isEditingRestricted && setPickerMode('Brand')}
              accessibilityRole="button"
              accessibilityLabel="Select brand"
            >
              <View style={styles.pickerRowInner}>
                <Text style={styles.fieldLabel}>Brand</Text>
                <Text style={[styles.pickerValue, !brand && styles.pickerPlaceholder]}>
                  {brand || 'Select brand'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>
            <View style={styles.hairline} />

            <Pressable
              style={styles.pickerRow}
              onPress={() => !isEditingRestricted && setPickerMode('Size')}
              accessibilityRole="button"
              accessibilityLabel="Select size"
            >
              <View style={styles.pickerRowInner}>
                <Text style={styles.fieldLabel}>Size</Text>
                <Text style={[styles.pickerValue, !size && styles.pickerPlaceholder]}>
                  {size || 'Select size'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>
            <View style={styles.hairline} />

            <Pressable
              style={styles.pickerRow}
              onPress={() => !isEditingRestricted && setPickerMode('Condition')}
              accessibilityRole="button"
              accessibilityLabel="Select condition"
            >
              <View style={styles.pickerRowInner}>
                <Text style={styles.fieldLabel}>Condition</Text>
                <Text style={[styles.pickerValue, !condition && styles.pickerPlaceholder]}>
                  {condition || 'Select condition'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
            </Pressable>
          </View>

          {/* ── 5. PRICING ── */}
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionHeading}>Pricing</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Price</Text>
              <View style={styles.priceRow}>
                <Text style={styles.currencySymbol}>{currencySymbol}</Text>
                <TextInput
                  style={[styles.fieldInput, styles.priceInput, isEditingRestricted && styles.fieldInputDisabled]}
                  value={price}
                  onChangeText={(v) => { setPrice(sanitizeDecimalInput(v)); setErrorMsg(''); }}
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                  editable={!isEditingRestricted}
                />
              </View>
              {hasDiscount && (
                <Text style={styles.discountPreview}>−{discountPercent}% off original</Text>
              )}
              <View style={styles.hairline} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Original price</Text>
              <View style={styles.priceRow}>
                <Text style={styles.currencySymbol}>{currencySymbol}</Text>
                <TextInput
                  style={[styles.fieldInput, styles.priceInput, isEditingRestricted && styles.fieldInputDisabled]}
                  value={originalPrice}
                  onChangeText={(v) => { setOriginalPrice(sanitizeDecimalInput(v)); setErrorMsg(''); }}
                  placeholder="0.00"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="decimal-pad"
                  editable={!isEditingRestricted}
                />
              </View>
            </View>
          </View>

          {/* ── 6. DESCRIPTION AND TAGS ── */}
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionHeading}>Description</Text>
            <View style={styles.fieldGroup}>
              <TextInput
                style={[styles.descInput, isEditingRestricted && styles.fieldInputDisabled]}
                value={description}
                onChangeText={(t) => { setDescription(t); setErrorMsg(''); }}
                placeholder="Describe the item, condition, and any notable details…"
                placeholderTextColor={Colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!isEditingRestricted}
              />
              <Text style={styles.charCount}>{description.trim().length} characters</Text>
              <View style={styles.hairline} />
            </View>

            <Text style={styles.fieldLabel}>Tags</Text>
            {tags.length > 0 && (
              <View style={styles.tagsRow}>
                {tags.map((tag) => (
                  <View key={tag} style={styles.tagChip}>
                    <Text style={styles.tagChipText}>{tag}</Text>
                    <Pressable
                      onPress={() => removeTag(tag)}
                      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove tag ${tag}`}
                    >
                      <Ionicons name="close" size={12} color={Colors.textMuted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.tagInputRow}>
              <TextInput
                style={styles.tagInput}
                value={tagInput}
                onChangeText={setTagInput}
                placeholder="Add tag…"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="done"
                onSubmitEditing={handleTagSubmit}
              />
              {tagInput.trim() && (
                <Pressable
                  style={styles.tagAddBtn}
                  onPress={handleTagSubmit}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Add tag"
                >
                  <Ionicons name="add" size={18} color={Colors.brand} />
                </Pressable>
              )}
            </View>
          </View>

          {/* ── 7. SHIPPING ── */}
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionHeading}>Shipping</Text>

            <Pressable
              style={styles.pickerRow}
              onPress={() => !isEditingRestricted && setShippingMethod(shippingMethod === 'standard' ? 'express' : 'standard')}
              accessibilityRole="button"
              accessibilityLabel="Toggle shipping method"
            >
              <View style={styles.pickerRowInner}>
                <Text style={styles.fieldLabel}>Shipping method</Text>
                <Text style={[styles.pickerValue, !shippingMethod && styles.pickerPlaceholder]}>
                  {shippingMethod === 'standard' ? 'Standard' : shippingMethod === 'express' ? 'Express' : 'Select method'}
                </Text>
              </View>
              <Ionicons name="swap-horizontal" size={16} color={Colors.textMuted} />
            </Pressable>
            <View style={styles.hairline} />

            <Pressable
              style={styles.pickerRow}
              onPress={() => !isEditingRestricted && setShippingPayer(shippingPayer === 'buyer' ? 'seller' : 'buyer')}
              accessibilityRole="button"
              accessibilityLabel="Toggle who pays shipping"
            >
              <View style={styles.pickerRowInner}>
                <Text style={styles.fieldLabel}>Who pays</Text>
                <Text style={[styles.pickerValue, !shippingPayer && styles.pickerPlaceholder]}>
                  {shippingPayer === 'buyer' ? 'Buyer pays' : shippingPayer === 'seller' ? 'I pay' : 'Select payer'}
                </Text>
              </View>
              <Ionicons name="swap-horizontal" size={16} color={Colors.textMuted} />
            </Pressable>
          </View>

          {/* ── 8. SAVE/UPDATE FEEDBACK ── */}
          {errorMsg && saveStage !== 'idle' && (
            <View style={styles.inlineErrorRow}>
              <Ionicons name="alert-circle" size={14} color={Colors.danger} />
              <Text style={styles.inlineErrorText}>{errorMsg}</Text>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── 9. STICKY PREVIEW/SAVE FOOTER ── */}
      <EditListingFooter
        isSaving={isSaving}
        saveDisabled={saveDisabled}
        saveStage={saveStage}
        errorMsg={errorMsg || null}
        onPreview={handlePreview}
        onSave={handleSave}
        bottomInset={insets.bottom}
      />

      <BottomSheetPicker
        visible={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={pickerMode ?? 'Select'}
        options={getPickerOptions()}
        selectedValue={getPickerSelected()}
        onSelect={handlePickerSelect}
        searchable={pickerMode === 'Brand'}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  navCloseBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  navStatusWrap: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  navStatusText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  navStatusUnsaved: {
    color: Colors.brand,
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
  },
  loadingText: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
    paddingHorizontal: Space.xl,
  },
  errorTitle: {
    fontSize: 16,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  retryBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: 24,
    backgroundColor: Colors.brand,
  },
  retryBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.textMuted,
  },
  statusDotActive: {
    backgroundColor: Colors.success,
  },
  statusText: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
  },
  restrictedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  restrictedText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  sectionGroup: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
  },
  sectionHeading: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Space.sm,
  },
  fieldGroup: {
    paddingVertical: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  fieldInput: {
    fontSize: 16,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    paddingVertical: 8,
  },
  fieldInputDisabled: {
    opacity: 0.5,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    minHeight: 44,
  },
  pickerRowInner: {
    flex: 1,
  },
  pickerValue: {
    fontSize: 16,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
  },
  pickerPlaceholder: {
    color: Colors.textMuted,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontSize: 16,
    fontFamily: Typography.family.bold,
    color: Colors.textMuted,
    marginRight: 6,
  },
  priceInput: {
    flex: 1,
    fontSize: 20,
    fontFamily: Typography.family.bold,
  },
  discountPreview: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.success,
    marginTop: 4,
  },
  descInput: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    minHeight: 100,
    paddingVertical: 8,
    lineHeight: 22,
  },
  charCount: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'right',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagChipText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
  },
  tagInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tagInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagAddBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
  },
});
