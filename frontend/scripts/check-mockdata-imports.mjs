#!/usr/bin/env node
/**
 * Import gate — ensures domain types are imported from `src/domain` and not
 * from `src/data/mockData` outside of `src/data/` and `src/fixtures/`.
 *
 * Importing MOCK_* fixture VALUES from mockData is still allowed for
 * fixture-mode code. Only TYPE imports are flagged.
 *
 * Exit codes:
 *   0 — no violations
 *   1 — violations found
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

// Directories that are allowed to import types from mockData.
const ALLOWED_DIRS = new Set([
  join(SRC, 'data'),
  join(SRC, 'fixtures'),
]);

const MOCKDATA_PATH_PATTERNS = [
  /(?:^|\/|\\)data\/mockData(?:\.js|\.ts)?$/,
  /(?:^|\/|\\)\.\.\/data\/mockData(?:\.js|\.ts)?$/,
  /(?:^|\/|\\)\.\.\/\.\.\/data\/mockData(?:\.js|\.ts)?$/,
  /(?:^|\/|\\)\.\.\/\.\.\/\.\.\/data\/mockData(?:\.js|\.ts)?$/,
  /['"]\.\.\/data\/mockData['"]/,
  /['"]\.\.\/\.\.\/data\/mockData['"]/,
  /['"]\.\.\/\.\.\/\.\.\/data\/mockData['"]/,
  /['"]\.\.\/\.\.\/\.\.\/\.\.\/data\/mockData['"]/,
  /['"]@data\/mockData['"]/,
];

/**
 * Walk a directory recursively and return all .ts/.tsx file paths.
 */
function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Is the given file inside an allowed directory?
 */
function isAllowed(file) {
  for (const allowed of ALLOWED_DIRS) {
    if (file === allowed || file.startsWith(allowed + sep)) return true;
  }
  return false;
}

/**
 * Extract import specifiers from a source file that reference mockData.
 * Returns the list of { line, text } entries that are type imports from mockData.
 */
function findTypeImportsFromMockData(source) {
  const lines = source.split(/\r?\n/);
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Only consider import statements.
    if (!/^import\b/.test(trimmed)) continue;

    // Must reference mockData somewhere on the line.
    if (!/mockData/.test(line)) continue;

    // Determine whether this is a type-only import.
    // Cases:
    //   import type { X } from '.../mockData';
    //   import { type X, Y } from '.../mockData';  -> mixed; flag if any type specifier
    const isTypeOnlyImport = /^import\s+type\b/.test(trimmed);
    const hasInlineTypeSpecifier = /\btype\s+[A-Za-z_$]/.test(line);

    if (!isTypeOnlyImport && !hasInlineTypeSpecifier) {
      // Value import (e.g. MOCK_LISTINGS) — allowed.
      continue;
    }

    // For inline `type X` specifiers inside a value import, we only flag if
    // the type specifier is actually a domain type. But to keep the gate
    // simple and strict, flag any import line that brings in a type from
    // mockData.
    hits.push({ line: i + 1, text: trimmed });
  }

  return hits;
}

const files = walk(SRC);
const violations = [];

for (const file of files) {
  if (isAllowed(file)) continue;

  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const hits = findTypeImportsFromMockData(source);
  if (hits.length > 0) {
    violations.push({
      file: relative(ROOT, file).split(sep).join('/'),
      hits,
    });
  }
}

if (violations.length === 0) {
  console.log('[check:domain-imports] No type imports from mockData outside src/data and src/fixtures. OK.');
  process.exit(0);
}

console.error('[check:domain-imports] Violations found — import domain types from "../domain" instead of "../data/mockData":\n');
for (const v of violations) {
  for (const h of v.hits) {
    console.error(`  ${v.file}:${h.line}`);
    console.error(`    ${h.text}`);
  }
}
console.error(`\n[check:domain-imports] ${violations.length} file(s) with violations.`);
process.exit(1);
