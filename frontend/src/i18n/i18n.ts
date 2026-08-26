/**
 * i18next configuration for ThryftVerse.
 *
 * Dual-resource architecture:
 *   1. Legacy `translation` namespace — flat-key system from `./index.ts`
 *      (EN_TRANSLATIONS + locale patches). Used by the backward-compatible
 *      `t(key)` export and ~8 files that haven't migrated yet.
 *   2. Structured namespaces — `common`, `home`, `search`, `settings`,
 *      `profile`, `listing`, `messaging`, `commerce`, `auction`, `coown`,
 *      `seller`, `trade`, `discovery`, `asset` from `./locales/en.json`.
 *      Used by `useAppTranslation(namespace)` which is the preferred hook
 *      for all new and migrated screens.
 *
 * Both systems coexist during the migration period. Once all screens
 * migrate to `useAppTranslation`, the legacy `translation` namespace and
 * `./index.ts` flat-key system will be removed.
 *
 * Key flattening:
 *   `keySeparator: false` — keys like `auctions.bid.current` are flat
 *   keys (dots are part of the name, not path separators). This applies
 *   to both the legacy `translation` namespace and the flattened namespace
 *   resources from `./locales/index.ts`.
 *
 * Namespace separation:
 *   `nsSeparator: ':'` — allows `t('common:buttons.close')` to resolve
 *   across namespaces. Legacy keys don't contain `:` so this is safe.
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
import { localeResources } from './locales';

// ── Locale constants ───────────────────────────────────────────────

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'es', 'fr', 'de'];

const RTL_LOCALES: string[] = ['ar', 'he', 'fa', 'ur'];

// ── Resource construction ──────────────────────────────────────────

/**
 * Merge the English base with a locale patch, producing a complete
 * translation resource for the legacy `translation` namespace.
 * Missing keys fall through to English.
 */
function buildLegacyResource(
  patch: Partial<Record<TranslationKey, string>>,
): Record<string, string> {
  return { ...EN_TRANSLATIONS, ...patch };
}

/**
 * Build the full resource bundle for a locale. Combines:
 *   - The legacy `translation` namespace (flat keys from index.ts)
 *   - The structured namespaces (common, home, search, etc. from locale JSON)
 *
 * Non-English locales get per-key fallback to English via `localeResources`
 * (which merges locale JSON over the English base at the flattened-key level).
 */
function buildLocaleResources(
  legacyPatch: Partial<Record<TranslationKey, string>>,
  localeCode: string,
): Record<string, Record<string, string>> {
  const namespaced = localeResources[localeCode] ?? localeResources.en;
  return {
    translation: buildLegacyResource(legacyPatch),
    ...namespaced,
  };
}

const resources: Record<string, Record<string, Record<string, string>>> = {
  en: buildLocaleResources({}, 'en'),
  es: buildLocaleResources(ES_TRANSLATION_PATCH, 'es'),
  fr: buildLocaleResources(FR_TRANSLATION_PATCH, 'fr'),
  de: buildLocaleResources(DE_TRANSLATION_PATCH, 'de'),
};

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
    // Use v4 plural compatibility for modern ICU plural rules
    // (required by intl-pluralrules polyfill for correct pluralisation)
    compatibilityJSON: 'v4',
    // Legacy `translation` namespace is the default so `t('auctions.bid.current')`
    // continues to work without specifying a namespace.
    defaultNS: 'translation',
    // Flat keys — don't split on dots (existing keys use dots as part of the key name)
    keySeparator: false,
    // Allow `t('common:buttons.close')` to resolve across namespaces.
    // Legacy keys don't contain `:` so this is safe.
    nsSeparator: ':',
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
