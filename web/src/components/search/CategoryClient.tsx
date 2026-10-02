'use client';

/**
 * CategoryClient — /category/[slug] landing: header, subcategory pill
 * rail (deep-linked via ?sub=), and RefinedResults scoped to the
 * category. Sort persists in the URL (?sort=) and survives sub switches.
 * Unknown slugs get a designed empty state, not a 404.
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { RefinedResults } from './RefinedResults';
import { useFacetParams } from './useFacetParams';
import { useSortParam } from './useSortParam';
import { DATA_MODE } from '@/lib/api/client';
import { useListings } from '@/lib/hooks/queries';
import { useCategoryDirectory } from './useCategoryDirectory';

export function CategoryClient({ slug }: { slug: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [sort, setSort] = useSortParam();
  const [filters, setFilters] = useFacetParams();
  const { bySlug } = useCategoryDirectory();
  const category = bySlug(slug);
  const subs = category?.subcategories ?? [];

  // ?sub= carries the sub id (fixture: the sub name — fixture ids ARE
  // display names; live: the taxonomy node id). Match either spelling so
  // hand-shared URLs keep working.
  const subParam = params.get('sub');
  const activeSub =
    subs.find(
      (s) =>
        s.id.toLowerCase() === subParam?.toLowerCase() ||
        s.name.toLowerCase() === subParam?.toLowerCase(),
    ) ?? null;

  // The page IS the category scope — a stray ?category= facet param would
  // only intersect to empty, so it's stripped before the request (and
  // its group is hidden from the rail/sheet regardless).
  const effectiveFilters = useMemo(
    () =>
      filters.categories.length > 0
        ? { ...filters, categories: [] }
        : filters,
    [filters],
  );

  // Sub-scope, facets and sort ride the wire in live mode — the server
  // owns the set, the order and the count.
  const {
    data,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useListings(
    category ? slug : undefined,
    undefined,
    {
      filters: effectiveFilters,
      sort,
      // A sub param that isn't a direct child (a grandchild node id like
      // 'women-knitwear', or a display name from an old link) still goes
      // to the server — the backend alias map resolves every spelling.
      subcategory: activeSub?.id ?? subParam ?? undefined,
    },
  );
  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);

  const listings = useMemo(() => {
    const all = data?.items ?? [];
    // Idempotent — live mode already scoped server-side; kept so fixture
    // and any partial rows still land on the right sub. Mixed storage
    // means a row can carry the id or the name — match either.
    if (!activeSub) return all;
    const want = [activeSub.id.toLowerCase(), activeSub.name.toLowerCase()];
    return all.filter(
      (l) => l.subcategory != null && want.includes(l.subcategory.toLowerCase()),
    );
  }, [data, activeSub]);

  const selectSub = (id: string | null) => {
    // Preserve the persisted sort across sub navigation.
    const sp = new URLSearchParams(params.toString());
    if (id) sp.set('sub', id);
    else sp.delete('sub');
    const qs = sp.toString();
    router.replace(`/category/${slug}${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  if (!category) {
    return (
      <div className="mx-auto max-w-[1440px]">
        <EmptyState
          icon="folder"
          title="Category not found"
          subtitle="This category may have moved or been renamed."
          actionLabel="Browse categories"
          onAction={() => router.push('/categories')}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      <header className="px-4 pb-1 pt-6 sm:px-6">
        <h1 className="text-screen-title text-text-primary">
          {category.name}
        </h1>
      </header>

      {subs.length > 0 ? (
        <nav
          className="no-scrollbar -mx-0 flex gap-1.5 overflow-x-auto px-4 py-3 sm:px-6"
          aria-label={`${category.name} subcategories`}
        >
          <Chip selected={activeSub === null} onClick={() => selectSub(null)}>
            All
          </Chip>
          {subs.map((s) => (
            <Chip
              key={s.id}
              selected={activeSub?.id === s.id}
              onClick={() => selectSub(s.id)}
            >
              {s.name}
            </Chip>
          ))}
        </nav>
      ) : (
        <div className="pt-3" />
      )}

      <RefinedResults
        key={`${slug}:${activeSub ?? 'all'}`}
        listings={listings}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => void refetch()}
        filters={effectiveFilters}
        onFiltersChange={setFilters}
        hideCategoryFilter
        serverOrdered={DATA_MODE === 'live'}
        // Fixture mode counts the filtered set itself — the fixture
        // total skips the client-only colour facet, so it could exceed
        // what the grid shows. Same honesty rule as /search.
        totalCount={DATA_MODE === 'live' ? (data?.total ?? null) : null}
        hasMore={DATA_MODE === 'live' && hasNextPage === true}
        onLoadMore={loadMore}
        isLoadingMore={isFetchingNextPage}
        loadMoreError={isFetchNextPageError}
        sort={sort}
        onSortChange={setSort}
        heading={(n) =>
          n === null ? (
            <span className="skeleton block h-6 w-32 rounded-md" />
          ) : (
            <p className="text-item-title font-semibold text-text-primary">
              <span className="tnum">{n.toLocaleString('en-GB')}</span>{' '}
              item{n === 1 ? '' : 's'}
              {activeSub ? ` in ${activeSub.name}` : ''}
            </p>
          )
        }
        emptyTitle={
          activeSub
            ? `No ${activeSub.name.toLowerCase()} yet`
            : `Nothing in ${category.name} yet`
        }
        emptySubtitle="Check back soon — new items arrive daily."
      />
    </div>
  );
}
