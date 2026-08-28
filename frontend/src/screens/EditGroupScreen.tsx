import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  fetchConversationFromApi,
  leaveGroupOnApi,
  updateConversationOnApi,
} from '../services/chatApi';
import { uploadMedia } from '../services/mediaUpload';
import { classifyNetworkError, parseApiError } from '../lib/apiClient';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useToast } from '../context/ToastContext';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Control, Radius, Space, Type, Typography } from '../theme/designTokens';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { CachedImage } from '../components/CachedImage';
import { GroupAvatarMosaic } from '../components/chat/GroupAvatarMosaic';
import { useHaptic } from '../hooks/useHaptic';
import { AppButton } from '../components/ui/AppButton';
import { Caption, Meta } from '../components/ui/Text';
import { createStableId } from '../utils/createStableId';

type Props = NativeStackScreenProps<RootStackParamList, 'EditGroup'>;

export default function EditGroupScreen({ navigation, route }: Props) {
  const { conversationId } = route.params;
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
  const [avatar, setAvatar] = useState<string | null>(conversation?.avatar ?? null);
  const [avatarFinalizationId, setAvatarFinalizationId] = useState<string | null>(null);
  const [coverPhoto, setCoverPhoto] = useState<string | null>(conversation?.coverPhoto ?? null);
  const [coverPhotoFinalizationId, setCoverPhotoFinalizationId] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingResult, setIsCheckingResult] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [saveIssue, setSaveIssue] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const pendingSaveKeyRef = useRef<string | null>(null);

  const role = currentUser?.id ? conversation?.memberRoles?.[currentUser.id] : undefined;
  const canManage = Boolean(
    currentUser?.id
    && (conversation?.ownerId === currentUser.id || role === 'owner' || role === 'admin'),
  );
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

  if (!canManage) {
    return (
      <FlagshipScreen
        header={<FlagshipHeader title="Group identity" onBack={() => navigation.goBack()} />}
        scrollEnabled={false}
      >
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={24} color={colors.textMuted} />
          <Caption color={colors.textMuted} style={styles.permissionCopy}>
            Only group owners and admins can change the group name or photo.
          </Caption>
        </View>
      </FlagshipScreen>
    );
  }

  const handlePickGroupPhoto = async () => {
    if (isUploadingPhoto || isSaving) return;
    haptic.light();
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.88,
      });
      const selected = result.canceled ? null : result.assets[0];
      if (!selected?.uri) return;

      setIsUploadingPhoto(true);
      setSaveIssue(null);
      try {
        const uploaded = await uploadMedia(selected.uri, 'avatars');
        setAvatar(uploaded.publicUrl);
        setAvatarFinalizationId(uploaded.finalizationId);
        clearPendingSave();
        haptic.success();
      } catch (error) {
        show(parseApiError(error, 'Could not upload the group photo.').message, 'error');
      } finally {
        setIsUploadingPhoto(false);
      }
    } catch {
      show('Could not open the photo library.', 'error');
    }
  };

  const handleRemovePhoto = () => {
    haptic.light();
    setAvatar(null);
    setAvatarFinalizationId(null);
    clearPendingSave();
  };

  // Cover photo — wide banner (3:1 aspect), separate from the circular avatar.
  // Matches WhatsApp/Telegram pattern: cover photo is the group's visual
  // identity at the top of the info screen, avatar is the small circular
  // profile picture.
  const handlePickCoverPhoto = async () => {
    if (isUploadingCover || isSaving) return;
    haptic.light();
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        allowsEditing: true,
        aspect: [3, 1],
        quality: 0.88,
      });
      const selected = result.canceled ? null : result.assets[0];
      if (!selected?.uri) return;

      setIsUploadingCover(true);
      setSaveIssue(null);
      try {
        const uploaded = await uploadMedia(selected.uri, 'covers');
        setCoverPhoto(uploaded.publicUrl);
        setCoverPhotoFinalizationId(uploaded.finalizationId);
        clearPendingSave();
        haptic.success();
      } catch (error) {
        show(parseApiError(error, 'Could not upload the cover photo.').message, 'error');
      } finally {
        setIsUploadingCover(false);
      }
    } catch {
      show('Could not open the photo library.', 'error');
    }
  };

  const handleRemoveCoverPhoto = () => {
    haptic.light();
    setCoverPhoto(null);
    setCoverPhotoFinalizationId(null);
    clearPendingSave();
  };

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
      upsertConversation({
        ...conversation,
        title: updated.title,
        description: updated.description ?? undefined,
        avatar: updated.avatar ?? undefined,
        coverPhoto: updated.coverPhoto ?? undefined,
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
        avatar: serverAvatar ?? undefined,
        coverPhoto: serverCoverPhoto ?? undefined,
        ownerId: serverConversation.ownerId,
        participantIds: serverConversation.participantIds,
        memberRoles: Object.fromEntries(
          Object.entries(serverConversation.memberRoles).filter(
            (entry): entry is [string, 'owner' | 'admin' | 'member'] => (
              entry[1] === 'owner' || entry[1] === 'admin' || entry[1] === 'member'
            ),
          ),
        ),
      });

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
      Alert.alert('Discard changes?', 'Your group edits have not been saved.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
      ]);
      return;
    }
    navigation.goBack();
  };

  const handleLeaveGroup = () => {
    Alert.alert(
      'Leave group?',
      'You will be removed from this group on all devices. Other members will keep the conversation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave group',
          style: 'destructive',
          onPress: async () => {
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
          },
        },
      ],
    );
  };

  const mosaicMembers = (conversation.participantProfiles ?? []).map((member) => ({
    id: member.id,
    displayName: member.displayName ?? member.username,
    avatar: member.avatar,
  }));

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
            accessibilityLabel={coverPhoto ? 'Change cover photo' : 'Add cover photo'}
            accessibilityHint="Opens your photo library to choose a wide cover image"
            accessibilityState={{ busy: isUploadingCover, disabled: isSaving }}
          >
            {coverPhoto ? (
              <CachedImage
                uri={coverPhoto}
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
          {coverPhoto ? (
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
            accessibilityLabel={avatar ? 'Change group photo' : 'Add group photo'}
            accessibilityHint="Opens your photo library"
            accessibilityState={{ busy: isUploadingPhoto, disabled: isSaving }}
          >
            <GroupAvatarMosaic
              members={mosaicMembers}
              groupPhoto={avatar}
              fallbackInitials={name.trim() || 'Group'}
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
            accessibilityLabel={avatar ? 'Change group photo' : 'Add group photo'}
            accessibilityState={{ busy: isUploadingPhoto, disabled: isSaving }}
          >
            <Text style={styles.photoActionText}>
              {isUploadingPhoto ? 'Uploading…' : avatar ? 'Change photo' : 'Add group photo'}
            </Text>
          </AnimatedPressable>
          {avatar ? (
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
      paddingHorizontal: Space.xl,
    },
    permissionCopy: {
      textAlign: 'center',
      maxWidth: 280,
    },
    content: {
      paddingBottom: Space.xxl,
      gap: Space.lg,
    },
    // Cover photo
    coverSection: {
      width: '100%',
    },
    coverTarget: {
      width: '100%',
      height: 180,
      position: 'relative',
    },
    coverImage: {
      width: '100%',
      height: '100%',
    },
    coverPlaceholder: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Space.xs,
    },
    coverPlaceholderText: {
      fontSize: Type.caption.size,
      fontFamily: Typography.family.medium,
    },
    coverCameraBadge: {
      position: 'absolute',
      right: Space.md,
      bottom: Space.md,
      width: 36,
      height: 36,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay,
    },
    coverActions: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: Space.lg,
      paddingVertical: Space.xs,
    },
    coverActionBtn: {
      minHeight: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.sm,
    },
    coverActionText: {
      fontSize: Type.body.size,
      fontFamily: Typography.family.medium,
    },
    identity: {
      alignItems: 'center',
      paddingTop: Space.md,
      paddingBottom: Space.sm,
    },
    avatarTarget: {
      width: 104,
      height: 104,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
      borderColor: colors.background,
    },
    photoAction: {
      marginTop: Space.xs,
      minHeight: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.sm,
    },
    photoActionText: {
      color: colors.brand,
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
    },
    removePhoto: {
      marginTop: -Space.sm,
      minHeight: Control.hit,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: Space.sm,
    },
    removePhotoText: {
      color: colors.textMuted,
      fontFamily: Typography.family.medium,
      fontSize: Type.caption.size,
    },
    section: {
      gap: Space.xs,
    },
    sectionLabel: {
      marginLeft: 2,
      fontSize: Type.caption.size,
      letterSpacing: 0,
      textTransform: 'none',
    },
    input: {
      minHeight: Control.hit,
      backgroundColor: colors.surface,
      borderRadius: Radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: Space.md,
      paddingVertical: Space.sm + 2,
      fontSize: Type.body.size,
      fontFamily: Typography.family.regular,
      color: colors.textPrimary,
    },
    textarea: {
      minHeight: 104,
      textAlignVertical: 'top',
    },
    charCount: {
      alignSelf: 'flex-end',
      marginRight: 2,
    },
    issue: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: Space.sm,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    issueText: {
      flex: 1,
    },
    checkResultAction: {
      minHeight: Control.hit,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.xs,
      justifyContent: 'center',
      marginTop: Space.xs,
      paddingHorizontal: Space.sm,
    },
    checkResultText: {
      color: colors.brand,
      fontFamily: Typography.family.medium,
      fontSize: Type.caption.size,
    },
    leaveRow: {
      minHeight: Control.hit + 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: Space.sm,
      marginTop: Space.md,
      paddingVertical: Space.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    leaveText: {
      color: colors.danger,
      fontFamily: Typography.family.medium,
      fontSize: Type.body.size,
    },
    disabled: {
      opacity: 0.55,
    },
  });
}
