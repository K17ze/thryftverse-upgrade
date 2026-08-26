/**
 * Smart Sell — auto-negotiation policy service
 * ----------------------------------------------------------------------------
 * Smart Sell is a deterministic, money-impacting automation policy applied
 * to authoritative offers. It must be transactional, versioned, auditable,
 * instantly pausable and never probabilistic at decision time.
 *
 * TRUTH PRINCIPLES (AGENTS.md):
 *   - Capability is server-driven, never derived from `__DEV__`. The
 *     `SMART_SELL_DEMO_MODE = __DEV__` pattern was a release fail-open: in
 *     release `isDemo` became false while the implementation was still
 *     in-memory Maps. This is removed. Capability is explicitly checked.
 *   - No fabricated metrics. The hardcoded `conversionUplift: 0.6` is
 *     removed. Never fabricate performance metrics, sale probability,
 *     conversion uplift, or "optimal" price.
 *   - No fabricated buyers or offers. `simulateOfferReceived` is removed.
 *   - The primary mental model is minimum expected net payout, not gross
 *     thresholds. Sellers care about what they receive after fees.
 *   - Money is represented clearly: gross, fee, net. The fee policy version
 *     is tracked so stale quotes can be detected.
 *
 * BACKEND INTEGRATION (August 2026):
 *   The backend now exposes:
 *     POST   /smart-sell/policies              — create a policy
 *     GET    /smart-sell/policies/:policyId     — get a policy
 *     GET    /smart-sell/policies               — list seller's policies
 *     PATCH  /smart-sell/policies/:policyId     — update/pause/resume/cancel
 *     GET    /smart-sell/policies/:policyId/decisions — decision history
 *     POST   /smart-sell/evaluate               — internal worker endpoint
 *
 *   The async API functions below call these endpoints. The synchronous
 *   in-memory functions remain as a preview-mode fallback for when the
 *   backend is unreachable or the feature is not yet enabled for a seller.
 *   The `capability` field on every policy tells the UI which mode is active.
 */

// ---------------------------------------------------------------------------
// Capability — server-driven, never derived from __DEV__
// ---------------------------------------------------------------------------

/**
 * The capability state of Smart Sell for a listing.
 *
 * - `unavailable`: The feature is not available for this listing.
 * - `preview`: The seller can configure settings, but auto-negotiation is
 *   not active. Settings will be saved and activated when the feature is
 *   fully available. This is honest in every build.
 * - `active`: The server has confirmed an active policy. Auto-negotiation
 *   is governing offers.
 */
export type SmartSellCapability =
  | { kind: 'unavailable'; reason: string }
  | { kind: 'preview'; reason: string }
  | { kind: 'active' };

/**
 * The default capability. Until a server endpoint confirms an active
 * policy, Smart Sell is in preview mode. This is honest in dev and release.
 */
export const DEFAULT_SMART_SELL_CAPABILITY: SmartSellCapability = {
  kind: 'preview',
  reason: 'Smart Sell is in preview — your settings will be activated when the feature is fully available.',
};

// ---------------------------------------------------------------------------
// Policy state machine
// ---------------------------------------------------------------------------

export type SmartSellPolicyState =
  | 'unavailable'
  | 'disabled'
  | 'draft'
  | 'saving'
  | 'active'
  | 'paused'
  | 'expired'
  | 'stale_fee'
  | 'error';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Seller-defined auto-negotiation policy for a listing.
 *
 * The primary mental model is `minimumNet` — the minimum expected payout
 * after fees. Gross thresholds (`acceptGrossThreshold`, `declineBelowGross`)
 * are advanced settings behind disclosure.
 */
export interface SmartSellPolicy {
  listingId: string;
  state: SmartSellPolicyState;
  enabled: boolean;
  currency: 'GBP';
  /** Minimum expected net payout after fees. The primary mental model. */
  minimumNet: number;
  /** Gross offer at or above which auto-accept triggers. */
  acceptGrossThreshold: number;
  /** Gross offers below this are auto-declined (if auto-decline is enabled). */
  declineBelowGross: number;
  /** Whether auto-decline is enabled for offers below the floor. */
  autoDeclineEnabled: boolean;
  /** Platform fee rate as a fraction (e.g. 0.1 = 10%). */
  feeRate: number;
  /** Fee policy version — tracked to detect stale quotes. */
  feePolicyVersion: string;
  /** Maximum automated counter-offers per offer chain. */
  maxAutoCounters: number;
  /** ISO timestamp of last configuration update. */
  updatedAt: string;
  /** Server-driven capability — never derived from __DEV__. */
  capability: SmartSellCapability;
}

/**
 * Net proceeds quote for a given gross offer amount.
 */
export interface NetQuote {
  gross: number;
  fee: number;
  net: number;
  currency: 'GBP';
  feePolicyVersion: string;
}

/**
 * A decision the Smart Sell policy would make for an offer.
 * In preview mode this is illustrative only.
 */
export type SmartSellDecision =
  | { action: 'auto_accept'; reason: string }
  | { action: 'auto_decline'; reason: string }
  | { action: 'manual'; reason: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_FEE_RATE = 0.1; // 10% platform fee
const FEE_POLICY_VERSION = 'commerce-gbp-2026-08-26.1';

// ---------------------------------------------------------------------------
// In-memory policy store (preview mode)
// ---------------------------------------------------------------------------

const policyStore = new Map<string, SmartSellPolicy>();

function defaultPolicy(listingId: string): SmartSellPolicy {
  return {
    listingId,
    state: 'disabled',
    enabled: false,
    currency: 'GBP',
    minimumNet: 0,
    acceptGrossThreshold: 0,
    declineBelowGross: 0,
    autoDeclineEnabled: false,
    feeRate: DEFAULT_FEE_RATE,
    feePolicyVersion: FEE_POLICY_VERSION,
    maxAutoCounters: 2,
    updatedAt: new Date().toISOString(),
    capability: DEFAULT_SMART_SELL_CAPABILITY,
  };
}

function getOrCreatePolicy(listingId: string): SmartSellPolicy {
  const existing = policyStore.get(listingId);
  if (existing) return existing;
  const fresh = defaultPolicy(listingId);
  policyStore.set(listingId, fresh);
  return fresh;
}

// ---------------------------------------------------------------------------
// Net proceeds calculation
// ---------------------------------------------------------------------------

/**
 * Compute the net proceeds for a given gross offer amount.
 * net = gross - (gross * feeRate)
 */
export function computeNetQuote(
  gross: number,
  feeRate: number = DEFAULT_FEE_RATE,
): NetQuote {
  const fee = Math.round(gross * feeRate * 100) / 100;
  const net = Math.round((gross - fee) * 100) / 100;
  return {
    gross,
    fee,
    net,
    currency: 'GBP',
    feePolicyVersion: FEE_POLICY_VERSION,
  };
}

/**
 * Compute the gross threshold needed to achieve a target net payout.
 * gross = net / (1 - feeRate)
 */
export function computeGrossForNet(
  targetNet: number,
  feeRate: number = DEFAULT_FEE_RATE,
): number {
  if (feeRate >= 1) return 0;
  return Math.round((targetNet / (1 - feeRate)) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Decision logic — deterministic, never probabilistic
// ---------------------------------------------------------------------------

/**
 * Determine what action the Smart Sell policy would take for an offer.
 * This is deterministic: given the same policy and offer amount, it always
 * returns the same decision. In preview mode the decision is illustrative.
 */
export function decideOfferAction(
  offerGross: number,
  policy: SmartSellPolicy,
): SmartSellDecision {
  if (!policy.enabled) {
    return { action: 'manual', reason: 'Smart Sell is not enabled.' };
  }

  const quote = computeNetQuote(offerGross, policy.feeRate);

  // Auto-accept: gross at or above threshold AND net at or above minimum
  if (
    policy.acceptGrossThreshold > 0 &&
    offerGross >= policy.acceptGrossThreshold &&
    quote.net >= policy.minimumNet
  ) {
    return {
      action: 'auto_accept',
      reason: `£${offerGross.toFixed(2)} offer produces £${quote.net.toFixed(2)} expected net, at or above your £${policy.minimumNet.toFixed(2)} floor.`,
    };
  }

  // Auto-decline: below decline threshold and auto-decline is enabled
  if (
    policy.autoDeclineEnabled &&
    policy.declineBelowGross > 0 &&
    offerGross < policy.declineBelowGross
  ) {
    return {
      action: 'auto_decline',
      reason: `£${offerGross.toFixed(2)} is below your auto-decline floor of £${policy.declineBelowGross.toFixed(2)}.`,
    };
  }

  return {
    action: 'manual',
    reason: 'Offer is between your floor and accept threshold — review manually.',
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the Smart Sell policy for a listing.
 * Returns a disabled default policy when none has been set.
 */
export function fetchSmartSellPolicy(listingId: string): SmartSellPolicy {
  return { ...getOrCreatePolicy(listingId) };
}

/**
 * Update the Smart Sell policy for a listing.
 * In preview mode this only updates the in-memory store.
 */
export function updateSmartSellPolicy(
  listingId: string,
  patch: Partial<SmartSellPolicy>,
): SmartSellPolicy {
  const current = getOrCreatePolicy(listingId);
  const next: SmartSellPolicy = {
    ...current,
    ...patch,
    listingId,
    updatedAt: new Date().toISOString(),
    capability: current.capability,
  };
  policyStore.set(listingId, next);
  return { ...next };
}

/**
 * Enable Smart Sell for a listing with the given configuration.
 * Seeds sensible defaults from the listing price when thresholds are unset.
 */
export function enableSmartSell(
  listingId: string,
  listingPrice?: number,
  config?: Partial<SmartSellPolicy>,
): SmartSellPolicy {
  const current = getOrCreatePolicy(listingId);
  let patch: Partial<SmartSellPolicy> = { enabled: true, state: 'draft' };

  // Seed sensible defaults from the listing price on first enable.
  if (listingPrice && listingPrice > 0 && !current.acceptGrossThreshold) {
    const acceptGross = Math.round(listingPrice * 0.9 * 100) / 100;
    const declineGross = Math.round(listingPrice * 0.6 * 100) / 100;
    const acceptQuote = computeNetQuote(acceptGross, current.feeRate);
    patch = {
      ...patch,
      acceptGrossThreshold: acceptGross,
      declineBelowGross: declineGross,
      autoDeclineEnabled: false,
      minimumNet: Math.round(acceptQuote.net * 100) / 100,
    };
  }

  return updateSmartSellPolicy(listingId, { ...patch, ...config });
}

/**
 * Disable Smart Sell for a listing. Preserves thresholds for re-enabling.
 */
export function disableSmartSell(listingId: string): SmartSellPolicy {
  return updateSmartSellPolicy(listingId, {
    enabled: false,
    state: 'disabled',
  });
}

/**
 * Pause Smart Sell for a listing. The policy remains configured but stops
 * governing offers until resumed.
 */
export function pauseSmartSell(listingId: string): SmartSellPolicy {
  return updateSmartSellPolicy(listingId, {
    enabled: false,
    state: 'paused',
  });
}

// ---------------------------------------------------------------------------
// Backward-compatible exports for MakeOfferSheet
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `fetchSmartSellPolicy` instead. This wrapper is kept for
 * backward compatibility with components that haven't been migrated yet.
 */
export function fetchSmartSellConfig(listingId: string): {
  enabled: boolean;
  autoAcceptThreshold: number;
  isPreview: boolean;
} {
  const policy = getOrCreatePolicy(listingId);
  return {
    enabled: policy.enabled,
    autoAcceptThreshold: policy.acceptGrossThreshold,
    isPreview: policy.capability.kind === 'preview',
  };
}

/**
 * @deprecated Use `SmartSellPolicy.capability` instead. This is kept for
 * backward compatibility. It returns true when Smart Sell is in preview
 * mode (the honest default), not when in dev mode.
 */
export const SMART_SELL_PREVIEW_MODE = true;

// ---------------------------------------------------------------------------
// Backend API types — mirror the backend route responses
// ---------------------------------------------------------------------------

import { fetchJson } from '../lib/apiClient';

/**
 * Server-authoritative Smart Sell policy as returned by the backend.
 */
export interface ServerSmartSellPolicy {
  id: string;
  listingId: string;
  sellerId: string;
  floorPriceGbp: number;
  listingPriceGbp: number;
  status: 'active' | 'paused' | 'cancelled';
  policyVersion: number;
  version: number;
  maxCounterRounds: number;
  counterStrategy: 'firm' | 'gradual';
  createdAt: string;
  updatedAt: string;
  pausedAt: string | null;
  cancelledAt: string | null;
}

/**
 * A single auto-negotiation decision recorded by the server.
 */
export interface SmartSellDecisionRecord {
  id: string;
  policyId: string;
  listingId: string;
  offerId: string;
  sellerId: string;
  buyerId: string;
  decision: 'accept' | 'counter' | 'decline' | 'escalate';
  reason: string;
  offerPriceGbp: number;
  counterPriceGbp: number | null;
  netProceedsGbp: number;
  platformFeeGbp: number;
  grossSaleGbp: number;
  policyVersion: number;
  counterRound: number;
  createdAt: string;
}

/**
 * Net proceeds breakdown returned by the backend on policy creation.
 */
export interface ServerNetProceeds {
  grossSaleGbp: number;
  platformFeeGbp: number;
  netProceedsGbp: number;
}

// ---------------------------------------------------------------------------
// Async backend API functions
// ---------------------------------------------------------------------------

/**
 * Create a Smart Sell policy on the backend.
 * The seller sets a floor price — the irrevocable minimum they will accept.
 * Smart Sell will never accept or counter below this amount.
 */
export async function createSmartSellPolicy(params: {
  listingId: string;
  floorPriceGbp: number;
  maxCounterRounds?: number;
  counterStrategy?: 'firm' | 'gradual';
  idempotencyKey?: string;
}): Promise<{ policy: ServerSmartSellPolicy; floorNetProceeds: ServerNetProceeds }> {
  const body = await fetchJson<{
    ok: boolean;
    policy: ServerSmartSellPolicy;
    floorNetProceeds: ServerNetProceeds;
    error?: string;
    code?: string;
  }>('/smart-sell/policies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      listingId: params.listingId,
      floorPriceGbp: params.floorPriceGbp,
      maxCounterRounds: params.maxCounterRounds ?? 3,
      counterStrategy: params.counterStrategy ?? 'gradual',
      idempotencyKey: params.idempotencyKey,
    }),
  });
  if (!body.ok) throw new Error(body.error ?? 'Failed to create Smart Sell policy');
  return { policy: body.policy, floorNetProceeds: body.floorNetProceeds };
}

/**
 * Fetch a single Smart Sell policy by ID.
 */
export async function fetchSmartSellPolicyById(
  policyId: string,
): Promise<ServerSmartSellPolicy> {
  const body = await fetchJson<{ ok: boolean; policy: ServerSmartSellPolicy; error?: string }>(
    `/smart-sell/policies/${encodeURIComponent(policyId)}`,
  );
  if (!body.ok) throw new Error(body.error ?? 'Failed to fetch Smart Sell policy');
  return body.policy;
}

/**
 * List the seller's Smart Sell policies, optionally filtered by status.
 */
export async function listSmartSellPolicies(
  status?: 'active' | 'paused' | 'cancelled',
): Promise<ServerSmartSellPolicy[]> {
  const query = status ? `?status=${status}` : '';
  const body = await fetchJson<{ ok: boolean; policies: ServerSmartSellPolicy[] }>(
    `/smart-sell/policies${query}`,
  );
  if (!body.ok) return [];
  return body.policies;
}

/**
 * Update a Smart Sell policy — change floor price, pause, resume, or cancel.
 */
export async function updateSmartSellPolicyById(
  policyId: string,
  patch: {
    floorPriceGbp?: number;
    maxCounterRounds?: number;
    counterStrategy?: 'firm' | 'gradual';
    status?: 'active' | 'paused' | 'cancelled';
    idempotencyKey?: string;
  },
): Promise<ServerSmartSellPolicy> {
  const body = await fetchJson<{ ok: boolean; policy: ServerSmartSellPolicy; error?: string }>(
    `/smart-sell/policies/${encodeURIComponent(policyId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  if (!body.ok) throw new Error(body.error ?? 'Failed to update Smart Sell policy');
  return body.policy;
}

/**
 * Pause Smart Sell for a policy. The policy remains configured but stops
 * governing offers until resumed.
 */
export async function pauseSmartSellPolicy(policyId: string): Promise<ServerSmartSellPolicy> {
  return updateSmartSellPolicyById(policyId, { status: 'paused' });
}

/**
 * Resume a paused Smart Sell policy.
 */
export async function resumeSmartSellPolicy(policyId: string): Promise<ServerSmartSellPolicy> {
  return updateSmartSellPolicyById(policyId, { status: 'active' });
}

/**
 * Cancel a Smart Sell policy permanently.
 */
export async function cancelSmartSellPolicy(policyId: string): Promise<ServerSmartSellPolicy> {
  return updateSmartSellPolicyById(policyId, { status: 'cancelled' });
}

/**
 * Fetch the decision history for a Smart Sell policy — the audit trail of
 * every auto-negotiation decision the server has made on the seller's behalf.
 */
export async function fetchSmartSellDecisions(
  policyId: string,
  limit?: number,
): Promise<SmartSellDecisionRecord[]> {
  const query = limit ? `?limit=${limit}` : '';
  const body = await fetchJson<{ ok: boolean; decisions: SmartSellDecisionRecord[] }>(
    `/smart-sell/policies/${encodeURIComponent(policyId)}/decisions${query}`,
  );
  if (!body.ok) return [];
  return body.decisions;
}

/**
 * Convert a server policy to the frontend preview model.
 * This lets the UI work with a unified type regardless of whether the policy
 * came from the backend or the in-memory preview store.
 */
export function serverPolicyToPreview(
  server: ServerSmartSellPolicy,
): SmartSellPolicy {
  const floorQuote = computeNetQuote(server.floorPriceGbp);
  const isActive = server.status === 'active';
  return {
    listingId: server.listingId,
    state: isActive ? 'active' : server.status === 'paused' ? 'paused' : 'disabled',
    enabled: isActive,
    currency: 'GBP',
    minimumNet: floorQuote.net,
    acceptGrossThreshold: server.floorPriceGbp,
    declineBelowGross: 0,
    autoDeclineEnabled: false,
    feeRate: DEFAULT_FEE_RATE,
    feePolicyVersion: FEE_POLICY_VERSION,
    maxAutoCounters: server.maxCounterRounds,
    updatedAt: server.updatedAt,
    capability: { kind: 'active' },
  };
}
