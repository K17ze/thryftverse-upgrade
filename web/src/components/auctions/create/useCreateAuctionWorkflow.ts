'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { useMyListings } from '@/lib/hooks/queries';
import { useCreateAuction } from '@/lib/hooks/auction-queries';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { newAuctionCreateAttemptKey } from '@/lib/api/services/auctions';
import {
  formatScheduledStart,
  minStartValue,
  type FormErrors,
} from './CreateAuctionPrimitives';

export function useCreateAuctionWorkflow() {
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

  const createKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setMinStart(minStartValue(Date.now()));
  }, []);

  const selected = available.find((listing) => listing.id === listingId) ?? null;
  const creating = create.isPending;
  const openingBid = Number(startingBid.replace(/[^0-9.]/g, ''));
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

  return {
    router,
    isGuest,
    isLoading,
    isError,
    refetch,
    available,
    listingId,
    selected,
    startingBid,
    setStartingBid,
    durationHours,
    setDurationHours,
    buyNowOn,
    setBuyNowOn,
    buyNowInput,
    setBuyNowInput,
    reserveOn,
    setReserveOn,
    reserveInput,
    setReserveInput,
    schedule,
    setSchedule,
    startAt,
    setStartAt,
    minStart,
    errors,
    setErrors,
    creating,
    liveMode,
    pick,
    submit,
  };
}
