'use client';

/**
 * Moodboard detail — port of MoodboardEditor's read surface:
 * cover-media header with scrim title, owner row, decorative collaborators,
 * quiet edit affordances for the owner, masonry of board items.
 *
 * Owners get a real edit mode (mobile MoodboardEditorScreen semantics,
 * web-shaped): inline rename, per-tile remove with Undo, drag / move-button
 * reorder, multi-select batch remove, and an import sheet that pins saved
 * items + favourites to the board. Edits persist in the moodboards overlay
 * store — fixtures stay untouched; non-owners always see the read surface.
 */

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { MasonryGrid, useMasonryColumns } from '@/components/feed/MasonryGrid';
import { EditableMoodboardGrid } from '@/components/moodboard/EditableMoodboardGrid';
import { MoodboardImportSheet } from '@/components/moodboard/MoodboardImportSheet';
import { MoodboardSelectionBar } from '@/components/moodboard/MoodboardSelectionBar';
import { AppImage } from '@/components/ui/AppImage';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/Toast';
import { BackBar } from '@/components/profile/BackBar';
import {
  listingsForIds,
  MOODBOARD_COLLABORATOR_IDS,
  MOODBOARD_ITEM_IDS,
} from '@/components/profile/fixtures';
import {
  mapListingToDiscoverySummary,
  type DiscoveryFeedUnit,
  type DiscoveryListingSummary,
  type User,
} from '@/lib/contracts/domain';
import { MOODBOARDS, userById } from '@/lib/data/fixtures';
import { useUser } from '@/lib/hooks/queries';
import { useSession } from '@/lib/session/SessionProvider';
import {
  itemMovedBefore,
  movedItem,
  useMoodboardEdits,
  withItemsAdded,
  withoutItemIds,
} from '@/lib/store/moodboards';
import { useHydrated, useStore } from '@/lib/store/useStore';
import { timeAgo } from '@/lib/utils/format';

export default function MoodboardPage() {
  const params = useParams();
  const router = useRouter();
  const { show } = useToast();
  const { user: me } = useSession();
  const columns = useMasonryColumns();
  const hydrated = useHydrated();

  const id = String(params.id ?? '');
  const board = MOODBOARDS.find((b) => b.id === id);
  const { data: owner } = useUser(board?.ownerId ?? '');

  // Persisted owner edits — gated behind hydration so the first client
  // render matches SSR (same posture as ProductTile's wishlist reads).
  const overlay = useMoodboardEdits((s) => (id ? s.boards[id] : undefined));
  const renameBoard = useMoodboardEdits((s) => s.renameBoard);
  const setBoardItems = useMoodboardEdits((s) => s.setBoardItems);
  const edits = hydrated ? overlay : undefined;

  const title = edits?.title ?? board?.title ?? '';
  const itemIds = useMemo(
    () => edits?.itemIds ?? (board ? MOODBOARD_ITEM_IDS[board.id] ?? [] : []),
    [edits?.itemIds, board],
  );

  const [editing, setEditing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const items = useMemo(() => listingsForIds(itemIds), [itemIds]);
  const summaries = useMemo<DiscoveryListingSummary[]>(
    () => items.map(mapListingToDiscoverySummary),
    [items],
  );
  const units = useMemo<DiscoveryFeedUnit[]>(
    () =>
      summaries.map((l) => ({
        type: 'listing',
        id: `mb-${id}-${l.id}`,
        listing: l,
      })),
    [summaries, id],
  );

  // Import candidates — saved + favourites minus what the board holds.
  const wishlist = useStore((s) => s.wishlist);
  const saved = useStore((s) => s.saved);
  const candidates = useMemo<DiscoveryListingSummary[]>(() => {
    const onBoard = new Set(itemIds);
    const pool = [...new Set([...saved, ...wishlist])].filter((x) => !onBoard.has(x));
    return listingsForIds(pool).map(mapListingToDiscoverySummary);
  }, [saved, wishlist, itemIds]);

  if (!board) {
    return (
      <div className="mx-auto max-w-[1200px]">
        <BackBar />
        <EmptyState
          icon="layers"
          title="Board not found"
          subtitle="This moodboard doesn't exist or may have been removed."
          actionLabel="Back to profile"
          onAction={() => router.push('/profile')}
        />
      </div>
    );
  }

  const isOwner = me?.id === board.ownerId;
  const isEditing = isOwner && editing;
  const collaborators = (MOODBOARD_COLLABORATOR_IDS[board.id] ?? [])
    .map((uid) => userById(uid))
    .filter((u): u is User => Boolean(u));

  const shareBoard = async () => {
    const url = `${window.location.origin}/moodboard/${board.id}`;
    try {
      await navigator.clipboard.writeText(url);
      show('Board link copied', 'success');
    } catch {
      show('Could not copy link', 'error');
    }
  };

  // ── Edit-mode ops — each writes a fresh effective order into the overlay
  // store; undo on remove replays the pre-delete list. ──────────────────

  const startEditing = () => {
    setTitleDraft(title);
    setEditing(true);
  };

  const stopEditing = () => {
    setEditing(false);
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const commitTitle = () => {
    const next = titleDraft.trim();
    if (next && next !== title) renameBoard(board.id, next);
    else setTitleDraft(title);
  };

  const toggleSelect = (itemId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  /** Removal is undoable via the toast action — mirrors the mobile
      removeItems history entry restoring the pre-delete order. */
  const removeWithUndo = (ids: string[]) => {
    if (ids.length === 0) return;
    const orderBefore = itemIds;
    setBoardItems(board.id, withoutItemIds(itemIds, new Set(ids)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const x of ids) next.delete(x);
      return next;
    });
    show(
      ids.length === 1 ? 'Removed 1 item' : `Removed ${ids.length} items`,
      'info',
      { label: 'Undo', onPress: () => setBoardItems(board.id, orderBefore) },
    );
  };

  const removeSelected = () => {
    removeWithUndo([...selectedIds]);
    setSelectMode(false);
  };

  const addItems = (ids: string[]) => {
    const next = withItemsAdded(itemIds, ids);
    setBoardItems(board.id, next);
    setImportOpen(false);
    show(
      next.length === itemIds.length
        ? 'Already on this board'
        : ids.length === 1
          ? 'Added 1 item'
          : `Added ${ids.length} items`,
      'success',
    );
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      <BackBar
        actions={
          <>
            <IconButton name="share" aria-label="Share board" onClick={shareBoard} />
            {isOwner ? (
              isEditing ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={stopEditing}
                  className="ml-1"
                >
                  Done
                </Button>
              ) : (
                <>
                  <IconButton
                    name="edit"
                    aria-label="Edit board"
                    onClick={startEditing}
                  />
                  <IconButton
                    name="more"
                    aria-label="More options"
                    onClick={() => show('More options coming soon', 'info')}
                  />
                </>
              )
            ) : null}
          </>
        }
      />

      {/* Cover header — media carries the surface; scrim only for legibility */}
      <div className="relative mx-4 mt-1 overflow-hidden rounded-xl sm:mx-6">
        <div className="relative h-60 sm:h-80">
          <AppImage
            src={board.coverUri}
            alt={title}
            fill
            sizes="(max-width: 1200px) 100vw, 1200px"
            className="h-full w-full"
            priority
            fallbackIcon="layers"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-media-overlay-scrim via-transparent to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
            {isEditing ? (
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    setTitleDraft(title);
                    e.currentTarget.blur();
                  }
                }}
                aria-label="Board title"
                maxLength={60}
                className="w-full border-b border-transparent bg-transparent text-screen-title font-bold text-scrim-text-primary caret-scrim-text-primary outline-none transition-colors focus:border-scrim-text-primary/60 sm:text-display"
              />
            ) : (
              <h1 className="text-screen-title font-bold text-scrim-text-primary sm:text-display">
                {title}
              </h1>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-scrim-text-secondary">
              {owner ? (
                <>
                  <Avatar src={owner.avatar} name={owner.username} size={22} />
                  <span className="font-semibold">@{owner.username}</span>
                  {owner.isVerified ? (
                    <Icon name="verified" filled size={12} className="text-scrim-text-primary" />
                  ) : null}
                  <span aria-hidden>·</span>
                </>
              ) : null}
              <span className="tnum">
                {items.length} {items.length === 1 ? 'item' : 'items'}
              </span>
              {board.createdAt ? (
                <>
                  <span aria-hidden>·</span>
                  <span>Updated {timeAgo(board.createdAt)}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Collaborators — decorative shared-board row */}
      {collaborators.length > 0 ? (
        <div className="mt-4 flex items-center gap-3 px-4 sm:px-6">
          <span className="flex -space-x-2">
            {collaborators.slice(0, 4).map((u) => (
              <Avatar
                key={u.id}
                src={u.avatar}
                name={u.username}
                size={28}
                className="ring-2 ring-background"
              />
            ))}
          </span>
          <p className="text-meta text-text-muted">
            Shared with {collaborators.map((u) => `@${u.username}`).join(', ')}
          </p>
        </div>
      ) : null}

      {/* Edit toolbar — quiet actions; batch chrome lives in the select pill */}
      {isEditing ? (
        <div className="mt-4 flex items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              icon="plus"
              onClick={() => setImportOpen(true)}
            >
              Add items
            </Button>
            <Button
              variant="quiet"
              size="sm"
              aria-pressed={selectMode}
              onClick={() => {
                setSelectMode((v) => !v);
                setSelectedIds(new Set());
              }}
            >
              {selectMode ? 'Done selecting' : 'Select'}
            </Button>
          </div>
          <span className="hidden text-meta text-text-muted sm:block">
            Drag tiles to reorder
          </span>
        </div>
      ) : null}

      {isEditing && selectMode ? (
        <MoodboardSelectionBar
          count={selectedIds.size}
          onRemoveSelected={removeSelected}
          onCancel={() => {
            setSelectMode(false);
            setSelectedIds(new Set());
          }}
        />
      ) : null}

      <div className="mt-4">
        {isEditing ? (
          items.length === 0 ? (
            <EmptyState
              icon="layers"
              title="This board is empty"
              subtitle="Add saved items or favourites to start building it."
              actionLabel="Add items"
              onAction={() => setImportOpen(true)}
              compact
            />
          ) : (
            <EditableMoodboardGrid
              items={summaries}
              columns={columns}
              selectMode={selectMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onRemove={(itemId) => removeWithUndo([itemId])}
              onMove={(itemId, dir) => setBoardItems(board.id, movedItem(itemIds, itemId, dir))}
              onReorder={(draggedId, targetId) =>
                setBoardItems(board.id, itemMovedBefore(itemIds, draggedId, targetId))
              }
            />
          )
        ) : (
          <MasonryGrid
            units={units}
            columns={columns}
            emptyTitle="This board is empty"
            emptySubtitle="Save items to this board and they'll appear here."
          />
        )}
      </div>

      <MoodboardImportSheet
        open={importOpen}
        onClose={() => setImportOpen(false)}
        candidates={candidates}
        onAdd={addItems}
      />
    </div>
  );
}
