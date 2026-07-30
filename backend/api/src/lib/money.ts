export const MONEY_REGISTRY_VERSION = 'iso4217-2026-07';
export const MONEY_CONVERSION_VERSION = 'money-boundary-v1';
export const MAX_CANONICAL_MINOR_AMOUNT = 9_000_000_000_000_000n;
export const MAX_TRANSACTION_MAJOR_UNITS = 1_000_000n;
export const ONEZE_BASE_UNIT_SCALE = 1_000n;

const CURRENCY_EXPONENTS = {
  AED: 2,
  AUD: 2,
  BHD: 3,
  BIF: 0,
  BRL: 2,
  CAD: 2,
  CHF: 2,
  CLP: 0,
  CNY: 2,
  DKK: 2,
  DJF: 0,
  EUR: 2,
  GBP: 2,
  GNF: 0,
  HKD: 2,
  IDR: 2,
  INR: 2,
  JOD: 3,
  JPY: 0,
  KES: 2,
  KMF: 0,
  KRW: 0,
  KWD: 3,
  MGA: 2,
  MXN: 2,
  NGN: 2,
  NOK: 2,
  NZD: 2,
  OMR: 3,
  PLN: 2,
  PYG: 0,
  QAR: 2,
  RWF: 0,
  SAR: 2,
  SEK: 2,
  SGD: 2,
  TND: 3,
  UGX: 0,
  USD: 2,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  ZAR: 2,
} as const;

export type CurrencyCode = keyof typeof CURRENCY_EXPONENTS;
export type MoneyProvider = 'stripe' | 'razorpay' | 'mollie' | 'flutterwave' | 'tap' | 'wise' | 'mock';
export type ProviderAmountUnit = 'minor_integer' | 'major_decimal';

export interface Money {
  currency: CurrencyCode;
  minorAmount: string;
  exponent: number;
  registryVersion: typeof MONEY_REGISTRY_VERSION;
}

export interface AssetAmount {
  asset: '1ZE';
  baseUnitAmount: string;
  baseUnit: 'mg';
  scale: 3;
}

export interface MoneyConversionTrace {
  direction: 'canonical_to_provider' | 'provider_to_canonical';
  provider: MoneyProvider;
  currency: CurrencyCode;
  exponent: number;
  canonicalMinorAmount: string;
  providerAmount: string;
  providerUnit: ProviderAmountUnit;
  conversionFunction: string;
  conversionVersion: typeof MONEY_CONVERSION_VERSION;
  registryVersion: typeof MONEY_REGISTRY_VERSION;
  equalityProof: string;
}

export interface ProviderMoneyAmount {
  value: string;
  unit: ProviderAmountUnit;
  money: Money;
  trace: MoneyConversionTrace;
}

export interface MoneyAllocation {
  gross: Money;
  fee: Money | null;
  net: Money;
  feeBasisPoints: number;
}

export class MoneyValidationError extends Error {
  readonly code:
    | 'CURRENCY_UNSUPPORTED'
    | 'MONEY_FORMAT_INVALID'
    | 'MONEY_PRECISION_INVALID'
    | 'MONEY_RANGE_INVALID';

  constructor(code: MoneyValidationError['code'], message: string) {
    super(message);
    this.name = 'MoneyValidationError';
    this.code = code;
  }
}

function parseUnsignedInteger(value: string | bigint): bigint {
  const raw = typeof value === 'bigint' ? value.toString() : value.trim();
  if (!/^\d+$/.test(raw)) {
    throw new MoneyValidationError('MONEY_FORMAT_INVALID', 'minorAmount must be an unsigned base-10 integer');
  }

  const parsed = BigInt(raw);
  if (parsed <= 0n || parsed > MAX_CANONICAL_MINOR_AMOUNT) {
    throw new MoneyValidationError(
      'MONEY_RANGE_INVALID',
      `minorAmount must be between 1 and ${MAX_CANONICAL_MINOR_AMOUNT.toString()}`
    );
  }
  return parsed;
}

function providerUnit(provider: MoneyProvider): ProviderAmountUnit {
  return provider === 'stripe' || provider === 'razorpay' || provider === 'mock'
    ? 'minor_integer'
    : 'major_decimal';
}

export function normalizeCurrencyCode(currency: string): CurrencyCode {
  const normalized = currency.trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(CURRENCY_EXPONENTS, normalized)) {
    throw new MoneyValidationError('CURRENCY_UNSUPPORTED', `Unsupported ISO 4217 currency '${currency}'`);
  }
  return normalized as CurrencyCode;
}

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[normalizeCurrencyCode(currency)];
}

export function moneyFromMinor(currency: string, minorAmount: string | bigint): Money {
  const normalizedCurrency = normalizeCurrencyCode(currency);
  const parsed = parseUnsignedInteger(minorAmount);
  return {
    currency: normalizedCurrency,
    minorAmount: parsed.toString(),
    exponent: CURRENCY_EXPONENTS[normalizedCurrency],
    registryVersion: MONEY_REGISTRY_VERSION,
  };
}

export function moneyFromMajorDecimal(currency: string, majorAmount: string): Money {
  const normalizedCurrency = normalizeCurrencyCode(currency);
  const exponent = CURRENCY_EXPONENTS[normalizedCurrency];
  const raw = majorAmount.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) {
    throw new MoneyValidationError(
      'MONEY_FORMAT_INVALID',
      'major amount must be a positive, non-exponential decimal string'
    );
  }

  const fraction = match[2] ?? '';
  if (fraction.length > exponent) {
    throw new MoneyValidationError(
      'MONEY_PRECISION_INVALID',
      `${normalizedCurrency} allows at most ${exponent} decimal places`
    );
  }

  const paddedFraction = fraction.padEnd(exponent, '0');
  const minor = BigInt(match[1]) * (10n ** BigInt(exponent))
    + BigInt(paddedFraction.length > 0 ? paddedFraction : '0');
  return moneyFromMinor(normalizedCurrency, minor);
}

export function moneyToMajorDecimal(money: Money): string {
  const canonical = moneyFromMinor(money.currency, money.minorAmount);
  if (canonical.exponent !== money.exponent || money.registryVersion !== MONEY_REGISTRY_VERSION) {
    throw new MoneyValidationError('MONEY_FORMAT_INVALID', 'Money registry metadata does not match the active registry');
  }

  const minor = BigInt(canonical.minorAmount);
  if (canonical.exponent === 0) {
    return minor.toString();
  }

  const factor = 10n ** BigInt(canonical.exponent);
  return `${minor / factor}.${(minor % factor).toString().padStart(canonical.exponent, '0')}`;
}

export function moneyToSafeInteger(money: Money): number {
  const minor = BigInt(moneyFromMinor(money.currency, money.minorAmount).minorAmount);
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new MoneyValidationError('MONEY_RANGE_INVALID', 'Provider amount exceeds the JavaScript safe-integer limit');
  }
  return Number(minor);
}

export function allocateMoneyByBasisPoints(money: Money, feeBasisPoints: number): MoneyAllocation {
  if (!Number.isInteger(feeBasisPoints) || feeBasisPoints < 0 || feeBasisPoints >= 10_000) {
    throw new MoneyValidationError('MONEY_RANGE_INVALID', 'feeBasisPoints must be an integer from 0 to 9999');
  }
  const gross = moneyFromMinor(money.currency, money.minorAmount);
  const grossMinor = BigInt(gross.minorAmount);
  const feeMinor = (grossMinor * BigInt(feeBasisPoints) + 5_000n) / 10_000n;
  const netMinor = grossMinor - feeMinor;
  if (netMinor <= 0n) {
    throw new MoneyValidationError('MONEY_RANGE_INVALID', 'Fee allocation leaves no positive net amount');
  }
  return {
    gross,
    fee: feeMinor > 0n ? moneyFromMinor(gross.currency, feeMinor) : null,
    net: moneyFromMinor(gross.currency, netMinor),
    feeBasisPoints,
  };
}

export function subtractMoney(original: Money, deduction: Money): Money {
  const left = moneyFromMinor(original.currency, original.minorAmount);
  const right = moneyFromMinor(deduction.currency, deduction.minorAmount);
  if (left.currency !== right.currency) {
    throw new MoneyValidationError('MONEY_FORMAT_INVALID', 'Money arithmetic requires matching currencies');
  }
  const remainder = BigInt(left.minorAmount) - BigInt(right.minorAmount);
  if (remainder <= 0n) {
    throw new MoneyValidationError('MONEY_RANGE_INVALID', 'Deduction must leave a positive remainder');
  }
  return moneyFromMinor(left.currency, remainder);
}

export function convertMoneyByDecimalRate(
  source: Money,
  targetCurrency: string,
  decimalRate: string
): Money {
  const canonicalSource = moneyFromMinor(source.currency, source.minorAmount);
  const target = normalizeCurrencyCode(targetCurrency);
  const rateMatch = /^(\d+)(?:\.(\d+))?$/.exec(decimalRate.trim());
  if (!rateMatch) {
    throw new MoneyValidationError('MONEY_FORMAT_INVALID', 'FX rate must be a positive decimal string');
  }
  const rateFraction = rateMatch[2] ?? '';
  if (rateFraction.length > 12) {
    throw new MoneyValidationError('MONEY_PRECISION_INVALID', 'FX rate supports at most 12 decimal places');
  }
  const rateScale = 10n ** BigInt(rateFraction.length);
  const rateNumerator = BigInt(rateMatch[1]) * rateScale + BigInt(rateFraction || '0');
  if (rateNumerator <= 0n) {
    throw new MoneyValidationError('MONEY_RANGE_INVALID', 'FX rate must be positive');
  }
  const targetExponent = CURRENCY_EXPONENTS[target];
  const numerator =
    BigInt(canonicalSource.minorAmount)
    * rateNumerator
    * (10n ** BigInt(targetExponent));
  const denominator =
    rateScale
    * (10n ** BigInt(canonicalSource.exponent));
  const roundedTargetMinor = (numerator + denominator / 2n) / denominator;
  return moneyFromMinor(target, roundedTargetMinor);
}

export function toProviderMoney(provider: MoneyProvider, money: Money): ProviderMoneyAmount {
  const canonical = moneyFromMinor(money.currency, money.minorAmount);
  const transactionLimit = MAX_TRANSACTION_MAJOR_UNITS * (10n ** BigInt(canonical.exponent));
  if (BigInt(canonical.minorAmount) > transactionLimit) {
    throw new MoneyValidationError(
      'MONEY_RANGE_INVALID',
      `Transaction exceeds the ${MAX_TRANSACTION_MAJOR_UNITS.toString()} ${canonical.currency} application limit`
    );
  }
  const unit = providerUnit(provider);
  const value = unit === 'minor_integer'
    ? canonical.minorAmount
    : moneyToMajorDecimal(canonical);
  const operation = unit === 'minor_integer'
    ? 'identity(minorAmount)'
    : `minorAmount / 10^${canonical.exponent}`;

  return {
    value,
    unit,
    money: canonical,
    trace: {
      direction: 'canonical_to_provider',
      provider,
      currency: canonical.currency,
      exponent: canonical.exponent,
      canonicalMinorAmount: canonical.minorAmount,
      providerAmount: value,
      providerUnit: unit,
      conversionFunction: operation,
      conversionVersion: MONEY_CONVERSION_VERSION,
      registryVersion: MONEY_REGISTRY_VERSION,
      equalityProof: `${canonical.minorAmount} ${canonical.currency} minor = ${value} ${canonical.currency} ${unit}`,
    },
  };
}

export function moneyFromProviderAmount(
  provider: MoneyProvider,
  currency: string,
  rawProviderAmount: string | number
): ProviderMoneyAmount {
  const raw = typeof rawProviderAmount === 'number'
    ? String(rawProviderAmount)
    : rawProviderAmount.trim();
  const unit = providerUnit(provider);
  const money = unit === 'minor_integer'
    ? moneyFromMinor(currency, raw)
    : moneyFromMajorDecimal(currency, raw);
  const operation = unit === 'minor_integer'
    ? 'identity(providerMinorInteger)'
    : `providerMajorDecimal * 10^${money.exponent}`;

  return {
    value: raw,
    unit,
    money,
    trace: {
      direction: 'provider_to_canonical',
      provider,
      currency: money.currency,
      exponent: money.exponent,
      canonicalMinorAmount: money.minorAmount,
      providerAmount: raw,
      providerUnit: unit,
      conversionFunction: operation,
      conversionVersion: MONEY_CONVERSION_VERSION,
      registryVersion: MONEY_REGISTRY_VERSION,
      equalityProof: `${raw} ${money.currency} ${unit} = ${money.minorAmount} ${money.currency} minor`,
    },
  };
}

export function assetAmountFromBaseUnits(baseUnitAmount: string | bigint): AssetAmount {
  const parsed = parseUnsignedInteger(baseUnitAmount);
  return {
    asset: '1ZE',
    baseUnitAmount: parsed.toString(),
    baseUnit: 'mg',
    scale: 3,
  };
}

export function assetAmountFromOneze(majorAmount: string): AssetAmount {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(majorAmount.trim());
  if (!match || (match[2] ?? '').length > 3) {
    throw new MoneyValidationError('MONEY_PRECISION_INVALID', '1ZE allows at most three decimal places (mg base units)');
  }
  const fraction = (match[2] ?? '').padEnd(3, '0');
  return assetAmountFromBaseUnits(BigInt(match[1]) * ONEZE_BASE_UNIT_SCALE + BigInt(fraction || '0'));
}
