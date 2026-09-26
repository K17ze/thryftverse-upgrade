'use client';

/**
 * Poster archive session state — the member's story mutations and created
 * highlights. Fixture stories (POSTER_ARCHIVE) stay read-only source truth;
 * deletes and archive transitions land here as id sets, and member-built
 * highlights persist alongside the seeded ones. Same overlay posture as
 * lib/store/moodboards.ts — latest write wins.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { PosterHighlight } from '@/lib/data/fixtures-posters';

interface PosterArchiveState {
  /** Stories the member deleted — filtered out of every archive read. */
  removedStoryIds: string[];
  /** Active stories the member manually archived. */
  archivedStoryIds: string[];
  /** Highlights the member created (fixtures remain the seed set). */
  highlights: PosterHighlight[];
  removeStory: (storyId: string) => void;
  archiveStory: (storyId: string) => void;
  createHighlight: (highlight: PosterHighlight) => void;
  deleteHighlight: (highlightId: string) => void;
}

export const usePosterArchive = create<PosterArchiveState>()(
  persist(
    (set) => ({
      removedStoryIds: [],
      archivedStoryIds: [],
      highlights: [],
      removeStory: (storyId) =>
        set((s) => ({
          removedStoryIds: [...new Set([...s.removedStoryIds, storyId])],
        })),
      archiveStory: (storyId) =>
        set((s) => ({
          archivedStoryIds: [...new Set([...s.archivedStoryIds, storyId])],
        })),
      createHighlight: (highlight) =>
        set((s) => ({ highlights: [highlight, ...s.highlights] })),
      deleteHighlight: (highlightId) =>
        set((s) => ({
          highlights: s.highlights.filter((h) => h.id !== highlightId),
        })),
    }),
    {
      name: 'thryftverse.web.posterArchive',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        removedStoryIds: s.removedStoryIds,
        archivedStoryIds: s.archivedStoryIds,
        highlights: s.highlights,
      }),
    },
  ),
);
