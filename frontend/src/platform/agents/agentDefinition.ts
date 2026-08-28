/**
 * Agent Definition — the canonical data model for a user-defined AI agent.
 * Replaces the old ChatAgentConfig from mockData.
 *
 * Per AGENTS.md §2 (Deep system research), this is the source-of-truth
 * contract for the agent builder surface. It is intentionally decoupled from
 * the legacy `ChatBot` store shape so the builder can reason in typed
 * capabilities (Capability Broker, spec 05) and provider-authoritative model
 * discovery (spec 04) without leaking mock-data contracts into the UI.
 */

import type { AgentCapability, ApprovalTier } from './capabilityBroker';

// Re-export the capability type so callers can import the full agent
// vocabulary from a single module without reaching into the broker.
export type { AgentCapability, ApprovalTier };

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type AgentCategory =
  | 'assistant'
  | 'styling'
  | 'commerce'
  | 'moderation'
  | 'safety'
  | 'automation';

export type TriggerMode = 'mention' | 'command' | 'always';

export type Tone = 'focused' | 'warm' | 'expert';

export type ResponseLength = 'concise' | 'balanced' | 'detailed';

// ---------------------------------------------------------------------------
// Connection — provider-authoritative, never hardcoded
// ---------------------------------------------------------------------------

export interface ProviderConnection {
  /** Connected provider id (openai | anthropic | gemini | custom). */
  providerId: string;
  /** Discovered dynamically from the provider's /models endpoint. */
  modelId: string;
}

// ---------------------------------------------------------------------------
// Capabilities — typed grants from the Capability Broker
// ---------------------------------------------------------------------------

export interface CapabilityGrantConfig {
  capability: AgentCapability;
  enabled: boolean;
  approvalMode: 'always_ask' | 'ask_once' | 'never_ask';
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

export interface MemoryPolicy {
  /** Whether the agent can read the recent conversation context. */
  conversationContext: boolean;
  /** Maximum number of recent turns the agent may read. */
  maxTurns: number;
  /** Whether the agent may retain long-term memory across sessions. */
  longTermMemory: boolean;
}

// ---------------------------------------------------------------------------
// Agent Definition
// ---------------------------------------------------------------------------

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;

  // Identity
  instructions: string;
  tone: Tone;
  responseLength: ResponseLength;
  triggerMode: TriggerMode;
  commandHint?: string;
  starterPrompts: string[];

  // Connection
  providerConnection: ProviderConnection;

  // Capabilities (typed, from Capability Broker)
  capabilityGrants: CapabilityGrantConfig[];

  // Memory
  memoryPolicy: MemoryPolicy;

  // Metadata
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Default capability grants per category
// ---------------------------------------------------------------------------

/**
 * Default capability grants for each agent category. These are the sensible
 * starting grants shown to the user in the builder — the user can revoke or
 * extend them. They are intentionally conservative: no Tier C (publication)
 * or Tier D (financial) capabilities are granted by default.
 */
export const DEFAULT_CAPABILITIES_BY_CATEGORY: Record<
  AgentCategory,
  AgentCapability[]
> = {
  assistant: [
    'profile.read_public',
    'closet.read',
    'saved.read',
    'search.run',
    'chat.draft_reply',
  ],
  styling: [
    'profile.read_public',
    'closet.read',
    'looks.read',
    'chat.draft_reply',
    'look.create_draft',
  ],
  commerce: [
    'listings.read_own',
    'orders.read',
    'listing.create_draft',
    'listing.draft_edit',
    'offer.draft',
  ],
  moderation: ['chat.read_current', 'chat.read_selected_history'],
  safety: ['chat.read_current', 'chat.read_selected_history'],
  automation: [
    'profile.read_public',
    'listings.read_own',
    'orders.read',
    'listing.create_draft',
  ],
};

// ---------------------------------------------------------------------------
// Risk labels for UI
// ---------------------------------------------------------------------------

/**
 * Human-readable labels and risk levels for every capability. Risk levels
 * mirror the Capability Broker approval tiers but are expressed in the
 * user-facing vocabulary the builder surface presents:
 *  - low      → Tier A reads (auto-approved after explicit grant)
 *  - medium   → Tier B drafts (reversible, not externally committed)
 *  - high     → Tier C publication / communication (default ask)
 *  - critical → Tier D financial / security (always explicit, no always-allow)
 */
export const CAPABILITY_RISK_LABELS: Record<
  AgentCapability,
  { label: string; risk: 'low' | 'medium' | 'high' | 'critical' }
> = {
  'profile.read_public': { label: 'Read public profile', risk: 'low' },
  'profile.read_private_preferences': {
    label: 'Read private preferences',
    risk: 'medium',
  },
  'closet.read': { label: 'Read closet', risk: 'low' },
  'saved.read': { label: 'Read saved items', risk: 'low' },
  'looks.read': { label: 'Read looks', risk: 'low' },
  'listings.read_own': { label: 'Read own listings', risk: 'low' },
  'orders.read': { label: 'Read orders', risk: 'low' },
  'wallet.read_balance': { label: 'Read wallet balance', risk: 'medium' },
  'chat.read_current': { label: 'Read current chat', risk: 'low' },
  'chat.read_selected_history': { label: 'Read chat history', risk: 'medium' },
  'search.run': { label: 'Run searches', risk: 'low' },
  'profile.draft_edit': { label: 'Draft profile edits', risk: 'medium' },
  'listing.create_draft': { label: 'Create listing drafts', risk: 'medium' },
  'listing.draft_edit': { label: 'Edit listing drafts', risk: 'medium' },
  'look.create_draft': { label: 'Create look drafts', risk: 'medium' },
  'poster.create_draft': { label: 'Create poster drafts', risk: 'medium' },
  'chat.draft_reply': { label: 'Draft chat replies', risk: 'medium' },
  'offer.draft': { label: 'Draft offers', risk: 'medium' },
  'collection.create_draft': {
    label: 'Create collection drafts',
    risk: 'medium',
  },
  'chat.send': { label: 'Send chat messages', risk: 'high' },
  'listing.publish': { label: 'Publish listings', risk: 'high' },
  'look.publish': { label: 'Publish looks', risk: 'high' },
  'poster.publish': { label: 'Publish posters', risk: 'high' },
  'profile.apply_edit': { label: 'Apply profile edits', risk: 'high' },
  'offer.send': { label: 'Send offers', risk: 'critical' },
  'auction.bid': { label: 'Place auction bids', risk: 'critical' },
  'auction.buy_now': { label: 'Buy now at auction', risk: 'critical' },
  'coown.place_order': { label: 'Place co-own orders', risk: 'critical' },
  'wallet.convert': { label: 'Convert wallet funds', risk: 'critical' },
  'wallet.withdraw': { label: 'Withdraw wallet funds', risk: 'critical' },
  'payment.confirm': { label: 'Confirm payments', risk: 'critical' },
  'account.change_security': {
    label: 'Change security settings',
    risk: 'critical',
  },
};

// ---------------------------------------------------------------------------
// Risk → tier mapping (kept in sync with capabilityBroker.CAPABILITY_TIER)
// ---------------------------------------------------------------------------

export const RISK_TO_TIER: Record<
  'low' | 'medium' | 'high' | 'critical',
  ApprovalTier
> = {
  low: 'A',
  medium: 'B',
  high: 'C',
  critical: 'D',
};

/**
 * All capabilities grouped by risk level, in a stable display order. Used by
 * the builder to render capability sections without re-sorting on every render.
 */
export const CAPABILITIES_BY_RISK: Record<
  'low' | 'medium' | 'high' | 'critical',
  AgentCapability[]
> = {
  low: [
    'profile.read_public',
    'closet.read',
    'saved.read',
    'looks.read',
    'listings.read_own',
    'orders.read',
    'chat.read_current',
    'search.run',
  ],
  medium: [
    'profile.read_private_preferences',
    'wallet.read_balance',
    'chat.read_selected_history',
    'profile.draft_edit',
    'listing.create_draft',
    'listing.draft_edit',
    'look.create_draft',
    'poster.create_draft',
    'chat.draft_reply',
    'offer.draft',
    'collection.create_draft',
  ],
  high: [
    'chat.send',
    'listing.publish',
    'look.publish',
    'poster.publish',
    'profile.apply_edit',
  ],
  critical: [
    'offer.send',
    'auction.bid',
    'auction.buy_now',
    'coown.place_order',
    'wallet.convert',
    'wallet.withdraw',
    'payment.confirm',
    'account.change_security',
  ],
};

/**
 * Build the initial CapabilityGrantConfig list for a category. Every default
 * capability is enabled with a category-appropriate approval mode; all other
 * capabilities are present but disabled so the user can opt in.
 *
 * Approval mode defaults:
 *  - low / medium → 'ask_once' (grant once, auto-allowed thereafter)
 *  - high         → 'always_ask' (ask before every publication/communication)
 *  - critical     → 'always_ask' (always explicit — never auto-approved)
 */
export function buildInitialCapabilityGrants(
  category: AgentCategory,
): CapabilityGrantConfig[] {
  const defaults = new Set(DEFAULT_CAPABILITIES_BY_CATEGORY[category]);
  const all = (
    [
      ...CAPABILITIES_BY_RISK.low,
      ...CAPABILITIES_BY_RISK.medium,
      ...CAPABILITIES_BY_RISK.high,
      ...CAPABILITIES_BY_RISK.critical,
    ] as AgentCapability[]
  );
  return all.map((capability) => {
    const risk = CAPABILITY_RISK_LABELS[capability].risk;
    const approvalMode: CapabilityGrantConfig['approvalMode'] =
      risk === 'low' || risk === 'medium'
        ? 'ask_once'
        : 'always_ask';
    return {
      capability,
      enabled: defaults.has(capability),
      approvalMode,
    };
  });
}

// ---------------------------------------------------------------------------
// Backend permission vocabulary mapping
// ---------------------------------------------------------------------------
//
// The frontend capability taxonomy is a rich, namespaced vocabulary
// (e.g. `chat.draft_reply`, `profile.read_public`) used by the builder
// surface to present typed, risk-graded grants to the user. The backend,
// however, only recognises a flat permission vocabulary. Today the backend
// understands exactly two permission strings:
//
//   - `reply_in_chat`  — the agent may draft / send replies in a chat
//   - `read_messages`  — the agent may read chat messages
//
// This mapping translates the namespaced frontend taxonomy down to the
// backend's flat permission vocabulary when an agent definition is saved.
// Capabilities with no backend equivalent map to null (not yet recognised
// by the backend). The BotBuilderScreen uses these helpers to send the
// correct permission strings to the `/bots` API instead of leaking the
// namespaced taxonomy, which the backend would silently drop.

/**
 * Translate a single namespaced capability into the backend's flat
 * permission vocabulary.
 *
 * Returns the backend permission string, or `null` when the capability has
 * no backend equivalent (i.e. the backend does not yet enforce it).
 */
export function capabilityToBackendPermission(
  cap: AgentCapability,
): string | null {
  switch (cap) {
    case 'chat.draft_reply':
    case 'chat.send':
      // Drafting and sending are both forms of replying in a chat.
      return 'reply_in_chat';
    case 'chat.read_current':
    case 'chat.read_selected_history':
      // Both read capabilities collapse to the backend read permission.
      return 'read_messages';
    default:
      // Not recognised by the backend permission vocabulary yet.
      return null;
  }
}

/**
 * Convert the enabled capability grants of an agent definition into the
 * deduplicated array of backend permission strings the backend enforces.
 *
 * Only enabled grants contribute, and only capabilities with a non-null
 * backend mapping are included. The result is deduplicated so that, e.g.,
 * an agent granted both `chat.draft_reply` and `chat.send` produces a
 * single `reply_in_chat` entry.
 */
export function enabledCapabilitiesToBackendPermissions(
  grants: CapabilityGrantConfig[],
): string[] {
  const permissions = new Set<string>();
  for (const grant of grants) {
    if (!grant.enabled) continue;
    const permission = capabilityToBackendPermission(grant.capability);
    if (permission) {
      permissions.add(permission);
    }
  }
  return Array.from(permissions);
}
