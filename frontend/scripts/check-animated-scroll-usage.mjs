#!/usr/bin/env node
/**
 * Animated scroll usage checker.
 *
 * Validates that every source file using `useAnimatedScrollHandler` from
 * react-native-reanimated also uses a Reanimated-animated scroll container
 * (Reanimated.ScrollView, Reanimated.FlatList, Animated.ScrollView, or
 * Animated.FlatList) rather than a plain React Native ScrollView/FlatList.
 *
 * This is required because Reanimated scroll handlers only work with
 * Reanimated's animated scroll components — plain RN scroll components
 * do not emit the native scroll events that the worklet handler expects.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, extname } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);
const EXCLUDE_DIRS = new Set(['__tests__', 'node_modules']);

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

const files = walk(SRC);
const violations = [];

for (const file of files) {
  const src = readFileSync(file, 'utf-8');

  // Skip files that don't use useAnimatedScrollHandler
  if (!src.includes('useAnimatedScrollHandler')) continue;

  // Check for Reanimated animated scroll container usage
  const hasReanimatedScrollView =
    src.includes('Reanimated.ScrollView') ||
    src.includes('Animated.ScrollView');
  const hasReanimatedFlatList =
    src.includes('Reanimated.FlatList') ||
    src.includes('Animated.FlatList');
  const hasCreatedAnimatedComponent =
    src.includes('createAnimatedComponent(FlashList)') ||
    src.includes('createAnimatedComponent(ScrollView)') ||
    src.includes('createAnimatedComponent(FlatList)');

  if (!hasReanimatedScrollView && !hasReanimatedFlatList && !hasCreatedAnimatedComponent) {
    const rel = file.replace(ROOT + '\\', '').replace(ROOT + '/', '');
    violations.push(
      `${rel}: uses useAnimatedScrollHandler but has no Reanimated.ScrollView or Reanimated.FlatList`
    );
  }
}

if (violations.length > 0) {
  console.error('animated-scroll check FAILED — violations found:');
  for (const v of violations) {
    console.error(`  ${v}`);
  }
  process.exit(1);
} else {
  console.log('animated-scroll check passed — no violations');
}
