'use client';

import { AppImage } from '@/components/ui/AppImage';
import { Icon } from '@/components/ui/Icon';
import type { OwnerBoard } from '@/components/profile/useOwnerBoards';
import { useBoardCoverThumbs } from '@/components/profile/boardMedia';

interface BoardRowProps {
  board: OwnerBoard;
  itemIds: string[];
  onBoard: boolean;
  count: number | null;
  onToggle: () => void;
}

/** One board row — thumb (real item cover or the board's own), title,
 *  honest item count, membership check. */
export function BoardRow({
  board,
  itemIds,
  onBoard,
  count,
  onToggle,
}: BoardRowProps) {
  const thumb =
    useBoardCoverThumbs(itemIds, 4, board.thumbs?.[0] ?? board.coverUri, board.coverItemId)[0] ??
    board.thumbs?.[0];

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={onBoard}
        className="pressable flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-row"
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
            {board.title}
            {board.isPrivate ? (
              <Icon name="lock" size={12} className="shrink-0 text-text-muted" />
            ) : null}
          </span>
          <span className="tnum block text-meta text-text-muted">
            {count === null ? '' : `${count} ${count === 1 ? 'item' : 'items'}`}
            {board.kind === 'moodboard' ? ' · moodboard' : ''}
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
}
