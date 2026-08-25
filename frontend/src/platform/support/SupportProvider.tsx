/**
 * Customer support platform abstraction.
 *
 * Provides a unified interface for in-app support that can optionally use
 * Intercom when configured, and falls back to the existing in-app support
 * screen when Intercom is not available.
 *
 * Architecture:
 * - `SupportProvider` — context provider that initialises the configured
 *   support SDK (Intercom, Zendesk, or none) at app startup.
 * - `useSupport()` — hook that exposes the available support actions.
 * - `IntercomAdapter` — concrete Intercom implementation (lazy-loaded).
 *
 * Intercom is configured via `app.json` extra:
 *   expo.extra.intercomAppId
 *   expo.extra.intercomAndroidApiKey
 *   expo.extra.intercomIosApiKey
 *   expo.extra.intercomRegion  ("US" | "EU" | "AU")
 *
 * When Intercom credentials are absent, the provider is a no-op and the
 * app's built-in HelpSupportScreen is used instead.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { UserAttributes } from '@intercom/intercom-react-native';

// ── Types ─────────────────────────────────────────────────────────────

export type SupportProviderType = 'intercom' | 'none';

export interface SupportUser {
  userId?: string;
  email?: string;
  name?: string;
  /** Custom attributes passed to the support SDK */
  attributes?: Record<string, string | number | boolean>;
}

export interface SupportContextValue {
  /** Which provider is active (or 'none' if no SDK is configured) */
  provider: SupportProviderType;
  /** Whether the support SDK is initialised and ready */
  isReady: boolean;
  /** Open the support chat / messenger UI */
  openMessenger: () => Promise<void>;
  /** Open the help center articles */
  openHelpCenter: () => Promise<void>;
  /** Register the current user with the support SDK */
  identifyUser: (user: SupportUser) => Promise<void>;
  /** Clear the current user (on logout) */
  clearUser: () => Promise<void>;
  /** Log a custom event to the support SDK (for context in tickets) */
  logEvent: (name: string, metadata?: Record<string, unknown>) => void;
}

// ── No-op fallback ────────────────────────────────────────────────────

const noopSupport: SupportContextValue = {
  provider: 'none',
  isReady: false,
  openMessenger: async () => undefined,
  openHelpCenter: async () => undefined,
  identifyUser: async () => undefined,
  clearUser: async () => undefined,
  logEvent: () => undefined,
};

// ── Context ───────────────────────────────────────────────────────────

const SupportContext = createContext<SupportContextValue>(noopSupport);

// ── Intercom adapter ──────────────────────────────────────────────────

type IntercomModule = typeof import('@intercom/intercom-react-native');
type IntercomSpace = IntercomModule['Space'];

let intercomModuleCache: IntercomModule | null | undefined;

function getIntercomModule(): IntercomModule | null {
  if (intercomModuleCache !== undefined) {
    return intercomModuleCache;
  }
  try {
    intercomModuleCache = require('@intercom/intercom-react-native') as IntercomModule;
    return intercomModuleCache;
  } catch {
    intercomModuleCache = null;
    return null;
  }
}

function toUserAttributes(user: SupportUser): UserAttributes {
  const attributes: UserAttributes = {};
  if (user.userId) {
    attributes.userId = user.userId;
  }
  if (user.email) {
    attributes.email = user.email;
  }
  if (user.name) {
    attributes.name = user.name;
  }
  if (user.attributes) {
    attributes.customAttributes = user.attributes;
  }
  return attributes;
}

export interface IntercomAdapterType {
  initialize(appId: string, apiKey: string, region: 'US' | 'EU' | 'AU'): Promise<void>;
  openMessenger(): Promise<void>;
  openHelpCenter(): Promise<void>;
  identifyUser(user: SupportUser): Promise<void>;
  clearUser(): Promise<void>;
  logEvent(name: string, metadata?: Record<string, unknown>): void;
}

/**
 * Intercom adapter — lazy-loads `@intercom/intercom-react-native` and
 * delegates support actions to the Intercom SDK. Every method is wrapped
 * in try/catch so a missing or misconfigured native module never crashes
 * the app.
 */
export const IntercomAdapter: IntercomAdapterType = {
  async initialize(appId: string, apiKey: string, _region: 'US' | 'EU' | 'AU'): Promise<void> {
    try {
      const mod = getIntercomModule();
      if (!mod) return;
      await mod.default.initialize(apiKey, appId);
    } catch {
      // Initialisation failure must never crash the app.
    }
  },

  async openMessenger(): Promise<void> {
    try {
      const mod = getIntercomModule();
      if (!mod) return;
      await mod.default.present();
    } catch {
      // Messenger presentation must never crash the app.
    }
  },

  async openHelpCenter(): Promise<void> {
    try {
      const mod = getIntercomModule();
      if (!mod) return;
      const space: IntercomSpace = mod.Space;
      await mod.default.presentSpace(space.helpCenter);
    } catch {
      // Help center presentation must never crash the app.
    }
  },

  async identifyUser(user: SupportUser): Promise<void> {
    try {
      const mod = getIntercomModule();
      if (!mod) return;
      if (!user.userId && !user.email) {
        await mod.default.loginUnidentifiedUser();
        return;
      }
      await mod.default.loginUserWithUserAttributes(toUserAttributes(user));
    } catch {
      // User identification must never crash the app.
    }
  },

  async clearUser(): Promise<void> {
    try {
      const mod = getIntercomModule();
      if (!mod) return;
      await mod.default.logout();
    } catch {
      // Logout must never crash the app.
    }
  },

  logEvent(name: string, metadata?: Record<string, unknown>): void {
    try {
      const mod = getIntercomModule();
      if (!mod) return;
      void mod.default.logEvent(name, metadata);
    } catch {
      // Event logging must never crash the app.
    }
  },
};

// ── Provider ──────────────────────────────────────────────────────────

interface SupportProviderProps {
  children: ReactNode;
  /** Override the provider type detection for testing */
  forceProvider?: SupportProviderType;
}

type IntercomExtraConfig = {
  intercomAppId?: string;
  intercomAndroidApiKey?: string;
  intercomIosApiKey?: string;
  intercomRegion?: 'US' | 'EU' | 'AU';
};

function readIntercomConfig(): IntercomExtraConfig {
  const extra = (Constants.expoConfig as { extra?: IntercomExtraConfig } | null)?.extra;
  return extra ?? {};
}

/**
 * Support platform provider.
 *
 * Reads Intercom credentials from `Constants.expoConfig.extra` and
 * initialises the Intercom SDK when available. When credentials are
 * absent, falls back to a no-op provider and the app's built-in
 * HelpSupportScreen is used instead.
 */
export function SupportProvider({ children, forceProvider }: SupportProviderProps) {
  const value = useSupportProvider(forceProvider);
  return <SupportContext.Provider value={value}>{children}</SupportContext.Provider>;
}

function useSupportProvider(forceProvider?: SupportProviderType): SupportContextValue {
  const [isReady, setIsReady] = useState(false);

  const config = readIntercomConfig();
  const appId = config.intercomAppId?.trim();
  const apiKey = Platform.select({
    ios: config.intercomIosApiKey?.trim(),
    android: config.intercomAndroidApiKey?.trim(),
    default: config.intercomIosApiKey?.trim() ?? config.intercomAndroidApiKey?.trim(),
  });
  const region = config.intercomRegion ?? 'US';
  const hasCredentials = Boolean(appId && apiKey);

  useEffect(() => {
    if (forceProvider === 'none' || !hasCredentials) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await IntercomAdapter.initialize(appId!, apiKey!, region);
      if (!cancelled) {
        setIsReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [forceProvider, hasCredentials, appId, apiKey, region]);

  if (forceProvider === 'none' || !hasCredentials) {
    return noopSupport;
  }

  if (!isReady) {
    return noopSupport;
  }

  return {
    provider: 'intercom',
    isReady: true,
    openMessenger: IntercomAdapter.openMessenger,
    openHelpCenter: IntercomAdapter.openHelpCenter,
    identifyUser: IntercomAdapter.identifyUser,
    clearUser: IntercomAdapter.clearUser,
    logEvent: IntercomAdapter.logEvent,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────

/**
 * Access the support platform.
 *
 * @returns The current support context value.
 */
export function useSupport(): SupportContextValue {
  return useContext(SupportContext);
}
