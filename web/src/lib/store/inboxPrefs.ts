'use client';

/**
 * Inbox preferences — per-conversation mute/archive overrides, persisted.
 *
 * The values are *overrides*, not absolute state: `muted[id]` is true while
 * the viewer has muted here, false after an explicit unmute, and absent
 * means "follow the server" — so a live `conversation.isMuted`/`isArchived`
 * flag still drives threads this device never touched. Writes are intent:
 * the caller computes the next value from the resolved display state, the
 * override lands optimistically, and live mode posts the matching edge
 * (POST/DELETE /mute|/archive) with revert-on-failure so a refetch can
 * never contradict the row.
 *
 * v0 → v1: `mutedIds`/`archivedIds` string arrays become presence-true
 * override maps — the arrays could only express "locally muted", which is
 * exactly `muted[id] = true`.
 * v1 → v2: `pinned` joins the override family. The web conversation mapper
 * doesn't surface a pin field yet, so the override is the only source —
 * the live PATCH edge is still posted so the flag lands server-side.
 * v2 → v3: `requests` — the viewer's accept/decline resolution per message
 * request, so a declined request stays declined across remounts (fixture
 * mode has no request-write endpoint; live posts the edge and this entry
 * survives until the refetch confirms).
 */

export type RequestResolution = 'accepted' | 'declined';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface InboxPrefsState {
  /** convId → muted intent. Absent = follow server / unmuted. */
  muted: Record<string, boolean>;
  /** convId → archived intent. Absent = follow server / in inbox. */
  archived: Record<string, boolean>;
  /** convId → pinned intent. Absent = follow server / unpinned. */
  pinned: Record<string, boolean>;
  /** convId → the viewer's request resolution. Absent = still pending. */
  requests: Record<string, RequestResolution>;
  /** `null` clears the override so the thread follows server state again. */
  setMuted: (id: string, muted: boolean | null) => void;
  setArchived: (id: string, archived: boolean | null) => void;
  setPinned: (id: string, pinned: boolean | null) => void;
  /** `null` re-opens a resolved request (live-write revert). */
  setRequestResolution: (id: string, resolution: RequestResolution | null) => void;
}

export const useInboxPrefs = create<InboxPrefsState>()(
  persist(
    (set) => ({
      muted: {},
      archived: {},
      pinned: {},
      requests: {},
      setMuted: (id, muted) =>
        set((s) => {
          const next = { ...s.muted };
          if (muted === null) delete next[id];
          else next[id] = muted;
          return { muted: next };
        }),
      setArchived: (id, archived) =>
        set((s) => {
          const next = { ...s.archived };
          if (archived === null) delete next[id];
          else next[id] = archived;
          return { archived: next };
        }),
      setPinned: (id, pinned) =>
        set((s) => {
          const next = { ...s.pinned };
          if (pinned === null) delete next[id];
          else next[id] = pinned;
          return { pinned: next };
        }),
      setRequestResolution: (id, resolution) =>
        set((s) => {
          const next = { ...s.requests };
          if (resolution === null) delete next[id];
          else next[id] = resolution;
          return { requests: next };
        }),
    }),
    {
      name: 'thryftverse.web.inbox-prefs',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        muted: s.muted,
        archived: s.archived,
        pinned: s.pinned,
        requests: s.requests,
      }),
      version: 3,
      migrate: (persisted): InboxPrefsState => {
        const old = persisted as
          | { mutedIds?: string[]; archivedIds?: string[] }
          | Partial<InboxPrefsState>
          | undefined;
        const base = old && typeof old === 'object' ? old : {};
        const maps =
          'muted' in base && typeof base.muted === 'object'
            ? base
            : {
                muted: Object.fromEntries(
                  ((base as { mutedIds?: string[] }).mutedIds ?? []).map((id) => [id, true]),
                ),
                archived: Object.fromEntries(
                  ((base as { archivedIds?: string[] }).archivedIds ?? []).map((id) => [id, true]),
                ),
              };
        return {
          muted: maps.muted ?? {},
          archived: maps.archived ?? {},
          pinned: maps.pinned ?? {},
          requests:
            'requests' in base && typeof base.requests === 'object'
              ? (base.requests as Record<string, RequestResolution>)
              : {},
        } as InboxPrefsState;
      },
    },
  ),
);
