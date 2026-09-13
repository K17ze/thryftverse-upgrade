/**
 * groupMembersViewModels — pure derivations for the group members screen.
 * Extracted verbatim from GroupMembersScreen: role resolution, participant
 * name/avatar lookups, member row view-models, member-search filtering,
 * memberRoles sanitising, and the long-press action-menu plan.
 */

import type { Conversation } from '../../domain';
import type { User } from '../../store/useStore';

export type GroupMemberRole = 'owner' | 'admin' | 'member';

export interface GroupMemberView {
  id: string;
  name: string;
  avatar: string | null;
  isMe: boolean;
  role: GroupMemberRole;
}

export type GroupMemberActionKind = 'promote' | 'demote' | 'remove' | 'transfer';

export interface GroupMemberActionDescriptor {
  kind: GroupMemberActionKind;
  label: string;
  destructive?: boolean;
}

export interface GroupMemberMenuAction {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

export interface GroupMemberMenuState {
  member: { id: string; name: string; role: GroupMemberRole };
  actions: GroupMemberMenuAction[];
}

export interface GroupMembersConfirmSheetState {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  variant?: 'default' | 'danger';
}

/**
 * Participant name lookup built from the conversation's participant
 * profiles, same pattern used by InboxScreen. Avoids unsafe store type
 * casts.
 */
export function buildParticipantNameLookup(
  participantProfiles: Conversation['participantProfiles'],
  currentUser: User | null,
): Map<string, string> {
  const map = new Map<string, string>();
  if (currentUser?.id) {
    map.set(currentUser.id, currentUser.displayName ?? currentUser.username ?? 'you');
  }
  for (const profile of participantProfiles ?? []) {
    map.set(profile.id, profile.displayName ?? profile.username ?? `User ${profile.id.slice(-6)}`);
  }
  return map;
}

export function buildParticipantAvatarLookup(
  participantProfiles: Conversation['participantProfiles'],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const profile of participantProfiles ?? []) {
    if (profile.avatar) map.set(profile.id, profile.avatar);
  }
  return map;
}

export function deriveCurrentRole(
  currentUserId: string | undefined,
  ownerId: string | undefined,
  memberRoles: Conversation['memberRoles'],
): GroupMemberRole | undefined {
  if (!currentUserId) return undefined;
  if (ownerId === currentUserId) return 'owner';
  const role = memberRoles?.[currentUserId];
  if (role === 'admin') return 'admin';
  if (role === 'owner') return 'owner';
  return 'member';
}

/** Determine member row view-models from memberRoles / ownerId. */
export function deriveGroupMembers(
  conversation: Pick<Conversation, 'participantIds' | 'ownerId' | 'memberRoles'> | undefined,
  currentUserId: string | undefined,
  currentUserAvatar: string | null | undefined,
  nameLookup: ReadonlyMap<string, string>,
  avatarLookup: ReadonlyMap<string, string>,
): GroupMemberView[] {
  const ids = conversation?.participantIds ?? [];
  return ids.map((id) => {
    const name = id === currentUserId
      ? 'You'
      : nameLookup.get(id) ?? `User ${id.slice(-6)}`;
    let role: GroupMemberRole = 'member';
    if (id === conversation?.ownerId) {
      role = 'owner';
    } else if (conversation?.memberRoles?.[id] === 'admin') {
      role = 'admin';
    } else if (conversation?.memberRoles?.[id] === 'owner') {
      role = 'owner';
    }
    return {
      id,
      name,
      avatar: id === currentUserId ? currentUserAvatar ?? null : avatarLookup.get(id) ?? null,
      isMe: id === currentUserId,
      role };
  });
}

export function filterGroupMembers(members: GroupMemberView[], query: string): GroupMemberView[] {
  if (!query.trim()) return members;
  const q = query.toLowerCase();
  return members.filter((m) => m.name.toLowerCase().includes(q));
}

/** Narrow an API memberRoles payload to the known role union. */
export function sanitizeMemberRoles(roles: Record<string, string>): Record<string, GroupMemberRole> {
  return Object.fromEntries(
    Object.entries(roles).filter(
      (entry): entry is [string, GroupMemberRole] =>
        entry[1] === 'owner' || entry[1] === 'admin' || entry[1] === 'member',
    ),
  ) as Record<string, GroupMemberRole>;
}

/**
 * Long-press action plan for a member row. Ordering is significant:
 * role change → remove → transfer (owner only).
 */
export function deriveMemberActionDescriptors(
  memberRole: GroupMemberRole,
  canTransferOwnership: boolean,
): GroupMemberActionDescriptor[] {
  const actions: GroupMemberActionDescriptor[] = [];
  if (memberRole === 'member') {
    actions.push({ kind: 'promote', label: 'Promote to admin' });
  } else if (memberRole === 'admin') {
    actions.push({ kind: 'demote', label: 'Demote to member' });
  }
  if (memberRole !== 'owner') {
    actions.push({ kind: 'remove', label: 'Remove from group', destructive: true });
  }
  if (canTransferOwnership) {
    actions.push({ kind: 'transfer', label: 'Transfer ownership', destructive: true });
  }
  return actions;
}
