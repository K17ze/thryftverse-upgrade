import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../../theme/ThemeContext';
import { FontFamily, LetterSpacing } from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import { t } from '../../../i18n';
import { CommerceDetailStateDock } from './CommerceDetailStateDock';
import { formatShortDate } from '../../../utils/dateFormat';
import type { Listing } from '../../../services/listingsApi';
import type {
  ListingCapabilities,
  ListingCommerceContext,
  SellerTrustSummary,
} from '../../../platform/product/listingDetailContract';

/**
 * Tier-aware sticky action dock.
 *
 * Wraps CommerceDetailStateDock with the category-adaptive CTA logic:
 *   - brokered: Enquire + Request viewing (no direct buy/offer)
 *   - specialist: Buy now + Enquire (expert review questions)
 *   - authenticated_luxury: Buy now + Make offer (authentication note)
 *   - standard: Buy now + Make offer (existing behaviour)
 *
 * Owner / sold / unavailable states render a factual state dock with
 * one next action. The actual navigation, auth, analytics and haptic
 * calls are passed as callbacks from the orchestrator — this
 * component owns only the tier branching and label generation.
 */
export interface CommerceActionDockProps {
  item: Listing;
  capabilities: ListingCapabilities;
  commerce: ListingCommerceContext;
  /** Seller trust summary — when `holidayMode` is on, the dock replaces
   *  purchase/offer affordances with an away notice (the backend rejects
   *  checkout and new offers with 409 SELLER_AWAY anyway). May be null
   *  while the trust query loads; absence never implies "not away". */
  seller?: SellerTrustSummary | null;
  /** Viewer blocked this seller — no purchase/offer/enquiry affordance
   *  may render (all fail server-side). */
  isSellerBlocked?: boolean;
  formattedPrice: string;
  formattedOriginal: string | null;
  hasDiscount: boolean;
  onManageListing: () => void;
  onBrowseSimilar: () => void;
  onBuyNow: () => void;
  onMakeOffer: () => void;
  onEnquire: () => void;
  onRequestViewing: () => void;
}

export function CommerceActionDock({
  item,
  capabilities,
  commerce,
  seller,
  isSellerBlocked = false,
  formattedPrice,
  formattedOriginal,
  hasDiscount,
  onManageListing,
  onBrowseSimilar,
  onBuyNow,
  onMakeOffer,
  onEnquire,
  onRequestViewing,
}: CommerceActionDockProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // ── Shipping hint ──
  // Only facts the PDP endpoint actually emits: who pays shipping. The
  // dead estimatedDeliveryStart/End contract fields were removed — no
  // dispatch/courier signal is persisted, so no delivery window is ever
  // fabricated next to the commitment action.
  const shippingHint = (
    commerce.shippingPayer === 'seller'
      ? 'Free shipping'
      : commerce.shippingMethod
        ? 'Shipping calculated at checkout'
        : null
  ) || undefined;

  // ── Zone I — Sticky action dock ──
  //   Buyer: price + Buy now + Make offer.
  //   Seller: Manage listing.
  //   Sold/unavailable: factual state + one next action.

  if (capabilities.isOwner) {
    return (
      <CommerceDetailStateDock
        value={formattedPrice}
        valueLabel="Your listing"
        thumbnailUri={item.images?.[0]}
        primaryAction={{
          label: t('product.manageListing'),
          onPress: onManageListing,
        }}
      />
    );
  }

  if (capabilities.isSold) {
    return (
      <CommerceDetailStateDock
        stateBadge={
          <Text style={[styles.dockStateBadge, { color: colors.successText }]} maxFontSizeMultiplier={2}>
            Sold
          </Text>
        }
        subtitle="This item has been sold"
        primaryAction={{
          label: 'More like this',
          onPress: onBrowseSimilar,
        }}
      />
    );
  }

  if (!capabilities.isAvailable) {
    const unavailableCopy = (() => {
      switch (capabilities.unavailableReason) {
        case 'reserved':
          return { label: 'Reserved', subtitle: 'This item is currently held for another buyer' };
        case 'paused':
          return { label: 'Paused', subtitle: 'The seller has paused this listing' };
        case 'draft':
          return { label: 'Not published', subtitle: 'This listing is not available to buy' };
        case 'missing_price':
          return { label: 'Price unavailable', subtitle: 'The seller has not supplied a valid price' };
        case 'missing_seller':
          return { label: 'Seller unavailable', subtitle: 'Seller details could not be verified' };
        case 'status_unknown':
          return { label: 'Status unavailable', subtitle: 'Purchase availability could not be verified' };
        default:
          return { label: 'Unavailable', subtitle: 'This listing is no longer available' };
      }
    })();
    return (
      <CommerceDetailStateDock
        stateBadge={
          <Text style={[styles.dockStateBadge, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>
            {unavailableCopy.label}
          </Text>
        }
        subtitle={unavailableCopy.subtitle}
        primaryAction={{
          label: t('product.browseSimilar'),
          onPress: onBrowseSimilar,
        }}
      />
    );
  }

  // ── Seller suspended — no purchase affordance ──
  // users.reach_state === 'suspended' means the account is restricted:
  // the backend reports 0 active listings for the seller and any buy or
  // offer can only fail. Render a factual state dock instead of the
  // purchase actions.
  if (seller?.reachState === 'suspended') {
    return (
      <CommerceDetailStateDock
        stateBadge={
          <Text style={[styles.dockStateBadge, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>
            Unavailable
          </Text>
        }
        subtitle="This seller's account is currently restricted"
        primaryAction={{
          label: t('product.browseSimilar'),
          onPress: onBrowseSimilar,
        }}
      />
    );
  }

  // ── Seller blocked by viewer — no purchase affordance ──
  // The viewer's own block decision is a client-side truth (store). Buy,
  // offer, enquire and message all fail server-side for blocked users,
  // so the dock shows the relationship state instead of dead CTAs.
  if (isSellerBlocked) {
    return (
      <CommerceDetailStateDock
        stateBadge={
          <Text style={[styles.dockStateBadge, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>
            Blocked
          </Text>
        }
        subtitle="You blocked this seller"
        primaryAction={{
          label: t('product.browseSimilar'),
          onPress: onBrowseSimilar,
        }}
      />
    );
  }

  // ── Seller away — shop paused ──
  // Holiday mode pauses the seller's account: checkout and new offers are
  // rejected server-side (409 SELLER_AWAY), so the dock mirrors that state
  // rather than offering actions that can only fail. The return date is
  // rendered only when the seller actually published one — it is never
  // fabricated from handling-time estimates.
  if (seller?.holidayMode) {
    const backOn = seller.holidayModeUntil
      ? formatShortDate(seller.holidayModeUntil)
      : null;
    return (
      <CommerceDetailStateDock
        value={formattedPrice}
        originalValue={hasDiscount && formattedOriginal ? formattedOriginal : undefined}
        thumbnailUri={item.images?.[0]}
        stateBadge={
          <Text style={[styles.dockStateBadge, { color: colors.textSecondary }]} maxFontSizeMultiplier={2}>
            Seller away
          </Text>
        }
        subtitle={
          backOn
            ? `Listings are paused — back ${backOn}`
            : seller.awayMessage || 'Listings are paused until the seller returns'
        }
        primaryAction={{
          label: t('product.browseSimilar'),
          onPress: onBrowseSimilar,
        }}
      />
    );
  }

  // ── Tier-adaptive dock actions ──
  // Category-adaptive CTAs by commerce tier:
  //   - brokered: Enquire + Request viewing (no direct buy/offer)
  //   - specialist: Buy now + Enquire (expert review questions)
  //   - authenticated_luxury: Buy now + Make offer (authentication
  //     note shows in the trust strip)
  //   - standard: Buy now + Make offer (existing behaviour)
  // The enquiry/viewing actions open a DM conversation with the
  // seller, following the same createDmConversationOnApi → Chat
  // navigation pattern used by the SellerInfoCard message action.
  const enquireAction = capabilities.canEnquire
    ? {
        label: 'Enquire',
        onPress: onEnquire,
      }
    : undefined;

  const requestViewingAction = capabilities.canRequestViewing
    ? {
        label: 'Request viewing',
        onPress: onRequestViewing,
      }
    : undefined;

  const buyNowAction = {
    label: t('product.buyNow'),
    onPress: onBuyNow,
  };

  const makeOfferAction = capabilities.canOffer
    ? {
        label: 'Make offer',
        onPress: onMakeOffer,
      }
    : undefined;

  // Brokered assets: enquire + request viewing replace buy/offer.
  if (capabilities.commerceTier === 'brokered') {
    return (
      <CommerceDetailStateDock
        value={formattedPrice}
        originalValue={hasDiscount && formattedOriginal ? formattedOriginal : undefined}
        thumbnailUri={item.images?.[0]}
        shippingHint={shippingHint}
        commerceTier="brokered"
        primaryAction={enquireAction}
        secondaryAction={requestViewingAction}
      />
    );
  }

  // Specialist items: buy now + enquire (for expert review questions).
  if (capabilities.commerceTier === 'specialist') {
    return (
      <CommerceDetailStateDock
        value={formattedPrice}
        originalValue={hasDiscount && formattedOriginal ? formattedOriginal : undefined}
        thumbnailUri={item.images?.[0]}
        shippingHint={shippingHint}
        showProtectionStrip={commerce.protectionPolicy?.available ?? false}
        commerceTier="specialist"
        primaryAction={buyNowAction}
        secondaryAction={enquireAction}
      />
    );
  }

  // Authenticated luxury: buy now + make offer; authentication
  // note shows in the trust strip.
  if (capabilities.commerceTier === 'authenticated_luxury') {
    return (
      <CommerceDetailStateDock
        value={formattedPrice}
        originalValue={hasDiscount && formattedOriginal ? formattedOriginal : undefined}
        thumbnailUri={item.images?.[0]}
        shippingHint={shippingHint}
        showProtectionStrip={commerce.protectionPolicy?.available ?? false}
        commerceTier="authenticated_luxury"
        primaryAction={buyNowAction}
        secondaryAction={makeOfferAction}
      />
    );
  }

  // Standard tier: existing buy now + make offer behaviour.
  return (
    <CommerceDetailStateDock
      value={formattedPrice}
      originalValue={hasDiscount && formattedOriginal ? formattedOriginal : undefined}
      thumbnailUri={item.images?.[0]}
      shippingHint={shippingHint}
      showProtectionStrip={commerce.protectionPolicy?.available ?? false}
      commerceTier="standard"
      primaryAction={buyNowAction}
      secondaryAction={makeOfferAction}
    />
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  // ── Dock state badge ──
  dockStateBadge: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: LetterSpacing.normal,
  },
});
