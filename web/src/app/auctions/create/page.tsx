'use client';

/**
 * /auctions/create — put one of your listings under the hammer. Fixture
 * mode: the created auction joins the session board and opens on its own
 * detail surface; it dissolves on reload, and the page says so.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import { useMyListings } from '@/lib/hooks/queries';
import { useCreateAuction } from '@/lib/hooks/auction-queries';
import { formatPrice } from '@/lib/utils/format';

const DURATIONS = [
  { hours: 3, label: '3h', hint: 'Blitz' },
  { hours: 6, label: '6h', hint: 'Standard' },
  { hours: 12, label: '12h', hint: 'Evening' },
  { hours: 24, label: '24h', hint: 'Full day' },
];

export default function CreateAuctionPage() {
  const router = useRouter();
  const { show } = useToast();
  const { data: listings, isLoading } = useMyListings();
  const create = useCreateAuction();

  const available = (listings ?? []).filter((listing) => !listing.isSold);
  const [listingId, setListingId] = useState<string | null>(null);
  const [startingBid, setStartingBid] = useState('');
  const [durationHours, setDurationHours] = useState(6);
  const [buyNowOn, setBuyNowOn] = useState(false);
  const [buyNowInput, setBuyNowInput] = useState('');

  const selected = available.find((listing) => listing.id === listingId) ?? null;
  const creating = create.isPending;

  const pick = (id: string) => {
    setListingId(id);
    const listing = available.find((item) => item.id === id);
    if (listing) {
      setStartingBid(String(Math.max(1, Math.round(listing.price * 0.7))));
      setBuyNowInput(String(listing.price));
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) {
      show('Pick a listing to auction', 'error');
      return;
    }
    const opening = Number(startingBid.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(opening) || opening <= 0) {
      show('Set a starting bid above zero', 'error');
      return;
    }
    let buyNowPrice: number | undefined;
    if (buyNowOn) {
      buyNowPrice = Number(buyNowInput.replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(buyNowPrice) || buyNowPrice <= opening) {
        show('Buy now must sit above the starting bid', 'error');
        return;
      }
    }
    try {
      const created = await create.mutateAsync({
        listingId: selected.id,
        startingBid: opening,
        durationHours,
        buyNowPrice,
      });
      show('Auction is live', 'success');
      router.push(`/auctions/${created.id}`);
    } catch {
      show('Auction could not be created', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 pt-6 sm:px-6">
        <div className="flex flex-col gap-4" aria-busy aria-label="Loading your listings">
          <div className="skeleton h-7 w-56 rounded-md" />
          <div className="flex gap-3">
            <div className="skeleton h-24 w-24 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2 pt-2">
              <div className="skeleton h-4 w-2/3 rounded" />
              <div className="skeleton h-3 w-24 rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (available.length === 0) {
    return (
      <EmptyState
        icon="inventory"
        title="Nothing to auction yet"
        subtitle="List an item first — auctions are built from your active listings."
        actionLabel="List an item"
        onAction={() => router.push('/sell')}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-16 pt-6 sm:px-6">
      <h1 className="text-screen-title font-bold text-text-primary">Create auction</h1>
      <p className="mt-1 text-body text-text-secondary">
        Pick an item, set the opening bid, choose the window.
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-6">
        {/* Item */}
        <fieldset>
          <legend className="text-label font-semibold uppercase tracking-wide text-text-secondary">
            Item
          </legend>
          <div
            className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-1"
            role="radiogroup"
            aria-label="Your listings"
          >
            {available.map((listing) => (
              <button
                key={listing.id}
                type="button"
                role="radio"
                aria-checked={listing.id === listingId}
                onClick={() => pick(listing.id)}
                className={`pressable w-40 shrink-0 overflow-hidden rounded-lg border text-left ${
                  listing.id === listingId ? 'border-text-primary' : 'border-border'
                }`}
              >
                <AppImage
                  src={listing.images[0]}
                  alt={listing.title}
                  aspectRatio={1}
                  sizes="160px"
                />
                <span className="flex flex-col gap-0.5 px-2 py-2">
                  <span className="clamp-1 text-caption font-medium text-text-primary">
                    {listing.title}
                  </span>
                  <span className="tnum text-meta text-text-muted">
                    {formatPrice(listing.price)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* Economics */}
        <div className="flex flex-col gap-5 border-t border-border-subtle pt-6">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="starting-bid"
              className="text-label font-semibold uppercase tracking-wide text-text-secondary"
            >
              Starting bid
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body-large text-text-muted">
                £
              </span>
              <input
                id="starting-bid"
                value={startingBid}
                onChange={(event) => setStartingBid(event.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="h-12 w-full rounded-lg border border-border bg-input pl-9 pr-4 text-body-large tnum text-input-text outline-none placeholder:text-text-muted focus:border-text-muted"
              />
            </div>
            <p className="text-meta text-text-muted">
              Bids step up in 5% increments from your opening number.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-label font-semibold uppercase tracking-wide text-text-secondary">
              Duration
            </span>
            <div className="flex gap-2">
              {DURATIONS.map((option) => (
                <button
                  key={option.hours}
                  type="button"
                  aria-pressed={durationHours === option.hours}
                  onClick={() => setDurationHours(option.hours)}
                  className={`pressable h-9 flex-1 rounded-md text-caption font-semibold ${
                    durationHours === option.hours
                      ? 'bg-brand text-text-inverse'
                      : 'bg-surface-alt text-text-primary hover:bg-surface-raised'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-meta text-text-muted">
              {DURATIONS.find((option) => option.hours === durationHours)?.hint ?? ''} window
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              aria-pressed={buyNowOn}
              onClick={() => setBuyNowOn((on) => !on)}
              className="pressable flex h-11 items-center gap-2.5 self-start text-body-emphasis font-medium text-text-primary"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-sm border ${
                  buyNowOn ? 'border-brand bg-brand text-text-inverse' : 'border-border'
                }`}
              >
                {buyNowOn ? <Icon name="check" size={13} /> : null}
              </span>
              Buy now price
              <span className="text-meta font-normal text-text-muted">optional</span>
            </button>
            {buyNowOn ? (
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body-large text-text-muted">
                  £
                </span>
                <input
                  value={buyNowInput}
                  onChange={(event) => setBuyNowInput(event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Buy now price in pounds"
                  className="h-12 w-full rounded-lg border border-border bg-input pl-9 pr-4 text-body-large tnum text-input-text outline-none placeholder:text-text-muted focus:border-text-muted"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-border-subtle pt-6">
          <Button type="submit" size="lg" fullWidth disabled={creating || !selected}>
            {creating ? 'Creating…' : 'Start the auction'}
          </Button>
          <p className="text-meta text-text-muted">
            Fixture mode — the auction joins this session board and clears on reload.
          </p>
        </div>
      </form>
    </div>
  );
}
