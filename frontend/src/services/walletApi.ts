import { fetchJson } from '../lib/apiClient';
import { ENABLE_RUNTIME_MOCKS } from '../constants/runtimeFlags';

export type PaymentIntentChannel =
  | 'commerce'
  | 'co-own'
  | 'wallet_topup'
  | 'wallet_withdrawal';

export type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface MoneyPayload {
  currency: string;
  minorAmount: string;
  exponent: number;
  registryVersion: string;
}

export interface PaymentIntentPayload {
  id: string;
  userId: string;
  gatewayId: string;
  channel: PaymentIntentChannel;
  orderId: string | null;
  coOwnOrderId: number | null;
  instrumentId: number | null;
  amountGbp: number;
  amountCurrency: string;
  money: MoneyPayload | null;
  status: PaymentIntentStatus;
  providerIntentRef: string | null;
  clientSecret: string | null;
  providerStatus: string | null;
  nextActionUrl: string | null;
  scaExpiresAt: string | null;
  settledAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutAccountPayload {
  id: number;
  userId: string;
  gatewayId: string;
  providerAccountRef: string;
  countryCode: string | null;
  currency: string;
  status: 'pending' | 'active' | 'disabled';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PayoutRequestPayload {
  id: string;
  userId: string;
  payoutAccountId: number;
  amountGbp: number;
  amountCurrency: string;
  money: MoneyPayload | null;
  status: 'requested' | 'processing' | 'paid' | 'failed' | 'cancelled';
  providerPayoutRef: string | null;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StripeConnectStatusPayload {
  hasConnectAccount: boolean;
  stripeAccountId?: string;
  status?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  onboardingUrl?: string | null;
  requirementsCurrentlyDue?: string[];
  payoutPolicySupported?: boolean;
}

export interface IzeQuotePayload {
  direction: 'mint' | 'burn';
  fiatCurrency: string;
  fiatAmount: number;
  netFiatAmount?: number;
  izeAmount: number;
  platformFeeRate?: number;
  platformFeeAmount?: number;
  /** At-par model: the fee in basis points (e.g. 200 = 2%). */
  feeBps?: number;
  /** At-par model: the principal amount before fee. */
  principalAmount?: number;
  /** At-par model (mint): principal + fee — total the user pays. */
  totalCost?: number;
  /** At-par model (burn): principal − fee — net the user receives. */
  netRedemption?: number;
  ratePerGram: number;
  rateSource: string;
  money: MoneyPayload;
  assetAmount: {
    asset: '1ZE';
    baseUnitAmount: string;
    baseUnit: 'units';
    scale: 3;
  };
}

export interface IzeFxQuotePayload {
  fromCurrency: string;
  toCurrency: string;
  inputAmount: number;
  fxRate: number;
  convertedAmount: number;
  source: 'identity' | 'xau_cross';
  referenceRates?: {
    from: {
      currency: string;
      ratePerGram: number;
      source: string;
      fetchedAt: string;
      expiresAt: string;
      isFallback: boolean;
      isOverride: boolean;
    };
    to: {
      currency: string;
      ratePerGram: number;
      source: string;
      fetchedAt: string;
      expiresAt: string;
      isFallback: boolean;
      isOverride: boolean;
    };
  };
}

interface IzeQuoteResponse {
  ok: true;
  quote: IzeQuotePayload;
}

interface IzeFxQuoteResponse {
  ok: true;
  quote: IzeFxQuotePayload;
}

interface CreatePaymentIntentResponse {
  ok: true;
  idempotent: boolean;
  intent: PaymentIntentPayload;
}

interface CreateIzeMintQuoteResponse {
  ok: true;
  operation: {
    id: string;
    state: string;
    fiatCurrency: string;
    fiatAmountMinor: number;
    fiatAmount: number;
    netFiatAmountMinor: number;
    netFiatAmount: number;
    platformFeeMinor: number;
    platformFeeAmount: number;
    izeAmountUnits: number;
    izeAmount: number;
    ratePerGram: number;
    rateSource: string;
    rateExpiresAt: string;
    paymentIntentId: string;
    /** At-par model: the principal fiat amount before fee (what becomes 1ZE). */
    principalAmount?: number;
    /** At-par model: the fee charged on load (transparent line item). */
    feeAmount?: number;
    /** At-par model: the fee in basis points (e.g. 200 = 2%). */
    feeBps?: number;
    /** At-par model: principal + fee — the total the user pays. */
    totalCost?: number;
  };
  intent: PaymentIntentPayload;
  quote: {
    validForSeconds: number;
    expiresAt: string;
  };
}

export interface StripeIntentSheetConfiguration {
  provider: 'stripe';
  intentId: string;
  channel: PaymentIntentChannel;
  paymentIntentClientSecret: string;
  customerId: string;
  customerSessionClientSecret: string;
  publishableKey: string;
  merchantDisplayName: string;
  merchantCountryCode: string;
  currency: string;
  returnUrl: string;
  applePayEnabled: boolean;
  googlePayEnabled: boolean;
}

interface ConfirmPaymentIntentResponse {
  ok: true;
  alreadyFinal: boolean;
  idempotent?: boolean;
  intent: PaymentIntentPayload;
}

interface ListPayoutAccountsResponse {
  ok: true;
  items: PayoutAccountPayload[];
}

interface CreatePayoutAccountResponse {
  ok: true;
  item: PayoutAccountPayload;
}

interface CreatePayoutRequestResponse {
  ok: true;
  payoutRequest: PayoutRequestPayload;
  balance?: {
    sellerPayableBeforeRequestGbp: number;
    sellerPayableAfterRequestGbp: number;
  };
}

interface ListPayoutRequestsResponse {
  ok: true;
  items: PayoutRequestPayload[];
}

function buildQuery(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    search.set(key, String(value));
  });

  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

interface MintIzeResponse {
  ok: true;
  operation: {
    id: string;
    type: 'mint';
    userId: string;
    fiatAmount: number;
    grossFiatAmount?: number;
    netFiatAmount?: number;
    platformFeeRate?: number;
    platformFeeAmount?: number;
    fiatCurrency: string;
    izeAmount: number;
    ratePerGram: number;
    rateSource: string;
  };
  balances: {
    userIze: number;
    outstandingIze: number;
    circulatingIze?: number;
    supplyDeltaIze?: number;
    supplyParityRatio?: number | null;
    liquidityBufferIze?: number | null;
  };
}

interface BurnIzeResponse {
  ok: true;
  operation: {
    id: string;
    type: 'burn';
    userId: string;
    fiatAmount: number;
    fiatCurrency: string;
    izeAmount: number;
    ratePerGram: number;
    rateSource: string;
  };
  balances: {
    userIze: number;
    outstandingIze: number;
    circulatingIze?: number;
    supplyDeltaIze?: number;
    supplyParityRatio?: number | null;
    liquidityBufferIze?: number | null;
  };
}

interface WalletIzePositionResponse {
  ok: true;
  userId: string;
  rate: {
    currency: string;
    ratePerGram: number;
    source: string;
    fetchedAt: string;
    expiresAt: string;
    isFallback: boolean;
    isOverride: boolean;
  };
  balances: {
    userIze: number;
    userFiatValue: number;
    availableIze: number;
    reservedForOrders: number;
    redemptionInProgress: number;
    otherHolds: number;
    pendingDeposit: number;
    unsettledSaleProceeds: number;
    settledCustomerClaim: number;
    withdrawable: number;
    safeguarded: boolean;
    safeguardingPartner: string | null;
    /** WS4: URL to the safeguarding evidence document. */
    safeguardingEvidenceUrl?: string | null;
    /** WS4: URL to the safeguarding terms. */
    safeguardingTermsUrl?: string | null;
    snapshotSequence: number;
    serverTimestamp: string;
    reconciliationState: 'reconciled' | 'reconciling' | 'break';
    outstandingIze: number;
    circulatingIze?: number;
    supplyDeltaIze?: number;
    supplyParityRatio?: number | null;
    liquidityBufferIze?: number | null;
  };
}

export async function getIzeQuote(input: {
  fiatCurrency?: string;
  fiatAmount?: number;
  izeAmount?: number;
  forceRefresh?: boolean;
}) {
  const providedCount = Number(input.fiatAmount !== undefined) + Number(input.izeAmount !== undefined);
  if (providedCount !== 1) {
    throw new Error('Provide exactly one of fiatAmount or izeAmount for getIzeQuote');
  }

  const query = buildQuery({
    fiatCurrency: input.fiatCurrency ?? 'GBP',
    fiatAmount: input.fiatAmount,
    izeAmount: input.izeAmount,
    forceRefresh: input.forceRefresh,
  });

  return fetchJson<IzeQuoteResponse>(`/wallet/1ze/quote${query}`);
}

export async function getIzeFxQuote(input: {
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  forceRefresh?: boolean;
}) {
  const query = buildQuery({
    fromCurrency: input.fromCurrency,
    toCurrency: input.toCurrency,
    amount: input.amount,
    forceRefresh: input.forceRefresh,
  });

  return fetchJson<IzeFxQuoteResponse>(`/wallet/1ze/fx-quote${query}`);
}

export async function createPaymentIntent(input: {
  userId?: string;
  gatewayId?: string;
  instrumentId?: number;
  channel: Extract<PaymentIntentChannel, 'wallet_topup' | 'wallet_withdrawal'>;
  money: Pick<MoneyPayload, 'currency' | 'minorAmount'>;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}) {
  return fetchJson<CreatePaymentIntentResponse>('/payments/intents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId,
      gatewayId: input.gatewayId,
      instrumentId: input.instrumentId,
      channel: input.channel,
      money: input.money,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata,
    }),
  });
}

export async function createIzeMintQuote(input: {
  userId?: string;
  fiatAmount: number;
  fiatCurrency: string;
  gatewayId?: string;
  instrumentId?: number;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}) {
  return fetchJson<CreateIzeMintQuoteResponse>('/wallet/1ze/mint/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function createStripeIntentSheet(intentId: string) {
  return fetchJson<StripeIntentSheetConfiguration & { ok: true }>(
    `/v2/payments/intents/${encodeURIComponent(intentId)}/sheet`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
}

export async function confirmPaymentIntent(
  intentId: string,
  input: {
    // simulateStatus is intentionally optional with NO default.
    // Defaulting to 'succeeded' is a payment-safety hazard: a production
    // caller that omits it would cause the backend to simulate a successful
    // payment and release funds/settle orders without a real provider
    // confirmation. Leave undefined when not explicitly provided so the
    // backend only processes real provider confirmations.
    simulateStatus?: 'processing' | 'succeeded' | 'failed' | 'cancelled';
    providerFeeGbp?: number;
    providerAttemptRef?: string;
    providerStatus?: string;
    nextActionUrl?: string;
    scaExpiresAt?: string;
    failureCode?: string;
    failureMessage?: string;
    // PAY-16: Required for terminal status confirmation in production.
    // The approver must be a different admin from the one making the request.
    approverId?: string;
    payload?: Record<string, unknown>;
  } = {}
) {
  return fetchJson<ConfirmPaymentIntentResponse>(
    `/payments/intents/${encodeURIComponent(intentId)}/confirm`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // No default — see comment on simulateStatus above. Passing through
        // undefined ensures the backend does not simulate any state.
        simulateStatus: input.simulateStatus,
        providerFeeGbp: input.providerFeeGbp,
        providerAttemptRef: input.providerAttemptRef,
        providerStatus: input.providerStatus,
        nextActionUrl: input.nextActionUrl,
        scaExpiresAt: input.scaExpiresAt,
        failureCode: input.failureCode,
        failureMessage: input.failureMessage,
        approverId: input.approverId,
        payload: input.payload,
      }),
    }
  );
}

export async function listPayoutAccounts(userId: string) {
  const payload = await fetchJson<ListPayoutAccountsResponse>(
    `/users/${encodeURIComponent(userId)}/payout-accounts`
  );

  return payload.items;
}

export async function createStripeConnectAccount(userId: string) {
  return fetchJson<{
    ok: true;
    stripeAccountId: string;
    status: string;
  }>(`/users/${encodeURIComponent(userId)}/stripe-connect/account`, {
    method: 'POST',
  });
}

export async function createStripeConnectOnboardingLink(userId: string) {
  return fetchJson<{
    ok: true;
    onboardingUrl: string;
  }>(`/users/${encodeURIComponent(userId)}/stripe-connect/onboarding-link`, {
    method: 'POST',
  });
}

export async function getStripeConnectStatus(userId: string) {
  return fetchJson<{ ok: true } & StripeConnectStatusPayload>(
    `/users/${encodeURIComponent(userId)}/stripe-connect/status`
  );
}

export async function createPayoutAccount(
  userId: string,
  input: {
    gatewayId?: string;
    providerAccountRef?: string;
    countryCode?: string;
    currency?: string;
    status?: 'pending' | 'active' | 'disabled';
    metadata?: Record<string, unknown>;
  }
) {
  const payload = await fetchJson<CreatePayoutAccountResponse>(
    `/users/${encodeURIComponent(userId)}/payout-accounts`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  );

  return payload.item;
}

export async function createPayoutRequest(
  userId: string,
  input: {
    payoutAccountId: number;
    amountGbp?: number;
    amount?: number;
    amountCurrency?: string;
    idempotencyKey?: string;
    metadata?: Record<string, unknown>;
  }
) {
  return fetchJson<CreatePayoutRequestResponse>(
    `/users/${encodeURIComponent(userId)}/payout-requests`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payoutAccountId: input.payoutAccountId,
        amountGbp: input.amountGbp,
        amount: input.amount,
        amountCurrency: input.amountCurrency ?? 'GBP',
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata,
      }),
    }
  );
}

export async function listPayoutRequests(
  userId: string,
  options?: { limit?: number }
) {
  const query = buildQuery({ limit: options?.limit });
  const payload = await fetchJson<ListPayoutRequestsResponse>(
    `/users/${encodeURIComponent(userId)}/payout-requests${query}`
  );
  return payload.items;
}

// ── Unknown-outcome reconciliation ──────────────────────────────────
//
// When a POST /users/:userId/payout-requests response is lost (network
// timeout), the client cannot tell whether the payout was created. This
// lookup resolves the ambiguity by querying the backend by idempotency key.
//
// Returns one of three states:
//   - 'acknowledged': the payout exists, body contains the payout request
//   - 'processing': the server returned a transient error (retry)
//   - 'safe_to_retry': no payout with this key exists (may resubmit)

import type { LookupResult } from '../hooks/useUnknownOutcomeReconciliation';

export async function lookupPayoutByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): Promise<LookupResult<PayoutRequestPayload>> {
  try {
    const payload = await fetchJson<{ ok: true; status: 'acknowledged'; payoutRequest: PayoutRequestPayload }>(
      `/users/${encodeURIComponent(userId)}/payout-requests/lookup-by-key/${encodeURIComponent(idempotencyKey)}`,
    );
    return { status: 'acknowledged', value: payload.payoutRequest };
  } catch (error: unknown) {
    const status = (error as { status?: number }).status;
    if (status === 404) {
      return { status: 'safe_to_retry' };
    }
    return { status: 'processing' };
  }
}

export async function mintIze(input: {
  userId: string;
  fiatAmount: number;
  fiatCurrency?: string;
  paymentIntentId?: string;
  metadata?: Record<string, unknown>;
}) {
  return fetchJson<MintIzeResponse>('/wallet/1ze/mint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function burnIze(input: {
  userId: string;
  izeAmount: number;
  fiatCurrency?: string;
  payoutRequestId?: string;
  metadata?: Record<string, unknown>;
}) {
  return fetchJson<BurnIzeResponse>('/wallet/1ze/burn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function getIzePosition(userId: string, fiatCurrency = 'GBP') {
  try {
    return await fetchJson<WalletIzePositionResponse>(
      `/wallet/1ze/${encodeURIComponent(userId)}/position?fiatCurrency=${encodeURIComponent(fiatCurrency)}`
    );
  } catch (err) {
    // SAFETY: This mock fallback must NEVER be reachable in production builds.
    // It fabricates a position with `safeguarded: true`, which could mask a
    // real custody/funds failure if surfaced to users. The ENABLE_RUNTIME_MOCKS
    // flag is expected to be false in production; this branch is a defensive
    // guard only. Verify your build pipeline strips ENABLE_RUNTIME_MOCKS in
    // release builds.
    if (ENABLE_RUNTIME_MOCKS) {
      console.warn('[walletApi] /wallet/1ze/position failed — returning dev mock fallback:', err instanceof Error ? err.message : err);
      const now = new Date();
      const expires = new Date(now.getTime() + 60_000);
      return {
        ok: true as const,
        userId,
        rate: {
          currency: fiatCurrency,
          ratePerGram: 1,
          source: 'fixed_par:GBP:1ZE',
          fetchedAt: now.toISOString(),
          expiresAt: expires.toISOString(),
          isFallback: true,
          isOverride: false,
        },
        balances: {
          userIze: 2_659.574,
          userFiatValue: 2_659.574,
          availableIze: 2_659.574,
          reservedForOrders: 0,
          redemptionInProgress: 0,
          otherHolds: 0,
          pendingDeposit: 0,
          unsettledSaleProceeds: 0,
          settledCustomerClaim: 2_659.574,
          withdrawable: 2_659.574,
          safeguarded: true,
          safeguardingPartner: 'ThryftVerse Custody Ltd',
          safeguardingEvidenceUrl: 'https://thryftverse.app/custody/evidence',
          safeguardingTermsUrl: 'https://thryftverse.app/custody/terms',
          snapshotSequence: 0,
          serverTimestamp: now.toISOString(),
          reconciliationState: 'reconciling' as const,
          outstandingIze: 0,
          circulatingIze: 1_000_000_000,
          supplyDeltaIze: 0,
          supplyParityRatio: 1,
          liquidityBufferIze: 50_000_000,
        },
      };
    }
    throw err;
  }
}

// Convert 1ze to Fiat (for withdrawal)
//
// At-par model: 1 1ZE = $1.00 USD with a transparent
// FX spread disclosed in basis points. The backend returns the full
// breakdown — principal, fee, net — so the client never hardcodes a fee rate.
export interface ConvertQuotePayload {
  izeAmount: number;
  principalAmount: number;
  feeAmount: number;
  feeBps: number;
  netFiatAmount: number;
  fiatCurrency: string;
  rateUsed: number;
}

interface ConvertIzeToFiatResponse {
  ok: true;
  userId: string;
  wallet: {
    onezeBalanceUnits: number;
    onezeBalance: number;
    fiatBalanceMinor: number;
    fiatBalance: number;
  };
  conversion: ConvertQuotePayload;
}

interface ConvertQuoteResponse {
  ok: true;
  conversion: ConvertQuotePayload;
}

/**
 * Fetch a non-binding preview quote for converting 1ZE → fiat.
 *
 * Calls the same `/wallet/convert-1ze-to-fiat` endpoint with a `preview`
 * flag so no ledger mutation occurs. The returned `conversion` shape is
 * identical to the real execution response, giving the UI an exact
 * principal/fee/net breakdown to disclose before confirmation (MiCA EMT
 * transparent-fee requirement).
 */
export async function getConvertQuote(input: {
  userId: string;
  izeAmount: number;
  fiatCurrency?: string;
}) {
  return fetchJson<ConvertQuoteResponse>('/wallet/convert-1ze-to-fiat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId,
      izeAmount: input.izeAmount,
      fiatCurrency: input.fiatCurrency ?? 'GBP',
      preview: true,
    }),
  });
}

export async function convertIzeToFiat(input: {
  userId: string;
  izeAmount: number;
  fiatCurrency?: string;
  idempotencyKey?: string;
}) {
  return fetchJson<ConvertIzeToFiatResponse>('/wallet/convert-1ze-to-fiat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId,
      izeAmount: input.izeAmount,
      fiatCurrency: input.fiatCurrency ?? 'GBP',
      idempotencyKey: input.idempotencyKey,
    }),
  });
}

// Buy 1ze using Fiat Balance
//
// At-par model: the user pays principal + fee and receives principal in 1ZE.
// The backend returns the transparent breakdown so the UI can disclose the
// fee in basis points before confirmation (MiCA EMT).
interface BuyIzeResponse {
  ok: true;
  userId: string;
  wallet: {
    onezeBalanceUnits: number;
    onezeBalance: number;
    fiatBalanceMinor: number;
    fiatBalance: number;
  };
  purchase: {
    fiatAmount: number;
    /** Principal fiat amount — the portion that becomes 1ZE at par. */
    principalFiat: number;
    /** Fee charged on load (transparent line item). */
    feeFiat: number;
    /** Fee in basis points (e.g. 200 = 2%). */
    feeBps: number;
    fiatCurrency: string;
    izeAmount: number;
    rateUsed: number;
  };
}

export async function buyIze(input: {
  userId: string;
  fiatAmount: number;
  fiatCurrency?: string;
  idempotencyKey?: string;
}) {
  return fetchJson<BuyIzeResponse>('/wallet/buy-1ze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: input.userId,
      fiatAmount: input.fiatAmount,
      fiatCurrency: input.fiatCurrency ?? 'GBP',
      idempotencyKey: input.idempotencyKey,
    }),
  });
}

interface WalletSnapshotResponse {
  ok: true;
  keyVersion: number;
  createdAt: string;
  snapshot: {
    userId: string;
    balanceGbp: number;
    availableGbp: number;
    pendingGbp: number;
    currency: string;
    updatedAt?: string;
  };
  payoutSummary: {
    currentPendingWithdrawalGbp: number;
    cumulativeWithdrawnGbp: number;
  };
}

export async function getWalletSnapshot(userId: string) {
  return fetchJson<WalletSnapshotResponse>(`/wallets/${encodeURIComponent(userId)}/snapshot`);
}

// ── Seller wallet: pending vs available balance ───────────────────────
export interface SellerWalletBalanceItem {
  orderId: string;
  listingTitle: string | null;
  amountGbp: number;
  orderStatus: string;
  deliveredAt: string | null;
  releaseScheduledAt: string | null;
}

export interface SellerWalletBalancesResponse {
  ok: true;
  balances: {
    availableGbp: number;
    pendingGbp: number;
    heldInReserveGbp: number;
  };
  pendingBreakdown: SellerWalletBalanceItem[];
}

export async function getSellerWalletBalances(userId: string) {
  return fetchJson<SellerWalletBalancesResponse>(
    `/users/${encodeURIComponent(userId)}/wallet/balances`
  );
}

export interface WalletLedgerItem {
  id: number;
  walletId: string;
  txId: string;
  asset: string;
  amount: number;
  amountDisplay: number;
  balanceAfter: number;
  balanceAfterDisplay: number;
  kind: string;
  refType: string | null;
  refId: string | null;
  anchorValueInInr: number | null;
  goldRateInrPerG: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface WalletLedgerResponse {
  ok: true;
  wallet: unknown;
  items: WalletLedgerItem[];
}

export async function getWalletLedger(
  userId: string,
  options?: { asset?: 'ALL' | '1ZE' | 'FIAT'; limit?: number }
) {
  const params = new URLSearchParams();
  params.set('asset', options?.asset ?? 'ALL');
  params.set('limit', String(options?.limit ?? 100));
  return fetchJson<WalletLedgerResponse>(
    `/wallet/1ze/${encodeURIComponent(userId)}/ledger?${params.toString()}`
  );
}
