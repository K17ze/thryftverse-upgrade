#!/usr/bin/env node
/**
 * MockData boundary gate — ensures production runtime code does not import
 * from `src/data/mockData` outside of an explicit, reviewed allowlist.
 *
 * This is the stricter companion to `check-mockdata-imports.mjs`:
 *   - `check-mockdata-imports.mjs` flags TYPE imports from mockData
 *   - `check-mockdata-boundary.mjs` flags ALL imports from mockData
 *     (type + value) outside the allowlist
 *
 * The allowlist is intentionally small. Each entry was reviewed and
 * represents either:
 *   - The mockData owner directory itself (`src/data/`)
 *   - The fixture provider (`src/context/BackendDataContext.tsx`)
 *   - The store seed (`src/store/useStore.ts`)
 *   - A platform query hook with intentional fixture fallback
 *     (`src/platform/product/useListingQueries.ts`)
 *
 * Adding a new file to the allowlist requires justification in the PR.
 *
 * Exit codes:
 *   0 — no violations
 *   1 — violations found
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

// Directories where ANY import from mockData is allowed.
const ALLOWED_DIRS = new Set([
  join(SRC, 'data'),
  join(SRC, 'fixtures'),
]);

// Individual files outside ALLOWED_DIRS that are permitted to import
// from mockData. Each entry is reviewed and justified.
const ALLOWED_FILES = new Set([
  // The fixture data provider — owns the fixture/api source-truth switch.
  join(SRC, 'context', 'BackendDataContext.tsx'),
  // The store seeds initial conversations/bots from fixtures in offline mode.
  join(SRC, 'store', 'useStore.ts'),
  // Platform query hook with intentional fixture fallback for design mode.
  join(SRC, 'platform', 'product', 'useListingQueries.ts'),
  // Test files are allowed to import mockData for test fixtures.
  // Tests are matched by the __tests__ directory convention below.
]);

const MOCKDATA_PATTERN = /mockData/;

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
function isAllowedDir(file) {
  for (const allowed of ALLOWED_DIRS) {
    if (file === allowed || file.startsWith(allowed + sep)) return true;
  }
  return false;
}

/**
 * Is the given file an explicitly allowed file?
 */
function isAllowedFile(file) {
  return ALLOWED_FILES.has(file);
}

/**
 * Is the given file a test file?
 */
function isTestFile(file) {
  return file.includes(join('__tests__')) || file.endsWith('.test.ts') || file.endsWith('.test.tsx');
}

/**
 * Extract import lines that reference mockData.
 */
function findMockDataImports(source) {
  const lines = source.split(/\r?\n/);
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Only consider import statements.
    if (!/^import\b/.test(trimmed)) continue;

    // Must reference mockData somewhere on the line.
    if (!MOCKDATA_PATTERN.test(line)) continue;

    hits.push({ line: i + 1, text: trimmed });
  }

  return hits;
}

const files = walk(SRC);
const violations = [];

for (const file of files) {
  // Allowed directories (src/data, src/fixtures)
  if (isAllowedDir(file)) continue;
  // Explicitly allowed files
  if (isAllowedFile(file)) continue;
  // Test files
  if (isTestFile(file)) continue;

  let source;
  try {
    source = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const hits = findMockDataImports(source);
  if (hits.length > 0) {
    violations.push({
      file: relative(ROOT, file).split(sep).join('/'),
      hits,
    });
  }
}

if (violations.length === 0) {
  console.log('[check:mockdata-boundary] No mockData imports outside allowlist. OK.');
  process.exit(0);
}

console.error('[check:mockdata-boundary] Violations found — production runtime code must not import from data/mockData.\n');
console.error('Allowed: src/data/, src/fixtures/, test files, and the explicit allowlist in scripts/check-mockdata-boundary.mjs\n');
for (const v of violations) {
  for (const h of v.hits) {
    console.error(`  ${v.file}:${h.line}`);
    console.error(`    ${h.text}`);
  }
}
console.error(`\n[check:mockdata-boundary] ${violations.length} file(s) with violations.`);
console.error('To fix: import domain types from "../domain/*" and get fixture values from BackendDataContext.');
process.exit(1);
