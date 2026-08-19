import React from 'react';
import { Pressable, StyleSheet, Text, View, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SellerTrustSummary, VerificationTier } from '../../platform/product';
import { VERIFICATION_TIERS } from '../../platform/product';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius, Type } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { formatCompactCount, formatFullCount } from '../../utils/numberFormat';

// ── Bio linkification + truncation ──
// Parses URLs, @mentions and #hashtags in the bio and renders them as
// tappable inline spans. Non-link text uses the base bio style.
// Bios longer than ~125 chars are truncated with a "see more" expansion.
const BIO_LINK_PATTERN = /((?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+[^\s]*|(?:^|\s)[@#][\w]+)/gi;
const BIO_TRUNCATE_CHARS = 125;

function BioText({ bio, style, linkStyle, seeMoreStyle }: { bio: string; style: any; linkStyle: any; seeMoreStyle: any }) {
  const [expanded, setExpanded] = React.useState(false);
  const shouldTruncate = bio.length > BIO_TRUNCATE_CHARS;
  const displayBio = shouldTruncate && !expanded
    ? bio.slice(0, BIO_TRUNCATE_CHARS).trimEnd() + '…'
    : bio;

  const segments = React.useMemo(() => {
    const parts: { text: string; isLink: boolean }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    const pattern = new RegExp(BIO_LINK_PATTERN.source, 'gi');
    while ((match = pattern.exec(displayBio)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: displayBio.slice(lastIndex, match.index), isLink: false });
      }
      parts.push({ text: match[0], isLink: true });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < displayBio.length) {
      parts.push({ text: displayBio.slice(lastIndex), isLink: false });
    }
    return parts.length > 0 ? parts : [{ text: displayBio, isLink: false }];
  }, [displayBio]);

  const handleLinkPress = (link: string) => {
    const trimmed = link.trim();
    if (trimmed.startsWith('@') || trimmed.startsWith('#')) {
      // Mentions/hashtags — no dedicated screen yet; suppress to avoid dead taps
      return;
    }
    let normalized = trimmed;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    Linking.openURL(normalized).catch(() => {});
  };

  return (
    <Text style={style} numberOfLines={expanded ? undefined : 2}>
      {segments.map((seg, i) =>
        seg.isLink ? (
          <Text
            key={i}
            style={linkStyle}
            onPress={() => handleLinkPress(seg.text)}
          >
            {seg.text}
          </Text>
        ) : (
          <Text key={i}>{seg.text}</Text>
        )
      )}
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

const AVATAR_SIZE = 96; // design contract: 96-128pt seam avatar — matches ProfileHero (2026 standard)
const AVATAR_OVERLAP = AVATAR_SIZE / 2;
const ACTION_RADIUS = 11;
const ACTION_HEIGHT = 44;

interface MyProfileIdentityHeroProps {
  avatarUri: string | null;
  displayName: string;
  username: string;
  bio?: string;
  location?: string;
  website?: string | null;
  memberSince?: string;
  listingCount?: number;
  lookCount?: number;
  sellerTrust?: SellerTrustSummary | null;
  emailVerified?: boolean;
  ratingAverage?: number | null;
  reviewCount?: number | null;
  soldCount?: number;
  followerCount?: number;
  followingCount?: number;
  /** Distinguishes loading/error from a real zero count (M2 — truthful UI). */
  followCountsStatus?: 'loading' | 'error' | 'loaded';
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
  website,
  memberSince,
  sellerTrust,
  emailVerified,
  ratingAverage,
  reviewCount,
  soldCount,
  followerCount = 0,
  followingCount = 0,
  followCountsStatus = 'loaded',
  onEditAvatar,
  onEditProfile,
  onShare,
  onPressSold,
  onPressFollowers,
  onPressFollowing,
}: MyProfileIdentityHeroProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const verified =
    sellerTrust?.verified === true || emailVerified === true;
  const verificationTier: VerificationTier | null =
    sellerTrust?.verificationTier ?? (verified ? 'email' : null);
  const completedSales = sellerTrust?.completedSales ?? soldCount ?? 0;

  const hasRating = ratingAverage !== null && ratingAverage !== undefined && (reviewCount ?? 0) > 0;

  // Trust line: "4.9 ★ · 47 sold · Joined June 2026" — one row, no chips
  const trustParts: string[] = [];
  if (hasRating && ratingAverage !== null && ratingAverage !== undefined) {
    trustParts.push(`${ratingAverage.toFixed(1)} ★`);
  }
  if (completedSales > 0) trustParts.push(`${completedSales} sold`);
  if (memberSince) trustParts.push(`Joined ${memberSince}`);
  const trustLine = trustParts.join(' · ');

  // Follow-count display: show a muted dash while loading or on error so a
  // real zero is distinguishable from an unknown count (M2 — truthful UI).
  const countsUnknown = followCountsStatus === 'loading' || followCountsStatus === 'error';
  const followerDisplay = countsUnknown ? '—' : formatCompactCount(followerCount);
  const followingDisplay = countsUnknown ? '—' : formatCompactCount(followingCount);
  const followerA11y = countsUnknown
    ? 'Followers count loading'
    : `${formatFullCount(followerCount)} followers`;
  const followingA11y = countsUnknown
    ? 'Following count loading'
    : `${formatFullCount(followingCount)} following`;

  return (
    <View style={styles.heroRoot}>
      {/* ── Seam row: avatar (left, overlapping cover) + 3 stats (right) ── */}
      <View style={styles.avatarAbsolute}>
        {avatarUri ? (
          <CachedImage
            uri={avatarUri}
            style={styles.avatar}
            containerStyle={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.avatar, styles.avatarMonogram]}>
            <Ionicons name="person-outline" size={32} color={colors.textMuted} />
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

      {/* Identity canvas — paddingTop reserves avatar space */}
      <View style={styles.identityCanvas}>
        {/* ── Seam row — avatar (left) + Followers · Following · Sold (right) ──
            Followers is the hero stat (parasocial proof). Following is
            secondary. Sold is marketplace proof. Listings/Looks counts are
            already visible in the tab rail below — no duplication here. */}
        <View style={styles.seamRow}>
          <View style={styles.seamSpacer} />
          <View style={styles.seamStats}>
            <ProfileStat
              value={followerDisplay}
              label="Followers"
              styles={styles}
              onPress={onPressFollowers}
              a11yLabel={followerA11y}
            />
            <View style={styles.seamStatDivider} />
            <ProfileStat
              value={followingDisplay}
              label="Following"
              styles={styles}
              onPress={onPressFollowing}
              a11yLabel={followingA11y}
            />
            <View style={styles.seamStatDivider} />
            <ProfileStat
              value={countsUnknown ? '—' : formatCompactCount(completedSales)}
              label="Sold"
              styles={styles}
              onPress={onPressSold}
              a11yLabel={countsUnknown ? 'Sold count loading' : `${formatFullCount(completedSales)} sold`}
            />
          </View>
        </View>

        {/* Identity — full-width, left-aligned */}
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

        {bio ? <BioText bio={bio} style={styles.bio} linkStyle={styles.bioLink} seeMoreStyle={styles.bioSeeMore} /> : null}

        {location ? (
          <Text style={styles.contextLine} numberOfLines={1}>{location}</Text>
        ) : null}

        {/* Website — tappable link, matches ProfileHero */}
        {website ? (
          <Pressable
            style={({ pressed }) => [styles.websiteLink, pressed && { opacity: 0.6 }]}
            onPress={() => {
              let normalized = website.trim();
              if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
              Linking.openURL(normalized).catch(() => {});
            }}
            accessibilityRole="link"
            accessibilityLabel={`Open website ${website}`}
          >
            <Text style={styles.websiteText} numberOfLines={1}>{website}</Text>
          </Pressable>
        ) : null}

        {/* Trust line — one row, no chips, no second trust surface */}
        {trustLine ? (
          <View style={styles.trustRow}>
            {hasRating && ratingAverage !== null && ratingAverage !== undefined ? (
              <Text style={styles.trustLink}>{ratingAverage.toFixed(1)} ★</Text>
            ) : null}
            {hasRating && completedSales > 0 ? <Text style={styles.trustDot}> · </Text> : null}
            {completedSales > 0 ? (
              <Text style={styles.trustLink}>{completedSales} sold</Text>
            ) : null}
            {(hasRating || completedSales > 0) && memberSince ? <Text style={styles.trustDot}> · </Text> : null}
            {memberSince ? <Text style={styles.trustStatic}>Joined {memberSince}</Text> : null}
          </View>
        ) : null}
      </View>

      {/* Actions — flat, single row, clear primary/secondary hierarchy */}
      <View style={styles.actionRow}>
        <AnimatedPressable
          style={[styles.action, styles.editAction]}
          onPress={onEditProfile}
          activeOpacity={0.88}
          hapticFeedback="light"
          accessibilityLabel="Edit profile"
          accessibilityRole="button"
        >
          <Ionicons name="create-outline" size={15} color={colors.textInverse} />
          <Text style={styles.editActionText}>Edit profile</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.action, styles.shareAction]}
          onPress={onShare}
          activeOpacity={0.88}
          hapticFeedback="light"
          accessibilityLabel="Share profile"
          accessibilityRole="button"
        >
          <Ionicons name="share-outline" size={17} color={colors.textPrimary} />
          <Text style={styles.shareActionText}>Share</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function ProfileStat({ value, label, styles, onPress, a11yLabel }: {
  value: string;
  label: string;
  styles: ReturnType<typeof createStyles>;
  onPress?: () => void;
  a11yLabel?: string;
}) {
  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [styles.seamStat, pressed && { opacity: 0.55 }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel ?? value}
        hitSlop={4}
      >
        <Text style={styles.seamStatValue} numberOfLines={1}>{value}</Text>
        <Text style={styles.seamStatLabel} numberOfLines={1}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.seamStat} accessible accessibilityLabel={a11yLabel ?? value}>
      <Text style={styles.seamStatValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.seamStatLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  heroRoot: {
    position: 'relative',
    backgroundColor: colors.background,
  },

  // Avatar — absolutely positioned at the cover/canvas seam
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
    borderColor: colors.background,
  },
  avatarMonogram: {
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
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  seamStat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xs,
  },
  seamStatValue: {
    fontSize: Type.sectionTitle.size,
    fontFamily: Typography.family.bold,
    color: colors.textPrimary,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'] as ['tabular-nums'],
  },
  seamStatLabel: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
    marginTop: 1,
    letterSpacing: Type.caption.letterSpacing,
  },
  seamStatDivider: {
    width: StyleSheet.hairlineWidth,
    height: Space.lg,
    backgroundColor: colors.borderSubtle,
  },

  // Identity — full-width, left-aligned
  displayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
  },
  displayName: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontFamily: Typography.family.bold,
    fontSize: Type.priceList.size,
    letterSpacing: -0.4,
    marginBottom: 2,
  },
  username: {
    color: colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    marginBottom: Space.xs,
  },
  bio: {
    color: colors.textPrimary,
    fontFamily: Typography.family.regular,
    fontSize: Type.body.size,
    lineHeight: Type.body.lineHeight,
    marginBottom: Space.xs,
  },
  bioLink: {
    color: colors.brand,
    fontFamily: Typography.family.medium,
  },
  bioSeeMore: {
    color: colors.textSecondary,
    fontFamily: Typography.family.semibold,
  },
  contextLine: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: Type.caption.size,
    marginBottom: Space.xs,
  },
  websiteLink: {
    paddingVertical: 2,
    marginBottom: Space.xs,
  },
  websiteText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.medium,
    color: colors.textSecondary,
  },

  // Trust line — compact, no badge container
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingVertical: 2,
    marginBottom: Space.xs,
  },
  trustLink: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.semibold,
    color: colors.textPrimary,
  },
  trustStatic: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },
  trustDot: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    color: colors.textMuted,
  },

  // Actions — flat, single row
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    backgroundColor: colors.background,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs + 3,
    height: ACTION_HEIGHT,
    borderRadius: ACTION_RADIUS,
  },
  editAction: {
    backgroundColor: colors.brand,
  },
  editActionText: {
    color: colors.textInverse,
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyStrong.size,
  },
  shareAction: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  shareActionText: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: Type.bodyStrong.size,
  },
  });
}
