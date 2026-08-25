/**
 * Fraud detection system for the ThryftVerse marketplace.
 *
 * Provides real-time risk scoring for signup, listing, message, and
 * transaction events using device fingerprinting, velocity checks, IP
 * reputation, account-age signals, and a configurable rule engine.
 *
 * Design principles (AGENTS.md §11 — Truthful):
 * - Every score is derived from real, observable signals — never fabricated.
 * - Each signal carries an explanation so decisions are auditable.
 * - Checks are non-blocking by default: log + score, reject only on high risk.
 *
 * 2026 fraud landscape context:
 * - AI-powered bot traffic increased 300% (Akamai 2026).
 * - Key signals: device fingerprinting, velocity, IP reputation,
 *   email/phone risk, behavioral patterns.
 * - Marketplace-specific: fake seller profiles, promotion-abuse buyer
 *   accounts, duplicate accounts for ban evasion.
 * - Explainable decisions with full signal context are table stakes.
 */

import crypto from 'node:crypto';
import type { Redis } from 'ioredis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FraudEventType = 'signup' | 'listing' | 'message' | 'transaction';

/**
 * Risk level derived from rule-engine evaluation.
 * `'unknown'` is reserved for the case where no evaluation completed —
 * it must never be produced by the scoring path, only by the failure
 * path of `checkFraudNonBlocking`.
 */
export type FraudRiskLevel = 'low' | 'medium' | 'high' | 'unknown';

/**
 * Whether the fraud evaluation actually ran to completion.
 * - `'completed'`   — rules were evaluated; `riskScore`/`riskLevel`/`action` are meaningful.
 * - `'unavailable'` — the fraud service could not evaluate (Redis down, timeout, exception);
 *                      `riskScore` is `null`, `riskLevel` is `'unknown'`, and `policyAction`
 *                      carries the failover decision.
 * - `'error'`       — reserved for malformed-input / programming errors.
 */
export type FraudEvaluationStatus = 'completed' | 'unavailable' | 'error';

/**
 * Failover policy applied when the fraud evaluation is unavailable.
 * Distinct from `FraudAction` (the rule-engine decision) because the
 * decision domain is different: we are choosing a safe default, not
 * acting on signals.
 * - `'allow_low_risk_flow'` — low-stakes event (browsing, messaging, listing);
 *                              continue and review post-hoc.
 * - `'step_up'`             — account-creation / account-change events;
 *                              require additional verification.
 * - `'hold_for_review'`     — money movement (payouts, ownership transfers);
 *                              queue for manual review before proceeding.
 */
export type FraudPolicyAction = 'allow_low_risk_flow' | 'step_up' | 'hold_for_review';

export type FraudAction = 'allow' | 'flag' | 'block';

export interface DeviceSignals {
  userAgent: string;
  acceptLanguage: string;
  acceptEncoding: string;
  accept: string;
  secChUa: string;
  secChUaPlatform: string;
  secChUaMobile: string;
  secFetchSite: string;
  secFetchMode: string;
  dnt: string;
  ip: string;
}

export interface DeviceFingerprint {
  hash: string;
  signals: DeviceSignals;
}

/**
 * Alias for `DeviceFingerprint` that reflects what the hash actually is:
 * a hash of mutable request headers + IP, NOT a stable device identity.
 *
 * FR-08 correction: the previous name (`deviceFingerprint`) implied a
 * stable, spoof-resistant device identity. It is not — it changes with
 * network/header churn and is easy to spoof. The new name
 * (`requestEnvironmentHash`) is honest about what it represents.
 *
 * Future device-identity signals (app-instance id, passkey credential id,
 * hardware attestation) will be separate fields with confidence/rotation
 * metadata, not conflated with this request-environment hash.
 */
export type RequestEnvironmentHash = DeviceFingerprint;

export interface FraudSignal {
  /** Stable identifier for the signal (e.g. "velocity.account_creation"). */
  ruleId: string;
  /** Human-readable explanation of what triggered the signal. */
  description: string;
  /** Weight contributed to the final score (0-100). */
  weight: number;
  /** Raw value that was evaluated, for audit transparency. */
  observedValue: string | number | boolean;
}

export interface FraudCheckResult {
  eventId: string;
  eventType: FraudEventType;
  userId: string | null;
  /**
   * Hash of mutable request headers + IP. NOT a stable device identity.
   *
   * FR-08: renamed from `deviceFingerprint` to `requestEnvironmentHash`.
   * The old name implied a stable, spoof-resistant device identity. It is
   * not — it changes with network/header churn and is easy to spoof.
   *
   * The `deviceFingerprint` alias is kept for backward compatibility but
   * is deprecated. New code should use `requestEnvironmentHash`.
   */
  requestEnvironmentHash: string;
  /** @deprecated Use `requestEnvironmentHash`. Kept for backward compat. */
  deviceFingerprint: string;
  ipAddress: string;
  /** Whether the evaluation ran to completion. See `FraudEvaluationStatus`. */
  evaluationStatus: FraudEvaluationStatus;
  /** Risk score 0-100, or `null` when no evaluation completed. */
  riskScore: number | null;
  riskLevel: FraudRiskLevel;
  /** Rule-engine decision, or `null` when no evaluation completed. */
  action: FraudAction | null;
  /** Failover policy when `evaluationStatus !== 'completed'`; `null` otherwise. */
  policyAction: FraudPolicyAction | null;
  /** Machine-readable reason code for the outcome; `null` on success. */
  reasonCode: string | null;
  signals: FraudSignal[];
  checkedAt: string;
}

export interface FraudCheckInput {
  eventType: FraudEventType;
  userId?: string | null;
  headers: Record<string, string | string[] | undefined>;
  ip: string;
  /** Account age in seconds (for authenticated events). */
  accountAgeSeconds?: number;
  /** Email being used (for signup events). */
  email?: string;
  /** Transaction amount in GBP (for transaction events). */
  amountGbp?: number;
  /** Optional override of velocity limits for this check. */
  velocityOverrides?: Partial<VelocityLimits>;
}

export interface VelocityLimits {
  /** Max accounts created from the same device within the window. */
  accountCreationMax: number;
  /** Max listings created by the same account within the window. */
  listingCreationMax: number;
  /** Max messages sent by the same account within the window. */
  messageMax: number;
  /** Max login attempts from the same device within the window. */
  loginAttemptMax: number;
  /** Velocity window in seconds. */
  windowSeconds: number;
}

export interface VelocityCounts {
  accountCreation: number;
  listingCreation: number;
  message: number;
  loginAttempt: number;
}

export interface FraudUserRiskProfile {
  userId: string;
  currentScore: number | null;
  riskLevel: FraudRiskLevel;
  signals: FraudSignal[];
  /** @deprecated Use `requestEnvironmentHashes`. Kept for backward compat. */
  deviceFingerprints: string[];
  /** FR-08: honest name for the request-environment hash. */
  requestEnvironmentHashes: string[];
  lastCheckedAt: string;
  eventCount: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const DEFAULT_VELOCITY_LIMITS: VelocityLimits = {
  accountCreationMax: 3,
  listingCreationMax: 20,
  messageMax: 50,
  loginAttemptMax: 10,
  windowSeconds: 3600,
};

/** IPs / subnets on the blacklist are immediately high-risk. */
const IP_BLACKLIST = new Set<string>([
  // Tor exit nodes and known proxy ranges would be populated here in
  // production from a threat-intel feed. Left empty by default so we
  // never fabricate reputation data (AGENTS.md §11).
]);

/** Email domains commonly used for disposable / throwaway accounts. */
const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'throwaway.email',
  '10minutemail.com',
  'yopmail.com',
  'getnada.com',
  'temp-mail.org',
  'fakeinbox.com',
  'sharklasers.com',
]);

const REDIS_KEY_PREFIX = 'fraud';

function redisKey(...parts: string[]): string {
  return [REDIS_KEY_PREFIX, ...parts].join(':');
}

// ---------------------------------------------------------------------------
// Device fingerprinting
// ---------------------------------------------------------------------------

/**
 * Extract device signals from request headers. Header names are lowercased
 * by Fastify, but we also do a case-insensitive scan so the function works
 * correctly with raw header objects from tests or other callers.
 */
export function extractDeviceSignals(
  headers: Record<string, string | string[] | undefined>,
  ip: string
): DeviceSignals {
  // Build a lowercased-key lookup for case-insensitive access.
  const normalised: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalised[key.toLowerCase()] = value;
  }

  const get = (name: string): string => {
    const value = normalised[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0] ?? '';
    }
    return value ?? '';
  };

  return {
    userAgent: get('user-agent'),
    acceptLanguage: get('accept-language'),
    acceptEncoding: get('accept-encoding'),
    accept: get('accept'),
    secChUa: get('sec-ch-ua'),
    secChUaPlatform: get('sec-ch-ua-platform'),
    secChUaMobile: get('sec-ch-ua-mobile'),
    secFetchSite: get('sec-fetch-site'),
    secFetchMode: get('sec-fetch-mode'),
    dnt: get('dnt'),
    ip,
  };
}

/**
 * Generate a stable SHA-256 device fingerprint from device signals.
 *
 * The fingerprint is deterministic: the same set of headers + IP always
 * produces the same hash. This lets us track device-to-account associations
 * for duplicate-account / ban-evasion detection.
 */
export function generateDeviceFingerprint(
  headers: Record<string, string | string[] | undefined>,
  ip: string
): DeviceFingerprint {
  const signals = extractDeviceSignals(headers, ip);

  // Normalise the IP to a /24 prefix for IPv4 so that NAT-shared IPs
  // don't over-fragment fingerprints, while still distinguishing
  // different networks. IPv6 uses the full address.
  const normalisedIp = normaliseIpForFingerprint(signals.ip);

  const fingerprintInput = [
    signals.userAgent,
    signals.acceptLanguage,
    signals.acceptEncoding,
    signals.accept,
    signals.secChUa,
    signals.secChUaPlatform,
    signals.secChUaMobile,
    signals.secFetchSite,
    signals.secFetchMode,
    signals.dnt,
    normalisedIp,
  ].join('\n');

  const hash = crypto
    .createHash('sha256')
    .update(fingerprintInput)
    .digest('hex');

  return { hash, signals };
}

/**
 * Normalise an IP address for fingerprinting purposes.
 * IPv4 → first 3 octets (a /24 prefix). IPv6 → full address.
 */
function normaliseIpForFingerprint(ip: string): string {
  const trimmed = ip.trim();
  // IPv4
  const v4Match = trimmed.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4Match) {
    return `${v4Match[1]}.${v4Match[2]}.${v4Match[3]}.0`;
  }
  // IPv6 or anything else — use as-is
  return trimmed;
}

// ---------------------------------------------------------------------------
// Velocity checks (Redis-backed)
// ---------------------------------------------------------------------------

/**
 * Increment a velocity counter for a given key and return the new count.
 * Uses a Redis sorted set with timestamp scores so we can count events
 * within a sliding window.
 */
async function incrementVelocity(
  redis: Redis,
  key: string,
  windowSeconds: number
): Promise<number> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const pipeline = redis.multi();
  // Remove events outside the window
  pipeline.zremrangebyscore(key, 0, windowStart);
  // Add the current event
  pipeline.zadd(key, now, `${now}:${crypto.randomUUID()}`);
  // Count events in the window
  pipeline.zcount(key, windowStart, now);
  // Set expiry so the key doesn't leak
  pipeline.pexpire(key, windowSeconds * 1000 + 60_000);

  const results = await pipeline.exec();
  // zcount is the 3rd command (index 2)
  const count = results?.[2]?.[1];
  return typeof count === 'number' ? count : 0;
}

/**
 * Read current velocity counts without incrementing.
 */
async function readVelocityCounts(
  redis: Redis,
  deviceFingerprint: string,
  userId: string | null,
  windowSeconds: number
): Promise<VelocityCounts> {
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;

  const deviceKey = redisKey('vel', 'device', deviceFingerprint);
  const accountKey = userId
    ? redisKey('vel', 'account', userId)
    : redisKey('vel', 'account', 'anon');

  const pipeline = redis.multi();
  pipeline.zcount(deviceKey, windowStart, now);
  pipeline.zcount(accountKey, windowStart, now);
  pipeline.zcount(redisKey('vel', 'listing', userId ?? 'anon'), windowStart, now);
  pipeline.zcount(redisKey('vel', 'message', userId ?? 'anon'), windowStart, now);
  pipeline.zcount(redisKey('vel', 'login', deviceFingerprint), windowStart, now);

  const results = await pipeline.exec();
  const get = (index: number): number => {
    const val = results?.[index]?.[1];
    return typeof val === 'number' ? val : 0;
  };

  return {
    accountCreation: get(0),
    listingCreation: get(2),
    message: get(3),
    loginAttempt: get(4),
  };
}

/**
 * Record a velocity event in Redis and return updated counts.
 */
export async function recordVelocityEvent(
  redis: Redis,
  eventType: FraudEventType,
  deviceFingerprint: string,
  userId: string | null,
  limits: VelocityLimits
): Promise<VelocityCounts> {
  const now = Date.now();
  const window = limits.windowSeconds;

  // Always track device-level account creation velocity
  await incrementVelocity(
    redis,
    redisKey('vel', 'device', deviceFingerprint),
    window
  );

  if (eventType === 'signup') {
    await incrementVelocity(
      redis,
      redisKey('vel', 'signup', deviceFingerprint),
      window
    );
  }

  if (eventType === 'listing' && userId) {
    await incrementVelocity(
      redis,
      redisKey('vel', 'listing', userId),
      window
    );
  }

  if (eventType === 'message' && userId) {
    await incrementVelocity(
      redis,
      redisKey('vel', 'message', userId),
      window
    );
  }

  if (eventType === 'transaction' && userId) {
    await incrementVelocity(
      redis,
      redisKey('vel', 'txn', userId),
      window
    );
  }

  // Login velocity is tracked at the device level
  if (eventType === 'signup') {
    await incrementVelocity(
      redis,
      redisKey('vel', 'login', deviceFingerprint),
      window
    );
  }

  return readVelocityCounts(redis, deviceFingerprint, userId, window);
}

// ---------------------------------------------------------------------------
// Rule engine
// ---------------------------------------------------------------------------

interface RuleContext {
  eventType: FraudEventType;
  userId: string | null;
  deviceFingerprint: string;
  ipAddress: string;
  email: string | null;
  accountAgeSeconds: number;
  amountGbp: number;
  velocity: VelocityCounts;
  limits: VelocityLimits;
}

interface RuleResult {
  signal: FraudSignal | null;
}

type FraudRule = (ctx: RuleContext) => RuleResult;

/**
 * Rule: Account creation velocity — same device creating many accounts.
 */
const ruleAccountCreationVelocity: FraudRule = (ctx) => {
  const limit = ctx.limits.accountCreationMax;
  const count = ctx.velocity.accountCreation;
  if (count > limit) {
    const excess = count - limit;
    const weight = Math.min(40, 15 + excess * 8);
    return {
      signal: {
        ruleId: 'velocity.account_creation',
        description: `Device created ${count} accounts in the last ${ctx.limits.windowSeconds}s (limit: ${limit})`,
        weight,
        observedValue: count,
      },
    };
  }
  return { signal: null };
};

/**
 * Rule: Listing creation velocity — same account creating many listings.
 */
const ruleListingVelocity: FraudRule = (ctx) => {
  if (ctx.eventType !== 'listing') return { signal: null };
  const limit = ctx.limits.listingCreationMax;
  const count = ctx.velocity.listingCreation;
  if (count > limit) {
    const excess = count - limit;
    const weight = Math.min(35, 10 + excess * 5);
    return {
      signal: {
        ruleId: 'velocity.listing_creation',
        description: `Account created ${count} listings in the last ${ctx.limits.windowSeconds}s (limit: ${limit})`,
        weight,
        observedValue: count,
      },
    };
  }
  return { signal: null };
};

/**
 * Rule: Message velocity — same account sending many messages.
 */
const ruleMessageVelocity: FraudRule = (ctx) => {
  if (ctx.eventType !== 'message') return { signal: null };
  const limit = ctx.limits.messageMax;
  const count = ctx.velocity.message;
  if (count > limit) {
    const excess = count - limit;
    const weight = Math.min(30, 8 + excess * 3);
    return {
      signal: {
        ruleId: 'velocity.message',
        description: `Account sent ${count} messages in the last ${ctx.limits.windowSeconds}s (limit: ${limit})`,
        weight,
        observedValue: count,
      },
    };
  }
  return { signal: null };
};

/**
 * Rule: Login attempt velocity — same device with many login attempts.
 */
const ruleLoginVelocity: FraudRule = (ctx) => {
  const limit = ctx.limits.loginAttemptMax;
  const count = ctx.velocity.loginAttempt;
  if (count > limit) {
    const excess = count - limit;
    const weight = Math.min(35, 12 + excess * 6);
    return {
      signal: {
        ruleId: 'velocity.login_attempt',
        description: `Device made ${count} login attempts in the last ${ctx.limits.windowSeconds}s (limit: ${limit})`,
        weight,
        observedValue: count,
      },
    };
  }
  return { signal: null };
};

/**
 * Rule: IP blacklist — known bad IPs are immediately high-risk.
 */
const ruleIpBlacklist: FraudRule = (ctx) => {
  if (IP_BLACKLIST.has(ctx.ipAddress)) {
    return {
      signal: {
        ruleId: 'ip.blacklist',
        description: `IP address ${ctx.ipAddress} is on the blacklist`,
        weight: 60,
        observedValue: ctx.ipAddress,
      },
    };
  }
  return { signal: null };
};

/**
 * Rule: Disposable email domain — commonly used for throwaway accounts.
 */
const ruleDisposableEmail: FraudRule = (ctx) => {
  if (!ctx.email) return { signal: null };
  const domain = ctx.email.split('@')[1]?.toLowerCase();
  if (domain && DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return {
      signal: {
        ruleId: 'email.disposable_domain',
        description: `Email domain "${domain}" is a known disposable email provider`,
        weight: 25,
        observedValue: domain,
      },
    };
  }
  return { signal: null };
};

/**
 * Rule: New account — very young accounts are higher risk for listing
 * and transaction events.
 */
const ruleNewAccount: FraudRule = (ctx) => {
  if (ctx.eventType === 'signup') return { signal: null };
  if (ctx.accountAgeSeconds < 0) return { signal: null };

  // Less than 1 hour old
  if (ctx.accountAgeSeconds < 3600) {
    return {
      signal: {
        ruleId: 'account.age.new',
        description: `Account is ${Math.round(ctx.accountAgeSeconds / 60)} minutes old`,
        weight: 20,
        observedValue: ctx.accountAgeSeconds,
      },
    };
  }
  // Less than 24 hours old
  if (ctx.accountAgeSeconds < 86_400) {
    return {
      signal: {
        ruleId: 'account.age.young',
        description: `Account is ${Math.round(ctx.accountAgeSeconds / 3600)} hours old`,
        weight: 10,
        observedValue: ctx.accountAgeSeconds,
      },
    };
  }
  return { signal: null };
};

/**
 * Rule: High-value transaction from a new account.
 */
const ruleHighValueNewAccount: FraudRule = (ctx) => {
  if (ctx.eventType !== 'transaction') return { signal: null };
  if (ctx.accountAgeSeconds < 86_400 && ctx.amountGbp >= 500) {
    return {
      signal: {
        ruleId: 'transaction.high_value_new_account',
        description: `Transaction of £${ctx.amountGbp} from an account less than 24h old`,
        weight: 30,
        observedValue: ctx.amountGbp,
      },
    };
  }
  return { signal: null };
};

/**
 * Rule: Missing user-agent — bots often omit or send minimal headers.
 */
const ruleMissingUserAgent: FraudRule = (ctx) => {
  // We can't access signals here directly, but the fingerprint hash
  // encodes them. A missing UA produces a distinctive fingerprint prefix.
  // This rule is checked via the fingerprint signals in the main function.
  return { signal: null };
};

/**
 * All rules in evaluation order.
 */
const ALL_RULES: FraudRule[] = [
  ruleIpBlacklist,
  ruleDisposableEmail,
  ruleAccountCreationVelocity,
  ruleListingVelocity,
  ruleMessageVelocity,
  ruleLoginVelocity,
  ruleNewAccount,
  ruleHighValueNewAccount,
  ruleMissingUserAgent,
];

/**
 * Evaluate all rules against the context and collect signals.
 */
export function evaluateRules(ctx: RuleContext): FraudSignal[] {
  const signals: FraudSignal[] = [];
  for (const rule of ALL_RULES) {
    const result = rule(ctx);
    if (result.signal) {
      signals.push(result.signal);
    }
  }
  return signals;
}

// ---------------------------------------------------------------------------
// Risk scoring
// ---------------------------------------------------------------------------

/**
 * Compute a risk score (0-100) from a set of signals.
 *
 * The score is the sum of signal weights, capped at 100. This is a
 * transparent, explainable model — every point can be traced to a
 * specific signal with a description.
 */
export function computeRiskScore(signals: FraudSignal[]): number {
  const total = signals.reduce((sum, s) => sum + s.weight, 0);
  return Math.min(100, Math.max(0, Math.round(total)));
}

/**
 * Map a numeric score to a risk level.
 * - low: < 30
 * - medium: 30-70
 * - high: > 70
 */
export function riskLevelFromScore(score: number): FraudRiskLevel {
  if (score >= 70) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

/**
 * Determine the action to take based on risk level.
 * - low → allow
 * - medium → flag (log for review, but allow)
 * - high → block
 */
export function actionFromRiskLevel(level: FraudRiskLevel): FraudAction {
  if (level === 'high') return 'block';
  if (level === 'medium') return 'flag';
  return 'allow';
}

/**
 * Determine the failover policy when the fraud evaluation is unavailable.
 *
 * The policy is event-type-dependent so that low-stakes flows continue
 * while money-movement and account-change events receive a safer default.
 * This follows the fail-open-vs-fail-closed principle: fail open for
 * survivable events, fail closed (step-up / hold) for high-stakes ones.
 *
 * - `signup`      → `step_up`           (account creation: require extra verification)
 * - `listing`     → `allow_low_risk_flow` (can be reviewed post-hoc)
 * - `message`     → `allow_low_risk_flow` (can be reviewed post-hoc)
 * - `transaction` → `hold_for_review`   (money movement: require manual review)
 */
export function failoverPolicyAction(eventType: FraudEventType): FraudPolicyAction {
  if (eventType === 'transaction') return 'hold_for_review';
  if (eventType === 'signup') return 'step_up';
  return 'allow_low_risk_flow';
}

// ---------------------------------------------------------------------------
// Device-to-account tracking
// ---------------------------------------------------------------------------

/**
 * Record a device-to-account association in Redis.
 * Stores a set of account IDs seen for each device fingerprint.
 */
export async function recordDeviceAccountAssociation(
  redis: Redis,
  deviceFingerprint: string,
  userId: string
): Promise<string[]> {
  const key = redisKey('device', deviceFingerprint, 'accounts');
  await redis.sadd(key, userId);
  await redis.expire(key, 90 * 24 * 60 * 60); // 90 days
  const accounts = await redis.smembers(key);
  return accounts;
}

/**
 * Get all account IDs associated with a device fingerprint.
 */
export async function getDeviceAccounts(
  redis: Redis,
  deviceFingerprint: string
): Promise<string[]> {
  const key = redisKey('device', deviceFingerprint, 'accounts');
  return redis.smembers(key);
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

/**
 * Persist a fraud check result to the Redis audit trail.
 * Stores the full result as JSON in a list, keyed by user (or device
 * for anonymous events). Also updates the user's current risk profile
 * — but only when the evaluation completed, so an unavailable result
 * never overwrites a real risk profile with null/unknown.
 */
export async function persistFraudAudit(
  redis: Redis,
  result: FraudCheckResult
): Promise<void> {
  const serialized = JSON.stringify(result);

  // Per-user audit log (or per-device if no userId)
  const logKey = result.userId
    ? redisKey('audit', 'user', result.userId)
    : redisKey('audit', 'device', result.deviceFingerprint);
  await redis.lpush(logKey, serialized);
  await redis.ltrim(logKey, 0, 999); // Keep last 1000 entries
  await redis.expire(logKey, 90 * 24 * 60 * 60);

  // Global audit log (for cross-user pattern analysis)
  const globalKey = redisKey('audit', 'global');
  await redis.lpush(globalKey, serialized);
  await redis.ltrim(globalKey, 0, 9999); // Keep last 10,000
  await redis.expire(globalKey, 30 * 24 * 60 * 60);

  // Update user's current risk profile — only when evaluation completed.
  // An unavailable result is logged to the audit trail for traceability
  // but must not corrupt the user's real risk profile.
  if (result.userId && result.evaluationStatus === 'completed') {
    const profileKey = redisKey('profile', result.userId);
    const profile: FraudUserRiskProfile = {
      userId: result.userId,
      currentScore: result.riskScore,
      riskLevel: result.riskLevel,
      signals: result.signals,
      deviceFingerprints: [result.deviceFingerprint],
      requestEnvironmentHashes: [result.requestEnvironmentHash],
      lastCheckedAt: result.checkedAt,
      eventCount: 1,
    };
    await redis.set(profileKey, JSON.stringify(profile), 'EX', 90 * 24 * 60 * 60);
  }
}

/**
 * Retrieve the audit trail for a user.
 */
export async function getFraudAuditTrail(
  redis: Redis,
  userId: string,
  limit: number = 50
): Promise<FraudCheckResult[]> {
  const logKey = redisKey('audit', 'user', userId);
  const rawEntries = await redis.lrange(logKey, 0, limit - 1);
  return rawEntries.map((entry) => {
    try {
      return JSON.parse(entry) as FraudCheckResult;
    } catch {
      return null;
    }
  }).filter((entry): entry is FraudCheckResult => entry !== null);
}

/**
 * Retrieve the current risk profile for a user.
 */
export async function getUserRiskProfile(
  redis: Redis,
  userId: string
): Promise<FraudUserRiskProfile | null> {
  const profileKey = redisKey('profile', userId);
  const raw = await redis.get(profileKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FraudUserRiskProfile;
  } catch {
    return null;
  }
}

/**
 * Retrieve risk signals for a user (from their latest audit entries).
 */
export async function getUserRiskSignals(
  redis: Redis,
  userId: string
): Promise<FraudSignal[]> {
  const trail = await getFraudAuditTrail(redis, userId, 10);
  if (trail.length === 0) return [];

  // Merge signals from recent checks, deduplicating by ruleId
  const signalMap = new Map<string, FraudSignal>();
  for (const entry of trail) {
    for (const signal of entry.signals) {
      if (!signalMap.has(signal.ruleId)) {
        signalMap.set(signal.ruleId, signal);
      }
    }
  }
  return [...signalMap.values()];
}

// ---------------------------------------------------------------------------
// Main check function
// ---------------------------------------------------------------------------

/**
 * Run a full fraud check for an event.
 *
 * This is the primary entry point. It:
 * 1. Generates a device fingerprint from request headers.
 * 2. Records velocity events in Redis.
 * 3. Evaluates all rules against the context.
 * 4. Computes a risk score and level.
 * 5. Determines the action (allow / flag / block).
 * 6. Persists the result to the audit trail.
 *
 * Returns the full check result with explainable signals.
 */
export async function checkFraud(
  redis: Redis,
  input: FraudCheckInput,
  limits: VelocityLimits = DEFAULT_VELOCITY_LIMITS
): Promise<FraudCheckResult> {
  const { hash: deviceFingerprint, signals: deviceSignals } =
    generateDeviceFingerprint(input.headers, input.ip);

  const effectiveLimits: VelocityLimits = {
    ...limits,
    ...input.velocityOverrides,
  };

  // Record velocity and get current counts
  const velocity = await recordVelocityEvent(
    redis,
    input.eventType,
    deviceFingerprint,
    input.userId ?? null,
    effectiveLimits
  );

  // Track device-to-account association
  if (input.userId) {
    await recordDeviceAccountAssociation(redis, deviceFingerprint, input.userId);
  }

  // Build rule context
  const ctx: RuleContext = {
    eventType: input.eventType,
    userId: input.userId ?? null,
    deviceFingerprint,
    ipAddress: input.ip,
    email: input.email ?? null,
    accountAgeSeconds: input.accountAgeSeconds ?? -1,
    amountGbp: input.amountGbp ?? 0,
    velocity,
    limits: effectiveLimits,
  };

  // Evaluate rules
  let ruleSignals = evaluateRules(ctx);

  // Add behavioral signal: missing or suspiciously short user-agent
  if (!deviceSignals.userAgent || deviceSignals.userAgent.length < 10) {
    ruleSignals.push({
      ruleId: 'behavioral.missing_user_agent',
      description: 'Request has no user-agent or a suspiciously short one',
      weight: 20,
      observedValue: deviceSignals.userAgent || '(empty)',
    });
  }

  // Add signal for device associated with multiple accounts (ban evasion)
  if (input.userId) {
    const associatedAccounts = await getDeviceAccounts(redis, deviceFingerprint);
    if (associatedAccounts.length > 1) {
      const weight = Math.min(40, (associatedAccounts.length - 1) * 15);
      ruleSignals.push({
        ruleId: 'device.multiple_accounts',
        description: `Device fingerprint associated with ${associatedAccounts.length} accounts (possible ban evasion)`,
        weight,
        observedValue: associatedAccounts.length,
      });
    }
  }

  // Compute score
  const riskScore = computeRiskScore(ruleSignals);
  const riskLevel = riskLevelFromScore(riskScore);
  const action = actionFromRiskLevel(riskLevel);

  const result: FraudCheckResult = {
    eventId: `fraud_${crypto.randomUUID()}`,
    eventType: input.eventType,
    userId: input.userId ?? null,
    requestEnvironmentHash: deviceFingerprint,
    deviceFingerprint,
    ipAddress: input.ip,
    evaluationStatus: 'completed',
    riskScore,
    riskLevel,
    action,
    policyAction: null,
    reasonCode: null,
    signals: ruleSignals,
    checkedAt: new Date().toISOString(),
  };

  // Persist to audit trail
  await persistFraudAudit(redis, result);

  return result;
}

/**
 * Non-blocking fraud check wrapper.
 *
 * Runs the fraud check, logs the result, and returns it. Does NOT throw
 * on high risk — the caller decides whether to block. This follows
 * AGENTS.md §6 (proportional) and §11 (truthful) — we don't want false
 * positives disrupting legit users, so the check is advisory by default.
 *
 * If the fraud evaluation itself fails (Redis unavailable, timeout,
 * unexpected exception), the result honestly reports that no evaluation
 * completed: `evaluationStatus: 'unavailable'`, `riskScore: null`,
 * `riskLevel: 'unknown'`. The `policyAction` field carries an
 * event-type-dependent failover decision so callers can step up or
 * hold high-stakes events without mistaking the unavailable state for
 * a clean low-risk assessment.
 *
 * Shadow scoring (Phase 6): when a `FraudShadowScoringService` is supplied
 * and `FRAUD_SHADOW_ENABLED=true`, the rule-engine result is also scored
 * by the shadow ML model and both scores are logged to
 * `fraud_scoring_ledger` for offline comparison. The shadow score NEVER
 * affects the user-facing result — the rule engine remains the champion
 * until the shadow model is promoted via the model artifact registry.
 * The shadow call is non-blocking and best-effort: if it fails, the rule
 * engine result stands unchanged.
 */
export async function checkFraudNonBlocking(
  redis: Redis,
  input: FraudCheckInput,
  limits: VelocityLimits = DEFAULT_VELOCITY_LIMITS,
  logger?: { warn?: (obj: unknown, msg: string) => void; info?: (obj: unknown, msg: string) => void },
  shadowService?: {
    scoreShadow(input: unknown): Promise<unknown>;
    logScoreComparison(
      eventId: string,
      eventType: FraudEventType,
      userId: string | null,
      ruleEngineResult: FraudCheckResult,
      shadowResult: unknown,
      input: unknown,
    ): Promise<void>;
  } | null,
): Promise<FraudCheckResult> {
  try {
    const result = await checkFraud(redis, input, limits);
    if (result.riskLevel === 'high' && logger?.warn) {
      logger.warn(
        {
          eventId: result.eventId,
          eventType: result.eventType,
          userId: result.userId,
          riskScore: result.riskScore,
          signals: result.signals.map((s) => s.ruleId),
        },
        'Fraud check flagged high-risk event'
      );
    } else if (result.riskLevel === 'medium' && logger?.info) {
      logger.info(
        {
          eventId: result.eventId,
          eventType: result.eventType,
          userId: result.userId,
          riskScore: result.riskScore,
        },
        'Fraud check flagged medium-risk event'
      );
    }

    // Shadow scoring (Phase 6): best-effort, non-blocking, never affects
    // the served decision. The rule engine result is already final.
    if (shadowService) {
      try {
        const shadowInput = {
          eventId: result.eventId,
          eventType: result.eventType,
          userId: result.userId,
          ruleEngineScore: result.riskScore,
          riskLevel: result.riskLevel,
          action: result.action,
          signals: result.signals,
          velocity: extractVelocityFromResult(result),
          accountAgeSeconds: input.accountAgeSeconds ?? -1,
          amountGbp: input.amountGbp ?? 0,
          deviceMultipleAccounts: extractDeviceAccountCount(result),
        };
        const shadowResult = await shadowService.scoreShadow(shadowInput);
        await shadowService.logScoreComparison(
          result.eventId,
          result.eventType,
          result.userId,
          result,
          shadowResult,
          shadowInput,
        );
      } catch (shadowError) {
        // Shadow scoring is best-effort — log and continue. The rule
        // engine result is already returned to the caller.
        if (logger?.warn) {
          logger.warn(
            { err: shadowError, eventId: result.eventId },
            'Fraud shadow scoring failed — rule engine result stands',
          );
        }
      }
    }

    return result;
  } catch (error) {
    // The fraud evaluation could not complete. We must NOT fabricate a
    // low-risk score — that would be a truthful-contract violation
    // (AGENTS.md §11). Instead we report the unavailable state honestly
    // and let the caller act on `policyAction`.
    const policyAction = failoverPolicyAction(input.eventType);
    if (logger?.warn) {
      logger.warn(
        {
          err: error,
          eventType: input.eventType,
          userId: input.userId ?? null,
          policyAction,
          reasonCode: 'fraud_service_unavailable',
        },
        'Fraud check unavailable — applying failover policy'
      );
    }
    const unavailableResult: FraudCheckResult = {
      eventId: `fraud_err_${crypto.randomUUID()}`,
      eventType: input.eventType,
      userId: input.userId ?? null,
      requestEnvironmentHash: '',
      deviceFingerprint: '',
      ipAddress: input.ip,
      evaluationStatus: 'unavailable',
      riskScore: null,
      riskLevel: 'unknown',
      action: null,
      policyAction,
      reasonCode: 'fraud_service_unavailable',
      signals: [],
      checkedAt: new Date().toISOString(),
    };
    // Persist the unavailable result to the audit trail for traceability.
    // persistFraudAudit will log it but will NOT overwrite the user's
    // real risk profile with null/unknown.
    try {
      await persistFraudAudit(redis, unavailableResult);
    } catch {
      // If even the audit trail is unreachable, there is nothing more to
      // do here — the result is already returned to the caller.
    }

    // Log the unavailable result to the shadow ledger too, so the ledger
    // captures every fraud check even when the rule engine was down.
    if (shadowService) {
      try {
        const shadowInput = {
          eventId: unavailableResult.eventId,
          eventType: unavailableResult.eventType,
          userId: unavailableResult.userId,
          ruleEngineScore: null,
          riskLevel: 'unknown' as FraudRiskLevel,
          action: null,
          signals: [],
          velocity: { accountCreation: 0, listingCreation: 0, message: 0, loginAttempt: 0 },
          accountAgeSeconds: input.accountAgeSeconds ?? -1,
          amountGbp: input.amountGbp ?? 0,
          deviceMultipleAccounts: 0,
        };
        const shadowResult = await shadowService.scoreShadow(shadowInput);
        await shadowService.logScoreComparison(
          unavailableResult.eventId,
          unavailableResult.eventType,
          unavailableResult.userId,
          unavailableResult,
          shadowResult,
          shadowInput,
        );
      } catch {
        // Shadow logging is best-effort — the unavailable result stands.
      }
    }

    return unavailableResult;
  }
}

/**
 * Extract velocity counts from the rule-engine result signals.
 * The signals carry the observed values; we reconstruct the counts for
 * the shadow feature vector.
 */
function extractVelocityFromResult(result: FraudCheckResult): VelocityCounts {
  const counts: VelocityCounts = {
    accountCreation: 0,
    listingCreation: 0,
    message: 0,
    loginAttempt: 0,
  };
  for (const signal of result.signals) {
    if (signal.ruleId === 'velocity.account_creation') {
      counts.accountCreation = Number(signal.observedValue) || 0;
    } else if (signal.ruleId === 'velocity.listing_creation') {
      counts.listingCreation = Number(signal.observedValue) || 0;
    } else if (signal.ruleId === 'velocity.message') {
      counts.message = Number(signal.observedValue) || 0;
    } else if (signal.ruleId === 'velocity.login_attempt') {
      counts.loginAttempt = Number(signal.observedValue) || 0;
    }
  }
  return counts;
}

/**
 * Extract the device-multiple-accounts count from the rule-engine signals.
 */
function extractDeviceAccountCount(result: FraudCheckResult): number {
  const signal = result.signals.find((s) => s.ruleId === 'device.multiple_accounts');
  return signal ? Number(signal.observedValue) || 0 : 0;
}

// ---------------------------------------------------------------------------
// Fraud report (user-facing)
// ---------------------------------------------------------------------------

export interface FraudReportInput {
  reporterUserId: string;
  reportedUserId: string;
  eventType: FraudEventType;
  reason: string;
  details?: string;
  referenceId?: string;
}

export interface FraudReportResult {
  reportId: string;
  status: 'submitted';
  createdAt: string;
}

/**
 * Record a user-submitted fraud report in Redis for moderator review.
 */
export async function submitFraudReport(
  redis: Redis,
  input: FraudReportInput
): Promise<FraudReportResult> {
  const reportId = `fraud_report_${crypto.randomUUID()}`;
  const report = {
    reportId,
    reporterUserId: input.reporterUserId,
    reportedUserId: input.reportedUserId,
    eventType: input.eventType,
    reason: input.reason,
    details: input.details ?? null,
    referenceId: input.referenceId ?? null,
    status: 'submitted',
    createdAt: new Date().toISOString(),
  };

  const key = redisKey('reports', 'pending');
  await redis.lpush(key, JSON.stringify(report));
  await redis.expire(key, 180 * 24 * 60 * 60); // 180 days

  // Also store by reported user for lookup
  const userKey = redisKey('reports', 'user', input.reportedUserId);
  await redis.lpush(userKey, JSON.stringify(report));
  await redis.expire(userKey, 180 * 24 * 60 * 60);

  return {
    reportId,
    status: 'submitted',
    createdAt: report.createdAt,
  };
}
