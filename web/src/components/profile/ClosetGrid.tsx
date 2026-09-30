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
import { SoldOverlay } from '@/components/ui/SoldOverlay';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { focusAdjacentGroupControl } from '@/lib/a11y/focus';
import { useStore } from '@/lib/store/useStore';
import { formatCount, formatPrice } from '@/lib/utils/format';
import { getCategoryFocalPoint, getListingCoverUri } from '@/lib/utils/media';
import { listingHasPriceDrop, priceDropPercent } from '@/components/closet/closetFilters';

export function ClosetTile({ item, priority }: { item: Listing; priority?: boolean }) {
  const cover = getListingCoverUri(item.images);
  const hasPriceDrop = listingHasPriceDrop(item);
  return (
    <Link
      href={`/item/${item.id}`}
      className="group block"
      aria-label={`${item.brand ? `${item.brand} — ` : ''}${item.title}, ${formatPrice(item.price)}${hasPriceDrop ? `, was ${formatPrice(item.originalPrice!)}` : ''}, ${formatCount(item.likes)} likes${item.isSold ? ', Sold' : ''}`}
    >
      <div className="relative overflow-hidden rounded-lg bg-surface-alt">
        <AppImage
          src={cover}
          alt={item.title}
          aspectRatio={0.75}
          focalPoint={getCategoryFocalPoint(item.category)}
          priority={priority}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, (max-width: 1280px) 19vw, 185px"
          className="media-zoom"
        />
        {/* Price drop — the contract's originalPrice is the only honest
            signal (mobile ClosetMediaMosaic badge parity). Sold tiles keep
            the sold treatment instead. */}
        {hasPriceDrop ? (
          <span className="tnum absolute left-1.5 top-1.5 z-elevated rounded-md bg-overlay px-1.5 py-0.5 text-meta font-semibold text-scrim-text-primary">
            −{priceDropPercent(item)}%
          </span>
        ) : null}
        {item.isSold ? (
          <SoldOverlay size="sm" />
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
        {item.brand || item.size ? (
          <p className="clamp-1 text-meta text-text-secondary">
            {item.brand ? <span>{item.brand}</span> : null}
            {item.brand && item.size ? <span> · </span> : null}
            {item.size ? <span>{item.size}</span> : null}
          </p>
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
  onFile,
}: {
  item: Listing;
  kind: 'saved' | 'favourites';
  priority?: boolean;
  /** File-to-board affordance (mobile's hold-to-file picker). */
  onFile?: (item: Listing) => void;
}) {
  const toggleSaved = useStore((s) => s.toggleSaved);
  const toggleWishlist = useStore((s) => s.toggleWishlist);
  const { show } = useToast();

  const remove = (e: React.MouseEvent<HTMLButtonElement>) => {
    // The store write unmounts this tile while the button may hold focus —
    // park focus on a sibling tile's link first so it isn't stranded on a
    // detached node (drops to <body>, keyboard place lost).
    if (
      !focusAdjacentGroupControl(e.currentTarget, '[data-saved-tile]', 'a')
    ) {
      // Last tile in the grid — land on the page landmark rather than
      // letting focus drop to <body>.
      document.getElementById('main-content')?.focus({ preventScroll: true });
    }
    const label = kind === 'saved' ? 'saved' : 'favourites';
    const write = kind === 'saved' ? toggleSaved : toggleWishlist;
    // Remove stays optimistic (the tile unmounts); if the write fails the
    // item returns to the list and the toast says the sync didn't land.
    void write(item.id).then((ok) => {
      show(
        ok ? `Removed from ${label}` : 'Couldn’t sync — the item is still here',
        ok ? 'info' : 'error',
      );
    });
  };

  /* top-N is per-button — the file affordance slides below the price-drop
     chip when a discounted item carries both. */
  const cornerAction =
    'pressable absolute flex h-11 w-11 items-center justify-center transition-opacity [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:opacity-0';

  return (
    <div className="group relative" data-saved-tile>
      <ClosetTile item={item} priority={priority} />
      {onFile ? (
        <button
          type="button"
          onClick={() => onFile(item)}
          aria-label={`File ${item.title} to a board`}
          /* Drop chip owns the top-left corner on discounted items — the
             file affordance slides below it rather than overlapping. */
          className={`${cornerAction} ${listingHasPriceDrop(item) ? 'top-9' : 'top-0'} left-0`}
        >
          <Icon name="layers" size={18} className="text-scrim-text-primary drop-scrim" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={remove}
        aria-label={`Remove ${item.title} from ${kind === 'saved' ? 'saved items' : 'favourites'}`}
        className={`${cornerAction} right-0 top-0`}
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
      className="grid grid-cols-2 gap-[max(4px,var(--density-row-gap))] px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-5 xl:grid-cols-6"
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
  /** File-to-board affordance on unsave tiles (mobile's hold-to-file). */
  onFileItem?: (item: Listing) => void;
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
  onFileItem,
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
    // Tile gutter tracks the density preference — 4px floor so compact
    // never welds media together.
    <div className="grid grid-cols-2 gap-[max(4px,var(--density-row-gap))] px-4 sm:grid-cols-3 sm:px-6 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item) =>
        unsave ? (
          <SavedTile
            key={item.id}
            item={item}
            kind={unsave}
            onFile={onFileItem}
          />
        ) : (
          <ClosetTile key={item.id} item={item} />
        ),
      )}
    </div>
  );
}
