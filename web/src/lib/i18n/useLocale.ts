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
 *   it onto `<html lang dir>` and the pre-paint script restores it. In
 *   live mode with a session it also mirrors the choice to
 *   PATCH /users/me/locale — fire-and-forget, the device pick never
 *   waits on the wire.
 * - `locales` is the picker source for the settings Language control.
 *
 * SSR: the store hydrates synchronously from localStorage on the client,
 * so the first client render already reflects the stored locale.
 */
import { useCallback } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DATA_MODE } from '@/lib/api/client';
import { getAuthSession } from '@/lib/api/http';
import { updateMyLocale } from '@/lib/api/services/users';
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
        // Account mirror — best-effort so the UI never blocks on the wire.
        // The write only flies when a live session actually exists; the
        // local choice stands either way (other devices adopt it on
        // their own hydrate).
        if (DATA_MODE === 'live') {
          void getAuthSession().then((session) => {
            if (!session) return;
            return updateMyLocale({ locale }).catch(() => {
              /* mirror-only write — a failure keeps the device choice */
            });
          });
        }
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
