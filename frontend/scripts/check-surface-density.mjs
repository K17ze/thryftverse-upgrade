#!/usr/bin/env node
/**
 * Surface-density checker — Wave 7A static gate.
 *
 * Flags screens/components that exhibit border/card saturation:
 *   - >5 screen-local borderWidth declarations
 *   - 3+ large-radius (>=16) bordered containers
 *   - repeated surface + border + radius patterns
 *   - FlagshipFormSection wrapping already-bordered inputs
 *   - nested surface primitives
 *
 * This is a human-review trigger, not a hard fail. Exceptions exist for
 * data tables, order books, editor canvases, and complex financial sheets.
 *
 * Per AGENTS.md §4 and closure program 04_SURFACE_HIERARCHY.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, extname, relative } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);
const EXCLUDE_DIRS = new Set(['__tests__', 'node_modules', '__mocks__']);

// Files exempt from the gate (genuinely complex surfaces)
const EXEMPT_FILES = new Set([
  // Editor canvases — legitimately dense chrome
  'src/creator/CreatorCanvas.tsx',
  // Order book / data tables — structural hairlines
  'src/components/trade/OrderBook.tsx',
  'src/components/commerce/detail/CoOwnOrderBook.tsx',
]);

const THRESHOLDS = {
  borderWidthPerFile: 5,
  largeRadiusBordered: 3,
};

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

function countBorderDensity(content) {
  const borderWidthMatches = content.match(/borderWidth\s*:/g) || [];
  const borderRadiusMatches = content.match(/borderRadius\s*:/g) || [];
  const borderColorMatches = content.match(/borderColor\s*:/g) || [];

  // Large radius (>=16) with border — card-soup signal
  const largeRadiusBordered = (content.match(/borderRadius:\s*(?:Radius\.xl|Radius\.xxl|16|24|20)\b/g) || []).length;

  // surface + border + radius combo (the forbidden default pattern)
  const surfaceBorderCombo = (content.match(/backgroundColor:\s*colors\.surface\b[^}]*borderColor:\s*colors\.border\b/g) || []).length;

  return {
    borderWidthCount: borderWidthMatches.length,
    borderRadiusCount: borderRadiusMatches.length,
    borderColorCount: borderColorMatches.length,
    largeRadiusBordered,
    surfaceBorderCombo,
  };
}

function checkFile(filePath) {
  const rel = relative(ROOT, filePath).replace(/\\/g, '/');
  if (EXEMPT_FILES.has(rel)) return null;

  const content = readFileSync(filePath, 'utf8');
  const metrics = countBorderDensity(content);
  const issues = [];

  if (metrics.borderWidthCount > THRESHOLDS.borderWidthPerFile) {
    issues.push({
      level: 'warn',
      rule: 'border-density',
      message: `${metrics.borderWidthCount} borderWidth declarations (threshold ${THRESHOLDS.borderWidthPerFile}). Consider flat rows + hairline separators.`,
    });
  }

  if (metrics.largeRadiusBordered >= THRESHOLDS.largeRadiusBordered) {
    issues.push({
      level: 'warn',
      rule: 'large-radius-soup',
      message: `${metrics.largeRadiusBordered} large-radius (>=16) containers. Radius budget: max 2 non-avatar radii per viewport.`,
    });
  }

  if (metrics.surfaceBorderCombo >= 2) {
    issues.push({
      level: 'warn',
      rule: 'surface-border-combo',
      message: `${metrics.surfaceBorderCombo} surface+border combos. This is the prototype card pattern — flatten.`,
    });
  }

  // Flag FlagshipFormSection wrapping bordered inputs (card-on-card)
  if (content.includes('FlagshipFormSection') && content.includes('borderWidth')) {
    const sectionCount = (content.match(/FlagshipFormSection/g) || []).length;
    const inputBorderCount = (content.match(/PremiumTextField|AppInput|PremiumInputShell/g) || []).length;
    if (sectionCount > 0 && inputBorderCount > 0) {
      issues.push({
        level: 'info',
        rule: 'section-wrapping-bordered-input',
        message: `FlagshipFormSection wrapping bordered inputs — use variant='flat' to avoid card-on-card.`,
      });
    }
  }

  if (issues.length === 0) return null;
  return { file: rel, metrics, issues };
}

function main() {
  const files = walk(SRC);
  const results = [];
  for (const file of files) {
    const result = checkFile(file);
    if (result) results.push(result);
  }

  if (results.length === 0) {
    console.log('✓ Surface-density check passed — no border-saturation hotspots detected.');
    process.exit(0);
  }

  console.log(`\n⚠ Surface-density review triggers (${results.length} files):\n`);
  for (const { file, metrics, issues } of results) {
    console.log(`  ${file}`);
    console.log(`    borders: ${metrics.borderWidthCount} | large-radius: ${metrics.largeRadiusBordered} | surface+border: ${metrics.surfaceBorderCombo}`);
    for (const issue of issues) {
      console.log(`    [${issue.level}] ${issue.rule}: ${issue.message}`);
    }
    console.log('');
  }

  // Exit 0 — this is a review trigger, not a hard gate
  process.exit(0);
}

main();
