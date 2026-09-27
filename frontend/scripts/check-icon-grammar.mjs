#!/usr/bin/env node
/**
 * Icon grammar checker — R119 audit tooling.
 *
 * Complements the hit-target gate inside check-visual-release-gates.mjs
 * (icon-only Pressable without hitSlop). Hit-targets are already gated; this
 * script audits the *grammar* side that is not yet automatically checked:
 * icon-family consistency and optical-size discipline, which AGENTS.md §4 /
 * §38.2 / §38.6 call out as the "inconsistent primitives" AI tell.
 *
 * Rules enforced (static, heuristic — a review trigger, not a compiler):
 *
 *   1. foreign-icon-family    — any vector icon family other than Ionicons
 *      (MaterialIcons, Feather, FontAwesome, …) or react-native-vector-icons.
 *      The app standard is ONE vector family (Ionicons) plus the custom SVG
 *      glyph layers (AppGlyph / CreatorGlyph). [warn]
 *   2. raw-ionicons-bypass    — <Ionicons> rendered directly in a surface file
 *      instead of the AppIcon / AppIconButton primitives. [warn]
 *   3. mixed-icon-families    — ≥2 distinct icon families rendered in one file.
 *      warn when a foreign vector family is involved; info for the sanctioned
 *      Ionicons + AppGlyph/CreatorGlyph split (verify intent). [warn/info]
 *   4. mixed-icon-primitive   — <AppIcon>/<AppIconButton> and raw <Ionicons>
 *      in the same file. Same family, but the primitive convention is
 *      bypassed right next to where it is followed. [warn]
 *   5. hardcoded-icon-size    — numeric size={N} that exactly matches an
 *      IconSize / IconGrammar token value — should use the token. [warn]
 *   6. off-band-icon-size     — numeric size={N} outside every declared
 *      optical band (12–18 badge/metadata, 20–24 standard, 28–32 hero, 48
 *      display). No band owns these sizes. [warn]
 *   7. banned-icon-glyph      — banned metaphor glyphs per AGENTS.md §38.2
 *      (sparkles-outline, color-wand-outline, rocket-outline). [warn]
 *   8. shield-context-review  — shield-outline is banned outside
 *      protection-program contexts; flagged for human verification. [info]
 *
 * Enforcement: warn-only by default (exit 0) — a large migration backlog
 * exists, matching check-surface-density.mjs semantics. `--strict` exits 1
 * on any warn-level violation for future CI wiring.
 *
 * Run via: npm run check:icons
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, extname, relative } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');

const SCAN_EXTENSIONS = new Set(['.tsx']);
const EXCLUDE_DIRS = new Set(['__tests__', 'node_modules', '__mocks__']);

// ─── Icon primitives that are ALLOWED to render raw vector glyphs ────────────
// These files are the convention itself — everything else should consume them.
const PRIMITIVE_FILES = new Set([
  'src/components/common/AppIcon.tsx', // the primitive — wraps Ionicons
  'src/components/agents/AgentIcon.tsx', // dynamic glyphMap resolver primitive
  'src/creator/controls/CreatorIconButton.tsx', // renders CreatorGlyph OR Ionicons
]);

// ─── Optical size system ─────────────────────────────────────────────────────
// IconSize (theme/iconTokens.ts): micro:12 xs:14 sm:16 md:20 lg:24 xl:28 hero:32 display:48
// IconGrammar (theme/designTokens.ts): badge:12 metadata:16 standard:22 hero:28
const ICON_SIZE_TOKENS = new Map([
  [12, 'IconSize.micro / IconGrammar.badge'],
  [14, 'IconSize.xs'],
  [16, 'IconSize.sm / IconGrammar.metadata'],
  [20, 'IconSize.md'],
  [22, 'IconGrammar.standard'],
  [24, 'IconSize.lg'],
  [28, 'IconSize.xl / IconGrammar.hero'],
  [32, 'IconSize.hero'],
  [48, 'IconSize.display'],
]);

// Declared optical bands — a numeric size is "off-band" when no band owns it.
// badge 12–14 + metadata 14–18 merge to 12–18; standard 20–24; hero 28–32;
// display 48 exactly.
const OPTICAL_BANDS = [
  { min: 12, max: 18, label: 'badge/metadata' },
  { min: 20, max: 24, label: 'standard' },
  { min: 28, max: 32, label: 'hero' },
  { min: 48, max: 48, label: 'display' },
];

function inOpticalBand(n) {
  return OPTICAL_BANDS.some((b) => n >= b.min && n <= b.max);
}

// ─── Icon families ───────────────────────────────────────────────────────────
// Foreign vector families — anything other than Ionicons violates the
// one-family rule outright.
const FOREIGN_VECTOR_FAMILIES = [
  'MaterialIcons',
  'MaterialCommunityIcons',
  'FontAwesome',
  'FontAwesome5',
  'FontAwesome6',
  'Feather',
  'Entypo',
  'AntDesign',
  'Octicons',
  'Foundation',
  'Fontisto',
  'SimpleLineIcons',
  'EvilIcons',
  'Zocial',
];

// JSX element name → canonical family. AppIcon/AppIconButton render Ionicons
// underneath, so they belong to the 'ionicons' family; the raw/primitive
// distinction is handled by the mixed-icon-primitive rule, not here.
const ELEMENT_FAMILY = new Map([
  ['Ionicons', 'ionicons'],
  ['AppIcon', 'ionicons'],
  ['AppIconButton', 'ionicons'],
  ['AgentIcon', 'ionicons'],
  ['AppGlyph', 'appglyph'],
  ['CreatorGlyph', 'creatorglyph'],
  ['CreatorIconButton', 'creatorglyph'],
  ...FOREIGN_VECTOR_FAMILIES.map((f) => [f, f]),
]);

const ICON_ELEMENTS = [...ELEMENT_FAMILY.keys()];

// Raw vector elements that bypass the AppIcon convention when rendered
// directly in a surface file.
const RAW_VECTOR_ELEMENTS = new Set(['Ionicons', ...FOREIGN_VECTOR_FAMILIES]);

// Elements whose `size` prop is a glyph size (AppIconButton.size is the glyph;
// its hit target is `hitSize` — deliberately NOT scanned).
const SIZE_SCAN_ELEMENTS = new Set(ICON_ELEMENTS);

// ─── Banned glyphs (AGENTS.md §38.2) ─────────────────────────────────────────
// Hard bans: flagged wherever the quoted literal appears.
const BANNED_GLYPH_LITERALS = new Map([
  ['sparkles-outline', { replacement: "concept='sparkle' (→ bulb-outline)", reason: 'AI/magic metaphor banned' }],
  ['color-wand-outline', { replacement: 'color-filter-outline', reason: 'magic metaphor banned' }],
  ['rocket-outline', { replacement: 'trending-up-outline', reason: 'novelty boost metaphor banned' }],
]);
// Bare glyph names — only flagged inside an icon name/icon/glyph prop where
// the value is passed through as a raw glyph (raw vector elements). AppIcon's
// semantic name 'sparkles' resolves to bulb-outline via SemanticIconMap and
// is legitimate.
const BANNED_BARE_GLYPHS = new Map([
  ['sparkles', { replacement: "concept='sparkle'", reason: 'AI/magic metaphor banned' }],
  ['color-wand', { replacement: 'color-filter', reason: 'magic metaphor banned' }],
  ['rocket', { replacement: 'trending-up', reason: 'novelty boost metaphor banned' }],
]);
// shield-outline is banned OUTSIDE protection-program contexts — info-level
// human review, cannot be decided statically.
const REVIEW_GLYPHS = new Map([
  ['shield', 'resolves to shield-outline — verify protection-program context (AGENTS.md §38.2)'],
  ['shield-outline', 'verify protection-program context (AGENTS.md §38.2)'],
  ['shield-half-outline', 'verify protection-program context (AGENTS.md §38.2)'],
]);

// ─── File walking ────────────────────────────────────────────────────────────
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
      results.push(full);
    }
  }
  return results;
}

function relPath(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, '/');
}

/**
 * Find the end of a JSX opening tag, skipping {expressions} and strings.
 * Returns the index of the closing '>' (or '/' of '/>').
 * Adapted from check-visual-release-gates.mjs.
 */
function findTagEnd(src, startPos) {
  let i = startPos;
  const len = src.length;
  while (i < len && /[a-zA-Z0-9_.]/.test(src[i])) i++;
  let braceDepth = 0;
  while (i < len) {
    const ch = src[i],
      next = src[i + 1];
    if (ch === '/' && next === '>' && braceDepth === 0) return i;
    if (ch === '>' && braceDepth === 0) return i;
    if (ch === '"' || ch === "'") {
      i++;
      while (i < len && src[i] !== ch) {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    if (ch === '{') {
      braceDepth++;
      i++;
      continue;
    }
    if (ch === '}') {
      braceDepth--;
      i++;
      continue;
    }
    i++;
  }
  return -1;
}

const ELEMENT_OPEN = new RegExp(`<(${ICON_ELEMENTS.join('|')})\\b`, 'g');
const VECTOR_IMPORT =
  /import\s*\{([^}]+)\}\s*from\s*['"](@expo\/vector-icons|react-native-vector-icons)['"]/g;
const SIZE_NUMERIC = /\bsize\s*=\s*\{?\s*(\d+(?:\.\d+)?)\s*\}?/;
const NAME_PROP = /\b(name|icon|glyph|concept)\s*=\s*['"]([^'"]+)['"]/g;

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

function checkFile(filePath) {
  const rel = relPath(filePath);
  const src = readFileSync(filePath, 'utf-8');
  const violations = [];
  const usages = []; // { element, family, line, size?, name? }
  const importedForeign = new Set();

  // Imported vector families (for foreign-family detection — catches
  // `import { Feather }` even when the JSX scan misses a render path).
  let m;
  VECTOR_IMPORT.lastIndex = 0;
  while ((m = VECTOR_IMPORT.exec(src)) !== null) {
    const imported = m[1]
      .split(',')
      .map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    for (const name of imported) {
      if (FOREIGN_VECTOR_FAMILIES.includes(name)) importedForeign.add(name);
      // Ionicons imported from react-native-vector-icons is also foreign —
      // the app sources it from @expo/vector-icons via AppIcon.
      if (name === 'Ionicons' && m[2] === 'react-native-vector-icons') {
        importedForeign.add('Ionicons(react-native-vector-icons)');
      }
    }
  }

  // Icon JSX elements
  ELEMENT_OPEN.lastIndex = 0;
  while ((m = ELEMENT_OPEN.exec(src)) !== null) {
    const element = m[1];
    const tagEnd = findTagEnd(src, m.index + 1);
    const tag =
      tagEnd === -1 ? src.slice(m.index, m.index + 400) : src.slice(m.index, tagEnd + 1);
    const sizeMatch = tag.match(SIZE_NUMERIC);
    const names = [];
    NAME_PROP.lastIndex = 0;
    let nm;
    while ((nm = NAME_PROP.exec(tag)) !== null) names.push(nm[2]);
    usages.push({
      element,
      family: ELEMENT_FAMILY.get(element),
      line: lineOf(src, m.index),
      size: sizeMatch ? parseFloat(sizeMatch[1]) : undefined,
      names,
    });
  }

  const isPrimitive = PRIMITIVE_FILES.has(rel);
  const renderedFamilies = new Set(usages.map((u) => u.family));
  const rendersAppIcon = usages.some(
    (u) => u.element === 'AppIcon' || u.element === 'AppIconButton'
  );
  const rawUsages = usages.filter((u) => RAW_VECTOR_ELEMENTS.has(u.element));

  // Rule 1: foreign icon family imported or rendered
  const foreignRendered = [...renderedFamilies].filter(
    (f) => f !== 'ionicons' && f !== 'appglyph' && f !== 'creatorglyph'
  );
  const foreignAll = new Set([...importedForeign, ...foreignRendered]);
  if (foreignAll.size > 0) {
    violations.push({
      level: 'warn',
      rule: 'foreign-icon-family',
      line: usages.find((u) => foreignAll.has(u.family))?.line ?? 1,
      message: `Foreign icon family ${[...foreignAll].join(', ')} — one-family rule: Ionicons via AppIcon (+ AppGlyph/CreatorGlyph SVG layers) only`,
    });
  }

  // Rule 2: raw <Ionicons> bypassing the AppIcon convention
  if (!isPrimitive) {
    const rawIonicons = rawUsages.filter((u) => u.element === 'Ionicons');
    if (rawIonicons.length > 0) {
      violations.push({
        level: 'warn',
        rule: 'raw-ionicons-bypass',
        line: rawIonicons[0].line,
        message: `${rawIonicons.length} raw <Ionicons> usage(s) — route through <AppIcon>/<AppIconButton> (semantic name + IconSize token)`,
      });
    }
  }

  // Rule 3: multiple icon families in one file (primitives like
  // CreatorIconButton are designed to bridge layers — exempt)
  if (!isPrimitive && renderedFamilies.size > 1) {
    const hasForeign = foreignAll.size > 0;
    violations.push({
      level: hasForeign ? 'warn' : 'info',
      rule: 'mixed-icon-families',
      line: 1,
      message: `${renderedFamilies.size} icon families in one file (${[...renderedFamilies].join(' + ')})${
        hasForeign
          ? ' — foreign family mixed into the Ionicons surface'
          : ' — sanctioned SVG layer split; verify it is intentional (one family per region)'
      }`,
    });
  }

  // Rule 4: AppIcon primitive and raw Ionicons side by side
  if (!isPrimitive && rendersAppIcon && rawUsages.some((u) => u.element === 'Ionicons')) {
    violations.push({
      level: 'warn',
      rule: 'mixed-icon-primitive',
      line: usages.find((u) => u.element === 'Ionicons')?.line ?? 1,
      message: `<AppIcon> and raw <Ionicons> in the same file — inconsistent primitive usage`,
    });
  }

  // Rules 5+6: numeric size literals
  for (const u of usages) {
    if (!SIZE_SCAN_ELEMENTS.has(u.element) || u.size === undefined) continue;
    const token = ICON_SIZE_TOKENS.get(u.size);
    if (token) {
      violations.push({
        level: 'warn',
        rule: 'hardcoded-icon-size',
        line: u.line,
        message: `<${u.element}> size={${u.size}} matches ${token} — use the token, not the literal`,
      });
    } else if (!inOpticalBand(u.size)) {
      violations.push({
        level: 'warn',
        rule: 'off-band-icon-size',
        line: u.line,
        message: `<${u.element}> size={${u.size}} is outside every optical band (12–18, 20–24, 28–32, 48) — no band owns this size`,
      });
    }
    // Numeric literal inside a declared band but not on a token value
    // (e.g. 15, 18, 21) — tolerated: the band grammar allows it, though a
    // token is preferred. Not flagged to keep signal-to-noise sane.
  }

  // Rule 7: banned metaphor glyphs — hard bans fire on any quoted literal
  for (const [glyph, info] of BANNED_GLYPH_LITERALS) {
    const re = new RegExp(`['"\`]${glyph}['"\`]`, 'g');
    let gm;
    while ((gm = re.exec(src)) !== null) {
      violations.push({
        level: 'warn',
        rule: 'banned-icon-glyph',
        line: lineOf(src, gm.index),
        message: `Banned glyph '${glyph}' (${info.reason}, AGENTS.md §38.2) — use ${info.replacement}`,
      });
    }
  }
  // Bare banned names — only as raw glyph props on non-semantic elements
  // (AppIcon name="sparkles" resolves to bulb-outline via SemanticIconMap and
  // is legitimate). shield-* review applies to every element — the glyph is
  // banned outside protection-program contexts whichever primitive renders it.
  for (const u of usages) {
    for (const n of u.names) {
      if (RAW_VECTOR_ELEMENTS.has(u.element) && BANNED_BARE_GLYPHS.has(n)) {
        const info = BANNED_BARE_GLYPHS.get(n);
        violations.push({
          level: 'warn',
          rule: 'banned-icon-glyph',
          line: u.line,
          message: `Banned glyph '${n}' on raw <${u.element}> (${info.reason}, AGENTS.md §38.2) — use ${info.replacement}`,
        });
      }
      if (REVIEW_GLYPHS.has(n)) {
        violations.push({
          level: 'info',
          rule: 'shield-context-review',
          line: u.line,
          message: `'${n}' on <${u.element}> — ${REVIEW_GLYPHS.get(n)}`,
        });
      }
    }
  }

  return { rel, usages, violations };
}

function main() {
  const strict = process.argv.includes('--strict');
  const files = walk(SRC);
  const results = [];
  const sizeHistogram = new Map(); // size -> count
  let totalUsages = 0;

  for (const file of files) {
    const { rel, usages, violations } = checkFile(file);
    totalUsages += usages.length;
    for (const u of usages) {
      if (u.size !== undefined) {
        sizeHistogram.set(u.size, (sizeHistogram.get(u.size) ?? 0) + 1);
      }
    }
    if (violations.length > 0) results.push({ file: rel, violations });
  }

  console.log(
    `icon-grammar: scanned ${files.length} .tsx files, ${totalUsages} icon element usages\n`
  );

  // Size histogram — the optical-band picture the charter expects to cluster
  if (sizeHistogram.size > 0) {
    console.log('Numeric size histogram (size → usages):');
    const entries = [...sizeHistogram.entries()].sort((a, b) => b[1] - a[1]);
    const parts = entries.map(([size, count]) => {
      const token = ICON_SIZE_TOKENS.get(size);
      const band = inOpticalBand(size);
      const mark = token ? '=' : band ? '~' : '✗';
      return `  ${mark} ${size}pt × ${count}${token ? `  (${token})` : band ? '  (in-band, no token)' : '  (OFF-BAND)'}`;
    });
    console.log(parts.join('\n'));
    console.log('');
  }

  const all = results.flatMap((r) => r.violations.map((v) => ({ ...v, file: r.file })));
  const warnCount = all.filter((v) => v.level === 'warn').length;
  const infoCount = all.filter((v) => v.level === 'info').length;

  if (all.length === 0) {
    console.log('✓ icon-grammar: no violations — one family, one optical band.');
    process.exit(0);
  }

  // Per-rule summary
  const byRule = new Map();
  for (const v of all) byRule.set(v.rule, (byRule.get(v.rule) ?? 0) + 1);
  console.log(`⚠ icon-grammar: ${warnCount} warning(s), ${infoCount} info note(s) across ${results.length} files\n`);
  console.log('By rule:');
  for (const [rule, count] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${rule}: ${count}`);
  }
  console.log('');

  // Top offending files
  const TOP = 25;
  const sorted = results.sort((a, b) => b.violations.length - a.violations.length);
  console.log(`Top offending files (of ${results.length}):\n`);
  for (const r of sorted.slice(0, TOP)) {
    console.log(`  ${r.file} — ${r.violations.length} violation(s)`);
    for (const v of r.violations.slice(0, 8)) {
      console.log(`    [${v.level}] ${v.rule} @${v.line}: ${v.message}`);
    }
    if (r.violations.length > 8) {
      console.log(`    … and ${r.violations.length - 8} more`);
    }
    console.log('');
  }
  if (sorted.length > TOP) {
    console.log(`  … and ${sorted.length - TOP} more files with violations\n`);
  }

  if (strict && warnCount > 0) {
    console.error(`✗ icon-grammar: ${warnCount} warning-level violation(s) (--strict)`);
    process.exit(1);
  }

  // Report-only default — a migration backlog exists; this is a review
  // trigger like check-surface-density.mjs, not a hard gate yet.
  process.exit(0);
}

main();
