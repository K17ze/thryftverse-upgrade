import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { useBackendData } from '../../context/BackendDataContext';
import { useStore } from '../../store/useStore';
import { fetchConversationsFromApi } from '../../services/chatApi';
import { useHaptic } from '../useHaptic';
import { useVisuallyComplete } from '../../performance/visuallyComplete';

/**
 * Owns the inbox data lifecycle: the initial/focus refetch, pull-to-refresh,
 * connectivity state, the sync error surfaced by banners/empty states, and
 * the visually-complete readiness milestones.
 */
export function useInboxData() {
  const haptic = useHaptic();
  const { refreshListings } = useBackendData();
  const upsertConversation = useStore((state) => state.upsertConversation);
  const markConversationsLoaded = useStore((state) => state.markConversationsLoaded);
  const reportReady = useVisuallyComplete('Inbox');
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [syncError, setSyncError] = useState('');
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  const loadBotsFromApi = useStore((state) => state.loadBotsFromApi);
  const loadConversations = useCallback(async () => {
    setSyncError('');
    setIsLoading(true);
    try {
      const [remoteConversations] = await Promise.all([
        fetchConversationsFromApi(),
        loadBotsFromApi(),
      ]);
      for (const conversation of remoteConversations) {
        upsertConversation(conversation);
      }
    } catch (error) {
      setSyncError((error as Error).message || 'Unable to load conversations.');
    } finally {
      setIsLoading(false);
      markConversationsLoaded();
    }
  }, [upsertConversation, loadBotsFromApi, markConversationsLoaded]);

  // Refetch on every focus — covers the initial mount and returns from
  // Chat/offers/orders where conversations are created or mutated while
  // this screen stayed mounted. The skeleton only renders when the list
  // is empty (`isLoading && !visibleConversations.length`), so refocus
  // with existing rows refreshes silently.
  useFocusEffect(
    useCallback(() => {
      void loadConversations();
    }, [loadConversations])
  );

  // Readiness milestones: 'data-ready' when the initial conversation fetch
  // settles (isLoading flips false in loadConversations' finally — covering
  // both success and error), 'interaction-ready' with it since the list and
  // composer entry points are usable once the skeleton clears.
  useEffect(() => {
    if (!isLoading) {
      reportReady('data-ready');
      reportReady('interaction-ready');
    }
  }, [isLoading, reportReady]);

  const handleRefresh = async () => {
    haptic.patterns.refresh();
    setRefreshing(true);
    setSyncError('');
    await refreshListings();
    try {
      const [remoteConversations] = await Promise.all([
        fetchConversationsFromApi(),
        loadBotsFromApi(),
      ]);
      for (const conversation of remoteConversations) {
        upsertConversation(conversation);
      }
    } catch (error) {
      setSyncError((error as Error).message || 'Unable to refresh conversations.');
    }
    setRefreshing(false);
  };

  return {
    refreshing,
    isLoading,
    syncError,
    isOffline,
    loadConversations,
    handleRefresh,
  };
}
