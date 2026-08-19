import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Dimensions,
  Image,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';

import { useAppTheme } from '../theme/ThemeContext';
import { Space, Radius, Type, FontFamily, DockConstants, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { AppInput } from '../components/ui/AppInput';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { CURRENCIES } from '../constants/currencies';
import { useStore } from '../store/useStore';
import { useSellerTrust } from '../platform/product';
import { useCurrencyPref } from '../hooks/useCurrencyPref';
import { useToast } from '../context/ToastContext';
import { sanitizeDecimalInput, sanitizeIntegerInput, calculatePlatformChargeGbp } from '../utils/currencyAuthoringFlows';
import { buildCreateCoOwnPrefillFromSell } from '../utils/syndicatePrefill';
import { haptics } from '../utils/haptics';
import { makeStableId } from '../utils/createStableId';
import { convertPickerAsset, validateMediaAssets, ListingMediaDraftItem } from '../utils/mediaUploadAsset';
import type { MediaUploadAsset } from '../utils/mediaUploadAsset';
import { uploadMedia } from '../services/mediaUpload';
import { MediaUploadQueue } from '../services/mediaUploadQueue';
import { createListingOnApi, createListingImageOnApi } from '../services/listingsApi';
import { ListingMediaStudio } from '../components/listing/ListingMediaStudio';
import { ListingModeSelector, ListingMode, getListingModeOptions, getListingModeFromLabel, getListingModeLabel } from '../components/listing/ListingModeSelector';
import { ListingPublishFooter } from '../components/listing/ListingPublishFooter';
import { useListingAutofill } from '../hooks/useListingAutofill';
import { useSoldComps } from '../hooks/useSoldComps';
import { useConnectivity } from '../hooks/useConnectivity';
import { useBackendData } from '../context/BackendDataContext';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import {
  evaluateListingCompleteness,
  type ListingFieldValues,
  type ListingFieldKey,
} from '../contracts/listingCategoryPolicy';

const { width: SCREEN_W } = Dimensions.get('window');

const CONDITION_OPTIONS = ['New with tags', 'Very good', 'Good', 'Satisfactory'];
const AUCTION_DURATIONS = [24, 48, 72, 168];

type PublishedMedia = {
  url: string;
  width?: number;
  height?: number;
};

function resolvePublishedMedia(
  draftItems: ListingMediaDraftItem[],
  queue: MediaUploadQueue,
): PublishedMedia[] {
  const queuedById = new Map(queue.getItems().map((item) => [item.id, item]));

  return draftItems.flatMap((item) => {
    const queued = queuedById.get(item.id);
    const url = queued?.publicUrl
      ?? item.publicUrl
      ?? (item.source === 'remote' ? item.uri : null);

    if (!url) {
      return [];
    }

    return [{
      url,
      width: queued?.asset.width ?? item.width,
      height: queued?.asset.height ?? item.height,
    }];
  });
}

export default function SellScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useAppTheme();

  // Theme-aware color overrides for the static styles. The static
  // StyleSheet contains only non-color properties; colors are applied
  // via this themed proxy so the screen is fully dark-mode compatible.
  const t = useMemo(() => ({
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
    tagChip: { backgroundColor: colors.surface, borderColor: colors.border },
    tagText: { color: colors.brand },
    tagInput: { color: colors.textPrimary },
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
    photoGuideTitle: { color: colors.textSecondary },
    photoGuideMin: { color: colors.textMuted },
    photoGuideTip: { color: colors.textMuted },
    autofillCard: { backgroundColor: colors.surface, borderColor: colors.border },
    autofillTitle: { color: colors.textPrimary },
    autofillChip: { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
    autofillChipLabel: { color: colors.textMuted },
    autofillChipValue: { color: colors.textPrimary },
    autofillApplyBtn: { borderColor: colors.border, backgroundColor: colors.background },
  }), [colors]);

  const sellDraft = useStore((s) => s.sellDraft);
  const updateSellDraft = useStore((s) => s.updateSellDraft);
  const clearSellDraft = useStore((s) => s.clearSellDraft);
  const currentUser = useStore((s) => s.currentUser);
  const { data: sellerTrust } = useSellerTrust(currentUser?.id);

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
  const [shippingSheetOpen, setShippingSheetOpen] = useState(false);

  // ── Transient "Saved" indicator ──
  // Per audit 04: "visible 'Saved' only briefly; never spam toasts on every
  // field." A subtle checkmark that appears for 1.5s after a draft save,
  // then fades. Not a permanent text label.
  const [draftSavedVisible, setDraftSavedVisible] = useState(false);
  const draftSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [listingMode, setListingMode] = useState<ListingMode>('sell_now');

  const [coOwnEnabled, setCoOwnEnabled] = useState(false);
  const [shareCountInput, setShareCountInput] = useState('');
  const [sharePriceInput, setSharePriceInput] = useState('');
  const [offeringWindowHours, setOfferingWindowHours] = useState(48);
  const [authPhotos, setAuthPhotos] = useState<string[]>([]);

  const [startingBid, setStartingBid] = useState('');
  const [reservePrice, setReservePrice] = useState('');
  const [auctionDurationHours, setAuctionDurationHours] = useState(48);

  const [pickerMode, setPickerMode] = useState<'Brand' | 'Size' | 'Condition' | 'Category' | 'Format' | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPublishing, setIsPublishing] = useState(false);
  // Ref guard prevents double-tap publish before state update propagates (§13).
  const isPublishingRef = useRef(false);
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
  const { isOffline } = useConnectivity();

  // AI autofill suggestions from first photo filename
  const autofillSuggestion = useListingAutofill(mediaDraftItems);
  const [autofillDismissed, setAutofillDismissed] = useState(false);
  const [photoGuideCollapsed, setPhotoGuideCollapsed] = useState(true);
  const [sellerTipsDismissed, setSellerTipsDismissed] = useState(false);

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

  /* -- draft sync on mount -- */
  useEffect(() => {
    if (sellDraft.mediaDraftItems && sellDraft.mediaDraftItems.length > 0) {
      setMediaDraftItems(sellDraft.mediaDraftItems);
      setPhotos(sellDraft.mediaDraftItems.map((m) => m.publicUrl || m.uri));
    } else if (sellDraft.photos) {
      setPhotos(sellDraft.photos);
      setMediaDraftItems(
        sellDraft.photos.map((uri) => ({
          id: makeStableId('draft'),
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

  /* -- persist draft on change -- */
  // Per audit 04: "save automatically; visible 'Saved' only briefly;
  // never spam toasts on every field." The draft persists on every change,
  // but the "Saved" indicator only flashes for 1.5s then fades — no toast.
  const isInitialMountRef = useRef(true);
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
    // Skip the transient flash on initial mount (draft restore) — only
    // show "Saved" when the user actually edits a field.
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      return;
    }
    setDraftSavedVisible(true);
    if (draftSavedTimerRef.current) clearTimeout(draftSavedTimerRef.current);
    draftSavedTimerRef.current = setTimeout(() => setDraftSavedVisible(false), 1500);
  }, [photos, mediaDraftItems, title, desc, price, originalPrice, brand, size, condition, category, tags, listingMode, shippingMethod, shippingPayer, startingBid, reservePrice, auctionDurationHours, coOwnEnabled, shareCountInput, sharePriceInput, offeringWindowHours, authPhotos, updateSellDraft]);

  // Cleanup the transient timer on unmount
  useEffect(() => {
    return () => {
      if (draftSavedTimerRef.current) clearTimeout(draftSavedTimerRef.current);
    };
  }, []);

  /* -- co-own bidirectional math -- */
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
    if (!soldComps.hasComps || !hasValidPrice) return null;
    if (soldComps.minPrice != null && numericPrice < soldComps.minPrice * 0.8) return 'below' as const;
    if (soldComps.maxPrice != null && numericPrice > soldComps.maxPrice * 1.2) return 'above' as const;
    return 'in_range' as const;
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
      shippingPayer: shippingPayer || null,
    };
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
    shippingPayer: 'shipping payer',
  };

  const completenessLabel = completeness.canActivate
    ? 'Ready to publish'
    : `Missing: ${completeness.missingRequired.map((f) => fieldLabelMap[f]).join(', ')}`;

  const recommendedLabel = completeness.missingRecommended.length > 0
    ? `Suggested: ${completeness.missingRecommended.map((f) => fieldLabelMap[f]).join(', ')}`
    : null;

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
        status: 'draft',
      };
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
        quality: 0.9,
      });
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
          durationMs: m.durationMs,
        }));
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
        quality: 0.9,
      });
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
          durationMs: m.durationMs,
        }));
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
    const sanitized = sanitizeIntegerInput(value);
    if (!sanitized) { setShareCountInput(''); return; }
    const parsed = Math.floor(Number(sanitized));
    if (!Number.isFinite(parsed) || parsed <= 0) { setShareCountInput('1'); return; }
    setShareCountInput(String(Math.min(20, parsed)));
  }, []);

  /* -- publish -- */
  const handlePublish = useCallback(async () => {
    const trimmedTitle = title.trim();
    const trimmedDescription = desc.trim();
    const numericPrice = Number(sanitizeDecimalInput(price));
    const nextErrors: Record<string, string> = {};

    // Category-aware validation: use the completeness result's missing
    // required fields instead of universal brand/size assumptions.
    // Brandless vintage and sizeless home goods are valid when the policy
    // says so.
    for (const field of completeness.missingRequired) {
      switch (field) {
        case 'title': nextErrors.title = 'Add a title.'; break;
        case 'category': nextErrors.category = 'Select a category.'; break;
        case 'size': nextErrors.size = 'Choose a size.'; break;
        case 'condition': nextErrors.condition = 'Choose a condition.'; break;
        case 'images': nextErrors.photos = 'Add at least one photo before publishing.'; break;
        case 'description':
          if (!trimmedDescription || trimmedDescription.length < 10)
            nextErrors.description = 'Add a description with at least 10 characters.';
          break;
        case 'price':
          if (!Number.isFinite(numericPrice) || numericPrice <= 0)
            nextErrors.price = 'Enter a valid price greater than 0.';
          break;
        default: break;
      }
    }

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
      setErrorMsg('Fix the errors above before publishing.');
      haptics.error();
      return;
    }

    setErrors({});

    // Performance mark: listing creation flow start (validation passed).
    performance.mark('listing:create:start');

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
              width: m.width,
              height: m.height,
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
        const uploadedMedia = resolvePublishedMedia(mediaDraftItems, queue);
        const uploadedUrls = uploadedMedia.map((item) => item.url);
        const verifiedQueueItems = queue.getItems();
        const coverUpload = verifiedQueueItems.find(
          (item) => item.state === 'uploaded'
            && item.asset.kind === 'image'
            && item.publicUrl
            && item.finalizationId,
        );
        if (!coverUpload) {
          throw new Error('A verified cover image is required before creating an auction.');
        }
        const coverImage = coverUpload.publicUrl!;
        const listingId = makeStableId('listing');
        await createListingOnApi({
          id: listingId,
          sellerId: currentUser.id,
          title: trimmedTitle,
          description: trimmedDescription,
          priceGbp: numericPrice,
          imageUrl: coverImage,
          coverFinalizationId: coverUpload.finalizationId!,
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
          const verifiedUpload = verifiedQueueItems.find(
            (item) => item.publicUrl === uploadedUrls[i] && item.finalizationId,
          );
          if (!verifiedUpload) {
            throw new Error('Every auction media item must be verified before attachment.');
          }
          await createListingImageOnApi({
            id: `${listingId}_img_${i}`,
            listingId,
            imageUrl: uploadedUrls[i],
            sortOrder: i,
            mediaWidth: uploadedMedia[i]?.width,
            mediaHeight: uploadedMedia[i]?.height,
            finalizationId: verifiedUpload.finalizationId!,
          });
        }
        clearSellDraft();
        setMediaDraftItems([]);
        queue.reset();
        haptics.success();
        // Performance mark: listing creation complete (auction path).
        performance.mark('listing:create:complete');
        navigation.replace('CreateAuction', { listingId });
      } catch (e: unknown) {
        const msg = typeof e === 'object' && e && 'message' in e && typeof (e as Error).message === 'string' ? (e as Error).message : 'Failed to prepare auction. Try again.';
        setErrorMsg(msg);
        haptics.error();
      } finally {
        isPublishingRef.current = false;
        setIsPublishing(false);
      }
      return;
    }

    if (!currentUser?.id) {
      setErrorMsg('Sign in to publish a listing.');
      haptics.error();
      return;
    }

    if (isPublishing || isPublishingRef.current) return;
    isPublishingRef.current = true;
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
          width: m.width,
          height: m.height,
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

      const uploadedMedia = resolvePublishedMedia(mediaDraftItems, queue);
      const uploadedUrls = uploadedMedia.map((item) => item.url);
      const verifiedQueueItems = queue.getItems();
      const coverUpload = verifiedQueueItems.find(
        (item) => item.state === 'uploaded'
          && item.asset.kind === 'image'
          && item.publicUrl
          && item.finalizationId,
      );
      if (!coverUpload) {
        throw new Error('A verified cover image is required before publishing.');
      }
      const coverImage = coverUpload.publicUrl!;
      let listingId = publishedListingIdRef.current;

      if (!listingId) {
        setPublicationStage('creating_listing');
        listingId = makeStableId('listing');
        await createListingOnApi({
          id: listingId,
          sellerId: currentUser.id,
          title: trimmedTitle,
          description: trimmedDescription,
          priceGbp: numericPrice,
          imageUrl: coverImage,
          coverFinalizationId: coverUpload.finalizationId!,
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
        const verifiedUpload = verifiedQueueItems.find(
          (item) => item.publicUrl === uploadedUrls[i] && item.finalizationId,
        );
        if (!verifiedUpload) {
          throw new Error('Every listing media item must be verified before attachment.');
        }
        await createListingImageOnApi({
          id: `${listingId}_img_${i}`,
          listingId,
          imageUrl: uploadedUrls[i],
          sortOrder: i,
          mediaWidth: uploadedMedia[i]?.width,
          mediaHeight: uploadedMedia[i]?.height,
          finalizationId: verifiedUpload.finalizationId!,
        });
      }

      setPublicationStage('completed');
      clearSellDraft();
      setMediaDraftItems([]);
      queue.reset();
      publishedListingIdRef.current = null;
      haptics.success();
      // Performance mark: listing creation complete (standard path).
      performance.mark('listing:create:complete');
      navigation.replace('ListingSuccess', {
        listingId,
        title: trimmedTitle,
        price: numericPrice,
        categoryId: category,
        photoUri: coverImage,
      });
    } catch (e: unknown) {
      const isNetworkError = isOffline || (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === 'NETWORK_ERROR');
      const rawMsg = typeof e === 'object' && e && 'message' in e && typeof (e as Error).message === 'string' ? (e as Error).message : 'Failed to publish. Try again.';
      const msg = isNetworkError ? 'You appear to be offline. Check your connection and try again.' : rawMsg;
      const hasListing = !!publishedListingIdRef.current;
      const hasMedia = mediaDraftItems.some((m) => m.status === 'uploaded');
      setPublicationStage('failed_recoverable');
      setErrorMsg(hasListing ? `${msg} -- your listing was created. Tap Publish to retry attaching media.` : hasMedia ? `${msg} -- some media uploaded. Tap Publish to retry.` : msg);
      haptics.error();
    } finally {
      isPublishingRef.current = false;
      setIsPublishing(false);
    }
  }, [isPublishing, listingMode, photos, mediaDraftItems, title, desc, price, startingBid, category, size, condition, shareCountInput, sharePriceInput, offeringWindowHours, authPhotos, clearSellDraft, navigation, currentUser, brand, originalPrice, shippingMethod, shippingPayer, isOffline, completeness]);

  /* -- picker helpers -- */
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
      case 'Format':
        return getListingModeOptions();
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
        shippingPayer: shippingPayer || undefined,
      },
      origin: 'sell',
    });
  }, [title, price, originalPrice, brand, condition, category, size, desc, photos, shippingMethod, shippingPayer, navigation]);

  return (
    <SafeAreaView style={[styles.root, t.root]} edges={['top']}>
        {/* -- 1. COMPACT NAVIGATION HEADER -- */}
        <View style={[styles.navHeader, t.navHeader, { paddingTop: 0 }]}>
          <Pressable
            style={({ pressed }) => [styles.navCloseBtn, pressed && { opacity: 0.5 }]}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Close and go back"
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.navTitle, t.navTitle]}>Sell</Text>
          {/* Transient "Saved" indicator — per audit 04: "visible 'Saved'
              only briefly; never spam toasts on every field." A subtle
              checkmark that fades after 1.5s. Not a permanent label. */}
          <View style={styles.navDraftStatus}>
            {draftSavedVisible ? (
              <View style={styles.navDraftSavedRow}>
                <Ionicons name="checkmark" size={12} color={colors.success} />
                <Text style={[styles.navDraftText, { color: colors.success }]}>Saved</Text>
              </View>
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
              <Ionicons name="document-text-outline" size={14} color={colors.brand} />
              <Text style={[styles.draftHintText, { color: colors.textSecondary }]}>
                Draft restored — pick up where you left off
              </Text>
            </View>
          )}

          {/* -- 1b. QUICK ACTIONS ROW -- */}
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
                <Ionicons name="layers-outline" size={20} color={colors.brand} />
                <Text style={[styles.sellQuickActionLabel, { color: colors.textSecondary }]}>Bulk list</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.sellQuickAction, pressed && { opacity: 0.6 }]}
                onPress={() => { haptics.tap(); navigation.navigate('InventoryManagement'); }}
                accessibilityRole="button"
                accessibilityLabel="Inventory dashboard"
                accessibilityHint="Opens the inventory management screen"
              >
                <Ionicons name="grid-outline" size={20} color={colors.brand} />
                <Text style={[styles.sellQuickActionLabel, { color: colors.textSecondary }]}>Inventory</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.sellQuickAction, pressed && { opacity: 0.6 }]}
                onPress={() => { haptics.tap(); navigation.navigate('SellerHub'); }}
                accessibilityRole="button"
                accessibilityLabel="Seller hub"
                accessibilityHint="Opens the seller hub dashboard"
              >
                <Ionicons name="storefront-outline" size={20} color={colors.brand} />
                <Text style={[styles.sellQuickActionLabel, { color: colors.textSecondary }]}>Hub</Text>
              </Pressable>
            </View>
          )}

          {/* -- 1c. NEW SELLER TIPS -- */}
          {/* Per research: new seller tips/guidance if first-time seller.
              Dismissible, only shows when isNewSeller and not dismissed.
              Flat inline — no card chrome (§4 surface budget). */}
          {isNewSeller && !sellerTipsDismissed && !hasDraftContent && (
            <View style={styles.sellerTipsSection}>
              <View style={styles.sellerTipsHeader}>
                <Ionicons name="bulb-outline" size={15} color={colors.brand} />
                <Text style={[styles.sellerTipsTitle, { color: colors.textPrimary }]}>
                  Selling tips
                </Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => setSellerTipsDismissed(true)}
                  style={({ pressed }) => pressed && { opacity: 0.5 }}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss selling tips"
                >
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
              <View style={styles.sellerTipsBody}>
                <View style={styles.sellerTipRow}>
                  <Ionicons name="camera-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.sellerTipText, { color: colors.textSecondary }]}>
                    Use natural light and capture all angles
                  </Text>
                </View>
                <View style={styles.sellerTipRow}>
                  <Ionicons name="pricetag-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.sellerTipText, { color: colors.textSecondary }]}>
                    Price using recent sold comparables
                  </Text>
                </View>
                <View style={styles.sellerTipRow}>
                  <Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} />
                  <Text style={[styles.sellerTipText, { color: colors.textSecondary }]}>
                    Respond quickly to buyer questions
                  </Text>
                </View>
              </View>
            </View>
          )}
          {/* -- 2. LARGE LISTING MEDIA STUDIO -- */}
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

          {/* -- 2a. CONTEXTUAL PHOTO COUNT HINT -- */}
          {/* Not a quality score — a specific, actionable check next to the
              media it relates to. Resolves when the user adds enough photos. */}
          {mediaDraftItems.length < 3 && (
            <View style={styles.contextualHintRow}>
              <Ionicons name="camera-outline" size={14} color={colors.brand} />
              <Text style={[styles.contextualHintText, { color: colors.textSecondary }]}>
                {mediaDraftItems.length === 0
                  ? 'Add at least 1 photo to publish'
                  : `Add ${3 - mediaDraftItems.length} more photo${3 - mediaDraftItems.length > 1 ? 's' : ''} for more views`}
              </Text>
            </View>
          )}

          {/* -- 2a. PHOTO UPLOAD GUIDANCE (contextual, collapsible) -- */}
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

          {/* -- 2a-2. CONTEXTUAL AUTHENTICITY PROMPTS -- */}
          {/* Per audit 04 P1: "Contextual authenticity prompts by category/value."
              Per audit 04 media authenticity: prompts appear contextually based on
              the current listing state, not as a permanent instructional card.
              - After first image: "Add the back"
              - After category known: "Show the size label"
              - For luxury brands: "Add serial / stitching / receipt evidence"
              - If condition has flaws: "Add a close-up of the flaw"
              Only shows when relevant and dismissible. */}
          {(() => {
            const LUXURY_BRANDS = ['Gucci', 'Prada', 'Louis Vuitton', 'Chanel', 'Hermès', 'Dior', 'Balenciaga', 'Bottega Veneta', 'Saint Laurent', 'Burberry', 'Versace'];
            const isLuxury = LUXURY_BRANDS.some((b) => brand.toLowerCase() === b.toLowerCase());
            const hasFlaws = condition === 'Good' || condition === 'Satisfactory';
            const photoCount = mediaDraftItems.length;

            const prompts: { icon: React.ComponentProps<typeof Ionicons>['name']; text: string }[] = [];

            // After first image: suggest adding the back
            if (photoCount === 1) {
              prompts.push({ icon: 'camera-outline', text: 'Add a photo of the back' });
            }
            // After 2 photos: suggest the side/detail
            if (photoCount === 2) {
              prompts.push({ icon: 'camera-outline', text: 'Add a side or detail shot' });
            }
            // After category known: show the size label
            if (category && photoCount > 0 && photoCount < 5) {
              prompts.push({ icon: 'pricetag-outline', text: 'Show the size label' });
            }
            // Luxury brand: add authentication evidence
            if (isLuxury && photoCount > 0) {
              prompts.push({ icon: 'shield-checkmark-outline', text: 'Add serial, stitching, or receipt evidence' });
            }
            // Condition with flaws: add close-up
            if (hasFlaws && photoCount > 0) {
              prompts.push({ icon: 'warning-outline', text: 'Add a close-up of any flaws' });
            }

            if (prompts.length === 0) return null;

            // Show at most 2 prompts — contextual, not overwhelming
            const visible = prompts.slice(0, 2);

            return (
              <View style={styles.contextualPrompts}>
                {visible.map((prompt, i) => (
                  <View key={i} style={styles.contextualPromptRow}>
                    <Ionicons name={prompt.icon} size={14} color={colors.brand} />
                    <Text style={[styles.contextualPromptText, { color: colors.textSecondary }]}>
                      {prompt.text}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })()}

          {/* -- 2c. TITLE FIELD (first identity field, in first viewport) -- */}
          {/* Per spec: first viewport shows close, Sell title, media studio,
              first identity fields (title). Placed immediately after media
              so the user can start describing their item right away. */}
          <View style={styles.sectionGroup}>
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
                style={[styles.fieldInput, t.fieldInput]}
                value={title}
                onChangeText={(t) => { setTitle(t); if (errors.title) setErrors((p) => ({ ...p, title: '' })); }}
                placeholder="e.g. Vintage Levi's 501 Denim Jacket"
                placeholderTextColor={colors.textMuted}
                returnKeyType="next"
              />
              {errors.title ? <Text style={[styles.fieldError, t.fieldError]}>{errors.title}</Text> : null}
              {title.trim().length > 0 && title.trim().length < 10 && (
                <Text style={[styles.fieldHelper, t.fieldHelper]}>Add more detail to help buyers find this item</Text>
              )}
              <View style={[styles.hairline, t.hairline]} />
            </View>
          </View>

          {/* -- 2d. SUGGESTED DETAILS (neutral, from photo filename) -- */}
          {autofillSuggestion.hasSuggestions && !autofillDismissed && (
            <View style={[styles.autofillCard, t.autofillCard]}>
              <View style={styles.autofillHeader}>
                <Ionicons name="image-outline" size={16} color={colors.textSecondary} />
                <Text style={[styles.autofillTitle, t.autofillTitle]}>Suggested details</Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => setAutofillDismissed(true)}
                  style={({ pressed }) => pressed && { opacity: 0.5 }}
                  accessibilityLabel="Dismiss suggestions"
                  accessibilityRole="button"
                >
                  <Ionicons name="close" size={16} color={colors.textMuted} />
                </Pressable>
              </View>
              <Text style={[styles.autofillDesc, t.autofillDesc]}>
                Suggested from file name.
              </Text>
              {/* Flattened rows — no nested bordered chips (AGENTS.md §4: no card-on-card) */}
              {autofillSuggestion.title && (
                <View style={styles.autofillRow}>
                  <Text style={[styles.autofillRowLabel, t.autofillChipLabel]}>Title</Text>
                  <Text style={[styles.autofillRowValue, t.autofillChipValue]} numberOfLines={1}>{autofillSuggestion.title}</Text>
                </View>
              )}
              {autofillSuggestion.brand && (
                <View style={styles.autofillRow}>
                  <Text style={[styles.autofillRowLabel, t.autofillChipLabel]}>Brand</Text>
                  <Text style={[styles.autofillRowValue, t.autofillChipValue]} numberOfLines={1}>{autofillSuggestion.brand}</Text>
                </View>
              )}
              {autofillSuggestion.category && (
                <View style={styles.autofillRow}>
                  <Text style={[styles.autofillRowLabel, t.autofillChipLabel]}>Category</Text>
                  <Text style={[styles.autofillRowValue, t.autofillChipValue]} numberOfLines={1}>{autofillSuggestion.category}</Text>
                </View>
              )}
              <Pressable
                style={({ pressed }) => [styles.autofillApplyBtn, t.autofillApplyBtn, pressed && { opacity: 0.6 }]}
                onPress={handleApplyAutofill}
                accessibilityLabel="Apply suggested fields"
                accessibilityRole="button"
              >
                <Ionicons name="checkmark" size={16} color={colors.textPrimary} />
                <Text style={[styles.autofillApplyText, t.autofillApplyText]}>Apply to empty fields</Text>
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

          {/* -- 4. PRODUCT DETAILS -- */}
          <View style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, t.sectionHeading]}>Details</Text>

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => setPickerMode('Category')}
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
            {errors.category ? <Text style={[styles.fieldError, t.fieldError]}>{errors.category}</Text> : null}
            <View style={[styles.hairline, t.hairline]} />

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => setPickerMode('Brand')}
              accessibilityRole="button"
              accessibilityLabel="Select brand"
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, t.fieldLabel]}>Brand</Text>
                  {brand ? (
                    <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  ) : completeness.policy.brandlessValid ? (
                    <Text style={[styles.fieldRequiredHint, t.fieldRequiredHint]}>Optional</Text>
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
            {!brand && (
              <Text style={[styles.fieldHelper, t.fieldHelper]}>
                {completeness.policy.brandlessValid
                  ? 'Add brand for better search discoverability'
                  : 'Brand is required for this category'}
              </Text>
            )}
            <View style={[styles.hairline, t.hairline]} />

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => setPickerMode('Size')}
              accessibilityRole="button"
              accessibilityLabel="Select size"
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, t.fieldLabel]}>Size</Text>
                  {size ? (
                    <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                  ) : completeness.policy.sizelessValid ? (
                    <Text style={[styles.fieldRequiredHint, t.fieldRequiredHint]}>Optional</Text>
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
            {errors.size ? <Text style={[styles.fieldError, t.fieldError]}>{errors.size}</Text> : null}
            <View style={[styles.hairline, t.hairline]} />

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}
              onPress={() => setPickerMode('Condition')}
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
            {errors.condition ? <Text style={[styles.fieldError, t.fieldError]}>{errors.condition}</Text> : null}
            <View style={[styles.hairline, t.hairline]} />
          </View>

          {/* -- 5. MODE-SPECIFIC PRICING -- */}
          <View style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, t.sectionHeading]}>Pricing</Text>

            {listingMode === 'sell_now' && (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, t.fieldLabel]}>Price</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={[styles.currencySymbol, t.currencySymbol]}>{currencySymbol}</Text>
                    <TextInput
                      style={[styles.priceInput, t.priceInput]}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      value={price}
                      onChangeText={(t) => { handlePriceChange(t); setErrors((p) => ({ ...p, price: '' })); }}
                      maxLength={8}
                    />
                  </View>
                  {errors.price ? <Text style={[styles.fieldError, t.fieldError]}>{errors.price}</Text> : null}

                  {/* Sold comparables hint -- truthful pricing guidance from real data */}
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
                          <Ionicons name="bulb-outline" size={13} color={colors.brand} />
                          <Text style={[styles.soldCompsText, t.priceSuggestion]}>
                            Suggested price: {currencySymbol}{soldComps.medianPrice.toFixed(0)}
                          </Text>
                          {!price && (
                            <Text style={[styles.soldCompsAction, t.soldCompsAction]}>Tap to set</Text>
                          )}
                        </Pressable>
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
                        <Ionicons name="wallet-outline" size={14} color={colors.textSecondary} />
                        <Text style={[styles.proceedsLabel, t.fieldHelper]}>
                          You receive
                        </Text>
                      </View>
                      <View style={styles.proceedsRight}>
                        <Text style={[styles.proceedsAmount, { color: colors.success }]}>
                          {currencySymbol}{(numericPrice - calculatePlatformChargeGbp(numericPrice)).toFixed(2)}
                        </Text>
                        <Text style={[styles.proceedsFeeHint, t.fieldHelper]}>
                          after {currencySymbol}{calculatePlatformChargeGbp(numericPrice).toFixed(2)} fee
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={[styles.hairline, t.hairline]} />
                  <View style={styles.priceInputRow}>
                    <Text style={[styles.currencySymbol, t.currencySymbol]}>{currencySymbol}</Text>
                    <TextInput
                      style={[styles.priceInput, t.priceInput]}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      value={originalPrice}
                      onChangeText={(t) => setOriginalPrice(sanitizeDecimalInput(t))}
                      maxLength={8}
                    />
                  </View>
                  {hasDiscount && (
                    <Text style={[styles.discountPreview, t.discountPreview]}>-{discountPercent}% off original</Text>
                  )}
                  {!originalPrice && hasValidPrice && (
                    <Text style={[styles.fieldHelper, t.fieldHelper]}>Add original price to show value</Text>
                  )}
                  <View style={[styles.hairline, t.hairline]} />
                </View>
              </>
            )}

            {listingMode === 'auction' && (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, t.fieldLabel]}>Starting bid</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={[styles.currencySymbol, t.currencySymbol]}>{currencySymbol}</Text>
                    <TextInput
                      style={[styles.priceInput, t.priceInput]}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      value={startingBid}
                      onChangeText={(t) => { setStartingBid(sanitizeDecimalInput(t)); setErrors((p) => ({ ...p, startingBid: '' })); }}
                      maxLength={8}
                    />
                  </View>
                  {errors.startingBid ? <Text style={[styles.fieldError, t.fieldError]}>{errors.startingBid}</Text> : null}

                  {/* ── Seller proceeds estimate (auction) ──
                      Per audit 04 P1: "Add seller-proceeds preview beside price."
                      For auctions, shows the minimum proceeds from the starting
                      bid so sellers understand their floor payout. */}
                  {hasValidStartingBid && numericStartingBid > 0 && (
                    <View style={styles.proceedsRow}>
                      <View style={styles.proceedsLeft}>
                        <Ionicons name="wallet-outline" size={14} color={colors.textSecondary} />
                        <Text style={[styles.proceedsLabel, t.fieldHelper]}>
                          You receive (from starting bid)
                        </Text>
                      </View>
                      <View style={styles.proceedsRight}>
                        <Text style={[styles.proceedsAmount, { color: colors.success }]}>
                          {currencySymbol}{(numericStartingBid - calculatePlatformChargeGbp(numericStartingBid)).toFixed(2)}
                        </Text>
                        <Text style={[styles.proceedsFeeHint, t.fieldHelper]}>
                          after {currencySymbol}{calculatePlatformChargeGbp(numericStartingBid).toFixed(2)} fee
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={[styles.hairline, t.hairline]} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, t.fieldLabel]}>Reserve price (optional)</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={[styles.currencySymbol, t.currencySymbol]}>{currencySymbol}</Text>
                    <TextInput
                      style={[styles.priceInput, t.priceInput]}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      value={reservePrice}
                      onChangeText={(t) => setReservePrice(sanitizeDecimalInput(t))}
                      maxLength={8}
                    />
                  </View>
                  <View style={[styles.hairline, t.hairline]} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, t.fieldLabel]}>Duration</Text>
                  <View style={styles.toggleRow}>
                    {AUCTION_DURATIONS.map((h) => {
                      const active = auctionDurationHours === h;
                      return (
                        <Pressable
                          key={h}
                          style={({ pressed }) => [styles.togglePill, t.togglePill, active && styles.togglePillActive, active && t.togglePillActive, pressed && { opacity: 0.7 }]}
                          onPress={() => setAuctionDurationHours(h)}
                          accessibilityRole="button"
                          accessibilityLabel={`Set duration to ${h} hours`}
                        >
                          <Text style={[styles.toggleText, t.toggleText, active && styles.toggleTextActive, active && t.toggleTextActive]}>
                            {h < 72 ? `${h}h` : `${h / 24}d`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={[styles.hairline, t.hairline]} />
                </View>
              </>
            )}

            {listingMode === 'co_own' && (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, t.fieldLabel]}>Total valuation</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={[styles.currencySymbol, t.currencySymbol]}>{currencySymbol}</Text>
                    <TextInput
                      style={[styles.priceInput, t.priceInput]}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      value={price}
                      onChangeText={(t) => { handlePriceChange(t); setErrors((p) => ({ ...p, price: '' })); }}
                      maxLength={8}
                    />
                  </View>
                  {errors.price ? <Text style={[styles.fieldError, t.fieldError]}>{errors.price}</Text> : null}
                  <View style={[styles.hairline, t.hairline]} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, t.fieldLabel]}>Share count</Text>
                  <TextInput
                    style={[styles.fieldInput, t.fieldInput]}
                    placeholder="20"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    value={shareCountInput}
                    onChangeText={(t) => { handleShareCountChange(t); setErrors((p) => ({ ...p, shareCount: '' })); }}
                  />
                  <Text style={[styles.fieldHelper, t.fieldHelper]}>Maximum 20 units per co-own</Text>
                  {errors.shareCount ? <Text style={[styles.fieldError, t.fieldError]}>{errors.shareCount}</Text> : null}
                  <View style={[styles.hairline, t.hairline]} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, t.fieldLabel]}>Share price ({currency.currencyCode})</Text>
                  <View style={styles.priceInputRow}>
                    <Text style={[styles.currencySymbol, t.currencySymbol]}>{currencySymbol}</Text>
                    <TextInput
                      style={[styles.priceInput, t.priceInput]}
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="decimal-pad"
                      value={sharePriceInput}
                      onChangeText={(t) => { setSharePriceInput(sanitizeDecimalInput(t)); setErrors((p) => ({ ...p, sharePrice: '' })); }}
                      maxLength={8}
                    />
                  </View>
                  {errors.sharePrice ? <Text style={[styles.fieldError, t.fieldError]}>{errors.sharePrice}</Text> : null}
                  {Number(price) > 0 && Number(shareCountInput) > 0 && (
                    <Text style={[styles.fieldHelper, t.fieldHelper]}>
                      {currencySymbol}{(Number(price) / Number(shareCountInput)).toFixed(2)} per share
                    </Text>
                  )}
                  <View style={[styles.hairline, t.hairline]} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, t.fieldLabel]}>Offering window</Text>
                  <View style={styles.toggleRow}>
                    {[24, 48, 72, 168].map((h) => {
                      const active = offeringWindowHours === h;
                      return (
                        <Pressable
                          key={h}
                          style={({ pressed }) => [styles.togglePill, t.togglePill, active && styles.togglePillActive, active && t.togglePillActive, pressed && { opacity: 0.7 }]}
                          onPress={() => setOfferingWindowHours(h)}
                          accessibilityRole="button"
                          accessibilityLabel={`Set offering window to ${h} hours`}
                        >
                          <Text style={[styles.toggleText, t.toggleText, active && styles.toggleTextActive, active && t.toggleTextActive]}>
                            {h < 72 ? `${h}h` : `${h / 24}d`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={[styles.hairline, t.hairline]} />
                </View>
              </>
            )}
          </View>

          {/* -- 6. DESCRIPTION AND TAGS -- */}
          <View style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, t.sectionHeading]}>Description</Text>

            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, t.fieldLabel]}>Description</Text>
                {desc.trim().length >= 10 ? (
                  <Ionicons name="checkmark-circle" size={13} color={colors.success} />
                ) : (
                  <Text style={[styles.fieldRequiredHint, t.fieldRequiredHint]}>Required</Text>
                )}
              </View>
              <TextInput
                style={[styles.fieldInput, t.fieldInput, styles.fieldInputMultiline]}
                value={desc}
                onChangeText={(t) => { setDesc(t); setErrors((p) => ({ ...p, description: '' })); }}
                placeholder="Describe the fit, fabric, flaws, and why you love it..."
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
              />
              <Text style={[styles.fieldHelper, desc.trim().length < 10 ? t.charCountWarn : t.fieldHelper]}>
                {desc.length} characters{desc.trim().length < 10 ? ' · min 10' : desc.length < 60 ? ' · add more detail' : ''}
              </Text>
              {errors.description ? <Text style={[styles.fieldError, t.fieldError]}>{errors.description}</Text> : null}
              <View style={[styles.hairline, t.hairline]} />
            </View>

            <Text style={[styles.fieldLabel, t.fieldLabel]}>Tags</Text>
            <View style={styles.tagWrap}>
              {tags.map((tag) => (
                <View key={tag} style={[styles.tagChip, t.tagChip]}>
                  <Text style={[styles.tagText, t.tagText]}>#{tag}</Text>
                  <Pressable onPress={() => removeTag(tag)} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.5 }} accessibilityRole="button" accessibilityLabel={`Remove tag ${tag}`}>
                    <Ionicons name="close" size={12} color={colors.textMuted} />
                  </Pressable>
                </View>
              ))}
              <TextInput
                style={[styles.tagInput, t.tagInput]}
                placeholder={tags.length === 0 ? 'vintage, denim, oversized...' : ''}
                placeholderTextColor={colors.textMuted}
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={handleTagSubmit}
                blurOnSubmit={false}
                returnKeyType="done"
              />
            </View>
            <Text style={[styles.fieldHelper, t.fieldHelper]}>Press space or comma to add. Up to 8 tags.</Text>
            {tags.length > 0 && tags.length < 3 && (
              <Text style={[styles.fieldHelper, t.fieldHelper]}>Add {3 - tags.length} more tag{3 - tags.length > 1 ? 's' : ''} to improve discovery</Text>
            )}
          </View>

          {/* -- 7. SHIPPING -- */}
          <View style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, t.sectionHeading]}>Shipping</Text>
            {!shippingMethod && (
              <View style={styles.contextualHintRow}>
                <Ionicons name="cube-outline" size={14} color={colors.brand} />
                <Text style={[styles.contextualHintText, { color: colors.textSecondary }]}>
                  Set a shipping method so buyers know how it'll arrive
                </Text>
              </View>
            )}
            {shippingMethod && !shippingPayer && (
              <View style={styles.contextualHintRow}>
                <Ionicons name="card-outline" size={14} color={colors.brand} />
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
                  {shippingMethod && shippingPayer
                    ? `${shippingMethod === 'standard' ? 'Standard' : 'Express'} · ${shippingPayer === 'buyer' ? 'Buyer pays' : 'Free shipping'}`
                    : 'Choose shipping & payment'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* -- SHIPPING BOTTOM SHEET -- */}
          <Modal
            visible={shippingSheetOpen}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setShippingSheetOpen(false)}
          >
            <Pressable style={[styles.shippingSheetBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setShippingSheetOpen(false)} accessibilityRole="button" accessibilityLabel="Close shipping options">
              <Pressable
                style={[styles.shippingSheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + Space.md }]}
                onPress={(e) => { e.stopPropagation(); }}
              accessibilityRole="button"
              >
                {/* Header */}
                <View style={styles.shippingSheetHeader}>
                  <View style={[styles.shippingSheetHandle, { backgroundColor: colors.border }]} />
                  <View style={styles.shippingSheetTitleRow}>
                    <Text style={[styles.shippingSheetTitle, { color: colors.textPrimary }]}>Delivery</Text>
                    <Pressable
                      hitSlop={Control.hit}
                      onPress={() => { setShippingSheetOpen(false); haptics.tap(); }}
                      accessibilityRole="button"
                      accessibilityLabel="Close delivery options"
                    >
                      <Ionicons name="close" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>
                </View>

                {/* Shipping method section */}
                <Text style={[styles.shippingSheetSectionLabel, { color: colors.textMuted }]}>Shipping method</Text>
                {(['standard', 'express'] as const).map((m) => {
                  const active = shippingMethod === m;
                  return (
                    <Pressable
                      key={m}
                      style={({ pressed }) => [styles.shippingSheetRow, { borderBottomColor: colors.border }, pressed && { opacity: 0.6 }]}
                      onPress={() => { setShippingMethod(m); haptics.selection(); }}
                      accessibilityRole="button"
                      accessibilityLabel={`Set shipping method to ${m}`}
                      accessibilityState={{ selected: active }}
                    >
                      <Ionicons name={m === 'standard' ? 'cube-outline' : 'rocket-outline'} size={20} color={colors.textPrimary} style={{ marginRight: Space.md }} />
                      <Text style={[styles.shippingSheetRowLabel, { color: colors.textPrimary }]}>
                        {m === 'standard' ? 'Standard' : 'Express'}
                      </Text>
                      <View style={[styles.shippingSheetRadioOuter, { borderColor: active ? colors.brand : colors.border }]}>
                        {active && <View style={[styles.shippingSheetRadioInner, { backgroundColor: colors.brand }]} />}
                      </View>
                    </Pressable>
                  );
                })}

                {/* Who pays section */}
                <Text style={[styles.shippingSheetSectionLabel, { color: colors.textMuted, marginTop: Space.lg }]}>Who pays</Text>
                {(['buyer', 'seller'] as const).map((p) => {
                  const active = shippingPayer === p;
                  return (
                    <Pressable
                      key={p}
                      style={({ pressed }) => [styles.shippingSheetRow, { borderBottomColor: colors.border }, pressed && { opacity: 0.6 }]}
                      onPress={() => { setShippingPayer(p); haptics.selection(); }}
                      accessibilityRole="button"
                      accessibilityLabel={`Set shipping payer to ${p}`}
                      accessibilityState={{ selected: active }}
                    >
                      <Ionicons name={p === 'buyer' ? 'person-outline' : 'storefront-outline'} size={20} color={colors.textPrimary} style={{ marginRight: Space.md }} />
                      <Text style={[styles.shippingSheetRowLabel, { color: colors.textPrimary }]}>
                        {p === 'buyer' ? 'Buyer pays' : 'I pay (free)'}
                      </Text>
                      <View style={[styles.shippingSheetRadioOuter, { borderColor: active ? colors.brand : colors.border }]}>
                        {active && <View style={[styles.shippingSheetRadioInner, { backgroundColor: colors.brand }]} />}
                      </View>
                    </Pressable>
                  );
                })}
              </Pressable>
            </Pressable>
          </Modal>

          {/* -- CO-OWN AUTHENTICATION MEDIA -- */}
          {listingMode === 'co_own' && (
            <View style={styles.sectionGroup}>
              <Text style={[styles.sectionHeading, t.sectionHeading]}>Authentication photos</Text>
              <Text style={[styles.fieldHelper, t.fieldHelper]}>Attach proof-of-authenticity photos for investor confidence.</Text>
              {errors.authPhotos ? <Text style={[styles.fieldError, t.fieldError]}>{errors.authPhotos}</Text> : null}
              <View style={styles.authPhotoRow}>
                {authPhotos.map((uri, i) => (
                  <View key={`auth_${i}_${uri}`} style={[styles.authThumb, t.authThumb]}>
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
                      <Ionicons name="close-circle" size={18} color={colors.textPrimary} />
                    </Pressable>
                  </View>
                ))}
                {authPhotos.length < 2 && (
                  <Pressable
                    style={[styles.authAddBtn, t.authAddBtn]}
                    onPress={handlePickFromLibrary}
                    accessibilityRole="button"
                    accessibilityLabel="Add authentication photo"
                  >
                    <Ionicons name="add" size={20} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {/* -- error message (inline, above footer) -- */}
          {errorMsg && publicationStage === 'idle' && (
            <View style={styles.inlineErrorRow}>
              <Ionicons name="alert-circle" size={14} color={colors.danger} />
              <Text style={[styles.inlineErrorText, t.inlineErrorText]}>{errorMsg}</Text>
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
              size={15}
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
                size={15}
                color={colors.textSecondary}
              />
              <Text style={[styles.reviewSummaryText, { color: colors.textSecondary }]} numberOfLines={2}>
                {listingMode === 'auction'
                  ? `Auction · ${auctionDurationHours < 72 ? `${auctionDurationHours}h` : `${auctionDurationHours / 24}d`} · starts ${currencySymbol}${numericStartingBid.toFixed(0)}${reservePrice ? ` · reserve ${currencySymbol}${Number(sanitizeDecimalInput(reservePrice)).toFixed(0)}` : ''}`
                  : `Co-Own · ${parsedShareCount || 0} shares · ${currencySymbol}${parsedSharePrice.toFixed(2)}/share${authPhotos.length > 0 ? ' · auth verified' : ''}`
                }
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
    flex: 1,
  },

  /* -- nav header -- */
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  navCloseBtn: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.priceList.letterSpacing,
  },
  navDraftStatus: {
    minWidth: Space.xl + Space.sm,
    alignItems: 'flex-end',
  },
  navDraftSavedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2,
  },
  navDraftText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },

  /* -- scroll -- */
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Space.md,
  },

  /* -- sections -- */
  autofillCard: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    padding: Space.md,
    borderRadius: RadiusRoleValue.sheetDialog,
    borderWidth: Stroke.standard,
  },
  autofillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    marginBottom: Space.xs,
  },
  autofillTitle: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  autofillDesc: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginBottom: Space.sm,
  },
  autofillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.xs + 2,
    borderBottomWidth: Stroke.hairline,
  },
  autofillRowLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    textTransform: 'uppercase',
    letterSpacing: TypographyV2.label.letterSpacing,
  },
  autofillRowValue: {
    flex: 1,
    marginLeft: Space.sm,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textAlign: 'right',
  },
  autofillChipLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    textTransform: 'uppercase',
    letterSpacing: TypographyV2.label.letterSpacing,
  },
  autofillChipValue: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs,
  },
  autofillApplyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: Stroke.standard,
    alignSelf: 'flex-start',
  },
  autofillApplyText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  sectionSpacing: {
    paddingTop: Space.lg,
  },
  /* Section spacing 24pt (Space.lg). Section heading is a restrained eyebrow. */
  sectionGroup: {
    paddingTop: Space.lg,
    paddingHorizontal: Space.md,
  },
  sectionHeading: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: FontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: TypographyV2.label.letterSpacing,
    marginBottom: Space.sm,
  },

  /* -- fields -- */
  /* Field spacing 16pt: paddingVertical 8 + hairline marginTop 8 = 16pt rhythm. */
  fieldGroup: {
    paddingVertical: Space.sm,
  },
  /* Labels: TypographyV2.bodyStrong — clear, legible, heavier than input text. */
  fieldLabel: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
    marginBottom: Space.xs,
  },
  /* Inputs: TypographyV2.body — comfortable reading weight. */
  fieldInput: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
    paddingVertical: Space.sm,
    paddingHorizontal: 0,
    minHeight: Control.hit + Space.sm,
  },
  fieldInputMultiline: {
    minHeight: Space.xxl + Space.xl,
    textAlignVertical: 'top',
    paddingTop: Space.sm,
  },
  /* Hints: TypographyV2.meta — supportive but recessed. */
  fieldHelper: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
    marginTop: Space.xs,
  },
  fieldError: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    marginTop: Space.xs,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    marginTop: Space.sm,
  },

  /* -- picker rows -- */
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm,
    minHeight: Control.hit + Space.sm,
  },
  pickerRowInner: {
    flex: 1,
  },
  pickerValue: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  pickerPlaceholder: {
  },

  /* -- price input -- */
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.xs,
    minHeight: Control.hit + Space.sm,
  },
  currencySymbol: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
    marginRight: Space.xs,
  },
  priceInput: {
    fontSize: TypographyV2.priceHero.size,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
    minWidth: Space.xxl + Space.lg + Space.sm,
    padding: 0,
  },
  discountPreview: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    marginTop: Space.xs,
  },
  soldCompsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
    paddingVertical: Space.xs,
  },
  soldCompsText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.regular,
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  soldCompsAction: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },

  /* -- toggles -- */
  toggleRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.xs,
  },
  togglePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: Control.hit,
  },
  togglePillActive: {
  },
  toggleText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.medium,
  },
  toggleTextActive: {
    fontFamily: FontFamily.bold,
  },

  /* -- tags -- */
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs + 2,
    alignItems: 'center',
    marginTop: Space.xs,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.xs + 2,
    borderRadius: RadiusRoleValue.compactControl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tagText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  tagInput: {
    flex: 1,
    minWidth: Space.xxl + Space.lg,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.body.letterSpacing,
    paddingVertical: Space.xs,
  },

  /* -- co-own auth photos -- */
  authPhotoRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  authThumb: {
    width: Space.xxl + Space.xs,
    height: Space.xxl + Space.xs,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    overflow: 'hidden',
  },
  authThumbImage: {
    width: Space.xxl + Space.xs,
    height: Space.xxl + Space.xs,
  },
  authThumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  authAddBtn: {
    width: Space.xxl + Space.xs,
    height: Space.xxl + Space.xs,
    borderRadius: RadiusRoleValue.mediaThumbnail,
    borderWidth: Stroke.standard,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* -- inline error -- */
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  inlineErrorText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
  },

  /* -- compact review summary (auction/co_own) -- */
  /* Per audit 04 P1: compact review state before publish for high-value
     formats. Flat inline — no card chrome (§4 surface budget). */
  reviewSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  reviewSummaryText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },

  /* -- photo guidance (flat inline, no card chrome per §4 surface budget) -- */
  photoGuideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    minHeight: Control.hit,
  },
  photoGuideTitle: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  photoGuideMin: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  photoGuideTips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm + 2,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  photoGuideTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  photoGuideTip: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },

  /* -- contextual authenticity prompts -- */
  /* Per audit 04 P1: contextual prompts by category/value.
     Flat inline — no card chrome (§4 surface budget). */
  contextualPrompts: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    gap: Space.xs,
  },
  contextualPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
  },
  contextualPromptText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },

  /* -- price suggestion block -- */
  priceSuggestionBlock: {
    marginTop: Space.xs,
    gap: 0,
  },

  /* -- seller proceeds estimate -- */
  /* Per audit 04 P1: seller-proceeds preview beside price.
     Flat inline row — no card chrome (§4 surface budget). */
  proceedsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.xs,
    marginTop: Space.xs,
  },
  proceedsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
  },
  proceedsLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    marginTop: 0,
  },
  proceedsRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
  },
  proceedsAmount: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.bold,
    fontVariant: ['tabular-nums'],
  },
  proceedsFeeHint: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    marginTop: 0,
  },

  /* -- field validation -- */
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  fieldRequiredHint: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },

  /* -- contextual hints (field-specific, not a dashboard) -- */
  contextualHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  contextualHintText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },

  /* -- category-aware completeness indicator (flat inline) -- */
  completenessRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  completenessTextWrap: {
    flex: 1,
    gap: Space.xs / 2,
  },
  completenessLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  completenessHint: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },

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
    fontSize: Type.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    lineHeight: Type.bodyStrong.lineHeight,
    marginBottom: Space.xxs,
  },
  shippingSummaryValue: {
    fontSize: Type.caption.size,
    fontFamily: FontFamily.regular,
    lineHeight: Type.caption.lineHeight,
  },
  shippingSheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  shippingSheet: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Space.xs,
    paddingHorizontal: Space.md,
  },
  shippingSheetHeader: {
    alignItems: 'center',
    paddingBottom: Space.sm,
  },
  shippingSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: '#00000033', // themed inline below
    marginBottom: Space.sm,
  },
  shippingSheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  shippingSheetTitle: {
    fontSize: Type.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    lineHeight: Type.bodyStrong.lineHeight,
  },
  shippingSheetSectionLabel: {
    fontSize: Type.meta.size,
    fontFamily: FontFamily.medium,
    lineHeight: Type.meta.lineHeight,
    letterSpacing: Type.meta.letterSpacing,
    textTransform: 'uppercase',
    marginBottom: Space.xs,
  },
  shippingSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm + Space.xs,
    minHeight: Control.hit,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#00000000', // themed inline
  },
  shippingSheetRowLabel: {
    flex: 1,
    fontSize: Type.bodyStrong.size,
    fontFamily: FontFamily.regular,
    lineHeight: Type.bodyStrong.lineHeight,
  },
  shippingSheetRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: Radius.full,
    borderWidth: 2,
    borderColor: '#00000033', // themed inline below
    alignItems: 'center',
    justifyContent: 'center',
  },
  shippingSheetRadioInner: {
    width: 10,
    height: 10,
    borderRadius: Radius.full,
  },

  /* -- draft hint (flat inline) -- */
  draftHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 2,
  },
  draftHintText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.medium,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },

  /* -- quick actions row (transparent targets, no chrome) -- */
  sellQuickActions: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.xs,
  },
  sellQuickAction: {
    flex: 1,
    alignItems: 'center',
    gap: Space.xs - 2,
    paddingVertical: Space.sm,
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  sellQuickActionLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },

  /* -- new seller tips (flat inline, no card chrome) -- */
  sellerTipsSection: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    gap: Space.xs + 2,
  },
  sellerTipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
  },
  sellerTipsTitle: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  sellerTipsBody: {
    gap: Space.xs + 1,
  },
  sellerTipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  sellerTipText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    fontFamily: FontFamily.regular,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
});
