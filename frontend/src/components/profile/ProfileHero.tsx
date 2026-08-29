import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { FlagshipProfileMedia } from '../flagship';
import { isVideoUri } from '../../utils/media';
import type { PublicProfileStats, PublicProfileViewer, PublicProfileTrader } from '../../services/profileApi';
import type { SellerTrustSummary, VerificationTier } from '../../platform/product';
import { VERIFICATION_TIERS } from '../../platform/product';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { formatCompactCount, formatFullCount } from '../../utils/numberFormat';

const COVER_HEIGHT = 160;
const AVATAR_SIZE = 96; // design contract: 96-128pt seam avatar (2026 standard)
const AVATAR_OVERLAP = AVATAR_SIZE / 2;
const ACTION_RADIUS = 11;
const ACTION_HEIGHT = 44;

interface ProfileHeroProps {
  targetProfile: { displayName?: string | null; username?: string; bio?: string | null; location?: string | null; website?: string | null; createdAt?: string } | null | undefined;
  displayUsername: string;
  displayAvatar?: string;
  displayCover: string;
  isSelfProfile: boolean;
  viewer: PublicProfileViewer | null;
  stats: PublicProfileStats | null;
  activeCount: number;
  soldCount: number;
  reviewCount: number;
  memberSince?: string;
  /** Seller trust summary from /sellers/:id — provides verified badge, response time, dispatch time. */
  sellerTrust?: SellerTrustSummary | null;
  /** DSA Article 30 trader classification from the profile aggregate. */
  traderClassification?: PublicProfileTrader | null;
  followPending: boolean;
  isBlocked: boolean;
  scrollY: SharedValue<number>;
  reducedMotion: boolean;
  onFollowToggle: () => void;
  onMessage: () => void;
  onMore: () => void;
  onEditProfile?: () => void;
  onShare: () => void;
  onOpenConnections: (segment: 'followers' | 'following') => void;
  onTabSelect: (tab: 'Shop' | 'Reviews') => void;
  onShopSegmentSelect: (segment: 'forsale' | 'sold') => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ── Bio truncation with see-more expansion ──
// Bios longer than ~125 chars are truncated with a "see more" inline toggle.
const BIO_TRUNCATE_CHARS = 125;

function BioText({ bio, style, linkStyle, seeMoreStyle }: { bio: string; style: any; linkStyle: any; seeMoreStyle: any }) {
  const [expanded, setExpanded] = React.useState(false);
  const shouldTruncate = bio.length > BIO_TRUNCATE_CHARS;
  const displayBio = shouldTruncate && !expanded
    ? bio.slice(0, BIO_TRUNCATE_CHARS).trimEnd() + '…'
    : bio;

  return (
    <Text style={style} numberOfLines={expanded ? undefined : 3}>
      {displayBio}
      {shouldTruncate ? (
        <Text
          style={seeMoreStyle}
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Show less bio' : 'Show more bio'}
        >
          {expanded ? ' less' : ' more'}
        </Text>
      ) : null}
    </Text>
  );
}

/**
 * Authored identity surface — Instagram-density seam row + LinkedIn-clarity identity.
 *
 * Composition:
 *   cover (edge-to-edge, gradient fades only)
 *   seam row: avatar (left, overlapping cover) + 3 primary stats (right, vertically centred)
 *   identity: full-width, left-aligned — name, @handle, bio, context, website
 *   trust line: 4.9 star · 47 sold · Joined June 2026
 *   actions: flat 11pt radius, restrained
 */
export function ProfileHero({
  targetProfile,
  displayUsername,
  displayAvatar,
  displayCover,
  isSelfProfile,
  viewer,
  stats,
  activeCount,
  soldCount,
  reviewCount,
  memberSince,
  sellerTrust,
  traderClassification,
  followPending,
  isBlocked,
  scrollY,
  reducedMotion,
  onFollowToggle,
  onMessage,
  onMore,
  onEditProfile,
  onShare,
  onOpenConnections,
  onTabSelect,
  onShopSegmentSelect }: ProfileHeroProps) {
  const { colors } = useAppTheme();
  const reducedMotionHook = useReducedMotion();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const coverParallaxStyle = useAnimatedStyle(() => {
    if (reducedMotion || reducedMotionHook) return {};
    const overscroll = Math.min(scrollY.value, 0);
    const scale = interpolate(overscroll, [-120, 0], [1.2, 1], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });

  const initials = getInitials(targetProfile?.displayName || displayUsername || 'Thryft');
  const followerCount = stats?.followerCount ?? 0;
  const followingCount = stats?.followingCount ?? 0;
  const ratingValue = stats?.ratingAverage;
  const hasRating = ratingValue !== null && ratingValue !== undefined && reviewCount > 0;
  // Verification tier — only from seller trust (authoritative backend source).
  // Email verification is never used as a proxy for seller/identity verification.
  const verificationTier: VerificationTier | null =
    sellerTrust?.verificationTier ?? (sellerTrust?.verified === true ? 'seller' : null);

  // Trust line: "4.9 · 47 sold · Joined June 2026 · Replies within 2h"
  const trustParts: string[] = [];
  if (hasRating && ratingValue !== null && ratingValue !== undefined) {
    trustParts.push(`${ratingValue.toFixed(1)}`);
  }
  if (soldCount > 0) trustParts.push(`${soldCount} sold`);
  if (memberSince) trustParts.push(`Joined ${memberSince}`);
  if (sellerTrust?.responseTimeLabel) trustParts.push(`Replies ${sellerTrust.responseTimeLabel}`);
  // DSA Article 30 trader classification — factual, not decorative.
  if (traderClassification) {
    trustParts.push(traderClassification.classification === 'trader' ? 'Business' : 'Private');
  }
  const trustLine = trustParts.join(' · ');

  return (
    <View>
      {/* ── Cover stage — edge-to-edge media with gradient fades ── */}
      <Reanimated.View style={[styles.coverContainer, coverParallaxStyle]}>
        <FlagshipProfileMedia
          coverUri={displayCover}
          coverVideoUri={isVideoUri(displayCover) ? displayCover : undefined}
          isSelf={isSelfProfile}
          coverOnly
          style={{ width: '100%' }}
          coverHeight={COVER_HEIGHT}
        />
        {/* Top gradient fade for control contrast */}
        <LinearGradient
          colors={['rgba(0,0,0,0.28)', 'rgba(0,0,0,0.12)', 'transparent']}
          style={styles.coverTopFade}
          pointerEvents="none"
        />
        {/* Subtle bottom fade around the avatar seam — no hard dark strip */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.10)']}
          style={styles.coverBottomFade}
          pointerEvents="none"
        />
      </Reanimated.View>

      {/* ── Hero root — position relative for absolute avatar ── */}
      <View style={styles.heroRoot}>
        {/* ── Seam row: avatar (left, overlapping) + 3 stats (right, vertically centred) ── */}
        <View style={styles.avatarAbsolute}>
          {displayAvatar ? (
            <CachedImage
              uri={displayAvatar}
              style={styles.avatar}
              containerStyle={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.avatar, styles.avatarMonogram]}>
              <Text style={styles.monogramText}>{initials}</Text>
            </View>
          )}
        </View>

        {/* Identity canvas — paddingTop reserves avatar space */}
        <View style={styles.identityCanvas}>
          {/* ── Seam row — avatar (left) + unified stats (right) ──
              All profile stats live in a single row beside the avatar,
              matching the Instagram/Depop mobile pattern. Three stats:
              For sale · Followers · Following.

              Stats are the "reputation layer" —
              users process them at 0.5–1.5s. Grouping them in one row
              reduces cognitive load vs scattering across multiple sections.
              Compact notation (1.2K, 3.4M) enables instant scanning while
              accessibility labels carry the full count for screen readers.

              Styling: no bordered cards (2026 trend — spacing gaps, not
              containers). Tabular numerals so digits align across stats.
              Subtle vertical dividers provide rhythm without enclosing
              each stat in a box. */}
          <View style={styles.seamRow}>
            <View style={styles.seamSpacer} />
            <View style={styles.seamStats}>
              <Pressable
                style={({ pressed }) => [styles.seamStat, pressed && { opacity: 0.55 }]}
                onPress={() => { onTabSelect('Shop'); onShopSegmentSelect('forsale'); }}
                accessibilityRole="button"
                accessibilityLabel={`${formatFullCount(activeCount)} for sale — view shop`}
              >
                <Text style={styles.seamStatValue} numberOfLines={1}>{formatCompactCount(activeCount)}</Text>
                <Text style={styles.seamStatLabel} numberOfLines={1}>For sale</Text>
              </Pressable>
              <View style={styles.seamStatDivider} />
              <Pressable
                style={({ pressed }) => [styles.seamStat, pressed && { opacity: 0.55 }]}
                onPress={() => onOpenConnections('followers')}
                accessibilityRole="button"
                accessibilityLabel={`${formatFullCount(followerCount)} followers — view followers`}
              >
                <Text style={styles.seamStatValue} numberOfLines={1}>{formatCompactCount(followerCount)}</Text>
                <Text style={styles.seamStatLabel} numberOfLines={1}>Followers</Text>
              </Pressable>
              <View style={styles.seamStatDivider} />
              <Pressable
                style={({ pressed }) => [styles.seamStat, pressed && { opacity: 0.55 }]}
                onPress={() => onOpenConnections('following')}
                accessibilityRole="button"
                accessibilityLabel={`${formatFullCount(followingCount)} following — view following`}
              >
                <Text style={styles.seamStatValue} numberOfLines={1}>{formatCompactCount(followingCount)}</Text>
                <Text style={styles.seamStatLabel} numberOfLines={1}>Following</Text>
              </Pressable>
            </View>
          </View>

          {/* Identity — full-width, left-aligned, no avatar indentation */}
          <View style={styles.displayNameRow}>
            <Text style={styles.displayName} numberOfLines={2}>
              {targetProfile?.displayName || displayUsername}
            </Text>
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
          <Text style={styles.username} numberOfLines={1}>
            @{targetProfile?.username ?? 'thryft'}
          </Text>

          {/* Biography — concise, readable, with see-more expansion for long bios */}
          {targetProfile?.bio ? (
            <BioText bio={targetProfile.bio} style={styles.bio} linkStyle={styles.bioLink} seeMoreStyle={styles.bioSeeMore} />
          ) : null}

          {/* Context line — no icons */}
          {targetProfile?.location ? (
            <Text style={styles.contextLine} numberOfLines={1}>{targetProfile.location}</Text>
          ) : null}

          {/* Website — separate intentional link */}
          {targetProfile?.website ? (
            <Pressable
              style={({ pressed }) => [styles.websiteLink, pressed && { opacity: 0.6 }]}
              onPress={() => openWebsite(targetProfile.website!)}
              accessibilityRole="link"
              accessibilityLabel={`Open website ${targetProfile.website}`}
            >
              <Text style={styles.websiteText} numberOfLines={1}>{targetProfile.website}</Text>
            </Pressable>
          ) : null}

          {/* Seller trust header — rating row + joined caption on separate lines.
              The rating is part of the identity block, not a lonely chip: star +
              score + review count give the 5.0 context. Joined date is a less
              prominent caption below, not equal weight to the rating. */}
          {trustLine ? (
            <View style={styles.trustBlock}>
              {/* Rating row — star + score + review count (or "No reviews yet").
                  Secondary trust signals (sold, response time) stay on this row
                  separated by dots; they are marketplace proof, not identity. */}
              <View style={styles.trustRatingRow}>
                {hasRating ? (
                  <Pressable
                    onPress={() => onTabSelect('Reviews')}
                    accessibilityRole="button"
                    accessibilityLabel={`Rating ${ratingValue!.toFixed(1)} out of 5, ${reviewCount} reviews. View reviews.`}
                    style={({ pressed }) => [styles.trustRatingWrap, pressed && { opacity: 0.6 }]}
                  >
                    <Ionicons name="star" size={16} color={colors.brand} aria-hidden={true} />
                    <Text style={styles.trustRatingValue}>{ratingValue!.toFixed(1)}</Text>
                    <Text style={styles.trustReviewCount}>({reviewCount} {reviewCount === 1 ? 'review' : 'reviews'})</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.trustNoReviews}>No reviews yet</Text>
                )}
                {soldCount > 0 ? <Text style={styles.trustDot}> · </Text> : null}
                {soldCount > 0 ? (
                  <Pressable
                    onPress={() => { onTabSelect('Shop'); onShopSegmentSelect('sold'); }}
                    accessibilityRole="button"
                    accessibilityLabel={`${soldCount} sold — view sold items`}
                    style={({ pressed }) => pressed && { opacity: 0.6 }}
                  >
                    <Text style={styles.trustLink}>{soldCount} sold</Text>
                  </Pressable>
                ) : null}
                {sellerTrust?.responseTimeLabel ? <Text style={styles.trustDot}> · </Text> : null}
                {sellerTrust?.responseTimeLabel ? (
                  <Text style={styles.trustResponse}>Replies {sellerTrust.responseTimeLabel}</Text>
                ) : null}
              </View>
              {/* Joined — less prominent caption on its own line, no dot separator */}
              {memberSince ? <Text style={styles.trustJoined}>Joined {memberSince}</Text> : null}
            </View>
          ) : null}

          {/* Trust line is the sole trust surface above the tab rail.
              Rating, sold count, and join date are shown here.
              Detailed metrics live in the Reviews tab. */}
        </View>

        {/* Actions — flat 11pt radius, restrained, content-first */}
        {!isSelfProfile && viewer ? (
          <View style={styles.actionRow}>
            <AnimatedPressable
              style={[styles.followBtn, viewer.isFollowing ? styles.followingBtn : styles.followBtnActive, followPending && styles.btnDisabled]}
              onPress={onFollowToggle}
              activeOpacity={0.88}
              disabled={followPending || isBlocked}
              hapticFeedback="light"
              accessibilityRole="button"
              accessibilityLabel={viewer.isFollowing ? 'Unfollow user' : 'Follow user'}
              accessibilityState={{ disabled: followPending || isBlocked }}
            >
              {followPending ? (
                <ActivityIndicator size="small" color={viewer.isFollowing ? colors.textPrimary : colors.textInverse} />
              ) : (
                <Text style={[styles.followBtnText, viewer.isFollowing ? styles.followingBtnText : styles.followActiveBtnText]}>
                  {viewer.isFollowing ? 'Following' : 'Follow'}
                </Text>
              )}
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.messageBtn, !viewer.canMessage && styles.btnDisabled]}
              onPress={onMessage}
              activeOpacity={0.88}
              disabled={!viewer.canMessage}
              accessibilityRole="button"
              accessibilityLabel={viewer.canMessage ? 'Send message to seller' : 'Messaging unavailable'}
              accessibilityState={{ disabled: !viewer.canMessage }}
            >
              <Ionicons name="chatbubble-outline" size={15} color={colors.textPrimary} />
              <Text style={styles.messageBtnText}>Message</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.moreBtn}
              onPress={onMore}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.textPrimary} />
            </AnimatedPressable>
          </View>
        ) : null}

        {isSelfProfile ? (
          <View style={styles.actionRow}>
            <AnimatedPressable
              style={styles.editProfileBtn}
              onPress={onEditProfile}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
            >
              <Ionicons name="create-outline" size={15} color={colors.textPrimary} />
              <Text style={styles.editProfileBtnText}>Edit profile</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.moreBtn}
              onPress={onShare}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Share profile"
            >
              <Ionicons name="share-outline" size={18} color={colors.textPrimary} />
            </AnimatedPressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function openWebsite(url: string) {
  let normalized = url.trim();
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
  Linking.openURL(normalized).catch(() => {});
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  // Cover
  coverContainer: {
    width: '100%',
    height: COVER_HEIGHT,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt },
  coverTopFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80 },
  coverBottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40 },

  // Hero root
  heroRoot: {
    position: 'relative',
    backgroundColor: colors.background },

  // Avatar — absolutely positioned at the exact cover/canvas seam
  avatarAbsolute: {
    position: 'absolute',
    top: -AVATAR_OVERLAP,
    left: Space.md,
    zIndex: 10 },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: colors.background },
  avatarMonogram: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center' },
  monogramText: {
    fontSize: TypographyV2.priceHero.size,
    fontFamily: TypographyV2.priceHero.fontFamily,
    color: colors.textSecondary,
    letterSpacing: -0.5 },

  // Identity canvas — no top padding; seamRow reserves avatar overlap space
  identityCanvas: {
    paddingHorizontal: Space.md,
    paddingTop: 0,
    paddingBottom: Space.sm },

  // Seam row — begins immediately at canvas boundary, reserves avatar overlap height.
  // The seam is the cover/canvas boundary; the row holds the avatar (left,
  // absolutely positioned) and the stats cluster (right, flex 1).
  seamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: AVATAR_OVERLAP + Space.sm,
    marginBottom: Space.xs },
  seamSpacer: {
    // Reserves horizontal space for the avatar so stats don't overlap it.
    width: AVATAR_SIZE + Space.sm },
  seamStats: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    // Per 2026 research: spacing gaps (not bordered cards) between stats.
    // justifyContent space-around gives equal breathing room without
    // enclosing each stat in a container — the modern minimal trend.
    justifyContent: 'space-around' },
  seamStat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xs },
  // Stat value — bold, tabular numerals for digit alignment across stats.
  // Type.subtitle (17/24/600) matches Instagram's stat value weight.
  seamStatValue: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textPrimary,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  // Stat label — muted, regular weight, tight spacing.
  // Type.caption (12/16/400) is the industry standard for stat labels.
  seamStatLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: 1,
    letterSpacing: TypographyV2.meta.letterSpacing },
  // Subtle vertical divider between stats — provides visual rhythm without
  // enclosing each stat in a bordered card. Hairline width, muted color.
  seamStatDivider: {
    width: StyleSheet.hairlineWidth,
    height: Space.lg,
    backgroundColor: colors.borderSubtle },

  // Identity — full-width, left-aligned
  displayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs },
  displayName: {
    fontSize: TypographyV2.priceList.size,
    fontFamily: TypographyV2.priceList.fontFamily,
    color: colors.textPrimary,
    letterSpacing: -0.4,
    marginBottom: 2,
    flexShrink: 1 },
  verifiedBadge: {
    flexShrink: 0,
    marginTop: 2 },
  username: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textSecondary,
    marginBottom: Space.xs },

  // Biography
  bio: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    color: colors.textPrimary,
    lineHeight: TypographyV2.body.lineHeight,
    marginBottom: Space.xs },
  bioLink: {
    color: colors.brand,
    fontFamily: Typography.family.medium },
  bioSeeMore: {
    color: colors.textSecondary,
    fontFamily: Typography.family.semibold },

  // Context line — no icons
  contextLine: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginBottom: Space.xs },

  // Website
  websiteLink: {
    paddingVertical: 2,
    marginBottom: Space.xs },
  websiteText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary,
    textDecorationLine: 'underline' },

  // Seller trust header — rating row + joined caption on separate lines
  trustBlock: {
    paddingVertical: 2,
    marginBottom: Space.xs },
  trustRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap' },
  trustRatingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3 },
  trustRatingValue: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    color: colors.textPrimary,
    letterSpacing: -0.1 },
  trustReviewCount: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  trustNoReviews: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  trustLink: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textPrimary },
  trustJoined: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: 2 },
  trustResponse: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },
  trustDot: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted },

  // Actions — flat 11pt radius, restrained
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: colors.background },
  followBtn: {
    flex: 1,
    height: ACTION_HEIGHT,
    borderRadius: ACTION_RADIUS,
    alignItems: 'center',
    justifyContent: 'center' },
  followBtnActive: { backgroundColor: colors.brand },
  followingBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background },
  followBtnText: { fontSize: TypographyV2.bodyStrong.size, fontFamily: TypographyV2.bodyStrong.fontFamily },
  followActiveBtnText: { color: colors.textInverse },
  followingBtnText: { color: colors.textPrimary },
  messageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 3,
    height: ACTION_HEIGHT,
    borderRadius: ACTION_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background },
  messageBtnText: { fontSize: TypographyV2.bodyStrong.size, fontFamily: TypographyV2.bodyStrong.fontFamily, color: colors.textPrimary },
  moreBtn: {
    width: ACTION_HEIGHT,
    height: ACTION_HEIGHT,
    borderRadius: ACTION_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center' },
  editProfileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 3,
    height: ACTION_HEIGHT,
    borderRadius: ACTION_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background },
  editProfileBtnText: { fontSize: TypographyV2.bodyStrong.size, fontFamily: TypographyV2.bodyStrong.fontFamily, color: colors.textPrimary },
  btnDisabled: { opacity: 0.5 } });
}
