import { getContextualSortOptions } from '../filters/filterTypes';

export const SORT_OPTIONS: Array<{ value: string; label: string }> =
  getContextualSortOptions('__none__').map(({ value, label }) => ({ value, label }));

export function getSortOptions(categoryId: string, searchQuery?: string): Array<{ value: string; label: string }> {
  return getContextualSortOptions(categoryId, searchQuery).map(({ value, label }) => ({ value, label }));
}
