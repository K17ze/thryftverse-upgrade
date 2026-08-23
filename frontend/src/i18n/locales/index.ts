/**
 * Locale resource loader for the namespace-based i18n system.
 *
 * Imports the structured en.json (with nested groups per namespace) and
 * flattens each top-level namespace into dot-notation keys. This preserves
 * the existing i18next `keySeparator: false` configuration while allowing
 * human-readable nested JSON as the source of truth.
 *
 * Each top-level key in en.json becomes an i18next namespace. Nested keys
 * within a namespace are flattened to dot notation:
 *   { "common": { "buttons": { "save": "Save" } } }
 *   → namespace "common", key "buttons.save" → "Save"
 *
 * Usage in components:
 *   const { t } = useAppTranslation('home');
 *   t('brandTitle')           // → "Thryftverse" (from 'home' namespace)
 *   t('common:buttons.close') // → "Close" (from 'common' namespace)
 */

import enJson from './en.json';

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

function buildFlattenedResources(): FlattenedResources {
  const resources = {} as FlattenedResources;
  for (const [namespace, content] of Object.entries(enJson)) {
    if (content !== null && typeof content === 'object') {
      resources[namespace as AppNamespace] = flattenObject(content as Record<string, unknown>);
    }
  }
  return resources;
}

export const flattenedResources = buildFlattenedResources();

// ── i18next resource format ─────────────────────────────────────────

/**
 * Build the i18next resources object in the format:
 *   { en: { common: {...}, home: {...}, ... } }
 */
export function buildI18nResources(locale: string): Record<string, Record<string, Record<string, string>>> {
  const namespaces: Record<string, Record<string, string>> = {};
  for (const [namespace, flatKeys] of Object.entries(flattenedResources)) {
    namespaces[namespace] = flatKeys;
  }
  return { [locale]: namespaces };
}

// ── Type exports for type-safe translations ─────────────────────────

/**
 * Derive the flat key type for a given namespace from the flattened resources.
 */
export type NamespaceKeys<N extends AppNamespace> = keyof FlattenedResources[N];

// Re-export the raw JSON for tooling (e.g. i18n:extract script)
export { enJson };
