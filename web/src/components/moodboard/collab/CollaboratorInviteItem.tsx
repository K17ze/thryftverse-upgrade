'use client';

import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { timeAgo } from '@/lib/utils/format';
import {
  ROLE_LABELS,
  type InviteView,
} from '../useMoodboardCollaboratorsWorkflow';

interface CollaboratorInviteItemProps {
  boardId: string;
  invite: InviteView;
  isOwner: boolean;
  busy: boolean;
  onRevoke: (inv: InviteView) => void;
}

export function CollaboratorInviteItem({
  boardId,
  invite: inv,
  isOwner,
  busy,
  onRevoke,
}: CollaboratorInviteItemProps) {
  const { show } = useToast();

  return (
    <li className="flex items-center gap-3 py-2.5">
      <Icon name="link" size={16} className="shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium text-text-primary">
          {ROLE_LABELS[inv.role]} invite
        </p>
        <p className="text-meta text-text-muted">
          Expires {timeAgo(inv.expiresAt)}
        </p>
      </div>
      {inv.token ? (
        <button
          type="button"
          onClick={() => {
            const url = `${window.location.origin}/moodboard/${boardId}?invite=${inv.token}`;
            void navigator.clipboard
              ?.writeText(url)
              .then(() => show('Invite link copied', 'success'))
              .catch(() => show(url, 'info'));
          }}
          className="pressable flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:text-text-primary"
          aria-label="Copy invite link"
        >
          <Icon name="link" size={16} />
        </button>
      ) : null}
      {isOwner ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onRevoke(inv)}
          className="pressable flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:text-danger-text disabled:opacity-50"
          aria-label="Revoke invite"
        >
          <Icon name="trash" size={16} />
        </button>
      ) : null}
    </li>
  );
}
