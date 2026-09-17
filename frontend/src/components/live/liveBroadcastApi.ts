/**
 * liveBroadcastApi — thin typed wrappers over the real backend streaming
 * session lifecycle routes (backend/api/src/routes/streaming.ts).
 *
 * These endpoints exist on the backend today but are not yet exposed through
 * `services/liveShoppingApi.ts` (its non-demo paths for createLiveStream /
 * endLiveStream are stubs that report "not available"). This module bridges
 * the gap for the seller broadcast flow. Once the service layer grows
 * first-class session lifecycle functions, this file can be deleted.
 *
 * No mock branches: every function calls the real route. Failures throw —
 * callers surface honest error states.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchJson, ApiRequestError } from '../../lib/apiClient';

export interface BroadcastSession {
  roomId: string;
  title: string;
  hostUserId: string;
  status: 'created' | 'live' | 'ended' | 'failed';
  roomUrl: string;
  recordingUrl?: string;
  viewerCount: number;
  createdAt: string;
  /** Present when the session was created as a scheduled show (future ISO). */
  scheduledStartAt?: string | null;
  startedAt?: string;
  endedAt?: string;
}

export interface BroadcastHostToken {
  token: string;
  wsUrl: string;
  roomId: string;
  identity: string;
}

interface SessionResponse {
  ok: boolean;
  session: BroadcastSession | null;
}

/** Create a stream session (host only — seller/admin role required).
 *  Pass `scheduledStartAt` (future ISO string) to create a scheduled show —
 *  the session stays in 'created' status and appears in Coming up until the
 *  host starts it. */
export async function createBroadcastSession(params: {
  title: string;
  recordingEnabled?: boolean;
  maxViewers?: number;
  scheduledStartAt?: string;
}): Promise<BroadcastSession> {
  const response = await fetchJson<SessionResponse>('/streaming/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: params.title,
      recordingEnabled: params.recordingEnabled ?? false,
      maxViewers: params.maxViewers ?? 0,
      ...(params.scheduledStartAt ? { scheduledStartAt: params.scheduledStartAt } : {}),
    }),
  });
  if (!response.ok || !response.session) {
    throw new Error('Stream session was not created');
  }
  return response.session;
}

/** Transition a created session to live (host only). */
export async function startBroadcastSession(roomId: string): Promise<BroadcastSession> {
  const response = await fetchJson<SessionResponse>(
    `/streaming/sessions/${encodeURIComponent(roomId)}/start`,
    { method: 'POST' },
  );
  if (!response.ok || !response.session) {
    throw new Error('Stream session did not start');
  }
  return response.session;
}

/** End a live session (host only). */
export async function endBroadcastSession(roomId: string): Promise<BroadcastSession> {
  const response = await fetchJson<SessionResponse>(
    `/streaming/sessions/${encodeURIComponent(roomId)}/end`,
    { method: 'POST' },
  );
  if (!response.ok || !response.session) {
    throw new Error('Stream session did not end');
  }
  return response.session;
}

/** Fetch a session snapshot (used to resume an in-progress broadcast). */
export async function fetchBroadcastSession(roomId: string): Promise<BroadcastSession | null> {
  const response = await fetchJson<SessionResponse>(
    `/streaming/sessions/${encodeURIComponent(roomId)}`,
  );
  return response.session ?? null;
}

/** Request a host token — LiveKit credentials for publishing video. */
export async function fetchBroadcastHostToken(roomId: string): Promise<BroadcastHostToken> {
  const response = await fetchJson<{ ok: boolean; token?: BroadcastHostToken }>(
    `/streaming/sessions/${encodeURIComponent(roomId)}/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'host' }),
    },
  );
  if (!response.ok || !response.token) {
    throw new Error('Host token was not issued');
  }
  return response.token;
}

// ── Session reminders ("Remind me" on scheduled shows) ──────────────────────

/**
 * Thrown when the remind endpoints are not deployed on the backend (404).
 * Callers should hide the affordance rather than fake reminder state.
 */
export class LiveRemindersUnavailableError extends Error {
  constructor(message = 'Session reminders are not available on this backend') {
    super(message);
    this.name = 'LiveRemindersUnavailableError';
  }
}

function rethrowRemindError(error: unknown): never {
  if (error instanceof ApiRequestError && error.status === 404) {
    throw new LiveRemindersUnavailableError();
  }
  throw error;
}

/** Opt the viewer in to a reminder for a scheduled session (auth required). */
export async function remindBroadcastSession(roomId: string): Promise<void> {
  try {
    await fetchJson<{ ok: boolean }>(
      `/streaming/sessions/${encodeURIComponent(roomId)}/remind`,
      { method: 'POST' },
    );
  } catch (error) {
    rethrowRemindError(error);
  }
}

/** Remove the viewer's reminder for a scheduled session (auth required). */
export async function unremindBroadcastSession(roomId: string): Promise<void> {
  try {
    await fetchJson<{ ok: boolean }>(
      `/streaming/sessions/${encodeURIComponent(roomId)}/remind`,
      { method: 'DELETE' },
    );
  } catch (error) {
    rethrowRemindError(error);
  }
}

// ── Local reminder persistence ──────────────────────────────────────────────
// When the backend does not echo a per-viewer `reminded` flag on
// GET /streaming/sessions, the reminder state is persisted on-device so the
// toggle survives reloads. Device-local only — never presented as server
// state (the `reminded` flag wins when the backend provides one).

const LOCAL_REMINDERS_KEY = 'thryftverse.live.reminders.v1';

/** Load the locally-persisted set of session ids the viewer asked to be
 *  reminded about. Returns an empty set on any storage/parse failure. */
export async function loadLocalReminderIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_REMINDERS_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

/** Persist (or clear) a reminder flag for a session id. Best-effort — the
 *  authoritative write already happened (or failed) on the backend. */
export async function persistLocalReminder(
  sessionId: string,
  reminded: boolean,
): Promise<void> {
  try {
    const ids = await loadLocalReminderIds();
    if (reminded) {
      ids.add(sessionId);
    } else {
      ids.delete(sessionId);
    }
    await AsyncStorage.setItem(LOCAL_REMINDERS_KEY, JSON.stringify([...ids]));
  } catch {
    // Local persistence is best-effort; the in-memory toggle still applies.
  }
}
