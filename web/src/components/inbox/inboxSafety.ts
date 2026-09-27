'use client';

/**
 * inboxSafety — per-viewer safety state for conversations: blocked
 * counterparties. Mirrors the mobile store's blockedUsers slice; persisted
 * to localStorage like inboxPrefs so the block survives reloads.
 *
 * The web inbox has no restrict pipeline (restricted users would need a
 * requests queue their messages route into) — block is the honest rung the
 * data model supports.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs } from '@/lib/store/settingsPrefs';

interface InboxSafetyState {
  blockedUserIds: string[];
  toggleBlocked: (userId: string) => void;
}

export const useInboxSafety = create<InboxSafetyState>()(
  persist(
    (set) => ({
      blockedUserIds: [],
      toggleBlocked: (userId) =>
        set((s) => ({
          blockedUserIds: s.blockedUserIds.includes(userId)
            ? s.blockedUserIds.filter((id) => id !== userId)
            : [...s.blockedUserIds, userId],
        })),
    }),
    {
      name: 'thryftverse.web.inbox-safety',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ blockedUserIds: s.blockedUserIds }),
    },
  ),
);

/**
 * useIsBlockedUser — the viewer-relationship truth every surface shares.
 * Blocks write into two persisted stores (the inbox safety slice and
 * Settings → Privacy's list) and both are authoritative — the union is the
 * same predicate ProfileOptionsMenu applies. Hydration-gated: persisted
 * stores rehydrate client-side, so SSR and the first client render read
 * "not blocked" rather than a stale guess.
 */
export function useIsBlockedUser(userId: string | null | undefined): boolean {
  const hydrated = useHydrated();
  const inboxBlocked = useInboxSafety((s) => s.blockedUserIds);
  const prefBlocked = useSettingsPrefs((s) => s.blockedIds);
  return (
    hydrated &&
    !!userId &&
    (inboxBlocked.includes(userId) || prefBlocked.includes(userId))
  );
}
