'use client';

/**
 * InviteLinksSection — group invite-link management on the info surface,
 * the web port of the mobile group invite controls. Live edges only:
 *
 *   POST   /chat/conversations/:id/invite-links  — `add_members`-gated
 *   GET    /chat/conversations/:id/invite-links  — owner/admin
 *   DELETE /chat/conversations/:id/invite-links/:inviteId — owner/admin
 *
 * The full link is a one-time reveal at create (list rows carry only the
 * server token preview), so the freshly minted invite renders as a
 * copyable row until dismissed. The backend mints a `thryftverse://`
 * deep link — the web copy target rewrites it to this origin's
 * `/inbox/join?token=…` landing so a shared link actually opens on web.
 * Fixture mode has no backend — the section doesn't render there.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createGroupInviteLink,
  fetchGroupInviteLinks,
  revokeGroupInviteLink,
  type GroupInviteLink,
} from '@/lib/api/services/chat';
import { DATA_MODE } from '@/lib/api/client';
import { formatDate } from '@/lib/utils/format';
import { useToast } from '@/components/ui/Toast';
import { InfoRow, InfoSection } from './InfoSection';
import { CLOSED_CONFIRM, ConfirmSheet, type ConfirmSheetState } from './ConfirmSheet';

/** The full `thryftverse://group-invite?token=…` invite → this origin's
 *  web join landing. Returns null when the payload carries no token —
 *  never fabricate a link. */
function webInviteUrl(inviteLink: string | undefined): string | null {
  if (!inviteLink) return null;
  const match = /[?&]token=([^&]+)/.exec(inviteLink);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  return `${window.location.origin}/inbox/join?token=${encodeURIComponent(token)}`;
}

function inviteUsageLabel(invite: GroupInviteLink): string {
  const uses = invite.useCount ?? 0;
  const cap = (invite.maxUses ?? 0) > 0 ? ` of ${invite.maxUses}` : '';
  const base = `${uses}${cap} joined`;
  if (invite.isExpired) return `${base} · expired`;
  if (invite.expiresAt) return `${base} · expires ${formatDate(invite.expiresAt)}`;
  return base;
}

export function InviteLinksSection({
  conversationId,
  canManage,
  canCreate,
}: {
  conversationId: string;
  /** Owner/admin — the list + revoke edges are management-gated. */
  canManage: boolean;
  /** `add_members` capability — the create edge's server gate. */
  canCreate: boolean;
}) {
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmSheetState>(CLOSED_CONFIRM);

  const invitesQuery = useQuery({
    queryKey: ['group-invites', conversationId],
    queryFn: ({ signal }) => fetchGroupInviteLinks(conversationId, {}, signal),
    enabled: DATA_MODE === 'live' && canManage,
  });
  const invites = invitesQuery.data ?? [];

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.show('Invite link copied', 'success');
    } catch {
      toast.show("Couldn't copy — the link is shown in full.", 'error');
    }
  };

  const create = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const invite = await createGroupInviteLink(conversationId);
      setCopied(false);
      setFresh({ id: invite.id, url: webInviteUrl(invite.inviteLink) ?? '' });
      void invitesQuery.refetch();
      toast.show('Invite link created', 'success');
    } catch {
      toast.show("Couldn't create an invite link — try again.", 'error');
    } finally {
      setCreating(false);
    }
  };

  const confirmRevoke = (invite: GroupInviteLink) =>
    setConfirm({
      open: true,
      title: 'Revoke invite link?',
      message:
        'Anyone holding this link will no longer be able to join the group.',
      confirmLabel: 'Revoke',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await revokeGroupInviteLink(conversationId, invite.id);
          setFresh((f) => (f?.id === invite.id ? null : f));
          await invitesQuery.refetch();
          toast.show('Invite link revoked', 'success');
        } catch {
          toast.show("Couldn't revoke the invite link — try again.", 'error');
        }
      },
    });

  return (
    <>
      <InfoSection title="Invite links">
        {/* The freshly minted link — the only moment the full URL exists
            client-side (list rows are previews). Press copies. */}
        {fresh?.url ? (
          // Press copies — the row lives until the panel unmounts (the
          // link itself stays valid; the list only ever shows previews).
          <InfoRow
            icon="link"
            tone="brand"
            label={copied ? 'Copied to clipboard' : 'New invite link'}
            subtitle={fresh.url}
            detail="Copy"
            onPress={() => void copyLink(fresh.url)}
            showChevron={false}
          />
        ) : null}
        {invitesQuery.isLoading ? (
          <InfoRow icon="link" label="Loading invite links…" showChevron={false} disabled />
        ) : invitesQuery.isError ? (
          <InfoRow
            icon="alert"
            label="Couldn't load invite links"
            detail="Retry"
            onPress={() => void invitesQuery.refetch()}
            showChevron={false}
          />
        ) : invites.length === 0 && !fresh ? (
          <InfoRow
            icon="link"
            label="No active invite links"
            showChevron={false}
            disabled
          />
        ) : (
          // The fresh invite also appears in the refetched list — render
          // its preview row only under the copyable full-link row.
          invites
            .filter((invite) => invite.id !== fresh?.id)
            .map((invite) => (
            <InfoRow
              key={invite.id}
              icon="link"
              label={invite.tokenPreview ?? 'Invite link'}
              subtitle={inviteUsageLabel(invite)}
              detail="Revoke"
              onPress={() => confirmRevoke(invite)}
              showChevron={false}
            />
          ))
        )}
        {canCreate ? (
          <InfoRow
            icon="plus"
            tone="brand"
            label="Create invite link"
            subtitle="Anyone with the link can join this group"
            onPress={() => void create()}
            busy={creating}
            showChevron={false}
          />
        ) : null}
      </InfoSection>
      <ConfirmSheet state={confirm} onClose={() => setConfirm(CLOSED_CONFIRM)} />
    </>
  );
}
