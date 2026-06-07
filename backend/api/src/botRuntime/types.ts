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
}

export interface BotHandlerResult {
  text: string;
  metadata?: Record<string, unknown>;
  shouldReply: boolean;
}

export type BotCategoryHandler = (ctx: BotRuntimeContext) => BotHandlerResult | Promise<BotHandlerResult>;

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
}
