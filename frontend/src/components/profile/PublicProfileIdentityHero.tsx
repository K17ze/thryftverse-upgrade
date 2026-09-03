import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { CachedImage } from '../CachedImage';
import type { SellerTrustSummary, VerificationTier } from '../../platform/product';
import { VERIFICATION_TIERS } from '../../platform/product';

const AVATAR_SIZE = 96;

interface PublicProfileIdentityHeroProps {
  avatarUri: string | null;
  displayName: string;
  username: string;
  bio?: string | null;
  location?: string | null;
  memberSince?: string;
  listingCount: number;
  /** Seller trust summary — provides verified badge tier. */
  sellerTrust?: SellerTrustSummary | null;
}

/**
 * Public profile identity hero — authored identity block.
 *
 * Composition (2026 flagship pattern):
 *   avatar (left, overlapping cover seam) + identity column (right)
 *   display name + verification badge as one identity block
 *   @handle below, muted
 *   bio (max 3 lines)
 *   context line: location · member since · listing count
 *
 * Hierarchy: name > handle > bio > context. One type scale step between
 * each level. Verification badge inline with name — not a separate chip.
 */
export function PublicProfileIdentityHero({
  avatarUri,
  displayName,
  username,
  bio,
  location,
  memberSince,
  listingCount,
  sellerTrust }: PublicProfileIdentityHeroProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const contextParts: string[] = [];
  if (location) contextParts.push(location);
  if (memberSince) contextParts.push(`Member since ${memberSince}`);

  // Verification tier — only from seller trust (authoritative backend source).
  // Email verification is never used as a proxy for seller/identity verification.
  const verificationTier: VerificationTier | null =
    sellerTrust?.verificationTier ?? (sellerTrust?.verified === true ? 'seller' : null);

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
          <View style={styles.displayNameRow}>
            <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
            {verificationTier ? (
              <Ionicons
                name={VERIFICATION_TIERS[verificationTier].icon as keyof typeof Ionicons.glyphMap}
                size={18}
                color={VERIFICATION_TIERS[verificationTier].color === 'brand' ? colors.brand : colors.success}
                style={styles.verifiedBadge}
                accessibilityLabel={VERIFICATION_TIERS[verificationTier].label}
              />
            ) : null}
          </View>
          <Text style={styles.username} numberOfLines={1}>@{username}</Text>
        </View>
      </View>

      {bio ? (
        <Text style={styles.bio} numberOfLines={3}>{bio}</Text>
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
    paddingBottom: Space.sm },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md + 2,
    marginBottom: Space.sm },
  avatarWrap: {
    position: 'relative' },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.background },
  avatarFallback: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center' },
  identityCol: {
    flex: 1,
    minWidth: 0 },
  displayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    marginBottom: 2 },
  displayName: {
    fontSize: TypographyV2.screenTitle.size,
    fontFamily: TypographyV2.screenTitle.fontFamily,
    color: colors.textPrimary,
    letterSpacing: TypographyV2.screenTitle.letterSpacing,
    flexShrink: 1 },
  verifiedBadge: {
    flexShrink: 0,
    marginTop: 1 },
  username: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary },
  bio: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    lineHeight: TypographyV2.body.lineHeight,
    marginBottom: Space.sm },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 2,
    flexWrap: 'wrap' },
  contextText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  contextSep: {
    fontSize: TypographyV2.meta.size,
    color: colors.textMuted } });
}
