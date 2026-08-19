#!/usr/bin/env node
/**
 * Visual release gates checker.
 *
 * Automated checks for the release gates defined in `.devin/release-gates.md`
 * and the visual QA gates defined in `.devin/visual-qa-gates.md`.
 *
 * This script is a lint-level guardrail. It flags obvious violations of the
 * visual release gates that can be detected statically:
 *
 *   1. Hardcoded hex/rgb colors in screens/components (non-camera surfaces)
 *   2. Pressable/Touchable without accessibilityLabel or accessibilityRole
 *   3. Icon-only Pressable controls without hitSlop
 *   4. Animated.* / useAnimatedStyle without reduced-motion handling
 *   5. Card-on-card composition (nested Surface/Card inside Surface/Card)
 *
 * It does NOT judge optical alignment, hierarchy, media dominance, or
 * transition quality — those remain human visual gates (see
 * `.devin/visual-qa-gates.md`).
 *
 * Enforcement (AGENTS.md §31.7, visual-flagship-convergence-loop.md §10):
 *   - Default mode FAILS the build on P0 violations (exit 1).
 *   - `--report` mode is warn-only (exit 0) for local exploration.
 *   - `--strict` is retained as an alias for the default strict behaviour
 *     so existing CI invocations keep working.
 *
 * Run via: npm run check:visual-gates            (strict, fails on P0)
 *          npm run check:visual-gates:report     (warn-only)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, resolve, extname, relative } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const SCREENSHOT_BASELINE_DIR = join(SRC, '__tests__', '__screenshots__');

const SCAN_EXTENSIONS = new Set(['.tsx', '.ts']);
const EXCLUDE_DIRS = new Set([
  '__tests__',
  'node_modules',
  '__mocks__',
  'theme',
  'constants',
]);

// Files allowed to define raw color values (token/theme sources)
const ALLOWED_COLOR_FILES = new Set([
  join(SRC, 'theme', 'designTokens.ts'),
  join(SRC, 'theme', 'ThemeContext.tsx'),
  join(SRC, 'theme', 'gradients.ts'),
  join(SRC, 'constants', 'colors.ts'),
]);

// Camera/poster/live/creative surfaces may use hardcoded colors for
// scrim/gradient overlays on media, or where colors ARE the creative content
// (gradient presets, filter configs, color pickers, drawing canvas, sticker
// layers, text color pickers). These are documented exceptions.
const CAMERA_SURFACE_PATTERNS = [
  // Creator/camera surfaces
  /creator[\\/]/,
  /CreatorCamera/,
  /CreatorCanvas/,
  /CreatorToolDock/,
  /CreatorStudio/,
  /CreateCamera/,
  /LiveStreamViewer/,
  /LiveStreamSeller/,
  /LiveShoppingHome/,
  /FullscreenMediaViewer/,
  // Poster viewer/highlight surfaces
  /PosterViewer/,
  /PosterHighlight/,
  // Poster creative tools — colors ARE the content in these components
  /poster[\\/]/,  // entire poster components directory
  /PosterSticker/,
  /PosterReaction/,
  /GradientPresets/,
  /FilterStrip/,
  /FilterPreview/,
  /filterConfig/,
  /FontColorPicker/,
  /ColorSlider/,
  /ColorPickerPanel/,
  /DrawingCanvas/,
  /StickerPicker/,
  /TemplatePicker/,
  /LayoutPicker/,
  /BackgroundPicker/,
  /TextOverlayCanvas/,
  /TextEditSheet/,
  /DraggableText/,
  /DraggableLayer/,
  /MultiPhotoCollage/,
  /BottomControlBar/,
  /CreativeToolbar/,
  /PosterProgressSegments/,
  /DetailsDrawer/,
  /ContextMenu/,
  /PosterArchive/,
  /PosterStoryActivity/,
  /layerAccents/,
  /colorUtils/,
  // Media stage / overlay surfaces — use scrim gradients on media
  /MediaStage/,
  /MediaStudio/,
  /MediaGallery/,
  /MediaComposer/,
  /MediaPreview/,
  /MediaMosaic/,
  /MediaEditor/,
  /MediaRail/,
  /ListingMedia/,
  /ProductMedia/,
  /LookMedia/,
  /ChatMediaPreview/,
  /VisualSearchCamera/,
  /VisualSearchScreen/,
  /HeroCarousel/,
  /ImageEmptyGraphic/,
  /BoardEmptyGraphic/,
  /OrdersEmptyGraphic/,
  /SearchEmptyGraphic/,
  /LookPreviewCard/,
  /EditProfilePreview/,
  /FlagshipProfileMedia/,
  /ProfileVisualHeader/,
  /ProfileMediaEditor/,
  // Data files with domain color values (sticker presets, poster data)
  /data[\\/]posters/,
  /data[\\/]stickerPresets/,
  /services[\\/]moodboardApi/,
  /orderCapabilities/,
];

// Hardcoded color patterns
const HEX_COLOR = /#[0-9A-Fa-f]{6}\b/g;
const HEX_COLOR_SHORT = /#[0-9A-Fa-f]{3}\b/g;
const RGB_COLOR = /rgba?\(\s*\d+/g;

// Pressable/Touchable patterns
const PRESSABLE_OPEN =
  /<(Pressable|TouchableOpacity|TouchableHighlight|TouchableWithoutFeedback|Button)\b/g;

// accessibility patterns
const HAS_A11Y_LABEL = /accessibilityLabel\s*=/;
const HAS_A11Y_ROLE = /accessibilityRole\s*=/;
const HAS_A11Y_LABELLED_BY = /accessibilityLabelledBy\s*=/;
const HAS_ACCESSIBLE = /accessible\s*=\s*\{?\s*(?:true|false)/;

// hitSlop pattern
const HAS_HITSLOP = /hitSlop\s*=/;

// Reduced motion patterns
const USES_REANIMATED_ANIMATION =
  /useAnimatedStyle|useAnimatedScrollHandler|withSpring|withTiming|withSequence|withDecay|withRepeat|useSharedValue|Animated\.(View|Image|ScrollView|FlatList|Text)\b/;
const HAS_REDUCED_MOTION =
  /useReducedMotion|useMotionConfig|isReduceMotion|reducedMotion|AccessibilityInfo\.isReduceMotionEnabled/;

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

function isCameraSurface(filePath) {
  return CAMERA_SURFACE_PATTERNS.some((p) => p.test(filePath));
}

function relPath(filePath) {
  return relative(ROOT, filePath).replace(/\\/g, '/');
}

// ─── Check 1: Hardcoded colors ──────────────────────────────────────────────
function checkHardcodedColors(files) {
  const violations = [];
  for (const file of files) {
    if (ALLOWED_COLOR_FILES.has(file)) continue;
    if (isCameraSurface(file)) continue;

    const src = readFileSync(file, 'utf-8');
    const lines = src.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }
      // Skip lines that are clearly string literals (e.g. gradient stops in
      // verified static exports) — only flag style/color contexts
      const hasHex = HEX_COLOR.test(line) || HEX_COLOR_SHORT.test(line);
      const hasRgb = RGB_COLOR.test(line);
      HEX_COLOR.lastIndex = 0;
      HEX_COLOR_SHORT.lastIndex = 0;
      RGB_COLOR.lastIndex = 0;

      if (hasHex || hasRgb) {
        // Skip if the color is inside a string that's clearly a gradient/asset path
        if (line.includes('gradient') && line.includes('[')) continue;
        violations.push({
          file: relPath(file),
          line: i + 1,
          rule: 'no-hardcoded-color',
          message: `Hardcoded color in non-camera surface — use useAppTheme().colors or verified theme exports`,
        });
      }
    }
  }
  return violations;
}

// ─── Check 2: Missing accessibility on interactive controls ─────────────────
function checkAccessibility(files) {
  const violations = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');

    // Find all Pressable/Touchable/Button opening tags and check the JSX block
    let match;
    PRESSABLE_OPEN.lastIndex = 0;
    while ((match = PRESSABLE_OPEN.exec(src)) !== null) {
      const tagStart = match.index;
      // Grab a window of text after the opening tag to capture props
      const windowEnd = Math.min(src.length, tagStart + 600);
      const block = src.slice(tagStart, windowEnd);

      // Find the end of the opening tag (first '>')
      const tagEnd = block.indexOf('>');
      if (tagEnd === -1) continue;
      const openingTag = block.slice(0, tagEnd + 1);

      // Self-closing? skip (no children, likely a wrapper)
      if (openingTag.endsWith('/>')) continue;

      const hasLabel =
        HAS_A11Y_LABEL.test(openingTag) ||
        HAS_A11Y_LABELLED_BY.test(openingTag);
      const hasRole = HAS_A11Y_ROLE.test(openingTag);
      const hasAccessible = HAS_ACCESSIBLE.test(openingTag);

      // If the component has visible text children, it may not need an
      // explicit label. Heuristic: check if there's text content shortly
      // after the opening tag.
      const childWindow = block.slice(tagEnd + 1, tagEnd + 200);
      const hasTextChild = />[^<{]{2,}</.test(childWindow);

      if (!hasLabel && !hasTextChild && !hasAccessible) {
        const lineNum = src.slice(0, tagStart).split('\n').length;
        violations.push({
          file: relPath(file),
          line: lineNum,
          rule: 'missing-accessibility-label',
          message: `Interactive control without accessibilityLabel or visible text — add accessibilityLabel`,
        });
      }

      if (!hasRole && !hasAccessible) {
        const lineNum = src.slice(0, tagStart).split('\n').length;
        violations.push({
          file: relPath(file),
          line: lineNum,
          rule: 'missing-accessibility-role',
          message: `Interactive control without accessibilityRole — add accessibilityRole`,
        });
      }
    }
  }
  return violations;
}

// ─── Check 3: Icon-only controls without hitSlop ─────────────────────────────
function checkHitSlop(files) {
  const violations = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');

    let match;
    PRESSABLE_OPEN.lastIndex = 0;
    while ((match = PRESSABLE_OPEN.exec(src)) !== null) {
      const tagStart = match.index;
      const windowEnd = Math.min(src.length, tagStart + 600);
      const block = src.slice(tagStart, windowEnd);
      const tagEnd = block.indexOf('>');
      if (tagEnd === -1) continue;
      const openingTag = block.slice(0, tagEnd + 1);

      if (openingTag.endsWith('/>')) continue;

      const hasHitSlop = HAS_HITSLOP.test(openingTag);

      // Heuristic: icon-only if the opening tag contains an Ionicons/icon
      // import reference or the children window is short and contains an icon
      const childWindow = block.slice(tagEnd + 1, tagEnd + 300);
      const looksIconOnly =
        /<Ionicons|<Icon|<MaterialIcons|<FontAwesome|<Entypo|<Feather|<MaterialCommunityIcons/.test(
          childWindow
        ) && !/>[^<{]{10,}</.test(childWindow);

      if (looksIconOnly && !hasHitSlop) {
        const lineNum = src.slice(0, tagStart).split('\n').length;
        violations.push({
          file: relPath(file),
          line: lineNum,
          rule: 'missing-hitslop',
          message: `Icon-only control without hitSlop — add hitSlop to meet 44pt target`,
        });
      }
    }
  }
  return violations;
}

// ─── Check 4: Animations without reduced-motion handling ────────────────────
function checkReducedMotion(files) {
  const violations = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');

    if (!USES_REANIMATED_ANIMATION.test(src)) continue;
    if (HAS_REDUCED_MOTION.test(src)) continue;

    // Skip if the file only uses Animated.View without any animation hooks
    // (e.g. just wrapping for animated style from a parent)
    const onlyAnimatedComponent =
      /Animated\.(View|Image|ScrollView|FlatList|Text)/.test(src) &&
      !/useAnimatedStyle|useAnimatedScrollHandler|withSpring|withTiming|withSequence|withDecay|withRepeat|useSharedValue/.test(
        src
      );

    if (onlyAnimatedComponent) continue;

    violations.push({
      file: relPath(file),
      line: 1,
      rule: 'missing-reduced-motion',
      message: `File uses Reanimated animations but has no useReducedMotion/useMotionConfig handling`,
    });
  }
  return violations;
}

// ─── Check 5: Card-on-card composition (heuristic) ───────────────────────────
// Flags a Card/Surface component whose direct child is another Card/Surface.
function checkCardOnCard(files) {
  const violations = [];
  const CARD_PATTERN =
    /<(Card|Surface|FlagshipScreen|FlagshipCard|FlagshipPanel|View)\b[^>]*style[^>]*(?:backgroundColor|background)[^>]*>/g;

  for (const file of files) {
    const src = readFileSync(file, 'utf-8');

    // This is a heuristic — we look for nested styled containers with
    // backgroundColor in the same file. A precise check requires AST parsing.
    // We flag files where multiple nested backgroundColor surfaces appear in
    // close proximity (within 300 chars) as a warning, not a hard fail.
    let match;
    CARD_PATTERN.lastIndex = 0;
    const matches = [];
    while ((match = CARD_PATTERN.exec(src)) !== null) {
      matches.push(match.index);
    }

    for (let i = 0; i < matches.length - 1; i++) {
      const gap = matches[i + 1] - matches[i];
      if (gap < 300) {
        const lineNum = src.slice(0, matches[i]).split('\n').length;
        // Only flag as a warning — heuristic, not definitive
        violations.push({
          file: relPath(file),
          line: lineNum,
          rule: 'possible-card-on-card',
          message: `Possible nested surface composition — verify no card-on-card without distinct interaction/state boundary`,
        });
        i++; // skip ahead to avoid duplicate flags
      }
    }
  }
  return violations;
}

// ─── Check 6: FlashList performance (memoized renderItem, getItemType) ──────
// Audit §FlashList v2 / LIST_RENDERING_POLICY.md §3.1, §3.2:
// - renderItem must be wrapped in useCallback (not inline arrow)
// - Heterogeneous lists should use getItemType
function checkFlashListPerformance(files) {
  const violations = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf-8');

    // Find all FlashList usage blocks
    const flashListPattern = /<FlashList\b[^>]*>/g;
    let match;
    while ((match = flashListPattern.exec(src)) !== null) {
      const tagStart = match.index;
      const windowEnd = Math.min(src.length, tagStart + 2000);
      const block = src.slice(tagStart, windowEnd);

      // Find the renderItem prop value within this FlashList block
      const renderItemMatch = block.match(
        /renderItem=\{?\(\{[^}]+\}\)\s*=>\s*\(?/
      );
      if (renderItemMatch) {
        const lineNum = src.slice(0, tagStart + renderItemMatch.index).split('\n').length;
        violations.push({
          file: relPath(file),
          line: lineNum,
          rule: 'inline-render-item',
          message: `FlashList renderItem is an inline arrow function — wrap in useCallback for cell recycling stability (LIST_RENDERING_POLICY.md §3.1)`,
        });
      }
    }
  }
  return violations;
}

// ─── Check 7: Department coverage — verify golden route screens exist ───────
// Audit 15 §Golden routes: verify that all department golden route screens
// are present in the codebase. Missing screens are P1 (flagship blocker).
function checkDepartmentCoverage(files) {
  const violations = [];
  const screenFiles = files.filter((f) => f.includes('/screens/') || f.includes('\\screens\\'));

  const goldenRoutes = [
    { name: 'HomeScreen', file: 'HomeScreen.tsx', dept: 'Core/Discovery' },
    { name: 'GlobalSearchScreen', file: 'GlobalSearchScreen.tsx', dept: 'Core/Search' },
    { name: 'ItemDetailScreen', file: 'ItemDetailScreen.tsx', dept: 'Commerce/PDP' },
    { name: 'SellScreen', file: 'SellScreen.tsx', dept: 'Sell' },
    { name: 'CreateCameraScreen', file: 'CreateCameraScreen.tsx', dept: 'Poster/Camera' },
    { name: 'PosterViewerScreen', file: 'PosterViewerScreen.tsx', dept: 'Poster/Viewer' },
    { name: 'MyProfileScreen', file: 'MyProfileScreen.tsx', dept: 'Profile/Self' },
    { name: 'UserProfileScreen', file: 'UserProfileScreen.tsx', dept: 'Profile/Other' },
    { name: 'SettingsScreen', file: 'SettingsScreen.tsx', dept: 'Settings' },
    { name: 'InboxScreen', file: 'InboxScreen.tsx', dept: 'Inbox' },
    { name: 'ChatScreen', file: 'ChatScreen.tsx', dept: 'Chat' },
    { name: 'CheckoutScreen', file: 'CheckoutScreen.tsx', dept: 'Checkout' },
    { name: 'AuctionHomeScreen', file: 'AuctionHomeScreen.tsx', dept: 'Auction' },
    { name: 'AuctionDetailScreen', file: 'AuctionDetailScreen.tsx', dept: 'Auction/Detail' },
    { name: 'SellerHubScreen', file: 'SellerHubScreen.tsx', dept: 'Seller Hub' },
    { name: 'AssetDetailScreen', file: 'AssetDetailScreen.tsx', dept: 'Co-Own/Asset' },
    { name: 'TradeScreen', file: 'TradeScreen.tsx', dept: 'Co-Own/Trade' },
    { name: 'PortfolioScreen', file: 'PortfolioScreen.tsx', dept: 'Co-Own/Portfolio' },
    { name: 'WalletScreen', file: 'WalletScreen.tsx', dept: 'Wallet' },
  ];

  for (const route of goldenRoutes) {
    const found = screenFiles.some((f) => f.endsWith(route.file));
    if (!found) {
      violations.push({
        file: `src/screens/${route.file}`,
        line: 0,
        rule: 'missing-golden-route',
        message: `Golden route screen missing: ${route.name} (${route.dept}) — audit 15 requires this screen for visual QA coverage`,
      });
    }
  }
  return violations;
}

// ─── Check 9: Screenshot baseline presence (P0.6 release gate) ──────────────
// Audit 15 §Golden routes / P0.6: a green build requires committed, approved
// visual baselines. This check fails when no baseline directory exists or when
// the baselines do not cover every department golden route.
function checkScreenshotBaselines() {
  const violations = [];
  const expectedRoutePrefixes = [
    'golden-home',
    'golden-search',
    'golden-pdp',
    'golden-sell',
    'golden-profile',
    'golden-settings',
    'golden-inbox',
    'golden-chat',
    'golden-auction',
    'golden-seller-hub',
    'golden-coown',
    'golden-poster',
  ];

  if (!existsSync(SCREENSHOT_BASELINE_DIR)) {
    violations.push({
      file: 'src/__tests__/__screenshots__/',
      line: 0,
      rule: 'missing-screenshot-baselines',
      message:
        'No screenshot baselines found. Run `maestro test .maestro/golden-route-screenshots.yml` ' +
        'on the target device matrix, review against the optical rubric, then commit baselines ' +
        'to src/__tests__/__screenshots__/. A green build requires approved visual baselines (P0.6).',
    });
    return violations;
  }

  const files = readdirSync(SCREENSHOT_BASELINE_DIR).filter((f) =>
    /\.(png|jpg|jpeg)$/i.test(f)
  );
  if (files.length === 0) {
    violations.push({
      file: 'src/__tests__/__screenshots__/',
      line: 0,
      rule: 'empty-screenshot-baselines',
      message:
        'Screenshot baseline directory exists but contains no images. ' +
        'Capture and commit approved baselines (P0.6).',
    });
    return violations;
  }

  const missing = expectedRoutePrefixes.filter(
    (prefix) => !files.some((f) => f.startsWith(prefix))
  );
  for (const route of missing) {
    violations.push({
      file: `src/__tests__/__screenshots__/${route}-*.png`,
      line: 0,
      rule: 'missing-golden-route-baseline',
      message: `Missing golden-route baseline: ${route}. Re-run the Maestro flow and commit the missing screenshot (P0.6).`,
    });
  }
  return violations;
}

// ─── Check 8: Experiment framework presence ─────────────────────────────────
// Audit 15 §Metrics/Experiments: verify that an experiment/metrics framework
// exists for tracking production metrics per release.
function checkExperimentFramework(files) {
  const violations = [];
  const hasMetricsFile = files.some((f) =>
    /metrics|experiment|analytics/i.test(f) &&
    /\.(ts|tsx)$/.test(f) &&
    !f.includes('__tests__')
  );

  if (!hasMetricsFile) {
    violations.push({
      file: 'src/',
      line: 0,
      rule: 'missing-experiment-framework',
      message: `No metrics/experiment/analytics framework file found — audit 15 requires production metrics tracking (discovery, sell, poster, PDP, seller, performance)`,
    });
  }
  return violations;
}

// ─── Main ───────────────────────────────────────────────────────────────────
function main() {
  // Enforcement (AGENTS.md §31.7): the gate FAILS on P0 by default so the
  // build loop actually enforces the visual constitution. `--report` opts
  // into the old warn-only behaviour for local exploration. `--strict` is
  // retained as an alias for the default strict behaviour for back-compat.
  const report = process.argv.includes('--report');
  const strict = !report; // default strict; --report disables it

  const files = walk(SRC);

  const colorViolations = checkHardcodedColors(files);
  const a11yViolations = checkAccessibility(files);
  const hitSlopViolations = checkHitSlop(files);
  const motionViolations = checkReducedMotion(files);
  const cardViolations = checkCardOnCard(files);
  const flashListViolations = checkFlashListPerformance(files);
  const coverageViolations = checkDepartmentCoverage(files);
  const experimentViolations = checkExperimentFramework(files);
  const baselineViolations = checkScreenshotBaselines();

  const p0Violations = [
    ...colorViolations,
    ...a11yViolations.filter((v) => v.rule === 'missing-accessibility-label'),
    ...baselineViolations,
  ];

  const p1Violations = [
    ...a11yViolations.filter((v) => v.rule === 'missing-accessibility-role'),
    ...hitSlopViolations,
    ...motionViolations,
    ...flashListViolations,
    ...coverageViolations,
    ...experimentViolations,
  ];

  const warnings = cardViolations;

  // Report
  console.log('\n=== Visual Release Gates ===\n');

  if (p0Violations.length > 0) {
    const level = strict ? console.error : console.warn;
    level(`P0 violations: ${p0Violations.length}\n`);
    for (const v of p0Violations.slice(0, 30)) {
      level(`  ${v.file}:${v.line} [${v.rule}] ${v.message}`);
    }
    if (p0Violations.length > 30) {
      level(`  ... and ${p0Violations.length - 30} more P0 violations`);
    }
  }

  if (p1Violations.length > 0) {
    console.warn(`\nP1 violations: ${p1Violations.length}\n`);
    for (const v of p1Violations.slice(0, 30)) {
      console.warn(`  ${v.file}:${v.line} [${v.rule}] ${v.message}`);
    }
    if (p1Violations.length > 30) {
      console.warn(`  ... and ${p1Violations.length - 30} more P1 violations`);
    }
  }

  if (warnings.length > 0) {
    console.warn(`\nWarnings (heuristic): ${warnings.length}\n`);
    for (const v of warnings.slice(0, 15)) {
      console.warn(`  ${v.file}:${v.line} [${v.rule}] ${v.message}`);
    }
    if (warnings.length > 15) {
      console.warn(`  ... and ${warnings.length - 15} more warnings`);
    }
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`  Files scanned: ${files.length}`);
  console.log(`  P0 violations: ${p0Violations.length}`);
  console.log(`  P1 violations: ${p1Violations.length}`);
  console.log(`  Warnings: ${warnings.length}`);
  console.log(`  Mode: ${strict ? 'strict (fail on P0)' : 'report (warn only)'}`);

  if (strict && p0Violations.length > 0) {
    console.error(
      '\n✗ visual-gates: P0 violations found — fix before merge.\n' +
        '  (AGENTS.md §31.7: the visual release gate is enforced by default.\n' +
        '   Run with --report for warn-only local exploration.)\n'
    );
    process.exit(1);
  }

  if (p0Violations.length === 0 && p1Violations.length === 0) {
    console.log('\n✓ visual-gates: No violations found.');
  } else if (report) {
    console.log(
      `\n~ visual-gates: ${p0Violations.length} P0, ${p1Violations.length} P1 reported (--report mode; default would fail on P0).`
    );
  } else {
    console.log(
      `\n~ visual-gates: ${p0Violations.length} P0, ${p1Violations.length} P1 reported.`
    );
  }
  process.exit(0);
}

main();
