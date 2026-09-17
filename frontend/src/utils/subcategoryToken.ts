/**
 * Derives the matchable subcategory token for a browse context.
 *
 * Browse routes carry either a taxonomy leaf id (`women-clothing`) or a
 * display title ("Clothing", "All Women"). The token is the human-meaningful
 * remainder used to match `listing.subcategory` (a display name stored on
 * the listing row) — both client-side predicates and the `/listings`
 * `subcategory` query param consume the same derivation so they can never
 * disagree.
 */
export function getSubcategoryToken(categoryId: string, subcategoryId?: string, title?: string): string {
  if (subcategoryId) {
    return subcategoryId
      .toLowerCase()
      .replace(/^[^-]+-/, '')
      .replace(/-/g, ' ')
      .trim();
  }

  if (!title) {
    return '';
  }

  const loweredTitle = title.toLowerCase().replace(/["']/g, '').trim();
  if (loweredTitle.startsWith('all ')) {
    return '';
  }

  const cleanedCategoryId = categoryId.toLowerCase();
  if (loweredTitle.startsWith(cleanedCategoryId)) {
    return loweredTitle.slice(cleanedCategoryId.length).trim();
  }

  return loweredTitle;
}
