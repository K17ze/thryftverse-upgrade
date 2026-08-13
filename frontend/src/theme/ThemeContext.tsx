import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Appearance } from 'react-native';
import {
  getStoredThemePreference,
  applyThemePreference,
  subscribeThemePreferenceChange,
  type ThemePreference,
} from './themePreference';
import { useAccessibilityPreferences } from '../context/AccessibilityPreferencesContext';

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
  success: string;
  warning: string;
  /** Co-Own financial truth — up/down movement only. Per Design.md
   * proposed-semantic: coown-up #1C5631, coown-down #5F1616.
   * Used for price deltas, position P/L, and market direction. */
  coownUp: string;
  coownDown: string;
  /** Semantic accent colors from Design.md proposed-semantic section.
   * Used for category icon badges and contextual accents — never decorative. */
  social: string;
  discovery: string;
  commerceTrust: string;
  /** Premium accent from Design.md proposed-luxury. Used sparingly for
   * verified status, authenticated value, or curated distinction. */
  antiqueGold: string;
  bronze: string;
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

const DARK_COLORS: ThemeColors = {
  background: '#0A0A0A',
  surface: '#141414',
  surfaceAlt: '#1C1C1C',
  surfaceRaised: '#1F1F1F',
  surfaceElevated: '#242424',
  brand: '#F4F0E8',
  brandPressed: '#D8D0C3',
  brandSubtle: 'rgba(244,240,232,0.08)',
  textPrimary: '#FFFFFF',
  textSecondary: '#A3A3A3',
  textMuted: '#7A7A7A', // WCAG 2.2 AA: 4.64:1 on #0A0A0A (was #666666 at 3.05:1)
  textInverse: '#000000',
  border: '#262626',
  borderSubtle: '#1E1E1E',
  danger: '#9b0202',
  success: '#215634',
  warning: '#D49454', // Distinct from antiqueGold — warm amber, not gold
  coownUp: '#1C5631',
  coownDown: '#5F1616',
  social: '#9A6B7A',
  discovery: '#B85566',
  commerceTrust: '#4A7AC4',
  antiqueGold: '#C9A46A',
  bronze: '#8A6A3F',
  overlay: 'rgba(0,0,0,0.6)',
  input: '#1A1A1A',
  inputText: '#FFFFFF',
  row: '#141414',
  rowPressed: '#1A1A1A',
  tabBar: '#0A0A0A',
  header: '#0A0A0A',
  shadow: '#000000',
  glassBg: 'rgba(255,255,255,0.04)',
  glassBorder: 'rgba(255,255,255,0.08)',
};

const LIGHT_COLORS: ThemeColors = {
  background: '#FFFFFF',
  surface: '#F5F5F5',
  surfaceAlt: '#EFEFEF',
  surfaceRaised: '#F2F2F2',
  surfaceElevated: '#FFFFFF',
  brand: '#111111',
  brandPressed: '#333333',
  brandSubtle: 'rgba(17,17,17,0.06)',
  textPrimary: '#000000',
  textSecondary: '#666666',
  textMuted: '#767676', // WCAG 2.2 AA: 4.65:1 on #FFFFFF (was #999999 at 2.85:1)
  textInverse: '#FFFFFF',
  border: '#E5E5E5',
  borderSubtle: '#F0F0F0',
  danger: '#9b0202',
  success: '#215634',
  warning: '#B8742E', // Distinct from antiqueGold — warm amber, not gold
  coownUp: '#1C5631',
  coownDown: '#5F1616',
  social: '#6B3245',
  discovery: '#7B0E1E',
  commerceTrust: '#06489A',
  antiqueGold: '#C9A46A',
  bronze: '#8A6A3F',
  overlay: 'rgba(0,0,0,0.4)',
  input: '#FFFFFF',
  inputText: '#000000',
  row: '#F5F5F5',
  rowPressed: '#EBEBEB',
  tabBar: '#FFFFFF',
  header: '#FFFFFF',
  shadow: '#000000',
  glassBg: 'rgba(0,0,0,0.04)',
  glassBorder: 'rgba(0,0,0,0.08)',
};

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
      textMuted: '#9A9A9A',     // was #7A7A7A — raised for stronger separation
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
    textMuted: '#5A5A5A',     // was #767676 — raised for stronger separation
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