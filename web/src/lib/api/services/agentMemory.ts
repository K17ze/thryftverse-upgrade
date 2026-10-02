/**
 * Agent memory service — mirrors the mobile botsApi /agent-memory endpoints 1:1.
 * Every record is a real server row scoped to the authenticated caller.
 */

import { fetchJson } from '../http';
import type { AgentMemory, AgentMemorySettings } from '@/lib/contracts/agents';

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
