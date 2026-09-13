import type { OutfitSlot, StyleItem, suggestCompletion } from '../../services/styleGraph';

// Pure derivations for the outfit-builder screen — keeps the orchestrator
// thin. Mirrors components/checkout/checkoutViewModels.ts.

/** Fixed slot order for the builder canvas — mirrors the original screen. */
export const OUTFIT_SLOTS: OutfitSlot[] = ['top', 'bottom', 'shoes', 'outerwear', 'accessory'];

export type OutfitItemsMap = Record<OutfitSlot, StyleItem | undefined>;

export type CompletionSuggestion = NonNullable<ReturnType<typeof suggestCompletion>>;

/** Structural mirror of the listing shape the builder reads. BackendDataContext
 *  may carry fixture-enriched fields (imageUri, styleTags, color) beyond the
 *  canonical Listing contract, so this is intentionally a loose superset. */
export interface BuilderListingLike {
  id: string;
  title: string;
  category: string;
  subcategory?: string | null;
  brand?: string;
  color?: string;
  condition?: string;
  images?: string[];
  imageUri?: string;
  price?: number;
  styleTags?: string[];
}

/** Convert a backend listing row into a StyleItem — field mapping preserved
 *  verbatim from the original screen. */
export function listingToStyleItem(l: BuilderListingLike): StyleItem {
  return {
    id: l.id,
    title: l.title,
    category: l.category,
    subcategory: l.subcategory ?? undefined,
    brand: l.brand,
    color: l.color ?? 'black',
    condition: l.condition,
    imageUri: l.images?.[0] ?? l.imageUri,
    price: l.price,
    styleTags: l.styleTags };
}

/** Fresh empty selection across all slots. */
export function emptyOutfitItems(): OutfitItemsMap {
  return { top: undefined, bottom: undefined, shoes: undefined, outerwear: undefined, accessory: undefined };
}

/** Number of slots currently holding an item. */
export function filledSlotCount(items: OutfitItemsMap): number {
  return OUTFIT_SLOTS.filter((s) => items[s]).length;
}

export interface BuilderScreenState {
  showLoading: boolean;
  showError: boolean;
  showEmpty: boolean;
  showContent: boolean;
}

/** Screen-level state coverage (loading / empty / error / offline) —
 *  derivation preserved verbatim from the original screen. */
export function deriveBuilderScreenState({
  isSyncing,
  lastError,
  listingsCount }: {
  isSyncing: boolean;
  lastError: string | null;
  listingsCount: number;
}): BuilderScreenState {
  return {
    showLoading: isSyncing && listingsCount === 0,
    showError: !isSyncing && !!lastError && listingsCount === 0,
    showEmpty: !isSyncing && !lastError && listingsCount === 0,
    showContent: listingsCount > 0 };
}

/** Footer CTA title — preserved verbatim. */
export function saveCtaTitle(filledCount: number): string {
  return filledCount >= 2 ? 'Save Outfit' : `Select ${2 - filledCount} more item${filledCount === 1 ? '' : 's'}`;
}

/** Share-sheet message body — preserved verbatim (slot order = OUTFIT_SLOTS). */
export function buildShareMessage(outfitName: string, items: OutfitItemsMap): string {
  const itemNames = OUTFIT_SLOTS.map((slot) => items[slot])
    .filter(Boolean)
    .map((it) => it!.title)
    .join(', ');
  return `Check out my outfit "${outfitName}" on Thryftverse — ${itemNames}`;
}
