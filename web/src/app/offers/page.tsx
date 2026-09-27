'use client';

/**
 * /offers — the offer lifecycle surface. Received / Sent tabs, actionable
 * rows (accept / decline / counter / withdraw), local fixture mutations
 * with toast feedback, skeleton + per-tab empty states.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { SegmentedControl } from '@/components/feed/SegmentedControl';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import {
  OfferRow,
  effectiveOfferStatus,
  type OfferRowAction,
} from '@/components/orders/OfferRow';
import { RowSkeleton } from '@/components/orders/RowSkeleton';
import { OfferSheet } from '@/components/pdp/OfferSheet';
import { useSession } from '@/lib/session/SessionProvider';
import { listingById } from '@/lib/data/fixtures';
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

export default function OffersPage() {
  const router = useRouter();
  const { show } = useToast();
  const { user, sessionLoading } = useSession();
  const queryClient = useQueryClient();
  // '' while signed out — the render gate below keeps the empty state
  // honest instead of attributing offers to a demo identity.
  const viewerId = user?.id ?? '';

  // Fixture latency — mirrors data.* tick so the skeleton is honest.
  // Live mode reads the shared /users/me/offers surface.
  const [offers, setOffers] = useState<CommerceOffer[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const reloadOffers = () => {
    if (DATA_MODE !== 'live') return;
    void commerceService
      .fetchOffers()
      .then((rows) =>
        setOffers(
          rows.map(
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
          ),
        ),
      )
      .catch(() => {
        // Keep offers null so the error state — not a fake empty list — renders.
        setLoadError(true);
      });
  };
  const retryLoad = () => {
    setLoadError(false);
    reloadOffers();
  };
  useEffect(() => {
    if (DATA_MODE === 'live') {
      reloadOffers();
      return;
    }
    const t = setTimeout(() => setOffers([...OFFERS]), 150);
    return () => clearTimeout(t);
  }, []);

  const [tab, setTab] = useState<Tab>('received');
  const [counterTarget, setCounterTarget] = useState<CommerceOffer | null>(null);

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

  // Per-tab counts — the quiet tabular meta the segmented control renders
  // beside each label, so the other direction's volume is legible without
  // switching.
  const tabCounts = useMemo(() => {
    let received = 0;
    let sent = 0;
    for (const o of offers ?? []) {
      if (offerDirection(o, viewerId) === 'received') received += 1;
      else sent += 1;
    }
    return { received, sent };
  }, [offers, viewerId]);

  const visible = useMemo(() => {
    const rows = (offers ?? []).filter((o) => offerDirection(o, viewerId) === tab);
    // Actionable first: rows awaiting my response lead (soonest expiry
    // first); everything else follows by recency. Effective status is used
    // so a lazily-expired row sorts with history, not with live ones.
    const awaiting = rows.filter((o) => isLive(o) && o.offeredByUserId !== viewerId);
    const rest = rows.filter((o) => !(isLive(o) && o.offeredByUserId !== viewerId));
    awaiting.sort((a, b) => Date.parse(a.expiresAt ?? a.updatedAt) - Date.parse(b.expiresAt ?? b.updatedAt));
    rest.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    return [...awaiting, ...rest];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers, tab, viewerId, nowMs]);

  const patch = (id: string, partial: Partial<CommerceOffer>) =>
    setOffers((prev) =>
      prev ? prev.map((o) => (o.id === id ? { ...o, ...partial, updatedAt: new Date().toISOString() } : o)) : prev,
    );

  const handleAction = (offer: CommerceOffer, action: OfferRowAction) => {
    if (action === 'counter') {
      setCounterTarget(offer);
      return;
    }
    if (action === 'accept') {
      // Accept is the money move — it must produce a recorded order before
      // any success surface shows. acceptOffer returns the order id in
      // both modes; a failure leaves the row untouched with an error toast.
      void acceptOffer(offer, viewerId)
        .then(({ orderId }) => {
          patch(offer.id, { status: 'accepted' });
          void queryClient.invalidateQueries({ queryKey: ['orders'] });
          // The listing is now sold — every surface offering it re-reads.
          void queryClient.invalidateQueries({ queryKey: ['listing', offer.listingId] });
          void queryClient.invalidateQueries({ queryKey: ['listings'] });
          void queryClient.invalidateQueries({ queryKey: ['feed'] });
          show(`Offer accepted — ${formatPrice(offer.amount)}`, 'success');
          router.push(`/orders/${orderId}`);
        })
        .catch(() => show('Could not accept the offer — try again.', 'error'));
      return;
    }
    // decline | cancel — the role/state matrix already guarantees the
    // verb is legal for this viewer: sellers decline (and retract their
    // own counter through the same endpoint), buyers cancel.
    const ownMove = offer.offeredByUserId === viewerId;
    if (DATA_MODE === 'live') {
      void commerceService
        .respondToOffer(offer.id, action)
        .then(() => {
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
        })
        .catch(() => show('Could not update the offer — try again.', 'error'));
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
  };

  const counterListing = counterTarget ? listingById(counterTarget.listingId) : undefined;

  return (
    <div className="mx-auto max-w-[820px] px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-screen-title font-bold text-text-primary">Offers</h1>
        <SegmentedControl
          options={[
            { value: 'received', label: 'Received', count: tabCounts.received },
            { value: 'sent', label: 'Sent', count: tabCounts.sent },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

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
              tab === 'received'
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
            setOffers((prev) => (prev ? [...prev] : prev));
            setCounterTarget(null);
            show(`Counter sent — ${formatPrice(amount)}`, 'success');
          }}
        />
      ) : null}
    </div>
  );
}
