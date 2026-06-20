import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';

const { width: SCREEN_W } = Dimensions.get('window');
const COVER_H = 150;
const AVATAR_SIZE = 86;

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
  const contextParts: string[] = [];
  if (location) contextParts.push(location);
  if (memberSince) contextParts.push(`Member since ${memberSince}`);

  return (
    <View style={styles.container}>
      {/* Cover */}
      <View style={styles.coverWrap}>
        {coverUri ? (
          <CachedImage
            uri={coverUri}
            style={styles.coverImage}
            contentFit="cover"
            transition={300}
          />
        ) : (
          <View style={[styles.coverImage, styles.coverFallback]} />
        )}

        {/* Edit cover button */}
        <Pressable
          style={styles.editCoverBtn}
          onPress={onEditCover}
          accessibilityRole="button"
          accessibilityLabel="Change cover photo"
        >
          {isUploadingCover ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="camera" size={18} color="#fff" />
          )}
        </Pressable>
      </View>

      {/* Avatar row */}
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
              <Ionicons name="person" size={28} color={Colors.textMuted} />
            </View>
          )}

          {/* Edit avatar button */}
          <Pressable
            style={styles.editAvatarBtn}
            onPress={onEditAvatar}
            accessibilityRole="button"
            accessibilityLabel="Change avatar photo"
          >
            {isUploadingAvatar ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="camera" size={14} color="#fff" />
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
          <Text style={styles.bio} numberOfLines={3}>{bio}</Text>
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
    width: SCREEN_W,
    backgroundColor: Colors.background,
  },
  coverWrap: {
    width: SCREEN_W,
    height: COVER_H,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
  },
  coverImage: {
    width: SCREEN_W,
    height: COVER_H,
  },
  coverFallback: {
    backgroundColor: Colors.surfaceAlt,
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
    width: 32,
    height: 32,
    borderRadius: 16,
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
    fontSize: 20,
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
