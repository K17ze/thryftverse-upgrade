import type { Listing, User } from '@/lib/contracts/domain';
import {
  canonicalCategoryId,
  canonicalCondition,
  canonicalSubcategoryId,
  isKnownCategoryId,
  isSizeRequiredCategory,
} from '../taxonomy';
import {
  type SellDraft,
  type ListingWithSellExtras,
  listingSustainabilityTags,
  isShippingMethod,
  isShippingPayer,
  DESCRIPTION_MIN,
} from './sellDraftTypes';
import { parsePriceInput, protectionFeeGbp } from './sellPricing';

/**
 * Prefill the draft from an existing listing — the ?edit=<id> path.
 * Taxonomy values are canonicalised on the way in: the draft only ever
 * carries ids the pickers can emit, so re-publishing an edited listing
 * can't leak a dead fixture slug or a display-name subcategory. Values
 * with no honest canonical equivalent come back empty — the picker shows
 * unselected and the completeness gate asks for a re-pick.
 */
export function draftFromListing(listing: Listing): SellDraft {
  const category = canonicalCategoryId(listing.category);
  // Media rows carry the authoritative order + kind — images[] alone
  // collapses video slots to their poster still, which would re-attach a
  // video slot as a plain image on save. Prefer media uris when present.
  const stagedUris = listing.media?.length
    ? listing.media.map((m) => m.uri)
    : listing.images;
  return {
    photos: stagedUris.filter(Boolean),
    title: listing.title ?? '',
    brand: listing.brand ?? '',
    category,
    subcategory: canonicalSubcategoryId(category, listing.subcategory),
    condition: canonicalCondition(listing.condition),
    size: listing.size ?? '',
    description: listing.description ?? '',
    // Listings published through this flow carry tags forward.
    tags: (listing as Listing & { tags?: string[] }).tags ?? [],
    price: listing.price ? String(listing.price) : '',
    originalPrice: listing.originalPrice ? String(listing.originalPrice) : '',
    // Same extension-field pattern as `tags` — seller-asserted claims that
    // ride on the record outside the shared contract.
    sustainabilityTags: listingSustainabilityTags(listing),
    shippingMethod: isShippingMethod(listing.shippingMethod) ? listing.shippingMethod : '',
    shippingPayer: isShippingPayer(listing.shippingPayer) ? listing.shippingPayer : '',
  };
}

/**
 * The draft projected as a Listing — feeds the real PDP gallery on the
 * preview surface so sellers see the same media treatment buyers get.
 * Never published; the preview id never resolves outside this screen.
 */
export function draftToPreviewListing(
  draft: SellDraft,
  seller: User,
  /** Staged-media lookup (kind + poster) keyed by the draft's preview URL —
   *  video slots project as their poster still, never a playable-source uri
   *  into an <img> slot. */
  mediaOf?: (src: string) => { kind?: 'image' | 'video'; poster?: string | null } | undefined,
): Listing {
  const price = parsePriceInput(draft.price);
  // RRP only rides the preview when it's an honest "was" price — a value
  // at or under the ask would fake a discount, so it never reaches the
  // projection (the composer validates the same rule before publish).
  const originalPrice = parsePriceInput(draft.originalPrice);
  const honestRrp =
    originalPrice != null && price != null && originalPrice > price
      ? originalPrice
      : undefined;
  return {
    id: 'sell-preview',
    title: draft.title.trim() || 'Untitled listing',
    brand: draft.brand.trim() || null,
    size: draft.size || null,
    condition: draft.condition || 'Good',
    price: price ?? 0,
    originalPrice: honestRrp,
    priceWithProtection:
      price != null ? Math.round((price + protectionFeeGbp(price)) * 100) / 100 : undefined,
    // Video slots project their poster still into images[] (the backend's
    // own listingImageUrls semantics — media[] carries the real uri).
    images: draft.photos
      .map((src) => {
        const m = mediaOf?.(src);
        return m?.kind === 'video' ? (m.poster ?? src) : src;
      })
      .filter(Boolean),
    media: draft.photos.length
      ? draft.photos.map((src) => {
          const m = mediaOf?.(src);
          return {
            kind: (m?.kind === 'video' ? 'video' : 'image') as 'image' | 'video',
            uri: src,
            poster: m?.poster ?? null,
          };
        })
      : undefined,
    ...({ sustainabilityTags: [...draft.sustainabilityTags] } as Partial<ListingWithSellExtras>),
    likes: 0,
    views: 0,
    sellerId: seller.id,
    seller: {
      id: seller.id,
      username: seller.username,
      avatar: seller.avatar,
      rating: seller.rating,
      reviewCount: seller.reviewCount,
      location: seller.location,
      verified: seller.isVerified,
    },
    category: draft.category,
    subcategory: draft.subcategory || null,
    description: draft.description.trim(),
    status: 'draft',
    shippingMethod: draft.shippingMethod || null,
    shippingPayer: draft.shippingPayer || null,
  };
}

/**
 * What the draft still needs before publish — label grammar mirrors the
 * mobile completeness line ("Still needs: photos, price"). Order matches
 * the composer step order so it reads as a checklist.
 */
export function missingPublishFields(draft: SellDraft): string[] {
  const missing: string[] = [];
  if (!draft.photos.length) missing.push('photos');
  if (draft.title.trim().length < 3) missing.push('title');
  // Category is universally required — and must be a canonical root id a
  // picker could have emitted (a dead fixture slug can't activate).
  if (!draft.category || !isKnownCategoryId(draft.category)) missing.push('category');
  // Condition is universally required (UNIVERSAL_REQUIRED in the policy).
  if (!draft.condition) missing.push('condition');
  // Size is category-policy dependent: required under the shoes policy
  // (subcategory *-shoes), recommended/hidden elsewhere.
  if (isSizeRequiredCategory(draft.category, draft.subcategory) && !draft.size) {
    missing.push('size');
  }
  if (draft.description.trim().length < DESCRIPTION_MIN) missing.push('description');
  if (parsePriceInput(draft.price) == null) missing.push('price');
  return missing;
}
