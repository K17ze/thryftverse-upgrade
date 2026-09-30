'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import { parseApiError } from '@/lib/api/http';
import {
  fetchAlgorithmIntentProfile,
  mutateAlgorithmIntent,
  resetAlgorithmIntent,
  type AlgorithmIntentProfile,
} from '@/lib/api/services/agents';
import { useSession } from '@/lib/session/SessionProvider';
import { useAgentsAccess } from '../AgentsGate';
import { SUGGESTED_TOPICS, weightToDirection } from './AlgorithmPrimitives';
import type { TopicWeight } from '../useAlgorithmPrefs';

export function useLiveAlgorithmWorkflow() {
  const { show } = useToast();
  const { user } = useSession();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const [query, setQuery] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const profileKey = ['algorithm-intent', userId ?? ''] as const;
  const { data: profile, isLoading, isError, error, refetch } = useQuery({
    queryKey: profileKey,
    enabled: !!userId,
    queryFn: ({ signal }) => fetchAlgorithmIntentProfile(userId as string, signal),
  });
  const access = useAgentsAccess(error);

  const topics = useMemo(() => profile?.topics ?? [], [profile]);
  const tunedCount = useMemo(
    () =>
      topics.filter((t) => t.influenceBand === 'more' || t.influenceBand === 'less').length,
    [topics],
  );

  const existing = useMemo(
    () => new Set(topics.map((t) => t.label.toLowerCase())),
    [topics],
  );
  const quickPicks = useMemo(
    () => SUGGESTED_TOPICS.filter((s) => !existing.has(s.toLowerCase())).slice(0, 6),
    [existing],
  );

  const applyMutation = async (
    pendingKey: string,
    input: {
      idempotencyKey: string;
      targetId: string;
      targetLabel: string;
      direction: 'more' | 'usual' | 'less' | 'add' | 'remove';
      topicCategory?: string;
    },
    optimistic?: (prev: AlgorithmIntentProfile) => AlgorithmIntentProfile,
  ) => {
    if (!userId || busyKey) return;
    setBusyKey(pendingKey);
    const prev = queryClient.getQueryData<AlgorithmIntentProfile>(profileKey);
    if (prev && optimistic) queryClient.setQueryData(profileKey, optimistic(prev));
    try {
      await mutateAlgorithmIntent(userId, input);
      await queryClient.invalidateQueries({ queryKey: profileKey });
    } catch (err) {
      if (prev) queryClient.setQueryData(profileKey, prev);
      show(parseApiError(err, 'Couldn’t update your algorithm').message, 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const addTopic = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed || existing.has(trimmed.toLowerCase())) return;
    const targetId = `topic-user-${Date.now()}`;
    void applyMutation(
      `add-${targetId}`,
      {
        idempotencyKey: `add-${targetId}`,
        targetId,
        targetLabel: trimmed,
        direction: 'add',
        topicCategory: 'Category preference',
      },
      (prev) => ({
        ...prev,
        topics: [
          {
            id: targetId,
            label: trimmed,
            category: 'Category preference',
            influenceBand: 'usual',
            sourceType: 'explicit',
            evidenceCount: 0,
            removable: true,
            paused: false,
            lastEvidenceAt: null,
            updatedAt: new Date().toISOString(),
          },
          ...prev.topics,
        ],
      }),
    );
    setQuery('');
  };

  const updateTopicWeight = (topicId: string, label: string, weight: TopicWeight) => {
    const direction = weightToDirection(weight);
    void applyMutation(
      topicId,
      {
        idempotencyKey: `weight-${topicId}-${weight}`,
        targetId: topicId,
        targetLabel: label,
        direction,
      },
      (prev) => ({
        ...prev,
        topics: prev.topics.map((t) =>
          t.id === topicId
            ? { ...t, influenceBand: direction === 'more' ? 'more' : direction === 'less' ? 'less' : 'usual' }
            : t,
        ),
      }),
    );
  };

  const removeTopic = (topicId: string, label: string) => {
    void applyMutation(
      topicId,
      {
        idempotencyKey: `remove-${topicId}-${Date.now()}`,
        targetId: topicId,
        targetLabel: label,
        direction: 'remove',
      },
      (prev) => ({
        ...prev,
        topics: prev.topics.filter((t) => t.id !== topicId),
      }),
    );
  };

  const onReset = async () => {
    if (!userId || resetting) return;
    setResetting(true);
    try {
      await resetAlgorithmIntent(userId);
      await queryClient.invalidateQueries({ queryKey: profileKey });
      show('Your algorithm was reset', 'info');
    } catch (err) {
      show(parseApiError(err, 'Couldn’t reset your algorithm').message, 'error');
    } finally {
      setResetting(false);
    }
  };

  const removableTopics = topics.filter((t) => t.removable);
  const derivedTopics = topics.filter((t) => !t.removable);

  return {
    access,
    profile,
    isLoading,
    isError,
    error,
    refetch,
    tunedCount,
    query,
    setQuery,
    busyKey,
    resetting,
    existing,
    quickPicks,
    addTopic,
    updateTopicWeight,
    removeTopic,
    onReset,
    removableTopics,
    derivedTopics,
  };
}
