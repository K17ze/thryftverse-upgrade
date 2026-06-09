import React from 'react';
import { View, StyleSheet, Dimensions, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
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
}: FlagshipProfileMediaProps) {
  const effectiveCover = coverVideoUri || coverUri;
  const hasCover = Boolean(effectiveCover);

  return (
    <View style={[styles.root, style]}>
      {/* Cover */}
      <View style={styles.coverWrap}>
        {coverVideoUri ? (
          <Video
            source={{ uri: coverVideoUri }}
            style={styles.coverImage}
            resizeMode={ResizeMode.COVER}
            shouldPlay
            isLooping
            isMuted
          />
        ) : hasCover ? (
          <CachedImage
            uri={effectiveCover!}
            style={styles.coverImage}
            contentFit="cover"
            transition={400}
            cacheBuster={cacheBuster}
          />
        ) : (
          <View style={[styles.coverImage, styles.coverFallback]} />
        )}

        {/* Bottom gradient for text legibility */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.45)']}
          style={styles.coverGradient}
        />

        {/* Edit cover button */}
        {isSelf && onEditCover && (
          <AnimatedPressable
            style={styles.editCoverBtn}
            onPress={onEditCover}
            activeOpacity={0.85}
            hapticFeedback="light"
          >
            {isUploadingCover ? (
              <Reanimated.View entering={FadeIn}>
                <Ionicons name="sync" size={18} color="#fff" />
              </Reanimated.View>
            ) : (
              <Ionicons name="camera" size={18} color="#fff" />
            )}
          </AnimatedPressable>
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
              >
                {isUploadingAvatar ? (
                  <Reanimated.View entering={FadeIn}>
                    <Ionicons name="sync" size={14} color="#fff" />
                  </Reanimated.View>
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

const COVER_H = 220;
const AVATAR_SIZE = 104;

const styles = StyleSheet.create({
  root: {
    width: SCREEN_W,
  },
  coverWrap: {
    width: SCREEN_W,
    height: COVER_H,
    position: 'relative',
    overflow: 'hidden',
  },
  coverImage: {
    width: SCREEN_W,
    height: COVER_H,
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
    right: Space.md,
    bottom: Space.md,
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
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
