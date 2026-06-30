#!/usr/bin/env node
/**
 * Design token usage checker.
 *
 * Validates that source files in src/ use the exported design tokens
 * (Space, Radius, Type, FontSize, FontFamily, LetterSpacing, Elevation,
 * Duration, ZIndex) from theme/designTokens.ts rather than hardcoded
 * numeric literals for spacing, radius, typography, and elevation.
 *
 * This is a lint-level guardrail — it flags obvious inline magic numbers
 * that should be replaced with a design token import.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, extname } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);
const EXCLUDE_DIRS = new Set(['__tests__', 'node_modules', '__mocks__']);

// Files that are allowed to define raw values (the token source itself)
const TOKEN_FILES = new Set([
  join(SRC, 'theme', 'designTokens.ts'),
  join(SRC, 'constants', 'colors.ts'),
]);

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...walk(full));
    } else if (SCAN_EXTENSIONS.has(extname(full))) {
      results.push(full);
    }
  }
  return results;
}

// Patterns that indicate hardcoded values instead of design tokens
const INLINE_PATTERNS = [
  // Hardcoded spacing in style objects: padding/margin with raw numbers
  // Allow 0, 1, 2 (hairline) but flag common token values used inline
  {
    name: 'hardcoded-padding',
    regex: /padding(?:Horizontal|Vertical|Top|Bottom|Left|Right)?:\s*(\d{2,})\b/g,
    tokenMap: { 4: 'Space.xs', 8: 'Space.sm', 16: 'Space.md', 24: 'Space.lg', 32: 'Space.xl', 48: 'Space.xxl' },
    message: (val, token) => `Hardcoded padding ${val} — use ${token} instead`,
  },
  {
    name: 'hardcoded-margin',
    regex: /margin(?:Horizontal|Vertical|Top|Bottom|Left|Right)?:\s*(\d{2,})\b/g,
    tokenMap: { 4: 'Space.xs', 8: 'Space.sm', 16: 'Space.md', 24: 'Space.lg', 32: 'Space.xl', 48: 'Space.xxl' },
    message: (val, token) => `Hardcoded margin ${val} — use ${token} instead`,
  },
  {
    name: 'hardcoded-border-radius',
    regex: /borderRadius:\s*(\d{2,})\b/g,
    tokenMap: { 4: 'Radius.sm', 8: 'Radius.md', 12: 'Radius.lg', 16: 'Radius.xl', 999: 'Radius.full' },
    message: (val, token) => `Hardcoded borderRadius ${val} — use ${token} instead`,
  },
  {
    name: 'hardcoded-gap',
    regex: /gap:\s*(\d{2,})\b/g,
    tokenMap: { 4: 'Space.xs', 8: 'Space.sm', 16: 'Space.md', 24: 'Space.lg', 32: 'Space.xl' },
    message: (val, token) => `Hardcoded gap ${val} — use ${token} instead`,
  },
];

function checkFile(filePath) {
  const src = readFileSync(filePath, 'utf-8');
  const violations = [];

  // Skip files that import from designTokens — they're likely using tokens already
  // But still check for inline values that match token values
  const hasTokenImport = src.includes('designTokens') || src.includes('Space.') || src.includes('Radius.');

  for (const pattern of INLINE_PATTERNS) {
    let match;
    pattern.regex.lastIndex = 0;
    while ((match = pattern.regex.exec(src)) !== null) {
      const val = parseInt(match[1], 10);
      const token = pattern.tokenMap[val];
      if (token) {
        const lineNum = src.slice(0, match.index).split('\n').length;
        violations.push({
          file: filePath,
          line: lineNum,
          message: pattern.message(val, token),
        });
      }
    }
  }

  return violations;
}

function main() {
  const files = walk(SRC);
  const allViolations = [];
  const platformViolations = [];

  for (const file of files) {
    if (TOKEN_FILES.has(file)) continue;
    const violations = checkFile(file);
    for (const v of violations) {
      allViolations.push(v);
      if (file.includes(join('src', 'platform'))) {
        platformViolations.push(v);
      }
    }
  }

  // Report all violations as warnings
  if (allViolations.length > 0) {
    console.warn(`design-tokens: ${allViolations.length} hardcoded value(s) found (warnings)\n`);
    for (const v of allViolations.slice(0, 20)) {
      const relPath = v.file.replace(ROOT + '\\', '').replace(ROOT + '/', '');
      console.warn(`  ${relPath}:${v.line} — ${v.message}`);
    }
    if (allViolations.length > 20) {
      console.warn(`  ... and ${allViolations.length - 20} more`);
    }
  }

  // Only fail on violations in platform/ directory (new code standard)
  if (platformViolations.length > 0) {
    console.error(`\n✗ design-tokens: ${platformViolations.length} violation(s) in platform/ code\n`);
    for (const v of platformViolations) {
      const relPath = v.file.replace(ROOT + '\\', '').replace(ROOT + '/', '');
      console.error(`  ${relPath}:${v.line} — ${v.message}`);
    }
    process.exit(1);
  }

  console.log('✓ design-tokens: Platform code passes design token validation');
  process.exit(0);
}

main();
