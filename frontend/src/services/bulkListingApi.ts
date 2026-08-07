import { createListingOnApi } from './listingsApi';

// ---------------------------------------------------------------------------
// Bulk Listing — types and orchestration for batch listing creation.
//
// Reuses the canonical listing creation API (`createListingOnApi`) for every
// draft item. Validation is performed client-side first so the user gets
// immediate feedback before any network call. Submission runs sequentially so
// per-item failures do not abort the whole batch and progress can be reported
// accurately to the caller.
// ---------------------------------------------------------------------------

export interface BulkListingItem {
  tempId: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: string;
  brand?: string;
  size?: string;
  images: string[];
  status: 'pending' | 'validating' | 'ready' | 'error';
  errors?: string[];
}

export interface BulkListingResult {
  success: boolean;
  listingId?: string;
  tempId: string;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const MIN_TITLE_LENGTH = 3;
const MAX_TITLE_LENGTH = 80;
const MIN_PRICE = 0.5;
const MAX_PRICE = 100000;
const VALID_CONDITIONS = ['New with tags', 'Very good', 'Good', 'Satisfactory'];

/**
 * Client-side validation for a single bulk listing draft.
 * Mirrors the field rules enforced by the full SellScreen publish flow so the
 * user sees the same constraints before batch submission.
 */
export function validateBulkListing(item: BulkListingItem): ValidationResult {
  const errors: string[] = [];

  const trimmedTitle = item.title.trim();
  if (trimmedTitle.length < MIN_TITLE_LENGTH) {
    errors.push(`Title must be at least ${MIN_TITLE_LENGTH} characters.`);
  }
  if (trimmedTitle.length > MAX_TITLE_LENGTH) {
    errors.push(`Title must be ${MAX_TITLE_LENGTH} characters or fewer.`);
  }

  if (!Number.isFinite(item.price) || item.price < MIN_PRICE) {
    errors.push(`Price must be at least £${MIN_PRICE.toFixed(2)}.`);
  }
  if (item.price > MAX_PRICE) {
    errors.push(`Price must be £${MAX_PRICE.toLocaleString()} or less.`);
  }

  if (!item.category || item.category.trim().length === 0) {
    errors.push('Category is required.');
  }

  if (!item.condition || !VALID_CONDITIONS.includes(item.condition)) {
    errors.push('Condition is required.');
  }

  if (!item.images || item.images.length === 0) {
    errors.push('At least one photo is required.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Submit a batch of pre-validated draft listings sequentially.
 *
 * Each item is created via the canonical `createListingOnApi` endpoint. A
 * per-item failure is recorded in the result array without aborting the rest
 * of the batch. The optional `onProgress` callback receives the running count
 * of processed items so callers can render a truthful progress indicator.
 *
 * The caller MUST supply the authenticated seller's id; this service never
 * fabricates ownership.
 */
export async function submitBulkListings(
  items: BulkListingItem[],
  sellerId: string,
  onProgress?: (processed: number, total: number) => void,
): Promise<BulkListingResult[]> {
  const total = items.length;
  const results: BulkListingResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const coverImage = item.images[0];
      const listingId = `listing_${Date.now()}_${i}_${Math.floor(Math.random() * 10000)}`;
      await createListingOnApi({
        id: listingId,
        sellerId,
        title: item.title.trim(),
        description: item.description.trim(),
        priceGbp: item.price,
        imageUrl: coverImage,
        status: 'active',
        category: item.category,
        brand: item.brand || undefined,
        size: item.size || undefined,
        condition: item.condition,
      });
      results.push({ success: true, listingId, tempId: item.tempId });
    } catch (error: unknown) {
      const message =
        typeof error === 'object' && error !== null && 'message' in error && typeof (error as Error).message === 'string'
          ? (error as Error).message
          : 'Failed to create listing.';
      results.push({ success: false, tempId: item.tempId, error: message });
    }
    onProgress?.(i + 1, total);
  }

  return results;
}
