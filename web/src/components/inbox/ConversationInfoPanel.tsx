'use client';

/**
 * ConversationInfoPanel — the /inbox/[id]/info surface. Port of the mobile
 * ConversationInfoScreen / GroupChatInfoScreen: an identity hero, quick
 * actions, the shared-media grid, the member directory with role badges,
 * the permissions rows, and the separated destructive zone — flat canvas,
 * inset hairlines, no cards.
 *
 * Authority is honest throughout: role badges render only where the data
 * carries roles (live memberRoles, session overrides, or the fixture
 * creator provenance), management affordances sit behind the derived
 * capabilities, and mutation failures surface as error toasts rather than
 * optimistic claims. DMs get the member hero, marketplace context, and the
 * report/block rung the safety store supports.
 */

import { formatDate } from '@/lib/utils/format';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { CLOSED_CONFIRM } from './ConfirmSheet';
import { InfoRow, InfoSection } from './InfoSection';
import { ConversationInfoSkeleton } from './info/ConversationInfoSkeleton';
import { DmInfoSection } from './info/DmInfoSection';
import { GroupInfoSection } from './info/GroupInfoSection';
import { ConversationInfoSheets } from './info/ConversationInfoSheets';
import { useConversationInfoWorkflow } from './info/useConversationInfoWorkflow';

export function ConversationInfoPanel({ conversationId }: { conversationId: string }) {
  const w = useConversationInfoWorkflow(conversationId);

  if (w.isGuest) return null;
  if (w.isLoading) return <ConversationInfoSkeleton conversationId={conversationId} />;
  if (w.isError) {
    return (
      <div className="flex h-full flex-col bg-background">
        <header className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-1 py-1">
          <IconButton
            name="back"
            aria-label="Back to conversation"
            onClick={() => w.router.push(`/inbox/${conversationId}`)}
          />
        </header>
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon="alert"
            title="Couldn't load chat details"
            subtitle="Check your connection and try again."
            actionLabel="Try again"
            onAction={() => void w.refetch()}
          />
        </div>
      </div>
    );
  }
  if (!w.conversation) {
    return (
      <div className="flex h-full flex-col bg-background">
        <header className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-1 py-1">
          <IconButton
            name="back"
            aria-label="Back to conversation"
            onClick={() => w.router.push(`/inbox/${conversationId}`)}
          />
        </header>
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon="chat"
            title="Conversation not found"
            subtitle="It may have been archived or deleted."
            actionLabel="Back to inbox"
            onAction={() => w.router.push('/inbox')}
          />
        </div>
      </div>
    );
  }

  const sharedSection = (
    <InfoSection title="Shared in this chat">
      <InfoRow
        icon="images"
        label="Photos and videos"
        detail={w.mediaCount > 0 ? String(w.mediaCount) : 'None'}
        showChevron={false}
      />
      <InfoRow
        icon="link"
        label="Links"
        detail={w.linkCount > 0 ? String(w.linkCount) : 'None'}
        showChevron={false}
      />
      <InfoRow
        icon="offer"
        label="Offers"
        detail={w.offerCount > 0 ? String(w.offerCount) : 'None'}
        showChevron={false}
      />
    </InfoSection>
  );

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-1 py-1">
        <IconButton
          name="back"
          aria-label="Back to conversation"
          onClick={() => w.router.push(`/inbox/${conversationId}`)}
        />
        <p className="clamp-1 min-w-0 flex-1 text-body-emphasis font-semibold text-text-primary">
          {w.isGroup ? 'Group details' : 'Chat details'}
        </p>
        {w.isGroup && w.capabilities?.canEditGroupInfo ? (
          <IconButton
            name="edit"
            aria-label="Edit group"
            onClick={() => w.setEditOpen(true)}
          />
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        {w.isGroup ? (
          <GroupInfoSection
            conversation={w.conversation}
            viewerId={w.viewerId}
            capabilities={w.capabilities}
            settings={w.settings}
            pendingPermission={w.pendingPermission}
            memberTotal={w.memberTotal}
            members={w.members}
            memberRoles={w.memberRoles}
            mediaAnchor={w.mediaAnchor}
            membersAnchor={w.membersAnchor}
            mediaItems={w.mediaItems}
            sharedSection={sharedSection}
            muteAction={w.muteAction}
            muted={w.muted}
            archived={w.archived}
            onEditGroup={() => w.setEditOpen(true)}
            onAddMembers={() => w.setAddOpen(true)}
            onMemberPress={w.setMemberTarget}
            onPermissionChange={w.handlePermissionChange}
            onToggleMute={w.handleToggleMute}
            onToggleArchive={w.handleToggleArchive}
            onClearChat={w.confirmClearChat}
            onLeaveGroup={w.handleLeave}
            onReportGroup={() => w.setGroupReportOpen(true)}
            onRemoveMediaItems={w.removeMediaItems}
            onScrollToMedia={() => w.scrollTo(w.mediaAnchor)}
            onScrollToMembers={() => w.scrollTo(w.membersAnchor)}
          />
        ) : (
          <DmInfoSection
            conversation={w.conversation}
            counterpartyId={w.counterpartyId}
            counterpartyName={w.counterpartyName}
            counterpartyUsername={w.counterpartyUsername}
            blocked={w.blocked}
            muted={w.muted}
            archived={w.archived}
            mediaAnchor={w.mediaAnchor}
            mediaItems={w.mediaItems}
            sharedSection={sharedSection}
            muteAction={w.muteAction}
            onToggleBlock={w.handleToggleBlock}
            onReportUser={() => w.setUserReportOpen(true)}
            onRemoveFromInbox={w.confirmRemoveFromInbox}
            onToggleMute={w.handleToggleMute}
            onToggleArchive={w.handleToggleArchive}
            onRemoveMediaItems={w.removeMediaItems}
            onScrollToMedia={() => w.scrollTo(w.mediaAnchor)}
          />
        )}

        {w.createdAt ? (
          <p className="px-4 pt-6 text-center text-meta text-text-muted">
            Created {formatDate(w.createdAt)}
          </p>
        ) : null}
      </div>

      <ConversationInfoSheets
        conversation={w.conversation}
        viewerId={w.viewerId}
        counterpartyId={w.counterpartyId}
        counterpartyName={w.counterpartyName}
        counterpartyUsername={w.counterpartyUsername}
        role={w.role}
        capabilities={w.capabilities}
        existingIds={w.existingIds}
        editOpen={w.editOpen}
        addOpen={w.addOpen}
        memberTarget={w.memberTarget}
        confirm={w.confirm}
        userReportOpen={w.userReportOpen}
        groupReportOpen={w.groupReportOpen}
        onCloseEdit={() => w.setEditOpen(false)}
        onCloseAdd={() => w.setAddOpen(false)}
        onDismissMemberTarget={() => w.setMemberTarget(null)}
        onCloseConfirm={() => w.setConfirm(CLOSED_CONFIRM)}
        onCloseUserReport={() => w.setUserReportOpen(false)}
        onCloseGroupReport={() => w.setGroupReportOpen(false)}
        onSaveGroup={w.saveGroup}
        onAddUsers={w.addUsers}
        onMessageMember={w.handleMessageMember}
        onToggleAdmin={w.handleToggleAdmin}
        onRemoveMember={w.confirmRemoveMember}
        onTransferOwnership={w.confirmTransferOwnership}
        onSetConfirm={w.setConfirm}
      />

      {w.settingsFailed && w.isGroup ? (
        <p className="sr-only" role="status">
          Group permissions are unavailable — showing role defaults.
        </p>
      ) : null}
    </div>
  );
}
