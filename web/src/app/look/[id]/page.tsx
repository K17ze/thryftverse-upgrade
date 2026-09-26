'use client';

/**
 * Look detail — hero media, creator row, engagement actions, then the
 * shoppable item rail resolved from look.itemIds → listingById.
 * One column, flat canvas, media leads.
 */

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { LOOKS, listingById, userById } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import * as socialService from '@/lib/api/services/social';
import { mapListingToDiscoverySummary, type Look } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductTile } from '@/components/cards/ProductTile';
import { useStore, useHydrated } from '@/lib/store/useStore';
import { useToast } from '@/components/ui/Toast';
import { useSignupWall } from '@/components/auth/SignupWall';
import { formatCount, timeAgo } from '@/lib/utils/format';

const tick = (ms = 280) => new Promise((r) => setTimeout(r, ms));

function useLook(id: string) {
  return useQuery<Look | null>({
    queryKey: ['look', id, DATA_MODE],
    queryFn: async () => {
      if (DATA_MODE === 'live') return socialService.fetchLook(id);
      await tick();
      return LOOKS.find((l) => l.id === id) ?? null;
    },
  });
}

function LookSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6" aria-busy aria-label="Loading look">
      <Skeleton className="aspect-[3/4] max-h-[75dvh] w-full rounded-xl" />
      <div className="mt-4 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-4 w-36" />
        <Skeleton className="ml-auto h-9 w-24 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-4 w-2/3" />
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function LookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { show } = useToast();
  const { requireAuth, wall } = useSignupWall();
  const { data: look, isLoading } = useLook(id);

  const hydrated = useHydrated();
  const likedLook = useStore((s) => s.likedLooks.includes(id));
  const toggleLikedLook = useStore((s) => s.toggleLikedLook);
  const savedLook = useStore((s) => s.saved.includes(id));
  const toggleSaved = useStore((s) => s.toggleSaved);
  const liked = hydrated && likedLook;
  const saved = hydrated && savedLook;
  const [following, setFollowing] = useState(false);

  if (isLoading) return <LookSkeleton />;

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

  const creator = userById(look.creatorId);
  const items = look.itemIds
    .map(listingById)
    .filter((l): l is NonNullable<typeof l> => l != null)
    .map(mapListingToDiscoverySummary);

  const likeCount = (look.likeCount ?? 0) + (liked ? 1 : 0);

  const handleLike = () => {
    if (!requireAuth('save_item')) return;
    toggleLikedLook(id);
    if (DATA_MODE === 'live') void socialService.setLookLiked(id, !liked);
  };
  const handleSave = () => {
    if (!requireAuth('save_item')) return;
    toggleSaved(id);
    show(saved ? 'Removed from saved' : 'Look saved', 'info');
  };
  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      show('Link copied', 'success');
    } catch {
      show('Could not copy link', 'error');
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4 sm:px-6 md:pt-6">
      {/* Hero media */}
      <div className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-xl bg-surface-alt">
        <AppImage
          src={look.coverImageUri}
          alt={look.title ?? `Look by @${creator?.username ?? 'creator'}`}
          aspectRatio={look.coverAspectRatio ?? 0.75}
          focalPoint={{ x: 0.5, y: 0.35 }}
          priority
          className="w-full"
          sizes="(max-width: 768px) 100vw, 560px"
        />
      </div>

      {/* Creator row */}
      <div className="mt-5 flex items-center gap-3">
        <Link
          href={creator ? `/u/${creator.username}` : '#'}
          className="pressable flex min-w-0 items-center gap-3"
          aria-label={creator ? `View @${creator.username}'s profile` : 'Creator'}
        >
          <Avatar src={creator?.avatar} name={creator?.username} size={42} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-body-emphasis font-semibold text-text-primary">
              <span className="clamp-1">@{creator?.username ?? 'creator'}</span>
              {creator?.isVerified ? (
                <Icon name="verified" size={15} className="shrink-0 text-success-text" filled />
              ) : null}
            </span>
            <span className="block text-meta text-text-muted">
              {formatCount(creator?.followers)} followers
              {look.createdAt ? ` · ${timeAgo(look.createdAt)}` : ''}
            </span>
          </span>
        </Link>
        <Button
          variant={following ? 'secondary' : 'primary'}
          size="sm"
          className="ml-auto rounded-full"
          onClick={() => {
            if (!requireAuth('follow_seller')) return;
            setFollowing((f) => !f);
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

      {/* Shop the look */}
      {items.length > 0 ? (
        <section aria-label="Shop the look" className="mt-8">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-section-title font-semibold text-text-primary">Shop the look</h2>
            <span className="tnum text-meta text-text-muted">{items.length} items</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
            {items.map((item) => (
              <ProductTile key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      {wall}
    </div>
  );
}
