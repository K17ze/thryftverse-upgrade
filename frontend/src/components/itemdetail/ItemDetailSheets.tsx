import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import type { Listing } from '../../services/listingsApi';
import { SaveToCollectionModal } from '../closet/SaveToCollectionModal';
import { ShareSheet } from '../ShareSheet';
import { ForwardSheet } from '../chat/ForwardSheet';
import { sendListingShareMessage } from '../../services/chatApi';
import { useStore } from '../../store/useStore';
import { useToast } from '../../context/ToastContext';
import { useSignupWall } from '../../hooks/useSignupWall';
import { BottomSheet } from '../BottomSheet';
import { FullscreenMediaViewer, SizeGuideSheet, ListingQA } from '../product';
import {
  CommerceDetailMetricRow,
  MakeOfferSheet,
  type MakeOfferSheetProps,
} from '../commerce/detail';
import type { ListingCommerceContext, ProductMediaItem } from '../../platform/product';
import type { ItemDetailMediaResult } from '../../hooks/itemDetail/useItemDetailMedia';
import type {
  ItemDetailOverlayVisibility,
  ItemDetailOverlayControls,
} from '../../hooks/itemDetail/useItemDetailOverlays';
import { Space, FontFamily, Control, IconGrammar } from '../../theme/designTokens';
import { TypographyV2, MAX_FONT_SCALE } from '../../theme/typography.v2';
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
  /** Viewer blocked this seller — forwarded to ListingQA so the public
   *  ask composer is replaced by an honest capability note while READ
   *  access to existing Q&A is preserved (S20-06). */
  isSellerBlocked: boolean;
  formatFromFiat: FormatFromFiat;

  /** Canonical PDP media — the same ProductMediaItem[] the hero stage
   *  renders (kind, focal point, poster, blurhash/LQIP, derivatives),
   *  forwarded verbatim to the fullscreen viewer. */
  mediaItems: ProductMediaItem[];
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
  isSellerBlocked,
  formatFromFiat,
  mediaItems,
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
  const { show } = useToast();
  const { requireAuth } = useSignupWall();
  const conversations = useStore((s) => s.conversations);
  const currentUserId = useStore((s) => s.currentUser?.id);
  const [chatPickerVisible, setChatPickerVisible] = React.useState(false);

  const handleSendToChat = React.useCallback(async (conversationId: string) => {
    setChatPickerVisible(false);
    onShareDismiss();
    try {
      await sendListingShareMessage(conversationId, {
        id: item.id,
        title: item.title ?? displayTitle,
        price: item.price ?? 0,
        originalPrice: item.originalPrice ?? null,
        image: item.images?.[0] ?? null,
        brand: item.brand ?? null,
        size: item.size ?? null,
        condition: item.condition ?? null,
        sellerId: item.sellerId ?? null,
        sellerUsername: item.seller?.username ?? null,
        sellerRating: item.seller?.rating ?? null,
        isSold: item.isSold === true,
      }, currentUserId);
      show('Sent to chat', 'success');
    } catch {
      show('Could not send to chat. Try again.', 'error');
    }
  }, [item, displayTitle, currentUserId, show, onShareDismiss]);

  return (
    <>
      <FullscreenMediaViewer
        media={mediaItems}
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
        contentType="listing"
        contentId={item.id}
        onSendToChat={() => {
          if (!requireAuth('message_seller')) return;
          setChatPickerVisible(true);
        }}
      />

      {/* Send-to-chat people picker — reuses the forward sheet. */}
      <ForwardSheet
        visible={chatPickerVisible}
        conversations={conversations}
        onForward={(id) => { void handleSendToChat(id); }}
        onClose={() => setChatPickerVisible(false)}
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
            <Text style={[styles.purchaseSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={MAX_FONT_SCALE.heading}>
              Costs, delivery & protection
            </Text>
            <Text style={[styles.purchaseSheetSubtitle, { color: colors.textMuted }]} maxFontSizeMultiplier={MAX_FONT_SCALE.content}>
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
            <AppIcon name="close" size={IconGrammar.standard} color="textSecondary" />
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
              commerce.returnPolicy?.accepted === true
                ? commerce.returnPolicy.windowDays
                  ? `${commerce.returnPolicy.windowDays} days`
                  : 'Accepted'
                : commerce.returnPolicy?.accepted === false
                  ? 'Not accepted'
                  // accepted === null — undetermined; prefer the
                  // server-authored summary, else the truthful
                  // checkout-confirmation fallback. Null is not
                  // "not accepted".
                  : commerce.returnPolicy?.summary ?? 'Confirmed at checkout'
            }
          />
          {commerce.authenticity && commerce.authenticity.status !== 'not_offered' && (
            <CommerceDetailMetricRow
              label="Authenticity"
              value={
                commerce.authenticity.label
                  ?? (commerce.authenticity.status === 'verified'
                    ? 'Verified'
                    : commerce.authenticity.status === 'in_progress'
                      ? 'Verification in progress'
                      : 'Eligible')
              }
            />
          )}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={visibility.qa}
        onDismiss={dismiss.qa}
        snapPoint={0.7}
      >
        <View style={[styles.qaSheetHeader, { borderBottomColor: colors.borderSubtle }]}>
          <Text style={[styles.qaSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={MAX_FONT_SCALE.heading}>
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
            <AppIcon name="close" size={IconGrammar.standard} color="textSecondary" />
          </AnimatedPressable>
        </View>
        <ListingQA
          listingId={item.id}
          currentUserName={currentUserName}
          isSeller={isSeller}
          isSellerBlocked={isSellerBlocked}
        />
      </BottomSheet>

      {/* Overflow sheet — lower-frequency hero actions (Fav, Report). */}
      <BottomSheet
        visible={visibility.overflow}
        onDismiss={dismiss.overflow}
        snapPoint={0.4}
      >
        <View style={[styles.overflowHeader, { borderColor: colors.border }]}>
          <Text style={[styles.overflowTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={MAX_FONT_SCALE.heading}>More actions</Text>
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
          <AppIcon name="share-outline" size={IconSize.md} color="textPrimary" />
          <Text style={[styles.overflowRowText, { color: colors.textPrimary }]} maxFontSizeMultiplier={MAX_FONT_SCALE.content}>Share listing</Text>
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
          <AppIcon name="heart" focused={isFav} size={IconSize.md} color={isFav ? 'dangerText' : 'textPrimary'} />
          <Text style={[styles.overflowRowText, { color: colors.textPrimary }]} maxFontSizeMultiplier={MAX_FONT_SCALE.content}>
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
          <AppIcon name="flag-outline" size={IconSize.md} color="textSecondary" />
          <Text style={[styles.overflowRowText, { color: colors.textSecondary }]} maxFontSizeMultiplier={MAX_FONT_SCALE.content}>Report listing</Text>
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
        sellerId={item?.sellerId ?? item?.seller?.id ?? null}
        onSent={onOfferSent}
      />

      <BottomSheet
        visible={visibility.conditionInfo}
        onDismiss={dismiss.conditionInfo}
        snapPoint={0.42}
      >
        <View style={styles.conditionSheetWrap}>
          <View style={styles.conditionSheetHeader}>
            <Text style={[styles.conditionSheetTitle, { color: colors.textPrimary }]} maxFontSizeMultiplier={MAX_FONT_SCALE.heading}>
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
              <AppIcon name="close" size={IconGrammar.standard} color="textSecondary" />
            </AnimatedPressable>
          </View>
          <View style={styles.conditionSheetBody}>
            <View style={[styles.conditionSheetBadge, { backgroundColor: conditionMeta ? `${conditionMeta.color}14` : colors.surfaceAlt }]}>
              <View style={[styles.conditionDot, { backgroundColor: conditionMeta?.color ?? colors.textMuted }]} />
              <Text style={[styles.conditionSheetBadgeText, { color: conditionMeta?.color ?? colors.textPrimary }]} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
                {item.condition}
              </Text>
            </View>
            {conditionMeta ? (
              <Text style={[styles.conditionSheetDefinition, { color: colors.textSecondary }]} maxFontSizeMultiplier={MAX_FONT_SCALE.content}>
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
                  // Generic gallery entry — the media contract carries no
                  // condition-photo tag, so no position is presented as
                  // evidence (FRESH-09).
                  media.openViewer(0);
                }}
                accessibilityLabel="View all item photos"
                accessibilityRole="button"
              >
                <AppIcon name="images-outline" size={18} color="brand" />
                <Text style={[styles.conditionEvidenceJumpText, { color: colors.brand }]} maxFontSizeMultiplier={MAX_FONT_SCALE.utility}>
                  View all photos
                </Text>
                <AppIcon name="chevron-forward" size={IconSize.sm} color="brand" />
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
