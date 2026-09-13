import type { ChatAgentConfig } from '../../domain';
import type {
  AgentCapability,
  AgentCategory,
  CapabilityGrantConfig,
  TriggerMode } from '../../platform/agents/agentDefinition';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export const CATEGORIES: Array<{ value: AgentCategory; label: string }> = [
  { value: 'assistant', label: 'Assistant' },
  { value: 'styling', label: 'Styling' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'moderation', label: 'Moderation' },
  { value: 'safety', label: 'Safety' },
  { value: 'automation', label: 'Workflow' },
];

export const TRIGGERS: Array<{
  value: TriggerMode;
  label: string;
  detail: string;
}> = [
  { value: 'mention', label: 'Mention', detail: 'Replies when someone types @agent' },
  { value: 'command', label: 'Command', detail: 'Replies to its command prefix' },
  { value: 'always', label: 'Every message', detail: 'Participates throughout the chat' },
];

export const REASONING_EFFORTS: Array<{ value: 'low' | 'medium' | 'high'; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export const RISK_GROUPS: Array<{
  risk: RiskLevel;
  title: string;
  hint: string;
}> = [
  { risk: 'low', title: 'Low risk — read access', hint: 'Read-only access to your data.' },
  { risk: 'medium', title: 'Medium risk — drafts & edits', hint: 'Reversible — nothing is committed externally.' },
  { risk: 'high', title: 'High risk — publish & send', hint: 'Publishes or sends on your behalf.' },
  { risk: 'critical', title: 'Critical — money & security', hint: 'Money and security actions.' },
];

export const RISK_DOT: Record<RiskLevel, string> = {
  low: 'check',
  medium: 'edit',
  high: 'megaphone-outline',
  critical: 'warning' };

// Agents execute on the server runtime, which supports a fixed model
// catalogue (backend agentConfigSchema). Model ids outside this list are
// rejected by POST /bots, PATCH /bots/:id and /bots/validate — so the
// picker is scoped to what the deployment can actually run.
export const SUPPORTED_MODELS: Array<{
  value: ChatAgentConfig['model'];
  label: string;
  detail: string;
}> = [
  { value: 'gpt-5.6-sol', label: 'gpt-5.6-sol', detail: '' },
  { value: 'gpt-5.6-terra', label: 'gpt-5.6-terra', detail: 'Default for this deployment' },
  { value: 'gpt-5.6-luna', label: 'gpt-5.6-luna', detail: '' },
];

export const ACTIVE_CAPABILITIES: ReadonlySet<AgentCapability> = new Set([
  'chat.draft_reply',
  'chat.read_current',
  'chat.read_selected_history',
]);

// Result shape of POST /bots/validate (Phase 1 preflight endpoint), minus the
// transport-level `ok` flag.
export type BotBuilderValidationResult = {
  valid: boolean;
  validationError: string | null;
  checks: Array<{ key: string; passed: boolean }>;
  runtimeReady: boolean;
  runtimeReadinessReason: string | null;
};

export type PlannedRiskGroup = (typeof RISK_GROUPS)[number] & {
  grants: CapabilityGrantConfig[];
};
