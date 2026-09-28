import React from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useStore } from '../store/useStore';
import {
  fetchConnectionsFromApi,
  fetchCustomBotsFromApi,
  fetchPendingApprovalsFromApi,
  type ApprovalRequestInfo,
  type ProviderConnectionInfo } from '../services/botsApi';
import type { ChatBot } from '../domain';

export type AgentStudioResourceKey = 'bots' | 'connections' | 'approvals';

/**
 * Per-resource freshness contract (audit F17):
 *  - 'loading' — no fetch for this resource has resolved yet this session.
 *  - 'ok'      — last fetch succeeded; store data is fresh.
 *  - 'stale'   — last fetch failed, but a previous load succeeded. The store
 *                still holds the earlier payload; UI must label it as
 *                possibly out of date rather than confirmed-empty.
 *  - 'error'   — last fetch failed and nothing has ever loaded, so the store
 *                value (usually []) must NOT be presented as confirmed-empty.
 */
export type AgentStudioResourceStatus = 'loading' | 'ok' | 'stale' | 'error';

export interface AgentStudioResourceState {
  status: AgentStudioResourceStatus;
  /** Raw message from the last rejected fetch — kept verbatim so the UI can
   *  surface the actionable failure in context. */
  errorMessage: string | null;
}

export type AgentStudioResources = Record<AgentStudioResourceKey, AgentStudioResourceState>;

const RESOURCE_KEYS: AgentStudioResourceKey[] = ['bots', 'connections', 'approvals'];

const FETCHERS: Record<AgentStudioResourceKey, () => Promise<unknown>> = {
  bots: fetchCustomBotsFromApi,
  connections: fetchConnectionsFromApi,
  approvals: fetchPendingApprovalsFromApi };

const initialResources = (): AgentStudioResources => ({
  bots: { status: 'loading', errorMessage: null },
  connections: { status: 'loading', errorMessage: null },
  approvals: { status: 'loading', errorMessage: null } });

function errorMessageOf(reason: unknown): string | null {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string' && reason.length > 0) return reason;
  return null;
}

/**
 * Fetch independently so a connection failure cannot masquerade as zero
 * agents. Each resource keeps its own freshness/error state; `reload(key)`
 * retries a single resource while `reload()` refreshes all three.
 */
export function useAgentStudioResources() {
  const viewerId = useStore((state) => state.currentUser?.id);
  // Per-key request tokens: a single-resource retry only invalidates that
  // key's in-flight request — a racing full reload still writes every other
  // key's settled payload. Semantics are last-writer-wins per key: whichever
  // request for a key was issued most recently owns that key's store write
  // and status update.
  const sequence = React.useRef<Record<AgentStudioResourceKey, number>>({
    bots: 0,
    connections: 0,
    approvals: 0 });
  // Whether each resource has ever resolved successfully — distinguishes
  // 'stale' (prior data still on screen) from 'error' (nothing confirmed).
  const loadedOnce = React.useRef<Record<AgentStudioResourceKey, boolean>>({
    bots: false,
    connections: false,
    approvals: false });
  // Freshness is per-viewer: a different signed-in user must not inherit
  // 'stale' labels backed by someone else's cached rows.
  const lastViewer = React.useRef(viewerId);
  const [resources, setResources] = React.useState<AgentStudioResources>(initialResources);
  if (lastViewer.current !== viewerId) {
    lastViewer.current = viewerId;
    loadedOnce.current = { bots: false, connections: false, approvals: false };
    setResources(initialResources());
  }

  const reload = React.useCallback(async (only?: AgentStudioResourceKey) => {
    const keys = only ? [only] : RESOURCE_KEYS;
    const tokens = new Map<AgentStudioResourceKey, number>(
      keys.map((key) => [key, ++sequence.current[key]]));
    // A retrying resource that never loaded returns to 'loading'; a stale
    // resource keeps its stale label while refreshing — prior data stays up.
    setResources((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        next[key] = loadedOnce.current[key]
          ? prev[key]
          : { status: 'loading', errorMessage: null };
      }
      return next;
    });

    const settled = await Promise.allSettled(keys.map((key) => FETCHERS[key]()));
    if (useStore.getState().currentUser?.id !== viewerId) return;

    keys.forEach((key, index) => {
      const result = settled[index];
      if (result.status !== 'fulfilled') return;
      if (tokens.get(key) !== sequence.current[key]) return;
      if (key === 'bots') useStore.setState({ customBots: result.value as ChatBot[] });
      else if (key === 'connections') useStore.setState({ providerConnections: result.value as ProviderConnectionInfo[] });
      else useStore.setState({ pendingApprovals: result.value as ApprovalRequestInfo[] });
    });

    setResources((prev) => {
      const next = { ...prev };
      keys.forEach((key, index) => {
        if (tokens.get(key) !== sequence.current[key]) return;
        const result = settled[index];
        if (result.status === 'fulfilled') {
          loadedOnce.current[key] = true;
          next[key] = { status: 'ok', errorMessage: null };
        } else {
          next[key] = {
            status: loadedOnce.current[key] ? 'stale' : 'error',
            errorMessage: errorMessageOf(result.reason) };
        }
      });
      return next;
    });
  }, [viewerId]);

  useFocusEffect(React.useCallback(() => {
    void reload();
    return () => {
      // Blur invalidates every in-flight request regardless of scope.
      for (const key of RESOURCE_KEYS) sequence.current[key] += 1;
    };
  }, [reload]));

  const loading = RESOURCE_KEYS.some((key) => resources[key].status === 'loading');

  return { loading, resources, reload };
}
