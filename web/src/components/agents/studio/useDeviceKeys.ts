'use client';

/**
 * useDeviceKeys — device-local provider key state for the studio's
 * "Device keys" tab. Web port of mobile's useDeviceProviderKeys, minus
 * the agent-session count (web has no in-process agent runtime — showing
 * one would fabricate it).
 *
 * Keys persist in localStorage via deviceKeys.ts — this device only,
 * never synced. A verified test writes the key; an unreachable or
 * rejected probe leaves the provider unconnected and reports the real
 * failure.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  DEVICE_PROVIDER_ORDER,
  discoverDeviceModels,
  getStoredDeviceKeys,
  removeDeviceKey,
  testDeviceKey,
  type DeviceProvider,
  type DeviceKeyTestResult,
  type DiscoveredModel,
  type StoredDeviceKey,
} from './deviceKeys';

export interface DeviceProviderState {
  stored: StoredDeviceKey | null;
  editing: boolean;
  keyInput: string;
  baseUrlInput: string;
  testing: boolean;
  testResult: DeviceKeyTestResult | null;
  /** Provider-authoritative models. Null = not yet discovered; [] =
   *  discovered but the provider returned none. */
  discoveredModels: DiscoveredModel[] | null;
  discovering: boolean;
}

const emptyProviderState = (): DeviceProviderState => ({
  stored: null,
  editing: false,
  keyInput: '',
  baseUrlInput: '',
  testing: false,
  testResult: null,
  discoveredModels: null,
  discovering: false,
});

export function useDeviceKeys() {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<Record<DeviceProvider, DeviceProviderState>>(
    () => ({
      openai: emptyProviderState(),
      anthropic: emptyProviderState(),
      gemini: emptyProviderState(),
      custom: emptyProviderState(),
    }),
  );

  // Hydrate stored keys on mount, then discover models per connected
  // provider — same ordering as mobile (load → discover per provider).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const connected = getStoredDeviceKeys();
        if (!mounted) return;
        setProviders((prev) => {
          const next = { ...prev };
          for (const c of connected) {
            next[c.provider] = {
              stored: c,
              editing: false,
              keyInput: '',
              baseUrlInput: c.baseUrl ?? '',
              testing: false,
              testResult: null,
              discoveredModels: null,
              discovering: true,
            };
          }
          return next;
        });
        setLoading(false);
        for (const c of connected) {
          const models = await discoverDeviceModels(c.provider);
          if (!mounted) return;
          setProviders((prev) => ({
            ...prev,
            [c.provider]: {
              ...prev[c.provider],
              discoveredModels: models,
              discovering: false,
            },
          }));
        }
      } catch {
        // Storage read failure — leave all providers not-connected.
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const patchProvider = useCallback(
    (provider: DeviceProvider, patch: Partial<DeviceProviderState>) => {
      setProviders((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], ...patch },
      }));
    },
    [],
  );

  const startEdit = useCallback((provider: DeviceProvider) => {
    setProviders((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        editing: true,
        keyInput: '',
        baseUrlInput: prev[provider].stored?.baseUrl ?? '',
        testResult: null,
      },
    }));
  }, []);

  const cancelEdit = useCallback((provider: DeviceProvider) => {
    setProviders((prev) => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        editing: false,
        keyInput: '',
        baseUrlInput: prev[provider].stored?.baseUrl ?? '',
        testResult: null,
      },
    }));
  }, []);

  const test = useCallback(
    async (provider: DeviceProvider) => {
      const state = providers[provider];
      setProviders((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], testing: true, testResult: null },
      }));

      // Real provider round-trip — the key is saved only if the provider
      // confirms it (deviceKeys.ts handles persistence).
      const result = await testDeviceKey(
        provider,
        state.keyInput,
        state.baseUrlInput.trim() || undefined,
      );

      if (result.status === 'invalid') {
        setProviders((prev) => ({
          ...prev,
          [provider]: { ...prev[provider], testing: false, testResult: result },
        }));
        return;
      }

      setProviders((prev) => ({
        ...prev,
        [provider]: {
          stored: getStoredDeviceKeys().find((c) => c.provider === provider) ?? null,
          editing: false,
          keyInput: '',
          baseUrlInput: state.baseUrlInput.trim(),
          testing: false,
          testResult: result,
          discoveredModels: result.models ?? prev[provider].discoveredModels,
          discovering: false,
        },
      }));
    },
    [providers],
  );

  const disconnect = useCallback((provider: DeviceProvider) => {
    removeDeviceKey(provider);
    setProviders((prev) => ({ ...prev, [provider]: emptyProviderState() }));
  }, []);

  // Keep DEVICE_PROVIDER_ORDER referenced so the canonical order the UI
  // renders is anchored to this module, not duplicated at the call site.
  return {
    loading,
    providers,
    providerOrder: DEVICE_PROVIDER_ORDER,
    patchProvider,
    startEdit,
    cancelEdit,
    test,
    disconnect,
  };
}
