/**
 * Conversation agents — the chat-bot contract, ported from mobile
 * frontend/src/domain/chat.ts. Kept separate from lib/contracts/agents.ts
 * (which is the automation-assistants domain for seller tools): these are
 * group-conversation deployments, the shape GET /chat/bots and
 * GET /chat/conversations/:id/bots return.
 */

/** Server-owned AI behavior contract — present for AI-runtime agents. */
export interface ChatAgentConfig {
  instructions: string;
  model: 'gpt-5.6-sol' | 'gpt-5.6-terra' | 'gpt-5.6-luna' | string;
  triggerMode: 'mention' | 'command' | 'always';
  responseLength: 'concise' | 'balanced' | 'detailed';
  tone: 'focused' | 'warm' | 'expert';
  reasoningEffort: 'low' | 'medium' | 'high';
  historyLimit: number;
  starterPrompts: string[];
}

export type ConversationAgentCategory =
  | 'moderation'
  | 'commerce'
  | 'automation'
  | 'assistant'
  | 'safety'
  | 'styling';

/** A deployable agent — the ChatBot shape /chat/bots returns. */
export interface ConversationAgent {
  id: string;
  slug: string;
  name: string;
  description: string;
  commandHint: string;
  category: ConversationAgentCategory;
  status: 'available' | 'local-only' | 'backend-required';
  permissions: string[];
  type: 'system' | 'custom';
  ownerId?: string;
  isDraft?: boolean;
  isDisabled?: boolean;
  /** How the agent executes — 'local' | 'config-only' | 'backend' | 'ai'. */
  runtimeMode?: string;
  icon?: string;
  agentConfig?: ChatAgentConfig;
  /** True only when this environment can execute the selected runtime. */
  runtimeReady?: boolean;
  runtimeReadinessReason?: string;
}

/**
 * Real deployment state for an agent installed in a conversation —
 * exactly what GET /chat/conversations/:conversationId/bots returns.
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
