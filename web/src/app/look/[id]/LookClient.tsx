'use client';

/**
 * Look detail — hero media, creator row, engagement actions, then the
 * shoppable item rail resolved from look.itemIds → listingById.
 * One column, flat canvas, media leads.
 *
 * Existence is decided upstream by the server shell (look resolver in
 * lib/api/server.ts → notFound()); the empty state below is the
 * client-side net for paths the server deferred.
 */

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { userById } from '@/lib/data/fixtures';
import { lookById } from '@/lib/data/fixtures-content';
import { DATA_MODE } from '@/lib/api/client';
import * as socialService from '@/lib/api/services/social';
import { mapListingToDiscoverySummary } from '@/lib/contracts/domain';
import { useListingIds, useSellerSummary } from '@/lib/hooks/listing-resolution';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductTile } from '@/components/cards/ProductTile';
import { useStore, useHydrated } from '@/lib/store/useStore';
import { useFollows } from '@/lib/store/follows';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { formatCount, timeAgo } from '@/lib/utils/format';
import { useShare } from '@/components/profile/useShare';
import { LookCommentsSheet } from '@/components/look/LookCommentsSheet';
import { RelatedLooks } from '@/components/look/RelatedLooks';
import { lookCommentCount } from '@/lib/fixtures-social';
import type { LookWithCounts } from '@/lib/api/services/social';

const tick = (ms = 280) => new Promise((r) => setTimeout(r, ms));

/** Stable empty for the pre-resolution look — keeps the id-list query
 *  identity stable while the look itself is still loading. */
const EMPTY_ITEM_IDS: string[] = [];

function useLook(id: string, initialData?: LookWithCounts) {
  return useQuery<LookWithCounts | null>({
    queryKey: ['look', id, DATA_MODE],
    queryFn: async () => {
      if (DATA_MODE === 'live') return socialService.fetchLook(id);
      await tick();
      return lookById(id) ?? null;
    },
    // Server-shell seed — the same read the queryFn makes, so the first
    // paint skips the duplicate fetch. Stamped stale (epoch 0) so the
    // mount refetch still revalidates it in the background.
    initialData,
    initialDataUpdatedAt: initialData ? 0 : undefined,
  });
}

export function LookSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 lg:max-w-[1100px]"
      aria-busy
      aria-label="Loading look"
    >
      {/* Mirrors the lg two-pane: media left, identity/actions right. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:items-start lg:gap-10">
        <Skeleton className="aspect-[3/4] max-h-[75dvh] w-full rounded-xl lg:max-w-[560px]" />
        <div className="mt-4 lg:mt-0">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="ml-auto h-9 w-24 rounded-full" />
          </div>
          <Skeleton className="mt-4 h-4 w-2/3" />
          <div className="mt-6 grid grid-cols-3 gap-3 lg:grid-cols-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LookClient({ initialLook }: { initialLook?: LookWithCounts }) {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const router = useRouter();
  const { show } = useToast();
  const share = useShare();
  const { requireAuth, wall } = useSignupWall();
  const { data: look, isLoading, isError, refetch } = useLook(id, initialLook);
  // Creator identity — live resolves GET /sellers/:id (the wire row is the
  // identity; a failed read renders the placeholder, never a fixture
  // ghost); fixture keeps the catalogue user.
  const sellerQuery = useSellerSummary(look?.creatorId ?? null);
  // Shoppable rail — the same shared id-list resolution the bag and boards
  // use (live: batch-settled GET /listings/:id, misses dropped).
  const { items: resolvedItems, isLoading: itemsLoading } = useListingIds(
    look?.itemIds ?? EMPTY_ITEM_IDS,
  );
  const items = useMemo(
    () => resolvedItems.map(mapListingToDiscoverySummary),
    [resolvedItems],
  );

  const hydrated = useHydrated();
  const likedLook = useStore((s) => s.likedLooks.includes(id));
  const toggleLikedLook = useStore((s) => s.toggleLikedLook);
  // Saved looks are their own domain — /looks/:id/save in live mode, never
  // the saved-listings endpoint (the old `saved` slice was the wrong wire).
  const savedLook = useStore((s) => s.savedLooks.includes(id));
  const toggleSavedLook = useStore((s) => s.toggleSavedLook);
  const liked = hydrated && likedLook;
  const saved = hydrated && savedLook;
  // Persisted follow state — same store PulseFeed/profiles write to, so
  // the creator stays followed across surfaces and reloads.
  const followingIds = useFollows((s) => s.followingIds);
  const toggleFollow = useFollows((s) => s.toggleFollow);
  const [commentsOpen, setCommentsOpen] = useState(false);

  if (isLoading) return <LookSkeleton />;

  // Error is not absence — a failed fetch gets a retry, not a gravestone.
  if (isError) {
    return (
      <EmptyState
        icon="warning"
        title="Couldn't load this look"
        subtitle="Check your connection and try again."
        actionLabel="Try again"
        onAction={() => void refetch()}
      />
    );
  }

  if (!look) {
    return (
      <EmptyState
        icon="images"
        title="Look not found"
        subtitle="This look may have been removed by its creator."
        actionLabel="Back to feed"
        onAction={() => router.push('/')}
      />
    );
  }

  // Creator identity — fixture reads the catalogue user; live reads the
  // seller summary off the wire. Each source renders only the fields it
  // actually carries (followers vs rating/reviews) — nothing invented.
  const fixtureCreator = DATA_MODE === 'live' ? null : userById(look.creatorId);
  const seller = DATA_MODE === 'live' ? (sellerQuery.data ?? null) : null;
  const creatorName = fixtureCreator?.username ?? seller?.username ?? null;
  const creatorAvatar = fixtureCreator?.avatar ?? seller?.avatar ?? null;
  const creatorVerified = fixtureCreator?.isVerified ?? seller?.verified ?? false;
  const creatorMeta = fixtureCreator ? (
    `${formatCount(fixtureCreator.followers)} followers`
  ) : seller?.rating != null ? (
    <>
      <span className="inline-flex items-center gap-1">
        <Icon name="star" filled size={12} className="text-rating-star" />
        <span className="tnum">{seller.rating.toFixed(1)}</span>
      </span>
      {seller.reviewCount > 0 ? ` · ${seller.reviewCount} reviews` : ''}
    </>
  ) : null;
  const following = hydrated && followingIds.includes(look.creatorId);

  // Creator identity — shared between the profile link (handle resolved)
  // and the inert row below; the fields are null-safe either way.
  const creatorIdentity = (
    <>
      <Avatar src={creatorAvatar} name={creatorName} size={42} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-body-emphasis font-semibold text-text-primary">
          <span className="clamp-1">@{creatorName ?? 'creator'}</span>
          {creatorVerified ? (
            <Icon name="verified" size={15} className="shrink-0 text-commerce-trust" filled />
          ) : null}
        </span>
        <span className="block text-meta text-text-muted">
          {creatorMeta}
          {creatorMeta && look.createdAt ? ' · ' : null}
          {look.createdAt ? timeAgo(look.createdAt) : null}
        </span>
      </span>
    </>
  );

  const likeCount = (look.likeCount ?? 0) + (liked ? 1 : 0);
  // Comment count — live rows carry comment_count; fixtures resolve the
  // seeded + session comments through fixtures-social.
  const commentCount =
    DATA_MODE === 'live' ? look.commentCount ?? 0 : lookCommentCount(id);

  const handleLike = () => {
    if (!requireAuth('save_item')) return;
    // The store writes through to /looks/:id/like itself (optimistic with
    // revert) — no fire-and-forget service call beside it.
    toggleLikedLook(id);
  };
  const handleSave = () => {
    if (!requireAuth('save_item')) return;
    toggleSavedLook(id);
    show(saved ? 'Removed from saved' : 'Look saved', 'info');
  };
  // One share grammar across surfaces — native sheet → clipboard (useShare).
  const handleShare = () =>
    share({ title: look.title ?? 'Look on ThryftVerse' });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4 sm:px-6 md:pt-6 lg:max-w-[1100px]">
      {/* IG post-detail grammar at lg: media anchors the left pane; the
          creator/caption/action/item rail composes beside it. Related
          looks take the full canvas beneath both panes. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)] lg:items-start lg:gap-10">
        {/* Hero media */}
        <div className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-xl bg-surface-alt lg:mx-0">
          <AppImage
            src={look.coverImageUri}
            alt={look.title ?? `Look by @${creatorName ?? 'creator'}`}
            aspectRatio={look.coverAspectRatio ?? 0.75}
            focalPoint={{ x: 0.5, y: 0.35 }}
            priority
            className="w-full"
            sizes="(max-width: 768px) 100vw, 560px"
          />
        </div>

        {/* Detail rail — creator, caption, engagement, shoppable items */}
        <div>
          {/* Creator row */}
          <div className="mt-5 flex items-center gap-3 lg:mt-0">
            {creatorName ? (
              <Link
                href={`/u/${creatorName}`}
                className="pressable flex min-w-0 items-center gap-3"
                aria-label={`View @${creatorName}'s profile`}
              >
                {creatorIdentity}
              </Link>
            ) : (
              // Handle unresolved (live fetch still settling or failed) —
              // inert identity, never a dead '#' link.
              <span className="flex min-w-0 items-center gap-3">
                {creatorIdentity}
              </span>
            )}
            <Button
              variant={following ? 'secondary' : 'primary'}
              size="sm"
              className="ml-auto rounded-full"
              onClick={() => {
                if (!requireAuth('follow_seller')) return;
                toggleFollow(look.creatorId);
              }}
            >
              {following ? 'Following' : 'Follow'}
            </Button>
          </div>

          {/* Caption */}
          {look.title ? (
            <p className="mt-4 text-body-large text-text-primary">{look.title}</p>
          ) : null}

          {/* Engagement — like, save, share. 44px targets, no chrome. */}
          <div className="mt-3 flex items-center gap-1 border-b border-border-subtle pb-4">
            <button
              type="button"
              onClick={handleLike}
              aria-pressed={liked}
              aria-label={liked ? 'Unlike this look' : 'Like this look'}
              className="pressable flex h-11 items-center gap-1.5 pr-3"
            >
              <Icon
                name="heart"
                filled={liked}
                size={24}
                className={liked ? 'text-danger-text' : 'text-text-primary'}
              />
              <span className="tnum text-body font-medium text-text-primary">
                {formatCount(likeCount)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setCommentsOpen(true)}
              aria-label={`View comments${commentCount ? ` (${commentCount})` : ''}`}
              className="pressable flex h-11 items-center gap-1.5 px-3"
            >
              <Icon name="comment" size={22} className="text-text-primary" />
              {commentCount > 0 ? (
                <span className="tnum text-body font-medium text-text-primary">
                  {formatCount(commentCount)}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={handleSave}
              aria-pressed={saved}
              aria-label={saved ? 'Remove look from saved' : 'Save this look'}
              className="pressable flex h-11 w-11 items-center justify-center"
            >
              <Icon name="bookmark" filled={saved} size={22} className={saved ? 'text-brand' : 'text-text-primary'} />
            </button>
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share this look"
              className="pressable flex h-11 w-11 items-center justify-center"
            >
              <Icon name="share" size={22} className="text-text-primary" />
            </button>
          </div>

          {/* Shop the look — two-up inside the desktop rail. While the
              live id fetches are in flight the rail shows its skeleton;
              a resolved-empty look hides the section (as before). */}
          {itemsLoading ? (
            <section aria-label="Shop the look" className="mt-8">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-section-title font-semibold text-text-primary">Shop the look</h2>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
                ))}
              </div>
            </section>
          ) : items.length > 0 ? (
            <section aria-label="Shop the look" className="mt-8">
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="text-section-title font-semibold text-text-primary">Shop the look</h2>
                <span className="tnum text-meta text-text-muted">{items.length} items</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-2">
                {items.map((item) => (
                  <ProductTile key={item.id} item={item} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>

      {/* Related looks — server-ranked rail mirroring mobile's
          useRelatedLooks feed */}
      <RelatedLooks look={look} />

      <LookCommentsSheet
        lookId={id}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />

      {wall}
    </div>
  );
}
