'use client';

/**
 * Moodboard edits — persisted owner overlay for the board detail surface.
 *
 * Fixture boards (MOODBOARDS + MOODBOARD_ITEM_IDS) stay read-only source
 * truth; every web edit lands here keyed by board id — `title` overrides
 * the fixture title, `itemIds` is the full effective listing-id order once
 * the board has been edited (add / remove / reorder). Same posture as the
 * mobile editor's LWW log: the latest write wins, and an undo is itself a
 * new write, never a rewind of the store.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DATA_MODE } from '@/lib/api/client';
import type { MoodboardItemPosition } from '@/lib/data/fixtures-content';

export interface MoodboardOverlay {
  /** Renamed board title — replaces the fixture title when present. */
  title?: string;
  /** Effective ordered listing ids once edited; absent = fixture order.
   *  Also the canvas layer order (back → front), matching mobile. */
  itemIds?: string[];
  /** Canvas theme override — absent = fixture theme for the board. */
  themeId?: string;
  /** Freeform canvas placement keyed by listing id — absent = authored
   *  fixture layout or the deterministic scatter fallback. */
  positions?: Record<string, MoodboardItemPosition>;
}

interface MoodboardsState {
  boards: Record<string, MoodboardOverlay>;
  /** Live-write failure channel — boardId → the write kind that failed
   *  after rollback ('rename' | 'items' | 'position' | 'theme'). Runtime
   *  only, never persisted; surfaces read it to disclose a failed sync
   *  instead of a fake-success toast. */
  syncIssues: Record<string, string>;
  setSyncIssue: (boardId: string, kind: string | null) => void;
  renameBoard: (boardId: string, title: string) => void;
  setBoardItems: (boardId: string, itemIds: string[]) => void;
  setBoardTheme: (boardId: string, themeId: string) => void;
  setItemPosition: (
    boardId: string,
    itemId: string,
    position: MoodboardItemPosition,
  ) => void;
  /** Restore a full canvas snapshot (theme + item order + positions). */
  restoreBoardSnapshot: (
    boardId: string,
    snapshot: {
      itemIds: string[];
      themeId?: string;
      positions?: Record<string, MoodboardItemPosition>;
    },
  ) => void;
}

export const useMoodboardEdits = create<MoodboardsState>()(
  persist(
    (set) => ({
      boards: {},
      syncIssues: {},
      setSyncIssue: (boardId, kind) =>
        set((s) => {
          const syncIssues = { ...s.syncIssues };
          if (kind === null) delete syncIssues[boardId];
          else syncIssues[boardId] = kind;
          return { syncIssues };
        }),
      renameBoard: (boardId, title) =>
        set((s) => ({
          boards: { ...s.boards, [boardId]: { ...s.boards[boardId], title } },
        })),
      setBoardItems: (boardId, itemIds) =>
        set((s) => ({
          boards: { ...s.boards, [boardId]: { ...s.boards[boardId], itemIds } },
        })),
      setBoardTheme: (boardId, themeId) =>
        set((s) => ({
          boards: { ...s.boards, [boardId]: { ...s.boards[boardId], themeId } },
        })),
      setItemPosition: (boardId, itemId, position) =>
        set((s) => {
          const overlay = s.boards[boardId];
          return {
            boards: {
              ...s.boards,
              [boardId]: {
                ...overlay,
                positions: { ...overlay?.positions, [itemId]: position },
              },
            },
          };
        }),
      restoreBoardSnapshot: (boardId, snapshot) =>
        set((s) => ({
          boards: {
            ...s.boards,
            [boardId]: {
              ...s.boards[boardId],
              itemIds: snapshot.itemIds,
              ...(snapshot.themeId ? { themeId: snapshot.themeId } : {}),
              positions: snapshot.positions ?? {},
            },
          },
        })),
    }),
    {
      name: 'thryftverse.web.moodboards',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ boards: s.boards }),
    },
  ),
);

// ---------------------------------------------------------------------------
// Pure order helpers — the web board is a linear item list (masonry lays it
// out), so edits reduce to list transforms. Every helper returns a new list;
// the caller persists the result through setBoardItems.
// ---------------------------------------------------------------------------

/** Remove every id in `remove`; returns `ids` untouched when nothing matches. */
export function withoutItemIds(ids: string[], remove: ReadonlySet<string>): string[] {
  const next = ids.filter((id) => !remove.has(id));
  return next.length === ids.length ? ids : next;
}

/** Move an item one step earlier (-1) or later (+1); clamps at the edges. */
export function movedItem(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  if (index < 0) return ids;
  const target = index + direction;
  if (target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  next.splice(index, 1);
  next.splice(target, 0, id);
  return next;
}

/**
 * Reinsert `draggedId` in `targetId`'s slot — drop-target reorder semantics.
 * The dragged item leaves the list first, then takes the target's position,
 * pushing the target (and everything after) one step later.
 */
export function itemMovedBefore(
  ids: string[],
  draggedId: string,
  targetId: string,
): string[] {
  if (draggedId === targetId) return ids;
  const without = ids.filter((id) => id !== draggedId);
  const index = without.indexOf(targetId);
  const next = [...without];
  next.splice(index < 0 ? next.length : index, 0, draggedId);
  return next;
}

/** Append ids not already on the board, preserving pick order. */
export function withItemsAdded(ids: string[], added: string[]): string[] {
  const have = new Set(ids);
  const fresh = added.filter((id) => !have.has(id));
  return fresh.length === 0 ? ids : [...ids, ...fresh];
}

/**
 * Canvas layer order — itemIds double as the z-stack (back → front), the
 * same grammar the mobile editor uses for its item array. `front` pushes
 * the item last (topmost); `back` pulls it first (bottom-most).
 */
export function itemToLayer(
  ids: string[],
  id: string,
  layer: 'front' | 'back',
): string[] {
  const without = ids.filter((x) => x !== id);
  if (without.length === ids.length) return ids;
  return layer === 'front' ? [...without, id] : [id, ...without];
}

/**
 * Fixture-scoped overlay read — in live mode the server (via the moodboard
 * query cache + `useMoodboardActions` writes) is the truth, so the
 * persisted overlay must never override a live board's title/items. Use
 * this instead of `s.boards[id]` at merge sites. Overlay *writes* still
 * land for every mode: a fixture board keeps working, and live callers
 * going through `useMoodboardActions` write the overlay only as an
 * optimistic mirror that reverts on failure.
 */
export function useMoodboardOverlay(boardId: string | null | undefined): MoodboardOverlay | undefined {
  return useMoodboardEdits((s) =>
    DATA_MODE === 'live' || !boardId ? undefined : s.boards[boardId],
  );
}
