#!/usr/bin/env node
/**
 * Production residue checker.
 *
 * Validates that no anti-AI production residue enters the codebase.
 * Catches ERROR patterns (fail the build) and WARNING patterns (report only).
 *
 * ERROR patterns (exit 1):
 *   1. DEMO_MODE = true (not gated behind __DEV__)
 *   2. isDemo = true in production code (not in test/mock files)
 *   3. Math.random() used in persisted domain ID generation
 *   4. AsyncStorage containing keys named key/secret/token/credential/apiKey/password
 *   5. mockData imports that are NOT `import type` and NOT gated behind ENABLE_RUNTIME_MOCKS
 *   6. `fake` in variable/function names in production routes
 *
 * WARNING patterns (exit 0, reported to stderr):
 *   1. Comments referencing competitor patterns (Instagram/Snapchat/Pinterest/TikTok)
 *   2. Comments referencing "flagship 2026" or "premium glassmorphism"
 *   3. Comments referencing "psychology"
 *   4. Comments referencing "per spec" or "per audit" (OK but tracked)
 *   5. "AI-powered" in non-Agent feature UI text
 *
 * Run via: npm run check:residue
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, extname, relative } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);
const EXCLUDE_DIRS = new Set([
  '__tests__',
  'node_modules',
  '__mocks__',
  '__screenshots__',
  '__fixtures__',
]);
const EXCLUDE_FILE_PATTERNS = [/\.test\./, /\.spec\./, /mockData\.ts$/, /mockGate\.ts$/];

// Sensitive key words that must never appear in AsyncStorage key names.
// Secrets belong in expo-secure-store, not AsyncStorage.
const SENSITIVE_KEY_WORDS = [
  'secret',
  'token',
  'credential',
  'apikey',
  'api_key',
  'password',
  'api-key',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isExcludedFile(filePath) {
  const rel = relative(SRC, filePath).replace(/\\/g, '/');
  return EXCLUDE_FILE_PATTERNS.some((p) => p.test(rel));
}

function walk(dir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      results.push(...walk(full));
    } else if (SCAN_EXTENSIONS.has(extname(full))) {
      if (!isExcludedFile(full)) {
        results.push(full);
      }
    }
  }
  return results;
}

function relPath(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, '/');
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function isCommentLine(line) {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('{/*')
  );
}

// ─── ERROR checks ────────────────────────────────────────────────────────────

/**
 * 1. DEMO_MODE = true (not gated behind __DEV__)
 * 2. isDemo = true in production code
 */
function checkDemoModeTrue(src, filePath) {
  const violations = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;

    // DEMO_MODE = true not gated behind __DEV__
    // Matches: FOO_DEMO_MODE = true, const BAR_DEMO_MODE = true
    // Does NOT match: DEMO_MODE = __DEV__ or DEMO_MODE = false
    const demoMatch = /(\w*DEMO_MODE)\s*=\s*true\b/.exec(line);
    if (demoMatch) {
      violations.push({
        file: relPath(filePath),
        line: i + 1,
        rule: 'demo-mode-true',
        severity: 'error',
        message: `${demoMatch[1]} = true is not gated behind __DEV__ — use \` = __DEV__\` instead`,
      });
    }

    // isDemo = true literal assignment (not isDemo: someFlag which is a property)
    const isDemoMatch = /\bisDemo\s*=\s*true\b/.exec(line);
    if (isDemoMatch) {
      violations.push({
        file: relPath(filePath),
        line: i + 1,
        rule: 'is-demo-true',
        severity: 'error',
        message: `isDemo = true in production code — use a __DEV__-gated flag instead`,
      });
    }
  }
  return violations;
}

/**
 * 3. Math.random() used in persisted domain ID generation.
 *    Looks for Math.random().toString(36) near id: / id = assignments.
 *    Only checks domain-logic files (services, data, store, hooks, utils,
 *    platform, context, lib) — not pure UI components where IDs are ephemeral
 *    animation/React-key identifiers.
 */
function checkMathRandomIds(src, filePath) {
  const violations = [];
  const rel = relative(SRC, filePath).replace(/\\/g, '/');

  // Only check domain-logic directories — component IDs are typically
  // ephemeral (animation particles, React keys), not persisted domain IDs.
  const domainDirs = [
    'services/',
    'data/',
    'store/',
    'hooks/',
    'utils/',
    'platform/',
    'context/',
    'lib/',
  ];
  const isDomainFile = domainDirs.some((d) => rel.startsWith(d));
  if (!isDomainFile) return violations;

  const randomPattern = /Math\.random\(\)\.toString\(36\)/g;
  let match;
  while ((match = randomPattern.exec(src)) !== null) {
    const randomIdx = match.index;
    const lineStart = src.lastIndexOf('\n', randomIdx) + 1;
    const lineEnd = src.indexOf('\n', randomIdx);
    const lineText = src.slice(lineStart, lineEnd === -1 ? src.length : lineEnd);
    if (isCommentLine(lineText)) continue;

    // Look for id: or id = within 200 chars before the Math.random() call
    const windowStart = Math.max(0, randomIdx - 200);
    const window = src.slice(windowStart, randomIdx + 100);
    if (/\bid\s*[:=]/.test(window)) {
      violations.push({
        file: relPath(filePath),
        line: lineOf(src, randomIdx),
        rule: 'math-random-id',
        severity: 'error',
        message:
          'Math.random().toString(36) used in ID generation — use createStableId/makeStableId from utils/createStableId.ts instead',
      });
    }
  }
  return violations;
}

/**
 * 4. AsyncStorage containing keys named key/secret/token/credential/apiKey/password.
 *    Checks both string-literal keys and variable references that resolve to
 *    string literals in the same file.
 */
function checkAsyncStorageSensitiveKeys(src, filePath) {
  const violations = [];
  const asyncPattern = /AsyncStorage\.(setItem|getItem|removeItem)\s*\(\s*([^,)\n]+)/g;
  let match;
  while ((match = asyncPattern.exec(src)) !== null) {
    const keyExpr = match[2].trim();
    const lineNum = lineOf(src, match.index);

    let keyValue = null;

    // Case 1: string literal directly in the call
    const stringLiteral = /^['"`]([^'"`]+)['"`]$/.exec(keyExpr);
    if (stringLiteral) {
      keyValue = stringLiteral[1];
    } else {
      // Case 2: variable reference — try to resolve to a string constant
      const varName = keyExpr.replace(/\s/g, '');
      const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const varPattern = new RegExp(
        `(?:const|let|var)\\s+${escaped}\\s*=\\s*['"\`]([^'"\`]+)['"\`]`
      );
      const varMatch = varPattern.exec(src);
      if (varMatch) {
        keyValue = varMatch[1];
      }
    }

    if (keyValue) {
      const lower = keyValue.toLowerCase();
      for (const word of SENSITIVE_KEY_WORDS) {
        if (lower.includes(word)) {
          violations.push({
            file: relPath(filePath),
            line: lineNum,
            rule: 'async-storage-sensitive-key',
            severity: 'error',
            message: `AsyncStorage key "${keyValue}" contains sensitive word "${word}" — use expo-secure-store for secrets, not AsyncStorage`,
          });
          break;
        }
      }
    }
  }
  return violations;
}

/**
 * 5. mockData imports that are NOT `import type` and NOT gated behind
 *    ENABLE_RUNTIME_MOCKS.
 */
function checkMockDataImports(src, filePath) {
  const violations = [];
  // Match value imports (not `import type`) from paths containing mockData
  const importPattern =
    /^import\s+(?!type\b)\s*(.+?)\s+from\s+['"][^'"]*mockData['"]/gm;
  let match;
  while ((match = importPattern.exec(src)) !== null) {
    const lineNum = lineOf(src, match.index);
    // Check if the file references ENABLE_RUNTIME_MOCKS anywhere
    if (!/ENABLE_RUNTIME_MOCKS/.test(src)) {
      violations.push({
        file: relPath(filePath),
        line: lineNum,
        rule: 'ungated-mockdata-import',
        severity: 'error',
        message:
          'mockData value import without ENABLE_RUNTIME_MOCKS gating — use `import type` or gate usage behind ENABLE_RUNTIME_MOCKS',
      });
    }
  }
  return violations;
}

/**
 * 6. `fake` in variable/function names in production routes.
 *    e.g., fakeProvider, fakeConnection, fakeListing
 */
function checkFakeNames(src, filePath) {
  const violations = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;

    // Look for fake-prefixed identifiers in declarations
    const fakeMatch = /\b(?:const|let|var|function)\s+(fake[A-Z]\w*)/.exec(line);
    if (fakeMatch) {
      violations.push({
        file: relPath(filePath),
        line: i + 1,
        rule: 'fake-name-in-production',
        severity: 'error',
        message: `Variable/function "${fakeMatch[1]}" uses "fake" prefix in production code — use a real implementation or a clearly-gated mock`,
      });
    }
  }
  return violations;
}

// ─── WARNING checks ───────────────────────────────────────────────────────────

const WARNING_COMMENT_PATTERNS = [
  { needle: 'Instagram pattern', label: 'Instagram pattern comment' },
  { needle: 'Snapchat pattern', label: 'Snapchat pattern comment' },
  { needle: 'Pinterest pattern', label: 'Pinterest pattern comment' },
  { needle: 'TikTok pattern', label: 'TikTok pattern comment' },
  { needle: 'flagship 2026', label: 'flagship 2026 comment' },
  { needle: 'premium glassmorphism', label: 'premium glassmorphism comment' },
  { needle: 'psychology', label: 'psychology comment' },
  { needle: 'per spec', label: 'per spec comment' },
  { needle: 'per audit', label: 'per audit comment' },
];

/**
 * Warning: Comments referencing competitor patterns, flagship language,
 * psychology, or spec/audit references.
 */
function checkWarningComments(src, filePath) {
  const violations = [];
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isCommentLine(line)) continue;
    for (const wp of WARNING_COMMENT_PATTERNS) {
      if (line.includes(wp.needle)) {
        violations.push({
          file: relPath(filePath),
          line: i + 1,
          rule: wp.label.replace(/\s+/g, '-').toLowerCase(),
          severity: 'warning',
          message: `${wp.label} — tracked for cleanup (non-blocking)`,
        });
      }
    }
  }
  return violations;
}

/**
 * Warning: "AI-powered" in non-Agent feature UI text.
 * Skips Agent feature files and comment lines.
 */
function checkAIPoweredText(src, filePath) {
  const violations = [];
  const rel = relative(SRC, filePath).replace(/\\/g, '/');
  // Skip Agent feature files
  if (/agent/i.test(rel)) return violations;

  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    if (/AI-powered/.test(line)) {
      violations.push({
        file: relPath(filePath),
        line: i + 1,
        rule: 'ai-powered-non-agent',
        severity: 'warning',
        message: `"AI-powered" text in non-Agent feature — avoid AI claims for non-AI features`,
      });
    }
  }
  return violations;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const files = walk(SRC);
  const errors = [];
  const warnings = [];

  for (const file of files) {
    const src = readFileSync(file, 'utf-8');

    // ERROR checks
    errors.push(...checkDemoModeTrue(src, file));
    errors.push(...checkMathRandomIds(src, file));
    errors.push(...checkAsyncStorageSensitiveKeys(src, file));
    errors.push(...checkMockDataImports(src, file));
    errors.push(...checkFakeNames(src, file));

    // WARNING checks
    warnings.push(...checkWarningComments(src, file));
    warnings.push(...checkAIPoweredText(src, file));
  }

  // ── Report ──────────────────────────────────────────────────────────────
  console.log('\n=== Production Residue Check ===\n');

  // Aggregate by rule for summary table
  const errorRules = {};
  for (const e of errors) {
    errorRules[e.rule] = (errorRules[e.rule] || 0) + 1;
  }
  const warningRules = {};
  for (const w of warnings) {
    warningRules[w.rule] = (warningRules[w.rule] || 0) + 1;
  }

  // Summary table
  console.log('Summary:');
  console.log(`  Files scanned : ${files.length}`);
  console.log(`  Errors        : ${errors.length}`);
  console.log(`  Warnings      : ${warnings.length}`);

  if (Object.keys(errorRules).length > 0) {
    console.log('\n  Error breakdown:');
    for (const [rule, count] of Object.entries(errorRules)) {
      console.log(`    ${rule.padEnd(36)} ${count}`);
    }
  }

  if (Object.keys(warningRules).length > 0) {
    console.log('\n  Warning breakdown:');
    for (const [rule, count] of Object.entries(warningRules)) {
      console.log(`    ${rule.padEnd(36)} ${count}`);
    }
  }

  // Print ERRORs to stderr
  if (errors.length > 0) {
    console.error(`\n✗ production-residue: ${errors.length} ERROR(s) found\n`);
    for (const v of errors.slice(0, 50)) {
      console.error(`  ${v.file}:${v.line} [${v.rule}] ${v.message}`);
    }
    if (errors.length > 50) {
      console.error(`  ... and ${errors.length - 50} more errors`);
    }
  }

  // Print WARNINGs to stderr
  if (warnings.length > 0) {
    process.stderr.write(
      `\n⚠ production-residue: ${warnings.length} WARNING(s) found\n`
    );
    for (const v of warnings.slice(0, 50)) {
      process.stderr.write(`  ${v.file}:${v.line} [${v.rule}] ${v.message}\n`);
    }
    if (warnings.length > 50) {
      process.stderr.write(
        `  ... and ${warnings.length - 50} more warnings\n`
      );
    }
  }

  // Exit code
  if (errors.length > 0) {
    console.error(
      '\n✗ production-residue: ERROR patterns found — fix before merge.\n'
    );
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.log(
      `\n~ production-residue: ${warnings.length} warning(s) reported (non-blocking).`
    );
  } else {
    console.log('\n✓ production-residue: No violations found.');
  }
  process.exit(0);
}

main();
