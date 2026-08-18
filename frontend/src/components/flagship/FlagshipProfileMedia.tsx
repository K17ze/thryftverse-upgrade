import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, ViewStyle, ActivityIndicator, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Typography, Type, IconGrammar, Control, Stroke, AvatarSize } from '../../theme/designTokens';
import { Motion } from '../../theme/motionTokens';
import { CachedImage } from '../CachedImage';
import { ImageEmptyGraphic } from '../ImageEmptyGraphic';
import { ActiveTheme } from '../../constants/colors';
import { FACE_FOCAL_POINT } from '../../utils/media';
import { AnimatedPressable } from '../AnimatedPressable';
import { Video, ResizeMode } from '../compat/Video';

interface FlagshipProfileMediaProps {
  coverUri?: string | null;
  avatarUri?: string | null;
  coverVideoUri?: string | null;
  isSelf?: boolean;
  onEditCover?: () => void;
  onEditAvatar?: () => void;
  isUploadingCover?: boolean;
  isUploadingAvatar?: boolean;
  style?: ViewStyle;
  cacheBuster?: string;
  coverOnly?: boolean;
  coverHeight?: number;
  coverError?: string | null;
  onRetryCover?: () => void;
  onRevertCover?: () => void;
}

export function FlagshipProfileMedia({
  coverUri,
  avatarUri,
  coverVideoUri,
  isSelf = false,
  onEditCover,
  onEditAvatar,
  isUploadingCover = false,
  isUploadingAvatar = false,
  style,
  cacheBuster,
  coverOnly = false,
  coverHeight = 220,
  coverError = null,
  onRetryCover,
  onRevertCover,
}: FlagshipProfileMediaProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { width: screenWidth } = useWindowDimensions();
  const effectiveCover = coverVideoUri || coverUri;
  const hasCover = Boolean(effectiveCover);
  const showCoverError = coverError != null && !isUploadingCover;
  // expo-video has known stability issues on web (null references in VideoView,
  // player initialization failures). Fall back to static image on web.
  const showVideo = coverVideoUri != null && Platform.OS !== 'web';
  // On web, prefer the static cover image over the video URI.
  const staticCover = Platform.OS === 'web' ? (coverUri ?? coverVideoUri) : effectiveCover;

  return (
    <View style={[styles.root, { width: screenWidth }, style]}>
      {/* Cover */}
      <View style={[styles.coverWrap, { height: coverHeight, width: screenWidth }]}>
        {showVideo ? (
          <Video
            source={{ uri: coverVideoUri }}
            style={[styles.coverImage, { height: coverHeight, width: screenWidth }]}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            isMuted
            accessibilityRole="image"
            accessibilityLabel="Profile cover video"
          />
        ) : hasCover ? (
          <CachedImage
            uri={staticCover!}
            style={[styles.coverImage, { height: coverHeight, width: screenWidth }]}
            contentFit="cover"
            transition={Motion.transitions.mediaLoad.duration}
            cacheBuster={cacheBuster}
            accessibilityRole="image"
            accessibilityLabel="Profile cover photo"
          />
        ) : (
          <ImageEmptyGraphic
            icon="image-outline"
            width={screenWidth}
            height={coverHeight}
            style={styles.coverFallback}
            accessibilityElementsHidden
          />
        )}

        {/* Bottom gradient for text legibility */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.45)']}
          style={styles.coverGradient}
          accessibilityElementsHidden
        />

        {/* Edit cover control — compact camera icon button */}
        {isSelf && onEditCover && !showCoverError && (
          <AnimatedPressable
            style={styles.editCoverBtn}
            onPress={onEditCover}
            activeOpacity={0.85}
            hapticFeedback="light"
            disabled={isUploadingCover}
            accessibilityLabel="Change profile cover"
            accessibilityRole="button"
            accessibilityHint="Opens your photo library to choose a new cover image"
          >
            <View style={styles.editCoverVisible}>
              {isUploadingCover ? (
                <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
              ) : (
                <Ionicons name="image-outline" size={IconGrammar.metadata} color={colors.scrimTextPrimary} />
              )}
            </View>
          </AnimatedPressable>
        )}

        {/* Cover upload failure controls */}
        {isSelf && showCoverError && (
          <View style={styles.coverErrorRow}>
            <Text style={styles.coverErrorText} numberOfLines={1}>Cover upload failed</Text>
            <View style={styles.coverErrorActions}>
              {onRetryCover && (
                <Pressable
                  style={styles.coverErrorBtn}
                  onPress={onRetryCover}
                  hitSlop={8}
                  accessibilityLabel="Retry cover upload"
                  accessibilityRole="button"
                >
                  <Text style={styles.coverErrorBtnText}>Retry</Text>
                </Pressable>
              )}
              {onRevertCover && (
                <Pressable
                  style={styles.coverErrorBtn}
                  onPress={onRevertCover}
                  hitSlop={8}
                  accessibilityLabel="Revert cover"
                  accessibilityRole="button"
                >
                  <Text style={styles.coverErrorBtnText}>Revert</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </View>

      {/* Avatar */}
      {!coverOnly && (
        <View style={styles.avatarRow}>
          <View style={styles.avatarWrap}>
            {avatarUri ? (
              <CachedImage
                uri={avatarUri}
                style={styles.avatarImage}
                contentFit="cover"
                transition={Motion.transitions.mediaLoad.duration}
                focalPoint={FACE_FOCAL_POINT}
                cacheBuster={cacheBuster}
                accessibilityRole="image"
                accessibilityLabel="Profile avatar"
              />
            ) : (
              <View style={[styles.avatarImage, styles.avatarFallback]} accessibilityElementsHidden>
                <LinearGradient
                  colors={ActiveTheme === 'light'
                    ? ['#F0EBE6', '#E2DDD6']
                    : ['#1F1F1F', '#161616']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons
                  name="person"
                  size={IconGrammar.hero}
                  color={ActiveTheme === 'light' ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.22)'}
                />
              </View>
            )}

            {isSelf && onEditAvatar && (
              <AnimatedPressable
                style={styles.editAvatarBtn}
                onPress={onEditAvatar}
                activeOpacity={0.85}
                hapticFeedback="light"
                disabled={isUploadingAvatar}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Change profile avatar"
                accessibilityRole="button"
                accessibilityHint="Opens your camera or photo library to choose a new avatar"
              >
                {isUploadingAvatar ? (
                  <ActivityIndicator size="small" color={colors.scrimTextPrimary} />
                ) : (
                  <Ionicons name="camera" size={IconGrammar.badge} color={colors.scrimTextPrimary} />
                )}
              </AnimatedPressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const DEFAULT_COVER_H = 220;
const AVATAR_SIZE = 104;

const createStyles = (colors: any) => StyleSheet.create({
  root: {
    width: '100%',
  },
  coverWrap: {
    width: '100%',
    height: DEFAULT_COVER_H,
    position: 'relative',
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: DEFAULT_COVER_H,
  },
  coverFallback: {
    backgroundColor: colors.surfaceAlt,
  },
  coverGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 100,
  },
  editCoverBtn: {
    position: 'absolute',
    right: Space.md,
    bottom: Space.smMd,
    width: Control.hit,
    height: Control.hit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCoverVisible: {
    width: 34,
    height: 34,
    borderRadius: Radius.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: Stroke.hairline,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  coverErrorRow: {
    position: 'absolute',
    right: Space.md,
    bottom: Space.smMd,
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: Space.xs,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.lg,
  },
  coverErrorText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.danger,
  },
  coverErrorActions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  coverErrorBtn: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    minHeight: Control.hit,
    justifyContent: 'center',
  },
  coverErrorBtnText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.scrimTextPrimary,
  },
  avatarRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    marginTop: -(AVATAR_SIZE / 2),
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: Radius.full,
    borderWidth: Stroke.emphasis * 2,
    borderColor: colors.background,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImage: {
    width: AVATAR_SIZE - 8,
    height: AVATAR_SIZE - 8,
    borderRadius: Radius.full,
  },
  avatarFallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editAvatarBtn: {
    position: 'absolute',
    right: Space.xs / 2,
    bottom: Space.xs / 2,
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Stroke.emphasis,
    borderColor: colors.background,
  },
});
