'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

const LIVE = DATA_MODE === 'live';

export const ROLE_LABELS: Record<MoodboardRole, string> = {
  owner: 'Owner',
  editor: 'Editor',
  commenter: 'Commenter',
  viewer: 'Viewer',
};

export const INVITE_ROLES: Exclude<MoodboardRole, 'owner'>[] = [
  'editor',
  'commenter',
  'viewer',
];

/** Normalized member row — fixture rows resolve through USERS, live rows
 *  carry the backend's member projection. */
export interface RenderMember {
  userId: string;
  name: string | null;
  avatar: string | null;
  role: MoodboardRole;
  joinedAt: string;
}

export interface InviteView {
  id: string;
  role: MoodboardRole;
  expiresAt: string;
  /** Live invites carry their link token (shown once at creation). */
  token?: string;
}

export function useMoodboardCollaboratorsWorkflow(boardId: string, open: boolean, isOwner: boolean) {
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

  return {
    members,
    invites,
    inviteRole,
    setInviteRole,
    busy,
    loading,
    createInvite,
    changeRole,
    removeMemberRow,
    revoke,
  };
}
