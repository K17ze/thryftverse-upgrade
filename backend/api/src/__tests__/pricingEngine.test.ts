import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateAtParPricing,
  validatePricingProfileInput,
  PLATFORM_LOAD_FEE_BPS,
  PLATFORM_WITHDRAW_FEE_BPS,
} from '../lib/pricingEngine.js';

test('at-par invariant: 1 1ZE principal = $1 (100 1ZE = $1.00)', () => {
  const result = calculateAtParPricing({ anchorValue: 100, fxRate: 1, feeBps: 0 });
  assert.equal(result.principalAmount, 100);
});

test('at-par invariant: principal never changes with platform fee', () => {
  const noFee = calculateAtParPricing({ anchorValue: 100, fxRate: 1, feeBps: 0 });
  const withFee = calculateAtParPricing({ anchorValue: 100, fxRate: 1, feeBps: 200 });
  assert.equal(noFee.principalAmount, withFee.principalAmount);
});

test('at-par invariant: fee cannot change liability face value', () => {
  const result = calculateAtParPricing({ anchorValue: 100, fxRate: 1, feeBps: 200 });
  assert.equal(result.principalAmount, 100);
  assert.equal(result.feeAmount, 2);
  assert.equal(result.totalCost, 102);
  assert.equal(result.netRedemption, 98);
});

test('at-par invariant: USD/local FX transformation is reversible within rounding tolerance', () => {
  const usdToGbp = calculateAtParPricing({ anchorValue: 100, fxRate: 0.79, feeBps: 0 });
  const gbpToUsd = calculateAtParPricing({
    anchorValue: usdToGbp.principalAmount,
    fxRate: 1 / 0.79,
    feeBps: 0,
  });
  assert.ok(
    Math.abs(gbpToUsd.principalAmount - 100) < 0.01,
    'Round-trip FX conversion should preserve principal within rounding tolerance'
  );
});

test('at-par invariant: minted principal == safeguarded liability', () => {
  // The principal amount is what gets minted. The fee is revenue.
  // Total safeguarded = principal (not totalCost, because fee is platform revenue)
  const result = calculateAtParPricing({ anchorValue: 100, fxRate: 1, feeBps: 200 });
  assert.equal(result.principalAmount, 100);  // this is what's minted and safeguarded
  assert.equal(result.feeAmount, 2);          // this is platform revenue, not safeguarded
});

test('at-par invariant: burn reduces outstanding liability exactly by principal', () => {
  const result = calculateAtParPricing({ anchorValue: 100, fxRate: 1, feeBps: 200 });
  // On redemption: burn 100 1ZE (principal), fee = 2, user gets 98
  // Outstanding liability reduced by 100 (the principal), not 98 or 102
  assert.equal(result.principalAmount, 100);
  assert.equal(result.netRedemption, 98);
});

test('at-par invariant: platform fee is within bounds (100-300 bps)', () => {
  assert.ok(PLATFORM_LOAD_FEE_BPS >= 100, 'PLATFORM_LOAD_FEE_BPS must be >= 100');
  assert.ok(PLATFORM_LOAD_FEE_BPS <= 300, 'PLATFORM_LOAD_FEE_BPS must be <= 300');
  assert.ok(PLATFORM_WITHDRAW_FEE_BPS >= 100, 'PLATFORM_WITHDRAW_FEE_BPS must be >= 100');
  assert.ok(PLATFORM_WITHDRAW_FEE_BPS <= 300, 'PLATFORM_WITHDRAW_FEE_BPS must be <= 300');
});

test('at-par invariant: load direction uses loadFeeBps when provided', () => {
  const result = calculateAtParPricing({
    anchorValue: 100,
    fxRate: 1,
    feeBps: 999,
    direction: 'load',
    loadFeeBps: 200,
  });
  assert.equal(result.feeBps, 200);
  assert.equal(result.feeAmount, 2);
  assert.equal(result.totalCost, 102);
});

test('at-par invariant: withdraw direction uses withdrawFeeBps when provided', () => {
  const result = calculateAtParPricing({
    anchorValue: 100,
    fxRate: 1,
    feeBps: 999,
    direction: 'withdraw',
    withdrawFeeBps: 150,
  });
  assert.equal(result.feeBps, 150);
  assert.equal(result.feeAmount, 1.5);
  assert.equal(result.netRedemption, 98.5);
});

test('at-par invariant: validatePricingProfileInput accepts valid fee bounds', () => {
  validatePricingProfileInput({
    platformFeeBps: 200,
    loadFeeBps: 200,
    withdrawFeeBps: 200,
  });
});

test('at-par invariant: validatePricingProfileInput rejects out-of-bound fees', () => {
  assert.throws(
    () => {
      validatePricingProfileInput({
        platformFeeBps: 50,
        loadFeeBps: 200,
        withdrawFeeBps: 200,
      });
    },
    {
      message: /platformFeeBps/,
    }
  );

  assert.throws(
    () => {
      validatePricingProfileInput({
        platformFeeBps: 200,
        loadFeeBps: 500,
        withdrawFeeBps: 200,
      });
    },
    {
      message: /loadFeeBps/,
    }
  );
});
