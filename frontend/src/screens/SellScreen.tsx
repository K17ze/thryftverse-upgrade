import React, { useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useAppTheme } from '../theme/ThemeContext';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { Space, Radius, FontFamily, DockConstants, Stroke, Control } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { RadiusRoleValue } from '../theme/surfaceRadiusRules';
import { BottomSheetPicker } from '../components/BottomSheetPicker';
import { AppIcon } from '../components/common/AppIcon';
import { AppIconButton } from '../components/common/AppIconButton';
import { IconSize } from '../theme/iconTokens';
import { useIsGuest } from '../store/useStore';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useA11yAudit } from '../hooks/useA11yAudit';
import { DebouncedTextInput } from '../components/ui/DebouncedTextInput';
import { sanitizeDecimalInput, calculatePlatformChargeGbp } from '../utils/currencyAuthoringFlows';
import {
  buildContextualPhotoPrompts,
  formatShippingSummary,
  formatReviewSummary } from '../utils/sellScreenLogic';
import { haptics } from '../utils/haptics';
import { ListingMediaStudio } from '../components/listing/ListingMediaStudio';
import { ListingCameraSheet } from '../components/listing/ListingCameraSheet';
import { EmptyState } from '../components/EmptyState';
import { ListingModeSelector } from '../components/listing/ListingModeSelector';
import { ListingPublishFooter } from '../components/listing/ListingPublishFooter';
import { ListingQualityMeter } from '../components/sell/ListingQualityMeter';
import { scoreListing } from '../services/listingQualityApi';
import type { ListingCondition } from '../contracts/taxonomy';
import { KeyboardAwareScrollView } from '../platform/keyboard/KeyboardProvider';
import { t } from '../i18n';
import { useSellScreenData, useSellScreenForm, useSellScreenActions } from '../hooks/sell';
import AuctionFieldsSection from '../components/sell/AuctionFieldsSection';
import ShippingPickerSheet from '../components/sell/ShippingPickerSheet';
import TagInputWithSuggestions from '../components/sell/TagInputWithSuggestions';

export default function SellScreen() {
  const a11yRef = useRef<any>(null);
  useA11yAudit(a11yRef, 'SellScreen');
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useAppTheme();
  const isGuest = useIsGuest();
  const reducedMotion = useReducedMotion();

  // ── Domain hooks (3-hook pattern: data → form → actions) ──
  const data = useSellScreenData({ isGuest });
  const form = useSellScreenForm({
    values: data.values,
    photos: data.photos,
    soldComps: data.soldComps,
    errors: data.errors,
    errorMsg: data.errorMsg,
    setErrors: data.setErrors,
    setErrorMsg: data.setErrorMsg,
  });
  const actions = useSellScreenActions({ data, form });

  // ── Destructure for render ──
  const {
    navigation,
    values,
    setters,
    photos,
    mediaDraftItems,
    queueState,
    errors,
    setErrors,
    errorMsg,
    pickerMode,
    setPickerMode,
    autofillSuggestion,
    autofillDismissed,
    setAutofillDismissed,
    photoGuideCollapsed,
    setPhotoGuideCollapsed,
    draftSavedVisible,
    currency,
    currencySymbol,
    tagSuggestions,
    tagSuggestionsVisible,
    setTagSuggestionsVisible,
    setTagSuggestions,
    soldComps,
    hasDraftContent,
    aiListingAssistEnabled,
  } = data;

  const {
    title, desc, price, originalPrice, tags, tagInput, category, brand, size, condition,
    shippingMethod, shippingPayer, shippingSheetOpen, listingMode,
    shareCountInput, sharePriceInput, offeringWindowHours, authPhotos,
    startingBid, reservePrice, auctionDurationHours,
  } = values;

  const {
    setTitle, setDesc, setOriginalPrice, setTagInput,
    setShippingMethod, setShippingPayer, setShippingSheetOpen,
    setSharePriceInput, setOfferingWindowHours,
    setAuthPhotos, setStartingBid, setReservePrice, setAuctionDurationHours,
  } = setters;

  const {
    completeness,
    publishReady,
    completenessLabel,
    recommendedLabel,
    hasValidPrice,
    numericPrice,
    hasValidStartingBid,
    numericStartingBid,
    parsedShareCount,
    parsedSharePrice,
    priceVsMarket,
    hasDiscount,
    discountPercent,
  } = form;

  // G9: Photo quality gating — compute a listing quality score from the
  // current draft so sellers get actionable feedback before publishing.
  // Only shown when there's enough content to score (at least a title or
  // one photo). The meter renders inline above the publish footer.
  const qualityScore = useMemo(() => {
    if (!title.trim() && photos.length === 0) return null;
    return scoreListing({
      title,
      description: desc,
      price: numericPrice,
      images: photos,
      category,
      brand,
      size,
      condition: (condition || null) as ListingCondition | null,
    });
  }, [title, desc, numericPrice, photos, category, brand, size, condition]);

  const {
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
  } = actions;

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
    autofillChipLabel: { color: colors.textMuted },
    autofillChipValue: { color: colors.textPrimary },
    autofillApplyBtn: { borderColor: colors.brandBorder, backgroundColor: colors.brandSubtle } }), [colors]);

  return (
    <SafeAreaView ref={a11yRef} testID="sell-screen" style={[styles.root, themed.root]} edges={['top']}>
        {/* -- 1. COMPACT NAVIGATION HEADER -- */}
        <View style={[styles.navHeader, themed.navHeader, { paddingTop: 0 }]}>
          <AppIconButton
            name="close"
            size={IconSize.md}
            color="textPrimary"
            onPress={() => navigation.goBack()}
            accessibilityLabel="Close and go back"
          />
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
                <AppIcon name="verified" focused size={IconSize.micro} color="success" opticalCenter accessible={false} />
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
              <AppIcon name="document" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
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
              icon="camera"
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
              onTransformItem={handleTransformItem}
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
                <AnimatedPressable
                  style={styles.photoAssistantToggle}
                  scaleValue={0.98}
                  hapticFeedback="light"
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() => setPhotoGuideCollapsed((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={photoGuideCollapsed ? 'Expand photo tips' : 'Collapse photo tips'}
                  accessibilityHint="Tips for taking great listing photos"
                >
                  <AppIcon name="camera" size={IconSize.sm} color="textSecondary" opticalCenter accessible={false} />
                  <Text style={[styles.photoAssistantToggleText, { color: colors.textSecondary }]}>
                    {t('listing.create.photoTips')}
                  </Text>
                  <AppIcon name={photoGuideCollapsed ? 'chevronDown' : 'chevronUp'} size={IconSize.micro} color="textMuted" opticalCenter accessible={false} />
                </AnimatedPressable>
              );
            }

            if (prompts.length === 0 && !needsMore) return null;

            return (
              <View style={styles.contextualPrompts}>
                {needsMore && (
                  <View style={styles.contextualPromptRow}>
                    <AppIcon name="camera" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
                    <Text style={[styles.contextualPromptText, { color: colors.textSecondary }]}>
                      {t('listing.create.addMorePhotos', { count: 3 - count, plural: 3 - count > 1 ? 's' : '' })}
                    </Text>
                  </View>
                )}
                {prompts.map((prompt, i) => (
                  <View key={i} style={styles.contextualPromptRow}>
                    <AppIcon name={prompt.icon as any} size={IconSize.sm} color="brand" opticalCenter accessible={false} />
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
                <AppIcon name="bulb-outline" size={IconSize.micro} color="textMuted" opticalCenter accessible={false} />
                <Text style={[styles.photoAssistantTip, { color: colors.textMuted }]}>{t('listing.create.photoTipLighting')}</Text>
              </View>
              <View style={styles.contextualPromptRow}>
                <AppIcon name="camera" size={IconSize.micro} color="textMuted" opticalCenter accessible={false} />
                <Text style={[styles.photoAssistantTip, { color: colors.textMuted }]}>{t('listing.create.photoTipAngles')}</Text>
              </View>
              <View style={styles.contextualPromptRow}>
                <AppIcon name="image-outline" size={IconSize.micro} color="textMuted" opticalCenter accessible={false} />
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
              <AnimatedPressable
                style={styles.sellQuickAction}
                scaleValue={0.98}
                hapticFeedback="light"
                onPress={() => navigation.navigate('BulkListing')}
                accessibilityRole="button"
                accessibilityLabel="Bulk listing — list multiple items at once"
                accessibilityHint="Opens the bulk listing tool"
              >
                <AppIcon name="copy" size={IconSize.lg} color="brand" opticalCenter accessible={false} />
                <Text style={[styles.sellQuickActionLabel, { color: colors.textSecondary }]}>{t('listing.create.bulkList')}</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.sellQuickAction}
                scaleValue={0.98}
                hapticFeedback="light"
                onPress={() => navigation.navigate('InventoryManagement')}
                accessibilityRole="button"
                accessibilityLabel="Inventory dashboard"
                accessibilityHint="Opens the inventory management screen"
              >
                <AppIcon name="grid" size={IconSize.lg} color="brand" opticalCenter accessible={false} />
                <Text style={[styles.sellQuickActionLabel, { color: colors.textSecondary }]}>{t('listing.create.inventory')}</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.sellQuickAction}
                scaleValue={0.98}
                hapticFeedback="light"
                onPress={() => navigation.navigate('SellerHub')}
                accessibilityRole="button"
                accessibilityLabel="Seller hub"
                accessibilityHint="Opens the seller hub dashboard"
              >
                <AppIcon name="storefront" size={IconSize.lg} color="brand" opticalCenter accessible={false} />
                <Text style={[styles.sellQuickActionLabel, { color: colors.textSecondary }]}>{t('listing.create.hub')}</Text>
              </AnimatedPressable>
            </View>
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
                  <AppIcon name="verified" focused size={IconSize.micro} color="success" opticalCenter accessible={false} />
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
              <AppIcon name="sparkles-outline" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
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
                <AppIcon name="sparkles-outline" size={IconSize.sm} color="brand" opticalCenter accessible={false} />
                <Text style={[styles.autofillTitle, themed.autofillTitle]}>{t('listing.create.suggestedDetails')}</Text>
                <AnimatedPressable
                  hitSlop={8}
                  onPress={() => setAutofillDismissed(true)}
                  scaleValue={0.98}
                  hapticFeedback="light"
                  accessibilityLabel="Dismiss suggestions"
                  accessibilityRole="button"
                >
                  <AppIcon name="close" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
                </AnimatedPressable>
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
              <AnimatedPressable
                style={[styles.autofillApplyBtn, themed.autofillApplyBtn]}
                scaleValue={0.98}
                hapticFeedback="light"
                onPress={handleApplyAutofill}
                accessibilityLabel="Apply suggested fields"
                accessibilityRole="button"
              >
                <AppIcon name="verified" focused size={IconSize.sm} color="brand" opticalCenter accessible={false} />
                <Text style={[styles.autofillApplyText, themed.autofillApplyText]}>{t('listing.create.applyToEmptyFields')}</Text>
              </AnimatedPressable>
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

            <AnimatedPressable
              style={styles.pickerRow}
              scaleValue={0.98}
              hapticFeedback="light"
              onPress={() => setPickerMode('Category')}
              accessibilityRole="button"
              accessibilityLabel="Select category"
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.category')}</Text>
                  {category ? (
                    <AppIcon name="verified" focused size={IconSize.micro} color="success" opticalCenter accessible={false} />
                  ) : (
                    <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                  )}
                </View>
                <Text style={[styles.pickerValue, themed.pickerValue, !category && styles.pickerPlaceholder, !category && themed.pickerPlaceholder]}>
                  {category || t('listing.create.selectCategory')}
                </Text>
              </View>
              <AppIcon name="forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            </AnimatedPressable>
            {errors.category ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.category}</Text> : null}
            <View style={[styles.hairline, themed.hairline]} />

            <AnimatedPressable
              style={styles.pickerRow}
              scaleValue={0.98}
              hapticFeedback="light"
              onPress={() => setPickerMode('Brand')}
              accessibilityRole="button"
              accessibilityLabel="Select brand"
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.brand')}</Text>
                  {brand ? (
                    <AppIcon name="verified" focused size={IconSize.micro} color="success" opticalCenter accessible={false} />
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
              <AppIcon name="forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            </AnimatedPressable>
            {!brand && (
              <Text style={[styles.fieldHelper, themed.fieldHelper]}>
                {completeness.policy.brandlessValid
                  ? t('listing.create.brandHelperOptional')
                  : t('listing.create.brandHelperRequired')}
              </Text>
            )}
            <View style={[styles.hairline, themed.hairline]} />

            <AnimatedPressable
              style={styles.pickerRow}
              scaleValue={0.98}
              hapticFeedback="light"
              onPress={() => setPickerMode('Size')}
              accessibilityRole="button"
              accessibilityLabel="Select size"
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.size')}</Text>
                  {size ? (
                    <AppIcon name="verified" focused size={IconSize.micro} color="success" opticalCenter accessible={false} />
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
              <AppIcon name="forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            </AnimatedPressable>
            {errors.size ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.size}</Text> : null}
            <View style={[styles.hairline, themed.hairline]} />
          </View>

          {/* -- 5. PRICE & CONDITION (deal terms — the two fields buyers decide on) -- */}
          {/* Per 2026 research: pair price + condition as "deal terms" so the
              user sets their commercial position in one grouped section, rather
              than burying condition among classification details. */}
          <View style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, themed.sectionHeading]}>{t('listing.create.priceAndCondition')}</Text>

            <AnimatedPressable
              style={styles.pickerRow}
              scaleValue={0.98}
              hapticFeedback="light"
              onPress={() => setPickerMode('Condition')}
              accessibilityRole="button"
              accessibilityLabel="Select condition"
            >
              <View style={styles.pickerRowInner}>
                <View style={styles.fieldLabelRow}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.condition')}</Text>
                  {condition ? (
                    <AppIcon name="verified" focused size={IconSize.micro} color="success" opticalCenter accessible={false} />
                  ) : (
                    <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                  )}
                </View>
                <Text style={[styles.pickerValue, themed.pickerValue, !condition && styles.pickerPlaceholder, !condition && themed.pickerPlaceholder]}>
                  {condition || t('listing.create.selectCondition')}
                </Text>
              </View>
              <AppIcon name="forward" size={IconSize.sm} color="textMuted" opticalCenter accessible={false} />
            </AnimatedPressable>
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
                        <AppIcon name="bag-handle-outline" size={IconSize.micro} color="textMuted" opticalCenter accessible={false} />
                        <Text style={[styles.soldCompsText, themed.soldCompsText]}>
                          {t('listing.create.soldCompsRange', { min: `${currencySymbol}${soldComps.minPrice.toFixed(0)}`, max: `${currencySymbol}${soldComps.maxPrice.toFixed(0)}`, count: soldComps.sampleSize })}
                        </Text>
                      </View>
                      {soldComps.medianPrice != null && (
                        <AnimatedPressable
                          style={styles.soldCompsHint}
                          scaleValue={0.98}
                          hapticFeedback="light"
                          onPress={() => {
                            if (!price) {
                              handlePriceChange(soldComps.medianPrice!.toFixed(2));
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`Suggested price ${currencySymbol}${soldComps.medianPrice.toFixed(0)}. Tap to set suggested price.`}
                        >
                          <AppIcon name="sparkles-outline" size={IconSize.micro} color="brand" opticalCenter accessible={false} />
                          <Text style={[styles.soldCompsText, themed.priceSuggestion]}>
                            {t('listing.create.suggestedPrice', { amount: `${currencySymbol}${soldComps.medianPrice.toFixed(0)}` })}
                          </Text>
                          {!price && (
                            <Text style={[styles.soldCompsAction, themed.soldCompsAction]}>{t('listing.create.tapToSet')}</Text>
                          )}
                        </AnimatedPressable>
                      )}
                      {priceVsMarket === 'above' && (
                        <View style={styles.soldCompsHint}>
                          <AppIcon name="trending-up-outline" size={IconSize.micro} color="warning" opticalCenter accessible={false} />
                          <Text style={[styles.soldCompsText, themed.priceMarketHigh]}>
                            {t('listing.create.pricedAboveRange')}
                          </Text>
                        </View>
                      )}
                      {priceVsMarket === 'below' && (
                        <View style={styles.soldCompsHint}>
                          <AppIcon name="trending-up-outline" size={IconSize.micro} color="textMuted" opticalCenter accessible={false} />
                          <Text style={[styles.soldCompsText, themed.priceMarketLow]}>
                            {t('listing.create.pricedBelowRange')}
                          </Text>
                        </View>
                      )}
                      {priceVsMarket === 'in_range' && (
                        <View style={styles.soldCompsHint}>
                          <AppIcon name="verified" focused size={IconSize.micro} color="success" opticalCenter accessible={false} />
                          <Text style={[styles.soldCompsText, themed.priceMarketGood]}>
                            {t('listing.create.pricedInRange')}
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.soldCompsHint}>
                      <AppIcon name="information-circle-outline" size={IconSize.micro} color="textMuted" opticalCenter accessible={false} />
                      <Text style={[styles.soldCompsText, themed.priceNoCompsHint]}>
                        {t('listing.create.priceCompetitively')}
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
                        <AppIcon name="card-outline" size={IconSize.sm} color="textSecondary" opticalCenter accessible={false} />
                        <Text style={[styles.proceedsLabel, themed.fieldHelper]}>
                          {t('listing.create.youReceive')}
                        </Text>
                      </View>
                      <View style={styles.proceedsRight}>
                        <Text style={[styles.proceedsAmount, { color: colors.success }]}>
                          {currencySymbol}{(numericPrice - calculatePlatformChargeGbp(numericPrice)).toFixed(2)}
                        </Text>
                        <Text style={[styles.proceedsFeeHint, themed.fieldHelper]}>
                          {t('listing.create.afterFee', { amount: `${currencySymbol}${calculatePlatformChargeGbp(numericPrice).toFixed(2)}` })}
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
                    <Text style={[styles.discountPreview, themed.discountPreview]}>{t('listing.create.discountOffOriginal', { percent: discountPercent })}</Text>
                  )}
                  {!originalPrice && hasValidPrice && (
                    <Text style={[styles.fieldHelper, themed.fieldHelper]}>{t('listing.create.originalPriceHelper')}</Text>
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
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.totalValuation')}</Text>
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
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.shareCount')}</Text>
                  <TextInput
                    style={[styles.fieldInput, themed.fieldInput]}
                    placeholder="20"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="number-pad"
                    value={shareCountInput}
                    onChangeText={(t) => { handleShareCountChange(t); setErrors((p) => ({ ...p, shareCount: '' })); }}
                  />
                  <Text style={[styles.fieldHelper, themed.fieldHelper]}>{t('listing.create.maxShares')}</Text>
                  {errors.shareCount ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.shareCount}</Text> : null}
                  <View style={[styles.hairline, themed.hairline]} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.sharePrice', { code: currency.currencyCode })}</Text>
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
                      {t('listing.create.perShare', { amount: `${currencySymbol}${(Number(price) / Number(shareCountInput)).toFixed(2)}` })}
                    </Text>
                  )}
                  <View style={[styles.hairline, themed.hairline]} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.offeringWindow')}</Text>
                  <View style={styles.toggleRow}>
                    {[24, 48, 72, 168].map((h) => {
                      const active = offeringWindowHours === h;
                      return (
                        <AnimatedPressable
                          key={h}
                          style={[styles.togglePill, themed.togglePill, active && styles.togglePillActive, active && themed.togglePillActive]}
                          scaleValue={0.98}
                          hapticFeedback="light"
                          onPress={() => setOfferingWindowHours(h)}
                          accessibilityRole="button"
                          accessibilityLabel={`Set offering window to ${h} hours`}
                        >
                          <Text style={[styles.toggleText, themed.toggleText, active && styles.toggleTextActive, active && themed.toggleTextActive]}>
                            {h < 72 ? `${h}h` : `${h / 24}d`}
                          </Text>
                        </AnimatedPressable>
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
            <Text style={[styles.sectionHeading, themed.sectionHeading]}>{t('listing.create.description')}</Text>

            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.description')}</Text>
                {desc.trim().length >= 10 ? (
                  <AppIcon name="checkmark-circle" size={12} color="success" opticalCenter accessible={false} />
                ) : (
                  <Text style={[styles.fieldRequiredHint, themed.fieldRequiredHint]}>{t('listing.create.required')}</Text>
                )}
              </View>
              <DebouncedTextInput
                style={[styles.fieldInput, themed.fieldInput, styles.fieldInputMultiline]}
                value={desc}
                debounceMs={400}
                onImmediateChange={() => { if (errors.description) setErrors((p) => ({ ...p, description: '' })); }}
                onChangeText={setDesc}
                placeholder={t('listing.create.descriptionPlaceholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
              />
              <Text style={[styles.fieldHelper, desc.trim().length < 10 ? themed.charCountWarn : themed.fieldHelper]}>
                {desc.trim().length < 10 ? t('listing.create.charCountMin', { count: desc.length }) : desc.length < 60 ? t('listing.create.charCountMore', { count: desc.length }) : t('listing.create.charCount', { count: desc.length })}
              </Text>
              {errors.description ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.description}</Text> : null}
              <View style={[styles.hairline, themed.hairline]} />
            </View>

            <Text style={[styles.fieldLabel, themed.fieldLabel]}>{t('listing.create.tags')}</Text>
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
            <Text style={[styles.fieldHelper, themed.fieldHelper]}>{t('listing.create.tagsHelper')}</Text>
            {tags.length > 0 && tags.length < 3 && (
              <Text style={[styles.fieldHelper, themed.fieldHelper]}>{t('listing.create.addMoreTags', { count: 3 - tags.length, plural: 3 - tags.length > 1 ? 's' : '' })}</Text>
            )}
          </View>

          {/* -- 7. SHIPPING -- */}
          <View style={styles.sectionGroup}>
            <Text style={[styles.sectionHeading, themed.sectionHeading]}>{t('listing.create.shipping')}</Text>
            {!shippingMethod && (
              <View style={styles.contextualHintRow}>
                <AppIcon name="car-outline" size={16} color="brand" opticalCenter accessible={false} />
                <Text style={[styles.contextualHintText, { color: colors.textSecondary }]}>
                  {t('listing.create.shippingMethodHint')}
                </Text>
              </View>
            )}
            {shippingMethod && !shippingPayer && (
              <View style={styles.contextualHintRow}>
                <AppIcon name="card-outline" size={16} color="brand" opticalCenter accessible={false} />
                <Text style={[styles.contextualHintText, { color: colors.textSecondary }]}>
                  {t('listing.create.shippingPayerHint')}
                </Text>
              </View>
            )}

            <AnimatedPressable
              onPress={() => setShippingSheetOpen(true)}
              style={[styles.shippingSummaryRow, { borderBottomColor: colors.border }]}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Configure delivery"
              accessibilityHint="Opens shipping method and payment options"
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.shippingSummaryLabel, { color: colors.textPrimary }]}>{t('listing.create.delivery')}</Text>
                <Text style={[styles.shippingSummaryValue, { color: shippingMethod ? colors.textSecondary : colors.textMuted }]}>
                  {formatShippingSummary(shippingMethod, shippingPayer)}
                </Text>
              </View>
              <AppIcon name="forward" size={16} color="textMuted" opticalCenter accessible={false} />
            </AnimatedPressable>
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
              <Text style={[styles.sectionHeading, themed.sectionHeading]}>{t('listing.create.authPhotos')}</Text>
              <Text style={[styles.fieldHelper, themed.fieldHelper]}>{t('listing.create.authPhotosHelper')}</Text>
              {errors.authPhotos ? <Text style={[styles.fieldError, themed.fieldError]}>{errors.authPhotos}</Text> : null}
              <View style={styles.authPhotoRow}>
                {authPhotos.map((uri, i) => (
                  <View key={`auth_${i}_${uri}`} style={[styles.authThumb, themed.authThumb]}>
                    <Image
                      source={{ uri }}
                      style={styles.authThumbImage}
                      resizeMode="cover"
                      accessibilityLabel={`Authentication photo ${i + 1}`}
                    />
                    <AnimatedPressable
                      style={[styles.authThumbRemove, { backgroundColor: colors.background }]}
                      scaleValue={0.98}
                      hapticFeedback="light"
                      onPress={() => {
                        setAuthPhotos((prev) => prev.filter((_, idx) => idx !== i));
                      }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="Remove authentication photo"
                    >
                      <AppIcon name="close-circle" size={22} color="textPrimary" opticalCenter accessible={false} />
                    </AnimatedPressable>
                  </View>
                ))}
                {authPhotos.length < 2 && (
                  <AnimatedPressable
                    style={[styles.authAddBtn, themed.authAddBtn]}
                    scaleValue={0.98}
                    hapticFeedback="light"
                    onPress={handlePickFromLibrary}
                    accessibilityRole="button"
                    accessibilityLabel="Add authentication photo"
                  >
                    <AppIcon name="add" size={22} color="textMuted" opticalCenter accessible={false} />
                  </AnimatedPressable>
                )}
              </View>
            </View>
          )}

          {/* -- error message (inline, above footer) -- */}
          {errorMsg && publicationStage === 'idle' && (
            <View style={styles.inlineErrorRow}>
              <AppIcon name="alert-circle-outline" size={16} color="danger" opticalCenter accessible={false} />
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
            <AppIcon
              name={completeness.canActivate ? 'checkmark-circle' : 'alert-circle-outline'}
              size={16}
              color={completeness.canActivate ? colors.success : colors.warning}
              opticalCenter
              accessible={false}
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
              <AppIcon
                name={listingMode === 'auction' ? 'hammer-outline' : 'people-outline'}
                size={16}
                color={colors.textSecondary}
                opticalCenter
                accessible={false}
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

      {/* G9: Listing quality meter — photo/quality gating before publish.
          Shows actionable suggestions so sellers can improve their listing
          before it goes live. Only renders when there's enough content to
          score. Flat placement above the publish footer — no card chrome. */}
      {qualityScore && qualityScore.overall < 80 && (
        <View style={styles.qualityMeterWrap}>
          <ListingQualityMeter score={qualityScore} />
        </View>
      )}

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

      {/* Flagship camera sheet — replaces system camera for listing photos */}
      <ListingCameraSheet
        visible={cameraSheetVisible}
        onClose={() => setCameraSheetVisible(false)}
        onCapture={handleCameraCapture}
        maxPhotos={10 - mediaDraftItems.length}
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
  /* G9: Quality meter wrapper — sits above the publish footer */
  qualityMeterWrap: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm },
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
    borderBottomWidth: StyleSheet.hairlineWidth },
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
    letterSpacing: TypographyV2.meta.letterSpacing } });
