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

import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import {
  ROLE_LABELS,
  INVITE_ROLES,
  useMoodboardCollaboratorsWorkflow,
} from './useMoodboardCollaboratorsWorkflow';
import { CollaboratorItem } from './collab/CollaboratorItem';
import { CollaboratorInviteItem } from './collab/CollaboratorInviteItem';

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
  const {
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
  } = useMoodboardCollaboratorsWorkflow(boardId, open, isOwner);

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
            {members.map((m) => (
              <CollaboratorItem
                key={m.userId}
                member={m}
                isOwner={isOwner}
                busy={busy}
                onChangeRole={(mem, r) => void changeRole(mem, r)}
                onRemove={(mem) => void removeMemberRow(mem)}
              />
            ))}
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
                <CollaboratorInviteItem
                  key={inv.id}
                  boardId={boardId}
                  invite={inv}
                  isOwner={isOwner}
                  busy={busy}
                  onRevoke={(i) => void revoke(i)}
                />
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
