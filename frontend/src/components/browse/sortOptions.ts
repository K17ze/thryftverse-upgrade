export const SORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'Recommended', label: 'Recommended' },
  { value: 'Newest', label: 'Newest' },
  { value: 'Price: Low to High', label: 'Price: Low to High' },
  { value: 'Price: High to Low', label: 'Price: High to Low' },
  { value: 'Most liked', label: 'Most liked' },
];

// Auction-only sort option — only surfaced when the browse context is
// auction-related (spec §08: "Do not show: Ending soon for fixed-price-only
// results"). Prevents an irrelevant sort from appearing in normal listing
// browse where no items have end times.
const AUCTION_SORT_OPTION = { value: 'Ending soon', label: 'Ending soon' };

export function getSortOptions(categoryId: string, searchQuery?: string): Array<{ value: string; label: string }> {
  const isAuctionContext =
    categoryId.toLowerCase().includes('auction') ||
    (searchQuery?.toLowerCase().includes('auction') ?? false);
  return isAuctionContext ? [...SORT_OPTIONS, AUCTION_SORT_OPTION] : SORT_OPTIONS;
}
