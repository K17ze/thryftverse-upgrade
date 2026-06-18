import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Appearance } from 'react-native';
import {
  getStoredThemePreference,
  applyThemePreference,
  subscribeThemePreferenceChange,
  type ThemePreference,
} from './themePreference';

export type ThemeMode = 'dark' | 'light';

interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceElevated: string;
  brand: string;
  brandPressed: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  border: string;
  borderSubtle: string;
  danger: string;
  success: string;
  warning: string;
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
  surfaceAlt: '#1F1F1F',
  surfaceElevated: '#242424',
  brand: '#F4F0E8',
  brandPressed: '#D8D0C3',
  textPrimary: '#FFFFFF',
  textSecondary: '#A3A3A3',
  textMuted: '#666666',
  textInverse: '#000000',
  border: '#262626',
  borderSubtle: '#333333',
  danger: '#DC2626',
  success: '#16A34A',
  warning: '#F59E0B',
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
  surfaceAlt: '#EBEBEB',
  surfaceElevated: '#FFFFFF',
  brand: '#111111',
  brandPressed: '#333333',
  textPrimary: '#000000',
  textSecondary: '#666666',
  textMuted: '#999999',
  textInverse: '#FFFFFF',
  border: '#E5E5E5',
  borderSubtle: '#F0F0F0',
  danger: '#DC2626',
  success: '#16A34A',
  warning: '#F59E0B',
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ThemeMode>('dark');

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

  const colors = useMemo(() => getColorsForTheme(resolvedTheme), [resolvedTheme]);

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