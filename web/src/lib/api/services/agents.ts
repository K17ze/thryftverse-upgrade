/**
 * Web agents service — mirrors frontend/src/services/botsApi.ts and the
 * backend contract in backend/api/src/routes/bots.ts:
 *
 *  - GET  /bots/system  → the public system-bot directory ('stock').
 *  - GET  /bots         → the caller's own custom bots ('own'). Auth required;
 *                         a guest 401 propagates — never masked as "empty".
 *  - POST /bots         → creates a custom bot. We always create drafts
 *                         (isDraft: true) with a real agentConfig, so the
 *                         published-agent validation (instructions ≥ 20 chars
 *                         + 'reply_in_chat' permission) is not silently 400ing
 *                         every create.
 *  - PATCH /bots/:id    → owner-only on custom bots; the status enum is
 *                         'available' | 'local-only' | 'backend-required' |
 *                         'disabled' — 'active'/'paused' do not exist.
 *
 * There is no user-level install on the wire: bots deploy into
 * conversations via POST /chat/conversations/:id/bots/:botId/deploy
 * (services/conversationAgents.ts). Display fields the wire doesn't carry
 * (install counts, automation triggers) stay on fixture rows only.
 */

import { fetchJson } from '../http';
import type {
  AgentBot,
  AgentBotStatus,
  AgentCapability,
  AgentMemory,
  AgentMemorySettings,
  AgentModelId,
  AgentPurposeId,
  AgentRunEntry,
  AgentRunOutcome,
  AgentTriggerMode,
} from '@/lib/contracts/agents';
import {
  DEFAULT_MODEL,
  SUPPORTED_MODELS,
  isAgentCapability,
} from '@/lib/contracts/agents';

interface ApiAgentConfig {
  instructions?: string;
  model?: string;
  triggerMode?: string;
  responseLength?: string;
  tone?: string;
  reasoningEffort?: string;
  historyLimit?: number;
  starterPrompts?: string[];
}

interface ApiBotRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  commandHint?: string;
  category: 'moderation' | 'commerce' | 'automation' | 'assistant' | 'safety' | 'styling';
  type: 'system' | 'custom';
  status: string;
  runtimeMode?: string;
  isDraft: boolean;
  permissions?: unknown;
  icon?: string | null;
  agentConfig?: ApiAgentConfig | null;
  runtimeReady?: boolean;
  runtimeReadinessReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const CATEGORY_MAP: Record<string, AgentBot['category']> = {
  moderation: 'safety',
  commerce: 'commerce',
  automation: 'automation',
  assistant: 'assistant',
  safety: 'safety',
  styling: 'styling',
};

const MODEL_IDS = new Set<string>(SUPPORTED_MODELS.map((m) => m.value));

function asModelId(value: unknown): AgentModelId | undefined {
  return typeof value === 'string' && MODEL_IDS.has(value)
    ? (value as AgentModelId)
    : undefined;
}

function asTriggerMode(value: unknown): AgentTriggerMode | undefined {
  return value === 'mention' || value === 'command' || value === 'always'
    ? value
    : undefined;
}

function asBotStatus(value: unknown): AgentBotStatus | undefined {
  return value === 'available' ||
    value === 'local-only' ||
    value === 'backend-required' ||
    value === 'disabled'
    ? value
    : undefined;
}

function permissionsToStrings(permissions: unknown): string[] {
  if (!Array.isArray(permissions)) return [];
  return permissions.filter((p): p is string => typeof p === 'string');
}

function permissionsToCapabilities(permissions: unknown): AgentCapability[] {
  return permissionsToStrings(permissions).filter(isAgentCapability);
}

function mapBotRow(row: ApiBotRow, origin: 'stock' | 'own'): AgentBot {
  const status = asBotStatus(row.status);
  const model = asModelId(row.agentConfig?.model);
  const triggerMode = asTriggerMode(row.agentConfig?.triggerMode);
  return {
    id: row.id,
    name: row.name,
    purpose: row.description || row.commandHint || row.name,
    description: row.description || '',
    category: CATEGORY_MAP[row.category] ?? 'automation',
    purposeId: null,
    ...(model ? { model } : {}),
    ...(triggerMode ? { triggerMode } : {}),
    creator: origin === 'stock' ? 'ThryftVerse' : 'You',
    origin,
    capabilities: permissionsToCapabilities(row.permissions),
    permissions: permissionsToStrings(row.permissions),
    ...(status ? { status } : {}),
    enabled: status === 'available',
    isDraft: row.isDraft === true,
    // Only the owner of a custom bot can PATCH it — the directory is
    // read-only, so stock rows never get a status toggle.
    canToggle: origin === 'own',
    runtimeReady: row.runtimeReady,
    runtimeReadinessReason: row.runtimeReadinessReason ?? null,
    createdAt: row.createdAt ?? '',
  };
}

export async function fetchAgentBots(signal?: AbortSignal): Promise<AgentBot[]> {
  // Both legs reject honestly: /bots requires auth (a guest 401 surfaces as
  // the sign-in wall) and a failed /bots/system must not render as an
  // empty directory.
  const [system, custom] = await Promise.all([
    fetchJson<{ ok: true; items: ApiBotRow[] }>('/bots/system', undefined, { signal }),
    fetchJson<{ ok: true; items: ApiBotRow[] }>('/bots', undefined, { signal }),
  ]);
  return [
    ...system.items.map((r) => mapBotRow(r, 'stock')),
    ...custom.items.map((r) => mapBotRow(r, 'own')),
  ];
}

// ---------------------------------------------------------------------------
// Agent runs — GET /agent-runs (index.ts). Rows carry id, botId,
// conversationId, triggerType, status, errorMessage, token counts and
// timestamps. There is no action/target/botName on the wire: the action is
// derived from triggerType, the target is the conversation id, and the bot
// name is joined from the bots list at render time.
// ---------------------------------------------------------------------------

interface ApiAgentRunRow {
  id: string;
  botId?: string;
  conversationId?: string;
  triggerType?: string;
  status?: string;
  errorMessage?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

const RUN_STATUS_OUTCOME: Record<string, AgentRunOutcome> = {
  queued: 'queued',
  running: 'running',
  waiting_for_approval: 'awaiting_approval',
  waiting_for_input: 'waiting_for_input',
  succeeded: 'succeeded',
  completed: 'succeeded',
  failed: 'failed',
  timed_out: 'timed_out',
  cancelled: 'cancelled',
  unknown_outcome: 'unknown_outcome',
};

const TRIGGER_ACTION: Record<string, string> = {
  mention: 'Replied to a mention',
  command: 'Answered a command',
  always: 'Replied in chat',
};

export async function fetchAgentRuns(
  botId?: string,
  signal?: AbortSignal,
): Promise<AgentRunEntry[]> {
  const params = new URLSearchParams();
  if (botId) params.set('botId', botId);
  params.set('limit', '100');
  const payload = await fetchJson<{ ok: boolean; items: ApiAgentRunRow[] }>(
    `/agent-runs?${params.toString()}`,
    undefined,
    { signal },
  );
  return (payload.items ?? []).map((r) => ({
    id: r.id,
    botId: r.botId ?? '',
    ...(r.conversationId ? { conversationId: r.conversationId } : {}),
    action: TRIGGER_ACTION[r.triggerType ?? ''] ?? 'Ran',
    outcome: RUN_STATUS_OUTCOME[r.status ?? ''] ?? 'unknown_outcome',
    detail: r.errorMessage ?? undefined,
    at: r.createdAt ?? '',
  }));
}

// ---------------------------------------------------------------------------
// Bot writes — POST/PATCH/DELETE /bots. All bodies match the zod schemas in
// backend/api/src/routes/bots.ts exactly.
// ---------------------------------------------------------------------------

export async function createAgentBot(input: {
  name: string;
  /** Job description — becomes description plus the agent's instructions. */
  description: string;
  category: AgentBot['category'];
  /** Permission strings — 'reply_in_chat' is always included so the bot can
   *  pass publish validation later. */
  permissions?: string[];
  triggerMode?: AgentTriggerMode;
  purposeId?: AgentPurposeId | null;
}): Promise<AgentBot> {
  // The instructions are real — this is the system prompt written to
  // agent_config. Composed from the name + job description, well past the
  // 20-char publish minimum.
  const instructions =
    `You are ${input.name}, a ThryftVerse agent. ${input.description}`.slice(0, 8000);
  const commandHint = `/${
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'agent'
  }`;
  const permissions = [...new Set(['reply_in_chat', ...(input.permissions ?? [])])];

  const res = await fetchJson<{
    ok: true;
    id: string;
    slug: string;
    name: string;
    type: string;
    status: string;
    runtimeMode: string;
    isDraft: boolean;
    agentConfig?: ApiAgentConfig | null;
    runtimeReady?: boolean;
    runtimeReadinessReason?: string | null;
  }>('/bots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      commandHint,
      category: input.category,
      permissions,
      isDraft: true,
      agentConfig: {
        instructions,
        model: DEFAULT_MODEL,
        triggerMode: input.triggerMode ?? 'mention',
        responseLength: 'balanced',
        tone: 'focused',
        reasoningEffort: 'medium',
        historyLimit: 16,
        starterPrompts: [],
      },
    }),
  });

  const status = asBotStatus(res.status);
  const model = asModelId(res.agentConfig?.model);
  const triggerMode = asTriggerMode(res.agentConfig?.triggerMode);
  return {
    id: res.id,
    name: res.name,
    purpose: input.description,
    description: input.description,
    category: CATEGORY_MAP[input.category] ?? 'automation',
    purposeId: input.purposeId ?? null,
    ...(model ? { model } : {}),
    ...(triggerMode ? { triggerMode } : {}),
    creator: 'You',
    origin: 'own',
    capabilities: (input.permissions ?? []).filter(isAgentCapability),
    permissions,
    ...(status ? { status } : {}),
    enabled: status === 'available',
    isDraft: res.isDraft === true,
    canToggle: true,
    runtimeReady: res.runtimeReady,
    runtimeReadinessReason: res.runtimeReadinessReason ?? null,
    createdAt: '',
  };
}

export async function deleteAgentBot(botId: string): Promise<void> {
  await fetchJson(`/bots/${encodeURIComponent(botId)}`, { method: 'DELETE' });
}

/**
 * Enable/disable a bot the caller owns — PATCH /bots/:botId with the real
 * status enum. The server 403s this on system bots and other people's bots;
 * callers must only offer the write when the row carries canToggle, and
 * must let the rejection propagate so the optimistic cache reverts.
 */
export async function setAgentBotEnabled(botId: string, enabled: boolean): Promise<void> {
  await fetchJson(`/bots/${encodeURIComponent(botId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: enabled ? 'available' : 'disabled' }),
  });
}

// ---------------------------------------------------------------------------
// Recommendation intent — GET/POST /recommendations/intent/:userId/*
// (backend/api/src/routes/recommendationIntent.ts). The intent profile is
// the real "Your algorithm" wire: topics carry a server-side influence band
// and a removable flag derived from whether the signal came from history.
// No local fallback — when the backend can't answer, callers show the
// honest unavailable state, never seed topics (same rule as the native
// YourAlgorithmScreen).
// ---------------------------------------------------------------------------

export interface AlgorithmIntentTopic {
  id: string;
  label: string;
  category: string;
  influenceBand: 'more' | 'usual' | 'less' | 'excluded' | string;
  sourceType: string;
  evidenceCount: number;
  removable: boolean;
  paused: boolean;
  lastEvidenceAt: string | null;
  updatedAt: string;
}

export interface AlgorithmIntentProfile {
  intentVersion: number;
  profileMode: string;
  topics: AlgorithmIntentTopic[];
}

export async function fetchAlgorithmIntentProfile(
  userId: string,
  signal?: AbortSignal,
): Promise<AlgorithmIntentProfile> {
  return fetchJson<AlgorithmIntentProfile>(
    `/recommendations/intent/${encodeURIComponent(userId)}/profile`,
    undefined,
    { signal },
  );
}

export type AlgorithmIntentDirection =
  | 'more'
  | 'usual'
  | 'less'
  | 'exclude'
  | 'add'
  | 'remove';

export async function mutateAlgorithmIntent(
  userId: string,
  input: {
    idempotencyKey: string;
    targetId: string;
    targetLabel: string;
    direction: AlgorithmIntentDirection;
    topicCategory?: string;
    expectedIntentVersion?: number;
  },
): Promise<{ mutationId: number; intentVersion: number; status: string }> {
  return fetchJson(`/recommendations/intent/${encodeURIComponent(userId)}/mutate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idempotencyKey: input.idempotencyKey,
      scope: 'topic',
      targetId: input.targetId,
      targetLabel: input.targetLabel,
      direction: input.direction,
      source: 'your_algorithm',
      ...(input.topicCategory ? { topicCategory: input.topicCategory } : {}),
      ...(input.expectedIntentVersion !== undefined
        ? { expectedIntentVersion: input.expectedIntentVersion }
        : {}),
    }),
  });
}

export async function resetAlgorithmIntent(
  userId: string,
): Promise<{ intentVersion: number; status: string }> {
  return fetchJson(`/recommendations/intent/${encodeURIComponent(userId)}/reset`, {
    method: 'POST',
  });
}

// ---------------------------------------------------------------------------
// Agent memory — mirrors the mobile botsApi /agent-memory endpoints 1:1.
// Every record is a real server row scoped to the authenticated caller.
// ---------------------------------------------------------------------------

export async function fetchAgentMemory(botId?: string): Promise<{
  settings: AgentMemorySettings;
  memories: AgentMemory[];
}> {
  const suffix = botId ? `?botId=${encodeURIComponent(botId)}` : '';
  const payload = await fetchJson<{
    ok: true;
    settings: AgentMemorySettings;
    memories: AgentMemory[];
  }>(`/agent-memory${suffix}`);
  return { settings: payload.settings, memories: payload.memories };
}

export async function updateAgentMemorySettings(
  patch: Partial<AgentMemorySettings>,
): Promise<AgentMemorySettings> {
  const payload = await fetchJson<{ ok: true; settings: AgentMemorySettings }>(
    '/agent-memory/settings',
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  return payload.settings;
}

export async function retractAgentMemory(memoryId: string): Promise<void> {
  await fetchJson(`/agent-memory/${encodeURIComponent(memoryId)}`, { method: 'DELETE' });
}

export async function clearAgentMemories(botId?: string): Promise<number> {
  const payload = await fetchJson<{ ok: true; cleared: number }>('/agent-memory/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(botId ? { botId } : {}),
  });
  return payload.cleared;
}
