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

const COVER_HEIGHT = 168;
const AVATAR_SIZE = 84;
const AVATAR_OVERLAP = AVATAR_SIZE / 2;

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
 * Composed identity surface: cover → avatar at seam → identity → bio → context → proof → actions.
 * The avatar is absolutely positioned at the cover/canvas seam — it visibly occupies both.
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

  // Build one quiet context line: "London · Joined June 2026"
  const contextParts: string[] = [];
  if (targetProfile?.location) contextParts.push(targetProfile.location);
  if (memberSince) contextParts.push(`Joined ${memberSince}`);
  const contextLine = contextParts.join(' · ');

  return (
    <View>
      {/* ── Cover stage ── */}
      <Reanimated.View style={[styles.coverContainer, coverParallaxStyle]}>
        <FlagshipProfileMedia
          coverUri={displayCover}
          coverVideoUri={isVideoUri(displayCover) ? displayCover : undefined}
          isSelf={isSelfProfile}
          coverOnly
          style={{ width: '100%' }}
          coverHeight={COVER_HEIGHT}
        />
        {/* Subtle bottom scrim so avatar/controls read over bright covers */}
        <View style={styles.coverScrim} />
      </Reanimated.View>

      {/* ── Hero root — position relative for absolute avatar ── */}
      <View style={styles.heroRoot}>
        {/* Avatar — absolutely positioned at the exact cover/canvas seam */}
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

        {/* Identity canvas — begins immediately after cover, paddingTop reserves avatar space */}
        <View style={styles.identityCanvas}>
          {/* Name + handle — aligned to the right of the avatar */}
          <View style={styles.identityHeader}>
            <View style={styles.identityTextCol}>
              <Text style={styles.displayName} numberOfLines={2}>
                {targetProfile?.displayName || displayUsername}
              </Text>
              <Text style={styles.username} numberOfLines={1}>
                @{targetProfile?.username ?? 'thryft'}
              </Text>
            </View>
          </View>

          {/* Biography — max 3 readable lines */}
          {targetProfile?.bio ? (
            <Text style={styles.bio} numberOfLines={3}>{targetProfile.bio}</Text>
          ) : null}

          {/* One quiet context line — no icons */}
          {contextLine ? (
            <Text style={styles.contextLine} numberOfLines={1}>{contextLine}</Text>
          ) : null}

          {/* Website as one separate intentional link */}
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

          {/* Compact proof system — stats + rating as one coherent block */}
          <View style={styles.proofSystem}>
            <Pressable
              style={styles.proofCell}
              onPress={activeCount > 0 ? () => { onTabSelect('Shop'); onShopSegmentSelect('forsale'); } : undefined}
              disabled={activeCount === 0}
              accessibilityRole={activeCount > 0 ? 'button' : undefined}
              accessibilityLabel={`${activeCount} for sale`}
            >
              <Text style={styles.proofValue}>{activeCount}</Text>
              <Text style={styles.proofLabel} numberOfLines={1}>For sale</Text>
            </Pressable>
            <Pressable
              style={styles.proofCell}
              onPress={soldCount > 0 ? () => { onTabSelect('Shop'); onShopSegmentSelect('sold'); } : undefined}
              disabled={soldCount === 0}
              accessibilityRole={soldCount > 0 ? 'button' : undefined}
              accessibilityLabel={`${soldCount} sold`}
            >
              <Text style={styles.proofValue}>{soldCount}</Text>
              <Text style={styles.proofLabel} numberOfLines={1}>Sold</Text>
            </Pressable>
            <Pressable
              style={styles.proofCell}
              onPress={(stats?.followerCount ?? 0) > 0 ? () => onOpenConnections('followers') : undefined}
              disabled={(stats?.followerCount ?? 0) === 0}
              accessibilityRole={(stats?.followerCount ?? 0) > 0 ? 'button' : undefined}
              accessibilityLabel={`${stats?.followerCount ?? 0} followers`}
            >
              <Text style={styles.proofValue}>{stats?.followerCount ?? 0}</Text>
              <Text style={styles.proofLabel} numberOfLines={1}>Followers</Text>
            </Pressable>
            <Pressable
              style={styles.proofCell}
              onPress={(stats?.followingCount ?? 0) > 0 ? () => onOpenConnections('following') : undefined}
              disabled={(stats?.followingCount ?? 0) === 0}
              accessibilityRole={(stats?.followingCount ?? 0) > 0 ? 'button' : undefined}
              accessibilityLabel={`${stats?.followingCount ?? 0} following`}
            >
              <Text style={styles.proofValue}>{stats?.followingCount ?? 0}</Text>
              <Text style={styles.proofLabel} numberOfLines={1}>Following</Text>
            </Pressable>
          </View>

          {/* Rating — integrated trust line */}
          {stats && stats.ratingAverage !== null && reviewCount > 0 ? (
            <Pressable
              style={styles.ratingRow}
              onPress={() => onTabSelect('Reviews')}
              accessibilityRole="button"
              accessibilityLabel={`Rating ${stats.ratingAverage} out of 5, ${reviewCount} reviews. View reviews.`}
            >
              <Ionicons name="star" size={13} color={BRAND} />
              <Text style={styles.ratingValue}>{stats.ratingAverage!.toFixed(1)}</Text>
              <Text style={styles.ratingCount}>· {reviewCount} review{reviewCount !== 1 ? 's' : ''}</Text>
              <Ionicons name="chevron-forward" size={11} color={MUTED} style={{ marginLeft: 2 }} />
            </Pressable>
          ) : null}
        </View>

        {/* Actions — restrained, correct 44pt targets */}
        {!isSelfProfile && viewer ? (
          <View style={styles.actionRow}>
            <AnimatedPressable
              style={[styles.followBtn, viewer.isFollowing ? styles.followingBtn : styles.followBtnActive, followPending && styles.btnDisabled]}
              onPress={onFollowToggle}
              activeOpacity={0.85}
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
              activeOpacity={0.85}
              disabled={!viewer.canMessage}
              accessibilityRole="button"
              accessibilityLabel={viewer.canMessage ? 'Send message to seller' : 'Messaging unavailable'}
              accessibilityState={{ disabled: !viewer.canMessage }}
            >
              <Ionicons name="chatbubble-outline" size={16} color={TEXT} />
              <Text style={styles.messageBtnText}>Message</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.secondaryActionBtn}
              onPress={onMore}
              activeOpacity={0.85}
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
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
            >
              <Ionicons name="create-outline" size={16} color={TEXT} />
              <Text style={styles.editProfileBtnText}>Edit profile</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={styles.secondaryActionBtn}
              onPress={onShare}
              activeOpacity={0.85}
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
  coverScrim: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 48,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },

  // Hero root — position relative for absolute avatar
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

  // Identity canvas — begins immediately after cover, paddingTop reserves avatar space
  identityCanvas: {
    paddingHorizontal: Space.md,
    paddingTop: AVATAR_OVERLAP + Space.sm,
    paddingBottom: Space.sm,
  },

  // Name + handle
  identityHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  identityTextCol: {
    flex: 1,
    marginLeft: AVATAR_SIZE + Space.sm,
  },
  displayName: {
    fontSize: 22,
    fontFamily: Typography.family.bold,
    color: TEXT,
    letterSpacing: -0.4,
    marginBottom: 2,
  },
  username: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: SECONDARY,
  },

  // Biography
  bio: {
    fontSize: 14,
    fontFamily: Typography.family.regular,
    color: TEXT,
    lineHeight: 20,
    marginBottom: Space.xs,
  },

  // One quiet context line — no icons
  contextLine: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: MUTED,
    marginBottom: Space.xs,
  },

  // Website as separate intentional link
  websiteLink: {
    paddingVertical: 2,
    marginBottom: Space.sm,
  },
  websiteText: {
    fontSize: 13,
    fontFamily: Typography.family.medium,
    color: SECONDARY,
    textDecorationLine: 'underline',
  },

  // Compact proof system — 4 equal cells, no dividers
  proofSystem: {
    flexDirection: 'row',
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    marginBottom: Space.sm,
  },
  proofCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xs,
  },
  proofValue: {
    fontSize: 17,
    fontFamily: Typography.family.bold,
    color: TEXT,
    letterSpacing: -0.3,
  },
  proofLabel: {
    fontSize: 12,
    fontFamily: Typography.family.regular,
    color: MUTED,
    marginTop: 2,
  },

  // Rating — integrated trust line
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  ratingValue: {
    fontSize: 14,
    fontFamily: Typography.family.bold,
    color: TEXT,
  },
  ratingCount: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: SECONDARY,
  },

  // Actions
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
    height: 44,
    borderRadius: 22,
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
    gap: 8,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  messageBtnText: { fontSize: 15, fontFamily: Typography.family.semibold, color: TEXT },
  secondaryActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    gap: 8,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  editProfileBtnText: { fontSize: 15, fontFamily: Typography.family.semibold, color: TEXT },
  btnDisabled: { opacity: 0.5 },
});
