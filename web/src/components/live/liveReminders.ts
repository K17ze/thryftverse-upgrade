'use client';

/**
 * Live reminders — the persisted "Remind me" set behind the Coming up
 * rail. Shares the localStorage key services/live.ts merges into
 * live-mode sessions (REMIND_KEY), so fixture and live reads agree.
 * Fixture mode writes the local flag only; live mode also posts through
 * setLiveReminder and patches the hub's ['live-sessions'] cache so the
 * row reflects state without a refetch.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { setLiveReminder } from '@/lib/api/services/live';
import type { LiveSession } from '@/lib/data/fixtures-media';

/** Same key services/live.ts reads — the two writers must stay in sync. */
const REMIND_KEY = 'thryftverse.live.reminders.v1';
const EMPTY: ReadonlySet<string> = new Set();

let cache: Set<string> | null = null;
const listeners = new Set<() => void>();

function readSet(): Set<string> {
  if (cache) return cache;
  if (typeof window === 'undefined') return new Set();
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(REMIND_KEY) ?? '[]',
    ) as unknown;
    cache = new Set(
      Array.isArray(parsed)
        ? parsed.filter((x): x is string => typeof x === 'string')
        : [],
    );
  } catch {
    cache = new Set();
  }
  return cache;
}

function writeSet(next: Set<string>) {
  cache = next;
  try {
    window.localStorage.setItem(REMIND_KEY, JSON.stringify([...next]));
  } catch {
    // best-effort — the in-memory set still drives the UI this session.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getServerSnapshot = (): ReadonlySet<string> => EMPTY;

export function useLiveReminders(): {
  reminded: ReadonlySet<string>;
  /** Flips the flag and persists it; returns the new state for toasts. */
  toggle: (session: LiveSession) => boolean;
} {
  const qc = useQueryClient();
  const reminded = useSyncExternalStore(subscribe, readSet, getServerSnapshot);

  const toggle = useCallback(
    (session: LiveSession) => {
      const next = new Set(readSet());
      const on = !next.has(session.id);
      if (on) next.add(session.id);
      else next.delete(session.id);
      writeSet(next);

      if (DATA_MODE === 'live') {
        // Backend write + the same local flag (setLiveReminder lands the
        // local write in `finally` even when the request fails).
        void setLiveReminder(session.id, on).catch(() => {});
        qc.setQueryData<LiveSession[]>(['live-sessions'], (old) =>
          old?.map((s) => (s.id === session.id ? { ...s, reminderSet: on } : s)),
        );
      }
      return on;
    },
    [qc],
  );

  return { reminded, toggle };
}
