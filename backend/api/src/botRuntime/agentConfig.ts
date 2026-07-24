import type { AgentConfig } from './types.js';

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  instructions: '',
  model: 'gpt-5.6-terra',
  triggerMode: 'mention',
  responseLength: 'balanced',
  tone: 'focused',
  reasoningEffort: 'medium',
  historyLimit: 16,
  starterPrompts: [],
};

const MODELS = new Set(['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna']);
const TRIGGERS = new Set(['mention', 'command', 'always']);
const LENGTHS = new Set(['concise', 'balanced', 'detailed']);
const TONES = new Set(['focused', 'warm', 'expert']);
const EFFORTS = new Set(['low', 'medium', 'high']);

export function normalizeAgentConfig(value: unknown): AgentConfig {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    instructions: typeof raw.instructions === 'string'
      ? raw.instructions.trim().slice(0, 8_000)
      : DEFAULT_AGENT_CONFIG.instructions,
    model: MODELS.has(String(raw.model))
      ? String(raw.model) as AgentConfig['model']
      : DEFAULT_AGENT_CONFIG.model,
    triggerMode: TRIGGERS.has(String(raw.triggerMode))
      ? String(raw.triggerMode) as AgentConfig['triggerMode']
      : DEFAULT_AGENT_CONFIG.triggerMode,
    responseLength: LENGTHS.has(String(raw.responseLength))
      ? String(raw.responseLength) as AgentConfig['responseLength']
      : DEFAULT_AGENT_CONFIG.responseLength,
    tone: TONES.has(String(raw.tone))
      ? String(raw.tone) as AgentConfig['tone']
      : DEFAULT_AGENT_CONFIG.tone,
    reasoningEffort: EFFORTS.has(String(raw.reasoningEffort))
      ? String(raw.reasoningEffort) as AgentConfig['reasoningEffort']
      : DEFAULT_AGENT_CONFIG.reasoningEffort,
    historyLimit: Math.min(40, Math.max(0, Number.isFinite(Number(raw.historyLimit))
      ? Math.round(Number(raw.historyLimit))
      : DEFAULT_AGENT_CONFIG.historyLimit)),
    starterPrompts: Array.isArray(raw.starterPrompts)
      ? raw.starterPrompts
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim().slice(0, 160))
        .filter(Boolean)
        .slice(0, 4)
      : [],
  };
}

export function validatePublishedAgent(config: AgentConfig, permissions: string[]): string | null {
  if (config.instructions.length < 20) {
    return 'Published agents need instructions of at least 20 characters.';
  }
  if (!permissions.includes('reply_in_chat')) {
    return 'Published agents need permission to reply in chat.';
  }
  return null;
}
