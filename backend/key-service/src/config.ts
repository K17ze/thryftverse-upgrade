import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('KEY_SERVICE_DEFAULT_KEY_VERSION must be a positive integer');
  }
  return parsed;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

function requiredSecret(name: string, developmentFallback: string): string {
  const raw = process.env[name]?.trim();
  if (raw) {
    return raw;
  }

  if (nodeEnv !== 'production') {
    return developmentFallback;
  }

  throw new Error(`Missing required secret environment variable: ${name}`);
}

const hasExplicitMasterKey = Boolean(process.env.KEY_SERVICE_MASTER_KEY_B64?.trim());

if (nodeEnv === 'production' && !hasExplicitMasterKey) {
  throw new Error('KEY_SERVICE_MASTER_KEY_B64 must be explicitly set in production');
}

const masterKeyB64 = required(
  'KEY_SERVICE_MASTER_KEY_B64',
  'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='
);

const developmentMasterKeyB64 = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
if (nodeEnv === 'production' && masterKeyB64 === developmentMasterKeyB64) {
  throw new Error('KEY_SERVICE_MASTER_KEY_B64 cannot use the development key in production');
}

const masterKey = Buffer.from(masterKeyB64, 'base64');
if (masterKey.length !== 32) {
  throw new Error('KEY_SERVICE_MASTER_KEY_B64 must decode to exactly 32 bytes');
}

const allowedKeys = parseCsv(process.env.KEY_SERVICE_ALLOWED_KEYS ?? 'profile,message,wallet');
if (allowedKeys.length === 0) {
  throw new Error('KEY_SERVICE_ALLOWED_KEYS must include at least one key name');
}

const clientToken = requiredSecret('KEY_SERVICE_CLIENT_TOKEN', 'local-key-client-token');
const adminToken = requiredSecret('KEY_SERVICE_ADMIN_TOKEN', 'local-key-admin-token');

if (nodeEnv === 'production') {
  if (clientToken.length < 32 || adminToken.length < 32) {
    throw new Error('KEY_SERVICE client and admin tokens must contain at least 32 characters in production');
  }
  if (clientToken === adminToken) {
    throw new Error('KEY_SERVICE client and admin tokens must be different');
  }
}

const port = Number(process.env.PORT ?? '4100');
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

export const config = {
  nodeEnv,
  port,
  defaultKeyVersion: parsePositiveInt(process.env.KEY_SERVICE_DEFAULT_KEY_VERSION, 1),
  allowedKeys,
  region: process.env.KEY_SERVICE_REGION ?? 'local-edge',
  country: process.env.KEY_SERVICE_COUNTRY ?? 'dev-local',
  clientToken,
  adminToken,
  masterKey,
};
