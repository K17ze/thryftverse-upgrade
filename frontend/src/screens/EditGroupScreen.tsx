import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  fetchConversationFromApi,
  fetchGroupSettingsFromApi,
  leaveGroupOnApi,
  updateConversationOnApi } from '../services/chatApi';
import { classifyNetworkError, parseApiError } from '../lib/apiClient';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Control, Radius, Space, Typography } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { GroupAvatarMosaic } from '../components/chat/GroupAvatarMosaic';
import { GroupMediaSourceSheet, type GroupMediaSource } from '../components/chat/GroupMediaSourceSheet';
import { useHaptic } from '../hooks/useHaptic';
import { useGroupMediaUpload } from '../hooks/useGroupMediaUpload';
import { AppButton } from '../components/ui/AppButton';
import { Caption, Meta } from '../components/ui/Text';
import { ConfirmationSheet } from '../components/ConfirmationSheet';
import { createStableId } from '../utils/createStableId';

type Props = NativeStackScreenProps<RootStackParamList, 'EditGroup'>;

export default function EditGroupScreen({ navigation, route }: Props) {
  const { conversationId } = route.params ?? {};
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { show } = useToast();
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);
  const upsertConversation = useStore((state) => state.upsertConversation);
  const deleteConversation = useStore((state) => state.deleteConversation);
  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversations, conversationId],
  );

  const [name, setName] = useState(conversation?.title ?? '');
  const [description, setDescription] = useState(conversation?.description ?? '');
  const [mediaSourceSheet, setMediaSourceSheet] = useState<{ visible: boolean; target: 'avatar' | 'cover' }>({ visible: false, target: 'avatar' });
  const [isSaving, setIsSaving] = useState(false);

  // Flagship media upload — optimistic preview, compression, camera+gallery, retry/revert.
  const groupMedia = useGroupMediaUpload(conversation?.avatar ?? null, conversation?.coverPhoto ?? null);
  const isUploadingPhoto = groupMedia.avatar.status === 'uploading';
  const isUploadingCover = groupMedia.cover.status === 'uploading';
  const avatar = groupMedia.avatar.confirmedRemote;
  const avatarFinalizationId = groupMedia.avatar.finalizationId;
  const coverPhoto = groupMedia.cover.confirmedRemote;
  const coverPhotoFinalizationId = groupMedia.cover.finalizationId;
  const [isCheckingResult, setIsCheckingResult] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [saveIssue, setSaveIssue] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [confirmSheet, setConfirmSheet] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    variant?: 'default' | 'danger';
  }>({ visible: false, title: '', message: '', onConfirm: () => {} });
  const pendingSaveKeyRef = useRef<string | null>(null);

  const role = currentUser?.id ? conversation?.memberRoles?.[currentUser.id] : undefined;
  const isGroupManager = Boolean(
    currentUser?.id
    && (conversation?.ownerId === currentUser.id || role === 'owner' || role === 'admin'),
  );
  const [editPermission, setEditPermission] = useState<'loading' | 'allowed' | 'restricted'>(
    isGroupManager ? 'allowed' : 'loading',
  );
  const canEditGroup = editPermission === 'allowed';

  useEffect(() => {
    let active = true;
    if (isGroupManager) {
      setEditPermission('allowed');
      return () => {
        active = false;
      };
    }
    setEditPermission('loading');
    fetchGroupSettingsFromApi(conversationId)
      .then((snapshot) => {
        if (active) setEditPermission(snapshot.capabilities.canEditGroupInfo ? 'allowed' : 'restricted');
      })
      .catch(() => {
        if (active) setEditPermission('restricted');
      });
    return () => {
      active = false;
    };
  }, [conversationId, isGroupManager]);
  const initialAvatar = conversation?.avatar ?? null;
  const initialCoverPhoto = conversation?.coverPhoto ?? null;
  const hasChanges = name.trim() !== (conversation?.title ?? '').trim()
    || description.trim() !== (conversation?.description ?? '').trim()
    || avatar !== initialAvatar
    || coverPhoto !== initialCoverPhoto;

  const clearPendingSave = () => {
    pendingSaveKeyRef.current = null;
    setSaveIssue(null);
    setOutcomeUnknown(false);
  };

  if (!conversation || conversation.type !== 'group') {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Edit group" onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
      >
        <View style={styles.center}>
          <Caption color={colors.textMuted}>Group not found</Caption>
        </View>
      </FlagshipScreen>
    );
  }

  if (editPermission === 'loading') {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Edit group" onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
      >
        <View style={styles.center} accessibilityLabel="Checking group permissions">
          <ActivityIndicator color={colors.textPrimary} />
        </View>
      </FlagshipScreen>
    );
  }

  if (!canEditGroup) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Group identity" onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
      >
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={24} color={colors.textMuted} />
          <Caption color={colors.textMuted} style={styles.permissionCopy}>
            An owner or admin has limited group-info editing to admins.
          </Caption>
        </View>
      </FlagshipScreen>
    );
  }

  const handlePickGroupPhoto = () => {
    if (isUploadingPhoto || isSaving) return;
    haptic.light();
    setSaveIssue(null);
    setMediaSourceSheet({ visible: true, target: 'avatar' });
  };

  const handleRemovePhoto = () => {
    haptic.light();
    groupMedia.removeAvatar();
    clearPendingSave();
  };

  const handlePickCoverPhoto = () => {
    if (isUploadingCover || isSaving) return;
    haptic.light();
    setSaveIssue(null);
    setMediaSourceSheet({ visible: true, target: 'cover' });
  };

  const handleRemoveCoverPhoto = () => {
    haptic.light();
    groupMedia.removeCover();
    clearPendingSave();
  };

  const handleMediaSourceSelect = useCallback((source: GroupMediaSource) => {
    const target = mediaSourceSheet.target;
    if (target === 'avatar') {
      void groupMedia.pickAvatar(source);
    } else {
      void groupMedia.pickCover(source);
    }
    clearPendingSave();
  }, [mediaSourceSheet.target, groupMedia]);

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setSaveIssue('Use at least 2 characters for the group name.');
      return;
    }
    if (!hasChanges || isSaving || isUploadingPhoto || isUploadingCover) return;

    const avatarChanged = avatar !== initialAvatar;
    const coverChanged = coverPhoto !== initialCoverPhoto;
    if (avatarChanged && avatar && !avatarFinalizationId) {
      setSaveIssue('The group photo is not ready. Choose it again to retry the upload.');
      return;
    }
    if (coverChanged && coverPhoto && !coverPhotoFinalizationId) {
      setSaveIssue('The cover photo is not ready. Choose it again to retry the upload.');
      return;
    }

    setIsSaving(true);
    setSaveIssue(null);
    const idempotencyKey = pendingSaveKeyRef.current ?? createStableId('group-edit');
    pendingSaveKeyRef.current = idempotencyKey;

    // Optimistic store update — write the local preview URIs to the store
    // immediately so GroupChatInfoScreen reflects the change the instant we
    // navigate back, even before the API round-trip completes. The server
    // response below reconciles the final canonical URLs.
    const optimisticAvatar = groupMedia.avatarDisplayUri ?? avatar;
    const optimisticCover = groupMedia.coverDisplayUri ?? coverPhoto;
    upsertConversation({
      ...conversation,
      title: trimmedName,
      description: description.trim() || undefined,
      avatar: optimisticAvatar ?? undefined,
      coverPhoto: optimisticCover ?? undefined,
    });

    try {
      const updates: {
        title?: string;
        description?: string;
        avatar?: string | null;
        avatarFinalizationId?: string;
        coverPhoto?: string | null;
        coverPhotoFinalizationId?: string;
      } = {};
      if (trimmedName !== (conversation.title ?? '').trim()) updates.title = trimmedName;
      if (description.trim() !== (conversation.description ?? '').trim()) {
        updates.description = description.trim();
      }
      if (avatarChanged) {
        updates.avatar = avatar;
        if (avatarFinalizationId) updates.avatarFinalizationId = avatarFinalizationId;
      }
      if (coverChanged) {
        updates.coverPhoto = coverPhoto;
        if (coverPhotoFinalizationId) updates.coverPhotoFinalizationId = coverPhotoFinalizationId;
      }
      const updated = await updateConversationOnApi(
        conversationId,
        updates,
        idempotencyKey,
      );
      // Reconcile with server-confirmed canonical URLs. Append a cache-buster
      // so expo-image fetches the new image rather than serving a stale
      // memory-disk cache entry from the previous URL.
      upsertConversation({
        ...conversation,
        title: updated.title,
        description: updated.description ?? undefined,
        avatar: updated.avatar
          ? `${updated.avatar}${updated.avatar.includes('?') ? '&' : '?'}t=${Date.now()}`
          : undefined,
        coverPhoto: updated.coverPhoto
          ? `${updated.coverPhoto}${updated.coverPhoto.includes('?') ? '&' : '?'}t=${Date.now()}`
          : undefined,
      });
      pendingSaveKeyRef.current = null;
      haptic.success();
      show('Group details updated.', 'success');
      navigation.goBack();
    } catch (error) {
      const parsed = parseApiError(error, 'Could not update the group.');
      const networkType = classifyNetworkError(error);
      if (parsed.isNetworkError || networkType === 'network' || networkType === 'timeout') {
        setSaveIssue('We could not confirm whether the update finished. Check the group, or tap Save again safely.');
        setOutcomeUnknown(true);
      } else {
        pendingSaveKeyRef.current = null;
        setSaveIssue(parsed.message);
        setOutcomeUnknown(false);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCheckResult = async () => {
    if (isCheckingResult) return;
    setIsCheckingResult(true);
    try {
      const serverConversation = await fetchConversationFromApi(conversationId);
      const serverTitle = serverConversation.title ?? 'Group chat';
      const serverDescription = serverConversation.description ?? '';
      const serverAvatar = serverConversation.avatar ?? null;
      const serverCoverPhoto = serverConversation.coverPhoto ?? null;
      upsertConversation({
        ...conversation,
        title: serverTitle,
        description: serverDescription || undefined,
        avatar: serverAvatar
          ? `${serverAvatar}${serverAvatar.includes('?') ? '&' : '?'}t=${Date.now()}`
          : undefined,
        coverPhoto: serverCoverPhoto
          ? `${serverCoverPhoto}${serverCoverPhoto.includes('?') ? '&' : '?'}t=${Date.now()}`
          : undefined,
        ownerId: serverConversation.ownerId,
        participantIds: serverConversation.participantIds,
        memberRoles: Object.fromEntries(
          Object.entries(serverConversation.memberRoles).filter(
            (entry): entry is [string, 'owner' | 'admin' | 'member'] => (
              entry[1] === 'owner' || entry[1] === 'admin' || entry[1] === 'member'
            ),
          ),
        ) });

      const requestedStateLanded = serverTitle.trim() === name.trim()
        && serverDescription.trim() === description.trim()
        && serverAvatar === avatar
        && serverCoverPhoto === coverPhoto;
      if (requestedStateLanded) {
        pendingSaveKeyRef.current = null;
        setOutcomeUnknown(false);
        haptic.success();
        show('The group update was completed.', 'success');
        navigation.goBack();
      } else {
        setOutcomeUnknown(false);
        setSaveIssue('The update was not applied. Your edits are still here; tap Save to try again.');
      }
    } catch (error) {
      setSaveIssue(parseApiError(error, 'Could not check the group yet.').message);
    } finally {
      setIsCheckingResult(false);
    }
  };

  const handleBack = () => {
    if (hasChanges) {
      setConfirmSheet({
        visible: true,
        title: 'Discard changes?',
        message: 'Your group edits have not been saved.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        variant: 'danger',
        onConfirm: () => {
          setConfirmSheet((s) => ({ ...s, visible: false }));
          navigation.goBack();
        } });
      return;
    }
    navigation.goBack();
  };

  const handleLeaveGroup = () => {
    setConfirmSheet({
      visible: true,
      title: 'Leave group?',
      message: 'You will be removed from this group on all devices. Other members will keep the conversation.',
      confirmLabel: 'Leave group',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmSheet((s) => ({ ...s, visible: false }));
        haptic.heavy();
        setIsLeaving(true);
        try {
          await leaveGroupOnApi(conversationId, currentUser?.id ?? '');
          deleteConversation(conversationId);
          show('You left the group.', 'info');
          navigation.navigate('MainTabs', { screen: 'Inbox' });
        } catch (error) {
          show(parseApiError(error, 'Could not leave the group.').message, 'error');
        } finally {
          setIsLeaving(false);
        }
      } });
  };

  const mosaicMembers = (conversation.participantProfiles ?? []).map((member) => ({
    id: member.id,
    displayName: member.displayName ?? member.username,
    avatar: member.avatar }));

  return (
    <FlagshipScreen
      header={<FlagshipHeader title="Edit group" onBack={handleBack} />}
      scrollEnabled={false}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingHorizontal: 0 }]}
      >
        {/* Cover photo — full-width banner (3:1 aspect), separate from the
            circular avatar. Matches WhatsApp/Telegram group edit pattern. */}
        <View style={styles.coverSection}>
          <AnimatedPressable
            onPress={handlePickCoverPhoto}
            disabled={isUploadingCover || isSaving}
            style={styles.coverTarget}
            scaleValue={0.99}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={groupMedia.coverDisplayUri ? 'Change cover photo' : 'Add cover photo'}
            accessibilityHint="Choose a wide cover image from camera or gallery"
            accessibilityState={{ busy: isUploadingCover, disabled: isSaving }}
          >
            {groupMedia.coverDisplayUri ? (
              <CachedImage
                uri={groupMedia.coverDisplayUri}
                style={styles.coverImage}
                contentFit="cover"
                priority="high"
              />
            ) : (
              <View style={[styles.coverPlaceholder, { backgroundColor: colors.surfaceAlt }]}>
                <Ionicons name="image-outline" size={28} color={colors.textMuted} />
                <Text style={[styles.coverPlaceholderText, { color: colors.textMuted }]}>
                  Add cover photo
                </Text>
              </View>
            )}
            {/* Camera badge */}
            <View style={styles.coverCameraBadge}>
              {isUploadingCover ? (
                <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
              ) : (
                <Ionicons name="camera" size={16} color={colors.scrimTextPrimary} />
              )}
            </View>
          </AnimatedPressable>
          {groupMedia.coverDisplayUri ? (
            <View style={styles.coverActions}>
              <AnimatedPressable
                onPress={handlePickCoverPhoto}
                disabled={isUploadingCover || isSaving}
                style={styles.coverActionBtn}
                activeOpacity={0.65}
                scaleValue={0.98}
                accessibilityRole="button"
                accessibilityLabel="Change cover photo"
              >
                <Text style={[styles.coverActionText, { color: colors.brand }]}>
                  {isUploadingCover ? 'Uploading…' : 'Change cover'}
                </Text>
              </AnimatedPressable>
              <AnimatedPressable
                onPress={handleRemoveCoverPhoto}
                disabled={isSaving}
                style={styles.coverActionBtn}
                activeOpacity={0.65}
                scaleValue={0.98}
                accessibilityRole="button"
                accessibilityLabel="Remove cover photo"
              >
                <Text style={[styles.coverActionText, { color: colors.textMuted }]}>
                  Remove
                </Text>
              </AnimatedPressable>
            </View>
          ) : null}
        </View>

        {/* Group avatar — circular profile picture, separate from cover */}
        <View style={[styles.identity, { paddingHorizontal: Space.md }]}>
          <AnimatedPressable
            onPress={handlePickGroupPhoto}
            disabled={isUploadingPhoto || isSaving}
            style={styles.avatarTarget}
            scaleValue={0.98}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={groupMedia.avatarDisplayUri ? 'Change group photo' : 'Add group photo'}
            accessibilityHint="Choose from camera or gallery"
            accessibilityState={{ busy: isUploadingPhoto, disabled: isSaving }}
          >
            <GroupAvatarMosaic
              members={mosaicMembers}
              groupPhoto={groupMedia.avatarDisplayUri}
              fallbackInitials={name.trim() || 'Group'}
              groupId={conversationId}
              size={96}
            />
            <View style={styles.cameraBadge}>
              {isUploadingPhoto ? (
                <ActivityIndicator size="small" color={colors.textInverse} />
              ) : (
                <Ionicons name="camera" size={16} color={colors.textInverse} />
              )}
            </View>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.photoAction}
            onPress={handlePickGroupPhoto}
            disabled={isUploadingPhoto || isSaving}
            activeOpacity={0.65}
            scaleValue={0.98}
            accessibilityRole="button"
            accessibilityLabel={groupMedia.avatarDisplayUri ? 'Change group photo' : 'Add group photo'}
            accessibilityState={{ busy: isUploadingPhoto, disabled: isSaving }}
          >
            <Text style={styles.photoActionText}>
              {isUploadingPhoto ? 'Uploading…' : groupMedia.avatarDisplayUri ? 'Change photo' : 'Add group photo'}
            </Text>
          </AnimatedPressable>
          {groupMedia.avatarDisplayUri ? (
            <AnimatedPressable
              style={styles.removePhoto}
              onPress={handleRemovePhoto}
              disabled={isSaving}
              activeOpacity={0.65}
              scaleValue={0.98}
              accessibilityRole="button"
              accessibilityLabel="Remove group photo"
            >
              <Text style={styles.removePhotoText}>Remove photo</Text>
            </AnimatedPressable>
          ) : null}
        </View>

        <View style={{ paddingHorizontal: Space.md, gap: Space.lg }}>
        <Section title="Name">
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(value) => {
              setName(value);
              clearPendingSave();
            }}
            placeholder="Group name"
            placeholderTextColor={colors.textMuted}
            maxLength={80}
            accessibilityLabel="Group name"
          />
          <Caption color={colors.textMuted} style={styles.charCount}>{name.length}/80</Caption>
        </Section>

        <Section title="Description">
          <TextInput
            style={[styles.input, styles.textarea]}
            value={description}
            onChangeText={(value) => {
              setDescription(value);
              clearPendingSave();
            }}
            placeholder="What is this group about?"
            placeholderTextColor={colors.textMuted}
            maxLength={280}
            multiline
            accessibilityLabel="Group description"
          />
          <Caption color={colors.textMuted} style={styles.charCount}>{description.length}/280</Caption>
        </Section>

        {saveIssue ? (
          <View style={styles.issue} accessibilityLiveRegion="polite">
            <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
            <View style={styles.issueText}>
              <Caption color={colors.textSecondary}>{saveIssue}</Caption>
              {outcomeUnknown ? (
                <AnimatedPressable
                  onPress={handleCheckResult}
                  disabled={isCheckingResult}
                  style={styles.checkResultAction}
                  activeOpacity={0.65}
                  scaleValue={0.98}
                  accessibilityRole="button"
                  accessibilityLabel="Check group update result"
                  accessibilityState={{ busy: isCheckingResult }}
                >
                  {isCheckingResult ? (
                    <ActivityIndicator size="small" color={colors.brand} />
                  ) : null}
                  <Text style={styles.checkResultText}>
                    {isCheckingResult ? 'Checking…' : 'Check result'}
                  </Text>
                </AnimatedPressable>
              ) : null}
            </View>
          </View>
        ) : null}

        <AppButton
          title={isSaving ? 'Saving…' : 'Save changes'}
          variant="primary"
          size="md"
          align="center"
          onPress={handleSave}
          disabled={isSaving || isUploadingPhoto || isUploadingCover || !name.trim() || !hasChanges}
          accessibilityLabel={isSaving ? 'Saving group changes' : 'Save group changes'}
        />

        <AnimatedPressable
          style={[styles.leaveRow, isLeaving && styles.disabled]}
          onPress={handleLeaveGroup}
          activeOpacity={0.68}
          scaleValue={0.99}
          disabled={isLeaving}
          accessibilityRole="button"
          accessibilityLabel={isLeaving ? 'Leaving group' : 'Leave group'}
          accessibilityHint="Removes you from this group on all devices"
          accessibilityState={{ busy: isLeaving, disabled: isLeaving }}
        >
          {isLeaving ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          )}
          <Text style={styles.leaveText}>{isLeaving ? 'Leaving…' : 'Leave group'}</Text>
        </AnimatedPressable>
        </View>
      </ScrollView>
      <ConfirmationSheet
        visible={confirmSheet.visible}
        onDismiss={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        title={confirmSheet.title}
        message={confirmSheet.message}
        confirmLabel={confirmSheet.confirmLabel ?? 'Confirm'}
        cancelLabel={confirmSheet.cancelLabel ?? 'Cancel'}
        variant={confirmSheet.variant ?? 'danger'}
        onConfirm={confirmSheet.onConfirm}
      />
      <GroupMediaSourceSheet
        visible={mediaSourceSheet.visible}
        onClose={() => setMediaSourceSheet((prev) => ({ ...prev, visible: false }))}
        onSelect={handleMediaSourceSelect}
        title={mediaSourceSheet.target === 'avatar' ? 'Group photo' : 'Cover photo'}
      />
    </FlagshipScreen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.section}>
      <Meta color={colors.textMuted} style={styles.sectionLabel}>{title}</Meta>
      {children}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.sm,
      paddingHorizontal: Space.xl },
    permissionCopy: {
      textAlign: 'center',
      maxWidth: 280 },
    content: {
      paddingBottom: Space.xxl,
      gap: Space.lg },
    // Cover photo
    coverSection: {
      width: '100%' },
    coverTarget: {
      width: '100%',
      height: 200,
      position: 'relative' },
    coverImage: {
      width: '100%',
      height: '100%' },
    coverPlaceholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs },
    coverPlaceholderText: {
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily },
    coverCameraBadge: {
      position: 'absolute',
      right: Space.md,
      bottom: Space.md,
      width: 36,
      height: 36,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay },
    coverActions: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Space.lg,
      paddingVertical: Space.xs },
    coverActionBtn: {
      minHeight: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.sm },
    coverActionText: {
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily },
    identity: {
      alignItems: 'center',
      paddingTop: Space.md,
      paddingBottom: Space.sm },
    avatarTarget: {
      width: 104,
      height: 104,
      alignItems: 'center',
      justifyContent: 'center' },
    cameraBadge: {
      position: 'absolute',
      right: 0,
      bottom: 2,
      width: 32,
      height: 32,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand,
      borderWidth: 2,
      borderColor: colors.background },
    photoAction: {
      marginTop: Space.xs,
      minHeight: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.sm },
    photoActionText: {
      color: colors.brand,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size },
    removePhoto: {
      marginTop: -Space.sm,
      minHeight: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.sm },
    removePhotoText: {
      color: colors.textMuted,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size },
    section: {
      gap: Space.xs },
    sectionLabel: {
      marginLeft: 2,
      fontSize: TypographyV2.meta.size,
      letterSpacing: 0,
      textTransform: 'none' },
    input: {
      minHeight: Control.hit,
      backgroundColor: colors.surface,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
      color: colors.textPrimary },
    textarea: {
      minHeight: 104,
      textAlignVertical: 'top' },
    charCount: {
      alignSelf: 'flex-end',
      marginRight: 2 },
    issue: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border },
    issueText: {
      flex: 1 },
    checkResultAction: {
      minHeight: Control.hit,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      justifyContent: 'center',
      marginTop: Space.xs,
      paddingHorizontal: Space.sm },
    checkResultText: {
      color: colors.brand,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.meta.size },
    leaveRow: {
      minHeight: Control.hit + 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.md,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border },
    leaveText: {
      color: colors.danger,
      fontFamily: Typography.family.medium,
      fontSize: TypographyV2.body.size },
    disabled: {
      opacity: 0.55 } });
}
