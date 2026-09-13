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
