/**
 * Shared pre-settlement trading policy for Co-Own purchases (SEP21-FIN-F).
 *
 * Manual order placement (routes/coOwn.ts POST /co-own/assets/:assetId/orders)
 * evaluates four policy gates before any wallet/share effect:
 *   1. the global 1ZE reconciliation halt (mint/burn pause also suspends
 *      co-own trading),
 *   2. an active 'exit' corporate action (announced/executing) which
 *      terminally closes the market,
 *   3. market eligibility (jurisdiction / KYC / sanctions / notional limits),
 *   4. the buyer's wallet 'settlement' capability.
 *
 * The DRIP reinvestment worker performs the same economic settlement without
 * a human in the loop, so it MUST apply the same gates — previously it only
 * checked asset.is_open/price/supply and could trade through a halt or for a
 * since-ineligible user. Both call sites now share this module, evaluated on
 * the caller's transaction so the checks are revalidated under the same locks
 * that guard the settlement.
 *
 * The halt flag lives in Redis (index.ts owns the write side). The reader is
 * injectable so tests never touch a real Redis; production callers use the
 * default reader which lazily imports the shared redis singleton.
 */
import {
  evaluateMarketEligibility,
  evaluateWalletCapability,
} from './compliance.js';
import {
  createApiError,
  type DbQueryable,
} from './workerHelpers.js';

const ONEZE_MINT_BURN_HALT_REDIS_KEY = 'oneze:mint_burn_halted';

export interface CoOwnTradingHaltState {
  halted: boolean;
  reason?: string;
  reconciliationId?: string | null;
}

/** Narrowed dependency surface — the real compliance evaluators satisfy it. */
export interface CoOwnTradingPolicyDeps {
  getHaltState?: () => Promise<CoOwnTradingHaltState>;
  evaluateMarketEligibility?: (
    client: DbQueryable,
    input: { userId: string; market: 'co-own'; orderNotionalGbp: number }
  ) => Promise<{ allowed: boolean; code: string; message: string }>;
  evaluateWalletCapability?: (
    client: DbQueryable,
    userId: string,
    capability: 'settlement',
    context?: { amountUsd?: number; currency?: string; market?: string }
  ) => Promise<{ allowed: boolean; code: string; reason?: string }>;
}

export type CoOwnTradingDenialReason =
  | 'reconciliation_halt'
  | 'exit_action_active'
  | 'market_ineligible'
  | 'wallet_capability';

export interface CoOwnTradingDenial {
  reason: CoOwnTradingDenialReason;
  /** Stable machine code — mirrors what the manual route returns. */
  code: string;
  message: string;
  /** HTTP status the route maps this denial to. */
  statusCode: number;
  /** Raw evaluator decision for audit payloads. */
  decision?: Record<string, unknown>;
}

/**
 * Default halt-state reader: the same Redis flag index.ts writes via
 * setOnezeMintBurnHaltState, with the same decode semantics. Lazily imports
 * the redis singleton so test processes that inject getHaltState never open
 * a connection. A read failure fails CLOSED with a dedicated retryable code
 * — trading without knowing the halt state is not permitted, but an infra
 * blip is not a permanent denial.
 */
async function readOnezeMintBurnHaltStateFromRedis(): Promise<CoOwnTradingHaltState> {
  let raw: string | null;
  try {
    const { redis } = await import('./redis.js');
    raw = await redis.get(ONEZE_MINT_BURN_HALT_REDIS_KEY);
  } catch (error) {
    throw createApiError(
      'CO_OWN_HALT_STATE_UNAVAILABLE',
      'Unable to read the 1ZE reconciliation halt state',
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }

  if (!raw) {
    return { halted: false };
  }

  try {
    const parsed = JSON.parse(raw) as {
      halted?: boolean;
      reason?: string;
      reconciliationId?: string | null;
    };

    if (!parsed.halted) {
      return { halted: false };
    }

    return {
      halted: true,
      reason: parsed.reason,
      reconciliationId: parsed.reconciliationId ?? null,
    };
  } catch {
    return {
      halted: true,
      reason: 'halt_state_decode_failed',
    };
  }
}

/**
 * Evaluate the shared pre-settlement trading policy for a co-own purchase.
 * Returns null when trading is permitted, or the FIRST denial in the same
 * precedence the manual placement route applies:
 * halt → exit → market eligibility → wallet capability.
 *
 * Runs entirely on the caller's queryable so it can be revalidated inside
 * the settlement transaction (a halt or exit declared mid-flight still
 * binds).
 */
export async function evaluateCoOwnTradingPolicy(
  client: DbQueryable,
  input: {
    assetId: string;
    buyerUserId: string;
    /** GBP notional the purchase will move — drives eligibility/capability limits. */
    orderNotionalGbp: number;
    deps?: CoOwnTradingPolicyDeps;
  }
): Promise<CoOwnTradingDenial | null> {
  const getHaltState = input.deps?.getHaltState ?? readOnezeMintBurnHaltStateFromRedis;
  const evaluateEligibility =
    input.deps?.evaluateMarketEligibility ?? evaluateMarketEligibility;
  const evaluateCapability =
    input.deps?.evaluateWalletCapability ?? evaluateWalletCapability;

  // 1. Global reconciliation halt — identical message/code the place route
  //    returns at its pre-transaction fast path.
  const haltState = await getHaltState();
  if (haltState.halted) {
    return {
      reason: 'reconciliation_halt',
      code: 'CO_OWN_RECONCILIATION_HALT',
      message: 'Co-Own trading is paused while 1ZE reconciliation is in progress',
      statusCode: 423,
      decision: { haltReason: haltState.reason ?? null },
    };
  }

  // 2. Active exit corporate action — same predicate as
  //    resolveCoOwnMarketStatus / hasActiveExitAction (announced/executing
  //    only; cancelled or completed exits do not close the market).
  const exitResult = await client.query<{ status: string }>(
    `
      SELECT status
      FROM coown_corporate_actions
      WHERE asset_id = $1
        AND action_type = 'exit'
        AND status IN ('announced', 'executing')
      LIMIT 1
    `,
    [input.assetId]
  );
  if (exitResult.rows.length > 0) {
    return {
      reason: 'exit_action_active',
      code: 'CO_OWN_EXIT_ACTIVE',
      message: 'This asset has an active exit corporate action — trading is closed',
      statusCode: 423,
      decision: { exitStatus: exitResult.rows[0].status },
    };
  }

  // 3. Market eligibility — jurisdiction / KYC / sanctions / notional caps.
  const eligibility = await evaluateEligibility(client, {
    userId: input.buyerUserId,
    market: 'co-own',
    orderNotionalGbp: input.orderNotionalGbp,
  });
  if (!eligibility.allowed) {
    return {
      reason: 'market_ineligible',
      code: eligibility.code,
      message: eligibility.message,
      statusCode: 403,
      decision: eligibility as unknown as Record<string, unknown>,
    };
  }

  // 4. Wallet settlement capability — same capability/context the manual
  //    route evaluates before it settles.
  const capability = await evaluateCapability(client, input.buyerUserId, 'settlement', {
    amountUsd: input.orderNotionalGbp,
    currency: 'GBP',
    market: 'co-own',
  });
  if (!capability.allowed) {
    return {
      reason: 'wallet_capability',
      code: capability.code,
      message: capability.reason ?? 'Wallet capability check failed',
      statusCode: 403,
      decision: capability as unknown as Record<string, unknown>,
    };
  }

  return null;
}

/**
 * Throwing variant for callers that only need pass/fail. The thrown
 * ApiError carries the denial's code/message and an explicit statusCode.
 */
export async function assertCoOwnTradingPermitted(
  client: DbQueryable,
  input: {
    assetId: string;
    buyerUserId: string;
    orderNotionalGbp: number;
    deps?: CoOwnTradingPolicyDeps;
  }
): Promise<void> {
  const denial = await evaluateCoOwnTradingPolicy(client, input);
  if (!denial) {
    return;
  }

  const error = createApiError(denial.code, denial.message, {
    reason: denial.reason,
    decision: denial.decision,
  });
  error.statusCode = denial.statusCode;
  throw error;
}
