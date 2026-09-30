import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import {
  effectiveOfferStatus,
  type OfferRowAction,
} from '@/components/orders/OfferRow';
import type { OfferConfirm } from '@/components/offers/OfferConfirmSheet';
import { useListingIds } from '@/lib/hooks/listing-resolution';
import { useSession } from '@/lib/session/SessionProvider';
import {
  OFFERS,
  cancelOffer,
  counterOffer,
  declineOffer,
  offerDirection,
  type CommerceOffer,
} from '@/lib/data/fixtures-commerce';
import { DATA_MODE } from '@/lib/api/client';
import * as commerceService from '@/lib/api/services/commerce';
import { acceptOffer } from '@/lib/commerce/offerAcceptance';
import { formatPrice } from '@/lib/utils/format';

export type OfferTab = 'received' | 'sent';

export const offersQueryKey = (viewerId: string) =>
  ['offers', 'lifecycle', viewerId] as const;

export function useOffersWorkflow() {
  const router = useRouter();
  const { show } = useToast();
  const { user, sessionLoading } = useSession();
  const queryClient = useQueryClient();
  const viewerId = user?.id ?? '';

  const searchParams = useSearchParams();
  const scopedListingId = searchParams.get('listing');

  const offersQuery = useQuery({
    queryKey: offersQueryKey(viewerId),
    enabled: DATA_MODE === 'live' && viewerId !== '',
    queryFn: async ({ signal }): Promise<CommerceOffer[]> => {
      const rows = await commerceService.fetchOffers(signal);
      return rows.map(
        (o): CommerceOffer => ({
          id: o.id,
          listingId: o.listingId,
          buyerId: o.buyerId,
          sellerId: o.sellerId,
          amount: o.offerPriceGbp,
          originalPrice: o.originalPriceGbp ?? o.offerPriceGbp,
          status: o.status,
          offeredByUserId: o.offeredByUserId,
          counterRound: o.counterRound,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt ?? o.createdAt,
          expiresAt: o.expiresAt,
          conversationId: o.conversationId ?? null,
          ...(o.orderId ? { orderId: o.orderId } : {}),
        }),
      );
    },
    refetchInterval: 15_000,
  });

  const [fixtureOffers, setFixtureOffers] = useState<CommerceOffer[] | null>(null);
  useEffect(() => {
    if (DATA_MODE === 'live') return;
    const t = setTimeout(() => setFixtureOffers([...OFFERS]), 150);
    return () => clearTimeout(t);
  }, []);

  const offers: CommerceOffer[] | null =
    DATA_MODE === 'live' ? offersQuery.data ?? null : fixtureOffers;
  const loadError = DATA_MODE === 'live' && offersQuery.isError;

  const reloadOffers = () => {
    if (DATA_MODE === 'live') void offersQuery.refetch();
  };
  const retryLoad = () => void offersQuery.refetch();

  const [tab, setTab] = useState<OfferTab>('received');
  const [counterTarget, setCounterTarget] = useState<CommerceOffer | null>(null);
  const [confirm, setConfirm] = useState<OfferConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const isLive = (o: CommerceOffer) => {
    const s = effectiveOfferStatus(o, nowMs);
    return s === 'pending' || s === 'countered';
  };

  const scopedOffers = useMemo(() => {
    const all = offers ?? [];
    return scopedListingId ? all.filter((o) => o.listingId === scopedListingId) : all;
  }, [offers, scopedListingId]);

  const tabCounts = useMemo(() => {
    let received = 0;
    let sent = 0;
    for (const o of scopedOffers) {
      if (offerDirection(o, viewerId) === 'received') received += 1;
      else sent += 1;
    }
    return { received, sent };
  }, [scopedOffers, viewerId]);

  const visible = useMemo(() => {
    const rows = scopedOffers.filter((o) => offerDirection(o, viewerId) === tab);
    const awaiting = rows.filter((o) => isLive(o) && o.offeredByUserId !== viewerId);
    const rest = rows.filter((o) => !(isLive(o) && o.offeredByUserId !== viewerId));
    awaiting.sort(
      (a, b) =>
        Date.parse(a.expiresAt ?? a.updatedAt) - Date.parse(b.expiresAt ?? b.updatedAt),
    );
    rest.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return [...awaiting, ...rest];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedOffers, tab, viewerId, nowMs]);

  const patch = (id: string, partial: Partial<CommerceOffer>) => {
    const stamp = new Date().toISOString();
    if (DATA_MODE === 'live') {
      queryClient.setQueryData<CommerceOffer[]>(offersQueryKey(viewerId), (prev) =>
        prev?.map((o) => (o.id === id ? { ...o, ...partial, updatedAt: stamp } : o)),
      );
      return;
    }
    setFixtureOffers((prev) =>
      prev
        ? prev.map((o) => (o.id === id ? { ...o, ...partial, updatedAt: stamp } : o))
        : prev,
    );
  };

  const handleAction = (offer: CommerceOffer, action: OfferRowAction) => {
    if (action === 'counter') {
      setCounterTarget(offer);
      return;
    }
    setConfirm({ offer, action });
  };

  const runConfirmed = () => {
    if (!confirm || confirmBusy) return;
    const { offer, action } = confirm;
    const close = () => {
      setConfirm(null);
      setConfirmBusy(false);
    };
    if (action === 'accept') {
      setConfirmBusy(true);
      void acceptOffer(offer, viewerId)
        .then(({ orderId }) => {
          patch(offer.id, { status: 'accepted' });
          void queryClient.invalidateQueries({ queryKey: ['orders'] });
          void queryClient.invalidateQueries({ queryKey: ['offers'] });
          void queryClient.invalidateQueries({ queryKey: ['listing', offer.listingId] });
          void queryClient.invalidateQueries({ queryKey: ['listings'] });
          void queryClient.invalidateQueries({ queryKey: ['feed'] });
          show(`Offer accepted — ${formatPrice(offer.amount)}`, 'success');
          router.push(`/orders/${orderId}`);
        })
        .catch(() => show('Could not accept the offer — try again.', 'error'))
        .finally(close);
      return;
    }

    const ownMove = offer.offeredByUserId === viewerId;
    if (DATA_MODE === 'live') {
      setConfirmBusy(true);
      void commerceService
        .respondToOffer(offer.id, action)
        .then(() => {
          patch(offer.id, {
            status: action === 'cancel' || ownMove ? 'cancelled' : 'declined',
          });
          void queryClient.invalidateQueries({ queryKey: ['offers'] });
          show(
            ownMove
              ? 'Offer withdrawn'
              : action === 'cancel'
                ? 'Offer cancelled'
                : 'Offer declined',
            'info',
          );
        })
        .catch(() => show('Could not update the offer — try again.', 'error'))
        .finally(close);
      return;
    }

    const source = OFFERS.find((o) => o.id === offer.id);
    if (source) {
      if (action === 'cancel' || ownMove) cancelOffer(source);
      else declineOffer(source);
    }
    patch(offer.id, {
      status: action === 'cancel' || ownMove ? 'cancelled' : 'declined',
    });
    show(
      ownMove
        ? 'Offer withdrawn'
        : action === 'cancel'
          ? 'Offer cancelled'
          : 'Offer declined',
      'info',
    );
    close();
  };

  const sheetListingIds = useMemo(() => {
    const ids = new Set<string>();
    if (counterTarget) ids.add(counterTarget.listingId);
    if (confirm) ids.add(confirm.offer.listingId);
    if (scopedListingId) ids.add(scopedListingId);
    return [...ids];
  }, [counterTarget, confirm, scopedListingId]);

  const { byId: resolvedListings } = useListingIds(sheetListingIds);
  const counterListing = counterTarget
    ? resolvedListings.get(counterTarget.listingId)
    : undefined;
  const confirmListing = confirm
    ? resolvedListings.get(confirm.offer.listingId)
    : undefined;
  const scopedListing = scopedListingId
    ? resolvedListings.get(scopedListingId)
    : undefined;

  const handleSendCounter = (amount: number, expiryHours?: number) => {
    if (!counterTarget) return;
    if (DATA_MODE === 'live') {
      void commerceService
        .respondToOffer(counterTarget.id, 'counter', {
          counterPriceGbp: amount,
          expiryHours,
          conversationId: counterTarget.conversationId ?? undefined,
        })
        .then(() => {
          reloadOffers();
          show(`Counter sent — ${formatPrice(amount)}`, 'success');
        })
        .catch(() => show('Could not send the counter — try again.', 'error'));
      setCounterTarget(null);
      return;
    }
    counterOffer(counterTarget, amount, viewerId, expiryHours);
    setFixtureOffers((prev) => (prev ? [...prev] : prev));
    setCounterTarget(null);
    show(`Counter sent — ${formatPrice(amount)}`, 'success');
  };

  return {
    router,
    user,
    sessionLoading,
    viewerId,
    scopedListingId,
    scopedListing,
    tab,
    setTab,
    tabCounts,
    offers,
    loadError,
    retryLoad,
    visible,
    nowMs,
    handleAction,
    confirm,
    confirmBusy,
    confirmListing,
    setConfirm,
    runConfirmed,
    counterTarget,
    counterListing,
    setCounterTarget,
    handleSendCounter,
  };
}
