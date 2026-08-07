import React from 'react';
import { View, Text, StyleSheet, Dimensions, ViewStyle, ActivityIndicator, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Typography, Type } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { ImageEmptyGraphic } from '../ImageEmptyGraphic';
import { ActiveTheme } from '../../constants/colors';
import { FACE_FOCAL_POINT } from '../../utils/media';
import { AnimatedPressable } from '../AnimatedPressable';
import { Video, ResizeMode } from '../compat/Video';

const { width: SCREEN_W } = Dimensions.get('window');

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
  const effectiveCover = coverVideoUri || coverUri;
  const hasCover = Boolean(effectiveCover);
  const showCoverError = coverError != null && !isUploadingCover;

  return (
    <View style={[styles.root, style]}>
      {/* Cover */}
      <View style={[styles.coverWrap, { height: coverHeight }]}>
        {coverVideoUri ? (
          <Video
            source={{ uri: coverVideoUri }}
            style={[styles.coverImage, { height: coverHeight }]}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            isMuted
          />
        ) : hasCover ? (
          <CachedImage
            uri={effectiveCover!}
            style={[styles.coverImage, { height: coverHeight }]}
            contentFit="cover"
            transition={400}
            cacheBuster={cacheBuster}
          />
        ) : (
          <ImageEmptyGraphic
            icon="image-outline"
            width={SCREEN_W}
            height={coverHeight}
            style={styles.coverFallback}
          />
        )}

        {/* Bottom gradient for text legibility */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.45)']}
          style={styles.coverGradient}
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
          >
            <View style={styles.editCoverVisible}>
              {isUploadingCover ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="image-outline" size={17} color="#fff" />
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
                transition={300}
                focalPoint={FACE_FOCAL_POINT}
                cacheBuster={cacheBuster}
              />
            ) : (
              <View style={[styles.avatarImage, styles.avatarFallback]}>
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
                  size={32}
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
              >
                {isUploadingAvatar ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={14} color="#fff" />
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
    width: SCREEN_W,
  },
  coverWrap: {
    width: SCREEN_W,
    height: DEFAULT_COVER_H,
    position: 'relative',
    overflow: 'hidden',
  },
  coverImage: {
    width: SCREEN_W,
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
    right: 16,
    bottom: 14,
    width: 44,
    height: 44,
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  coverErrorRow: {
    position: 'absolute',
    right: 16,
    bottom: 14,
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.lg,
  },
  coverErrorText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.danger,
  },
  coverErrorActions: {
    flexDirection: 'row',
    gap: 8,
  },
  coverErrorBtn: {
    paddingHorizontal: 12,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.15)',
    minHeight: 44,
    justifyContent: 'center',
  },
  coverErrorBtnText: {
    fontSize: Type.captionElevated.size,
    fontFamily: Typography.family.semibold,
    color: '#fff',
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
    borderWidth: 4,
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
    right: 2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
});
