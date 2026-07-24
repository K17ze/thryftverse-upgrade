import { config as loadDotEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  loadDotEnv({ path: envPath });
}

const production = (process.env.NODE_ENV ?? 'development').trim().toLowerCase() === 'production';
const required = [
  'DATABASE_URL',
  'REDIS_URL',
  'KEY_SERVICE_URL',
  'KEY_SERVICE_CLIENT_TOKEN',
  'KEY_SERVICE_ADMIN_TOKEN',
  'AUTH_ACCESS_TOKEN_SECRET',
  'AUTH_REFRESH_TOKEN_SECRET',
  'API_SECURITY_ADMIN_TOKEN',
  'S3_ENDPOINT',
  'S3_PUBLIC_ENDPOINT',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  'S3_BUCKET',
  'ONEZE_ATTESTATION_SIGNING_SECRET',
  ...(production
    ? [
        'APP_URL',
        'KYC_DEFAULT_VENDOR',
        'KYC_RETURN_URL',
        'KYC_WEBHOOK_SECRET',
        'ALERTING_WEBHOOK_URLS',
        'ONEZE_FX_PROVIDER_URL',
        'ONEZE_FX_PROVIDER_API_KEY',
      ]
    : []),
];

const optional = [
  'DATABASE_REPLICA_URL',
  'DECISION_SERVICE_URL',
  'OPENAI_API_KEY',
  'SENTRY_DSN',
  'OTEL_EXPORTER_OTLP_HTTP_URL',
];

const bannedDefaults = new Map([
  ['KEY_SERVICE_CLIENT_TOKEN', 'local-key-client-token'],
  ['KEY_SERVICE_ADMIN_TOKEN', 'local-key-admin-token'],
  ['AUTH_ACCESS_TOKEN_SECRET', 'dev-only-access-secret-change-me'],
  ['AUTH_REFRESH_TOKEN_SECRET', 'dev-only-refresh-secret-change-me'],
  ['API_SECURITY_ADMIN_TOKEN', 'local-security-admin-token'],
  ['S3_ACCESS_KEY', 'minioadmin'],
  ['S3_SECRET_KEY', 'minioadmin'],
  ['ONEZE_ATTESTATION_SIGNING_SECRET', 'dev-only-oneze-attestation-signing-secret'],
  ['ONEZE_FX_PROVIDER_API_KEY', 'replace_with_live_fx_provider_key'],
]);

function secretKey(key) {
  return /secret|token|password|key/i.test(key);
}

function completeProvider(keys) {
  return keys.every((key) => Boolean(process.env[key]?.trim()));
}

const errors = [];
const warnings = [];

for (const key of required) {
  const value = process.env[key]?.trim();
  if (!value) {
    errors.push(`${key} is missing`);
  }
}

if (production) {
  for (const [key, banned] of bannedDefaults) {
    if (process.env[key]?.trim() === banned) {
      errors.push(`${key} uses a development default`);
    }
  }

  if ((process.env.API_ENABLE_MOCK_WEBHOOKS ?? '').trim().toLowerCase() === 'true') {
    errors.push('API_ENABLE_MOCK_WEBHOOKS must be false in production');
  }

  if ((process.env.ONEZE_FX_SYNC_ENABLED ?? '').trim().toLowerCase() !== 'true') {
    errors.push('ONEZE_FX_SYNC_ENABLED must be true in production');
  }

  const fxProviderUrl = process.env.ONEZE_FX_PROVIDER_URL?.trim() ?? '';
  if (fxProviderUrl && !fxProviderUrl.startsWith('https://')) {
    errors.push('ONEZE_FX_PROVIDER_URL must use https:// in production');
  }

  const paymentReady = [
    ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
    ['MOLLIE_API_KEY', 'MOLLIE_WEBHOOK_SECRET'],
    ['FLUTTERWAVE_SECRET_KEY', 'FLUTTERWAVE_WEBHOOK_SECRET'],
    ['TAP_SECRET_KEY', 'TAP_WEBHOOK_SECRET'],
  ].some(completeProvider);
  if (!paymentReady) {
    errors.push('No complete payment provider credential set is configured');
  }

  const shippingReady = [
    ['EVRI_API_KEY', 'EVRI_API_BASE_URL', 'EVRI_WEBHOOK_SECRET'],
    ['DELHIVERY_API_KEY', 'DELHIVERY_API_BASE_URL', 'DELHIVERY_WEBHOOK_SECRET'],
    ['DHL_API_KEY', 'DHL_API_BASE_URL', 'DHL_WEBHOOK_SECRET'],
    ['ARAMEX_API_KEY', 'ARAMEX_API_BASE_URL', 'ARAMEX_WEBHOOK_SECRET'],
    ['EASYSHIP_API_KEY', 'EASYSHIP_WEBHOOK_SECRET'],
  ].some(completeProvider);
  if (!shippingReady) {
    errors.push('No complete shipping provider credential set is configured');
  }
}

const rateLimitWindow = process.env.API_RATE_LIMIT_WINDOW?.trim() || '1 minute';
if (!/^\d+\s*(?:ms|millisecond|milliseconds|s|second|seconds|m|minute|minutes|h|hour|hours)$/i.test(rateLimitWindow)) {
  errors.push('API_RATE_LIMIT_WINDOW is not a valid positive duration');
}

for (const key of optional) {
  if (!process.env[key]?.trim()) {
    warnings.push(`${key} is not set`);
  }
}

console.log(`Thryftverse backend environment check (${production ? 'production' : 'non-production'})`);
for (const key of required) {
  const value = process.env[key]?.trim();
  console.log(`${value ? 'OK' : 'MISSING'}: ${key}${value && !secretKey(key) ? ` = ${value}` : ''}`);
}

if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (errors.length > 0) {
  console.error('\nEnvironment validation failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('\nEnvironment validation passed.');
