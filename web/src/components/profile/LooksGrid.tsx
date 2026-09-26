'use client';

/**
 * LooksGrid — profile looks tab. Portrait cover tiles (title + like count
 * only — media is the colour), matching the mobile ProfileLooksGrid.
 */

import Link from 'next/link';
import type { Look } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatCount } from '@/lib/utils/format';

export function LookTile({ look, priority }: { look: Look; priority?: boolean }) {
  return (
    <Link href={`/look/${look.id}`} className="group block" aria-label={look.title ?? 'Look'}>
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={look.coverImageUri}
          alt={look.title ?? 'Look'}
          aspectRatio={look.coverAspectRatio ?? 0.8}
          priority={priority}
          sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 20vw"
          fallbackIcon="images"
        />
      </div>
      <div className="px-0.5 pt-1.5">
        {look.title ? (
          <p className="clamp-1 text-caption font-semibold text-text-primary">{look.title}</p>
        ) : null}
        <p className="flex items-center gap-1 text-meta text-text-muted">
          <Icon name="heart" filled size={10} />
          <span className="tnum">{formatCount(look.likeCount ?? 0)}</span>
          {look.itemIds.length > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="tnum">
                {look.itemIds.length} {look.itemIds.length === 1 ? 'item' : 'items'}
              </span>
            </>
          ) : null}
        </p>
      </div>
    </Link>
  );
}

export function LooksGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-3 gap-1.5 px-4 sm:grid-cols-4 sm:gap-2 sm:px-6 lg:grid-cols-5"
      aria-busy
      aria-label="Loading looks"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <Skeleton className="w-full rounded-lg" style={{ aspectRatio: '0.8' }} />
          <Skeleton className="mx-0.5 mt-1.5 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

interface LooksGridProps {
  looks: Look[];
  isLoading?: boolean;
  emptyIcon?: AppIconName;
  emptyTitle?: string;
  emptySubtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function LooksGrid({
  looks,
  isLoading,
  emptyIcon = 'images',
  emptyTitle = 'No looks yet',
  emptySubtitle,
  actionLabel,
  onAction,
}: LooksGridProps) {
  if (isLoading) return <LooksGridSkeleton />;
  if (looks.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        subtitle={emptySubtitle}
        actionLabel={actionLabel}
        onAction={onAction}
        compact
      />
    );
  }
  return (
    <div className="grid grid-cols-3 gap-1.5 px-4 sm:grid-cols-4 sm:gap-2 sm:px-6 lg:grid-cols-5">
      {looks.map((look, i) => (
        <LookTile key={look.id} look={look} priority={i < 5} />
      ))}
    </div>
  );
}
