import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Type, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { User } from '../../store/useStore';

export interface IdentityCardProps {
  user: User | null;
  onPress?: () => void;
}

export function IdentityCard({ user, onPress }: IdentityCardProps) {
  const { colors } = useAppTheme();
  const avatarUri = (user as any)?.avatar || null;
  const displayName = user?.username ?? 'Not signed in';
  const hasRealReputation = user != null && ((user as any).rating != null || (user as any).reviewCount != null);
  const reputationLabel = hasRealReputation
    ? `${(user as any).rating?.toFixed(1) ?? '0.0'} · ${(user as any).reviewCount ?? 0} reviews`
    : null;

  return (
    <AnimatedPressable
      onPress={onPress}
      activeOpacity={0.85}
      scaleValue={0.98}
      hapticFeedback="light"
    >
      <View style={styles.root}>
        {avatarUri ? (
          <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}>
            <CachedImage uri={avatarUri} style={styles.avatarImage} contentFit="cover" />
          </View>
        ) : (
          <View style={[styles.avatarFallback, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[styles.avatarInitial, { color: colors.textPrimary }]}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.text}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{displayName}</Text>
          {reputationLabel ? (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>{reputationLabel}</Text>
          ) : (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>Manage your account details, privacy and security</Text>
          )}
          {(user as any)?.isVerified && (
            <View style={[styles.verifiedRow, { backgroundColor: `${colors.success}18` }]}>
              <Ionicons name="checkmark-circle" size={12} color={colors.success} />
              <Text style={[styles.verifiedLabel, { color: colors.success }]}>Verified</Text>
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>
    </AnimatedPressable>
  );
}

const AVATAR_SIZE = 64;
const AVATAR_RADIUS = AVATAR_SIZE / 2;

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Space.md,
    gap: Space.md,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_RADIUS,
    overflow: 'hidden',
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_RADIUS,
  },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_RADIUS,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 24,
    fontFamily: Typography.family.bold,
  },
  text: {
    flex: 1,
  },
  name: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.subtitle.letterSpacing,
    lineHeight: Type.subtitle.lineHeight,
  },
  meta: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    marginTop: 2,
    letterSpacing: Type.caption.letterSpacing,
    lineHeight: Type.caption.lineHeight,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
  },
  verifiedLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: Type.meta.letterSpacing,
  },
});
