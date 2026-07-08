import React from 'react';
import { View, Text, StyleSheet, Dimensions, ViewStyle, ActivityIndicator, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
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
          <View style={[styles.coverImage, { height: coverHeight }, styles.coverFallback]} />
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
            {isUploadingCover ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="camera" size={18} color="#fff" />
            )}
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
                cacheBuster={cacheBuster}
              />
            ) : (
              <View style={[styles.avatarImage, styles.avatarFallback]}>
                <Ionicons name="person" size={32} color={Colors.textMuted} />
              </View>
            )}

            {isSelf && onEditAvatar && (
              <AnimatedPressable
                style={styles.editAvatarBtn}
                onPress={onEditAvatar}
                activeOpacity={0.85}
                hapticFeedback="light"
                disabled={isUploadingAvatar}
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

const styles = StyleSheet.create({
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
    backgroundColor: Colors.surfaceAlt,
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
    borderRadius: 22,
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
    borderRadius: 10,
  },
  coverErrorText: {
    fontSize: 12,
    fontFamily: Typography.family.semibold,
    color: '#ff6b6b',
  },
  coverErrorActions: {
    flexDirection: 'row',
    gap: 8,
  },
  coverErrorBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    minHeight: 36,
    justifyContent: 'center',
  },
  coverErrorBtnText: {
    fontSize: 13,
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
    borderColor: Colors.background,
    backgroundColor: Colors.surface,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImage: {
    width: AVATAR_SIZE - 8,
    height: AVATAR_SIZE - 8,
    borderRadius: Radius.full,
  },
  avatarFallback: {
    backgroundColor: Colors.surfaceAlt,
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
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
});