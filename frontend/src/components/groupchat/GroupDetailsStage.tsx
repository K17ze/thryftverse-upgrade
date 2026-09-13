/**
 * GroupDetailsStage — stage 2 of the create-group flow: cover photo,
 * group photo (mosaic preview), name/description fields, participant
 * list, create error banner and the sticky "Create Group" action, plus
 * the media source sheet. Extracted verbatim from CreateGroupChatScreen.
 */

import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { AppInput } from '../ui/AppInput';
import { AppButton } from '../ui/AppButton';
import { Caption } from '../ui/Text';
import { FlagshipScreen, FlagshipHeader } from '../flagship';
import { GroupAvatarMosaic, type MosaicMember } from '../chat/GroupAvatarMosaic';
import { GroupMediaSourceSheet, type GroupMediaSource } from '../chat/GroupMediaSourceSheet';
import { KeyboardAwareStickyAction } from '../../platform/keyboard';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { getAestheticPresets } from '../../constants/groupAesthetics';
import type { SelectableUser } from '../../utils/chatGroupHelpers';
import { createGroupChatStyles } from './createGroupChatStyles';

export interface GroupDetailsStageProps {
  title: string;
  onTitleChange: (title: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  createError: string;
  onRetryCreate: () => void;
  isCreating: boolean;
  isUploadingPhoto: boolean;
  isUploadingCover: boolean;
  avatarDisplayUri: string | null;
  coverDisplayUri: string | null;
  onPickGroupPhoto: () => void;
  onPickCoverPhoto: () => void;
  onRemoveGroupPhoto: () => void;
  onRemoveCoverPhoto: () => void;
  mosaicMembers: MosaicMember[];
  mosaicGroupId: string;
  avatarUploadFailed: boolean;
  avatarUploadError: string | null;
  onRetryAvatarUpload: () => void;
  selectedIds: string[];
  selectedUsers: Map<string, SelectableUser>;
  onCreateGroup: () => void;
  onBack: () => void;
  mediaSheetVisible: boolean;
  mediaSheetTarget: 'avatar' | 'cover';
  onCloseMediaSheet: () => void;
  onSelectMediaSource: (source: GroupMediaSource) => void;
  onSelectPreset: (url: string) => void;
}

export function GroupDetailsStage({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  createError,
  onRetryCreate,
  isCreating,
  isUploadingPhoto,
  isUploadingCover,
  avatarDisplayUri,
  coverDisplayUri,
  onPickGroupPhoto,
  onPickCoverPhoto,
  onRemoveGroupPhoto,
  onRemoveCoverPhoto,
  mosaicMembers,
  mosaicGroupId,
  avatarUploadFailed,
  avatarUploadError,
  onRetryAvatarUpload,
  selectedIds,
  selectedUsers,
  onCreateGroup,
  onBack,
  mediaSheetVisible,
  mediaSheetTarget,
  onCloseMediaSheet,
  onSelectMediaSource,
  onSelectPreset,
}: GroupDetailsStageProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createGroupChatStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  return (
    <FlagshipScreen header={<FlagshipHeader title="Group Details" onBack={onBack} />} scrollEnabled={false}>
      <KeyboardAwareStickyAction
        style={styles.detailsRoot}
        contentContainerStyle={styles.detailsContent}
        keyboardShouldPersistTaps="always"
        stickyAction={
          <>
            {createError ? (
              <View style={styles.createErrorBanner}>
                <AppIcon name="alert" variant="filled" size="sm" color="danger" accessible={false} />
                <Text style={styles.createErrorText}>{createError}</Text>
                <AnimatedPressable
                  onPress={onRetryCreate}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Retry creating group"
                >
                  <Text style={styles.retryText}>Retry</Text>
                </AnimatedPressable>
              </View>
            ) : null}
            <View style={[styles.stickyAction, { paddingBottom: Math.max(insets.bottom, Space.sm) + 8 }]}>
              <AppButton
                style={[styles.createBtn, (!title.trim() || isCreating || isUploadingPhoto || isUploadingCover) && styles.createBtnDisabled]}
                variant="primary"
                size="md"
                align="center"
                title={isCreating ? 'Creating...' : (isUploadingPhoto || isUploadingCover) ? 'Uploading photo...' : 'Create Group'}
                onPress={onCreateGroup}
                disabled={!title.trim() || isCreating || isUploadingPhoto || isUploadingCover}
                accessibilityLabel={isCreating ? 'Creating group chat' : 'Create group chat'}
                accessibilityRole="button"
              />
            </View>
          </>
        }
      >
        {/* Cover photo — wide banner, optional. Separate from the circular
            group avatar. Standard group creation pattern. */}
        <AnimatedPressable
          onPress={onPickCoverPhoto}
          disabled={isUploadingCover}
          style={styles.coverSelector}
          accessibilityRole="button"
          accessibilityLabel={coverDisplayUri ? 'Change cover photo' : 'Add cover photo'}
          accessibilityHint="Choose a wide cover image from camera or gallery"
        >
          {coverDisplayUri ? (
            <CachedImage
              uri={coverDisplayUri}
              style={styles.coverImage}
              contentFit="cover"
              priority="high"
            />
          ) : (
            <View style={[styles.coverPlaceholder, { backgroundColor: colors.surfaceAlt }]}>
              <AppIcon name="image" size="lg" color="textMuted" accessible={false} />
              <Text style={[styles.coverPlaceholderText, { color: colors.textMuted }]}>
                {isUploadingCover ? 'Uploading…' : 'Add cover photo'}
              </Text>
            </View>
          )}
          {isUploadingCover ? (
            <View style={styles.coverUploadingOverlay}>
              <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
            </View>
          ) : null}
          {coverDisplayUri && !isUploadingCover ? (
            <Pressable
              style={styles.coverRemoveBtn}
              onPress={onRemoveCoverPhoto}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Remove cover photo"
            >
              <AppIcon name="close" variant="filled" size="lg" color="scrimTextPrimary" accessible={false} />
            </Pressable>
          ) : null}
        </AnimatedPressable>

        <View style={styles.avatarSelectorWrap}>
          <AnimatedPressable
            onPress={onPickGroupPhoto}
            disabled={isUploadingPhoto}
            style={styles.avatarSelectorPressable}
            accessibilityRole="button"
            accessibilityLabel="Set group photo"
            accessibilityHint="Choose a group photo from camera or gallery"
          >
            <GroupAvatarMosaic
              members={mosaicMembers}
              groupPhoto={avatarDisplayUri}
              fallbackInitials={title.trim() || 'G'}
              groupId={mosaicGroupId}
              size={Space.xxl + Space.xl}
            />
            {isUploadingPhoto ? (
              <View style={styles.avatarUploadingOverlay}>
                <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
              </View>
            ) : (
              <View style={styles.cameraBadge}>
                <AppIcon name="camera" variant="filled" size="xs" color="textInverse" accessible={false} />
              </View>
            )}
          </AnimatedPressable>
          <Caption color={colors.textMuted} style={styles.avatarHint}>
            {isUploadingPhoto
              ? 'Uploading photo...'
              : avatarDisplayUri
                ? 'Tap to change photo'
                : 'Tap to add photo · mosaic auto-generated'}
          </Caption>
          {avatarDisplayUri && !isUploadingPhoto ? (
            <Pressable
              onPress={onRemoveGroupPhoto}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Remove group photo"
            >
              <Caption color={colors.danger} style={styles.removeText}>Remove photo</Caption>
            </Pressable>
          ) : null}
          {avatarUploadFailed ? (
            <View style={styles.mediaErrorRow}>
              <AppIcon name="warning" size="micro" color="danger" accessible={false} />
              <Text style={[styles.mediaErrorText, { color: colors.danger }]} numberOfLines={2}>
                {avatarUploadError}
              </Text>
              <Pressable
                onPress={onRetryAvatarUpload}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Retry avatar upload"
              >
                <Text style={[styles.retryText, { color: colors.brand }]}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Group name</Text>
          <AppInput
            value={title}
            onChangeText={onTitleChange}
            placeholder="Group name"
            placeholderTextColor={colors.textMuted}
            maxLength={80}
            inputContainerStyle={styles.fieldInputWrap}
            inputStyle={styles.fieldInput}
            accessibilityLabel="Group name input"
            accessibilityHint="Enter a name for the new group chat"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Description (optional)</Text>
          <AppInput
            value={description}
            onChangeText={onDescriptionChange}
            placeholder="What's this group about?"
            placeholderTextColor={colors.textMuted}
            maxLength={280}
            multiline
            inputContainerStyle={styles.fieldInputWrapMultiline}
            inputStyle={styles.fieldInputMultiline}
            accessibilityLabel="Group description input"
            accessibilityHint="Enter an optional description for the group"
          />
          <Text style={styles.charCount}>{description.length}/280</Text>
        </View>

        <View style={styles.participantSection}>
          <View style={styles.participantHeader}>
            <Text style={styles.fieldLabel}>{selectedIds.length} member{selectedIds.length === 1 ? '' : 's'}</Text>
          </View>
          {selectedIds.map((id) => {
            const user = selectedUsers.get(id);
            const displayName = user?.displayName ?? user?.username ?? 'User';
            return (
              <View key={id} style={styles.participantRow}>
                {user?.avatar ? (
                  <CachedImage uri={user.avatar} style={styles.participantAvatar} contentFit="cover" />
                ) : (
                  <View style={styles.participantAvatarPlaceholder}>
                    <Text style={styles.participantAvatarText}>{displayName[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                )}
                <View style={styles.participantTextWrap}>
                  <Text style={styles.participantName} numberOfLines={1}>{displayName}</Text>
                  <Text style={styles.participantHandle} numberOfLines={1}>@{user?.username}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </KeyboardAwareStickyAction>
      <GroupMediaSourceSheet
        visible={mediaSheetVisible}
        onClose={onCloseMediaSheet}
        onSelect={onSelectMediaSource}
        title={mediaSheetTarget === 'avatar' ? 'Group photo' : 'Cover photo'}
        presets={getAestheticPresets(mediaSheetTarget)}
        onSelectPreset={onSelectPreset}
      />
    </FlagshipScreen>
  );
}
