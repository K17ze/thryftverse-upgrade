'use client';

/**
 * RelatedLooks — the "More to explore" rail at the foot of look detail.
 * Port of mobile useRelatedLooks semantics: the feed is ranked (creator
 * affinity → shared categories → engagement) and paged; web renders the
 * ranked set as a masonry with a Load more affordance when the pool
 * outgrows the first page.
 *
 * Fixture mode resolves the seeded looks through the deterministic
 * local ranker; live mode fetches the look list and ranks client-side
 * (the server's related endpoint mirrors useRelatedLooks' ordering).
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MasonryGrid } from '@/components/feed/MasonryGrid';
import { Skeleton } from '@/components/ui/Skeleton';
import { DATA_MODE } from '@/lib/api/client';
import * as socialService from '@/lib/api/services/social';
import { fetchSellerSummary } from '@/lib/api/services/users';
import type { DiscoveryFeedUnit, Look } from '@/lib/contracts/domain';
import { listingById, userById } from '@/lib/data/fixtures';
import { relatedLooksFor } from '@/lib/data/fixtures-content';

const tick = (ms = 240) => new Promise((r) => setTimeout(r, ms));
const PAGE = 6;

/** Same ranker as fixtures-content.relatedLooksFor, generalized to take
 *  the candidate pool — live rows share the Look contract. Category
 *  affinity only contributes where the catalogue knows the item (fixture
 *  mode); live ranking falls back to creator affinity + engagement rather
 *  than inventing category matches. */
function rankRelated(all: Look[], source: Look, sourceCats: Set<string>): Look[] {
  return all
    .filter((l) => l.id !== source.id)
    .map((l) => {
      const shared = l.itemIds.reduce(
        (n, id) => n + (sourceCats.has(listingById(id)?.category ?? '') ? 1 : 0),
        0,
      );
      return {
        look: l,
        score:
          (l.creatorId === source.creatorId ? 3 : 0) +
          shared +
          (l.likeCount ?? 0) / 1000,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((r) => r.look);
}

function useRelatedLooks(look: Look) {
  return useQuery<Look[]>({
    queryKey: ['related-looks', look.id, DATA_MODE],
    queryFn: async () => {
      if (DATA_MODE === 'live') {
        const all = await socialService.fetchLooks();
        // Live item ids aren't in the fixture catalogue — the category
        // signal stays empty instead of matching ghost categories.
        return rankRelated(all, look, new Set()).slice(0, 12);
      }
      await tick();
      // The fixture ranker owns the seeded ordering — no re-rank.
      return relatedLooksFor(look.id, 12);
    },
  });
}

/** Live creator identities for the rail's cards — GET /sellers/:id per
 *  unique creator. Fixture mode reads the catalogue instead. */
function useCreatorProfiles(creatorIds: string[]) {
  const idsKey = useMemo(() => [...new Set(creatorIds)].join('\n'), [creatorIds]);
  return useQuery({
    queryKey: ['look-creators', idsKey],
    enabled: DATA_MODE === 'live' && idsKey.length > 0,
    queryFn: async () => {
      const ids = idsKey.split('\n');
      const results = await Promise.allSettled(
        ids.map((id) => fetchSellerSummary(id)),
      );
      const map: Record<string, { username: string | null; avatar: string | null }> = {};
      results.forEach((r, i) => {
        const s = r.status === 'fulfilled' ? r.value : null;
        if (s) map[ids[i]] = { username: s.username, avatar: s.avatar };
      });
      return map;
    },
  });
}

function toUnit(
  look: Look,
  creator?: { username: string | null; avatar: string | null },
): DiscoveryFeedUnit {
  return {
    type: 'look',
    id: `rel-${look.id}`,
    lookId: look.id,
    coverImageUri: look.coverImageUri,
    coverAspectRatio: look.coverAspectRatio,
    creatorUsername: creator?.username,
    creatorAvatarUri: creator?.avatar,
    itemCount: look.itemIds.length,
  };
}

export function RelatedLooks({ look }: { look: Look }) {
  const { data, isLoading, isError, refetch } = useRelatedLooks(look);
  const [shown, setShown] = useState(PAGE);

  const shownLooks = useMemo(() => (data ?? []).slice(0, shown), [data, shown]);
  const creators = useCreatorProfiles(shownLooks.map((l) => l.creatorId));

  const units = useMemo(
    () =>
      shownLooks.map((l) =>
        toUnit(
          l,
          DATA_MODE === 'live'
            ? creators.data?.[l.creatorId]
            : (() => {
                const u = userById(l.creatorId);
                return u ? { username: u.username, avatar: u.avatar } : undefined;
              })(),
        ),
      ),
    [shownLooks, creators.data],
  );
  const total = data?.length ?? 0;

  return (
    <section aria-label="More to explore" className="mt-10">
      <h2 className="mb-4 text-section-title font-semibold text-text-primary">
        More to explore
      </h2>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <MasonryGrid
            units={units}
            columns={3}
            isError={isError}
            onRetry={() => void refetch()}
            emptyTitle="No related looks yet"
            emptySubtitle="More looks from the community will land here."
          />
          {total > shown ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="pressable h-10 rounded-full bg-surface-alt px-5 text-body-emphasis font-medium text-text-primary hover:bg-surface-raised"
              >
                Show more
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
