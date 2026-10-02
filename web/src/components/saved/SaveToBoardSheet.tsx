'use client';

/**
 * SaveToBoardSheet — file a saved item into (or out of) one of the member's
 * boards. Web port of the mobile ClosetScreen's hold-to-file picker
 * (SaveToCollectionModal): rows are the owner's boards — saved collections
 * and moodboards in the same unified derivation the profile/saved surfaces
 * use — each with a live membership check. Tapping a row toggles the item
 * and stays open so one piece can land on several boards.
 */

import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import type { OwnerBoard } from '@/components/profile/useOwnerBoards';
import { DATA_MODE } from '@/lib/api/client';
import { BoardRow } from './BoardRow';
import { useSaveToBoardWorkflow } from './useSaveToBoardWorkflow';

const LIVE = DATA_MODE === 'live';

interface SaveToBoardSheetProps {
  open: boolean;
  onClose: () => void;
  /** Listing id being filed — null while closed. */
  itemId: string | null;
  /** Shown in toasts for context, e.g. the item title. */
  itemLabel?: string;
}

export function SaveToBoardSheet({ open, onClose, itemId, itemLabel }: SaveToBoardSheetProps) {
  const {
    user,
    isGuest,
    hydrated,
    query,
    setQuery,
    creating,
    setCreating,
    newTitle,
    setNewTitle,
    creatingBusy,
    filtered,
    recentBoards,
    restBoards,
    collectionItems,
    isOnBoard,
    moodboardDetails,
    toggle,
    createBoard,
    close,
  } = useSaveToBoardWorkflow(itemId, onClose);

  // Owner-only surface — guests never file into the demo account's boards.
  if (isGuest || !user) return null;

  const renderRow = (b: OwnerBoard) => {
    const itemIds =
      hydrated && b.kind === 'collection'
        ? collectionItems(b.id, b.itemIds)
        : b.itemIds;
    const onBoard = hydrated && isOnBoard(b);
    const count =
      b.kind === 'moodboard' && LIVE
        ? (moodboardDetails.data?.[b.id]?.listingIds.length ?? b.itemCount ?? null)
        : itemIds.length;
    return (
      <BoardRow
        key={b.id}
        board={b}
        itemIds={itemIds}
        onBoard={onBoard}
        count={count}
        onToggle={() => void toggle(b)}
      />
    );
  };

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
              className="pressable flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-row"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-md border border-dashed border-border text-text-muted">
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
