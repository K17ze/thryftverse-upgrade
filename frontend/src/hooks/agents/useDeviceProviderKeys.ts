import React from 'react';
import {
  AIProvider,
  PROVIDER_CONFIGS,
  removeApiKey,
  getApiKey,
  getConnectedProviders,
  testApiKey,
  discoverModels,
  type ConnectedProvider } from '../../services/aiProviderApi';
import {
  pauseAllAgents,
  getActiveAgentSessionCount } from '../../services/chatAgentsApi';
import { useHaptic } from '../useHaptic';
import { emptyProviderState, type ProviderState } from './types';

/**
 * Device-local provider keys ("Device tools" tab) plus the active agent
 * session count. Both share the same mount effect in the Agent Studio
 * screen, so they live in one hook to preserve the original effect body
 * and ordering verbatim.
 */
export function useDeviceProviderKeys() {
  const haptic = useHaptic();

  const [loading, setLoading] = React.useState(true);
  const [providers, setProviders] = React.useState<Record<AIProvider, ProviderState>>({
    openai: emptyProviderState(),
    anthropic: emptyProviderState(),
    gemini: emptyProviderState(),
    custom: emptyProviderState() });
  const [activeAgentSessions, setActiveAgentSessions] = React.useState(0);

  // Load stored keys on mount, then discover models for connected providers.
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const connected = await getConnectedProviders();
        if (!mounted) return;
        const next = { ...providers };
        for (const c of connected) {
          next[c.provider] = {
            stored: c,
            editing: false,
            keyInput: '',
            baseUrlInput: c.baseUrl ?? '',
            testing: false,
            testResult: null,
            discoveredModels: null,
            discovering: true };
        }
        setProviders(next);
        setLoading(false);

        // Discover models for each connected provider (spec 04: dynamic
        // model discovery — provider-authoritative, not hardcoded).
        for (const c of connected) {
          const models = await discoverModels(c.provider);
          if (!mounted) return;
          setProviders((prev) => ({
            ...prev,
            [c.provider]: {
              ...prev[c.provider],
              discoveredModels: models,
              discovering: false } }));
        }
      } catch {
        // Storage read failure — leave all providers not-connected.
        if (mounted) setLoading(false);
      }
    })();
    // Refresh active agent session count on mount.
    setActiveAgentSessions(getActiveAgentSessionCount());
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchProvider = React.useCallback((provider: AIProvider, patch: Partial<ProviderState>) => {
    setProviders((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], ...patch } }));
  }, []);

  const startEdit = (provider: AIProvider) => {
    haptic.light();
    setProviders((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        editing: true,
        keyInput: '',
        baseUrlInput: prev[provider].stored?.baseUrl ?? '',
        testResult: null } }));
  };

  const cancelEdit = (provider: AIProvider) => {
    haptic.light();
    setProviders((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        editing: false,
        keyInput: '',
        baseUrlInput: prev[provider].stored?.baseUrl ?? '',
        testResult: null } }));
  };

  const handleTest = async (provider: AIProvider) => {
    const state = providers[provider];
    const config = PROVIDER_CONFIGS[provider];
    haptic.light();

    setProviders((prev) => ({ ...prev, [provider]: { ...prev[provider], testing: true, testResult: null } }));

    // Perform a real provider round-trip to verify the key is authorised.
    const result = await testApiKey(provider, state.keyInput, state.baseUrlInput.trim() || undefined, true);

    if (result.status === 'invalid') {
      setProviders((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], testing: false, testResult: result } }));
      haptic.medium();
      return;
    }

    // Key verified by provider — refresh stored state.
    const refreshed = await getApiKey(provider);
    const connected: ConnectedProvider | null = refreshed
      ? { ...refreshed, config }
      : null;

    setProviders((prev) => ({
      ...prev,
      [provider]: {
        stored: connected,
        editing: false,
        keyInput: '',
        baseUrlInput: connected?.baseUrl ?? '',
        testing: false,
        testResult: result,
        // Store the models discovered during the probe (spec 04).
        discoveredModels: result.models ?? prev[provider].discoveredModels,
        discovering: false } }));
    haptic.selection();
  };

  const handleDisconnect = async (provider: AIProvider) => {
    haptic.light();
    await removeApiKey(provider);
    setProviders((prev) => ({
      ...prev,
      [provider]: emptyProviderState() }));
    haptic.selection();
  };

  const handlePauseAllAgents = () => {
    if (activeAgentSessions === 0) return;
    haptic.medium();
    pauseAllAgents();
    setActiveAgentSessions(0);
    haptic.selection();
  };

  return {
    loading,
    providers,
    patchProvider,
    activeAgentSessions,
    startEdit,
    cancelEdit,
    handleTest,
    handleDisconnect,
    handlePauseAllAgents };
}
