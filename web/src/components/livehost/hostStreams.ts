'use client';

/**
 * Host stream session runtime — the fixture-mode store behind the seller
 * "go live" flow. Mirrors auction-queries' runtime grammar: shows authored
 * this session live in a module map and sync into the live hub's
 * ['live-sessions'] query cache (scheduled → Coming up, live → Live now,
 * ended → Replays). Everything dissolves on reload; the surfaces say so.
 */

import type { QueryClient } from '@tanstack/react-query';
import { LIVE_SESSIONS, type LiveSession } from '@/lib/data/fixtures-media';
import { CURRENT_USER } from '@/lib/data/fixtures';
import { seededRandom } from '@/components/live/useLivePresence';

/** Simulated results captured when the host ends the show. */
export interface HostSummaryStats {
  peakViewers: number;
  pinClicks: number;
  orders: number;
}

export interface HostStream {
  session: LiveSession;
  /** Ordered listing ids pinned for the show — first is on the table. */
  pinIds: string[];
  /** Epoch ms — set when the show actually goes live. */
  startedAtMs: number | null;
  endedAtMs: number | null;
  /** Written once on end — the summary surface reads it from here. */
  summaryStats: HostSummaryStats | null;
}

export interface HostStreamInput {
  title: string;
  coverUri: string;
  coverAspectRatio: number;
  pinIds: string[];
  /** ISO — present when the show is scheduled for later. */
  scheduledAt?: string;
}

const hostStreams = new Map<string, HostStream>();
let counter = 0;

/** Seeded base audience for a demo show — deterministic per session id. */
export function seedBaseViewers(sessionId: string): number {
  const rand = seededRandom(`${sessionId}:base-viewers`);
  return 48 + Math.floor(rand() * 160);
}

export function createHostStream(input: HostStreamInput): HostStream {
  counter += 1;
  const id = `host-${Date.now().toString(36)}-${counter}`;
  const live = input.scheduledAt == null;
  const session: LiveSession = {
    id,
    title: input.title,
    sellerId: CURRENT_USER.id,
    coverUri: input.coverUri,
    aspectRatio: input.coverAspectRatio,
    status: live ? 'live' : 'upcoming',
    viewers: live ? seedBaseViewers(id) : undefined,
    scheduledAt: input.scheduledAt,
  };
  const stream: HostStream = {
    session,
    pinIds: [...input.pinIds],
    startedAtMs: live ? Date.now() : null,
    endedAtMs: null,
    summaryStats: null,
  };
  hostStreams.set(id, stream);
  return stream;
}

export function getHostStream(id: string): HostStream | null {
  return hostStreams.get(id) ?? null;
}

function mutate(id: string, update: (s: HostStream) => void): HostStream | null {
  const s = hostStreams.get(id);
  if (!s) return null;
  update(s);
  return s;
}

/** Upsert into the live hub's query cache — the session-scoped write the
 *  hub lists read on their next render. A hub refetch past staleTime falls
 *  back to seeded fixtures, same honesty as the auctions session board. */
export function syncSessionToHub(qc: QueryClient, session: LiveSession): void {
  qc.setQueryData<LiveSession[]>(['live-sessions'], (old) => {
    const base = old ?? LIVE_SESSIONS;
    return [session, ...base.filter((s) => s.id !== session.id)];
  });
}

/** Flip a scheduled (or just-created) show to live. */
export function goLiveHostStream(
  qc: QueryClient,
  id: string,
): HostStream | null {
  const stream = mutate(id, (s) => {
    s.session.status = 'live';
    s.session.viewers = s.session.viewers ?? seedBaseViewers(id);
    s.startedAtMs = Date.now();
  });
  if (stream) syncSessionToHub(qc, stream.session);
  return stream;
}

/** End a live show — writes it to the hub's replay list for the session. */
export function endHostStream(
  qc: QueryClient,
  id: string,
  stats: HostSummaryStats,
): HostStream | null {
  const stream = mutate(id, (s) => {
    s.summaryStats = stats;
    const endedAt = Date.now();
    s.endedAtMs = endedAt;
    s.session.status = 'ended';
    s.session.viewers = undefined;
    s.session.durationMinutes = Math.max(
      1,
      Math.round((endedAt - (s.startedAtMs ?? endedAt)) / 60_000),
    );
  });
  if (stream) syncSessionToHub(qc, stream.session);
  return stream;
}

export function setHostStreamPins(id: string, pinIds: string[]): void {
  mutate(id, (s) => {
    s.pinIds = [...pinIds];
  });
}

export const MAX_PINS = 6;

/** mm:ss / h:mm:ss — port of mobile liveSellerUtils.formatClock. */
export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
