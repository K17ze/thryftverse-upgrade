'use client';

/**
 * ClosetGrid — dense fixed-column listing grid matching the mobile
 * ClosetScreen feel: uniform 3:4 media, price + brand meta only.
 * Media is the color; metadata stays inside the mobile budget.
 * Hover-capable devices get an inspect overlay — the item's real like
 * count and price over a quiet scrim, revealed on hover and on keyboard
 * focus; sold tiles keep the sold treatment instead.
 */

import Link from 'next/link';
import type { Listing } from '@/lib/contracts/domain';
import { AppImage } from '@/components/ui/AppImage';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useStore } from '@/lib/store/useStore';
import { formatCount, formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';

export function ClosetTile({ item, priority }: { item: Listing; priority?: boolean }) {
  const cover = getListingCoverUri(item.images);
  return (
    <Link
      href={`/item/${item.id}`}
      className="group block"
      aria-label={`${item.brand ? `${item.brand} — ` : ''}${item.title}, ${formatPrice(item.price)}, ${formatCount(item.likes)} likes${item.isSold ? ', Sold' : ''}`}
    >
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={cover}
          alt={item.title}
          aspectRatio={0.75}
          focalPoint={getCategoryFocalPoint(item.category)}
          priority={priority}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 288px"
          className="media-zoom"
        />
        {item.isSold ? (
          <>
            <div className="absolute inset-0 bg-overlay" />
            <span className="absolute inset-0 flex items-center justify-center text-meta font-bold uppercase tracking-[1.2px] text-scrim-text-primary">
              Sold
            </span>
          </>
        ) : (
          /* Inspect overlay — hover/focus only, hover-capable devices. */
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-overlay opacity-0 transition-opacity [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
            aria-hidden
          >
            <span className="flex items-center gap-1.5 text-scrim-text-primary">
              <Icon name="heart" filled size={15} />
              <span className="tnum text-body-emphasis font-semibold">
                {formatCount(item.likes)}
              </span>
            </span>
            <span className="tnum text-caption font-semibold text-scrim-text-primary">
              {formatPrice(item.price)}
            </span>
          </div>
        )}
      </div>
      <div className="px-0.5 pt-1.5">
        <p className="tnum text-caption font-bold text-text-primary">{formatPrice(item.price)}</p>
        {item.brand ? (
          <p className="clamp-1 text-meta text-text-secondary">{item.brand}</p>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * SavedTile — a grid tile with an unsave affordance for the saved
 * surfaces. Composes ClosetTile; the control is a sibling of the tile's
 * Link, never nested inside it. 44px hit target, bare glyph on media.
 */
function SavedTile({
  item,
  kind,
  priority,
}: {
  item: Listing;
  kind: 'saved' | 'favourites';
  priority?: boolean;
}) {
  const toggleSaved = useStore((s) => s.toggleSaved);
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const { show } = useToast();

  const remove = () => {
    if (kind === 'saved') {
      toggleSaved(item.id);
      show('Removed from saved', 'info');
    } else {
      toggleWishlist(item.id);
      show('Removed from favourites', 'info');
    }
  };

  return (
    <div className="group relative">
      <ClosetTile item={item} priority={priority} />
      <button
        type="button"
        onClick={remove}
        aria-label={`Remove ${item.title} from ${kind === 'saved' ? 'saved items' : 'favourites'}`}
        className="pressable absolute right-0 top-0 flex h-11 w-11 items-center justify-center transition-opacity [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:opacity-0"
      >
        <Icon
          name={kind === 'saved' ? 'bookmark' : 'heart'}
          filled
          size={18}
          className="text-scrim-text-primary drop-scrim"
        />
      </button>
    </div>
  );
}

export function ClosetGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-4"
      aria-busy
      aria-label="Loading items"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <Skeleton className="w-full rounded-lg" style={{ aspectRatio: '0.75' }} />
          <Skeleton className="mx-0.5 mt-1.5 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

interface ClosetGridProps {
  items: Listing[];
  isLoading?: boolean;
  emptyIcon?: AppIconName;
  emptyTitle?: string;
  emptySubtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Render tiles with an unsave affordance — bookmark or heart. */
  unsave?: 'saved' | 'favourites';
}

export function ClosetGrid({
  items,
  isLoading,
  emptyIcon = 'bag',
  emptyTitle = 'Nothing here yet',
  emptySubtitle,
  actionLabel,
  onAction,
  unsave,
}: ClosetGridProps) {
  if (isLoading) return <ClosetGridSkeleton />;
  if (items.length === 0) {
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
    <div className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-4">
      {items.map((item, i) =>
        unsave ? (
          <SavedTile key={item.id} item={item} kind={unsave} priority={i < 4} />
        ) : (
          <ClosetTile key={item.id} item={item} priority={i < 4} />
        ),
      )}
    </div>
  );
}
