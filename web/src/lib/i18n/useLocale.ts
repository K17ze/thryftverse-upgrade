'use client';

/**
 * useLocale — the web i18n contract.
 *
 * Hand-rolled on purpose: no i18n dependency is installed and the scoped
 * surface (chrome + common + state copy + sync/offline) doesn't justify
 * pulling next-intl/react-i18next for dict lookup + interpolation.
 *
 *   const { locale, setLocale, t, dir, locales } = useLocale();
 *
 *   t('chrome.nav.explore')              → 'Explorer' (fr), 'Explore' (en)
 *   t('sync.pendingCount', { count: 3 }) → '3 waiting to sync'
 *
 * - Untranslated keys fall back to en, then to the raw key (never blank).
 * - `setLocale` persists under LOCALE_STORAGE_KEY; PlatformRuntime mirrors
 *   it onto `<html lang dir>` and the pre-paint script restores it.
 * - `locales` is the picker source for the settings Language control
 *   (owned by another agent — wire `onSelect` to `setLocale`).
 *
 * SSR: the store hydrates synchronously from localStorage on the client,
 * so the first client render already reflects the stored locale.
 */
import { useCallback } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  LOCALES,
  isLocale,
  localeDir,
  translate,
  type Locale,
  type LocaleMeta,
  type TParams,
} from './locales';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => {
        if (!isLocale(locale)) return;
        set({ locale });
      },
    }),
    {
      name: LOCALE_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ locale: s.locale }),
    },
  ),
);

export interface UseLocale {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Resolve a dotted message key; falls back to en, then the key. */
  t: (key: string, params?: TParams) => string;
  /** Writing direction of the active locale ('rtl' for ar). */
  dir: 'ltr' | 'rtl';
  /** All shipping locales — drive the settings picker from this. */
  locales: readonly LocaleMeta[];
}

export function useLocale(): UseLocale {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const t = useCallback((key: string, params?: TParams) => translate(locale, key, params), [locale]);
  return { locale, setLocale, t, dir: localeDir(locale), locales: LOCALES };
}
