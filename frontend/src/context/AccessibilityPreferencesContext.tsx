/**
 * AccessibilityPreferencesContext — app-wide accessibility preferences.
 *
 * Provides persisted user-controlled accessibility settings that supplement
 * the OS-level accessibility features. Per AGENTS.md §11 (Truthful UI),
 * every toggle in the AccessibilitySettingsScreen must perform the
 * represented action — this context makes that possible.
 *
 * Per audit 12: "reduced motion verified", "all flagship screens work at
 * 200% text", "no essential action is color-only".
 */

import React from 'react';
import {
  AccessibilityPreferences,
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  TextSize,
  TEXT_SIZE_SCALE,
  getStoredAccessibilityPreferences,
  setStoredAccessibilityPreferences,
} from '../preferences/accessibilityPreferences';

interface AccessibilityPreferencesContextValue {
  /** User-selected text size. */
  textSize: TextSize;
  /** Scale factor for the selected text size (1.0 = medium). */
  textSizeScale: number;
  /** In-app reduced motion. ORs with OS Reduce Motion. */
  reducedMotion: boolean;
  /** High contrast — strengthens text/background contrast globally. */
  highContrast: boolean;
  /** Bold text — increases font weight for body text globally. */
  boldText: boolean;
  /** Additional screen reader hints. */
  screenReaderHints: boolean;
  /** Whether the stored preferences have been hydrated from disk. */
  isHydrated: boolean;
  /** Update a single preference. Persists to AsyncStorage. */
  setTextSize: (size: TextSize) => void;
  setReducedMotion: (enabled: boolean) => void;
  setHighContrast: (enabled: boolean) => void;
  setBoldText: (enabled: boolean) => void;
  setScreenReaderHints: (enabled: boolean) => void;
}

const AccessibilityPreferencesContext = React.createContext<
  AccessibilityPreferencesContextValue | undefined
>(undefined);

export function AccessibilityPreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [prefs, setPrefs] = React.useState<AccessibilityPreferences>(
    DEFAULT_ACCESSIBILITY_PREFERENCES
  );
  const [isHydrated, setIsHydrated] = React.useState(false);

  // Hydrate from AsyncStorage on mount
  React.useEffect(() => {
    let mounted = true;
    getStoredAccessibilityPreferences()
      .then((stored) => {
        if (!mounted) return;
        setPrefs(stored);
        setIsHydrated(true);
      })
      .catch(() => {
        if (mounted) setIsHydrated(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const updatePref = React.useCallback(
    <K extends keyof AccessibilityPreferences>(
      key: K,
      value: AccessibilityPreferences[K]
    ) => {
      setPrefs((prev) => {
        const next = { ...prev, [key]: value };
        void setStoredAccessibilityPreferences({ [key]: value });
        return next;
      });
    },
    []
  );

  const setTextSize = React.useCallback(
    (size: TextSize) => updatePref('textSize', size),
    [updatePref]
  );
  const setReducedMotion = React.useCallback(
    (enabled: boolean) => updatePref('reducedMotion', enabled),
    [updatePref]
  );
  const setHighContrast = React.useCallback(
    (enabled: boolean) => updatePref('highContrast', enabled),
    [updatePref]
  );
  const setBoldText = React.useCallback(
    (enabled: boolean) => updatePref('boldText', enabled),
    [updatePref]
  );
  const setScreenReaderHints = React.useCallback(
    (enabled: boolean) => updatePref('screenReaderHints', enabled),
    [updatePref]
  );

  const value = React.useMemo<AccessibilityPreferencesContextValue>(
    () => ({
      textSize: prefs.textSize,
      textSizeScale: TEXT_SIZE_SCALE[prefs.textSize],
      reducedMotion: prefs.reducedMotion,
      highContrast: prefs.highContrast,
      boldText: prefs.boldText,
      screenReaderHints: prefs.screenReaderHints,
      isHydrated,
      setTextSize,
      setReducedMotion,
      setHighContrast,
      setBoldText,
      setScreenReaderHints,
    }),
    [
      prefs,
      isHydrated,
      setTextSize,
      setReducedMotion,
      setHighContrast,
      setBoldText,
      setScreenReaderHints,
    ]
  );

  return (
    <AccessibilityPreferencesContext.Provider value={value}>
      {children}
    </AccessibilityPreferencesContext.Provider>
  );
}

export function useAccessibilityPreferences(): AccessibilityPreferencesContextValue {
  const ctx = React.useContext(AccessibilityPreferencesContext);
  if (!ctx) {
    throw new Error(
      'useAccessibilityPreferences must be used within an AccessibilityPreferencesProvider'
    );
  }
  return ctx;
}
