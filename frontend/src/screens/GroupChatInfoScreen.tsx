import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlagshipHeader, FlagshipScreen, FlagshipFormSection } from '../components/flagship';
import { Caption } from '../components/ui/Text';
import { useAppTheme } from '../theme/ThemeContext';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { RootStackParamList } from '../navigation/types';
import { Space } from '../theme/designTokens';
import { CHAT_THEMES } from '../services/chatPreferencesApi';
import { GroupInfoHero } from '../components/groupchat/GroupInfoHero';
import { GroupInfoRow } from '../components/groupchat/GroupInfoRow';
import { GroupQuickActions } from '../components/groupchat/GroupQuickActions';
import { GroupMediaStrip } from '../components/groupchat/GroupMediaStrip';
import { GroupMembersDirectory } from '../components/groupchat/GroupMembersDirectory';
import { GroupInfoHeaderAction } from '../components/groupchatinfo/GroupInfoHeaderAction';
import { GroupInfoNotFound } from '../components/groupchatinfo/GroupInfoNotFound';
import { GroupInfoPrivacySection } from '../components/groupchatinfo/GroupInfoPrivacySection';
import { GroupInfoControlsSection } from '../components/groupchatinfo/GroupInfoControlsSection';
import { GroupChatInfoSheets } from '../components/groupchatinfo/GroupChatInfoSheets';
import { styles } from '../components/groupchatinfo/groupChatInfoStyles';
import {
  toAvatarMembers,
  buildInviteSummary,
  createMemberLabel,
  formatCreationDate,
} from '../components/groupchatinfo/groupChatInfoViewModels';
import {
  useGroupChatInfoData,
  useGroupMembershipGuard,
  useGroupChatMedia,
  useGroupMediaEditing,
  useGroupInviteLinks,
  useGroupMemberActions,
  useGroupMuteToggle,
  useGroupPinToggle,
  useGroupThemePreference,
  useGroupDangerActions,
  type GroupInfoConfirmSheetState,
} from '../hooks/groupchatinfo';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupChatInfo'>;

export default function GroupChatInfoScreen({ navigation, route }: Props) {
  const { conversationId } = route.params ?? {};
  const { colors } = useAppTheme();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { isOffline } = useConnectivity();

  const {
    conversation,
    currentUser,
    memberCount,
    connectedAgentCount,
    isMuted,
    currentRole,
    isGroupManager,
    canEditGroupInfo,
    canAddMembers,
    memberProfiles,
  } = useGroupChatInfoData(conversationId);

  useGroupMembershipGuard(conversationId, currentUser?.id, navigation);

  const { mediaItems, mediaState, loadMedia, visualMediaItems } = useGroupChatMedia(
    conversationId,
    conversation
  );

  const {
    mediaSheet,
    openMediaSheet,
    closeMediaSheet,
    displayCoverPhoto,
    displayAvatar,
    handleMediaSourceSelect,
    handleSelectPreset,
    handleRemoveMedia,
  } = useGroupMediaEditing(conversation, conversationId);

  const [confirmSheet, setConfirmSheet] = useState<GroupInfoConfirmSheetState>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const {
    displayedInviteSummary,
    isGeneratingInvite,
    generateInviteLink,
    revokeInviteLink,
    copyInviteLink,
    shareInviteLink,
    shareGroupInvite,
  } = useGroupInviteLinks({ conversationId, canAddMembers, setConfirmSheet });

  const { selectedMember, setSelectedMember, toggleMemberAdmin, removeMember } =
    useGroupMemberActions({ conversation, conversationId, setConfirmSheet });

  const { isTogglingMute, toggleMute } = useGroupMuteToggle(conversationId, isMuted);
  const { isTogglingPin, togglePin } = useGroupPinToggle(conversationId, conversation?.isPinned);
  const {
    preferences,
    selectedTheme,
    themeSaveError,
    isThemeSheetVisible,
    setIsThemeSheetVisible,
    selectTheme,
  } = useGroupThemePreference(conversationId);

  // Destructive conversation actions (leave / clear) — behind the shared
  // confirmation sheet, with the ownership-transfer guard intact.
  const { isLeaving, leaveGroup, clearChat } = useGroupDangerActions({
    conversation,
    conversationId,
    currentUserId: currentUser?.id,
    currentRole,
    navigation,
    setConfirmSheet,
  });

  const [isPrivacySheetVisible, setIsPrivacySheetVisible] = useState(false);
  const [isActivitySheetVisible, setIsActivitySheetVisible] = useState(false);

  if (!conversation || conversation.type !== 'group') {
    return <GroupInfoNotFound onBack={() => navigation.goBack()} />;
  }

  const avatarMembers = toAvatarMembers(memberProfiles);
  const memberLabel = createMemberLabel(memberProfiles);

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Group details"
          onBack={() => navigation.goBack()}
          rightAction={
            <GroupInfoHeaderAction
              canEdit={canEditGroupInfo}
              onPress={() => {
                if (canEditGroupInfo) {
                  navigation.navigate('EditGroup', { conversationId });
                } else {
                  shareGroupInvite(conversation.title);
                }
              }}
            />
          }
        />
      }
      scrollEnabled={false}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, Space.xl) + Space.lg },
        ]}
      >
        {/* ── Identity ── */}
        <GroupInfoHero
          title={conversation.title || 'Group chat'}
          groupId={conversation.id}
          coverPhoto={displayCoverPhoto}
          avatarUri={displayAvatar}
          members={avatarMembers}
          memberCount={memberCount}
          agentCount={connectedAgentCount}
          description={conversation.description}
          canEdit={canEditGroupInfo}
          onEditCover={() => openMediaSheet('cover')}
          onEditAvatar={() => openMediaSheet('avatar')}
          onEditDescription={() => navigation.navigate('EditGroup', { conversationId })}
        />

        {/* ── Quick actions ── */}
        <GroupQuickActions
          actions={[
            {
              key: 'theme',
              label: 'Theme',
              icon: 'palette',
              onPress: () => setIsThemeSheetVisible(true),
            },
            {
              key: 'search',
              label: 'Search',
              icon: 'search',
              onPress: () =>
                navigation.navigate('GroupChat', {
                  groupId: conversationId,
                  groupName: conversation.title ?? 'Group',
                  initialSearch: true,
                }),
              accessibilityLabel: 'Search messages in conversation',
            },
            {
              key: 'add',
              label: canAddMembers ? 'Add' : 'Invite',
              icon: canAddMembers ? 'person-add-outline' : 'link',
              onPress: () => {
                if (canAddMembers) {
                  navigation.navigate('GroupMembers', { conversationId });
                } else {
                  void shareGroupInvite(conversation.title);
                }
              },
              accessibilityLabel: canAddMembers ? 'Add members' : 'Invite friends',
            },
            {
              key: 'mute',
              label: isMuted ? 'Muted' : 'Mute',
              icon: isMuted ? 'notificationsOff' : 'notifications',
              active: isMuted,
              busy: isTogglingMute,
              onPress: toggleMute,
              accessibilityLabel: isMuted ? 'Unmute group' : 'Mute group',
            },
          ]}
        />

        {/* ── Media ── */}
        <FlagshipFormSection title="Media" variant="flat">
          <GroupInfoRow
            icon="images"
            label="Media, links and docs"
            detail={mediaItems.length > 0 ? `${mediaItems.length}` : 'None'}
            onPress={() => navigation.navigate('SharedConversationMedia', { conversationId })}
            isLast={visualMediaItems.length === 0 && mediaState !== 'loading'}
          />
          <GroupMediaStrip
            state={mediaState === 'idle' ? 'loading' : mediaState}
            items={visualMediaItems}
            onRetry={loadMedia}
            onPressItem={(item) =>
              navigation.navigate('ChatMediaPreview', {
                mediaUri: item.uri,
                mediaType: item.mediaType === 'video' ? 'video' : 'image',
                messageId: item.id,
              })
            }
          />
        </FlagshipFormSection>

        {/* ── Settings ── */}
        <FlagshipFormSection title="Settings" variant="flat">
          <GroupInfoRow
            icon="palette"
            label="Chat theme"
            detail={
              preferences.query.isFetching
                ? 'Loading…'
                : preferences.query.isError
                  ? 'Check saved theme'
                  : preferences.query.data?.theme
            }
            onPress={() => setIsThemeSheetVisible(true)}
          />
          <GroupInfoRow
            icon={isMuted ? 'notificationsOff' : 'notifications'}
            label="Notifications"
            detail={isMuted ? 'Muted' : 'All'}
            onPress={toggleMute}
            disabled={isTogglingMute}
            busy={isTogglingMute}
            isLast
          />
        </FlagshipFormSection>

        {/* ── Privacy & transparency ── */}
        <GroupInfoPrivacySection onPress={() => setIsPrivacySheetVisible(true)} />

        {/* ── Smart group actions ── */}
        <FlagshipFormSection variant="flat">
          <GroupInfoRow
            icon="people"
            label="Create a similar group"
            subtitle="Start with the same members that you can add or remove"
            onPress={() =>
              navigation.navigate('CreateGroupChat', {
                prefillMemberIds: conversation.participantIds,
                prefillTitle: `${conversation.title || 'Group'} (Clone)`,
              })
            }
            isLast
          />
        </FlagshipFormSection>

        {/* ── Members directory (renders its own header + search toggle) ── */}
        <View style={styles.directorySection}>
          <GroupMembersDirectory
            memberCount={memberCount}
            members={memberProfiles}
            memberRoles={conversation.memberRoles}
            currentUserId={currentUser?.id}
            canAddMembers={canAddMembers}
            inviteSummary={buildInviteSummary(displayedInviteSummary)}
            inviteBusy={isGeneratingInvite}
            onAddMembers={() => navigation.navigate('GroupMembers', { conversationId })}
            onInvitePrimary={
              displayedInviteSummary ? copyInviteLink : generateInviteLink
            }
            onCopyInvite={copyInviteLink}
            onShareInvite={shareInviteLink}
            onRevokeInvite={revokeInviteLink}
            onMemberPress={(member) => {
              haptic.light();
              setSelectedMember(member);
            }}
            onSeeAll={() => navigation.navigate('GroupMembers', { conversationId })}
            onViewActivity={() => setIsActivitySheetVisible(true)}
          />
        </View>

        {/* ── Group controls (owner/admin) ── */}
        {isGroupManager ? (
          <GroupInfoControlsSection
            connectedAgentCount={connectedAgentCount}
            onPermissionsPress={() => navigation.navigate('GroupPermissions', { conversationId })}
            onAgentsPress={() => navigation.navigate('GroupBotManagement', { conversationId })}
          />
        ) : null}

        {/* ── Conversation actions ── */}
        <FlagshipFormSection variant="flat">
          <GroupInfoRow
            icon="pin"
            iconColor={colors.brand}
            label={conversation.isPinned ? 'Unpin from inbox' : 'Pin to inbox'}
            labelColor={colors.brand}
            onPress={togglePin}
            disabled={isTogglingPin}
            busy={isTogglingPin}
          />
          <GroupInfoRow
            icon="trash"
            iconColor={colors.danger}
            label="Clear chat"
            labelColor={colors.danger}
            onPress={clearChat}
            isLast
          />
        </FlagshipFormSection>

        {/* ── Danger zone ── */}
        <FlagshipFormSection variant="flat">
          <GroupInfoRow
            icon="log-out-outline"
            iconColor={colors.danger}
            label={isLeaving ? 'Leaving…' : 'Exit group'}
            labelColor={colors.danger}
            onPress={leaveGroup}
            busy={isLeaving}
          />
          <GroupInfoRow
            icon="flag"
            iconColor={colors.danger}
            label="Report group"
            labelColor={colors.danger}
            onPress={() => navigation.navigate('Report', { type: 'group', targetId: conversationId })}
            isLast
          />
        </FlagshipFormSection>

        {/* ── Provenance footnote ── */}
        <View style={styles.provenanceFootnote}>
          <Caption color={colors.textMuted}>
            Created {formatCreationDate(conversation.createdAt)}
            {conversation.ownerId ? ` · Group ID: ${conversation.id.slice(0, 8)}` : ''}
            {isOffline ? ' · Offline — changes will sync when reconnected' : ''}
          </Caption>
        </View>
      </ScrollView>

      {/* ── Sheets ── */}
      <GroupChatInfoSheets
        confirmSheet={confirmSheet}
        onDismissConfirmSheet={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        mediaSheet={mediaSheet}
        onCloseMediaSheet={closeMediaSheet}
        onSelectMediaSource={handleMediaSourceSelect}
        onSelectPreset={handleSelectPreset}
        canRemoveMedia={Boolean(mediaSheet.target === 'avatar' ? displayAvatar : displayCoverPhoto)}
        onRemoveMedia={handleRemoveMedia}
        isPrivacySheetVisible={isPrivacySheetVisible}
        onDismissPrivacySheet={() => setIsPrivacySheetVisible(false)}
        isThemeSheetVisible={isThemeSheetVisible}
        onDismissThemeSheet={() => setIsThemeSheetVisible(false)}
        themes={CHAT_THEMES}
        selectedTheme={selectedTheme}
        themeSaveError={themeSaveError}
        onSelectTheme={(theme) => {
          haptic.selection();
          void selectTheme(theme);
        }}
        selectedMember={selectedMember}
        onDismissMemberSheet={() => setSelectedMember(null)}
        canManageMembers={isGroupManager}
        isSelfMember={selectedMember?.id === currentUser?.id}
        memberAdminActionLabel={
          selectedMember?.role === 'admin' ? 'Dismiss as admin' : 'Make group admin'
        }
        memberRemoveLabel="Remove from group"
        memberMessageLabel={
          selectedMember ? `Message @${selectedMember.username}` : 'Message member'
        }
        onViewMemberProfile={(userId) => {
          setSelectedMember(null);
          navigation.navigate('UserProfile', { userId });
        }}
        onMessageMember={(member) => {
          setSelectedMember(null);
          navigation.navigate('NewMessage', {
            preselectedUserId: member.id,
            preselectedDisplayName: member.displayName ?? member.username,
          });
        }}
        onToggleMemberAdmin={toggleMemberAdmin}
        onRemoveMember={removeMember}
        isActivitySheetVisible={isActivitySheetVisible}
        onDismissActivitySheet={() => setIsActivitySheetVisible(false)}
        conversationId={conversationId}
        conversationCreatedAt={conversation.createdAt}
        memberLabel={memberLabel}
        memberRole={(userId) => conversation.memberRoles?.[userId]}
        activityTitle="Member Activity"
        activitySubtitle="Join and role events for this group."
      />
    </FlagshipScreen>
  );
}
