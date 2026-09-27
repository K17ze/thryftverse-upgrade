'use client';

/**
 * BundleBuilder — the per-seller bundle-building surface, the web port of
 * mobile's BundleBagScreen (frontend/src/screens/BundleBagScreen.tsx):
 * pick 2+ items from one seller and they post together as a single
 * parcel. Where mobile hands off to per-item checkout, the web bag
 * already prices seller groups — the CTA writes the selection into the
 * shared bag store and hands off to /bag, where the same
 * sellerGroups/BUNDLE_RULE math (lib/data/fixtures) computes the discount
 * the tray projects. Nothing here invents a second pricing path.
 *
 * Eligibility mirrors the PDP buy gate: listingCapabilities().isAvailable
 * keeps sold/paused/draft/removed stock out of the grid, and an
 * away/suspended seller earns a notice line rather than silently dead
 * picks. Items already in the bag count as selected — they're part of
 * the parcel either way — and deselecting one removes it from the bag,
 * the same grammar BundleUpsellRow uses.
 *
 * Deep-link: ?item=<id> pre-stages the listing a PDP visitor came from.
 * Guests can browse and stage; the submit gates behind the purchase
 * signup wall, matching the PDP's add-to-bag posture.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Listing } from '@/lib/contracts/domain';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { StickyFooter } from '@/components/flagship/StickyFooter';
import { useSignupWall } from '@/components/auth/SignupWall';
import { useSellerListings, useUserByUsername } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import { useHydrated, useStore } from '@/lib/store/useStore';
import { BUNDLE_RULE, BUNDLE_RULE_LABEL } from '@/lib/data/fixtures';
import { bundleProgressFor } from '@/lib/data/fixtures-commerce';
import { checkoutTotals } from '@/lib/commerce/postage';
import { listingCapabilities, listingStateCopy } from '@/lib/commerce/capabilities';
import { formatCount, formatPrice } from '@/lib/utils/format';
import { BundleItemCard } from './BundleItemCard';
import { BundleTray } from './BundleTray';
import { BUNDLE_MIN_ITEMS } from './bundleRules';

const pctLabel = `${Math.round(BUNDLE_RULE.discountPct * 100)}%`;

export function BundleBuilderSkeleton() {
  return (
    <div
      className="mx-auto max-w-[1100px] px-4 pt-6 sm:px-6"
      aria-busy
      aria-label="Loading bundle builder"
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-6 w-32 rounded-full" />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-1.5 h-3 w-24" />
        </div>
      </div>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="w-full rounded-lg" style={{ aspectRatio: '0.8' }} />
              <Skeleton className="mt-2 h-3.5 w-3/4" />
              <Skeleton className="mt-1 h-3 w-1/2" />
            </div>
          ))}
        </div>
        <div>
          <Skeleton className="h-4 w-24" />
          <div className="mt-4 flex flex-col gap-2.5 border-y border-border-subtle py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-4 h-[52px] rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function BundleBuilder({ username }: { username: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user: me } = useSession();
  const { requireAuth, wall } = useSignupWall();
  const { show } = useToast();
  const hydrated = useHydrated();
  const bag = useStore((s) => s.bag);
  const addManyToBag = useStore((s) => s.addManyToBag);
  const removeFromBag = useStore((s) => s.removeFromBag);

  const { data: user, isLoading, isError, isFetched, refetch } =
    useUserByUsername(username);
  const { data: sellerListings, isLoading: listingsLoading } = useSellerListings(
    user?.id ?? '',
  );

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const preselectDone = useRef(false);

  // Your own closet isn't bundleable — route to the owner surface, the
  // same redirect /u/[username] performs.
  useEffect(() => {
    if (user?.id && me?.id === user.id) router.replace('/profile');
  }, [user?.id, me?.id, router]);

  // The buyable subset — the same listingCapabilities gate the PDP buy
  // panel applies, so a sold or paused item can never enter a parcel.
  const eligible = useMemo(
    () =>
      (sellerListings ?? []).filter(
        (l) => listingCapabilities(l, me?.id).isAvailable,
      ),
    [sellerListings, me?.id],
  );
  const excludedCount = (sellerListings?.length ?? 0) - eligible.length;

  // ?item=<id> — the PDP deep link pre-stages the listing you came from.
  const preselectId = searchParams.get('item');
  useEffect(() => {
    if (preselectDone.current || !sellerListings) return;
    preselectDone.current = true;
    if (preselectId && eligible.some((l) => l.id === preselectId)) {
      setPicked(new Set([preselectId]));
    }
  }, [sellerListings, eligible, preselectId]);

  // This seller's items already in the bag are part of the parcel —
  // count them rather than pretending the parcel starts empty.
  const baggedIds = useMemo(
    () => new Set(hydrated ? bag.map((b) => b.listingId) : []),
    [hydrated, bag],
  );
  const selected = useMemo(() => {
    const ids = new Set(picked);
    for (const l of eligible) if (baggedIds.has(l.id)) ids.add(l.id);
    return ids;
  }, [picked, eligible, baggedIds]);
  const bundleListings = useMemo(
    () => eligible.filter((l) => selected.has(l.id)),
    [eligible, selected],
  );
  const progress = useMemo(() => bundleProgressFor(bundleListings), [bundleListings]);
  const totals = useMemo(() => checkoutTotals(bundleListings), [bundleListings]);
  const payable = Math.round((totals.total - progress.discount) * 100) / 100;
  const freshCount = bundleListings.filter((l) => !baggedIds.has(l.id)).length;
  const canSubmit = progress.count >= BUNDLE_MIN_ITEMS;

  // Seller-level gate — away or restricted sellers can't transact, but a
  // staged bundle is harmless, so the notice informs rather than blocks.
  const sellerNotice = useMemo(() => {
    const first = sellerListings?.[0];
    if (!first) return null;
    const caps = listingCapabilities(first, me?.id);
    if (!caps.sellerAway && !caps.sellerSuspended) return null;
    return listingStateCopy(caps);
  }, [sellerListings, me?.id]);

  if (isLoading) return <BundleBuilderSkeleton />;
  if (isError) {
    return (
      <div className="mx-auto max-w-[1100px]">
        <EmptyState
          icon="warning"
          title="Couldn't load this seller"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      </div>
    );
  }
  if (isFetched && !user) {
    return (
      <div className="mx-auto max-w-[1100px]">
        <EmptyState
          icon="profile"
          title="Member not found"
          subtitle="This profile doesn't exist or may have been removed."
          actionLabel="Explore"
          onAction={() => router.push('/explore')}
        />
      </div>
    );
  }
  if (!user || user.id === me?.id) return null;

  const shopHref = `/u/${user.username}`;

  const toggleItem = (item: Listing) => {
    if (baggedIds.has(item.id)) {
      // Already part of the parcel via the bag — deselecting removes it.
      removeFromBag(item.id);
      setPicked((prev) => {
        if (!prev.has(item.id)) return prev;
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      show('Removed from bag', 'info');
      return;
    }
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (!requireAuth('purchase')) return;
    if (freshCount === 0) {
      router.push('/bag');
      return;
    }
    addManyToBag(bundleListings.map((l) => l.id));
    show(
      progress.qualifies
        ? `Bundle of ${progress.count} in your bag — you save ${formatPrice(progress.discount)}`
        : `Added ${freshCount} ${freshCount === 1 ? 'item' : 'items'} — ${progress.missing} more from this seller for ${pctLabel} off`,
      'success',
    );
    router.push('/bag');
  };

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="px-4 pt-6 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-screen-title font-bold text-text-primary">Build a bundle</h1>
          <span className="shrink-0 rounded-full bg-brand-subtle px-2.5 py-1 text-meta font-medium text-text-primary">
            {BUNDLE_RULE_LABEL}
          </span>
        </div>

        {/* Seller identity — one row, links back to the shop. */}
        <Link
          href={shopHref}
          aria-label={`Visit @${user.username}'s shop`}
          className="pressable mt-4 flex items-center gap-3 rounded-md py-1"
        >
          <Avatar src={user.avatar} name={user.username} size={40} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-body-emphasis text-text-primary">
              <span className="clamp-1">@{user.username}</span>
              {user.isVerified ? (
                <Icon name="verified" size={13} className="shrink-0 text-success-text" />
              ) : null}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-meta text-text-secondary">
              {typeof user.rating === 'number' ? (
                <>
                  <Icon name="star" filled size={12} className="text-rating-star" />
                  <span className="tnum">{user.rating.toFixed(1)}</span>
                  {user.reviewCount > 0 ? (
                    <span>· {formatCount(user.reviewCount)} reviews</span>
                  ) : null}
                </>
              ) : null}
              {listingsLoading ? null : (
                <span>
                  · <span className="tnum">{eligible.length}</span> for sale
                </span>
              )}
            </span>
          </span>
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        </Link>

        <p className="mt-3 text-caption text-text-secondary">
          Select {BUNDLE_MIN_ITEMS} or more items — they post together in one
          parcel, one postage.
        </p>

        {sellerNotice ? (
          <p className="mt-3 flex items-start gap-2 border-y border-border-subtle py-2.5 text-caption text-text-secondary">
            <Icon
              name={sellerNotice.label === 'Seller away' ? 'clock' : 'warning'}
              size={15}
              className="mt-px shrink-0 text-warning-text"
            />
            {sellerNotice.label} — {sellerNotice.subtitle}
          </p>
        ) : null}
      </div>

      {listingsLoading ? (
        <div className="mt-6 px-4 sm:px-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="w-full rounded-lg" style={{ aspectRatio: '0.8' }} />
                <Skeleton className="mt-2 h-3.5 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      ) : eligible.length === 0 ? (
        <EmptyState
          icon="bag"
          title="Nothing to bundle"
          subtitle={
            (sellerListings?.length ?? 0) > 0
              ? `Everything from @${user.username} has sold or is unavailable right now.`
              : `@${user.username} has no active listings to bundle.`
          }
          actionLabel="Visit shop"
          onAction={() => router.push(shopHref)}
        />
      ) : (
        <div className="mt-5 grid gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            {eligible.length < BUNDLE_MIN_ITEMS ? (
              <p className="mb-3 flex items-center gap-1.5 text-caption text-text-muted">
                <Icon name="info" size={14} className="shrink-0" />
                Only {eligible.length} item listed — a bundle needs at least{' '}
                {BUNDLE_MIN_ITEMS}.
              </p>
            ) : null}
            <div
              role="list"
              aria-label={`Items available from @${user.username}`}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3"
            >
              {eligible.map((l) => (
                <BundleItemCard
                  key={l.id}
                  listing={l}
                  selected={selected.has(l.id)}
                  inBag={baggedIds.has(l.id)}
                  onToggle={() => toggleItem(l)}
                />
              ))}
            </div>
            {excludedCount > 0 ? (
              <p className="mt-3 text-meta text-text-muted">
                {excludedCount} {excludedCount === 1 ? 'item' : 'items'} sold or
                unavailable — excluded.
              </p>
            ) : null}
          </div>

          <BundleTray
            username={user.username}
            items={bundleListings}
            baggedIds={baggedIds}
            onRemove={toggleItem}
            onSubmit={handleSubmit}
          />
        </div>
      )}

      {/* Persistent action bar on <lg — mobile BundleBagScreen parity.
          The full ledger lives in the tray; this keeps the handoff
          reachable from anywhere in the grid. */}
      {progress.count > 0 ? (
        <StickyFooter
          layout="row"
          className="lg:hidden"
          actions={[
            {
              label: !canSubmit
                ? `Select ${BUNDLE_MIN_ITEMS}+ items`
                : freshCount === 0
                  ? 'View bag'
                  : `Add ${freshCount} to bag · ${formatPrice(payable)}`,
              icon: 'bag',
              disabled: !canSubmit,
              onClick: handleSubmit,
            },
          ]}
        />
      ) : null}

      {wall}
    </div>
  );
}
