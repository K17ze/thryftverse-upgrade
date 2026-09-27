'use client';

/**
 * useReducedMotion — reactive reduced-motion flag for JS-driven motion.
 *
 * True when the OS prefers reduced motion OR the user's accessibility
 * preference set `reduce-motion` on <html> (web/src/lib/store/settingsPrefs
 * — applied by AccessibilityPrefs). CSS consumers don't need this hook:
 * the global prefers-reduced-motion squash in globals.css already covers
 * class-based animation. JS consumers (rAF, scroll-driven effects) must
 * branch on it — motion is never exempt from the policy.
 */
import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void): () => void {
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', callback);
  // Watch the class the a11y prefs toggles too.
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
  return () => {
    media.removeEventListener('change', callback);
    observer.disconnect();
  };
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
    document.documentElement.classList.contains('reduce-motion')
  );
}

function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
