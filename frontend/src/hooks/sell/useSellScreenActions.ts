import { useCallback, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';

import { sanitizeDecimalInput } from '../../utils/currencyAuthoringFlows';
import {
  getPickerOptionsForMode,
  sanitizeShareCountInput,
} from '../../utils/sellScreenLogic';
import { haptics } from '../../utils/haptics';
import {
  convertPickerAsset,
  convertCaptureUri,
  validateMediaAssets,
  type ListingMediaDraftItem,
  type MediaUploadAsset,
} from '../../utils/mediaUploadAsset';
import { t } from '../../i18n';
import {
  getListingModeFromLabel,
  getListingModeLabel,
} from '../../components/listing/ListingModeSelector';
import type { AutocompleteSuggestion } from '../../services/searchAutocompleteApi';

import { useListingPublishPipeline } from './useListingPublishPipeline';
import type { SellScreenDataResult } from './useSellScreenData';
import type { SellScreenFormResult } from './useSellScreenForm';

export interface SellScreenActionsParams {
  data: SellScreenDataResult;
  form: SellScreenFormResult;
}

export interface SellScreenActionsResult {
  // Tag handlers
  handleTagSubmit: () => void;
  removeTag: (tag: string) => void;
  handleTagSuggestionPick: (suggestion: AutocompleteSuggestion) => void;

  // Autofill
  handleApplyAutofill: () => void;

  // Photo/media handlers
  handlePickFromLibrary: () => Promise<void>;
  handlePickFromCamera: () => Promise<void>;
  handleCameraCapture: (uris: string[]) => void;
  cameraSheetVisible: boolean;
  setCameraSheetVisible: (visible: boolean) => void;
  removeItem: (itemId: string) => void;
  handleRetryItem: (itemId: string) => void;
  handleReorderIds: (newOrderedIds: string[]) => void;
  handleSetCover: (itemId: string) => void;
  handleTransformItem: (itemId: string, transformedUri: string) => void;

  // Price handlers
  handlePriceChange: (text: string) => void;
  handleShareCountChange: (value: string) => void;

  // Picker handlers
  getPickerOptions: () => string[];
  getPickerSelected: () => string;
  handlePickerSelect: (val: string) => void;

  // Preview
  handlePreview: () => void;

  // Publish pipeline
  isPublishing: boolean;
  publicationStage: ReturnType<typeof useListingPublishPipeline>['publicationStage'];
  handlePublish: () => Promise<void>;
  publishDisabled: boolean;
}

/**
 * Owns the action domain for the sell screen: all useCallback handlers for
 * image picking, tag management, autofill, picker selection, price input,
 * preview navigation, and the listing publish pipeline. Receives the data
 * and form results so actions can read current state and dispatch updates
 * without re-declaring any state ownership.
 */
export function useSellScreenActions(params: SellScreenActionsParams): SellScreenActionsResult {
  const { data, form } = params;
  const {
    values, setters, photos, mediaDraftItems, setMediaDraftItems, setPhotos,
    uploadQueueRef, setErrors, setErrorMsg,
    pickerMode, setPickerMode, autofillSuggestion, setAutofillDismissed,
    setTagSuggestions, setTagSuggestionsVisible,
    navigation, updateSellDraft, currentUser, isOffline, pickerTaxonomy,
  } = data;

  const {
    title, desc, price, originalPrice, tags, tagInput, category, brand, size, condition,
    shippingMethod, shippingPayer, listingMode, coOwnEnabled,
    shareCountInput, sharePriceInput, offeringWindowHours, authPhotos,
    startingBid,
  } = values;

  const {
    setTitle, setBrand, setCategory, setTags, setTagInput,
    setPrice, setShareCountInput, setListingMode,
    setAuthPhotos,
  } = setters;

  const { completeness, publishReady } = form;

  // ── Flagship camera sheet state ──
  // Replaces the system camera (ImagePicker.launchCameraAsync) with the
  // in-app CreatorCamera via ListingCameraSheet. The sheet is rendered by
  // SellScreen and controlled by this visibility state.
  const [cameraSheetVisible, setCameraSheetVisible] = useState(false);

  /* -- autofill -- */
  const handleApplyAutofill = useCallback(() => {
    if (autofillSuggestion.title && !title) setTitle(autofillSuggestion.title);
    if (autofillSuggestion.brand && !brand) setBrand(autofillSuggestion.brand);
    if (autofillSuggestion.category && !category) setCategory(autofillSuggestion.category);
    setAutofillDismissed(true);
    haptics.tap();
  }, [autofillSuggestion, title, brand, category, setTitle, setBrand, setCategory, setAutofillDismissed]);

  /* -- tag handling -- */
  const handleTagSubmit = useCallback(() => {
    const raw = tagInput.trim().toLowerCase();
    if (!raw) return;
    const parts = raw.split(/[,\s]+/).filter(Boolean);
    const next = [...new Set([...tags, ...parts])].slice(0, 8);
    setTags(next);
    setTagInput('');
    haptics.tap();
  }, [tagInput, tags, setTags, setTagInput]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((x) => x !== tag));
  }, [setTags]);

  const handleTagSuggestionPick = useCallback((suggestion: AutocompleteSuggestion) => {
    const raw = suggestion.query.trim().toLowerCase();
    if (!raw) return;
    const parts = raw.split(/[,\s]+/).filter(Boolean);
    setTags((prev) => [...new Set([...prev, ...parts])].slice(0, 8));
    setTagInput('');
    setTagSuggestions([]);
    setTagSuggestionsVisible(false);
    haptics.tap();
  }, [setTags, setTagInput, setTagSuggestions, setTagSuggestionsVisible]);

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
  }, [listingMode, coOwnEnabled, authPhotos.length, setMediaDraftItems, setPhotos, setAuthPhotos]);

  const handlePickFromLibrary = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setErrorMsg(t('listing.create.errorGalleryAccess'));
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
      setErrorMsg(t('listing.create.errorPhotoLibrary'));
    }
  }, [appendPhotoAsset, mediaDraftItems, setErrorMsg]);

  const handlePickFromCamera = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setErrorMsg(t('listing.create.errorCameraAccess'));
        return;
      }
      // Open the flagship CreatorCamera sheet instead of the system camera.
      setCameraSheetVisible(true);
    } catch (e) {
      setErrorMsg(t('listing.create.errorCamera'));
    }
  }, [setErrorMsg]);

  // Process URIs captured from ListingCameraSheet / CreatorCamera.
  const handleCameraCapture = useCallback((uris: string[]) => {
    if (uris.length === 0) return;
    const assets = uris.map(convertCaptureUri);
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
      setErrorMsg(validation.errors.map((e) => e.message).join('. '));
    }
    for (const a of validation.assets) {
      appendPhotoAsset(a);
    }
    if (validation.assets.length > 0) {
      haptics.success();
    }
    setCameraSheetVisible(false);
  }, [appendPhotoAsset, mediaDraftItems, setErrorMsg]);

  const removeItem = useCallback((itemId: string) => {
    setMediaDraftItems((prev) => {
      const item = prev.find((m) => m.id === itemId);
      if (!item) return prev;
      const removedUri = item.publicUrl || item.uri;
      setPhotos((ps) => ps.filter((u) => u !== removedUri));
      return prev.filter((m) => m.id !== itemId);
    });
    haptics.tap();
  }, [setMediaDraftItems, setPhotos]);

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
  }, [uploadQueueRef, setMediaDraftItems]);

  const handleReorderIds = useCallback((newOrderedIds: string[]) => {
    setMediaDraftItems((prev) => {
      const itemMap = new Map(prev.map((m) => [m.id, m]));
      const reordered = newOrderedIds.map((id) => itemMap.get(id)).filter(Boolean) as ListingMediaDraftItem[];
      setPhotos(reordered.map((m) => m.publicUrl || m.uri));
      return reordered;
    });
    haptics.tap();
  }, [setMediaDraftItems, setPhotos]);

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
  }, [setMediaDraftItems, setPhotos]);

  // ── Transform item (crop/rotate/flip) ──
  // Replaces the item's URI with the transformed result and syncs the
  // photos array. The upload pipeline picks up the new URI on publish.
  const handleTransformItem = useCallback((itemId: string, transformedUri: string) => {
    setMediaDraftItems((prev) => {
      const next = prev.map((m) =>
        m.id === itemId
          ? { ...m, uri: transformedUri, publicUrl: undefined, status: 'draft' as const }
          : m
      );
      setPhotos(next.map((m) => m.publicUrl || m.uri));
      return next;
    });
  }, [setMediaDraftItems, setPhotos]);

  /* -- price handlers -- */
  const handlePriceChange = useCallback((text: string) => {
    setPrice(sanitizeDecimalInput(text));
  }, [setPrice]);

  const handleShareCountChange = useCallback((value: string) => {
    setShareCountInput(sanitizeShareCountInput(value));
  }, [setShareCountInput]);

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

  const publishDisabled = isPublishing || !publishReady;

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
    if (pickerMode === 'Size') { setters.setSize(val); updateSellDraft({ size: val }); }
    if (pickerMode === 'Condition') { setters.setCondition(val); updateSellDraft({ condition: val }); }
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
  }, [pickerMode, updateSellDraft, setCategory, setBrand, setters, setListingMode, setPickerMode]);

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
        listingMode },
      origin: 'sell' });
  }, [title, price, originalPrice, brand, condition, category, size, desc, photos, shippingMethod, shippingPayer, listingMode, navigation]);

  return {
    handleTagSubmit,
    removeTag,
    handleTagSuggestionPick,
    handleApplyAutofill,
    handlePickFromLibrary,
    handlePickFromCamera,
    handleCameraCapture,
    cameraSheetVisible,
    setCameraSheetVisible,
    removeItem,
    handleRetryItem,
    handleReorderIds,
    handleSetCover,
    handleTransformItem,
    handlePriceChange,
    handleShareCountChange,
    getPickerOptions,
    getPickerSelected,
    handlePickerSelect,
    handlePreview,
    isPublishing,
    publicationStage,
    handlePublish,
    publishDisabled,
  };
}
