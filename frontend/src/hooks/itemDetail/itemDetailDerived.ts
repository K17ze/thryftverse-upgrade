import type {
  Listing,
  ListingCommerceServerContext,
  ListingSoldComparables,
  ListingPriceEvent,
} from '../../services/listingsApi';
import type { DisplayReadyListing } from '../../services/listingMapper';
import type { ThemeColors } from '../../theme/ThemeContext';
import type { useFormattedPrice } from '../useFormattedPrice';
import { Space, DockConstants } from '../../theme/designTokens';
import { DEFAULT_CURRENCY_CODE } from '../../constants/currencies';
import { toIze, formatIzeAmount } from '../../utils/currency';
import {
  buildCommerceContext,
  buildCapabilities,
  buildDirectViewModel,
  isDirectViewModel,
  isRecommendationLook,
  type SellerTrustSummary,
  type ListingCapabilities,
  type ListingCommerceContext,
  type RecommendationSection,
  type RecommendationLook,
} from '../../platform/product';

type FormatFromFiat = ReturnType<typeof useFormattedPrice>['formatFromFiat'];
type FxRates = ReturnType<typeof useFormattedPrice>['fxRates'];
type DisplayMode = ReturnType<typeof useFormattedPrice>['displayMode'];

export interface ItemDetailConditionMeta {
  color: string;
  definition: string;
}

export interface ItemDetailPriceInsightRow {
  label: string;
  value: string;
  muted?: boolean;
}

export interface ItemDetailDerivedInput {
  /** The resolved listing (non-null — call after the not-found guard). */
  item: Listing;
  /** Resolved seller trust summary. */
  seller: SellerTrustSummary | null;
  /** item.engagement ?? null — forwarded verbatim for the proof line. */
  listingEngagement: Listing['engagement'] | null;
  /** Server commerce context (buyer protection fee, estimated total). */
  serverCommerce: ListingCommerceServerContext | null;
  /** Current user id (owner/capability checks). */
  currentUserId: string | undefined;
  /** Whether the listing is wishlisted. */
  isFav: boolean;
  /** Store selector — whether the listing is saved to any collection. */
  isItemSavedAnywhere: (itemId: string) => boolean;
  /** Recommendation sections (more_from_seller, seen_in_looks, etc). */
  recommendationSections: RecommendationSection[];
  /** Sold comparables for the price-insight rows. */
  soldComps: ListingSoldComparables | null;
  /** Price history events (newest first). */
  priceHistory: ListingPriceEvent[];
  /** Safe-area bottom inset — feeds the dock-aware scroll padding. */
  insetsBottom: number;
  /** Theme palette (condition accent colours). */
  colors: ThemeColors;
  /** Currency formatting handles from useFormattedPrice(). */
  formatFromFiat: FormatFromFiat;
  fxRates: FxRates;
  displayMode: DisplayMode;
}

export interface ItemDetailDerived {
  displayTitle: string;
  hasPrice: boolean;
  hasDiscount: boolean;
  formattedPrice: string;
  formattedOriginal: string | null;
  discountPercent: number | null;
  formattedProtectionTotal: string | null;
  priceIzeText: string | null;
  capabilities: ListingCapabilities;
  commerce: ListingCommerceContext;
  bundleItems: DisplayReadyListing[];
  seenInLooksItems: RecommendationLook[];
  interestSignal: string | undefined;
  socialProofLine: string | undefined;
  attributeLine: string;
  conditionMeta: ItemDetailConditionMeta | null;
  secondaryLine: string | undefined;
  familyStateAccent: null;
  isDualActionDock: boolean;
  dockHeight: number;
  scrollBottomPadding: number;
  priceInsightRows: ItemDetailPriceInsightRow[];
  priceInsightSummary: string | undefined;
  purchaseSummary: string;
  sellerStatsLine: string | undefined;
  sellerVerified: boolean;
}

/**
 * Derives every display string, flag and geometry constant the item
 * detail screen renders from the resolved listing + query data. Pure
 * function — it must only run after the loading/error/not-found guards
 * have established `item` as non-null, so it is not a hook.
 */
export function buildItemDetailDerived(
  input: ItemDetailDerivedInput,
): ItemDetailDerived {
  const {
    item,
    seller,
    listingEngagement,
    serverCommerce,
    currentUserId,
    isFav,
    isItemSavedAnywhere,
    recommendationSections,
    soldComps,
    priceHistory,
    insetsBottom,
    colors,
    formatFromFiat,
    fxRates,
    displayMode,
  } = input;

  const displayTitle = item.title ?? 'Listing details';
  const hasPrice = item.price !== null;
  const hasDiscount = hasPrice
    && item.originalPrice !== undefined
    && item.originalPrice > item.price!;
  const formattedPrice = hasPrice
    ? formatFromFiat(item.price!, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })
    : 'Price unavailable';
  const formattedOriginal = hasDiscount
    ? formatFromFiat(item.originalPrice!, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })
    : null;
  const discountPercent = hasDiscount && item.originalPrice
    ? ((item.originalPrice - item.price!) / item.originalPrice) * 100
    : null;
  const formattedProtectionTotal = serverCommerce?.estimatedTotal != null
    ? formatFromFiat(serverCommerce.estimatedTotal, DEFAULT_CURRENCY_CODE, { displayMode: 'fiat' })
    : null;
  const priceIzeText = hasPrice && fxRates && displayMode !== 'fiat'
    ? formatIzeAmount(toIze(item.price!, 'GBP', fxRates))
    : null;

  const capabilities = buildCapabilities(item, currentUserId);
  // Use the platform view-model builder for the commerce context
  // transformation — single source of truth for direct-listing data
  // shaping. buildCapabilities is retained for the full capability
  // set (isOwner / isSold / isAvailable / commerceTier / canEnquire)
  // which the VM's capabilities subset does not expose.
  const directViewModel = buildDirectViewModel({
    listing: item,
    commerce: serverCommerce ?? undefined,
    seller: seller ?? undefined,
    currentUserId,
    isLiked: isFav,
    isSavedToCollection: isItemSavedAnywhere(item.id),
  });
  // buildDirectViewModel always returns the direct family branch; the
  // type guard narrows the discriminated union so commerce is typed.
  const commerce = isDirectViewModel(directViewModel)
    ? directViewModel.commerce
    : buildCommerceContext(item);

  // Bundle upsell: items from the same seller (more_from_seller section)
  const moreFromSellerSection = recommendationSections.find((s) => s.key === 'more_from_seller');
  const bundleItems: DisplayReadyListing[] = moreFromSellerSection
    ? moreFromSellerSection.items.filter(
        (i): i is DisplayReadyListing => !isRecommendationLook(i)
      )
    : [];

  // "Seen in Looks" — community Looks that tag this item. Sourced from
  // the `seen_in_looks` recommendation section. Only rendered when the
  // backend supplies real look data (Design.md: "Seen in Looks" below
  // core decision info).
  const seenInLooksSection = recommendationSections.find((s) => s.key === 'seen_in_looks');
  const seenInLooksItems: RecommendationLook[] = seenInLooksSection
    ? seenInLooksSection.items.filter(isRecommendationLook)
    : [];

  const interestSignal = (() => {
    if (item.likes && item.likes > 0) return `${item.likes} like${item.likes > 1 ? 's' : ''}`;
    return undefined;
  })();

  // ── Social proof line (truthful) ──
  // Built only from real engagement data — never fabricated. Combines
  // active offers (scarcity urgency) and cumulative views (popularity)
  // into a single muted line below the price. Each signal is only
  // included when the backend provides a positive count.
  const socialProofLine = (() => {
    const parts: string[] = [];
    const activeOffers = listingEngagement?.activeOfferCount;
    if (activeOffers != null && activeOffers > 0) {
      parts.push(`${activeOffers} offer${activeOffers > 1 ? 's' : ''} active`);
    }
    const views = item.views;
    if (views != null && views > 0) {
      parts.push(`${views} view${views > 1 ? 's' : ''}`);
    }
    return parts.length > 0 ? parts.join(' · ') : undefined;
  })();

  const attributeLine = [
    item.size && `Size ${item.size}`,
    item.condition,
    item.category,
  ].filter(Boolean).join(' · ');

  // Condition colour-coding + definition. Maps each ListingCondition to a
  // semantic accent and a plain-English definition. The definition is
  // surfaced inline in the "Item details" section (condition evidence
  // block) and in the condition sheet — the name is rendered beside it,
  // so the copy itself carries no redundant prefix.
  const conditionMeta = (() => {
    switch (item.condition) {
      case 'New with tags':
        return { color: colors.success, definition: 'Unworn, with original tags and packaging intact.' };
      case 'Very good':
        return { color: colors.commerceTrust, definition: 'No visible flaws; minimal signs of wear.' };
      case 'Good':
        return { color: colors.warning, definition: 'Light wear consistent with gentle use; no major flaws.' };
      case 'Satisfactory':
        return { color: colors.bronze, definition: 'Visible wear or minor flaws; fully wearable.' };
      default:
        return null;
    }
  })();

  const secondaryLine = [
    formattedProtectionTotal ? `${formattedProtectionTotal} with Buyer Protection` : null,
  ].filter(Boolean).join(' · ') || undefined;

  // The sold state is already shown via the media overlay "SOLD" badge
  // and the dock "Sold" badge — don't repeat it on the ProductFamilyBadge.
  // The family badge should communicate provenance, not transaction state.
  const familyStateAccent = null;

  // ── Dock geometry ──
  const isDualActionDock = !capabilities.isOwner && !capabilities.isSold && capabilities.canBuy && capabilities.canOffer;
  const dockHeight = isDualActionDock
    ? DockConstants.dualActionHeight
    : DockConstants.singleActionHeight;
  const scrollBottomPadding = Math.max(insetsBottom, Space.md) + dockHeight + Space.md;

  // ── Price insight rows (only truthful facts) ──
  const priceInsightRows: Array<{ label: string; value: string; muted?: boolean }> = [];
  if (hasDiscount && discountPercent && discountPercent > 0) {
    priceInsightRows.push({ label: 'Price drop', value: `-${Math.round(discountPercent)}%` });
  }
  if (
    soldComps &&
    soldComps.sampleSize >= 2 &&
    soldComps.minPrice != null &&
    soldComps.maxPrice != null
  ) {
    priceInsightRows.push({
      label: `${soldComps.sampleSize} similar sold`,
      value: `${formatFromFiat(soldComps.minPrice, soldComps.currency)}–${formatFromFiat(soldComps.maxPrice, soldComps.currency)}`,
      muted: true,
    });
  }
  const latestPriceEvent = priceHistory[0];
  if (latestPriceEvent) {
    priceInsightRows.push({
      label: 'Previous price',
      value: formatFromFiat(latestPriceEvent.previousPrice, latestPriceEvent.currency),
      muted: true,
    });
  }
  const daysListed = item.createdAt
    ? Math.max(0, Math.floor((Date.now() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    : null;
  if (daysListed != null && daysListed >= 3) {
    priceInsightRows.push({
      label: 'Time on market',
      value: daysListed === 1 ? '1 day' : `${daysListed} days`,
      muted: true,
    });
  }

  // One inline insight for the consolidated disclosure — surface only
  // the most material fact; the full breakdown expands on tap.
  const priceInsightSummary = (() => {
    if (hasDiscount && discountPercent && discountPercent > 0) {
      return `Reduced ${Math.round(discountPercent)}%`;
    }
    if (soldComps && soldComps.sampleSize >= 2) {
      return `${soldComps.sampleSize} similar sold`;
    }
    if (latestPriceEvent) {
      return `Previous ${formatFromFiat(latestPriceEvent.previousPrice, latestPriceEvent.currency)}`;
    }
    if (daysListed != null && daysListed >= 3) {
      return daysListed === 1 ? '1 day on market' : `${daysListed} days on market`;
    }
    return undefined;
  })();

  // ── Purchase detail rows (compact summary + disclosure) ──
  const purchaseSummary = [
    commerce.shippingMethod,
    commerce.protectionPolicy?.available ? commerce.protectionPolicy.label : null,
    commerce.returnPolicy
      ? commerce.returnPolicy.accepted
        ? commerce.returnPolicy.windowDays
          ? `Returns within ${commerce.returnPolicy.windowDays} days`
          : 'Returns accepted'
        : 'No returns'
      : null,
    commerce.authenticity && commerce.authenticity.status !== 'not_offered'
      ? commerce.authenticity.label ?? (commerce.authenticity.status === 'verified' ? 'Verified' : 'Eligible')
      : null,
  ].filter(Boolean).join(' · ');

  // ── First-viewport seller trust row ──
  // Compact stats line for the rich seller row: sales · rating ·
  // response rate. Only truthful backend-backed signals — never
  // fabricated. Surfaces seller identity + verification in the first
  // viewport so a buyer sees who is selling before the price.
  const sellerStatsLine = (() => {
    if (!seller) return undefined;
    const parts: string[] = [];
    if (seller.completedSales != null && seller.completedSales > 0) {
      parts.push(`${seller.completedSales} sale${seller.completedSales > 1 ? 's' : ''}`);
    }
    if (seller.rating != null && seller.rating > 0) {
      parts.push(`${seller.rating.toFixed(1)}★`);
    }
    if (seller.responseRate != null && seller.responseRate > 0) {
      parts.push(`${Math.round(seller.responseRate)}% response`);
    }
    return parts.length > 0 ? parts.join(' · ') : undefined;
  })();
  const sellerVerified = !!seller?.verified
    || seller?.verificationTier === 'seller'
    || seller?.verificationTier === 'id';

  return {
    displayTitle,
    hasPrice,
    hasDiscount,
    formattedPrice,
    formattedOriginal,
    discountPercent,
    formattedProtectionTotal,
    priceIzeText,
    capabilities,
    commerce,
    bundleItems,
    seenInLooksItems,
    interestSignal,
    socialProofLine,
    attributeLine,
    conditionMeta,
    secondaryLine,
    familyStateAccent,
    isDualActionDock,
    dockHeight,
    scrollBottomPadding,
    priceInsightRows,
    priceInsightSummary,
    purchaseSummary,
    sellerStatsLine,
    sellerVerified,
  };
}
