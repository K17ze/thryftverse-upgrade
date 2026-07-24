import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SellerTrustSummary, VerificationTier } from '../../platform/product';
import { VERIFICATION_TIERS } from '../../platform/product';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
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
  listingCount = 0,
  lookCount = 0,
  sellerTrust,
  emailVerified,
  ratingAverage,
  reviewCount,
  soldCount,
  onEditAvatar,
  onEditProfile,
  onShare,
}: MyProfileIdentityHeroProps) {
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
              <Ionicons name="person-outline" size={34} color={Colors.textMuted} />
            </View>
          )}
          <Pressable
            style={styles.editAvatar}
            onPress={onEditAvatar}
            hitSlop={8}
            accessibilityLabel="Edit profile photo"
            accessibilityRole="button"
          >
            <Ionicons name="camera-outline" size={14} color={Colors.textInverse} />
          </Pressable>
        </View>

        <View style={styles.stats}>
          <ProfileStat value={listingCount} label="Listings" />
          <ProfileStat value={lookCount} label="Looks" />
          <ProfileStat value={completedSales} label="Sold" />
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
                ? Colors.brand
                : Colors.success
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
      />

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
          <Ionicons name="share-outline" size={17} color={Colors.textPrimary} />
          <Text style={styles.shareActionText}>Share profile</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function ProfileStat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingTop: 4,
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
    borderColor: Colors.background,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceAlt,
  },
  editAvatar: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 29,
    height: 29,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.textPrimary,
    borderWidth: 2,
    borderColor: Colors.background,
  },
  stats: {
    flex: 1,
    flexDirection: 'row',
    alignSelf: 'flex-end',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingLeft: Space.md,
    transform: [{ translateY: 10 }],
  },
  stat: {
    minWidth: 58,
    alignItems: 'center',
    gap: 1,
  },
  statValue: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: 17,
    lineHeight: 21,
  },
  statLabel: {
    color: Colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: 12,
  },
  displayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  displayName: {
    flexShrink: 1,
    color: Colors.textPrimary,
    fontFamily: Typography.family.bold,
    fontSize: 19,
    letterSpacing: -0.35,
  },
  username: {
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: 13,
    marginTop: 1,
  },
  bio: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.regular,
    fontSize: 14,
    lineHeight: 19,
    marginTop: 8,
  },
  context: {
    color: Colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: 12,
    marginTop: 5,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 13,
  },
  action: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
  },
  editAction: {
    backgroundColor: Colors.textPrimary,
  },
  editActionText: {
    color: Colors.textInverse,
    fontFamily: Typography.family.semibold,
    fontSize: 14,
  },
  shareAction: {
    backgroundColor: Colors.surfaceAlt,
  },
  shareActionText: {
    color: Colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: 14,
  },
});
