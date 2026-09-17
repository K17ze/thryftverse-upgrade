/**
 * Pure sort/cursor-clause builder for GET /listings.
 *
 * Extracted from the route handler so the keyset-pagination semantics are
 * unit-testable without a database. All SQL fragments use the `l.` (listings),
 * `li.` (likes aggregate) and `a.` (live auctions) aliases the handler's
 * FROM/JOIN clauses define.
 */

export type ListingSort =
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'most_liked'
  | 'recommended'
  | 'ending_soon';

export interface ListingCursor {
  sortValue: string | number | null;
  id: string;
}

export interface ListingSortPlan {
  orderBy: string;
  /** Keyset predicate to AND into WHERE, or null for the first page. */
  cursorCondition: string | null;
  /** Values appended to the query args, in placeholder order. */
  cursorArgs: Array<string | number>;
}

/**
 * Build the ORDER BY clause and (when a cursor is present) the keyset
 * predicate + args for a listings page request.
 *
 * `argOffset` is the number of args already bound, so placeholders start at
 * `$argOffset + 1`.
 */
export function buildListingSortPlan(
  sort: ListingSort,
  cursor: ListingCursor | null,
  argOffset: number,
): ListingSortPlan {
  const p = (n: number) => `$${argOffset + n}`;

  const orderBy =
    sort === 'price_asc'
      ? 'l.price_gbp ASC, l.id ASC'
      : sort === 'price_desc'
        ? 'l.price_gbp DESC, l.id DESC'
        : sort === 'most_liked' || sort === 'recommended'
          // 'Recommended' shares the client-side likes-desc semantic —
          // engagement-ranked, deterministic tiebreak by id.
          ? 'COALESCE(li.like_count, 0) DESC, l.id DESC'
          : sort === 'ending_soon'
            // Listings with no live auction sink to the end.
            ? 'a.ends_at ASC NULLS LAST, l.id ASC'
            : 'l.created_at DESC, l.id DESC';

  if (!cursor) {
    return { orderBy, cursorCondition: null, cursorArgs: [] };
  }

  if (sort === 'price_asc') {
    return {
      orderBy,
      cursorCondition: `(l.price_gbp, l.id) > (${p(1)}, ${p(2)})`,
      cursorArgs: [cursor.sortValue ?? 0, cursor.id],
    };
  }
  if (sort === 'price_desc') {
    return {
      orderBy,
      cursorCondition: `(l.price_gbp, l.id) < (${p(1)}, ${p(2)})`,
      cursorArgs: [cursor.sortValue ?? 0, cursor.id],
    };
  }
  if (sort === 'most_liked' || sort === 'recommended') {
    return {
      orderBy,
      cursorCondition: `(COALESCE(li.like_count, 0), l.id) < (${p(1)}, ${p(2)})`,
      cursorArgs: [cursor.sortValue ?? 0, cursor.id],
    };
  }
  if (sort === 'ending_soon') {
    if (cursor.sortValue === null) {
      // Inside the NULLS LAST tail — paginate on id only.
      return {
        orderBy,
        cursorCondition: `a.ends_at IS NULL AND l.id > ${p(1)}`,
        cursorArgs: [cursor.id],
      };
    }
    // NULLS LAST tail: every null-auction row sorts after any non-null
    // cursor row, so include them explicitly — a bare row comparison
    // would evaluate NULL and drop the tail forever.
    return {
      orderBy,
      cursorCondition: `(a.ends_at IS NULL OR (a.ends_at, l.id) > (${p(1)}, ${p(2)}))`,
      cursorArgs: [cursor.sortValue, cursor.id],
    };
  }
  return {
    orderBy,
    cursorCondition: `(l.created_at, l.id) < (${p(1)}, ${p(2)})`,
    cursorArgs: [cursor.sortValue ?? '', cursor.id],
  };
}
