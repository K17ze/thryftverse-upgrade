/**
 * Listing quality scoring heuristic.
 *
 * Calculates a 0–100 quality score from listing draft fields, broken into
 * weighted dimensions: photos, identity, description, pricing, shipping,
 * tags. Returns the score, a tier label, and actionable missing items so
 * the UI can guide sellers toward higher-quality listings.
 */

export type ListingMode = 'sell_now' | 'co_own' | 'auction';

export interface ListingQualityInput {
  photos: string[];
  title: string;
  brand: string;
  category: string;
  size: string;
  condition: string;
  description: string;
  price: string;
  originalPrice: string;
  tags: string[];
  shippingMethod: 'standard' | 'express' | null;
  shippingPayer: 'buyer' | 'seller' | null;
  listingMode: ListingMode;
  /** Auction mode — used as price proxy when listingMode is 'auction' */
  startingBid?: string;
}

export interface QualityItem {
  key: string;
  label: string;
  icon: string;
  done: boolean;
  /** Weight (0–1) contributing to the overall score */
  weight: number;
}

export type QualityTier = 'basic' | 'good' | 'excellent';

export interface ListingQualityResult {
  score: number;
  tier: QualityTier;
  tierLabel: string;
  items: QualityItem[];
  missingItems: QualityItem[];
  tips: string[];
}

const MIN_PHOTOS_FOR_FULL = 4;
const MIN_DESC_FOR_FULL = 60;
const MIN_TAGS_FOR_FULL = 3;

export function calculateListingQuality(input: ListingQualityInput): ListingQualityResult {
  const photoCount = input.photos.length;
  const descLen = input.description.trim().length;
  const tagCount = input.tags.length;
  const hasPrice = parseFloat(input.price) > 0 || parseFloat(input.startingBid ?? '0') > 0;

  const items: QualityItem[] = [
    // Photos — 25% (most important)
    {
      key: 'photos',
      label: photoCount >= MIN_PHOTOS_FOR_FULL ? '4+ photos' : 'Photos',
      icon: 'camera-outline',
      done: photoCount >= 1,
      weight: photoCount >= MIN_PHOTOS_FOR_FULL ? 0.25 : photoCount >= 1 ? 0.12 : 0,
    },
    // Identity — 20%
    {
      key: 'title',
      label: 'Title',
      icon: 'text-outline',
      done: input.title.trim().length > 0,
      weight: 0.08,
    },
    {
      key: 'brand',
      label: 'Brand',
      icon: 'pricetag-outline',
      done: input.brand.trim().length > 0,
      weight: 0.05,
    },
    {
      key: 'category',
      label: 'Category',
      icon: 'folder-outline',
      done: input.category.trim().length > 0,
      weight: 0.04,
    },
    {
      key: 'size',
      label: 'Size',
      icon: 'resize-outline',
      done: input.size.trim().length > 0,
      weight: 0.03,
    },
    // Description — 20%
    {
      key: 'description',
      label: descLen >= MIN_DESC_FOR_FULL ? 'Detailed description' : 'Description',
      icon: 'document-text-outline',
      done: descLen >= 10,
      weight: descLen >= MIN_DESC_FOR_FULL ? 0.20 : descLen >= 10 ? 0.10 : 0,
    },
    // Pricing — 15%
    {
      key: 'price',
      label: 'Price',
      icon: 'cash-outline',
      done: hasPrice,
      weight: 0.10,
    },
    {
      key: 'originalPrice',
      label: 'Original price',
      icon: 'pricetags-outline',
      done: parseFloat(input.originalPrice) > 0,
      weight: 0.05,
    },
    // Shipping — 10%
    {
      key: 'shipping',
      label: 'Shipping method',
      icon: 'cube-outline',
      done: input.shippingMethod !== null,
      weight: 0.05,
    },
    {
      key: 'shippingPayer',
      label: 'Shipping payer',
      icon: 'card-outline',
      done: input.shippingPayer !== null,
      weight: 0.05,
    },
    // Tags — 10%
    {
      key: 'tags',
      label: tagCount >= MIN_TAGS_FOR_FULL ? '3+ tags' : 'Tags',
      icon: 'hash-outline',
      done: tagCount >= 1,
      weight: tagCount >= MIN_TAGS_FOR_FULL ? 0.10 : tagCount >= 1 ? 0.05 : 0,
    },
  ];

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const score = Math.min(100, Math.round(totalWeight * 100));

  let tier: QualityTier = 'basic';
  let tierLabel = 'Basic';
  if (score >= 80) {
    tier = 'excellent';
    tierLabel = 'Excellent';
  } else if (score >= 55) {
    tier = 'good';
    tierLabel = 'Good';
  }

  const missingItems = items.filter((i) => !i.done);
  const tips: string[] = [];
  if (photoCount < MIN_PHOTOS_FOR_FULL) {
    tips.push(photoCount === 0 ? 'Add at least one photo to publish' : 'Add 4+ photos for more views');
  }
  if (descLen < MIN_DESC_FOR_FULL && descLen >= 10) {
    tips.push('Write a detailed description (60+ chars) to build buyer confidence');
  }
  if (!input.brand.trim()) tips.push('Add brand for better search discoverability');
  if (tagCount < MIN_TAGS_FOR_FULL) tips.push('Add 3+ tags to improve discovery');
  if (!input.originalPrice.trim() || parseFloat(input.originalPrice) <= 0) {
    tips.push('Add original price to show value');
  }
  if (!input.shippingMethod) tips.push('Set a shipping method');
  if (!input.shippingPayer) tips.push('Specify who pays for shipping');

  return { score, tier, tierLabel, items, missingItems, tips };
}
