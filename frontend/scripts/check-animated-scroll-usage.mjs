#!/usr/bin/env node
/**
 * Regression check: useAnimatedScrollHandler must not be passed to a regular
 * React Native <ScrollView> or <FlatList> / <FlashList>.
 *
 * It must be passed to an animated scroll component:
 *   - Reanimated.ScrollView
 *   - Animated.ScrollView
 *   - Reanimated.createAnimatedComponent(ScrollView)
 *   - Reanimated.createAnimatedComponent(FlashList)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = resolve(__dirname, '../src');
const EXTENSIONS = new Set(['.ts', '.tsx']);

const USE_ANIMATED_SCROLL_HANDLER_RE = /useAnimatedScrollHandler/;
const ON_SCROLL_PROP_RE = /onScroll\s*=\s*\{/;
const REGULAR_SCROLL_VIEW_RE = /<(ScrollView|FlatList|FlashList)\b[^>]*onScroll\s*=\s*\{/;
const ANIMATED_SCROLL_VIEW_RE = /<(Reanimated\.ScrollView|Animated\.ScrollView|AnimatedFlashList|AnimatedScrollView)\b/;
const CREATE_ANIMATED_COMPONENT_RE = /createAnimatedComponent\s*\(\s*(ScrollView|FlashList)/;

let exitCode = 0;
const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      walk(full);
      continue;
    }
    if (!EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) continue;
    checkFile(full);
  }
}

function checkFile(filePath) {
  const src = readFileSync(filePath, 'utf-8');

  // Skip files that don't use useAnimatedScrollHandler at all
  if (!USE_ANIMATED_SCROLL_HANDLER_RE.test(src)) return;

  const lines = src.split('\n');
  let hasAnimatedScrollView = false;
  let hasCreateAnimatedComponent = false;

  // Scan for animated scroll view wrappers
  for (let i = 0; i < lines.length; i++) {
    if (ANIMATED_SCROLL_VIEW_RE.test(lines[i])) {
      hasAnimatedScrollView = true;
    }
    if (CREATE_ANIMATED_COMPONENT_RE.test(lines[i])) {
      hasCreateAnimatedComponent = true;
    }
  }

  // If we have an animated wrapper, we're safe
  if (hasAnimatedScrollView || hasCreateAnimatedComponent) return;

  // Otherwise, look for dangerous onScroll on regular ScrollView/FlatList/FlashList
  for (let i = 0; i < lines.length; i++) {
    if (REGULAR_SCROLL_VIEW_RE.test(lines[i])) {
      const rel = relative(SRC_DIR, filePath).replace(/\\/g, '/');
      violations.push({
        file: rel,
        line: i + 1,
        text: lines[i].trim(),
      });
      exitCode = 1;
    }
  }
}

walk(SRC_DIR);

if (violations.length === 0) {
  console.log('✅ Animated scroll usage check passed — no violations found.');
  process.exit(0);
}

console.error(`\n❌ Animated scroll usage check failed — ${violations.length} violation(s):\n`);
for (const v of violations) {
  console.error(`  File : src/${v.file}`);
  console.error(`  Line : ${v.line}`);
  console.error(`  Code : ${v.text}`);
  console.error(`  Fix  : Use <Reanimated.ScrollView> or <Animated.ScrollView> from react-native-reanimated.`);
  console.error(`         Or wrap with Reanimated.createAnimatedComponent(ScrollView).\n`);
}
process.exit(1);
