/**
 * Beneficiary (payout recipient) field validators for the cross-border
 * transfer feature.
 *
 * Pure, deterministic helpers — no DB, no I/O. Everything here operates on
 * the `fields` JSONB payload stored on the `beneficiaries` table and produces
 * a serialisable `validationReport` suitable for the `validation` JSONB
 * column.
 *
 * Coverage:
 *   - ISO 13616 IBAN validation (per-country length table + MOD-97 checksum)
 *   - ISO 9362 BIC/SWIFT code format
 *   - Indian IFSC, US ABA routing (3-7-1 checksum), UK sort code
 *   - Generic local account numbers
 *
 * `suggestAccountType` is only a heuristic default — the partner corridor
 * configuration for a given payout rail ultimately decides which account
 * type is accepted.
 */
import { createApiError, type ApiError } from './workerHelpers.js';

// ─── Shared types ──────────────────────────────────────────────────────────

export const BENEFICIARY_ACCOUNT_TYPES = [
  'iban',
  'sort_code',
  'aba',
  'ifsc',
  'swift_code',
  'local_account',
] as const;

/** Mirrors the CHECK constraint on beneficiaries.account_type. */
export type BeneficiaryAccountType = typeof BENEFICIARY_ACCOUNT_TYPES[number];

export interface FieldValidationResult {
  valid: boolean;
  /** Canonical form to persist (uppercased / digit-stripped). */
  normalized?: string;
  errors: string[];
}

export interface IbanValidationResult extends FieldValidationResult {
  /** ISO 3166-1 alpha-2 prefix of the IBAN, when parseable. */
  countryCode?: string;
}

// ─── IBAN (ISO 13616) ──────────────────────────────────────────────────────

/**
 * ISO 13616 IBAN lengths per country (IBAN registry, ~87 territories
 * including regional/extended members such as XK and VA).
 */
export const IBAN_COUNTRY_LENGTHS = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22,
  BH: 22, BI: 27, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24,
  DE: 22, DJ: 27, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18,
  FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28,
  HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IR: 26, IS: 26, IT: 27,
  JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31,
  MU: 30, MZ: 25, NL: 18, NO: 15, OM: 23, PK: 24, PL: 28, PS: 29,
  PT: 25, QA: 29, RO: 24, RS: 22, RU: 33, SA: 24, SC: 31, SD: 18,
  SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25, SV: 28, TL: 23,
  TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
} as const;

export type IbanCountryCode = keyof typeof IBAN_COUNTRY_LENGTHS;

/**
 * Exact MOD-97 over a decimal digit string. Iterative remainder — never
 * materialises the full integer and never touches float math.
 */
function mod97(digits: string): number {
  let remainder = 0;
  for (let i = 0; i < digits.length; i += 1) {
    remainder = (remainder * 10 + (digits.charCodeAt(i) - 48)) % 97;
  }
  return remainder;
}

/** Letters → digits per ISO 13616 (A=10 … Z=35); digits pass through. */
function ibanToNumericString(rearranged: string): string {
  let out = '';
  for (let i = 0; i < rearranged.length; i += 1) {
    const code = rearranged.charCodeAt(i);
    out += code >= 65 && code <= 90 ? String(code - 55) : rearranged[i];
  }
  return out;
}

/**
 * Full ISO 13616 IBAN validation: normalise (strip spaces, uppercase),
 * structure check, per-country length check, then MOD-97 checksum on the
 * rearranged (first-4-chars-to-end) numeric expansion.
 */
export function validateIban(iban: string): IbanValidationResult {
  const errors: string[] = [];
  const normalized = typeof iban === 'string' ? iban.replace(/\s+/g, '').toUpperCase() : '';
  const countryCode = /^[A-Z]{2}/.test(normalized) ? normalized.slice(0, 2) : undefined;

  if (normalized.length === 0) {
    return { valid: false, errors: ['IBAN is required'] };
  }

  if (!/^[A-Z0-9]+$/.test(normalized)) {
    errors.push('IBAN must contain only letters and digits');
  }
  if (!countryCode) {
    errors.push('IBAN must start with a two-letter ISO country code');
  }
  if (!/^[A-Z]{2}[0-9]{2}/.test(normalized)) {
    errors.push('IBAN check digits (positions 3-4) must be numeric');
  }
  if (normalized.length < 15 || normalized.length > 34) {
    errors.push(`IBAN length must be between 15 and 34 characters (got ${normalized.length})`);
  }

  if (countryCode) {
    const expected = IBAN_COUNTRY_LENGTHS[countryCode as IbanCountryCode] as number | undefined;
    if (expected === undefined) {
      errors.push(`'${countryCode}' is not an ISO 13616 IBAN registry country`);
    } else if (normalized.length !== expected) {
      errors.push(`IBAN length ${normalized.length} does not match the ${countryCode} IBAN length ${expected}`);
    }
  }

  if (errors.length === 0) {
    const rearranged = normalized.slice(4) + normalized.slice(0, 4);
    const remainder = mod97(ibanToNumericString(rearranged));
    if (remainder !== 1) {
      errors.push(`IBAN checksum failed (MOD-97 remainder ${remainder}, expected 1)`);
    }
  }

  return {
    valid: errors.length === 0,
    normalized,
    countryCode,
    errors,
  };
}

// ─── BIC / SWIFT (ISO 9362) ────────────────────────────────────────────────

const BIC_PATTERN = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

/** ISO 9362 Business Identifier Code — 8 or 11 characters: AAAABBCC(XXX). */
export function validateBic(code: string): FieldValidationResult {
  const errors: string[] = [];
  const normalized = typeof code === 'string' ? code.replace(/\s+/g, '').toUpperCase() : '';

  if (normalized.length === 0) {
    return { valid: false, errors: ['BIC/SWIFT code is required'] };
  }
  if (normalized.length !== 8 && normalized.length !== 11) {
    errors.push(`BIC/SWIFT code must be 8 or 11 characters (got ${normalized.length})`);
  }
  if (!BIC_PATTERN.test(normalized)) {
    errors.push('BIC/SWIFT code must match AAAABBCC(XXX) — 4-letter bank, 2-letter country, 2-char location, optional 3-char branch');
  }

  return { valid: errors.length === 0, normalized, errors };
}

// ─── IFSC (India) ──────────────────────────────────────────────────────────

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Indian Financial System Code — 4-letter bank, literal '0', 6-char branch. */
export function validateIfsc(code: string): FieldValidationResult {
  const errors: string[] = [];
  const normalized = typeof code === 'string' ? code.replace(/\s+/g, '').toUpperCase() : '';

  if (normalized.length === 0) {
    return { valid: false, errors: ['IFSC is required'] };
  }
  if (normalized.length !== 11) {
    errors.push(`IFSC must be 11 characters (got ${normalized.length})`);
  }
  if (!IFSC_PATTERN.test(normalized)) {
    errors.push('IFSC must be 4 letters (bank), then 0, then 6 alphanumeric characters (branch)');
  }

  return { valid: errors.length === 0, normalized, errors };
}

// ─── ABA routing (US) ──────────────────────────────────────────────────────

/**
 * US ABA routing transit number — 9 digits with the 3-7-1 checksum:
 * (3·(d1+d4+d7) + 7·(d2+d5+d8) + (d3+d6+d9)) mod 10 === 0.
 */
export function validateAbaRouting(num: string): FieldValidationResult {
  const errors: string[] = [];
  const normalized = typeof num === 'string' ? num.replace(/[\s-]+/g, '') : '';

  if (normalized.length === 0) {
    return { valid: false, errors: ['ABA routing number is required'] };
  }
  if (!/^\d{9}$/.test(normalized)) {
    return { valid: false, normalized, errors: ['ABA routing number must be exactly 9 digits'] };
  }

  const d = normalized.split('').map((ch) => ch.charCodeAt(0) - 48);
  const checksum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  if (checksum % 10 !== 0) {
    errors.push('ABA routing number checksum failed (3-7-1 weighted sum must be a multiple of 10)');
  }

  return { valid: errors.length === 0, normalized, errors };
}

// ─── UK sort code ──────────────────────────────────────────────────────────

/** UK sort code — 6 digits; accepts 'XX-XX-XX' input and normalises to digits. */
export function validateSortCode(code: string): FieldValidationResult {
  const normalized = typeof code === 'string' ? code.replace(/[\s-]+/g, '') : '';

  if (normalized.length === 0) {
    return { valid: false, errors: ['Sort code is required'] };
  }
  if (!/^\d{6}$/.test(normalized)) {
    return { valid: false, normalized, errors: ['Sort code must be exactly 6 digits'] };
  }

  return { valid: true, normalized, errors: [] };
}

// ─── Generic account number ────────────────────────────────────────────────

export interface AccountNumberBounds {
  min?: number;
  max?: number;
}

/**
 * Local account number — digits only after stripping spaces/dashes, length
 * bounded by { min = 4, max = 17 } (covers the common domestic schemes).
 */
export function validateAccountNumber(
  value: string,
  bounds: AccountNumberBounds = {},
): FieldValidationResult {
  const min = bounds.min ?? 4;
  const max = bounds.max ?? 17;
  const normalized = typeof value === 'string' ? value.replace(/[\s-]+/g, '') : '';

  if (normalized.length === 0) {
    return { valid: false, errors: ['Account number is required'] };
  }
  if (!/^\d+$/.test(normalized)) {
    return { valid: false, normalized, errors: ['Account number must contain only digits'] };
  }
  if (normalized.length < min || normalized.length > max) {
    return {
      valid: false,
      normalized,
      errors: [`Account number length must be between ${min} and ${max} digits (got ${normalized.length})`],
    };
  }

  return { valid: true, normalized, errors: [] };
}

// ─── Account-type requirements ─────────────────────────────────────────────

export interface BeneficiaryAccountRequirement {
  requiredFields: readonly string[];
  optionalFields: readonly string[];
  description: string;
}

export const BENEFICIARY_ACCOUNT_REQUIREMENTS: Record<BeneficiaryAccountType, BeneficiaryAccountRequirement> = {
  iban: {
    requiredFields: ['iban'],
    optionalFields: ['bic', 'accountHolder'],
    description: 'SEPA/IBAN account — International Bank Account Number, optional BIC for cross-border routing',
  },
  sort_code: {
    requiredFields: ['sortCode', 'accountNumber'],
    optionalFields: ['accountHolder'],
    description: 'UK domestic account — 6-digit sort code plus local account number',
  },
  aba: {
    requiredFields: ['routingNumber', 'accountNumber'],
    optionalFields: ['accountHolder', 'accountType'],
    description: 'US domestic account — 9-digit ABA routing number plus account number',
  },
  ifsc: {
    requiredFields: ['ifsc', 'accountNumber'],
    optionalFields: ['accountHolder'],
    description: 'Indian domestic account — 11-character IFSC plus account number',
  },
  swift_code: {
    requiredFields: ['bic', 'accountNumber'],
    optionalFields: ['accountHolder', 'bankName', 'bankAddress'],
    description: 'Cross-border SWIFT account — BIC plus local account number or reference',
  },
  local_account: {
    requiredFields: ['accountNumber'],
    optionalFields: ['accountHolder', 'bankName', 'bankCode'],
    description: 'Generic local bank account — account number with optional bank metadata',
  },
};

// ─── Country → account type suggestion ─────────────────────────────────────

/**
 * Heuristic default account type for a destination country.
 *
 * NOTE: this is only a suggestion for UX pre-selection. The partner corridor
 * configuration for the chosen payout rail ultimately decides which account
 * types are actually accepted for a given country/currency pair.
 */
export function suggestAccountType(countryCode: string): BeneficiaryAccountType {
  const cc = (countryCode ?? '').trim().toUpperCase();

  if (cc === 'GB') return 'sort_code'; // IBAN also valid for GB — sort_code is the primary domestic rail
  if (cc === 'US') return 'aba';
  if (cc === 'IN') return 'ifsc';

  // Any country in the ISO 13616 IBAN registry defaults to 'iban'.
  if (Object.prototype.hasOwnProperty.call(IBAN_COUNTRY_LENGTHS, cc)) {
    return 'iban';
  }

  // Non-IBAN corridors fall back to a SWIFT-addressed local account.
  return 'swift_code';
}

// ─── Whole-payload validation ──────────────────────────────────────────────

export interface BeneficiaryFieldsInput {
  countryCode: string;
  currency: string;
  accountType: string;
  fields: Record<string, unknown>;
}

export interface BeneficiaryFieldCheck {
  field: string;
  result: 'pass' | 'fail';
  detail: string;
}

/** Serialisable payload for the beneficiaries.validation JSONB column. */
export interface BeneficiaryValidationReport {
  checkedAt: string;
  checks: BeneficiaryFieldCheck[];
}

export interface BeneficiaryFieldsValidationResult {
  valid: boolean;
  errors: string[];
  /** Canonical scalar field map to persist in beneficiaries.fields. */
  normalizedFields: Record<string, string>;
  validationReport: BeneficiaryValidationReport;
}

const FIELD_VALIDATORS: Record<BeneficiaryAccountType, Record<string, (value: string) => FieldValidationResult>> = {
  iban: {
    iban: validateIban,
    bic: validateBic,
  },
  sort_code: {
    sortCode: validateSortCode,
    accountNumber: (v) => validateAccountNumber(v),
  },
  aba: {
    routingNumber: validateAbaRouting,
    accountNumber: (v) => validateAccountNumber(v),
  },
  ifsc: {
    ifsc: validateIfsc,
    accountNumber: (v) => validateAccountNumber(v),
  },
  swift_code: {
    bic: validateBic,
    accountNumber: (v) => validateAccountNumber(v),
  },
  local_account: {
    accountNumber: (v) => validateAccountNumber(v, { min: 4, max: 34 }),
  },
};

const PASS_DETAILS: Record<string, string> = {
  iban: 'ISO 13616 IBAN MOD-97 checksum passed',
  bic: 'ISO 9362 BIC format valid',
  ifsc: 'IFSC format valid (4-letter bank + 0 + 6-char branch)',
  routingNumber: 'ABA routing 3-7-1 checksum passed',
  sortCode: 'Sort code format valid (6 digits)',
  accountNumber: 'Account number format valid',
};

/** Coerce a JSONB field value to a scalar string, or null when absent/non-scalar. */
function coerceFieldScalar(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

/**
 * Validate a beneficiary `fields` payload against the declared account type:
 * required-field presence, per-field format/checksum validation, and
 * normalisation. Returns a deterministic validation report suitable for the
 * beneficiaries.validation JSONB column. No DB access, no I/O.
 */
export function validateBeneficiaryFields(
  input: BeneficiaryFieldsInput,
  options: { now?: Date } = {},
): BeneficiaryFieldsValidationResult {
  const errors: string[] = [];
  const checks: BeneficiaryFieldCheck[] = [];
  const normalizedFields: Record<string, string> = {};
  const fields = input.fields && typeof input.fields === 'object' ? input.fields : {};

  const check = (field: string, result: 'pass' | 'fail', detail: string): void => {
    checks.push({ field, result, detail });
  };

  // ── Envelope fields ──
  const countryCode = (input.countryCode ?? '').trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(countryCode)) {
    check('countryCode', 'pass', 'ISO 3166-1 alpha-2 country code');
  } else {
    check('countryCode', 'fail', 'countryCode must be an ISO 3166-1 alpha-2 code');
    errors.push('countryCode must be an ISO 3166-1 alpha-2 code');
  }

  const currency = (input.currency ?? '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(currency)) {
    check('currency', 'pass', 'ISO 4217 alpha-3 currency code format');
  } else {
    check('currency', 'fail', 'currency must be an ISO 4217 alpha-3 code');
    errors.push('currency must be an ISO 4217 alpha-3 code');
  }

  const requirement = BENEFICIARY_ACCOUNT_REQUIREMENTS[input.accountType as BeneficiaryAccountType] as
    | BeneficiaryAccountRequirement
    | undefined;

  if (!requirement) {
    check('accountType', 'fail', `unsupported account type '${input.accountType}'`);
    errors.push(`accountType must be one of: ${BENEFICIARY_ACCOUNT_TYPES.join(', ')}`);
    return {
      valid: false,
      errors,
      normalizedFields,
      validationReport: { checkedAt: (options.now ?? new Date()).toISOString(), checks },
    };
  }
  check('accountType', 'pass', `account type '${input.accountType}'`);

  // Retain every scalar field in the normalised map before format checks.
  for (const [key, value] of Object.entries(fields)) {
    const scalar = coerceFieldScalar(value);
    if (scalar !== null) {
      normalizedFields[key] = scalar;
    }
  }

  const fieldValidators = FIELD_VALIDATORS[input.accountType as BeneficiaryAccountType];

  const runField = (field: string, required: boolean): void => {
    const raw = coerceFieldScalar(fields[field]);
    if (raw === null) {
      if (required) {
        check(field, 'fail', 'missing required field');
        errors.push(`${field} is required`);
      }
      return;
    }

    const validator = fieldValidators[field];
    if (!validator) {
      check(field, 'pass', required ? 'required field present' : 'optional field present');
      return;
    }

    const result = validator(raw);
    if (result.valid) {
      normalizedFields[field] = result.normalized ?? raw;
      check(field, 'pass', PASS_DETAILS[field] ?? 'format valid');
    } else {
      check(field, 'fail', result.errors.join('; '));
      for (const detail of result.errors) {
        errors.push(`${field}: ${detail}`);
      }
    }
  };

  for (const field of requirement.requiredFields) {
    runField(field, true);
  }
  for (const field of requirement.optionalFields) {
    runField(field, false);
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedFields,
    validationReport: {
      checkedAt: (options.now ?? new Date()).toISOString(),
      checks,
    },
  };
}

// ─── Error factory ─────────────────────────────────────────────────────────

/**
 * Build the canonical BENEFICIARY_INVALID ApiError (HTTP 400 via
 * statusCodeForApiError's `*_INVALID` rule) with the per-field error list
 * attached under details.errors for the caller to surface.
 */
export const BeneficiaryValidationError = (message: string, errors: string[]): ApiError =>
  createApiError('BENEFICIARY_INVALID', message, { errors });
