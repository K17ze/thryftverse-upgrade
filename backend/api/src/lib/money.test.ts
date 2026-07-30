import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MONEY_CONVERSION_VERSION,
  MONEY_REGISTRY_VERSION,
  MoneyValidationError,
  allocateMoneyByBasisPoints,
  assetAmountFromOneze,
  convertMoneyByDecimalRate,
  currencyExponent,
  moneyFromMajorDecimal,
  moneyFromMinor,
  moneyFromProviderAmount,
  moneyToMajorDecimal,
  subtractMoney,
  toProviderMoney,
} from './money.js';

test('registry covers launch currencies and ISO zero/three-decimal boundaries', () => {
  for (const currency of ['GBP', 'EUR', 'USD', 'INR', 'AED', 'NGN']) {
    assert.equal(currencyExponent(currency), 2);
  }
  assert.equal(currencyExponent('JPY'), 0);
  assert.equal(currencyExponent('KWD'), 3);
});

test('major decimal conversion is exact without floating point arithmetic', () => {
  assert.deepEqual(moneyFromMajorDecimal('GBP', '10.05'), {
    currency: 'GBP',
    minorAmount: '1005',
    exponent: 2,
    registryVersion: MONEY_REGISTRY_VERSION,
  });
  assert.equal(moneyToMajorDecimal(moneyFromMinor('KWD', '1005')), '1.005');
  assert.equal(moneyToMajorDecimal(moneyFromMinor('JPY', '1005')), '1005');
});

test('currency round trips hold across launch, zero-decimal, and three-decimal currencies', () => {
  for (const [currency, major, expectedMinor] of [
    ['GBP', '10.05', '1005'],
    ['EUR', '10.05', '1005'],
    ['USD', '10.05', '1005'],
    ['INR', '10.05', '1005'],
    ['AED', '10.05', '1005'],
    ['NGN', '10.05', '1005'],
    ['JPY', '1005', '1005'],
    ['KWD', '10.005', '10005'],
  ] as const) {
    const money = moneyFromMajorDecimal(currency, major);
    assert.equal(money.minorAmount, expectedMinor);
    assert.equal(moneyToMajorDecimal(money), major);
  }
});

test('fee allocation, partial refunds, and FX use integer arithmetic', () => {
  const gross = moneyFromMajorDecimal('GBP', '10.00');
  const allocation = allocateMoneyByBasisPoints(gross, 100);
  assert.equal(allocation.fee?.minorAmount, '10');
  assert.equal(allocation.net.minorAmount, '990');
  assert.equal(
    BigInt(allocation.net.minorAmount) + BigInt(allocation.fee?.minorAmount ?? '0'),
    BigInt(gross.minorAmount)
  );

  assert.equal(
    subtractMoney(gross, moneyFromMajorDecimal('GBP', '2.25')).minorAmount,
    '775'
  );
  assert.equal(
    convertMoneyByDecimalRate(moneyFromMajorDecimal('GBP', '10.00'), 'INR', '105.125').minorAmount,
    '105125'
  );
});

test('a GBP ten-unit amount cannot silently change denomination', () => {
  const tenPounds = moneyFromMajorDecimal('GBP', '10.00');
  assert.equal(toProviderMoney('razorpay', tenPounds).money.currency, 'GBP');
  assert.equal(toProviderMoney('razorpay', tenPounds).value, '1000');
  assert.throws(
    () => subtractMoney(tenPounds, moneyFromMajorDecimal('INR', '10.00')),
    MoneyValidationError
  );
});

test('provider converters preserve equality and unit semantics', () => {
  const money = moneyFromMajorDecimal('INR', '199.99');
  const stripe = toProviderMoney('stripe', money);
  const razorpay = toProviderMoney('razorpay', money);
  const mollie = toProviderMoney('mollie', money);

  assert.equal(stripe.value, '19999');
  assert.equal(stripe.unit, 'minor_integer');
  assert.equal(razorpay.value, '19999');
  assert.equal(mollie.value, '199.99');
  assert.equal(mollie.unit, 'major_decimal');
  assert.equal(stripe.trace.conversionVersion, MONEY_CONVERSION_VERSION);
  assert.equal(mollie.trace.canonicalMinorAmount, money.minorAmount);
});

test('webhook normalization reverses each provider contract exactly', () => {
  assert.equal(moneyFromProviderAmount('stripe', 'USD', 1099).money.minorAmount, '1099');
  assert.equal(moneyFromProviderAmount('razorpay', 'INR', '1099').money.minorAmount, '1099');
  assert.equal(moneyFromProviderAmount('mollie', 'EUR', '10.99').money.minorAmount, '1099');
  assert.equal(moneyFromProviderAmount('flutterwave', 'NGN', 10.99).money.minorAmount, '1099');
  assert.equal(moneyFromProviderAmount('tap', 'AED', '10.99').money.minorAmount, '1099');
  assert.equal(moneyFromProviderAmount('wise', 'KWD', '10.999').money.minorAmount, '10999');
});

test('precision, unsupported currencies, overflow, zero, and negatives fail closed', () => {
  for (const action of [
    () => moneyFromMajorDecimal('JPY', '1.1'),
    () => moneyFromMajorDecimal('GBP', '1.001'),
    () => moneyFromMajorDecimal('ZZZ', '1.00'),
    () => moneyFromMinor('GBP', '0'),
    () => moneyFromMinor('GBP', '-1'),
    () => moneyFromMinor('GBP', '9000000000000001'),
  ]) {
    assert.throws(action, MoneyValidationError);
  }
  assert.throws(
    () => toProviderMoney('stripe', moneyFromMajorDecimal('USD', '1000000.01')),
    MoneyValidationError
  );
});

test('1ZE uses integer mg base units with a fixed three-decimal scale', () => {
  assert.deepEqual(assetAmountFromOneze('12.345'), {
    asset: '1ZE',
    baseUnitAmount: '12345',
    baseUnit: 'mg',
    scale: 3,
  });
  assert.throws(() => assetAmountFromOneze('1.0001'), MoneyValidationError);
});
