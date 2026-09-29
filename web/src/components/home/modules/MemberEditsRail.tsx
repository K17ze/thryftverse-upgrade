'use client';

/**
 * MemberEditsRail — "Member edits" module band. Public member-authored
 * boards rendered as BoardCard collage tiles on the shared rail.
 *
 * Fixture mode: PROFILE_COLLECTIONS (curated member collections) →
 * /collection/[id]. Live mode: GET /moodboards public discovery boards →
 * /moodboard/[id] — collections on this stack are owner-scoped
 * (GET /collections returns only the caller's own boards), so the
 * public-board surface the backend actually serves is moodboards. An
 * empty public board list omits the band entirely.
 */

import { PROFILE_COLLECTIONS } from '@/components/profile/fixtures';
import { listingById, userById } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { useMemberEdits } from '@/lib/hooks/home-modules';
import { getListingCoverUri } from '@/lib/utils/media';
import { BoardCard } from '@/components/profile/BoardGrid';
import { ModuleSection } from './ModuleSection';
import { Rail } from './Rail';

const LIVE = DATA_MODE === 'live';

// Public member-authored collections only — private boards and the
// viewer's own boards stay on the profile surface.
const MEMBER_EDITS = PROFILE_COLLECTIONS.filter(
  (b) => b.kind === 'collection' && !b.isPrivate && b.ownerId !== 'me',
);

function boardThumbs(itemIds: string[]): string[] {
  return itemIds
    .map(listingById)
    .filter((l): l is NonNullable<typeof l> => l != null)
    .map((l) => getListingCoverUri(l.images))
    .filter(Boolean)
    .slice(0, 4);
}

export function MemberEditsRail() {
  const live = useMemberEdits();
  if (LIVE) {
    // Still loading or nothing public → omit the band (no grey slots).
    if (live.boards.length === 0) return null;
    return (
      <ModuleSection title="Member edits" href="/moodboards" moduleId="member-edits">
        <Rail label="Member edits">
          {live.boards.map((board) => (
            <div
              key={board.id}
              role="listitem"
              className="w-[160px] shrink-0 snap-start sm:w-[180px]"
            >
              <BoardCard
                href={`/moodboard/${board.id}`}
                title={board.title}
                thumbs={
                  board.thumbs && board.thumbs.length > 0
                    ? board.thumbs
                    : board.coverUri
                      ? [board.coverUri]
                      : []
                }
                count={board.itemCount ?? board.thumbs?.length ?? 0}
                ownerName={board.curator ?? undefined}
              />
            </div>
          ))}
        </Rail>
      </ModuleSection>
    );
  }

  if (MEMBER_EDITS.length === 0) return null;
  return (
    <ModuleSection title="Member edits" href="/collections" moduleId="member-edits">
      <Rail label="Member edits">
        {MEMBER_EDITS.map((board) => {
          const owner = userById(board.ownerId);
          return (
            <div
              key={board.id}
              role="listitem"
              className="w-[160px] shrink-0 snap-start sm:w-[180px]"
            >
              <BoardCard
                href={`/collection/${board.id}`}
                title={board.title}
                thumbs={boardThumbs(board.itemIds)}
                count={board.itemIds.length}
                ownerName={owner ? `@${owner.username}` : undefined}
              />
            </div>
          );
        })}
      </Rail>
    </ModuleSection>
  );
}
