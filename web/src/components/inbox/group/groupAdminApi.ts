import type { GroupMemberRole, GroupSettings, GroupCapabilities } from './groupAdminTypes';

async function apiCall<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const { fetchJson } = await import('@/lib/api/http');
  const body = init?.body;
  return fetchJson<T>(path, {
    method: init?.method ?? 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: typeof body === 'string' ? body : undefined,
  });
}

export const liveGroupApi = {
  updateInfo: (id: string, patch: Record<string, unknown>) =>
    apiCall(`/chat/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  addMembers: (id: string, memberIds: string[]) =>
    apiCall(`/chat/conversations/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ memberIds }),
    }),
  removeMember: (id: string, userId: string) =>
    apiCall(`/chat/conversations/${id}/members/${userId}`, { method: 'DELETE' }),
  setRole: (id: string, userId: string, role: GroupMemberRole) =>
    apiCall(`/chat/conversations/${id}/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  /** POST /transfer-ownership — mirrors mobile
   *  transferConversationOwnershipOnApi: owner-only, the caller's role
   *  becomes admin and the full memberRoles map comes back. */
  transferOwnership: (id: string, newOwnerId: string) =>
    apiCall<{ ownerId: string; memberRoles: Record<string, string> }>(
      `/chat/conversations/${id}/transfer-ownership`,
      { method: 'POST', body: JSON.stringify({ newOwnerId }) },
    ),
  fetchSettings: (id: string) =>
    apiCall<{ settings: GroupSettings; capabilities: GroupCapabilities }>(
      `/chat/conversations/${id}/group-settings`,
    ),
  patchSettings: (id: string, updates: Partial<GroupSettings>) =>
    apiCall<{ settings: GroupSettings }>(`/chat/conversations/${id}/group-settings`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
  deleteConversation: (id: string, scope: 'me' | 'leave' = 'me') =>
    apiCall(`/chat/conversations/${id}?scope=${scope}`, { method: 'DELETE' }),
};

/**
 * Conversation-level viewer edges — the non-admin routes the mobile
 * chatApi calls for row actions: pin, marked-unread and message-request
 * resolution. Fixture mode never reaches these (the module dataset is the
 * source of truth there).
 */
export const liveConversationApi = {
  /** PATCH /pin — mirrors pinConversationOnApi. */
  setPinned: (id: string, pinned: boolean) =>
    apiCall(`/chat/conversations/${id}/pin`, {
      method: 'PATCH',
      body: JSON.stringify({ pinned }),
    }),
  /** PATCH /unread — mirrors setConversationUnreadOnApi. */
  setUnread: (id: string, unread: boolean) =>
    apiCall(`/chat/conversations/${id}/unread`, {
      method: 'PATCH',
      body: JSON.stringify({ unread }),
    }),
  /** POST /accept — mirrors acceptMessageRequestOnApi. */
  acceptRequest: (id: string) =>
    apiCall(`/chat/conversations/${id}/accept`, { method: 'POST' }),
  /** POST /decline — mirrors declineMessageRequestOnApi. */
  declineRequest: (id: string) =>
    apiCall(`/chat/conversations/${id}/decline`, { method: 'POST' }),
};
