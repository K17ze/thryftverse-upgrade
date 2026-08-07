/**
 * Chat Agents API — AI agents that can be deployed into conversations.
 *
 * This service powers the "AI agents in chat" surface (Mercari ChatGPT,
 * Depop AI replies, Poshmark Smart Sell class of features). It is a
 * self-contained demo-mode service: every response is mock data clearly
 * labelled with `isDemo: true` so the UI never fabricates real AI output
 * (AGENTS.md §11 — Truthful UI).
 *
 * Agent types:
 *  - shopping_assistant: helps buyers find items, suggests search terms
 *  - negotiator:         helps with offer / counter-offer (Smart Sell tie-in)
 *  - style_advisor:      suggests outfit combinations, moodboard integration
 *  - listing_helper:     helps sellers create better listings
 *  - safety_filter:      flags suspicious messages, scam detection
 *  - custom:             user-authored agents created via BotBuilder
 *
 * When `CHAT_AGENTS_DEMO_MODE` is true, all functions return synchronously
 * generated mock data. Flip the flag and swap the bodies for a real backend
 * integration later — the public function signatures stay the same.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Demo mode flag — every mock response is labelled with isDemo: true.
// ---------------------------------------------------------------------------
export const CHAT_AGENTS_DEMO_MODE = true;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChatAgentType =
  | 'shopping_assistant'
  | 'negotiator'
  | 'style_advisor'
  | 'listing_helper'
  | 'safety_filter'
  | 'custom';

export type SuggestedReplyType = 'question' | 'answer' | 'offer' | 'info';

export interface SuggestedReply {
  text: string;
  type: SuggestedReplyType;
  /** 0..1 — how confident the agent is in this suggestion. */
  confidence: number;
}

export interface ChatAgent {
  id: string;
  type: ChatAgentType;
  name: string;
  /** Ionicon name used for the avatar glyph. */
  avatar: string;
  description: string;
  capabilities: string[];
  isDemo: boolean;
  /** Present only for user-authored custom agents. */
  customInstructions?: string;
  /** Present only for user-authored custom agents. */
  customModel?: string;
  /** Present only for user-authored custom agents. */
  customCapabilities?: string[];
  /** True when this agent was created by the user via BotBuilder. */
  isCustom?: boolean;
}

export interface ChatAgentMessage {
  id: string;
  agentId: string;
  conversationId: string;
  content: string;
  /** 0..1 — confidence in the generated response. */
  confidence: number;
  suggestedReplies: SuggestedReply[];
  createdAt: string;
  isDemo: boolean;
}

// ---------------------------------------------------------------------------
// Agent catalogue — 5 distinct personalities with clear capabilities.
// ---------------------------------------------------------------------------

const AGENT_CATALOGUE: ChatAgent[] = [
  {
    id: 'agent_shopping_assistant',
    type: 'shopping_assistant',
    name: 'Shop Scout',
    avatar: 'cart-outline',
    description: 'Helps buyers find items and suggests search terms.',
    capabilities: ['Find similar items', 'Suggest search terms', 'Price compare'],
    isDemo: true,
  },
  {
    id: 'agent_negotiator',
    type: 'negotiator',
    name: 'Deal Maker',
    avatar: 'pricetags-outline',
    description: 'Helps with offers and counter-offers. Integrates with Smart Sell.',
    capabilities: ['Suggest offer range', 'Counter-offer coaching', 'Smart Sell sync'],
    isDemo: true,
  },
  {
    id: 'agent_style_advisor',
    type: 'style_advisor',
    name: 'Style Muse',
    avatar: 'color-palette-outline',
    description: 'Suggests outfit combinations and moodboard pairings.',
    capabilities: ['Outfit pairing', 'Moodboard ideas', 'Trend matches'],
    isDemo: true,
  },
  {
    id: 'agent_listing_helper',
    type: 'listing_helper',
    name: 'Listing Coach',
    avatar: 'create-outline',
    description: 'Helps sellers create better listings and descriptions.',
    capabilities: ['Title polish', 'Description tips', 'Pricing guidance'],
    isDemo: true,
  },
  {
    id: 'agent_safety_filter',
    type: 'safety_filter',
    name: 'Safety Shield',
    avatar: 'shield-checkmark-outline',
    description: 'Flags suspicious messages and detects scams.',
    capabilities: ['Scam detection', 'Off-platform payment alerts', 'Suspicious link flags'],
    isDemo: true,
  },
];

// ---------------------------------------------------------------------------
// In-memory deployment registry (demo only — not persisted).
// conversationId -> deployed agent ids
// ---------------------------------------------------------------------------
const deployedAgentsByConversation = new Map<string, string[]>();

/**
 * In-memory registry of custom agents that have been created or deployed in
 * the current session. This lets `agentById` resolve custom agents for
 * `getDeployedAgents` and `getAgentResponse` without an async lookup on every
 * call. Persisted copies live in AsyncStorage via `saveCustomAgent`.
 */
const customAgentRegistry = new Map<string, ChatAgent>();

function registerCustomAgent(agent: ChatAgent): void {
  customAgentRegistry.set(agent.id, agent);
}

function getDeployedIds(conversationId: string): string[] {
  return deployedAgentsByConversation.get(conversationId) ?? [];
}

function setDeployedIds(conversationId: string, ids: string[]): void {
  deployedAgentsByConversation.set(conversationId, ids);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function agentById(id: string): ChatAgent | undefined {
  return AGENT_CATALOGUE.find((agent) => agent.id === id) ?? customAgentRegistry.get(id);
}

function agentByType(type: ChatAgentType): ChatAgent | undefined {
  return AGENT_CATALOGUE.find((agent) => agent.type === type);
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the full catalogue of deployable AI agents.
 */
export function getAvailableAgents(): ChatAgent[] {
  return AGENT_CATALOGUE.map((agent) => ({ ...agent }));
}

/**
 * Deploys an agent of the given type into a conversation. In demo mode this
 * only updates the in-memory registry and returns the agent descriptor.
 */
export function deployAgent(
  conversationId: string,
  agentType: ChatAgentType,
): ChatAgent {
  const agent = agentByType(agentType);
  if (!agent) {
    throw new Error(`Unknown chat agent type: ${agentType}`);
  }
  const ids = getDeployedIds(conversationId);
  if (!ids.includes(agent.id)) {
    setDeployedIds(conversationId, [...ids, agent.id]);
  }
  return { ...agent };
}

/**
 * Deploys a custom (user-authored) agent into a conversation. The agent
 * descriptor is registered in-memory so it can be resolved by id for the
 * remainder of the session.
 */
export function deployCustomAgent(
  conversationId: string,
  agent: ChatAgent,
): ChatAgent {
  registerCustomAgent(agent);
  const ids = getDeployedIds(conversationId);
  if (!ids.includes(agent.id)) {
    setDeployedIds(conversationId, [...ids, agent.id]);
  }
  return { ...agent };
}

/**
 * Returns the agents currently deployed into a conversation.
 */
export function getDeployedAgents(conversationId: string): ChatAgent[] {
  return getDeployedIds(conversationId)
    .map((id) => agentById(id))
    .filter((agent): agent is ChatAgent => Boolean(agent))
    .map((agent) => ({ ...agent }));
}

/**
 * Removes a deployed agent from a conversation.
 */
export function removeAgent(conversationId: string, agentId: string): void {
  const ids = getDeployedIds(conversationId).filter((id) => id !== agentId);
  if (ids.length === 0) {
    deployedAgentsByConversation.delete(conversationId);
  } else {
    setDeployedIds(conversationId, ids);
  }
}

/**
 * Returns suggested replies for the current conversation context, based on
 * the last message and the deployed agent mix. In demo mode the suggestions
 * are deterministic mock replies tailored per agent type.
 */
export function getAgentSuggestions(
  conversationId: string,
  lastMessage: string,
): SuggestedReply[] {
  const agents = getDeployedAgents(conversationId);
  if (agents.length === 0 || !CHAT_AGENTS_DEMO_MODE) {
    return [];
  }

  const lower = lastMessage.toLowerCase();
  const replies: SuggestedReply[] = [];

  for (const agent of agents) {
    switch (agent.type) {
      case 'shopping_assistant':
        if (lower.includes('size') || lower.includes('available')) {
          replies.push({
            text: 'Is this still available in a size M?',
            type: 'question',
            confidence: 0.82,
          });
        }
        replies.push({
          text: 'Can you show me similar items under £40?',
          type: 'question',
          confidence: 0.74,
        });
        break;
      case 'negotiator':
        replies.push({
          text: 'Would you accept £30 including postage?',
          type: 'offer',
          confidence: 0.78,
        });
        replies.push({
          text: 'Is there any flexibility on the price?',
          type: 'question',
          confidence: 0.69,
        });
        break;
      case 'style_advisor':
        replies.push({
          text: 'What would this pair well with?',
          type: 'question',
          confidence: 0.71,
        });
        break;
      case 'listing_helper':
        replies.push({
          text: 'Want tips to make your listing stand out?',
          type: 'info',
          confidence: 0.66,
        });
        break;
      case 'safety_filter':
        // Safety agent does not surface chatty suggestions; it flags risk.
        if (lower.includes('cash') || lower.includes('paypal') || lower.includes('wire')) {
          replies.push({
            text: 'Keep payments in Thryftverse to stay protected.',
            type: 'info',
            confidence: 0.91,
          });
        }
        break;
      case 'custom': {
        const caps = agent.customCapabilities ?? agent.capabilities;
        if (caps.some((c) => c.toLowerCase().includes('offer'))) {
          replies.push({
            text: 'Would you accept a slightly lower offer?',
            type: 'offer',
            confidence: 0.7,
          });
        }
        if (caps.some((c) => c.toLowerCase().includes('search'))) {
          replies.push({
            text: 'Can you show me similar listings?',
            type: 'question',
            confidence: 0.68,
          });
        }
        if (caps.some((c) => c.toLowerCase().includes('style'))) {
          replies.push({
            text: 'What would this pair well with?',
            type: 'question',
            confidence: 0.66,
          });
        }
        if (replies.length === 0) {
          replies.push({
            text: 'Tell me more about what you need.',
            type: 'question',
            confidence: 0.6,
          });
        }
        break;
      }
    }
  }

  // De-duplicate by text and cap at 4 for the horizontal bar.
  const seen = new Set<string>();
  return replies
    .filter((reply) => {
      if (seen.has(reply.text)) return false;
      seen.add(reply.text);
      return true;
    })
    .slice(0, 4);
}

/**
 * Generates a mock agent response to a user message. The response content is
 * shaped by the deployed agent types so the conversation feels coherent.
 */
export function getAgentResponse(
  conversationId: string,
  userMessage: string,
): ChatAgentMessage {
  const agents = getDeployedAgents(conversationId);
  const primary = agents[0];

  if (!primary || !CHAT_AGENTS_DEMO_MODE) {
    return {
      id: makeId('agent_msg'),
      agentId: 'none',
      conversationId,
      content: '',
      confidence: 0,
      suggestedReplies: [],
      createdAt: new Date().toISOString(),
      isDemo: true,
    };
  }

  const lower = userMessage.toLowerCase();
  let content = '';
  let confidence = 0.7;

  switch (primary.type) {
    case 'shopping_assistant':
      content = lower.includes('similar')
        ? 'Here are a few similar listings I found in your area — want me to narrow by size or price?'
        : 'I can search for items like this. Try telling me your budget and preferred size.';
      confidence = 0.76;
      break;
    case 'negotiator':
      content = lower.includes('offer')
        ? 'Based on recent sold comps, a fair opening offer is around 85% of list. Want me to draft one?'
        : 'I can suggest a counter-offer range. What was their last price?';
      confidence = 0.8;
      break;
    case 'style_advisor':
      content = 'This would layer nicely with neutral basics. I can pull a moodboard pairing if you like.';
      confidence = 0.68;
      break;
    case 'listing_helper':
      content = 'Add a clear first photo with natural light, and lead your title with the brand and size — it lifts search ranking.';
      confidence = 0.73;
      break;
    case 'safety_filter':
      content = lower.includes('cash') || lower.includes('paypal')
        ? 'Heads up: off-platform payments aren\'t covered by Buyer Protection. Keep the transaction in-app.'
        : 'I scanned the message and didn\'t find any common scam patterns. Stay alert to off-platform requests.';
      confidence = 0.88;
      break;
    case 'custom':
      content = customAgentResponse(primary, userMessage);
      confidence = 0.72;
      break;
  }

  return {
    id: makeId('agent_msg'),
    agentId: primary.id,
    conversationId,
    content,
    confidence,
    suggestedReplies: getAgentSuggestions(conversationId, userMessage),
    createdAt: new Date().toISOString(),
    isDemo: true,
  };
}

// ---------------------------------------------------------------------------
// Custom agents — user-authored AI agents persisted to AsyncStorage.
// All custom agents are truthfully labelled with isDemo: true and isCustom: true
// (AGENTS.md §11 — Truthful UI).
// ---------------------------------------------------------------------------

const CUSTOM_AGENTS_STORAGE_KEY = 'thryftverse:custom-chat-agents:v1';

/** Configuration used to create a custom agent via BotBuilder. */
export interface CustomAgentConfig {
  name: string;
  description: string;
  avatar?: string;
  instructions: string;
  model: string;
  capabilities: string[];
  personality: string;
}

/**
 * Creates a ChatAgent descriptor from a user-supplied configuration.
 * The returned agent is always labelled `isDemo: true` and `isCustom: true`
 * because this environment cannot execute a real model — it is a truthful
 * preview of how the agent will appear in chat (AGENTS.md §11).
 */
export function createCustomAgent(config: CustomAgentConfig): ChatAgent {
  const agent: ChatAgent = {
    id: makeId('custom_agent'),
    type: 'custom',
    name: config.name.trim(),
    avatar: config.avatar && config.avatar.length > 0 ? config.avatar : 'sparkles-outline',
    description: config.description.trim(),
    capabilities: config.capabilities,
    isDemo: true,
    isCustom: true,
    customInstructions: config.instructions.trim(),
    customModel: config.model,
    customCapabilities: config.capabilities,
  };
  registerCustomAgent(agent);
  return agent;
}

/**
 * Persists a custom agent to AsyncStorage so it survives app restarts.
 */
export async function saveCustomAgent(agent: ChatAgent): Promise<void> {
  try {
    const existing = await getCustomAgents();
    const index = existing.findIndex((item) => item.id === agent.id);
    const next = index >= 0
      ? existing.map((item) => (item.id === agent.id ? agent : item))
      : [...existing, agent];
    await AsyncStorage.setItem(
      CUSTOM_AGENTS_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // AsyncStorage failures are non-fatal in demo mode — the in-memory
    // descriptor is still usable for the current session.
  }
}

/**
 * Retrieves all user-created custom agents from AsyncStorage.
 * Returns an empty array when nothing has been persisted yet.
 */
export async function getCustomAgents(): Promise<ChatAgent[]> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_AGENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatAgent[];
    if (!Array.isArray(parsed)) return [];
    // Re-assert the truthful demo/custom labels on read so stale data
    // can never present itself as a live backend agent.
    return parsed.map((agent) => ({
      ...agent,
      type: 'custom' as const,
      isDemo: true,
      isCustom: true,
    }));
  } catch {
    return [];
  }
}

/**
 * Removes a persisted custom agent by id.
 */
export async function deleteCustomAgent(agentId: string): Promise<void> {
  try {
    const existing = await getCustomAgents();
    const next = existing.filter((item) => item.id !== agentId);
    await AsyncStorage.setItem(
      CUSTOM_AGENTS_STORAGE_KEY,
      JSON.stringify(next),
    );
  } catch {
    // Non-fatal in demo mode.
  }
}

/**
 * Produces a truthful demo response for a custom agent, shaped by its
 * personality preset and capabilities so the preview conversation feels
 * coherent with the user's configuration.
 */
function customAgentResponse(agent: ChatAgent, userMessage: string): string {
  const lower = userMessage.toLowerCase();
  const capabilities = agent.customCapabilities ?? agent.capabilities;
  const hasSearch = capabilities.some((c) => c.toLowerCase().includes('search'));
  const hasOffers = capabilities.some((c) => c.toLowerCase().includes('offer'));
  const hasStyle = capabilities.some((c) => c.toLowerCase().includes('style'));
  const hasSafety = capabilities.some((c) => c.toLowerCase().includes('safety'));
  const hasAutoReply = capabilities.some((c) => c.toLowerCase().includes('auto'));

  if (hasSafety && (lower.includes('cash') || lower.includes('paypal') || lower.includes('wire'))) {
    return 'Heads up: keep payments in-app to stay protected by Buyer Protection.';
  }
  if (hasSearch && (lower.includes('find') || lower.includes('search') || lower.includes('similar'))) {
    return 'I can look for similar listings — tell me your budget and preferred size and I\'ll narrow it down.';
  }
  if (hasOffers && (lower.includes('offer') || lower.includes('price') || lower.includes('deal'))) {
    return 'Based on recent comps, a fair opening offer is around 85% of list. Want me to draft one?';
  }
  if (hasStyle && (lower.includes('wear') || lower.includes('pair') || lower.includes('style'))) {
    return 'This would layer well with neutral basics. I can pull a moodboard pairing if you like.';
  }
  if (hasAutoReply) {
    return 'Thanks for your message — I\'ve reviewed the context and I\'m ready to help with the next step.';
  }
  return 'I\'m here to help with that. Give me a bit more detail and I\'ll suggest the best next step.';
}
