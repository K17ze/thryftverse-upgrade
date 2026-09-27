'use client';

/**
 * AccessibilityPrefs — root-mounted effect that applies the persisted
 * accessibility preferences document-wide for the whole session:
 *
 * - textSize → a `zoom` factor on <html> (px-based type scale means a
 *   font-size override alone would do nothing — zoom is the honest
 *   equivalent and scales the whole interface like mobile's text size).
 * - reduceMotion / highContrast → classes on <html>; the companion rules
 *   below are SSR'd into the first paint so the pre-paint script in
 *   layout.tsx (which restores these classes from localStorage) already
 *   has rules to act on. The reduce-motion squash mirrors the
 *   prefers-reduced-motion block in globals.css.
 *
 * Mounted once from the root layout — prefs survive route changes.
 * The settings screen only writes to the store; application lives here.
 */

import { useEffect } from 'react';
import { useHydrated } from '@/lib/store/useStore';
import { useSettingsPrefs, type TextSize } from '@/lib/store/settingsPrefs';

/** Root zoom per text size — the single source the UI and this effect share. */
export const TEXT_SIZE_ZOOM: Record<TextSize, number> = {
  small: 0.9,
  medium: 1,
  large: 1.125,
  xlarge: 1.25,
};

const ACCESSIBILITY_CSS = `
html.reduce-motion .skeleton,
html.reduce-motion .fade-up,
html.reduce-motion .fade-in,
html.reduce-motion .sheet-enter,
html.reduce-motion .toast-enter,
html.reduce-motion .toast-exit {
  animation: none;
}
html.reduce-motion .media-zoom {
  transition: none;
}
html.reduce-motion .group:hover .media-zoom,
html.reduce-motion .pressable:active {
  transform: none;
}
html.reduce-motion *,
html.reduce-motion *::before,
html.reduce-motion *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
  scroll-behavior: auto !important;
}
html.high-contrast {
  --text-muted: #adadad;
  --text-secondary: #d4d4d4;
  --border: #383838;
  --border-subtle: #2c2c2c;
}
html.high-contrast[data-theme='light'] {
  --text-muted: #545454;
  --text-secondary: #404040;
  --border: #c6c6c6;
  --border-subtle: #dadada;
}
`;

export function AccessibilityPrefs() {
  const hydrated = useHydrated();
  const textSize = useSettingsPrefs((s) => s.textSize);
  const reduceMotion = useSettingsPrefs((s) => s.reduceMotion);
  const highContrast = useSettingsPrefs((s) => s.highContrast);

  // Apply after hydration — persisted values differ from the SSR defaults
  // and the pre-paint script already restored them; waiting for hydration
  // means this effect writes the stored truth, never the defaults.
  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    const zoom = TEXT_SIZE_ZOOM[textSize] ?? 1;
    if (zoom === 1) root.style.removeProperty('zoom');
    else root.style.setProperty('zoom', String(zoom));
    root.classList.toggle('reduce-motion', reduceMotion);
    root.classList.toggle('high-contrast', highContrast);
    return () => {
      root.style.removeProperty('zoom');
      root.classList.remove('reduce-motion', 'high-contrast');
    };
  }, [hydrated, textSize, reduceMotion, highContrast]);

  // Companion rules ride along in the SSR output — always present, no
  // mount gap between the pre-paint classes and the rules they need.
  return <style>{ACCESSIBILITY_CSS}</style>;
}
