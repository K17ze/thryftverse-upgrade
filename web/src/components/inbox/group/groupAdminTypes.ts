import type { Conversation } from '@/lib/contracts/domain';

export type GroupMemberRole = 'owner' | 'admin' | 'member';
export type GroupPermissionScope = 'admins' | 'everyone';
export type EditablePermission = 'editGroupInfo' | 'sendMessages' | 'addMembers';

export interface GroupSettings {
  editGroupInfo: GroupPermissionScope;
  sendMessages: GroupPermissionScope;
  addMembers: GroupPermissionScope;
}

export interface GroupCapabilities {
  canManage: boolean;
  canEditGroupInfo: boolean;
  canSendMessages: boolean;
  canAddMembers: boolean;
}

/** Mirrors DEFAULT_GROUP_SETTINGS in backend/api/src/routes/chat.ts — the
 *  row the backend returns for a group whose settings were never saved. */
export const DEFAULT_GROUP_SETTINGS: GroupSettings = {
  editGroupInfo: 'admins',
  sendMessages: 'everyone',
  addMembers: 'admins',
};

/** Admin fields a live payload may carry beyond the web contract — read
 *  defensively; absent on fixtures means "no role data", never fabricated. */
export interface ConversationAdminFields {
  ownerId?: string;
  creatorId?: string;
  memberRoles?: Record<string, string>;
  createdAt?: string;
  isPinned?: boolean;
}

export function adminFieldsOf(c: Conversation): ConversationAdminFields {
  return c as Conversation & ConversationAdminFields;
}

export function conversationCreatedAt(c: Conversation): string | undefined {
  return adminFieldsOf(c).createdAt;
}
