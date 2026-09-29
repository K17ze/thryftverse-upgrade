'use client';

/**
 * BuyPanel — the sticky commerce column. Brand eyebrow → title → price hero
 * (tnum) with buyer-protection line → facts → seller card → CTA grammar:
 * primary Buy now, secondary Make an offer + bag, quiet Message seller →
 * one conversational signal line (views/likes/sold comps — real contract
 * fields only) → icon-level save/heart + meta row → shipping + Buyer
 * Protection disclosure at the decision point → bundle upsell. The
 * seller's description and the item-specifics ledger live in the evidence
 * column below the media stage (PdpAbout) — content doesn't scroll inside
 * the pinned panel. Sold and owner states are honest variants, not dead
 * buttons.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Listing } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useStore, useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { useSignupWall } from '@/components/auth/SignupWall';
import { useCreateConversation } from '@/lib/hooks/queries';
import { FollowButton } from '@/components/profile/FollowButton';
import {
  AUTHENTICATION_THRESHOLD_GBP,
  recordSentOffer,
} from '@/lib/data/fixtures-commerce';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import * as commerceService from '@/lib/api/services/commerce';
import * as listingsService from '@/lib/api/services/listings';
import * as priceAlertsService from '@/lib/api/services/priceAlerts';
import { listingCapabilities, listingStateCopy } from '@/lib/commerce/capabilities';
import { DISPATCH_SLA_DAYS } from '@/lib/commerce/dispatch';
import {
  useMyListingOffer,
  useSellerTrustSummary,
  useWithdrawListingOffer,
} from '@/lib/hooks/pdp-queries';
import { usePdpMarketEvidence } from '@/lib/hooks/pdp-market-queries';
import { formatCount, formatDate, formatPrice, timeAgo } from '@/lib/utils/format';
import dynamic from 'next/dynamic';
import { OfferToLikers } from './OfferToLikers';
import { SizeGuideSheet, resolveSizeGuide } from './SizeGuideSheet';
import { BundleUpsellRow } from '@/components/bundle/BundleUpsellRow';
import { ListingReportMenu } from './ListingReportMenu';
import { SaveToBoardSheet } from '@/components/saved/SaveToBoardSheet';
import { useIsBlockedUser } from '@/components/inbox/inboxSafety';

// Offer composer — mounts only behind the "send offer" action, so its
// chunk fetches on first open instead of riding every PDP.
const OfferSheet = dynamic(
  () => import('./OfferSheet').then((m) => m.OfferSheet),
  { ssr: false },
);

interface BuyPanelProps {
  listing: Listing;
}

/** "5 Oct" — compact en-GB day/month for the ETA window. UTC-pinned:
 *  the ETA is a server-provided calendar date, and a local-TZ render
 *  would print a different day near midnight (and drift across
 *  hydration). Same contract as lib/utils/format. */
function formatEtaDay(iso: string): string | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Delivery cost line — "Free postage" when the seller covers it, the real
 *  charge when the contract carries one, honest fallback when it doesn't. */
function deliveryCostLine(listing: Listing): string {
  if (listing.shippingPayer === 'seller') {
    return 'Free postage — the seller covers delivery';
  }
  if (typeof listing.shippingPrice === 'number') {
    return listing.shippingPrice > 0
      ? `${formatPrice(listing.shippingPrice)} postage`
      : 'Free postage — the seller covers delivery';
  }
  return 'Postage calculated at checkout';
}

/** Estimated arrival — a real window when both bounds exist, the single
 *  bound when only one does, nothing when the contract is silent or the
 *  dates are stale/malformed (never a fabricated estimate). */
function deliveryEtaLine(listing: Listing): string | null {
  const end = listing.estimatedDeliveryEnd ? formatEtaDay(listing.estimatedDeliveryEnd) : null;
  const start = listing.estimatedDeliveryStart
    ? formatEtaDay(listing.estimatedDeliveryStart)
    : null;
  if (!start && !end) return null;
  // A window already in the past is stale data, not an ETA.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endMs = listing.estimatedDeliveryEnd
    ? Date.parse(listing.estimatedDeliveryEnd)
    : Date.parse(listing.estimatedDeliveryStart ?? '');
  if (Number.isFinite(endMs) && endMs < today.getTime()) return null;
  if (start && end) return start === end ? `Arrives ${start}` : `Arrives ${start} – ${end}`;
  if (end) return `Arrives by ${end}`;
  return `Arrives from ${start}`;
}

/** Returns line — mirrors mobile ShippingReturnsInfo: the server summary
 *  verbatim, the "{n}-day returns" / "Returns accepted" / "No returns"
 *  grammar when structured fields carry it, the honest fallback when the
 *  contract is silent. */
function returnsLine(listing: Listing): string {
  const policy = listing.returnPolicy;
  if (!policy) return 'Return policy confirmed at checkout';
  if (policy.summary) return policy.summary;
  if (policy.accepted === true) {
    return policy.windowDays ? `${policy.windowDays}-day returns` : 'Returns accepted';
  }
  if (policy.accepted === false) return 'No returns';
  return 'Return policy confirmed at checkout';
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
  /** One idempotency key per offer-send attempt — a user retry after a
   *  dropped response replays the same key so the server's
   *  (offered_by_user_id, idempotency_key) constraint dedupes instead of
   *  double-creating; makeOffer itself reconciles unknown outcomes via
   *  lookup-by-key before the failure reaches the toast. Cleared once a
   *  send is confirmed so the next offer mints a fresh key. */
  const offerKeyRef = useRef<string | null>(null);
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [protectionOpen, setProtectionOpen] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const sizeGuide = resolveSizeGuide(listing);
  const createConversation = useCreateConversation();

  const isSold = listing.isSold === true || listing.status === 'sold';
  const isOwner = user?.id === listing.sellerId;
  const seller = listing.seller;
  const sellerUsername = seller?.username ?? null;

  /**
   * Viewer-relationship truth — a blocked seller surfaces no purchase,
   * offer, message or follow affordance anywhere on the PDP; every one of
   * those paths fails server-side anyway, so showing live CTAs is a lie
   * (mobile CommerceActionDock / SellerInfoCard parity).
   */
  // Two ids, one predicate — both hooks stay unconditional.
  const blockedById = useIsBlockedUser(listing.sellerId);
  const blockedBySellerObj = useIsBlockedUser(seller?.id ?? null);
  const sellerBlocked = blockedById || blockedBySellerObj;

  /**
   * Seller availability — live mode reads the authoritative summary
   * (GET /sellers/:id): the listing payload's seller block doesn't carry
   * holidayMode/reachState, so without it an away or suspended seller's
   * CTAs render live and the backend 409s them. Fixture mode skips the
   * fetch — the away projection already writes listing.seller.holidayMode.
   */
  const sellerTrustQuery = useSellerTrustSummary(listing.sellerId);
  const sellerTrust = sellerTrustQuery.data;
  /**
   * Sold-comps evidence for the signal line — the same query PdpMarket
   * publishes (shared cache): live mode reads the real aggregated
   * completed-orders count, fixture mode the bundled sold-comps dataset.
   * The fixture scorer never reaches a live PDP.
   */
  const { soldComps } = usePdpMarketEvidence(listing);
  // While the live trust read is in flight, away/suspended state is
  // unresolved — the dock renders a pending surface instead of live CTAs
  // that would 409 the moment the fetch lands. A failed read stays
  // fail-open (the backend 409 remains the enforcer — native parity).
  const sellerTrustPending = DATA_MODE === 'live' && sellerTrustQuery.isLoading;
  /**
   * Capability gate — the mobile CommerceActionDock chain: listing status
   * (sold/reserved/paused/draft/removed/unknown), missing price or seller,
   * then seller availability (holiday mode, suspended reach). Purchase and
   * offer affordances never render when the backend would 409 them.
   */
  const caps = listingCapabilities(listing, user?.id, sellerTrust);
  const stateCopy = listingStateCopy(caps, sellerTrust);
  /**
   * The CTA state dock follows the mobile precedence chain — listing and
   * seller state (sold → unavailable → suspended) outrank the viewer's
   * own block; the block outranks seller-away alone. Either way the panel
   * states a fact instead of offering affordances that fail server-side.
   */
  const blockedStateCopy = {
    label: 'Blocked',
    subtitle: 'You blocked this seller — purchases, offers and messages are off.',
  };
  const effectiveStateCopy = sellerBlocked
    ? caps.unavailableReason || caps.sellerSuspended
      ? stateCopy
      : blockedStateCopy
    : stateCopy;

  /** One active offer per listing — the same rule the backend enforces.
   *  When the viewer already has a pending/countered offer on the table the
   *  composer stays closed and the standing offer gets a withdraw path
   *  instead of a dead second-offer write. */
  const { data: activeOffer } = useMyListingOffer(
    listing.id,
    !isOwner && !sellerBlocked && caps.canOffer,
  );
  const withdrawOffer = useWithdrawListingOffer(listing.id);

  /**
   * Price-drop alerts — the listing-level /price-alerts contract (distinct
   * from Co-Own asset alerts): POST to enable, DELETE to disable, and the
   * GET status read reflects the member's real subscription. Native's gate
   * (mobile ItemDetailPriceMarket): the listing is purchasable, the viewer
   * isn't the seller, and the seller isn't restricted. Live-only — the row
   * hides in fixture mode rather than fabricating a subscription state.
   * Guests read as off and hit the signup wall on tap; the status read is
   * member-scoped, so it only runs for a signed-in viewer.
   */
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
      // Roll back the optimistic flip — the subscription is server truth.
      queryClient.setQueryData(priceAlertKey, !next);
      show('Could not update the price alert — try again.', 'error');
    },
  });
  const handleTogglePriceAlert = () => {
    if (!requireAuth('save_item') || priceAlertMutation.isPending) return;
    priceAlertMutation.mutate(!priceAlertEnabled);
  };

  /**
   * Conversational signal line — the eBay VI beat that sits directly under
   * the buy buttons. Every clause comes from a real field: views/likes are
   * contract counters, the sold-comps count is the same evidence PdpMarket
   * publishes (live: aggregated real completed orders; fixture: the bundled
   * comps dataset). Resale stock is one-of-one, so the scarcity clause is
   * structural truth, not a fabricated counter. One quiet line; self-omits
   * for sold/owner.
   */
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
    // Live demand — the engagement rollup's active offer count is the
    // "N offers on the table" beat native prints. Only when real.
    if (typeof listing.activeOfferCount === 'number' && listing.activeOfferCount > 0) {
      demand.push(
        `${listing.activeOfferCount} offer${listing.activeOfferCount === 1 ? '' : 's'} on the table`,
      );
    }
    return demand.length
      ? `One only · ${demand.slice(0, 3).join(' · ')}`
      : 'One only — once it’s gone, it’s gone';
  })();

  const hasPriceDrop =
    typeof listing.originalPrice === 'number' && listing.originalPrice > listing.price;
  const discountPercent = hasPriceDrop
    ? Math.round(((listing.originalPrice! - listing.price) / listing.originalPrice!) * 100)
    : 0;

  const facts = [
    { label: 'Condition', value: listing.condition },
    { label: 'Size', value: listing.size ?? 'One size' },
    { label: 'Category', value: listing.subcategory ?? listing.category },
  ];

  const handleHeart = () => {
    if (!requireAuth('save_item')) return;
    const adding = !isFav;
    if (adding && DATA_MODE === 'live') {
      // Engagement 'like' — the same write native fires on the heart
      // (POST /listings/:id/interact, stored as 'wishlist' for seller
      // analytics). Deterministic key: an unlike/re-like cycle still
      // records exactly once.
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

  /**
   * File-to-board — the web translation of mobile's long-press on the
   * save control (SaveToCollectionModal): the caret next to Save opens the
   * board picker. Filing is a save, so an unsaved item lands in Saved
   * first — the bookmark state then agrees with the board membership.
   */
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

  /**
   * Message seller — create-or-reuse the DM thread and land inside it,
   * the same deep-link grammar ProfileHero uses. Never just the inbox
   * list: the buyer asked to talk to THIS seller.
   */
  const handleMessage = () => {
    if (!requireAuth('message_seller')) return;
    void createConversation
      .mutateAsync({ memberIds: [listing.sellerId], itemId: listing.id })
      .then((conversation) => router.push(`/inbox/${conversation.id}`))
      .catch(() => show('Could not open the conversation', 'error'));
  };

  /** Share — the native share sheet where the platform offers it,
   *  a copied link where it doesn't. */
  const handleShare = async () => {
    if (DATA_MODE === 'live') {
      // Native fires the 'share' engagement write when its share sheet
      // opens — on web the equivalent beat is the affordance press itself.
      void listingsService.trackListingInteraction(listing.id, 'share');
    }
    const url = `${window.location.origin}/item/${listing.id}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: listing.title, url });
        return;
      } catch {
        // Dismissed or unsupported — fall through to the clipboard.
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
      {/* Identity seam — brand eyebrow, title, price */}
      {listing.promoted ? (
        <span className="text-meta font-medium text-text-muted">{listing.disclosure ?? 'Sponsored'}</span>
      ) : null}
      {listing.brand ? (
        <span className="text-label text-text-secondary">
          {listing.brand}
        </span>
      ) : null}
      <h1 className="mt-0.5 text-item-title font-semibold text-text-primary sm:text-screen-title">
        {listing.title}
      </h1>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tnum text-price-hero font-bold text-text-primary">
          {formatPrice(listing.price)}
        </span>
        {hasPriceDrop ? (
          <>
            <span className="tnum text-body-large text-text-muted line-through">
              {formatPrice(listing.originalPrice)}
            </span>
            <Badge variant="success">-{discountPercent}%</Badge>
          </>
        ) : null}
      </div>

      {typeof listing.priceWithProtection === 'number' && !isSold ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-body text-text-secondary">
          <Icon name="shieldCheck" size={16} className="shrink-0 text-commerce-trust" />
          <span>
            <span className="tnum font-semibold text-text-primary">
              {formatPrice(listing.priceWithProtection)}
            </span>{' '}
            incl. Buyer Protection
          </span>
        </p>
      ) : null}

      {/* Facts — label/value grid, hairline separated */}
      <dl className="mt-5 grid grid-cols-3 gap-3 border-y border-border-subtle py-4">
        {facts.map((f) => (
          <div key={f.label}>
            <dt className="text-meta text-text-muted">{f.label}</dt>
            <dd className="clamp-1 mt-0.5 text-body font-medium capitalize text-text-primary">
              {f.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Size guide — only for size-relevant categories (clothing/shoes) */}
      {sizeGuide ? (
        <button
          type="button"
          onClick={() => setSizeGuideOpen(true)}
          className="pressable -ml-2 mt-1 inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1.5 text-caption font-semibold text-text-secondary hover:text-text-primary"
        >
          <Icon name="scan" size={14} className="shrink-0" />
          Size guide
        </button>
      ) : null}

      {/* Seller card — identity + trust at the decision point. The
          username is the link; rating comes from the seller contract.
          Location lives in the shipping line below — stated once. */}
      {sellerUsername ? (
        <div className="flex items-center gap-3 border-b border-border-subtle py-4">
          <Link
            href={`/u/${sellerUsername}`}
            aria-label={`Open @${sellerUsername}'s shop`}
            className="shrink-0 rounded-full"
          >
            <Avatar
              src={seller?.avatar ?? sellerTrust?.avatar}
              name={sellerTrust?.displayName ?? sellerUsername}
              size={44}
            />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-body-emphasis text-text-primary">
              <Link
                href={`/u/${sellerUsername}`}
                className="clamp-1 hover:text-text-primary"
              >
                @{sellerUsername}
              </Link>
              {seller?.verified === true || sellerTrust?.verified === true ? (
                <Icon name="verified" size={13} className="shrink-0 text-commerce-trust" />
              ) : null}
            </p>
            {typeof seller?.rating === 'number' ||
            typeof sellerTrust?.rating === 'number' ? (
              <p className="mt-0.5 flex items-center gap-1 text-meta text-text-secondary">
                <Icon name="star" filled size={12} className="text-rating-star" />
                <span className="tnum">
                  {(seller?.rating ?? sellerTrust?.rating ?? 0).toFixed(1)}
                </span>
                {(seller?.reviewCount ?? sellerTrust?.reviewCount) ? (
                  <span>
                    · {formatCount(seller?.reviewCount ?? sellerTrust?.reviewCount ?? 0)}{' '}
                    reviews
                  </span>
                ) : null}
              </p>
            ) : null}
            {/* Trust dossier — the /sellers/:id evidence the detail payload
                doesn't carry: response pace, completed sales, tenure.
                Live-only facts; fixture mode leaves the rating line. */}
            {sellerTrust &&
            (sellerTrust.responseTimeLabel ||
              sellerTrust.completedSales ||
              sellerTrust.memberSince) ? (
              <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-meta text-text-muted">
                {sellerTrust.responseTimeLabel ? (
                  <span>Usually responds in {sellerTrust.responseTimeLabel}</span>
                ) : null}
                {sellerTrust.completedSales ? (
                  <span>
                    {sellerTrust.responseTimeLabel ? '· ' : ''}
                    <span className="tnum">{formatCount(sellerTrust.completedSales)}</span> sold
                  </span>
                ) : null}
                {sellerTrust.memberSince ? (
                  <span>
                    {sellerTrust.responseTimeLabel || sellerTrust.completedSales ? '· ' : ''}
                    Member since {formatDate(sellerTrust.memberSince)}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          {/* Trailing action — Follow for buyers (the persisted toggle
              every other surface shares), Visit shop for the owner and
              for a blocked seller, whose follow would fail server-side
              anyway. The username/avatar already carry the profile link
              for everyone else. */}
          {isOwner || !seller?.id || sellerBlocked ? (
            <Link
              href={`/u/${sellerUsername}`}
              className="pressable shrink-0 rounded-md px-2 py-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
            >
              Visit shop
            </Link>
          ) : (
            <FollowButton userId={seller.id} size="sm" className="shrink-0" />
          )}
        </div>
      ) : null}

      {/* CTA grammar — one primary, one secondary row, one quiet */}
      {isOwner ? (
        <div className="mt-5 flex flex-col gap-2">
          <Badge variant="neutral" icon="pricetag" className="self-start">
            This is your listing
          </Badge>
          <Button variant="secondary" size="lg" fullWidth icon="edit" onClick={() => router.push('/sell')}>
            Manage listing
          </Button>
          {/* Offer to likers — self-omits unless the listing is active and
              has real likers; flips to a sent state once an offer goes out. */}
          <OfferToLikers listing={listing} />
        </div>
      ) : isSold ? (
        <div className="mt-5 flex flex-col gap-2">
          <Badge variant="neutral" className="self-start">
            Sold {timeAgo(listing.createdAt) ? `· listed ${timeAgo(listing.createdAt)}` : ''}
          </Badge>
          <p className="text-caption text-text-secondary">
            This item has sold — similar pieces are below.
          </p>
          <Button variant="secondary" size="lg" fullWidth onClick={() => router.push('/explore')}>
            Browse similar items
          </Button>
        </div>
      ) : sellerTrustPending ? (
        /* Seller availability unresolved — quiet skeleton rather than
           live CTAs that could 409 the moment the fetch lands. */
        <div className="mt-5 flex flex-col gap-2" aria-busy aria-label="Checking availability">
          <Skeleton className="h-12 w-full rounded-md" />
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      ) : effectiveStateCopy ? (
        /* Unavailable truth — reserved/paused/draft/removed listings,
            away or restricted sellers, and viewer-blocked sellers get a
            factual state and a browse fallback, never a purchase button
            the backend would reject. Messaging stays unless the viewer
            blocked the seller: a buyer can still ask about an away
            seller's item, but nothing reaches a blocked member. */
        <div className="mt-5 flex flex-col gap-2">
          <Badge
            variant="neutral"
            icon={effectiveStateCopy === blockedStateCopy ? 'ban' : undefined}
            className="self-start"
          >
            {effectiveStateCopy.label}
          </Badge>
          <p className="text-caption text-text-secondary">{effectiveStateCopy.subtitle}</p>
          <Button variant="secondary" size="lg" fullWidth onClick={() => router.push('/explore')}>
            Browse similar items
          </Button>
          {caps.canMessage && !sellerBlocked ? (
            <Button
              variant="quiet"
              size="sm"
              icon="chat"
              onClick={handleMessage}
              className="self-center"
            >
              Message seller
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => {
              if (!requireAuth('purchase')) return;
              router.push(`/checkout?item=${listing.id}`);
            }}
          >
            Buy now
          </Button>
          <div className="flex gap-2">
            {activeOffer ? (
              /* Standing offer — the composer stays closed; the buyer can
                 see what's on the table and pull it. */
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border-subtle px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="tnum text-body font-semibold text-text-primary">
                    Your offer · {formatPrice(activeOffer.amount)}
                  </p>
                  <p className="clamp-1 text-meta text-text-secondary">
                    {activeOffer.status === 'countered'
                      ? 'Countered — reply in Offers'
                      : 'Waiting for the seller'}
                  </p>
                </div>
                <Link
                  href="/offers"
                  className="pressable shrink-0 rounded-md px-2 py-1.5 text-caption font-semibold text-text-secondary hover:text-text-primary"
                >
                  Offers
                </Link>
                <button
                  type="button"
                  disabled={withdrawOffer.isPending}
                  onClick={() => {
                    withdrawOffer.mutate(activeOffer.id, {
                      onSuccess: () => show('Offer withdrawn', 'info'),
                      onError: () => show('Could not withdraw the offer — try again.', 'error'),
                    });
                  }}
                  className="pressable shrink-0 rounded-md px-2 py-1.5 text-caption font-semibold text-text-secondary hover:text-danger-text disabled:opacity-40"
                >
                  {withdrawOffer.isPending ? 'Withdrawing…' : 'Withdraw'}
                </button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="md"
                fullWidth
                icon="offer"
                onClick={() => {
                  if (!requireAuth('purchase')) return;
                  setOfferOpen(true);
                }}
              >
                Make an offer
              </Button>
            )}
            <IconButton
              name="bag"
              aria-label={inBag ? 'View bag' : 'Add to bag'}
              contained
              onClick={handleAddToBag}
            />
          </div>
          <Button variant="quiet" size="sm" icon="chat" onClick={handleMessage} className="self-center">
            Message seller
          </Button>
        </div>
      )}

      {/* Conversational signal — one honest line, directly under the CTAs */}
      {signalLine ? (
        <p className="tnum mt-2.5 text-caption text-text-secondary">{signalLine}</p>
      ) : null}

      {/* Save / heart — icon-level actions, quiet row. Save carries a
          caret for the board picker (mobile's long-press tier): tap saves,
          the caret files it to a board. */}
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
          {/* When the conversational line already carries views/likes above
              the fold, the icon counters stay out of this row — the numbers
              surface once, not twice. Sold/owner variants keep them. */}
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

      {/* Price-drop alert — the member-scoped /price-alerts subscription
          (mobile's toggle row inside "Price history & market"). A text
          switch, not a card: quiet affordance under the save row. Live
          only — it hides rather than fabricating state in fixture mode. */}
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

      {/* Delivery + returns + protection — the mobile ShippingReturnsInfo
          block, mirrored at the decision point. Every line is contract-
          backed: shippingPrice / ETA window from the listing commerce
          payload, dispatch SLA from the listing or the platform default,
          the seller's returnPolicy — and each falls back honestly when the
          contract is silent. No trailing border: the bundle row below opens
          with its own hairline when it renders, and when it omits the panel
          simply ends. */}
      <div className="py-4">
        <div className="flex items-start gap-3">
          <Icon name="box" size={20} className="mt-0.5 shrink-0 text-text-secondary" />
          <div className="min-w-0">
            <p className="text-body font-medium text-text-primary">
              {listing.shippingMethod ?? 'Delivery'}
              {seller?.location ? ` · from ${seller.location}` : ''}
            </p>
            <p className="tnum mt-0.5 text-caption text-text-secondary">
              {deliveryCostLine(listing)}
              {deliveryEtaLine(listing) ? ` · ${deliveryEtaLine(listing)}` : ''}
            </p>
          </div>
        </div>

        {/* Dispatch certainty — the seller's own SLA when the contract
            carries one reads as a commitment; the platform default only
            earns the softer "typically" framing. */}
        <div className="mt-2.5 flex items-start gap-3">
          <Icon name="clock" size={20} className="mt-0.5 shrink-0 text-text-secondary" />
          <p className="text-body font-medium text-text-primary">
            {typeof listing.dispatchSlaDays === 'number' && listing.dispatchSlaDays > 0 ? (
              <>
                Dispatches within{' '}
                <span className="tnum">{Math.round(listing.dispatchSlaDays)}</span>{' '}
                {Math.round(listing.dispatchSlaDays) === 1 ? 'day' : 'days'}
              </>
            ) : (
              <>
                Typically dispatches in{' '}
                <span className="tnum">{DISPATCH_SLA_DAYS}</span> days
              </>
            )}
          </p>
        </div>

        <div className="mt-2.5 flex items-start gap-3">
          <Icon name="repeat" size={20} className="mt-0.5 shrink-0 text-text-secondary" />
          <div className="min-w-0">
            <p className="text-body font-medium text-text-primary">{returnsLine(listing)}</p>
            {listing.returnPolicy?.conditions ? (
              <p className="mt-0.5 text-caption text-text-secondary">
                {listing.returnPolicy.conditions}
              </p>
            ) : null}
          </div>
        </div>

        {/* Authentication — real pipeline state from the commerce block
            when the contract carries it ('verified' earns the badge label,
            'in_progress' says the check is live). The price-threshold line
            remains only as the order-level guarantee for items without a
            listing-level claim — the same record checkout writes. */}
        {listing.authenticity?.status === 'verified' ? (
          <div className="mt-2.5 flex items-start gap-3">
            <Icon name="verified" size={20} className="mt-0.5 shrink-0 text-commerce-trust" />
            <div className="min-w-0">
              <p className="text-body font-medium text-text-primary">
                {listing.authenticity.label ?? 'Authenticated'}
              </p>
              <p className="mt-0.5 text-caption text-text-secondary">
                This item has passed ThryftVerse authentication.
              </p>
            </div>
          </div>
        ) : listing.authenticity?.status === 'in_progress' ? (
          <div className="mt-2.5 flex items-start gap-3">
            <Icon name="clock" size={20} className="mt-0.5 shrink-0 text-text-secondary" />
            <div className="min-w-0">
              <p className="text-body font-medium text-text-primary">
                Authentication in progress
              </p>
              <p className="mt-0.5 text-caption text-text-secondary">
                Our verification team is checking this item.
              </p>
            </div>
          </div>
        ) : listing.price >= AUTHENTICATION_THRESHOLD_GBP ? (
          <div className="mt-2.5 flex items-start gap-3">
            <Icon name="verified" size={20} className="mt-0.5 shrink-0 text-commerce-trust" />
            <div className="min-w-0">
              <p className="text-body font-medium text-text-primary">
                Physical authentication included
              </p>
              <p className="mt-0.5 text-caption text-text-secondary">
                Orders over{' '}
                <span className="tnum">{formatPrice(AUTHENTICATION_THRESHOLD_GBP)}</span> are
                checked by our verification team before they reach you.
              </p>
            </div>
          </div>
        ) : null}

        {/* Buyer Protection — expandable "What's covered" disclosure.
            Copy mirrors /buyer-protection — payment escrowed until
            confirmed delivery, full refund on non-arrival / not-as-described. */}
        <button
          type="button"
          aria-expanded={protectionOpen}
          onClick={() => setProtectionOpen((v) => !v)}
          className="pressable mt-2 flex w-full items-center gap-3 rounded-md py-1.5 text-left"
        >
          <Icon name="shieldCheck" size={20} className="shrink-0 text-commerce-trust" />
          <span className="text-body font-medium text-text-primary">
            Buyer Protection covers every order
          </span>
          <Icon
            name={protectionOpen ? 'chevronUp' : 'chevronDown'}
            size={14}
            className="ml-auto shrink-0 text-text-muted"
          />
        </button>
        {protectionOpen ? (
          <div className="pl-8">
            <ul className="flex flex-col gap-1.5 text-caption leading-relaxed text-text-secondary">
              <li className="flex gap-2">
                <Icon name="check" size={13} className="mt-0.5 shrink-0 text-commerce-trust" />
                Your payment is held by ThryftVerse until confirmed delivery — it never goes straight to the seller.
              </li>
              <li className="flex gap-2">
                <Icon name="check" size={13} className="mt-0.5 shrink-0 text-commerce-trust" />
                Full refund — item, fee and shipping — if it never arrives, is damaged in transit or isn’t as described.
              </li>
            </ul>
            <Link
              href="/buyer-protection"
              className="pressable mt-2.5 inline-flex items-center gap-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
            >
              How Buyer Protection works
              <Icon name="forward" size={13} />
            </Link>
          </div>
        ) : null}
      </div>

      {/* Bundle upsell — same-seller picks with the BUNDLE_RULE tier.
          Self-omits when no bundle can be formed (sold item, own listing,
          too little seller stock). A blocked seller never surfaces it —
          buying more from them fails the same server gate. */}
      {sellerBlocked ? null : <BundleUpsellRow listing={listing} />}

      {wall}

      <OfferSheet
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        listing={listing}
        busy={offerSending}
        onSend={(amount, expiryHours) => {
          if (DATA_MODE === 'live') {
            // Live write — the offer only reads as sent once the backend
            // has recorded it (direct 201, or the lookup-by-key recovery
            // inside makeOffer after a dropped response); failure
            // surfaces the server's own message, no fake success.
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
                // Native grammar — a provisioned thread gets the buyer
                // into the conversation the offer now lives in.
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

      {/* Board picker — same sheet the saved/profile surfaces share.
          Self-gates to members: guests hit the signup wall before this
          ever opens, and the sheet itself returns null for guests. */}
      <SaveToBoardSheet
        open={boardOpen}
        onClose={() => setBoardOpen(false)}
        itemId={listing.id}
        itemLabel={listing.title}
      />
    </div>
  );
}
