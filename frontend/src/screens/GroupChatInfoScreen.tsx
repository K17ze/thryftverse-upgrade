import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppIcon } from '../components/common/AppIcon';
import { FlagshipHeader, FlagshipScreen, FlagshipFormSection } from '../components/flagship';
import { Caption } from '../components/ui/Text';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { useAppTheme } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { useConnectivity } from '../hooks/useConnectivity';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { Control, Space } from '../theme/designTokens';
import {
  deleteConversationOnApi,
  createGroupInviteLinkOnApi,
  fetchGroupInviteLinksOnApi,
  revokeGroupInviteLinkOnApi,
  fetchConversationMediaFromApi,
  fetchGroupSettingsFromApi,
  updateConversationOnApi,
  promoteConversationMemberOnApi,
  demoteConversationMemberOnApi,
  removeConversationMemberOnApi,
  type GroupInviteLink,
  type GroupSettingsCapabilities,
} from '../services/chatApi';
import { parseApiError } from '../lib/apiClient';
import { useChatGroupMembershipEvent } from '../services/realtimeClient';
import { GroupMediaSourceSheet, type GroupMediaSource } from '../components/chat/GroupMediaSourceSheet';
import { useGroupMediaUpload } from '../hooks/useGroupMediaUpload';
import { getAestheticPresets } from '../constants/groupAesthetics';
import { useChatPreferences } from '../hooks/useChatPreferences';
import { CHAT_THEMES, type ChatTheme } from '../services/chatPreferencesApi';
import { GroupInfoHero } from '../components/groupchat/GroupInfoHero';
import { GroupInfoRow } from '../components/groupchat/GroupInfoRow';
import { GroupQuickActions } from '../components/groupchat/GroupQuickActions';
import { GroupMediaStrip, type GroupMediaStripItem } from '../components/groupchat/GroupMediaStrip';
import { GroupMembersDirectory } from '../components/groupchat/GroupMembersDirectory';
import { GroupMemberActionsSheet, type GroupMemberActionsTarget } from '../components/groupchat/GroupMemberActionsSheet';
import { GroupMemberActivitySheet } from '../components/groupchat/GroupMemberActivitySheet';
import { GroupPrivacySheet } from '../components/groupchat/GroupPrivacySheet';
import { GroupThemeSheet } from '../components/groupchat/GroupThemeSheet';
import { uploadRemoteGroupPreset } from '../components/groupchat/groupPresetUpload';

type Props = NativeStackScreenProps<RootStackParamList, 'GroupChatInfo'>;

/** Safely format an invite-link expiry date. Returns '—' for invalid/empty values. */
function formatInviteDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

/** Format creation date */
function formatCreationDate(iso?: string | null): string {
  if (!iso) return 'recently';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'recently';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function GroupChatInfoScreen({ navigation, route }: Props) {
  const { conversationId } = route.params ?? {};
  const { colors } = useAppTheme();
  const { show } = useToast();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const { isOffline } = useConnectivity();
  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const replaceConversationMessages = useStore((state) => state.replaceConversationMessages);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const toggleMuted = useStore((state) => state.toggleMutedConversation);
  const togglePinned = useStore((state) => state.toggleConversationPinned);
  const reconcileGroupMembershipEvent = useStore((state) => state.reconcileGroupMembershipEvent);
  const preferences = useChatPreferences(conversationId);
  const [themeSaveError, setThemeSaveError] = useState<string | null>(null);
  const [isTogglingPin, setIsTogglingPin] = useState(false);
  const mutePending = useRef(false);
  const pinPending = useRef(false);
  const themePending = useRef(false);

  // Core Actions state
  const [isLeaving, setIsLeaving] = useState(false);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const [inviteLink, setInviteLink] = useState<GroupInviteLink | null>(null);
  const [activeInviteSummary, setActiveInviteSummary] = useState<GroupInviteLink | null>(null);
  const displayedInviteSummary = inviteLink ?? activeInviteSummary;

  const [isPrivacySheetVisible, setIsPrivacySheetVisible] = useState(false);
  const [isThemeSheetVisible, setIsThemeSheetVisible] = useState(false);
  // Drive the picker selection from the persisted query data, not local state.
  const selectedTheme = preferences.query.data?.theme ?? 'Default';
  const [isActivitySheetVisible, setIsActivitySheetVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<GroupMemberActionsTarget | null>(null);

  useChatGroupMembershipEvent(conversationId, (event) => {
    const removedUserId =
      event.type === 'chat.member.removed'
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
    currentUser?.id &&
      (conversation?.ownerId === currentUser.id || currentRole === 'owner' || currentRole === 'admin')
  );
  const [groupCapabilities, setGroupCapabilities] = useState<GroupSettingsCapabilities | null>(null);
  const canEditGroupInfo = groupCapabilities?.canEditGroupInfo ?? isGroupManager;
  const canAddMembers = groupCapabilities?.canAddMembers ?? isGroupManager;

  const [mediaSheet, setMediaSheet] = useState<{ visible: boolean; target: 'avatar' | 'cover' }>({
    visible: false,
    target: 'avatar',
  });

  const mediaUpload = useGroupMediaUpload(
    conversation?.avatar ?? null,
    conversation?.coverPhoto ?? null
  );

  // Optimistic preview while a curated preset is being downloaded + uploaded.
  const [presetPreview, setPresetPreview] = useState<{
    target: 'avatar' | 'cover';
    uri: string;
  } | null>(null);

  const displayCoverPhoto =
    presetPreview?.target === 'cover'
      ? presetPreview.uri
      : mediaUpload.coverDisplayUri ?? conversation?.coverPhoto;
  const displayAvatar =
    presetPreview?.target === 'avatar'
      ? presetPreview.uri
      : mediaUpload.avatarDisplayUri ?? conversation?.avatar;

  const handleMediaSourceSelect = useCallback(
    async (source: GroupMediaSource) => {
      const target = mediaSheet.target;
      setMediaSheet((s) => ({ ...s, visible: false }));
      if (source === 'camera' || source === 'gallery') {
        if (target === 'avatar') {
          await mediaUpload.pickAvatar(source);
        } else {
          await mediaUpload.pickCover(source);
        }
      }
    },
    [mediaSheet.target, mediaUpload]
  );

  /**
   * A curated preset is a remote URL — the conversation API requires an
   * upload receipt (`finalizationId`) for avatar/cover strings, so the
   * preset is downloaded and pushed through the standard upload pipeline
   * before it is persisted. Preview stays optimistic; the store is only
   * written after the server confirms.
   */
  const handleSelectPreset = useCallback(
    async (url: string) => {
      const target = mediaSheet.target;
      setMediaSheet((s) => ({ ...s, visible: false }));
      if (!conversation) return;
      setPresetPreview({ target, uri: url });
      try {
        const uploaded = await uploadRemoteGroupPreset(url, target);
        const patch =
          target === 'avatar'
            ? { avatar: uploaded.publicUrl, avatarFinalizationId: uploaded.finalizationId }
            : {
                coverPhoto: uploaded.publicUrl,
                coverPhotoFinalizationId: uploaded.finalizationId,
              };
        await updateConversationOnApi(conversationId, patch);
        upsertConversation({
          ...conversation,
          ...(target === 'avatar'
            ? { avatar: uploaded.publicUrl }
            : { coverPhoto: uploaded.publicUrl }),
        });
        show(target === 'avatar' ? 'Group photo updated' : 'Cover banner updated', 'success');
      } catch (err) {
        show(parseApiError(err, 'Could not update photo').message, 'error');
      } finally {
        setPresetPreview(null);
      }
    },
    [conversation, conversationId, mediaSheet.target, upsertConversation, show]
  );

  const handleRemoveMedia = useCallback(async () => {
    const target = mediaSheet.target;
    setMediaSheet((s) => ({ ...s, visible: false }));
    try {
      if (target === 'avatar') {
        mediaUpload.removeAvatar();
        if (conversation) {
          upsertConversation({ ...conversation, avatar: undefined });
        }
        await updateConversationOnApi(conversationId, { avatar: null });
        show('Group photo removed', 'info');
      } else {
        mediaUpload.removeCover();
        if (conversation) {
          upsertConversation({ ...conversation, coverPhoto: undefined });
        }
        await updateConversationOnApi(conversationId, { coverPhoto: null });
        show('Cover banner removed', 'info');
      }
    } catch (err) {
      if (conversation) {
        upsertConversation(
          target === 'avatar'
            ? { ...conversation, avatar: conversation.avatar }
            : { ...conversation, coverPhoto: conversation.coverPhoto }
        );
      }
      show(parseApiError(err, 'Could not remove photo').message, 'error');
    }
  }, [conversation, conversationId, mediaSheet.target, mediaUpload, upsertConversation, show]);

  // Sync confirmed uploads to API & store
  useEffect(() => {
    if (mediaUpload.avatar.status === 'confirmed' && mediaUpload.avatar.confirmedRemote) {
      const prevAvatar = conversation?.avatar;
      updateConversationOnApi(conversationId, {
        avatar: mediaUpload.avatar.confirmedRemote,
        avatarFinalizationId: mediaUpload.avatar.finalizationId ?? undefined,
      })
        .then(() => {
          if (conversation) {
            useStore.getState().upsertConversation({
              ...conversation,
              avatar: mediaUpload.avatar.confirmedRemote ?? undefined,
            });
          }
          show('Group photo updated', 'success');
        })
        .catch((err) => {
          mediaUpload.removeAvatar();
          if (conversation) {
            useStore.getState().upsertConversation({ ...conversation, avatar: prevAvatar });
          }
          show(parseApiError(err, 'Could not save photo').message, 'error');
        });
    }
  }, [mediaUpload.avatar.status, mediaUpload.avatar.confirmedRemote]);

  useEffect(() => {
    if (mediaUpload.cover.status === 'confirmed' && mediaUpload.cover.confirmedRemote) {
      const prevCover = conversation?.coverPhoto;
      updateConversationOnApi(conversationId, {
        coverPhoto: mediaUpload.cover.confirmedRemote,
        coverPhotoFinalizationId: mediaUpload.cover.finalizationId ?? undefined,
      })
        .then(() => {
          if (conversation) {
            useStore.getState().upsertConversation({
              ...conversation,
              coverPhoto: mediaUpload.cover.confirmedRemote ?? undefined,
            });
          }
          show('Cover banner updated', 'success');
        })
        .catch((err) => {
          mediaUpload.removeCover();
          if (conversation) {
            useStore.getState().upsertConversation({ ...conversation, coverPhoto: prevCover });
          }
          show(parseApiError(err, 'Could not save cover banner').message, 'error');
        });
    }
  }, [mediaUpload.cover.status, mediaUpload.cover.confirmedRemote]);

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
      .then((links) =>
        setActiveInviteSummary(links.find((link) => !link.isExpired && !link.isRevoked) ?? null)
      )
      .catch(() => setActiveInviteSummary(null));
  }, [canAddMembers, conversationId]);

  const memberProfiles = useMemo(
    () => conversation?.participantProfiles ?? [],
    [conversation?.participantProfiles]
  );

  const [remoteMedia, setRemoteMedia] = useState<
    Array<{
      id: string;
      mediaUri: string;
      mediaType: 'image' | 'video' | 'document';
      senderUserId: string | null;
      createdAt: string;
      documentName?: string;
      documentMimeType?: string;
    }>
  >([]);
  const [mediaState, setMediaState] = useState<'idle' | 'loading' | 'ready' | 'error'>('loading');

  const loadMedia = useCallback(() => {
    setMediaState('loading');
    fetchConversationMediaFromApi(conversationId, { limit: 60 })
      .then((items) => {
        setRemoteMedia(items);
        setMediaState('ready');
      })
      .catch(() => {
        setMediaState('error');
      });
  }, [conversationId]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const mediaItems = useMemo(() => {
    if (remoteMedia.length > 0) return remoteMedia;
    const msgs = conversation?.messages ?? [];
    return msgs.filter((m) => m.mediaUri && !m.isSystem).slice(-30).reverse();
  }, [remoteMedia, conversation?.messages]);

  const visualMediaItems: GroupMediaStripItem[] = useMemo(() => {
    return mediaItems
      .filter(
        (m): m is typeof m & { mediaUri: string } =>
          Boolean(m.mediaUri) && m.mediaType !== 'document'
      )
      .slice(0, 8)
      .map((m) => ({
        id: m.id,
        uri: m.mediaUri,
        mediaType: m.mediaType === 'video' ? 'video' : 'image',
      }));
  }, [mediaItems]);

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

  const avatarMembers = memberProfiles.map((member) => ({
    id: member.id,
    displayName: member.displayName ?? member.username,
    avatar: member.avatar ?? null,
  }));

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
      },
    });
  };

  const clearChat = () => {
    setConfirmSheet({
      visible: true,
      title: 'Clear chat messages?',
      message: 'Messages in this chat will be deleted from your device.',
      confirmLabel: 'Clear chat',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.medium();
        try {
          await deleteConversationOnApi(conversationId, 'me');
          replaceConversationMessages(conversationId, []);
          show('Chat history cleared', 'info');
        } catch {
          show('Could not clear chat messages.', 'error');
        }
      },
    });
  };

  const toggleMute = async () => {
    if (mutePending.current) return;
    mutePending.current = true;
    haptic.light();
    setIsTogglingMute(true);
    try {
      await toggleMuted(conversationId);
      show(isMuted ? 'Conversation unmuted' : 'Conversation muted', 'success');
    } catch (err) {
      show(parseApiError(err, 'Could not update mute status. Try again.').message, 'error');
    } finally {
      mutePending.current = false;
      setIsTogglingMute(false);
    }
  };

  const togglePin = async () => {
    if (pinPending.current) return;
    pinPending.current = true;
    setIsTogglingPin(true);
    try {
      await togglePinned(conversationId);
      show(conversation.isPinned ? 'Group unpinned' : 'Group pinned to your inbox', 'success');
    } catch (error) {
      show(parseApiError(error, 'Could not confirm pin status. Check your inbox and retry.').message, 'error');
    } finally {
      pinPending.current = false;
      setIsTogglingPin(false);
    }
  };

  const selectTheme = async (theme: ChatTheme) => {
    if (themePending.current) return;
    themePending.current = true;
    setThemeSaveError(null);
    try {
      await preferences.mutation.mutateAsync(theme);
      setIsThemeSheetVisible(false);
      show('Chat theme saved', 'success');
    } catch {
      setThemeSaveError('Could not confirm the change. Check the saved theme or select it again to retry.');
    } finally {
      themePending.current = false;
    }
  };

  const handleGenerateInviteLink = async () => {
    haptic.light();
    setIsGeneratingInvite(true);
    try {
      const link = await createGroupInviteLinkOnApi(conversationId, {
        expiresInHours: 72,
      });
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
    const link = inviteLink ?? activeInviteSummary;
    if (!link) return;
    haptic.light();
    try {
      await Clipboard.setStringAsync(link.inviteLink);
      show('Invite link copied', 'success');
    } catch {
      show('Could not copy link. Long-press to copy manually.', 'error');
    }
  };

  const handleShareInviteLink = async () => {
    const link = inviteLink ?? activeInviteSummary;
    if (!link) return;
    haptic.light();
    try {
      await Share.share({ message: link.inviteLink });
    } catch {
      // user cancelled
    }
  };

  const handleQuickShare = async () => {
    haptic.light();
    try {
      if (displayedInviteSummary) {
        await Share.share({
          message: `Join ${conversation.title || 'our group'} on ThryftVerse: ${displayedInviteSummary.inviteLink}`,
        });
      } else {
        await Share.share({ message: `Join ${conversation.title || 'our group'} on ThryftVerse!` });
      }
    } catch {
      // user cancelled
    }
  };

  const memberLabel = (userId: string): string => {
    const profile = memberProfiles.find((p) => p.id === userId);
    return profile ? `@${profile.username}` : 'A member';
  };

  const applyMemberRoles = (result: { memberRoles: Record<string, string> }) => {
    upsertConversation({
      ...conversation,
      memberRoles: Object.fromEntries(
        Object.entries(result.memberRoles).filter(
          (entry): entry is [string, 'owner' | 'admin' | 'member'] =>
            entry[1] === 'owner' || entry[1] === 'admin' || entry[1] === 'member',
        ),
      ) as Record<string, 'owner' | 'admin' | 'member'>,
    });
  };

  const handleToggleMemberAdmin = async (member: GroupMemberActionsTarget) => {
    const name = member.displayName ?? member.username;
    const wasAdmin = member.role === 'admin';
    setSelectedMember(null);
    try {
      const result = wasAdmin
        ? await demoteConversationMemberOnApi(conversationId, member.id)
        : await promoteConversationMemberOnApi(conversationId, member.id);
      applyMemberRoles(result);
      show(wasAdmin ? `${name} is now a member.` : `${name} is now an admin.`, wasAdmin ? 'info' : 'success');
    } catch (err) {
      show(parseApiError(err, 'Could not update admin status.').message, 'error');
    }
  };

  const handleRemoveMember = (member: GroupMemberActionsTarget) => {
    const name = member.displayName ?? member.username;
    setSelectedMember(null);
    setConfirmSheet({
      visible: true,
      title: `Remove ${name}?`,
      message: `They will be removed from ${conversation.title || 'this group'} on all devices.`,
      confirmLabel: 'Remove member',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        try {
          const result = await removeConversationMemberOnApi(conversationId, member.id);
          upsertConversation({
            ...conversation,
            participantIds: result.participantIds,
          });
          show(`Removed ${name} from group`, 'info');
        } catch (err) {
          show(parseApiError(err, 'Could not remove member. Try again.').message, 'error');
        }
      },
    });
  };

  return (
    <FlagshipScreen
      header={
        <FlagshipHeader
          title="Group details"
          onBack={() => navigation.goBack()}
          rightAction={
            <AnimatedPressable
              onPress={() => {
                if (canEditGroupInfo) {
                  navigation.navigate('EditGroup', { conversationId });
                } else {
                  handleQuickShare();
                }
              }}
              style={styles.headerAction}
              activeOpacity={0.68}
              scaleValue={0.94}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={canEditGroupInfo ? 'Edit group' : 'Share group'}
            >
              <AppIcon
                name={canEditGroupInfo ? 'edit' : 'more'}
                size="lg"
                color="textPrimary"
                accessible={false}
              />
            </AnimatedPressable>
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
          onEditCover={() => setMediaSheet({ visible: true, target: 'cover' })}
          onEditAvatar={() => setMediaSheet({ visible: true, target: 'avatar' })}
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
                  void handleQuickShare();
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
        <FlagshipFormSection title="Privacy & transparency" variant="flat">
          <GroupInfoRow
            icon="shield"
            label="Message storage & security"
            subtitle="Transmitted securely over encrypted channels"
            onPress={() => setIsPrivacySheetVisible(true)}
            isLast
          />
        </FlagshipFormSection>

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
            inviteSummary={
              displayedInviteSummary
                ? {
                    url: displayedInviteSummary.inviteLink,
                    metaLabel: `Expires ${formatInviteDate(displayedInviteSummary.expiresAt)} · ${displayedInviteSummary.useCount} uses`,
                  }
                : null
            }
            inviteBusy={isGeneratingInvite}
            onAddMembers={() => navigation.navigate('GroupMembers', { conversationId })}
            onInvitePrimary={
              displayedInviteSummary ? handleCopyInviteLink : handleGenerateInviteLink
            }
            onCopyInvite={handleCopyInviteLink}
            onShareInvite={handleShareInviteLink}
            onRevokeInvite={handleRevokeInviteLink}
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
          <FlagshipFormSection title="Group controls" variant="flat">
            <GroupInfoRow
              icon="settings"
              label="Group permissions"
              subtitle="Who can edit info, send messages and add members"
              onPress={() => navigation.navigate('GroupPermissions', { conversationId })}
            />
            <GroupInfoRow
              icon="sparkles"
              label="Automations & AI agents"
              subtitle={
                connectedAgentCount > 0
                  ? `${connectedAgentCount} agent connected`
                  : 'Shopping, styling & moderation assistants'
              }
              onPress={() => navigation.navigate('GroupBotManagement', { conversationId })}
              isLast
            />
          </FlagshipFormSection>
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
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'danger'}
        onConfirm={confirmSheet.onConfirm}
      />

      <GroupMediaSourceSheet
        visible={mediaSheet.visible}
        onClose={() => setMediaSheet((prev) => ({ ...prev, visible: false }))}
        onSelect={handleMediaSourceSelect}
        title={mediaSheet.target === 'avatar' ? 'Group profile photo' : 'Cover banner'}
        presets={getAestheticPresets(mediaSheet.target)}
        onSelectPreset={handleSelectPreset}
        canRemove={Boolean(mediaSheet.target === 'avatar' ? displayAvatar : displayCoverPhoto)}
        onRemove={handleRemoveMedia}
      />

      <GroupPrivacySheet
        visible={isPrivacySheetVisible}
        onDismiss={() => setIsPrivacySheetVisible(false)}
      />

      <GroupThemeSheet
        visible={isThemeSheetVisible}
        onDismiss={() => setIsThemeSheetVisible(false)}
        themes={CHAT_THEMES}
        selected={selectedTheme}
        error={themeSaveError}
        onSelect={(theme) => {
          haptic.selection();
          void selectTheme(theme);
        }}
      />

      <GroupMemberActionsSheet
        member={selectedMember}
        onDismiss={() => setSelectedMember(null)}
        canManageMembers={isGroupManager}
        isSelf={selectedMember?.id === currentUser?.id}
        adminActionLabel={
          selectedMember?.role === 'admin' ? 'Dismiss as admin' : 'Make group admin'
        }
        removeLabel="Remove from group"
        messageLabel={
          selectedMember ? `Message @${selectedMember.username}` : 'Message member'
        }
        onViewProfile={(userId) => {
          setSelectedMember(null);
          navigation.navigate('UserProfile', { userId });
        }}
        onMessage={(member) => {
          setSelectedMember(null);
          navigation.navigate('NewMessage', {
            preselectedUserId: member.id,
            preselectedDisplayName: member.displayName ?? member.username,
          });
        }}
        onToggleAdmin={handleToggleMemberAdmin}
        onRemove={handleRemoveMember}
      />

      <GroupMemberActivitySheet
        visible={isActivitySheetVisible}
        onDismiss={() => setIsActivitySheetVisible(false)}
        conversationId={conversationId}
        createdAt={conversation.createdAt}
        memberLabel={memberLabel}
        memberRole={(userId) => conversation.memberRoles?.[userId]}
        title="Member Activity"
        subtitle="Join and role events for this group."
      />
    </FlagshipScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Space.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAction: {
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  directorySection: {
    marginBottom: Space.lg,
  },
  provenanceFootnote: {
    alignItems: 'center',
    paddingVertical: Space.md,
    paddingHorizontal: Space.md,
  },
});
