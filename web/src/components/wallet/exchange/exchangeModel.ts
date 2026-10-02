import {
  currencyMinorExponent,
  parseServerTimestamp,
  type FxQuotePayload,
  type WalletCurrencyPocket,
} from '@/lib/api/services/fx';
import {
  CURRENCIES,
  type SupportedCurrencyCode,
} from '@/lib/constants/currencies';
import { FEE_BPS, RATE_AS_OF } from '../convertViewModel';

export type ExchangeStep = 'compose' | 'review' | 'executing' | 'receipt' | 'error';

/** Server-side auto-refetch budget for expired quotes (mirrors native). */
export const MAX_AUTO_REFETCHES = 3;
/** Fixture quotes carry a demo TTL so the expiry path is exercisable. */
export const FIXTURE_QUOTE_TTL_MS = 60_000;
/** Fixture pocket seed — authored demo funds, GBP reconciles with shared cache. */
export const FIXTURE_FOREIGN_POCKETS: WalletCurrencyPocket[] = [
  { currency: 'USD', balanceMinor: 24000, version: 0 },
  { currency: 'EUR', balanceMinor: 9000, version: 0 },
  { currency: 'JPY', balanceMinor: 120000, version: 0 },
];

export function newAttemptKey(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `fx_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

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

export function formatTimestamp(iso: string): string {
  const ms = parseServerTimestamp(iso);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildFixtureQuote(
  source: SupportedCurrencyCode,
  target: SupportedCurrencyCode,
  amountMinorStr: string,
  attemptKey: string,
): FxQuotePayload {
  const rate = CURRENCIES[target].fxRatePerUnit / CURRENCIES[source].fxRatePerUnit;
  const exponentDelta = currencyMinorExponent(target) - currencyMinorExponent(source);
  const grossMinor = Math.round(Number(amountMinorStr) * rate * Math.pow(10, exponentDelta));
  const feeMinor = Math.round((grossMinor * FEE_BPS) / 10_000);
  const now = Date.now();
  return {
    id: `fxq-demo-${attemptKey.slice(0, 8)}`,
    sourceCurrency: source,
    targetCurrency: target,
    fixedSide: 'source',
    sourceAmountMinor: amountMinorStr,
    targetAmountMinor: String(Math.max(0, grossMinor - feeMinor)),
    midRate: String(rate),
    customerRate: String(rate),
    spreadBps: FEE_BPS,
    feeMinor: String(feeMinor),
    feeCurrency: target,
    rateSource: 'fixture',
    rateObservedAt: RATE_AS_OF,
    expiresAt: new Date(now + FIXTURE_QUOTE_TTL_MS).toISOString(),
    status: 'open',
    txId: null,
    executedAt: null,
  };
}
