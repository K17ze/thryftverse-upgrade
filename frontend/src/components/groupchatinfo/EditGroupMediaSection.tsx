/**
 * EditGroupMediaSection — the editable identity media for the edit-group
 * screen: the full-width cover banner (3:1) and the circular group avatar
 * with camera badges, upload spinners and change/remove actions.
 * Presentation only; pick/remove wiring and upload state stay in the
 * orchestrator via useEditGroupMedia. Extracted verbatim from
 * EditGroupScreen.
 */

import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { GroupAvatarMosaic, type MosaicMember } from '../chat/GroupAvatarMosaic';
import { Control, Radius, Space, Typography } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface EditGroupMediaSectionProps {
  coverDisplayUri: string | null;
  isUploadingCover: boolean;
  avatarDisplayUri: string | null;
  isUploadingPhoto: boolean;
  isSaving: boolean;
  mosaicMembers: MosaicMember[];
  fallbackInitials: string;
  groupId: string;
  onPickCover: () => void;
  onRemoveCover: () => void;
  onPickAvatar: () => void;
  onRemoveAvatar: () => void;
}

export function EditGroupMediaSection({
  coverDisplayUri,
  isUploadingCover,
  avatarDisplayUri,
  isUploadingPhoto,
  isSaving,
  mosaicMembers,
  fallbackInitials,
  groupId,
  onPickCover,
  onRemoveCover,
  onPickAvatar,
  onRemoveAvatar,
}: EditGroupMediaSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      {/* Cover photo — full-width banner (3:1 aspect), separate from the
          circular avatar. Standard group edit pattern. */}
      <View style={styles.coverSection}>
        <AnimatedPressable
          onPress={onPickCover}
          disabled={isUploadingCover || isSaving}
          style={styles.coverTarget}
          scaleValue={0.99}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={coverDisplayUri ? 'Change cover photo' : 'Add cover photo'}
          accessibilityHint="Choose a wide cover image from camera or gallery"
          accessibilityState={{ busy: isUploadingCover, disabled: isSaving }}
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
              <AppIcon name="image" size="xl" color="textMuted" accessible={false} />
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
              <AppIcon name="camera" variant="filled" size="sm" color="scrimTextPrimary" accessible={false} />
            )}
          </View>
        </AnimatedPressable>
        {coverDisplayUri ? (
          <View style={styles.coverActions}>
            <AnimatedPressable
              onPress={onPickCover}
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
              onPress={onRemoveCover}
              disabled={isSaving}
              style={styles.coverActionBtn}
              activeOpacity={0.65}
              scaleValue={0.98}
              accessibilityRole="button"
              accessibilityLabel="Remove cover photo"
            >
              <Text style={[styles.coverActionText, { color: colors.textMuted }]}>Remove</Text>
            </AnimatedPressable>
          </View>
        ) : null}
      </View>

      {/* Group avatar — circular profile picture, separate from cover */}
      <View style={styles.identity}>
        <AnimatedPressable
          onPress={onPickAvatar}
          disabled={isUploadingPhoto || isSaving}
          style={styles.avatarTarget}
          scaleValue={0.98}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={avatarDisplayUri ? 'Change group photo' : 'Add group photo'}
          accessibilityHint="Choose from camera or gallery"
          accessibilityState={{ busy: isUploadingPhoto, disabled: isSaving }}
        >
          <GroupAvatarMosaic
            members={mosaicMembers}
            groupPhoto={avatarDisplayUri}
            fallbackInitials={fallbackInitials}
            groupId={groupId}
            size={96}
          />
          <View style={styles.cameraBadge}>
            {isUploadingPhoto ? (
              <ActivityIndicator size="small" color={colors.textInverse} />
            ) : (
              <AppIcon name="camera" variant="filled" size="sm" color="textInverse" accessible={false} />
            )}
          </View>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.photoAction}
          onPress={onPickAvatar}
          disabled={isUploadingPhoto || isSaving}
          activeOpacity={0.65}
          scaleValue={0.98}
          accessibilityRole="button"
          accessibilityLabel={avatarDisplayUri ? 'Change group photo' : 'Add group photo'}
          accessibilityState={{ busy: isUploadingPhoto, disabled: isSaving }}
        >
          <Text style={styles.photoActionText}>
            {isUploadingPhoto ? 'Uploading…' : avatarDisplayUri ? 'Change photo' : 'Add group photo'}
          </Text>
        </AnimatedPressable>
        {avatarDisplayUri ? (
          <AnimatedPressable
            style={styles.removePhoto}
            onPress={onRemoveAvatar}
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
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    coverSection: {
      width: '100%',
    },
    coverTarget: {
      width: '100%',
      height: 200,
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
      fontSize: TypographyV2.meta.size,
      fontFamily: TypographyV2.meta.fontFamily,
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
      fontSize: TypographyV2.body.size,
      fontFamily: TypographyV2.body.fontFamily,
    },
    identity: {
      alignItems: 'center',
      paddingHorizontal: Space.md,
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
      fontSize: TypographyV2.body.size,
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
      fontSize: TypographyV2.meta.size,
    },
  });
}
