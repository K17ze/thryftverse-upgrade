'use client';

/**
 * MoodboardCommentsSheet — port of the mobile MoodboardCommentsSheet.
 * Threads the seeded fixture comments plus the member's session posts via
 * the moodboardCollab overlay (no live moodboard-comments contract exists
 * on web yet — same honest-overlay posture as the other board surfaces).
 *
 * Comments can anchor to a canvas item (itemId) or the board itself; the
 * owner can resolve/unresolve and delete. Guests read but can't post.
 */

import { useMemo, useState } from 'react';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import {
  MOODBOARD_COMMENTS,
  usernameById,
  type MoodboardCommentRow,
} from '@/lib/data/fixtures-content';
import { listingById, USERS } from '@/lib/data/fixtures';
import { useSession } from '@/lib/session/SessionProvider';
import { useMoodboardCollab } from '@/lib/store/moodboardCollab';
import { useHydrated } from '@/lib/store/useStore';
import { timeAgo } from '@/lib/utils/format';

interface MoodboardCommentsSheetProps {
  boardId: string;
  open: boolean;
  onClose: () => void;
  /** When set, the composer anchors new comments to this canvas item and
   *  the list filters to that thread — opened from a canvas selection. */
  anchorItemId?: string | null;
  isOwner?: boolean;
}

export function MoodboardCommentsSheet({
  boardId,
  open,
  onClose,
  anchorItemId,
  isOwner = false,
}: MoodboardCommentsSheetProps) {
  const { show } = useToast();
  const { user } = useSession();
  const hydrated = useHydrated();
  const collab = useMoodboardCollab((s) => s.boards[boardId]);
  const addComment = useMoodboardCollab((s) => s.addComment);
  const setResolved = useMoodboardCollab((s) => s.setCommentResolved);
  const removeComment = useMoodboardCollab((s) => s.removeComment);
  const [draft, setDraft] = useState('');

  const rows = useMemo<MoodboardCommentRow[]>(() => {
    const overlay = hydrated ? collab : undefined;
    const merged = [
      ...MOODBOARD_COMMENTS.filter((c) => c.boardId === boardId),
      ...(overlay?.addedComments ?? []),
    ]
      .filter((c) => !overlay?.removedCommentIds.includes(c.id))
      .map((c) =>
        c.id in (overlay?.resolved ?? {})
          ? { ...c, resolved: overlay!.resolved[c.id] }
          : c,
      );
    merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return anchorItemId
      ? merged.filter((c) => c.itemId === anchorItemId)
      : merged;
  }, [boardId, collab, hydrated, anchorItemId]);

  const anchor = anchorItemId ? listingById(anchorItemId) : null;

  const post = () => {
    const body = draft.trim();
    if (!body) return;
    addComment(boardId, {
      id: `mbc-local-${Date.now()}`,
      authorId: user?.id ?? 'me',
      itemId: anchorItemId ?? null,
      body,
      resolved: false,
      createdAt: new Date().toISOString(),
    });
    setDraft('');
    show('Comment added', 'success');
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={anchor ? 'Item comments' : 'Comments'}
      maxWidth={480}
    >
      <div className="flex max-h-[60dvh] flex-col">
        {anchor ? (
          <div className="mx-5 mb-2 flex items-center gap-2.5 rounded-lg bg-surface-alt p-2.5">
            <span className="h-9 w-9 overflow-hidden rounded-md">
              {/* Anchor context — the tile the thread hangs on. */}
              <AnchorThumb listingId={anchor.id} label={anchor.title} />
            </span>
            <p className="clamp-1 text-meta font-medium text-text-secondary">
              {anchor.title}
            </p>
          </div>
        ) : null}

        <div className="min-h-24 flex-1 overflow-y-auto px-5 pb-3" aria-live="polite">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-body text-text-muted">
              {anchor
                ? 'No notes on this piece yet.'
                : 'No comments yet — start the conversation.'}
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {rows.map((c) => {
                const author = USERS.find((u) => u.id === c.authorId);
                const mine = user?.id === c.authorId;
                const canDelete = mine || isOwner;
                const itemTitle = c.itemId ? listingById(c.itemId)?.title : null;
                return (
                  <li key={c.id} className="flex gap-3 py-3">
                    <Avatar
                      src={author?.avatar}
                      name={author?.username ?? usernameById(c.authorId)}
                      size={34}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-meta text-text-muted">
                        <span className="font-semibold text-text-primary">
                          @{author?.username ?? usernameById(c.authorId)}
                        </span>
                        <span className="tnum"> · {timeAgo(c.createdAt)}</span>
                        {itemTitle && !anchor ? (
                          <span className="text-text-muted"> · on {itemTitle}</span>
                        ) : null}
                      </p>
                      <p
                        className={`mt-0.5 text-body ${
                          c.resolved ? 'text-text-muted line-through' : 'text-text-primary'
                        }`}
                      >
                        {c.body}
                      </p>
                      <div className="mt-1 flex items-center gap-4">
                        {isOwner ? (
                          <button
                            type="button"
                            onClick={() => setResolved(boardId, c.id, !c.resolved)}
                            aria-pressed={c.resolved}
                            className="pressable flex items-center gap-1 text-meta text-text-muted hover:text-text-primary"
                          >
                            <Icon
                              name={c.resolved ? 'refresh' : 'check'}
                              size={13}
                            />
                            {c.resolved ? 'Reopen' : 'Resolve'}
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            type="button"
                            onClick={() => removeComment(boardId, c.id)}
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
                    post();
                  }
                }}
                placeholder={anchor ? 'Note on this piece…' : 'Add a comment…'}
                aria-label={anchor ? 'Add a comment about this item' : 'Add a comment'}
                maxLength={500}
                className="h-10 min-w-0 flex-1 rounded-full bg-surface-alt px-4 text-body text-text-primary outline-none placeholder:text-text-muted focus:ring-1 focus:ring-brand"
              />
              <IconButton
                name="send"
                aria-label="Post comment"
                disabled={!draft.trim()}
                onClick={post}
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

function AnchorThumb({ listingId, label }: { listingId: string; label: string }) {
  const src = listingById(listingId)?.images[0];
  return (
    <AppImage
      src={src}
      alt={label}
      fill
      sizes="36px"
      fallbackIcon="image"
      className="h-full w-full"
    />
  );
}
