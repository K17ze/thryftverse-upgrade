'use client';

/**
 * useLivePresence — the overlay's viewer-count tick. Fixture sessions carry
 * a seed count; while the overlay is open the count drifts on a slow tick
 * (bounded random walk around the seed) so presence reads alive without
 * pretending a socket exists. Seeded by session id — the walk is
 * deterministic across opens, matching fixture-mode honesty.
 */

import { useEffect, useState } from 'react';
import type { LiveSession } from '@/lib/data/fixtures-media';

/**
 * Deterministic PRNG (mulberry32) seeded from a string key. Shared by the
 * chat stream and reaction trickle so every overlay open replays the same
 * rhythm for a given session.
 */
export function seededRandom(seed: string): () => number {
  let a = 0x9e3779b9;
  for (let i = 0; i < seed.length; i++) {
    a = Math.imul(a ^ seed.charCodeAt(i), 0x85ebca6b);
    a >>>= 0;
  }
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TICK_MS = 4_200;

export function useLivePresence(session: LiveSession | null): number | null {
  const [viewers, setViewers] = useState<number | null>(session?.viewers ?? null);

  useEffect(() => {
    const base = session?.viewers ?? null;
    setViewers(base);
    if (!session || session.status !== 'live' || base == null) return;

    const rand = seededRandom(`${session.id}:viewers`);
    const id = window.setInterval(() => {
      setViewers((v) => {
        const drift = Math.round((rand() * 2 - 1) * Math.max(4, base * 0.02));
        const next = (v ?? base) + drift;
        return Math.max(Math.round(base * 0.85), Math.min(Math.round(base * 1.2), next));
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [session]);

  return viewers;
}
