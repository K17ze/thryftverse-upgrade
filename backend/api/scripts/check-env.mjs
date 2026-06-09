import { config } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  config({ path: envPath });
}

const REQUIRED = [
  'DATABASE_URL',
  'REDIS_URL',
  'AUTH_ACCESS_TOKEN_SECRET',
  'AUTH_REFRESH_TOKEN_SECRET',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
];

const OPTIONAL = [
  'KEY_SERVICE_URL',
  'KEY_SERVICE_CLIENT_TOKEN',
  'ML_SERVICE_URL',
  'STRIPE_SECRET_KEY',
];

let missing = 0;

console.log('=== Thryftverse Backend Environment Check ===\n');

for (const key of REQUIRED) {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    console.log(`MISSING: ${key}`);
    missing++;
  } else {
    const display = key.toLowerCase().includes('secret') || key.toLowerCase().includes('token')
      ? '***'
      : value;
    console.log(`OK: ${key} = ${display}`);
  }
}

console.log('\nOptional:');
for (const key of OPTIONAL) {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    console.log(`NOT SET: ${key}`);
  } else {
    console.log(`OK: ${key}`);
  }
}

if (missing > 0) {
  console.log(`\nERROR: ${missing} required environment variable(s) missing.`);
  console.log('Create backend/api/.env from .env.example and fill in real values.');
  process.exit(1);
} else {
  console.log('\nAll required environment variables are set.');
  process.exit(0);
}
