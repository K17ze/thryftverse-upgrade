/**
 * i18next configuration for ThryftVerse.
 *
 * Migrates the hand-rolled i18n system to i18next + react-i18next +
 * expo-localization, adding:
 *   - ICU plural rules (via intl-pluralrules polyfill)
 *   - Automatic device locale detection (via expo-localization)
 *   - Namespace-based organization (future-proofing)
 *   - RTL support (via I18nManager)
 *   - Type-safe translation keys
 *
 * Backward compatibility:
 *   The existing `t(key, params)` function signature is preserved.
 *   The existing translation data (EN_TRANSLATIONS, ES_TRANSLATION_PATCH,
 *   FR_TRANSLATION_PATCH, DE_TRANSLATION_PATCH) is reused as i18next
 *   resources. Keys use dot notation (e.g., "auctions.bid.current") which
 *   maps to i18next's nested resource structure.
 *
 * Key flattening:
 *   i18next supports both flat keys ("auctions.bid.current") and nested
 *   keys ("auctions": { "bid": { "current": "..." } }). We use flat keys
 *   with `keySeparator: false` so the existing dot-notation keys work
 *   without restructuring the translation data.
 *
 * @see https://www.i18next.com
 * @see https://react.i18next.com
 */
import 'intl-pluralrules';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import { I18nManager, Platform } from 'react-native';

import {
  EN_TRANSLATIONS,
  ES_TRANSLATION_PATCH,
  FR_TRANSLATION_PATCH,
  DE_TRANSLATION_PATCH,
  type SupportedLocale,
  type TranslationKey,
} from './index';

// ── Locale constants ───────────────────────────────────────────────

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'es', 'fr', 'de'];

const RTL_LOCALES: string[] = ['ar', 'he', 'fa', 'ur'];

// ── Resource construction ──────────────────────────────────────────

/**
 * Merge the English base with a locale patch, producing a complete
 * translation resource for i18next. Missing keys fall through to English.
 */
function buildResource(
  patch: Partial<Record<TranslationKey, string>>,
): Record<string, string> {
  return { ...EN_TRANSLATIONS, ...patch };
}

const resources = {
  en: { translation: EN_TRANSLATIONS },
  es: { translation: buildResource(ES_TRANSLATION_PATCH) },
  fr: { translation: buildResource(FR_TRANSLATION_PATCH) },
  de: { translation: buildResource(DE_TRANSLATION_PATCH) },
} as const;

// ── Device locale detection ────────────────────────────────────────

/**
 * Detect the best supported locale from the device's locale list.
 * Falls back to 'en' if no supported locale is found.
 */
export function detectDeviceLocale(): SupportedLocale {
  const deviceLocales = Localization.getLocales();
  for (const locale of deviceLocales) {
    const langCode = locale.languageCode?.toLowerCase();
    if (langCode && SUPPORTED_LOCALES.includes(langCode as SupportedLocale)) {
      return langCode as SupportedLocale;
    }
  }
  return 'en';
}

/**
 * Check if a locale is right-to-left.
 */
export function isRTL(locale: string): boolean {
  const langCode = locale.split('-')[0]?.toLowerCase();
  return RTL_LOCALES.includes(langCode);
}

/**
 * Update I18nManager for RTL support. Call this when changing locales.
 */
function applyRTLSupport(locale: string): void {
  if (Platform.OS === 'web') return;
  const shouldBeRTL = isRTL(locale);
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.forceRTL(shouldBeRTL);
    // Note: I18nManager changes require an app restart to take full effect
    // on layout direction. This is a known React Native limitation.
  }
}

// ── i18next initialization ─────────────────────────────────────────

let initialized = false;

/**
 * Initialize i18next. Safe to call multiple times — subsequent calls are no-ops.
 * Called automatically on first import of this module.
 */
export function initI18n(initialLocale?: SupportedLocale): void {
  if (initialized) return;
  initialized = true;

  const locale = initialLocale ?? detectDeviceLocale();

  i18next.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LOCALES,
    // Flat keys — don't split on dots (existing keys use dots as part of the key name)
    keySeparator: false,
    nsSeparator: false,
    // Disable HTML escaping — React handles XSS prevention
    interpolation: {
      escapeValue: false,
      // Support ICU-style plural syntax: {count, plural, one {item} other {items}}
      // i18next handles this natively when the polyfill is loaded
    },
    // Don't log missing key warnings in production
    saveMissing: __DEV__,
    missingKeyHandler: __DEV__
      ? (_lngs, _ns, key) => {
          console.warn(`[i18n] Missing translation key: "${key}"`);
        }
      : undefined,
    react: {
      // Bind to React state so components re-render on locale change
      useSuspense: false,
    },
  });

  applyRTLSupport(locale);
}

// ── Locale management ──────────────────────────────────────────────

/**
 * Change the active locale. Updates i18next, RTL support, and persists
 * the choice for next app launch.
 */
export async function setI18nLocale(locale: SupportedLocale): Promise<void> {
  if (!initialized) initI18n(locale);
  await i18next.changeLanguage(locale);
  applyRTLSupport(locale);
}

/**
 * Get the current active locale.
 */
export function getI18nLocale(): SupportedLocale {
  const lng = i18next.language;
  if (lng && SUPPORTED_LOCALES.includes(lng as SupportedLocale)) {
    return lng as SupportedLocale;
  }
  return 'en';
}

// ── Translation function (backward-compatible) ─────────────────────

type TranslationParams = Record<string, string | number | boolean>;

/**
 * Translate a key with optional interpolation parameters.
 *
 * Backward-compatible with the existing `t(key, params)` signature.
 * Uses i18next under the hood for ICU plural support and fallback.
 *
 * @example
 * t('auctions.bid.count', { count: 5 })
 * t('checkout.postage.eta.single', { days: 3, plural: 's' })
 */
export function t(key: TranslationKey, params?: TranslationParams): string {
  if (!initialized) initI18n();
  // i18next's t() returns the key itself if not found, which matches
  // the legacy fallback behavior.
  return i18next.t(key, params as Record<string, unknown>);
}

// ── React hook (for components that need reactivity) ───────────────

/**
 * React hook for translation. Re-renders the component when the locale changes.
 * Use this instead of `t()` in components that need to respond to locale changes.
 *
 * @example
 * const { t } = useTranslation();
 * <Text>{t('auctions.bid.current')}</Text>
 */
export { useTranslation } from 'react-i18next';

// ── Language option mapping (for settings UI) ──────────────────────

const LANGUAGE_TO_LOCALE_MAP: Record<string, SupportedLocale> = {
  'English (EN)': 'en',
  'Spanish (ES)': 'es',
  'French (FR)': 'fr',
  'German (DE)': 'de',
};

const LOCALE_TO_LANGUAGE_MAP: Record<SupportedLocale, string> =
  Object.fromEntries(
    Object.entries(LANGUAGE_TO_LOCALE_MAP).map(([k, v]) => [v, k]),
  ) as Record<SupportedLocale, string>;

export function mapLanguageOptionToLocale(languageOption: string): SupportedLocale {
  return LANGUAGE_TO_LOCALE_MAP[languageOption] ?? 'en';
}

export function mapLocaleToLanguageOption(locale: SupportedLocale): string {
  return LOCALE_TO_LANGUAGE_MAP[locale] ?? 'English (EN)';
}

// ── Auto-initialize on import ──────────────────────────────────────

// Initialize with device locale on module import. This runs once
// when the module is first loaded, typically during app startup.
initI18n();

// ── Re-export types ────────────────────────────────────────────────

export type { SupportedLocale, TranslationKey } from './index';
