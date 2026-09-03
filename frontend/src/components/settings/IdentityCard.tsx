import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { User } from '../../store/useStore';

export interface IdentityCardProps {
  user: User | null;
  onPress?: () => void;
  variant?: 'default' | 'commanding';
}

export function IdentityCard({ user, onPress, variant = 'default' }: IdentityCardProps) {
  const { colors } = useAppTheme();
  const avatarUri = user?.avatar || null;
  const displayName = user?.username ?? 'Not signed in';
  const handle = user?.handle ?? user?.username ?? '';
  const hasRealReputation = user != null && (user.rating != null || user.reviewCount != null);
  const reputationLabel = hasRealReputation
    ? `${user.rating?.toFixed(1) ?? '0.0'} · ${user.reviewCount ?? 0} reviews`
    : null;
  const isCommanding = variant === 'commanding';

  return (
    <AnimatedPressable
      onPress={onPress}
      activeOpacity={0.85}
      scaleValue={0.98}
      hapticFeedback="light"
    >
      <View style={[styles.root, isCommanding && styles.rootCommanding]}>
        {avatarUri ? (
          <View style={[isCommanding ? styles.avatarLarge : styles.avatar, { backgroundColor: colors.surfaceAlt }]}>
            <CachedImage uri={avatarUri} style={isCommanding ? styles.avatarImageLarge : styles.avatarImage} contentFit="cover" />
          </View>
        ) : (
          <View style={[isCommanding ? styles.avatarFallbackLarge : styles.avatarFallback, { backgroundColor: colors.surfaceAlt }]}>
            <Text style={[isCommanding ? styles.avatarInitialLarge : styles.avatarInitial, { color: colors.textPrimary }]}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.text}>
          <Text style={[isCommanding ? styles.nameLarge : styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{displayName}</Text>
          {isCommanding && handle ? (
            <Text style={[styles.handle, { color: colors.textMuted }]}>@{handle}</Text>
          ) : null}
          {reputationLabel ? (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>{reputationLabel}</Text>
          ) : (
            <Text style={[styles.meta, { color: colors.textSecondary }]}>{isCommanding ? 'Tap to edit your profile' : 'Account details, privacy and security'}</Text>
          )}
          {user?.isVerified && (
            <View style={[styles.verifiedRow, { backgroundColor: colors.successSubtle }]}>
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
    gap: Space.md },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_RADIUS,
    overflow: 'hidden' },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_RADIUS },
  avatarFallback: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_RADIUS,
    justifyContent: 'center',
    alignItems: 'center' },
  avatarInitial: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily },
  text: {
    flex: 1 },
  name: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    letterSpacing: TypographyV2.sectionTitle.letterSpacing,
    lineHeight: TypographyV2.sectionTitle.lineHeight },
  meta: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: 2,
    letterSpacing: TypographyV2.meta.letterSpacing,
    lineHeight: TypographyV2.meta.lineHeight },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginTop: Space.xs,
    paddingVertical: Space.xs / 2,
    paddingHorizontal: Space.xs + 2,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start' },
  verifiedLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing },
  rootCommanding: {
    paddingVertical: Space.lg,
    paddingHorizontal: Space.md },
  avatarLarge: {
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
    borderRadius: Radius.full,
    overflow: 'hidden' },
  avatarImageLarge: {
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
    borderRadius: Radius.full },
  avatarFallbackLarge: {
    width: Space.xxl + Space.xxl + Space.xs,
    height: Space.xxl + Space.xxl + Space.xs,
    borderRadius: Radius.full,
    justifyContent: 'center',
    alignItems: 'center' },
  avatarInitialLarge: {
    fontSize: TypographyV2.display.size,
    fontFamily: TypographyV2.display.fontFamily },
  nameLarge: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    letterSpacing: TypographyV2.screenTitle.letterSpacing,
    lineHeight: TypographyV2.screenTitle.lineHeight },
  handle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    marginTop: 2,
    letterSpacing: TypographyV2.meta.letterSpacing,
    lineHeight: TypographyV2.meta.lineHeight } });
