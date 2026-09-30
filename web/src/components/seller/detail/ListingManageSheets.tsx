'use client';

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { ListingStatsSheet } from '@/components/seller/ListingStatsSheet';
import { OfferToLikersSheet } from '@/components/seller/OfferToLikersSheet';
import { PromoteListingSheet } from '@/components/seller/PromoteListingSheet';
import { formatPrice } from '@/lib/utils/format';
import type { Listing } from '@/lib/contracts/domain';
import { listingStatusOf, type ManagedListingRow } from '@/components/seller/listingManagementModel';
import type { ListingPendingAction } from './ListingManageActionMenu';

/** A stats-sheet-compatible row shim — the sheet reads listing + status. */
function toRow(listing: Listing): ManagedListingRow {
  return {
    listing,
    status: listingStatusOf(listing),
    imported: false,
    views: listing.views ?? 0,
    likes: listing.likes,
    watchers: 0,
    effectiveCreatedAt: listing.createdAt ?? new Date().toISOString(),
  };
}

const CONFIRM_COPY: Record<ListingPendingAction['kind'], { title: string; body: string; action: string }> = {
  pause: {
    title: 'Pause this listing?',
    body: 'It stays yours but buyers can’t see or buy it until you resume.',
    action: 'Pause listing',
  },
  resume: {
    title: 'Resume this listing?',
    body: 'It goes back on sale and shows in feeds again.',
    action: 'Resume',
  },
  'mark-sold': {
    title: 'Mark as sold?',
    body: 'It comes off the public shelf and shows as sold. You can relist it anytime.',
    action: 'Mark sold',
  },
  relist: {
    title: 'Relist this item?',
    body: 'It goes back on sale as an active listing.',
    action: 'Relist',
  },
  delete: {
    title: 'Delete this listing?',
    body: 'It will be removed permanently — likes, watchers and its listing history are lost. This can’t be undone.',
    action: 'Delete',
  },
};

interface ListingManageSheetsProps {
  listing: Listing | null;
  statsOpen: boolean;
  offerOpen: boolean;
  promoteOpen: boolean;
  priceOpen: boolean;
  priceDraft: string;
  priceValid: boolean;
  isPricePending: boolean;
  pending: ListingPendingAction | null;
  isActionPending: boolean;
  likerCount: number;
  onCloseStats: () => void;
  onCloseOffer: () => void;
  onClosePromote: () => void;
  onClosePrice: () => void;
  onPriceDraftChange: (v: string) => void;
  onSubmitPrice: () => void;
  onClosePending: () => void;
  onConfirmAction: () => void;
}

export function ListingManageSheets({
  listing,
  statsOpen,
  offerOpen,
  promoteOpen,
  priceOpen,
  priceDraft,
  priceValid,
  isPricePending,
  pending,
  isActionPending,
  likerCount,
  onCloseStats,
  onCloseOffer,
  onClosePromote,
  onClosePrice,
  onPriceDraftChange,
  onSubmitPrice,
  onClosePending,
  onConfirmAction,
}: ListingManageSheetsProps) {
  return (
    <>
      <ListingStatsSheet
        row={listing && statsOpen ? toRow(listing) : null}
        onClose={onCloseStats}
      />
      <OfferToLikersSheet
        open={offerOpen}
        listing={listing}
        likerCount={likerCount}
        onClose={onCloseOffer}
      />
      <PromoteListingSheet
        open={promoteOpen}
        listing={listing}
        onClose={onClosePromote}
      />

      {/* Repricing — dedicated price-adjust write */}
      <Sheet
        open={priceOpen}
        onClose={onClosePrice}
        title="Change price"
        ariaLabel="Change listing price"
        maxWidth={420}
      >
        <div className="px-5 pb-6">
          <p className="text-body text-text-secondary">
            Buyers with alerts on this listing are notified, and the new price
            applies to every open surface.
          </p>
          {listing ? (
            <p className="tnum mt-2 text-caption text-text-muted">
              Current price: {formatPrice(listing.price)}
            </p>
          ) : null}
          <label className="mt-4 block">
            <span className="text-label text-text-muted">New price</span>
            <span className="mt-1.5 flex items-center rounded-md border border-border bg-input px-3 py-2 focus-within:border-text-muted">
              <span className="text-body text-text-muted">£</span>
              <input
                value={priceDraft}
                onChange={(e) => onPriceDraftChange(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                aria-label="New price in pounds"
                placeholder="0.00"
                className="tnum ml-1.5 w-full bg-transparent text-body text-input-text placeholder:text-text-muted focus:outline-none"
              />
            </span>
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="quiet"
              size="md"
              onClick={onClosePrice}
              disabled={isPricePending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={onSubmitPrice}
              disabled={!priceValid || isPricePending}
              aria-busy={isPricePending}
            >
              {isPricePending ? 'Saving…' : 'Save price'}
            </Button>
          </div>
        </div>
      </Sheet>

      {/* Lifecycle confirm sheet */}
      <Sheet
        open={pending != null}
        onClose={onClosePending}
        title={pending ? CONFIRM_COPY[pending.kind].title : undefined}
        ariaLabel="Confirm listing action"
        maxWidth={420}
      >
        <div className="px-5 py-5">
          {pending ? (
            <>
              <p className="text-body text-text-secondary">{CONFIRM_COPY[pending.kind].body}</p>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="quiet" size="md" onClick={onClosePending}>
                  Cancel
                </Button>
                <Button
                  variant={pending.kind === 'delete' ? 'danger' : 'primary'}
                  size="md"
                  onClick={onConfirmAction}
                  disabled={isActionPending}
                  aria-busy={isActionPending}
                >
                  {CONFIRM_COPY[pending.kind].action}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Sheet>
    </>
  );
}
