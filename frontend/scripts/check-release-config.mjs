#!/usr/bin/env node
/**
 * Release configuration gate (F18).
 *
 * Verifies that store submission and OTA signing are actually configured
 * before a release can proceed — fail-closed rather than discovering
 * placeholder values mid-release.
 *
 * Modes:
 *   node scripts/check-release-config.mjs ota      — OTA update signing only
 *   node scripts/check-release-config.mjs submit   — eas.json submit profile
 *   node scripts/check-release-config.mjs all      — both (default)
 *
 * Checks:
 *   OTA    — the OTA code-signing private key is present AND matches the
 *            committed keys/update-certificate.pem. The preferred secret is
 *            EXPO_OTA_CODE_SIGNING_PRIVATE_KEY; CI release workflows also
 *            bridge it into the legacy EXPO_PUBLIC_OTA_CODE_SIGNING_KEY name
 *            for this checker, so either env var satisfies presence.
 *   SUBMIT — eas.json submit.production fields contain real values, not
 *            literal EAS_* / EXPO_* placeholder names (eas.json does NOT
 *            interpolate environment variables), and any configured file
 *            path (serviceAccountKeyPath) exists.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'all';
const errors = [];

function normalizePem(value) {
  // EAS/GitHub secrets preserve real newlines; tolerate the common
  // literal-\n encoding as a fallback so a double-encoded secret is checked
  // for what it actually is rather than passing on presence alone.
  return value.includes('-----BEGIN') ? value : value.replace(/\\n/g, '\n');
}

function checkOta() {
  // Preferred: EXPO_OTA_CODE_SIGNING_PRIVATE_KEY. The legacy
  // EXPO_PUBLIC_OTA_CODE_SIGNING_KEY is still accepted because the release
  // workflows bridge the private key into it for this step — and for local
  // runs that only have the legacy secret configured.
  const key =
    process.env.EXPO_OTA_CODE_SIGNING_PRIVATE_KEY?.trim() ||
    process.env.EXPO_PUBLIC_OTA_CODE_SIGNING_KEY?.trim();
  const certPath = join(ROOT, 'keys', 'update-certificate.pem');

  if (!key) {
    errors.push(
      'OTA signing: no private key configured. Set the EXPO_OTA_CODE_SIGNING_PRIVATE_KEY ' +
        'EAS/GitHub secret (eas secret:create --scope project --name EXPO_OTA_CODE_SIGNING_PRIVATE_KEY ' +
        '--value <private-key>). Without it, OTA updates ship unsigned.',
    );
  }
  if (!existsSync(certPath)) {
    errors.push(
      'OTA signing: keys/update-certificate.pem is missing. ' +
        'Generate the keypair once: eas update:configure-code-signing --key-output-directory keys ' +
        '(commit update-certificate.pem; never commit private-key.pem).',
    );
  }

  // Presence alone is not proof: verify the private key actually parses and
  // its public key matches the committed certificate — a stale or mismatched
  // pair fails closed here rather than mid-release.
  if (key && existsSync(certPath)) {
    try {
      const privateKey = createPrivateKey(normalizePem(key));
      const certificate = new X509Certificate(readFileSync(certPath));
      const fromKey = createPublicKey(privateKey)
        .export({ format: 'pem', type: 'spki' })
        .toString();
      const fromCert = certificate.publicKey
        .export({ format: 'pem', type: 'spki' })
        .toString();
      if (fromKey !== fromCert) {
        errors.push(
          'OTA signing: the configured private key does NOT match keys/update-certificate.pem. ' +
            'Regenerate the pair (eas update:configure-code-signing --key-output-directory keys) ' +
            'and update the EXPO_OTA_CODE_SIGNING_PRIVATE_KEY secret together.',
        );
      }
    } catch (err) {
      errors.push(
        `OTA signing: could not validate the private key against the certificate — ${err.message}. ` +
          'The secret must contain the PEM private key text itself.',
      );
    }
  }
}

function checkSubmit() {
  let eas;
  try {
    eas = JSON.parse(readFileSync(join(ROOT, 'eas.json'), 'utf8'));
  } catch (err) {
    errors.push(`submit: cannot read eas.json — ${err.message}`);
    return;
  }

  const submit = eas.submit?.production;
  if (!submit) {
    errors.push('submit: eas.json has no submit.production profile.');
    return;
  }

  // eas.json does not interpolate env vars — a value that IS the placeholder
  // name means the real credential was never configured.
  const placeholder = /^[A-Z][A-Z0-9_]+$/;
  const fields = [
    ['ios.ascAppId', submit.ios?.ascAppId, 'App Store Connect app ID'],
    ['ios.appleId', submit.ios?.appleId, 'Apple Developer account email'],
    ['ios.appleTeamId', submit.ios?.appleTeamId, 'Apple Developer Team ID'],
    [
      'android.serviceAccountKeyPath',
      submit.android?.serviceAccountKeyPath,
      'Google Play service account JSON path',
    ],
  ];

  for (const [name, value, label] of fields) {
    if (value === undefined || value === null) continue; // optional field
    if (typeof value === 'string' && placeholder.test(value)) {
      errors.push(
        `submit: eas.json submit.production.${name} is still the literal ` +
          `placeholder "${value}" — replace it with the real ${label}.`,
      );
    }
  }

  // A configured (non-placeholder) key path must point at a real file.
  const keyPath = submit.android?.serviceAccountKeyPath;
  if (
    typeof keyPath === 'string' &&
    !placeholder.test(keyPath) &&
    !existsSync(join(ROOT, keyPath)) &&
    !existsSync(keyPath)
  ) {
    errors.push(
      `submit: android.serviceAccountKeyPath "${keyPath}" does not exist ` +
        '(checked relative to frontend/ and as an absolute path).',
    );
  }
}

if (mode === 'ota' || mode === 'all') checkOta();
if (mode === 'submit' || mode === 'all') checkSubmit();
if (mode !== 'ota' && mode !== 'submit' && mode !== 'all') {
  console.error(`check-release-config: unknown mode "${mode}" (expected ota|submit|all)`);
  process.exit(2);
}

if (errors.length > 0) {
  console.error(`\n✗ release-config: ${errors.length} problem(s) — release is NOT ready\n`);
  for (const e of errors) console.error(`  ${e}`);
  console.error('');
  process.exit(1);
}

console.log(`✓ release-config (${mode}): submission and signing configuration verified.`);
process.exit(0);
