'use client';

/**
 * MoodboardCollaboratorsSheet — port of the mobile
 * MoodboardCollaboratorSheet: member list with role management, pending
 * invites, and invite creation. Roles mirror the mobile contract
 * (editor / commenter / viewer); the owner row is fixed.
 *
 * No live collaborator contract exists on web — fixture rows are the base,
 * member writes persist in the moodboardCollab overlay (invite links are
 * generated client-side and shown once, mirroring the mobile token flow).
 */

import { useMemo, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { useToast } from '@/components/ui/Toast';
import {
  MOODBOARD_INVITES,
  MOODBOARD_MEMBERS,
  type MoodboardInviteRow,
  type MoodboardRole,
} from '@/lib/data/fixtures-content';
import { USERS } from '@/lib/data/fixtures';
import { useMoodboardCollab } from '@/lib/store/moodboardCollab';
import { useHydrated } from '@/lib/store/useStore';
import { timeAgo } from '@/lib/utils/format';

const ROLE_LABELS: Record<MoodboardRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
};

const INVITE_ROLES: Exclude<MoodboardRole, 'owner'>[] = [
  'editor',
  'commenter',
  'viewer',
];

interface MemberRow {
  userId: string;
  role: MoodboardRole;
  joinedAt: string;
}

interface InviteView extends MoodboardInviteRow {
  /** Session-created invites carry their link token (shown once). */
  token?: string;
}

interface MoodboardCollaboratorsSheetProps {
  boardId: string;
  open: boolean;
  onClose: () => void;
  isOwner: boolean;
}

export function MoodboardCollaboratorsSheet({
  boardId,
  open,
  onClose,
  isOwner,
}: MoodboardCollaboratorsSheetProps) {
  const { show } = useToast();
  const hydrated = useHydrated();
  const collab = useMoodboardCollab((s) => s.boards[boardId]);
  const setMemberRole = useMoodboardCollab((s) => s.setMemberRole);
  const removeMember = useMoodboardCollab((s) => s.removeMember);
  const addInvite = useMoodboardCollab((s) => s.addInvite);
  const revokeInvite = useMoodboardCollab((s) => s.revokeInvite);
  const [inviteRole, setInviteRole] =
    useState<Exclude<MoodboardRole, 'owner'>>('editor');

  const members = useMemo<MemberRow[]>(() => {
    const overlay = hydrated ? collab : undefined;
    return MOODBOARD_MEMBERS.filter((m) => m.boardId === boardId)
      .filter((m) => !overlay?.removedMemberIds.includes(m.userId))
      .map((m) => ({ ...m, role: overlay?.memberRoles[m.userId] ?? m.role }))
      .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
  }, [boardId, collab, hydrated]);

  const invites = useMemo<InviteView[]>(() => {
    const overlay = hydrated ? collab : undefined;
    const base = MOODBOARD_INVITES.filter(
      (i) => i.boardId === boardId && i.state === 'pending',
    );
    const pending = [...base, ...(overlay?.addedInvites ?? [])]
      .filter((i) => !overlay?.removedInviteIds.includes(i.id));
    return pending;
  }, [boardId, collab, hydrated]);

  const createInvite = () => {
    const token = Math.random().toString(36).slice(2, 10);
    const invite: InviteView = {
      id: `mbi-local-${Date.now()}`,
      boardId,
      role: inviteRole,
      state: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 3600e3).toISOString(),
      token,
    };
    addInvite(boardId, invite);
    const url = `${window.location.origin}/moodboard/${boardId}?invite=${token}`;
    void navigator.clipboard
      ?.writeText(url)
      .then(() => show('Invite link copied', 'success'))
      .catch(() => show('Invite created', 'success'));
  };

  return (
    <Sheet open={open} onClose={onClose} title="Collaborators" maxWidth={480}>
      <div className="px-5 pb-5">
        {/* Members */}
        <ul className="divide-y divide-border-subtle" aria-label="Board members">
          {members.map((m) => {
            const user = USERS.find((u) => u.id === m.userId);
            const isOwnerRow = m.role === 'owner';
            return (
              <li key={m.userId} className="flex items-center gap-3 py-3">
                <Avatar src={user?.avatar} name={user?.username ?? m.userId} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="clamp-1 text-body font-medium text-text-primary">
                    @{user?.username ?? m.userId}
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
                      Role for @{user?.username ?? m.userId}
                    </label>
                    <select
                      id={`role-${m.userId}`}
                      value={m.role}
                      onChange={(e) =>
                        setMemberRole(
                          boardId,
                          m.userId,
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
                      onClick={() => {
                        removeMember(boardId, m.userId);
                        show(`Removed @${user?.username ?? m.userId}`, 'info');
                      }}
                      aria-label={`Remove @${user?.username ?? m.userId}`}
                      className="pressable flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:text-danger-text"
                    >
                      <Icon name="personRemove" size={17} />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {/* Pending invites */}
        {invites.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-meta font-semibold uppercase tracking-wide text-text-muted">
              Pending invites
            </h3>
            <ul className="mt-1 divide-y divide-border-subtle">
              {invites.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-alt text-text-muted">
                    <Icon name="link" size={15} />
                  </span>
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
                      onClick={() => {
                        revokeInvite(boardId, inv.id);
                        show('Invite revoked', 'info');
                      }}
                      className="pressable flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:text-danger-text"
                      aria-label="Revoke invite"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Invite creation — owners mint role-scoped links */}
        {isOwner ? (
          <div className="mt-4 border-t border-border-subtle pt-4">
            <div className="flex items-center gap-2">
              <div
                role="radiogroup"
                aria-label="Invite role"
                className="flex flex-1 items-center gap-1.5"
              >
                {INVITE_ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={inviteRole === r}
                    onClick={() => setInviteRole(r)}
                    className={`pressable rounded-full px-3 py-1.5 text-meta font-medium ${
                      inviteRole === r
                        ? 'bg-brand text-text-inverse'
                        : 'bg-surface-alt text-text-secondary'
                    }`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
              <Button variant="secondary" size="sm" icon="link" onClick={createInvite}>
                Copy invite
              </Button>
            </div>
            <p className="mt-2 text-meta text-text-muted">
              Invites are valid for 30 days. Anyone with the link joins as the
              chosen role.
            </p>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
