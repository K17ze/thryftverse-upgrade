import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Appearance } from 'react-native';
import {
  getStoredThemePreference,
  applyThemePreference,
  subscribeThemePreferenceChange,
  type ThemePreference,
} from './themePreference';
import { useAccessibilityPreferences } from '../context/AccessibilityPreferencesContext';
import {
  DARK_COLORS as RAW_DARK_COLORS,
  LIGHT_COLORS as RAW_LIGHT_COLORS,
} from '../constants/colors';

export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceElevated: string;
  /** Raised surface — between surface and surfaceElevated for clearer dark hierarchy */
  surfaceRaised: string;
  brand: string;
  brandPressed: string;
  /** Subtle brand tint — selected states, active tabs, focused fields */
  brandSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  border: string;
  borderSubtle: string;
  danger: string;
  /** Subtle danger tint — destructive surface backgrounds, danger badges. Replaces hex-alpha. */
  dangerSubtle: string;
  success: string;
  /** Subtle success tint — positive surface backgrounds, success badges. Replaces hex-alpha. */
  successSubtle: string;
  warning: string;
  /** Subtle warning tint — cautionary surface backgrounds, warning badges. Replaces hex-alpha. */
  warningSubtle: string;
  /** Border-tint variants for status-colored borders. Replaces hex-alpha border concatenation. */
  brandBorder: string;
  warningBorder: string;
  dangerBorder: string;
  successBorder: string;
  coownUpBorder: string;
  coownDownBorder: string;
  commerceTrustBorder: string;
  /** Co-Own financial truth — up/down movement only. Per Design.md
   * proposed-semantic: coown-up #1C5631, coown-down #5F1616.
   * Used for price deltas, position P/L, and market direction. */
  coownUp: string;
  coownDown: string;
  /** Subtle coownUp/coownDown tints — side pills, premium/discount fills. Replaces hex-alpha. */
  coownUpSubtle: string;
  coownDownSubtle: string;
  /** Semantic accent colors from Design.md proposed-semantic section.
   * Used for category icon badges and contextual accents — never decorative. */
  social: string;
  discovery: string;
  commerceTrust: string;
  /** Subtle accent tints — icon-badge fills, category backgrounds. Replaces hex-alpha. */
  commerceTrustSubtle: string;
  discoverySubtle: string;
  bronzeSubtle: string;
  /** Premium accent from Design.md proposed-luxury. Used sparingly for
   * verified status, authenticated value, or curated distinction. */
  antiqueGold: string;
  bronze: string;
  /** Text over media scrims — always white regardless of theme, because
   *  scrims are dark-on-image in both light and dark mode. Replaces
   *  hardcoded `#fff` / `rgba(255,255,255,0.88)` in hero/media overlays. */
  scrimTextPrimary: string;
  /** Secondary text over media scrims — slightly translucent white. */
  scrimTextSecondary: string;
  /** Tertiary text/decor over media scrims — low-opacity white for inactive dots. */
  scrimTextTertiary: string;
  overlay: string;
  input: string;
  inputText: string;
  row: string;
  rowPressed: string;
  tabBar: string;
  header: string;
  shadow: string;
  glassBg: string;
  glassBorder: string;
}

const DARK_COLORS: ThemeColors = RAW_DARK_COLORS as ThemeColors;

const LIGHT_COLORS: ThemeColors = RAW_LIGHT_COLORS as ThemeColors;

interface ThemeContextValue {
  themePreference: ThemePreference;
  resolvedTheme: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setThemePreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolveThemeMode(preference: ThemePreference): ThemeMode {
  if (preference === 'system') {
    return Appearance.getColorScheme() === 'light' ? 'light' : 'dark';
  }
  return preference;
}

function getColorsForTheme(mode: ThemeMode): ThemeColors {
  return mode === 'light' ? LIGHT_COLORS : DARK_COLORS;
}

/**
 * High-contrast color overrides — applied when the user enables the in-app
 * high contrast accessibility setting. Strengthens text/background separation
 * and border visibility without changing the overall palette identity.
 *
 * Per audit 12: "glass/material chrome remains legible under accessibility
 * settings" and "do not encode state by color alone."
 */
function applyHighContrast(base: ThemeColors, isDark: boolean): ThemeColors {
  if (isDark) {
    return {
      ...base,
      // Strengthen text contrast on dark backgrounds
      textPrimary: '#FFFFFF',
      textSecondary: '#C4C4C4', // was #A3A3A3 — raised for WCAG AAA
      textMuted: '#9A9A9A',     // was #888888 (base) — raised for WCAG AAA
      // Strengthen borders for clearer structural separation
      border: '#3A3A3A',        // was #262626
      borderSubtle: '#2E2E2E',  // was #1E1E1E
      // Strengthen surface separation
      surface: '#181818',       // was #141414
      surfaceAlt: '#222222',    // was #1C1C1C
    };
  }
  return {
    ...base,
    // Strengthen text contrast on light backgrounds
    textPrimary: '#000000',
    textSecondary: '#4A4A4A', // was #666666 — raised for WCAG AAA
    textMuted: '#5A5A5A',     // was #6C6C6C (base) — raised for WCAG AAA
    // Strengthen borders
    border: '#CCCCCC',        // was #E5E5E5
    borderSubtle: '#DDDDDD',  // was #F0F0F0
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ThemeMode>('dark');
  const { highContrast } = useAccessibilityPreferences();

  // Initialize on mount
  useEffect(() => {
    let mounted = true;
    getStoredThemePreference().then((pref) => {
      if (!mounted) return;
      setThemePreferenceState(pref);
      const mode = resolveThemeMode(pref);
      setResolvedTheme(mode);
      applyThemePreference(pref);
    });
    return () => { mounted = false; };
  }, []);

  // Listen for system theme changes when preference is 'system'
  useEffect(() => {
    if (themePreference !== 'system') return;
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      const mode = colorScheme === 'light' ? 'light' : 'dark';
      setResolvedTheme(mode);
    });
    return () => sub.remove();
  }, [themePreference]);

  // Subscribe to manual theme preference changes
  useEffect(() => {
    const unsubscribe = subscribeThemePreferenceChange((pref) => {
      setThemePreferenceState(pref);
      const mode = resolveThemeMode(pref);
      setResolvedTheme(mode);
    });
    return unsubscribe;
  }, []);

  const colors = useMemo(() => {
    const base = getColorsForTheme(resolvedTheme);
    return highContrast ? applyHighContrast(base, resolvedTheme === 'dark') : base;
  }, [resolvedTheme, highContrast]);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    applyThemePreference(preference);
    setThemePreferenceState(preference);
    setResolvedTheme(resolveThemeMode(preference));
  }, []);

  const value = useMemo(
    () => ({
      themePreference,
      resolvedTheme,
      colors,
      isDark: resolvedTheme === 'dark',
      setThemePreference,
    }),
    [themePreference, resolvedTheme, colors, setThemePreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return ctx;
}