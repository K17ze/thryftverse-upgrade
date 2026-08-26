/**
 * Locale resource loader for the namespace-based i18n system.
 *
 * Imports the structured locale JSON files (en/es/fr/de) with nested groups
 * per namespace and flattens each top-level namespace into dot-notation keys.
 * This preserves the existing i18next `keySeparator: false` configuration
 * while allowing human-readable nested JSON as the source of truth.
 *
 * Each top-level key in a locale JSON file becomes an i18next namespace.
 * Nested keys within a namespace are flattened to dot notation:
 *   { "common": { "buttons": { "save": "Save" } } }
 *   → namespace "common", key "buttons.save" → "Save"
 *
 * Per-locale fallback: non-English locale files may be partial. Missing keys
 * fall through to English at the flattened-key level, so a Spanish file that
 * only translates `common.buttons.save` will still resolve
 * `common.buttons.cancel` from the English source.
 *
 * Usage in components:
 *   const { t } = useAppTranslation('home');
 *   t('brandTitle')           // → "Thryftverse" (from 'home' namespace)
 *   t('common:buttons.close') // → "Close" (from 'common' namespace)
 */

import enJson from './en.json';
import esJson from './es.json';
import frJson from './fr.json';
import deJson from './de.json';

// ── Flatten utility ─────────────────────────────────────────────────

/**
 * Recursively flatten a nested object into dot-notation keys.
 * `{ a: { b: 'x' } }` → `{ 'a.b': 'x' }`
 */
function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, fullKey));
    } else if (typeof value === 'string') {
      result[fullKey] = value;
    }
  }
  return result;
}

// ── Namespace extraction ────────────────────────────────────────────

/**
 * The top-level keys in en.json are i18next namespaces.
 * Each namespace's nested content is flattened into dot-notation keys.
 */
type LocaleNamespaces = typeof enJson;
export type AppNamespace = keyof LocaleNamespaces;

type FlattenedResources = {
  [K in AppNamespace]: Record<string, string>;
};

function buildFlattenedResources(json: LocaleNamespaces): FlattenedResources {
  const resources = {} as FlattenedResources;
  for (const [namespace, content] of Object.entries(json)) {
    if (content !== null && typeof content === 'object') {
      resources[namespace as AppNamespace] = flattenObject(content as Record<string, unknown>);
    }
  }
  return resources;
}

/** English flattened resources — the source of truth and fallback. */
export const flattenedResources = buildFlattenedResources(enJson);

/**
 * Merge a locale's flattened resources over the English base.
 * Missing keys inherit the English value (per-key fallback).
 */
function mergeWithEnglishFallback(
  localeFlat: Partial<FlattenedResources>,
): FlattenedResources {
  const merged = {} as FlattenedResources;
  for (const ns of Object.keys(enJson) as AppNamespace[]) {
    merged[ns] = { ...flattenedResources[ns], ...(localeFlat[ns] ?? {}) };
  }
  return merged;
}

const esFlattened = buildFlattenedResources(esJson as LocaleNamespaces);
const frFlattened = buildFlattenedResources(frJson as LocaleNamespaces);
const deFlattened = buildFlattenedResources(deJson as LocaleNamespaces);

/** Per-locale flattened namespace resources (with English fallback). */
export const localeResources: Record<string, FlattenedResources> = {
  en: flattenedResources,
  es: mergeWithEnglishFallback(esFlattened),
  fr: mergeWithEnglishFallback(frFlattened),
  de: mergeWithEnglishFallback(deFlattened),
};

// ── i18next resource format ─────────────────────────────────────────

/**
 * Build the i18next resources object for all locales in the format:
 *   { en: { common: {...}, home: {...}, ... },
 *     es: { common: {...}, ... } }
 */
export function buildI18nResources(): Record<string, Record<string, Record<string, string>>> {
  const result: Record<string, Record<string, Record<string, string>>> = {};
  for (const [locale, flat] of Object.entries(localeResources)) {
    result[locale] = {};
    for (const [namespace, keys] of Object.entries(flat)) {
      result[locale][namespace] = keys;
    }
  }
  return result;
}

// ── Type exports for type-safe translations ─────────────────────────

/**
 * Derive the flat key type for a given namespace from the flattened resources.
 */
export type NamespaceKeys<N extends AppNamespace> = keyof FlattenedResources[N];

// Re-export the raw JSON for tooling (e.g. i18n:extract script)
export { enJson, esJson, frJson, deJson };
