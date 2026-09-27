'use client';

/**
 * Search history — recent searches persisted to localStorage (mirrors
 * services/searchHistory.ts). Saved searches live in
 * lib/store/savedSearches.ts — one store, one source of truth.
 */

import { useCallback, useEffect, useState } from 'react';

const RECENT_KEY = 'thryftverse.recent-searches';
const MAX_RECENT = 8;

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

export function recordRecentSearch(term: string): string[] {
  const t = term.trim();
  if (!t) return readJson<string[]>(RECENT_KEY, []);
  const next = [
    t,
    ...readJson<string[]>(RECENT_KEY, []).filter(
      (x) => x.toLowerCase() !== t.toLowerCase(),
    ),
  ].slice(0, MAX_RECENT);
  writeJson(RECENT_KEY, next);
  return next;
}

/** Reactive recent-search list — loads after mount (SSR-safe). */
export function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    setRecent(readJson<string[]>(RECENT_KEY, []));
  }, []);

  const add = useCallback((term: string) => {
    setRecent(recordRecentSearch(term));
  }, []);

  const remove = useCallback((term: string) => {
    setRecent((prev) => {
      const next = prev.filter((x) => x !== term);
      writeJson(RECENT_KEY, next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    writeJson(RECENT_KEY, []);
    setRecent([]);
  }, []);

  return { recent, add, remove, clear };
}
