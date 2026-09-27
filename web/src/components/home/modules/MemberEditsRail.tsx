'use client';

/**
 * MemberEditsRail — "Member edits" module band. Public collections
 * authored by members, rendered as BoardCard collage tiles on the shared
 * rail. Cards deep-link to real /collection/[id] routes; the section
 * links through to the /collections hub. Vinted's "shop the edit" beat —
 * the quiet, human break between product density.
 */

import { PROFILE_COLLECTIONS } from '@/components/profile/fixtures';
import { listingById, userById } from '@/lib/data/fixtures';
import { getListingCoverUri } from '@/lib/utils/media';
import { BoardCard } from '@/components/profile/BoardGrid';
import { ModuleSection } from './ModuleSection';
import { Rail } from './Rail';

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
  if (MEMBER_EDITS.length === 0) return null;
  return (
    <ModuleSection title="Member edits" href="/collections">
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
