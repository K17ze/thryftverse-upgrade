#!/usr/bin/env node
/**
 * Locale key parity validator.
 *
 * Loads the English locale (source of truth) and every non-English locale,
 * flattens both to dot-notation keys, and fails if any non-English locale is
 * missing keys that exist in English.
 *
 * Run:  node scripts/validate-locales.mjs
 *
 * Exit codes:
 *   0 — all locales have full key parity with English
 *   1 — one or more locales are missing keys (details printed to stderr)
 */

import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const LOCALES_DIR = join(ROOT, 'src', 'i18n', 'locales');

const SOURCE_LOCALE = 'en';
const NON_ENGLISH_LOCALES = [
  'es', 'fr', 'de', 'ar', 'hi', 'ja',
  'ko', 'zh', 'pt', 'id', 'ru', 'tr',
];

/**
 * Recursively flatten a nested object into dot-notation keys.
 * `{ a: { b: 'x' } }` → `{ 'a.b': 'x' }`
 */
function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

function loadLocale(locale) {
  const filePath = join(LOCALES_DIR, `${locale}.json`);
  const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return flattenObject(JSON.parse(raw));
}

function main() {
  const sourceKeys = Object.keys(loadLocale(SOURCE_LOCALE));
  const sourceKeySet = new Set(sourceKeys);

  let hasErrors = false;
  let totalMissing = 0;

  for (const locale of NON_ENGLISH_LOCALES) {
    const localeKeys = new Set(Object.keys(loadLocale(locale)));
    const missing = sourceKeys.filter((key) => !localeKeys.has(key));
    const extra = [...localeKeys].filter((key) => !sourceKeySet.has(key));

    if (missing.length > 0) {
      hasErrors = true;
      totalMissing += missing.length;
      console.error(
        `\n[${locale}] missing ${missing.length} key(s) present in English:`,
      );
      for (const key of missing) {
        console.error(`  - ${key}`);
      }
    }

    if (extra.length > 0) {
      console.warn(
        `[${locale}] has ${extra.length} key(s) not in English (orphaned):`,
      );
      for (const key of extra) {
        console.warn(`  + ${key}`);
      }
    }
  }

  if (hasErrors) {
    console.error(
      `\nLocale validation FAILED: ${totalMissing} missing key(s) across one or more locales.`,
    );
    process.exit(1);
  }

  console.log(
    `Locale validation PASSED: all ${NON_ENGLISH_LOCALES.length} non-English locales have full key parity with English (${sourceKeys.length} keys).`,
  );
  process.exit(0);
}

main();
