#!/usr/bin/env node
/**
 * Dumps all accessibility violations using proper JSX tag parsing.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve, extname, relative } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);
const EXCLUDE_DIRS = new Set(['__tests__', 'node_modules', '__mocks__', 'theme', 'constants']);

const HAS_A11Y_LABEL = /accessibilityLabel\s*=/;
const HAS_A11Y_ROLE = /accessibilityRole\s*=/;
const HAS_A11Y_LABELLED_BY = /accessibilityLabelledBy\s*=/;
const HAS_ACCESSIBLE = /accessible\s*=\s*\{?\s*(?:true|false)/;

function walk(dir) {
  const results = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    if (EXCLUDE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) results.push(...walk(full));
    else if (SCAN_EXTENSIONS.has(extname(full))) results.push(full);
  }
  return results;
}

function relPath(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, '/');
}

/**
 * Find the real closing '>' of a JSX opening tag.
 */
function findTagEnd(src, startPos) {
  let i = startPos;
  const len = src.length;
  // Skip the tag name
  while (i < len && /[a-zA-Z0-9_.]/.test(src[i])) i++;
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  while (i < len) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '>' && braceDepth === 0 && parenDepth === 0) return i + 1;
    if (ch === '>' && braceDepth === 0 && parenDepth === 0 && bracketDepth === 0) return i;
    if (ch === '"' || ch === "'") {
      i++;
      while (i < len && src[i] !== ch) { if (src[i] === '\\') i++; i++; }
      i++; continue;
    }
    if (ch === '`') {
      i++;
      while (i < len && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '$' && src[i + 1] === '{') {
          i += 2; let d = 1;
          while (i < len && d > 0) { if (src[i] === '{') d++; else if (src[i] === '}') d--; if (src[i] === '\\') i++; i++; }
          continue;
        }
        i++;
      }
      i++; continue;
    }
    if (ch === '{') { braceDepth++; i++; continue; }
    if (ch === '}') { braceDepth--; i++; continue; }
    if (ch === '(') { parenDepth++; i++; continue; }
    if (ch === ')') { parenDepth--; i++; continue; }
    if (ch === '[') { bracketDepth++; i++; continue; }
    if (ch === ']') { bracketDepth--; i++; continue; }
    if (ch === '/' && next === '*' && braceDepth > 0) { i += 2; while (i < len && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (ch === '/' && next === '/' && braceDepth > 0) { while (i < len && src[i] !== '\n') i++; continue; }
    i++;
  }
  return -1;
}

function findInteractiveTags(src) {
  const results = [];
  const tagPattern = /<(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|Button)\b/g;
  let match;
  while ((match = tagPattern.exec(src)) !== null) {
    const tagStart = match.index;
    const tagName = match[1];
    const tagEnd = findTagEnd(src, tagStart);
    if (tagEnd === -1) continue;
    const openingTag = src.slice(tagStart, tagEnd + 1);
    const isSelfClosing = openingTag.endsWith('/>');
    results.push({ tagStart, tagEnd, tagName, openingTag, isSelfClosing });
  }
  return results;
}

function checkAccessibility(files) {
  const byFile = {};
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');
    const tags = findInteractiveTags(src);
    for (const tag of tags) {
      if (tag.isSelfClosing) continue;
      const { openingTag, tagEnd } = tag;
      const hasLabel = HAS_A11Y_LABEL.test(openingTag) || HAS_A11Y_LABELLED_BY.test(openingTag);
      const hasRole = HAS_A11Y_ROLE.test(openingTag);
      const hasAccessible = HAS_ACCESSIBLE.test(openingTag);
      const childStart = tagEnd + 1;
      const childWindow = src.slice(childStart, Math.min(src.length, childStart + 200));
      const hasTextChild = />[^<{]{2,}</.test(childWindow);
      const lineNum = src.slice(0, tag.tagStart).split('\n').length;
      const rel = relPath(file);
      if (!byFile[rel]) byFile[rel] = { missingLabel: [], missingRole: [] };
      if (!hasLabel && !hasTextChild && !hasAccessible) byFile[rel].missingLabel.push({ line: lineNum });
      if (!hasRole && !hasAccessible) byFile[rel].missingRole.push({ line: lineNum });
    }
    // Remove empty files
    if (byFile[relPath(file)] && byFile[relPath(file)].missingLabel.length === 0 && byFile[relPath(file)].missingRole.length === 0) {
      delete byFile[relPath(file)];
    }
  }
  return byFile;
}

const files = walk(SRC);
const violations = checkAccessibility(files);
const totalMissingLabel = Object.values(violations).reduce((s, v) => s + v.missingLabel.length, 0);
const totalMissingRole = Object.values(violations).reduce((s, v) => s + v.missingRole.length, 0);

writeFileSync(join(ROOT, 'all-a11y-violations.json'), JSON.stringify({ totalMissingLabel, totalMissingRole, fileCount: Object.keys(violations).length, byFile: violations }, null, 2));

console.log(`Total missing-accessibility-label: ${totalMissingLabel}`);
console.log(`Total missing-accessibility-role: ${totalMissingRole}`);
console.log(`Files with violations: ${Object.keys(violations).length}`);
console.log('Written to: all-a11y-violations.json');

const sorted = Object.entries(violations).map(([f, v]) => [f, v.missingLabel.length + v.missingRole.length]).sort((a, b) => b[1] - a[1]);
for (const [file, count] of sorted) {
  const v = violations[file];
  console.log(`  ${file}: ${v.missingLabel.length} label, ${v.missingRole.length} role (${count} total)`);
}
