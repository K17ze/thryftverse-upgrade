'use client';

/**
 * SaveToBoardSheet — file a saved item into (or out of) one of the member's
 * boards. Web port of the mobile ClosetScreen's hold-to-file picker
 * (SaveToCollectionModal): rows are the owner's boards — saved collections
 * and moodboards in the same unified derivation the profile/saved surfaces
 * use — each with a live membership check. Tapping a row toggles the item
 * and stays open so one piece can land on several boards; writes go through
 * the same overlay stores as the board edit surfaces (collections also
 * mirror into the collections query cache for the hub grid).
 *
 * Picker grammar per the social research: a search field filters boards,
 * recently-used boards lead the list (boardPrefs.recents), and an inline
 * "New board" row creates a real collection through useCollectionActions —
 * never a dead end to /collections.
 */

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import { useOwnerBoards, type OwnerBoard } from '@/components/profile/useOwnerBoards';
import { listingCoverThumbs } from '@/components/profile/boardMedia';
import { useBoardPrefs } from '@/components/profile/boardPrefs';
import { useCollectionEdits, withItemsAdded, withoutItemIds } from '@/lib/store/collectionEdits';
import { useMoodboardEdits } from '@/lib/store/moodboards';
import { useCollectionActions } from '@/lib/hooks/collections-queries';
import { useHydrated } from '@/lib/store/useStore';
import { useSession } from '@/lib/session/SessionProvider';
import type { UserCollection } from '@/lib/data/fixtures-collections';

/** Same key as lib/hooks/collections-queries.ts — mirrors /collection/[id]. */
const USER_COLLECTIONS_KEY = ['user-collections'] as const;

interface SaveToBoardSheetProps {
  open: boolean;
  onClose: () => void;
  /** Listing id being filed — null while closed. */
  itemId: string | null;
  /** Shown in toasts for context, e.g. the item title. */
  itemLabel?: string;
}

export function SaveToBoardSheet({ open, onClose, itemId, itemLabel }: SaveToBoardSheetProps) {
  const { show } = useToast();
  const { user, isGuest } = useSession();
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const overlays = useCollectionEdits((s) => s.boards);
  const setCollectionItems = useCollectionEdits((s) => s.setCollectionItems);
  const setBoardItems = useMoodboardEdits((s) => s.setBoardItems);
  const { createCollection } = useCollectionActions();
  const recents = useBoardPrefs((s) => s.recents);
  const markRecent = useBoardPrefs((s) => s.markRecent);

  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creatingBusy, setCreatingBusy] = useState(false);

  // Private boards included — this is the owner's filing surface. Guests
  // are never the fixture 'me', so there is no fallback identity.
  const boards = useOwnerBoards(user?.id ?? '', true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? boards.filter((b) => b.title.toLowerCase().includes(q)) : boards;
  }, [boards, query]);

  const recentBoards = useMemo(
    () =>
      query.trim()
        ? []
        : recents
            .map((id) => filtered.find((b) => b.id === id))
            .filter((b): b is OwnerBoard => !!b),
    [recents, filtered, query],
  );
  const restBoards = useMemo(
    () => filtered.filter((b) => !recentBoards.includes(b)),
    [filtered, recentBoards],
  );

  /** Effective item ids for a collection board — overlay edit wins, then the
   *  warm query cache (session-created boards' real contents), then the
   *  overlay-merged fixture row from useOwnerBoards. */
  const collectionItems = (boardId: string, fallback: string[]): string[] =>
    overlays[boardId]?.itemIds ??
    queryClient.getQueryData<UserCollection[]>(USER_COLLECTIONS_KEY)?.find(
      (c) => c.id === boardId,
    )?.itemIds ??
    fallback;

  const toggle = (board: OwnerBoard) => {
    if (!itemId) return;
    const current =
      board.kind === 'collection'
        ? collectionItems(board.id, board.itemIds)
        : board.itemIds;
    const onBoard = current.includes(itemId);
    const next = onBoard
      ? withoutItemIds(current, new Set([itemId]))
      : withItemsAdded(current, [itemId]);

    if (board.kind === 'collection') {
      setCollectionItems(board.id, next);
      queryClient.setQueryData<UserCollection[]>(USER_COLLECTIONS_KEY, (old) =>
        old?.map((c) => (c.id === board.id ? { ...c, itemIds: [...next] } : c)),
      );
    } else {
      setBoardItems(board.id, next);
    }
    markRecent(board.id);
    show(
      onBoard ? `Removed from “${board.title}”` : `Saved to “${board.title}”`,
      'info',
    );
  };

  /** Inline create — the mobile "New board" row. Creates a real collection
   *  (POST /collections live; session store in fixture mode) and files the
   *  pending item straight into it. */
  const createBoard = async () => {
    const name = newTitle.trim();
    if (!name || creatingBusy) return;
    setCreatingBusy(true);
    try {
      const created = await createCollection({ name, isPrivate: false });
      if (itemId) {
        setCollectionItems(created.id, [itemId]);
        queryClient.setQueryData<UserCollection[]>(USER_COLLECTIONS_KEY, (old) =>
          old?.map((c) => (c.id === created.id ? { ...c, itemIds: [itemId] } : c)),
        );
      }
      markRecent(created.id);
      show(`Saved to “${created.name}”`, 'success');
      setCreating(false);
      setNewTitle('');
    } catch {
      show('Could not create the board', 'error');
    } finally {
      setCreatingBusy(false);
    }
  };

  const close = () => {
    setQuery('');
    setCreating(false);
    setNewTitle('');
    onClose();
  };

  const renderRow = (b: OwnerBoard) => {
    const itemIds =
      hydrated && b.kind === 'collection'
        ? collectionItems(b.id, b.itemIds)
        : b.itemIds;
    const onBoard = hydrated && itemId ? itemIds.includes(itemId) : false;
    const thumb = listingCoverThumbs(itemIds, 4, b.coverUri, b.coverItemId)[0];
    return (
      <li key={b.id}>
        <button
          type="button"
          onClick={() => toggle(b)}
          aria-pressed={onBoard}
          className="pressable flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-alt"
        >
          <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md bg-surface-alt">
            <AppImage
              src={thumb}
              alt=""
              fill
              sizes="44px"
              className="h-full w-full"
              fallbackIcon="layers"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="clamp-1 flex items-center gap-1.5 text-body-emphasis font-semibold text-text-primary">
              {b.title}
              {b.isPrivate ? (
                <Icon name="lock" size={12} className="shrink-0 text-text-muted" />
              ) : null}
            </span>
            <span className="tnum block text-meta text-text-muted">
              {itemIds.length} {itemIds.length === 1 ? 'item' : 'items'}
              {b.kind === 'moodboard' ? ' · moodboard' : ''}
            </span>
          </span>
          <span
            aria-hidden
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
              onBoard
                ? 'border-transparent bg-brand text-text-inverse'
                : 'border-border text-transparent'
            }`}
          >
            <Icon name="check" size={14} />
          </span>
        </button>
      </li>
    );
  };

  // Owner-only surface — guests never file into the demo account's boards.
  if (isGuest || !user) return null;

  return (
    <Sheet open={open} onClose={close} title="Save to board" maxWidth={420}>
      <div className="px-4 pb-2 pt-1">
        <label className="flex h-10 items-center gap-2 rounded-lg bg-surface-alt px-3">
          <Icon name="search" size={16} className="shrink-0 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search boards"
            aria-label="Search boards"
            className="min-w-0 flex-1 bg-transparent text-body text-text-primary outline-none placeholder:text-text-muted"
          />
        </label>
      </div>

      <ul
        className="max-h-[50dvh] overflow-y-auto px-2 pb-5"
        aria-label={itemLabel ? `Boards for ${itemLabel}` : 'Boards'}
      >
        {recentBoards.length > 0 ? (
          <>
            <li aria-hidden className="px-3 pb-1 pt-2 text-meta font-semibold uppercase tracking-wide text-text-muted">
              Recent
            </li>
            {recentBoards.map(renderRow)}
            <li aria-hidden className="px-3 pb-1 pt-3 text-meta font-semibold uppercase tracking-wide text-text-muted">
              All boards
            </li>
          </>
        ) : null}

        {restBoards.map(renderRow)}

        {filtered.length === 0 ? (
          <li className="px-3 py-6 text-center text-body text-text-muted">
            No boards match “{query.trim()}”.
          </li>
        ) : null}

        {/* New board — the create path never dead-ends to /collections */}
        <li>
          {creating ? (
            <div className="flex items-center gap-2 px-3 py-2">
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void createBoard();
                  if (e.key === 'Escape') {
                    setCreating(false);
                    setNewTitle('');
                  }
                }}
                placeholder="Board name"
                aria-label="New board name"
                maxLength={60}
                className="h-10 min-w-0 flex-1 rounded-lg bg-surface-alt px-3 text-body text-text-primary outline-none placeholder:text-text-muted focus:ring-1 focus:ring-brand"
              />
              <button
                type="button"
                onClick={() => void createBoard()}
                disabled={!newTitle.trim() || creatingBusy}
                className="pressable h-10 shrink-0 rounded-lg bg-brand px-4 text-body font-semibold text-text-inverse disabled:opacity-50"
              >
                Create
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="pressable flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-alt"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-text-muted">
                <Icon name="plus" size={20} />
              </span>
              <span className="flex-1 text-body-emphasis font-semibold text-text-primary">
                New board
              </span>
            </button>
          )}
        </li>
      </ul>
    </Sheet>
  );
}
