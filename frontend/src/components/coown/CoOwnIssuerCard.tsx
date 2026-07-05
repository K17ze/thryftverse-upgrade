import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';

export interface CoOwnIssuerCardProps {
  username: string;
  avatarUri?: string | null;
  verified?: boolean;
  rating?: number | null;
  reviewCount?: number | null;
  location?: string | null;
  memberSince?: string | null;
  isFollowing?: boolean;
  onPress?: () => void;
  onMessage?: () => void;
  canMessage?: boolean;
}

export function CoOwnIssuerCard({
  username,
  avatarUri,
  verified,
  rating,
  reviewCount,
  location,
  memberSince,
  isFollowing,
  onPress,
  onMessage,
  canMessage,
}: CoOwnIssuerCardProps) {
  const { colors } = useAppTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Issuer ${username}${verified ? ', verified' : ''}${rating ? `, rating ${rating} stars` : ''}`}
    >
      <View style={[styles.root, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.avatarWrap}>
          {avatarUri ? (
            <CachedImage uri={avatarUri} style={styles.avatar} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.surfaceAlt }]}>
              <Ionicons name="person" size={22} color={colors.textMuted} />
            </View>
          )}
        </View>

        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={[styles.username, { color: colors.textPrimary }]} numberOfLines={1}>{username}</Text>
            {verified ? (
              <Ionicons name="checkmark-circle" size={15} color={colors.brand} />
            ) : null}
          </View>
          <Text style={[styles.role, { color: colors.textSecondary }]}>Co-Own issuer</Text>

          <View style={styles.statsRow}>
            {rating != null ? (
              <View style={styles.statItem}>
                <Ionicons name="star" size={12} color={colors.brand} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>
                  {rating.toFixed(1)}{reviewCount != null ? ` (${reviewCount})` : ''}
                </Text>
              </View>
            ) : null}
            {location ? (
              <View style={styles.statItem}>
                <Ionicons name="location-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.statText, { color: colors.textSecondary }]} numberOfLines={1}>{location}</Text>
              </View>
            ) : null}
            {memberSince ? (
              <View style={styles.statItem}>
                <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                <Text style={[styles.statText, { color: colors.textSecondary }]}>Since {memberSince}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {onMessage && canMessage ? (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onMessage(); }}
            style={[styles.msgBtn, { borderColor: colors.border }]}
            accessibilityRole="button"
            accessibilityLabel={`Message ${username}`}
          >
            <Ionicons name="chatbubble-outline" size={18} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    borderRadius: Radius.lg,
    borderWidth: 0.5,
    padding: Space.md,
  },
  avatarWrap: {
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  username: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  role: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
  },
  msgBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
