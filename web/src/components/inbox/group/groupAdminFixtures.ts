import type {
  Conversation,
  ConversationParticipant,
  User,
} from '@/lib/contracts/domain';
import {
  CONVERSATIONS,
  appendFixtureMessage,
  userById,
} from '@/lib/data/fixtures';
import { adminFieldsOf } from './groupAdminTypes';
import { memberRolesFor, sanitizeMemberRoles } from './groupAdminDerivations';

export function fixtureConversation(id: string): Conversation | undefined {
  return CONVERSATIONS.find((c) => c.id === id);
}

export function updateFixtureGroup(
  id: string,
  patch: {
    title?: string;
    description?: string;
    avatar?: string | null;
    coverPhoto?: string | null;
  },
): boolean {
  const c = fixtureConversation(id);
  if (!c || c.type !== 'group') return false;
  if (patch.title !== undefined) {
    c.title = patch.title;
    c.participantName = patch.title;
  }
  if (patch.description !== undefined) c.description = patch.description;
  if (patch.avatar !== undefined) c.avatar = patch.avatar ?? undefined;
  if (patch.coverPhoto !== undefined) c.coverPhoto = patch.coverPhoto ?? undefined;
  return true;
}

export function addFixtureMembers(id: string, users: User[]): string[] {
  const c = fixtureConversation(id);
  if (!c || c.type !== 'group' || users.length === 0) return [];
  const existing = new Set(c.participantIds ?? c.participantProfiles?.map((p) => p.id) ?? []);
  const added = users.filter((u) => u.id && !existing.has(u.id));
  if (added.length === 0) return [];
  c.participantIds = [...(c.participantIds ?? ['me']), ...added.map((u) => u.id)];
  c.participantProfiles = [
    ...(c.participantProfiles ?? []),
    ...added.map(
      (u): ConversationParticipant => ({
        id: u.id,
        username: u.username,
        displayName: u.username,
        avatar: u.avatar ?? null,
        identityVerified: u.identityVerified ?? u.isVerified,
      }),
    ),
  ];
  const names = added.map((u) => u.username);
  appendFixtureMessage(id, {
    id: `local-${Date.now()}-add`,
    senderId: 'system',
    sender: 'system',
    isSystem: true,
    systemTitle:
      names.length === 1 ? `You added ${names[0]}` : `You added ${names.length} members`,
    timestamp: new Date().toISOString(),
  });
  return added.map((u) => u.id);
}

export function transferFixtureOwnership(
  id: string,
  newOwnerId: string,
  previousOwnerId: string,
): boolean {
  const c = fixtureConversation(id);
  if (!c || c.type !== 'group') return false;
  if (!newOwnerId || newOwnerId === previousOwnerId) return false;
  const memberIds = new Set([
    ...(c.participantIds ?? []),
    ...(c.participantProfiles ?? []).map((p) => p.id),
  ]);
  if (!memberIds.has(newOwnerId)) return false;
  const fields = adminFieldsOf(c);
  const current =
    sanitizeMemberRoles(fields.memberRoles) ??
    memberRolesFor(c, previousOwnerId, undefined) ??
    {};
  fields.ownerId = newOwnerId;
  if (fields.creatorId === previousOwnerId) fields.creatorId = newOwnerId;
  fields.memberRoles = {
    ...current,
    [previousOwnerId]: 'admin',
    [newOwnerId]: 'owner',
  };
  return true;
}

export function removeFixtureMember(id: string, userId: string): boolean {
  const c = fixtureConversation(id);
  if (!c || c.type !== 'group') return false;
  c.participantIds = c.participantIds?.filter((x) => x !== userId);
  c.participantProfiles = c.participantProfiles?.filter((p) => p.id !== userId);
  const name = userById(userId)?.username ?? 'A member';
  appendFixtureMessage(id, {
    id: `local-${Date.now()}-remove`,
    senderId: 'system',
    sender: 'system',
    isSystem: true,
    systemTitle: `${name} was removed from the group`,
    timestamp: new Date().toISOString(),
  });
  return true;
}

export function clearFixtureChat(id: string): boolean {
  const c = fixtureConversation(id);
  if (!c) return false;
  c.messages = [];
  c.lastMessage = '';
  return true;
}

export function deleteFixtureConversation(id: string): boolean {
  const i = CONVERSATIONS.findIndex((c) => c.id === id);
  if (i === -1) return false;
  CONVERSATIONS.splice(i, 1);
  return true;
}

export function markFixtureConversationUnread(id: string): boolean {
  const c = fixtureConversation(id);
  if (!c) return false;
  c.unread = true;
  return true;
}

export function acceptFixtureRequest(id: string): boolean {
  const c = fixtureConversation(id);
  if (!c) return false;
  c.isRequest = false;
  return true;
}
