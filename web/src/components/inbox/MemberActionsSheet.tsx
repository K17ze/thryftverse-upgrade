'use client';

/**
 * MemberActionsSheet — the member inspection sheet behind a directory row
 * press, ported from mobile GroupMemberActionsSheet. Presentation only:
 * the panel owns the mutations and passes resolved labels so copy stays
 * where the group's authority rules live.
 */

import { Avatar } from '@/components/ui/Avatar';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import type { ConversationParticipant } from '@/lib/contracts/domain';
import type { GroupMemberRole } from './groupAdmin';

export interface MemberActionsTarget extends ConversationParticipant {
  role?: GroupMemberRole;
}

function SheetAction({
  icon,
  label,
  danger,
  brand,
  onPress,
}: {
  icon: AppIconName;
  label: string;
  danger?: boolean;
  brand?: boolean;
  onPress: () => void;
}) {
  const tint = danger ? 'text-danger-text' : brand ? 'text-brand' : 'text-text-primary';
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      className={`pressable flex min-h-[48px] w-full items-center gap-3 py-2 text-left ${tint}`}
    >
      <Icon name={icon} size={20} />
      <span className="text-body font-medium">{label}</span>
    </button>
  );
}

export function MemberActionsSheet({
  member,
  onDismiss,
  canManageMembers,
  isSelf,
  onViewProfile,
  onMessage,
  onToggleAdmin,
  onRemove,
}: {
  member: MemberActionsTarget | null;
  onDismiss: () => void;
  canManageMembers: boolean;
  isSelf: boolean;
  onViewProfile: (member: MemberActionsTarget) => void;
  onMessage: (member: MemberActionsTarget) => void;
  onToggleAdmin: (member: MemberActionsTarget) => void;
  onRemove: (member: MemberActionsTarget) => void;
}) {
  const name = member?.displayName ?? member?.username ?? 'Member';
  const adminLabel = member?.role === 'admin' ? 'Dismiss as admin' : 'Make group admin';
  /** Owner rows never carry admin/remove actions — the role is terminal
   *  without an ownership transfer the API performs, not the sheet. */
  const canModerate = canManageMembers && !isSelf && member?.role !== 'owner';

  return (
    <Sheet open={member !== null} onClose={onDismiss} maxWidth={400}>
      {member ? (
        <div className="px-5 pb-6">
          <div className="flex items-center gap-3 py-3">
            <Avatar src={member.avatar} name={name} size={48} />
            <div className="min-w-0 flex-1">
              <p className="clamp-1 text-section-title font-semibold text-text-primary">{name}</p>
              <p className="text-meta text-text-muted">@{member.username}</p>
            </div>
          </div>
          <div className="border-t border-border-subtle pt-1">
            <SheetAction
              icon="profile"
              label="View profile"
              onPress={() => onViewProfile(member)}
            />
            {!isSelf ? (
              <SheetAction
                icon="chat"
                label={`Message @${member.username}`}
                onPress={() => onMessage(member)}
              />
            ) : null}
            {canModerate ? (
              <>
                <SheetAction
                  icon="shield"
                  label={adminLabel}
                  brand
                  onPress={() => onToggleAdmin(member)}
                />
                <SheetAction
                  icon="personRemove"
                  label="Remove from group"
                  danger
                  onPress={() => onRemove(member)}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
