import { useMemo, useState } from 'react';
import type { ListingApiItem } from '../../services/listingsApi';
import type { InventoryFilterTab, InventorySortOption } from './types';

/**
 * Owns the inventory filter/search/sort state and the derived
 * filtered + sorted listing list.
 */
export function useInventoryFilters(listings: ListingApiItem[]) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<InventoryFilterTab>('all');
  const [sortOption, setSortOption] = useState<InventorySortOption>('recent');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // ── Filtered + sorted list ──
  const filteredListings = useMemo(() => {
    let result = listings;
    if (activeFilter !== 'all') {
      result = result.filter((l) => l.status === activeFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          (l.brand ?? '').toLowerCase().includes(q)
      );
    }
    const sorted = [...result];
    switch (sortOption) {
      case 'price_high':
        sorted.sort((a, b) => b.priceGbp - a.priceGbp);
        break;
      case 'price_low':
        sorted.sort((a, b) => a.priceGbp - b.priceGbp);
        break;
      case 'most_viewed':
        sorted.sort((a, b) => (b.engagement?.views ?? 0) - (a.engagement?.views ?? 0));
        break;
      case 'best_selling':
        sorted.sort((a, b) => {
          const aSold = a.status === 'sold' ? 1 : 0;
          const bSold = b.status === 'sold' ? 1 : 0;
          if (bSold !== aSold) return bSold - aSold;
          return (b.engagement?.likes ?? 0) - (a.engagement?.likes ?? 0);
        });
        break;
      case 'recent':
      default:
        sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
    }
    return sorted;
  }, [listings, activeFilter, searchQuery, sortOption]);

  return {
    searchQuery,
    setSearchQuery,
    activeFilter,
    setActiveFilter,
    sortOption,
    setSortOption,
    sortMenuOpen,
    setSortMenuOpen,
    filteredListings,
  };
}
