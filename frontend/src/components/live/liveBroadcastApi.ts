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

import { fetchJson } from '../../lib/apiClient';

export interface BroadcastSession {
  roomId: string;
  title: string;
  hostUserId: string;
  status: 'created' | 'live' | 'ended' | 'failed';
  roomUrl: string;
  recordingUrl?: string;
  viewerCount: number;
  createdAt: string;
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

/** Create a stream session (host only — seller/admin role required). */
export async function createBroadcastSession(params: {
  title: string;
  recordingEnabled?: boolean;
  maxViewers?: number;
}): Promise<BroadcastSession> {
  const response = await fetchJson<SessionResponse>('/streaming/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: params.title,
      recordingEnabled: params.recordingEnabled ?? false,
      maxViewers: params.maxViewers ?? 0,
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
