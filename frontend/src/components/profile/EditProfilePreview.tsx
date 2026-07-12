import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';
import { Typography, Space } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';

const COVER_H = 120;
const AVATAR_SIZE = 76;

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
}: EditProfilePreviewProps) {
  const { width: SCREEN_W } = useWindowDimensions();
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
              <Ionicons name="image-outline" size={20} color={Colors.textMuted} />
              <Text style={styles.coverFallbackText}>Add a cover photo</Text>
            </View>
          </View>
        )}

        {/* Bottom gradient for button legibility (only over real media) */}
        {coverUri ? (
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.35)']}
            style={styles.coverGradient}
          />
        ) : null}

        {/* Edit cover button — primary control on the preview */}
        <Pressable
          style={[styles.editCoverBtn, !coverUri && styles.editCoverBtnEmpty]}
          onPress={onEditCover}
          accessibilityRole="button"
          accessibilityLabel="Change cover photo"
          disabled={isUploadingCover}
        >
          {isUploadingCover ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="camera" size={18} color={coverUri ? '#fff' : Colors.textSecondary} />
          )}
        </Pressable>
      </View>

      {/* Avatar row — stable negative overlap */}
      <View style={styles.avatarRow}>
        <View style={styles.avatarWrap}>
          {avatarUri ? (
            <CachedImage
              uri={avatarUri}
              style={styles.avatarImage}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <View style={[styles.avatarImage, styles.avatarFallback]}>
              <Ionicons name="person" size={26} color={Colors.textMuted} />
            </View>
          )}

          {/* Edit avatar button — primary control on the preview */}
          <Pressable
            style={styles.editAvatarBtn}
            onPress={onEditAvatar}
            accessibilityRole="button"
            accessibilityLabel="Change avatar photo"
            disabled={isUploadingAvatar}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {isUploadingAvatar ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="camera" size={13} color="#fff" />
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

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.background,
  },
  coverWrap: {
    height: COVER_H,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  coverImage: {
    height: COVER_H,
  },
  coverFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFallbackInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coverFallbackText: {
    fontSize: 12,
    fontFamily: Typography.family.medium,
    color: Colors.textMuted,
  },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
  },
  editCoverBtn: {
    position: 'absolute',
    right: Space.md,
    bottom: Space.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  editCoverBtnEmpty: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  avatarRow: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    marginTop: -(AVATAR_SIZE / 2),
  },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: Colors.background,
    backgroundColor: Colors.surface,
    overflow: 'visible',
    position: 'relative',
  },
  avatarImage: {
    width: AVATAR_SIZE - 6,
    height: AVATAR_SIZE - 6,
    borderRadius: (AVATAR_SIZE - 6) / 2,
  },
  avatarFallback: {
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editAvatarBtn: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  identityCol: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  displayName: {
    fontSize: 19,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  username: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  bio: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    lineHeight: 20,
    marginBottom: 4,
  },
  contextText: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
});
