export type InventoryFilterTab = 'all' | 'active' | 'sold' | 'paused' | 'draft';

export type InventorySortOption =
  | 'recent'
  | 'price_high'
  | 'price_low'
  | 'most_viewed'
  | 'best_selling';

export const INVENTORY_FILTER_TABS: { key: InventoryFilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'sold', label: 'Sold' },
  { key: 'paused', label: 'Paused' },
  { key: 'draft', label: 'Draft' },
];

export const INVENTORY_SORT_OPTIONS: { key: InventorySortOption; label: string }[] = [
  { key: 'recent', label: 'Recently listed' },
  { key: 'price_high', label: 'Price (high to low)' },
  { key: 'price_low', label: 'Price (low to high)' },
  { key: 'most_viewed', label: 'Most viewed' },
  { key: 'best_selling', label: 'Sold first' },
];

export interface InventorySummary {
  total: number;
  active: number;
  sold: number;
  paused: number;
  draft: number;
  totalValue: number;
}

export interface InventoryConfirmSheetState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  variant: 'default' | 'danger';
}
