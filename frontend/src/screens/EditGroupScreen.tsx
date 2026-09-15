/**
 * EditGroupScreen — the group identity editor (name, description, cover
 * banner, avatar) behind the server-reported edit-permission gate.
 * Orchestrator only: the permission state machine, the staged media draft,
 * the idempotent save flow and the leave-group action live in
 * hooks/groupchatinfo; the rendered blocks live in
 * components/groupchatinfo. Extracted verbatim — no behavior change.
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useStore } from '../store/useStore';
import { useAppTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/ThemeContext';
import { Control, Space, Typography } from '../theme/designTokens';
import { TypographyV2 } from '../theme/typography.v2';
import { FlagshipScreen, FlagshipHeader } from '../components/flagship';
import { AnimatedPressable } from '../components/AnimatedPressable';
import { AppIcon } from '../components/common/AppIcon';
import { AppButton } from '../components/ui/AppButton';
import { useHaptic } from '../hooks/useHaptic';
import {
  useEditGroupForm,
  useEditGroupLeave,
  useEditGroupMedia,
  useEditGroupPermission,
  useEditGroupSaveStatus,
  type GroupInfoConfirmSheetState,
} from '../hooks/groupchatinfo';
import { EditGroupMediaSection } from '../components/groupchatinfo/EditGroupMediaSection';
import { EditGroupFieldsSection } from '../components/groupchatinfo/EditGroupFieldsSection';
import { EditGroupIssueBanner } from '../components/groupchatinfo/EditGroupIssueBanner';
import { EditGroupSheets } from '../components/groupchatinfo/EditGroupSheets';
import {
  EditGroupChecking,
  EditGroupNotFound,
  EditGroupRestricted,
} from '../components/groupchatinfo/EditGroupStates';

type Props = NativeStackScreenProps<RootStackParamList, 'EditGroup'>;

export default function EditGroupScreen({ navigation, route }: Props) {
  const { conversationId } = route.params ?? {};
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const haptic = useHaptic();

  const conversations = useStore((state) => state.conversations);
  const currentUser = useStore((state) => state.currentUser);
  const conversation = useMemo(
    () => conversations.find((item) => item.id === conversationId),
    [conversations, conversationId]
  );

  // Save-outcome state is created first so the media draft can invalidate
  // a pinned idempotency key without a circular hook dependency.
  const saveStatus = useEditGroupSaveStatus();
  const media = useEditGroupMedia({
    conversation,
    onDraftChanged: saveStatus.clearPendingSave,
  });
  const form = useEditGroupForm({
    conversation,
    conversationId,
    media,
    saveStatus,
    navigation,
  });
  const { editPermission, canEditGroup } = useEditGroupPermission(
    conversation,
    conversationId,
    currentUser?.id
  );

  const [confirmSheet, setConfirmSheet] = useState<GroupInfoConfirmSheetState>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });
  const { isLeaving, leaveGroup } = useEditGroupLeave({
    conversationId,
    currentUserId: currentUser?.id,
    setConfirmSheet,
    navigation,
  });

  const handlePickGroupPhoto = () => {
    if (media.isUploadingPhoto || form.isSaving) return;
    haptic.light();
    saveStatus.setSaveIssue(null);
    media.openMediaSheet('avatar');
  };

  const handlePickCoverPhoto = () => {
    if (media.isUploadingCover || form.isSaving) return;
    haptic.light();
    saveStatus.setSaveIssue(null);
    media.openMediaSheet('cover');
  };

  const handleBack = () => {
    if (form.hasChanges) {
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
        },
      });
      return;
    }
    navigation.goBack();
  };

  if (!conversation || conversation.type !== 'group') {
    return <EditGroupNotFound onBack={() => navigation.goBack()} />;
  }

  if (editPermission === 'loading') {
    return <EditGroupChecking onBack={() => navigation.goBack()} />;
  }

  if (!canEditGroup) {
    return <EditGroupRestricted onBack={() => navigation.goBack()} />;
  }

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
        contentContainerStyle={styles.content}
      >
        {/* ── Identity media ── */}
        <EditGroupMediaSection
          coverDisplayUri={media.coverDisplayUri}
          isUploadingCover={media.isUploadingCover}
          avatarDisplayUri={media.avatarDisplayUri}
          isUploadingPhoto={media.isUploadingPhoto}
          isSaving={form.isSaving}
          mosaicMembers={mosaicMembers}
          fallbackInitials={form.name.trim() || 'Group'}
          groupId={conversationId}
          onPickCover={handlePickCoverPhoto}
          onRemoveCover={media.removeCover}
          onPickAvatar={handlePickGroupPhoto}
          onRemoveAvatar={media.removeAvatar}
        />

        <View style={styles.formColumn}>
          {/* ── Identity fields ── */}
          <EditGroupFieldsSection
            name={form.name}
            description={form.description}
            onNameChange={form.handleNameChange}
            onDescriptionChange={form.handleDescriptionChange}
          />

          {/* ── Save issue / recovery ── */}
          {form.saveIssue ? (
            <EditGroupIssueBanner
              issue={form.saveIssue}
              outcomeUnknown={form.outcomeUnknown}
              isChecking={form.isCheckingResult}
              onCheckResult={form.handleCheckResult}
            />
          ) : null}

          <AppButton
            title={form.isSaving ? 'Saving…' : 'Save changes'}
            variant="primary"
            size="md"
            align="center"
            onPress={form.handleSave}
            disabled={
              form.isSaving ||
              media.isUploadingPhoto ||
              media.isUploadingCover ||
              !form.name.trim() ||
              !form.hasChanges
            }
            accessibilityLabel={form.isSaving ? 'Saving group changes' : 'Save group changes'}
          />

          {/* ── Leave ── */}
          <AnimatedPressable
            style={[styles.leaveRow, isLeaving && styles.disabled]}
            onPress={leaveGroup}
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
              <AppIcon name="log-out-outline" size="md" color="danger" accessible={false} />
            )}
            <Text style={styles.leaveText}>{isLeaving ? 'Leaving…' : 'Leave group'}</Text>
          </AnimatedPressable>
        </View>
      </ScrollView>

      {/* ── Sheets ── */}
      <EditGroupSheets
        confirmSheet={confirmSheet}
        onDismissConfirmSheet={() => setConfirmSheet((s) => ({ ...s, visible: false }))}
        mediaSheet={media.mediaSheet}
        onCloseMediaSheet={media.closeMediaSheet}
        onSelectMediaSource={media.handleMediaSourceSelect}
        onSelectPreset={media.handleSelectPreset}
        canRemoveMedia={Boolean(
          media.mediaSheet.target === 'avatar'
            ? media.avatarDisplayUri || media.avatar
            : media.coverDisplayUri || media.coverPhoto
        )}
        onRemoveMedia={
          media.mediaSheet.target === 'avatar' ? media.removeAvatar : media.removeCover
        }
      />
    </FlagshipScreen>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: 0,
      paddingBottom: Space.xxl,
      gap: Space.lg,
    },
    formColumn: {
      paddingHorizontal: Space.md,
      gap: Space.lg,
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
      fontSize: TypographyV2.body.size,
    },
    disabled: {
      opacity: 0.55,
    },
  });
}
