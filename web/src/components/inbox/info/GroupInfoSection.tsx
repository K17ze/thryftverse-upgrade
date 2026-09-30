'use client';

import type { Conversation, ConversationParticipant } from '@/lib/contracts/domain';
import { GroupInfoHero } from '../GroupInfoHero';
import { InfoRow, InfoSection } from '../InfoSection';
import { InviteLinksSection } from '../InviteLinksSection';
import { MemberDirectory } from '../MemberDirectory';
import { PermissionsSection } from '../PermissionsSection';
import { QuickActions, type QuickAction } from '../QuickActions';
import { SharedMediaGrid, type SharedMediaItem } from '../SharedMediaGrid';
import { ConversationAgentsSection } from '../ConversationAgentsSection';
import type { MemberActionsTarget } from '../MemberActionsSheet';
import type { EditablePermission, GroupMemberRole, GroupPermissionScope } from '../groupAdmin';
import type { useGroupCapabilities } from '../useConversationAdmin';

interface GroupInfoSectionProps {
  conversation: Conversation;
  viewerId: string;
  capabilities: ReturnType<typeof useGroupCapabilities>['capabilities'];
  settings: ReturnType<typeof useGroupCapabilities>['settings'];
  pendingPermission: EditablePermission | null;
  memberTotal: number;
  members: ConversationParticipant[];
  memberRoles?: Record<string, GroupMemberRole>;
  mediaAnchor: React.RefObject<HTMLDivElement | null>;
  membersAnchor: React.RefObject<HTMLDivElement | null>;
  mediaItems: SharedMediaItem[];
  sharedSection: React.ReactNode;
  muteAction: QuickAction;
  muted: boolean;
  archived: boolean;
  onEditGroup: () => void;
  onAddMembers: () => void;
  onMemberPress: (m: MemberActionsTarget) => void;
  onPermissionChange: (key: EditablePermission, scope: GroupPermissionScope) => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  onClearChat: () => void;
  onLeaveGroup: () => void;
  onReportGroup: () => void;
  onRemoveMediaItems: (items: SharedMediaItem[]) => void;
  onScrollToMedia: () => void;
  onScrollToMembers: () => void;
}

export function GroupInfoSection({
  conversation,
  viewerId,
  capabilities,
  settings,
  pendingPermission,
  memberTotal,
  members,
  memberRoles,
  mediaAnchor,
  membersAnchor,
  mediaItems,
  sharedSection,
  muteAction,
  muted,
  archived,
  onEditGroup,
  onAddMembers,
  onMemberPress,
  onPermissionChange,
  onToggleMute,
  onToggleArchive,
  onClearChat,
  onLeaveGroup,
  onReportGroup,
  onRemoveMediaItems,
  onScrollToMedia,
  onScrollToMembers,
}: GroupInfoSectionProps) {
  const mediaCount = mediaItems.length;

  return (
    <>
      <GroupInfoHero
        conversation={conversation}
        viewerId={viewerId}
        canEdit={capabilities?.canEditGroupInfo ?? false}
        onEditCover={onEditGroup}
        onEditAvatar={onEditGroup}
        onEditDescription={onEditGroup}
        onEditInfo={onEditGroup}
      />
      <QuickActions
        actions={[
          {
            key: 'media',
            label: 'Media',
            icon: 'image',
            onPress: onScrollToMedia,
          },
          capabilities?.canAddMembers
            ? {
                key: 'add',
                label: 'Add members',
                icon: 'personAdd',
                onPress: onAddMembers,
              }
            : {
                key: 'members',
                label: 'Members',
                icon: 'people',
                onPress: onScrollToMembers,
              },
          muteAction,
        ]}
      />

      <div ref={mediaAnchor} className="scroll-mt-4">
        {sharedSection}
        {mediaCount > 0 ? (
          <div className="pt-3">
            <SharedMediaGrid
              items={mediaItems}
              onDeleteItems={onRemoveMediaItems}
            />
          </div>
        ) : null}
      </div>

      <div ref={membersAnchor} className="scroll-mt-4">
        <MemberDirectory
          memberCount={memberTotal}
          members={members}
          memberRoles={memberRoles}
          viewerId={viewerId}
          canAddMembers={capabilities?.canAddMembers ?? false}
          onAddMembers={onAddMembers}
          onMemberPress={onMemberPress}
        />
      </div>

      {/* Invite links — live edges only, management-gated like the
          list/revoke endpoints; create additionally honours the
          group's add_members scope. Fixture mode never renders it. */}
      {capabilities?.canManage ? (
        <InviteLinksSection
          conversationId={conversation.id}
          canManage={capabilities.canManage}
          canCreate={capabilities.canAddMembers}
        />
      ) : null}

      {settings && capabilities ? (
        <PermissionsSection
          settings={settings}
          capabilities={capabilities}
          pendingKey={pendingPermission}
          onChange={onPermissionChange}
        />
      ) : null}

      {/* Chat agents — the mobile GroupBotManagement surface,
          manager-gated like mobile's admin controls. Connect applies
          directly; remove confirms inside the section. */}
      {capabilities?.canManage ? (
        <ConversationAgentsSection conversation={conversation} />
      ) : null}

      <InfoSection title="Conversation">
        <InfoRow
          icon="notifications"
          label="Notifications"
          detail={muted ? 'Muted' : 'All'}
          onPress={onToggleMute}
        />
        <InfoRow
          icon={archived ? 'mail' : 'folder'}
          label={archived ? 'Unarchive conversation' : 'Archive conversation'}
          onPress={onToggleArchive}
        />
      </InfoSection>

      <InfoSection>
        <InfoRow
          icon="trash"
          tone="danger"
          label="Clear chat"
          onPress={onClearChat}
          showChevron={false}
        />
        <InfoRow
          icon="exit"
          tone="danger"
          label="Leave group"
          onPress={onLeaveGroup}
          showChevron={false}
        />
        <InfoRow
          icon="flag"
          tone="danger"
          label="Report group"
          onPress={onReportGroup}
        />
      </InfoSection>
    </>
  );
}
