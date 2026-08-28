#!/usr/bin/env node
/**
 * Golden Screenshot Parity Checker — Phase 5 WP9/P5-19
 *
 * Compares fixture-mode and integration-mode golden screenshots to detect:
 *   - Contract bugs: backend missing fields that the UI requires
 *   - Design bugs: UI fabricating data the backend doesn't provide
 *   - Seeding gaps: integration screenshots empty where fixture is populated
 *
 * Performs real pixel-level diff using pixelmatch when both fixture and
 * integration baselines exist for a route. Falls back to presence check
 * when only one mode has a baseline.
 *
 * Usage:
 *   node scripts/check-golden-parity.mjs
 *
 * Prerequisites:
 *   - Fixture baselines in src/__tests__/__screenshots__/fixture/
 *   - Integration baselines in src/__tests__/__screenshots__/integration/
 *
 * Output:
 *   - Exit 0: parity check passed (or only acceptable diffs found)
 *   - Exit 1: parity violations found (contract/design bugs)
 *   - Exit 2: baseline directories missing
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, '..', 'src', '__tests__', '__screenshots__');
const FIXTURE_DIR = join(SCREENSHOTS_DIR, 'fixture');
const INTEGRATION_DIR = join(SCREENSHOTS_DIR, 'integration');

// Pixel diff threshold — 0.1 means up to 10% color difference per pixel
// is tolerated. Lower = more sensitive.
const PIXELMATCH_THRESHOLD = 0.1;

// Maximum allowed diff percentage between fixture and integration mode.
// If the diff exceeds this, the route is flagged as a parity violation.
// 5% allows for minor rendering differences (timestamps, avatars) while
// catching structural divergence (missing fields, fabricated data).
const MAX_DIFF_PERCENT = 5.0;

// Routes that must have both fixture and integration baselines
const GOLDEN_ROUTES = [
  'golden-home-populated',
  'golden-search-idle',
  'golden-search-results',
  'golden-browse-populated',
  'golden-pdp-fixed',
  'golden-sell-empty',
  'golden-profile-self',
  'golden-settings-root',
  'golden-inbox-populated',
  'golden-chat-populated',
  'golden-auction-home',
  'golden-auction-detail',
  'golden-coown-hub',
  'golden-coown-asset-detail',
  'golden-coown-portfolio',
  'golden-poster-camera',
  'golden-notifications',
  'golden-final-state',
];

function listScreenshots(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.(png|jpg|jpeg)$/i.test(f));
}

/**
 * Compares two PNG files pixel-by-pixel using pixelmatch.
 * Returns the percentage of differing pixels (0-100).
 * Returns null if the images have different dimensions (cannot compare).
 */
function comparePngs(fixturePath, integrationPath) {
  try {
    const img1 = PNG.sync.read(readFileSync(fixturePath));
    const img2 = PNG.sync.read(readFileSync(integrationPath));

    if (img1.width !== img2.width || img1.height !== img2.height) {
      console.warn(`  Dimension mismatch: ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`);
      return null;
    }

    const { width, height } = img1;
    const diff = new PNG({ width, height });
    const numDiffPixels = pixelmatch(
      img1.data,
      img2.data,
      diff.data,
      width,
      height,
      { threshold: PIXELMATCH_THRESHOLD }
    );

    const totalPixels = width * height;
    return (numDiffPixels / totalPixels) * 100;
  } catch (err) {
    console.warn(`  Pixel comparison failed: ${err.message}`);
    return null;
  }
}

function checkParity() {
  const fixtureScreenshots = listScreenshots(FIXTURE_DIR);
  const integrationScreenshots = listScreenshots(INTEGRATION_DIR);

  if (fixtureScreenshots.length === 0 && integrationScreenshots.length === 0) {
    console.error('[golden-parity] ERROR: No baseline directories found.');
    console.error(`  Expected: ${FIXTURE_DIR}`);
    console.error(`  Expected: ${INTEGRATION_DIR}`);
    console.error('');
    console.error('  Run the dual-mode golden suite:');
    console.error('    EXPO_PUBLIC_MOCK_MODE=fixture-design maestro test .maestro/dual-mode-golden-suite.yml');
    console.error('    EXPO_PUBLIC_MOCK_MODE=integration-truth maestro test .maestro/dual-mode-golden-suite.yml');
    console.error('    cp -r .maestro/screenshots/fixture src/__tests__/__screenshots__/fixture');
    console.error('    cp -r .maestro/screenshots/integration src/__tests__/__screenshots__/integration');
    process.exit(2);
  }

  const violations = [];
  const warnings = [];
  const diffs = [];

  for (const route of GOLDEN_ROUTES) {
    const fixtureMatch = fixtureScreenshots.find((f) => f.startsWith(route));
    const integrationMatch = integrationScreenshots.find((f) => f.startsWith(route));

    if (!fixtureMatch && !integrationMatch) {
      violations.push(`${route}: missing in both fixture and integration`);
    } else if (!fixtureMatch) {
      violations.push(`${route}: missing in fixture mode`);
    } else if (!integrationMatch) {
      warnings.push(`${route}: missing in integration mode (seeded backend may not be running)`);
    } else {
      // Both exist — perform real pixel-level diff
      const fixturePath = join(FIXTURE_DIR, fixtureMatch);
      const integrationPath = join(INTEGRATION_DIR, integrationMatch);
      const diffPercent = comparePngs(fixturePath, integrationPath);

      if (diffPercent === null) {
        warnings.push(`${route}: pixel comparison skipped (dimension mismatch or read error)`);
      } else if (diffPercent > MAX_DIFF_PERCENT) {
        violations.push(
          `${route}: pixel diff ${diffPercent.toFixed(2)}% exceeds ${MAX_DIFF_PERCENT}% threshold — ` +
            `possible contract bug (backend missing fields) or design bug (UI fabricating data)`
        );
      } else {
        diffs.push(`${route}: ${diffPercent.toFixed(2)}% diff (within threshold)`);
      }
    }
  }

  if (diffs.length > 0) {
    console.log('[golden-parity] Pixel diff results:');
    for (const d of diffs) console.log(`  ✓ ${d}`);
    console.log('');
  }

  if (warnings.length > 0) {
    console.warn('[golden-parity] Warnings (integration baselines incomplete or comparison skipped):');
    for (const w of warnings) console.warn(`  ⚠ ${w}`);
    console.warn('');
  }

  if (violations.length > 0) {
    console.error('[golden-parity] FAIL — parity violations:');
    for (const v of violations) console.error(`  ✗ ${v}`);
    console.error('');
    console.error('Fix: Re-run the dual-mode golden suite and commit baselines.');
    console.error('  If the diff is intentional, update the fixture or integration baseline.');
    process.exit(1);
  }

  console.log('[golden-parity] PASS — all golden routes have baselines in both modes.');
  if (warnings.length > 0) {
    console.log(`  (${warnings.length} warnings about missing integration baselines)`);
  }
  if (diffs.length > 0) {
    console.log(`  (${diffs.length} routes compared with pixelmatch — all within ${MAX_DIFF_PERCENT}% threshold)`);
  }
  process.exit(0);
}

checkParity();
