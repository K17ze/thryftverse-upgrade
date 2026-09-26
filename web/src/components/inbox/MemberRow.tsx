'use client';

/**
 * MemberRow — a member directory row for group surfaces, ported from
 * mobile GroupMemberRow: avatar · name (+ "(You)" marker, role badge) ·
 * @handle · disclosure chevron, flat canvas with an inset hairline.
 */

import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import type { GroupMemberRole } from './groupAdmin';

const ROLE_BADGE: Record<Exclude<GroupMemberRole, 'member'>, string> = {
  owner: 'Owner',
  admin: 'Admin',
};

export interface MemberRowProps {
  name: string;
  handle?: string;
  avatarUrl?: string | null;
  role?: GroupMemberRole;
  verified?: boolean;
  isYou?: boolean;
  isLast?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

export function MemberRow({
  name,
  handle,
  avatarUrl,
  role,
  verified,
  isYou = false,
  isLast = false,
  disabled = false,
  onPress,
}: MemberRowProps) {
  const badgeLabel = role && role !== 'member' ? ROLE_BADGE[role] : null;

  return (
    <>
      <button
        type="button"
        onClick={onPress}
        disabled={disabled || !onPress}
        aria-label={`${isYou ? `${name}, you` : name}${badgeLabel ? `, ${badgeLabel}` : ''}`}
        className="pressable flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-row-pressed"
      >
        <Avatar src={avatarUrl} name={name} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="clamp-1 text-body-emphasis font-semibold text-text-primary">
              {name}
            </span>
            {isYou ? <span className="text-meta font-medium text-text-muted">(You)</span> : null}
            {verified ? (
              <Icon name="verified" filled size={13} className="shrink-0 text-commerce-trust" />
            ) : null}
            {badgeLabel ? (
              <span className="rounded-sm border border-brand px-[5px] py-px text-micro font-semibold uppercase tracking-wide text-brand">
                {badgeLabel}
              </span>
            ) : null}
          </span>
          {handle ? (
            <span className="clamp-1 mt-px block text-meta font-medium text-text-muted">
              {handle}
            </span>
          ) : null}
        </span>
        {onPress ? (
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        ) : null}
      </button>
      {!isLast ? <div className="ml-[68px] border-b border-border-subtle" /> : null}
    </>
  );
}
