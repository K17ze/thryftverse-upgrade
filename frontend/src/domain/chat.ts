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

/**
 * Canonical agent contract — shared source-of-truth with the backend.
 * The backend's botRuntime/types.ts has the same shape.
 */
export type AgentCategory = 'assistant' | 'styling' | 'commerce' | 'moderation' | 'safety' | 'automation';
export type AgentStatus = 'available' | 'local-only' | 'backend-required' | 'disabled';
export type AgentRuntimeMode = 'local' | 'config-only' | 'backend' | 'ai';

export interface CanonicalAgentContract {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  commandHint: string;
  icon: string | null;
  instructions: string;
  triggerMode: 'mention' | 'command' | 'always';
  tone: 'focused' | 'warm' | 'expert';
  responseLength: 'concise' | 'balanced' | 'detailed';
  reasoningEffort: 'low' | 'medium' | 'high';
  starterPrompts: string[];
  model: string;
  historyLimit: number;
  confidenceThreshold: number;
  permissions: string[];
  isDraft: boolean;
  status: AgentStatus;
  runtimeMode: AgentRuntimeMode;
}

/**
 * Real deployment state for a bot installed in a conversation.
 * Returned by GET /chat/conversations/:conversationId/bots
 */
export interface ConversationBotDeployment {
  botId: string;
  botName: string;
  botSlug: string;
  botCategory: string;
  botType: 'system' | 'custom';
  commandHint: string;
  runtimeMode: string;
  status: string;
  installStatus: string;
  permissionsSnapshot: string[];
  runtimeReady: boolean;
  runtimeReadinessReason: string | null;
  installedBy: string | null;
  installedAt: string;
  agentConfig: ChatAgentConfig | null;
}
