'use client';

/**
 * useConversationPrefs — the single read/write path for per-viewer
 * conversation preferences (mute, archive).
 *
 * Reads resolve display truth: a hydrated local override wins, then the
 * live `conversation.isMuted`/`isArchived` flag, then "not set". Writes
 * are intent: the override lands optimistically, live mode posts the
 * matching edge (POST/DELETE /mute|/archive), and a failed write reverts
 * to the prior override — or clears it so the thread follows the server
 * again — and says so in a toast. Fixture mode stays local; the
 * 'conversations' caches are re-read either way so a refetch can never
 * contradict the row.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Conversation } from '@/lib/contracts/domain';
import { DATA_MODE } from '@/lib/api/client';
import * as chatService from '@/lib/api/services/chat';
import { liveConversationApi } from './groupAdmin';
import { useInboxPrefs } from '@/lib/store/inboxPrefs';
import { useHydrated } from '@/lib/store/useStore';
import { useToast } from '@/components/ui/Toast';

type PrefApply = (id: string, value: boolean | null) => void;
type PrefEdge = (id: string, value: boolean) => Promise<void>;

export function useConversationPrefs() {
  const qc = useQueryClient();
  const toast = useToast();
  const hydrated = useHydrated();
  const mutedMap = useInboxPrefs((s) => s.muted);
  const archivedMap = useInboxPrefs((s) => s.archived);
  const pinnedMap = useInboxPrefs((s) => s.pinned);
  const setMutedPref = useInboxPrefs((s) => s.setMuted);
  const setArchivedPref = useInboxPrefs((s) => s.setArchived);
  const setPinnedPref = useInboxPrefs((s) => s.setPinned);

  const isMuted = useCallback(
    (c: Conversation) => (hydrated ? mutedMap[c.id] : undefined) ?? c.isMuted === true,
    [hydrated, mutedMap],
  );

  const isArchived = useCallback(
    (c: Conversation) => (hydrated ? archivedMap[c.id] : undefined) ?? c.isArchived === true,
    [hydrated, archivedMap],
  );

  // The web conversation mapper doesn't surface a pin field yet — a live
  // payload that carries one is still honoured, else the hydrated local
  // override is the only truth (absent = unpinned).
  const isPinned = useCallback(
    (c: Conversation) =>
      (hydrated ? pinnedMap[c.id] : undefined) ??
      (c as { isPinned?: boolean }).isPinned === true,
    [hydrated, pinnedMap],
  );

  const writePref = useCallback(
    (
      c: Conversation,
      next: boolean,
      map: Record<string, boolean>,
      apply: PrefApply,
      edge: PrefEdge,
      label: string,
    ) => {
      // false and absent revert differently — absent restores "follow
      // server", so the prior entry is read before the write lands.
      const prev = Object.prototype.hasOwnProperty.call(map, c.id) ? map[c.id] : null;
      apply(c.id, next);
      if (DATA_MODE === 'live') {
        edge(c.id, next)
          .then(() => qc.invalidateQueries({ queryKey: ['conversations'] }))
          .catch(() => {
            apply(c.id, prev);
            toast.show(`Couldn't ${label} this conversation — try again`, 'error');
          });
        return;
      }
      void qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    [qc, toast],
  );

  const setMuted = useCallback(
    (c: Conversation, muted: boolean) =>
      writePref(
        c,
        muted,
        mutedMap,
        setMutedPref,
        chatService.setConversationMuted,
        muted ? 'mute' : 'unmute',
      ),
    [mutedMap, setMutedPref, writePref],
  );

  const setArchived = useCallback(
    (c: Conversation, archived: boolean) =>
      writePref(
        c,
        archived,
        archivedMap,
        setArchivedPref,
        chatService.setConversationArchived,
        archived ? 'archive' : 'unarchive',
      ),
    [archivedMap, setArchivedPref, writePref],
  );

  const setPinned = useCallback(
    (c: Conversation, pinned: boolean) =>
      writePref(
        c,
        pinned,
        pinnedMap,
        setPinnedPref,
        async (id, value) => {
          await liveConversationApi.setPinned(id, value);
        },
        pinned ? 'pin' : 'unpin',
      ),
    [pinnedMap, setPinnedPref, writePref],
  );

  return { hydrated, isMuted, isArchived, isPinned, setMuted, setArchived, setPinned };
}
