'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { timeAgo } from '@/lib/utils/format';
import type { MoodboardRole } from '@/lib/data/fixtures-content';
import {
  ROLE_LABELS,
  INVITE_ROLES,
  type RenderMember,
} from '../useMoodboardCollaboratorsWorkflow';

interface CollaboratorItemProps {
  member: RenderMember;
  isOwner: boolean;
  busy: boolean;
  onChangeRole: (m: RenderMember, role: Exclude<MoodboardRole, 'owner'>) => void;
  onRemove: (m: RenderMember) => void;
}

export function CollaboratorItem({
  member: m,
  isOwner,
  busy,
  onChangeRole,
  onRemove,
}: CollaboratorItemProps) {
  const isOwnerRow = m.role === 'owner';

  return (
    <li className="flex items-center gap-3 py-3">
      <Avatar src={m.avatar} name={m.name ?? m.userId} size={38} />
      <div className="min-w-0 flex-1">
        <p className="clamp-1 text-body font-medium text-text-primary">
          @{m.name ?? m.userId}
        </p>
        <p className="text-meta text-text-muted">
          Joined {timeAgo(m.joinedAt)}
        </p>
      </div>
      {isOwnerRow || !isOwner ? (
        <span className="text-meta font-medium text-text-secondary">
          {ROLE_LABELS[m.role]}
        </span>
      ) : (
        <div className="flex items-center gap-1">
          <label className="sr-only" htmlFor={`role-${m.userId}`}>
            Role for @{m.name ?? m.userId}
          </label>
          <select
            id={`role-${m.userId}`}
            value={m.role}
            disabled={busy}
            onChange={(e) =>
              onChangeRole(
                m,
                e.target.value as Exclude<MoodboardRole, 'owner'>,
              )
            }
            className="h-9 rounded-md bg-surface-alt px-2 text-meta font-medium text-text-primary outline-none focus:ring-1 focus:ring-brand"
          >
            {INVITE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRemove(m)}
            aria-label={`Remove @${m.name ?? m.userId}`}
            className="pressable flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:text-danger-text disabled:opacity-50"
          >
            <Icon name="personRemove" size={17} />
          </button>
        </div>
      )}
    </li>
  );
}
