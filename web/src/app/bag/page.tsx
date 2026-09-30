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
import { BagUrgencyBanner } from '@/components/bag/BagUrgencyBanner';
import { BagPromoCodeInput } from '@/components/bag/BagPromoCodeInput';
import { BagTrustBadges } from '@/components/bag/BagTrustBadges';
import { useStore } from '@/lib/store/useStore';
import { useBagListings } from '@/lib/store/useBagListings';
import { BUNDLE_RULE_LABEL, sellerGroups } from '@/lib/data/fixtures';
import { bundleSuggestions } from '@/lib/data/fixtures-commerce';
import { DATA_MODE } from '@/lib/api/client';
import { checkoutTotals } from '@/lib/commerce/postage';
import { formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';

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

  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountPct: number } | null>(null);

  // Mode-aware resolution — fixture ids map onto the catalogue; live ids
  // batch-fetch GET /listings/:id. A live entry that can't be resolved is
  // dropped honestly (counted below), never replaced by a fixture row.
  const {
    items,
    soldOutCount,
    unresolvedCount,
    isLoading: listingsLoading,
  } = useBagListings(bag);

  const totals = useMemo(() => checkoutTotals(items), [items]);
  const groups = useMemo(() => sellerGroups(items), [items]);
  const bundleDiscount = useMemo(
    () => groups.reduce((sum, g) => sum + g.discount, 0),
    [groups],
  );
  // Live honesty: promo codes are fixture-demo only (POST /orders carries
  // no promo field) and the backend applies no bundle discount, so the
  // live payable total is exactly the sum of real order totals.
  const promoDiscount = useMemo(
    () =>
      DATA_MODE !== 'live' && appliedPromo
        ? Math.round(totals.items * appliedPromo.discountPct * 100) / 100
        : 0,
    [appliedPromo, totals.items],
  );
  const payableTotal = Math.max(
    0,
    Math.round(
      (totals.total - (DATA_MODE === 'live' ? 0 : bundleDiscount) - promoDiscount) * 100,
    ) / 100,
  );

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

  if (!hydrated || listingsLoading) {
    return <BagSkeleton />;
  }

  if (items.length === 0) {
    // Live entries that resolved to nothing aren't "empty bag" — say so.
    const pruned = soldOutCount + unresolvedCount;
    // Recovery path: items parked with "Save for later" live in /saved —
    // surface the way back when there's something to recover.
    return (
      <>
        <EmptyState
          icon="bag"
          title={pruned > 0 ? 'Nothing left in your bag' : 'Your bag is empty'}
          subtitle={
            pruned > 0
              ? `${pruned} ${pruned === 1 ? 'item is' : 'items are'} no longer available and ${pruned === 1 ? 'was' : 'were'} removed from view.`
              : 'Save items to your bag and check out in one go — bundles from the same seller ship together.'
          }
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
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-screen-title text-text-primary">
          Bag <span className="tnum text-text-muted">· {items.length}</span>
        </h1>
        <p className="text-caption text-text-secondary">
          Delivery address and payment method selected at checkout
        </p>
      </div>

      <div className="mt-4">
        <BagUrgencyBanner itemCount={items.length} />
      </div>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {soldOutCount > 0 ? (
            <p className="mb-4 flex items-center gap-1.5 text-caption text-text-muted">
              <Icon name="info" size={14} className="shrink-0" />
              {soldOutCount} {soldOutCount === 1 ? 'item' : 'items'} sold out — excluded from your bag.
            </p>
          ) : null}
          {unresolvedCount > 0 ? (
            <p className="mb-4 flex items-center gap-1.5 text-caption text-text-muted">
              <Icon name="info" size={14} className="shrink-0" />
              {unresolvedCount} {unresolvedCount === 1 ? 'item' : 'items'} couldn’t be loaded — not included in your totals.
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
                  // Bag removal is local — it moves regardless. The
                  // wishlist write resolves honestly: only claim "Saved"
                  // once it lands, and say so if it doesn't.
                  removeFromBag(listingId);
                  if (!isWishlisted(listingId)) {
                    void toggleWishlist(listingId).then((ok) =>
                      show(
                        ok
                          ? 'Saved for later — it’s in your Saved items'
                          : 'Removed from bag — the save didn’t sync',
                        ok ? 'success' : 'error',
                      ),
                    );
                  } else {
                    show('Saved for later — it’s in your Saved items', 'success');
                  }
                }}
              />
            ))}
          </div>

          {/* Bundle hint — other stock from sellers already in the bag */}
          {bundleGroups.map((group) => (
            <section key={group.sellerId} className="mt-10 rounded-xl border border-border-subtle bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-body-emphasis font-bold text-text-primary">
                  {group.username ? (
                    <Link
                      href={`/u/${group.username}/bundle`}
                      className="pressable flex items-center gap-1.5 hover:underline"
                    >
                      <Icon name="pricetag" size={16} className="text-brand" />
                      {DATA_MODE === 'live'
                        ? `More pieces from @${group.username} — they post together`
                        : `More pieces from @${group.username} — save ${BUNDLE_RULE_LABEL}`}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Icon name="pricetag" size={16} className="text-brand" />
                      {DATA_MODE === 'live'
                        ? 'Add another item — same-seller pieces post together'
                        : `Add another item — ${BUNDLE_RULE_LABEL}`}
                    </span>
                  )}
                </h2>
                <span className="text-caption text-text-muted">Combined shipping</span>
              </div>
              <div className="no-scrollbar mt-4 flex gap-3 overflow-x-auto pb-1" role="list">
                {group.suggestions.map((s) => (
                  <div
                    key={s.id}
                    role="listitem"
                    className="group relative w-[140px] shrink-0 overflow-hidden rounded-lg border border-border-subtle bg-surface-alt p-2 transition-shadow hover:shadow-sm"
                  >
                    <Link href={`/item/${s.id}`} className="block overflow-hidden rounded-md">
                      <AppImage
                        src={getListingCoverUri(s.images)}
                        alt={s.title}
                        aspectRatio={0.8}
                        focalPoint={getCategoryFocalPoint(s.category)}
                        sizes="140px"
                        className="w-full media-zoom"
                      />
                    </Link>
                    <div className="mt-2 min-w-0">
                      <p className="clamp-1 text-caption font-medium text-text-primary">{s.title}</p>
                      <div className="mt-0.5 flex items-center justify-between">
                        <p className="tnum text-caption font-bold text-text-primary">
                          {formatPrice(s.price)}
                        </p>
                        {s.size ? (
                          <span className="text-meta text-text-muted">Sz {s.size}</span>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          addToBag(s.id);
                          show('Added to bag', 'success');
                        }}
                        className="pressable mt-2 flex w-full items-center justify-center gap-1 rounded bg-brand py-1 text-meta font-semibold text-text-inverse hover:bg-brand-pressed"
                      >
                        <Icon name="plus" size={13} />
                        Add to bag
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Totals — flat ledger, hairlines, one action */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-border-subtle bg-surface p-5">
            <h2 className="text-body-emphasis font-bold text-text-primary">Order summary</h2>
            <dl className="mt-4 flex flex-col gap-2.5 border-y border-border-subtle py-4">
              <div className="flex justify-between text-body text-text-secondary">
                <dt>Items ({items.length})</dt>
                <dd className="tnum text-text-primary">{formatPrice(totals.items)}</dd>
              </div>
              <div className="flex justify-between text-body text-text-secondary">
                <dt>
                  Postage{totals.parcels > 1 ? ` · ${totals.parcels} parcels` : ''}
                </dt>
                <dd className="tnum text-text-primary">{formatPrice(totals.shippingFee)}</dd>
              </div>
              <div className="flex justify-between text-body text-text-secondary">
                <dt>Buyer Protection fee</dt>
                <dd className="tnum text-text-primary">{formatPrice(totals.protectionFee)}</dd>
              </div>
              {/* Live: informational only — the server charges each
                  listing in full, so no −£ amount may render here. */}
              {bundleDiscount > 0 ? (
                <div className="flex justify-between text-body text-text-secondary">
                  {DATA_MODE === 'live' ? (
                    <dt className="flex items-center gap-1.5">
                      <Icon name="box" size={15} className="text-text-muted" />
                      Bundle posts together — no checkout discount
                    </dt>
                  ) : (
                    <>
                      <dt className="flex items-center gap-1.5">
                        <Icon name="pricetag" size={15} className="text-success-text" />
                        Bundle discount ({BUNDLE_RULE_LABEL})
                      </dt>
                      <dd className="tnum font-semibold text-success-text">−{formatPrice(bundleDiscount)}</dd>
                    </>
                  )}
                </div>
              ) : null}
              {promoDiscount > 0 ? (
                <div className="flex justify-between text-body text-text-secondary">
                  <dt className="flex items-center gap-1.5">
                    <Icon name="pricetag" size={15} className="text-success-text" />
                    Promo code ({appliedPromo?.code})
                  </dt>
                  <dd className="tnum font-semibold text-success-text">−{formatPrice(promoDiscount)}</dd>
                </div>
              ) : null}
              <div className="mt-1 flex justify-between border-t border-border-subtle pt-3 text-body-emphasis text-text-primary">
                <dt className="font-bold">Total</dt>
                <dd className="tnum text-price-list font-bold">{formatPrice(payableTotal)}</dd>
              </div>
            </dl>

            {/* Promo input is fixture-demo only — the server never sees a
                promo field, so live mode renders no input and no toasts. */}
            {DATA_MODE !== 'live' ? (
              <div className="mt-3">
                <BagPromoCodeInput
                  appliedPromo={appliedPromo}
                  onApplyPromo={(code, discountPct) => {
                    setAppliedPromo({ code, discountPct });
                    show(`Promo code ${code} applied!`, 'success');
                  }}
                  onRemovePromo={() => {
                    setAppliedPromo(null);
                    show('Promo code removed', 'info');
                  }}
                />
              </div>
            ) : null}

            <Button
              variant="primary"
              size="lg"
              fullWidth
              className="mt-5"
              onClick={() => router.push('/checkout')}
            >
              Checkout · <span className="tnum">{formatPrice(payableTotal)}</span>
            </Button>

            <BagTrustBadges />
          </div>
        </aside>
      </div>
    </div>
  );
}
