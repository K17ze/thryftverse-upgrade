/**
 * groupChatInfoViewModels — pure derivations and formatters for the group
 * details screen. Extracted verbatim from GroupChatInfoScreen: no I/O, no
 * React, safe to unit test in isolation.
 */

import type { Conversation, Message } from '../../domain/conversation';
import type { GroupInviteLink } from '../../services/chatApi';
import type { GroupInfoHeroMember } from '../groupchat/GroupInfoHero';
import type { GroupMediaStripItem } from '../groupchat/GroupMediaStrip';
import type { GroupInviteSummary } from '../groupchat/GroupMembersDirectory';

/** Member profile shape carried on the conversation payload. */
export type GroupInfoMemberProfile = NonNullable<Conversation['participantProfiles']>[number];

/** Remote media item returned by fetchConversationMediaFromApi. */
export interface GroupInfoRemoteMedia {
  id: string;
  mediaUri: string;
  mediaType: 'image' | 'video' | 'document';
  senderUserId: string | null;
  createdAt: string;
  documentName?: string;
  documentMimeType?: string;
}

export type GroupInfoMediaItem = GroupInfoRemoteMedia | Message;

/** Safely format an invite-link expiry date. Returns '—' for invalid/empty values. */
export function formatInviteDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/** Format creation date */
export function formatCreationDate(iso?: string | null): string {
  if (!iso) return 'recently';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'recently';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Hero avatar-strip members derived from participant profiles. */
export function toAvatarMembers(members: GroupInfoMemberProfile[]): GroupInfoHeroMember[] {
  return members.map((member) => ({
    id: member.id,
    displayName: member.displayName ?? member.username,
    avatar: member.avatar ?? null,
  }));
}

/** Resolves a member id to a display handle (e.g. '@username'). */
export function createMemberLabel(
  members: GroupInfoMemberProfile[]
): (userId: string) => string {
  return (userId) => {
    const profile = members.find((p) => p.id === userId);
    return profile ? `@${profile.username}` : 'A member';
  };
}

/**
 * Shared-media list: prefer the server media index; fall back to the last
 * 30 media messages already on the conversation while it is unavailable.
 */
export function resolveGroupInfoMediaItems(
  remoteMedia: GroupInfoRemoteMedia[],
  messages: Message[] | undefined
): GroupInfoMediaItem[] {
  if (remoteMedia.length > 0) return remoteMedia;
  const msgs = messages ?? [];
  return msgs.filter((m) => m.mediaUri && !m.isSystem).slice(-30).reverse();
}

/** Visual-only (image/video) projection capped at 8 for the preview strip. */
export function toVisualMediaItems(items: GroupInfoMediaItem[]): GroupMediaStripItem[] {
  return items
    .filter(
      (m): m is GroupInfoMediaItem & { mediaUri: string } =>
        Boolean(m.mediaUri) && m.mediaType !== 'document'
    )
    .slice(0, 8)
    .map((m) => ({
      id: m.id,
      uri: m.mediaUri,
      mediaType: m.mediaType === 'video' ? 'video' : 'image',
    }));
}

/** Directory invite summary derived from the active invite link. */
export function buildInviteSummary(link: GroupInviteLink | null): GroupInviteSummary | null {
  if (!link) return null;
  return {
    url: link.inviteLink,
    metaLabel: `Expires ${formatInviteDate(link.expiresAt)} · ${link.useCount} uses`,
  };
}

/** Narrows a server memberRoles payload to the known role union. */
export function sanitizeMemberRoles(
  memberRoles: Record<string, string>
): Record<string, 'owner' | 'admin' | 'member'> {
  return Object.fromEntries(
    Object.entries(memberRoles).filter(
      (entry): entry is [string, 'owner' | 'admin' | 'member'] =>
        entry[1] === 'owner' || entry[1] === 'admin' || entry[1] === 'member'
    )
  ) as Record<string, 'owner' | 'admin' | 'member'>;
}
