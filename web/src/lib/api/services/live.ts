/**
 * Web live-shopping service — mirrors the mobile liveShoppingApi.
 * `/streaming/sessions` returns BackendStreamRoom rows; map them onto the
 * web LiveSession contract. `reminded` merges from localStorage when the
 * backend does not echo a per-viewer flag (same merge as mobile).
 */

import { fetchJson } from '../http';
import type { LiveSession } from '@/lib/data/fixtures-media';

interface BackendStreamRoom {
  roomId: string;
  title: string;
  hostUserId: string;
  status: 'created' | 'live' | 'ended' | 'failed';
  roomUrl: string;
  recordingUrl?: string | null;
  recordingEnabled?: boolean;
  viewerCount: number;
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  scheduledStartAt?: string | null;
  scheduled_start_at?: string | null;
  hostUsername?: string | null;
  hostAvatarUrl?: string | null;
  hostVerified?: boolean | null;
  currentLotTitle?: string | null;
  currentLotPriceMinor?: number | null;
  thumbnailUrl?: string | null;
  reminded?: boolean | null;
}

interface BackendStreamSessionsResponse {
  ok: boolean;
  sessions: BackendStreamRoom[];
}

const REMIND_KEY = 'thryftverse.live.reminders.v1';

function readLocalReminders(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(REMIND_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeLocalReminder(id: string, on: boolean) {
  if (typeof window === 'undefined') return;
  const set = readLocalReminders();
  if (on) set.add(id);
  else set.delete(id);
  try {
    window.localStorage.setItem(REMIND_KEY, JSON.stringify([...set]));
  } catch {
    // best-effort
  }
}

function mapRoom(room: BackendStreamRoom): LiveSession {
  const scheduledStartAt = room.scheduledStartAt ?? room.scheduled_start_at ?? undefined;
  const remindedFlag = room.reminded ?? (readLocalReminders().has(room.roomId) ? true : undefined);
  return {
    id: room.roomId,
    sellerId: room.hostUserId,
    sellerName: room.hostUsername ?? '',
    sellerAvatar: room.hostAvatarUrl ?? '',
    sellerVerified: room.hostVerified ?? false,
    title: room.title,
    category: 'All',
    coverUri: room.thumbnailUrl ?? '',
    aspectRatio: 16 / 10,
    viewers: room.viewerCount,
    likeCount: 0,
    status:
      room.status === 'live' || (room.status as string) === 'ending'
        ? 'live'
        : room.status === 'ended' || room.status === 'failed'
          ? 'ended'
          : 'upcoming',
    startedAt: room.startedAt,
    scheduledAt: scheduledStartAt,
    endedAt: room.endedAt,
    currentItemTitle: room.currentLotTitle ?? undefined,
    currentBid: room.currentLotPriceMinor != null ? room.currentLotPriceMinor / 100 : undefined,
    recordingUrl: room.recordingUrl ?? null,
    recordingEnabled: room.recordingEnabled ?? false,
    isFollowing: false,
    reminderSet: remindedFlag,
    isDemo: false,
  };
}

export async function fetchLiveSessions(signal?: AbortSignal): Promise<LiveSession[]> {
  const res = await fetchJson<BackendStreamSessionsResponse>(
    '/streaming/sessions',
    undefined,
    { signal },
  );
  return (res.sessions ?? []).map(mapRoom);
}

export async function setLiveReminder(sessionId: string, on: boolean): Promise<void> {
  try {
    if (on) {
      await fetchJson(`/streaming/sessions/${encodeURIComponent(sessionId)}/remind`, {
        method: 'POST',
      });
    } else {
      await fetchJson(`/streaming/sessions/${encodeURIComponent(sessionId)}/remind`, {
        method: 'DELETE',
      });
    }
  } finally {
    // Local flag always lands — it merges back on the next fetch when the
    // backend doesn't echo `reminded`.
    writeLocalReminder(sessionId, on);
  }
}
