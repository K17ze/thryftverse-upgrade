/**
 * Agent Capability Broker — the single chokepoint that intercepts agent tool
 * calls, enforces permission tiers, and prevents agents from bypassing the
 * canonical transaction UI (spec 05: Capability Broker, Permissions &
 * Approvals).
 *
 * Responsibilities:
 *  - Define a typed capability taxonomy grouped into four approval tiers.
 *  - Maintain a per-agent, per-capability grant store (persisted to
 *    AsyncStorage) that records explicit user consent.
 *  - Expose `requestCapability` / `resolveApproval` so the chat runtime can
 *    surface an approval prompt and record the user's decision.
 *  - Guarantee that financial / high-risk capabilities can NEVER bypass the
 *    canonical transaction screens — agents always go through the real UI.
 *  - Record every material decision to the Agent Activity Ledger so the user
 *    has a truthful, append-only audit trail.
 *
 * Per AGENTS.md §11 (Truthful UI):
 *  - We never fabricate grants, approvals, or ledger entries.
 *  - Tier D capabilities are never auto-approved — `always_allow` is refused
 *    even if the caller requests it.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeStableId } from '../../utils/createStableId';
import {
  recordAgentActivity,
  type AgentActivityEntry,
} from '../../services/agentActivityLedger';

// ---------------------------------------------------------------------------
// 1. Capability taxonomy
// ---------------------------------------------------------------------------

export type AgentCapability =
  // Tier A — read capabilities (auto-approved after explicit grant)
  | 'profile.read_public'
  | 'profile.read_private_preferences'
  | 'closet.read'
  | 'saved.read'
  | 'looks.read'
  | 'listings.read_own'
  | 'orders.read'
  | 'wallet.read_balance'
  | 'chat.read_current'
  | 'chat.read_selected_history'
  | 'search.run'
  // Tier B — draft / reversible capabilities (automatic, not externally committed)
  | 'profile.draft_edit'
  | 'listing.create_draft'
  | 'listing.draft_edit'
  | 'look.create_draft'
  | 'poster.create_draft'
  | 'chat.draft_reply'
  | 'offer.draft'
  | 'collection.create_draft'
  // Tier C — communicative / publication capabilities (default ask before action)
  | 'chat.send'
  | 'listing.publish'
  | 'look.publish'
  | 'poster.publish'
  | 'profile.apply_edit'
  // Tier D — financial / high-risk capabilities (always explicit, no "always allow")
  | 'offer.send'
  | 'auction.bid'
  | 'auction.buy_now'
  | 'coown.place_order'
  | 'wallet.convert'
  | 'wallet.withdraw'
  | 'payment.confirm'
  | 'account.change_security';

// ---------------------------------------------------------------------------
// 2. Approval tiers
// ---------------------------------------------------------------------------

export type ApprovalTier = 'A' | 'B' | 'C' | 'D';

export const CAPABILITY_TIER: Record<AgentCapability, ApprovalTier> = {
  // Tier A — reads: auto-approved after explicit persistent grant
  'profile.read_public': 'A',
  'profile.read_private_preferences': 'A',
  'closet.read': 'A',
  'saved.read': 'A',
  'looks.read': 'A',
  'listings.read_own': 'A',
  'orders.read': 'A',
  'wallet.read_balance': 'A',
  'chat.read_current': 'A',
  'chat.read_selected_history': 'A',
  'search.run': 'A',
  // Tier B — drafts: automatic (result not externally committed)
  'profile.draft_edit': 'B',
  'listing.create_draft': 'B',
  'listing.draft_edit': 'B',
  'look.create_draft': 'B',
  'poster.create_draft': 'B',
  'chat.draft_reply': 'B',
  'offer.draft': 'B',
  'collection.create_draft': 'B',
  // Tier C — communication / publication: default ask
  'chat.send': 'C',
  'listing.publish': 'C',
  'look.publish': 'C',
  'poster.publish': 'C',
  'profile.apply_edit': 'C',
  // Tier D — money / security: always explicit, no "always allow"
  'offer.send': 'D',
  'auction.bid': 'D',
  'auction.buy_now': 'D',
  'coown.place_order': 'D',
  'wallet.convert': 'D',
  'wallet.withdraw': 'D',
  'payment.confirm': 'D',
  'account.change_security': 'D',
};

/** Tier D capabilities can never be auto-approved. */
export const TIER_D_NEVER_ALWAYS_ALLOW = true;

// ---------------------------------------------------------------------------
// 3. Grant store
// ---------------------------------------------------------------------------

export interface CapabilityGrant {
  agentId: string;
  capability: AgentCapability;
  tier: ApprovalTier;
  /**
   * For Tier A/B: can be 'always_allow' after an explicit grant.
   * For Tier C: can be 'always_allow' or 'ask' per user config.
   * For Tier D: always 'ask' — never 'always_allow'.
   */
  policy: 'always_allow' | 'ask';
  /** ISO timestamp of when the grant was recorded. */
  grantedAt: string;
  /** Stable unique id for the grant record. */
  id: string;
}

const GRANTS_STORAGE_KEY = '@thryftverse_agent_capability_grants/v1';

/** In-memory grant store mirrored to AsyncStorage. key: `${agentId}:${capability}` */
const grants = new Map<string, CapabilityGrant>();

function grantKey(agentId: string, capability: AgentCapability): string {
  return `${agentId}:${capability}`;
}

let grantsHydrated = false;

/**
 * Hydrate the in-memory grant store from AsyncStorage. Safe to call multiple
 * times — only the first call performs the read.
 */
export async function hydrateGrants(): Promise<void> {
  if (grantsHydrated) return;
  grantsHydrated = true;
  try {
    const raw = await AsyncStorage.getItem(GRANTS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as CapabilityGrant[];
    if (!Array.isArray(parsed)) return;
    for (const grant of parsed) {
      if (grant && typeof grant.agentId === 'string' && typeof grant.capability === 'string') {
        grants.set(grantKey(grant.agentId, grant.capability as AgentCapability), grant);
      }
    }
  } catch {
    // Non-fatal — treat as empty store.
  }
}

/** Persist the current in-memory grant store to AsyncStorage. */
async function persistGrants(): Promise<void> {
  try {
    const asArray = Array.from(grants.values());
    await AsyncStorage.setItem(GRANTS_STORAGE_KEY, JSON.stringify(asArray));
  } catch {
    // Persistence failure is non-fatal — grants remain in memory.
  }
}

/**
 * Read-only accessor for the in-memory grant store. Primarily intended for
 * diagnostics and tests.
 */
export function getGrant(agentId: string, capability: AgentCapability): CapabilityGrant | undefined {
  return grants.get(grantKey(agentId, capability));
}

/**
 * Clear all grants (e.g. when an agent is removed or the user resets
 * permissions). Persists the empty state.
 */
export async function clearGrants(agentId?: string): Promise<void> {
  if (!agentId) {
    grants.clear();
  } else {
    for (const key of Array.from(grants.keys())) {
      if (key.startsWith(`${agentId}:`)) {
        grants.delete(key);
      }
    }
  }
  await persistGrants();
}

// ---------------------------------------------------------------------------
// 4. Capability broker function
// ---------------------------------------------------------------------------

export interface ApprovalRequest {
  agentId: string;
  capability: AgentCapability;
  /** Human-readable description of what the agent wants to do. */
  summary: string;
  /** Sanitized arguments summary (no raw secrets / PII). */
  argsSummary?: string;
  /** Tier that matched this capability, for the UI to present context. */
  tier: ApprovalTier;
  /** Stable id for this request, used for ledger correlation. */
  id: string;
}

export interface ApprovalResult {
  approved: boolean;
  reason: 'auto_allowed' | 'user_approved' | 'user_denied' | 'tier_d_requires_explicit';
}

/**
 * Ask the broker whether an agent may exercise a capability.
 *
 * - If an `always_allow` grant already exists, the capability is auto-allowed
 *   and a `tool_called` ledger entry is recorded with `approval: 'granted'`.
 * - Otherwise an `ApprovalRequest` is returned for the UI to present to the
 *   user, and an `approval_requested` ledger entry is recorded.
 *
 * Tier D capabilities are never auto-allowed even if a stale `always_allow`
 * grant somehow exists — the broker re-checks the tier defensively.
 */
export async function requestCapability(
  agentId: string,
  capability: AgentCapability,
  summary: string,
  argsSummary?: string,
): Promise<ApprovalRequest> {
  const tier = CAPABILITY_TIER[capability];
  const grant = grants.get(grantKey(agentId, capability));

  if (grant?.policy === 'always_allow' && tier !== 'D') {
    // Auto-allowed via a prior explicit grant. Record truthfully.
    await recordAgentActivity({
      type: 'tool_called',
      agent: agentId,
      capability,
      policyTier: tier,
      approval: 'granted',
      summary,
      resultStatus: 'success',
    });
    // Return a request marked as auto-allowed — callers can detect this via
    // the presence of a grant and the tier. We still return the request
    // shape so the caller can correlate the ledger entry.
    return {
      id: makeStableId('capreq'),
      agentId,
      capability,
      summary,
      argsSummary,
      tier,
    };
  }

  // An approval prompt is required. Record the request truthfully.
  const id = makeStableId('capreq');
  await recordAgentActivity({
    type: 'approval_requested',
    agent: agentId,
    capability,
    policyTier: tier,
    approval: 'requested',
    summary,
    resultStatus: 'paused',
  });

  return {
    id,
    agentId,
    capability,
    summary,
    argsSummary,
    tier,
  };
}

/**
 * Resolve a pending approval request with the user's decision.
 *
 * If `approved` is true and `alwaysAllow` is requested for a non-Tier-D
 * capability, a persistent `always_allow` grant is recorded. Tier D always
 * resolves to `ask` policy — `alwaysAllow` is silently ignored for Tier D,
 * and the result reason reflects that explicit approval was still required.
 *
 * The decision is recorded to the ledger as `approval_granted` or
 * `approval_denied`.
 */
export async function resolveApproval(
  request: ApprovalRequest,
  approved: boolean,
  alwaysAllow: boolean,
): Promise<ApprovalResult> {
  const tier = CAPABILITY_TIER[request.capability];

  if (approved) {
    // Tier D can never be auto-approved — ignore alwaysAllow for Tier D.
    const canAlwaysAllow = alwaysAllow && tier !== 'D';

    if (canAlwaysAllow) {
      const grant: CapabilityGrant = {
        id: makeStableId('grant'),
        agentId: request.agentId,
        capability: request.capability,
        tier,
        policy: 'always_allow',
        grantedAt: new Date().toISOString(),
      };
      grants.set(grantKey(request.agentId, request.capability), grant);
      await persistGrants();
    }

    await recordAgentActivity({
      type: 'approval_granted',
      agent: request.agentId,
      capability: request.capability,
      policyTier: tier,
      approval: 'granted',
      summary: request.summary,
      resultStatus: 'success',
    });

    if (tier === 'D') {
      return { approved: true, reason: 'tier_d_requires_explicit' };
    }
    return { approved: true, reason: 'user_approved' };
  }

  await recordAgentActivity({
    type: 'approval_denied',
    agent: request.agentId,
    capability: request.capability,
    policyTier: tier,
    approval: 'denied',
    summary: request.summary,
    resultStatus: 'denied',
  });

  return { approved: false, reason: 'user_denied' };
}

// ---------------------------------------------------------------------------
// 5. Transaction bypass protection
// ---------------------------------------------------------------------------

const FINANCIAL_CAPABILITIES: AgentCapability[] = [
  'offer.send',
  'auction.bid',
  'auction.buy_now',
  'coown.place_order',
  'wallet.convert',
  'wallet.withdraw',
  'payment.confirm',
  'account.change_security',
];

/**
 * Whether an agent exercising `capability` may bypass the canonical
 * transaction UI and perform the action directly.
 *
 * Financial / high-risk capabilities can NEVER bypass canonical transaction
 * UI — the agent must always route the user through the real screens (offer
 * sheet, bid sheet, checkout, withdrawal flow, security settings, etc.).
 *
 * No capability currently bypasses canonical UI. This function exists as an
 * explicit, auditable security boundary so future relaxations are deliberate.
 */
export function canAgentBypassCanonicalUI(capability: AgentCapability): boolean {
  if (FINANCIAL_CAPABILITIES.includes(capability)) return false;
  // No capability bypasses canonical UI — agents always go through the real
  // screens.
  return false;
}

/**
 * Convenience predicate: true for capabilities that touch money or account
 * security and therefore require canonical UI routing.
 */
export function isFinancialCapability(capability: AgentCapability): boolean {
  return FINANCIAL_CAPABILITIES.includes(capability);
}

// ---------------------------------------------------------------------------
// Re-exports for callers that want the ledger entry shape alongside grants.
// ---------------------------------------------------------------------------

export type { AgentActivityEntry };
