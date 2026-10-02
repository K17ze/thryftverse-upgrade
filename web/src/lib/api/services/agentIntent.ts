/**
 * Recommendation intent service — GET/POST /recommendations/intent/:userId/*
 * (backend/api/src/routes/recommendationIntent.ts). The intent profile is
 * the real "Your algorithm" wire: topics carry a server-side influence band
 * and a removable flag derived from whether the signal came from history.
 * No local fallback — when the backend can't answer, callers show the
 * honest unavailable state, never seed topics (same rule as the native
 * YourAlgorithmScreen).
 */

import { fetchJson } from '../http';

export interface AlgorithmIntentTopic {
  id: string;
  label: string;
  category: string;
  influenceBand: 'more' | 'usual' | 'less' | 'excluded' | string;
  sourceType: string;
  evidenceCount: number;
  removable: boolean;
  paused: boolean;
  lastEvidenceAt: string | null;
  updatedAt: string;
}

export interface AlgorithmIntentProfile {
  intentVersion: number;
  profileMode: string;
  topics: AlgorithmIntentTopic[];
}

export async function fetchAlgorithmIntentProfile(
  userId: string,
  signal?: AbortSignal,
): Promise<AlgorithmIntentProfile> {
  return fetchJson<AlgorithmIntentProfile>(
    `/recommendations/intent/${encodeURIComponent(userId)}/profile`,
    undefined,
    { signal },
  );
}

export type AlgorithmIntentDirection =
  | 'more'
  | 'usual'
  | 'less'
  | 'exclude'
  | 'add'
  | 'remove';

export async function mutateAlgorithmIntent(
  userId: string,
  input: {
    idempotencyKey: string;
    targetId: string;
    targetLabel: string;
    direction: AlgorithmIntentDirection;
    topicCategory?: string;
    expectedIntentVersion?: number;
  },
): Promise<{ mutationId: number; intentVersion: number; status: string }> {
  return fetchJson(`/recommendations/intent/${encodeURIComponent(userId)}/mutate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: input.idempotencyKey,
      scope: 'topic',
      targetId: input.targetId,
      targetLabel: input.targetLabel,
      direction: input.direction,
      source: 'your_algorithm',
      ...(input.topicCategory ? { topicCategory: input.topicCategory } : {}),
      ...(input.expectedIntentVersion !== undefined
        ? { expectedIntentVersion: input.expectedIntentVersion }
        : {}),
    }),
  });
}

export async function resetAlgorithmIntent(
  userId: string,
): Promise<{ intentVersion: number; status: string }> {
  return fetchJson(`/recommendations/intent/${encodeURIComponent(userId)}/reset`, {
    method: 'POST',
  });
}
