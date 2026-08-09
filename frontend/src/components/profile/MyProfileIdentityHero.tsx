import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SellerTrustSummary, VerificationTier } from '../../platform/product';
import { VERIFICATION_TIERS } from '../../platform/product';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { ProfileTrustSignals } from './ProfileTrustSignals';

const AVATAR_SIZE = 84;

interface MyProfileIdentityHeroProps {
  avatarUri: string | null;
  displayName: string;
  username: string;
  bio?: string;
  location?: string;
  memberSince?: string;
  listingCount?: number;
  lookCount?: number;
  sellerTrust?: SellerTrustSummary | null;
  emailVerified?: boolean;
  ratingAverage?: number | null;
  reviewCount?: number;
  soldCount?: number;
  followerCount?: number;
  followingCount?: number;
  onEditAvatar: () => void;
  onEditProfile: () => void;
  onShare: () => void;
  onPressListings?: () => void;
  onPressLooks?: () => void;
  onPressSold?: () => void;
  onPressFollowers?: () => void;
  onPressFollowing?: () => void;
}

export function MyProfileIdentityHero({
  avatarUri,
  displayName,
  username,
  bio,
  location,
  memberSince,
  listingCount = 0,
  lookCount = 0,
  sellerTrust,
  emailVerified,
  ratingAverage,
  reviewCount,
  soldCount,
  followerCount = 0,
  followingCount = 0,
  onEditAvatar,
  onEditProfile,
  onShare,
  onPressListings,
  onPressLooks,
  onPressSold,
  onPressFollowers,
  onPressFollowing,
}: MyProfileIdentityHeroProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const context = [
    location,
    memberSince ? `Member since ${memberSince}` : undefined,
  ].filter(Boolean);
  const verified =
    sellerTrust?.verified === true || emailVerified === true;
  const verificationTier: VerificationTier | null =
    sellerTrust?.verificationTier ?? (verified ? 'email' : null);
  const completedSales = sellerTrust?.completedSales ?? soldCount ?? 0;

  return (
    <View style={styles.container}>
      <View style={styles.identityTop}>
        <View style={styles.avatarWrap}>
          {avatarUri ? (
            <CachedImage
              uri={avatarUri}
              style={styles.avatar}
              containerStyle={styles.avatar}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Ionicons name="person-outline" size={34} color={colors.textMuted} />
            </View>
          )}
          <Pressable
            style={({ pressed }) => [styles.editAvatarHit, pressed && { opacity: 0.6 }]}
            onPress={onEditAvatar}
            accessibilityLabel="Edit profile photo"
            accessibilityRole="button"
          >
            <View style={styles.editAvatarVisible}>
              <Ionicons name="camera-outline" size={13} color={colors.textInverse} />
            </View>
          </Pressable>
        </View>

        <View style={styles.stats}>
          <ProfileStat value={listingCount} label="Listings" styles={styles} onPress={onPressListings} a11yLabel={`${listingCount} listings`} />
          <ProfileStat value={lookCount} label="Looks" styles={styles} onPress={onPressLooks} a11yLabel={`${lookCount} looks`} />
          <ProfileStat value={completedSales} label="Sold" styles={styles} onPress={onPressSold} a11yLabel={`${completedSales} sold`} />
        </View>
      </View>

      <View style={styles.displayNameRow}>
        <Text style={styles.displayName} numberOfLines={1}>
          {displayName}
        </Text>
        {verificationTier ? (
          <Ionicons
            name={
              VERIFICATION_TIERS[verificationTier]
                .icon as keyof typeof Ionicons.glyphMap
            }
            size={17}
            color={
              VERIFICATION_TIERS[verificationTier].color === 'brand'
                ? colors.brand
                : colors.success
            }
            accessibilityLabel={VERIFICATION_TIERS[verificationTier].label}
          />
        ) : null}
      </View>
      <Text style={styles.username} numberOfLines={1}>
        @{username}
      </Text>

      {bio ? <Text style={styles.bio}>{bio}</Text> : null}
      {context.length > 0 ? (
        <Text style={styles.context} numberOfLines={1}>
          {context.join(' · ')}
        </Text>
      ) : null}

      <ProfileTrustSignals
        sellerTrust={sellerTrust}
        emailVerified={emailVerified}
        ratingAverage={ratingAverage}
        reviewCount={reviewCount}
        soldCount={soldCount}
        align="left"
        hideSoldChip
      />

      {/* ── SOCIAL ROW — followers / following ──
          Dedicated bordered row between trust signals and actions.
          Canonical position: identity → shop stats → trust → social → actions. */}
      <View style={styles.socialRow}>
        {onPressFollowers ? (
          <Pressable
            style={({ pressed }) => [styles.socialCell, pressed && { opacity: 0.6 }]}
            onPress={onPressFollowers}
            accessibilityRole="button"
            accessibilityLabel={`${followerCount} followers`}
          >
            <Text style={styles.socialValue}>{followerCount}</Text>
            <Text style={styles.socialLabel}>Followers</Text>
          </Pressable>
        ) : (
          <View style={styles.socialCell} accessible accessibilityLabel={`${followerCount} followers`}>
            <Text style={styles.socialValue}>{followerCount}</Text>
            <Text style={styles.socialLabel}>Followers</Text>
          </View>
        )}
        <View style={styles.socialDivider} />
        {onPressFollowing ? (
          <Pressable
            style={({ pressed }) => [styles.socialCell, pressed && { opacity: 0.6 }]}
            onPress={onPressFollowing}
            accessibilityRole="button"
            accessibilityLabel={`${followingCount} following`}
          >
            <Text style={styles.socialValue}>{followingCount}</Text>
            <Text style={styles.socialLabel}>Following</Text>
          </Pressable>
        ) : (
          <View style={styles.socialCell} accessible accessibilityLabel={`${followingCount} following`}>
            <Text style={styles.socialValue}>{followingCount}</Text>
            <Text style={styles.socialLabel}>Following</Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <AnimatedPressable
          style={[styles.action, styles.editAction]}
          onPress={onEditProfile}
          activeOpacity={0.78}
          scaleValue={0.985}
          hapticFeedback="light"
          accessibilityLabel="Edit profile"
          accessibilityRole="button"
        >
          <Text style={styles.editActionText}>Edit profile</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.action, styles.shareAction]}
          onPress={onShare}
          activeOpacity={0.78}
          scaleValue={0.985}
          hapticFeedback="light"
          accessibilityLabel="Share profile"
          accessibilityRole="button"
        >
          <Ionicons name="share-outline" size={17} color={colors.textPrimary} />
          <Text style={styles.shareActionText}>Share profile</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function ProfileStat({ value, label, styles, onPress, a11yLabel }: {
  value: number;
  label: string;
  styles: ReturnType<typeof createStyles>;
  onPress?: () => void;
  a11yLabel?: string;
}) {
  if (onPress) {
    return (
      <Pressable
        style={styles.stat}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel ?? `${value} ${label}`}
        hitSlop={4}
      >
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.stat} accessible accessibilityLabel={a11yLabel ?? `${value} ${label}`}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: Space.xs,
    paddingBottom: 12,
  },
  identityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 11,
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  editAvatarHit: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editAvatarVisible: {
    width: 24,
    height: 24,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textPrimary,
    borderWidth: 2,
    borderColor: colors.background,
  },
  stats: {
    flex: 1,
    flexDirection: 'row',
    alignSelf: 'flex-end',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingLeft: Space.md,
    marginTop: Space.xs,
  },
  stat: {
    minWidth: Space.xxl + Space.xl + Space.xs,
    alignItems: 'center',
    gap: Space.xs / 4,
  },
  statValue: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.subtitle.size,
    lineHeight: Type.subtitle.lineHeight,
  },
  statLabel: {
    color: colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
  },
  displayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
  },
  displayName: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontFamily: Typography.family.bold,
    fontSize: Type.bodyLarge.size + 1,
    letterSpacing: Type.bodyLarge.letterSpacing,
  },
  username: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.captionElevated.size,
    marginTop: 1,
  },
  bio: {
    color: colors.textPrimary,
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    marginTop: Space.sm,
  },
  context: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    marginTop: 5,
  },
  // Social row — dedicated followers/following row between trust signals and actions.
  // Matches the bordered stats row pattern: hairline top/bottom, centered cells, vertical divider.
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Space.sm + 2,
    paddingVertical: Space.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  socialCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xs,
    gap: Space.xs / 4,
  },
  socialValue: {
    fontSize: Type.subtitle.size,
    fontFamily: Typography.family.semibold,
    lineHeight: Type.subtitle.lineHeight,
    letterSpacing: Type.subtitle.letterSpacing,
    color: colors.textPrimary,
  },
  socialLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  socialDivider: {
    width: StyleSheet.hairlineWidth,
    height: Space.xl - Space.xs,
    backgroundColor: colors.borderSubtle,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.md + 1,
  },
  action: {
    flex: 1,
    minHeight: Space.xl + Space.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 2,
    borderRadius: Radius.lg,
  },
  editAction: {
    backgroundColor: colors.textPrimary,
  },
  editActionText: {
    color: colors.textInverse,
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  shareAction: {
    backgroundColor: colors.surfaceAlt,
  },
  shareActionText: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
  },
  });
}
