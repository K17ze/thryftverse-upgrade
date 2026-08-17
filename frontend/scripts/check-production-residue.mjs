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
 *   6. Mock-returning exported functions in services/ (return hardcoded arrays without fetch)
 *   7. Demo-shaped IDs (g-asset-*, g-col-*, g-ed-*, demo-*, mock-*, test-*) in service files
 *   8. "AI" UI copy in files declaring requiresML: false or capabilityClass: 'filter'
 *   9. Nested VirtualizedList/FlatList/FlashList inside a same-axis ScrollView
 *  10. Direct navigation.navigate('ItemDetail') bypassing openProductDetail resolver
 *
 * INFO patterns (exit 0, reported to stderr):
 *   1. Publication schema files omitting fields from the matching client contract
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

/**
 * Warning: Mock-returning exported functions in services/ directories.
 * Flags `export async function fetch*` (or `export function fetch*`) that
 * return hardcoded arrays/objects (`return [...]` / `return {...}`) without
 * making a `fetch(` call. These are migration-time stubs that should be
 * wired to a real backend.
 */
function checkMockReturningExports(src, filePath) {
  const violations = [];
  const rel = relative(SRC, filePath).replace(/\\/g, '/');
  // Only check services/ directories
  if (!rel.startsWith('services/')) return violations;

  // Match exported async (or sync) functions whose name starts with "fetch"
  const exportFnPattern =
    /export\s+(?:async\s+)?function\s+(fetch\w*)\s*\([^)]*\)\s*\{/g;
  let fnMatch;
  while ((fnMatch = exportFnPattern.exec(src)) !== null) {
    const fnName = fnMatch[1];
    const bodyStart = fnMatch.index + fnMatch[0].length;
    // Find the matching closing brace by counting braces
    let depth = 1;
    let i = bodyStart;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      i++;
    }
    const body = src.slice(bodyStart, i - 1);

    // Skip if the body makes a fetch() call — it's a real implementation
    if (/\bfetch\s*\(/.test(body)) continue;

    // Check for hardcoded return of array or object literal
    if (/return\s*\[\s*\{?/.test(body) || /return\s*\{\s*/.test(body)) {
      const lineNum = lineOf(src, fnMatch.index);
      violations.push({
        file: relPath(filePath),
        line: lineNum,
        rule: 'mock-returning-export',
        severity: 'warning',
        message: `Exported function "${fnName}" returns a hardcoded array/object without a fetch() call — wire to real backend (migration warning)`,
      });
    }
  }
  return violations;
}

/**
 * Warning: Demo-shaped IDs in service files.
 * Flags string literals matching patterns like `g-asset-1`, `g-col-1`,
 * `g-ed-1`, `demo-*`, `mock-*`, `test-*` in service modules (not test files).
 * These are placeholder/demo identifiers that should not ship in production
 * service code.
 */
function checkDemoShapedIds(src, filePath) {
  const violations = [];
  const rel = relative(SRC, filePath).replace(/\\/g, '/');
  // Only check service files, not test files
  if (!rel.startsWith('services/')) return violations;

  const demoIdPattern =
    /['"`](g-asset-\w+|g-col-\w+|g-ed-\w+|demo-\w+|mock-\w+|test-\w+)['"`]/g;
  let match;
  while ((match = demoIdPattern.exec(src)) !== null) {
    const lineNum = lineOf(src, match.index);
    const lineStart = src.lastIndexOf('\n', match.index) + 1;
    const lineEnd = src.indexOf('\n', match.index);
    const lineText = src.slice(
      lineStart,
      lineEnd === -1 ? src.length : lineEnd
    );
    if (isCommentLine(lineText)) continue;
    violations.push({
      file: relPath(filePath),
      line: lineNum,
      rule: 'demo-shaped-id',
      severity: 'warning',
      message: `Demo-shaped ID "${match[1]}" in service module — replace with real domain identifiers before production`,
    });
  }
  return violations;
}

/**
 * Warning: "AI" UI copy in files that declare requiresML: false or
 * capabilityClass: 'filter'. A feature manifest declaring no ML requirement
 * should not advertise AI capabilities in its UI text.
 */
function checkAICopyWithoutML(src, filePath) {
  const violations = [];
  // Only check if the file declares a non-ML capability
  const hasNonMLDecl =
    /requiresML\s*:\s*false/.test(src) ||
    /capabilityClass\s*:\s*['"`]filter['"`]/.test(src);
  if (!hasNonMLDecl) return violations;

  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    // Look for "AI" in UI text contexts: Text content, titles, labels
    // Matches: >AI<, 'AI ...', "AI ...", `AI ...`, title: 'AI', label: 'AI'
    // Avoid matching variable names like AIModel by requiring word boundary
    // and surrounding text context.
    const aiTextPattern =
      /(?:>\s*AI\b|['"`]\s*AI\b|title\s*:\s*['"`]\s*AI\b|label\s*:\s*['"`]\s*AI\b)/;
    if (aiTextPattern.test(line)) {
      violations.push({
        file: relPath(filePath),
        line: i + 1,
        rule: 'ai-copy-without-ml',
        severity: 'warning',
        message: `"AI" UI copy in a feature declaring requiresML: false or capabilityClass: 'filter' — avoid AI claims for non-ML features`,
      });
    }
  }
  return violations;
}

/**
 * Warning: Nested VirtualizedList/FlatList/FlashList inside a ScrollView.
 * Flags files that contain both a <ScrollView and a <FlatList, <FlashList,
 * or <VirtualizedList — a potential same-axis nested scrolling violation
 * that degrades scroll performance on React Native.
 */
function checkNestedVirtualizedList(src, filePath) {
  const violations = [];
  if (!/<ScrollView\b/.test(src)) return violations;

  const listPattern = /<(FlatList|FlashList|VirtualizedList)\b/g;
  let match;
  while ((match = listPattern.exec(src)) !== null) {
    const lineNum = lineOf(src, match.index);
    violations.push({
      file: relPath(filePath),
      line: lineNum,
      rule: 'nested-virtualized-list',
      severity: 'warning',
      message: `<${match[1]} inside a <ScrollView> — nested same-axis virtualized lists degrade scroll performance; flatten the layout`,
    });
  }
  return violations;
}

/**
 * Warning: Direct ItemDetail navigation bypassing the canonical resolver.
 * Flags `navigation.navigate('ItemDetail'` or `navigation.push('ItemDetail'`
 * in files that are NOT the canonical resolver (openProductDetail.ts) or
 * test files. Migration to openProductDetail is recommended.
 */
function checkDirectItemDetailNavigation(src, filePath) {
  const violations = [];
  const rel = relative(SRC, filePath).replace(/\\/g, '/');
  // Skip the canonical resolver itself
  if (rel.endsWith('openProductDetail.ts')) return violations;

  const navPattern =
    /navigation\.(navigate|push)\s*\(\s*['"`]ItemDetail['"`]/g;
  let match;
  while ((match = navPattern.exec(src)) !== null) {
    const lineNum = lineOf(src, match.index);
    const lineStart = src.lastIndexOf('\n', match.index) + 1;
    const lineEnd = src.indexOf('\n', match.index);
    const lineText = src.slice(
      lineStart,
      lineEnd === -1 ? src.length : lineEnd
    );
    if (isCommentLine(lineText)) continue;
    violations.push({
      file: relPath(filePath),
      line: lineNum,
      rule: 'direct-itemdetail-navigation',
      severity: 'warning',
      message: `Direct navigation.${match[1]}('ItemDetail') bypasses the canonical openProductDetail resolver — migrate to openProductDetail()`,
    });
  }
  return violations;
}

// ─── INFO checks ─────────────────────────────────────────────────────────────

/**
 * Info: Publication schema gaps.
 * Flags backend schema files (in services/ or data/ directories with
 * "schema" in the filename) that omit fields present in the matching client
 * contract. This is informational only — it compares field names declared
 * in a schema file against a co-located or referenced client contract.
 *
 * Detection heuristic:
 * - Identifies schema files (filename contains "schema")
 * - Looks for a sibling contract file (filename contains "contract" or
 *   "types" in the same directory)
 * - Extracts field names from both and reports fields present in the
 *   contract but missing from the schema.
 */
function checkPublicationSchemaGaps(src, filePath, allFiles) {
  const violations = [];
  const rel = relative(SRC, filePath).replace(/\\/g, '/');
  const baseName = rel.split('/').pop();

  // Only check schema files in services/ or data/
  if (
    !(rel.startsWith('services/') || rel.startsWith('data/')) ||
    !/schema/i.test(baseName)
  ) {
    return violations;
  }

  // Find a sibling contract file in the same directory
  const dir = rel.substring(0, rel.lastIndexOf('/'));
  const contractFile = allFiles.find((f) => {
    const fRel = relative(SRC, f).replace(/\\/g, '/');
    const fDir = fRel.substring(0, fRel.lastIndexOf('/'));
    const fName = fRel.split('/').pop();
    return (
      fDir === dir &&
      f !== filePath &&
      /(contract|types)/i.test(fName) &&
      /\.(ts|tsx)$/.test(fName)
    );
  });

  if (!contractFile) return violations;

  // Extract field names from the schema file (interface/type field declarations)
  const schemaFields = new Set();
  const schemaFieldPattern = /^\s*(\w+)\s*[?:]/gm;
  let sm;
  while ((sm = schemaFieldPattern.exec(src)) !== null) {
    const name = sm[1];
    // Skip type keywords and common non-field identifiers
    if (
      /^(type|interface|export|import|const|let|var|function|class|enum|return|if|for|while|switch|case|default|extends|implements)$/.test(
        name
      )
    ) {
      continue;
    }
    schemaFields.add(name);
  }

  // Extract field names from the contract file
  let contractSrc;
  try {
    contractSrc = readFileSync(contractFile, 'utf-8');
  } catch {
    return violations;
  }
  const contractFields = new Set();
  let cm;
  while ((cm = schemaFieldPattern.exec(contractSrc)) !== null) {
    const name = cm[1];
    if (
      /^(type|interface|export|import|const|let|var|function|class|enum|return|if|for|while|switch|case|default|extends|implements)$/.test(
        name
      )
    ) {
      continue;
    }
    contractFields.add(name);
  }

  // Report contract fields missing from the schema
  const missing = [];
  for (const field of contractFields) {
    if (!schemaFields.has(field)) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    violations.push({
      file: relPath(filePath),
      line: 1,
      rule: 'publication-schema-gap',
      severity: 'info',
      message: `Schema omits ${missing.length} field(s) present in client contract (${relative(SRC, contractFile).replace(/\\/g, '/')}): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ` ... and ${missing.length - 10} more` : ''}`,
    });
  }
  return violations;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const files = walk(SRC);
  const errors = [];
  const warnings = [];
  const infos = [];

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
    warnings.push(...checkMockReturningExports(src, file));
    warnings.push(...checkDemoShapedIds(src, file));
    warnings.push(...checkAICopyWithoutML(src, file));
    warnings.push(...checkNestedVirtualizedList(src, file));
    warnings.push(...checkDirectItemDetailNavigation(src, file));

    // INFO checks
    infos.push(...checkPublicationSchemaGaps(src, file, files));
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
  const infoRules = {};
  for (const info of infos) {
    infoRules[info.rule] = (infoRules[info.rule] || 0) + 1;
  }

  // Summary table
  console.log('Summary:');
  console.log(`  Files scanned : ${files.length}`);
  console.log(`  Errors        : ${errors.length}`);
  console.log(`  Warnings      : ${warnings.length}`);
  console.log(`  Info          : ${infos.length}`);

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

  if (Object.keys(infoRules).length > 0) {
    console.log('\n  Info breakdown:');
    for (const [rule, count] of Object.entries(infoRules)) {
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

  // Print INFOs to stderr
  if (infos.length > 0) {
    process.stderr.write(
      `\nℹ production-residue: ${infos.length} INFO(s) found\n`
    );
    for (const v of infos.slice(0, 50)) {
      process.stderr.write(`  ${v.file}:${v.line} [${v.rule}] ${v.message}\n`);
    }
    if (infos.length > 50) {
      process.stderr.write(`  ... and ${infos.length - 50} more info\n`);
    }
  }

  // Exit code
  if (errors.length > 0) {
    console.error(
      '\n✗ production-residue: ERROR patterns found — fix before merge.\n'
    );
    process.exit(1);
  }

  if (warnings.length > 0 || infos.length > 0) {
    console.log(
      `\n~ production-residue: ${warnings.length} warning(s) and ${infos.length} info(s) reported (non-blocking).`
    );
  } else {
    console.log('\n✓ production-residue: No violations found.');
  }
  process.exit(0);
}

main();
