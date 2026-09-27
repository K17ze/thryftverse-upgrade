'use client';

/**
 * useProfileHighlights — story highlights for a profile rail. Live mode
 * reads GET /users/:id/poster-highlights; fixture mode resolves the
 * identity-dept PROFILE_HIGHLIGHTS map plus the member's session-created
 * highlights (posterArchive store), matching the archive surface.
 */

import { useQuery } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as socialService from '@/lib/api/services/social';
import { PROFILE_HIGHLIGHTS } from './fixtures';
import { usePosterArchive } from '@/lib/store/posterArchive';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import type { PosterHighlight } from '@/lib/data/fixtures-posters';

export interface ProfileHighlightItem {
  id: string;
  title: string;
  coverUri: string;
  /** Frame count — drives the multi-frame badge (native badges frames>1). */
  frameCount: number;
}

const tick = (ms = 280) => new Promise((r) => setTimeout(r, ms));

export function useProfileHighlights(ownerId: string): {
  highlights: ProfileHighlightItem[];
  isLoading: boolean;
} {
  const hydrated = useHydrated();
  const { user } = useSession();
  const createdHighlights = usePosterArchive((s) => s.highlights);

  const { data, isLoading } = useQuery<ProfileHighlightItem[]>({
    queryKey: ['poster-highlights', ownerId, DATA_MODE, hydrated],
    enabled: !!ownerId,
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        const items = await socialService.fetchPosterHighlights(ownerId);
        return items.map((h) => ({
          id: h.id,
          title: h.title,
          coverUri: h.coverUri,
          frameCount: h.frames.length,
        }));
      }
      await tick();
      const seeded: PosterHighlight[] = PROFILE_HIGHLIGHTS[ownerId] ?? [];
      const created =
        ownerId === (user?.id ?? 'me') && hydrated ? createdHighlights : [];
      return [...created, ...seeded].map((h) => ({
        id: h.id,
        title: h.title,
        coverUri: h.coverUri,
        frameCount: h.frames.length,
      }));
    },
  });

  return { highlights: data ?? [], isLoading };
}
