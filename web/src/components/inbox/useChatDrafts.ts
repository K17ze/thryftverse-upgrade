'use client';

/**
 * useChatDrafts — per-conversation composer drafts. The mobile grammar
 * (conversation.draftText, setConversationDraft): typing in one thread,
 * switching away and coming back restores the unsent text, and the inbox
 * row previews it as "Draft". Text drafts only — a staged attachment or
 * an in-progress edit is composer-session state, not a draft.
 *
 * Persisted so a draft survives reload (the composer is the one surface
 * where losing text reads as a defect). Whitespace-only entries are
 * deleted, not stored.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Bound on the persisted map — a draft older than the most recent 100
 *  conversations is dead weight (same cap grammar as notificationCursor). */
const MAX_DRAFT_THREADS = 100;

function capDrafts(drafts: Record<string, string>): Record<string, string> {
  const keys = Object.keys(drafts);
  if (keys.length <= MAX_DRAFT_THREADS) return drafts;
  const keep = keys.slice(keys.length - MAX_DRAFT_THREADS);
  const next: Record<string, string> = {};
  for (const k of keep) next[k] = drafts[k];
  return next;
}

interface ChatDraftsState {
  drafts: Record<string, string>;
  /** Empty / whitespace-only text clears the thread's draft. */
  setDraft: (conversationId: string, text: string) => void;
}

export const useChatDrafts = create<ChatDraftsState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (conversationId, text) =>
        set((s) => {
          const trimmed = text.trim();
          const has = Object.prototype.hasOwnProperty.call(s.drafts, conversationId);
          // No-op guard — identical writes and clearing an absent draft
          // must not churn the persisted map on every keystroke.
          if (!trimmed) return has ? { drafts: capDrafts(omit(s.drafts, conversationId)) } : s;
          if (s.drafts[conversationId] === text) return s;
          return { drafts: capDrafts({ ...s.drafts, [conversationId]: text }) };
        }),
    }),
    {
      name: 'thryftverse.web.chat-drafts',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ drafts: capDrafts(s.drafts) }),
      version: 1,
      migrate: (persisted) => {
        const old = persisted as { drafts?: unknown } | undefined;
        const drafts =
          old?.drafts && typeof old.drafts === 'object' && !Array.isArray(old.drafts)
            ? (old.drafts as Record<string, string>)
            : {};
        return { drafts: capDrafts(drafts) };
      },
    },
  ),
);

function omit(drafts: Record<string, string>, id: string): Record<string, string> {
  const next = { ...drafts };
  delete next[id];
  return next;
}
