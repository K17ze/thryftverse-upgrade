/**
 * Agents contracts — web port of the mobile agent domain model
 * (frontend/src/platform/agents/agentDefinition.ts + capabilityBroker.ts +
 * components/botbuilder/botBuilderTypes.ts), narrowed to the surface the web
 * ships: automation assistants (directory, install, run ledger, builder)
 * rather than conversational chat agents.
 *
 * Names and vocabularies stay 1:1 with mobile so the two platforms remain
 * legible against each other: AgentCategory, AgentCapability, risk levels,
 * the fixed model catalogue. The web adds two fixture-mode shapes —
 * AgentBot (a directory/installed assistant) and AgentRunEntry (a durable
 * ledger row) — mirroring the mobile ChatBot + AgentRunInfo contracts.
 */

// ---------------------------------------------------------------------------
// Enumerations (ported verbatim from mobile agentDefinition.ts)
// ---------------------------------------------------------------------------

export type AgentCategory =
  | 'assistant'
  | 'styling'
  | 'commerce'
  | 'moderation'
  | 'safety'
  | 'automation';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Trigger vocabulary. Mobile chat agents use mention / command / always;
 * web assistants are automations, so the grammar maps to when the run fires:
 * on a schedule, the moment an event lands, or only when the owner asks.
 */
export type AgentTriggerId = 'manual' | 'hourly' | 'daily' | 'on_event';

export interface AgentTriggerOption {
  value: AgentTriggerId;
  label: string;
  detail: string;
}

export const AGENT_TRIGGERS: AgentTriggerOption[] = [
  {
    value: 'manual',
    label: 'Manual',
    detail: 'Only runs when you start it',
  },
  {
    value: 'hourly',
    label: 'Hourly',
    detail: 'Sweeps once an hour while enabled',
  },
  {
    value: 'daily',
    label: 'Daily',
    detail: 'Runs a daily pass while enabled',
  },
  {
    value: 'on_event',
    label: 'On event',
    detail: 'Runs the moment its trigger fires — a price drop, a new question',
  },
];

export function triggerById(id: AgentTriggerId): AgentTriggerOption {
  return AGENT_TRIGGERS.find((t) => t.value === id) ?? AGENT_TRIGGERS[0];
}

export const AGENT_CATEGORIES: Array<{ value: AgentCategory; label: string }> = [
  { value: 'assistant', label: 'Assistant' },
  { value: 'styling', label: 'Styling' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'automation', label: 'Workflow' },
  { value: 'moderation', label: 'Moderation' },
  { value: 'safety', label: 'Safety' },
];

// The runtime model catalogue — mirrors botBuilderTypes.SUPPORTED_MODELS.
// Model ids outside this list are rejected by the server, so the fixture
// directory only ships what the deployment can actually run.
export type AgentModelId = 'gpt-5.6-sol' | 'gpt-5.6-terra' | 'gpt-5.6-luna';

export const SUPPORTED_MODELS: Array<{
  value: AgentModelId;
  label: string;
  detail: string;
}> = [
  { value: 'gpt-5.6-sol', label: 'gpt-5.6-sol', detail: '' },
  { value: 'gpt-5.6-terra', label: 'gpt-5.6-terra', detail: 'Default for this deployment' },
  { value: 'gpt-5.6-luna', label: 'gpt-5.6-luna', detail: '' },
];

export const DEFAULT_MODEL: AgentModelId = 'gpt-5.6-terra';

// ---------------------------------------------------------------------------
// Capability taxonomy (ported verbatim from mobile capabilityBroker.ts)
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
  // Tier B — draft / reversible capabilities (not externally committed)
  | 'profile.draft_edit'
  | 'listing.create_draft'
  | 'listing.draft_edit'
  | 'look.create_draft'
  | 'poster.create_draft'
  | 'chat.draft_reply'
  | 'offer.draft'
  | 'collection.create_draft'
  // Tier C — publication / communication (default ask before action)
  | 'chat.send'
  | 'listing.publish'
  | 'look.publish'
  | 'poster.publish'
  | 'profile.apply_edit'
  // Tier D — financial / security (always explicit, no "always allow")
  | 'offer.send'
  | 'auction.bid'
  | 'auction.buy_now'
  | 'coown.place_order'
  | 'wallet.convert'
  | 'wallet.withdraw'
  | 'payment.confirm'
  | 'account.change_security';

/**
 * User-facing labels and risk levels per capability — ported 1:1 from
 * agentDefinition.CAPABILITY_RISK_LABELS. The detail surface renders these
 * as the bot's permission list.
 */
export const CAPABILITY_RISK_LABELS: Record<
  AgentCapability,
  { label: string; risk: RiskLevel }
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

/** Risk-group copy — ported from botBuilderTypes.RISK_GROUPS. */
export const RISK_GROUPS: Array<{
  risk: RiskLevel;
  title: string;
  hint: string;
}> = [
  { risk: 'low', title: 'Read access', hint: 'Read-only access to your data.' },
  {
    risk: 'medium',
    title: 'Drafts & edits',
    hint: 'Reversible — nothing is committed without you.',
  },
  {
    risk: 'high',
    title: 'Publish & send',
    hint: 'Publishes or sends on your behalf.',
  },
  {
    risk: 'critical',
    title: 'Money & security',
    hint: 'Money and security actions. Always asks first.',
  },
];

/** One-line honest risk word for a permission row. */
export function riskWord(risk: RiskLevel): string {
  switch (risk) {
    case 'low':
      return 'Read only';
    case 'medium':
      return 'Drafts only';
    case 'high':
      return 'Acts for you';
    case 'critical':
      return 'Always asks';
  }
}

// ---------------------------------------------------------------------------
// AgentBot — a directory or user-built automation assistant.
// Mirrors the mobile ChatBot contract: published assistants carry a fixed
// capability set; user bots are session-scoped in fixture mode.
// ---------------------------------------------------------------------------

export type AgentBotOrigin = 'stock' | 'community' | 'own';

export interface AgentBot {
  id: string;
  name: string;
  /** One-line job description shown in rows. */
  purpose: string;
  /** What it actually does — honest copy, no AI theatre. */
  description: string;
  category: AgentCategory;
  /** Purpose template the bot was built from; null for bespoke directory bots. */
  purposeId: AgentPurposeId | null;
  model: AgentModelId;
  /** Display creator — 'ThryftVerse' for stock, a handle for community, 'You' for own. */
  creator: string;
  origin: AgentBotOrigin;
  /** Granted capabilities — the permission list on the detail surface. */
  capabilities: AgentCapability[];
  triggerId: AgentTriggerId;
  installs: number;
  installed: boolean;
  /** Whether the installed bot is currently allowed to run. */
  enabled: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// AgentRunEntry — the durable activity ledger. Mirrors the mobile
// AgentRunInfo surface grammar: bot, action, target, outcome, time.
// ---------------------------------------------------------------------------

export type AgentRunOutcome =
  | 'succeeded'
  | 'skipped'
  | 'failed'
  | 'awaiting_approval';

export interface AgentRunEntry {
  id: string;
  botId: string;
  /** What the bot did — 'Relisted stale listing', 'Drafted reply'. */
  action: string;
  /** What it acted on — 'Vintage Carhartt jacket', 'Saved: Doc Martens'. */
  target: string;
  outcome: AgentRunOutcome;
  /** Optional detail for failed/awaiting rows. */
  detail?: string;
  at: string; // ISO
}

export const OUTCOME_META: Record<
  AgentRunOutcome,
  { label: string; tone: 'success' | 'muted' | 'danger' | 'warning' }
> = {
  succeeded: { label: 'Done', tone: 'success' },
  skipped: { label: 'Skipped', tone: 'muted' },
  failed: { label: 'Failed', tone: 'danger' },
  awaiting_approval: { label: 'Needs you', tone: 'warning' },
};

// ---------------------------------------------------------------------------
// Purpose templates — the fixed capability packs the builder offers.
// The user can't compose arbitrary permission sets; they pick a job and the
// job carries the grants it needs. Same contract as the mobile builder's
// category → DEFAULT_CAPABILITIES_BY_CATEGORY mapping, named by purpose.
// ---------------------------------------------------------------------------

export type AgentPurposeId =
  | 'listing_copilot'
  | 'price_watch'
  | 'relist_stale'
  | 'faq_respond'
  | 'wardrobe_curator'
  | 'offer_drafter';

export interface AgentPurposeTemplate {
  id: AgentPurposeId;
  label: string;
  /** What the bot does — shown under the picker label. */
  detail: string;
  category: AgentCategory;
  /** Default grants — conservative: reads + drafts, never publish or money. */
  capabilities: AgentCapability[];
  /** Triggers this job supports — the picker is scoped to these. */
  triggers: AgentTriggerId[];
  defaultTrigger: AgentTriggerId;
}

export const AGENT_PURPOSES: AgentPurposeTemplate[] = [
  {
    id: 'listing_copilot',
    label: 'Listing copilot',
    detail: 'Drafts titles, descriptions and price suggestions for things you photograph.',
    category: 'commerce',
    capabilities: ['listings.read_own', 'listing.create_draft', 'listing.draft_edit'],
    triggers: ['manual', 'daily'],
    defaultTrigger: 'manual',
  },
  {
    id: 'price_watch',
    label: 'Price-drop watcher',
    detail: 'Alerts you when a saved item drops in price or a similar listing undercuts it.',
    category: 'automation',
    capabilities: ['saved.read', 'search.run'],
    triggers: ['on_event', 'hourly'],
    defaultTrigger: 'on_event',
  },
  {
    id: 'relist_stale',
    label: 'Relist when stale',
    detail: 'Refreshes listings that have gone quiet — bumps them with an updated draft.',
    category: 'automation',
    capabilities: ['listings.read_own', 'listing.draft_edit'],
    triggers: ['daily', 'manual'],
    defaultTrigger: 'daily',
  },
  {
    id: 'faq_respond',
    label: 'Auto-respond FAQ',
    detail: 'Drafts replies to common buyer questions — measurements, postage, condition.',
    category: 'assistant',
    capabilities: ['chat.read_current', 'listings.read_own', 'chat.draft_reply'],
    triggers: ['on_event'],
    defaultTrigger: 'on_event',
  },
  {
    id: 'wardrobe_curator',
    label: 'Wardrobe curator',
    detail: 'Groups your closet into looks and drafts collections you can publish.',
    category: 'styling',
    capabilities: ['closet.read', 'saved.read', 'looks.read', 'collection.create_draft'],
    triggers: ['daily', 'manual'],
    defaultTrigger: 'manual',
  },
  {
    id: 'offer_drafter',
    label: 'Offer drafter',
    detail: 'Prepares counter-offers inside rules you set — it never sends them.',
    category: 'commerce',
    capabilities: ['listings.read_own', 'orders.read', 'offer.draft'],
    triggers: ['on_event', 'manual'],
    defaultTrigger: 'on_event',
  },
];

export function purposeById(id: AgentPurposeId): AgentPurposeTemplate | undefined {
  return AGENT_PURPOSES.find((p) => p.id === id);
}
