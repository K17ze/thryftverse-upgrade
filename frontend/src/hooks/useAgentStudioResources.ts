import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../store/useStore';
import { fetchConnectionsFromApi, fetchCustomBotsFromApi, fetchPendingApprovalsFromApi } from '../services/botsApi';

/** Fetch independently so a connection failure cannot masquerade as zero agents. */
export function useAgentStudioResources() {
  const viewerId = useStore((state) => state.currentUser?.id);
  const sequence = React.useRef(0);
  const [loading, setLoading] = React.useState(true);
  const [failed, setFailed] = React.useState(false);
  const reload = React.useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setFailed(false);
    const results = await Promise.allSettled([
      fetchCustomBotsFromApi(), fetchConnectionsFromApi(), fetchPendingApprovalsFromApi(),
    ]);
    if (request !== sequence.current || useStore.getState().currentUser?.id !== viewerId) return;
    const [bots, connections, approvals] = results;
    if (bots.status === 'fulfilled') useStore.setState({ customBots: bots.value });
    if (connections.status === 'fulfilled') useStore.setState({ providerConnections: connections.value });
    if (approvals.status === 'fulfilled') useStore.setState({ pendingApprovals: approvals.value });
    setFailed(results.some((result) => result.status === 'rejected'));
    setLoading(false);
  }, [viewerId]);
  useFocusEffect(React.useCallback(() => {
    void reload();
    return () => { sequence.current += 1; };
  }, [reload]));
  return { loading, failed, reload };
}
