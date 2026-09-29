'use client';

/**
 * Moodboard writes — the live/fixture split for board edits.
 *
 * Fixture mode: the overlay store (lib/store/moodboards.ts) IS the
 * persistence layer — writes land there and stay for the session.
 * Live mode: the server is the truth. Every write posts to the real
 * `/moodboards/*` endpoints and the overlay write is only an optimistic
 * mirror that reverts on failure; `syncIssues` flags the failed kind so
 * the surface can disclose the failed sync instead of toasting a fake
 * success. Reads never trust the overlay in live mode —
 * `useMoodboardOverlay` scopes it to fixture, and the detail refetch
 * (invalidated here) brings the canonical row back.
 *
 * Item identity: live membership writes address board items by the item
 * ROW id from GET /moodboards/:id (`MoodboardItemApi.id`); fixture mode
 * addresses them by listing id (the overlay's key). Callers know which
 * wire they hold.
 */

import { useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as socialService from '@/lib/api/services/social';
import {
  useMoodboardEdits,
  withItemsAdded,
  withoutItemIds,
  movedItem,
  type MoodboardOverlay,
} from '@/lib/store/moodboards';
import type { MoodboardItemPosition } from '@/lib/data/fixtures-content';

const MY_MOODBOARDS_KEY = ['moodboards', 'mine'] as const;
const MOODBOARD_DETAIL_KEY = ['moodboard'] as const;

/** Structural read of the live board detail cache (['moodboard', id, 'live']
 *  — populated by MoodboardClient). The overlay keys by listing id, same as
 *  the detail's board.itemIds. */
interface LiveBoardCache {
  board?: { itemIds?: string[] };
}

export function useMoodboardActions() {
  const queryClient = useQueryClient();

  /** The pre-write membership base for an optimistic overlay write. An
   *  absent overlay must seed from the live board's current itemIds — an
   *  empty base would render the board blank mid-flight (e.g. a remove
   *  flashing an empty canvas). */
  const baseItemIds = (boardId: string): string[] => {
    const overlaid = useMoodboardEdits.getState().boards[boardId]?.itemIds;
    if (overlaid) return overlaid;
    if (DATA_MODE === 'live') {
      return (
        queryClient.getQueryData<LiveBoardCache>(['moodboard', boardId, 'live'])?.board
          ?.itemIds ?? []
      );
    }
    return [];
  };

  const invalidateBoards = () => {
    void queryClient.invalidateQueries({ queryKey: MY_MOODBOARDS_KEY });
    void queryClient.invalidateQueries({ queryKey: MOODBOARD_DETAIL_KEY });
  };

  /** Restore the pre-write overlay — an absent overlay is removed entirely
   *  so a failed first edit doesn't leave an empty shell behind. */
  const restoreOverlay = (boardId: string, before: MoodboardOverlay | undefined) => {
    useMoodboardEdits.setState((s) => {
      const boards = { ...s.boards };
      if (before && Object.keys(before).length > 0) boards[boardId] = before;
      else delete boards[boardId];
      return { boards };
    });
  };

  /** Optimistic mirror + live write + revert-on-failure, shared shape. */
  const writeThrough = async (
    boardId: string,
    kind: string,
    optimistic: () => void,
    live: () => Promise<void>,
  ): Promise<void> => {
    const edits = useMoodboardEdits.getState();
    const before = edits.boards[boardId];
    optimistic();
    if (DATA_MODE !== 'live') return;
    try {
      await live();
      edits.setSyncIssue(boardId, null);
      invalidateBoards();
    } catch (err) {
      restoreOverlay(boardId, before);
      edits.setSyncIssue(boardId, kind);
      throw err;
    }
  };

  return {
    /** Rename — PATCH /moodboards/:id {title}. */
    renameBoard: (boardId: string, title: string): Promise<void> =>
      writeThrough(
        boardId,
        'rename',
        () => useMoodboardEdits.getState().renameBoard(boardId, title),
        () => socialService.updateMoodboardMeta(boardId, { title }),
      ),

    /** Theme — PATCH /moodboards/:id {theme}. */
    setBoardTheme: (boardId: string, themeId: string): Promise<void> =>
      writeThrough(
        boardId,
        'theme',
        () => useMoodboardEdits.getState().setBoardTheme(boardId, themeId),
        () => socialService.updateMoodboardMeta(boardId, { theme: themeId }),
      ),

    /** Membership add — POST /moodboards/:id/items per listing id. */
    addItems: (boardId: string, listingIds: string[]): Promise<void> => {
      const next = withItemsAdded(baseItemIds(boardId), listingIds);
      return writeThrough(
        boardId,
        'items',
        () => useMoodboardEdits.getState().setBoardItems(boardId, next),
        () =>
          Promise.all(
            listingIds.map((listingId) =>
              socialService.addMoodboardItem(boardId, listingId),
            ),
          ).then(() => undefined),
      );
    },

    /**
     * Membership remove — DELETE /moodboards/:id/items/:rowId. The
     * overlay keys by listing id; the live delete addresses the
     * board-item row id, so both travel: `listingIds` drive the
     * optimistic overlay write, `rowIds` the server calls.
     */
    removeItems: (boardId: string, listingIds: string[], rowIds: string[]): Promise<void> => {
      const next = withoutItemIds(baseItemIds(boardId), new Set(listingIds));
      return writeThrough(
        boardId,
        'items',
        () => useMoodboardEdits.getState().setBoardItems(boardId, next),
        () =>
          Promise.all(
            rowIds.map((rowId) =>
              socialService.removeMoodboardItem(boardId, rowId),
            ),
          ).then(() => undefined),
      );
    },

    /** Canvas placement — PATCH /moodboards/:id/items/:rowId. Overlay
     *  keys by listing id; the server call addresses the row id. */
    setItemPosition: (
      boardId: string,
      listingId: string,
      rowId: string,
      position: MoodboardItemPosition,
    ): Promise<void> =>
      writeThrough(
        boardId,
        'position',
        () => useMoodboardEdits.getState().setItemPosition(boardId, listingId, position),
        () =>
          socialService.setMoodboardItemPosition(boardId, rowId, {
            positionX: position.x,
            positionY: position.y,
            rotation: position.rotation,
            scale: position.scale,
          }),
      ),

    /** Canvas layer move — PATCH /moodboards/:id/items/:rowId/reorder. */
    reorderItem: (
      boardId: string,
      listingId: string,
      rowId: string,
      direction: 'front' | 'back',
    ): Promise<void> =>
      writeThrough(
        boardId,
        'reorder',
        () =>
          useMoodboardEdits
            .getState()
            .setBoardItems(
              boardId,
              movedItem(
                baseItemIds(boardId),
                listingId,
                direction === 'front' ? -1 : 1,
              ),
            ),
        () => socialService.reorderMoodboardItem(boardId, rowId, direction),
      ),
  };
}
