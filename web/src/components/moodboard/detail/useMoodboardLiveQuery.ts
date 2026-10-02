import { useQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as socialService from '@/lib/api/services/social';
import * as listingsService from '@/lib/api/services/listings';
import type { Listing } from '@/lib/contracts/domain';
import type { MoodboardItemPosition } from '@/lib/data/fixtures-content';

export interface LiveMoodboardData {
  board: {
    id: string;
    ownerId: string;
    title: string;
    itemIds: string[];
    isPrivate: boolean;
    coverUri?: string | null;
    createdAt?: string;
    themeId: string | null;
    viewerRole: string | null;
  };
  items: Listing[];
  rowIdByListing: Record<string, string>;
  positions: Record<string, MoodboardItemPosition>;
}

export function useMoodboardLiveQuery(id: string) {
  return useQuery<LiveMoodboardData | null>({
    queryKey: ['moodboard', id, 'live'],
    queryFn: async (): Promise<LiveMoodboardData | null> => {
      const wire = await socialService.fetchMoodboard(id);
      if (!wire) return null;
      const shoppableIds = [...new Set(wire.items.map((i) => i.listingId).filter(Boolean))];
      const hydratedItems = await Promise.all(
        shoppableIds.map((listingId) =>
          listingsService.fetchListingById(listingId).catch(() => null),
        ),
      );
      const items = hydratedItems.filter(
        (l): l is Listing => l != null,
      );
      const rowIdByListing: Record<string, string> = {};
      const positions: Record<string, MoodboardItemPosition> = {};
      for (const item of wire.items) {
        if (!item.listingId) continue;
        if (item.id) rowIdByListing[item.listingId] = item.id;
        if (item.position) positions[item.listingId] = item.position;
      }
      return {
        board: {
          id: wire.id,
          ownerId: wire.creatorId,
          title: wire.title,
          itemIds: items.map((l) => l.id),
          isPrivate: !wire.isPublic,
          coverUri: wire.coverImage,
          createdAt: wire.createdAt,
          themeId: wire.theme,
          viewerRole: wire.viewerRole,
        },
        items,
        rowIdByListing,
        positions,
      };
    },
    enabled: DATA_MODE === 'live' && !!id,
  });
}
