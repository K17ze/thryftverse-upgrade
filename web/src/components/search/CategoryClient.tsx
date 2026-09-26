'use client';

/**
 * CategoryClient — /category/[slug] landing: header, subcategory pill
 * rail (deep-linked via ?sub=), and RefinedResults scoped to the
 * category. Sort persists in the URL (?sort=) and survives sub switches.
 * Unknown slugs get a designed empty state, not a 404.
 */

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { RefinedResults } from './RefinedResults';
import { useSortParam } from './useSortParam';
import { CATEGORIES } from '@/lib/data/fixtures';
import { useListings } from '@/lib/hooks/queries';
import { subcategoriesFor } from './taxonomy';

export function CategoryClient({ slug }: { slug: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [sort, setSort] = useSortParam();
  const category = CATEGORIES.find((c) => c.slug === slug);
  const subs = subcategoriesFor(slug);

  const subParam = params.get('sub');
  const activeSub =
    subs.find((s) => s.toLowerCase() === subParam?.toLowerCase()) ?? null;

  const { data, isLoading } = useListings(category ? slug : undefined);

  const listings = useMemo(() => {
    const all = data ?? [];
    if (!activeSub) return all;
    return all.filter(
      (l) => l.subcategory?.toLowerCase() === activeSub.toLowerCase(),
    );
  }, [data, activeSub]);

  const selectSub = (name: string | null) => {
    // Preserve the persisted sort across sub navigation.
    const sp = new URLSearchParams(params.toString());
    if (name) sp.set('sub', name);
    else sp.delete('sub');
    const qs = sp.toString();
    router.replace(`/category/${slug}${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  if (!category) {
    return (
      <div className="mx-auto max-w-[1600px]">
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
    <div className="mx-auto max-w-[1600px]">
      <header className="px-4 pb-1 pt-6 sm:px-6">
        <h1 className="text-screen-title font-bold text-text-primary">
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
              key={s}
              selected={activeSub === s}
              onClick={() => selectSub(s)}
            >
              {s}
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
        hideCategoryFilter
        sort={sort}
        onSortChange={setSort}
        heading={(n) =>
          n === null ? null : (
            <p className="text-item-title font-semibold text-text-primary">
              <span className="tnum">{n.toLocaleString('en-GB')}</span>{' '}
              item{n === 1 ? '' : 's'}
              {activeSub ? ` in ${activeSub}` : ''}
            </p>
          )
        }
        emptyTitle={
          activeSub
            ? `No ${activeSub.toLowerCase()} yet`
            : `Nothing in ${category.name} yet`
        }
        emptySubtitle="Check back soon — new items arrive daily."
      />
    </div>
  );
}
