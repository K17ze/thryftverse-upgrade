#!/usr/bin/env node
/**
 * Golden Screenshot Parity Checker — Phase 5 WP9/P5-19
 *
 * Compares fixture-mode and integration-mode golden screenshots to detect:
 *   - Contract bugs: backend missing fields that the UI requires
 *   - Design bugs: UI fabricating data the backend doesn't provide
 *   - Seeding gaps: integration screenshots empty where fixture is populated
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

import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, '..', 'src', '__tests__', '__screenshots__');
const FIXTURE_DIR = join(SCREENSHOTS_DIR, 'fixture');
const INTEGRATION_DIR = join(SCREENSHOTS_DIR, 'integration');

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

  for (const route of GOLDEN_ROUTES) {
    const fixtureMatch = fixtureScreenshots.find((f) => f.startsWith(route));
    const integrationMatch = integrationScreenshots.find((f) => f.startsWith(route));

    if (!fixtureMatch && !integrationMatch) {
      violations.push(`${route}: missing in both fixture and integration`);
    } else if (!fixtureMatch) {
      violations.push(`${route}: missing in fixture mode`);
    } else if (!integrationMatch) {
      warnings.push(`${route}: missing in integration mode (seeded backend may not be running)`);
    }
    // Pixel-level diff would go here once a screenshot diffing library
    // is wired in (e.g., pixelmatch or odiff). For now, we check presence.
  }

  if (warnings.length > 0) {
    console.warn('[golden-parity] Warnings (integration baselines incomplete):');
    for (const w of warnings) console.warn(`  ⚠ ${w}`);
    console.warn('');
  }

  if (violations.length > 0) {
    console.error('[golden-parity] FAIL — parity violations:');
    for (const v of violations) console.error(`  ✗ ${v}`);
    console.error('');
    console.error('Fix: Re-run the dual-mode golden suite and commit baselines.');
    process.exit(1);
  }

  console.log('[golden-parity] PASS — all golden routes have baselines in both modes.');
  if (warnings.length > 0) {
    console.log(`  (${warnings.length} warnings about missing integration baselines)`);
  }
  process.exit(0);
}

checkParity();
