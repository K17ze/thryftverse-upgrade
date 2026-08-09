import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Typography, Space, Type } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';

const AVATAR_SIZE = 96;

interface PublicProfileIdentityHeroProps {
  avatarUri: string | null;
  displayName: string;
  username: string;
  bio?: string | null;
  location?: string | null;
  memberSince?: string;
  listingCount: number;
}

export function PublicProfileIdentityHero({
  avatarUri,
  displayName,
  username,
  bio,
  location,
  memberSince,
  listingCount,
}: PublicProfileIdentityHeroProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const contextParts: string[] = [];
  if (location) contextParts.push(location);
  if (memberSince) contextParts.push(`Member since ${memberSince}`);

  return (
    <View style={styles.container}>
      <View style={styles.avatarRow}>
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
              <Ionicons name="person" size={36} color={colors.textMuted} />
            </View>
          )}
        </View>

        <View style={styles.identityCol}>
          <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
          <Text style={styles.username} numberOfLines={1}>@{username}</Text>
        </View>
      </View>

      {bio ? (
        <Text style={styles.bio}>{bio}</Text>
      ) : null}

      <View style={styles.contextRow}>
        {contextParts.length > 0 && (
          <Text style={styles.contextText} numberOfLines={1}>
            {contextParts.join(' · ')}
          </Text>
        )}
        {contextParts.length > 0 && listingCount > 0 && (
          <Text style={styles.contextSep}>·</Text>
        )}
        {listingCount > 0 && (
          <Text style={styles.contextText}>
            {listingCount} listing{listingCount !== 1 ? 's' : ''}
          </Text>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    paddingBottom: Space.sm,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md + 2,
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
    borderColor: colors.background,
  },
  avatarFallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCol: {
    flex: 1,
  },
  displayName: {
    fontSize: Type.title.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: Type.title.letterSpacing,
    marginBottom: 2,
  },
  username: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textSecondary,
  },
  bio: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    color: colors.textPrimary,
    lineHeight: Type.body.lineHeight,
    marginBottom: Space.sm,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    flexWrap: 'wrap',
  },
  contextText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  contextSep: {
    fontSize: Type.caption.size,
    color: colors.textMuted,
  },
  });
}
