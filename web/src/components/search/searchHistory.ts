'use client';

/**
 * Search history — recent searches persisted to localStorage (mirrors
 * services/searchHistory.ts). Saved searches live in
 * lib/store/savedSearches.ts — one store, one source of truth.
 *
 * The storage key is namespaced by session identity
 * (`…recent-searches.<userId>`): a previous account's history can never
 * surface under a new identity, and a guest session starts from an empty
 * guest bucket. `useRecentSearches` re-reads when the session user
 * changes so a mid-session switch lands the right list.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/session/SessionProvider';

const RECENT_KEY = 'thryftverse.recent-searches';
const MAX_RECENT = 8;

function keyFor(userId: string | null): string {
  return `${RECENT_KEY}.${userId ?? 'guest'}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full / private mode — history is a convenience, not a failure.
  }
}

export function recordRecentSearch(
  term: string,
  userId: string | null = null,
): string[] {
  const key = keyFor(userId);
  const t = term.trim();
  if (!t) return readJson<string[]>(key, []);
  const next = [
    t,
    ...readJson<string[]>(key, []).filter(
      (x) => x.toLowerCase() !== t.toLowerCase(),
    ),
  ].slice(0, MAX_RECENT);
  writeJson(key, next);
  return next;
}

/** Reactive recent-search list — scoped to the session identity, loaded
 *  after mount (SSR-safe) and re-read on every identity change. */
export function useRecentSearches() {
  const { user } = useSession();
  const userId = user?.id ?? null;
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(readJson<string[]>(keyFor(userId), []));
  }, [userId]);

  const add = useCallback(
    (term: string) => {
      setRecent(recordRecentSearch(term, userId));
    },
    [userId],
  );

  const remove = useCallback(
    (term: string) => {
      setRecent((prev) => {
        const next = prev.filter((x) => x !== term);
        writeJson(keyFor(userId), next);
        return next;
      });
    },
    [userId],
  );

  const clear = useCallback(() => {
    writeJson(keyFor(userId), []);
    setRecent([]);
  }, [userId]);

  return { recent, add, remove, clear };
}
