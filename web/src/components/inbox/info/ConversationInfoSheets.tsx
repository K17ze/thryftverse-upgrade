'use client';

import { useRouter } from 'next/navigation';
import type { Conversation, User } from '@/lib/contracts/domain';
import { ReportSheet } from '@/components/report';
import { AddMembersSheet } from '../AddMembersSheet';
import { ConfirmSheet, type ConfirmSheetState } from '../ConfirmSheet';
import { EditGroupSheet } from '../EditGroupSheet';
import { MemberActionsSheet, type MemberActionsTarget } from '../MemberActionsSheet';
import { ReportGroupSheet } from '../ReportGroupSheet';
import { conversationTitle } from '../inboxModel';
import type { useGroupCapabilities } from '../useConversationAdmin';

interface ConversationInfoSheetsProps {
  conversation: Conversation;
  viewerId: string;
  counterpartyId?: string;
  counterpartyName: string;
  counterpartyUsername: string;
  role?: string;
  capabilities: ReturnType<typeof useGroupCapabilities>['capabilities'];
  existingIds: Set<string>;
  editOpen: boolean;
  addOpen: boolean;
  memberTarget: MemberActionsTarget | null;
  confirm: ConfirmSheetState;
  userReportOpen: boolean;
  groupReportOpen: boolean;
  onCloseEdit: () => void;
  onCloseAdd: () => void;
  onDismissMemberTarget: () => void;
  onCloseConfirm: () => void;
  onCloseUserReport: () => void;
  onCloseGroupReport: () => void;
  onSaveGroup: (patch: {
    title: string;
    description: string;
    avatar?: string | null;
    coverPhoto?: string | null;
  }) => Promise<boolean>;
  onAddUsers: (users: User[]) => Promise<boolean>;
  onMessageMember: (m: MemberActionsTarget) => void;
  onToggleAdmin: (m: MemberActionsTarget) => void;
  onRemoveMember: (m: MemberActionsTarget) => void;
  onTransferOwnership: (m: MemberActionsTarget) => void;
  onSetConfirm: (confirm: ConfirmSheetState) => void;
}

export function ConversationInfoSheets({
  conversation,
  viewerId,
  counterpartyId,
  counterpartyName,
  counterpartyUsername,
  role,
  capabilities,
  existingIds,
  editOpen,
  addOpen,
  memberTarget,
  confirm,
  userReportOpen,
  groupReportOpen,
  onCloseEdit,
  onCloseAdd,
  onDismissMemberTarget,
  onCloseConfirm,
  onCloseUserReport,
  onCloseGroupReport,
  onSaveGroup,
  onAddUsers,
  onMessageMember,
  onToggleAdmin,
  onRemoveMember,
  onTransferOwnership,
  onSetConfirm,
}: ConversationInfoSheetsProps) {
  const router = useRouter();

  return (
    <>
      <EditGroupSheet
        open={editOpen}
        onClose={onCloseEdit}
        conversation={conversation}
        viewerId={viewerId}
        onSave={onSaveGroup}
        onDiscardDirty={() =>
          onSetConfirm({
            open: true,
            title: 'Discard changes?',
            message: 'Your edits will be lost.',
            confirmLabel: 'Discard',
            variant: 'danger',
            onConfirm: onCloseEdit,
          })
        }
      />
      <AddMembersSheet
        open={addOpen}
        onClose={onCloseAdd}
        existingIds={existingIds}
        onAdd={onAddUsers}
      />
      <MemberActionsSheet
        member={memberTarget}
        onDismiss={onDismissMemberTarget}
        canManageMembers={capabilities?.canManage ?? false}
        isSelf={memberTarget?.id === viewerId}
        canTransferOwnership={role === 'owner'}
        onViewProfile={(m) => {
          onDismissMemberTarget();
          router.push(`/u/${m.username}`);
        }}
        onMessage={onMessageMember}
        onToggleAdmin={onToggleAdmin}
        onRemove={onRemoveMember}
        onTransferOwnership={onTransferOwnership}
      />
      <ConfirmSheet state={confirm} onClose={onCloseConfirm} />
      <ReportSheet
        open={userReportOpen}
        onClose={onCloseUserReport}
        target={{
          type: 'user',
          id: counterpartyId ?? '',
          label: counterpartyUsername ? `@${counterpartyUsername}` : counterpartyName,
        }}
      />
      <ReportGroupSheet
        open={groupReportOpen}
        onClose={onCloseGroupReport}
        conversationId={conversation.id}
        groupLabel={conversationTitle(conversation)}
      />
    </>
  );
}
