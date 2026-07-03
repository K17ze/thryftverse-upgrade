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

const COVER_HEIGHT = 176;
const AVATAR_SIZE = 88;
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

/**
 * Composed identity surface: cover → avatar → identity → bio → context → stats → rating → actions.
 * Reads as one authored surface, not stacked blocks.
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

  return (
    <View>
      {/* Cover — scrolls naturally with the list, parallax scale on overscroll */}
      <Reanimated.View style={[styles.coverContainer, coverParallaxStyle]}>
        <FlagshipProfileMedia
          coverUri={displayCover}
          coverVideoUri={isVideoUri(displayCover) ? displayCover : undefined}
          isSelf={isSelfProfile}
          coverOnly
          style={{ width: '100%' }}
          coverHeight={COVER_HEIGHT}
        />
      </Reanimated.View>

      {/* Identity canvas — overlaps cover bottom, one continuous surface */}
      <View style={styles.identityCanvas}>
        <View style={styles.avatarRow}>
          <View style={styles.avatarWrap}>
            {displayAvatar ? (
              <CachedImage
                uri={displayAvatar}
                style={styles.avatar}
                containerStyle={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Ionicons name="person" size={32} color={MUTED} />
              </View>
            )}
          </View>
          <View style={styles.identityCol}>
            <Text style={styles.displayName} numberOfLines={2}>
              {targetProfile?.displayName || displayUsername}
            </Text>
            <Text style={styles.username} numberOfLines={1}>
              @{targetProfile?.username ?? 'thryft'}
            </Text>
          </View>
        </View>

        {targetProfile?.bio ? (
          <Text style={styles.bio} numberOfLines={3}>{targetProfile.bio}</Text>
        ) : null}

        {/* One quiet context line — location · joined · website */}
        <View style={styles.contextRow}>
          {targetProfile?.location ? (
            <View style={styles.contextItem}>
              <Ionicons name="location-outline" size={12} color={MUTED} />
              <Text style={styles.contextText} numberOfLines={1}>{targetProfile.location}</Text>
            </View>
          ) : null}
          {targetProfile?.location && memberSince ? <Text style={styles.contextSep}>·</Text> : null}
          {memberSince ? (
            <View style={styles.contextItem}>
              <Ionicons name="calendar-outline" size={12} color={MUTED} />
              <Text style={styles.contextText} numberOfLines={1}>Joined {memberSince}</Text>
            </View>
          ) : null}
          {targetProfile?.website ? (
            <>
              {(targetProfile?.location || memberSince) ? <Text style={styles.contextSep}>·</Text> : null}
              <Pressable
                style={styles.contextItem}
                onPress={() => openWebsite(targetProfile.website!)}
                accessibilityRole="link"
                accessibilityLabel={`Open website ${targetProfile.website}`}
              >
                <Ionicons name="link-outline" size={12} color={SECONDARY} />
                <Text style={[styles.contextText, styles.contextLink]} numberOfLines={1}>Website</Text>
              </Pressable>
            </>
          ) : null}
        </View>

        {/* Four equal-width stats with hairline dividers */}
        <View style={styles.statsRow}>
          <StatCell
            label="For sale"
            value={activeCount}
            onPress={activeCount > 0 ? () => { onTabSelect('Shop'); onShopSegmentSelect('forsale'); } : undefined}
          />
          <StatDivider />
          <StatCell
            label="Sold"
            value={soldCount}
            onPress={soldCount > 0 ? () => { onTabSelect('Shop'); onShopSegmentSelect('sold'); } : undefined}
          />
          <StatDivider />
          <StatCell
            label="Followers"
            value={stats?.followerCount ?? 0}
            onPress={(stats?.followerCount ?? 0) > 0 ? () => onOpenConnections('followers') : undefined}
          />
          <StatDivider />
          <StatCell
            label="Following"
            value={stats?.followingCount ?? 0}
            onPress={(stats?.followingCount ?? 0) > 0 ? () => onOpenConnections('following') : undefined}
          />
        </View>

        {/* Rating — integrated trust line, not a 5th stat cell */}
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

      {/* Actions — Follow primary, Message secondary, More tertiary */}
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

      {/* Self-profile actions */}
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
  );
}

function openWebsite(url: string) {
  let normalized = url.trim();
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
  Linking.openURL(normalized).catch(() => {});
}

function StatCell({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) {
  const content = (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={styles.statCellPressable} accessibilityRole="button" accessibilityLabel={`${value} ${label}`}>
        {content}
      </Pressable>
    );
  }
  return content;
}

function StatDivider() {
  return <View style={styles.statDivider} />;
}

const styles = StyleSheet.create({
  coverContainer: {
    width: '100%',
    height: COVER_HEIGHT,
    overflow: 'hidden',
    backgroundColor: SURFACE_ALT,
  },
  identityCanvas: {
    marginTop: -AVATAR_OVERLAP,
    paddingHorizontal: Space.md,
    paddingTop: AVATAR_OVERLAP + Space.sm,
    paddingBottom: Space.sm,
    backgroundColor: BG,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    overflow: 'hidden',
  },
  avatarRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: Space.sm },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 3,
    borderColor: BG,
  },
  avatarFallback: { backgroundColor: SURFACE_ALT, alignItems: 'center', justifyContent: 'center' },
  identityCol: { flex: 1 },
  displayName: { fontSize: 22, fontFamily: Typography.family.bold, color: TEXT, letterSpacing: -0.4, marginBottom: 2 },
  username: { fontSize: 14, fontFamily: Typography.family.regular, color: SECONDARY },
  bio: { fontSize: 14, fontFamily: Typography.family.regular, color: TEXT, lineHeight: 20, marginBottom: Space.sm },
  contextRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: Space.sm },
  contextItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contextText: { fontSize: 12, fontFamily: Typography.family.regular, color: MUTED },
  contextSep: { fontSize: 12, color: MUTED },
  contextLink: { color: SECONDARY },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    marginBottom: Space.sm,
  },
  statCellPressable: { flex: 1 },
  statCell: { flex: 1, alignItems: 'flex-start' },
  statValue: { fontSize: 17, fontFamily: Typography.family.bold, color: TEXT, letterSpacing: -0.3 },
  statLabel: { fontSize: 11, fontFamily: Typography.family.regular, color: MUTED, marginTop: 2, letterSpacing: 0.1 },
  statDivider: { width: StyleSheet.hairlineWidth, height: 22, backgroundColor: BORDER },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  ratingValue: { fontSize: 14, fontFamily: Typography.family.bold, color: TEXT },
  ratingCount: { fontSize: 13, fontFamily: Typography.family.regular, color: SECONDARY },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: Space.md, paddingVertical: Space.sm, backgroundColor: BG },
  followBtn: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  followBtnActive: { backgroundColor: BRAND },
  followingBtn: { borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, backgroundColor: BG },
  followBtnText: { fontSize: 15, fontFamily: Typography.family.semibold },
  followActiveBtnText: { color: TEXT_INVERSE },
  followingBtnText: { color: TEXT },
  messageBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, backgroundColor: BG,
  },
  messageBtnText: { fontSize: 15, fontFamily: Typography.family.semibold, color: TEXT },
  secondaryActionBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER, backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  editProfileBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: BORDER, backgroundColor: BG,
  },
  editProfileBtnText: { fontSize: 15, fontFamily: Typography.family.semibold, color: TEXT },
  btnDisabled: { opacity: 0.5 },
});
