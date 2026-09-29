'use client';

/**
 * MoodboardCollaboratorsSheet — port of the mobile
 * MoodboardCollaboratorSheet: member list with role management, pending
 * invites, and invite creation. Roles mirror the mobile contract
 * (editor / commenter / viewer); the owner row is fixed.
 *
 * Live mode reads the real /moodboards/:id/members + /invites thread and
 * writes through the same endpoints the mobile app uses (role change,
 * removal, invite create/revoke — owner capabilities the backend
 * enforces). The invite token comes back exactly once; only its hash is
 * stored server-side. Fixture mode keeps the overlay posture.
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { DATA_MODE } from '@/lib/api/client';
import { parseApiError } from '@/lib/api/http';
import {
  createBoardInvite,
  fetchBoardInvites,
  fetchBoardMembers,
  removeBoardMember,
  revokeBoardInvite,
  setBoardMemberRole,
  type BoardInvite,
  type BoardMember,
} from '@/lib/api/services/social';
import { useMoodboardCollab } from '@/lib/store/moodboardCollab';
import { useHydrated } from '@/lib/store/useStore';
import { timeAgo } from '@/lib/utils/format';

const LIVE = DATA_MODE === 'live';

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

/** Normalized member row — fixture rows resolve through USERS, live rows
 *  carry the backend's member projection. */
interface RenderMember {
  userId: string;
  name: string | null;
  avatar: string | null;
  role: MoodboardRole;
  joinedAt: string;
}

interface InviteView {
  id: string;
  role: MoodboardRole;
  expiresAt: string;
  /** Live invites carry their link token (shown once at creation). */
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
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  // Live reads — members for any signed-in viewer with board access;
  // invites are owner-only server-side, so only the owner fetches them.
  const membersQuery = useQuery({
    queryKey: ['moodboard-members', boardId],
    queryFn: ({ signal }) => fetchBoardMembers(boardId, signal),
    enabled: LIVE && open,
    staleTime: 30_000,
  });
  const invitesQuery = useQuery({
    queryKey: ['moodboard-invites', boardId],
    queryFn: ({ signal }) => fetchBoardInvites(boardId, signal),
    enabled: LIVE && open && isOwner,
    staleTime: 30_000,
  });

  const members = useMemo<RenderMember[]>(() => {
    if (LIVE) {
      return (membersQuery.data ?? [])
        .filter((m) => m.state === 'active')
        .map((m: BoardMember) => ({
          userId: m.userId,
          name: m.displayName,
          avatar: m.avatar,
          role: m.role,
          joinedAt: m.joinedAt,
        }))
        .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
    }
    const overlay = hydrated ? collab : undefined;
    return MOODBOARD_MEMBERS.filter((m) => m.boardId === boardId)
      .filter((m) => !overlay?.removedMemberIds.includes(m.userId))
      .map((m) => {
        const user = USERS.find((u) => u.id === m.userId);
        return {
          userId: m.userId,
          name: user?.username ?? null,
          avatar: user?.avatar ?? null,
          role: overlay?.memberRoles[m.userId] ?? m.role,
          joinedAt: m.joinedAt,
        };
      })
      .sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
  }, [membersQuery.data, boardId, collab, hydrated]);

  const invites = useMemo<InviteView[]>(() => {
    if (LIVE) {
      return (invitesQuery.data ?? [])
        .filter((i) => i.state === 'pending')
        .map((i: BoardInvite) => ({
          id: i.id,
          role: i.role,
          expiresAt: i.expiresAt,
        }));
    }
    const overlay = hydrated ? collab : undefined;
    const base = MOODBOARD_INVITES.filter(
      (i) => i.boardId === boardId && i.state === 'pending',
    );
    return [...base, ...(overlay?.addedInvites ?? [])].filter(
      (i) => !overlay?.removedInviteIds.includes(i.id),
    );
  }, [invitesQuery.data, boardId, collab, hydrated]);

  const invalidateCollab = () => {
    void qc.invalidateQueries({ queryKey: ['moodboard-members', boardId] });
    void qc.invalidateQueries({ queryKey: ['moodboard-invites', boardId] });
  };

  const createInvite = async () => {
    if (busy) return;
    if (LIVE) {
      setBusy(true);
      try {
        const invite = await createBoardInvite(boardId, inviteRole);
        if (!invite) throw new Error('Invite not created');
        const url = `${window.location.origin}/moodboard/${boardId}?invite=${invite.token}`;
        void navigator.clipboard
          ?.writeText(url)
          .then(() => show('Invite link copied', 'success'))
          .catch(() => show('Invite created', 'success'));
        invalidateCollab();
      } catch (err) {
        show(parseApiError(err).message ?? "Couldn't create the invite — try again", 'error');
      } finally {
        setBusy(false);
      }
      return;
    }
    const token = Math.random().toString(36).slice(2, 10);
    const invite: MoodboardInviteRow & { token?: string } = {
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

  const changeRole = async (m: RenderMember, role: Exclude<MoodboardRole, 'owner'>) => {
    if (LIVE) {
      setBusy(true);
      try {
        await setBoardMemberRole(boardId, m.userId, role);
        invalidateCollab();
      } catch (err) {
        show(parseApiError(err).message ?? "Couldn't change the role — try again", 'error');
      } finally {
        setBusy(false);
      }
      return;
    }
    setMemberRole(boardId, m.userId, role);
  };

  const removeMemberRow = async (m: RenderMember) => {
    if (LIVE) {
      setBusy(true);
      try {
        await removeBoardMember(boardId, m.userId);
        invalidateCollab();
        show(`Removed @${m.name ?? m.userId}`, 'info');
      } catch (err) {
        show(parseApiError(err).message ?? "Couldn't remove them — try again", 'error');
      } finally {
        setBusy(false);
      }
      return;
    }
    removeMember(boardId, m.userId);
    show(`Removed @${m.name ?? m.userId}`, 'info');
  };

  const revoke = async (inv: InviteView) => {
    if (LIVE) {
      setBusy(true);
      try {
        await revokeBoardInvite(boardId, inv.id);
        invalidateCollab();
        show('Invite revoked', 'info');
      } catch (err) {
        show(parseApiError(err).message ?? "Couldn't revoke — try again", 'error');
      } finally {
        setBusy(false);
      }
      return;
    }
    revokeInvite(boardId, inv.id);
    show('Invite revoked', 'info');
  };

  const loading = LIVE && (membersQuery.isLoading || (isOwner && invitesQuery.isLoading));

  return (
    <Sheet open={open} onClose={onClose} title="Collaborators" maxWidth={480}>
      <div className="px-5 pb-5">
        {/* Members */}
        {loading ? (
          <p className="py-6 text-center text-body text-text-muted" aria-busy>
            Loading collaborators…
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle" aria-label="Board members">
            {members.map((m) => {
              const isOwnerRow = m.role === 'owner';
              return (
                <li key={m.userId} className="flex items-center gap-3 py-3">
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
                          void changeRole(
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
                        onClick={() => void removeMemberRow(m)}
                        aria-label={`Remove @${m.name ?? m.userId}`}
                        className="pressable flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:text-danger-text disabled:opacity-50"
                      >
                        <Icon name="personRemove" size={17} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

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
                      disabled={busy}
                      onClick={() => void revoke(inv)}
                      className="pressable flex h-9 w-9 items-center justify-center rounded-md text-text-muted hover:text-danger-text disabled:opacity-50"
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
              <Button
                variant="secondary"
                size="sm"
                icon="link"
                disabled={busy}
                onClick={() => void createInvite()}
              >
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
