'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { RefinedResults } from '@/components/search/RefinedResults';
import { MemberResults } from '../MemberResults';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { savedSearchKey, useSavedSearches } from '@/lib/store/savedSearches';
import { DATA_MODE } from '@/lib/api/client';
import type { Listing } from '@/lib/contracts/domain';
import type { ListingFilters, SortKey } from '@/components/filters/filterTypes';

interface SearchResultsContainerProps {
  query: string;
  listings: Listing[];
  isLoading: boolean;
  isError: boolean;
  filters: ListingFilters;
  onFiltersChange: (f: ListingFilters) => void;
  relevanceScores?: ReadonlyMap<string, number>;
  totalCount: number | null;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  isRelaxed: boolean;
  suggestion: string | null;
  weakSuggestion: string | null;
  hasNextPage?: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  onFetchNextPage: () => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  onRetry: () => void;
}

export function SearchResultsContainer({
  query: q,
  listings,
  isLoading,
  isError,
  filters,
  onFiltersChange,
  relevanceScores,
  totalCount,
  sort,
  onSortChange,
  isRelaxed,
  suggestion,
  weakSuggestion,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  onFetchNextPage,
  sentinelRef,
  onRetry,
}: SearchResultsContainerProps) {
  const router = useRouter();
  const toast = useToast();
  const { requireAuth } = useSignupWall();
  const saveSearch = useSavedSearches((s) => s.saveSearch);

  return (
    <div className="pt-4">
      <RefinedResults
        key={q.toLowerCase()}
        listings={listings}
        isLoading={isLoading}
        isError={isError}
        stateDomain="search"
        onRetry={onRetry}
        filters={filters}
        onFiltersChange={onFiltersChange}
        relevanceScores={relevanceScores}
        serverOrdered={DATA_MODE === 'live'}
        totalCount={totalCount}
        query={q}
        sort={sort}
        onSortChange={onSortChange}
        preamble={q ? <MemberResults query={q} /> : undefined}
        notice={
          isRelaxed && suggestion ? (
            <p className="text-caption text-text-muted">
              No results for “{q}” — showing{' '}
              <Link
                href={`/search?q=${encodeURIComponent(suggestion)}`}
                className="font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary"
              >
                {suggestion}
              </Link>
            </p>
          ) : weakSuggestion ? (
            <p className="text-caption text-text-muted">
              Showing results for “{q}” — did you mean{' '}
              <Link
                href={`/search?q=${encodeURIComponent(weakSuggestion)}`}
                className="font-medium text-text-secondary underline underline-offset-2 hover:text-text-primary"
              >
                {weakSuggestion}
              </Link>
              ?
            </p>
          ) : undefined
        }
        heading={(n) => (
          <h1 className="break-words text-item-title font-semibold text-text-primary">
            {n === null ? (
              q ? (
                <>Results for “{q}”</>
              ) : (
                <>Results</>
              )
            ) : (
              <>
                <span className="tnum">{n.toLocaleString('en-GB')}</span>{' '}
                result{n === 1 ? '' : 's'}
                {q ? (
                  <> for “{isRelaxed && suggestion ? suggestion : q}”</>
                ) : null}
              </>
            )}
          </h1>
        )}
        onSaveSearch={
          q.trim().length >= 2
            ? (f) => {
                if (!requireAuth('save_item')) return;
                const duplicate = useSavedSearches
                  .getState()
                  .searches.find(
                    (s) =>
                      savedSearchKey(s.query, s.filters) ===
                      savedSearchKey(q, f),
                  );
                if (duplicate) {
                  toast.show('Already saved — find it under Saved', 'info');
                  return;
                }
                saveSearch(q, f);
                toast.show(
                  'Search saved — alerts on, find it under Saved',
                  'success',
                );
              }
            : undefined
        }
        emptyTitle={q ? `No results for “${q}”` : 'No matches with these filters'}
        emptySubtitle={
          q
            ? 'Check the spelling or try a more general term.'
            : 'Try widening the price range or removing a filter.'
        }
        emptyActionLabel="Clear search"
        onEmptyAction={() => router.push('/search')}
      />
      {/* Tail sentinel — fetches next page while server has nextCursor */}
      {hasNextPage && !isRelaxed ? (
        <>
          <div ref={sentinelRef} className="h-px" aria-hidden />
          <div className="flex flex-col items-center gap-2 px-4 py-8">
            {isFetchingNextPage ? (
              <>
                <Icon name="refresh" size={18} className="animate-spin text-text-muted" />
                <p className="sr-only" role="status">
                  Loading more results
                </p>
              </>
            ) : null}
            {isFetchNextPageError ? (
              <button
                type="button"
                onClick={onFetchNextPage}
                className="pressable rounded-md px-3 py-2 text-caption font-semibold text-brand"
              >
                Couldn&apos;t load more — try again
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
