/**
 * GroupInfoHero — group identity header: optional full-width cover banner,
 * overlapping avatar mosaic, name, member count and description.
 *
 * Media is the anchor: when a cover exists it owns the first viewport and
 * the avatar overlaps it; without one the avatar stands alone. Edit badges
 * only render for members with the edit-group-info capability.
 */

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { AppIcon } from '../common/AppIcon';
import { GroupAvatarMosaic } from '../chat/GroupAvatarMosaic';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { FontFamily, Radius, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

export interface GroupInfoHeroMember {
  id: string;
  displayName: string;
  avatar: string | null;
}

export interface GroupInfoHeroProps {
  title: string;
  groupId: string;
  coverPhoto?: string | null;
  avatarUri?: string | null;
  members: GroupInfoHeroMember[];
  memberCount: number;
  agentCount: number;
  description?: string;
  canEdit: boolean;
  onEditCover: () => void;
  onEditAvatar: () => void;
  onEditDescription: () => void;
}

export function GroupInfoHero({
  title,
  groupId,
  coverPhoto,
  avatarUri,
  members,
  memberCount,
  agentCount,
  description,
  canEdit,
  onEditCover,
  onEditAvatar,
  onEditDescription,
}: GroupInfoHeroProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <>
      {coverPhoto ? (
        <View style={styles.heroSection}>
          <View style={styles.coverWrap}>
            <CachedImage
              uri={coverPhoto}
              style={styles.coverImage}
              contentFit="cover"
              downscaleWidth={720}
            />
            {canEdit && (
              <AnimatedPressable
                style={styles.coverEditBadge}
                onPress={onEditCover}
                activeOpacity={0.7}
                scaleValue={0.94}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Change cover photo"
              >
                <AppIcon name="camera" size="sm" color="scrimTextPrimary" accessible={false} />
              </AnimatedPressable>
            )}
          </View>
          <View style={styles.heroAvatarOverlap}>
            <View style={styles.heroAvatarWrap}>
              <GroupAvatarMosaic
                members={members}
                groupPhoto={avatarUri}
                fallbackInitials={title || 'Group'}
                groupId={groupId}
                size={96}
              />
              {canEdit && (
                <AnimatedPressable
                  style={styles.avatarEditBadge}
                  onPress={onEditAvatar}
                  activeOpacity={0.7}
                  scaleValue={0.94}
                  hapticFeedback="light"
                  accessibilityRole="button"
                  accessibilityLabel="Change group photo"
                >
                  <AppIcon name="camera" variant="filled" size="sm" color="textInverse" accessible={false} />
                </AnimatedPressable>
              )}
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.heroAvatarContainer}>
          <View style={styles.heroAvatarWrap}>
            <GroupAvatarMosaic
              members={members}
              groupPhoto={avatarUri}
              fallbackInitials={title || 'Group'}
              groupId={groupId}
              size={104}
            />
            {canEdit && (
              <AnimatedPressable
                style={styles.avatarEditBadge}
                onPress={onEditAvatar}
                activeOpacity={0.7}
                scaleValue={0.94}
                hapticFeedback="light"
                accessibilityRole="button"
                accessibilityLabel="Add group photo"
              >
                <AppIcon name="camera" variant="filled" size="sm" color="textInverse" accessible={false} />
              </AnimatedPressable>
            )}
          </View>
        </View>
      )}

      <View style={styles.identity}>
        <Text style={styles.groupName} numberOfLines={1}>
          {title || 'Group chat'}
        </Text>

        <Text style={styles.identityMeta}>
          Group · <Text style={{ color: colors.brand, fontFamily: FontFamily.bold }}>{memberCount} members</Text>
          {agentCount > 0 ? ` · ${agentCount} agent connected` : ''}
        </Text>

        {description ? (
          <Pressable
            onPress={() => {
              if (canEdit) onEditDescription();
            }}
            style={styles.descriptionWrap}
            accessibilityRole="button"
            accessibilityLabel="Group description"
            hitSlop={8}
          >
            <Text style={styles.descriptionText} numberOfLines={3}>
              {description}
            </Text>
            {canEdit && (
              <AppIcon name="pencil-outline" size="xs" color="textMuted" style={styles.descPencil} accessible={false} />
            )}
          </Pressable>
        ) : canEdit ? (
          <Pressable
            onPress={onEditDescription}
            style={styles.addDescriptionPill}
            accessibilityRole="button"
            accessibilityLabel="Add group description"
            hitSlop={8}
          >
            <AppIcon name="plus" size="xs" color="brand" accessible={false} />
            <Text style={styles.addDescriptionText}>Add group description</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
  });
}
