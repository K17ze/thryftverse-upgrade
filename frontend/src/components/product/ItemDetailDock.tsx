import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { TypographyV2 } from '../../theme/typography.v2';
import { FontFamily, LetterSpacing } from '../../theme/designTokens';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { Listing } from '../../services/listingsApi';
import type {
  ListingCapabilities,
  ListingCommerceContext,
} from '../../platform/product/listingDetailContract';
import { CommerceDetailStateDock } from '../commerce/detail';

// ───────────────────────────────────────────────────────────────────────────
// ItemDetailDock — Zone I sticky action dock.
//
// Renders the tier-adaptive dock based on capabilities + commerce tier:
//   - owner: Manage listing
//   - sold: factual state + More like this
//   - unavailable: reason-specific state + browse similar
//   - brokered: Enquire + Request viewing
//   - specialist: Buy now + Enquire
//   - authenticated_luxury: Buy now + Make offer
//   - standard: Buy now + Make offer
//
// Action handlers are provided by the screen so this component stays
// presentational. Behaviour is identical to the previous inline IIFE.
// ───────────────────────────────────────────────────────────────────────────

export interface ItemDetailDockProps {
  item: Listing;
  capabilities: ListingCapabilities;
  commerce: ListingCommerceContext;
  formattedPrice: string;
  formattedOriginal: string | null;
  hasDiscount: boolean;
  colors: ThemeColors;
  t: (key: string) => string;
  onManageListing: () => void;
  onBrowseExplore: () => void;
  onBuyNow: () => void;
  onMakeOffer: () => void;
  onEnquire: () => void;
  onRequestViewing: () => void;
}

export function ItemDetailDock({
  item,
  capabilities,
  commerce,
  formattedPrice,
  formattedOriginal,
  hasDiscount,
  colors,
  t,
  onManageListing,
  onBrowseExplore,
  onBuyNow,
  onMakeOffer,
  onEnquire,
  onRequestViewing,
}: ItemDetailDockProps) {
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
          <Text style={[styles.dockStateBadge, { color: colors.success }]} maxFontSizeMultiplier={1}>
            Sold
          </Text>
        }
        subtitle="This item has been sold"
        primaryAction={{
          label: 'More like this',
          onPress: onBrowseExplore,
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
          <Text style={[styles.dockStateBadge, { color: colors.textSecondary }]} maxFontSizeMultiplier={1}>
            {unavailableCopy.label}
          </Text>
        }
        subtitle={unavailableCopy.subtitle}
        primaryAction={{
          label: t('product.browseSimilar'),
          onPress: onBrowseExplore,
        }}
      />
    );
  }

  // ── Tier-adaptive dock actions ──
  const shippingHint =
    commerce.shippingPayer === 'seller'
      ? 'Free shipping'
      : commerce.shippingMethod
        ? 'Shipping calculated at checkout'
        : undefined;

  const enquireAction = capabilities.canEnquire
    ? { label: 'Enquire', onPress: onEnquire }
    : undefined;

  const requestViewingAction = capabilities.canRequestViewing
    ? { label: 'Request viewing', onPress: onRequestViewing }
    : undefined;

  const buyNowAction = {
    label: t('product.buyNow'),
    onPress: onBuyNow,
  };

  const makeOfferAction = capabilities.canOffer
    ? { label: 'Make offer', onPress: onMakeOffer }
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

  // Authenticated luxury: buy now + make offer; authentication note
  // shows in the trust strip.
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

const styles = StyleSheet.create({
  dockStateBadge: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: LetterSpacing.normal,
  },
});
