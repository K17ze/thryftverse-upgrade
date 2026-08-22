#!/usr/bin/env node
/**
 * SSL Pin Validation Guard
 *
 * Prevents a production build from shipping with placeholder SPKI hashes.
 * When SSL pinning is enabled (EXPO_PUBLIC_SSL_PINNING_ENABLED=true) and
 * the build is for production (EXPO_PUBLIC_ENVIRONMENT=production), this
 * script verifies that every configured pin in:
 *
 *   - frontend/src/utils/sslPinning.ts (SSL_PINNING_CONFIG.domains)
 *   - frontend/plugins/withTrustKit.js  (PINNED_DOMAINS)
 *   - frontend/android/app/src/main/res/xml/network_security_config.xml
 *
 * contains a real base64 SHA-256 SPKI hash — not a PLACEHOLDER_* marker.
 *
 * Exit codes:
 *   0 — all pins are real (or pinning is disabled / non-production)
 *   1 — placeholder hashes found in a production build with pinning enabled
 *
 * Run via: npm run check:ssl-pins
 *   or automatically as a prebuild step (see package.json "prebuild" script).
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const isProduction = process.env.EXPO_PUBLIC_ENVIRONMENT === 'production';
const pinningEnabled = process.env.EXPO_PUBLIC_SSL_PINNING_ENABLED === 'true';

const PLACEHOLDER_PATTERNS = [
  /PLACEHOLDER_/i,
  /REPLACE_WITH_/i,
  /TODO\(release\)/i,
  /TODO\(staging\)/i,
  /TODO\(dev\)/i,
];

/**
 * A valid base64 SHA-256 hash is 44 characters of base64 alphabet
 * (A-Za-z0-9+/) ending with '=' padding. We use a relaxed check that
 * rejects obvious placeholders and accepts any non-placeholder base64
 * string of the right length.
 */
const VALID_HASH_LENGTH = 44;

function isPlaceholderHash(value) {
  if (!value || typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  // A real SPKI hash is 44 chars of base64 (SHA-256 = 32 bytes → 44 base64 chars with padding)
  if (trimmed.length !== VALID_HASH_LENGTH) return true;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return true;
  return false;
}

function checkSslPinningTs() {
  const filePath = join(ROOT, 'src', 'utils', 'sslPinning.ts');
  if (!existsSync(filePath)) {
    console.warn('[ssl-pins] sslPinning.ts not found — skipping');
    return [];
  }
  const content = readFileSync(filePath, 'utf8');
  const errors = [];

  // Extract all hash values from the domains config
  // Match string values assigned to primary/backup properties
  const hashRegex = /(?:primary|backup)\s*:\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = hashRegex.exec(content)) !== null) {
    const hash = match[1];
    if (isPlaceholderHash(hash)) {
      errors.push(`sslPinning.ts: placeholder or invalid hash "${hash}"`);
    }
  }

  return errors;
}

function checkTrustKitPlugin() {
  const filePath = join(ROOT, 'plugins', 'withTrustKit.js');
  if (!existsSync(filePath)) {
    console.warn('[ssl-pins] withTrustKit.js not found — skipping');
    return [];
  }
  const content = readFileSync(filePath, 'utf8');
  const errors = [];

  // Extract all hash values from TSKPublicKeyHashes arrays
  const hashRegex = /['"]([A-Za-z0-9+/=]+|REPLACE_WITH_[^'"]+|PLACEHOLDER_[^'"]+)['"]/g;
  let match;
  while ((match = hashRegex.exec(content)) !== null) {
    const hash = match[1];
    // Skip short strings that aren't hashes (like 'main', 'rsa-v1_5-sha256')
    if (hash.length >= 20 && isPlaceholderHash(hash)) {
      errors.push(`withTrustKit.js: placeholder or invalid hash "${hash}"`);
    }
  }

  return errors;
}

function checkNetworkSecurityConfig() {
  const filePath = join(ROOT, 'android', 'app', 'src', 'main', 'res', 'xml', 'network_security_config.xml');
  if (!existsSync(filePath)) {
    console.warn('[ssl-pins] network_security_config.xml not found — skipping');
    return [];
  }
  const content = readFileSync(filePath, 'utf8');
  const errors = [];

  // Extract all pin digest values
  const pinRegex = /<pin\s+digest=["']SHA-256["']\s*>([^<]+)<\/pin>/g;
  let match;
  while ((match = pinRegex.exec(content)) !== null) {
    const hash = match[1].trim();
    if (isPlaceholderHash(hash)) {
      errors.push(`network_security_config.xml: placeholder or invalid pin "${hash}"`);
    }
  }

  return errors;
}

function main() {
  // If pinning is not enabled or not a production build, just report status
  if (!pinningEnabled) {
    console.info('[ssl-pins] SSL pinning is not enabled (EXPO_PUBLIC_SSL_PINNING_ENABLED != true) — skipping validation');
    process.exit(0);
  }

  if (!isProduction) {
    console.info('[ssl-pins] Non-production build — placeholder hashes are allowed in dev/staging');
    // Still report any placeholders as warnings
    const allErrors = [
      ...checkSslPinningTs(),
      ...checkTrustKitPlugin(),
      ...checkNetworkSecurityConfig(),
    ];
    if (allErrors.length > 0) {
      console.warn(`[ssl-pins] WARNING: ${allErrors.length} placeholder hash(es) found (allowed in non-production):`);
      for (const err of allErrors) {
        console.warn(`  - ${err}`);
      }
    }
    process.exit(0);
  }

  // Production build with pinning enabled — fail on any placeholder
  console.info('[ssl-pins] Production build with SSL pinning enabled — validating all SPKI hashes...');

  const allErrors = [
    ...checkSslPinningTs(),
    ...checkTrustKitPlugin(),
    ...checkNetworkSecurityConfig(),
  ];

  if (allErrors.length > 0) {
    console.error(`[ssl-pins] FAIL: ${allErrors.length} placeholder or invalid SPKI hash(es) found in production build:`);
    for (const err of allErrors) {
      console.error(`  - ${err}`);
    }
    console.error('');
    console.error('[ssl-pins] Generate real SPKI hashes with:');
    console.error('  ./frontend/scripts/generate-spki-hashes.sh api.thryftverse.com');
    console.error('  ./frontend/scripts/generate-spki-hashes.sh cdn.thryftverse.com');
    console.error('');
    console.error('[ssl-pins] Then replace all PLACEHOLDER_*/REPLACE_WITH_* values in:');
    console.error('  - frontend/src/utils/sslPinning.ts');
    console.error('  - frontend/plugins/withTrustKit.js');
    console.error('  - frontend/android/app/src/main/res/xml/network_security_config.xml');
    process.exit(1);
  }

  console.info('[ssl-pins] OK: all SPKI hashes are real — production build can proceed');
  process.exit(0);
}

main();
