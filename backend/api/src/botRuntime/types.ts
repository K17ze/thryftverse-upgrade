/**
 * BotRuntime — Types for bot command execution
 */

export interface BotRuntimeContext {
  botId: string;
  botName: string;
  botSlug: string;
  botCategory: string;
  botType: 'system' | 'custom';
  commandHint: string;
  conversationId: string;
  conversationType: 'dm' | 'group';
  conversationTitle: string | null;
  actorUserId: string;
  actorUserName: string | null;
  permissionsSnapshot: string[];
  command: string;
  args: string[];
  messageText: string;
  agentConfig: AgentConfig | null;
  conversationHistory: AgentConversationTurn[];
  runtimeData: BotRuntimeData;
}

export interface BotHandlerResult {
  text: string;
  metadata?: Record<string, unknown>;
  shouldReply: boolean;
  /** Confidence score 0–1. When below the agent's threshold, needsHumanReview is set. */
  confidence?: number;
  /** Human-readable rationale for why the agent produced this response. */
  explanation?: string;
  /** True when confidence is below threshold and a human should review before acting. */
  needsHumanReview?: boolean;
}

export type BotCategoryHandler = (ctx: BotRuntimeContext) => BotHandlerResult | Promise<BotHandlerResult>;

export type AgentModel = 'gpt-5.6-sol' | 'gpt-5.6-terra' | 'gpt-5.6-luna';
export type AgentTriggerMode = 'mention' | 'command' | 'always';
export type AgentResponseLength = 'concise' | 'balanced' | 'detailed';
export type AgentTone = 'focused' | 'warm' | 'expert';
export type AgentReasoningEffort = 'low' | 'medium' | 'high';

export interface AgentConfig {
  instructions: string;
  model: AgentModel;
  triggerMode: AgentTriggerMode;
  responseLength: AgentResponseLength;
  tone: AgentTone;
  reasoningEffort: AgentReasoningEffort;
  historyLimit: number;
  starterPrompts: string[];
  /** Minimum confidence (0–1) for the agent to act autonomously. Below this, the response is flagged for human review. */
  confidenceThreshold: number;
}

export interface AgentConversationTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface BotRuntimeListing {
  id: string;
  title: string;
  priceGbp: number;
  brand: string | null;
}

export interface BotRuntimeData {
  listings: BotRuntimeListing[];
  recentMessagesAnalyzed: number;
  messagesRequiringReview: number;
}

export interface BotInstallInfo {
  botId: string;
  botName: string;
  botSlug: string;
  botCategory: string;
  botType: 'system' | 'custom';
  commandHint: string;
  permissionsSnapshot: string[];
  runtimeMode: string;
  status: string;
  agentConfig: AgentConfig | null;
}

/** Callback invoked for each text delta during streaming. */
export type AgentStreamChunkHandler = (delta: string) => void;

/**
 * Canonical agent contract — the shared source-of-truth for agent definitions
 * across frontend and backend. Both sides must use this shape.
 *
 * The legacy AgentConfig is retained for backward compatibility but new code
 * should use CanonicalAgentContract.
 */
export interface CanonicalAgentContract {
  // Identity
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  commandHint: string;
  icon: string | null;

  // Behaviour
  instructions: string;
  triggerMode: AgentTriggerMode;
  tone: AgentTone;
  responseLength: AgentResponseLength;
  reasoningEffort: AgentReasoningEffort;
  starterPrompts: string[];

  // Model
  model: AgentModel;
  historyLimit: number;
  confidenceThreshold: number;

  // Permissions (backend flat vocabulary: reply_in_chat, read_messages)
  permissions: string[];

  // Lifecycle
  isDraft: boolean;
  status: AgentStatus;
  runtimeMode: AgentRuntimeMode;
}

export type AgentCategory = 'assistant' | 'styling' | 'commerce' | 'moderation' | 'safety' | 'automation';
export type AgentStatus = 'available' | 'local-only' | 'backend-required' | 'disabled';
export type AgentRuntimeMode = 'local' | 'config-only' | 'backend' | 'ai';

/**
 * Deployment state for a bot installed in a conversation.
 * This is what the frontend reads to show real deployment state.
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
  agentConfig: AgentConfig | null;
}
