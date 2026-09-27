'use client';

/**
 * Board prefs — the member's per-board presentation choices plus the
 * save-sheet recency trail. Persisted overlay like collectionEdits /
 * moodboards: fixtures stay source truth; these fields have no server
 * contract on the collections API (cover pick, archive) or belong to the
 * fixture boards the API doesn't know (privacy overrides on col-*
 * boards), so they live client-side. Same latest-write-wins posture.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ProfileBoard } from './fixtures';

export interface BoardPref {
  /** Listing id whose image fronts the board; absent = derived collage. */
  coverItemId?: string | null;
  /** Archived boards leave the profile/save surfaces; the detail route
   *  still resolves them and offers unarchive. */
  archived?: boolean;
  /** Owner privacy override for fixture boards (live boards go through
   *  PATCH /collections/:id — this is the fixture-side mirror). */
  isPrivate?: boolean;
}

export type BoardSortKey = 'custom' | 'newest' | 'alpha';

export const BOARD_SORT_OPTIONS: { value: BoardSortKey; label: string }[] = [
  { value: 'custom', label: 'Custom' },
  { value: 'newest', label: 'Newest' },
  { value: 'alpha', label: 'A–Z' },
];

/** Pinterest board-order grammar: custom (source order), newest first,
 *  or alphabetical by title. Accepts board rows keyed by `title` or
 *  collection rows keyed by `name`. */
export function sortBoards<T extends { title?: string; name?: string; createdAt?: string }>(
  boards: T[],
  key: BoardSortKey,
): T[] {
  if (key === 'alpha') {
    const label = (b: T) => b.title ?? b.name ?? '';
    return [...boards].sort((a, b) =>
      label(a).localeCompare(label(b), undefined, { sensitivity: 'base' }),
    );
  }
  if (key === 'newest') {
    return [...boards].sort((a, b) =>
      (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
    );
  }
  return boards;
}

const RECENTS_MAX = 4;

interface BoardPrefsState {
  boards: Record<string, BoardPref>;
  /** Board ids most recently filed to — recents lead the save sheet. */
  recents: string[];
  sort: BoardSortKey;
  /** Moodboards the member created on web — POST /moodboards handles the
   *  live write; this list keeps them resolvable on every board surface
   *  (moodboard detail + boards grids) for the demo session and beyond. */
  createdMoodboards: ProfileBoard[];
  setCover: (boardId: string, itemId: string | null) => void;
  setArchived: (boardId: string, archived: boolean) => void;
  setPrivate: (boardId: string, isPrivate: boolean) => void;
  markRecent: (boardId: string) => void;
  setSort: (sort: BoardSortKey) => void;
  addMoodboard: (board: ProfileBoard) => void;
}

export const useBoardPrefs = create<BoardPrefsState>()(
  persist(
    (set) => ({
      boards: {},
      recents: [],
      sort: 'custom',
      createdMoodboards: [],
      setCover: (boardId, itemId) =>
        set((s) => ({
          boards: {
            ...s.boards,
            [boardId]: { ...s.boards[boardId], coverItemId: itemId },
          },
        })),
      setArchived: (boardId, archived) =>
        set((s) => ({
          boards: {
            ...s.boards,
            [boardId]: { ...s.boards[boardId], archived },
          },
        })),
      setPrivate: (boardId, isPrivate) =>
        set((s) => ({
          boards: {
            ...s.boards,
            [boardId]: { ...s.boards[boardId], isPrivate },
          },
        })),
      markRecent: (boardId) =>
        set((s) => ({
          recents: [boardId, ...s.recents.filter((id) => id !== boardId)].slice(
            0,
            RECENTS_MAX,
          ),
        })),
      setSort: (sort) => set({ sort }),
      addMoodboard: (board) =>
        set((s) =>
          s.createdMoodboards.some((b) => b.id === board.id)
            ? s
            : { createdMoodboards: [...s.createdMoodboards, board] },
        ),
    }),
    {
      name: 'thryftverse.web.boardPrefs',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        boards: s.boards,
        recents: s.recents,
        sort: s.sort,
        createdMoodboards: s.createdMoodboards,
      }),
    },
  ),
);
