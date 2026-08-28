import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateAtParPricing,
  PLATFORM_LOAD_FEE_BPS,
  PLATFORM_WITHDRAW_FEE_BPS,
} from '../lib/pricingEngine.js';

test('at-par cross-country simulation: principal is FX-convertible and fee-transparent', () => {
  // Simulate two countries with different FX rates.
  // At-par model: 1 1ZE = $1.00 USD. The principal is anchor * fxRate.
  // The fee is transparent and does not affect the principal.
  const inrQuote = calculateAtParPricing({
    anchorValue: 100,
    fxRate: 83,
    feeBps: PLATFORM_LOAD_FEE_BPS,
    direction: 'load',
    loadFeeBps: PLATFORM_LOAD_FEE_BPS,
  });
  const gbpQuote = calculateAtParPricing({
    anchorValue: 100,
    fxRate: 0.79,
    feeBps: PLATFORM_LOAD_FEE_BPS,
    direction: 'load',
    loadFeeBps: PLATFORM_LOAD_FEE_BPS,
  });

  // Principal is deterministic from anchor * fxRate
  assert.equal(inrQuote.principalAmount, 8300);
  assert.equal(gbpQuote.principalAmount, 79);

  // Fee is always principal * feeBps / 10000
  assert.equal(inrQuote.feeAmount, 166);
  assert.equal(gbpQuote.feeAmount, 1.58);

  // Total cost = principal + fee (what the user pays to load)
  assert.equal(inrQuote.totalCost, 8466);
  assert.equal(gbpQuote.totalCost, 80.58);
});

test('at-par FX fluctuation simulation: principal tracks FX rate, fee is proportional', () => {
  const fxScenarios = [0.0095, 0.0105, 0.011, 0.012, 0.0135];

  for (const gbpFx of fxScenarios) {
    const quote = calculateAtParPricing({
      anchorValue: 100,
      fxRate: gbpFx,
      feeBps: PLATFORM_LOAD_FEE_BPS,
      direction: 'load',
      loadFeeBps: PLATFORM_LOAD_FEE_BPS,
    });

    // Principal = anchor * fxRate (at-par, no markup/markdown distortion)
    const expectedPrincipal = Math.round(gbpFx * 100 * 1e6) / 1e6;
    assert.equal(
      quote.principalAmount,
      expectedPrincipal,
      `Principal should equal anchor * fxRate for FX=${gbpFx}`
    );

    // Fee is always exactly principal * feeBps / 10000
    const expectedFee = Math.round(expectedPrincipal * (PLATFORM_LOAD_FEE_BPS / 10_000) * 1e6) / 1e6;
    assert.equal(
      quote.feeAmount,
      expectedFee,
      `Fee should be proportional to principal for FX=${gbpFx}`
    );

    // Total cost = principal + fee
    assert.equal(
      quote.totalCost,
      Math.round((expectedPrincipal + expectedFee) * 1e6) / 1e6,
      `Total cost should equal principal + fee for FX=${gbpFx}`
    );
  }
});

test('at-par mass withdrawal stress simulation: principal is preserved at scale', () => {
  // Use anchorValue=1 so principalAmount=1 (1 1ZE = $1 at par)
  const quote = calculateAtParPricing({
    anchorValue: 1,
    fxRate: 1,
    feeBps: PLATFORM_WITHDRAW_FEE_BPS,
    direction: 'withdraw',
    withdrawFeeBps: PLATFORM_WITHDRAW_FEE_BPS,
  });

  const mintedIze = 125_000;
  const redeemedIze = 82_500;

  // At-par: each 1ZE redeems at principal minus withdraw fee
  const grossRedemption = redeemedIze * quote.principalAmount;
  const feeDeducted = redeemedIze * quote.feeAmount;
  const netRedemptionTotal = grossRedemption - feeDeducted;

  // The outstanding liability reduced by redemption is exactly the principal
  assert.equal(
    redeemedIze * quote.principalAmount,
    82_500,
    'Liability reduction equals principal times units redeemed'
  );

  // Net redemption is positive (user always gets value back)
  assert.ok(netRedemptionTotal > 0, 'Net redemption should be positive under stress');

  // Fee revenue is proportional, not spread-based
  assert.equal(
    feeDeducted,
    redeemedIze * 0.02,
    'Fee deducted should be exactly withdrawFeeBps * principal per unit'
  );
});

test('at-par invariant: no arbitrage is possible because all countries use the same anchor', () => {
  // In the at-par model, 1 1ZE = $1.00 USD everywhere.
  // FX rates convert the local currency equivalent, but the principal
  // (the 1ZE amount) is identical across countries. There is no
  // markup/markdown/PPP spread to exploit.
  const countries = [
    { code: 'IN', fxRate: 83 },
    { code: 'GB', fxRate: 0.79 },
    { code: 'US', fxRate: 1 },
    { code: 'KE', fxRate: 129 },
  ];

  const principals = countries.map((c) =>
    calculateAtParPricing({
      anchorValue: 100,
      fxRate: c.fxRate,
      feeBps: 0,
    }).principalAmount
  );

  // Converting any country's principal back to USD yields the same anchor value
  for (let i = 0; i < countries.length; i++) {
    const backToUsd = principals[i] / countries[i].fxRate;
    assert.ok(
      Math.abs(backToUsd - 100) < 0.01,
      `Country ${countries[i].code}: round-trip to USD should preserve anchor value`
    );
  }
});
