import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Pressable,
  Share,
  Linking,
  Switch,
  TextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from '../components/CachedImage';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { FlagshipHeader, FlagshipScreen } from '../components/flagship';
import { Caption } from '../components/ui/Text';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { BottomSheet } from '../components/BottomSheet';
import { AppButton } from '../components/ui/AppButton';
import { useAppTheme, type ThemeColors } from '../theme/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHaptic } from '../hooks/useHaptic';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { Control, Radius, Space, Stroke, FontFamily } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
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
import { GroupAvatarMosaic } from '../components/chat/GroupAvatarMosaic';
import { useChatGroupMembershipEvent } from '../services/realtimeClient';
import { GroupMediaSourceSheet, type GroupMediaSource } from '../components/chat/GroupMediaSourceSheet';
import { useGroupMediaUpload } from '../hooks/useGroupMediaUpload';
import { getAestheticPresets } from '../constants/groupAesthetics';

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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();
  const insets = useSafeAreaInsets();
  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const replaceConversationMessages = useStore((state) => state.replaceConversationMessages);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const mutedIds = useStore((state) => state.mutedConversationIds);
  const toggleMuted = useStore((state) => state.toggleMutedConversation);

  // Core Actions state
  const [isLeaving, setIsLeaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isTogglingMute, setIsTogglingMute] = useState(false);
  const [inviteLink, setInviteLink] = useState<GroupInviteLink | null>(null);
  const [activeInviteSummary, setActiveInviteSummary] = useState<GroupInviteLink | null>(null);
  const displayedInviteSummary = inviteLink ?? activeInviteSummary;
  const reconcileGroupMembershipEvent = useStore((state) => state.reconcileGroupMembershipEvent);

  // Parity feature state (WhatsApp benchmark)
  const [isChatLocked, setIsChatLocked] = useState(false);
  const [disappearingDuration, setDisappearingDuration] = useState<'off' | '24h' | '7d' | '90d'>('off');
  const [isDisappearingSheetVisible, setIsDisappearingSheetVisible] = useState(false);
  const [isEncryptionSheetVisible, setIsEncryptionSheetVisible] = useState(false);
  const [isThemeSheetVisible, setIsThemeSheetVisible] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState('Default');
  const [isMemberSearchOpen, setIsMemberSearchOpen] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [isMemberSearchFocused, setIsMemberSearchFocused] = useState(false);
  const [isFavourited, setIsFavourited] = useState(false);
  const [isMemberChangesSheetVisible, setIsMemberChangesSheetVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<{
    id: string;
    username: string;
    displayName?: string | null;
    avatar?: string | null;
    role?: 'owner' | 'admin' | 'member';
  } | null>(null);

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

  const displayCoverPhoto = mediaUpload.coverDisplayUri ?? conversation?.coverPhoto;
  const displayAvatar = mediaUpload.avatarDisplayUri ?? conversation?.avatar;

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

  const handleSelectPreset = useCallback(
    async (url: string) => {
      const target = mediaSheet.target;
      setMediaSheet((s) => ({ ...s, visible: false }));
      try {
        if (target === 'avatar') {
          if (conversation) {
            useStore.getState().upsertConversation({ ...conversation, avatar: url });
          }
          await updateConversationOnApi(conversationId, { avatar: url });
          show('Group photo updated', 'success');
        } else {
          if (conversation) {
            useStore.getState().upsertConversation({ ...conversation, coverPhoto: url });
          }
          await updateConversationOnApi(conversationId, { coverPhoto: url });
          show('Cover banner updated', 'success');
        }
      } catch (err) {
        if (target === 'avatar') {
          if (conversation) {
            useStore.getState().upsertConversation({ ...conversation, avatar: conversation.avatar });
          }
        } else {
          if (conversation) {
            useStore.getState().upsertConversation({ ...conversation, coverPhoto: conversation.coverPhoto });
          }
        }
        show(parseApiError(err, 'Could not update photo').message, 'error');
      }
    },
    [conversation, conversationId, mediaSheet.target, mediaUpload, show]
  );

  const handleRemoveMedia = useCallback(async () => {
    const target = mediaSheet.target;
    setMediaSheet((s) => ({ ...s, visible: false }));
    try {
      if (target === 'avatar') {
        mediaUpload.removeAvatar();
        if (conversation) {
          useStore.getState().upsertConversation({ ...conversation, avatar: undefined });
        }
        await updateConversationOnApi(conversationId, { avatar: null });
        show('Group photo removed', 'info');
      } else {
        mediaUpload.removeCover();
        if (conversation) {
          useStore.getState().upsertConversation({ ...conversation, coverPhoto: undefined });
        }
        await updateConversationOnApi(conversationId, { coverPhoto: null });
        show('Cover banner removed', 'info');
      }
    } catch (err) {
      if (target === 'avatar') {
        mediaUpload.removeAvatar();
        if (conversation) {
          useStore.getState().upsertConversation({ ...conversation, avatar: conversation.avatar });
        }
      } else {
        mediaUpload.removeCover();
        if (conversation) {
          useStore.getState().upsertConversation({ ...conversation, coverPhoto: conversation.coverPhoto });
        }
      }
      show(parseApiError(err, 'Could not remove photo').message, 'error');
    }
  }, [conversation, conversationId, mediaSheet.target, mediaUpload, show]);

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

  const recentMedia = useMemo(() => {
    const msgs = conversation?.messages ?? [];
    return msgs
      .filter((m) => m.mediaUri && !m.isSystem)
      .slice(-30)
      .reverse();
  }, [conversation?.messages]);

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

  // Load shared media immediately for the prominent preview strip
  useEffect(() => {
    fetchConversationMediaFromApi(conversationId, { limit: 60 })
      .then((items) => {
        setRemoteMedia(items);
        setMediaState('ready');
      })
      .catch(() => {
        setMediaState('error');
      });
  }, [conversationId]);

  const mediaItems = useMemo(() => {
    if (remoteMedia.length > 0) return remoteMedia;
    return recentMedia;
  }, [remoteMedia, recentMedia]);

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
  const coverPhoto = displayCoverPhoto;
  const groupAvatar = displayAvatar;
  const avatarMembers = memberProfiles.map((member) => ({
    id: member.id,
    displayName: member.displayName ?? member.username,
    avatar: member.avatar,
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
      },
    });
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

  // Filter members by query
  const filteredMembers = useMemo(() => {
    if (!memberSearchQuery.trim()) return memberProfiles;
    const q = memberSearchQuery.toLowerCase();
    return memberProfiles.filter(
      (m) =>
        m.username.toLowerCase().includes(q) ||
        (m.displayName ?? '').toLowerCase().includes(q)
    );
  }, [memberProfiles, memberSearchQuery]);

  const displayedMembers = isMemberSearchOpen
    ? filteredMembers
    : filteredMembers.slice(0, 5);

  const visualMediaItems = useMemo(() => {
    return mediaItems
      .filter((m): m is typeof m & { mediaUri: string } => Boolean(m.mediaUri) && m.mediaType !== 'document')
      .slice(0, 8);
  }, [mediaItems]);

  const disappearingLabel =
    disappearingDuration === 'off'
      ? 'Off'
      : disappearingDuration === '24h'
      ? '24 hours'
      : disappearingDuration === '7d'
      ? '7 days'
      : '90 days';

  const roleLabel = (role?: 'owner' | 'admin' | 'member'): string | null => {
    if (role === 'owner') return 'Owner';
    if (role === 'admin') return 'Admin';
    return null;
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
              <Ionicons
                name={canEditGroupInfo ? 'create-outline' : 'ellipsis-horizontal'}
                size={22}
                color={colors.textPrimary}
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
        {/* ── 1. Hero Identity Section ── */}
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
                  onPress={() => setMediaSheet({ visible: true, target: 'cover' })}
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
                  size={96}
                />
                {canEditGroupInfo && (
                  <AnimatedPressable
                    style={styles.avatarEditBadge}
                    onPress={() => setMediaSheet({ visible: true, target: 'avatar' })}
                    activeOpacity={0.7}
                    scaleValue={0.94}
                    hapticFeedback="light"
                    accessibilityRole="button"
                    accessibilityLabel="Change group photo"
                  >
                    <Ionicons name="camera" size={16} color={colors.textInverse} />
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
                  onPress={() => setMediaSheet({ visible: true, target: 'avatar' })}
                  activeOpacity={0.7}
                  scaleValue={0.94}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel="Add group photo"
                >
                  <Ionicons name="camera" size={16} color={colors.textInverse} />
                </AnimatedPressable>
              )}
            </View>
            {canEditGroupInfo && (
              <AnimatedPressable
                style={styles.addCoverPill}
                onPress={() => setMediaSheet({ visible: true, target: 'cover' })}
                activeOpacity={0.7}
                scaleValue={0.97}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Add cover banner"
              >
                <Ionicons name="image-outline" size={14} color={colors.brand} />
                <Text style={styles.addCoverPillText}>Add cover banner</Text>
              </AnimatedPressable>
            )}
          </View>
        )}

        <View style={styles.identity}>
          <Text style={styles.groupName} numberOfLines={1}>
            {conversation.title || 'Group chat'}
          </Text>

          <Text style={styles.identityMeta}>
            Group · <Text style={{ color: colors.brand, fontFamily: FontFamily.bold }}>{memberCount} members</Text>
            {connectedAgentCount > 0 ? ` · ${connectedAgentCount} agent connected` : ''}
          </Text>

          {description ? (
            <Pressable
              onPress={() => {
                if (canEditGroupInfo) navigation.navigate('EditGroup', { conversationId });
              }}
              style={styles.descriptionWrap}
              accessibilityRole="button"
              accessibilityLabel="Group description"
              hitSlop={8}
            >
              <Text style={styles.descriptionText} numberOfLines={3}>
                {description}
              </Text>
              {canEditGroupInfo && (
                <Ionicons name="pencil-outline" size={14} color={colors.textMuted} style={styles.descPencil} />
              )}
            </Pressable>
          ) : canEditGroupInfo ? (
            <Pressable
              onPress={() => navigation.navigate('EditGroup', { conversationId })}
              style={styles.addDescriptionPill}
              accessibilityRole="button"
              accessibilityLabel="Add group description"
              hitSlop={8}
            >
              <Ionicons name="add" size={14} color={colors.brand} />
              <Text style={styles.addDescriptionText}>Add group description</Text>
            </Pressable>
          ) : null}
        </View>

        {/* ── 2. WhatsApp 4-Column Quick Action Dock ── */}
        <View style={styles.quickActionDock}>
          {/* Call */}
          <AnimatedPressable
            style={styles.quickActionButton}
            onPress={() => show('Voice & video room joining…', 'info')}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Call group"
          >
            <View style={styles.quickActionIconWrap}>
              <Ionicons name="call-outline" size={20} color={colors.brand} />
            </View>
            <Text style={styles.quickActionLabel}>Call</Text>
          </AnimatedPressable>

          {/* Search In Chat */}
          <AnimatedPressable
            style={styles.quickActionButton}
            onPress={() => {
              navigation.navigate('GroupChat', {
                groupId: conversationId,
                groupName: conversation.title ?? 'Group',
                initialSearch: true,
              });
            }}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel="Search messages in conversation"
          >
            <View style={styles.quickActionIconWrap}>
              <Ionicons name="search-outline" size={20} color={colors.textPrimary} />
            </View>
            <Text style={styles.quickActionLabel}>Search</Text>
          </AnimatedPressable>

          {/* Add Members */}
          <AnimatedPressable
            style={styles.quickActionButton}
            onPress={() => {
              if (canAddMembers) {
                navigation.navigate('GroupMembers', { conversationId });
              } else {
                handleQuickShare();
              }
            }}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={canAddMembers ? 'Add members' : 'Invite friends'}
          >
            <View style={styles.quickActionIconWrap}>
              <Ionicons
                name={canAddMembers ? 'person-add-outline' : 'link-outline'}
                size={20}
                color={colors.textPrimary}
              />
            </View>
            <Text style={styles.quickActionLabel}>{canAddMembers ? 'Add' : 'Invite'}</Text>
          </AnimatedPressable>

          {/* Mute */}
          <AnimatedPressable
            style={[styles.quickActionButton, isMuted && styles.quickActionButtonActive]}
            onPress={toggleMute}
            activeOpacity={0.7}
            scaleValue={0.95}
            hapticFeedback="light"
            accessibilityRole="button"
            accessibilityLabel={isMuted ? 'Unmute group' : 'Mute group'}
          >
            <View style={styles.quickActionIconWrap}>
              {isTogglingMute ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <Ionicons
                  name={isMuted ? 'notifications-off' : 'notifications-outline'}
                  size={20}
                  color={isMuted ? colors.brand : colors.textPrimary}
                />
              )}
            </View>
            <Text style={[styles.quickActionLabel, isMuted && { color: colors.brand }]}>
              {isMuted ? 'Muted' : 'Mute'}
            </Text>
          </AnimatedPressable>
        </View>

        {/* ── 3. Grouped Card: Media, Links and Docs ── */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeaderLabel}>Media</Text>
          <View style={styles.groupedCard}>
            <GroupedRow
              icon="images-outline"
              label="Media, links and docs"
              detail={mediaItems.length > 0 ? `${mediaItems.length}` : 'None'}
              onPress={() => navigation.navigate('SharedConversationMedia', { conversationId })}
              isLast={visualMediaItems.length === 0}
            />

            {/* Horizontal media preview strip */}
            {mediaState === 'loading' ? (
              <View style={styles.mediaStripWrap}>
                <View style={[styles.mediaStrip, { alignItems: 'center', justifyContent: 'center', paddingVertical: Space.md }]}>
                  <ActivityIndicator size="small" color={colors.brand} />
                </View>
              </View>
            ) : mediaState === 'error' ? (
              <View style={styles.mediaStripWrap}>
                <Pressable
                  onPress={() => {
                    setMediaState('loading');
                    fetchConversationMediaFromApi(conversationId, { limit: 60 })
                      .then((items) => {
                        setRemoteMedia(items);
                        setMediaState('ready');
                      })
                      .catch(() => setMediaState('error'));
                  }}
                  style={[styles.mediaStrip, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: Space.md, gap: Space.xs }]}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading shared media"
                >
                  <Ionicons name="refresh-outline" size={14} color={colors.textMuted} />
                  <Text style={{ fontSize: TypographyV2.meta.size, fontFamily: FontFamily.medium, color: colors.textMuted }}>
                    Could not load media. Tap to retry.
                  </Text>
                </Pressable>
              </View>
            ) : visualMediaItems.length > 0 ? (
              <View style={styles.mediaStripWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaStrip}>
                  {visualMediaItems.map((item) => {
                    const isVideo = item.mediaType === 'video';
                    return (
                      <AnimatedPressable
                        key={item.id}
                        onPress={() =>
                          navigation.navigate('ChatMediaPreview', {
                            mediaUri: item.mediaUri,
                            mediaType: item.mediaType === 'video' ? 'video' : 'image',
                            messageId: item.id,
                          })
                        }
                        style={styles.mediaThumbnail}
                        activeOpacity={0.8}
                        scaleValue={0.95}
                        hapticFeedback="light"
                        accessibilityRole="button"
                        accessibilityLabel={isVideo ? 'Video preview' : 'Photo preview'}
                      >
                        <CachedImage uri={item.mediaUri} style={styles.mediaThumbnailImg} contentFit="cover" />
                        {isVideo && (
                          <View style={styles.mediaVideoBadge}>
                            <Ionicons name="play" size={10} color={colors.mediaOverlayText} />
                          </View>
                        )}
                      </AnimatedPressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <GroupedRow
              icon="star-outline"
              label="Starred messages"
              onPress={() => show('No starred messages in this group', 'info')}
              isLast
            />
          </View>
        </View>

        {/* ── 4. Grouped Card: Settings & Customization ── */}
        <View style={styles.sectionContainer}>
          <Text style={styles.sectionHeaderLabel}>Settings</Text>
          <View style={styles.groupedCard}>
            <GroupedRow
              icon="color-palette-outline"
              label="Chat theme"
              detail={selectedTheme}
              onPress={() => setIsThemeSheetVisible(true)}
            />
            <GroupedRow
              icon="download-outline"
              label="Save to Photos"
              detail="Default"
              onPress={() => show('Media auto-saving is set to Default', 'info')}
            />
            <GroupedRow
              icon="notifications-outline"
              label="Notifications"
              detail={isMuted ? 'Muted' : 'All'}
              onPress={toggleMute}
              isLast
            />
          </View>
        </View>

        {/* ── 5. Grouped Card: Privacy & Security ── */}
        <View style={styles.sectionContainer}>
          <View style={styles.groupedCard}>
            <GroupedRow
              icon="timer-outline"
              label="Disappearing messages"
              detail={disappearingLabel}
              onPress={() => setIsDisappearingSheetVisible(true)}
            />
            <View style={styles.groupedRowContainer}>
              <View style={styles.rowIconWrap}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.textPrimary} />
              </View>
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>Lock chat</Text>
                <Text style={styles.rowSubtitle}>Lock and hide this chat on this device</Text>
              </View>
              <Switch
                value={isChatLocked}
                onValueChange={(val) => {
                  haptic.light();
                  setIsChatLocked(val);
                  show(val ? 'Chat locked with device security' : 'Chat unlocked', 'info');
                }}
                trackColor={{ false: colors.borderSubtle, true: colors.brand }}
                thumbColor={colors.surface}
                accessibilityLabel="Lock chat"
              />
            </View>
            <View style={styles.rowDivider} />
            <GroupedRow
              icon="shield-checkmark-outline"
              label="Encryption"
              subtitle="Messages and calls are end-to-end encrypted. Learn more"
              onPress={() => setIsEncryptionSheetVisible(true)}
            />
            <GroupedRow
              icon="shield-outline"
              label="Advanced chat privacy"
              detail="Off"
              onPress={() => show('IP address protection and media privacy are enabled', 'info')}
              isLast
            />
          </View>
        </View>

        {/* ── 6. Grouped Card: Smart Group Actions ── */}
        <View style={styles.sectionContainer}>
          <View style={styles.groupedCard}>
            <GroupedRow
              icon="people-outline"
              label="Create a similar group"
              subtitle="Start with the same members that you can add or remove"
              onPress={() => {
                navigation.navigate('CreateGroupChat', {
                  prefillMemberIds: conversation.participantIds,
                  prefillTitle: `${conversation.title || 'Group'} (Clone)`,
                });
              }}
              isLast
            />
          </View>
        </View>

        {/* ── 7. Grouped Card: Members Directory ── */}
        <View style={styles.sectionContainer}>
          <View style={styles.sectionHeaderWithAction}>
            <Text style={styles.sectionHeaderLabel}>
              {memberCount} member{memberCount === 1 ? '' : 's'}
            </Text>
            <AnimatedPressable
              onPress={() => {
                haptic.light();
                setIsMemberSearchOpen((prev) => !prev);
                if (isMemberSearchOpen) setMemberSearchQuery('');
              }}
              style={styles.searchToggleBtn}
              activeOpacity={0.7}
              scaleValue={0.92}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel="Search members"
            >
              <Ionicons
                name={isMemberSearchOpen ? 'close' : 'search'}
                size={18}
                color={colors.brand}
              />
            </AnimatedPressable>
          </View>

          {isMemberSearchOpen && (
            <View style={[styles.memberSearchInputWrap, isMemberSearchFocused && { borderColor: colors.brand }]}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                value={memberSearchQuery}
                onChangeText={setMemberSearchQuery}
                placeholder="Search member name or @handle..."
                placeholderTextColor={colors.textMuted}
                style={styles.memberSearchInput}
                autoFocus
                autoCapitalize="none"
                onFocus={() => setIsMemberSearchFocused(true)}
                onBlur={() => setIsMemberSearchFocused(false)}
                accessibilityLabel="Search members"
              />
              {memberSearchQuery.length > 0 && (
                <Pressable
                  onPress={() => setMemberSearchQuery('')}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear member search"
                >
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          )}

          <View style={styles.groupedCard}>
            {canAddMembers && !isMemberSearchOpen && (
              <>
                <GroupedRow
                  icon="person-add-outline"
                  iconColor={colors.brand}
                  label="Add members"
                  labelColor={colors.brand}
                  onPress={() => navigation.navigate('GroupMembers', { conversationId })}
                />
                <GroupedRow
                  icon="link-outline"
                  iconColor={colors.brand}
                  label="Invite to group via link"
                  labelColor={colors.brand}
                  onPress={displayedInviteSummary ? handleCopyInviteLink : handleGenerateInviteLink}
                />
              </>
            )}

            {displayedInviteSummary && !isMemberSearchOpen && (
              <View style={styles.inviteSummaryBanner}>
                <View style={styles.inviteSummaryTextCol}>
                  <Text style={styles.inviteSummaryLink} numberOfLines={1}>
                    {displayedInviteSummary.inviteLink}
                  </Text>
                  <Caption color={colors.textMuted}>
                    Expires {formatInviteDate(displayedInviteSummary.expiresAt)} · {displayedInviteSummary.useCount} uses
                  </Caption>
                </View>
                <View style={styles.inviteSummaryBtns}>
                  <Pressable
                    onPress={handleCopyInviteLink}
                    style={styles.inviteSmallBtn}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Copy invite link"
                  >
                    <Ionicons name="copy-outline" size={15} color={colors.brand} />
                  </Pressable>
                  <Pressable
                    onPress={handleShareInviteLink}
                    style={styles.inviteSmallBtn}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Share invite link"
                  >
                    <Ionicons name="share-outline" size={15} color={colors.brand} />
                  </Pressable>
                  <Pressable
                    onPress={handleRevokeInviteLink}
                    style={styles.inviteSmallBtn}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Revoke invite link"
                  >
                    <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  </Pressable>
                </View>
              </View>
            )}

            {/* Member rows */}
            {displayedMembers.length === 0 ? (
              <View style={styles.emptyMembersRow}>
                <Caption color={colors.textMuted}>No members match your search</Caption>
              </View>
            ) : (
              displayedMembers.map((member, index) => {
                const role = conversation.memberRoles?.[member.id];
                const isYou = member.id === currentUser?.id;
                const badge = roleLabel(role);
                const initials = (member.displayName ?? member.username).slice(0, 2).toUpperCase();
                const isLast = index === displayedMembers.length - 1 && memberCount <= 5 && !canAddMembers;

                return (
                  <AnimatedPressable
                    key={member.id}
                    onPress={() => {
                      haptic.light();
                      setSelectedMember({
                        id: member.id,
                        username: member.username,
                        displayName: member.displayName,
                        avatar: member.avatar,
                        role,
                      });
                    }}
                    style={[styles.memberItemRow, isLast && { borderBottomWidth: 0 }]}
                    activeOpacity={0.7}
                    scaleValue={0.985}
                    hapticFeedback="light"
                    accessibilityRole="button"
                    accessibilityLabel={`${member.displayName ?? member.username}, ${badge ?? 'Member'}`}
                  >
                    <View style={styles.memberAvatarCircle}>
                      {member.avatar ? (
                        <CachedImage uri={member.avatar} style={styles.memberAvatarImg} contentFit="cover" />
                      ) : (
                        <Text style={styles.memberAvatarInitials}>{initials}</Text>
                      )}
                    </View>

                    <View style={styles.memberItemContent}>
                      <View style={styles.memberNameRow}>
                        <Text style={styles.memberItemName} numberOfLines={1}>
                          {isYou ? 'You' : member.displayName ?? member.username}
                        </Text>
                        {badge ? (
                          <View style={[styles.memberRoleBadge, role === 'owner' && styles.memberRoleBadgeOwner]}>
                            <Text style={[styles.memberRoleBadgeText, role === 'owner' && styles.memberRoleBadgeTextOwner]}>
                              {badge}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.memberItemHandle} numberOfLines={1}>
                        @{member.username}
                      </Text>
                    </View>

                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </AnimatedPressable>
                );
              })
            )}

            {memberCount > 5 && !isMemberSearchOpen && (
              <GroupedRow
                icon="ellipsis-horizontal"
                label={`See all (${memberCount} members)`}
                onPress={() => navigation.navigate('GroupMembers', { conversationId })}
              />
            )}

            <GroupedRow
              icon="list-outline"
              label="View member changes"
              onPress={() => setIsMemberChangesSheetVisible(true)}
              isLast
            />
          </View>
        </View>

        {/* ── 8. Grouped Card: Group Controls (Admin / Manager only) ── */}
        {isGroupManager ? (
          <View style={styles.sectionContainer}>
            <Text style={styles.sectionHeaderLabel}>Group Controls</Text>
            <View style={styles.groupedCard}>
              <GroupedRow
                icon="settings-outline"
                label="Group permissions"
                subtitle="Who can edit info, send messages and add members"
                onPress={() => navigation.navigate('GroupPermissions', { conversationId })}
              />
              <GroupedRow
                icon="sparkles-outline"
                label="Automations & AI agents"
                subtitle={
                  connectedAgentCount > 0
                    ? `${connectedAgentCount} agent connected`
                    : 'Shopping, styling & moderation assistants'
                }
                onPress={() => navigation.navigate('GroupBotManagement', { conversationId })}
                isLast
              />
            </View>
          </View>
        ) : null}

        {/* ── 9. Grouped Card: Actions & Danger Zone ── */}
        <View style={styles.sectionContainer}>
          <View style={styles.groupedCard}>
            <GroupedRow
              icon={isFavourited ? 'heart' : 'heart-outline'}
              iconColor={isFavourited ? colors.danger : colors.brand}
              label={isFavourited ? 'Remove from Favourites' : 'Add to Favourites'}
              labelColor={colors.brand}
              onPress={() => {
                haptic.selection();
                setIsFavourited((prev) => !prev);
                show(isFavourited ? 'Removed from Favourites' : 'Added to Favourites', 'success');
              }}
            />
            <GroupedRow
              icon="trash-outline"
              iconColor={colors.danger}
              label="Clear chat"
              labelColor={colors.danger}
              onPress={clearChat}
              isLast
            />
          </View>
        </View>

        <View style={styles.sectionContainer}>
          <View style={styles.groupedCard}>
            <GroupedRow
              icon="log-out-outline"
              iconColor={colors.danger}
              label={isLeaving ? 'Leaving…' : 'Exit group'}
              labelColor={colors.danger}
              onPress={leaveGroup}
              trailing={isLeaving ? <ActivityIndicator size="small" color={colors.danger} /> : undefined}
            />
            <GroupedRow
              icon="flag-outline"
              iconColor={colors.danger}
              label="Report group"
              labelColor={colors.danger}
              onPress={() => navigation.navigate('Report', { type: 'group', targetId: conversationId })}
              isLast
            />
          </View>
        </View>

        {/* ── 10. Creation Provenance Footnote ── */}
        <View style={styles.provenanceFootnote}>
          <Caption color={colors.textMuted}>
            Created {formatCreationDate(conversation.createdAt)}
            {conversation.ownerId ? ` · Group ID: ${conversation.id.slice(0, 8)}` : ''}
          </Caption>
        </View>
      </ScrollView>

      {/* ── Confirmation Modal Sheet ── */}
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        variant={confirmSheet.variant ?? 'danger'}
        onConfirm={confirmSheet.onConfirm}
      />

      {/* ── Media Source Sheet ── */}
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

      {/* ── Disappearing Messages Sheet ── */}
      <BottomSheet
        visible={isDisappearingSheetVisible}
        onDismiss={() => setIsDisappearingSheetVisible(false)}
        variant="system"
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Disappearing Messages</Text>
          <Text style={styles.sheetSubtitle}>
            When turned on, new messages sent in this chat will disappear after the selected duration.
          </Text>
          {(['off', '24h', '7d', '90d'] as const).map((mode) => {
            const isSelected = disappearingDuration === mode;
            const label = mode === 'off' ? 'Off' : mode === '24h' ? '24 hours' : mode === '7d' ? '7 days' : '90 days';
            return (
              <Pressable
                key={mode}
                onPress={() => {
                  haptic.selection();
                  setDisappearingDuration(mode);
                  setIsDisappearingSheetVisible(false);
                  show(`Disappearing messages set to ${label}`, 'info');
                }}
                style={styles.sheetOptionRow}
                accessibilityRole="button"
                accessibilityLabel={`Disappearing messages ${label}`}
              >
                <Text style={[styles.sheetOptionLabel, isSelected && { color: colors.brand, fontFamily: FontFamily.bold }]}>
                  {label}
                </Text>
                {isSelected && <Ionicons name="checkmark" size={20} color={colors.brand} />}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      {/* ── Encryption Transparency Sheet ── */}
      <BottomSheet
        visible={isEncryptionSheetVisible}
        onDismiss={() => setIsEncryptionSheetVisible(false)}
        variant="transaction"
      >
        <View style={styles.sheetContent}>
          <View style={styles.sheetIconHeader}>
            <Ionicons name="shield-checkmark" size={40} color={colors.brand} />
          </View>
          <Text style={[styles.sheetTitle, { textAlign: 'center' }]}>Your chats and calls are private</Text>
          <Text style={[styles.sheetSubtitle, { textAlign: 'center', marginBottom: Space.lg }]}>
            End-to-end encryption ensures that only you and the participants can read or listen to what is sent. Not even
            ThryftVerse or third parties can access your conversations, media, or shared documents.
          </Text>
          <AppButton
            title="Understood"
            onPress={() => setIsEncryptionSheetVisible(false)}
            variant="primary"
          />
        </View>
      </BottomSheet>

      {/* ── Theme Picker Sheet ── */}
      <BottomSheet
        visible={isThemeSheetVisible}
        onDismiss={() => setIsThemeSheetVisible(false)}
        variant="system"
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Chat Theme</Text>
          <Text style={styles.sheetSubtitle}>Customize the atmosphere and accent tones of this conversation.</Text>
          {['Default', 'Emerald (WhatsApp)', 'Midnight', 'Sunset', 'Lavender', 'Cobalt'].map((theme) => {
            const isSelected = selectedTheme === theme;
            return (
              <Pressable
                key={theme}
                onPress={() => {
                  haptic.selection();
                  setSelectedTheme(theme);
                  setIsThemeSheetVisible(false);
                  show(`Theme changed to ${theme}`, 'success');
                }}
                style={styles.sheetOptionRow}
                accessibilityRole="button"
                accessibilityLabel={`Chat theme ${theme}`}
              >
                <Text style={[styles.sheetOptionLabel, isSelected && { color: colors.brand, fontFamily: FontFamily.bold }]}>
                  {theme}
                </Text>
                {isSelected && <Ionicons name="checkmark" size={20} color={colors.brand} />}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      {/* ── Member Action Sheet ── */}
      <BottomSheet
        visible={selectedMember !== null}
        onDismiss={() => setSelectedMember(null)}
        variant="system"
      >
        {selectedMember && (
          <View style={styles.sheetContent}>
            <View style={styles.memberSheetHeader}>
              <View style={styles.memberAvatarCircleLarge}>
                {selectedMember.avatar ? (
                  <CachedImage uri={selectedMember.avatar} style={styles.memberAvatarImgLarge} contentFit="cover" />
                ) : (
                  <Text style={styles.memberAvatarInitialsLarge}>
                    {(selectedMember.displayName ?? selectedMember.username).slice(0, 2).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={styles.memberSheetHeaderCopy}>
                <Text style={styles.memberSheetTitle}>
                  {selectedMember.displayName ?? selectedMember.username}
                </Text>
                <Text style={styles.memberSheetSubtitle}>@{selectedMember.username}</Text>
              </View>
            </View>

            <View style={styles.sheetActionsList}>
              <Pressable
                onPress={() => {
                  const id = selectedMember.id;
                  setSelectedMember(null);
                  navigation.navigate('UserProfile', { userId: id });
                }}
                style={styles.sheetActionRow}
                accessibilityRole="button"
                accessibilityLabel="View profile"
              >
                <Ionicons name="person-outline" size={20} color={colors.textPrimary} />
                <Text style={styles.sheetActionText}>View profile</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  const id = selectedMember.id;
                  const name = selectedMember.displayName ?? selectedMember.username;
                  setSelectedMember(null);
                  navigation.navigate('NewMessage', { preselectedUserId: id, preselectedDisplayName: name ?? undefined });
                }}
                style={styles.sheetActionRow}
                accessibilityRole="button"
                accessibilityLabel={`Message @${selectedMember.username}`}
              >
                <Ionicons name="chatbubble-outline" size={20} color={colors.textPrimary} />
                <Text style={styles.sheetActionText}>Message @${selectedMember.username}</Text>
              </Pressable>

              {isGroupManager && selectedMember.id !== currentUser?.id && (
                <>
                  <Pressable
                    onPress={async () => {
                      const id = selectedMember.id;
                      const name = selectedMember.displayName ?? selectedMember.username;
                      const wasAdmin = selectedMember.role === 'admin';
                      setSelectedMember(null);
                      try {
                        if (wasAdmin) {
                          const result = await demoteConversationMemberOnApi(conversationId, id);
                          upsertConversation({
                            ...conversation,
                            memberRoles: Object.fromEntries(
                              Object.entries(result.memberRoles).filter(
                                (entry): entry is [string, 'owner' | 'admin' | 'member'] =>
                                  entry[1] === 'owner' || entry[1] === 'admin' || entry[1] === 'member',
                              ),
                            ) as Record<string, 'owner' | 'admin' | 'member'>,
                          });
                          show(`${name} is now a member.`, 'info');
                        } else {
                          const result = await promoteConversationMemberOnApi(conversationId, id);
                          upsertConversation({
                            ...conversation,
                            memberRoles: Object.fromEntries(
                              Object.entries(result.memberRoles).filter(
                                (entry): entry is [string, 'owner' | 'admin' | 'member'] =>
                                  entry[1] === 'owner' || entry[1] === 'admin' || entry[1] === 'member',
                              ),
                            ) as Record<string, 'owner' | 'admin' | 'member'>,
                          });
                          show(`${name} is now an admin.`, 'success');
                        }
                      } catch (err) {
                        show(parseApiError(err, 'Could not update admin status.').message, 'error');
                      }
                    }}
                    style={styles.sheetActionRow}
                    accessibilityRole="button"
                    accessibilityLabel={selectedMember.role === 'admin' ? 'Dismiss as admin' : 'Make group admin'}
                  >
                    <Ionicons name="shield-outline" size={20} color={colors.brand} />
                    <Text style={[styles.sheetActionText, { color: colors.brand }]}>
                      {selectedMember.role === 'admin' ? 'Dismiss as admin' : 'Make group admin'}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      const id = selectedMember.id;
                      const name = selectedMember.displayName ?? selectedMember.username;
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
                            const result = await removeConversationMemberOnApi(conversationId, id);
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
                    }}
                    style={styles.sheetActionRow}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${selectedMember.displayName ?? selectedMember.username}`}
                  >
                    <Ionicons name="person-remove-outline" size={20} color={colors.danger} />
                    <Text style={[styles.sheetActionText, { color: colors.danger }]}>
                      Remove from group
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        )}
      </BottomSheet>

      {/* ── Member Changes Log Sheet ── */}
      <BottomSheet
        visible={isMemberChangesSheetVisible}
        onDismiss={() => setIsMemberChangesSheetVisible(false)}
        variant="system"
      >
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Member Activity</Text>
          <Text style={styles.sheetSubtitle}>Recent join, leave and role events for this group.</Text>

          <View style={styles.changesTimeline}>
            <View style={styles.changeItem}>
              <Ionicons name="add-circle" size={18} color={colors.brand} />
              <View style={styles.changeTextCol}>
                <Text style={styles.changeTitle}>Group created</Text>
                <Caption color={colors.textMuted}>{formatCreationDate(conversation.createdAt)}</Caption>
              </View>
            </View>

            {memberProfiles.map((m) => (
              <View key={m.id} style={styles.changeItem}>
                <Ionicons name="person" size={18} color={colors.textSecondary} />
                <View style={styles.changeTextCol}>
                  <Text style={styles.changeTitle}>
                    @{m.username} joined {conversation.memberRoles?.[m.id] ? `(${conversation.memberRoles[m.id]})` : ''}
                  </Text>
                  <Caption color={colors.textMuted}>Active member</Caption>
                </View>
              </View>
            ))}
          </View>
        </View>
      </BottomSheet>
    </FlagshipScreen>
  );
}

// ---------------------------------------------------------------------------
// GroupedRow Primitive: matching WhatsApp & iOS Grouped Table Anatomy
// ---------------------------------------------------------------------------
function GroupedRow({
  icon,
  iconColor,
  label,
  labelColor,
  subtitle,
  detail,
  showChevron = true,
  isLast = false,
  onPress,
  trailing,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  label: string;
  labelColor?: string;
  subtitle?: string;
  detail?: string;
  showChevron?: boolean;
  isLast?: boolean;
  onPress?: () => void;
  trailing?: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createRowStyles(colors), [colors]);

  const content = (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={20} color={iconColor ?? colors.textPrimary} />
      </View>
      <View style={styles.copyCol}>
        <Text style={[styles.label, labelColor ? { color: labelColor } : undefined]} numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      {trailing ? (
        trailing
      ) : showChevron ? (
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      ) : null}
    </View>
  );

  return (
    <>
      {onPress ? (
        <AnimatedPressable
          onPress={onPress}
          activeOpacity={0.68}
          scaleValue={0.985}
          hapticFeedback="light"
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          {content}
        </AnimatedPressable>
      ) : (
        content
      )}
      {!isLast && <View style={styles.divider} />}
    </>
  );
}

const createRowStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      gap: Space.sm,
    },
    iconWrap: {
      width: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    copyCol: {
      flex: 1,
      gap: 2,
    },
    label: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      lineHeight: TypographyV2.meta.lineHeight,
    },
    detail: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      marginRight: 4,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSubtle,
      marginLeft: 56, // Inset divider past the icon
    },
  });

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      gap: Space.md,
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
    coverWrap: {
      width: '100%',
      height: 200,
      position: 'relative',
    },
    coverImage: {
      width: '100%',
      height: '100%',
    },
    heroSection: {
      position: 'relative',
    },
    heroAvatarOverlap: {
      alignItems: 'center',
      marginTop: -48,
      marginBottom: Space.xs,
    },
    heroAvatarContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: Space.lg,
      paddingBottom: Space.xs,
    },
    heroAvatarWrap: {
      position: 'relative',
    },
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
      borderColor: colors.background,
    },
    coverEditBadge: {
      position: 'absolute',
      bottom: Space.sm + 2,
      right: Space.md,
      width: 36,
      height: 36,
      borderRadius: Radius.full,
      backgroundColor: colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
    },
    identity: {
      alignItems: 'center',
      paddingHorizontal: Space.md,
      gap: 4,
    },
    groupName: {
      maxWidth: '90%',
      color: colors.textPrimary,
      fontFamily: FontFamily.bold,
      fontSize: TypographyV2.screenTitle.size,
      lineHeight: TypographyV2.screenTitle.lineHeight,
      textAlign: 'center',
    },
    identityMeta: {
      color: colors.textSecondary,
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.body.size,
    },
    descriptionWrap: {
      maxWidth: '85%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: Space.xs,
      gap: 4,
    },
    descriptionText: {
      color: colors.textSecondary,
      fontFamily: FontFamily.regular,
      fontSize: TypographyV2.meta.size,
      textAlign: 'center',
      lineHeight: TypographyV2.meta.lineHeight + 2,
    },
    descPencil: {
      marginLeft: 2,
    },
    addDescriptionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: Space.sm,
      paddingVertical: 3,
      borderRadius: Radius.full,
      backgroundColor: colors.brandSubtle,
      marginTop: Space.xs,
    },
    addDescriptionText: {
      color: colors.brand,
      fontFamily: FontFamily.medium,
      fontSize: TypographyV2.meta.size,
    },
    addCoverPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      paddingHorizontal: Space.md,
      paddingVertical: Space.xs + 2,
      borderRadius: Radius.full,
      backgroundColor: colors.brandSubtle,
      marginTop: Space.sm,
    },
    addCoverPillText: {
      color: colors.brand,
      fontFamily: FontFamily.semibold,
      fontSize: TypographyV2.meta.size,
    },

    // ── Quick Action Dock ──
    quickActionDock: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      gap: Space.sm,
      marginTop: Space.xs,
    },
    quickActionButton: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Space.sm + 2,
      gap: 4,
    },
    quickActionButtonActive: {
      backgroundColor: colors.brandSubtle,
    },
    quickActionIconWrap: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    quickActionLabel: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },

    // ── Grouped Card Architecture ──
    sectionContainer: {
      paddingHorizontal: Space.md,
    },
    sectionHeaderLabel: {
      fontSize: TypographyV2.meta.size - 1,
      fontFamily: FontFamily.semibold,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: Space.xs,
      marginLeft: Space.xs,
    },
    sectionHeaderWithAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Space.xs,
      paddingHorizontal: Space.xs,
    },
    searchToggleBtn: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupedCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: Radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderSubtle,
      overflow: 'hidden',
    },
    groupedRowContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      minHeight: 52,
      gap: Space.sm,
    },
    rowIconWrap: {
      width: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowContent: {
      flex: 1,
      gap: 2,
    },
    rowLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    rowSubtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
    },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.borderSubtle,
      marginLeft: 56,
    },

    // ── Media Strip ──
    mediaStripWrap: {
      paddingVertical: Space.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    mediaStrip: {
      paddingHorizontal: Space.md,
      gap: Space.xs,
    },
    mediaThumbnail: {
      width: 64,
      height: 64,
      borderRadius: Radius.sm,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: colors.surfaceAlt,
    },
    mediaThumbnailImg: {
      width: '100%',
      height: '100%',
    },
    mediaVideoBadge: {
      position: 'absolute',
      bottom: 4,
      right: 4,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.mediaOverlayScrim,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Member Search & List ──
    memberSearchInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      borderRadius: Radius.md,
      borderWidth: Stroke.standard,
      borderColor: colors.border,
      paddingHorizontal: Space.sm,
      height: 36,
      marginBottom: Space.sm,
      gap: Space.xs,
    },
    memberSearchInput: {
      flex: 1,
      fontSize: TypographyV2.meta.size,
      color: colors.textPrimary,
      fontFamily: FontFamily.regular,
      paddingVertical: 0,
    },
    inviteSummaryBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm,
      backgroundColor: colors.surfaceAlt,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    inviteSummaryTextCol: {
      flex: 1,
      marginRight: Space.sm,
      gap: 2,
    },
    inviteSummaryLink: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    inviteSummaryBtns: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    inviteSmallBtn: {
      padding: 6,
    },
    memberItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      gap: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    memberAvatarCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    memberAvatarImg: {
      width: '100%',
      height: '100%',
    },
    memberAvatarInitials: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    memberItemContent: {
      flex: 1,
      gap: 2,
    },
    memberNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
    },
    memberItemName: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.semibold,
      color: colors.textPrimary,
    },
    memberRoleBadge: {
      paddingHorizontal: 6,
      paddingVertical: 1.5,
      borderRadius: Radius.sm,
      backgroundColor: colors.surfaceAlt,
    },
    memberRoleBadgeOwner: {
      backgroundColor: colors.brandSubtle,
    },
    memberRoleBadgeText: {
      fontSize: 10,
      fontFamily: FontFamily.semibold,
      color: colors.textSecondary,
    },
    memberRoleBadgeTextOwner: {
      color: colors.brand,
    },
    memberItemHandle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
    },
    emptyMembersRow: {
      paddingVertical: Space.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Provenance Footnote ──
    provenanceFootnote: {
      alignItems: 'center',
      paddingVertical: Space.md,
      paddingHorizontal: Space.md,
    },

    // ── Sheets / BottomModals ──
    sheetContent: {
      paddingHorizontal: Space.md,
      paddingBottom: Space.xl,
      gap: Space.sm,
    },
    sheetTitle: {
      fontSize: TypographyV2.sectionTitle.size,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    sheetSubtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
      lineHeight: TypographyV2.meta.lineHeight,
      marginBottom: Space.xs,
    },
    sheetIconHeader: {
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: Space.md,
    },
    sheetOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: Space.sm + 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    sheetOptionLabel: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    memberSheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.md,
      paddingVertical: Space.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
      marginBottom: Space.xs,
    },
    memberAvatarCircleLarge: {
      width: 54,
      height: 54,
      borderRadius: 27,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    memberAvatarImgLarge: {
      width: '100%',
      height: '100%',
    },
    memberAvatarInitialsLarge: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    memberSheetHeaderCopy: {
      flex: 1,
      gap: 2,
    },
    memberSheetTitle: {
      fontSize: TypographyV2.body.size + 1,
      fontFamily: FontFamily.bold,
      color: colors.textPrimary,
    },
    memberSheetSubtitle: {
      fontSize: TypographyV2.meta.size,
      fontFamily: FontFamily.regular,
      color: colors.textMuted,
    },
    sheetActionsList: {
      gap: 2,
    },
    sheetActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: Space.sm + 4,
      gap: Space.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderSubtle,
    },
    sheetActionText: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
    changesTimeline: {
      marginTop: Space.sm,
      gap: Space.md,
    },
    changeItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
    },
    changeTextCol: {
      flex: 1,
      gap: 2,
    },
    changeTitle: {
      fontSize: TypographyV2.body.size,
      fontFamily: FontFamily.medium,
      color: colors.textPrimary,
    },
  });
}
