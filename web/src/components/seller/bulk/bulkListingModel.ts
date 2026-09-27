/**
 * Bulk-listing draft model — port of frontend/services/bulkListingApi.ts.
 * Same field rules as the sell composer's publish gate, evaluated client-
 * side so per-row truth is visible before anything is submitted.
 */

import type { ListingCondition } from '@/lib/contracts/domain';

export type BulkDraftStatus =
  | 'pending' // saved, not yet validated
  | 'ready' // validated clean — publishable
  | 'error' // validated, has blocking errors
  | 'publishing' // in-flight this run
  | 'published' // committed — carries listingId
  | 'failed'; // publish attempted and rejected

export interface BulkDraftItem {
  tempId: string;
  title: string;
  description: string;
  price: number;
  category: string;
  condition: ListingCondition | '';
  brand: string;
  size: string;
  images: string[];
  status: BulkDraftStatus;
  errors: string[];
  /** Set once the row actually exists on the shelf. */
  listingId?: string;
  publishError?: string;
}

export const BULK_TITLE_MIN = 3;
export const BULK_TITLE_MAX = 80;
export const BULK_PRICE_MIN = 0.5;
export const BULK_PRICE_MAX = 100_000;

const CONDITIONS: ListingCondition[] = [
  'New with tags',
  'New without tags',
  'Very good',
  'Good',
  'Satisfactory',
];

export function newBulkDraft(): BulkDraftItem {
  return {
    tempId: `bulk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    description: '',
    price: 0,
    category: '',
    condition: '',
    brand: '',
    size: '',
    images: [],
    status: 'pending',
    errors: [],
  };
}

/** Mirrors validateBulkListing — identical thresholds, GBP wording. */
export function validateBulkDraft(item: BulkDraftItem): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const title = item.title.trim();
  if (title.length < BULK_TITLE_MIN) {
    errors.push(`Title must be at least ${BULK_TITLE_MIN} characters`);
  } else if (title.length > BULK_TITLE_MAX) {
    errors.push(`Title must be ${BULK_TITLE_MAX} characters or fewer`);
  }
  if (!Number.isFinite(item.price) || item.price < BULK_PRICE_MIN) {
    errors.push('Price must be at least £0.50');
  } else if (item.price > BULK_PRICE_MAX) {
    errors.push('Price must be £100,000 or less');
  }
  if (!item.category.trim()) errors.push('Category is required');
  if (!item.condition || !CONDITIONS.includes(item.condition)) {
    errors.push('Condition is required');
  }
  if (!item.images.length) errors.push('At least one photo is required');
  return { valid: errors.length === 0, errors };
}

/** Row-level status badge copy — one honest word per state. */
export function bulkStatusLabel(status: BulkDraftStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'error':
      return 'Needs work';
    case 'publishing':
      return 'Publishing…';
    case 'published':
      return 'Published';
    case 'failed':
      return 'Failed';
    default:
      return 'Not checked';
  }
}
