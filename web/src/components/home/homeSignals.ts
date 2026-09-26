/**
 * Home signal rail — port of the mobile dynamic signal chips
 * (algorithmicSignalsService / CURATED_BASELINE_SIGNALS). One rail mixing
 * departments, style signals and brands — the same "quick signal"
 * mechanic. Unlike the old department-only pills, matching runs across
 * title, brand, category and subcategory with word boundaries, so 'men'
 * can never hit 'women' and style/brand chips ('Denim', "Levi's") resolve
 * to real results instead of empty feeds.
 */

import type { DiscoveryListingSummary } from '@/lib/contracts/domain';

export interface HomeSignal {
  label: string;
  /** Lowercase match key — 'all' passes everything. */
  key: string;
}

export const HOME_SIGNALS: HomeSignal[] = [
  { label: 'All', key: 'all' },
  // Departments
  { label: 'Women', key: 'women' },
  { label: 'Men', key: 'men' },
  { label: 'Sneakers', key: 'sneakers' },
  { label: 'Bags', key: 'bags' },
  { label: 'Accessories', key: 'accessories' },
  // Style signals (mobile curated baseline)
  { label: 'Denim', key: 'denim' },
  { label: 'Vintage', key: 'vintage' },
  { label: 'Knitwear', key: 'knitwear' },
  { label: 'Coats', key: 'coats' },
  // Brands — the deep-cut signals the mobile rail learns dynamically
  { label: "Levi's", key: "levi's" },
  { label: 'Nike', key: 'nike' },
  { label: 'Carhartt WIP', key: 'carhartt' },
];

const wordBoundary = (key: string) =>
  new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');

/** Mirrors mobile matchesSignal — word-boundary match on identity fields. */
export function matchesHomeSignal(
  listing: DiscoveryListingSummary,
  key: string,
): boolean {
  if (key === 'all') return true;
  const re = wordBoundary(key.toLowerCase());
  return (
    re.test(listing.category) ||
    (listing.subcategory != null && re.test(listing.subcategory)) ||
    re.test(listing.title) ||
    (listing.brand != null && re.test(listing.brand))
  );
}
