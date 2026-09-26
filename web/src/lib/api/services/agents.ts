/**
 * Web agents service — mirrors frontend/src/services/botsApi.ts.
 * `/bots/system` = directory ('stock'), `/bots` = the viewer's custom bots
 * ('own'). Backend rows carry name/description/category/permissions/status —
 * the richer web fields (purposeId, model, triggerId) don't exist server-side
 * and stay honest defaults.
 */

import { fetchJson } from '../http';
import type { AgentBot, AgentRunEntry } from '@/lib/contracts/agents';
import { DEFAULT_MODEL } from '@/lib/contracts/agents';

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
  runtimeReady?: boolean;
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

function permissionsToCapabilities(permissions: unknown): AgentBot['capabilities'] {
  if (!Array.isArray(permissions)) return [];
  return permissions
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p as AgentBot['capabilities'][number]);
}

function mapBotRow(row: ApiBotRow, origin: 'stock' | 'own'): AgentBot {
  return {
    id: row.id,
    name: row.name,
    purpose: row.description || row.commandHint || row.name,
    description: row.description || '',
    category: CATEGORY_MAP[row.category] ?? 'automation',
    purposeId: null,
    model: DEFAULT_MODEL,
    creator: origin === 'stock' ? 'ThryftVerse' : 'You',
    origin,
    capabilities: permissionsToCapabilities(row.permissions),
    triggerId: 'daily',
    installs: origin === 'stock' ? 0 : 1,
    installed: origin === 'own' || row.status === 'active',
    enabled: row.status === 'active' && row.isDraft !== true,
    createdAt: row.createdAt ?? '',
  };
}

export async function fetchAgentBots(signal?: AbortSignal): Promise<AgentBot[]> {
  const [system, custom] = await Promise.all([
    fetchJson<{ ok: true; items: ApiBotRow[] }>('/bots/system', undefined, { signal }).catch(
      () => ({ ok: true as const, items: [] }),
    ),
    fetchJson<{ ok: true; items: ApiBotRow[] }>('/bots', undefined, { signal }).catch(
      () => ({ ok: true as const, items: [] }),
    ),
  ]);
  return [
    ...system.items.map((r) => mapBotRow(r, 'stock')),
    ...custom.items.map((r) => mapBotRow(r, 'own')),
  ];
}

export async function fetchAgentRuns(
  botId?: string,
  signal?: AbortSignal,
): Promise<AgentRunEntry[]> {
  const payload = await fetchJson<{
    ok: boolean;
    items: Array<{
      id: string;
      botId?: string;
      botName?: string;
      action?: string;
      kind?: string;
      target?: string;
      outcome?: string;
      status?: string;
      at?: string;
      createdAt?: string;
      detail?: string;
    }>;
  }>(`/agent-runs${botId ? `?botId=${encodeURIComponent(botId)}` : ''}`, undefined, { signal });
  return (payload.items ?? []).map((r) => ({
    id: r.id,
    botId: r.botId ?? '',
    action: r.action ?? r.kind ?? 'Run',
    target: r.target ?? r.botName ?? '',
    outcome:
      r.outcome === 'succeeded' || r.status === 'succeeded' || r.status === 'completed'
        ? 'succeeded'
        : r.outcome === 'failed' || r.status === 'failed'
          ? 'failed'
          : 'skipped',
    at: r.at ?? r.createdAt ?? '',
    detail: r.detail,
  }));
}

export async function createAgentBot(input: {
  name: string;
  description: string;
  category: string;
  permissions?: string[];
}): Promise<AgentBot> {
  const res = await fetchJson<{
    ok: true;
    id: string;
    slug: string;
    name: string;
    status: string;
    isDraft: boolean;
  }>('/bots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      commandHint: input.name,
      category: input.category,
      permissions: input.permissions,
    }),
  });
  return {
    id: res.id,
    name: res.name,
    purpose: input.description,
    description: input.description,
    category: (input.category as AgentBot['category']) ?? 'automation',
    purposeId: null,
    model: DEFAULT_MODEL,
    creator: 'You',
    origin: 'own',
    capabilities: (input.permissions ?? []) as AgentBot['capabilities'],
    triggerId: 'daily',
    installs: 1,
    installed: true,
    enabled: res.status === 'active',
    createdAt: '',
  };
}

export async function deleteAgentBot(botId: string): Promise<void> {
  await fetchJson(`/bots/${encodeURIComponent(botId)}`, { method: 'DELETE' });
}

export async function setAgentBotEnabled(botId: string, enabled: boolean): Promise<void> {
  await fetchJson(`/bots/${encodeURIComponent(botId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: enabled ? 'active' : 'paused' }),
  });
}
