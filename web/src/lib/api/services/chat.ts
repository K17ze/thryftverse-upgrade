/**
 * Web chat service — mirrors frontend/src/services/chatApi.ts.
 * Conversations carry participantProfiles; messages carry structured
 * metadata (offers, listing shares, reactions). Never flatten to
 * `{ sender, text }`.
 */

import { fetchJson } from '../http';
import {
  mapApiConversationToWeb,
  mapApiMessageToWebMessage,
  type ApiConversationPayload,
  type ApiMessagePayload,
} from '../mappers';
import type { Conversation, Message } from '@/lib/contracts/domain';

export async function fetchConversations(
  currentUserId?: string,
  signal?: AbortSignal,
): Promise<Conversation[]> {
  const payload = await fetchJson<{
    ok?: boolean;
    items?: ApiConversationPayload[];
    conversations?: ApiConversationPayload[];
  }>('/chat/conversations', undefined, { signal });
  const rows = payload.items ?? payload.conversations ?? [];
  return rows.map((c) => mapApiConversationToWeb(c, currentUserId));
}

export async function fetchConversation(
  id: string,
  currentUserId?: string,
  signal?: AbortSignal,
): Promise<Conversation | null> {
  const payload = await fetchJson<{
    ok: boolean;
    conversation?: ApiConversationPayload;
  }>(`/chat/conversations/${encodeURIComponent(id)}`, undefined, { signal });
  if (!payload.ok || !payload.conversation) return null;
  const messages = await fetchConversationMessages(id, currentUserId, signal);
  return mapApiConversationToWeb(payload.conversation, currentUserId, messages);
}

export async function fetchConversationMessages(
  id: string,
  currentUserId?: string,
  signal?: AbortSignal,
): Promise<Message[]> {
  const payload = await fetchJson<{
    ok?: boolean;
    items?: ApiMessagePayload[];
    messages?: ApiMessagePayload[];
  }>(`/chat/conversations/${encodeURIComponent(id)}/messages`, undefined, { signal });
  const rows = payload.items ?? payload.messages ?? [];
  return rows.map((m) => mapApiMessageToWebMessage(m, currentUserId));
}

export async function createDmConversation(
  participantId: string,
  currentUserId?: string,
): Promise<Conversation> {
  const payload = await fetchJson<{
    ok: boolean;
    conversation?: ApiConversationPayload;
  }>('/chat/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'dm', participantId }),
  });
  if (!payload.ok || !payload.conversation) {
    throw new Error('Failed to create conversation');
  }
  return mapApiConversationToWeb(payload.conversation, currentUserId);
}

export async function createGroupConversation(
  input: { title: string; participantIds: string[]; description?: string },
  currentUserId?: string,
): Promise<Conversation> {
  const payload = await fetchJson<{
    ok: boolean;
    conversation?: ApiConversationPayload;
  }>('/chat/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'group',
      title: input.title,
      participantIds: input.participantIds,
      description: input.description,
    }),
  });
  if (!payload.ok || !payload.conversation) {
    throw new Error('Failed to create group');
  }
  return mapApiConversationToWeb(payload.conversation, currentUserId);
}

export async function sendChatMessage(
  conversationId: string,
  body: string,
  currentUserId?: string,
): Promise<Message> {
  const payload = await fetchJson<{
    ok: boolean;
    message?: ApiMessagePayload;
  }>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!payload.ok || !payload.message) {
    throw new Error('Failed to send message');
  }
  return mapApiMessageToWebMessage(payload.message, currentUserId);
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await fetchJson(`/chat/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: 'POST',
  });
}
