// Shared filter-domain types and option constants for FilterScreen and its
// extracted components. Kept as a single source of truth so the screen,
// section components and hooks all agree on the option vocabulary.

export type SortOption = 'Recommended' | 'Newest' | 'Price: Low to High' | 'Price: High to Low' | 'Most liked' | 'Ending soon';
export type ConditionOption = 'Any' | string;

export const SORT_OPTIONS: Array<{ value: SortOption; label: string; accessibilityLabel: string }> = [
  { value: 'Recommended', label: 'Recommended', accessibilityLabel: 'Sort by recommended' },
  { value: 'Newest', label: 'Newest', accessibilityLabel: 'Sort by newest items' },
  { value: 'Price: Low to High', label: 'Price: Low to High', accessibilityLabel: 'Sort by price low to high' },
  { value: 'Price: High to Low', label: 'Price: High to Low', accessibilityLabel: 'Sort by price high to low' },
  { value: 'Most liked', label: 'Most liked', accessibilityLabel: 'Sort by most liked items' },
];

// "Ending soon" only applies to auction listings — it is meaningless for
// fixed-price browse/search, so it is excluded unless the filter context is
// an auction category (mirrors BrowseScreen.getSortOptions).
export const AUCTION_SORT_OPTION: { value: SortOption; label: string; accessibilityLabel: string } = {
  value: 'Ending soon',
  label: 'Ending soon',
  accessibilityLabel: 'Sort by ending soon' };

/**
 * Single auction-context predicate — a category OR a query mentioning
 * auctions qualifies. Previously the browse menu checked both while
 * FilterScreen checked only the category, so a search for "auction watch"
 * silently hid the 'Ending soon' option.
 */
export function isAuctionSortContext(categoryId: string, searchQuery?: string): boolean {
  return (
    categoryId.toLowerCase().includes('auction') ||
    (searchQuery?.toLowerCase().includes('auction') ?? false)
  );
}

/** Canonical sort list for a context — SORT_OPTIONS plus the auction-only
 *  option when the context qualifies. */
export function getContextualSortOptions(
  categoryId: string,
  searchQuery?: string,
): Array<{ value: SortOption; label: string; accessibilityLabel: string }> {
  return isAuctionSortContext(categoryId, searchQuery)
    ? [...SORT_OPTIONS, AUCTION_SORT_OPTION]
    : SORT_OPTIONS;
}
