import React from 'react';
import {
  buildDefaultPushNotificationToggles,
  countEnabledPushNotificationToggles,
  DEFAULT_QUIET_HOURS,
  FilterPreset,
  getStoredPushNotificationToggles,
  getStoredSettingsPreferences,
  LANGUAGE_OPTIONS,
  PUSH_NOTIFICATION_DEFINITIONS,
  PushNotificationToggles,
  QuietHoursSettings,
  setStoredPushNotificationToggles,
  setStoredSettingsPreferences,
  SupportedLanguageOption,
} from '../preferences/settingsPreferences';
import { mapLanguageOptionToLocale, setI18nLocale } from '../i18n';
import { setAnalyticsOptOut } from '../lib/telemetry';
import { makeStableId } from '../utils/createStableId';

interface SettingsPreferencesContextValue {
  language: SupportedLanguageOption;
  emailNotificationsEnabled: boolean;
  quietHours: QuietHoursSettings;
  mySizes: string[];
  pushNotificationToggles: PushNotificationToggles;
  pushEnabledCount: number;
  pushTotalCount: number;
  isHydrated: boolean;
  analyticsOptOut: boolean;
  developerMode: boolean;
  biometricEnabled: boolean;
  biometricLoginEnabled: boolean;
  personalizedAds: boolean;
  recommendationPersonalization: boolean;
  thirdPartySharing: boolean;
  setLanguage: (language: SupportedLanguageOption) => void;
  setEmailNotificationsEnabled: (enabled: boolean) => void;
  toggleEmailNotifications: () => void;
  setQuietHours: (settings: Partial<QuietHoursSettings>) => void;
  setMySizes: (sizes: string[]) => void;
  toggleMySize: (size: string) => void;
  filterPresets: FilterPreset[];
  saveFilterPreset: (preset: Omit<FilterPreset, 'id' | 'createdAt'>) => void;
  removeFilterPreset: (id: string) => void;
  setPushNotificationToggle: (key: string, enabled: boolean) => void;
  setAllPushNotificationToggles: (enabled: boolean) => void;
  setAnalyticsOptOut: (optOut: boolean) => void;
  toggleAnalyticsOptOut: () => void;
  setDeveloperMode: (enabled: boolean) => void;
  toggleDeveloperMode: () => void;
  setBiometricEnabled: (enabled: boolean) => void;
  setBiometricLoginEnabled: (enabled: boolean) => void;
  setPersonalizedAds: (enabled: boolean) => void;
  setRecommendationPersonalization: (enabled: boolean) => void;
  setThirdPartySharing: (enabled: boolean) => void;
}

const DEFAULT_LANGUAGE = LANGUAGE_OPTIONS[0];
const DEFAULT_PUSH_NOTIFICATION_TOGGLES = buildDefaultPushNotificationToggles(
  PUSH_NOTIFICATION_DEFINITIONS.map((item) => item.key)
);

const SettingsPreferencesContext = React.createContext<SettingsPreferencesContextValue | undefined>(undefined);

export function SettingsPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = React.useState<SupportedLanguageOption>(DEFAULT_LANGUAGE);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = React.useState(true);
  const [quietHours, setQuietHoursState] = React.useState<QuietHoursSettings>(DEFAULT_QUIET_HOURS);
  const [mySizes, setMySizesState] = React.useState<string[]>([]);
  const [filterPresets, setFilterPresets] = React.useState<FilterPreset[]>([]);
  const [pushNotificationToggles, setPushNotificationToggles] = React.useState<PushNotificationToggles>(
    DEFAULT_PUSH_NOTIFICATION_TOGGLES
  );
  const [analyticsOptOut, setAnalyticsOptOutState] = React.useState(false);
  const [developerMode, setDeveloperModeState] = React.useState(false);
  const [biometricEnabled, setBiometricEnabledState] = React.useState(true);
  const [biometricLoginEnabled, setBiometricLoginEnabledState] = React.useState(false);
  const [personalizedAds, setPersonalizedAdsState] = React.useState(false);
  const [recommendationPersonalization, setRecommendationPersonalizationState] = React.useState(true);
  const [thirdPartySharing, setThirdPartySharingState] = React.useState(false);
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    Promise.all([
      getStoredSettingsPreferences(),
      getStoredPushNotificationToggles(DEFAULT_PUSH_NOTIFICATION_TOGGLES),
    ])
      .then(([settingsPreferences, storedPushToggles]) => {
        if (!isMounted) {
          return;
        }

        setLanguage(settingsPreferences.language);
        setEmailNotificationsEnabled(settingsPreferences.emailNotificationsEnabled);
        setQuietHoursState(settingsPreferences.quietHours);
        setMySizesState(settingsPreferences.mySizes);
        setFilterPresets(settingsPreferences.filterPresets);
        setPushNotificationToggles(storedPushToggles);
        setAnalyticsOptOutState(settingsPreferences.analyticsOptOut);
        setDeveloperModeState(settingsPreferences.developerMode);
        setBiometricEnabledState(settingsPreferences.biometricEnabled);
        setBiometricLoginEnabledState(settingsPreferences.biometricLoginEnabled);
        setPersonalizedAdsState(settingsPreferences.personalizedAds);
        setRecommendationPersonalizationState(settingsPreferences.recommendationPersonalization);
        setThirdPartySharingState(settingsPreferences.thirdPartySharing);
        // Sync the telemetry module so opt-out is respected before the
        // first React re-render commits.
        setAnalyticsOptOut(settingsPreferences.analyticsOptOut);
      })
      .catch(() => {
        // Keep defaults when persistence is unavailable.
      })
      .finally(() => {
        if (isMounted) {
          setIsHydrated(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    setI18nLocale(mapLanguageOptionToLocale(language));
  }, [language]);

  React.useEffect(() => {
    if (!isHydrated) {
      return;
    }

    setStoredSettingsPreferences({
      language,
      emailNotificationsEnabled,
      quietHours,
      mySizes,
      filterPresets,
      analyticsOptOut,
      developerMode,
      biometricEnabled,
      biometricLoginEnabled,
      personalizedAds,
      recommendationPersonalization,
      thirdPartySharing,
    }).catch(() => {
      // Best-effort persistence should not block preferences updates.
    });
  }, [language, emailNotificationsEnabled, quietHours, mySizes, filterPresets, analyticsOptOut, developerMode, biometricEnabled, biometricLoginEnabled, personalizedAds, recommendationPersonalization, thirdPartySharing, isHydrated]);

  React.useEffect(() => {
    if (!isHydrated) {
      return;
    }

    setStoredPushNotificationToggles(pushNotificationToggles).catch(() => {
      // Best-effort persistence should not block preferences updates.
    });
  }, [pushNotificationToggles, isHydrated]);

  const toggleEmailNotifications = React.useCallback(() => {
    setEmailNotificationsEnabled((prev) => !prev);
  }, []);

  const setQuietHours = React.useCallback((settings: Partial<QuietHoursSettings>) => {
    setQuietHoursState((prev) => ({ ...prev, ...settings }));
  }, []);

  const setMySizes = React.useCallback((sizes: string[]) => {
    setMySizesState(sizes);
  }, []);

  const toggleMySize = React.useCallback((size: string) => {
    setMySizesState((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
    );
  }, []);

  const saveFilterPreset = React.useCallback((preset: Omit<FilterPreset, 'id' | 'createdAt'>) => {
    setFilterPresets((prev) => {
      // Deduplicate by name — update existing preset with same name
      const normalized = preset.name.trim().toLowerCase();
      const existing = prev.find((p) => p.name.trim().toLowerCase() === normalized);
      if (existing) {
        return prev.map((p) =>
          p.id === existing.id ? { ...preset, id: existing.id, createdAt: existing.createdAt } : p
        );
      }
      const newPreset: FilterPreset = {
        ...preset,
        id: makeStableId('filter_preset'),
        createdAt: new Date().toISOString(),
      };
      return [newPreset, ...prev].slice(0, 12);
    });
  }, []);

  const removeFilterPreset = React.useCallback((id: string) => {
    setFilterPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const setPushNotificationToggle = React.useCallback((key: string, enabled: boolean) => {
    setPushNotificationToggles((prev) => {
      if (!(key in prev)) {
        return prev;
      }

      return {
        ...prev,
        [key]: enabled,
      };
    });
  }, []);

  const setAllPushNotificationToggles = React.useCallback((enabled: boolean) => {
    const nextState = buildDefaultPushNotificationToggles(
      PUSH_NOTIFICATION_DEFINITIONS.map((item) => item.key)
    );

    if (!enabled) {
      Object.keys(nextState).forEach((key) => {
        nextState[key] = false;
      });
    }

    setPushNotificationToggles(nextState);
  }, []);

  const setAnalyticsOptOutPref = React.useCallback((optOut: boolean) => {
    setAnalyticsOptOutState(optOut);
    // Keep the telemetry module flag in sync so every trackTelemetryEvent
    // call honours the preference immediately.
    setAnalyticsOptOut(optOut);
  }, []);

  const toggleAnalyticsOptOut = React.useCallback(() => {
    setAnalyticsOptOutState((prev) => {
      const next = !prev;
      setAnalyticsOptOut(next);
      return next;
    });
  }, []);

  const setDeveloperMode = React.useCallback((enabled: boolean) => {
    setDeveloperModeState(enabled);
  }, []);

  const toggleDeveloperMode = React.useCallback(() => {
    setDeveloperModeState((prev) => !prev);
  }, []);

  const setBiometricEnabled = React.useCallback((enabled: boolean) => {
    setBiometricEnabledState(enabled);
  }, []);

  const setBiometricLoginEnabled = React.useCallback((enabled: boolean) => {
    setBiometricLoginEnabledState(enabled);
  }, []);

  const setPersonalizedAds = React.useCallback((enabled: boolean) => {
    setPersonalizedAdsState(enabled);
  }, []);

  const setRecommendationPersonalization = React.useCallback((enabled: boolean) => {
    setRecommendationPersonalizationState(enabled);
  }, []);

  const setThirdPartySharing = React.useCallback((enabled: boolean) => {
    setThirdPartySharingState(enabled);
  }, []);

  const pushEnabledCount = React.useMemo(
    () => countEnabledPushNotificationToggles(pushNotificationToggles),
    [pushNotificationToggles]
  );

  const value = React.useMemo<SettingsPreferencesContextValue>(
    () => ({
      language,
      emailNotificationsEnabled,
      quietHours,
      mySizes,
      filterPresets,
      pushNotificationToggles,
      pushEnabledCount,
      pushTotalCount: PUSH_NOTIFICATION_DEFINITIONS.length,
      isHydrated,
      analyticsOptOut,
      developerMode,
      biometricEnabled,
      biometricLoginEnabled,
      personalizedAds,
      recommendationPersonalization,
      thirdPartySharing,
      setLanguage,
      setEmailNotificationsEnabled,
      toggleEmailNotifications,
      setQuietHours,
      setMySizes,
      toggleMySize,
      saveFilterPreset,
      removeFilterPreset,
      setPushNotificationToggle,
      setAllPushNotificationToggles,
      setAnalyticsOptOut: setAnalyticsOptOutPref,
      toggleAnalyticsOptOut,
      setDeveloperMode,
      toggleDeveloperMode,
      setBiometricEnabled,
      setBiometricLoginEnabled,
      setPersonalizedAds,
      setRecommendationPersonalization,
      setThirdPartySharing,
    }),
    [
      analyticsOptOut,
      developerMode,
      biometricEnabled,
      biometricLoginEnabled,
      personalizedAds,
      recommendationPersonalization,
      thirdPartySharing,
      emailNotificationsEnabled,
      filterPresets,
      isHydrated,
      language,
      mySizes,
      pushEnabledCount,
      pushNotificationToggles,
      quietHours,
      removeFilterPreset,
      saveFilterPreset,
      setAllPushNotificationToggles,
      setAnalyticsOptOutPref,
      setDeveloperMode,
      setBiometricEnabled,
      setBiometricLoginEnabled,
      setPersonalizedAds,
      setRecommendationPersonalization,
      setThirdPartySharing,
      setMySizes,
      setPushNotificationToggle,
      setQuietHours,
      toggleAnalyticsOptOut,
      toggleDeveloperMode,
      toggleEmailNotifications,
      toggleMySize,
    ]
  );

  return <SettingsPreferencesContext.Provider value={value}>{children}</SettingsPreferencesContext.Provider>;
}

export function useSettingsPreferences() {
  const context = React.useContext(SettingsPreferencesContext);
  if (!context) {
    throw new Error('useSettingsPreferences must be used within SettingsPreferencesProvider');
  }

  return context;
}