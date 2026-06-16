import { fetchJson } from '../lib/apiClient';
import type { ChatBot } from '../data/mockData';

interface ApiBotPayload {
  id: string;
  slug: string;
  name: string;
  description: string;
  commandHint: string;
  category: 'moderation' | 'commerce' | 'automation' | 'assistant' | 'safety' | 'styling';
  type: 'system' | 'custom';
  status: string;
  runtimeMode: string;
  isDraft: boolean;
  permissions: string[];
  icon: string | null;
  ownerId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

function mapApiBotToChatBot(item: ApiBotPayload): ChatBot {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    description: item.description,
    commandHint: item.commandHint,
    category: item.category,
    type: item.type,
    status: item.status as 'available' | 'local-only' | 'backend-required',
    runtimeMode: item.runtimeMode,
    isDraft: item.isDraft,
    permissions: item.permissions,
    icon: item.icon ?? undefined,
    ownerId: item.ownerId ?? undefined,
  };
}

export async function fetchSystemBotsFromApi(): Promise<ChatBot[]> {
  const payload = await fetchJson<{
    ok: true;
    items: ApiBotPayload[];
  }>('/bots/system');

  return payload.items.map(mapApiBotToChatBot);
}

export async function fetchCustomBotsFromApi(): Promise<ChatBot[]> {
  const payload = await fetchJson<{
    ok: true;
    items: ApiBotPayload[];
  }>('/bots');

  return payload.items.map(mapApiBotToChatBot);
}

export async function fetchBotByIdFromApi(botId: string): Promise<ChatBot> {
  const payload = await fetchJson<{
    ok: true;
    item: ApiBotPayload;
  }>(`/bots/${encodeURIComponent(botId)}`);

  return mapApiBotToChatBot(payload.item);
}

export async function createCustomBotOnApi(input: {
  name: string;
  slug?: string;
  description: string;
  commandHint: string;
  category: 'moderation' | 'commerce' | 'automation' | 'assistant' | 'safety' | 'styling';
  permissions?: string[];
  icon?: string;
  isDraft?: boolean;
}): Promise<{ id: string; slug: string; name: string; type: string; status: string; runtimeMode: string; isDraft: boolean }> {
  const payload = await fetchJson<{
    ok: true;
    id: string;
    slug: string;
    name: string;
    type: string;
    status: string;
    runtimeMode: string;
    isDraft: boolean;
  }>('/bots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  return payload;
}

export async function updateCustomBotOnApi(
  botId: string,
  updates: Partial<{
    name: string;
    description: string;
    commandHint: string;
    category: string;
    permissions: string[];
    icon: string;
    isDraft: boolean;
    status: string;
    runtimeMode: string;
  }>
): Promise<void> {
  await fetchJson<{ ok: true }>(`/bots/${encodeURIComponent(botId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function deleteCustomBotOnApi(botId: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/bots/${encodeURIComponent(botId)}`, {
    method: 'DELETE',
  });
}