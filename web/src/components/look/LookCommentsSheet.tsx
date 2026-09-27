'use client';

/**
 * LookCommentsSheet — the comments surface for a look. Threads the real
 * look-comments contract: live mode reads/writes
 * GET|POST|DELETE /looks/:id/comments; fixture mode resolves the seeded
 * look_comments rows plus the member's session posts. Likes write
 * POST/DELETE .../comments/:id/like live; in fixture mode they toggle
 * locally for the session.
 *
 * Reads are open; composing is member-only — guests see a quiet sign-in
 * hint, never a dead input. Tombstoned comments keep their thread slot.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { DATA_MODE } from '@/lib/api/client';
import * as socialService from '@/lib/api/services/social';
import type { LookComment } from '@/lib/api/services/social';
import {
  addLookComment,
  lookCommentsFor,
  removeLookComment,
} from '@/lib/fixtures-social';
import { useSession } from '@/lib/session/SessionProvider';
import { formatCount, timeAgo } from '@/lib/utils/format';

const tick = (ms = 260) => new Promise((r) => setTimeout(r, ms));

const COMMENTS_KEY = (lookId: string) => ['look-comments', lookId, DATA_MODE] as const;

function useLookComments(lookId: string) {
  return useQuery<LookComment[]>({
    queryKey: COMMENTS_KEY(lookId),
    queryFn: async () => {
      if (DATA_MODE === 'live') return socialService.fetchLookComments(lookId);
      await tick();
      return lookCommentsFor(lookId);
    },
  });
}

interface LookCommentsSheetProps {
  lookId: string;
  open: boolean;
  onClose: () => void;
}

export function LookCommentsSheet({ lookId, open, onClose }: LookCommentsSheetProps) {
  const { show } = useToast();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const { data: comments, isLoading } = useLookComments(lookId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  // Session-local like state for fixture comments (no demo write edge).
  const [likedIds, setLikedIds] = useState<ReadonlySet<string>>(new Set());

  const rows = comments ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: COMMENTS_KEY(lookId) });

  const post = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      if (DATA_MODE === 'live') {
        await socialService.createLookComment(lookId, body);
      } else {
        addLookComment(lookId, user?.id ?? 'me', body);
      }
      setDraft('');
      void invalidate();
    } catch {
      show('Could not post the comment', 'error');
    } finally {
      setSending(false);
    }
  };

  const toggleLike = (c: LookComment) => {
    const liked = likedIds.has(c.id) || c.likedByViewer;
    if (DATA_MODE === 'live') {
      void socialService
        .setLookCommentLiked(lookId, c.id, !c.likedByViewer)
        .then(() => invalidate())
        .catch(() => show('Could not update the like', 'error'));
      return;
    }
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (liked) next.delete(c.id);
      else next.add(c.id);
      return next;
    });
  };

  const remove = (c: LookComment) => {
    if (DATA_MODE === 'live') {
      void socialService
        .deleteLookComment(lookId, c.id)
        .then(() => invalidate())
        .catch(() => show('Could not delete the comment', 'error'));
      return;
    }
    removeLookComment(lookId, c.id);
    void invalidate();
  };

  return (
    <Sheet open={open} onClose={onClose} title="Comments" maxWidth={480}>
      <div className="flex max-h-[60dvh] flex-col">
        <div className="min-h-24 flex-1 overflow-y-auto px-5 pb-3" aria-live="polite">
          {isLoading ? (
            <div className="space-y-4 py-2" aria-busy>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3.5 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-body text-text-muted">
              No comments yet — start the conversation.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {rows.map((c) => {
                const liked = likedIds.has(c.id) || c.likedByViewer;
                const likeCount = c.likeCount + (liked && !c.likedByViewer ? 1 : 0);
                const mine = user?.id === c.authorId;
                return (
                  <li key={c.id} className="flex gap-3 py-3">
                    <Avatar
                      src={c.author.avatar}
                      name={c.author.username ?? 'member'}
                      size={34}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-meta text-text-muted">
                        <span className="font-semibold text-text-primary">
                          @{c.author.username ?? 'member'}
                        </span>
                        {c.author.verified ? (
                          <Icon
                            name="verified"
                            filled
                            size={11}
                            className="ml-1 inline text-commerce-trust"
                          />
                        ) : null}
                        {c.createdAt ? (
                          <span className="tnum"> · {timeAgo(c.createdAt)}</span>
                        ) : null}
                      </p>
                      {c.deleted ? (
                        <p className="mt-0.5 text-body italic text-text-muted">
                          This comment was removed.
                        </p>
                      ) : (
                        <p className="mt-0.5 text-body text-text-primary">{c.body}</p>
                      )}
                      <div className="mt-1 flex items-center gap-4">
                        <button
                          type="button"
                          onClick={() => toggleLike(c)}
                          aria-pressed={liked}
                          aria-label={liked ? 'Unlike comment' : 'Like comment'}
                          className="pressable flex items-center gap-1 text-meta text-text-muted hover:text-text-primary"
                        >
                          <Icon
                            name="heart"
                            size={13}
                            filled={liked}
                            className={liked ? 'text-danger-text' : undefined}
                          />
                          <span className="tnum">{formatCount(likeCount)}</span>
                        </button>
                        {mine && !c.deleted ? (
                          <button
                            type="button"
                            onClick={() => remove(c)}
                            className="pressable text-meta text-text-muted hover:text-danger-text"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Composer — members post; guests get the honest sign-in hint */}
        <div className="border-t border-border-subtle px-5 py-3">
          {user ? (
            <div className="flex items-center gap-2">
              <Avatar src={user.avatar} name={user.username} size={30} />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void post();
                  }
                }}
                placeholder="Add a comment…"
                aria-label="Add a comment"
                maxLength={500}
                className="h-10 min-w-0 flex-1 rounded-full bg-surface-alt px-4 text-body text-text-primary outline-none placeholder:text-text-muted focus:ring-1 focus:ring-brand"
              />
              <IconButton
                name="send"
                aria-label="Post comment"
                disabled={!draft.trim() || sending}
                onClick={() => void post()}
              />
            </div>
          ) : (
            <p className="py-1 text-center text-meta text-text-muted">
              Sign in to join the conversation.
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
