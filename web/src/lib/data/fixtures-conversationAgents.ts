/**
 * Conversation-agent fixtures — the chat-bot catalog and per-conversation
 * deployments, ported from mobile MOCK_CHAT_BOTS + the store's botIds
 * slice. Fixture mode is the honest stand-in for GET /chat/bots and
 * GET /chat/conversations/:id/bots — deploy/undeploy mutate the module
 * dataset and append the same system message the mobile store emits
 * ("Guard deployed. Try /guard status" / "Guard removed from the group."),
 * so the thread and the row preview show the change on the same write.
 */

import type {
  ConversationAgent,
  ConversationBotDeployment,
} from '@/lib/contracts/conversationAgents';
import { appendFixtureMessage, CONVERSATIONS } from './fixtures';

export const CONVERSATION_AGENTS: ConversationAgent[] = [
  {
    id: 'bot_guard',
    slug: 'guard',
    name: 'Guard',
    description: 'Moderation helper for rules, join messages, and spam guardrails.',
    commandHint: '/guard status',
    category: 'moderation',
    status: 'available',
    type: 'system',
    runtimeMode: 'backend',
    permissions: ['read_messages', 'send_messages'],
    runtimeReady: true,
  },
  {
    id: 'bot_trade',
    slug: 'tradeops',
    name: 'TradeOps',
    description: 'Posts auction and co-own market alerts into your group.',
    commandHint: '/tradeops alerts on',
    category: 'commerce',
    status: 'available',
    type: 'system',
    runtimeMode: 'backend',
    permissions: ['read_messages', 'send_messages'],
    runtimeReady: true,
  },
  {
    id: 'bot_brief',
    slug: 'brief',
    name: 'Daily Brief',
    description: 'Sends timed digest updates and pinned reminders.',
    commandHint: '/brief now',
    category: 'automation',
    status: 'available',
    type: 'system',
    runtimeMode: 'backend',
    permissions: ['read_messages', 'send_messages'],
    runtimeReady: true,
  },
  {
    id: 'bot_deals',
    slug: 'deals',
    name: 'Deal Assistant',
    description: 'Suggests price drops and bundle deals based on your saved items.',
    commandHint: '/deals check',
    category: 'assistant',
    status: 'local-only',
    type: 'system',
    runtimeMode: 'local',
    permissions: ['read_saved', 'send_suggestions'],
    runtimeReady: true,
  },
  {
    id: 'bot_price',
    slug: 'price',
    name: 'Price Helper',
    description: 'Checks market value and recent sold prices for listings.',
    commandHint: '/price value',
    category: 'assistant',
    status: 'backend-required',
    type: 'system',
    runtimeMode: 'ai',
    permissions: ['read_listings', 'read_market_data'],
    runtimeReady: true,
  },
  {
    id: 'bot_shipping',
    slug: 'shipping',
    name: 'Shipping Helper',
    description: 'Estimates delivery times and tracks parcels when connected.',
    commandHint: '/shipping track',
    category: 'assistant',
    status: 'backend-required',
    type: 'system',
    runtimeMode: 'backend',
    permissions: ['read_orders', 'read_tracking'],
    runtimeReady: true,
  },
  {
    id: 'bot_safety',
    slug: 'safety',
    name: 'Safety / Scam Check',
    description: 'Flags suspicious messages and offers safety tips in transactions.',
    commandHint: '/safety report',
    category: 'safety',
    status: 'local-only',
    type: 'system',
    runtimeMode: 'local',
    permissions: ['read_messages', 'send_alerts'],
    runtimeReady: true,
  },
  {
    id: 'bot_stylist',
    slug: 'stylist',
    name: 'Wardrobe Stylist',
    description: 'Suggests outfit pairings and style tips from saved items.',
    commandHint: '/stylist suggest',
    category: 'styling',
    status: 'local-only',
    type: 'system',
    runtimeMode: 'local',
    permissions: ['read_saved', 'send_suggestions'],
    runtimeReady: true,
  },
];

/**
 * Deployments keyed by conversation id — the fixture answer to
 * GET /chat/conversations/:id/bots. Seeded so both fixture groups show
 * the populated path (g1's Deployment mirrors a real install; g2 starts
 * empty so Connect exercises the first-run state).
 */
export const CONVERSATION_AGENT_DEPLOYMENTS: Record<
  string,
  ConversationBotDeployment[]
> = {
  g1: [
    {
      botId: 'bot_guard',
      botName: 'Guard',
      botSlug: 'guard',
      botCategory: 'moderation',
      botType: 'system',
      commandHint: '/guard status',
      runtimeMode: 'backend',
      status: 'available',
      installStatus: 'installed',
      permissionsSnapshot: ['read_messages', 'send_messages'],
      runtimeReady: true,
      runtimeReadinessReason: null,
      installedBy: 'me',
      installedAt: '2026-09-23T09:05:00Z',
      agentConfig: null,
    },
  ],
};

function deploymentFor(agent: ConversationAgent, installerId: string | null): ConversationBotDeployment {
  return {
    botId: agent.id,
    botName: agent.name,
    botSlug: agent.slug,
    botCategory: agent.category,
    botType: agent.type,
    commandHint: agent.commandHint,
    runtimeMode: agent.runtimeMode ?? 'backend',
    status: agent.status,
    installStatus: 'installed',
    permissionsSnapshot: [...agent.permissions],
    runtimeReady: agent.runtimeReady ?? agent.runtimeMode !== 'ai',
    runtimeReadinessReason: agent.runtimeReadinessReason ?? null,
    installedBy: installerId,
    installedAt: new Date().toISOString(),
    agentConfig: agent.agentConfig ?? null,
  };
}

/**
 * Fixture deploy — mirrors the mobile store's connectConversationAgent:
 * the deployment lands in the map and a system message posts into the
 * thread so the change reads in-chat, not just on the info surface.
 */
export function deployFixtureConversationAgent(
  conversationId: string,
  botId: string,
  installerId: string | null = 'me',
): boolean {
  const convo = CONVERSATIONS.find((c) => c.id === conversationId);
  const agent = CONVERSATION_AGENTS.find((b) => b.id === botId);
  if (!convo || !agent) return false;
  const list = (CONVERSATION_AGENT_DEPLOYMENTS[conversationId] ??= []);
  if (list.some((d) => d.botId === botId)) return true; // idempotent
  list.push(deploymentFor(agent, installerId));
  appendFixtureMessage(conversationId, {
    id: `local-${Date.now()}-agent-deploy`,
    senderId: 'system',
    sender: 'system',
    isSystem: true,
    systemTitle: 'Agent connected',
    text: `${agent.name} deployed. Try ${agent.commandHint}`,
    timestamp: new Date().toISOString(),
    type: 'system',
  });
  return true;
}

/** Fixture undeploy — mirrors mobile disconnectConversationAgent. */
export function undeployFixtureConversationAgent(
  conversationId: string,
  botId: string,
): boolean {
  const list = CONVERSATION_AGENT_DEPLOYMENTS[conversationId];
  if (!list || !list.some((d) => d.botId === botId)) return false;
  CONVERSATION_AGENT_DEPLOYMENTS[conversationId] = list.filter(
    (d) => d.botId !== botId,
  );
  const agent = CONVERSATION_AGENTS.find((b) => b.id === botId);
  appendFixtureMessage(conversationId, {
    id: `local-${Date.now()}-agent-remove`,
    senderId: 'system',
    sender: 'system',
    isSystem: true,
    systemTitle: 'Agent removed',
    text: agent
      ? `${agent.name} removed from the group.`
      : 'An agent was removed from this group.',
    timestamp: new Date().toISOString(),
    type: 'system',
  });
  return true;
}
