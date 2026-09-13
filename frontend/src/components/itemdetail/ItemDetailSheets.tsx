import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import type { Listing } from '../../services/listingsApi';
import { SaveToCollectionModal } from '../closet/SaveToCollectionModal';
import { ShareSheet } from '../ShareSheet';
import { BottomSheet } from '../BottomSheet';
import { FullscreenMediaViewer, SizeGuideSheet, ListingQA } from '../product';
import {
  CommerceDetailMetricRow,
  MakeOfferSheet,
  type MakeOfferSheetProps,
} from '../commerce/detail';
import type { ListingCommerceContext } from '../../platform/product';
import type { ItemDetailMediaResult } from '../../hooks/itemDetail/useItemDetailMedia';
import type {
  ItemDetailOverlayVisibility,
  ItemDetailOverlayControls,
} from '../../hooks/itemDetail/useItemDetailOverlays';
import { Space, FontFamily, Control } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { RadiusRoleValue } from '../../theme/surfaceRadiusRules';
import { DEFAULT_CURRENCY_CODE } from '../../constants/currencies';
import type { useFormattedPrice } from '../../hooks/useFormattedPrice';
import type { ItemDetailConditionMeta } from '../../hooks/itemDetail/itemDetailDerived';

type FormatFromFiat = ReturnType<typeof useFormattedPrice>['formatFromFiat'];

export interface ItemDetailSheetsProps {
  /** The resolved listing (non-null — sheets only render with an item). */
  item: Listing;
  displayTitle: string;
  formattedPrice: string;
  hasPrice: boolean;
  commerce: ListingCommerceContext;
  formattedProtectionTotal: string | null;
  conditionMeta: ItemDetailConditionMeta | null;
  isFav: boolean;
  /** item.seller?.id === currentUser?.id — forwarded for ListingQA. */
  isSeller: boolean;
  /** currentUser?.username ?? 'You' — forwarded for ListingQA. */
  currentUserName: string;
  formatFromFiat: FormatFromFiat;

  /** Media-stage state — owns the fullscreen viewer index/visibility. */
  media: ItemDetailMediaResult;
  /** Screen-owned overlay visibility + dismissers. */
  visibility: ItemDetailOverlayVisibility;
  dismiss: ItemDetailOverlayControls;

  /** Share sheet (visibility owned by the actions hook). */
  shareVisible: boolean;
  onShareDismiss: () => void;
  /** Overflow actions — each row dismisses the sheet, then dispatches. */
  onShare: () => void;
  onToggleFav: () => void;
  onReport: () => void;
  /** Make-offer completion payload handler (toast + optional Chat nav). */
  onOfferSent: MakeOfferSheetProps['onSent'];
}

/**
 * Every sheet/modal for the item detail screen — rendered outside the
 * a11y-hidden content wrap so TalkBack can reach the sheet while the
 * content behind it is hidden (audit M2). Mount order matches the
 * original screen: fullscreen viewer, collection modal, share, size
 * guide, purchase details, Q&A, overflow, make offer, condition info.
 */
export function ItemDetailSheets({
  item,
  displayTitle,
  formattedPrice,
  hasPrice,
  commerce,
  formattedProtectionTotal,
  conditionMeta,
  isFav,
  isSeller,
  currentUserName,
  formatFromFiat,
  media,
  visibility,
  dismiss,
  shareVisible,
  onShareDismiss,
  onShare,
  onToggleFav,
  onReport,
  onOfferSent,
}: ItemDetailSheetsProps) {
  const { colors } = useAppTheme();

  return (
    <>
      <FullscreenMediaViewer
        images={item.images}
        initialIndex={media.activeIndex}
        visible={media.isViewerVisible}
        onActiveIndexChange={media.setActiveIndex}
        onClose={media.closeViewer}
      />

      <SaveToCollectionModal
        visible={visibility.collection}
        itemId={item.id}
        onClose={dismiss.collection}
      />

      <ShareSheet
        visible={shareVisible}
        onDismiss={onShareDismiss}
        url={`https://thryftverse.com/item/${item.id}`}
        title={displayTitle}
        subtitle={item.brand ? `${item.brand} · ${formattedPrice}` : formattedPrice}
        imageUri={item.images?.[0]}
      />

      <SizeGuideSheet
        visible={visibility.sizeGuide}
        category={item.category}
        currentSize={item.size}
        onClose={dismiss.sizeGuide}
      />

      <BottomSheet
        visible={visibility.purchaseDetails}
        onDismiss={dismiss.purchaseDetails}
        snapPoint={0.72}
      >
        <View style={[styles.purchaseSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
          <View>
            <Text style={[styles.purchaseSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>
              Costs, delivery & protection
            </Text>
            <Text style={[styles.purchaseSheetSubtitle, { color: colors.textMuted }]} maxFontSizeMultiplier={2}>
              Confirmed terms for this listing
            </Text>
          </View>
          <AnimatedPressable
            onPress={dismiss.purchaseDetails}
            style={styles.sheetCloseTarget}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityLabel="Close costs, delivery and protection"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </AnimatedPressable>
        </View>
        <View style={styles.purchaseSheetBody}>
          {hasPrice ? (
            <CommerceDetailMetricRow label="Item price" value={formattedPrice} />
          ) : null}
          {commerce.buyerProtectionFee != null ? (
            <CommerceDetailMetricRow
              label="Buyer protection fee"
              value={formatFromFiat(commerce.buyerProtectionFee, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })}
            />
          ) : null}
          <CommerceDetailMetricRow
            label="Shipping"
            value={
              commerce.shippingPayer === 'seller'
                ? 'Free'
                : 'Calculated at checkout'
            }
            muted={commerce.shippingPayer !== 'seller'}
          />
          {formattedProtectionTotal ? (
            <CommerceDetailMetricRow
              label="Estimated total"
              value={formattedProtectionTotal}
              subLabel={commerce.shippingPayer === 'seller' ? undefined : 'excl. shipping'}
              emphasis
              large
              separated
            />
          ) : null}
          <CommerceDetailMetricRow
            label="Delivery method"
            value={commerce.shippingMethod ?? 'Confirmed at checkout'}
            muted={!commerce.shippingMethod}
          />
          <CommerceDetailMetricRow
            label="Buyer protection"
            value={commerce.protectionPolicy?.available ? commerce.protectionPolicy.label : 'Not included'}
            subLabel={commerce.protectionPolicy?.summary ?? undefined}
          />
          <CommerceDetailMetricRow
            label="Returns"
            value={
              commerce.returnPolicy?.accepted
                ? commerce.returnPolicy.windowDays
                  ? `${commerce.returnPolicy.windowDays} days`
                  : 'Accepted'
                : 'Not accepted'
            }
          />
          {commerce.authenticity && commerce.authenticity.status !== 'not_offered' && (
            <CommerceDetailMetricRow
              label="Authenticity"
              value={commerce.authenticity.label ?? 'Eligible'}
            />
          )}
          <CommerceDetailMetricRow label="Payment" value="Thryftverse checkout" muted />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={visibility.qa}
        onDismiss={dismiss.qa}
        snapPoint={0.7}
      >
        <View style={[styles.qaSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[styles.qaSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>
            Questions & answers
          </Text>
          <AnimatedPressable
            onPress={dismiss.qa}
            hitSlop={12}
            style={styles.sheetCloseTarget}
            scaleValue={0.98}
            hapticFeedback="light"
            accessibilityLabel="Close questions and answers"
            accessibilityRole="button"
          >
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </AnimatedPressable>
        </View>
        <ListingQA
          listingId={item.id}
          currentUserName={currentUserName}
          isSeller={isSeller}
        />
      </BottomSheet>

      {/* Overflow sheet — lower-frequency hero actions (Fav, Report). */}
      <BottomSheet
        visible={visibility.overflow}
        onDismiss={dismiss.overflow}
        snapPoint={0.4}
      >
        <View style={[styles.overflowHeader, { borderColor: colors.border }]}>
          <Text style={[styles.overflowTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>More actions</Text>
        </View>
        <AnimatedPressable
          style={styles.overflowRow}
          scaleValue={0.98}
          hapticFeedback="light"
          onPress={() => {
            dismiss.overflow();
            onShare();
          }}
          accessibilityRole="button"
          accessibilityLabel="Share listing"
        >
          <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
          <Text style={[styles.overflowRowText, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>Share listing</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.overflowRow}
          scaleValue={0.98}
          hapticFeedback="light"
          onPress={() => {
            dismiss.overflow();
            onToggleFav();
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: isFav }}
          accessibilityLabel={isFav ? 'Remove from Saved' : 'Add to Saved'}
        >
          <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={20} color={isFav ? colors.danger : colors.textPrimary} />
          <Text style={[styles.overflowRowText, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>
            {isFav ? 'Remove from Saved' : 'Add to Saved'}
          </Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.overflowRow}
          scaleValue={0.98}
          hapticFeedback="light"
          onPress={() => {
            dismiss.overflow();
            onReport();
          }}
          accessibilityRole="button"
          accessibilityLabel="Report this listing"
        >
          <Ionicons name="flag-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.overflowRowText, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>Report listing</Text>
        </AnimatedPressable>
      </BottomSheet>

      <MakeOfferSheet
        visible={visibility.makeOffer}
        onDismiss={dismiss.makeOffer}
        listing={item ? {
          id: item.id,
          title: displayTitle,
          price: item.price ?? 0,
          image: item.images?.[0],
        } : null}
        sellerId={item?.seller?.id ?? null}
        onSent={onOfferSent}
      />

      <BottomSheet
        visible={visibility.conditionInfo}
        onDismiss={dismiss.conditionInfo}
        snapPoint={0.42}
      >
        <View style={styles.conditionSheetWrap}>
          <View style={styles.conditionSheetHeader}>
            <Text style={[styles.conditionSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={2}>
              Condition
            </Text>
            <AnimatedPressable
              onPress={dismiss.conditionInfo}
              style={styles.sheetCloseTarget}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityLabel="Close condition definition"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </AnimatedPressable>
          </View>
          <View style={styles.conditionSheetBody}>
            <View style={[styles.conditionSheetBadge, { backgroundColor: conditionMeta ? `${conditionMeta.color}14` : colors.surfaceAlt }]}>
              <View style={[styles.conditionDot, { backgroundColor: conditionMeta?.color ?? colors.textMuted }]} />
              <Text style={[styles.conditionSheetBadgeText, { color: conditionMeta?.color ?? colors.textPrimary }]} maxFontSizeMultiplier={2}>
                {item.condition}
              </Text>
            </View>
            {conditionMeta ? (
              <Text style={[styles.conditionSheetDefinition, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>
                {conditionMeta.definition}
              </Text>
            ) : null}
            {item.images && item.images.length > 1 ? (
              <AnimatedPressable
                style={styles.conditionEvidenceJump}
                scaleValue={0.98}
                hapticFeedback="light"
                onPress={() => {
                  dismiss.conditionInfo();
                  // Jump to the last photo (detail/flaw shot per policy)
                  const evidenceIndex = item.images!.length - 1;
                  media.openViewer(evidenceIndex);
                }}
                accessibilityLabel="View condition evidence photos"
                accessibilityRole="button"
              >
                <Ionicons name="images-outline" size={18} color={colors.brand} />
                <Text style={[styles.conditionEvidenceJumpText, { color: colors.brand }]} maxFontSizeMultiplier={2}>
                  View condition photos
                </Text>
                <Ionicons name="chevron-forward" size={16} color={colors.brand} />
              </AnimatedPressable>
            ) : null}
          </View>
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  sheetCloseTarget: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Purchase details ──
  purchaseSheetHeader: {
    minHeight: Space.md * 4,
    paddingLeft: Space.md,
    paddingRight: Space.xs,
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.sm,
  },
  purchaseSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  purchaseSheetSubtitle: {
    marginTop: Space.xs / 2,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.regular,
  },
  purchaseSheetBody: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  qaSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  qaSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: FontFamily.semibold,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
  },
  // ── Overflow sheet (rendered inside canonical BottomSheet) ──
  overflowHeader: {
    paddingBottom: Space.sm,
    marginBottom: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  overflowTitle: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.semibold,
  },
  overflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    minHeight: Control.hit + Space.xs,
  },
  overflowRowText: {
    fontSize: TypographyV2.body.size,
    fontFamily: FontFamily.medium,
  },
  conditionDot: {
    width: Space.xs + 2,
    height: Space.xs + 2,
    borderRadius: (Space.xs + 2) / 2,
    flexShrink: 0,
  },
  // ── Condition definition sheet ──
  conditionSheetWrap: {
    paddingBottom: Space.md,
  },
  conditionSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Space.md,
    paddingRight: Space.xs,
    paddingVertical: Space.sm,
    minHeight: Control.hit + Space.sm,
  },
  conditionSheetTitle: {
    fontSize: TypographyV2.sectionTitle.size,
    lineHeight: TypographyV2.sectionTitle.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  conditionSheetBody: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: Space.md,
  },
  conditionSheetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: Space.sm + 2,
    paddingVertical: Space.sm,
    borderRadius: RadiusRoleValue.sheetDialog,
  },
  conditionSheetBadgeText: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: FontFamily.semibold,
  },
  conditionSheetDefinition: {
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight + Space.xs,
    fontFamily: FontFamily.regular,
  },
  // ── Condition evidence gallery jump ──
  conditionEvidenceJump: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    minHeight: Control.hit,
  },
  conditionEvidenceJumpText: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
  },
});
