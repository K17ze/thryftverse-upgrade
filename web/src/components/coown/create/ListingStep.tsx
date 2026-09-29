'use client';

/**
 * Step 1 — pick the listing that backs the pool. Only the issuer's own
 * 'active' rows are selectable (the server re-checks ownership and status
 * on submit); a failed or empty inventory gets its own honest state.
 */

import { useRouter } from 'next/navigation';
import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { SellField, INPUT_CLASS } from '@/components/sell/SellField';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';
import { onRadioGroupKeyDown } from './controls';
import type { IssueDraft, IssueFieldErrors } from './issueDraft';

interface ListingStepProps {
  draft: IssueDraft;
  items: Listing[];
  inventoryCount: number;
  isLoading: boolean;
  isError: boolean;
  onRefetch: () => void;
  errors: IssueFieldErrors;
  onPatch: (patch: Partial<IssueDraft>) => void;
  clearError: (field: keyof IssueDraft) => void;
}

export function ListingStep({
  draft,
  items,
  inventoryCount,
  isLoading,
  isError,
  onRefetch,
  errors,
  onPatch,
  clearError,
}: ListingStepProps) {
  const router = useRouter();
  const selected = items.find((l) => l.id === draft.listingId) ?? null;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy aria-label="Loading your listings">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2.5">
            <Skeleton className="h-14 w-11 shrink-0 rounded-md" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="Couldn't load your listings"
        subtitle="Check your connection and try again."
        actionLabel="Try again"
        onAction={onRefetch}
        compact
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="inventory"
        title="No eligible listings"
        subtitle={
          inventoryCount > 0
            ? 'Your listings are all sold, paused or drafted — a pool needs an active listing behind it.'
            : 'List an item first — a Co-Own pool is built on one of your active listings.'
        }
        actionLabel="List an item"
        onAction={() => router.push('/sell')}
        compact
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="text-label text-text-secondary">Backing listing</legend>
        <ul
          className="mt-2 divide-y divide-border-subtle border-y border-border-subtle"
          role="radiogroup"
          aria-label="Your active listings"
          onKeyDown={onRadioGroupKeyDown}
        >
          {items.map((listing, i) => {
            const isSelected = listing.id === draft.listingId;
            return (
              <li key={listing.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected || (!draft.listingId && i === 0) ? 0 : -1}
                  onClick={() => {
                    onPatch({ listingId: listing.id });
                    clearError('listingId');
                  }}
                  className="pressable flex w-full items-center gap-3 py-2.5 text-left"
                >
                  <AppImage
                    src={getListingCoverUri(listing.images)}
                    alt=""
                    width={44}
                    height={56}
                    sizes="44px"
                    className="h-14 w-11 shrink-0 rounded-md"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="clamp-1 block text-body text-text-primary">
                      {listing.title}
                    </span>
                    <span className="tnum block text-caption text-text-muted">
                      {formatPrice(listing.price)}
                    </span>
                  </span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      isSelected
                        ? 'border-brand bg-brand text-text-inverse'
                        : 'border-border'
                    }`}
                    aria-hidden
                  >
                    {isSelected ? <Icon name="check" size={12} /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {errors.listingId ? (
          <p role="alert" className="mt-1.5 text-caption text-danger-text">
            {errors.listingId}
          </p>
        ) : null}
      </fieldset>

      {selected ? (
        <SellField
          id="issue-title"
          label="Pool title"
          optional
          done={draft.title.trim().length >= 3}
          error={errors.title}
          hint={`Shown on the market. Blank keeps “${selected.title} Fraction Pool”.`}
        >
          <input
            id="issue-title"
            value={draft.title}
            onChange={(e) => {
              onPatch({ title: e.target.value });
              clearError('title');
            }}
            maxLength={180}
            placeholder={`${selected.title} Fraction Pool`}
            aria-invalid={!!errors.title}
            aria-describedby={errors.title ? 'issue-title-error' : undefined}
            className={INPUT_CLASS}
          />
        </SellField>
      ) : null}
    </div>
  );
}
