'use client';

/**
 * /bag — bundle bag. Line items grouped per seller (the unit a bundle
 * discount attaches to) with a per-seller bundle hint rail, totals ledger
 * (items / bundle discount / protection / shipping / total), one checkout
 * CTA. Mutations are client-side via useStore.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { BagSellerGroup } from '@/components/bag/BagSellerGroup';
import { useStore } from '@/lib/store/useStore';
import { BUNDLE_RULE_LABEL, listingById, sellerGroups } from '@/lib/data/fixtures';
import { bundleSuggestions, orderTotals } from '@/lib/data/fixtures-commerce';
import { formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';
import type { Listing } from '@/lib/contracts/domain';

function BagSkeleton() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6" aria-busy aria-label="Loading bag">
      <Skeleton className="h-8 w-24" />
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Seller groups — header + hairline-bordered rows, as rendered */}
        <div className="flex flex-col gap-7">
          {Array.from({ length: 2 }).map((_, g) => (
            <div key={g}>
              <Skeleton className="h-4 w-36" />
              <div className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 py-3">
                    <Skeleton className="h-20 w-16 rounded-md" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="mt-1.5 h-3 w-1/3" />
                      <Skeleton className="mt-2 h-3 w-28" />
                    </div>
                    <Skeleton className="h-4 w-14" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Ledger — flat lines + CTA, not a fake panel */}
        <div>
          <div className="flex flex-col gap-2.5 border-y border-border-subtle py-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-4 h-12 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export default function BagPage() {
  const router = useRouter();
  const { show } = useToast();
  const bag = useStore((s) => s.bag);
  const removeFromBag = useStore((s) => s.removeFromBag);
  const addToBag = useStore((s) => s.addToBag);
  const isWishlisted = useStore((s) => s.isWishlisted);
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const wishlistCount = useStore((s) => s.wishlist.length);

  // Zustand persist rehydrates from localStorage — wait for it so the
  // first render doesn't flash the empty state.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const items = useMemo(
    () =>
      bag
        .map((b) => listingById(b.listingId))
        .filter((l): l is Listing => !!l && !l.isSold),
    [bag],
  );

  // Sold-out bag entries stay out of every group and total — one quiet note.
  const soldOutCount = useMemo(
    () =>
      bag
        .map((b) => listingById(b.listingId))
        .filter((l): l is Listing => !!l && l.isSold === true).length,
    [bag],
  );

  const totals = useMemo(() => orderTotals(items), [items]);
  const groups = useMemo(() => sellerGroups(items), [items]);
  const bundleDiscount = useMemo(
    () => groups.reduce((sum, g) => sum + g.discount, 0),
    [groups],
  );
  const payableTotal = Math.round((totals.total - bundleDiscount) * 100) / 100;

  // Sellers already in the bag with more stock — the bundle hint.
  const bagIds = useMemo(() => new Set(items.map((l) => l.id)), [items]);
  const bundleGroups = useMemo(() => {
    const sellerIds = [...new Set(items.map((l) => l.sellerId))];
    return sellerIds
      .map((sellerId) => ({
        sellerId,
        username: items.find((l) => l.sellerId === sellerId)?.seller?.username ?? null,
        suggestions: bundleSuggestions(sellerId, bagIds),
      }))
      .filter((g) => g.suggestions.length > 0);
  }, [items, bagIds]);

  if (!hydrated) {
    return <BagSkeleton />;
  }

  if (items.length === 0) {
    // Recovery path: items parked with "Save for later" live in /saved —
    // surface the way back when there's something to recover.
    return (
      <>
        <EmptyState
          icon="bag"
          title="Your bag is empty"
          subtitle="Save items to your bag and check out in one go — bundles from the same seller ship together."
          actionLabel="Start shopping"
          onAction={() => router.push('/explore')}
        />
        {wishlistCount > 0 ? (
          <p className="-mt-14 flex justify-center pb-16">
            <Link
              href="/saved"
              className="pressable text-body font-medium text-text-secondary underline underline-offset-4 hover:text-text-primary"
            >
              {wishlistCount} {wishlistCount === 1 ? 'item is' : 'items are'} saved for later
            </Link>
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <h1 className="text-screen-title font-bold text-text-primary">
        Bag <span className="tnum text-text-muted">· {items.length}</span>
      </h1>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {soldOutCount > 0 ? (
            <p className="mb-4 flex items-center gap-1.5 text-caption text-text-muted">
              <Icon name="info" size={14} className="shrink-0" />
              {soldOutCount} {soldOutCount === 1 ? 'item' : 'items'} sold out — excluded from your bag.
            </p>
          ) : null}

          {/* Seller groups — the bundle is priced per seller */}
          <div className="flex flex-col gap-7">
            {groups.map((group) => (
              <BagSellerGroup
                key={group.sellerId}
                group={group}
                onRemove={(listingId) => {
                  removeFromBag(listingId);
                  show('Removed from bag', 'info');
                }}
                onSaveForLater={(listingId) => {
                  // "Save for later" has no bag slice — the wishlist is the
                  // model's parked state; the item lands in /saved favourites.
                  if (!isWishlisted(listingId)) toggleWishlist(listingId);
                  removeFromBag(listingId);
                  show('Saved for later — it’s in your Saved items', 'success');
                }}
              />
            ))}
          </div>

          {/* Bundle hint — other stock from sellers already in the bag */}
          {bundleGroups.map((group) => (
            <section key={group.sellerId} className="mt-8">
              <h2 className="flex items-center gap-1.5 text-body-emphasis text-text-primary">
                <Icon name="pricetag" size={16} className="text-text-secondary" />
                Add another item
                {group.username ? ` from @${group.username}` : ' from this seller'} — {BUNDLE_RULE_LABEL}
              </h2>
              <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto" role="list">
                {group.suggestions.map((s) => (
                  <div
                    key={s.id}
                    role="listitem"
                    className="group relative w-[130px] shrink-0"
                  >
                    <Link href={`/item/${s.id}`} className="block overflow-hidden rounded-lg">
                      <AppImage
                        src={getListingCoverUri(s.images)}
                        alt={s.title}
                        aspectRatio={0.8}
                        focalPoint={getCategoryFocalPoint(s.category)}
                        sizes="130px"
                        className="w-full"
                      />
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        addToBag(s.id);
                        show('Added to bag', 'success');
                      }}
                      aria-label={`Add ${s.title} to bag`}
                      className="pressable absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-overlay text-scrim-text-primary"
                    >
                      <Icon name="plus" size={18} />
                    </button>
                    <p className="clamp-1 mt-1.5 text-caption text-text-secondary">{s.title}</p>
                    <p className="tnum text-caption font-semibold text-text-primary">
                      {formatPrice(s.price)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Totals — flat ledger, hairlines, one action */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <dl className="flex flex-col gap-2.5 border-y border-border-subtle py-5">
            <div className="flex justify-between text-body text-text-secondary">
              <dt>Items ({items.length})</dt>
              <dd className="tnum text-text-primary">{formatPrice(totals.items)}</dd>
            </div>
            <div className="flex justify-between text-body text-text-secondary">
              <dt>Postage</dt>
              <dd className="tnum text-text-primary">{formatPrice(totals.shippingFee)}</dd>
            </div>
            <div className="flex justify-between text-body text-text-secondary">
              <dt>Buyer Protection fee</dt>
              <dd className="tnum text-text-primary">{formatPrice(totals.protectionFee)}</dd>
            </div>
            {bundleDiscount > 0 ? (
              <div className="flex justify-between text-body text-text-secondary">
                <dt className="flex items-center gap-1.5">
                  <Icon name="pricetag" size={15} className="text-success-text" />
                  Bundle discount ({BUNDLE_RULE_LABEL})
                </dt>
                <dd className="tnum font-semibold text-success-text">−{formatPrice(bundleDiscount)}</dd>
              </div>
            ) : null}
            <div className="mt-1 flex justify-between border-t border-border-subtle pt-3 text-body-emphasis text-text-primary">
              <dt className="font-semibold">Total</dt>
              <dd className="tnum text-price-list font-bold">{formatPrice(payableTotal)}</dd>
            </div>
          </dl>
          <p className="mt-3 flex items-start gap-1.5 text-caption text-text-secondary">
            <Icon name="shieldCheck" size={15} className="mt-px shrink-0 text-commerce-trust" />
            Covered by Buyer Protection — full refund if an item never arrives or isn’t as described.
          </p>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="mt-4"
            onClick={() => router.push('/checkout')}
          >
            Checkout · {formatPrice(payableTotal)}
          </Button>
        </aside>
      </div>
    </div>
  );
}
