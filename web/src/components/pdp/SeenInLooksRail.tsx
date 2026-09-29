'use client';

/**
 * SeenInLooksRail — community-styled looks featuring this item.
 * Membership is derived from each look's own itemIds (single source of
 * truth) — the rail renders nothing when no look references the listing.
 * Cards route to /look/[id]. Same no-scrollbar snap grammar as ListingRail.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { Listing, Look } from '@/lib/contracts/domain';
import { LOOKS, userById } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { fetchLooks, type LookWithCounts } from '@/lib/api/services/social';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';

const LIVE = DATA_MODE === 'live';

interface SeenInLooksRailProps {
  listing: Listing;
}

function LookCard({ look }: { look: Look | LookWithCounts }) {
  // Live rows carry the backend's creator summary; fixtures resolve
  // through USERS.
  const creatorName = LIVE
    ? ((look as LookWithCounts).creator?.username ?? null)
    : (userById(look.creatorId)?.username ?? null);
  return (
    <Link
      href={`/look/${look.id}`}
      role="listitem"
      aria-label={look.title ? `Look: ${look.title}` : 'Look'}
      className="pressable block w-[150px] shrink-0 snap-start sm:w-[170px]"
    >
      <AppImage
        src={look.coverImageUri}
        alt={look.title ?? `Look by @${creatorName ?? 'creator'}`}
        aspectRatio={0.8}
        focalPoint={{ x: 0.5, y: 0.35 }}
        className="w-full rounded-lg"
        sizes="170px"
      />
      {look.title ? (
        <p className="clamp-1 mt-1.5 text-caption font-medium text-text-primary">
          {look.title}
        </p>
      ) : null}
      {creatorName ? (
        <p className="clamp-1 mt-0.5 text-meta text-text-muted">@{creatorName}</p>
      ) : null}
    </Link>
  );
}

export function SeenInLooksRail({ listing }: SeenInLooksRailProps) {
  // Live: fetch recent looks and keep only those whose tags include this
  // listing — the backend tags carry listingId, so membership stays
  // server-derived. An empty result hides the rail honestly.
  const looksQuery = useQuery({
    queryKey: ['pdp', 'seen-in-looks', listing.id],
    queryFn: async ({ signal }) => {
      const rows = await fetchLooks({ sort: 'foryou', limit: 50 }, signal);
      return rows.filter((l) => l.itemIds.includes(listing.id));
    },
    enabled: LIVE,
    staleTime: 5 * 60_000,
  });

  const looks = LIVE
    ? (looksQuery.data ?? [])
    : LOOKS.filter((l) => l.itemIds.includes(listing.id));
  if (looks.length === 0) return null;

  return (
    <section className="border-t border-border-subtle py-6" aria-labelledby="pdp-seen-in-looks">
      <div className="flex items-center gap-1.5 px-4 sm:px-6">
        <Icon name="eye" size={16} className="text-text-muted" />
        <h2
          id="pdp-seen-in-looks"
          className="text-section-title font-semibold text-text-primary"
        >
          Seen in Looks
        </h2>
      </div>
      <p className="mb-3 mt-0.5 px-4 text-meta text-text-muted sm:px-6">
        Styled by the community
      </p>
      <div
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 sm:px-6"
        role="list"
        aria-label="Looks featuring this item"
      >
        {looks.map((look) => (
          <LookCard key={look.id} look={look} />
        ))}
      </div>
    </section>
  );
}
