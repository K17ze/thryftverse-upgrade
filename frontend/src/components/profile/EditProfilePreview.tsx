import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, AvatarSize, ProfileLayout, Scrim } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CachedImage } from '../CachedImage';
import { UploadProgressRing, useLingeringActive } from '../flagship/FlagshipProfileMedia';

const COVER_H = ProfileLayout.coverHeightEdit;
const AVATAR_SIZE = AvatarSize.edit;

interface EditProfilePreviewProps {
  coverUri: string;
  avatarUri: string;
  displayName: string;
  username: string;
  bio: string;
  location?: string | null;
  memberSince?: string;
  onEditCover: () => void;
  onEditAvatar: () => void;
  isUploadingCover: boolean;
  isUploadingAvatar: boolean;
  /** Real byte progress 0–1 for the cover upload — drives the determinate ring. */
  coverUploadProgress?: number;
  /** Real byte progress 0–1 for the avatar upload — drives the determinate ring. */
  avatarUploadProgress?: number;
  hasCoverError?: boolean;
  hasAvatarError?: boolean;
}

export function EditProfilePreview({
  coverUri,
  avatarUri,
  displayName,
  username,
  bio,
  location,
  memberSince,
  onEditCover,
  onEditAvatar,
  isUploadingCover,
  isUploadingAvatar,
  coverUploadProgress,
  avatarUploadProgress,
  hasCoverError = false,
  hasAvatarError = false }: EditProfilePreviewProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { width: SCREEN_W } = useWindowDimensions();
  // Rings linger briefly after completion so the fade reads as a transition.
  const showCoverRing = useLingeringActive(isUploadingCover);
  const showAvatarRing = useLingeringActive(isUploadingAvatar);
  const contextParts: string[] = [];
  if (location) contextParts.push(location);
  if (memberSince) contextParts.push(`Member since ${memberSince}`);

  return (
    <View style={[styles.container, { width: SCREEN_W }]}>
      {/* Cover — compact, deterministic. Subtle surface when no cover exists. */}
      <View style={[styles.coverWrap, { width: SCREEN_W }]}>
        {coverUri ? (
          <CachedImage
            uri={coverUri}
            style={[styles.coverImage, { width: SCREEN_W }]}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View style={[styles.coverImage, styles.coverFallback, { width: SCREEN_W }]}>
            <View style={styles.coverFallbackInner}>
              <Ionicons name="image-outline" size={20} color={colors.textMuted} />
              <Text style={styles.coverFallbackText}>Add a cover photo</Text>
            </View>
          </View>
        )}

        {/* Bottom gradient for button legibility (only over real media) */}
        {coverUri ? (
          <LinearGradient
            colors={Scrim.bottom.colors}
            locations={Scrim.bottom.locations}
            style={styles.coverGradient}
          />
        ) : null}

        {/* Edit cover button — primary control on the preview */}
        <Pressable
          style={({ pressed }) => [
            styles.editCoverBtn,
            !coverUri && styles.editCoverBtnEmpty,
            hasCoverError && styles.editCoverBtnError,
            pressed && { opacity: 0.6 },
          ]}
          onPress={onEditCover}
          accessibilityRole="button"
          accessibilityLabel="Change cover photo"
          disabled={isUploadingCover}
        >
          {showCoverRing ? (
            <UploadProgressRing
              progress={coverUploadProgress}
              active={isUploadingCover}
              size={28}
            />
          ) : hasCoverError ? (
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
          ) : (
            <Ionicons name="camera" size={18} color={coverUri ? colors.textInverse : colors.textSecondary} />
          )}
        </Pressable>
      </View>

      {/* Avatar row — stable negative overlap */}
      <View style={styles.avatarRow}>
        <View style={[styles.avatarWrap, hasAvatarError && styles.avatarWrapError]}>
          {avatarUri ? (
            <CachedImage
              uri={avatarUri}
              style={styles.avatarImage}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <View style={[styles.avatarImage, styles.avatarFallback]}>
              <Ionicons name="person" size={26} color={colors.textMuted} />
            </View>
          )}

          {/* Edit avatar button — primary control on the preview */}
          <Pressable
            style={({ pressed }) => [styles.editAvatarBtn, hasAvatarError && styles.editAvatarBtnError, pressed && { opacity: 0.6 }]}
            onPress={onEditAvatar}
            accessibilityRole="button"
            accessibilityLabel="Change avatar photo"
            disabled={isUploadingAvatar}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {showAvatarRing ? (
              <UploadProgressRing
                progress={avatarUploadProgress}
                active={isUploadingAvatar}
                size={20}
              />
            ) : hasAvatarError ? (
              <Ionicons name="alert-circle" size={13} color={colors.danger} />
            ) : (
              <Ionicons name="camera" size={13} color={colors.textInverse} />
            )}
          </Pressable>
        </View>
      </View>

      {/* Live identity text */}
      <View style={styles.identityCol}>
        <Text style={styles.displayName} numberOfLines={1}>
          {displayName || 'Your name'}
        </Text>
        <Text style={styles.username} numberOfLines={1}>
          @{username || 'username'}
        </Text>
        {bio ? (
          <Text style={styles.bio} numberOfLines={2}>{bio}</Text>
        ) : null}
        {contextParts.length > 0 ? (
          <Text style={styles.contextText} numberOfLines={1}>
            {contextParts.join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    backgroundColor: colors.background },
  coverWrap: {
    height: COVER_H,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt },
  coverImage: {
    height: COVER_H },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center' },
  coverFallbackInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2 },
  coverFallbackText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 50 },
  editCoverBtn: {
    position: 'absolute',
    right: Space.md,
    bottom: Space.md,
    width: 44,
    height: 44,
    borderRadius: Radius.xxl,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Stroke.standard,
    borderColor: colors.scrimTextSecondary },
  editCoverBtnEmpty: {
    backgroundColor: colors.surface,
    borderColor: colors.border },
  editCoverBtnError: {
    borderColor: colors.danger },
  avatarRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    marginTop: -(AVATAR_SIZE / 2) },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: Stroke.emphasis,
    borderColor: colors.background,
    backgroundColor: colors.surface,
    overflow: 'visible',
    position: 'relative' },
  avatarWrapError: {
    borderColor: colors.danger },
  avatarImage: {
    width: AVATAR_SIZE - Stroke.emphasis * 2,
    height: AVATAR_SIZE - Stroke.emphasis * 2,
    borderRadius: (AVATAR_SIZE - Stroke.emphasis * 2) / 2 },
  avatarFallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center' },
  editAvatarBtn: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: Radius.xl,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Stroke.emphasis,
    borderColor: colors.background },
  editAvatarBtnError: {
    backgroundColor: colors.danger },
  identityCol: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm },
  displayName: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 2 },
  username: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary,
    marginBottom: Space.xs },
  bio: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    lineHeight: TypographyV2.body.lineHeight,
    marginBottom: Space.xs },
  contextText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted } });
}
