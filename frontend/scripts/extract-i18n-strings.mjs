#!/usr/bin/env node
/**
 * extract-i18n-strings.mjs
 *
 * Production i18n extraction tool for the ThryftVerse frontend.
 *
 * Scans frontend/src tree for t('key.name') calls, extracts all used
 * translation keys, and compares them against the keys defined in
 * frontend/src/i18n/index.ts.
 *
 * Reports:
 *   - missing: keys used in source but not defined in EN_TRANSLATIONS
 *   - unused:  keys defined in EN_TRANSLATIONS but not used in source
 *
 * Output:
 *   - JSON report to stdout (machine-readable)
 *   - Human-readable summary to stderr
 *
 * Usage:
 *   node scripts/extract-i18n-strings.mjs
 *
 * Exit codes:
 *   0 — no missing or unused keys
 *   1 — missing and/or unused keys found
 *   2 — fatal error (file not found, parse failure, etc.)
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve project root (frontend/) from the script location.
const FRONTEND_ROOT = resolve(__dirname, '..');
const SRC_ROOT = join(FRONTEND_ROOT, 'src');
const I18N_FILE = join(SRC_ROOT, 'i18n', 'index.ts');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Recursively collect files under `dir` matching a given extension.
 *
 * @param {string} dir - absolute directory to walk
 * @param {(name: string) => boolean} isMatch - predicate for file basename
 * @returns {Promise<string[]>} absolute file paths
 */
async function walkDir(dir, isMatch) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and build artefacts.
      if (entry.name === 'node_modules' || entry.name === '.expo') continue;
      out.push(...(await walkDir(full, isMatch)));
    } else if (entry.isFile() && isMatch(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const isTsxFile = (name) => name.endsWith('.tsx') || name.endsWith('.ts');

/**
 * Extract translation keys from t('...') / t("...") call sites in source text.
 *
 * Matches the exported `t` function from src/i18n/index.ts. Handles:
 *   - t('key.name')
 *   - t("key.name")
 *   - t('key.name', { ... })
 *   - whitespace between `t` and `(`
 *
 * Only static string literals are captured; dynamic/template keys are ignored
 * and reported separately so they can be audited manually.
 *
 * @param {string} source - raw file content
 * @returns {{ keys: string[], dynamic: number }}
 */
function extractTKeys(source) {
  const keys = new Set();
  let dynamic = 0;

  // Match t( followed by a quoted string literal.
  // We require a word boundary so we don't catch `.t(` method calls on
  // unrelated objects — but we also allow a leading `.` for `i18n.t(` style.
  const callRegex = /\bt\s*\(\s*(['"])([^'"]+)\1/g;
  let match;
  while ((match = callRegex.exec(source)) !== null) {
    const candidate = match[2];
    // Heuristic: translation keys in this codebase use dot.case with at least
    // one dot, and contain only lowercase letters, digits, dots, and
    // camelCase segments. Filter out obvious non-translation calls (e.g.
    // t("some prose") used by other libraries) by requiring a dot and no
    // spaces.
    if (candidate.includes('.') && !/\s/.test(candidate) && /^[a-z][a-zA-Z0-9.]*$/.test(candidate)) {
      keys.add(candidate);
    }
  }

  // Detect dynamic t() calls (template literals or concatenations) that we
  // cannot statically resolve. Look for t(` or t(someVar patterns.
  const dynamicRegex = /\bt\s*\(\s*(?:`|\+|[A-Za-z_$][\w$]*\s*[,)])/g;
  while ((dynamicRegex.exec(source)) !== null) {
    dynamic += 1;
  }

  return { keys: [...keys], dynamic };
}

/**
 * Extract defined keys from the i18n index.ts source.
 *
 * The file defines `const EN_TRANSLATIONS = { ... } as const;` with
 * `'dot.key': 'value',` entries. We parse the object literal body to collect
 * every quoted key.
 *
 * @param {string} source - raw content of src/i18n/index.ts
 * @returns {string[]} defined translation keys
 */
function extractDefinedKeys(source) {
  const keys = new Set();

  // Locate the EN_TRANSLATIONS object literal body.
  const startIdx = source.indexOf('const EN_TRANSLATIONS');
  if (startIdx === -1) {
    throw new Error('Could not locate `const EN_TRANSLATIONS` in i18n/index.ts');
  }
  const braceStart = source.indexOf('{', startIdx);
  if (braceStart === -1) {
    throw new Error('Could not locate opening brace of EN_TRANSLATIONS');
  }

  // Find the matching closing brace, respecting nested braces and strings.
  let depth = 0;
  let i = braceStart;
  let inString = false;
  let stringChar = '';
  while (i < source.length) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
      i += 1;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
    i += 1;
  }
  const body = source.slice(braceStart, i + 1);

  // Match top-level key entries: 'key.name': or "key.name":
  const keyRegex = /^\s*(['"])([^'"]+)\1\s*:/gm;
  let m;
  while ((m = keyRegex.exec(body)) !== null) {
    keys.add(m[2]);
  }

  return [...keys];
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // 1. Read defined keys from i18n/index.ts.
  const i18nSource = await readFile(I18N_FILE, 'utf8');
  const definedKeys = new Set(extractDefinedKeys(i18nSource));

  // 2. Walk src/ for .ts/.tsx files and collect used keys.
  const files = await walkDir(SRC_ROOT, isTsxFile);
  // Exclude the i18n index itself from usage scanning.
  const usageFiles = files.filter((f) => f !== I18N_FILE);

  /** @type {Record<string, string[]>} key -> list of relative file paths */
  const usedKeyLocations = {};
  /** @type {Set<string>} */
  const usedKeys = new Set();
  let totalDynamicCalls = 0;

  for (const file of usageFiles) {
    const source = await readFile(file, 'utf8');
    const { keys, dynamic } = extractTKeys(source);
    for (const k of keys) {
      usedKeys.add(k);
      const rel = relative(FRONTEND_ROOT, file).replace(/\\/g, '/');
      (usedKeyLocations[k] ??= []).push(rel);
    }
    totalDynamicCalls += dynamic;
  }

  // 3. Compute diffs.
  const missing = [...usedKeys].filter((k) => !definedKeys.has(k)).sort();
  const unused = [...definedKeys].filter((k) => !usedKeys.has(k)).sort();

  // 4. Build JSON report.
  const report = {
    summary: {
      definedKeys: definedKeys.size,
      usedKeys: usedKeys.size,
      missingCount: missing.length,
      unusedCount: unused.length,
      dynamicCallSites: totalDynamicCalls,
      scannedFiles: usageFiles.length,
    },
    missing: missing.map((k) => ({
      key: k,
      usedIn: usedKeyLocations[k] ?? [],
    })),
    unused,
    dynamicCallSites: totalDynamicCalls,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');

  // 5. Human-readable summary to stderr.
  const line = '─'.repeat(60);
  process.stderr.write(`\n${line}\n`);
  process.stderr.write(`i18n extraction report\n`);
  process.stderr.write(`${line}\n`);
  process.stderr.write(`  Scanned files:     ${report.summary.scannedFiles}\n`);
  process.stderr.write(`  Defined keys:      ${report.summary.definedKeys}\n`);
  process.stderr.write(`  Used keys:         ${report.summary.usedKeys}\n`);
  process.stderr.write(`  Dynamic call sites:${report.summary.dynamicCallSites} (not statically resolved)\n`);
  process.stderr.write(`  Missing keys:      ${report.summary.missingCount}\n`);
  process.stderr.write(`  Unused keys:       ${report.summary.unusedCount}\n`);

  if (missing.length > 0) {
    process.stderr.write(`\nMissing (used but not defined):\n`);
    for (const item of report.missing) {
      process.stderr.write(`  ${item.key}\n`);
      for (const loc of item.usedIn) {
        process.stderr.write(`    - ${loc}\n`);
      }
    }
  }

  if (unused.length > 0) {
    process.stderr.write(`\nUnused (defined but not used):\n`);
    for (const k of unused) {
      process.stderr.write(`  ${k}\n`);
    }
  }

  process.stderr.write(`${line}\n\n`);

  if (missing.length > 0 || unused.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(2);
});
