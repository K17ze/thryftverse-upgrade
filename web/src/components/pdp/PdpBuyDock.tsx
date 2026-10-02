'use client';

/**
 * PdpBuyDock — the mobile purchase dock the native app's ItemDetailScreen
 * pins above the tab bar: price + the buy/offer dual action (mobile's
 * isDualActionDock grammar — canBuy + canOffer), hairline top, flat canvas
 * (no panel chrome). Desktop keeps the sticky aside instead, so the dock
 * renders below lg. It sits directly over MobileTabBar's 68px strip on
 * <md and drops to the screen edge in the md–lg gap where the tab bar is
 * gone but the aside no longer pins. The offer path opens the same
 * OfferSheet the buy panel uses — one composer, one send grammar.
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { useSession } from '@/lib/session/SessionProvider';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as commerceService from '@/lib/api/services/commerce';
import { listingCapabilities, listingStateCopy } from '@/lib/commerce/capabilities';
import { useIsBlockedUser } from '@/components/inbox/inboxSafety';
import { recordSentOffer } from '@/lib/data/fixtures-commerce';
import { useMyListingOffer, useSellerTrustSummary } from '@/lib/hooks/pdp-queries';
import { formatPrice } from '@/lib/utils/format';
import dynamic from 'next/dynamic';
import type { Listing } from '@/lib/contracts/domain';

// Offer composer — the same sheet the buy panel opens; mounts only behind
// the dock's offer action, so the chunk fetches on first open.
const OfferSheet = dynamic(
  () => import('./OfferSheet').then((m) => m.OfferSheet),
  { ssr: false },
);

export function PdpBuyDock({ listing }: { listing: Listing }) {
  const router = useRouter();
  const { show } = useToast();
  const { requireAuth, wall } = useSignupWall();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerSending, setOfferSending] = useState(false);
  /** Stable idempotency key per send attempt — same recovery contract as
   *  BuyPanel: retries replay the key, makeOffer reconciles dropped
   *  responses through lookup-by-key before any error surfaces. */
  const offerKeyRef = useRef<string | null>(null);

  const isSold = listing.isSold === true || listing.status === 'sold';
  // Owners get no dock — the manage grammar lives in the panel.
  const isOwner = user?.id === listing.sellerId;

  // Same capability gate as BuyPanel — the dock never renders a buy or
  // offer control the backend would reject (away/restricted seller,
  // reserved/paused/removed listing). A blocked seller outranks
  // seller-away but not listing state — same precedence as the panel.
  // Live mode resolves effective-away from GET /sellers/:id — the listing
  // payload never carries holidayMode/reachState, so without this the
  // away gate only works in fixtures.
  const sellerTrustQuery = useSellerTrustSummary(listing.sellerId);
  const sellerTrust = sellerTrustQuery.data;
  const caps = listingCapabilities(listing, user?.id, sellerTrust);
  // Away/suspended state unresolved while the live read is in flight —
  // render a pending dock rather than CTAs that would 409 on arrival.
  const sellerTrustPending = DATA_MODE === 'live' && sellerTrustQuery.isLoading;
  const blockedById = useIsBlockedUser(listing.sellerId);
  const blockedBySellerObj = useIsBlockedUser(listing.seller?.id ?? null);
  const sellerBlocked = blockedById || blockedBySellerObj;
  const stateCopy = isOwner || isSold ? null : listingStateCopy(caps);
  const dockCopy =
    sellerBlocked && !caps.unavailableReason && !caps.sellerSuspended
      ? { label: 'Blocked', subtitle: 'You blocked this seller' }
      : stateCopy;

  // One active offer per listing — the same guard BuyPanel applies; the
  // dock swaps "Offer" for a route into the standing offer instead of
  // letting a dead second-offer write through.
  const { data: activeOffer } = useMyListingOffer(
    listing.id,
    !isOwner && !sellerBlocked && caps.canOffer,
  );

  if (isOwner) return null;

  const handleSendOffer = (amount: number, expiryHours: number) => {
    if (DATA_MODE === 'live') {
      // Same live-write honesty as the buy panel — the offer only reads
      // as sent once the backend records it (create, or lookup-by-key
      // recovery on a dropped response); retries replay the stable key.
      offerKeyRef.current ??= commerceService.newOfferIdempotencyKey();
      setOfferSending(true);
      void commerceService
        .makeOffer(listing.id, amount, {
          originalPriceGbp: listing.price,
          expiryHours,
          idempotencyKey: offerKeyRef.current,
        })
        .then(() => {
          offerKeyRef.current = null;
          setOfferOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['listing-offer', listing.id] });
          show(`Offer sent — ${formatPrice(amount)}`, 'success');
        })
        .catch((error) =>
          show(
            parseApiError(error, 'Could not send the offer — try again.').message,
            'error',
          ),
        )
        .finally(() => setOfferSending(false));
      return;
    }
    recordSentOffer(listing, amount, expiryHours);
    setOfferOpen(false);
    void queryClient.invalidateQueries({ queryKey: ['listing-offer', listing.id] });
    show(`Offer sent — ${formatPrice(amount)}`, 'success');
  };

  return (
    <div
      className="fixed inset-x-0 bottom-[68px] z-sticky border-t border-border-subtle bg-background px-4 pb-3 pt-2.5 md:bottom-0 lg:hidden"
      role="region"
      aria-label="Purchase"
    >
      <div className="mx-auto flex max-w-[720px] items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-1.5">
            <p className="tnum text-price-list font-bold text-text-primary">
              {listing.price > 0 ? formatPrice(listing.price) : '—'}
            </p>
            {listing.shippingPayer === 'seller' ||
            (typeof listing.shippingPrice === 'number' && listing.shippingPrice === 0) ? (
              <span className="text-[11px] font-medium text-commerce-trust">
                Free delivery
              </span>
            ) : null}
          </div>
          {typeof listing.priceWithProtection === 'number' && !isSold ? (
            <p className="tnum text-meta text-text-muted">
              {formatPrice(listing.priceWithProtection)} incl. protection
            </p>
          ) : null}
          {listing.authenticity?.status === 'verified' ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-commerce-trust">
              <Icon name="verified" size={11} />
              <span>Authentic</span>
            </span>
          ) : null}
        </div>
        {isSold ? (
          <Button
            variant="secondary"
            size="md"
            onClick={() => router.push('/explore')}
          >
            Browse similar
          </Button>
        ) : sellerTrustPending ? (
          /* Availability unresolved — inert control, not a live CTA. */
          <Button variant="secondary" size="md" disabled aria-busy>
            Checking availability…
          </Button>
        ) : dockCopy ? (
          /* The factual state line + browse fallback — never a purchase
             control the backend would reject with 409. */
          <div className="flex items-center gap-3">
            <span className="text-caption font-medium text-text-secondary">
              {dockCopy.label}
            </span>
            <Button
              variant="secondary"
              size="md"
              onClick={() => router.push('/explore')}
            >
              Browse similar
            </Button>
          </div>
        ) : (
          <>
            {/* Secondary offer action — the dock's other half on mobile;
                quiet so Buy now stays primary. A standing offer swaps the
                composer for the standing-amount read + route into Offers. */}
            {activeOffer ? (
              <Button
                variant="secondary"
                size="md"
                icon="offer"
                onClick={() => router.push('/offers')}
                aria-label={`Your offer ${formatPrice(activeOffer.amount)} — open Offers`}
              >
                <span className="tnum">{formatPrice(activeOffer.amount)}</span>
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="md"
                icon="offer"
                onClick={() => {
                  if (!requireAuth('purchase')) return;
                  setOfferOpen(true);
                }}
              >
                Offer
              </Button>
            )}
            <Button
              variant="primary"
              size="lg"
              className="min-w-[130px]"
              onClick={() => {
                if (!requireAuth('purchase')) return;
                router.push(`/checkout?item=${listing.id}`);
              }}
            >
              Buy now
            </Button>
          </>
        )}
      </div>
      {wall}

      <OfferSheet
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        listing={listing}
        busy={offerSending}
        onSend={handleSendOffer}
      />
    </div>
  );
}
