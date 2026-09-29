/**
 * sendModel — shared constants and pure helpers for the Send money
 * surface (beneficiaries + outbound transfers).
 *
 * The account-type field specs mirror backend
 * `lib/beneficiaries.ts` BENEFICIARY_ACCOUNT_REQUIREMENTS / FIELD_VALIDATORS
 * exactly — the server remains authoritative (BENEFICIARY_INVALID details
 * are surfaced verbatim); these exist so the form renders the right inputs
 * per rail and can pre-suggest an account type from the destination
 * country.
 */

import {
  currencyMinorExponent,
  formatMinorAmount,
  parseServerTimestamp,
  type BeneficiaryAccountType,
  type BeneficiaryPayload,
} from '@/lib/api/services/fx';

// ── Account types ────────────────────────────────────────────────────

export interface AccountTypeOption {
  value: BeneficiaryAccountType;
  label: string;
  /** One-line rail description shown under the picker. */
  description: string;
}

export const ACCOUNT_TYPE_OPTIONS: AccountTypeOption[] = [
  {
    value: 'iban',
    label: 'IBAN',
    description: 'SEPA / IBAN account — International Bank Account Number, optional BIC for cross-border routing.',
  },
  {
    value: 'sort_code',
    label: 'UK sort code',
    description: 'UK domestic account — 6-digit sort code plus local account number.',
  },
  {
    value: 'aba',
    label: 'US routing (ABA)',
    description: 'US domestic account — 9-digit ABA routing number plus account number.',
  },
  {
    value: 'ifsc',
    label: 'Indian IFSC',
    description: 'Indian domestic account — 11-character IFSC plus account number.',
  },
  {
    value: 'swift_code',
    label: 'SWIFT / BIC',
    description: 'Cross-border SWIFT account — BIC plus a local account number or reference.',
  },
  {
    value: 'local_account',
    label: 'Local account',
    description: 'Generic local bank account — account number with optional bank details.',
  },
];

export interface BeneficiaryFieldSpec {
  /** Key inside the beneficiary `fields` payload. */
  name: string;
  label: string;
  required: boolean;
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'decimal';
  /** Uppercase + strip spaces/dashes the way the server normalises. */
  normalize?: 'upper' | 'digits';
}

/**
 * Ordered input specs per account type — required fields first, then the
 * optional set the server accepts (anything else it stores but cannot
 * validate is still persisted under fields).
 */
export const BENEFICIARY_FIELD_SPECS: Record<BeneficiaryAccountType, BeneficiaryFieldSpec[]> = {
  iban: [
    { name: 'iban', label: 'IBAN', required: true, placeholder: 'GB29 NWBK 6016 1331 9268 19', normalize: 'upper' },
    { name: 'bic', label: 'BIC / SWIFT code', required: false, placeholder: 'NWBKGB2L', normalize: 'upper' },
    { name: 'accountHolder', label: 'Account holder name', required: false },
  ],
  sort_code: [
    { name: 'sortCode', label: 'Sort code', required: true, placeholder: '04-06-75', inputMode: 'numeric', normalize: 'digits' },
    { name: 'accountNumber', label: 'Account number', required: true, placeholder: '12345678', inputMode: 'numeric', normalize: 'digits' },
    { name: 'accountHolder', label: 'Account holder name', required: false },
  ],
  aba: [
    { name: 'routingNumber', label: 'Routing number (ABA)', required: true, placeholder: '021000021', inputMode: 'numeric', normalize: 'digits' },
    { name: 'accountNumber', label: 'Account number', required: true, placeholder: '123456789', inputMode: 'numeric', normalize: 'digits' },
    { name: 'accountHolder', label: 'Account holder name', required: false },
    { name: 'accountType', label: 'Account type (e.g. checking)', required: false },
  ],
  ifsc: [
    { name: 'ifsc', label: 'IFSC', required: true, placeholder: 'SBIN0123456', normalize: 'upper' },
    { name: 'accountNumber', label: 'Account number', required: true, placeholder: '12345678901', inputMode: 'numeric', normalize: 'digits' },
    { name: 'accountHolder', label: 'Account holder name', required: false },
  ],
  swift_code: [
    { name: 'bic', label: 'BIC / SWIFT code', required: true, placeholder: 'NWBKGB2L', normalize: 'upper' },
    { name: 'accountNumber', label: 'Account number or reference', required: true },
    { name: 'accountHolder', label: 'Account holder name', required: false },
    { name: 'bankName', label: 'Bank name', required: false },
    { name: 'bankAddress', label: 'Bank address', required: false },
  ],
  local_account: [
    { name: 'accountNumber', label: 'Account number', required: true },
    { name: 'accountHolder', label: 'Account holder name', required: false },
    { name: 'bankName', label: 'Bank name', required: false },
    { name: 'bankCode', label: 'Bank code', required: false },
  ],
};

/** Human label for a `fields` key (transfer/beneficiary detail rows). */
export const FIELD_LABELS: Record<string, string> = {
  iban: 'IBAN',
  bic: 'BIC / SWIFT',
  sortCode: 'Sort code',
  accountNumber: 'Account number',
  routingNumber: 'Routing number',
  ifsc: 'IFSC',
  accountHolder: 'Account holder',
  accountType: 'Account type',
  bankName: 'Bank name',
  bankAddress: 'Bank address',
  bankCode: 'Bank code',
};

export function accountTypeLabel(accountType: string): string {
  return ACCOUNT_TYPE_OPTIONS.find((o) => o.value === accountType)?.label ?? accountType;
}

// ── Destination countries ────────────────────────────────────────────
// Corridors reachable with the supported payout currencies: GBP (GB and
// crown dependencies), EUR (Eurozone + EUR-adjacent IBAN members),
// USD, CAD, AUD, AED, INR, NGN, JPY home markets. The server only
// requires a valid ISO alpha-2 code — this list is a UX scope, not a
// fabricated capability claim.

export interface DestinationCountry {
  code: string;
  name: string;
}

export const DESTINATION_COUNTRIES: DestinationCountry[] = [
  { code: 'GB', name: 'United Kingdom' },
  { code: 'GG', name: 'Guernsey' },
  { code: 'IM', name: 'Isle of Man' },
  { code: 'JE', name: 'Jersey' },
  { code: 'GI', name: 'Gibraltar' },
  { code: 'IE', name: 'Ireland' },
  { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' },
  { code: 'HR', name: 'Croatia' },
  { code: 'CY', name: 'Cyprus' },
  { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' },
  { code: 'FR', name: 'France' },
  { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' },
  { code: 'IT', name: 'Italy' },
  { code: 'LV', name: 'Latvia' },
  { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'MT', name: 'Malta' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'PT', name: 'Portugal' },
  { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' },
  { code: 'ES', name: 'Spain' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'IN', name: 'India' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'JP', name: 'Japan' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'NO', name: 'Norway' },
  { code: 'SE', name: 'Sweden' },
  { code: 'DK', name: 'Denmark' },
  { code: 'PL', name: 'Poland' },
  { code: 'CZ', name: 'Czechia' },
  { code: 'HU', name: 'Hungary' },
  { code: 'RO', name: 'Romania' },
  { code: 'BG', name: 'Bulgaria' },
  { code: 'IS', name: 'Iceland' },
];

export function countryName(code: string): string {
  return DESTINATION_COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

/** ISO 13616 IBAN registry country codes — port of the backend
 *  IBAN_COUNTRY_LENGTHS key set, used only for the account-type
 *  suggestion heuristic (server validation stays authoritative). */
const IBAN_REGISTRY_COUNTRIES = new Set([
  'AD', 'AE', 'AL', 'AT', 'AZ', 'BA', 'BE', 'BG', 'BH', 'BI', 'BR', 'BY',
  'CH', 'CR', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DO', 'EE', 'EG', 'ES', 'FI',
  'FO', 'FR', 'GB', 'GE', 'GI', 'GL', 'GR', 'GT', 'HR', 'HU', 'IE', 'IL',
  'IQ', 'IR', 'IS', 'IT', 'JO', 'KW', 'KZ', 'LB', 'LC', 'LI', 'LT', 'LU',
  'LV', 'LY', 'MC', 'MD', 'ME', 'MK', 'MR', 'MT', 'MU', 'MZ', 'NL', 'NO',
  'OM', 'PK', 'PL', 'PS', 'PT', 'QA', 'RO', 'RS', 'RU', 'SA', 'SC', 'SD',
  'SE', 'SI', 'SK', 'SM', 'SO', 'ST', 'SV', 'TL', 'TN', 'TR', 'UA', 'VA',
  'VG', 'XK',
]);

/** Port of backend suggestAccountType — a pre-selection hint only; the
 *  corridor/rail configuration decides what is actually accepted. */
export function suggestAccountType(countryCode: string): BeneficiaryAccountType {
  const cc = (countryCode ?? '').trim().toUpperCase();
  if (cc === 'GB') return 'sort_code';
  if (cc === 'US') return 'aba';
  if (cc === 'IN') return 'ifsc';
  if (IBAN_REGISTRY_COUNTRIES.has(cc)) return 'iban';
  return 'swift_code';
}

// ── Beneficiary display ──────────────────────────────────────────────

function coerceField(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** Masked account tail for list rows — last 4 of the IBAN or account
 *  number only; never renders a full credential. Returns '' when the
 *  fields carry nothing maskable. */
export function maskedAccountTail(beneficiary: BeneficiaryPayload): string {
  const fields = beneficiary.fields ?? {};
  const raw = coerceField(fields.iban) ?? coerceField(fields.accountNumber);
  if (!raw) return '';
  const digits = raw.replace(/[\s-]+/g, '');
  if (digits.length < 4) return '••••';
  return `•••• ${digits.slice(-4)}`;
}

// ── Transfer state grammar ───────────────────────────────────────────
// States render verbatim from the wire; the label map only translates
// the SCREAMING_SNAKE code — an unknown state renders the raw code, never
// a guessed label.

export const TRANSFER_STATE_LABELS: Record<string, string> = {
  QUOTE: 'Quote',
  AWAITING_FUNDS: 'Awaiting funds',
  FUNDED: 'Funded',
  PROCESSING: 'Processing',
  CONVERTED: 'Converted',
  PAID_OUT: 'Paid out',
  DELIVERED: 'Delivered',
  BOUNCED: 'Bounced',
  REFUNDED: 'Refunded',
  CANCELLED: 'Cancelled',
  FAILED: 'Failed',
};

export function transferStateLabel(state: string): string {
  return TRANSFER_STATE_LABELS[state] ?? state;
}

export type TransferStateTone = 'neutral' | 'progress' | 'success' | 'danger';

/** Visual tone per state — processing/in-flight states stay amber-neutral,
 *  terminal failures red. PROCESSING is *funded but not yet paid out*;
 *  it is never presented as delivered. */
export function transferStateTone(state: string): TransferStateTone {
  switch (state) {
    case 'PAID_OUT':
    case 'DELIVERED':
      return 'success';
    case 'FAILED':
    case 'BOUNCED':
      return 'danger';
    case 'CANCELLED':
    case 'REFUNDED':
      return 'neutral';
    default:
      return 'progress';
  }
}

/** One honest line describing what a state means for the sender. */
export function transferStateDescription(state: string): string {
  switch (state) {
    case 'PROCESSING':
      return "Processing — the funds have left your pocket. We'll update this transfer when the payout completes.";
    case 'QUOTE':
    case 'AWAITING_FUNDS':
      return 'Awaiting funds — this transfer has not been funded yet.';
    case 'FUNDED':
      return 'Funded — queued for the payout rail.';
    case 'CONVERTED':
      return 'Converted — the currency exchange completed; payout is next.';
    case 'PAID_OUT':
      return 'Paid out — handed to the payout rail for delivery.';
    case 'DELIVERED':
      return 'Delivered — the payout rail confirmed receipt.';
    case 'BOUNCED':
      return 'Bounced — the payout was rejected and the funds returned.';
    case 'REFUNDED':
      return 'Refunded — the funds were returned to your pocket.';
    case 'CANCELLED':
      return 'Cancelled — any funded amount was returned to your pocket.';
    case 'FAILED':
      return 'Failed — the transfer could not be completed.';
    default:
      return state;
  }
}

/** source → target amounts, formatted straight off the wire strings. */
export function transferAmountsLabel(transfer: {
  sourceAmountMinor: string;
  sourceCurrency: string;
  targetAmountMinor: string;
  targetCurrency: string;
}): string {
  const source = formatMinorAmount(transfer.sourceAmountMinor, transfer.sourceCurrency);
  const target = formatMinorAmount(transfer.targetAmountMinor, transfer.targetCurrency);
  return source === target ? source : `${source} → ${target}`;
}

// ── Shared small helpers ─────────────────────────────────────────────

/** Currency-aware decimal input — 0-dp currencies (JPY…) take no dot.
 *  Same rule as the exchange surface's amount field. */
export function sanitizeAmountInput(raw: string, currency: string): string {
  const exponent = currencyMinorExponent(currency);
  const dot = raw.indexOf('.');
  const head = (dot === -1 ? raw : raw.slice(0, dot)).replace(/\D/g, '').slice(0, 9);
  if (dot === -1 || exponent === 0) return head;
  const tail = raw
    .slice(dot + 1)
    .replace(/\D/g, '')
    .slice(0, exponent);
  return `${head}.${tail}`;
}

/** Server timestamps arrive as ISO-8601 or PG text — normalise before
 *  formatting (same rule as ExchangeView). */
export function formatTimestamp(iso: string | null): string {
  const ms = parseServerTimestamp(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** One idempotency key per logical write attempt — minted per input set,
 *  deliberately reused on retry so the server replays the commit. */
export function newAttemptKey(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `trf_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
