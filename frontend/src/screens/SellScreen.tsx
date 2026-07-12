import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';

import { Colors } from '../constants/colors';
import { Space, Typography, DockConstants } from '../theme/designTokens';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { CURRENCIES } from '../constants/currencies';
import { useStore } from '../store/useStore';
import { useCurrencyPref } from '../hooks/useCurrencyPref';
import { useToast } from '../context/ToastContext';
import { sanitizeDecimalInput, sanitizeIntegerInput } from '../utils/currencyAuthoringFlows';
import { buildCreateCoOwnPrefillFromSell } from '../utils/syndicatePrefill';
import { filterImageUris } from '../utils/media';
import { haptics } from '../utils/haptics';
import { convertPickerAsset, validateMediaAssets, ListingMediaDraftItem } from '../utils/mediaUploadAsset';
import { uploadMedia } from '../services/mediaUpload';
import { MediaUploadQueue } from '../services/mediaUploadQueue';
import { createListingOnApi, createListingImageOnApi } from '../services/listingsApi';
import { ListingMediaStudio } from '../components/listing/ListingMediaStudio';
import { ListingModeSelector, ListingMode } from '../components/listing/ListingModeSelector';
import { ListingPublishFooter } from '../components/listing/ListingPublishFooter';
import { ListingQualityMeter } from '../components/listing/ListingQualityMeter';
import { calculateListingQuality } from '../utils/listingQuality';
import { useListingAutofill } from '../hooks/useListingAutofill';
import { useSoldComps } from '../hooks/useSoldComps';
import { useBackendData } from '../context/BackendDataContext';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';

const { width: SCREEN_W } = Dimensions.get('window');

const CONDITION_OPTIONS = ['New with tags', 'Very good', 'Good', 'Satisfactory'];
const AUCTION_DURATIONS = [24, 48, 72, 168];

export default function SellScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const sellDraft = useStore((s) => s.sellDraft);
  const updateSellDraft = useStore((s) => s.updateSellDraft);
  const clearSellDraft = useStore((s) => s.clearSellDraft);
  const currentUser = useStore((s) => s.currentUser);

  const [photos, setPhotos] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [category, setCategory] = useState<string>('');
  const [brand, setBrand] = useState('');
  const [size, setSize] = useState('');
  const [condition, setCondition] = useState('');
  const [shippingMethod, setShippingMethod] = useState<'standard' | 'express' | null>(null);
  const [shippingPayer, setShippingPayer] = useState<'buyer' | 'seller' | null>(null);

  const [listingMode, setListingMode] = useState<ListingMode>('sell_now');

  const [coOwnEnabled, setCoOwnEnabled] = useState(false);
  const [shareCountInput, setShareCountInput] = useState('');
  const [sharePriceInput, setSharePriceInput] = useState('');
  const [offeringWindowHours, setOfferingWindowHours] = useState(48);
  const [authPhotos, setAuthPhotos] = useState<string[]>([]);

  const [startingBid, setStartingBid] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [auctionDurationHours, setAuctionDurationHours] = useState(48);

  const [pickerMode, setPickerMode] = useState<'Brand' | 'Size' | 'Condition' | 'Category' | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPublishing, setIsPublishing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [publicationStage, setPublicationStage] = useState<'idle' | 'uploading_media' | 'creating_listing' | 'attaching_media' | 'completed' | 'failed_recoverable'>('idle');
  const publishedListingIdRef = useRef<string | null>(null);
  const uploadedUrlsRef = useRef<string[]>([]);

  const [mediaDraftItems, setMediaDraftItems] = useState<ListingMediaDraftItem[]>([]);

  const uploadQueueRef = useRef(new MediaUploadQueue());
  const [queueState, setQueueState] = useState(uploadQueueRef.current.getState());
  useEffect(() => {
    const unsub = uploadQueueRef.current.subscribe((s) => setQueueState(s));
    return () => { unsub(); };
  }, []);

  const currency = useCurrencyPref();
  const currencySymbol = CURRENCIES[currency.currencyCode].symbol;

  // AI autofill suggestions from first photo filename
  const autofillSuggestion = useListingAutofill(mediaDraftItems);
  const [autofillDismissed, setAutofillDismissed] = useState(false);

  // Reset dismiss when photos change (new photo → new suggestions)
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [autofillSuggestion, title, brand, category]);

  // Sold comparables for pricing guidance — derived from real backend data
  const { listings: backendListings } = useBackendData();
  const soldComps = useSoldComps(backendListings, category || undefined, brand || undefined);

  /* ── draft sync on mount ── */
  useEffect(() => {
    if (sellDraft.mediaDraftItems && sellDraft.mediaDraftItems.length > 0) {
      setMediaDraftItems(sellDraft.mediaDraftItems);
      setPhotos(sellDraft.mediaDraftItems.map((m) => m.publicUrl || m.uri));
    } else if (sellDraft.photos) {
      setPhotos(sellDraft.photos);
      setMediaDraftItems(
        sellDraft.photos.map((uri) => ({
          id: `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          uri,
          kind: 'image' as const,
          source: uri.startsWith('http') ? ('remote' as const) : ('local' as const),
          status: uri.startsWith('http') ? ('uploaded' as const) : ('draft' as const),
          publicUrl: uri.startsWith('http') ? uri : undefined,
        }))
      );
    }
    if (sellDraft.title) setTitle(sellDraft.title);
    if (sellDraft.description) setDesc(sellDraft.description);
    if (sellDraft.price) setPrice(sellDraft.price);
    if (sellDraft.originalPrice) setOriginalPrice(sellDraft.originalPrice);
    if (sellDraft.brand) setBrand(sellDraft.brand);
    if (sellDraft.size) setSize(sellDraft.size);
    if (sellDraft.condition) setCondition(sellDraft.condition);
    if (sellDraft.categoryId) setCategory(sellDraft.categoryId);
    if (sellDraft.tags) setTags(sellDraft.tags);
    if (sellDraft.listingMode) setListingMode(sellDraft.listingMode);
    if (sellDraft.shippingMethod) setShippingMethod(sellDraft.shippingMethod);
    if (sellDraft.shippingPayer) setShippingPayer(sellDraft.shippingPayer);
    if (sellDraft.startingBid) setStartingBid(sellDraft.startingBid);
    if (sellDraft.reservePrice) setReservePrice(sellDraft.reservePrice);
    if (sellDraft.auctionDurationHours) setAuctionDurationHours(sellDraft.auctionDurationHours);
    if (sellDraft.coOwnEnabled !== undefined) setCoOwnEnabled(sellDraft.coOwnEnabled);
    if (sellDraft.shareCountInput) setShareCountInput(sellDraft.shareCountInput);
    if (sellDraft.sharePriceInput) setSharePriceInput(sellDraft.sharePriceInput);
    if (sellDraft.offeringWindowHours) setOfferingWindowHours(sellDraft.offeringWindowHours);
    if (sellDraft.authPhotos) setAuthPhotos(sellDraft.authPhotos);
  }, []);

  /* ── persist draft on change ── */
  useEffect(() => {
    updateSellDraft({
      photos,
      mediaDraftItems,
      title,
      description: desc,
      price,
      originalPrice,
      brand,
      size,
      condition,
      categoryId: category,
      tags,
      listingMode,
      shippingMethod,
      shippingPayer,
      startingBid,
      reservePrice,
      auctionDurationHours,
      coOwnEnabled,
      shareCountInput,
      sharePriceInput,
      offeringWindowHours,
      authPhotos,
    });
  }, [photos, mediaDraftItems, title, desc, price, originalPrice, brand, size, condition, category, tags, listingMode, shippingMethod, shippingPayer, startingBid, reservePrice, auctionDurationHours, coOwnEnabled, shareCountInput, sharePriceInput, offeringWindowHours, authPhotos, updateSellDraft]);

  /* ── co-own bidirectional math ── */
  useEffect(() => {
    if (listingMode !== 'co_own') return;
    const listingPrice = Number(sanitizeDecimalInput(price));
    const shareCount = Math.min(20, Math.max(1, Math.floor(Number(shareCountInput))));
    const sharePrice = Number(sanitizeDecimalInput(sharePriceInput));
    if (!Number.isFinite(shareCount) || shareCount <= 0) return;
    if (Number.isFinite(sharePrice) && sharePrice > 0 && (!Number.isFinite(listingPrice) || listingPrice <= 0)) {
      const calculatedPrice = (sharePrice * shareCount).toFixed(2);
      if (calculatedPrice !== price) setPrice(calculatedPrice);
      return;
    }
    if (Number.isFinite(listingPrice) && listingPrice > 0) {
      const calculatedSharePrice = (listingPrice / shareCount).toFixed(2);
      if (calculatedSharePrice !== sharePriceInput) setSharePriceInput(calculatedSharePrice);
    }
  }, [price, shareCountInput, sharePriceInput, listingMode]);

  useEffect(() => {
    setCoOwnEnabled(listingMode === 'co_own');
  }, [listingMode]);

  /* ── validation computed ── */
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

  const publishReady = useMemo(() => {
    if (!hasBasePhotos) return false;
    if (!hasRequiredDetails) return false;
    if (!hasDescription) return false;
    if (listingMode === 'auction') return hasValidStartingBid;
    if (listingMode === 'co_own') return hasValidPrice && coOwnFinancialReady && coOwnAuthReady;
    return hasValidPrice;
  }, [hasBasePhotos, hasRequiredDetails, hasDescription, listingMode, hasValidPrice, hasValidStartingBid, coOwnFinancialReady, coOwnAuthReady]);

  useEffect(() => {
    if (publishReady && (errorMsg || Object.keys(errors).length > 0)) {
      setErrorMsg(null);
      setErrors({});
    }
  }, [publishReady, errorMsg, errors]);

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

  /* ── photo handling ── */
  const appendPhotoUri = useCallback((uri: string) => {
    setPhotos((prev) => {
      const next = [...prev, uri].slice(0, 10);
      if (listingMode === 'co_own' && coOwnEnabled && authPhotos.length === 0) {
        setAuthPhotos(filterImageUris(next, 2));
      }
      return next;
    });
    setMediaDraftItems((prev) => {
      if (prev.some((m) => m.uri === uri)) return prev;
      const next = [
        ...prev,
        {
          id: `sell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          uri,
          kind: 'image' as const,
          source: 'local' as const,
          status: 'draft' as const,
        },
      ].slice(0, 10);
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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        allowsEditing: false,
        quality: 0.9,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const assets = result.assets.map(convertPickerAsset);
        const existing = photos.map((uri) => ({ id: uri, uri, fileName: 'existing', mimeType: 'image/jpeg', kind: 'image' as const }));
        const validation = validateMediaAssets(assets, existing, { maxTotalCount: 10 });

        if (validation.errors.length > 0) {
          const skipped = validation.errors.map((e) => e.message).join('. ');
          if (skipped) setErrorMsg(skipped);
        }

        for (const asset of validation.assets) {
          appendPhotoUri(asset.uri);
        }
        if (validation.assets.length > 0) {
          haptics.success();
        }
      }
    } catch (e) {
      setErrorMsg('Could not open photo library. Try again.');
    }
  }, [appendPhotoUri, photos]);

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
        const existing = photos.map((uri) => ({ id: uri, uri, fileName: 'existing', mimeType: 'image/jpeg', kind: 'image' as const }));
        const validation = validateMediaAssets([asset], existing, { maxTotalCount: 10 });
        if (validation.errors.length > 0) {
          setErrorMsg(validation.errors.map((e) => e.message).join('. '));
        }
        for (const a of validation.assets) {
          appendPhotoUri(a.uri);
        }
        if (validation.assets.length > 0) {
          haptics.success();
        }
      }
    } catch (e) {
      setErrorMsg('Could not open camera. Try again.');
    }
  }, [appendPhotoUri, photos]);

  const removeItem = useCallback((itemId: string) => {
    setMediaDraftItems((prev) => {
      const item = prev.find((m) => m.id === itemId);
      if (!item) return prev;
      const removedUri = item.publicUrl || item.uri;
      setPhotos((ps) => ps.filter((u) => u !== removedUri));
      return prev.filter((m) => m.id !== itemId);
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, []);

  const handleReorderIds = useCallback((newOrderedIds: string[]) => {
    setMediaDraftItems((prev) => {
      const itemMap = new Map(prev.map((m) => [m.id, m]));
      const reordered = newOrderedIds.map((id) => itemMap.get(id)).filter(Boolean) as ListingMediaDraftItem[];
      setPhotos(reordered.map((m) => m.publicUrl || m.uri));
      return reordered;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handlePriceChange = useCallback((text: string) => {
    setPrice(sanitizeDecimalInput(text));
  }, []);

  const handleShareCountChange = useCallback((value: string) => {
    const sanitized = sanitizeIntegerInput(value);
    if (!sanitized) { setShareCountInput(''); return; }
    const parsed = Math.floor(Number(sanitized));
    if (!Number.isFinite(parsed) || parsed <= 0) { setShareCountInput('1'); return; }
    setShareCountInput(String(Math.min(20, parsed)));
  }, []);

  /* ── publish ── */
  const handlePublish = useCallback(async () => {
    const trimmedTitle = title.trim();
    const trimmedDescription = desc.trim();
    const numericPrice = Number(sanitizeDecimalInput(price));
    const nextErrors: Record<string, string> = {};

    if (photos.length === 0) nextErrors.photos = 'Add at least one photo before publishing.';
    if (!trimmedTitle) nextErrors.title = 'Please provide a title.';
    if (!category) nextErrors.category = 'Please select a category.';
    if (!size) nextErrors.size = 'Please choose a size.';
    if (!condition) nextErrors.condition = 'Please choose a condition.';
    if (!trimmedDescription || trimmedDescription.length < 10) nextErrors.description = 'Add a description with at least 10 characters.';
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) nextErrors.price = 'Enter a valid price greater than 0.';

    if (listingMode === 'co_own') {
      const shareCount = Math.floor(Number(shareCountInput));
      const sharePrice = Number(sanitizeDecimalInput(sharePriceInput));
      if (!Number.isFinite(shareCount) || shareCount <= 0) nextErrors.shareCount = 'Enter a valid share count.';
      if (!Number.isFinite(sharePrice) || sharePrice <= 0) nextErrors.sharePrice = 'Enter a valid share price.';
      if (authPhotos.length === 0) nextErrors.authPhotos = 'Attach authentication photos before issuing co-own units.';
    }

    if (listingMode === 'auction') {
      const bid = Number(sanitizeDecimalInput(startingBid));
      if (!Number.isFinite(bid) || bid <= 0) nextErrors.startingBid = 'Enter a valid starting bid greater than 0.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setErrorMsg('Please fix the errors above before publishing.');
      haptics.error();
      return;
    }

    setErrors({});

    if (listingMode === 'co_own') {
      const prefillResult = buildCreateCoOwnPrefillFromSell({
        shareCountInput,
        sharePriceInput,
        offeringWindowHours,
        authPhotos,
      });

      if (!prefillResult.ok) {
        setErrorMsg(prefillResult.error ?? 'Unable to prepare co-own listing.');
        haptics.error();
        return;
      }

      setErrorMsg(null);
      haptics.success();
      navigation.replace('CreateCoOwn', prefillResult.params);
      return;
    }

    if (listingMode === 'auction') {
      if (!currentUser?.id) {
        setErrorMsg('Sign in to publish a listing.');
        haptics.error();
        return;
      }
      setErrorMsg(null);
      setIsPublishing(true);
      try {
        const queue = uploadQueueRef.current;
        const itemsToUpload = mediaDraftItems.filter((m) => m.source === 'local' && m.status !== 'uploaded');
        if (itemsToUpload.length > 0) {
          queue.addAssets(
            itemsToUpload.map((m) => ({
              id: m.id,
              uri: m.uri,
              fileName: m.fileName || m.uri.split('/').pop() || 'photo.jpg',
              mimeType: m.mimeType || 'image/jpeg',
              kind: m.kind,
            }))
          );
          await queue.run();
          const queueItems = queue.getItems();
          setMediaDraftItems((prev) =>
            prev.map((m) => {
              const qi = queueItems.find((q) => q.id === m.id);
              if (!qi) return m;
              return { ...m, status: qi.state === 'uploaded' ? 'uploaded' : qi.state === 'failed' ? 'failed' : m.status, publicUrl: qi.publicUrl || m.publicUrl, error: qi.error || m.error };
            })
          );
        }
        const uploadedUrls = mediaDraftItems.map((m) => m.publicUrl || m.uri).filter((u): u is string => !!u);
        const coverImage = uploadedUrls[0] ?? '';
        const listingId = `listing_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        await createListingOnApi({
          id: listingId,
          sellerId: currentUser.id,
          title: trimmedTitle,
          description: trimmedDescription,
          priceGbp: numericPrice,
          imageUrl: coverImage,
          status: 'active',
          category,
          brand: brand || undefined,
          size,
          condition,
          originalPriceGbp: originalPrice ? Number(sanitizeDecimalInput(originalPrice)) : undefined,
          shippingMethod: shippingMethod || undefined,
          shippingPayer: shippingPayer || undefined,
        });
        for (let i = 0; i < uploadedUrls.length; i++) {
          await createListingImageOnApi({
            id: `${listingId}_img_${i}`,
            listingId,
            imageUrl: uploadedUrls[i],
            sortOrder: i,
          });
        }
        clearSellDraft();
        setMediaDraftItems([]);
        queue.reset();
        haptics.success();
        navigation.replace('CreateAuction', { listingId });
      } catch (e: unknown) {
        const msg = typeof e === 'object' && e && 'message' in e && typeof (e as Error).message === 'string' ? (e as Error).message : 'Failed to prepare auction. Please try again.';
        setErrorMsg(msg);
        haptics.error();
      } finally {
        setIsPublishing(false);
      }
      return;
    }

    if (!currentUser?.id) {
      setErrorMsg('Sign in to publish a listing.');
      haptics.error();
      return;
    }

    if (isPublishing) return;
    setIsPublishing(true);
    setErrorMsg(null);
    setPublicationStage('uploading_media');

    try {
      const queue = uploadQueueRef.current;
      const itemsToUpload = mediaDraftItems.filter((m) => m.source === 'local' && m.status !== 'uploaded');
      if (itemsToUpload.length > 0) {
        const assets = itemsToUpload.map((m) => ({
          id: m.id,
          uri: m.uri,
          fileName: m.fileName || m.uri.split('/').pop() || 'photo.jpg',
          mimeType: m.mimeType || 'image/jpeg',
          kind: m.kind,
        }));
        queue.addAssets(assets);
        await queue.run();
        const queueItems = queue.getItems();
        setMediaDraftItems((prev) =>
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
      }

      const uploadedUrls: string[] = mediaDraftItems.map((m) => m.publicUrl || m.uri).filter((u): u is string => !!u);
      const coverImage = uploadedUrls[0] ?? '';
      let listingId = publishedListingIdRef.current;

      if (!listingId) {
        setPublicationStage('creating_listing');
        listingId = `listing_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
        await createListingOnApi({
          id: listingId,
          sellerId: currentUser.id,
          title: trimmedTitle,
          description: trimmedDescription,
          priceGbp: numericPrice,
          imageUrl: coverImage,
          status: 'active',
          category,
          brand: brand || undefined,
          size,
          condition,
          originalPriceGbp: originalPrice ? Number(sanitizeDecimalInput(originalPrice)) : undefined,
          shippingMethod: shippingMethod || undefined,
          shippingPayer: shippingPayer || undefined,
        });
        publishedListingIdRef.current = listingId;
      }

      setPublicationStage('attaching_media');
      for (let i = 0; i < uploadedUrls.length; i++) {
        await createListingImageOnApi({
          id: `${listingId}_img_${i}`,
          listingId,
          imageUrl: uploadedUrls[i],
          sortOrder: i,
        });
      }

      setPublicationStage('completed');
      clearSellDraft();
      setMediaDraftItems([]);
      queue.reset();
      publishedListingIdRef.current = null;
      haptics.success();
      navigation.replace('ListingSuccess', {
        listingId,
        title: trimmedTitle,
        price: numericPrice,
        categoryId: category,
        photoUri: coverImage,
      });
    } catch (e: unknown) {
      const msg = typeof e === 'object' && e && 'message' in e && typeof (e as Error).message === 'string' ? (e as Error).message : 'Failed to publish. Please try again.';
      const hasListing = !!publishedListingIdRef.current;
      const hasMedia = mediaDraftItems.some((m) => m.status === 'uploaded');
      setPublicationStage('failed_recoverable');
      setErrorMsg(hasListing ? `${msg} — your listing was created. Tap Publish to retry attaching media.` : hasMedia ? `${msg} — some media uploaded. Tap Publish to retry.` : msg);
      haptics.error();
    } finally {
      setIsPublishing(false);
    }
  }, [isPublishing, listingMode, photos, mediaDraftItems, title, desc, price, startingBid, category, size, condition, shareCountInput, sharePriceInput, offeringWindowHours, authPhotos, clearSellDraft, navigation, currentUser, brand, originalPrice, shippingMethod, shippingPayer]);

  /* ── picker helpers ── */
  const getPickerOptions = useCallback(() => {
    switch (pickerMode) {
      case 'Category':
        return ['Women', 'Men', 'Kids', 'Home', 'Vintage', 'Accessories', 'Beauty', 'Sportswear', 'Luxury'];
      case 'Brand':
        return ['Nike', 'Adidas', 'Zara', 'H&M', 'Gucci', 'Prada', 'Uniqlo', 'Levi\'s', 'ASOS', 'Other'];
      case 'Size':
        return ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'UK 6', 'UK 8', 'UK 10', 'UK 12', 'One Size'];
      case 'Condition':
        return CONDITION_OPTIONS;
      default:
        return [];
    }
  }, [pickerMode]);

  const getPickerSelected = useCallback(() => {
    switch (pickerMode) {
      case 'Category': return category;
      case 'Brand': return brand;
      case 'Size': return size;
      case 'Condition': return condition;
      default: return '';
    }
  }, [pickerMode, category, brand, size, condition]);

  const handlePickerSelect = useCallback((val: string) => {
    if (pickerMode === 'Category') { setCategory(val); updateSellDraft({ categoryId: val, subcategoryId: undefined }); }
    if (pickerMode === 'Brand') { setBrand(val); updateSellDraft({ brand: val }); }
    if (pickerMode === 'Size') { setSize(val); updateSellDraft({ size: val }); }
    if (pickerMode === 'Condition') { setCondition(val); updateSellDraft({ condition: val }); }
    setPickerMode(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [pickerMode, updateSellDraft]);

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

  const publishDisabled = isPublishing || (!publishReady && !isPublishing);

  /* ── preview handler ── */
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
        shippingPayer: shippingPayer || undefined,
      },
      origin: 'sell',
    });
  }, [title, price, originalPrice, brand, condition, category, size, desc, photos, shippingMethod, shippingPayer, navigation]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
        {/* ── 1. COMPACT NAVIGATION HEADER ── */}
        <View style={[styles.navHeader, { paddingTop: 0 }]}>
          <Pressable
            style={styles.navCloseBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Close and go back"
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.navTitle}>Create listing</Text>
          <View style={styles.navDraftStatus}>
            <Text style={styles.navDraftText}>Draft saved</Text>
          </View>
        </View>

        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* ── 2. LARGE LISTING MEDIA STUDIO ── */}
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
          />

          {/* ── 2b. AI AUTOFILL SUGGESTIONS ── */}
          {autofillSuggestion.hasSuggestions && !autofillDismissed && (
            <View style={styles.autofillCard}>
              <View style={styles.autofillHeader}>
                <Ionicons name="sparkles" size={16} color={Colors.brand} />
                <Text style={styles.autofillTitle}>Suggested fields</Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => setAutofillDismissed(true)}
                  accessibilityLabel="Dismiss suggestions"
                  accessibilityRole="button"
                >
                  <Ionicons name="close" size={16} color={Colors.textMuted} />
                </Pressable>
              </View>
              <Text style={styles.autofillDesc}>
                Based on your photo filename. Tap to fill empty fields.
              </Text>
              <View style={styles.autofillChips}>
                {autofillSuggestion.title && (
                  <View style={styles.autofillChip}>
                    <Text style={styles.autofillChipLabel}>Title</Text>
                    <Text style={styles.autofillChipValue} numberOfLines={1}>{autofillSuggestion.title}</Text>
                  </View>
                )}
                {autofillSuggestion.brand && (
                  <View style={styles.autofillChip}>
                    <Text style={styles.autofillChipLabel}>Brand</Text>
                    <Text style={styles.autofillChipValue} numberOfLines={1}>{autofillSuggestion.brand}</Text>
                  </View>
                )}
                {autofillSuggestion.category && (
                  <View style={styles.autofillChip}>
                    <Text style={styles.autofillChipLabel}>Category</Text>
                    <Text style={styles.autofillChipValue} numberOfLines={1}>{autofillSuggestion.category}</Text>
                  </View>
                )}
              </View>
              <Pressable
                style={styles.autofillApplyBtn}
                onPress={handleApplyAutofill}
                accessibilityLabel="Apply suggested fields"
                accessibilityRole="button"
              >
                <Ionicons name="checkmark-circle" size={16} color={Colors.brand} />
                <Text style={styles.autofillApplyText}>Apply to empty fields</Text>
              </Pressable>
            </View>
          )}

          {/* ── 3. LISTING MODE SELECTOR ── */}
          <View style={styles.sectionSpacing}>
            <ListingModeSelector
              mode={listingMode}
              onChange={(m) => { setListingMode(m); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            />
          </View>

          {/* ── 3b. LISTING QUALITY METER ── */}
          <View style={styles.sectionSpacing}>
            <ListingQualityMeter
              result={useMemo(() => calculateListingQuality({
                photos,
                title,
                brand,
                category,
                size,
                condition,
                description: desc,
                price,
                originalPrice,
                tags,
                shippingMethod,
                shippingPayer,
                listingMode,
                startingBid,
              }), [photos, title, brand, category, size, condition, desc, price, originalPrice, tags, shippingMethod, shippingPayer, listingMode, startingBid])}
            />
          </View>

          {/* ── 4. PRODUCT DETAILS ── */}
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionHeading}>Details</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Title</Text>
              <TextInput
                style={styles.fieldInput}
                value={title}
                onChangeText={(t) => { setTitle(t); if (errors.title) setErrors((p) => ({ ...p, title: '' })); }}
                placeholder="e.g. Vintage Levi's 501 Denim Jacket"
                placeholderTextColor={Colors.textMuted}
                returnKeyType="next"
              />
              {errors.title ? <Text style={styles.fieldError}>{errors.title}</Text> : null}
              <View style={styles.hairline} />
            </View>

            <Pressable
              style={styles.pickerRow}
              onPress={() => setPickerMode('Category')}
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
            {errors.category ? <Text style={styles.fieldError}>{errors.category}</Text> : null}
            <View style={styles.hairline} />

            <Pressable
              style={styles.pickerRow}
              onPress={() => setPickerMode('Brand')}
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
              onPress={() => setPickerMode('Size')}
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
            {errors.size ? <Text style={styles.fieldError}>{errors.size}</Text> : null}
            <View style={styles.hairline} />

            <Pressable
              style={styles.pickerRow}
              onPress={() => setPickerMode('Condition')}
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
            {errors.condition ? <Text style={styles.fieldError}>{errors.condition}</Text> : null}
            <View style={styles.hairline} />
          </View>

          {/* ── 5. MODE-SPECIFIC PRICING ── */}
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionHeading}>Pricing</Text>

            {listingMode === 'sell_now' && (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Price</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={styles.currencySymbol}>{currencySymbol}</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                      value={price}
                      onChangeText={(t) => { handlePriceChange(t); setErrors((p) => ({ ...p, price: '' })); }}
                      maxLength={8}
                    />
                  </View>
                  {errors.price ? <Text style={styles.fieldError}>{errors.price}</Text> : null}

                  {/* Sold comparables hint — truthful pricing guidance from real data */}
                  {soldComps.hasComps && soldComps.minPrice != null && soldComps.maxPrice != null && (
                    <Pressable
                      style={styles.soldCompsHint}
                      onPress={() => {
                        if (!price && soldComps.medianPrice != null) {
                          handlePriceChange(soldComps.medianPrice.toFixed(2));
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Similar items sold for ${currencySymbol}${soldComps.minPrice.toFixed(0)} to ${currencySymbol}${soldComps.maxPrice.toFixed(0)}. Tap to set median price ${currencySymbol}${soldComps.medianPrice?.toFixed(0) ?? ''}.`}
                    >
                      <Ionicons name="pricetag-outline" size={13} color={Colors.textMuted} />
                      <Text style={styles.soldCompsText}>
                        Similar sold: {currencySymbol}{soldComps.minPrice.toFixed(0)}–{currencySymbol}{soldComps.maxPrice.toFixed(0)}
                        {' '}({soldComps.sampleSize} sold)
                      </Text>
                      {!price && soldComps.medianPrice != null && (
                        <Text style={styles.soldCompsAction}>Tap for median</Text>
                      )}
                    </Pressable>
                  )}

                  <View style={styles.hairline} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Original price (optional)</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={styles.currencySymbol}>{currencySymbol}</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                      value={originalPrice}
                      onChangeText={(t) => setOriginalPrice(sanitizeDecimalInput(t))}
                      maxLength={8}
                    />
                  </View>
                  {hasDiscount && (
                    <Text style={styles.discountPreview}>−{discountPercent}% off original</Text>
                  )}
                  <View style={styles.hairline} />
                </View>
              </>
            )}

            {listingMode === 'auction' && (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Starting bid</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={styles.currencySymbol}>{currencySymbol}</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                      value={startingBid}
                      onChangeText={(t) => { setStartingBid(sanitizeDecimalInput(t)); setErrors((p) => ({ ...p, startingBid: '' })); }}
                      maxLength={8}
                    />
                  </View>
                  {errors.startingBid ? <Text style={styles.fieldError}>{errors.startingBid}</Text> : null}
                  <View style={styles.hairline} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Reserve price (optional)</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={styles.currencySymbol}>{currencySymbol}</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                      value={reservePrice}
                      onChangeText={(t) => setReservePrice(sanitizeDecimalInput(t))}
                      maxLength={8}
                    />
                  </View>
                  <View style={styles.hairline} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Duration</Text>
                  <View style={styles.toggleRow}>
                    {AUCTION_DURATIONS.map((h) => {
                      const active = auctionDurationHours === h;
                      return (
                        <Pressable
                          key={h}
                          style={[styles.togglePill, active && styles.togglePillActive]}
                          onPress={() => setAuctionDurationHours(h)}
                          accessibilityRole="button"
                          accessibilityLabel={`Set duration to ${h} hours`}
                        >
                          <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                            {h < 72 ? `${h}h` : `${h / 24}d`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.hairline} />
                </View>
              </>
            )}

            {listingMode === 'co_own' && (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Total valuation</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={styles.currencySymbol}>{currencySymbol}</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                      value={price}
                      onChangeText={(t) => { handlePriceChange(t); setErrors((p) => ({ ...p, price: '' })); }}
                      maxLength={8}
                    />
                  </View>
                  {errors.price ? <Text style={styles.fieldError}>{errors.price}</Text> : null}
                  <View style={styles.hairline} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Share count</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="20"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="number-pad"
                    value={shareCountInput}
                    onChangeText={(t) => { handleShareCountChange(t); setErrors((p) => ({ ...p, shareCount: '' })); }}
                  />
                  <Text style={styles.fieldHelper}>Maximum 20 units per co-own</Text>
                  {errors.shareCount ? <Text style={styles.fieldError}>{errors.shareCount}</Text> : null}
                  <View style={styles.hairline} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Share price ({currency.currencyCode})</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={styles.currencySymbol}>{currencySymbol}</Text>
                    <TextInput
                      style={styles.priceInput}
                      placeholder="0.00"
                      placeholderTextColor={Colors.textMuted}
                      keyboardType="decimal-pad"
                      value={sharePriceInput}
                      onChangeText={(t) => { setSharePriceInput(sanitizeDecimalInput(t)); setErrors((p) => ({ ...p, sharePrice: '' })); }}
                      maxLength={8}
                    />
                  </View>
                  {errors.sharePrice ? <Text style={styles.fieldError}>{errors.sharePrice}</Text> : null}
                  {Number(price) > 0 && Number(shareCountInput) > 0 && (
                    <Text style={styles.fieldHelper}>
                      {currencySymbol}{(Number(price) / Number(shareCountInput)).toFixed(2)} per share
                    </Text>
                  )}
                  <View style={styles.hairline} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Offering window</Text>
                  <View style={styles.toggleRow}>
                    {[24, 48, 72, 168].map((h) => {
                      const active = offeringWindowHours === h;
                      return (
                        <Pressable
                          key={h}
                          style={[styles.togglePill, active && styles.togglePillActive]}
                          onPress={() => setOfferingWindowHours(h)}
                          accessibilityRole="button"
                          accessibilityLabel={`Set offering window to ${h} hours`}
                        >
                          <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                            {h < 72 ? `${h}h` : `${h / 24}d`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.hairline} />
                </View>
              </>
            )}
          </View>

          {/* ── 6. DESCRIPTION AND TAGS ── */}
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionHeading}>Description</Text>

            <View style={styles.fieldGroup}>
              <TextInput
                style={[styles.fieldInput, styles.fieldInputMultiline]}
                value={desc}
                onChangeText={(t) => { setDesc(t); setErrors((p) => ({ ...p, description: '' })); }}
                placeholder="Describe the fit, fabric, flaws, and why you love it…"
                placeholderTextColor={Colors.textMuted}
                multiline
                textAlignVertical="top"
              />
              <Text style={styles.fieldHelper}>{desc.length} characters</Text>
              {errors.description ? <Text style={styles.fieldError}>{errors.description}</Text> : null}
              <View style={styles.hairline} />
            </View>

            <Text style={styles.fieldLabel}>Tags</Text>
            <View style={styles.tagWrap}>
              {tags.map((t) => (
                <View key={t} style={styles.tagChip}>
                  <Text style={styles.tagText}>#{t}</Text>
                  <Pressable onPress={() => removeTag(t)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remove tag ${t}`}>
                    <Ionicons name="close" size={12} color={Colors.textMuted} />
                  </Pressable>
                </View>
              ))}
              <TextInput
                style={styles.tagInput}
                placeholder={tags.length === 0 ? 'vintage, denim, oversized…' : ''}
                placeholderTextColor={Colors.textMuted}
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={handleTagSubmit}
                blurOnSubmit={false}
                returnKeyType="done"
              />
            </View>
            <Text style={styles.fieldHelper}>Press space or comma to add. Up to 8 tags.</Text>
          </View>

          {/* ── 7. SHIPPING ── */}
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionHeading}>Shipping</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Shipping method</Text>
              <View style={styles.toggleRow}>
                {(['standard', 'express'] as const).map((m) => {
                  const active = shippingMethod === m;
                  return (
                    <Pressable
                      key={m}
                      style={[styles.togglePill, active && styles.togglePillActive]}
                      onPress={() => { setShippingMethod(m); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      accessibilityRole="button"
                      accessibilityLabel={`Set shipping method to ${m}`}
                    >
                      <Ionicons name={m === 'standard' ? 'cube-outline' : 'rocket-outline'} size={14} color={active ? Colors.textInverse : Colors.textMuted} style={{ marginRight: 6 }} />
                      <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                        {m === 'standard' ? 'Standard' : 'Express'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.hairline} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Who pays</Text>
              <View style={styles.toggleRow}>
                {(['buyer', 'seller'] as const).map((p) => {
                  const active = shippingPayer === p;
                  return (
                    <Pressable
                      key={p}
                      style={[styles.togglePill, active && styles.togglePillActive]}
                      onPress={() => { setShippingPayer(p); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      accessibilityRole="button"
                      accessibilityLabel={`Set shipping payer to ${p}`}
                    >
                      <Ionicons name={p === 'buyer' ? 'person-outline' : 'storefront-outline'} size={14} color={active ? Colors.textInverse : Colors.textMuted} style={{ marginRight: 6 }} />
                      <Text style={[styles.toggleText, active && styles.toggleTextActive]}>
                        {p === 'buyer' ? 'Buyer pays' : 'I pay (free)'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>

          {/* ── CO-OWN AUTHENTICATION MEDIA ── */}
          {listingMode === 'co_own' && (
            <View style={styles.sectionGroup}>
              <Text style={styles.sectionHeading}>Authentication photos</Text>
              <Text style={styles.fieldHelper}>Attach proof-of-authenticity photos for investor confidence.</Text>
              {errors.authPhotos ? <Text style={styles.fieldError}>{errors.authPhotos}</Text> : null}
              <View style={styles.authPhotoRow}>
                {authPhotos.map((uri, i) => (
                  <View key={`auth_${i}_${uri}`} style={styles.authThumb}>
                    <View style={styles.authThumbImage} />
                  </View>
                ))}
                {authPhotos.length < 2 && (
                  <Pressable
                    style={styles.authAddBtn}
                    onPress={handlePickFromLibrary}
                    accessibilityRole="button"
                    accessibilityLabel="Add authentication photo"
                  >
                    <Ionicons name="add" size={20} color={Colors.textMuted} />
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* ── error message (inline, above footer) ── */}
          {errorMsg && publicationStage === 'idle' && (
            <View style={styles.inlineErrorRow}>
              <Ionicons name="alert-circle" size={14} color={Colors.danger} />
              <Text style={styles.inlineErrorText}>{errorMsg}</Text>
            </View>
          )}

          <View style={{ height: DockConstants.singleActionHeight }} />
        </KeyboardAwareScrollView>

      {/* ── 9. RECOVERABLE PUBLICATION FEEDBACK + 10. STICKY PREVIEW / PUBLISH FOOTER ── */}
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

      {/* ── picker ── */}
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
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },

  /* ── nav header ── */
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
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
    letterSpacing: -0.2,
  },
  navDraftStatus: {
    minWidth: 40,
    alignItems: 'flex-end',
  },
  navDraftText: {
    fontSize: 11,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },

  /* ── scroll ── */
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Space.md,
  },

  /* ── sections ── */
  autofillCard: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    padding: Space.md,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${Colors.brand}20`,
  },
  autofillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  autofillTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  autofillDesc: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginBottom: Space.sm,
  },
  autofillChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: Space.sm,
  },
  autofillChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    minWidth: 80,
    maxWidth: 180,
  },
  autofillChipLabel: {
    fontSize: 10,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  autofillChipValue: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
    marginTop: 2,
  },
  autofillApplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: `${Colors.brand}10`,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  autofillApplyText: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },
  sectionSpacing: {
    paddingTop: Space.md,
  },
  sectionGroup: {
    paddingTop: Space.lg,
    paddingHorizontal: Space.md,
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: Typography.family.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Space.sm,
  },

  /* ── fields ── */
  fieldGroup: {
    paddingVertical: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  fieldInput: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    paddingVertical: 8,
    paddingHorizontal: 0,
    minHeight: 40,
  },
  fieldInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 8,
  },
  fieldHelper: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginTop: 4,
  },
  fieldError: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    marginTop: 4,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginTop: 8,
  },

  /* ── picker rows ── */
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  pickerRowInner: {
    flex: 1,
  },
  pickerValue: {
    fontSize: 15,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
  },
  pickerPlaceholder: {
    color: Colors.textMuted,
  },

  /* ── price input ── */
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  currencySymbol: {
    fontSize: 20,
    fontFamily: Typography.family.semibold,
    color: Colors.textMuted,
    marginRight: 6,
  },
  priceInput: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    minWidth: 100,
    padding: 0,
  },
  discountPreview: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
    marginTop: 4,
  },
  soldCompsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingVertical: 2,
  },
  soldCompsText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    flex: 1,
  },
  soldCompsAction: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.brand,
  },

  /* ── toggles ── */
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  togglePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  togglePillActive: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  toggleText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.textPrimary,
  },
  toggleTextActive: {
    fontFamily: Typography.family.bold,
    color: Colors.textInverse,
  },

  /* ── tags ── */
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: Colors.brand,
  },
  tagInput: {
    flex: 1,
    minWidth: 80,
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    paddingVertical: 6,
  },

  /* ── co-own auth photos ── */
  authPhotoRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  authThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  authThumbImage: {
    width: 56,
    height: 56,
  },
  authAddBtn: {
    width: 56,
    height: 56,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },

  /* ── inline error ── */
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Space.md,
    paddingVertical: 8,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: Colors.danger,
  },
});
