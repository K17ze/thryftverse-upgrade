import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { RootStackParamList } from '../navigation/types';
import { useAppTheme } from '../theme/ThemeContext';
import { Space, Typography, DockConstants, Radius, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { AppIcon } from '../components/common/AppIcon';
import { IconSize } from '../theme/iconTokens';
import { useToast } from '../context/ToastContext';
import { useCurrencyPref } from '../hooks/useCurrencyPref';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useConnectivity } from '../hooks/useConnectivity';
import { CURRENCIES } from '../constants/currencies';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { sanitizeDecimalInput } from '../utils/currencyAuthoringFlows';
import { convertPickerAsset, validateMediaAssets, ListingMediaDraftItem } from '../utils/mediaUploadAsset';
import type { MediaUploadAsset } from '../utils/mediaUploadAsset';
import { haptics } from '../utils/haptics';
import { useStore } from '../store/useStore';

import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { BottomSheet } from '../components/BottomSheet';
import { AppButton } from '../components/ui/AppButton';
import { fetchListingByIdFromApi, patchListingOnApi, createListingImageOnApi } from '../services/listingsApi';
import { MediaUploadQueue } from '../services/mediaUploadQueue';
import { ListingMediaStudio } from '../components/listing/ListingMediaStudio';
import { EditListingFooter } from '../components/listing/EditListingFooter';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from '../platform/keyboard/KeyboardProvider';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { useBackendData } from '../context/BackendDataContext';
import { useTaxonomy } from '../context/TaxonomyContext';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../platform/server/queryKeys';
import { useSoldComps } from '../hooks/useSoldComps';
import { calculateListingQuality } from '../utils/listingQuality';
import {

  evaluateListingCompleteness,
  type ListingFieldValues,
  type ListingFieldKey } from '../contracts/listingCategoryPolicy';
import { t } from '../i18n';

type PickerMode = 'Category' | 'Brand' | 'Size' | 'Condition' | null;
type RouteT = RouteProp<RootStackParamList, 'EditListing'>;
type SaveStage = 'idle' | 'uploading_media' | 'updating_listing' | 'completed' | 'failed_recoverable';
type SectionFocus = 'price' | 'shipping' | 'format';

interface EditListingRouteParams {
  itemId: string;
  focus?: SectionFocus;
}

/* ── Autosave draft ──
   Persisted to AsyncStorage so a seller doesn't lose work after a crash,
   force-quit, or accidental navigation. Best-effort: write failures are
   swallowed and never block the user. */
interface EditListingDraft {
  title: string;
  description: string;
  price: string;
  originalPrice: string;
  category: string;
  brand: string;
  size: string;
  condition: string;
  shippingMethod: 'standard' | 'express' | null;
  shippingPayer: 'buyer' | 'seller' | null;
  /** Epoch ms when the draft was last written. */
  savedAt: number;
  /** Server `updatedAt` captured when the draft was started — used to
      decide whether the draft is newer than the server copy. */
  baseUpdatedAt: string | null;
}

const draftKey = (itemId: string) => `editListingDraft:${itemId}`;
const AUTOSAVE_DEBOUNCE_MS = 2000;

export default function EditListingScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  // Theme-aware color overrides for the static styles. The static
  // StyleSheet contains only non-color properties; colors are applied
  // via this themed proxy so the screen is fully dark-mode compatible.
  const themed = useMemo(() => ({
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
    soldCompsAction: { color: colors.brand } }), [colors]);
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { itemId, focus } = (route.params as EditListingRouteParams) ?? {};
  const { show: showToast } = useToast();
  const { currencyCode } = useCurrencyPref();
  const currencySymbol = CURRENCIES[currencyCode].symbol;
  const { refreshListings } = useBackendData();
  const queryClient = useQueryClient();
  const { isOffline } = useConnectivity();

  const { categories, conditions, sizes, brands } = useTaxonomy();
  const categoryOptions = useMemo(
    () => categories.filter((n) => n.parentId === null).map((n) => n.name),
    [categories],
  );
  const conditionOptions = useMemo(() => conditions.map((n) => n.name), [conditions]);
  const sizeOptions = useMemo(() => sizes.map((n) => n.name), [sizes]);
  const brandOptions = useMemo(() => brands.map((n) => n.name), [brands]);

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

  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

  /* ── autosave / conflict state ── */
  // The server `updatedAt` captured when the listing was first loaded.
  // Compared against a fresh fetch before saving to detect concurrent
  // edits from another device/session.
  const mountUpdatedAtRef = useRef<string | null>(null);
  // True while a debounced autosave is writing the draft to storage.
  const [isAutosaving, setIsAutosaving] = useState(false);
  // True once the form has been clean-and-saved at least once since the
  // last edit — drives the green "Saved" resting state.
  const [isCleanSaved, setIsCleanSaved] = useState(false);
  // Conflict-resolution sheet state.
  const [conflictSheet, setConflictSheet] = useState<{
    visible: boolean;
    serverUpdatedAt: string;
    onKeepMine: () => void;
    onUseTheirs: () => void;
  } | null>(null);
  // Restore-draft prompt state.
  const [restoreSheet, setRestoreSheet] = useState<{
    visible: boolean;
    draft: EditListingDraft;
  } | null>(null);

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

  /* ── focus scroll (ManageListing deep-links: price / shipping / format) ── */
  const scrollRef = useRef<KeyboardAwareScrollViewRef | null>(null);
  const sectionYRef = useRef<Partial<Record<SectionFocus, number>>>({});
  const trackSectionY = useCallback((key: SectionFocus) => (e: { nativeEvent: { layout: { y: number } } }) => {
    sectionYRef.current[key] = e.nativeEvent.layout.y;
  }, []);
  useEffect(() => {
    if (!focus || isLoading || loadError) return;
    // Wait one frame so the restored form content has laid out.
    const timer = setTimeout(() => {
      const y = sectionYRef.current[focus];
      if (y != null) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - Space.lg), animated: true });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [focus, isLoading, loadError]);

  /* ── fetch listing on mount ── */
  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setLoadError(false);
    fetchListingByIdFromApi(itemId)
      .then(async (res) => {
        if (!mounted) return;
        if (res.ok && res.listing) {
          const l = res.listing;
          const serverUpdatedAt = l.updatedAt ?? l.createdAt ?? null;
          mountUpdatedAtRef.current = serverUpdatedAt;
          setListing(l);

          // Check for a persisted draft. Only offer to restore when the
          // draft is newer than the server copy (i.e. the user made
          // changes that never made it to the server).
          let appliedDraft = false;
          try {
            const raw = await AsyncStorage.getItem(draftKey(itemId));
            if (raw) {
              const draft = JSON.parse(raw) as EditListingDraft;
              const serverMs = serverUpdatedAt ? Date.parse(serverUpdatedAt) : 0;
              const draftMs = draft.savedAt ?? 0;
              if (draftMs > serverMs) {
                setRestoreSheet({ visible: true, draft });
                appliedDraft = true;
              } else {
                // Stale draft — clear it so it doesn't resurface.
                void AsyncStorage.removeItem(draftKey(itemId));
              }
            }
          } catch {
            // Best-effort: ignore storage read errors.
          }

          if (!appliedDraft) {
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
          }
          const initialPhotos = l.images ?? (l.imageUrl ? [l.imageUrl] : []);
          const items: ListingMediaDraftItem[] = initialPhotos.map((uri: string, i: number) => ({
            id: `remote_${itemId}_${i}`,
            uri,
            kind: 'image' as const,
            source: 'remote' as const,
            status: 'uploaded' as const,
            publicUrl: uri }));
          setMediaItems(items);
        } else {
          setLoadError(true);
          showToast(t('listing.edit.couldNotLoad'), 'error');
        }
      })
      .catch(() => {
        if (mounted) {
          setLoadError(true);
          showToast(t('listing.edit.couldNotLoad'), 'error');
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

  /* ── debounced autosave draft ──
     Writes the text-field form state to AsyncStorage 2s after the user
     stops editing. Media is intentionally excluded — local asset URIs are
     transient and can't be re-attached reliably across sessions. The
     autosave is best-effort: failures are swallowed so they never block
     the user. Layered ON TOP of the manual save; it does not replace it. */
  useEffect(() => {
    if (!listing) return;
    if (!hasChanges) return;
    // Mark dirty as soon as the user edits so the resting "Saved" state
    // doesn't persist after a new edit.
    setIsCleanSaved(false);
    const timer = setTimeout(() => {
      const draft: EditListingDraft = {
        title,
        description,
        price,
        originalPrice,
        category,
        brand,
        size,
        condition,
        shippingMethod,
        shippingPayer,
        savedAt: Date.now(),
        baseUpdatedAt: mountUpdatedAtRef.current,
      };
      setIsAutosaving(true);
      AsyncStorage.setItem(draftKey(itemId), JSON.stringify(draft))
        .catch(() => { /* best-effort */ })
        .finally(() => setIsAutosaving(false));
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [listing, hasChanges, title, description, price, originalPrice, category, brand, size, condition, shippingMethod, shippingPayer, itemId]);

  /* ── restore-draft handler ── */
  const handleRestoreDraft = useCallback(() => {
    const sheet = restoreSheet;
    setRestoreSheet((s) => s ? { ...s, visible: false } : null);
    if (!sheet) return;
    const d = sheet.draft;
    setTitle(d.title);
    setDescription(d.description);
    setPrice(d.price);
    setOriginalPrice(d.originalPrice);
    setCategory(d.category);
    setBrand(d.brand);
    setSize(d.size);
    setCondition(d.condition);
    setShippingMethod(d.shippingMethod);
    setShippingPayer(d.shippingPayer);
    haptics.tap();
  }, [restoreSheet]);

  const handleDiscardDraft = useCallback(() => {
    setRestoreSheet((s) => s ? { ...s, visible: false } : null);
    void AsyncStorage.removeItem(draftKey(itemId)).catch(() => {});
    haptics.tap();
  }, [itemId]);

  /* ── media handling ── */
  const appendPhotoAsset = useCallback((asset: MediaUploadAsset) => {
    setMediaItems((prev) => {
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
      return [...prev, draftItem].slice(0, 10);
    });
  }, []);

  const handlePickFromLibrary = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMsg(t('listing.edit.allowGallery'));
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        allowsEditing: false,
        quality: 0.9 });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const assets = result.assets.map(convertPickerAsset);
        const existing = mediaItems.map((m) => ({
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
    } catch {
      setErrorMsg(t('listing.edit.couldNotOpenLibrary'));
    }
  }, [appendPhotoAsset, mediaItems]);

  const handlePickFromCamera = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setErrorMsg(t('listing.edit.allowCamera'));
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.9 });
      if (!result.canceled && result.assets?.[0]?.uri) {
        const asset = convertPickerAsset(result.assets[0]);
        const existing = mediaItems.map((m) => ({
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
    } catch {
      setErrorMsg(t('listing.edit.couldNotOpenCamera'));
    }
  }, [appendPhotoAsset, mediaItems]);

  const handleRemoveItem = useCallback((itemId: string) => {
    const item = mediaItems.find((m) => m.id === itemId);
    if (!item) return;
    if (item.source === 'remote') return;
    haptics.tap();
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
      haptics.tap();
    } else {
      haptics.warning();
    }
  }, []);

  const handleReorder = useCallback((newOrderedIds: string[]) => {
    setMediaItems((prev) => {
      const itemMap = new Map(prev.map((m) => [m.id, m]));
      return newOrderedIds.map((id) => itemMap.get(id)).filter(Boolean) as ListingMediaDraftItem[];
    });
    haptics.tap();
  }, []);

  const canRemoveItem = useCallback((itemId: string) => {
    const item = mediaItems.find((m) => m.id === itemId);
    return item ? item.source === 'local' : false;
  }, [mediaItems]);

  /* ── validation ── */
  // Category-aware validation: use the completeness result's missing
  // required fields instead of universal brand/size assumptions.
  // Brandless vintage and sizeless home goods are valid when the policy
  // says so.
  const editCompleteness = useMemo(() => {
    const numericPrice = Number(sanitizeDecimalInput(price));
    const values: ListingFieldValues = {
      title: title.trim() || null,
      description: description.trim() || null,
      price: numericPrice > 0 ? numericPrice : null,
      category: category || null,
      brand: brand || null,
      size: size || null,
      condition: condition || null,
      images: mediaItems.length > 0 ? mediaItems.map((m) => m.publicUrl || m.uri) : null,
      shippingMethod: shippingMethod || null,
      shippingPayer: shippingPayer || null };
    return evaluateListingCompleteness(values);
  }, [title, description, price, category, brand, size, condition, mediaItems, shippingMethod, shippingPayer]);

  const editFieldLabelMap: Record<ListingFieldKey, string> = {
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

  const editCompletenessLabel = useMemo(() => editCompleteness.canActivate
    ? 'Ready to publish'
    : `Missing: ${editCompleteness.missingRequired.map((f) => editFieldLabelMap[f]).join(', ')}`,
    [editCompleteness.canActivate, editCompleteness.missingRequired, editFieldLabelMap]);

  const editRecommendedLabel = useMemo(() => editCompleteness.missingRecommended.length > 0
    ? `Suggested: ${editCompleteness.missingRecommended.map((f) => editFieldLabelMap[f]).join(', ')}`
    : null,
    [editCompleteness.missingRecommended, editFieldLabelMap]);

  const validate = useCallback(() => {
    const trimmedTitle = title.trim();
    const trimmedDesc = description.trim();
    const numericPrice = Number(sanitizeDecimalInput(price));

    // Category-aware: check missingRequired from the policy, not universal
    // brand/size requirements.
    for (const field of editCompleteness.missingRequired) {
      switch (field) {
        case 'title': if (!trimmedTitle) return t('listing.create.errorAddTitle'); break;
        case 'category': if (!category) return t('listing.create.errorSelectCategoryField'); break;
        case 'brand': if (!brand) return t('listing.create.errorSelectBrandField'); break;
        case 'size': if (!size) return t('listing.create.errorSelectSizeField'); break;
        case 'condition': if (!condition) return t('listing.create.errorSelectConditionField'); break;
        case 'images': if (mediaItems.length === 0) return t('listing.create.errorAddPhoto'); break;
        case 'description':
          if (!trimmedDesc || trimmedDesc.length < 10) return t('listing.create.errorAddDescription');
          break;
        case 'price':
          if (!Number.isFinite(numericPrice) || numericPrice <= 0) return t('listing.create.errorValidPrice');
          break;
        default: break;
      }
    }
    return '';
  }, [title, category, brand, size, condition, description, price, mediaItems, editCompleteness]);

  /* ── save handler ──
     The manual save flow is preserved exactly. Autosave/conflict logic is
     layered on top: before applying the save we re-fetch the listing and
     compare its `updatedAt` to the value captured at mount. If they
     differ, the listing was edited on another device and we surface a
     conflict-resolution sheet instead of silently overwriting it. */
  const performSave = useCallback(async () => {
    if (!isOwner) {
      setErrorMsg(t('listing.edit.noPermission'));
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
          fileName: m.fileName ?? m.uri.split('/').pop() ?? 'photo.jpg',
          mimeType: m.mimeType ?? 'image/jpeg',
          kind: m.kind,
          fileSize: m.fileSize,
          width: m.width,
          height: m.height,
          durationMs: m.durationMs }));
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
              error: qi.error || m.error };
          })
        );

        const failedItems = queueItems.filter((q) => q.state === 'failed');
        if (failedItems.length > 0) {
          setSaveStage('failed_recoverable');
          setErrorMsg(t('listing.edit.mediaFailedRetry'));
          haptics.error();
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
            finalizationId: qi.finalizationId! });
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
        coverFinalizationId });

      setSaveStage('completed');
      setIsCleanSaved(true);
      haptics.success();
      showToast(t('listing.edit.updated'), 'success');
      // Clear the persisted draft — the server now holds the latest copy.
      void AsyncStorage.removeItem(draftKey(itemId)).catch(() => {});
      // Refresh feed + invalidate cached detail so the edit propagates
      // immediately when the user returns to the feed or profile.
      void refreshListings();
      void queryClient.invalidateQueries({ queryKey: queryKeys.listing.detail(itemId) });
      navigation.goBack();
    } catch (e) {
      setSaveStage('failed_recoverable');
      setErrorMsg(t('listing.edit.updateFailed'));
      showToast(t('listing.edit.updateFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  }, [isOwner, itemId, title, description, price, brand, size, condition, category, originalPrice, shippingMethod, shippingPayer, mediaItems, showToast, navigation, refreshListings, queryClient]);

  /* ── reload listing from server (conflict: "Use their changes") ── */
  const reloadFromServer = useCallback(async () => {
    setConflictSheet(null);
    setIsSaving(true);
    try {
      const res = await fetchListingByIdFromApi(itemId);
      if (res.ok && res.listing) {
        const l = res.listing;
        mountUpdatedAtRef.current = l.updatedAt ?? l.createdAt ?? null;
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
          publicUrl: uri }));
        setMediaItems(items);
        setIsCleanSaved(true);
        void AsyncStorage.removeItem(draftKey(itemId)).catch(() => {});
        showToast(t('listing.edit.updated'), 'success');
      } else {
        showToast(t('listing.edit.couldNotLoad'), 'error');
      }
    } catch {
      showToast(t('listing.edit.couldNotLoad'), 'error');
    } finally {
      setIsSaving(false);
      setSaveStage('idle');
    }
  }, [itemId, showToast]);

  const handleSave = useCallback(async () => {
    const error = validate();
    if (error) {
      setErrorMsg(error);
      setSaveStage('failed_recoverable');
      haptics.error();
      return;
    }

    // Conflict detection: re-fetch the listing and compare its updatedAt
    // to the value captured at mount. Skip the check when offline (the
    // fetch would fail anyway) or when we have no baseline timestamp.
    if (!isOffline && mountUpdatedAtRef.current) {
      try {
        const fresh = await fetchListingByIdFromApi(itemId);
        if (fresh.ok && fresh.listing) {
          const serverUpdatedAt = fresh.listing.updatedAt ?? fresh.listing.createdAt ?? null;
          if (serverUpdatedAt && serverUpdatedAt !== mountUpdatedAtRef.current) {
            // The listing was edited elsewhere since this screen opened.
            setConflictSheet({
              visible: true,
              serverUpdatedAt,
              onKeepMine: () => {
                setConflictSheet(null);
                // Force save — update the baseline so a subsequent save
                // doesn't re-trigger the conflict prompt.
                mountUpdatedAtRef.current = serverUpdatedAt;
                void performSave();
              },
              onUseTheirs: reloadFromServer,
            });
            return;
          }
        }
      } catch {
        // Network hiccup during the pre-save check — proceed with the
        // save; the server will reject it if there's a real conflict.
      }
    }

    void performSave();
  }, [validate, isOffline, itemId, performSave, reloadFromServer]);

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
        shippingPayer: shippingPayer || undefined },
      origin: 'edit' });
  }, [title, price, originalPrice, brand, condition, category, size, description, shippingMethod, shippingPayer, mediaItems, navigation]);

  /* ── discard confirmation ── */
  const handleCancel = useCallback(() => {
    if (hasChanges) {
      setConfirmSheet({
        visible: true,
        title: t('listing.edit.discardTitle'),
        message: t('listing.edit.discardMessage'),
        confirmLabel: t('listing.edit.discard'),
        cancelLabel: t('listing.edit.keepEditing'),
        variant: 'danger',
        onConfirm: () => navigation.goBack() });
    } else {
      navigation.goBack();
    }
  }, [hasChanges, navigation]);

  /* ── picker helpers ── */
  const getPickerOptions = useCallback(() => {
    switch (pickerMode) {
      case 'Category': return categoryOptions;
      case 'Brand': return brandOptions;
      case 'Size': return sizeOptions;
      case 'Condition': return conditionOptions;
      default: return [];
    }
  }, [pickerMode, categoryOptions, brandOptions, sizeOptions, conditionOptions]);

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
    haptics.selection();
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

  /* ── coarse save state for the footer button ── */
  const saveState: 'saved' | 'saving' | 'offline' | 'dirty' = useMemo(() => {
    if (isSaving || isAutosaving) return 'saving';
    if (isOffline && hasChanges) return 'offline';
    if (!hasChanges && isCleanSaved) return 'saved';
    return 'dirty';
  }, [isSaving, isAutosaving, isOffline, hasChanges, isCleanSaved]);

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
  // The listings API does not expose a sales-format field (auctions are
  // separate rows joined by listing id), so the meter scores the editable
  // fixed-price record fields — always listingMode 'sell_now'.
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
    listingMode: 'sell_now' }), [mediaItems, title, brand, category, size, condition, description, price, originalPrice, shippingMethod, shippingPayer]);

  /* ── listing status label ── */
  const listingStatusLabel = useMemo(() => {
    if (!listing) return null;
    const status = listing.status;
    switch (status) {
      case 'active': return t('listing.edit.statusActive');
      case 'draft': return t('listing.edit.statusDraft');
      case 'sold': return t('listing.edit.statusSold');
      case 'paused': return t('listing.edit.statusPaused');
      default: return null;
    }
  }, [listing]);

  const isEditingRestricted = listing?.status === 'sold' || listing?.status === 'deleted' || !isOwner;

  /* ── loading state ── */
  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title={t('listing.create.editTitle')} onBack={() => navigation.goBack()} />}>
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
      <FlagshipScreen header={<FlagshipHeader title={t('listing.create.editTitle')} onBack={() => navigation.goBack()} />}>
        <View style={styles.errorContainer}>
          <AppIcon name="cloud-offline-outline" size={IconSize.xl} color="textMuted" opticalCenter accessible={false} />
          <Text style={[styles.errorTitle, themed.errorTitle]}>{t('listing.edit.couldNotLoad')}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryBtn, themed.retryBtn, pressed && { opacity: 0.85 }]}
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
                      publicUrl: uri }));
                    setMediaItems(items);
                  } else {
                    setLoadError(true);
                  }
                })
                .catch(() => setLoadError(true))
                .finally(() => setIsLoading(false));
            }}
            accessibilityRole="button"
            accessibilityLabel={t('listing.edit.retryLoad')}
          >
            <Text style={[styles.retryBtnText, themed.retryBtnText]}>{t('listing.edit.retry')}</Text>
          </Pressable>
        </View>
      </FlagshipScreen>
    );
  }

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title={t('listing.create.editTitle')}
          onBack={handleCancel}
          backIcon="close"
          rightAction={
            <Text style={[styles.navStatusText, themed.navStatusText, hasChanges && styles.navStatusUnsaved, hasChanges && themed.navStatusUnsaved]}>
              {hasChanges ? t('listing.edit.unsaved') : t('listing.create.saved')}
            </Text>
          }
        />
      }
      scrollEnabled={false}
      contentStyle={{ paddingHorizontal: 0, paddingTop: 0 }}
    >
        <KeyboardAwareScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* ── 2. LISTING MEDIA STUDIO ── */}
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
              reorderEnabled={true}
              lockedNote={t('listing.edit.lockedPhotos')}
              removeLabel={t('listing.edit.remove')}
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
              reorderEnabled={true}
              canRemoveItem={() => false}
              lockedNote={t('listing.edit.noPermission')}
            />
          )}

          {/* ── 2a. PHOTO UPLOAD GUIDANCE ── */}
          <View style={[styles.photoGuideCard, themed.photoGuideCard]}>
            <Pressable
              style={({ pressed }) => [styles.photoGuideHeader, pressed && { opacity: 0.85 }]}
              onPress={() => setPhotoGuideCollapsed((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={photoGuideCollapsed ? t('listing.edit.expandPhotoTips') : t('listing.edit.collapsePhotoTips')}
            >
              <AppIcon name="camera-outline" size={IconSize.sm} color="textSecondary" opticalCenter accessible={false} />
              <Text style={[styles.photoGuideTitle, themed.photoGuideTitle]}>{t('listing.create.photoTips')}</Text>
              <Text style={[styles.photoGuideMin, themed.photoGuideMin]}>{t('listing.create.photoTipsMin')}</Text>
              <AppIcon name={photoGuideCollapsed ? 'chevron-down' : 'chevron-up'} size={12} color="textMuted" opticalCenter accessible={false} />
            </Pressable>
            {!photoGuideCollapsed && (
              <Reanimated.View
                entering={reducedMotion ? undefined : FadeIn.duration(200)}
                exiting={reducedMotion ? undefined : FadeOut.duration(200)}
                style={styles.photoGuideTips}
              >
                <View style={styles.photoGuideTipRow}>
                  <AppIcon name="sunny-outline" size={12} color="textMuted" opticalCenter accessible={false} />
                  <Text style={[styles.photoGuideTip, themed.photoGuideTip]}>{t('listing.create.photoTipLighting')}</Text>
                </View>
                <View style={styles.photoGuideTipRow}>
                  <AppIcon name="camera-reverse-outline" size={12} color="textMuted" opticalCenter accessible={false} />
                  <Text style={[styles.photoGuideTip, themed.photoGuideTip]}>{t('listing.create.photoTipAngles')}</Text>
                </View>
                <View style={styles.photoGuideTipRow}>
                  <AppIcon name="leaf-outline" size={12} color="textMuted" opticalCenter accessible={false} />
                  <Text style={[styles.photoGuideTip, themed.photoGuideTip]}>{t('listing.create.photoTipBackground')}</Text>
                </View>
              </Reanimated.View>
            )}
          </View>

          {/* ── 3. LISTING STATUS/CONTEXT ── */}
          {listingStatusLabel && (
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, themed.statusDot, listing?.status === 'active' && styles.statusDotActive, listing?.status === 'active' && themed.statusDotActive]} />
              <Text style={[styles.statusText, themed.statusText]}>{listingStatusLabel}</Text>
            </View>
          )}

          {isEditingRestricted && (
            <View style={styles.restrictedRow}>
              <AppIcon name="lock-closed" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
              <Text style={[styles.restrictedText, themed.restrictedText]}>{t('listing.edit.restricted')}</Text>
            </View>
          )}

          {/* ── 4. DETAILS ── */}
          <View style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, themed.sectionHeading]}>{t('listing.create.details')}</Text>

            {/* ── Format (read-only) ──
                The listing format is chosen when a listing is created and the
                update API accepts no format field, so this row is deliberately
                read-only. It gives the ManageListing "Format" deep-link an
                honest destination instead of a dead control. */}
            <View onLayout={trackSectionY('format')}>
              <View style={styles.pickerRow}>
                <View style={styles.pickerRowInner}>
                  <View style={styles.fieldLabelRow}>
                    <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.edit.format')}</Text>
                  </View>
                  <Text style={[styles.pickerValue, themed.pickerValue]}>
                    {t('listing.edit.formatFixedPrice')}
                  </Text>
                </View>
                <AppIcon name="lock-closed-outline" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
              </View>
              <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>
                {t('listing.edit.formatHelper')}
              </Text>
            </View>
            <View style={[styles.hairline, themed.hairline]} />

            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.listingTitle')}</Text>
                {title.trim().length > 0 ? (
                  <AppIcon name="checkmark-circle" size={12} color="success" opticalCenter accessible={false} />
                ) : (
                  <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                )}
              </View>
              <TextInput
                style={[styles.fieldInput, themed.fieldInput, isEditingRestricted && styles.fieldInputDisabled]}
                value={title}
                onChangeText={(t) => { setTitle(t); setErrorMsg(''); }}
                placeholder={t('listing.edit.titlePlaceholder')}
                placeholderTextColor={colors.textMuted}
                returnKeyType="next"
                editable={!isEditingRestricted}
              />
              <View style={[styles.hairline, themed.hairline]} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.85 }]}
              onPress={() => !isEditingRestricted && setPickerMode('Category')}
              accessibilityRole="button"
              accessibilityLabel={t('listing.edit.selectCategory')}
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.category')}</Text>
                  {category ? (
                    <AppIcon name="checkmark-circle" size={12} color="success" opticalCenter accessible={false} />
                  ) : (
                    <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                  )}
                </View>
                <Text style={[styles.pickerValue, themed.pickerValue, !category && styles.pickerPlaceholder, !category && themed.pickerPlaceholder]}>
                  {category || t('listing.edit.selectCategory')}
                </Text>
              </View>
              <AppIcon name="chevron-forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            </Pressable>
            <View style={[styles.hairline, themed.hairline]} />

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.85 }]}
              onPress={() => !isEditingRestricted && setPickerMode('Brand')}
              accessibilityRole="button"
              accessibilityLabel={t('listing.edit.selectBrand')}
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.brand')}</Text>
                  {brand ? (
                    <AppIcon name="checkmark-circle" size={12} color="success" opticalCenter accessible={false} />
                  ) : editCompleteness.policy.brandlessValid ? (
                    <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.optional')}</Text>
                  ) : (
                    <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                  )}
                </View>
                <Text style={[styles.pickerValue, themed.pickerValue, !brand && styles.pickerPlaceholder, !brand && themed.pickerPlaceholder]}>
                  {brand || t('listing.edit.selectBrand')}
                </Text>
              </View>
              <AppIcon name="chevron-forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            </Pressable>
            <View style={[styles.hairline, themed.hairline]} />

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.85 }]}
              onPress={() => !isEditingRestricted && setPickerMode('Size')}
              accessibilityRole="button"
              accessibilityLabel={t('listing.edit.selectSize')}
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.size')}</Text>
                  {size ? (
                    <AppIcon name="checkmark-circle" size={12} color="success" opticalCenter accessible={false} />
                  ) : editCompleteness.policy.sizelessValid ? (
                    <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.optional')}</Text>
                  ) : (
                    <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                  )}
                </View>
                <Text style={[styles.pickerValue, themed.pickerValue, !size && styles.pickerPlaceholder, !size && themed.pickerPlaceholder]}>
                  {size || t('listing.edit.selectSize')}
                </Text>
              </View>
              <AppIcon name="chevron-forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            </Pressable>
            <View style={[styles.hairline, themed.hairline]} />

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.85 }]}
              onPress={() => !isEditingRestricted && setPickerMode('Condition')}
              accessibilityRole="button"
              accessibilityLabel={t('listing.edit.selectCondition')}
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.condition')}</Text>
                  {condition ? (
                    <AppIcon name="checkmark-circle" size={12} color="success" opticalCenter accessible={false} />
                  ) : (
                    <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                  )}
                </View>
                <Text style={[styles.pickerValue, themed.pickerValue, !condition && styles.pickerPlaceholder, !condition && themed.pickerPlaceholder]}>
                  {condition || t('listing.edit.selectCondition')}
                </Text>
              </View>
              <AppIcon name="chevron-forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            </Pressable>
          </View>

          {/* ── 5. PRICING ── */}
          <View style={styles.sectionGroup} onLayout={trackSectionY('price')}>
            <Text style={[styles.sectionHeading, themed.sectionHeading]}>{t('listing.edit.pricing')}</Text>

            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.price')}</Text>
                {hasValidPrice ? (
                  <AppIcon name="checkmark-circle" size={12} color="success" opticalCenter accessible={false} />
                ) : (
                  <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                )}
              </View>
              <View style={styles.priceRow}>
                <Text style={[styles.currencySymbol, themed.currencySymbol]}>{currencySymbol}</Text>
                <TextInput
                  style={[styles.fieldInput, themed.fieldInput, styles.priceInput, isEditingRestricted && styles.fieldInputDisabled]}
                  value={price}
                  onChangeText={(v) => { setPrice(sanitizeDecimalInput(v)); setErrorMsg(''); }}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  editable={!isEditingRestricted}
                />
              </View>
              {hasDiscount && (
                <Text style={[styles.discountPreview, themed.discountPreview]}>{t('listing.create.discountOffOriginal', { percent: discountPercent })}</Text>
              )}
              {soldComps.hasComps && soldComps.minPrice != null && soldComps.maxPrice != null ? (
                <View style={styles.priceSuggestionBlock}>
                  <View style={styles.soldCompsHint}>
                    <AppIcon name="cash-outline" size={12} color="textMuted" opticalCenter accessible={false} />
                    <Text style={[styles.soldCompsText, themed.soldCompsText]}>
                      {t('listing.create.soldCompsRange', { min: `${currencySymbol}${soldComps.minPrice.toFixed(0)}`, max: `${currencySymbol}${soldComps.maxPrice.toFixed(0)}`, count: soldComps.sampleSize })}
                    </Text>
                  </View>
                  {soldComps.medianPrice != null && (
                    <View style={styles.soldCompsHint}>
                      <AppIcon name="bulb-outline" size={12} color="brand" opticalCenter accessible={false} />
                      <Text style={[styles.soldCompsText, themed.priceSuggestion]}>
                        {t('listing.create.suggestedPrice', { amount: `${currencySymbol}${soldComps.medianPrice.toFixed(0)}` })}
                      </Text>
                    </View>
                  )}
                  {priceVsMarket === 'above' && (
                    <View style={styles.soldCompsHint}>
                      <AppIcon name="trending-up-outline" size={12} color="warning" opticalCenter accessible={false} />
                      <Text style={[styles.soldCompsText, themed.priceMarketHigh]}>
                        {t('listing.create.pricedAboveRange')}
                      </Text>
                    </View>
                  )}
                  {priceVsMarket === 'below' && (
                    <View style={styles.soldCompsHint}>
                      <AppIcon name="trending-down-outline" size={12} color="textMuted" opticalCenter accessible={false} />
                      <Text style={[styles.soldCompsText, themed.priceMarketLow]}>
                        {t('listing.create.pricedBelowRange')}
                      </Text>
                    </View>
                  )}
                  {priceVsMarket === 'in_range' && (
                    <View style={styles.soldCompsHint}>
                      <AppIcon name="checkmark-circle" size={12} color="success" opticalCenter accessible={false} />
                      <Text style={[styles.soldCompsText, themed.priceMarketGood]}>
                        {t('listing.create.pricedInRange')}
                      </Text>
                    </View>
                  )}
                </View>
              ) : (
                <View style={styles.soldCompsHint}>
                  <AppIcon name="information-circle-outline" size={12} color="textMuted" opticalCenter accessible={false} />
                  <Text style={[styles.soldCompsText, themed.priceNoCompsHint]}>
                    {t('listing.create.priceCompetitively')}
                  </Text>
                </View>
              )}
              <View style={[styles.hairline, themed.hairline]} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.originalPrice')}</Text>
              <View style={styles.priceRow}>
                <Text style={[styles.currencySymbol, themed.currencySymbol]}>{currencySymbol}</Text>
                <TextInput
                  style={[styles.fieldInput, themed.fieldInput, styles.priceInput, isEditingRestricted && styles.fieldInputDisabled]}
                  value={originalPrice}
                  onChangeText={(v) => { setOriginalPrice(sanitizeDecimalInput(v)); setErrorMsg(''); }}
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  editable={!isEditingRestricted}
                />
              </View>
            </View>
          </View>

          {/* ── 6. DESCRIPTION ── */}
          <View style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, themed.sectionHeading]}>{t('listing.create.description')}</Text>
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.description')}</Text>
                {description.trim().length >= 10 ? (
                  <AppIcon name="checkmark-circle" size={12} color="success" opticalCenter accessible={false} />
                ) : (
                  <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                )}
              </View>
              <TextInput
                style={[styles.descInput, themed.descInput, isEditingRestricted && styles.fieldInputDisabled]}
                value={description}
                onChangeText={(t) => { setDescription(t); setErrorMsg(''); }}
                placeholder={t('listing.edit.descriptionPlaceholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                editable={!isEditingRestricted}
              />
              <Text style={[styles.charCount, description.trim().length < 10 ? themed.charCountWarn : themed.charCount]}>
                {description.trim().length < 10 ? t('listing.create.charCountMin', { count: description.trim().length }) : description.length < 60 ? t('listing.create.charCountMore', { count: description.length }) : t('listing.create.charCount', { count: description.length })}
              </Text>
            </View>
          </View>

          {/* ── 7. SHIPPING ── */}
          <View style={styles.sectionGroup} onLayout={trackSectionY('shipping')}>
            <Text style={[styles.sectionHeading, themed.sectionHeading]}>{t('listing.edit.shipping')}</Text>

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.85 }]}
              onPress={() => !isEditingRestricted && setShippingMethod(shippingMethod === 'standard' ? 'express' : 'standard')}
              accessibilityRole="button"
              accessibilityLabel={t('listing.edit.toggleShippingMethod')}
            >
              <View style={styles.pickerRowInner}>
                <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.edit.shippingMethod')}</Text>
                <Text style={[styles.pickerValue, themed.pickerValue, !shippingMethod && styles.pickerPlaceholder, !shippingMethod && themed.pickerPlaceholder]}>
                  {shippingMethod === 'standard' ? t('listing.edit.shippingStandard') : shippingMethod === 'express' ? t('listing.edit.shippingExpress') : t('listing.edit.selectMethod')}
                </Text>
              </View>
              <AppIcon name="swap-horizontal" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            </Pressable>
            <View style={[styles.hairline, themed.hairline]} />

            <Pressable
              style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.85 }]}
              onPress={() => !isEditingRestricted && setShippingPayer(shippingPayer === 'buyer' ? 'seller' : 'buyer')}
              accessibilityRole="button"
              accessibilityLabel={t('listing.edit.toggleShippingPayer')}
            >
              <View style={styles.pickerRowInner}>
                <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.edit.whoPays')}</Text>
                <Text style={[styles.pickerValue, themed.pickerValue, !shippingPayer && styles.pickerPlaceholder, !shippingPayer && themed.pickerPlaceholder]}>
                  {shippingPayer === 'buyer' ? t('listing.edit.payerBuyer') : shippingPayer === 'seller' ? t('listing.edit.payerSeller') : t('listing.edit.selectPayer')}
                </Text>
              </View>
              <AppIcon name="swap-horizontal" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            </Pressable>
          </View>

          {/* ── 8. SAVE/UPDATE FEEDBACK ── */}
          {errorMsg && saveStage !== 'idle' && (
            <View style={styles.inlineErrorRow}>
              <AppIcon name="alert-circle" size={16} color="danger" opticalCenter accessible={false} />
              <Text style={[styles.inlineErrorText, themed.inlineErrorText]}>{errorMsg}</Text>
            </View>
          )}

          {/* ── Category-aware completeness indicator ──
              Per Phase 5 WP7: truthful completeness based on the category
              policy. Flat inline — no card chrome (§4 surface budget). */}
          <View style={styles.completenessRow}>
            <AppIcon
              name={editCompleteness.canActivate ? 'checkmark-circle' : 'alert-circle-outline'}
              size={IconSize.sm}
              color={editCompleteness.canActivate ? 'success' : 'warning'}
              opticalCenter
              accessible={false}
            />
            <View style={styles.completenessTextWrap}>
              <Text style={[styles.completenessLabel, { color: editCompleteness.canActivate ? colors.success : colors.textSecondary }]}>
                {editCompletenessLabel}
              </Text>
              {editRecommendedLabel && !editCompleteness.canActivate ? (
                <Text style={[styles.completenessHint, { color: colors.textMuted }]}>
                  {editRecommendedLabel}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={{ height: DockConstants.singleActionHeight }} />
        </KeyboardAwareScrollView>

      {/* ── 8b. COMPACT LISTING QUALITY METER (fixed above save footer) ── */}
      {isOwner && (
        <View style={[styles.qualityBar, themed.qualityBar]}>
          <View style={styles.qualityBarRow}>
            <View style={styles.qualityBarLeft}>
              <AppIcon
                name={qualityResult.tier === 'excellent' ? 'star' : qualityResult.tier === 'good' ? 'star-half-outline' : 'ellipse-outline'}
                size={IconSize.sm}
                color="textSecondary"
                opticalCenter
                accessible={false}
              />
              <Text style={[styles.qualityBarLabel, themed.qualityBarLabel]}>{t('listing.edit.listingQuality')}</Text>
            </View>
            <View style={styles.qualityBarRight}>
              <Text style={[styles.qualityBarScore, themed.qualityBarScore]}>{qualityResult.score}%</Text>
              <Text style={[styles.qualityBarTier, themed.qualityBarTier]}>{qualityResult.tierLabel}</Text>
              <Pressable
                hitSlop={8}
                onPress={() => setQualityTipsExpanded((v) => !v)}
                style={({ pressed }) => [styles.qualityTipsToggle, pressed && { opacity: 0.85 }]}
                accessibilityRole="button"
                accessibilityLabel={qualityTipsExpanded ? t('listing.edit.hideTips') : t('listing.edit.showTips')}
              >
                <Text style={[styles.qualityTipsLabel, themed.qualityTipsLabel]}>{t('listing.edit.tipsToImprove')}</Text>
                <AppIcon name={qualityTipsExpanded ? 'chevron-up' : 'chevron-down'} size={12} color="brand" opticalCenter accessible={false} />
              </Pressable>
            </View>
          </View>
          <View style={styles.qualityBarTrack}>
            <View style={[styles.qualityBarFill, { width: `${qualityResult.score}%`, backgroundColor: colors.brand }]} />
          </View>
          {qualityTipsExpanded && qualityResult.missingItems.length > 0 && (
            <Reanimated.View
              entering={reducedMotion ? undefined : FadeIn.duration(200)}
              exiting={reducedMotion ? undefined : FadeOut.duration(200)}
              style={[styles.qualityTipsRow, themed.qualityTipsRow]}
            >
              {qualityResult.missingItems.slice(0, 6).map((item) => (
                <View key={item.key} style={styles.qualityTipChip}>
                  <AppIcon name={item.icon} size={12} color="textMuted" opticalCenter accessible={false} />
                  <Text style={[styles.qualityTipsText, themed.qualityTipsText]}>{item.label}</Text>
                </View>
              ))}
            </Reanimated.View>
          )}
          {qualityTipsExpanded && qualityResult.tips.length > 0 && (
            <Reanimated.View
              entering={reducedMotion ? undefined : FadeIn.duration(200)}
              exiting={reducedMotion ? undefined : FadeOut.duration(200)}
              style={styles.qualityTipsList}
            >
              {qualityResult.tips.slice(0, 4).map((tip, i) => (
                <View key={i} style={styles.qualityTipBulletRow}>
                  <Text style={[styles.qualityTipBullet, themed.qualityTipsText]}>•</Text>
                  <Text style={[styles.qualityTipsText, themed.qualityTipsText]}>{tip}</Text>
                </View>
              ))}
            </Reanimated.View>
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
          saveState={saveState}
        />
      )}

      <BottomSheetPicker
        visible={pickerMode !== null}
        onClose={() => setPickerMode(null)}
        title={pickerMode ?? t('listing.edit.select')}
        options={getPickerOptions()}
        selectedValue={getPickerSelected()}
        onSelect={handlePickerSelect}
        searchable={pickerMode === 'Brand'}
      />

      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel}
        cancelLabel={confirmSheet.cancelLabel}
        onConfirm={() => { confirmSheet.onConfirm(); setConfirmSheet((s) => ({ ...s, visible: false })); }}
        variant={confirmSheet.variant}
      />

      {/* ── Restore unsaved draft prompt ── */}
      {restoreSheet && (
        <ConfirmationSheet
          visible={restoreSheet.visible}
          onDismiss={handleDiscardDraft}
          title={t('listing.edit.draftFound')}
          message={t('listing.edit.draftRestore', { date: new Date(restoreSheet.draft.savedAt).toLocaleString() })}
          confirmLabel={t('listing.edit.draftRestoreAction')}
          cancelLabel={t('listing.edit.draftDiscard')}
          onConfirm={handleRestoreDraft}
          onCancel={handleDiscardDraft}
        />
      )}

      {/* ── Conflict resolution sheet ──
          Three options: keep my changes (force save), use their changes
          (reload), or compare. Compare re-fetches and reloads so the user
          can see the server version before deciding whether to re-apply. */}
      {conflictSheet && (
        <BottomSheet
          visible={conflictSheet.visible}
          onDismiss={() => setConflictSheet(null)}
          variant="transaction"
          snapPoint={0.46}
        >
          <View style={styles.conflictContainer} accessibilityRole="alert" accessibilityLiveRegion="assertive">
            <Text style={[styles.conflictTitle, { color: colors.textPrimary }]} accessibilityRole="header">
              {t('listing.edit.conflictTitle')}
            </Text>
            <Text style={[styles.conflictMessage, { color: colors.textSecondary }]}>
              {t('listing.edit.conflictMessage')}
            </Text>
            <View style={styles.conflictActions}>
              <AppButton
                title={t('listing.edit.conflictKeepMine')}
                onPress={conflictSheet.onKeepMine}
                variant="primary"
                size="lg"
                style={styles.conflictBtn}
                accessibilityLabel={t('listing.edit.conflictKeepMine')}
              />
              <AppButton
                title={t('listing.edit.conflictUseTheirs')}
                onPress={conflictSheet.onUseTheirs}
                variant="ghost"
                size="md"
                accessibilityLabel={t('listing.edit.conflictUseTheirs')}
              />
              <AppButton
                title={t('listing.edit.conflictCompare')}
                onPress={conflictSheet.onUseTheirs}
                variant="ghost"
                size="md"
                accessibilityLabel={t('listing.edit.conflictCompare')}
              />
            </View>
          </View>
        </BottomSheet>
      )}
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  navStatusText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  navStatusUnsaved: {
    fontFamily: Typography.family.semibold },
  scroll: {
    flex: 1 },
  scrollContent: {
    paddingBottom: Space.md },
  loadingContainer: {
    flex: 1,
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    gap: Space.md },
  skeletonFormGap: {
    gap: Space.sm },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
    paddingHorizontal: Space.xl },
  errorTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  retryBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: Radius.xxl },
  retryBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm },
  statusDot: {
    width: Space.sm,
    height: Space.sm,
    borderRadius: Radius.sm },
  statusDotActive: {},
  statusText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  restrictedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm },
  restrictedText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  sectionGroup: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg },
  sectionHeading: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Space.sm },
  fieldGroup: {
    paddingVertical: Space.xs },
  fieldLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginBottom: Space.xs },
  fieldInput: {
    fontSize: Typography.size.bodyLarge,
    fontFamily: Typography.family.regular,
    paddingVertical: Space.sm,
    minHeight: Control.hit + Space.sm },
  fieldInputDisabled: {
    opacity: 0.5 },
  hairline: {
    height: Stroke.hairline,
    marginVertical: Space.xs },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    minHeight: Control.hit + Space.sm },
  pickerRowInner: {
    flex: 1 },
  pickerValue: {
    fontSize: Typography.size.bodyLarge,
    fontFamily: Typography.family.regular },
  pickerPlaceholder: {},
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center' },
  currencySymbol: {
    fontSize: Typography.size.bodyLarge,
    fontFamily: Typography.family.bold,
    marginRight: Space.xs + 2 },
  priceInput: {
    flex: 1,
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily },
  discountPreview: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: Space.xs },
  descInput: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    minHeight: Space.xxl + Space.xxl + Space.sm,
    paddingVertical: Space.sm,
    lineHeight: TypographyV2.bodyStrong.lineHeight + 1 },
  charCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    textAlign: 'right' },
  inlineErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm },
  inlineErrorText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },

  /* -- photo guidance card -- */
  photoGuideCard: {
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth },
  photoGuideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  photoGuideTitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  photoGuideMin: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  photoGuideTips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm + 2,
    marginTop: Space.sm },
  photoGuideTipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  photoGuideTip: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },

  /* -- price suggestion block -- */
  priceSuggestionBlock: {
    marginTop: Space.xs,
    gap: 0 },
  soldCompsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
    paddingVertical: Space.xs },
  soldCompsText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    flex: 1 },
  soldCompsAction: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },

  /* -- field validation -- */
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs },
  fieldRequiredHint: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },

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
    fontFamily: TypographyV2.meta.fontFamily },
  completenessHint: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },

  /* -- compact quality bar (fixed above footer) -- */
  qualityBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
    gap: Space.xs },
  qualityBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between' },
  qualityBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  qualityBarLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  qualityBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  qualityBarScore: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily },
  qualityBarTier: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  qualityTipsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 },
  qualityTipsLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  qualityBarTrack: {
    height: Stroke.emphasis,
    borderRadius: Radius.sm,
    backgroundColor: 'transparent',
    overflow: 'hidden' },
  qualityBarFill: {
    height: '100%',
    borderRadius: Radius.sm },
  qualityTipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs + 1,
    paddingVertical: Space.xs,
    paddingHorizontal: Space.sm,
    borderRadius: Radius.sm,
    marginTop: Space.xs },
  qualityTipChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1 },
  qualityTipsList: {
    gap: Space.xs - 1,
    marginTop: Space.xs },
  qualityTipBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.xs + 2 },
  qualityTipBullet: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
  qualityTipsText: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    lineHeight: TypographyV2.meta.lineHeight - 1 },

  /* -- conflict resolution sheet -- */
  conflictContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: Space.lg },
  conflictTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    marginBottom: Space.sm },
  conflictMessage: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    marginBottom: Space.lg },
  conflictActions: {
    gap: Space.sm },
  conflictBtn: {
    borderRadius: Radius.lg,
    marginBottom: Space.xs } });
