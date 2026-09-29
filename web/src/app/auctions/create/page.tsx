'use client';

/**
 * /auctions/create — put one of your listings under the hammer. Fixture
 * mode: the created auction joins the session board and opens on its own
 * detail surface; it dissolves on reload, and the page says so.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { AppImage } from '@/components/ui/AppImage';
import { useMyListings } from '@/lib/hooks/queries';
import { useCreateAuction } from '@/lib/hooks/auction-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { newAuctionCreateAttemptKey } from '@/lib/api/services/auctions';
import { formatPrice } from '@/lib/utils/format';

const DURATIONS = [
  { hours: 3, label: '3h', hint: 'Blitz' },
  { hours: 6, label: '6h', hint: 'Standard' },
  { hours: 12, label: '12h', hint: 'Evening' },
  { hours: 24, label: '24h', hint: 'Full day' },
];

interface FormErrors {
  item?: string;
  startingBid?: string;
  buyNow?: string;
  reserve?: string;
  schedule?: string;
}

/**
 * Radio-group keyboard grammar — the checkout SelectionList pattern:
 * roving tabindex (only the selected, or the first enabled, radio is
 * tabbable) and arrows/Home/End that move focus AND selection, matching
 * the ARIA radio-group pattern.
 */
function onRadioGroupKeyDown(event: React.KeyboardEvent<HTMLElement>) {
  const radios = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
  );
  const current = radios.indexOf(document.activeElement as HTMLElement);
  if (current < 0) return;
  let next = -1;
  if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
    next = (current + 1) % radios.length;
  } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
    next = (current - 1 + radios.length) % radios.length;
  } else if (event.key === 'Home') {
    next = 0;
  } else if (event.key === 'End') {
    next = radios.length - 1;
  }
  if (next < 0 || next === current) return;
  event.preventDefault();
  const target = radios[next];
  target?.focus();
  target?.click();
}

/** Earliest schedulable slot — five minutes out, post-mount so SSR agrees. */
function minStartValue(now: number): string {
  const d = new Date(now + 5 * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatScheduledStart(iso: string): string {
  const at = new Date(iso);
  return `${at.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })} · ${at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function CreateAuctionPage() {
  const router = useRouter();
  const { show } = useToast();
  const { isGuest } = useSession();
  const { data: listings, isLoading, isError, refetch } = useMyListings();
  const create = useCreateAuction();

  const available = (listings ?? []).filter((listing) => !listing.isSold);
  const [listingId, setListingId] = useState<string | null>(null);
  const [startingBid, setStartingBid] = useState('');
  const [durationHours, setDurationHours] = useState(6);
  const [buyNowOn, setBuyNowOn] = useState(false);
  const [buyNowInput, setBuyNowInput] = useState('');
  const [reserveOn, setReserveOn] = useState(false);
  const [reserveInput, setReserveInput] = useState('');
  const [schedule, setSchedule] = useState<'now' | 'later'>('now');
  const [startAt, setStartAt] = useState('');
  const [minStart, setMinStart] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  /** One idempotency key per form session — minted on first commit and
   *  held across retries so a lost response replays the created auction
   *  server-side instead of double-listing (same grammar as the bid
   *  sheet's attempt key). Cleared on success so the next create is a
   *  fresh attempt. */
  const createKeyRef = useRef<string | null>(null);

  // datetime-local min is clock-derived — compute post-mount so SSR and
  // the first client render agree.
  useEffect(() => {
    setMinStart(minStartValue(Date.now()));
  }, []);

  const selected = available.find((listing) => listing.id === listingId) ?? null;
  const creating = create.isPending;
  // Parsed once so every consumer of the opening figure — validation and
  // the create payload — reads the same number.
  const openingBid = Number(startingBid.replace(/[^0-9.]/g, ''));
  // The live create schema drops reservePriceGbp (backend index.ts:37308)
  // — collecting it would silently discard seller input. Fixture mode
  // keeps it fully working (the ended grammar reads it).
  const liveMode = DATA_MODE === 'live';

  const pick = (id: string) => {
    setListingId(id);
    const listing = available.find((item) => item.id === id);
    if (listing) {
      setStartingBid(String(Math.max(1, Math.round(listing.price * 0.7))));
      setBuyNowInput(String(listing.price));
    }
    setErrors((e) => (e.item ? { ...e, item: undefined } : e));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: FormErrors = {};
    if (!selected) next.item = 'Pick a listing to auction';
    const opening = openingBid;
    if (!Number.isFinite(opening) || opening <= 0) {
      next.startingBid = 'Set a starting bid above zero';
    }
    let buyNowPrice: number | undefined;
    if (buyNowOn) {
      buyNowPrice = Number(buyNowInput.replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(buyNowPrice) || buyNowPrice <= opening) {
        next.buyNow = 'Buy now must sit above the starting bid';
      }
    }
    let reservePrice: number | undefined;
    if (reserveOn) {
      reservePrice = Number(reserveInput.replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(reservePrice) || reservePrice <= 0) {
        next.reserve = 'Set a reserve above zero';
      } else if (reservePrice < opening) {
        next.reserve = 'A reserve should sit at or above the starting bid';
      } else if (buyNowPrice != null && reservePrice >= buyNowPrice) {
        next.reserve = 'A reserve should sit below the buy-now price';
      }
    }
    let scheduledIso: string | undefined;
    if (schedule === 'later') {
      if (!startAt) next.schedule = 'Pick a date and time';
      else if (Date.parse(startAt) <= Date.now()) {
        next.schedule = 'Start time must be in the future';
      } else {
        scheduledIso = new Date(startAt).toISOString();
      }
    }
    setErrors(next);
    if (Object.values(next).some(Boolean) || !selected) return;
    // Mint on the first commit of this form session — retries of the same
    // attempt reuse it; a new attempt mints a new key.
    createKeyRef.current ??= newAuctionCreateAttemptKey();
    try {
      const created = await create.mutateAsync({
        listingId: selected.id,
        startingBid: opening,
        durationHours,
        buyNowPrice,
        reservePrice,
        startsAt: scheduledIso,
        idempotencyKey: createKeyRef.current,
      });
      createKeyRef.current = null;
      show(
        scheduledIso
          ? `Auction scheduled — ${formatScheduledStart(scheduledIso)}`
          : 'Auction is live',
        'success',
      );
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

  // A failed listings fetch is not an empty closet — retry, don't
  // misreport "nothing to auction".
  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="Couldn't load your listings"
        subtitle="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  if (isGuest) {
    return (
      <EmptyState
        icon="auction"
        title="Sign in to create an auction"
        subtitle="Auctions are built from your listings — sign in to list and sell."
        actionLabel="Sign in"
        onAction={() => router.push('/auth')}
      />
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
      <h1 className="text-screen-title text-text-primary">Create auction</h1>
      <p className="mt-1 text-body text-text-secondary">
        Pick an item, set the opening bid, choose the window.
      </p>

      {/* Single-column composer — the fields are the truth; no restated
          run-sheet. Commit rides as the last hairline-separated block. */}
      <form onSubmit={submit} className="mt-6 flex flex-col gap-6">
        {/* Item */}
        <fieldset>
          <legend className="text-label text-text-secondary">
            Item
          </legend>
          <div
            className="no-scrollbar mt-3 flex gap-3 overflow-x-auto pb-1"
            role="radiogroup"
            aria-label="Your listings"
            onKeyDown={onRadioGroupKeyDown}
          >
            {available.map((listing, i) => (
              <button
                key={listing.id}
                type="button"
                role="radio"
                aria-checked={listing.id === listingId}
                // Roving tabindex — the checked radio is the tab stop;
                // nothing picked yet → the first listing takes it.
                tabIndex={listing.id === listingId || (!listingId && i === 0) ? 0 : -1}
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
          {errors.item ? (
            <p role="alert" className="mt-1.5 text-caption text-danger-text">{errors.item}</p>
          ) : null}
        </fieldset>

        {/* Economics */}
        <div className="flex flex-col gap-5 border-t border-border-subtle pt-6">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="starting-bid"
              className="text-label text-text-secondary"
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
                onChange={(event) => {
                  setStartingBid(event.target.value);
                  setErrors((e) => (e.startingBid ? { ...e, startingBid: undefined } : e));
                }}
                inputMode="decimal"
                placeholder="0"
                aria-invalid={!!errors.startingBid}
                className="h-12 w-full rounded-lg border border-border bg-input pl-9 pr-4 text-body-large tnum text-input-text outline-none placeholder:text-text-muted focus:border-text-muted"
              />
            </div>
            {errors.startingBid ? (
              <p role="alert" className="text-caption text-danger-text">{errors.startingBid}</p>
            ) : (
              <p className="text-meta text-text-muted">
                Bids step up in 5% increments from your opening number.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-label text-text-secondary">
              Start
            </span>
            <div
              className="flex gap-2"
              role="radiogroup"
              aria-label="When the auction opens"
              onKeyDown={onRadioGroupKeyDown}
            >
              {(
                [
                  { key: 'now' as const, label: 'Now', hint: 'Opens the moment you create it' },
                  { key: 'later' as const, label: 'Schedule', hint: 'Lists under Upcoming until it opens' },
                ]
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={schedule === option.key}
                  tabIndex={schedule === option.key ? 0 : -1}
                  onClick={() => setSchedule(option.key)}
                  className={`pressable h-9 flex-1 rounded-md text-caption font-semibold ${
                    schedule === option.key
                      ? 'bg-brand text-text-inverse'
                      : 'bg-surface-alt text-text-primary hover:bg-surface-raised'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {schedule === 'later' ? (
              <input
                type="datetime-local"
                value={startAt}
                min={minStart}
                onChange={(event) => {
                  setStartAt(event.target.value);
                  setErrors((e) => (e.schedule ? { ...e, schedule: undefined } : e));
                }}
                aria-label="Scheduled start"
                aria-invalid={!!errors.schedule}
                className="h-12 w-full rounded-lg border border-border bg-input px-4 text-body text-input-text outline-none focus:border-text-muted"
              />
            ) : null}
            {errors.schedule ? (
              <p role="alert" className="text-caption text-danger-text">{errors.schedule}</p>
            ) : (
              <p className="text-meta text-text-muted">
                {schedule === 'later'
                  ? 'The window starts when it opens — a scheduled auction sits under Upcoming.'
                  : 'The window starts as soon as it goes live.'}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-label text-text-secondary">
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
                  onChange={(event) => {
                    setBuyNowInput(event.target.value);
                    setErrors((e) => (e.buyNow ? { ...e, buyNow: undefined } : e));
                  }}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Buy now price in pounds"
                  aria-invalid={!!errors.buyNow}
                  className="h-12 w-full rounded-lg border border-border bg-input pl-9 pr-4 text-body-large tnum text-input-text outline-none placeholder:text-text-muted focus:border-text-muted"
                />
              </div>
            ) : null}
            {errors.buyNow ? (
              <p role="alert" className="text-caption text-danger-text">{errors.buyNow}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              aria-pressed={reserveOn}
              onClick={() => setReserveOn((on) => !on)}
              disabled={liveMode}
              aria-disabled={liveMode}
              className="pressable flex h-11 items-center gap-2.5 self-start text-body-emphasis font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-sm border ${
                  reserveOn ? 'border-brand bg-brand text-text-inverse' : 'border-border'
                }`}
              >
                {reserveOn ? <Icon name="check" size={13} /> : null}
              </span>
              Reserve price
              <span className="text-meta font-normal text-text-muted">optional</span>
            </button>
            {liveMode ? (
              <p className="text-meta text-text-muted">
                Reserve pricing isn&apos;t supported on web yet — the auction sells
                to the highest bidder.
              </p>
            ) : null}
            {reserveOn ? (
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-body-large text-text-muted">
                  £
                </span>
                <input
                  value={reserveInput}
                  onChange={(event) => {
                    setReserveInput(event.target.value);
                    setErrors((e) => (e.reserve ? { ...e, reserve: undefined } : e));
                  }}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Reserve price in pounds"
                  aria-invalid={!!errors.reserve}
                  className="h-12 w-full rounded-lg border border-border bg-input pl-9 pr-4 text-body-large tnum text-input-text outline-none placeholder:text-text-muted focus:border-text-muted"
                />
              </div>
            ) : null}
            {errors.reserve ? (
              <p role="alert" className="text-caption text-danger-text">{errors.reserve}</p>
            ) : reserveOn ? (
              <p className="text-meta text-text-muted">
                The lowest hammer you&apos;ll accept — bidders only see whether the
                reserve is met, never the number.
              </p>
            ) : null}
          </div>
        </div>

        {/* Commit — the action plus the fixture/live honesty note. */}
        <div className="flex flex-col gap-2 border-t border-border-subtle pt-6">
          <Button type="submit" size="lg" fullWidth disabled={creating || !selected}>
            {creating
              ? 'Creating…'
              : schedule === 'later'
                ? 'Schedule the auction'
                : 'Start the auction'}
          </Button>
          <p className="text-meta text-text-muted">
            {liveMode
              ? 'The auction is created on the live marketplace — the listing pauses while it runs.'
              : 'Fixture mode — the auction joins this session board and clears on reload.'}
          </p>
        </div>
      </form>
    </div>
  );
}
