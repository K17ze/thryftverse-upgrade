/**
 * Edit-listing view models — pure helpers and shared types extracted verbatim
 * from EditListingScreen so the screen, the hooks and the section components
 * all read from a single source of truth. No React imports: everything here
 * is a pure function over plain data.
 */
import { sanitizeDecimalInput } from '../../utils/currencyAuthoringFlows';
import type { ListingApiItem } from '../../services/listingsApi';
import type { ListingMediaDraftItem } from '../../utils/mediaUploadAsset';
import type { UploadQueueItem } from '../../services/mediaUploadQueue';
import type {
  ListingCompletenessResult,
  ListingFieldKey,
  ListingFieldValues,
} from '../../contracts/listingCategoryPolicy';
import type { SoldCompsResult } from '../../hooks/useSoldComps';
import { t } from '../../i18n';

/* ── shared types ── */

export type EditListingPickerMode = 'Category' | 'Brand' | 'Size' | 'Condition' | null;
export type EditListingSaveStage =
  | 'idle'
  | 'uploading_media'
  | 'updating_listing'
  | 'completed'
  | 'failed_recoverable';
/** Deep-linkable section anchors (ManageListing → EditListing focus param). */
export type EditListingSectionFocus = 'price' | 'shipping' | 'format';

/** Raw string-backed form values owned by useEditListingForm. */
export interface EditListingFieldValues {
  title: string;
  description: string;
  price: string;
  originalPrice: string;
  category: string;
  brand: string;
  size: string;
  condition: string;
  shippingMethod: 'standard' | 'express' | null;
  shippingPayer: 'buyer' | 'seller' | null;
}

/* ── hydration ── */

/**
 * Resolve the media kind ('image' | 'video') from a backend media record.
 * The canonical `ListingApiItem.media` entry declares `kind`, but legacy
 * payloads may carry a different discriminator (`type`, `mediaType`,
 * `contentType`). We read whichever is present and fall back to `'image'`
 * only when none is — so videos returned by the API are not silently
 * misclassified as images (E16).
 */
export function resolveApiMediaKind(
  m: { id: string; url: string; sortOrder: number },
): 'image' | 'video' {
  const raw =
    (m as { type?: unknown }).type ??
    (m as { mediaType?: unknown }).mediaType ??
    (m as { kind?: unknown }).kind ??
    (m as { contentType?: unknown }).contentType;
  if (typeof raw === 'string' && raw.toLowerCase().includes('video')) {
    return 'video';
  }
  return 'image';
}

/** Map a fetched listing onto the edit form's string-backed field bag. */
export function hydrateEditListingFields(l: ListingApiItem): EditListingFieldValues {
  return {
    title: l.title ?? '',
    description: l.description ?? '',
    price: String(l.priceGbp ?? ''),
    originalPrice: l.originalPriceGbp ? String(l.originalPriceGbp) : '',
    category: l.category ? l.category.charAt(0).toUpperCase() + l.category.slice(1) : '',
    brand: l.brand ?? '',
    size: l.size ?? '',
    condition: l.condition ?? '',
    shippingMethod: (l.shippingMethod as 'standard' | 'express' | null) ?? null,
    shippingPayer: (l.shippingPayer as 'buyer' | 'seller' | null) ?? null };
}

/**
 * Map a fetched listing's media (canonical `media[]` first, legacy
 * `images`/`imageUrl` fallback) onto stable-ID draft items plus the initial
 * remote-order manifest used for dirty detection.
 */
export function hydrateEditListingMedia(
  l: ListingApiItem,
  itemId: string,
): { items: ListingMediaDraftItem[]; remoteIds: string[] } {
  const initialPhotos = l.images ?? (l.imageUrl ? [l.imageUrl] : []);
  const apiMedia = l.media ?? [];
  const hasMediaIds = apiMedia.length > 0;
  const items: ListingMediaDraftItem[] = (hasMediaIds ? apiMedia.map((m) => m.url) : initialPhotos).map((uri, i) => ({
    id: hasMediaIds ? apiMedia[i].id : `remote_${itemId}_${i}`,
    mediaId: hasMediaIds ? apiMedia[i].id : undefined,
    uri,
    kind: hasMediaIds ? resolveApiMediaKind(apiMedia[i]) : ('image' as const),
    source: 'remote' as const,
    status: 'uploaded' as const,
    publicUrl: uri,
    // Preserve the media contract fields on remote items so a
    // re-attach keeps placeholders, geometry and art direction.
    width: apiMedia[i]?.width ?? undefined,
    height: apiMedia[i]?.height ?? undefined,
    focalPoint: apiMedia[i]?.focalPoint ?? undefined,
    blurhash: apiMedia[i]?.blurhash ?? null,
    posterUrl: apiMedia[i]?.poster ?? null }));
  return { items, remoteIds: items.map((m) => m.mediaId ?? m.id) };
}

/* ── dirty state ── */

export interface EditListingMediaDirtyFlags {
  hasLocalItems: boolean;
  removedRemoteIds: string[];
  remoteMediaOrder: string[];
  initialRemoteOrder: string[];
}

export function computeEditListingHasChanges(
  listing: ListingApiItem | null,
  fields: EditListingFieldValues,
  media: EditListingMediaDirtyFlags,
): boolean {
  if (!listing) return false;
  const originalCategory = listing.category
    ? listing.category.charAt(0).toUpperCase() + listing.category.slice(1)
    : '';
  const originalOriginalPrice = listing.originalPriceGbp ? String(listing.originalPriceGbp) : '';
  const originalShippingMethod = listing.shippingMethod ?? null;
  const originalShippingPayer = listing.shippingPayer ?? null;

  return (
    fields.title !== listing.title ||
    fields.description !== (listing.description ?? '') ||
    fields.price !== String(listing.priceGbp ?? '') ||
    fields.originalPrice !== originalOriginalPrice ||
    fields.category !== originalCategory ||
    fields.brand !== (listing.brand ?? '') ||
    fields.size !== (listing.size ?? '') ||
    fields.condition !== (listing.condition ?? '') ||
    fields.shippingMethod !== originalShippingMethod ||
    fields.shippingPayer !== originalShippingPayer ||
    media.hasLocalItems ||
    media.removedRemoteIds.length > 0 ||
    media.remoteMediaOrder.length !== media.initialRemoteOrder.length ||
    media.remoteMediaOrder.some((id, i) => id !== media.initialRemoteOrder[i])
  );
}

/* ── completeness + validation ── */

/** Shape a `ListingFieldValues` for the category-policy completeness check. */
export function buildEditListingPolicyValues(
  fields: EditListingFieldValues,
  mediaItems: ListingMediaDraftItem[],
): ListingFieldValues {
  const numericPrice = Number(sanitizeDecimalInput(fields.price));
  return {
    title: fields.title.trim() || null,
    description: fields.description.trim() || null,
    price: numericPrice > 0 ? numericPrice : null,
    category: fields.category || null,
    brand: fields.brand || null,
    size: fields.size || null,
    condition: fields.condition || null,
    images: mediaItems.length > 0 ? mediaItems.map((m) => m.publicUrl || m.uri) : null,
    shippingMethod: fields.shippingMethod || null,
    shippingPayer: fields.shippingPayer || null };
}

export const EDIT_LISTING_FIELD_LABELS: Record<ListingFieldKey, string> = {
  title: 'title',
  description: 'description',
  price: 'price',
  category: 'category',
  subcategory: 'subcategory',
  brand: 'brand',
  size: 'size',
  condition: 'condition',
  images: 'photos',
  shippingMethod: 'shipping method',
  shippingPayer: 'shipping payer' };

export function buildEditCompletenessLabel(c: ListingCompletenessResult): string {
  return c.canActivate
    ? 'Ready to publish'
    : `Missing: ${c.missingRequired.map((f) => EDIT_LISTING_FIELD_LABELS[f]).join(', ')}`;
}

export function buildEditRecommendedLabel(c: ListingCompletenessResult): string | null {
  return c.missingRecommended.length > 0
    ? `Suggested: ${c.missingRecommended.map((f) => EDIT_LISTING_FIELD_LABELS[f]).join(', ')}`
    : null;
}

/**
 * Category-aware validation: check the completeness result's missing
 * required fields instead of universal brand/size assumptions. Brandless
 * vintage and sizeless home goods are valid when the policy says so.
 * Returns a localized error message, or '' when the form is valid.
 */
export function validateEditListingFields(
  fields: EditListingFieldValues,
  mediaCount: number,
  missingRequired: ListingFieldKey[],
): string {
  const trimmedTitle = fields.title.trim();
  const trimmedDesc = fields.description.trim();
  const numericPrice = Number(sanitizeDecimalInput(fields.price));

  for (const field of missingRequired) {
    switch (field) {
      case 'title': if (!trimmedTitle) return t('listing.create.errorAddTitle'); break;
      case 'category': if (!fields.category) return t('listing.create.errorSelectCategoryField'); break;
      case 'brand': if (!fields.brand) return t('listing.create.errorSelectBrandField'); break;
      case 'size': if (!fields.size) return t('listing.create.errorSelectSizeField'); break;
      case 'condition': if (!fields.condition) return t('listing.create.errorSelectConditionField'); break;
      case 'images': if (mediaCount === 0) return t('listing.create.errorAddPhoto'); break;
      case 'description':
        if (!trimmedDesc || trimmedDesc.length < 10) return t('listing.create.errorAddDescription');
        break;
      case 'price':
        if (!Number.isFinite(numericPrice) || numericPrice <= 0) return t('listing.create.errorValidPrice');
        break;
      default: break;
    }
  }
  return '';
}

/* ── pricing derived values ── */

export function computeEditDiscount(
  price: string,
  originalPrice: string,
): { hasDiscount: boolean; discountPercent: number } {
  const orig = Number(originalPrice);
  const curr = Number(price);
  const hasDiscount = orig > 0 && curr > 0 && curr < orig;
  return {
    hasDiscount,
    discountPercent: hasDiscount ? Math.round(((orig - curr) / orig) * 100) : 0 };
}

export type PriceVsMarket = 'below' | 'above' | 'in_range' | null;

export function computePriceVsMarket(
  soldComps: SoldCompsResult,
  numericPrice: number,
  hasValidPrice: boolean,
): PriceVsMarket {
  if (!soldComps.hasComps || !hasValidPrice) return null;
  if (soldComps.minPrice != null && numericPrice < soldComps.minPrice * 0.8) return 'below';
  if (soldComps.maxPrice != null && numericPrice > soldComps.maxPrice * 1.2) return 'above';
  return 'in_range';
}

/* ── save manifest ── */

/**
 * Build the attachment manifest from the current mediaItems order.
 * Remote items map to their backend mediaId; newly uploaded local items map
 * to the deterministic attachment id used by createListingImageOnApi. This
 * is what tells the backend the final order, removals and cover.
 */
export function buildEditAttachmentManifest(
  mediaItems: ListingMediaDraftItem[],
  queueItems: UploadQueueItem[],
  removedRemoteIds: string[],
  itemId: string,
): {
  attachmentOrder: string[];
  coverMediaId: string | undefined;
  coverItem: ListingMediaDraftItem | undefined;
  coverUri: string | undefined;
  coverFinalizationId: string | undefined;
  uploadedItems: UploadQueueItem[];
} {
  // Attach only uploads that produced both a canonical URL and a
  // finalization handle.
  const uploadedItems = queueItems.filter(
    (q) => q.state === 'uploaded' && !!q.publicUrl && !!q.finalizationId,
  );
  const attachmentOrder: string[] = [];
  for (const m of mediaItems) {
    if (m.source === 'remote') {
      const remoteId = m.mediaId ?? m.id;
      if (!removedRemoteIds.includes(remoteId)) {
        attachmentOrder.push(remoteId);
      }
    } else {
      const qi = uploadedItems.find((q) => q.id === m.id);
      if (qi) {
        attachmentOrder.push(`${itemId}_media_${qi.id}`);
      }
    }
  }

  // Determine the cover media id — the first item in the final order.
  let coverMediaId: string | undefined;
  const coverItem = mediaItems[0];
  if (coverItem) {
    if (coverItem.source === 'remote') {
      coverMediaId = coverItem.mediaId ?? coverItem.id;
    } else {
      const qi = uploadedItems.find((q) => q.id === coverItem.id);
      if (qi) {
        coverMediaId = `${itemId}_media_${qi.id}`;
      }
    }
  }

  // The queue result is fresher than state — the setMediaItems during the
  // upload stage has not re-rendered into this closure, so read the cover's
  // uploaded URL from the queue items first. A local file:// URI is useless
  // to the API: with no canonical remote URL the save fails through the
  // existing error path instead of sending one.
  const coverUri = coverItem
    ? (uploadedItems.find((q) => q.id === coverItem.id)?.publicUrl || coverItem.publicUrl)
    : undefined;

  const coverFinalizationId = coverItem?.source === 'local'
    ? queueItems.find((item) => item.id === coverItem.id)?.finalizationId ?? undefined
    : undefined;

  return { attachmentOrder, coverMediaId, coverItem, coverUri, coverFinalizationId, uploadedItems };
}

/* ── listing status ── */

export function resolveListingStatusLabel(status: string | undefined): string | null {
  switch (status) {
    case 'active': return t('listing.edit.statusActive');
    case 'draft': return t('listing.edit.statusDraft');
    case 'sold': return t('listing.edit.statusSold');
    case 'paused': return t('listing.edit.statusPaused');
    default: return null;
  }
}
