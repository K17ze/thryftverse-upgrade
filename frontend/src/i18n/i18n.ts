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
import AsyncStorage from '@react-native-async-storage/async-storage';

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

export const SUPPORTED_LOCALES: SupportedLocale[] = ['en', 'es', 'fr', 'de', 'ar', 'hi', 'zh', 'pt', 'ja', 'ru', 'tr', 'ko', 'id'];

const RTL_LOCALES: string[] = ['ar', 'he', 'fa', 'ur'];

/**
 * Dedicated AsyncStorage key for the persisted user locale choice.
 * Separate from the general settings preferences key so locale
 * hydration can happen early in app startup before the full
 * settings context is mounted.
 */
export const LOCALE_STORAGE_KEY = 'thryftverse:locale:v1';

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
  ar: buildLocaleResources({}, 'ar'),
  hi: buildLocaleResources({}, 'hi'),
  zh: buildLocaleResources({}, 'zh'),
  pt: buildLocaleResources({}, 'pt'),
  ja: buildLocaleResources({}, 'ja'),
  ru: buildLocaleResources({}, 'ru'),
  tr: buildLocaleResources({}, 'tr'),
  ko: buildLocaleResources({}, 'ko'),
  id: buildLocaleResources({}, 'id'),
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
    // Load only the base language code (e.g. 'en' not 'en-US'),
    // so i18next matches our flat resource keys regardless of the
    // region tag returned by the device or AsyncStorage.
    load: 'languageOnly',
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
 * Hydrate the persisted locale from AsyncStorage on app startup.
 * Returns the persisted locale, or the device locale if no choice
 * has been saved yet (first launch). Falls back to 'en'.
 *
 * Call this early in app initialization, before the settings context
 * is mounted, so the correct locale is active from the first render.
 */
export async function hydratePersistedLocale(): Promise<SupportedLocale> {
  try {
    const stored = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && SUPPORTED_LOCALES.includes(stored as SupportedLocale)) {
      return stored as SupportedLocale;
    }
  } catch {
    // AsyncStorage unavailable — fall through to device detection
  }
  return detectDeviceLocale();
}

/**
 * Change the active locale. Updates i18next, RTL support, and persists
 * the choice to AsyncStorage so it survives app restarts.
 */
export async function setI18nLocale(locale: SupportedLocale): Promise<void> {
  if (!initialized) initI18n(locale);
  await i18next.changeLanguage(locale);
  applyRTLSupport(locale);
  // Persist the user's locale choice in a dedicated key so it can be
  // hydrated early on next launch, independent of the full settings context.
  try {
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Best-effort persistence — don't block the locale change
  }
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
