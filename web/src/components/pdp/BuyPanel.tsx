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
import { useState } from 'react';
import type { Listing } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { useToast } from '@/components/ui/Toast';
import { useStore, useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import { useSignupWall } from '@/components/auth/SignupWall';
import { soldComparablesFor } from '@/lib/data/fixtures';
import { recordSentOffer } from '@/lib/data/fixtures-commerce';
import { formatCount, formatPrice, timeAgo } from '@/lib/utils/format';
import { OfferSheet } from './OfferSheet';
import { OfferToLikers } from './OfferToLikers';
import { SizeGuideSheet, resolveSizeGuide } from './SizeGuideSheet';
import { BundleUpsellRow } from '@/components/bundle/BundleUpsellRow';
import { ReportLauncher } from '@/components/report';

interface BuyPanelProps {
  listing: Listing;
}

export function BuyPanel({ listing }: BuyPanelProps) {
  const router = useRouter();
  const { show } = useToast();
  const { user } = useSession();
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
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [protectionOpen, setProtectionOpen] = useState(false);
  const sizeGuide = resolveSizeGuide(listing);

  const isSold = listing.isSold === true || listing.status === 'sold';
  const isOwner = user?.id === listing.sellerId;
  const seller = listing.seller;
  const sellerUsername = seller?.username ?? null;

  /**
   * Conversational signal line — the eBay VI beat that sits directly under
   * the buy buttons. Every clause comes from a real field: views/likes are
   * contract counters, sold comps are the same dataset PdpMarket publishes.
   * Resale stock is one-of-one, so the scarcity clause is structural truth,
   * not a fabricated counter. One quiet line; self-omits for sold/owner.
   */
  const signalLine = ((): string | null => {
    if (isSold || isOwner) return null;
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
    const comps = soldComparablesFor(listing);
    if (comps.length >= 2) demand.push(`${comps.length} similar sold`);
    return demand.length
      ? `One only · ${demand.slice(0, 2).join(' · ')}`
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
    toggleFav(listing.id);
    if (!isFav) show('Added to wishlist', 'success');
  };

  const handleSave = () => {
    if (!requireAuth('save_item')) return;
    toggleSaved(listing.id);
    show(isSaved ? 'Removed from saved' : 'Added to saved', 'info');
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
    router.push('/inbox');
  };

  return (
    <div className="flex flex-col">
      {/* Identity seam — brand eyebrow, title, price */}
      {listing.promoted ? (
        <span className="text-meta font-medium text-text-muted">{listing.disclosure ?? 'Sponsored'}</span>
      ) : null}
      {listing.brand ? (
        <span className="text-label font-semibold uppercase tracking-wide text-text-secondary">
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
            <Avatar src={seller?.avatar} name={sellerUsername} size={44} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 text-body-emphasis text-text-primary">
              <Link
                href={`/u/${sellerUsername}`}
                className="clamp-1 hover:text-text-primary"
              >
                @{sellerUsername}
              </Link>
              {seller?.verified ? (
                <Icon name="verified" size={13} className="shrink-0 text-success-text" />
              ) : null}
            </p>
            {typeof seller?.rating === 'number' ? (
              <p className="mt-0.5 flex items-center gap-1 text-meta text-text-secondary">
                <Icon name="star" filled size={12} className="text-rating-star" />
                <span className="tnum">{seller.rating.toFixed(1)}</span>
                {seller.reviewCount ? (
                  <span>· {formatCount(seller.reviewCount)} reviews</span>
                ) : null}
              </p>
            ) : null}
          </div>
          <Link
            href={`/u/${sellerUsername}`}
            className="pressable shrink-0 rounded-md px-2 py-1 text-caption font-semibold text-text-secondary hover:text-text-primary"
          >
            Visit shop
          </Link>
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
          <Button variant="secondary" size="lg" fullWidth onClick={() => router.push('/explore')}>
            Browse similar items
          </Button>
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

      {/* Save / heart — icon-level actions, quiet row */}
      <div className="mt-3 flex items-center gap-1 border-b border-border-subtle pb-4">
        <button
          type="button"
          onClick={handleSave}
          aria-pressed={isSaved}
          className="pressable flex h-9 items-center gap-1.5 rounded-md px-2 text-caption font-medium text-text-secondary hover:text-text-primary"
        >
          <Icon name="bookmark" filled={isSaved} size={16} className={isSaved ? 'text-brand' : ''} />
          {isSaved ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleHeart}
          aria-pressed={isFav}
          className="pressable flex h-9 items-center gap-1.5 rounded-md px-2 text-caption font-medium text-text-secondary hover:text-text-primary"
        >
          <Icon name="heart" filled={isFav} size={16} className={isFav ? 'text-danger-text' : ''} />
          {isFav ? 'Favourited' : 'Favourite'}
        </button>
        {!isOwner ? (
          <ReportLauncher
            target={{ type: 'listing', id: listing.id, label: listing.title }}
            menuTitle="Listing options"
            menuLabel="Report this item"
          />
        ) : null}
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

      {/* Shipping + protection — contract-driven lines, honest fallbacks.
          Trust belongs at the decision point: this block sits in the
          commerce cluster under the CTAs, not buried past the spec ledger.
          shippingMethod is the only carrier field on Listing; no price or
          ETA exists in the contract, so cost stays "calculated at checkout"
          unless the seller covers it (shippingPayer === 'seller'). No
          trailing border: the bundle row below opens with its own hairline
          when it renders, and when it omits the panel simply ends. */}
      <div className="py-4">
        <div className="flex items-start gap-3">
          <Icon name="box" size={20} className="mt-0.5 shrink-0 text-text-secondary" />
          <div className="min-w-0">
            <p className="text-body font-medium text-text-primary">
              {listing.shippingMethod ?? 'Delivery'}
              {seller?.location ? ` · from ${seller.location}` : ''}
            </p>
            <p className="mt-0.5 text-caption text-text-secondary">
              {listing.shippingPayer === 'seller'
                ? 'Free delivery — the seller covers postage'
                : 'Delivery calculated at checkout'}
            </p>
          </div>
        </div>

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
          too little seller stock). */}
      <BundleUpsellRow listing={listing} />

      {wall}

      <OfferSheet
        open={offerOpen}
        onClose={() => setOfferOpen(false)}
        listing={listing}
        onSend={(amount) => {
          recordSentOffer(listing, amount);
          setOfferOpen(false);
          show(`Offer sent — ${formatPrice(amount)}`, 'success');
        }}
      />

      <SizeGuideSheet
        open={sizeGuideOpen}
        onClose={() => setSizeGuideOpen(false)}
        guide={sizeGuide}
        currentSize={listing.size}
      />
    </div>
  );
}
