import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveCountryCapabilities } from '../lib/countryCapabilities.js';

process.env.NODE_ENV ??= 'test';
process.env.STRIPE_SECRET_KEY ??= 'test-stripe-secret';
process.env.RAZORPAY_KEY_ID ??= 'test-razorpay-key-id';
process.env.RAZORPAY_KEY_SECRET ??= 'test-razorpay-key-secret';
process.env.MOLLIE_API_KEY ??= 'test-mollie-api-key';
process.env.FLUTTERWAVE_SECRET_KEY ??= 'test-flutterwave-secret-key';
process.env.TAP_SECRET_KEY ??= 'test-tap-secret-key';
process.env.WISE_API_KEY ??= 'test-wise-api-key';

test('resolveCountryCapabilities maps target countries to expected clusters and defaults', () => {
  const testCases = [
    {
      countryCode: 'IN',
      expectedCluster: 'IN',
      expectedCurrency: 'INR',
      expectedPrimaryGateway: 'razorpay_in',
    },
    {
      countryCode: 'US',
      expectedCluster: 'US',
      expectedCurrency: 'USD',
      expectedPrimaryGateway: 'stripe_americas',
    },
    {
      countryCode: 'GB',
      expectedCluster: 'UK',
      expectedCurrency: 'GBP',
      expectedPrimaryGateway: 'stripe_americas',
    },
    {
      countryCode: 'FR',
      expectedCluster: 'EUROPE',
      expectedCurrency: 'EUR',
      expectedPrimaryGateway: 'mollie_eu',
    },
    {
      countryCode: 'AE',
      expectedCluster: 'MIDDLE_EAST',
      expectedCurrency: 'AED',
      expectedPrimaryGateway: 'tap_gulf',
    },
    {
      countryCode: 'CN',
      expectedCluster: 'CHINA_NEARBY',
      expectedCurrency: 'USD',
      expectedPrimaryGateway: 'stripe_americas',
    },
  ] as const;

  for (const testCase of testCases) {
    const capabilities = resolveCountryCapabilities({ countryCode: testCase.countryCode });

    assert.equal(capabilities.countryCluster, testCase.expectedCluster, `cluster mismatch for ${testCase.countryCode}`);
    assert.equal(capabilities.currency.defaultCurrency, testCase.expectedCurrency, `default currency mismatch for ${testCase.countryCode}`);
    assert.ok(
      capabilities.payments.gatewaysByChannel.commerce.includes(testCase.expectedPrimaryGateway),
      `commerce gateways missing ${testCase.expectedPrimaryGateway} for ${testCase.countryCode}`
    );
    assert.ok(capabilities.postage.carriers.length > 0, `no postage carriers for ${testCase.countryCode}`);
    assert.ok(capabilities.jurisdictionGroups.includes('GLOBAL'), `missing GLOBAL jurisdiction for ${testCase.countryCode}`);
  }
});

test('resolveCountryCapabilities prefers residency country when present', () => {
  const capabilities = resolveCountryCapabilities({
    countryCode: 'US',
    residencyCountryCode: 'IN',
  });

  assert.equal(capabilities.effectiveCountryCode, 'IN');
  assert.equal(capabilities.countryCluster, 'IN');
  assert.equal(capabilities.currency.defaultCurrency, 'INR');
  assert.ok(capabilities.jurisdictionGroups.includes('IN'));
});

test('resolveCountryCapabilities falls back to GLOBAL template for non-target countries', () => {
  const capabilities = resolveCountryCapabilities({ countryCode: 'BR' });

  assert.equal(capabilities.countryCluster, 'GLOBAL');
  assert.equal(capabilities.currency.defaultCurrency, 'USD');
  assert.deepEqual(capabilities.postage.carriers, []);
  assert.deepEqual(capabilities.payments.gatewaysByChannel.commerce, ['stripe_americas']);
  assert.deepEqual(capabilities.payouts.gatewayPriority, ['stripe_americas', 'mollie_eu', 'wise_global']);
});

test('resolveCountryCapabilities applies channel and payment policy nuances by cluster', () => {
  const middleEast = resolveCountryCapabilities({ countryCode: 'AE' });
  assert.ok(middleEast.payments.gatewaysByChannel.wallet_withdrawal.includes('tap_gulf'));
  assert.ok(middleEast.payments.methodTypes.includes('bank_account'));

  const chinaNearby = resolveCountryCapabilities({ countryCode: 'CN' });
  assert.equal(chinaNearby.payments.stableCoinEnabled, false);
  assert.equal(chinaNearby.payments.methodTypes.includes('bank_account'), false);
  assert.deepEqual(chinaNearby.payments.gatewaysByChannel['co-own'], ['stripe_americas']);
});

test('resolveCountryCapabilities normalizes invalid country input via compliance fallback', () => {
  const capabilities = resolveCountryCapabilities({ countryCode: '   ' });

  assert.equal(capabilities.countryCode, 'GB');
  assert.equal(capabilities.effectiveCountryCode, 'GB');
  assert.equal(capabilities.countryCluster, 'UK');
});

test('resolveCountryCapabilities returns tax rules per cluster', () => {
  const uk = resolveCountryCapabilities({ countryCode: 'GB' });
  assert.equal(uk.tax.type, 'vat');
  assert.equal(uk.tax.standardRate, 20);
  assert.equal(uk.tax.basis, 'destination');
  assert.ok(uk.tax.zeroRatedCategories.includes('books'));

  const us = resolveCountryCapabilities({ countryCode: 'US' });
  assert.equal(us.tax.type, 'sales_tax');
  assert.equal(us.tax.standardRate, 7.25);
  assert.equal(us.tax.reducedRate, null);

  const inCapabilities = resolveCountryCapabilities({ countryCode: 'IN' });
  assert.equal(inCapabilities.tax.type, 'gst');
  assert.equal(inCapabilities.tax.standardRate, 18);
  assert.equal(inCapabilities.tax.digitalServicesRate, 18);

  const global = resolveCountryCapabilities({ countryCode: 'BR' });
  assert.equal(global.tax.type, 'none');
  assert.equal(global.tax.standardRate, 0);
  assert.equal(global.tax.registrationThresholdGbp, null);
});

test('resolveCountryCapabilities returns restricted items per cluster', () => {
  const uk = resolveCountryCapabilities({ countryCode: 'GB' });
  const ukIvory = uk.restrictedItems.find((r) => r.category === 'ivory_wildlife');
  assert.ok(ukIvory, 'UK should restrict ivory');
  assert.equal(ukIvory?.severity, 'prohibited');
  assert.equal(ukIvory?.requiresLicense, false);

  const us = resolveCountryCapabilities({ countryCode: 'US' });
  const usFirearms = us.restrictedItems.find((r) => r.category === 'firearms');
  assert.ok(usFirearms, 'US should restrict firearms');
  assert.equal(usFirearms?.severity, 'restricted');
  assert.equal(usFirearms?.requiresLicense, true);

  const me = resolveCountryCapabilities({ countryCode: 'AE' });
  const meAdult = me.restrictedItems.find((r) => r.category === 'adult_content');
  assert.ok(meAdult, 'Middle East should prohibit adult content');
  assert.equal(meAdult?.severity, 'prohibited');

  // All clusters prohibit counterfeit
  for (const code of ['GB', 'US', 'FR', 'AE', 'CN', 'IN', 'BR']) {
    const caps = resolveCountryCapabilities({ countryCode: code });
    const counterfeit = caps.restrictedItems.find((r) => r.category === 'counterfeit');
    assert.ok(counterfeit, `${code} should restrict counterfeit`);
    assert.equal(counterfeit?.severity, 'prohibited');
  }
});

test('resolveCountryCapabilities returns age restrictions per cluster', () => {
  const us = resolveCountryCapabilities({ countryCode: 'US' });
  const usAlcohol = us.ageRestrictions.find((ar) => ar.categories.includes('alcohol'));
  assert.ok(usAlcohol, 'US should have alcohol age restriction');
  assert.equal(usAlcohol?.minimumAge, 21);
  assert.equal(usAlcohol?.verificationRequired, true);

  const uk = resolveCountryCapabilities({ countryCode: 'GB' });
  const ukAlcohol = uk.ageRestrictions.find((ar) => ar.categories.includes('alcohol'));
  assert.ok(ukAlcohol, 'UK should have alcohol age restriction');
  assert.equal(ukAlcohol?.minimumAge, 18);

  // All clusters have a general 16 minimum
  for (const code of ['GB', 'US', 'FR', 'AE', 'CN', 'IN', 'BR']) {
    const caps = resolveCountryCapabilities({ countryCode: code });
    const general = caps.ageRestrictions.find((ar) => ar.categories.includes('general'));
    assert.ok(general, `${code} should have general age restriction`);
    assert.equal(general?.minimumAge, 16);
  }
});

test('resolveCountryCapabilities returns shipping zones per cluster', () => {
  const uk = resolveCountryCapabilities({ countryCode: 'GB' });
  assert.ok(uk.shippingZones.includes('domestic'));
  assert.ok(uk.shippingZones.includes('europe'));
  assert.ok(uk.shippingZones.includes('global'));

  const us = resolveCountryCapabilities({ countryCode: 'US' });
  assert.ok(us.shippingZones.includes('north_america'));
  assert.ok(!us.shippingZones.includes('europe'));

  const global = resolveCountryCapabilities({ countryCode: 'BR' });
  assert.deepEqual(global.shippingZones, ['global']);
  assert.ok(!global.shippingZones.includes('domestic'));
});
