'use client';

/**
 * /offers — the offer lifecycle surface. Received / Sent tabs, actionable
 * rows (accept / decline / counter / withdraw), a confirmation sheet
 * ahead of every money/exit write (port of the native OffersScreen's
 * ConfirmationSheet ceremony), a live 15s poll while mounted, ?listing=
 * scoping for the manage-listing "View offers" deep link, and skeleton +
 * per-tab empty states.
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import {
  OfferRow,
  effectiveOfferStatus,
  type OfferRowAction,
} from '@/components/orders/OfferRow';
import {
  OfferConfirmSheet,
  type OfferConfirm,
} from '@/components/offers/OfferConfirmSheet';
import { RowSkeleton } from '@/components/orders/RowSkeleton';
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

type Tab = 'received' | 'sent';

// The sheet mounts only behind counterTarget — lazy keeps it off the
// offers route's initial bundle (same grammar as the PDP consumers).
const OfferSheet = dynamic(
  () => import('@/components/pdp/OfferSheet').then((m) => m.OfferSheet),
  { ssr: false },
);

/** The page's live offers read. Sits under the shared 'offers' prefix so
 *  useChatOfferActions' invalidations reach it, but keyed apart from the
 *  chat hook's ['offers'] entry — this surface maps conversationId
 *  through and the two cache shapes must not share one slot. */
const offersQueryKey = (viewerId: string) => ['offers', 'lifecycle', viewerId] as const;

function OffersView() {
  const router = useRouter();
  const { show } = useToast();
  const { user, sessionLoading } = useSession();
  const queryClient = useQueryClient();
  // '' while signed out — the render gate below keeps the empty state
  // honest instead of attributing offers to a demo identity.
  const viewerId = user?.id ?? '';

  const searchParams = useSearchParams();
  // Manage-listing "View offers" deep link — ?listing=<id> scopes both
  // tabs to the one item's negotiation set.
  const scopedListingId = searchParams.get('listing');

  // Live offers are a React Query read — the 15s poll lets the other
  // side's accept / counter / decline land without a manual refresh
  // (refetchIntervalInBackground stays default-off, so a hidden tab
  // idles). Fixture mode keeps its local copy + latency tick so the
  // skeleton stays honest.
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
          // The DM thread this negotiation is bound to — counters send
          // it back so the wire keeps the conversation linkage.
          conversationId: o.conversationId ?? null,
          // Accepted offers carry their order — the row can deep-link.
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
  // Live failures surface from the query state itself — an error read
  // never masquerades as an empty list.
  const loadError = DATA_MODE === 'live' && offersQuery.isError;
  const reloadOffers = () => {
    if (DATA_MODE === 'live') void offersQuery.refetch();
  };
  const retryLoad = () => void offersQuery.refetch();

  const [tab, setTab] = useState<Tab>('received');
  const [counterTarget, setCounterTarget] = useState<CommerceOffer | null>(null);
  // The pending confirmation — set on first click; the sheet's confirm
  // button is the only path that fires the mutation.
  const [confirm, setConfirm] = useState<OfferConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Shared clock — every row's expiry ticks together, and lazily-expired
  // offers flip to 'expired' without a refresh.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const isLive = (o: CommerceOffer) => {
    const s = effectiveOfferStatus(o, nowMs);
    return s === 'pending' || s === 'countered';
  };

  // ?listing= scope — both tabs and their counts read the scoped set.
  const scopedOffers = useMemo(() => {
    const all = offers ?? [];
    return scopedListingId ? all.filter((o) => o.listingId === scopedListingId) : all;
  }, [offers, scopedListingId]);

  // Per-tab counts — the quiet tabular meta the segmented control renders
  // beside each label, so the other direction's volume is legible without
  // switching.
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
    // Actionable first: rows awaiting my response lead (soonest expiry
    // first); everything else follows by recency. Effective status is used
    // so a lazily-expired row sorts with history, not with live ones.
    const awaiting = rows.filter((o) => isLive(o) && o.offeredByUserId !== viewerId);
    const rest = rows.filter((o) => !(isLive(o) && o.offeredByUserId !== viewerId));
    awaiting.sort((a, b) => Date.parse(a.expiresAt ?? a.updatedAt) - Date.parse(b.expiresAt ?? b.updatedAt));
    rest.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return [...awaiting, ...rest];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedOffers, tab, viewerId, nowMs]);

  const patch = (id: string, partial: Partial<CommerceOffer>) => {
    const stamp = new Date().toISOString();
    if (DATA_MODE === 'live') {
      // The query cache is the live copy — patch it in place so the row
      // updates at once; the standing poll reconciles server truth.
      queryClient.setQueryData<CommerceOffer[]>(offersQueryKey(viewerId), (prev) =>
        prev?.map((o) =>
          o.id === id ? { ...o, ...partial, updatedAt: stamp } : o,
        ),
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
    // Every money/exit write passes the confirmation sheet first — the
    // first click only opens the ceremony, never fires the mutation.
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
      // Accept is the money move — it must produce a recorded order before
      // any success surface shows. acceptOffer returns the order id in
      // both modes; a failure leaves the row untouched with an error toast.
      setConfirmBusy(true);
      void acceptOffer(offer, viewerId)
        .then(({ orderId }) => {
          patch(offer.id, { status: 'accepted' });
          void queryClient.invalidateQueries({ queryKey: ['orders'] });
          // First-accept-wins declines sibling offers — the shared offers
          // cache (chat cards included) re-reads too.
          void queryClient.invalidateQueries({ queryKey: ['offers'] });
          // The listing is now sold — every surface offering it re-reads.
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
    // decline | cancel — the role/state matrix already guarantees the
    // verb is legal for this viewer: sellers decline (and retract their
    // own counter through the same endpoint), buyers cancel.
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
    // Fixture mode — write the module store (session-local truth) so a
    // remount or refetch keeps the declined/withdrawn state, then mirror
    // it into the rendered copy.
    const source = OFFERS.find((o) => o.id === offer.id);
    if (source) {
      if (action === 'cancel' || ownMove) cancelOffer(source);
      else declineOffer(source);
    }
    patch(offer.id, {
      status: action === 'cancel' || ownMove ? 'cancelled' : 'declined',
    });
    show(
      ownMove ? 'Offer withdrawn' : action === 'cancel' ? 'Offer cancelled' : 'Offer declined',
      'info',
    );
    close();
  };

  // One resolver serves the three listing-name lookups: the counter
  // sheet's listing, the confirm sheet's item title, and the scoped-view
  // header. Live ids resolve through the shared resolver (a fixture miss
  // would leave the Counter action dead-ending); fixture ids read the
  // catalogue — useListingIds covers both modes.
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

  return (
    <div className="mx-auto max-w-[820px] px-4 py-8 sm:px-6 lg:max-w-[1280px]">
      <h1 className="text-screen-title text-text-primary">Offers</h1>

      {/* Listing scope — the manage-listing "View offers" deep link names
          the item and carries the reset back to the full list. */}
      {scopedListingId ? (
        <div className="mt-3 flex items-center gap-2 text-caption text-text-secondary">
          <Icon name="offer" size={14} className="shrink-0 text-text-muted" />
          <span className="clamp-1 min-w-0">
            Offers for{' '}
            <span className="font-medium text-text-primary">
              {scopedListing?.title ?? 'this item'}
            </span>
          </span>
          <Link
            href="/offers"
            className="pressable ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-text-primary hover:bg-surface-alt"
          >
            <Icon name="close" size={13} />
            All offers
          </Link>
        </div>
      ) : null}

      <Tabs
        className="-mx-4 mt-4 sm:-mx-6"
        railClassName="px-1 sm:px-3"
        tabs={[
          { key: 'received', label: 'Received', count: tabCounts.received },
          { key: 'sent', label: 'Sent', count: tabCounts.sent },
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel="Offer sections"
      />

      <div className="mt-5">
        {sessionLoading ? (
          <RowSkeleton />
        ) : !user ? (
          // Offers are account-bound — a guest has no offers to list.
          <EmptyState
            icon="profile"
            title="Sign in to view your offers"
            subtitle="Offers you send and receive are tied to your account."
            actionLabel="Sign in"
            onAction={() => router.push('/auth')}
          />
        ) : offers === null ? (
          loadError ? (
            <EmptyState
              icon="alert"
              title="Couldn't load offers"
              subtitle="Check your connection and try again — your offers are safe."
              actionLabel="Try again"
              onAction={retryLoad}
            />
          ) : (
            <RowSkeleton />
          )
        ) : visible.length === 0 ? (
          <EmptyState
            icon="offer"
            title={tab === 'received' ? 'No offers received' : 'No offers sent'}
            subtitle={
              scopedListingId
                ? 'No offers on this item yet — clear the filter to see every offer.'
                : tab === 'received'
                  ? 'When a buyer offers on your listings, you can accept, decline or counter here.'
                  : 'Offers you make on listings show up here so you can track the response.'
            }
            actionLabel="Browse items"
            onAction={() => router.push('/explore')}
          />
        ) : (
          <ul className="divide-y divide-border-subtle border-y border-border-subtle">
            {visible.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                direction={tab}
                viewerId={viewerId}
                nowMs={nowMs}
                onAction={handleAction}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Confirmation ceremony — every accept/decline/cancel waits here
          until the confirm button fires the mutation. */}
      <OfferConfirmSheet
        confirm={confirm}
        viewerId={viewerId}
        listingTitle={confirmListing?.title}
        busy={confirmBusy}
        onConfirm={runConfirmed}
        onClose={() => setConfirm(null)}
      />

      {/* Counter sheet — reuses the PDP offer grammar */}
      {counterTarget && counterListing ? (
        <OfferSheet
          open={!!counterTarget}
          onClose={() => setCounterTarget(null)}
          listing={counterListing}
          counterTo={{
            amount: counterTarget.amount,
            // What sits on the table — the first offer, or their counter.
            label: counterTarget.counterRound > 0 ? 'Their counter' : 'Their offer',
          }}
          onSend={(amount, expiryHours) => {
            if (DATA_MODE === 'live') {
              void commerceService
                .respondToOffer(counterTarget.id, 'counter', {
                  counterPriceGbp: amount,
                  expiryHours,
                  // Keep the negotiation bound to its DM thread — the
                  // standing offer carries the conversationId the server
                  // assigned at creation.
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
            // Force the local copy to pick up the mutation.
            setFixtureOffers((prev) => (prev ? [...prev] : prev));
            setCounterTarget(null);
            show(`Counter sent — ${formatPrice(amount)}`, 'success');
          }}
        />
      ) : null}
    </div>
  );
}

export default function OffersPage() {
  return (
    // OffersView reads ?listing= via useSearchParams — the boundary keeps
    // the prerender bailout painting structure, not blank (same grammar
    // as /sell and /settings).
    <Suspense
      fallback={
        <div
          className="mx-auto max-w-[820px] px-4 py-8 sm:px-6 lg:max-w-[1280px]"
          aria-busy
          aria-label="Loading offers"
        >
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-4 h-10 w-72" />
          <div className="mt-5">
            <RowSkeleton />
          </div>
        </div>
      }
    >
      <OffersView />
    </Suspense>
  );
}
