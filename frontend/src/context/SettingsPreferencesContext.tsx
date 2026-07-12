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

interface SettingsPreferencesContextValue {
  language: SupportedLanguageOption;
  emailNotificationsEnabled: boolean;
  quietHours: QuietHoursSettings;
  mySizes: string[];
  pushNotificationToggles: PushNotificationToggles;
  pushEnabledCount: number;
  pushTotalCount: number;
  isHydrated: boolean;
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
    }).catch(() => {
      // Best-effort persistence should not block preferences updates.
    });
  }, [language, emailNotificationsEnabled, quietHours, mySizes, filterPresets, isHydrated]);

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
        id: `filter_preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
    }),
    [
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
      setMySizes,
      setPushNotificationToggle,
      setQuietHours,
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