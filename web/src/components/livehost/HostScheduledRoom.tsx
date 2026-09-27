'use client';

/**
 * HostScheduledRoom — the pre-show state for a scheduled demo stream:
 * cover, when it airs, what's pinned, and the start control. The show sits
 * in the hub's Coming up rail until the host goes live from here.
 */

import Link from 'next/link';
import { AppImage } from '@/components/ui/AppImage';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { formatScheduled } from '@/components/live/UpcomingRail';
import { listingById } from '@/lib/data/fixtures';
import { formatPrice } from '@/lib/utils/format';
import { getListingCoverUri } from '@/lib/utils/media';
import type { HostStream } from './hostStreams';

interface HostScheduledRoomProps {
  stream: HostStream;
  onGoLive: () => void;
  goingLive: boolean;
}

export function HostScheduledRoom({ stream, onGoLive, goingLive }: HostScheduledRoomProps) {
  const pinned = stream.pinIds
    .map((id) => listingById(id))
    .filter((l): l is NonNullable<typeof l> => l != null);

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-16 pt-4 sm:px-6">
      <div className="flex items-center gap-2">
        <Link
          href="/live"
          aria-label="Back to live hub"
          className="pressable -ml-2 flex h-11 w-11 items-center justify-center rounded-full text-text-primary hover:bg-brand-subtle"
        >
          <Icon name="back" size={22} />
        </Link>
        <h1 className="clamp-1 min-w-0 flex-1 text-section-title font-semibold text-text-primary">
          {stream.session.title}
        </h1>
        <span className="shrink-0 rounded-md bg-surface-alt px-2 py-1 text-meta font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Scheduled
        </span>
      </div>

      <div className="relative mt-5 aspect-[16/10] w-full overflow-hidden rounded-xl bg-surface-alt">
        <AppImage
          src={stream.session.coverUri}
          alt={stream.session.title}
          fill
          priority
          className="h-full w-full"
          sizes="560px"
        />
        {stream.session.scheduledAt ? (
          <span className="absolute left-3 top-3 rounded-md bg-overlay px-2 py-1 text-meta font-semibold text-scrim-text-primary">
            {formatScheduled(stream.session.scheduledAt)}
          </span>
        ) : null}
      </div>

      {pinned.length > 0 ? (
        <div className="mt-5">
          <h2 className="text-label font-semibold uppercase tracking-wide text-text-secondary">
            Pinned products · {pinned.length}
          </h2>
          <div className="mt-2">
            {pinned.map((listing, i) => (
              <div
                key={listing.id}
                className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-b-0"
              >
                <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-surface-alt">
                  <AppImage
                    src={getListingCoverUri(listing.images)}
                    alt={listing.title}
                    fill
                    sizes="44px"
                    className="h-full w-full"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="clamp-1 block text-body font-medium text-text-primary">
                    {listing.title}
                  </span>
                  <span className="tnum mt-0.5 block text-meta text-text-muted">
                    {formatPrice(listing.price)}
                  </span>
                </span>
                <span className="tnum text-meta text-text-muted">#{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-5 text-meta text-text-muted">
        Your show sits under Coming up on the live hub until you start — demo mode, nothing is broadcast.
      </p>

      <Button
        variant="danger"
        size="lg"
        fullWidth
        onClick={onGoLive}
        disabled={goingLive}
        className="mt-4"
      >
        {goingLive ? 'Going live…' : 'Go live now'}
      </Button>
    </div>
  );
}
