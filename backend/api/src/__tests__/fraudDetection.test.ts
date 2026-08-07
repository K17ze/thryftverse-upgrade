import assert from 'node:assert/strict';
import test from 'node:test';

import {
  generateDeviceFingerprint,
  extractDeviceSignals,
  computeRiskScore,
  riskLevelFromScore,
  actionFromRiskLevel,
  evaluateRules,
  DEFAULT_VELOCITY_LIMITS,
  type FraudSignal,
  type VelocityCounts,
  type VelocityLimits,
} from '../lib/fraudDetection.js';

// ---------------------------------------------------------------------------
// Device fingerprint generation
// ---------------------------------------------------------------------------

test('generateDeviceFingerprint produces a stable SHA-256 hash', () => {
  const headers = {
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    'accept-language': 'en-US,en;q=0.9',
    'accept-encoding': 'gzip, deflate, br',
    'accept': 'application/json',
    'sec-ch-ua': '"Chromium";v="120"',
    'sec-ch-ua-platform': '"iOS"',
    'sec-ch-ua-mobile': '?1',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'dnt': '1',
  };

  const fp1 = generateDeviceFingerprint(headers, '192.168.1.100');
  const fp2 = generateDeviceFingerprint(headers, '192.168.1.100');

  assert.equal(fp1.hash, fp2.hash, 'Same headers + IP must produce the same fingerprint');
  assert.equal(fp1.hash.length, 64, 'Fingerprint must be a 64-char hex SHA-256 hash');
  assert.match(fp1.hash, /^[0-9a-f]{64}$/, 'Fingerprint must be valid hex');
});

test('generateDeviceFingerprint produces different hashes for different devices', () => {
  const baseHeaders = {
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    'accept-language': 'en-US,en;q=0.9',
    'accept-encoding': 'gzip, deflate, br',
    'accept': 'application/json',
    'sec-ch-ua': '"Chromium";v="120"',
    'sec-ch-ua-platform': '"iOS"',
    'sec-ch-ua-mobile': '?1',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'dnt': '1',
  };

  const fp1 = generateDeviceFingerprint(baseHeaders, '192.168.1.100');
  const fp2 = generateDeviceFingerprint(
    { ...baseHeaders, 'user-agent': 'Mozilla/5.0 (Android 14; Pixel 8)' },
    '192.168.1.100',
  );
  const fp3 = generateDeviceFingerprint(baseHeaders, '10.0.0.50');

  assert.notEqual(fp1.hash, fp2.hash, 'Different user-agents must produce different fingerprints');
  assert.notEqual(fp1.hash, fp3.hash, 'Different IPs must produce different fingerprints');
});

test('generateDeviceFingerprint normalises IPv4 to /24 prefix', () => {
  const headers = { 'user-agent': 'TestAgent/1.0' };

  // 192.168.1.100 and 192.168.1.200 should produce the same fingerprint
  // because they're in the same /24 subnet.
  const fp1 = generateDeviceFingerprint(headers, '192.168.1.100');
  const fp2 = generateDeviceFingerprint(headers, '192.168.1.200');
  const fp3 = generateDeviceFingerprint(headers, '192.168.2.100');

  assert.equal(fp1.hash, fp2.hash, 'Same /24 subnet should produce the same fingerprint');
  assert.notEqual(fp1.hash, fp3.hash, 'Different /24 subnets should produce different fingerprints');
});

test('extractDeviceSignals normalises header names case-insensitively', () => {
  const signals = extractDeviceSignals(
    {
      'User-Agent': 'TestAgent/1.0',
      'Accept-Language': 'en-US',
      'ACCEPT-ENCODING': 'gzip',
    },
    '127.0.0.1',
  );

  assert.equal(signals.userAgent, 'TestAgent/1.0');
  assert.equal(signals.acceptLanguage, 'en-US');
  assert.equal(signals.acceptEncoding, 'gzip');
  assert.equal(signals.ip, '127.0.0.1');
});

test('extractDeviceSignals handles array-valued headers', () => {
  const signals = extractDeviceSignals(
    {
      'user-agent': ['FirstAgent/1.0', 'SecondAgent/2.0'],
    },
    '127.0.0.1',
  );

  assert.equal(signals.userAgent, 'FirstAgent/1.0', 'Should use the first value of array headers');
});

// ---------------------------------------------------------------------------
// Risk scoring thresholds
// ---------------------------------------------------------------------------

test('computeRiskScore sums signal weights and caps at 100', () => {
  const signals: FraudSignal[] = [
    { ruleId: 'a', description: 'a', weight: 20, observedValue: 1 },
    { ruleId: 'b', description: 'b', weight: 30, observedValue: 2 },
  ];
  assert.equal(computeRiskScore(signals), 50);

  const highSignals: FraudSignal[] = [
    { ruleId: 'a', description: 'a', weight: 60, observedValue: 1 },
    { ruleId: 'b', description: 'b', weight: 60, observedValue: 2 },
  ];
  assert.equal(computeRiskScore(highSignals), 100, 'Score must cap at 100');
});

test('computeRiskScore returns 0 for empty signals', () => {
  assert.equal(computeRiskScore([]), 0);
});

test('riskLevelFromScore maps thresholds correctly', () => {
  assert.equal(riskLevelFromScore(0), 'low');
  assert.equal(riskLevelFromScore(29), 'low');
  assert.equal(riskLevelFromScore(30), 'medium');
  assert.equal(riskLevelFromScore(50), 'medium');
  assert.equal(riskLevelFromScore(70), 'high');
  assert.equal(riskLevelFromScore(100), 'high');
});

test('actionFromRiskLevel maps correctly', () => {
  assert.equal(actionFromRiskLevel('low'), 'allow');
  assert.equal(actionFromRiskLevel('medium'), 'flag');
  assert.equal(actionFromRiskLevel('high'), 'block');
});

// ---------------------------------------------------------------------------
// Rule engine combinations
// ---------------------------------------------------------------------------

function makeVelocityCounts(overrides: Partial<VelocityCounts> = {}): VelocityCounts {
  return {
    accountCreation: 0,
    listingCreation: 0,
    message: 0,
    loginAttempt: 0,
    ...overrides,
  };
}

function makeRuleContext(overrides: Partial<{
  eventType: string;
  userId: string | null;
  deviceFingerprint: string;
  ipAddress: string;
  email: string | null;
  accountAgeSeconds: number;
  amountGbp: number;
  velocity: VelocityCounts;
  limits: VelocityLimits;
}> = {}) {
  return {
    eventType: (overrides.eventType ?? 'signup') as 'signup' | 'listing' | 'message' | 'transaction',
    userId: overrides.userId ?? 'usr_test123',
    deviceFingerprint: overrides.deviceFingerprint ?? 'abc123',
    ipAddress: overrides.ipAddress ?? '192.168.1.1',
    email: overrides.email ?? null,
    accountAgeSeconds: overrides.accountAgeSeconds ?? 999_999,
    amountGbp: overrides.amountGbp ?? 0,
    velocity: overrides.velocity ?? makeVelocityCounts(),
    limits: overrides.limits ?? DEFAULT_VELOCITY_LIMITS,
  };
}

test('rule engine: no signals for a clean event', () => {
  const ctx = makeRuleContext({
    eventType: 'listing',
    accountAgeSeconds: 999_999,
    velocity: makeVelocityCounts({ listingCreation: 1 }),
  });
  const signals = evaluateRules(ctx);
  assert.equal(signals.length, 0, 'A clean event should produce no signals');
});

test('rule engine: account creation velocity triggers signal', () => {
  const ctx = makeRuleContext({
    eventType: 'signup',
    velocity: makeVelocityCounts({ accountCreation: 5 }),
  });
  const signals = evaluateRules(ctx);
  const velocitySignal = signals.find((s) => s.ruleId === 'velocity.account_creation');
  assert.ok(velocitySignal, 'Should detect account creation velocity');
  assert.ok(velocitySignal!.weight > 0, 'Velocity signal should have positive weight');
  assert.equal(velocitySignal!.observedValue, 5);
});

test('rule engine: listing velocity triggers signal only for listing events', () => {
  // Listing event with high velocity
  const listingCtx = makeRuleContext({
    eventType: 'listing',
    velocity: makeVelocityCounts({ listingCreation: 25 }),
  });
  const listingSignals = evaluateRules(listingCtx);
  assert.ok(
    listingSignals.some((s) => s.ruleId === 'velocity.listing_creation'),
    'Listing event with high velocity should trigger listing velocity signal',
  );

  // Message event should NOT trigger listing velocity even if count is high
  const messageCtx = makeRuleContext({
    eventType: 'message',
    velocity: makeVelocityCounts({ listingCreation: 25 }),
  });
  const messageSignals = evaluateRules(messageCtx);
  assert.ok(
    !messageSignals.some((s) => s.ruleId === 'velocity.listing_creation'),
    'Non-listing event should not trigger listing velocity signal',
  );
});

test('rule engine: message velocity triggers signal only for message events', () => {
  const ctx = makeRuleContext({
    eventType: 'message',
    velocity: makeVelocityCounts({ message: 60 }),
  });
  const signals = evaluateRules(ctx);
  assert.ok(
    signals.some((s) => s.ruleId === 'velocity.message'),
    'Message event with high velocity should trigger message velocity signal',
  );
});

test('rule engine: disposable email domain triggers signal', () => {
  const ctx = makeRuleContext({
    eventType: 'signup',
    email: 'spam@mailinator.com',
  });
  const signals = evaluateRules(ctx);
  assert.ok(
    signals.some((s) => s.ruleId === 'email.disposable_domain'),
    'Disposable email domain should trigger signal',
  );
});

test('rule engine: legitimate email domain does not trigger disposable signal', () => {
  const ctx = makeRuleContext({
    eventType: 'signup',
    email: 'user@gmail.com',
  });
  const signals = evaluateRules(ctx);
  assert.ok(
    !signals.some((s) => s.ruleId === 'email.disposable_domain'),
    'Legitimate email domain should not trigger disposable signal',
  );
});

test('rule engine: new account triggers signal for non-signup events', () => {
  const ctx = makeRuleContext({
    eventType: 'listing',
    accountAgeSeconds: 1800, // 30 minutes old
  });
  const signals = evaluateRules(ctx);
  assert.ok(
    signals.some((s) => s.ruleId === 'account.age.new'),
    'Account less than 1 hour old should trigger new account signal',
  );
});

test('rule engine: new account signal is not triggered for signup events', () => {
  const ctx = makeRuleContext({
    eventType: 'signup',
    accountAgeSeconds: 0,
  });
  const signals = evaluateRules(ctx);
  assert.ok(
    !signals.some((s) => s.ruleId === 'account.age.new'),
    'Signup events should not trigger new account signal',
  );
});

test('rule engine: high-value transaction from new account triggers signal', () => {
  const ctx = makeRuleContext({
    eventType: 'transaction',
    accountAgeSeconds: 3600, // 1 hour old
    amountGbp: 750,
  });
  const signals = evaluateRules(ctx);
  assert.ok(
    signals.some((s) => s.ruleId === 'transaction.high_value_new_account'),
    'High-value transaction from new account should trigger signal',
  );
});

test('rule engine: high-value transaction from established account does not trigger signal', () => {
  const ctx = makeRuleContext({
    eventType: 'transaction',
    accountAgeSeconds: 999_999, // Very old account
    amountGbp: 750,
  });
  const signals = evaluateRules(ctx);
  assert.ok(
    !signals.some((s) => s.ruleId === 'transaction.high_value_new_account'),
    'High-value transaction from established account should not trigger signal',
  );
});

test('rule engine: multiple signals combine into higher score', () => {
  // A signup with disposable email AND high account creation velocity
  const ctx = makeRuleContext({
    eventType: 'signup',
    email: 'spam@tempmail.com',
    velocity: makeVelocityCounts({ accountCreation: 5, loginAttempt: 12 }),
  });
  const signals = evaluateRules(ctx);

  const disposableSignal = signals.find((s) => s.ruleId === 'email.disposable_domain');
  const velocitySignal = signals.find((s) => s.ruleId === 'velocity.account_creation');
  const loginSignal = signals.find((s) => s.ruleId === 'velocity.login_attempt');

  assert.ok(disposableSignal, 'Should have disposable email signal');
  assert.ok(velocitySignal, 'Should have account creation velocity signal');
  assert.ok(loginSignal, 'Should have login velocity signal');

  const score = computeRiskScore(signals);
  assert.ok(score > 50, 'Combined signals should produce a high score');
  assert.equal(riskLevelFromScore(score), 'high', 'Combined fraud signals should be high risk');
});

test('rule engine: velocity weight scales with excess', () => {
  // Slightly over limit
  const ctx1 = makeRuleContext({
    eventType: 'signup',
    velocity: makeVelocityCounts({ accountCreation: 4 }), // limit is 3
  });
  const signals1 = evaluateRules(ctx1);
  const weight1 = signals1.find((s) => s.ruleId === 'velocity.account_creation')?.weight ?? 0;

  // Way over limit
  const ctx2 = makeRuleContext({
    eventType: 'signup',
    velocity: makeVelocityCounts({ accountCreation: 10 }),
  });
  const signals2 = evaluateRules(ctx2);
  const weight2 = signals2.find((s) => s.ruleId === 'velocity.account_creation')?.weight ?? 0;

  assert.ok(weight2 > weight1, 'Higher velocity excess should produce higher weight');
});

test('rule engine: login velocity triggers for any event type', () => {
  const ctx = makeRuleContext({
    eventType: 'listing',
    velocity: makeVelocityCounts({ loginAttempt: 15 }),
  });
  const signals = evaluateRules(ctx);
  assert.ok(
    signals.some((s) => s.ruleId === 'velocity.login_attempt'),
    'Login velocity should trigger regardless of event type',
  );
});

test('rule engine: clean established account produces low risk', () => {
  const ctx = makeRuleContext({
    eventType: 'listing',
    accountAgeSeconds: 999_999,
    email: 'user@gmail.com',
    velocity: makeVelocityCounts({ listingCreation: 5 }),
  });
  const signals = evaluateRules(ctx);
  const score = computeRiskScore(signals);
  assert.equal(score, 0, 'Clean established account should have zero risk score');
  assert.equal(riskLevelFromScore(score), 'low');
});

test('DEFAULT_VELOCITY_LIMITS has sensible values', () => {
  assert.ok(DEFAULT_VELOCITY_LIMITS.accountCreationMax > 0);
  assert.ok(DEFAULT_VELOCITY_LIMITS.listingCreationMax > 0);
  assert.ok(DEFAULT_VELOCITY_LIMITS.messageMax > 0);
  assert.ok(DEFAULT_VELOCITY_LIMITS.loginAttemptMax > 0);
  assert.ok(DEFAULT_VELOCITY_LIMITS.windowSeconds >= 60);
});
