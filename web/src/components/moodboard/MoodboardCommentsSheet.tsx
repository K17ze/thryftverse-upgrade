'use client';

/**
 * MoodboardCommentsSheet — port of the mobile MoodboardCommentsSheet.
 * Live mode reads the real /moodboards/:id/comments thread and writes
 * through the same CRUD the mobile app uses (create / resolve / delete —
 * resolve and delete are owner-editor capabilities the backend enforces).
 * Fixture mode threads the seeded fixture comments plus the member's
 * session posts via the moodboardCollab overlay.
 *
 * Comments can anchor to a canvas item (itemId) or the board itself.
 * Affordances mirror the backend capabilities: resolve is owner/editor or
 * the comment's author, delete is author or owner/editor, and posting
 * requires owner/editor/commenter membership. Guests read but can't post.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import {
  MOODBOARD_COMMENTS,
  usernameById,
} from '@/lib/data/fixtures-content';
import { listingById, USERS } from '@/lib/data/fixtures';
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import {
  createBoardComment,
  deleteBoardComment,
  fetchBoardComments,
  setBoardCommentResolved,
  type BoardComment,
} from '@/lib/api/services/social';
import type { Listing } from '@/lib/contracts/domain';
import { useSession } from '@/lib/session/SessionProvider';
import { useMoodboardCollab } from '@/lib/store/moodboardCollab';
import { useHydrated } from '@/lib/store/useStore';
import { timeAgo } from '@/lib/utils/format';

const LIVE = DATA_MODE === 'live';

interface MoodboardCommentsSheetProps {
  boardId: string;
  open: boolean;
  onClose: () => void;
  /** When set, the composer anchors new comments to this canvas item and
   *  the list filters to that thread — opened from a canvas selection. */
  anchorItemId?: string | null;
  /** Owner/editor moderation — resolve any comment, delete anyone's. The
   *  author's own resolve/delete is always shown regardless. */
  canModerate?: boolean;
  /** Whether the viewer may post — owner/editor/commenter memberships.
   *  Undefined (fixture mode, callers that don't know the role) keeps the
   *  composer open for any signed-in member. */
  canComment?: boolean;
  /** The board's resolved listings — live threads resolve anchored item
   *  titles against them (fixture mode reads the bundled catalogue). */
  boardItems?: Listing[];
}

/** Normalized render row — fixture rows resolve authors through USERS,
 *  live rows carry the backend's author projection. */
interface RenderComment {
  id: string;
  authorName: string | null;
  authorAvatar: string | null;
  itemId: string | null;
  body: string;
  resolved: boolean;
  createdAt: string;
  mine: boolean;
}

export function MoodboardCommentsSheet({
  boardId,
  open,
  onClose,
  anchorItemId,
  canModerate = false,
  canComment,
  boardItems,
}: MoodboardCommentsSheetProps) {
  const { show } = useToast();
  const { user } = useSession();
  const hydrated = useHydrated();
  const collab = useMoodboardCollab((s) => s.boards[boardId]);
  const addComment = useMoodboardCollab((s) => s.addComment);
  const setResolved = useMoodboardCollab((s) => s.setCommentResolved);
  const removeComment = useMoodboardCollab((s) => s.removeComment);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Live thread fetch — gated on open so a closed sheet never fetches.
  const commentsQuery = useQuery({
    queryKey: ['moodboard-comments', boardId],
    queryFn: ({ signal }) => fetchBoardComments(boardId, signal),
    enabled: LIVE && open,
    staleTime: 30_000,
  });

  const rows = useMemo<RenderComment[]>(() => {
    if (LIVE) {
      const all = commentsQuery.data ?? [];
      return (anchorItemId ? all.filter((c) => c.itemId === anchorItemId) : all).map(
        (c: BoardComment) => ({
          id: c.id,
          authorName: c.authorName || null,
          authorAvatar: c.authorAvatar || null,
          itemId: c.itemId,
          body: c.body,
          resolved: c.resolved,
          createdAt: c.createdAt,
          mine: user?.id === c.authorId,
        }),
      );
    }
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
    const filtered = anchorItemId
      ? merged.filter((c) => c.itemId === anchorItemId)
      : merged;
    return filtered.map((c) => {
      const author = USERS.find((u) => u.id === c.authorId);
      return {
        id: c.id,
        authorName: author?.username ?? usernameById(c.authorId),
        authorAvatar: author?.avatar ?? null,
        itemId: c.itemId,
        body: c.body,
        resolved: c.resolved,
        createdAt: c.createdAt,
        mine: user?.id === c.authorId,
      };
    });
  }, [commentsQuery.data, boardId, collab, hydrated, anchorItemId, user?.id]);

  const anchorListing = useMemo(
    () => anchorItemId ? boardItems?.find((l) => l.id === anchorItemId) ?? (!LIVE ? listingById(anchorItemId) : null) : null,
    [anchorItemId, boardItems],
  );

  const post = async () => {
    const body = draft.trim();
    if (!body || posting) return;
    if (LIVE) {
      setPosting(true);
      try {
        await createBoardComment(boardId, { body, itemId: anchorItemId ?? null });
        setDraft('');
        show('Comment added', 'success');
      } catch (err) {
        show(parseApiError(err).message ?? "Couldn't post — try again", 'error');
      } finally {
        setPosting(false);
      }
      return;
    }
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

  const toggleResolved = async (c: RenderComment) => {
    if (LIVE) {
      setBusyId(c.id);
      try {
        await setBoardCommentResolved(boardId, c.id, !c.resolved);
      } catch (err) {
        show(parseApiError(err).message ?? "Couldn't update — try again", 'error');
      } finally {
        setBusyId(null);
      }
      return;
    }
    setResolved(boardId, c.id, !c.resolved);
  };

  const remove = async (c: RenderComment) => {
    if (LIVE) {
      setBusyId(c.id);
      try {
        await deleteBoardComment(boardId, c.id);
      } catch (err) {
        show(parseApiError(err).message ?? "Couldn't delete — try again", 'error');
      } finally {
        setBusyId(null);
      }
      return;
    }
    removeComment(boardId, c.id);
  };

  const loading = LIVE && commentsQuery.isLoading;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={anchorListing ? 'Item comments' : 'Comments'}
      maxWidth={480}
    >
      <div className="flex max-h-[60dvh] flex-col">
        {anchorListing ? (
          <div className="mx-5 mb-2 flex items-center gap-2.5 rounded-lg bg-surface-alt p-2.5">
            <span className="h-9 w-9 overflow-hidden rounded-md">
              {/* Anchor context — the tile the thread hangs on. */}
              <AnchorThumb image={anchorListing.images[0]} label={anchorListing.title} />
            </span>
            <p className="clamp-1 text-meta font-medium text-text-secondary">
              {anchorListing.title}
            </p>
          </div>
        ) : null}

        <div className="min-h-24 flex-1 overflow-y-auto px-5 pb-3" aria-live="polite">
          {loading ? (
            <p className="py-8 text-center text-body text-text-muted" aria-busy>
              Loading comments…
            </p>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-body text-text-muted">
              {anchorListing
                ? 'No notes on this piece yet.'
                : 'No comments yet — start the conversation.'}
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {rows.map((c) => {
                // Backend mirrors this: resolve = owner/editor or author;
                // delete = author or owner/editor (admins aside).
                const canDelete = c.mine || canModerate;
                const canResolve = canModerate || c.mine;
                const itemTitle = !anchorListing ? boardItems?.find((l) => l.id === c.itemId)?.title ?? (!LIVE && c.itemId ? listingById(c.itemId)?.title ?? null : null) : null;
                return (
                  <li key={c.id} className="flex gap-3 py-3">
                    <Avatar
                      src={c.authorAvatar}
                      name={c.authorName ?? 'member'}
                      size={34}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-meta text-text-muted">
                        <span className="font-semibold text-text-primary">
                          @{c.authorName ?? 'member'}
                        </span>
                        <span className="tnum"> · {timeAgo(c.createdAt)}</span>
                        {itemTitle ? (
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
                        {canResolve ? (
                          <button
                            type="button"
                            disabled={busyId === c.id}
                            onClick={() => void toggleResolved(c)}
                            aria-pressed={c.resolved}
                            className="pressable flex items-center gap-1 text-meta text-text-muted hover:text-text-primary disabled:opacity-50"
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
                            disabled={busyId === c.id}
                            onClick={() => void remove(c)}
                            className="pressable text-meta text-text-muted hover:text-danger-text disabled:opacity-50"
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
          {user && canComment === false ? (
            <p className="py-1 text-center text-meta text-text-muted">
              Only collaborators can comment on this board.
            </p>
          ) : user ? (
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
                placeholder={anchorListing ? 'Note on this piece…' : 'Add a comment…'}
                aria-label={anchorListing ? 'Add a comment about this item' : 'Add a comment'}
                maxLength={500}
                className="h-10 min-w-0 flex-1 rounded-full bg-surface-alt px-4 text-body text-text-primary outline-none placeholder:text-text-muted focus:ring-1 focus:ring-brand"
              />
              <IconButton
                name="send"
                aria-label="Post comment"
                disabled={!draft.trim() || posting}
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

function AnchorThumb({ image, label }: { image?: string; label: string }) {
  return (
    <AppImage
      src={image}
      alt={label}
      fill
      sizes="36px"
      fallbackIcon="image"
      className="h-full w-full"
    />
  );
}
