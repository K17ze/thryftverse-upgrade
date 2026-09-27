/**
 * Conversation-agents service — mirrors mobile botsApi/chatApi chat-bot
 * routes: the deployable catalog (GET /chat/bots), a conversation's
 * deployments (GET /chat/conversations/:id/bots), and the deploy/undeploy
 * edges (POST .../bots/:botId/deploy, DELETE .../bots/:botId).
 */

import { fetchJson } from '../http';
import type {
  ConversationAgent,
  ConversationBotDeployment,
} from '@/lib/contracts/conversationAgents';

/** Raw /chat/bots row — the ApiBotPayload the mobile mapper consumes. */
interface ApiBotPayload {
  id: string;
  slug?: string;
  name: string;
  description?: string;
  commandHint?: string;
  category?: ConversationAgent['category'];
  status?: ConversationAgent['status'];
  permissions?: string[];
  type?: 'system' | 'custom';
  ownerId?: string;
  isDraft?: boolean;
  isDisabled?: boolean;
  runtimeMode?: string;
  icon?: string;
  agentConfig?: ConversationAgent['agentConfig'];
  runtimeReady?: boolean;
  runtimeReadinessReason?: string;
}

function mapApiBot(payload: ApiBotPayload): ConversationAgent {
  return {
    id: payload.id,
    slug: payload.slug ?? payload.id,
    name: payload.name,
    description: payload.description ?? '',
    commandHint: payload.commandHint ?? '',
    category: payload.category ?? 'assistant',
    status: payload.status ?? 'backend-required',
    permissions: payload.permissions ?? ['read_messages', 'send_messages'],
    type: payload.type ?? 'system',
    ownerId: payload.ownerId ?? undefined,
    isDraft: payload.isDraft ?? false,
    isDisabled: payload.isDisabled ?? false,
    runtimeMode: payload.runtimeMode ?? 'backend',
    icon: payload.icon ?? undefined,
    agentConfig: payload.agentConfig ?? undefined,
    // Mirrors mobile: only non-AI runtimes are assumed executable when the
    // flag is absent.
    runtimeReady: payload.runtimeReady ?? payload.runtimeMode !== 'ai',
    runtimeReadinessReason: payload.runtimeReadinessReason ?? undefined,
  };
}

/** Deployable catalog — GET /chat/bots (system + viewer's custom agents). */
export async function fetchChatAgents(
  signal?: AbortSignal,
): Promise<ConversationAgent[]> {
  const payload = await fetchJson<{ ok?: boolean; items?: ApiBotPayload[] }>(
    '/chat/bots',
    undefined,
    { signal },
  );
  return (payload.items ?? []).map(mapApiBot);
}

/** Installed agents — GET /chat/conversations/:id/bots. */
export async function fetchConversationAgentDeployments(
  conversationId: string,
  signal?: AbortSignal,
): Promise<ConversationBotDeployment[]> {
  const payload = await fetchJson<{
    ok?: boolean;
    items?: ConversationBotDeployment[];
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/bots`, undefined, {
    signal,
  });
  return payload.items ?? [];
}

/** Install an agent — POST .../bots/:botId/deploy. */
export async function deployConversationAgent(
  conversationId: string,
  botId: string,
): Promise<void> {
  const payload = await fetchJson<{ ok?: boolean; installed?: boolean }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/bots/${encodeURIComponent(botId)}/deploy`,
    { method: 'POST' },
  );
  if (payload.ok === false) throw new Error('Failed to deploy agent');
}

/** Remove an agent — DELETE .../bots/:botId. */
export async function undeployConversationAgent(
  conversationId: string,
  botId: string,
): Promise<void> {
  const payload = await fetchJson<{ ok?: boolean; removed?: boolean }>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/bots/${encodeURIComponent(botId)}`,
    { method: 'DELETE' },
  );
  if (payload.ok === false) throw new Error('Failed to remove agent');
}
