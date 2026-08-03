#!/usr/bin/env node
/**
 * Bundle size checker.
 *
 * Exports the iOS JS bundle via the Expo CLI and reports the bundle size to
 * stderr, comparing it against a configurable threshold. Exits 0 when the
 * bundle is under the threshold and 1 when it exceeds it, so this can be wired
 * into CI to guard against silent bundle-size regressions between releases.
 *
 * Usage:
 *   node scripts/check-bundle-size.mjs [--platform ios|android] [--threshold 1572864]
 *
 * Defaults:
 *   platform:  ios
 *   threshold: 1.5MB (1_572_864 bytes) for the JS bundle
 *
 * The script runs `npx expo export --platform <platform> --dump-sourcemap` into
 * a temporary directory, then inspects the generated bundle artifact. The
 * sourcemap is dumped only so the export produces a stable, measurable bundle
 * artifact; it is not parsed.
 */

import { execSync } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

function parseArgs(argv) {
  const args = { platform: 'ios', threshold: 1_572_864 };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--platform') {
      args.platform = argv[++i] ?? args.platform;
    } else if (arg === '--threshold') {
      const parsed = Number(argv[++i]);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.threshold = parsed;
      }
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  }
  return args;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const args = parseArgs(process.argv);

if (args.help) {
  process.stderr.write(
    'Usage: node scripts/check-bundle-size.mjs [--platform ios|android] [--threshold bytes]\n'
  );
  process.exit(0);
}

const outDir = mkdtempSync(join(tmpdir(), 'thryftverse-bundle-check-'));

try {
  process.stderr.write(
    `Exporting ${args.platform} bundle via expo export (this may take a minute)...\n`
  );

  // `expo export` produces the JS bundle and (with --dump-sourcemap) the
  // sourcemap into the output directory. We only care about the bundle size.
  execSync(
    `npx expo export --platform ${args.platform} --dump-sourcemap --output-dir "${outDir}"`,
    {
      cwd: ROOT,
      stdio: 'pipe',
      env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
    }
  );

  // Locate the generated bundle artifact. `expo export` emits a `bundles`
  // directory for SDK 50+, falling back to a root-level `index.js` for older
  // setups. We pick the largest JS file as the canonical bundle.
  const candidates = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.js')) {
        candidates.push({ path: full, size: st.size });
      }
    }
  }
  walk(outDir);

  if (candidates.length === 0) {
    process.stderr.write('No JS bundle artifact was produced by expo export.\n');
    process.exit(1);
  }

  const bundle = candidates.reduce((a, b) => (a.size > b.size ? a : b));
  const over = bundle.size > args.threshold;

  process.stderr.write(
    `Bundle (${args.platform}): ${formatBytes(bundle.size)} (${bundle.size} bytes)\n`
  );
  process.stderr.write(
    `Threshold: ${formatBytes(args.threshold)} (${args.threshold} bytes)\n`
  );
  process.stderr.write(
    `Artifact: ${bundle.path.replace(outDir, '<out>')}\n`
  );

  if (over) {
    process.stderr.write(
      `FAIL: bundle size ${formatBytes(bundle.size)} exceeds threshold of ${formatBytes(args.threshold)}.\n`
    );
    process.exit(1);
  }

  process.stderr.write(
    `OK: bundle size ${formatBytes(bundle.size)} is within the ${formatBytes(args.threshold)} threshold.\n`
  );
  process.exit(0);
} catch (error) {
  process.stderr.write(
    `Bundle size check failed: ${error?.message ?? 'unknown error'}\n`
  );
  process.exit(1);
} finally {
  if (existsSync(outDir)) {
    rmSync(outDir, { recursive: true, force: true });
  }
}
