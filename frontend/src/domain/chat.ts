export interface ChatAgentConfig {
  instructions: string;
  model: 'gpt-5.6-sol' | 'gpt-5.6-terra' | 'gpt-5.6-luna';
  triggerMode: 'mention' | 'command' | 'always';
  responseLength: 'concise' | 'balanced' | 'detailed';
  tone: 'focused' | 'warm' | 'expert';
  reasoningEffort: 'low' | 'medium' | 'high';
  historyLimit: number;
  starterPrompts: string[];
}

export interface ChatBot {
  id: string;
  slug: string;
  name: string;
  description: string;
  commandHint: string;
  category: 'moderation' | 'commerce' | 'automation' | 'assistant' | 'safety' | 'styling';
  status: 'available' | 'local-only' | 'backend-required';
  permissions: string[];
  /** 'system' = built-in Thryftverse bot; 'custom' = user-created */
  type?: 'system' | 'custom';
  /** Present only for custom bots */
  creatorId?: string;
  /** Present only for custom bots */
  ownerId?: string;
  /** Present only for custom bots */
  isDraft?: boolean;
  /** Present only for custom bots */
  isDisabled?: boolean;
  /** How the bot executes: local, config-only, backend, ai */
  runtimeMode?: string;
  /** Avatar/icon emoji or ionicon name for custom bots */
  icon?: string;
  /** Server-owned AI behavior contract. Present for AI agents. */
  agentConfig?: ChatAgentConfig;
  /** True only when this environment can execute the selected runtime. */
  runtimeReady?: boolean;
  runtimeReadinessReason?: string;
}
