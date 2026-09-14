import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';

import { RootStackParamList } from '../navigation/types';
import { useConnectivity } from '../hooks/useConnectivity';
import { Space, DockConstants } from '../theme/designTokens';
import { haptics } from '../utils/haptics';
import { sanitizeDecimalInput } from '../utils/currencyAuthoringFlows';
import { useTaxonomy } from '../context/TaxonomyContext';
import { t } from '../i18n';

import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { ListingMediaStudio } from '../components/listing/ListingMediaStudio';
import { ListingCameraSheet } from '../components/listing/ListingCameraSheet';
import { EditListingFooter } from '../components/listing/EditListingFooter';
import { EditListingLoadingState, EditListingErrorState } from '../components/listing/EditListingStates';
import { EditListingStatusStrip } from '../components/listing/EditListingStatusStrip';
import { EditListingDetailsSection } from '../components/listing/EditListingDetailsSection';
import { EditListingPricingSection } from '../components/listing/EditListingPricingSection';
import { EditListingDescriptionSection } from '../components/listing/EditListingDescriptionSection';
import { EditListingShippingSection } from '../components/listing/EditListingShippingSection';
import { EditListingInlineError, EditListingCompletenessRow } from '../components/listing/EditListingFeedbackRows';
import { editListingStyles as styles, useEditListingThemedStyles } from '../components/listing/editListingStyles';
import type {
  EditListingPickerMode,
  EditListingSectionFocus,
} from '../components/listing/editListingViewModels';
import type { ListingApiItem } from '../services/listingsApi';
import {
  useEditListingForm,
  useEditListingMedia,
  useEditListingData,
  useEditListingDerived,
  useEditListingSave,
} from '../hooks/listing';
import { KeyboardAwareScrollView, type KeyboardAwareScrollViewRef } from '../platform/keyboard/KeyboardProvider';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';

type RouteT = RouteProp<RootStackParamList, 'EditListing'>;

interface EditListingRouteParams {
  itemId: string;
  focus?: EditListingSectionFocus;
}

/**
 * Edit-listing orchestrator — owns hook composition, deep-link focus
 * scrolling, preview/discard navigation and the sheet surfaces. All domain
 * logic lives in `hooks/listing/` (form, media, data, derived, save) and
 * all rendering in `components/listing/` sections.
 */
export default function EditListingScreen() {
  const insets = useSafeAreaInsets();
  const themed = useEditListingThemedStyles();
  const { isOffline } = useConnectivity();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteT>();
  const { itemId, focus } = route.params as EditListingRouteParams;

  /* ── domain hooks ── */
  const form = useEditListingForm();
  const media = useEditListingMedia(itemId, form.setErrorMsg);
  const hydrate = useCallback((l: ListingApiItem) => {
    form.hydrate(l);
    media.hydrate(l);
  }, [form.hydrate, media.hydrate]);
  const { listing, isLoading, loadError, retry } = useEditListingData({ itemId, onHydrate: hydrate });
  const derived = useEditListingDerived({
    itemId,
    listing,
    values: form.values,
    mediaItems: media.mediaItems,
    removedRemoteIds: media.removedRemoteIds,
    remoteMediaOrder: media.remoteMediaOrder,
    initialRemoteOrder: media.initialRemoteOrder,
  });
  const { isSaving, saveStage, handleSave } = useEditListingSave({
    itemId,
    isOwner: derived.isOwner,
    values: form.values,
    mediaItems: media.mediaItems,
    removedRemoteIds: media.removedRemoteIds,
    uploadQueueRef: media.uploadQueueRef,
    setMediaItems: media.setMediaItems,
    setErrorMsg: form.setErrorMsg,
    validate: derived.validate,
  });

  const { isOwner, hasChanges, completeness, completenessLabel, recommendedLabel,
    hasDiscount, discountPercent, soldComps, hasValidPrice, priceVsMarket,
    listingStatusLabel, isEditingRestricted } = derived;

  /* ── taxonomy options for the picker sheet ── */
  const { categories, conditions, sizes, brands } = useTaxonomy();
  const categoryOptions = useMemo(
    () => categories.filter((n) => n.parentId === null).map((n) => n.name),
    [categories],
  );
  const conditionOptions = useMemo(() => conditions.map((n) => n.name), [conditions]);
  const sizeOptions = useMemo(() => sizes.map((n) => n.name), [sizes]);
  const brandOptions = useMemo(() => brands.map((n) => n.name), [brands]);

  /* ── focus scroll (ManageListing deep-links: price / shipping / format) ── */
  const scrollRef = useRef<KeyboardAwareScrollViewRef | null>(null);
  const sectionYRef = useRef<Partial<Record<EditListingSectionFocus, number>>>({});
  const trackSectionY = useCallback((key: EditListingSectionFocus) => (e: { nativeEvent: { layout: { y: number } } }) => {
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

  /* ── discard confirmation ── */
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => void;
    variant: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel', onConfirm: () => {}, variant: 'default' });

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

  /* ── preview handler ── */
  const handlePreview = useCallback(() => {
    haptics.press();
    const v = form.values;
    const photos = media.mediaItems.map((m) => m.publicUrl || m.uri);
    navigation.navigate('ListingPreview', {
      preview: {
        title: v.title.trim(),
        price: Number(sanitizeDecimalInput(v.price)) || undefined,
        originalPrice: v.originalPrice ? Number(sanitizeDecimalInput(v.originalPrice)) : undefined,
        brand: v.brand || undefined,
        condition: v.condition || undefined,
        category: v.category || undefined,
        size: v.size || undefined,
        description: v.description.trim() || undefined,
        photos,
        shippingMethod: v.shippingMethod || undefined,
        shippingPayer: v.shippingPayer || undefined },
      origin: 'edit' });
  }, [form.values, media.mediaItems, navigation]);

  /* ── picker helpers ── */
  const { pickerMode, setPickerMode } = form;
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
      case 'Category': return form.category;
      case 'Brand': return form.brand;
      case 'Size': return form.size;
      case 'Condition': return form.condition;
      default: return undefined;
    }
  }, [pickerMode, form.category, form.brand, form.size, form.condition]);

  const handlePickerSelect = useCallback((val: string) => {
    if (pickerMode === 'Category') form.setCategory(val);
    if (pickerMode === 'Brand') form.setBrand(val);
    if (pickerMode === 'Size') form.setSize(val);
    if (pickerMode === 'Condition') form.setCondition(val);
    setPickerMode(null);
    haptics.selection();
  }, [pickerMode, form.setCategory, form.setBrand, form.setSize, form.setCondition, setPickerMode]);

  const saveDisabled = !hasChanges || isSaving;

  /* ── loading state ── */
  if (isLoading) {
    return (
      <FlagshipScreen header={<FlagshipHeader title={t('listing.create.editTitle')} onBack={() => navigation.goBack()} />}>
        <EditListingLoadingState />
      </FlagshipScreen>
    );
  }

  if (loadError) {
    return (
      <FlagshipScreen header={<FlagshipHeader title={t('listing.create.editTitle')} onBack={() => navigation.goBack()} />}>
        <EditListingErrorState onRetry={retry} />
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
              items={media.mediaItems}
              queueItems={media.queueState.items}
              maxCount={10}
              onPickFromLibrary={media.handlePickFromLibrary}
              onPickFromCamera={media.handlePickFromCamera}
              onReorder={media.handleReorder}
              onRemoveItem={media.handleRemoveItem}
              onRetryItem={media.handleRetryItem}
              onTransformItem={media.handleTransformItem}
              canRemoveItem={media.canRemoveItem}
              reorderEnabled={true}
              lockedNote={t('listing.edit.lockedPhotos')}
              removeLabel={t('listing.edit.remove')}
              isOffline={isOffline}
            />
          ) : (
            <ListingMediaStudio
              items={media.mediaItems}
              queueItems={media.queueState.items}
              maxCount={10}
              onReorder={media.handleReorder}
              onRemoveItem={media.handleRemoveItem}
              onRetryItem={media.handleRetryItem}
              onPickFromLibrary={media.handlePickFromLibrary}
              onPickFromCamera={media.handlePickFromCamera}
              reorderEnabled={true}
              canRemoveItem={() => false}
              lockedNote={t('listing.edit.noPermission')}
              isOffline={isOffline}
            />
          )}

          {/* ── 3. LISTING STATUS/CONTEXT ── */}
          <EditListingStatusStrip
            statusLabel={listingStatusLabel}
            statusActive={listing?.status === 'active'}
            isEditingRestricted={isEditingRestricted}
          />

          {/* ── 4. DETAILS ── */}
          <EditListingDetailsSection
            title={form.title}
            onChangeTitle={form.setTitle}
            category={form.category}
            brand={form.brand}
            size={form.size}
            condition={form.condition}
            brandlessValid={completeness.policy.brandlessValid}
            sizelessValid={completeness.policy.sizelessValid}
            isEditingRestricted={isEditingRestricted}
            onOpenPicker={setPickerMode}
            onFormatLayout={trackSectionY('format')}
          />

          {/* ── 5. PRICING ── */}
          <EditListingPricingSection
            price={form.price}
            onChangePrice={(v) => form.setPrice(sanitizeDecimalInput(v))}
            originalPrice={form.originalPrice}
            onChangeOriginalPrice={(v) => form.setOriginalPrice(sanitizeDecimalInput(v))}
            hasValidPrice={hasValidPrice}
            hasDiscount={hasDiscount}
            discountPercent={discountPercent}
            soldComps={soldComps}
            priceVsMarket={priceVsMarket}
            isEditingRestricted={isEditingRestricted}
            onSectionLayout={trackSectionY('price')}
          />

          {/* ── 6. DESCRIPTION ── */}
          <EditListingDescriptionSection
            description={form.description}
            onChangeDescription={form.setDescription}
            isEditingRestricted={isEditingRestricted}
          />

          {/* ── 7. SHIPPING ── */}
          <EditListingShippingSection
            shippingMethod={form.shippingMethod}
            onToggleShippingMethod={() => form.setShippingMethod(form.shippingMethod === 'standard' ? 'express' : 'standard')}
            shippingPayer={form.shippingPayer}
            onToggleShippingPayer={() => form.setShippingPayer(form.shippingPayer === 'buyer' ? 'seller' : 'buyer')}
            isEditingRestricted={isEditingRestricted}
            onSectionLayout={trackSectionY('shipping')}
          />

          {/* ── 8. SAVE/UPDATE FEEDBACK ── */}
          <EditListingInlineError errorMsg={form.errorMsg} saveStage={saveStage} />
          <EditListingCompletenessRow
            canActivate={completeness.canActivate}
            completenessLabel={completenessLabel}
            recommendedLabel={recommendedLabel}
          />

          <View style={{ height: DockConstants.singleActionHeight }} />
        </KeyboardAwareScrollView>

      {/* ── 9. STICKY PREVIEW/SAVE FOOTER ── */}
      {isOwner && (
        <EditListingFooter
          isSaving={isSaving}
          saveDisabled={saveDisabled}
          saveStage={saveStage}
          errorMsg={form.errorMsg || null}
          onPreview={handlePreview}
          onSave={handleSave}
          bottomInset={insets.bottom}
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

      {/* Flagship camera sheet — replaces system camera for listing photos */}
      <ListingCameraSheet
        visible={media.cameraSheetVisible}
        onClose={() => media.setCameraSheetVisible(false)}
        onCapture={media.handleCameraCapture}
        maxPhotos={10 - media.mediaItems.length}
      />
    </FlagshipScreen>
  );
}
