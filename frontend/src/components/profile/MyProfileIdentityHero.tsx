import React from 'react';
import { Pressable, StyleSheet, Text, View, Linking, type StyleProp, type TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SellerTrustSummary, VerificationTier } from '../../platform/product';
import { VERIFICATION_TIERS } from '../../platform/product';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Typography, Radius } from '../../theme/designTokens';
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
  lookCount?: number;
  sellerTrust?: SellerTrustSummary | null;
  soldCount?: number;
  followerCount?: number;
  /** Seller response time label (e.g. "within 2h") — surfaced in the trust
   *  line so the most important marketplace trust signal is visible in the
   *  first viewport, not buried in the About tab. */
  responseTimeLabel?: string | null;
  /** Distinguishes loading/error from a real zero count (M2 — truthful UI). */
  followCountsStatus?: 'loading' | 'error' | 'loaded';
  onEditProfile: () => void;
  onPressSold?: () => void;
  onPressFollowers?: () => void;
  /** Taps the "For sale" stat — scrolls to / focuses the listings tab. */
  onPressListings?: () => void;
}

export function MyProfileIdentityHero({
  avatarUri,
  displayName,
  username,
  bio,
  location,
  website,
  memberSince,
  listingCount = 0,
  sellerTrust,
  soldCount,
  followerCount = 0,
  responseTimeLabel,
  followCountsStatus = 'loaded',
  onEditProfile,
  onPressSold,
  onPressFollowers,
  onPressListings }: MyProfileIdentityHeroProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  // Verification tier — only from seller trust (authoritative backend source).
  // Email verification is never used as a proxy for seller/identity verification.
  const verificationTier: VerificationTier | null =
    sellerTrust?.verificationTier ?? (sellerTrust?.verified === true ? 'seller' : null);
  const completedSales = sellerTrust?.completedSales ?? soldCount ?? 0;

  // Follow-count display: show a muted dash while loading or on error so a
  // real zero is distinguishable from an unknown count (M2 — truthful UI).
  const countsUnknown = followCountsStatus === 'loading' || followCountsStatus === 'error';
  const followerDisplay = countsUnknown ? '—' : formatCompactCount(followerCount);
  const followerA11y = countsUnknown
    ? 'Followers count loading'
    : `${formatFullCount(followerCount)} followers`;

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
      </View>

      {/* Identity canvas — paddingTop reserves avatar space */}
      <View style={styles.identityCanvas}>
        {/* ── Seam row — avatar (left) + storefront stats (right) ──
            For sale · Sold · Followers — the storefront triad, matching the
            public ProfileHero. "Following" is a social metric and drops out;
            the marketplace proof (inventory + sales) leads. */}
        <View style={styles.seamRow}>
          <View style={styles.seamSpacer} />
          <View style={styles.seamStats}>
            <ProfileStat
              value={countsUnknown ? '—' : formatCompactCount(listingCount)}
              label="For sale"
              styles={styles}
              onPress={onPressListings}
              a11yLabel={countsUnknown ? 'Listings count loading' : `${formatFullCount(listingCount)} for sale`}
            />
            <View style={styles.seamStatDivider} />
            <ProfileStat
              value={countsUnknown ? '—' : formatCompactCount(completedSales)}
              label="Sold"
              styles={styles}
              onPress={onPressSold}
              a11yLabel={countsUnknown ? 'Sold count loading' : `${formatFullCount(completedSales)} sold`}
            />
            <View style={styles.seamStatDivider} />
            <ProfileStat
              value={followerDisplay}
              label="Followers"
              styles={styles}
              onPress={onPressFollowers}
              a11yLabel={followerA11y}
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
                  : colors.successText
              }
              accessibilityLabel={VERIFICATION_TIERS[verificationTier].label}
            />
          ) : null}
        </View>
        <Text style={styles.username} numberOfLines={1}>
          @{username}
        </Text>

        {bio ? <BioText bio={bio} style={styles.bio} linkStyle={styles.bioLink} seeMoreStyle={styles.bioSeeMore} /> : null}

        {/* Edit — a single quiet settings row, not the IG twin-pill pair.
            Share already lives in the cover chrome (top-right icon), so the
            hero carries only the action that isn't duplicated elsewhere. */}
        <AnimatedPressable
          style={styles.editRow}
          onPress={onEditProfile}
          activeOpacity={0.7}
          scaleValue={0.99}
          hapticFeedback="light"
          accessibilityLabel="Edit profile and storefront"
          accessibilityRole="button"
        >
          <Text style={styles.editRowText}>Edit profile</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </AnimatedPressable>

        {/* Trust header — marketplace meta row (sold, response time) + joined
            caption on a separate, less prominent line. Response time is
            surfaced here (not buried in About) because Depop/Grailed 2026
            research shows it is a top-3 conversion signal for marketplace
            profiles. */}
        {(completedSales > 0 || memberSince || responseTimeLabel) ? (
          <View style={styles.trustBlock}>
            {completedSales > 0 || responseTimeLabel ? (
              <View style={styles.trustMetaRow}>
                {completedSales > 0 ? (
                  <Text style={styles.trustSold}>{completedSales} sold</Text>
                ) : null}
                {completedSales > 0 && responseTimeLabel ? <Text style={styles.trustDot}> · </Text> : null}
                {responseTimeLabel ? (
                  <Text style={styles.trustResponse}>Replies {responseTimeLabel}</Text>
                ) : null}
              </View>
            ) : null}
            {/* Joined — less prominent caption on its own line, no dot separator */}
            {memberSince ? <Text style={styles.trustJoined}>Joined {memberSince}</Text> : null}
          </View>
        ) : null}

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
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
  // Identity canvas — no top padding; seamRow reserves avatar overlap space
  identityCanvas: {
    paddingHorizontal: Space.md,
    paddingTop: 0,
    paddingBottom: Space.sm },

  // Seam row — begins immediately at canvas boundary, reserves avatar overlap height
  seamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: AVATAR_OVERLAP + Space.sm,
    marginBottom: Space.xs },
  seamSpacer: {
    width: AVATAR_SIZE + Space.sm },
  seamStats: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around' },
  seamStat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xs },
  seamStatValue: {
    fontSize: TypographyV2.sectionTitle.size,
    fontFamily: TypographyV2.sectionTitle.fontFamily,
    color: colors.textPrimary,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  seamStatLabel: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    color: colors.textMuted,
    marginTop: 1,
    letterSpacing: TypographyV2.meta.letterSpacing },
  seamStatDivider: {
    width: StyleSheet.hairlineWidth,
    height: Space.lg,
    backgroundColor: colors.borderSubtle },

  // Identity — full-width, left-aligned
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
    marginBottom: Space.xs },
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
  contextLine: {
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

  // Trust header — marketplace meta row + joined caption on separate lines
  trustBlock: {
    paddingVertical: 2,
    marginBottom: Space.xs },
  trustMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 3 },
  trustSold: {
    fontSize: TypographyV2.numericMeta.size,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'] as ['tabular-nums'] },
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

  // Edit — a single quiet settings row: hairline top border, label left,
  // chevron right. 44pt+ row, no filled container.
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingVertical: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    marginTop: Space.xs },
  editRowText: {
    color: colors.textPrimary,
    fontFamily: Typography.family.semibold,
    fontSize: TypographyV2.bodyStrong.size },

});
}
