'use client';

/**
 * BuyPanel — the sticky commerce column orchestrator. Brand eyebrow → title →
 * price hero with buyer-protection line → facts → seller card → CTA grammar:
 * primary Buy now, secondary Make an offer + bag, quiet Message seller →
 * conversational demand signal → icon-level actions row → shipping + Buyer
 * Protection disclosure → bundle upsell. Factored into domain components
 * (PdpPriceBlock, PdpSellerCard, PdpActions, PdpShippingInfo).
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Listing } from '@/lib/contracts/domain';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { useStore, useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { useSignupWall } from '@/components/auth/SignupWall';
import { useCreateConversation } from '@/lib/hooks/queries';
import { recordSentOffer } from '@/lib/data/fixtures-commerce';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as commerceService from '@/lib/api/services/commerce';
import * as listingsService from '@/lib/api/services/listings';
import * as priceAlertsService from '@/lib/api/services/priceAlerts';
import { listingCapabilities, listingStateCopy } from '@/lib/commerce/capabilities';
import {
  useMyListingOffer,
  useSellerTrustSummary,
  useWithdrawListingOffer,
} from '@/lib/hooks/pdp-queries';
import { usePdpMarketEvidence } from '@/lib/hooks/pdp-market-queries';
import { formatCount, formatPrice, timeAgo } from '@/lib/utils/format';
import dynamic from 'next/dynamic';
import { SizeGuideSheet, resolveSizeGuide } from './SizeGuideSheet';
import { BundleUpsellRow } from '@/components/bundle/BundleUpsellRow';
import { ListingReportMenu } from './ListingReportMenu';
import { SaveToBoardSheet } from '@/components/saved/SaveToBoardSheet';
import { useIsBlockedUser } from '@/components/inbox/inboxSafety';
import { PdpPriceBlock } from './PdpPriceBlock';
import { PdpSellerCard } from './PdpSellerCard';
import { PdpActions } from './PdpActions';
import { PdpShippingInfo } from './PdpShippingInfo';

const OfferSheet = dynamic(
  () => import('./OfferSheet').then((m) => m.OfferSheet),
  { ssr: false },
);

interface BuyPanelProps {
  listing: Listing;
}

export function BuyPanel({ listing }: BuyPanelProps) {
  const router = useRouter();
  const { show } = useToast();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const { requireAuth, wall } = useSignupWall();

  const hydrated = useHydrated();
  const wishlisted = useStore((s) => s.wishlist.includes(listing.id));
  const toggleFav = useStore((s) => s.toggleWishlist);
  const savedItem = useStore((s) => s.saved.includes(listing.id));
  const toggleSaved = useStore((s) => s.toggleSaved);
  const bagged = useStore((s) => s.bag.some((b) => b.listingId === listing.id));
  const addToBag = useStore((s) => s.addToBag);
  const isFav = hydrated && wishlisted;
  const isSaved = hydrated && savedItem;
  const inBag = hydrated && bagged;

  const [offerOpen, setOfferOpen] = useState(false);
  const [offerSending, setOfferSending] = useState(false);
  const offerKeyRef = useRef<string | null>(null);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const sizeGuide = resolveSizeGuide(listing);
  const createConversation = useCreateConversation();

  const isSold = listing.isSold === true || listing.status === 'sold';
  const isOwner = user?.id === listing.sellerId;
  const seller = listing.seller;

  const blockedById = useIsBlockedUser(listing.sellerId);
  const blockedBySellerObj = useIsBlockedUser(seller?.id ?? null);
  const sellerBlocked = blockedById || blockedBySellerObj;

  const sellerTrustQuery = useSellerTrustSummary(listing.sellerId);
  const sellerTrust = sellerTrustQuery.data;
  const { soldComps } = usePdpMarketEvidence(listing);
  const sellerTrustPending = DATA_MODE === 'live' && sellerTrustQuery.isLoading;

  const caps = listingCapabilities(listing, user?.id, sellerTrust);
  const stateCopy = listingStateCopy(caps, sellerTrust);
  const blockedStateCopy = {
    label: 'Blocked',
    subtitle: 'You blocked this seller — purchases, offers and messages are off.',
  };
  const effectiveStateCopy = sellerBlocked
    ? caps.unavailableReason || caps.sellerSuspended
      ? stateCopy
      : blockedStateCopy
    : stateCopy;

  const { data: activeOffer } = useMyListingOffer(
    listing.id,
    !isOwner && !sellerBlocked && caps.canOffer,
  );
  const withdrawOffer = useWithdrawListingOffer(listing.id);

  const showPriceAlert =
    DATA_MODE === 'live' &&
    caps.isAvailable &&
    !caps.isOwner &&
    !caps.sellerSuspended;
  const priceAlertKey = ['price-alert', listing.id, user?.id ?? 'guest'] as const;
  const priceAlertQuery = useQuery({
    queryKey: priceAlertKey,
    enabled: showPriceAlert && !!user,
    staleTime: 60_000,
    retry: 1,
    queryFn: () => priceAlertsService.getPriceAlertStatus(listing.id),
  });
  const priceAlertEnabled = priceAlertQuery.data === true;
  const priceAlertMutation = useMutation({
    mutationFn: async (next: boolean) => {
      if (next) {
        await priceAlertsService.enablePriceAlert(listing.id);
      } else {
        await priceAlertsService.disablePriceAlert(listing.id);
      }
    },
    onMutate: (next) => {
      queryClient.setQueryData(priceAlertKey, next);
    },
    onSuccess: (_result, next) => {
      show(
        next
          ? 'Price drop alerts on — we’ll notify you if the price falls'
          : 'Price drop alerts off',
        next ? 'success' : 'info',
      );
    },
    onError: (_error, next) => {
      queryClient.setQueryData(priceAlertKey, !next);
      show('Could not update the price alert — try again.', 'error');
    },
  });
  const handleTogglePriceAlert = () => {
    if (!requireAuth('save_item') || priceAlertMutation.isPending) return;
    priceAlertMutation.mutate(!priceAlertEnabled);
  };

  const signalLine = ((): string | null => {
    if (isSold || isOwner || sellerBlocked || !caps.canBuy) return null;
    const demand: string[] = [];
    if (typeof listing.views === 'number' && listing.views > 0) {
      demand.push(`${formatCount(listing.views)} views`);
    }
    if (listing.likes > 0) {
      demand.push(
        listing.likes === 1
          ? '1 person likes this'
          : `${formatCount(listing.likes)} people like this`,
      );
    }
    if (soldComps && soldComps.count >= 2) {
      demand.push(`${soldComps.count} similar sold`);
    }
    if (typeof listing.activeOfferCount === 'number' && listing.activeOfferCount > 0) {
      demand.push(
        `${listing.activeOfferCount} offer${listing.activeOfferCount === 1 ? '' : 's'} on the table`,
      );
    }
    return demand.length
      ? `One only · ${demand.slice(0, 3).join(' · ')}`
      : 'One only — once it’s gone, it’s gone';
  })();

  const handleHeart = () => {
    if (!requireAuth('save_item')) return;
    const adding = !isFav;
    if (adding && DATA_MODE === 'live') {
      void listingsService.trackListingInteraction(listing.id, 'like', {
        idempotencyKey: `like_${listing.id}`,
      });
    }
    void toggleFav(listing.id).then((ok) => {
      if (ok) {
        if (adding) show('Added to wishlist', 'success');
      } else {
        show('Couldn’t sync — your wishlist was restored', 'error');
      }
    });
  };

  const handleSave = () => {
    if (!requireAuth('save_item')) return;
    const removing = isSaved;
    if (!removing && DATA_MODE === 'live') {
      void listingsService.trackListingInteraction(listing.id, 'save', {
        idempotencyKey: `save_${listing.id}`,
      });
    }
    void toggleSaved(listing.id).then((ok) => {
      show(
        ok
          ? removing
            ? 'Removed from saved'
            : 'Added to saved'
          : 'Couldn’t sync — saved items restored',
        ok ? 'info' : 'error',
      );
    });
  };

  const handleSaveToBoard = () => {
    if (!requireAuth('save_item')) return;
    if (!savedItem) {
      if (DATA_MODE === 'live') {
        void listingsService.trackListingInteraction(listing.id, 'save', {
          idempotencyKey: `save_${listing.id}`,
        });
      }
      void toggleSaved(listing.id);
    }
    setBoardOpen(true);
  };

  const handleAddToBag = () => {
    if (!requireAuth('purchase')) return;
    if (inBag) {
      router.push('/bag');
      return;
    }
    addToBag(listing.id);
    show('Added to bag', 'success');
  };

  const handleMessage = () => {
    if (!requireAuth('message_seller')) return;
    void createConversation
      .mutateAsync({ memberIds: [listing.sellerId], itemId: listing.id })
      .then((conversation) => router.push(`/inbox/${conversation.id}`))
      .catch(() => show('Could not open the conversation', 'error'));
  };

  const handleShare = async () => {
    if (DATA_MODE === 'live') {
      void listingsService.trackListingInteraction(listing.id, 'share');
    }
    const url = `${window.location.origin}/item/${listing.id}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: listing.title, url });
        return;
      } catch {
        // Fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      show('Link copied', 'success');
    } catch {
      show('Could not copy the link', 'error');
    }
  };

  return (
    <div className="flex flex-col">
      <PdpPriceBlock
        listing={listing}
        isSold={isSold}
        hasSizeGuide={Boolean(sizeGuide)}
        onOpenSizeGuide={() => setSizeGuideOpen(true)}
      />

      <PdpSellerCard
        seller={seller}
        sellerTrust={sellerTrust}
        isOwner={isOwner}
        sellerBlocked={sellerBlocked}
      />

      <PdpActions
        listing={listing}
        isOwner={isOwner}
        isSold={isSold}
        sellerTrustPending={sellerTrustPending}
        effectiveStateCopy={effectiveStateCopy}
        canMessage={caps.canMessage}
        sellerBlocked={sellerBlocked}
        activeOffer={activeOffer}
        inBag={inBag}
        onBuyNow={() => {
          if (!requireAuth('purchase')) return;
          router.push(`/checkout?item=${listing.id}`);
        }}
        onMakeOffer={() => {
          if (!requireAuth('purchase')) return;
          setOfferOpen(true);
        }}
        onAddToBag={handleAddToBag}
        onMessage={handleMessage}
        withdrawOffer={withdrawOffer}
        showToast={show}
      />

      {signalLine ? (
        <p className="tnum mt-2.5 text-caption text-text-secondary">{signalLine}</p>
      ) : null}

      {/* Save / heart / share actions row */}
      <div className="mt-3 flex items-center gap-1 border-b border-border-subtle pb-4">
        <span className="flex items-center">
          <button
            type="button"
            onClick={handleSave}
            aria-pressed={isSaved}
            className="pressable -my-1 flex h-11 items-center gap-1.5 rounded-md px-2 text-caption font-medium text-text-secondary hover:text-text-primary"
          >
            <Icon name="bookmark" filled={isSaved} size={16} className={isSaved ? 'text-brand' : ''} />
            {isSaved ? 'Saved' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handleSaveToBoard}
            aria-label="Save to a board"
            className="pressable -my-1 -ml-0.5 flex h-11 w-8 items-center justify-center rounded-md text-text-secondary hover:text-text-primary"
          >
            <Icon name="chevronDown" size={12} />
          </button>
        </span>
        <button
          type="button"
          onClick={handleHeart}
          aria-pressed={isFav}
          className="pressable -my-1 flex h-11 items-center gap-1.5 rounded-md px-2 text-caption font-medium text-text-secondary hover:text-text-primary"
        >
          <Icon name="heart" filled={isFav} size={16} className={isFav ? 'text-danger-text' : ''} />
          {isFav ? 'Favourited' : 'Favourite'}
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="pressable -my-1 flex h-11 items-center gap-1.5 rounded-md px-2 text-caption font-medium text-text-secondary hover:text-text-primary"
        >
          <Icon name="share" size={16} />
          Share
        </button>
        {!isOwner ? <ListingReportMenu listing={listing} /> : null}
        <span className="ml-auto flex items-center gap-3 text-meta text-text-muted">
          {!signalLine ? (
            <>
              {typeof listing.views === 'number' ? (
                <span className="flex items-center gap-1">
                  <Icon name="eye" size={13} />
                  <span className="tnum">{formatCount(listing.views)}</span>
                </span>
              ) : null}
              {typeof listing.likes === 'number' ? (
                <span className="flex items-center gap-1">
                  <Icon name="heart" size={13} />
                  <span className="tnum">{formatCount(listing.likes)}</span>
                </span>
              ) : null}
            </>
          ) : null}
          {listing.createdAt ? <span>{timeAgo(listing.createdAt)}</span> : null}
        </span>
      </div>

      {showPriceAlert ? (
        <button
          type="button"
          role="switch"
          aria-checked={priceAlertEnabled}
          aria-busy={priceAlertMutation.isPending || priceAlertQuery.isPending}
          disabled={priceAlertMutation.isPending}
          onClick={handleTogglePriceAlert}
          className="pressable -ml-2 mt-3 inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1.5 text-caption font-semibold text-text-secondary hover:text-text-primary disabled:opacity-50"
        >
          <Icon
            name="notifications"
            filled={priceAlertEnabled}
            size={15}
            className={priceAlertEnabled ? 'text-brand' : ''}
          />
          {priceAlertEnabled ? 'Price drop alerts on' : 'Notify me if the price drops'}
        </button>
      ) : null}

      <PdpShippingInfo listing={listing} sellerLocation={seller?.location} />

      {sellerBlocked ? null : <BundleUpsellRow listing={listing} />}

      {wall}

      <OfferSheet
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        listing={listing}
        busy={offerSending}
        onSend={(amount, expiryHours) => {
          if (DATA_MODE === 'live') {
            offerKeyRef.current ??= commerceService.newOfferIdempotencyKey();
            setOfferSending(true);
            void commerceService
              .makeOffer(listing.id, amount, {
                originalPriceGbp: listing.price,
                expiryHours,
                idempotencyKey: offerKeyRef.current,
              })
              .then((offer) => {
                offerKeyRef.current = null;
                setOfferOpen(false);
                void queryClient.invalidateQueries({ queryKey: ['listing-offer', listing.id] });
                show(`Offer sent — ${formatPrice(amount)}`, 'success');
                if (offer.conversationId) {
                  router.push(`/inbox/${offer.conversationId}`);
                }
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
        }}
      />

      <SizeGuideSheet
        open={sizeGuideOpen}
        onClose={() => setSizeGuideOpen(false)}
        guide={sizeGuide}
        currentSize={listing.size}
      />

      <SaveToBoardSheet
        open={boardOpen}
        onClose={() => setBoardOpen(false)}
        itemId={listing.id}
        itemLabel={listing.title}
      />
    </div>
  );
}
