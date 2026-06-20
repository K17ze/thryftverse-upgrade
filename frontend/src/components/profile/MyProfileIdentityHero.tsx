import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Typography, Space } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';

const AVATAR_SIZE = 96;

interface MyProfileIdentityHeroProps {
  avatarUri: string | null;
  displayName: string;
  username: string;
  bio?: string;
  location?: string;
  memberSince?: string;
  onEditAvatar: () => void;
  onEditProfile: () => void;
  onShare: () => void;
}

export function MyProfileIdentityHero({
  avatarUri,
  displayName,
  username,
  bio,
  location,
  memberSince,
  onEditAvatar,
  onEditProfile,
  onShare,
}: MyProfileIdentityHeroProps) {
  const contextParts: string[] = [];
  if (location) contextParts.push(location);
  if (memberSince) contextParts.push(`Member since ${memberSince}`);

  return (
    <View style={styles.container}>
      {/* Avatar — overlaps cover edge */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarWrap}>
          {avatarUri ? (
            <CachedImage
              uri={avatarUri}
              style={styles.avatar}
              containerStyle={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Ionicons name="person" size={36} color={Colors.textMuted} />
            </View>
          )}
          <Pressable
            style={styles.editAvatarBtn}
            onPress={onEditAvatar}
            accessibilityLabel="Edit avatar"
            accessibilityRole="button"
          >
            <Ionicons name="camera" size={13} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Identity */}
      <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
      <Text style={styles.username} numberOfLines={1}>@{username}</Text>

      {bio ? (
        <Text style={styles.bio}>{bio}</Text>
      ) : null}

      {contextParts.length > 0 ? (
        <Text style={styles.contextLine} numberOfLines={1}>{contextParts.join(' · ')}</Text>
      ) : null}

      {/* Action row */}
      <View style={styles.actionRow}>
        <AnimatedPressable
          style={styles.editBtn}
          onPress={onEditProfile}
          activeOpacity={0.85}
          accessibilityLabel="Edit profile"
          accessibilityRole="button"
        >
          <Text style={styles.editBtnText}>Edit profile</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={styles.shareBtn}
          onPress={onShare}
          activeOpacity={0.85}
          accessibilityLabel="Share profile"
          accessibilityRole="button"
        >
          <Ionicons name="share-outline" size={16} color={Colors.textPrimary} />
          <Text style={styles.shareBtnText}>Share</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
    alignItems: 'center',
  },
  avatarSection: {
    marginBottom: Space.sm,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: Colors.background,
  },
  avatarFallback: {
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editAvatarBtn: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  displayName: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    textAlign: 'center',
    marginBottom: 2,
  },
  username: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    marginBottom: Space.sm,
  },
  bio: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: Colors.textPrimary,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: Space.sm,
    paddingHorizontal: Space.sm,
  },
  contextLine: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    marginBottom: Space.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  editBtn: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textInverse,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: 18,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  shareBtnText: {
    fontSize: 14,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
});
