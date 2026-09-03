import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View, ActivityIndicator, Pressable, Share, Linking } from 'react-native';
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
import { Control, Radius, Space, Stroke, TypeStyles, FontFamily } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import {
  deleteConversationOnApi,
  createGroupInviteLinkOnApi,
  fetchGroupInviteLinksOnApi,
  revokeGroupInviteLinkOnApi,
  archiveConversationOnApi,
  fetchConversationMediaFromApi,
  fetchGroupSettingsFromApi,
  type GroupInviteLink,
  type GroupSettingsCapabilities } from '../services/chatApi';
import { parseApiError } from '../lib/apiClient';
import { GroupAvatarMosaic } from '../components/chat/GroupAvatarMosaic';
import { useChatGroupMembershipEvent } from '../services/realtimeClient';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupChatInfo'>;

type TabKey = 'members' | 'media' | 'settings';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'members', label: 'Members' },
  { key: 'media', label: 'Media' },
  { key: 'settings', label: 'Settings' },
];

export default function GroupChatInfoScreen({ navigation, route }: Props) {
  const { conversationId } = route.params ?? {};
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
  const [activeInviteSummary, setActiveInviteSummary] = useState<GroupInviteLink | null>(null);
  const displayedInviteSummary = inviteLink ?? activeInviteSummary;
  const reconcileGroupMembershipEvent = useStore((state) => state.reconcileGroupMembershipEvent);

  useChatGroupMembershipEvent(conversationId, (event) => {
    const removedUserId = event.type === 'chat.member.removed'
      ? event.payload.memberUserId
      : event.type === 'chat.member.left'
        ? event.payload.actorUserId
        : null;
    reconcileGroupMembershipEvent(event);
    if (removedUserId && removedUserId === currentUser?.id) {
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Inbox' } }] });
    }
  });
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
  const isGroupManager = Boolean(
    currentUser?.id
    && (conversation?.ownerId === currentUser.id || currentRole === 'owner' || currentRole === 'admin'),
  );
  const [groupCapabilities, setGroupCapabilities] = useState<GroupSettingsCapabilities | null>(null);
  const canEditGroupInfo = groupCapabilities?.canEditGroupInfo ?? isGroupManager;
  const canAddMembers = groupCapabilities?.canAddMembers ?? isGroupManager;

  useEffect(() => {
    let active = true;
    fetchGroupSettingsFromApi(conversationId)
      .then((snapshot) => {
        if (active) setGroupCapabilities(snapshot.capabilities);
      })
      .catch(() => {
        // Existing role-derived access remains the honest fallback while the
        // settings endpoint is unavailable. Mutations are still server-gated.
      });
    return () => {
      active = false;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!canAddMembers) return;
    fetchGroupInviteLinksOnApi(conversationId)
      .then((links) => setActiveInviteSummary(links.find((link) => !link.isExpired && !link.isRevoked) ?? null))
      .catch(() => setActiveInviteSummary(null));
  }, [canAddMembers, conversationId]);

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

  // Shared media is fetched from the live endpoint the first time the media
  // tab opens (live-signs §37.2): local cached messages only cover the page
  // of history already in the store, so a media tab driven solely by local
  // state silently hides older media. While loading, local items render as
  // instant first paint; the endpoint result replaces them when ready.
  const [remoteMedia, setRemoteMedia] = useState<
    Array<{ id: string; mediaUri: string; mediaType: 'image' | 'video' | 'document'; senderUserId: string | null; createdAt: string; documentName?: string; documentMimeType?: string }>
  >([]);
  const [mediaState, setMediaState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const mediaRequestSeq = useRef(0);

  useEffect(() => {
    if (activeTab !== 'media' || mediaState !== 'idle') return;
    const seq = ++mediaRequestSeq.current;
    setMediaState('loading');
    fetchConversationMediaFromApi(conversationId, { limit: 90 })
      .then((items) => {
        if (mediaRequestSeq.current !== seq) return; // stale response — ignore
        setRemoteMedia(items);
        setMediaState('ready');
      })
      .catch(() => {
        if (mediaRequestSeq.current !== seq) return;
        setMediaState('error');
      });
  }, [activeTab, mediaState, conversationId]);

  const mediaItems = useMemo(() => {
    if (mediaState === 'ready') return remoteMedia;
    return recentMedia;
  }, [mediaState, remoteMedia, recentMedia]);

  const retryMediaFetch = useCallback(() => {
    mediaRequestSeq.current += 1;
    setMediaState('idle');
  }, []);

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
    if (conversation.ownerId === currentUser?.id || currentRole === 'owner') {
      show('Transfer ownership before leaving this group.', 'info');
      navigation.navigate('GroupMembers', { conversationId });
      return;
    }
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
      setActiveInviteSummary(link);
      show('Invite link created', 'success');
    } catch (err) {
      show(parseApiError(err, 'Could not create invite link. Try again.').message, 'error');
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleRevokeInviteLink = () => {
    const link = inviteLink ?? activeInviteSummary;
    if (!link?.id) return;
    setConfirmSheet({
      visible: true,
      title: 'Revoke invite link?',
      message: 'Anyone using this link will no longer be able to join with it.',
      confirmLabel: 'Revoke link',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((state) => ({ ...state, visible: false }));
        try {
          await revokeGroupInviteLinkOnApi(conversationId, link.id);
          setInviteLink(null);
          setActiveInviteSummary(null);
          show('Invite link revoked', 'info');
        } catch (error) {
          show(parseApiError(error, 'Could not revoke invite link.').message, 'error');
        }
      },
    });
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

  const handleQuickShare = async () => {
    haptic.light();
    try {
      if (inviteLink) {
        await Share.share({ message: `Join ${conversation.title || 'our group'} on ThryftVerse: ${inviteLink.inviteLink}` });
      } else {
        await Share.share({ message: `Join ${conversation.title || 'our group'} on ThryftVerse!` });
      }
    } catch {
      // user cancelled
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
          rightAction={canEditGroupInfo ? (
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
        {/* Hero — WhatsApp/Telegram composition.
            When a cover photo exists: full-width banner with the circular
            group avatar overlapping the bottom edge. When no cover but an
            avatar exists: centered hero avatar on a tinted surface.
            Never stretch a circular avatar into a banner. */}
        {coverPhoto ? (
          <View style={styles.heroSection}>
            <View style={styles.coverWrap}>
              <CachedImage
                uri={coverPhoto}
                style={styles.coverImage}
                contentFit="cover"
                downscaleWidth={720}
              />
              {canEditGroupInfo && (
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
            <View style={styles.heroAvatarOverlap}>
              <View style={styles.heroAvatarWrap}>
                <GroupAvatarMosaic
                  members={avatarMembers}
                  groupPhoto={groupAvatar}
                  fallbackInitials={conversation.title || 'Group'}
                  groupId={conversation.id}
                  size={92}
                />
                {canEditGroupInfo && (
                  <AnimatedPressable
                    style={styles.avatarEditBadge}
                    onPress={() => navigation.navigate('EditGroup', { conversationId })}
                    activeOpacity={0.7}
                    scaleValue={0.94}
                    hapticFeedback="light"
                    accessibilityRole="button"
                    accessibilityLabel="Change group photo"
                  >
                    <Ionicons name="camera" size={15} color={colors.textInverse} />
                  </AnimatedPressable>
                )}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.heroAvatarContainer}>
            <View style={styles.heroAvatarWrap}>
              <GroupAvatarMosaic
                members={avatarMembers}
                groupPhoto={groupAvatar}
                fallbackInitials={conversation.title || 'Group'}
                groupId={conversation.id}
                size={104}
              />
              {canEditGroupInfo && (
                <AnimatedPressable
                  style={styles.avatarEditBadge}
                  onPress={() => navigation.navigate('EditGroup', { conversationId })}
                  activeOpacity={0.7}
                  scaleValue={0.94}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel="Add group photo"
                >
                  <Ionicons name="camera" size={15} color={colors.textInverse} />
                </AnimatedPressable>
              )}
            </View>
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

        {/* Quick Action Dock — Telegram/WhatsApp 2026 flagship pattern */}
        <View style={styles.quickActionDock}>
          <AnimatedPressable
            style={styles.quickActionItem}
            onPress={toggleMute}
            activeOpacity={0.7}
            scaleValue={0.94}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={isMuted ? 'Unmute group' : 'Mute group'}
          >
            <View style={[styles.quickActionIcon, isMuted && styles.quickActionIconActive]}>
              <Ionicons
                name={isMuted ? 'notifications-off-outline' : 'notifications-outline'}
                size={22}
                color={isMuted ? colors.brand : colors.textPrimary}
              />
            </View>
            <Text style={[styles.quickActionLabel, isMuted && styles.quickActionLabelActive]}>
              {isMuted ? 'Unmute' : 'Mute'}
            </Text>
          </AnimatedPressable>

          {canAddMembers ? (
            <AnimatedPressable
              style={styles.quickActionItem}
              onPress={() => navigation.navigate('GroupMembers', { conversationId })}
              activeOpacity={0.7}
              scaleValue={0.94}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Add members to group"
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name="person-add-outline" size={22} color={colors.textPrimary} />
              </View>
              <Text style={styles.quickActionLabel}>Add</Text>
            </AnimatedPressable>
          ) : (
            <AnimatedPressable
              style={styles.quickActionItem}
              onPress={handleQuickShare}
              activeOpacity={0.7}
              scaleValue={0.94}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Share invite link"
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name="link-outline" size={22} color={colors.textPrimary} />
              </View>
              <Text style={styles.quickActionLabel}>Invite</Text>
            </AnimatedPressable>
          )}

          <AnimatedPressable
            style={styles.quickActionItem}
            onPress={handleQuickShare}
            activeOpacity={0.7}
            scaleValue={0.94}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Share group"
          >
            <View style={styles.quickActionIcon}>
              <Ionicons name="share-outline" size={22} color={colors.textPrimary} />
            </View>
            <Text style={styles.quickActionLabel}>Share</Text>
          </AnimatedPressable>
        </View>

        {/* Tab bar — iOS 18 / Telegram segmented pill control */}
        <View style={styles.tabSegmentContainer}>
          {TABS.map((tab) => {
            const active = tab.key === activeTab;
            return (
              <AnimatedPressable
                key={tab.key}
                style={[styles.tabPill, active && styles.tabPillActive]}
                onPress={() => selectTab(tab.key)}
                activeOpacity={0.8}
                scaleValue={0.97}
                hapticFeedback="selection"
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tab.label}
              >
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
              </AnimatedPressable>
            );
          })}
        </View>

        <View style={styles.tabContent}>
          {activeTab === 'members' && (
            <MembersTab
              memberProfiles={memberProfiles}
              memberRoles={conversation.memberRoles}
              currentUserId={currentUser?.id}
              canAddMembers={canAddMembers}
              memberCount={memberCount}
              onViewAll={() => navigation.navigate('GroupMembers', { conversationId })}
              onAddMembers={() => navigation.navigate('GroupMembers', { conversationId })}
            />
          )}

          {activeTab === 'media' && (
            <MediaTab
              mediaItems={mediaItems}
              isLoading={mediaState === 'loading' && mediaItems.length === 0}
              hasError={mediaState === 'error'}
              onRetry={retryMediaFetch}
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
              canManageGroup={isGroupManager}
              canAddMembers={canAddMembers}
              onManagePermissions={() => navigation.navigate('GroupPermissions', { conversationId })}
              isMuted={isMuted}
              isTogglingMute={isTogglingMute}
              onToggleMute={toggleMute}
              isArchiving={isArchiving}
              onArchive={archive}
              inviteLink={inviteLink}
              activeInviteSummary={activeInviteSummary}
              isGeneratingInvite={isGeneratingInvite}
              onGenerateInvite={handleGenerateInviteLink}
              onCopyInvite={handleCopyInviteLink}
              onShareInvite={handleShareInviteLink}
              onRevokeInvite={handleRevokeInviteLink}
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
  canAddMembers,
  memberCount,
  onViewAll,
  onAddMembers }: {
  memberProfiles: Array<{ id: string; username: string; displayName?: string | null; avatar?: string | null }>;
  memberRoles?: Record<string, 'owner' | 'admin' | 'member'>;
  currentUserId?: string;
  canAddMembers: boolean;
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
      {canAddMembers && (
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
  isLoading = false,
  hasError = false,
  onRetry,
  onViewAll,
  onOpenMedia }: {
  mediaItems: Array<{ id: string; mediaUri?: string; mediaType?: 'image' | 'video' | 'document'; senderId?: string; timestamp?: string; documentName?: string; documentMimeType?: string }>;
  /** True only while the endpoint is in flight AND nothing can render yet. */
  isLoading?: boolean;
  hasError?: boolean;
  onRetry?: () => void;
  onViewAll: () => void;
  onOpenMedia: (uri: string, mediaType?: 'image' | 'video' | 'document', senderLabel?: string, timestamp?: string, messageId?: string) => void;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Split into visual media (images/videos) and documents
  const visualMedia = mediaItems.filter((m) => m.mediaType !== 'document');
  const documents = mediaItems.filter((m) => m.mediaType === 'document');
  const grid = visualMedia.slice(0, 9);
  const docList = documents.slice(0, 5);

  // Loading — skeleton tiles match the final 3-column grid geometry exactly,
  // so decode causes no layout shift (AGENTS.md §14, Design.md performance).
  if (isLoading) {
    return (
      <View style={styles.paddedContent} accessibilityLabel="Loading shared media">
        <View style={styles.mediaGrid}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View key={`skeleton-${i}`} style={[styles.mediaTile, styles.mediaTileSkeleton]} />
          ))}
        </View>
      </View>
    );
  }

  // Error with nothing to show — inline recovery, user-safe copy, no raw
  // backend error (§11, §14). With cached items present, the grid stays
  // usable and the failure surfaces as a quiet retry row instead.
  if (hasError && grid.length === 0 && docList.length === 0) {
    return (
      <View style={styles.mediaEmpty}>
        <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} />
        <Caption color={colors.textMuted} style={styles.mediaEmptyText}>
          Couldn't load shared media
        </Caption>
        {onRetry ? (
          <AnimatedPressable
            style={styles.mediaRetryButton}
            onPress={onRetry}
            activeOpacity={0.7}
            scaleValue={0.97}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Retry loading shared media"
          >
            <Text style={styles.mediaRetryText}>Retry</Text>
          </AnimatedPressable>
        ) : null}
      </View>
    );
  }

  if (grid.length === 0 && docList.length === 0) {
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
      {docList.length > 0 && (
        <View style={styles.docListWrap}>
          <Caption color={colors.textMuted} style={styles.docListHeader}>Files</Caption>
          {docList.map((item) => (
            <AnimatedPressable
              key={item.id}
              onPress={() => {
                if (item.mediaUri?.startsWith('http')) {
                  Linking.openURL(item.mediaUri).catch(() => {});
                }
              }}
              style={styles.docRow}
              activeOpacity={0.7}
              scaleValue={0.98}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={`Open file: ${item.documentName ?? 'file'}`}
            >
              <View style={[styles.docIconWrap, { backgroundColor: colors.brandSubtle }]}>
                <Ionicons
                  name={
                    item.documentMimeType?.includes('pdf') ? 'document-text-outline'
                    : item.documentMimeType?.includes('zip') || item.documentMimeType?.includes('compressed') ? 'archive-outline'
                    : 'document-outline'
                  }
                  size={20}
                  color={colors.brand}
                />
              </View>
              <View style={styles.docInfo}>
                <Text style={[styles.docName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {item.documentName ?? 'File'}
                </Text>
                {item.documentMimeType ? (
                  <Text style={[styles.docMeta, { color: colors.textMuted }]} numberOfLines={1}>
                    {item.documentMimeType}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="download-outline" size={18} color={colors.textMuted} />
            </AnimatedPressable>
          ))}
        </View>
      )}
      {hasError ? (
        <AnimatedPressable
          style={styles.mediaErrorRow}
          onPress={onRetry}
          activeOpacity={0.7}
          scaleValue={0.985}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel="Retry loading newer shared media"
        >
          <Ionicons name="refresh" size={14} color={colors.textMuted} />
          <Text style={styles.mediaErrorText}>Some media may be missing — retry</Text>
        </AnimatedPressable>
      ) : null}
      {(visualMedia.length > 9 || documents.length > 5) && (
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
  canManageGroup,
  canAddMembers,
  onManagePermissions,
  isMuted,
  isTogglingMute,
  onToggleMute,
  isArchiving,
  onArchive,
  inviteLink,
  activeInviteSummary,
  isGeneratingInvite,
  onGenerateInvite,
  onCopyInvite,
  onShareInvite,
  onRevokeInvite,
  onQuickReplies,
  onManageAgents,
  connectedAgentCount,
  onReportGroup,
  isLeaving,
  onLeaveGroup,
  isDeleting,
  onDeleteForMe }: {
  canManageGroup: boolean;
  canAddMembers: boolean;
  onManagePermissions: () => void;
  isMuted: boolean;
  isTogglingMute: boolean;
  onToggleMute: () => void;
  isArchiving: boolean;
  onArchive: () => void;
  inviteLink: GroupInviteLink | null;
  activeInviteSummary: GroupInviteLink | null;
  isGeneratingInvite: boolean;
  onGenerateInvite: () => void;
  onCopyInvite: () => void;
  onShareInvite: () => void;
  onRevokeInvite: () => void;
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
  const displayedInviteSummary = inviteLink ?? activeInviteSummary;

  return (
    <View style={styles.paddedContent}>
      {canManageGroup ? (
        <ChatInfoSection title="Group controls">
          <ChatInfoRow
            icon="people-outline"
            label="Group permissions"
            subtitle="Who can edit info, send messages and add members"
            onPress={onManagePermissions}
            showChevron
          />
        </ChatInfoSection>
      ) : null}

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

      <ChatInfoSection title="Chat history">
        <ChatInfoRow
          icon="archive-outline"
          label="Archive conversation"
          subtitle="Move this chat out of your active inbox"
          onPress={onArchive}
          trailing={isArchiving ? <ActivityIndicator size="small" color={colors.brand} /> : undefined}
        />
      </ChatInfoSection>

      {canAddMembers ? <ChatInfoSection title="Invite">
        <ChatInfoRow
          icon="link-outline"
          label="Invite via link"
          subtitle={displayedInviteSummary ? 'Active link · manage below' : 'Create a shareable invite link'}
          onPress={onGenerateInvite}
          showChevron={!displayedInviteSummary}
          trailing={isGeneratingInvite ? <ActivityIndicator size="small" color={colors.brand} /> : undefined}
        />
        {displayedInviteSummary && (
          <View style={styles.inviteLinkCard}>
            <Text style={styles.inviteLinkText} numberOfLines={2}>
              {displayedInviteSummary.inviteLink || `${displayedInviteSummary.tokenPreview}...`}
            </Text>
            {inviteLink && (
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
            )}
            <Caption color={colors.textMuted} style={styles.inviteExpiry}>
              {displayedInviteSummary.isExpired
                ? 'Expired'
                : `Expires ${new Date(displayedInviteSummary.expiresAt).toLocaleDateString()}`}
              {` · ${displayedInviteSummary.useCount}/${displayedInviteSummary.maxUses || '∞'} uses`}
            </Caption>
            <Pressable
              onPress={onRevokeInvite}
              style={({ pressed }) => [styles.inviteRevokeButton, pressed && styles.inviteActionPressed]}
              accessibilityRole="button"
              accessibilityLabel="Revoke invite link"
            >
              <Text style={styles.inviteRevokeText}>Revoke link</Text>
            </Pressable>
          </View>
        )}
      </ChatInfoSection> : null}

      {canManageGroup || connectedAgentCount > 0 ? (
        <ChatInfoSection title="Advanced">
          <ChatInfoRow
            icon="extension-puzzle-outline"
            label="Automations"
            subtitle={
              connectedAgentCount > 0
                ? `${connectedAgentCount} connected`
                : 'Moderation, styling and shopping assistants'
            }
            onPress={onManageAgents}
            showChevron
          />
        </ChatInfoSection>
      ) : null}

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
    height: 200,
    position: 'relative' },
  coverImage: {
    width: '100%',
    height: '100%' },
  heroSection: {
    position: 'relative' },
  heroAvatarOverlap: {
    alignItems: 'center',
    marginTop: -46,
    marginBottom: Space.xs },
  heroAvatarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Space.lg,
    paddingBottom: Space.xs },
  heroAvatarWrap: {
    position: 'relative' },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: colors.background },
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
    fontFamily: FontFamily.bold,
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    letterSpacing: TypographyV2.screenTitle.letterSpacing },
  description: {
    maxWidth: '84%',
    color: colors.textSecondary,
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.size + 6,
    textAlign: 'center',
    marginTop: Space.xs },
  identityMeta: {
    color: colors.textMuted,
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.meta.size,
    marginTop: Space.xs / 2 + 1 },
  quickActionDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.md,
    marginTop: Space.sm,
    marginBottom: Space.xs,
    paddingHorizontal: Space.md },
  quickActionItem: {
    alignItems: 'center',
    gap: 5,
    minWidth: 58 },
  // Quick actions: transparent 44pt targets with 22pt glyphs (Design.md
  // control anatomy — containment is not the hit target). Persistent fill is
  // reserved for the muted state, where the fill IS the status signal.
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center' },
  quickActionIconActive: {
    backgroundColor: colors.brandSubtle },
  quickActionLabel: {
    fontSize: TypographyV2.meta.size - 1,
    fontFamily: FontFamily.medium,
    color: colors.textSecondary },
  quickActionLabelActive: {
    color: colors.brand },
  tabSegmentContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: Radius.full,
    padding: 3,
    marginHorizontal: Space.md,
    marginTop: Space.sm,
    marginBottom: Space.xs },
  tabPill: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full },
  tabPillActive: {
    backgroundColor: colors.background,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2 },
  tabLabel: {
    color: colors.textSecondary,
    fontFamily: FontFamily.medium,
    fontSize: TypographyV2.meta.size },
  tabLabelActive: {
    color: colors.textPrimary,
    fontFamily: FontFamily.bold },
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
  // Skeleton tile — same geometry as a real tile (aspectRatio 1, same radius),
  // so the loading → ready transition causes zero layout shift.
  mediaTileSkeleton: {
    backgroundColor: colors.surfaceAlt },
  mediaRetryButton: {
    minHeight: 36,
    paddingHorizontal: Space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: Stroke.standard,
    borderColor: colors.border,
    marginTop: Space.xs },
  mediaRetryText: {
    color: colors.brand,
    fontFamily: FontFamily.semibold,
    fontSize: TypographyV2.meta.size },
  mediaErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    minHeight: Control.hit,
    paddingHorizontal: Space.sm },
  mediaErrorText: {
    color: colors.textMuted,
    fontFamily: FontFamily.regular,
    fontSize: TypographyV2.meta.size },
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
  // ── Document list in media tab ──
  docListWrap: {
    marginTop: Space.lg,
    gap: Space.xs },
  docListHeader: {
    marginBottom: Space.xs },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border },
  docIconWrap: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  docInfo: {
    flex: 1,
    gap: 2 },
  docName: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    lineHeight: TypographyV2.body.lineHeight },
  docMeta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily },
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
    fontSize: TypographyV2.meta.size },
  inviteRevokeButton: {
    alignSelf: 'flex-start',
    minHeight: Control.hit,
    justifyContent: 'center',
    paddingHorizontal: Space.sm },
  inviteRevokeText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypeStyles.bodyEmphasis.fontFamily,
    color: colors.danger } });
}
