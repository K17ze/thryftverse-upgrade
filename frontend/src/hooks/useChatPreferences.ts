import { useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { fetchChatPreferences, saveChatTheme, type ChatTheme } from '../services/chatPreferencesApi';

export function useChatPreferences(conversationId: string) {
  const userId = useStore((state) => state.currentUser?.id);
  const client = useQueryClient();
  const queryKey = useMemo(() => ['chat-preferences', userId, conversationId] as const, [userId, conversationId]);
  const enabled = Boolean(userId && conversationId);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchChatPreferences(conversationId, signal),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
  useFocusEffect(useCallback(() => {
    if (enabled) void client.invalidateQueries({ queryKey });
  }, [client, queryKey, enabled]));
  const mutation = useMutation({
    mutationFn: (theme: ChatTheme) => saveChatTheme(conversationId, theme),
    onMutate: () => client.cancelQueries({ queryKey }),
    onSuccess: (preferences) => client.setQueryData(queryKey, preferences),
    // A failed response can have an unknown outcome; re-read the persisted value.
    onError: () => { void client.invalidateQueries({ queryKey }); },
    retry: false,
  });
  return { query, mutation };
}
