import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// SEP21-FIN-A — shared PaymentSheet orchestration
//
// The auction winner-pay flow previously minted a PaymentIntent and polled
// `waitForPaymentIntentSettlement` without ever confirming it — the intent
// sat in requires_payment_method forever. The fix extracts checkout's
// init → present → (caller polls) sequence into services/paymentSheetFlow
// and wires the auction hook through it. These tests pin the shared
// contract: identical init parameters to canonical checkout, honest
// cancel handling, server-issued customer credentials, and the
// intent-scoped sheet endpoint.
// ─────────────────────────────────────────────────────────────────────────────

const initPaymentSheet = vi.fn();
const presentPaymentSheet = vi.fn();
const fetchJson = vi.fn();
const configureStripeMobile = vi.fn();

vi.mock('@stripe/stripe-react-native', () => ({
  initPaymentSheet: (...args: unknown[]) => initPaymentSheet(...args),
  presentPaymentSheet: (...args: unknown[]) => presentPaymentSheet(...args),
  PaymentSheetError: { Canceled: 'Canceled', Failed: 'Failed', Timeout: 'Timeout' },
}));

vi.mock('../lib/apiClient', () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
  // apiClient symbols the module may pull in transitively.
  isRecord: (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v),
}));

vi.mock('../platform/payments/stripeMobile', () => ({
  configureStripeMobile: (...args: unknown[]) => configureStripeMobile(...args),
  getStripeReturnUrl: () => 'thryftverse://payments/return',
}));

const {
  fetchPaymentIntentSheetConfig,
  presentStripePaymentSheet,
} = await import('../services/paymentSheetFlow');

const SHEET = {
  paymentIntentClientSecret: 'pi_123_secret_abc',
  customerId: 'cus_123',
  customerSessionClientSecret: 'cuss_secret_123',
  publishableKey: 'pk_test_123',
  merchantDisplayName: 'Thryftverse',
  merchantCountryCode: 'GB',
  currency: 'GBP',
  returnUrl: 'thryftverse://payments/return',
  applePayEnabled: false,
  googlePayEnabled: false,
};

describe('paymentSheetFlow — shared PaymentSheet orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initPaymentSheet.mockResolvedValue({ error: null });
    presentPaymentSheet.mockResolvedValue({ error: null });
    configureStripeMobile.mockResolvedValue(undefined);
  });

  it('fetches the sheet config from the intent-scoped v2 endpoint', async () => {
    fetchJson.mockResolvedValue({ ok: true, ...SHEET });

    const config = await fetchPaymentIntentSheetConfig('pi_123');

    expect(fetchJson).toHaveBeenCalledTimes(1);
    const [path, init] = fetchJson.mock.calls[0];
    expect(path).toBe('/v2/payments/intents/pi_123/sheet');
    expect(init.method).toBe('POST');
    expect(config.paymentIntentClientSecret).toBe('pi_123_secret_abc');
  });

  it('initialises the sheet with the same parameters as canonical checkout', async () => {
    const outcome = await presentStripePaymentSheet(SHEET);

    expect(outcome).toBe('completed');
    expect(configureStripeMobile).toHaveBeenCalledWith('pk_test_123');
    expect(initPaymentSheet).toHaveBeenCalledTimes(1);
    const params = initPaymentSheet.mock.calls[0][0];
    expect(params.merchantDisplayName).toBe('Thryftverse');
    expect(params.customerId).toBe('cus_123');
    expect(params.customerSessionClientSecret).toBe('cuss_secret_123');
    expect(params.paymentIntentClientSecret).toBe('pi_123_secret_abc');
    expect(params.returnURL).toBe('thryftverse://payments/return');
    expect(params.allowsDelayedPaymentMethods).toBe(false);
    expect(presentPaymentSheet).toHaveBeenCalledTimes(1);
  });

  it('returns cancelled honestly when the buyer dismisses the sheet', async () => {
    presentPaymentSheet.mockResolvedValue({
      error: { code: 'Canceled', message: 'dismissed' },
    });

    const outcome = await presentStripePaymentSheet(SHEET);

    expect(outcome).toBe('cancelled');
  });

  it('throws on presentation failure — never reports success on error', async () => {
    presentPaymentSheet.mockResolvedValue({
      error: { code: 'Failed', message: 'card declined' },
    });

    await expect(presentStripePaymentSheet(SHEET)).rejects.toThrow('card declined');
  });

  it('throws on init failure before the sheet is presented', async () => {
    initPaymentSheet.mockResolvedValue({
      error: { code: 'Failed', message: 'init failed' },
    });

    await expect(presentStripePaymentSheet(SHEET)).rejects.toThrow('init failed');
    expect(presentPaymentSheet).not.toHaveBeenCalled();
  });

  it('fires onSheetPresenting between init and present — canonical hook point', async () => {
    const order: string[] = [];
    initPaymentSheet.mockImplementation(async () => {
      order.push('init');
      return { error: null };
    });
    presentPaymentSheet.mockImplementation(async () => {
      order.push('present');
      return { error: null };
    });

    await presentStripePaymentSheet(SHEET, {
      onSheetPresenting: () => order.push('presenting'),
    });

    expect(order).toEqual(['init', 'presenting', 'present']);
  });
});

describe('paymentSheetFlow — auction winner-pay wiring (source contract)', () => {
  it('useAuctionDetail presents the shared sheet before settlement polling', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', 'hooks', 'useAuctionDetail.ts'),
      'utf8',
    );

    // The hook must route pending intents through the shared service —
    // never poll an unconfirmed intent on its own.
    expect(source).toContain("from '../services/paymentSheetFlow'");
    expect(source).toContain('fetchPaymentIntentSheetConfig');
    expect(source).toContain('presentStripePaymentSheet');
    // Sheet presentation must precede the authoritative settlement poll.
    const presentIdx = source.indexOf('presentStripePaymentSheet(sheetConfig)');
    const pollIdx = source.indexOf('waitForPaymentIntentSettlement(');
    expect(presentIdx).toBeGreaterThan(-1);
    expect(pollIdx).toBeGreaterThan(presentIdx);
    // Cancellation must return to unpaid state — never claim paid.
    expect(source).toContain("'cancelled'");
  });

  it('checkout delegates to the same shared service — no divergent sheet code', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '..', 'hooks', 'checkout', 'useCheckoutPaymentFlow.ts'),
      'utf8',
    );

    expect(source).toContain('presentStripePaymentSheet');
    // The sheet init must live in the service, not the hook.
    expect(source).not.toContain('initPaymentSheet(');
  });
});
