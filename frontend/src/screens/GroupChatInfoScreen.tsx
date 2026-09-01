import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, ActivityIndicator, Pressable, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { ChatInfoRow, ChatInfoSection } from '../components/chat/ChatInfoSection';
import { FlagshipHeader, FlagshipScreen } from '../components/flagship';
import { Caption } from '../components/ui/Text';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { Control, Radius, Space, TypeStyles, FontFamily } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import {
  deleteConversationOnApi,
  createGroupInviteLinkOnApi,
  archiveConversationOnApi,
  type GroupInviteLink } from '../services/chatApi';
import { parseApiError } from '../lib/apiClient';
import { GroupAvatarMosaic } from '../components/chat/GroupAvatarMosaic';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupChatInfo'>;

type TabKey = 'members' | 'media' | 'settings';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'members', label: 'Members' },
  { key: 'media', label: 'Media' },
  { key: 'settings', label: 'Settings' },
];

export default function GroupChatInfoScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);
  const archiveConversation = useStore((state) => state.archiveConversation);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const toggleMuted = useStore((state) => state.toggleMutedConversation);

  const [activeTab, setActiveTab] = useState<TabKey>('members');
  const [isLeaving, setIsLeaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const [inviteLink, setInviteLink] = useState<GroupInviteLink | null>(null);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversations, conversationId]
  );
  const memberCount = conversation?.participantIds?.length ?? 0;
  const connectedAgentCount = conversation?.botIds?.length ?? 0;
  const isMuted = mutedIds.includes(conversationId);
  const currentRole = currentUser?.id ? conversation?.memberRoles?.[currentUser.id] : undefined;
  const canManageIdentity = Boolean(
    currentUser?.id
    && (conversation?.ownerId === currentUser.id || currentRole === 'owner' || currentRole === 'admin'),
  );

  const memberProfiles = useMemo(
    () => conversation?.participantProfiles ?? [],
    [conversation?.participantProfiles],
  );

  const recentMedia = useMemo(() => {
    const msgs = conversation?.messages ?? [];
    return msgs
      .filter((m) => m.mediaUri && !m.isSystem)
      .slice(-30)
      .reverse();
  }, [conversation?.messages]);

  if (!conversation || conversation.type !== 'group') {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Group details" onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
      >
        <View style={styles.center}>
          <Caption color={colors.textMuted}>Group not found</Caption>
        </View>
      </FlagshipScreen>
    );
  }

  const description = conversation?.description;
  const coverPhoto = conversation?.coverPhoto;
  const groupAvatar = conversation?.avatar;
  const avatarMembers = memberProfiles.map((member) => ({
    id: member.id,
    displayName: member.displayName ?? member.username,
    avatar: member.avatar }));

  const leaveGroup = () => {
    setConfirmSheet({
      visible: true,
      title: 'Leave group?',
      message: 'You will be removed from this group on all devices. Other members will keep their copy.',
      confirmLabel: 'Leave group',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.heavy();
        setIsLeaving(true);
        try {
          await deleteConversationOnApi(conversationId, 'leave');
          deleteConversation(conversationId);
          show('You left the group', 'info');
          navigation.navigate('MainTabs', { screen: 'Inbox' });
        } catch {
          show('Could not leave group. Check your connection and try again.', 'error');
        } finally {
          setIsLeaving(false);
        }
      } });
  };

  const deleteForMe = () => {
    setConfirmSheet({
      visible: true,
      title: 'Remove from inbox?',
      message: 'This removes the conversation from your inbox on all your devices.',
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.heavy();
        setIsDeleting(true);
        try {
          await deleteConversationOnApi(conversationId, 'me');
          deleteConversation(conversationId);
          show('Conversation removed from your inbox', 'info');
          navigation.navigate('MainTabs', { screen: 'Inbox' });
        } catch {
          show('Could not delete conversation. Check your connection and try again.', 'error');
        } finally {
          setIsDeleting(false);
        }
      } });
  };

  const archive = async () => {
    haptic.medium();
    setIsArchiving(true);
    try {
      await archiveConversationOnApi(conversationId);
      archiveConversation(conversationId);
      show('Conversation archived', 'success');
      navigation.navigate('MainTabs', { screen: 'Inbox' });
    } catch (err) {
      show(parseApiError(err, 'Could not archive conversation. Try again.').message, 'error');
    } finally {
      setIsArchiving(false);
    }
  };

  const toggleMute = async () => {
    haptic.light();
    setIsTogglingMute(true);
    try {
      await toggleMuted(conversationId);
      show(isMuted ? 'Conversation unmuted' : 'Conversation muted', 'success');
    } catch (err) {
      show(parseApiError(err, 'Could not update mute status. Try again.').message, 'error');
    } finally {
      setIsTogglingMute(false);
    }
  };

  const handleGenerateInviteLink = async () => {
    haptic.light();
    setIsGeneratingInvite(true);
    try {
      const link = await createGroupInviteLinkOnApi(conversationId, {
        expiresInHours: 72 });
      setInviteLink(link);
      show('Invite link created', 'success');
    } catch (err) {
      show(parseApiError(err, 'Could not create invite link. Try again.').message, 'error');
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return;
    haptic.light();
    try {
      await Clipboard.setStringAsync(inviteLink.inviteLink);
      show('Invite link copied', 'success');
    } catch {
      show('Could not copy link. Long-press to copy manually.', 'error');
    }
  };

  const handleShareInviteLink = async () => {
    if (!inviteLink) return;
    haptic.light();
    try {
      await Share.share({ message: inviteLink.inviteLink });
    } catch {
      // user cancelled or share failed — no action needed
    }
  };

  const selectTab = (key: TabKey) => {
    if (key === activeTab) return;
    haptic.selection();
    setActiveTab(key);
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Group details"
          onBack={() => navigation.goBack()}
          rightAction={canManageIdentity ? (
            <AnimatedPressable
              onPress={() => navigation.navigate('EditGroup', { conversationId })}
              style={styles.headerAction}
              activeOpacity={0.68}
              scaleValue={0.94}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Edit group"
            >
              <Ionicons name="create-outline" size={21} color={colors.textPrimary} />
            </AnimatedPressable>
          ) : undefined}
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
        {/* Cover photo — full-width banner when a cover photo is set.
            Falls back to the group avatar as a centered mosaic (120pt)
            when no cover photo, matching the WhatsApp/Telegram pattern. */}
        {coverPhoto ? (
          <View style={styles.coverWrap}>
            <CachedImage
              uri={coverPhoto}
              style={styles.coverImage}
              contentFit="cover"
              downscaleWidth={720}
            />
            {canManageIdentity && (
              <AnimatedPressable
                style={styles.coverEditBadge}
                onPress={() => navigation.navigate('EditGroup', { conversationId })}
                activeOpacity={0.7}
                scaleValue={0.94}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Change cover photo"
              >
                <Ionicons name="camera-outline" size={17} color={colors.scrimTextPrimary} />
              </AnimatedPressable>
            )}
          </View>
        ) : groupAvatar ? (
          /* If no cover photo but avatar is set, show avatar as the banner */
          <View style={styles.coverWrap}>
            <CachedImage
              uri={groupAvatar}
              style={styles.coverImage}
              contentFit="cover"
              downscaleWidth={720}
            />
            {canManageIdentity && (
              <AnimatedPressable
                style={styles.coverEditBadge}
                onPress={() => navigation.navigate('EditGroup', { conversationId })}
                activeOpacity={0.7}
                scaleValue={0.94}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Add cover photo"
              >
                <Ionicons name="camera-outline" size={17} color={colors.scrimTextPrimary} />
              </AnimatedPressable>
            )}
          </View>
        ) : (
          <View style={styles.coverFallback}>
            <GroupAvatarMosaic
              members={avatarMembers}
              groupPhoto={undefined}
              fallbackInitials={conversation.title || 'Group'}
              size={120}
            />
            {canManageIdentity && (
              <AnimatedPressable
                style={styles.coverEditBadge}
                onPress={() => navigation.navigate('EditGroup', { conversationId })}
                activeOpacity={0.7}
                scaleValue={0.94}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Add group photo"
              >
                <Ionicons name="camera-outline" size={17} color={colors.scrimTextPrimary} />
              </AnimatedPressable>
            )}
          </View>
        )}

        <View style={styles.identity}>
          <Text style={styles.groupName} numberOfLines={1}>
            {conversation.title || 'Group chat'}
          </Text>
          {description ? (
            <Text style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
          <Text style={styles.identityMeta}>
            {memberCount} member{memberCount === 1 ? '' : 's'}
            {connectedAgentCount > 0
              ? `  ·  ${connectedAgentCount} agent${connectedAgentCount === 1 ? '' : 's'} connected`
              : ''}
          </Text>
        </View>

        {/* Tab bar — segmented control with underline indicator.
            Flat, hairline dividers, transparent backgrounds. */}
        <View style={styles.tabBar}>
          {TABS.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <Pressable
                key={tab.key}
                style={styles.tab}
                onPress={() => selectTab(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tab.label}
              >
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
                {active ? <View style={styles.tabIndicator} /> : null}
              </Pressable>
            );
          })}
        </View>

        <View style={styles.tabContent}>
          {activeTab === 'members' && (
            <MembersTab
              memberProfiles={memberProfiles}
              memberRoles={conversation.memberRoles}
              currentUserId={currentUser?.id}
              canManageIdentity={canManageIdentity}
              memberCount={memberCount}
              onViewAll={() => navigation.navigate('GroupMembers', { conversationId })}
              onAddMembers={() => navigation.navigate('GroupMembers', { conversationId })}
            />
          )}

          {activeTab === 'media' && (
            <MediaTab
              mediaItems={recentMedia}
              onViewAll={() => navigation.navigate('SharedConversationMedia', { conversationId })}
              onOpenMedia={(uri, mediaType, senderLabel, timestamp, messageId) =>
                navigation.navigate('ChatMediaPreview', {
                  mediaUri: uri,
                  mediaType,
                  senderLabel,
                  timestamp,
                  messageId })
              }
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              isMuted={isMuted}
              isTogglingMute={isTogglingMute}
              onToggleMute={toggleMute}
              isArchiving={isArchiving}
              onArchive={archive}
              inviteLink={inviteLink}
              isGeneratingInvite={isGeneratingInvite}
              onGenerateInvite={handleGenerateInviteLink}
              onCopyInvite={handleCopyInviteLink}
              onShareInvite={handleShareInviteLink}
              onQuickReplies={() => navigation.navigate('ManageQuickReplies', { role: 'seller' })}
              onManageAgents={() => navigation.navigate('GroupBotManagement', { conversationId })}
              connectedAgentCount={connectedAgentCount}
              onReportGroup={() => navigation.navigate('Report', { type: 'group', targetId: conversationId })}
              isLeaving={isLeaving}
              onLeaveGroup={leaveGroup}
              isDeleting={isDeleting}
              onDeleteForMe={deleteForMe}
            />
          )}
        </View>
      </ScrollView>
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'danger'}
        onConfirm={confirmSheet.onConfirm}
      />
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// Members tab — compact member list (top 5) + Add members + View all
// ---------------------------------------------------------------------------
function MembersTab({
  memberProfiles,
  memberRoles,
  currentUserId,
  canManageIdentity,
  memberCount,
  onViewAll,
  onAddMembers }: {
  memberProfiles: Array<{ id: string; username: string; displayName?: string | null; avatar?: string | null }>;
  memberRoles?: Record<string, 'owner' | 'admin' | 'member'>;
  currentUserId?: string;
  canManageIdentity: boolean;
  memberCount: number;
  onViewAll: () => void;
  onAddMembers: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const topMembers = memberProfiles.slice(0, 5);

  const roleLabel = (role?: 'owner' | 'admin' | 'member'): string | null => {
    if (role === 'owner') return 'Owner';
    if (role === 'admin') return 'Admin';
    return null;
  };

  return (
    <View style={styles.paddedContent}>
      {canManageIdentity && (
        <AnimatedPressable
          style={styles.addMembersRow}
          onPress={onAddMembers}
          activeOpacity={0.68}
          scaleValue={0.985}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Add members"
        >
          <View style={styles.addMembersIcon}>
            <Ionicons name="person-add-outline" size={20} color={colors.brand} />
          </View>
          <Text style={styles.addMembersText}>Add members</Text>
        </AnimatedPressable>
      )}

      <View style={styles.memberList}>
        {topMembers.length === 0 ? (
          <Caption color={colors.textMuted} style={styles.emptyMembers}>
            Member list unavailable
          </Caption>
        ) : (
          topMembers.map((member, index) => {
            const role = memberRoles?.[member.id];
            const isYou = member.id === currentUserId;
            const badge = roleLabel(role);
            const isLast = index === topMembers.length - 1;
            const initials = (member.displayName ?? member.username).slice(0, 2).toUpperCase();
            return (
              <View key={member.id} style={[styles.memberRow, !isLast && styles.memberRowDivider]}>
                <MemberAvatar uri={member.avatar ?? undefined} initials={initials} />
                <View style={styles.memberCopy}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {member.displayName ?? member.username}
                    {isYou ? '  (you)' : ''}
                  </Text>
                  <Text style={styles.memberHandle} numberOfLines={1}>@{member.username}</Text>
                </View>
                {badge ? (
                  <View style={[styles.roleBadge, role === 'owner' && styles.roleBadgeOwner]}>
                    <Text style={[styles.roleBadgeText, role === 'owner' && styles.roleBadgeTextOwner]}>
                      {badge}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </View>

      {memberCount > 5 && (
        <AnimatedPressable
          style={styles.viewAllRow}
          onPress={onViewAll}
          activeOpacity={0.68}
          scaleValue={0.985}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={`View all ${memberCount} members`}
        >
          <Text style={styles.viewAllText}>View all {memberCount} members</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </AnimatedPressable>
      )}
    </View>
  );
}

function MemberAvatar({ uri, initials }: { uri?: string; initials: string }) {
  const { colors } = useAppTheme();
  if (uri) {
    return <CachedImage uri={uri} style={styles_memberAvatar.avatar} contentFit="cover" />;
  }
  return (
    <View style={[styles_memberAvatar.avatar, { backgroundColor: colors.surfaceAlt }]}>
      <Text style={styles_memberAvatar.initials}>{initials}</Text>
    </View>
  );
}

const styles_memberAvatar = StyleSheet.create({
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center' },
  initials: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold } });

// ---------------------------------------------------------------------------
// Media tab — 3-column grid of recent shared media
// ---------------------------------------------------------------------------
function MediaTab({
  mediaItems,
  onViewAll,
  onOpenMedia }: {
  mediaItems: Array<{ id: string; mediaUri?: string; mediaType?: 'image' | 'video'; senderId?: string; timestamp?: string }>;
  onViewAll: () => void;
  onOpenMedia: (uri: string, mediaType?: 'image' | 'video', senderLabel?: string, timestamp?: string, messageId?: string) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const grid = mediaItems.slice(0, 9);

  if (grid.length === 0) {
    return (
      <View style={styles.mediaEmpty}>
        <Ionicons name="images-outline" size={28} color={colors.textMuted} />
        <Caption color={colors.textMuted} style={styles.mediaEmptyText}>
          No shared media yet
        </Caption>
      </View>
    );
  }

  return (
    <View style={styles.paddedContent}>
      <View style={styles.mediaGrid}>
        {grid.map((item) => {
          const isVideo = item.mediaType === 'video';
          return (
            <AnimatedPressable
              key={item.id}
              onPress={() => onOpenMedia(item.mediaUri!, item.mediaType, undefined, item.timestamp, item.id)}
              style={styles.mediaTile}
              activeOpacity={0.85}
              scaleValue={0.96}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={isVideo ? 'Open shared video' : 'Open shared photo'}
            >
              <CachedImage
                uri={item.mediaUri!}
                style={styles.mediaTileImage}
                contentFit="cover"
              />
              {isVideo && (
                <View style={styles.mediaVideoBadge}>
                  <Ionicons name="play" size={14} color={colors.scrimTextPrimary} />
                </View>
              )}
            </AnimatedPressable>
          );
        })}
      </View>
      {mediaItems.length > 9 && (
        <AnimatedPressable
          style={styles.viewAllRow}
          onPress={onViewAll}
          activeOpacity={0.68}
          scaleValue={0.985}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="View all shared media"
        >
          <Text style={styles.viewAllText}>View all media</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </AnimatedPressable>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Settings tab — Conversation, Chat history, Invite, Membership sections
// ---------------------------------------------------------------------------
function SettingsTab({
  isMuted,
  isTogglingMute,
  onToggleMute,
  isArchiving,
  onArchive,
  inviteLink,
  isGeneratingInvite,
  onGenerateInvite,
  onCopyInvite,
  onShareInvite,
  onQuickReplies,
  onManageAgents,
  connectedAgentCount,
  onReportGroup,
  isLeaving,
  onLeaveGroup,
  isDeleting,
  onDeleteForMe }: {
  isMuted: boolean;
  isTogglingMute: boolean;
  onToggleMute: () => void;
  isArchiving: boolean;
  onArchive: () => void;
  inviteLink: GroupInviteLink | null;
  isGeneratingInvite: boolean;
  onGenerateInvite: () => void;
  onCopyInvite: () => void;
  onShareInvite: () => void;
  onQuickReplies: () => void;
  onManageAgents: () => void;
  connectedAgentCount: number;
  onReportGroup: () => void;
  isLeaving: boolean;
  onLeaveGroup: () => void;
  isDeleting: boolean;
  onDeleteForMe: () => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.paddedContent}>
      <ChatInfoSection title="Conversation">
        <ChatInfoRow
          icon="chatbubble-ellipses-outline"
          label="Quick replies"
          subtitle="Reusable message templates"
          onPress={onQuickReplies}
          showChevron
        />
        <ChatInfoRow
          icon={isMuted ? 'volume-mute-outline' : 'notifications-outline'}
          label={isMuted ? 'Unmute notifications' : 'Mute notifications'}
          onPress={onToggleMute}
          trailing={isTogglingMute ? <ActivityIndicator size="small" color={colors.brand} /> : undefined}
        />
      </ChatInfoSection>

      <ChatInfoSection title="AI agents">
        <ChatInfoRow
          icon="bulb-outline"
          label="Manage AI agents"
          subtitle={
            connectedAgentCount > 0
              ? `${connectedAgentCount} agent${connectedAgentCount === 1 ? '' : 's'} connected`
              : 'Deploy assistants for moderation, styling, or shopping help'
          }
          onPress={onManageAgents}
          showChevron
        />
      </ChatInfoSection>

      <ChatInfoSection title="Chat history">
        <ChatInfoRow
          icon="archive-outline"
          label="Archive conversation"
          subtitle="Move this chat out of your active inbox"
          onPress={onArchive}
          trailing={isArchiving ? <ActivityIndicator size="small" color={colors.brand} /> : undefined}
        />
      </ChatInfoSection>

      <ChatInfoSection title="Invite">
        <ChatInfoRow
          icon="link-outline"
          label="Invite via link"
          subtitle={inviteLink ? 'Link ready · tap to share' : 'Create a shareable invite link'}
          onPress={onGenerateInvite}
          showChevron={!inviteLink}
          trailing={isGeneratingInvite ? <ActivityIndicator size="small" color={colors.brand} /> : undefined}
        />
        {inviteLink && (
          <View style={styles.inviteLinkCard}>
            <Text style={styles.inviteLinkText} numberOfLines={2}>{inviteLink.inviteLink}</Text>
            <View style={styles.inviteLinkActions}>
              <Pressable
                onPress={onCopyInvite}
                style={({ pressed }) => [styles.inviteActionBtn, pressed && styles.inviteActionPressed]}
                accessibilityRole="button"
                accessibilityLabel="Copy invite link"
              >
                <Ionicons name="copy-outline" size={16} color={colors.brand} />
                <Text style={styles.inviteActionText}>Copy</Text>
              </Pressable>
              <Pressable
                onPress={onShareInvite}
                style={({ pressed }) => [styles.inviteActionBtn, pressed && styles.inviteActionPressed]}
                accessibilityRole="button"
                accessibilityLabel="Share invite link"
              >
                <Ionicons name="share-outline" size={16} color={colors.brand} />
                <Text style={styles.inviteActionText}>Share</Text>
              </Pressable>
            </View>
            <Caption color={colors.textMuted} style={styles.inviteExpiry}>
              Expires in 72 hours
            </Caption>
          </View>
        )}
      </ChatInfoSection>

      <ChatInfoSection title="Membership" danger>
        <ChatInfoRow
          icon="flag-outline"
          label="Report group"
          subtitle="Spam, abuse or policy violation"
          onPress={onReportGroup}
          danger
          showChevron
        />
        <ChatInfoRow
          icon="log-out-outline"
          label={isLeaving ? 'Leaving…' : 'Leave group'}
          onPress={onLeaveGroup}
          danger
          trailing={isLeaving ? <ActivityIndicator size="small" color={colors.danger} /> : undefined}
        />
        <ChatInfoRow
          icon="trash-outline"
          label={isDeleting ? 'Deleting…' : 'Delete for me'}
          onPress={onDeleteForMe}
          danger
          trailing={isDeleting ? <ActivityIndicator size="small" color={colors.danger} /> : undefined}
        />
      </ChatInfoSection>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    gap: Space.lg },
  paddedContent: {
    paddingHorizontal: Space.md,
    gap: Space.lg },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center' },
  headerAction: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center' },
  coverWrap: {
    width: '100%',
    height: 220,
    position: 'relative' },
  coverImage: {
    width: '100%',
    height: '100%' },
  coverFallback: {
    width: '100%',
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    position: 'relative' },
  coverEditBadge: {
    position: 'absolute',
    bottom: Space.sm + 2,
    right: Space.md,
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center' },
  identity: {
    alignItems: 'center',
    paddingTop: Space.sm,
    paddingBottom: Space.xs,
    paddingHorizontal: Space.md,
    gap: Space.xs },
  groupName: {
    maxWidth: '88%',
    color: colors.textPrimary,
    fontFamily: TypeStyles.title.fontFamily,
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    letterSpacing: TypographyV2.screenTitle.letterSpacing },
  description: {
    maxWidth: '84%',
    color: colors.textSecondary,
    fontFamily: TypeStyles.body.fontFamily,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.size + 6,
    textAlign: 'center',
    marginTop: Space.xs },
  identityMeta: {
    color: colors.textMuted,
    fontFamily: TypeStyles.body.fontFamily,
    fontSize: TypographyV2.meta.size,
    marginTop: Space.xs / 2 + 1 },
  // ── Tab bar ──
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.sm + 2,
    position: 'relative' },
  tabLabel: {
    color: colors.textMuted,
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight },
  tabLabelActive: {
    color: colors.textPrimary,
    fontFamily: FontFamily.semibold },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    backgroundColor: colors.textPrimary,
    borderRadius: 1 },
  tabContent: {
    flex: 1 },
  // ── Members tab ──
  addMembersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle },
  addMembersIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSubtle },
  addMembersText: {
    color: colors.brand,
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size },
  memberList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm + 2 },
  memberRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle },
  memberCopy: {
    flex: 1,
    gap: 2 },
  memberName: {
    color: colors.textPrimary,
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight },
  memberHandle: {
    color: colors.textMuted,
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight },
  roleBadge: {
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceAlt },
  roleBadgeOwner: {
    backgroundColor: colors.brandSubtle },
  roleBadgeText: {
    color: colors.textSecondary,
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size,
    letterSpacing: 0.2 },
  roleBadgeTextOwner: {
    color: colors.brand },
  emptyMembers: {
    paddingVertical: Space.md },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  viewAllText: {
    color: colors.textSecondary,
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.body.size },
  // ── Media tab ──
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.xs },
  mediaTile: {
    width: '32.5%',
    aspectRatio: 1,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    position: 'relative' },
  mediaTileImage: {
    width: '100%',
    height: '100%' },
  mediaVideoBadge: {
    position: 'absolute',
    bottom: Space.xs,
    right: Space.xs,
    width: 22,
    height: 22,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center' },
  mediaEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xxl * 2,
    gap: Space.sm },
  mediaEmptyText: {
    textAlign: 'center' },
  // ── Invite link card ──
  inviteLinkCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.lg,
    padding: Space.md,
    gap: Space.sm,
    marginTop: Space.xs },
  inviteLinkText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.body.fontFamily,
    color: colors.textPrimary,
    lineHeight: TypographyV2.meta.size + 6 },
  inviteLinkActions: {
    flexDirection: 'row',
    gap: Space.md },
  inviteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    minHeight: Control.hit,
    paddingHorizontal: Space.sm },
  inviteActionPressed: {
    opacity: 0.6 },
  inviteActionText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.brand },
  inviteExpiry: {
    fontSize: TypographyV2.meta.size } });
}
