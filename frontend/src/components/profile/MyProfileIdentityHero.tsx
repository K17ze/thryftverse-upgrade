import React from 'react';
import { Pressable, StyleSheet, Text, View, Linking, type StyleProp, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SellerTrustSummary, VerificationTier } from '../../platform/product';
import { VERIFICATION_TIERS } from '../../platform/product';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';
import { formatCompactCount, formatFullCount } from '../../utils/numberFormat';

// ── Bio linkification + truncation ──
// Parses URLs, @mentions and #hashtags in the bio and renders them as
// tappable inline spans. Non-link text uses the base bio style.
// Bios longer than ~125 chars are truncated with a "see more" expansion.
const BIO_LINK_PATTERN = /((?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+[^\s]*|(?:^|\s)[@#][\w]+)/gi;
const BIO_TRUNCATE_CHARS = 200;

function BioText({ bio, style, linkStyle, seeMoreStyle }: { bio: string; style: StyleProp<TextStyle>; linkStyle: StyleProp<TextStyle>; seeMoreStyle: StyleProp<TextStyle> }) {
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
    <Text style={style} numberOfLines={expanded ? undefined : 4}>
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

interface MyProfileIdentityHeroProps {
  avatarUri: string | null;
  displayName: string;
  username: string;
  bio?: string;
  location?: string;
  website?: string | null;
  memberSince?: string;
  listingCount?: number;
  sellerTrust?: SellerTrustSummary | null;
  soldCount?: number;
  followerCount?: number;
  followingCount?: number;
  /** Average seller rating (e.g. 4.8) — rendered as the tappable review
   *  seam beside the avatar. Omit/null when there is nothing to show. */
  rating?: number | null;
  reviewCount?: number;
  /** Seller response time label (e.g. "within 2h") — surfaced in the trust
   *  line so the most important marketplace trust signal is visible in the
   *  first viewport, not buried in the About tab. */
  responseTimeLabel?: string | null;
  /** Distinguishes loading/error from a real zero count (M2 — truthful UI). */
  followCountsStatus?: 'loading' | 'error' | 'loaded';
  onEditProfile: () => void;
  onPressSold?: () => void;
  onPressFollowers?: () => void;
  onPressFollowing?: () => void;
  /** Taps the "For sale" stat — scrolls to / focuses the listings tab. */
  onPressListings?: () => void;
  /** Taps the rating seam — scrolls to / focuses the reviews tab. */
  onPressRating?: () => void;
}

/**
 * Owner identity hero — Depop/Vinted pattern.
 *
 * Composition:
 *   seam row:  avatar (left, overlapping cover) + identity column (right):
 *              name + verification + quiet edit glyph, @handle
 *   stats:     one inline line — social proof only
 *              "1.2k followers · 56 following"
 *   bio:       plain linkified text — the dominant content block
 *   meta:      Replies within 2h · London · Joined June 2026
 *
 * Marketplace stats (for sale, sold, rating, review count) are deliberately
 * absent from the hero — the listings tab and the review surface carry them.
 * The hero leads with identity and gives the bio the room.
 *
 * The avatar and name share the first band so identity dominates; counts,
 * trust and links recede. The edit affordance is a 20pt glyph on the name
 * row — never a row of its own.
 */
export function MyProfileIdentityHero({
  avatarUri,
  displayName,
  username,
  bio,
  location,
  website,
  memberSince,
  sellerTrust,
  followerCount = 0,
  followingCount = 0,
  responseTimeLabel,
  followCountsStatus = 'loaded',
  onEditProfile,
  onPressFollowers,
  onPressFollowing }: MyProfileIdentityHeroProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Verification tier — only from seller trust (authoritative backend source).
  // Email verification is never used as a proxy for seller/identity verification.
  const verificationTier: VerificationTier | null =
    sellerTrust?.verificationTier ?? (sellerTrust?.verified === true ? 'seller' : null);

  // Follow-count display: show a muted dash while loading or on error so a
  // real zero is distinguishable from an unknown count (M2 — truthful UI).
  const countsUnknown = followCountsStatus === 'loading' || followCountsStatus === 'error';

  // Marketplace meta — one compact line. Response time leads (a top-3
  // conversion signal per Depop/Grailed research); location and tenure
  // follow.
  const metaLine = React.useMemo(() => {
    const parts: string[] = [];
    if (responseTimeLabel) parts.push(`Replies ${responseTimeLabel}`);
    if (location) parts.push(location);
    if (memberSince) parts.push(`Joined ${memberSince}`);
    return parts.join(' · ');
  }, [responseTimeLabel, location, memberSince]);

  return (
    <View style={styles.heroRoot}>
      {/* Avatar — absolutely positioned at the cover/canvas seam */}
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
      </View>

      <View style={styles.identityCanvas}>
        {/* ── Seam row — avatar (left) + identity (right) ──
            Name, @handle and the review seam sit beside the avatar so the
            first band reads as identity, not instrumentation. */}
        <View style={styles.seamRow}>
          <View style={styles.seamSpacer} />
          <View style={styles.identityColumn}>
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
                      : colors.successText
                  }
                  accessibilityLabel={VERIFICATION_TIERS[verificationTier].label}
                />
              ) : null}
              {/* Edit — a transparent 44pt target showing only the glyph.
                  Never a list row, never a filled button. */}
              <AnimatedPressable
                style={styles.editHit}
                onPress={onEditProfile}
                activeOpacity={0.7}
                scaleValue={0.96}
                hapticFeedback="light"
                accessibilityLabel="Edit profile and storefront"
                accessibilityRole="button"
              >
                <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
              </AnimatedPressable>
            </View>
            <Text style={styles.username} numberOfLines={1}>
              @{username}
            </Text>
          </View>
        </View>

        {/* ── Social proof — one inline run: followers · following.
            Marketplace stats (for sale, sold, rating) are deliberately
            absent here — the listings tab and review surface carry them;
            the hero leads with identity and the bio gets the room. */}
        <View style={styles.statsLine}>
          <StatLink
            value={countsUnknown ? '—' : formatCompactCount(followerCount)}
            word="followers"
            styles={styles}
            onPress={onPressFollowers}
            a11yLabel={countsUnknown ? 'Followers count loading' : `${formatFullCount(followerCount)} followers`}
          />
          <Text style={styles.statDot} accessible={false}>·</Text>
          <StatLink
            value={countsUnknown ? '—' : formatCompactCount(followingCount)}
            word="following"
            styles={styles}
            onPress={onPressFollowing}
            a11yLabel={countsUnknown ? 'Following count loading' : `${formatFullCount(followingCount)} following`}
          />
        </View>

        {bio ? <BioText bio={bio} style={styles.bio} linkStyle={styles.bioLink} seeMoreStyle={styles.bioSeeMore} /> : null}

        {/* Marketplace meta — a single muted line. Sold is not restated
            (the tappable sold stat already carries it and routes to
            MyOrders); response time stays surfaced here rather than being
            buried in the About tab. */}
        {metaLine ? (
          <Text style={styles.metaLine} numberOfLines={1}>{metaLine}</Text>
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
      </View>
    </View>
  );
}

/** Inline stat segment — bold compact number + muted lowercase word.
 *  The number carries the information; the word just disambiguates it. */
function StatLink({ value, word, styles, onPress, a11yLabel }: {
  value: string;
  word: string;
  styles: ReturnType<typeof createStyles>;
  onPress?: () => void;
  a11yLabel?: string;
}) {
  const inner = (
    <Text numberOfLines={1}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statWord}>{' '}{word}</Text>
    </Text>
  );
  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [styles.statLink, pressed && { opacity: 0.55 }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel ?? `${value} ${word}`}
        hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
      >
        {inner}
      </Pressable>
    );
  }
  return (
    <View style={styles.statLink} accessible accessibilityLabel={a11yLabel ?? `${value} ${word}`}>
      {inner}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  heroRoot: {
    position: 'relative',
    backgroundColor: colors.background },

  // Avatar — absolutely positioned at the cover/canvas seam
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt },
  identityCanvas: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm },

  // Seam row — reserves avatar overlap height on the left; the identity
  // column fills the right. The row grows to fit name + handle + rating.
  seamRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: AVATAR_OVERLAP + Space.xs,
    marginBottom: Space.xs },
  seamSpacer: {
    width: AVATAR_SIZE + Space.sm },
  identityColumn: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 2 },
  displayNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1 },
  displayName: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontFamily: Typography.family.bold,
    fontSize: TypographyV2.screenTitle.size,
    lineHeight: TypographyV2.screenTitle.lineHeight,
    letterSpacing: -0.4,
    marginBottom: 2 },
  username: {
    color: colors.textSecondary,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size,
    marginBottom: 2 },

  // Stats line — inline numbers with muted words, hairline-free.
  statsLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: Space.xs,
    marginBottom: Space.xs },
  statLink: {
    paddingVertical: 2 },
  statValue: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.body.size,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  statWord: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size },
  statDot: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size,
    marginHorizontal: Space.xs },

  bio: {
    color: colors.textPrimary,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    marginBottom: Space.xs },
  bioLink: {
    color: colors.brand,
    fontFamily: Typography.family.medium },
  bioSeeMore: {
    color: colors.textSecondary,
    fontFamily: Typography.family.semibold },
  // Marketplace meta — one compact muted line under the bio
  metaLine: {
    color: colors.textMuted,
    fontFamily: Typography.family.regular,
    fontSize: TypographyV2.meta.size,
    marginBottom: Space.xs },
  websiteLink: {
    paddingVertical: 2,
    marginBottom: Space.xs },
  websiteText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textSecondary },

  // Edit — transparent trailing affordance pinned to the end of the name
  // row. The 44pt target comes from AnimatedPressable's default hitSlop;
  // the visible shape is only the glyph (no filled container).
  editHit: {
    marginLeft: 'auto',
    paddingLeft: Space.sm },

});
}
