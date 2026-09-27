/**
 * Social fixtures — look comments. Mirrors the backend look_comments row
 * shape the social service maps (author resolved to a fixture user).
 * Session-posted comments land in SESSION_LOOK_COMMENTS so they persist
 * for the demo session without touching the seeded truth.
 */

import { userById } from '@/lib/data/fixtures';
import type { LookComment } from '@/lib/api/services/social';

function comment(
  id: string,
  lookId: string,
  authorId: string,
  body: string,
  createdAt: string,
  likeCount = 0,
): LookComment {
  const author = userById(authorId);
  return {
    id,
    lookId,
    authorId,
    parentId: null,
    author: {
      id: authorId,
      username: author?.username ?? null,
      avatar: author?.avatar ?? null,
      verified: author?.isVerified === true,
    },
    body,
    deleted: false,
    likeCount,
    likedByViewer: false,
    replyCount: 0,
    createdAt,
  };
}

export const LOOK_COMMENTS: Record<string, LookComment[]> = {
  'look-1': [
    comment('lc-1', 'look-1', 'u1', 'The knit over the slip is exactly right.', '2026-09-21T09:40:00Z', 12),
    comment('lc-2', 'look-1', 'u6', 'Would wear this head to toe.', '2026-09-21T18:02:00Z', 4),
  ],
  'look-2': [
    comment('lc-3', 'look-2', 'u5', 'Dunks with tailoring never misses.', '2026-09-20T11:15:00Z', 8),
  ],
};

/** Session-scoped comments the viewer posted (fixture mode). */
const SESSION_LOOK_COMMENTS: Record<string, LookComment[]> = {};

export function lookCommentsFor(lookId: string): LookComment[] {
  return [
    ...(LOOK_COMMENTS[lookId] ?? []),
    ...(SESSION_LOOK_COMMENTS[lookId] ?? []),
  ];
}

export function lookCommentCount(lookId: string): number {
  return lookCommentsFor(lookId).filter((c) => !c.deleted).length;
}

export function addLookComment(lookId: string, authorId: string, body: string): LookComment {
  const created = comment(
    `lc-local-${Date.now().toString(36)}`,
    lookId,
    authorId,
    body,
    new Date().toISOString(),
  );
  SESSION_LOOK_COMMENTS[lookId] = [...(SESSION_LOOK_COMMENTS[lookId] ?? []), created];
  return created;
}

export function removeLookComment(lookId: string, commentId: string): void {
  const session = SESSION_LOOK_COMMENTS[lookId];
  if (session) {
    SESSION_LOOK_COMMENTS[lookId] = session.filter((c) => c.id !== commentId);
  }
}
