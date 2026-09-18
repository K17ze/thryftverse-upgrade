/**
 * EditGroupMediaSection — the editable identity media for the edit-group
 * screen: the full-width cover banner (3:1) and the circular group avatar
 * overlapping its bottom edge, with camera badges and upload spinners.
 * Tapping either object opens the media source sheet, which owns
 * change/remove — no duplicated text actions. Presentation only; pick
 * wiring and upload state stay in the orchestrator via useEditGroupMedia.
 */

import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { GroupAvatarMosaic, type MosaicMember } from '../chat/GroupAvatarMosaic';
import { Radius, Space } from '../../theme/designTokens';
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
  onPickAvatar: () => void;
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
  onPickAvatar,
}: EditGroupMediaSectionProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      {/* Cover + avatar as one composed identity block: the avatar
          straddles the cover's bottom edge (WhatsApp/Telegram/Discord
          group-edit pattern) with a background ring to lift it. Both
          media objects open the media source sheet, which owns the
          Camera/Gallery/preset/Remove action set — no duplicated text
          buttons under each object. */}
      <View style={styles.coverSection}>
        <AnimatedPressable
          onPress={onPickCover}
          disabled={isUploadingCover || isSaving}
          style={styles.coverTarget}
          scaleValue={0.99}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={coverDisplayUri ? 'Change cover photo' : 'Add cover photo'}
          accessibilityHint="Opens options for camera, gallery, presets and remove"
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
          <View style={styles.coverCameraBadge}>
            {isUploadingCover ? (
              <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
            ) : (
              <AppIcon name="camera" variant="filled" size="sm" color="scrimTextPrimary" accessible={false} />
            )}
          </View>
        </AnimatedPressable>
      </View>

      {/* Group avatar — overlaps the cover's bottom edge. The background
          ring is what makes the overlap read as intentional layering
          rather than a collision. */}
      <View style={styles.identity}>
        <AnimatedPressable
          onPress={onPickAvatar}
          disabled={isUploadingPhoto || isSaving}
          style={[styles.avatarTarget, { borderColor: colors.background }]}
          scaleValue={0.98}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={avatarDisplayUri ? 'Change group photo' : 'Add group photo'}
          accessibilityHint="Opens options for camera, gallery, presets and remove"
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
    identity: {
      alignItems: 'center',
      paddingHorizontal: Space.md,
      // The parent content column applies `gap: Space.lg` (24) between
      // siblings; a -64 top margin nets a 40px overlap over the cover —
      // a deliberate avatar-on-banner stack, not a collision.
      marginTop: -64,
      paddingBottom: Space.xs,
    },
    avatarTarget: {
      width: 104,
      height: 104,
      borderRadius: 52,
      borderWidth: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraBadge: {
      position: 'absolute',
      right: -2,
      bottom: 0,
      width: 32,
      height: 32,
      borderRadius: Radius.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand,
      borderWidth: 2,
      borderColor: colors.background,
    },
  });
}
