import { sanitizeDecimalInput, sanitizeIntegerInput } from './currencyAuthoringFlows';
import type { ListingMediaDraftItem } from './mediaUploadAsset';
import type { MediaUploadQueue } from '../services/mediaUploadQueue';
import type { ListingFieldKey } from '../contracts/listingCategoryPolicy';
import type { ListingMode } from '../components/listing/ListingModeSelector';
import { getListingModeOptions } from '../components/listing/ListingModeSelector';

const CONDITION_OPTIONS = ['New with tags', 'Very good', 'Good', 'Satisfactory'];

export type PickerMode = 'Brand' | 'Size' | 'Condition' | 'Category' | 'Format' | null;

export type PublishedMedia = {
  url: string;
  width?: number;
  height?: number;
};

export function resolvePublishedMedia(
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

export function getPickerOptionsForMode(mode: PickerMode): string[] {
  switch (mode) {
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
}

export interface CoOwnPricingResult {
  calculatedPrice: string | null;
  calculatedSharePrice: string | null;
}

export function computeCoOwnPricing(
  price: string,
  shareCountInput: string,
  sharePriceInput: string,
): CoOwnPricingResult {
  const listingPrice = Number(sanitizeDecimalInput(price));
  const shareCount = Math.min(20, Math.max(1, Math.floor(Number(shareCountInput))));
  const sharePrice = Number(sanitizeDecimalInput(sharePriceInput));
  if (!Number.isFinite(shareCount) || shareCount <= 0) {
    return { calculatedPrice: null, calculatedSharePrice: null };
  }
  if (Number.isFinite(sharePrice) && sharePrice > 0 && (!Number.isFinite(listingPrice) || listingPrice <= 0)) {
    return {
      calculatedPrice: (sharePrice * shareCount).toFixed(2),
      calculatedSharePrice: null,
    };
  }
  if (Number.isFinite(listingPrice) && listingPrice > 0) {
    return {
      calculatedPrice: null,
      calculatedSharePrice: (listingPrice / shareCount).toFixed(2),
    };
  }
  return { calculatedPrice: null, calculatedSharePrice: null };
}

export type PriceVsMarket = 'below' | 'in_range' | 'above' | null;

export function evaluatePriceVsMarket(
  hasComps: boolean,
  hasValidPrice: boolean,
  numericPrice: number,
  minPrice: number | null | undefined,
  maxPrice: number | null | undefined,
): PriceVsMarket {
  if (!hasComps || !hasValidPrice) return null;
  if (minPrice != null && numericPrice < minPrice * 0.8) return 'below';
  if (maxPrice != null && numericPrice > maxPrice * 1.2) return 'above';
  return 'in_range';
}

export function computeDiscount(originalPrice: string, price: string): { hasDiscount: boolean; discountPercent: number } {
  const orig = Number(originalPrice);
  const curr = Number(price);
  const hasDiscount = orig > 0 && curr > 0 && curr < orig;
  if (!hasDiscount) return { hasDiscount: false, discountPercent: 0 };
  return { hasDiscount: true, discountPercent: Math.round(((orig - curr) / orig) * 100) };
}

export interface PublishErrorInput {
  missingRequired: ListingFieldKey[];
  listingMode: ListingMode;
  trimmedDescription: string;
  numericPrice: number;
  shareCountInput: string;
  sharePriceInput: string;
  authPhotosLength: number;
  startingBid: string;
}

export function buildPublishErrors(input: PublishErrorInput): Record<string, string> {
  const nextErrors: Record<string, string> = {};

  for (const field of input.missingRequired) {
    switch (field) {
      case 'title': nextErrors.title = 'Add a title.'; break;
      case 'category': nextErrors.category = 'Select a category.'; break;
      case 'size': nextErrors.size = 'Choose a size.'; break;
      case 'condition': nextErrors.condition = 'Choose a condition.'; break;
      case 'images': nextErrors.photos = 'Add at least one photo before publishing.'; break;
      case 'description':
        if (!input.trimmedDescription || input.trimmedDescription.length < 10)
          nextErrors.description = 'Add a description with at least 10 characters.';
        break;
      case 'price':
        if (!Number.isFinite(input.numericPrice) || input.numericPrice <= 0)
          nextErrors.price = 'Enter a valid price greater than 0.';
        break;
      default: break;
    }
  }

  if (input.listingMode === 'co_own') {
    const shareCount = Math.floor(Number(input.shareCountInput));
    const sharePrice = Number(sanitizeDecimalInput(input.sharePriceInput));
    if (!Number.isFinite(shareCount) || shareCount <= 0) nextErrors.shareCount = 'Enter a valid share count.';
    if (!Number.isFinite(sharePrice) || sharePrice <= 0) nextErrors.sharePrice = 'Enter a valid share price.';
    if (input.authPhotosLength === 0) nextErrors.authPhotos = 'Attach authentication photos before issuing co-own units.';
  }

  if (input.listingMode === 'auction') {
    const bid = Number(sanitizeDecimalInput(input.startingBid));
    if (!Number.isFinite(bid) || bid <= 0) nextErrors.startingBid = 'Enter a valid starting bid greater than 0.';
  }

  return nextErrors;
}

export interface ContextualPhotoPrompt {
  icon: string;
  text: string;
}

export function buildContextualPhotoPrompts(
  brand: string,
  condition: string,
  photoCount: number,
  category: string,
): ContextualPhotoPrompt[] {
  const LUXURY_BRANDS = ['Gucci', 'Prada', 'Louis Vuitton', 'Chanel', 'Hermès', 'Dior', 'Balenciaga', 'Bottega Veneta', 'Saint Laurent', 'Burberry', 'Versace'];
  const isLuxury = LUXURY_BRANDS.some((b) => brand.toLowerCase() === b.toLowerCase());
  const hasFlaws = condition === 'Good' || condition === 'Satisfactory';

  const prompts: ContextualPhotoPrompt[] = [];

  if (photoCount === 1) {
    prompts.push({ icon: 'camera-outline', text: 'Add a photo of the back' });
  }
  if (photoCount === 2) {
    prompts.push({ icon: 'camera-outline', text: 'Add a side or detail shot' });
  }
  if (category && photoCount > 0 && photoCount < 5) {
    prompts.push({ icon: 'pricetag-outline', text: 'Show the size label' });
  }
  if (isLuxury && photoCount > 0) {
    prompts.push({ icon: 'shield-checkmark-outline', text: 'Add serial, stitching, or receipt evidence' });
  }
  if (hasFlaws && photoCount > 0) {
    prompts.push({ icon: 'warning-outline', text: 'Add a close-up of any flaws' });
  }

  return prompts.slice(0, 2);
}

export function formatShippingSummary(
  shippingMethod: 'standard' | 'express' | null,
  shippingPayer: 'buyer' | 'seller' | null,
): string {
  if (shippingMethod && shippingPayer) {
    return `${shippingMethod === 'standard' ? 'Standard' : 'Express'} · ${shippingPayer === 'buyer' ? 'Buyer pays' : 'Free shipping'}`;
  }
  return 'Choose shipping & payment';
}

export function formatReviewSummary(
  listingMode: ListingMode,
  auctionDurationHours: number,
  numericStartingBid: number,
  reservePrice: string,
  currencySymbol: string,
  parsedShareCount: number,
  parsedSharePrice: number,
  authPhotosLength: number,
): string {
  if (listingMode === 'auction') {
    const duration = auctionDurationHours < 72 ? `${auctionDurationHours}h` : `${auctionDurationHours / 24}d`;
    const reserve = reservePrice ? ` · reserve ${currencySymbol}${Number(sanitizeDecimalInput(reservePrice)).toFixed(0)}` : '';
    return `Auction · ${duration} · starts ${currencySymbol}${numericStartingBid.toFixed(0)}${reserve}`;
  }
  const auth = authPhotosLength > 0 ? ' · auth verified' : '';
  return `Co-Own · ${parsedShareCount || 0} shares · ${currencySymbol}${parsedSharePrice.toFixed(2)}/share${auth}`;
}

export function sanitizeShareCountInput(value: string): string {
  const sanitized = sanitizeIntegerInput(value);
  if (!sanitized) return '';
  const parsed = Math.floor(Number(sanitized));
  if (!Number.isFinite(parsed) || parsed <= 0) return '1';
  return String(Math.min(20, parsed));
}
