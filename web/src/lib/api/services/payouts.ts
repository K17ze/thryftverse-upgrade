/**
 * Web payouts service — mirrors the payout surface of
 * frontend/src/services/walletApi.ts: payout accounts (Stripe Connect
 * destinations), payout requests signed with an idempotency key, and the
 * lookup-by-key reconciliation used when a POST response is lost.
 *
 * Routes (backend/api/src/index.ts):
 *  - GET/POST /users/:userId/payout-accounts            (~25699 / ~25760)
 *  - GET     /users/:userId/payout-requests             (~26764)
 *  - GET     /users/:userId/payout-requests/:requestId  (~26815)
 *  - GET     /users/:userId/payout-requests/lookup-by-key/:key (~26884)
 *  - POST    /users/:userId/payout-requests             (~26939)
 *  - POST    /users/:userId/stripe-connect/account      (~26411)
 *  - POST    /users/:userId/stripe-connect/onboarding-link (~26481)
 *  - GET     /users/:userId/stripe-connect/status       (~26537)
 *
 * Truth-first: there is no client-side bank-detail capture in live mode —
 * the backend only accepts a provider-side reference (Stripe Connect), so
 * "add a payout method" is the real Stripe Connect onboarding sequence.
 */

import { fetchJson, parseApiError } from '../http';

// ── Wire shapes — identical to mobile walletApi.ts ────────────────────

export interface MoneyPayload {
  currency: string;
  minorAmount: string;
  exponent: number;
  registryVersion: string;
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

export type PayoutRequestStatus =
  | 'requested'
  | 'processing'
  | 'paid'
  | 'failed'
  | 'cancelled';

export interface PayoutRequestPayload {
  id: string;
  userId: string;
  payoutAccountId: number;
  amountGbp: number;
  amountCurrency: string;
  money: MoneyPayload | null;
  status: PayoutRequestStatus;
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

interface ListPayoutAccountsResponse {
  ok: true;
  items: PayoutAccountPayload[];
}

interface CreatePayoutAccountResponse {
  ok: true;
  item: PayoutAccountPayload;
}

interface ListPayoutRequestsResponse {
  ok: true;
  items: PayoutRequestPayload[];
}

interface CreatePayoutRequestResponse {
  ok: true;
  idempotent?: boolean;
  payoutRequest: PayoutRequestPayload;
  balance?: {
    sellerPayableBeforeRequestGbp: number;
    sellerPayableAfterRequestGbp: number;
  };
}

export interface PayoutRequestResult {
  payoutRequest: PayoutRequestPayload;
  /** Server-computed seller_payable balance after the debit — the source
   *  of truth for the wallet hero; absent when the ledger tables are off. */
  sellerPayableAfterRequestGbp?: number;
  /** True when the server replayed an earlier same-key request. */
  idempotent?: boolean;
}

// ── Reads ─────────────────────────────────────────────────────────────

export async function listPayoutAccounts(
  userId: string,
  signal?: AbortSignal,
): Promise<PayoutAccountPayload[]> {
  const payload = await fetchJson<ListPayoutAccountsResponse>(
    `/users/${encodeURIComponent(userId)}/payout-accounts`,
    undefined,
    { signal },
  );
  return payload.items;
}

export async function listPayoutRequests(
  userId: string,
  options?: { limit?: number },
  signal?: AbortSignal,
): Promise<PayoutRequestPayload[]> {
  const query = options?.limit ? `?limit=${options.limit}` : '';
  const payload = await fetchJson<ListPayoutRequestsResponse>(
    `/users/${encodeURIComponent(userId)}/payout-requests${query}`,
    undefined,
    { signal },
  );
  return payload.items;
}

// ── Payout account creation ───────────────────────────────────────────

/**
 * POST /users/:userId/payout-accounts — the schema accepts a provider
 * reference, not raw bank details. For `stripe_americas` the provider ref
 * is resolved server-side from the user's Connect account (onboarding is
 * a prerequisite — PAYOUT_ONBOARDING_REQUIRED otherwise).
 */
export async function createPayoutAccount(
  userId: string,
  input: {
    gatewayId?: string;
    providerAccountRef?: string;
    countryCode?: string;
    currency?: string;
    status?: 'pending' | 'active' | 'disabled';
    metadata?: Record<string, unknown>;
  },
): Promise<PayoutAccountPayload> {
  const payload = await fetchJson<CreatePayoutAccountResponse>(
    `/users/${encodeURIComponent(userId)}/payout-accounts`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return payload.item;
}

// ── Stripe Connect onboarding — mirrors usePayoutAccountConnection ─────

export async function getStripeConnectStatus(
  userId: string,
): Promise<StripeConnectStatusPayload> {
  return fetchJson<{ ok: true } & StripeConnectStatusPayload>(
    `/users/${encodeURIComponent(userId)}/stripe-connect/status`,
  );
}

/** 409 means a Connect account already exists — the caller re-reads
 *  status, so a racing create is harmless. */
export async function createStripeConnectAccount(userId: string): Promise<void> {
  await fetchJson<{ ok: true; stripeAccountId: string; status: string }>(
    `/users/${encodeURIComponent(userId)}/stripe-connect/account`,
    { method: 'POST' },
  );
}

export async function createStripeConnectOnboardingLink(
  userId: string,
): Promise<{ onboardingUrl: string }> {
  return fetchJson<{ ok: true; onboardingUrl: string }>(
    `/users/${encodeURIComponent(userId)}/stripe-connect/onboarding-link`,
    { method: 'POST' },
  );
}

export type PayoutSetupOutcome =
  | { kind: 'ready'; account: PayoutAccountPayload }
  /** Stripe onboarding must finish in a separate tab — hand the URL to the
   *  sheet; the user clicks through, then re-runs this on return. */
  | { kind: 'onboarding_required'; onboardingUrl: string };

/**
 * The real payout-setup sequence (web port of mobile's
 * connectOrSyncPayoutAccount):
 *   status → create Connect account if missing → if payouts enabled,
 *   resolve/ensure the active payout_accounts row → otherwise mint an
 *   onboarding link for the handoff.
 * Throws the server's own error message when Stripe isn't configured or
 * the country policy doesn't allow payouts — never fabricates readiness.
 */
export async function connectStripePayout(userId: string): Promise<PayoutSetupOutcome> {
  let status = await getStripeConnectStatus(userId);

  if (!status.hasConnectAccount) {
    try {
      await createStripeConnectAccount(userId);
    } catch (error) {
      // 409 = account created concurrently — the status re-read resolves it.
      if (parseApiError(error).status !== 409) throw error;
    }
    status = await getStripeConnectStatus(userId);
  }

  if (status.payoutPolicySupported === false) {
    throw new Error(
      "Payouts aren't available for your country policy yet. Contact support if you think this is wrong.",
    );
  }

  if (status.payoutsEnabled) {
    const accounts = await listPayoutAccounts(userId);
    let account =
      accounts.find((a) => a.gatewayId === 'stripe_americas' && a.status === 'active') ??
      accounts.find((a) => a.status === 'active') ??
      null;
    if (!account) {
      account = await createPayoutAccount(userId, {
        gatewayId: 'stripe_americas',
        currency: 'GBP',
        metadata: { source: 'web_payout_setup' },
      });
    }
    if (account.status !== 'active') {
      // Provider verified but the row hasn't flipped — treat as pending,
      // still require another status pass rather than claiming ready.
      const link = await createStripeConnectOnboardingLink(userId);
      return { kind: 'onboarding_required', onboardingUrl: link.onboardingUrl };
    }
    return { kind: 'ready', account };
  }

  const link = await createStripeConnectOnboardingLink(userId);
  return { kind: 'onboarding_required', onboardingUrl: link.onboardingUrl };
}

// ── Payout request — idempotent submit + unknown-outcome reconcile ────

export class PayoutRequestError extends Error {
  /** The POST response was lost and the key lookup couldn't prove either
   *  way — the viewer must check payout activity before retrying. */
  outcomeUnknown?: boolean;
  /** The lookup proved nothing was recorded — a retry is safe. */
  safeToRetry?: boolean;
}

/** Fresh key for one user-initiated payout attempt. Every retry of the
 *  same attempt reuses it so the backend dedupe (payout_requests
 *  .idempotency_key + request_hash) replays instead of double-paying. */
export function newPayoutAttemptKey(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return `web-po-${rand}`;
}

export type PayoutLookupResult =
  | { status: 'acknowledged'; payoutRequest: PayoutRequestPayload }
  | { status: 'safe_to_retry' }
  | { status: 'processing' };

/** One lookup poll — 200 → committed; 404 → provably not committed;
 *  anything else → transient, keep polling. */
export async function lookupPayoutByIdempotencyKey(
  userId: string,
  idempotencyKey: string,
): Promise<PayoutLookupResult> {
  try {
    const payload = await fetchJson<{
      ok: true;
      status: 'acknowledged';
      payoutRequest: PayoutRequestPayload;
    }>(
      `/users/${encodeURIComponent(userId)}/payout-requests/lookup-by-key/${encodeURIComponent(idempotencyKey)}`,
      undefined,
      // Never let GET-dedup fold a poll into a stale in-flight response.
      { skipDedup: true },
    );
    return { status: 'acknowledged', payoutRequest: payload.payoutRequest };
  } catch (error) {
    if (parseApiError(error).status === 404) return { status: 'safe_to_retry' };
    return { status: 'processing' };
  }
}

const LOOKUP_MAX_ATTEMPTS = 8;
const LOOKUP_BASE_DELAY_MS = 1_500;
const LOOKUP_MAX_DELAY_MS = 10_000;

const waitMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Poll the lookup until it proves acknowledged / safe_to_retry or the
 *  budget runs out ('unresolved'). Mirrors services/auctions.ts
 *  reconcileBidOutcome. */
async function reconcilePayoutOutcome(
  userId: string,
  idempotencyKey: string,
): Promise<PayoutLookupResult | { status: 'unresolved' }> {
  let delayMs = LOOKUP_BASE_DELAY_MS;
  for (let attempt = 0; attempt < LOOKUP_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await waitMs(delayMs);
      delayMs = Math.min(delayMs * 2, LOOKUP_MAX_DELAY_MS);
    }
    const result = await lookupPayoutByIdempotencyKey(userId, idempotencyKey);
    if (result.status !== 'processing') return result;
  }
  return { status: 'unresolved' };
}

function toPayoutError(error: unknown, fallback: string): PayoutRequestError {
  const parsed = parseApiError(error, fallback);
  return new PayoutRequestError(parsed.message || fallback);
}

/** Ambiguous = the response may have been lost after the server committed:
 *  no response at all (network drop / timeout) or a 5xx. Mirrors the
 *  auctions.ts classification — except OFFLINE_WRITE_NOT_SUBMITTED, the
 *  client-side guard that blocked the write before it left. */
function isAmbiguousFailure(error: unknown): boolean {
  const parsed = parseApiError(error);
  if (parsed.code === 'OFFLINE_WRITE_NOT_SUBMITTED') return false;
  return parsed.isNetworkError || (parsed.status !== undefined && parsed.status >= 500);
}

/**
 * POST /users/:userId/payout-requests — GBP wallet withdrawals send
 * `amountGbp` (the schema takes exactly one of amountGbp|amount; GBP is
 * the seller-payable ledger currency). On an ambiguous failure the
 * idempotency key resolves the real outcome before anything surfaces —
 * a retry after a lost commit would double-pay without it.
 */
export async function submitPayoutRequest(
  userId: string,
  input: {
    payoutAccountId: number;
    amountGbp: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
    /** Fires once when the POST response was lost and the key lookup is
     *  polling — lets the UI switch from "submitting" to "confirming". */
    onReconciling?: () => void;
  },
): Promise<PayoutRequestResult> {
  try {
    const payload = await fetchJson<CreatePayoutRequestResponse>(
      `/users/${encodeURIComponent(userId)}/payout-requests`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payoutAccountId: input.payoutAccountId,
          amountGbp: input.amountGbp,
          amountCurrency: 'GBP',
          idempotencyKey: input.idempotencyKey,
          metadata: input.metadata,
        }),
      },
    );
    return {
      payoutRequest: payload.payoutRequest,
      sellerPayableAfterRequestGbp: payload.balance?.sellerPayableAfterRequestGbp,
      idempotent: payload.idempotent,
    };
  } catch (error) {
    if (!isAmbiguousFailure(error)) {
      throw toPayoutError(error, 'Unable to submit the withdrawal right now.');
    }

    input.onReconciling?.();
    const outcome = await reconcilePayoutOutcome(userId, input.idempotencyKey);
    if (outcome.status === 'acknowledged') {
      // The write committed before the response was lost — success,
      // replayed honestly from the recorded row.
      return { payoutRequest: outcome.payoutRequest, idempotent: true };
    }

    const err = toPayoutError(error, 'Unable to submit the withdrawal right now.');
    if (outcome.status === 'safe_to_retry') {
      err.safeToRetry = true;
      err.message = 'No withdrawal was recorded. Please try again.';
    } else {
      err.outcomeUnknown = true;
      err.message =
        'We lost the connection while submitting — check payout activity before trying again, in case it went through.';
    }
    throw err;
  }
}

// ── Wallet balances — ledger-backed money truth ───────────────────────
// GET /users/:userId/wallet/balances (backend/api/src/index.ts:20211) —
// seller_payable ledger + escrow pending + reserve holds, with a
// per-order release schedule. This is the number the withdraw composer
// must gate on: the /wallets/:id/snapshot read accepts a client-asserted
// blob and cannot authorise money UI (mobile useWithdrawData:34-58).

export interface WalletPendingBreakdownRow {
  orderId: string;
  listingTitle: string | null;
  amountGbp: number;
  orderStatus: string;
  deliveredAt: string | null;
  releaseScheduledAt: string | null;
}

export interface WalletBalances {
  availableGbp: number;
  pendingGbp: number;
  heldInReserveGbp: number;
  pendingBreakdown: WalletPendingBreakdownRow[];
}

interface WalletBalancesResponse {
  ok: true;
  balances: {
    availableGbp: number;
    pendingGbp: number;
    heldInReserveGbp: number;
  };
  pendingBreakdown?: WalletPendingBreakdownRow[];
}

export async function fetchWalletBalances(
  userId: string,
  signal?: AbortSignal,
): Promise<WalletBalances> {
  const payload = await fetchJson<WalletBalancesResponse>(
    `/users/${encodeURIComponent(userId)}/wallet/balances`,
    undefined,
    { signal },
  );
  return {
    availableGbp: payload.balances.availableGbp,
    pendingGbp: payload.balances.pendingGbp,
    heldInReserveGbp: payload.balances.heldInReserveGbp,
    pendingBreakdown: payload.pendingBreakdown ?? [],
  };
}

// ── Country capabilities — GET /users/:userId/capabilities ────────────
// (backend/api/src/routes/users.ts:72) — the resolved country policy
// profile behind mobile's capabilitiesApi.getUserCountryCapabilities.
// The withdraw surface gates its payout rail on `payouts.gatewayPriority`
// (native usePayoutAccountConnection) — a missing rail means "payouts
// unavailable for this country", not a failed setup attempt.

export interface UserCountryCapabilities {
  policyVersion: string;
  countryCode: string;
  residencyCountryCode: string | null;
  effectiveCountryCode: string;
  countryCluster: string;
  currency: {
    defaultCurrency: string;
    supportedCurrencies: string[];
  };
  payments: {
    methodTypes: string[];
  };
  payouts: {
    defaultCurrency: string;
    supportedCurrencies: string[];
    gatewayPriority: string[];
  };
}

interface UserCapabilitiesResponse {
  ok: true;
  userId: string;
  profile: {
    countryCode: string | null;
    residencyCountryCode: string | null;
    kycStatus: string;
  };
  capabilities: UserCountryCapabilities;
}

export async function getUserCountryCapabilities(
  userId: string,
  signal?: AbortSignal,
): Promise<UserCountryCapabilities> {
  const payload = await fetchJson<UserCapabilitiesResponse>(
    `/users/${encodeURIComponent(userId)}/capabilities`,
    undefined,
    { signal },
  );
  return payload.capabilities;
}

// ── 1ZE → fiat conversion — mirrors walletApi.getConvertQuote /
//    convertIzeToFiat ──────────────────────────────────────────────────
// POST /wallet/convert-1ze-to-fiat (index.ts:22494): `preview: true`
// returns the identical breakdown with no ledger mutation (MiCA EMT
// transparent-fee disclosure — the client never assumes a fee rate);
// execution claims the idempotency key inside the debit transaction
// (FIN-04) so a same-key retry replays the stored response instead of
// double-burning.

export interface ConvertQuotePayload {
  izeAmount: number;
  principalAmount: number;
  feeAmount: number;
  feeBps: number;
  netFiatAmount: number;
  fiatCurrency: string;
  rateUsed: number;
  fxRate?: number;
}

export interface ConvertWalletPayload {
  onezeBalanceUnits: number;
  onezeBalance: number;
  fiatBalanceMinor: number;
  fiatBalance: number;
  fiatCurrency?: string;
}

interface ConvertQuoteResponse {
  ok: true;
  conversion: ConvertQuotePayload;
}

export interface ConvertIzeToFiatResult {
  ok: true;
  userId: string;
  /** Post-conversion wallet balances — the server-computed truth the
   *  receipt and the wallet-cache mirror both read. */
  wallet: ConvertWalletPayload;
  conversion: ConvertQuotePayload;
}

/** Non-binding preview — same payload shape execution returns, no writes. */
export async function getConvertQuote(
  input: {
    userId: string;
    izeAmount: number;
    fiatCurrency?: string;
  },
  signal?: AbortSignal,
): Promise<ConvertQuoteResponse> {
  return fetchJson<ConvertQuoteResponse>(
    '/wallet/convert-1ze-to-fiat',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: input.userId,
        izeAmount: input.izeAmount,
        fiatCurrency: input.fiatCurrency ?? 'GBP',
        preview: true,
      }),
    },
    { signal },
  );
}

/** Fresh key for one user-initiated conversion attempt. A retry of the
 *  same attempt reuses it — the server claimed the key inside the debit
 *  transaction and replays the stored response, so a lost response can
 *  never burn the 1ZE balance twice. */
export function newConvertAttemptKey(): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  return `web-cv-${rand}`;
}

export async function convertIzeToFiat(input: {
  userId: string;
  izeAmount: number;
  fiatCurrency?: string;
  idempotencyKey: string;
}): Promise<ConvertIzeToFiatResult> {
  return fetchJson<ConvertIzeToFiatResult>(
    '/wallet/convert-1ze-to-fiat',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: input.userId,
        izeAmount: input.izeAmount,
        fiatCurrency: input.fiatCurrency ?? 'GBP',
        idempotencyKey: input.idempotencyKey,
      }),
    },
  );
}

// ── Fiat → 1ZE purchase — mirrors walletApi.buyIze ────────────────────
// POST /wallet/buy-1ze (index.ts:22850): debits the wallet's DEFAULT fiat
// pocket (the wallet_currency_balances row, mirrored into
// wallets.fiat_balance_minor) and mints 1ZE at USD-par minus the platform
// load fee. No preview endpoint exists — the fee discloses on the
// committed receipt (native AddMoneySheet's fiat-balance path labels the
// same figure an estimate). The idempotency key is claimed inside the
// debit transaction: a same-key retry replays the stored response, and
// 409 IDEMPOTENCY_IN_PROGRESS means the commit may have landed — retry
// with the SAME key, never a fresh one.

export interface BuyIzePurchasePayload {
  fiatAmount: number;
  principalFiat: number;
  feeFiat: number;
  feeBps: number;
  fiatCurrency: string;
  izeAmount: number;
  rateUsed: number;
}

export interface BuyIzeResult {
  ok: true;
  userId: string;
  wallet: ConvertWalletPayload;
  purchase: BuyIzePurchasePayload;
}

export async function buyIze(input: {
  userId: string;
  fiatAmount: number;
  fiatCurrency?: string;
  idempotencyKey: string;
}): Promise<BuyIzeResult> {
  return fetchJson<BuyIzeResult>(
    '/wallet/buy-1ze',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: input.userId,
        fiatAmount: input.fiatAmount,
        fiatCurrency: input.fiatCurrency ?? 'GBP',
        idempotencyKey: input.idempotencyKey,
      }),
    },
    // Money write — a lost response is recovered by replaying the same
    // key, never by a fresh POST.
    { maxRetries: 0 },
  );
}
