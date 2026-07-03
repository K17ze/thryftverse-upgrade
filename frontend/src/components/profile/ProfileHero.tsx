import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { Colors } from '../../constants/colors';
import { Space, Typography, Radius } from '../../theme/designTokens';
import { FlagshipProfileMedia } from '../flagship';
import { isVideoUri } from '../../utils/media';
import type { PublicProfileStats, PublicProfileViewer } from '../../services/profileApi';

const BG = Colors.background;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;
const SECONDARY = Colors.textSecondary;
const SURFACE_ALT = Colors.surfaceAlt;
const BRAND = Colors.brand;
const TEXT_INVERSE = Colors.textInverse;

const COVER_HEIGHT = 160;
const AVATAR_SIZE = 84;
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
  followPending: boolean;
  isBlocked: boolean;
  scrollY: SharedValue<number>;
  reducedMotion: boolean;
  onFollowToggle: () => void;
  onMessage: () => void;
  onMore: () => void;
  onEditProfile: () => void;
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

/**
 * Authored identity surface — Instagram-density seam row + LinkedIn-clarity identity.
 *
 * Composition:
 *   cover (edge-to-edge, gradient fades only)
 *   seam row: avatar (left, overlapping cover) + 3 primary stats (right, vertically centred)
 *   identity: full-width, left-aligned — name, @handle, bio, context, website
 *   trust line: 4.9 ★ · 47 sold · Joined June 2026
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
  onShopSegmentSelect,
}: ProfileHeroProps) {
  const coverParallaxStyle = useAnimatedStyle(() => {
    if (reducedMotion) return {};
    const overscroll = Math.min(scrollY.value, 0);
    const scale = interpolate(overscroll, [-120, 0], [1.2, 1], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });

  const initials = getInitials(targetProfile?.displayName || displayUsername || 'Thryft');
  const followerCount = stats?.followerCount ?? 0;
  const followingCount = stats?.followingCount ?? 0;
  const ratingValue = stats?.ratingAverage;
  const hasRating = ratingValue !== null && ratingValue !== undefined && reviewCount > 0;

  // Trust line: "4.9 ★ · 47 sold · Joined June 2026"
  const trustParts: string[] = [];
  if (hasRating && ratingValue !== null && ratingValue !== undefined) {
    trustParts.push(`${ratingValue.toFixed(1)} ★`);
  }
  if (soldCount > 0) trustParts.push(`${soldCount} sold`);
  if (memberSince) trustParts.push(`Joined ${memberSince}`);
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
          {/* Seam row — stats to the right of avatar, vertically centred */}
          <View style={styles.seamRow}>
            <View style={styles.seamSpacer} />
            <View style={styles.seamStats}>
              <Pressable
                style={styles.seamStat}
                onPress={() => { onTabSelect('Shop'); onShopSegmentSelect('forsale'); }}
                accessibilityRole="button"
                accessibilityLabel={`${activeCount} for sale — view shop`}
              >
                <Text style={styles.seamStatValue}>{activeCount}</Text>
                <Text style={styles.seamStatLabel} numberOfLines={1}>For sale</Text>
              </Pressable>
              <Pressable
                style={styles.seamStat}
                onPress={() => onOpenConnections('followers')}
                accessibilityRole="button"
                accessibilityLabel={`${followerCount} followers — view followers`}
              >
                <Text style={styles.seamStatValue}>{followerCount}</Text>
                <Text style={styles.seamStatLabel} numberOfLines={1}>Followers</Text>
              </Pressable>
              <Pressable
                style={styles.seamStat}
                onPress={() => onOpenConnections('following')}
                accessibilityRole="button"
                accessibilityLabel={`${followingCount} following — view following`}
              >
                <Text style={styles.seamStatValue}>{followingCount}</Text>
                <Text style={styles.seamStatLabel} numberOfLines={1}>Following</Text>
              </Pressable>
            </View>
          </View>

          {/* Identity — full-width, left-aligned, no avatar indentation */}
          <Text style={styles.displayName} numberOfLines={2}>
            {targetProfile?.displayName || displayUsername}
          </Text>
          <Text style={styles.username} numberOfLines={1}>
            @{targetProfile?.username ?? 'thryft'}
          </Text>

          {/* Biography — concise, readable */}
          {targetProfile?.bio ? (
            <Text style={styles.bio} numberOfLines={3}>{targetProfile.bio}</Text>
          ) : null}

          {/* Context line — no icons */}
          {targetProfile?.location ? (
            <Text style={styles.contextLine} numberOfLines={1}>{targetProfile.location}</Text>
          ) : null}

          {/* Website — separate intentional link */}
          {targetProfile?.website ? (
            <Pressable
              style={styles.websiteLink}
              onPress={() => openWebsite(targetProfile.website!)}
              accessibilityRole="link"
              accessibilityLabel={`Open website ${targetProfile.website}`}
            >
              <Text style={styles.websiteText} numberOfLines={1}>{targetProfile.website}</Text>
            </Pressable>
          ) : null}

          {/* Seller trust line — compact, no badge container */}
          {trustLine ? (
            <View style={styles.trustRow}>
              {hasRating ? (
                <Pressable
                  onPress={() => onTabSelect('Reviews')}
                  accessibilityRole="button"
                  accessibilityLabel={`Rating ${ratingValue!.toFixed(1)} out of 5, ${reviewCount} reviews. View reviews.`}
                >
                  <Text style={styles.trustLink}>{ratingValue!.toFixed(1)} ★</Text>
                </Pressable>
              ) : null}
              {hasRating && soldCount > 0 ? <Text style={styles.trustDot}> · </Text> : null}
              {soldCount > 0 ? (
                <Pressable
                  onPress={() => { onTabSelect('Shop'); onShopSegmentSelect('sold'); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${soldCount} sold — view sold items`}
                >
                  <Text style={styles.trustLink}>{soldCount} sold</Text>
                </Pressable>
              ) : null}
              {(hasRating || soldCount > 0) && memberSince ? <Text style={styles.trustDot}> · </Text> : null}
              {memberSince ? <Text style={styles.trustStatic}>Joined {memberSince}</Text> : null}
            </View>
          ) : null}
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
                <ActivityIndicator size="small" color={viewer.isFollowing ? TEXT : TEXT_INVERSE} />
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
              <Ionicons name="chatbubble-outline" size={15} color={TEXT} />
              <Text style={styles.messageBtnText}>Message</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.moreBtn}
              onPress={onMore}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={TEXT} />
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
              <Ionicons name="create-outline" size={15} color={TEXT} />
              <Text style={styles.editProfileBtnText}>Edit profile</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.moreBtn}
              onPress={onShare}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Share profile"
            >
              <Ionicons name="share-outline" size={18} color={TEXT} />
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

const styles = StyleSheet.create({
  // Cover
  coverContainer: {
    width: '100%',
    height: COVER_HEIGHT,
    overflow: 'hidden',
    backgroundColor: SURFACE_ALT,
  },
  coverTopFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
  },
  coverBottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
  },

  // Hero root
  heroRoot: {
    position: 'relative',
    backgroundColor: BG,
  },

  // Avatar — absolutely positioned at the exact cover/canvas seam
  avatarAbsolute: {
    position: 'absolute',
    top: -AVATAR_OVERLAP,
    left: Space.md,
    zIndex: 10,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: BG,
  },
  avatarMonogram: {
    backgroundColor: SURFACE_ALT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    fontSize: 28,
    fontFamily: Typography.family.bold,
    color: SECONDARY,
    letterSpacing: -0.5,
  },

  // Identity canvas — no top padding; seamRow reserves avatar overlap space
  identityCanvas: {
    paddingHorizontal: Space.md,
    paddingTop: 0,
    paddingBottom: Space.sm,
  },

  // Seam row — begins immediately at canvas boundary, reserves avatar overlap height
  seamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: AVATAR_OVERLAP + Space.sm,
    marginBottom: Space.xs,
  },
  seamSpacer: {
    width: AVATAR_SIZE + Space.sm,
  },
  seamStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  seamStat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seamStatValue: {
    fontSize: 17,
    fontFamily: Typography.family.bold,
    color: TEXT,
    letterSpacing: -0.3,
  },
  seamStatLabel: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: MUTED,
    marginTop: 1,
  },

  // Identity — full-width, left-aligned
  displayName: {
    fontSize: 20,
    fontFamily: Typography.family.bold,
    color: TEXT,
    letterSpacing: -0.4,
    marginBottom: 2,
  },
  username: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: SECONDARY,
    marginBottom: Space.xs,
  },

  // Biography
  bio: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: TEXT,
    lineHeight: 20,
    marginBottom: Space.xs,
  },

  // Context line — no icons
  contextLine: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: MUTED,
    marginBottom: Space.xs,
  },

  // Website
  websiteLink: {
    paddingVertical: 2,
    marginBottom: Space.xs,
  },
  websiteText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: SECONDARY,
    textDecorationLine: 'underline',
  },

  // Seller trust line — compact, no badge container
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingVertical: 2,
    marginBottom: Space.xs,
  },
  trustLink: {
    fontSize: 13,
    fontFamily: Typography.family.semibold,
    color: TEXT,
  },
  trustStatic: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },
  trustDot: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: MUTED,
  },

  // Actions — flat 11pt radius, restrained
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: BG,
  },
  followBtn: {
    flex: 1,
    height: ACTION_HEIGHT,
    borderRadius: ACTION_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnActive: { backgroundColor: BRAND },
  followingBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  followBtnText: { fontSize: 15, fontFamily: Typography.family.semibold },
  followActiveBtnText: { color: TEXT_INVERSE },
  followingBtnText: { color: TEXT },
  messageBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: ACTION_HEIGHT,
    borderRadius: ACTION_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  messageBtnText: { fontSize: 15, fontFamily: Typography.family.semibold, color: TEXT },
  moreBtn: {
    width: ACTION_HEIGHT,
    height: ACTION_HEIGHT,
    borderRadius: ACTION_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editProfileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: ACTION_HEIGHT,
    borderRadius: ACTION_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  editProfileBtnText: { fontSize: 15, fontFamily: Typography.family.semibold, color: TEXT },
  btnDisabled: { opacity: 0.5 },
});
