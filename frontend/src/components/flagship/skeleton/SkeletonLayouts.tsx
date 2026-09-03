import React, { memo } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useAppTheme } from '../../../theme/ThemeContext';
import {
  Space,
  Radius,
  AvatarSize,
  AspectRatio,
  ProfileLayout,
  Stroke,
  IconGrammar,
} from '../../../theme/designTokens';
import { TypographyV2 } from '../../../theme/typography.v2';
import {
  SkeletonBlock,
  SkeletonCircle,
  SkeletonTextLine,
  SkeletonImage,
} from './SkeletonPrimitives';

/**
 * SkeletonLayouts — geometry-matching skeleton compositions for each flagship
 * screen type.
 *
 * 2026 research (August):
 *   - Skeletons must match the final layout geometry exactly (same spacing,
 *     radius, density). No layout shift when data resolves.
 *   - Skeletons work best for predictable layouts: feeds, lists, profiles,
 *     settings.
 *   - Nielsen Norman: <1s = no indicator, 1-10s = skeleton, >10s = skeleton
 *     + progress.
 *
 * Each skeleton mirrors the real screen's composition (dominant object,
 * reading order, spacing) so the transition from skeleton → content is a
 * fill-in, not a reflow.
 */

// ---------------------------------------------------------------------------
// Listing card skeleton — matches FlagshipProductCard layout exactly
// ---------------------------------------------------------------------------

const LISTING_GAP = Space.sm;
const LISTING_COLUMNS = 2;

/**
 * Listing card skeleton — matches FlagshipProductCard:
 *   - 4:5 image (Radius.lg)
 *   - 2-line title (body size)
 *   - price line (bodyStrong size)
 *   - seller row (meta size)
 */
export const ListingCardSkeleton = memo(function ListingCardSkeleton({
  cardWidth,
}: {
  cardWidth?: number;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const cardW = cardWidth ?? (screenWidth - Space.md * 2 - LISTING_GAP) / LISTING_COLUMNS;
  const cardH = cardW / AspectRatio.marketplace; // 4:5

  return (
    <View style={{ width: cardW, marginBottom: Space.md }}>
      {/* Image — 4:5, Radius.lg (matches imageWrap) */}
      <SkeletonImage
        aspectRatio={AspectRatio.marketplace}
        width={cardW}
        radius={Radius.lg}
      />
      {/* Title — 2 lines worth of height, body size */}
      <View style={{ marginTop: Space.xs, gap: Space.xxs }}>
        <SkeletonTextLine
          width="90%"
          height={TypographyV2.body.size}
        />
        <SkeletonTextLine
          width="60%"
          height={TypographyV2.body.size}
        />
      </View>
      {/* Price — bodyStrong size */}
      <SkeletonTextLine
        width="45%"
        height={TypographyV2.bodyStrong.size}
        style={{ marginTop: Space.xxs }}
      />
      {/* Seller row — meta size */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.xs, marginTop: Space.xs }}>
        <SkeletonCircle size={AvatarSize.inline} />
        <SkeletonTextLine
          width={80}
          height={TypographyV2.meta.size}
        />
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Feed skeleton — matches HomeScreen feed layout
// ---------------------------------------------------------------------------

/** Masonry image aspect ratios cycled for natural height rhythm. */
const FEED_MASONRY_RATIOS = [
  AspectRatio.marketplace, // 4:5
  AspectRatio.square,      // 1:1
  AspectRatio.portrait,    // 3:4
] as const;

/**
 * Masonry feed card — a single listing card skeleton with a variable image
 * aspect ratio so the two masonry columns have natural height variation,
 * matching the HomeScreen masonry feed composition.
 */
const MasonryFeedCard = memo(function MasonryFeedCard({
  cardWidth,
  aspectRatio,
}: {
  cardWidth: number;
  aspectRatio: number;
}) {
  return (
    <View style={{ width: cardWidth, marginBottom: Space.md }}>
      {/* Image — variable aspect ratio, Radius.lg (matches imageWrap) */}
      <SkeletonImage
        aspectRatio={aspectRatio}
        width={cardWidth}
        radius={Radius.lg}
      />
      {/* Title — 2 lines worth of height, body size */}
      <View style={{ marginTop: Space.xs, gap: Space.xxs }}>
        <SkeletonTextLine
          width="90%"
          height={TypographyV2.body.size}
        />
        <SkeletonTextLine
          width="60%"
          height={TypographyV2.body.size}
        />
      </View>
      {/* Price — bodyStrong size */}
      <SkeletonTextLine
        width="45%"
        height={TypographyV2.bodyStrong.size}
        style={{ marginTop: Space.xxs }}
      />
      {/* Seller row — meta size */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.xs, marginTop: Space.xs }}>
        <SkeletonCircle size={AvatarSize.inline} />
        <SkeletonTextLine
          width={80}
          height={TypographyV2.meta.size}
        />
      </View>
    </View>
  );
});

/**
 * Feed skeleton — a 2-column masonry of listing card skeletons with variable
 * image heights, matching the HomeScreen masonry feed composition. Cards are
 * assigned to columns round-robin and cycle through 4:5, 1:1, and 3:4 aspect
 * ratios for a natural masonry rhythm.
 */
export const FeedSkeleton = memo(function FeedSkeleton({
  count = 6,
}: {
  count?: number;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const cardW = (screenWidth - Space.md * 2 - LISTING_GAP) / LISTING_COLUMNS;

  // Round-robin masonry: assign cards to two columns, varying the image
  // aspect ratio for natural height rhythm (4:5, 1:1, 3:4).
  const left: React.ReactNode[] = [];
  const right: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    const ratio = FEED_MASONRY_RATIOS[i % FEED_MASONRY_RATIOS.length];
    const card = <MasonryFeedCard key={i} cardWidth={cardW} aspectRatio={ratio} />;
    if (i % 2 === 0) {
      left.push(card);
    } else {
      right.push(card);
    }
  }

  return (
    <View style={styles.feedContainer}>
      <View style={styles.feedMasonryColumn}>
        {left}
      </View>
      <View style={styles.feedMasonryColumn}>
        {right}
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// PDP skeleton — matches ItemDetailScreen (MediaStageScreen) layout
// ---------------------------------------------------------------------------

/**
 * Product detail skeleton — matches the MediaStageScreen composition:
 *   - Full-bleed image gallery (3:4 portrait stage)
 *   - Title + price row
 *   - Seller card
 *   - Description lines
 *   - Trust signals row
 */
export const ProductDetailSkeleton = memo(function ProductDetailSkeleton() {
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const stageHeight = Math.round(screenWidth / AspectRatio.portrait);

  return (
    <View style={styles.pdpContainer}>
      {/* Image gallery — full-bleed 3:4 stage */}
      <SkeletonBlock
        width={screenWidth}
        height={stageHeight}
        radius={Radius.none}
      />

      {/* Content sheet — matches sheet padding */}
      <View style={styles.pdpSheet}>
        {/* Title — itemTitle size, 2 lines */}
        <View style={{ gap: Space.xxs }}>
          <SkeletonTextLine
            width="85%"
            height={TypographyV2.itemTitle.size}
          />
          <SkeletonTextLine
            width="50%"
            height={TypographyV2.itemTitle.size}
          />
        </View>

        {/* Price — priceList size */}
        <SkeletonTextLine
          width="35%"
          height={TypographyV2.priceList.size}
          style={{ marginTop: Space.sm }}
        />

        {/* Seller card — avatar + name + rating */}
        <View style={[styles.pdpSellerCard, { borderTopColor: colors.borderSubtle }]}>
          <SkeletonCircle size={AvatarSize.md} />
          <View style={{ flex: 1, gap: Space.xxs }}>
            <SkeletonTextLine
              width={120}
              height={TypographyV2.bodyStrong.size}
            />
            <SkeletonTextLine
              width={80}
              height={TypographyV2.meta.size}
            />
          </View>
          <SkeletonBlock
            width={76}
            height={28}
            radius={Radius.full}
          />
        </View>

        {/* Description — body lines */}
        <View style={{ marginTop: Space.md, gap: Space.xs }}>
          <SkeletonTextLine width="100%" height={TypographyV2.body.size} />
          <SkeletonTextLine width="100%" height={TypographyV2.body.size} />
          <SkeletonTextLine width="70%" height={TypographyV2.body.size} />
        </View>

        {/* Trust signals row */}
        <View style={styles.pdpTrustRow}>
          <SkeletonBlock width={100} height={32} radius={Radius.md} />
          <SkeletonBlock width={100} height={32} radius={Radius.md} />
          <SkeletonBlock width={100} height={32} radius={Radius.md} />
        </View>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Chat list skeleton — matches InboxScreen (DenseListScreen) layout
// ---------------------------------------------------------------------------

/**
 * Chat list skeleton — matches the DenseListScreen row composition:
 *   avatar (40pt) + name + preview line + timestamp.
 */
export const ChatListSkeleton = memo(function ChatListSkeleton({
  count = 5,
}: {
  count?: number;
}) {
  return (
    <View style={styles.listContainer}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.chatRow}>
          <SkeletonCircle size={AvatarSize.md} />
          <View style={styles.chatTextCol}>
            <View style={styles.chatTopRow}>
              <SkeletonTextLine
                width="50%"
                height={TypographyV2.bodyStrong.size}
              />
              <SkeletonTextLine
                width={40}
                height={TypographyV2.meta.size}
              />
            </View>
            <SkeletonTextLine
              width="80%"
              height={TypographyV2.body.size}
              style={{ marginTop: Space.xxs }}
            />
          </View>
        </View>
      ))}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Seller hub skeleton — matches SellerHubScreen (TaskQueueScreen) layout
// ---------------------------------------------------------------------------

/**
 * Seller hub skeleton — matches the TaskQueueScreen composition:
 *   - Urgent task hero (dominant object)
 *   - Task queue rows
 *   - Analytics metric cards
 */
export const SellerHubSkeleton = memo(function SellerHubSkeleton() {
  const { colors } = useAppTheme();
  return (
    <View style={styles.sellerHubContainer}>
      {/* Urgent task hero — dominant object */}
      <View style={styles.sellerHubHero}>
        <SkeletonTextLine
          width="60%"
          height={TypographyV2.meta.size}
        />
        <SkeletonTextLine
          width="90%"
          height={TypographyV2.itemTitle.size}
          style={{ marginTop: Space.xs }}
        />
        <SkeletonTextLine
          width="70%"
          height={TypographyV2.body.size}
          style={{ marginTop: Space.xxs }}
        />
        <SkeletonBlock
          width="100%"
          height={44}
          radius={Radius.lg}
          style={{ marginTop: Space.md }}
        />
      </View>

      {/* Task queue rows */}
      <View style={[styles.sellerHubSection, { borderTopColor: colors.borderSubtle }]}>
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={styles.sellerHubRow}>
            <SkeletonCircle size={AvatarSize.md} />
            <View style={{ flex: 1, gap: Space.xxs }}>
              <SkeletonTextLine
                width="60%"
                height={TypographyV2.bodyStrong.size}
              />
              <SkeletonTextLine
                width="40%"
                height={TypographyV2.meta.size}
              />
            </View>
            <SkeletonBlock
              width={24}
              height={24}
              radius={Radius.full}
            />
          </View>
        ))}
      </View>

      {/* Analytics cards — flat rows, not tile grid */}
      <View style={[styles.sellerHubSection, { borderTopColor: colors.borderSubtle }]}>
        {Array.from({ length: 2 }).map((_, i) => (
          <View key={i} style={styles.sellerHubMetricRow}>
            <SkeletonTextLine
              width={100}
              height={TypographyV2.meta.size}
            />
            <SkeletonTextLine
              width="50%"
              height={TypographyV2.priceList.size}
              style={{ marginTop: Space.xxs }}
            />
          </View>
        ))}
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Settings skeleton — matches SettingsScreen (SettingsCanvasScreen) layout
// ---------------------------------------------------------------------------

/**
 * Settings skeleton — matches the SettingsCanvasScreen composition:
 *   section headers + rows with icon + label + current value.
 */
export const SettingsSkeleton = memo(function SettingsSkeleton({
  sections = 3,
  rowsPerSection = 4,
}: {
  sections?: number;
  rowsPerSection?: number;
}) {
  return (
    <View style={styles.settingsContainer}>
      {Array.from({ length: sections }).map((_, sIdx) => (
        <View key={sIdx} style={styles.settingsSection}>
          {/* Section header */}
          <SkeletonTextLine
            width={120}
            height={TypographyV2.meta.size}
            style={{ marginBottom: Space.sm }}
          />
          {/* Rows — icon + label + value */}
          {Array.from({ length: rowsPerSection }).map((_, rIdx) => (
            <View key={rIdx} style={styles.settingsRow}>
              <SkeletonBlock
                width={IconGrammar.standard}
                height={IconGrammar.standard}
                radius={Radius.sm}
              />
              <View style={{ flex: 1 }}>
                <SkeletonTextLine
                  width="50%"
                  height={TypographyV2.body.size}
                />
              </View>
              <SkeletonTextLine
                width={60}
                height={TypographyV2.meta.size}
              />
              <SkeletonBlock
                width={16}
                height={16}
                radius={Radius.full}
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
});

// ---------------------------------------------------------------------------
// Checkout skeleton — matches CheckoutScreen (CommitmentScreen) layout
// ---------------------------------------------------------------------------

/**
 * Checkout skeleton — matches the CommitmentScreen composition:
 *   - Order summary (dominant object, pinned top)
 *   - Shipping form fields
 *   - Payment method row
 *   - Order total
 */
export const CheckoutSkeleton = memo(function CheckoutSkeleton() {
  const { colors } = useAppTheme();
  return (
    <View style={styles.checkoutContainer}>
      {/* Order summary — dominant object */}
      <View style={styles.checkoutSummary}>
        <SkeletonTextLine
          width={140}
          height={TypographyV2.meta.size}
        />
        {/* Summary line items */}
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={styles.checkoutLineItem}>
            <SkeletonTextLine
              width="40%"
              height={TypographyV2.body.size}
            />
            <SkeletonTextLine
              width={80}
              height={TypographyV2.body.size}
            />
          </View>
        ))}
        {/* Total */}
        <View style={[styles.checkoutTotalRow, { borderTopColor: colors.borderSubtle }]}>
          <SkeletonTextLine
            width={100}
            height={TypographyV2.bodyStrong.size}
          />
          <SkeletonTextLine
            width={120}
            height={TypographyV2.priceHero.size}
          />
        </View>
      </View>

      {/* Shipping form */}
      <View style={[styles.checkoutSection, { borderTopColor: colors.borderSubtle }]}>
        <SkeletonTextLine
          width={120}
          height={TypographyV2.meta.size}
          style={{ marginBottom: Space.sm }}
        />
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonBlock
            key={i}
            width="100%"
            height={44}
            radius={Radius.lg}
            style={{ marginBottom: Space.sm }}
          />
        ))}
      </View>

      {/* Payment method */}
      <View style={[styles.checkoutSection, { borderTopColor: colors.borderSubtle }]}>
        <SkeletonTextLine
          width={100}
          height={TypographyV2.meta.size}
          style={{ marginBottom: Space.sm }}
        />
        <View style={styles.checkoutPaymentRow}>
          <SkeletonCircle size={AvatarSize.md} />
          <View style={{ flex: 1 }}>
            <SkeletonTextLine
              width="50%"
              height={TypographyV2.body.size}
            />
          </View>
          <SkeletonBlock
            width={20}
            height={20}
            radius={Radius.full}
          />
        </View>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Profile skeleton — matches ProfileScreen layout
// ---------------------------------------------------------------------------

/**
 * Profile skeleton — matches the profile seam-row composition:
 *   cover → avatar at seam → stats → identity → action row → listings grid.
 *
 * Uses ProfileLayout tokens so the skeleton matches the real hero geometry
 * exactly (no layout shift).
 */
export const ProfileSkeleton = memo(function ProfileSkeleton() {
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const coverHeight = ProfileLayout.coverHeightSkeleton;
  const avatarSize = ProfileLayout.avatarSkeleton;
  const avatarOverlap = ProfileLayout.avatarOverlap;
  const cardW = (screenWidth - Space.md * 2 - Space.sm) / 2;
  const cardH = cardW / AspectRatio.portrait; // 3:4 portrait tiles

  return (
    <View style={[styles.profileContainer, { backgroundColor: colors.background }]}>
      {/* Cover stage — exact final height */}
      <SkeletonBlock
        width="100%"
        height={coverHeight}
        radius={Radius.none}
      />

      {/* Hero root — relative for absolute avatar */}
      <View style={styles.profileHeroRoot}>
        {/* Avatar — absolutely positioned at the seam */}
        <View
          style={[
            styles.profileAvatar,
            {
              width: avatarSize,
              height: avatarSize,
              borderRadius: avatarSize / 2,
              top: -avatarOverlap,
              left: Space.md,
              borderColor: colors.background,
            },
          ]}
        >
          <SkeletonCircle size={avatarSize} />
        </View>

        <View style={styles.profileBody}>
          {/* Seam row — stats beside avatar */}
          <View
            style={[
              styles.profileSeamRow,
              { minHeight: avatarOverlap + Space.sm },
            ]}
          >
            <View style={{ width: avatarSize + Space.sm }} />
            <View style={styles.profileStats}>
              {Array.from({ length: 3 }).map((_, i) => (
                <View key={i} style={{ alignItems: 'center', gap: Space.xxs }}>
                  <SkeletonBlock width={40} height={TypographyV2.hero.size} radius={Radius.sm} />
                  <SkeletonBlock width={32} height={TypographyV2.meta.size} radius={Radius.sm} />
                </View>
              ))}
            </View>
          </View>

          {/* Identity */}
          <SkeletonTextLine
            width={180}
            height={TypographyV2.itemTitle.size}
            style={{ marginBottom: Space.xxs }}
          />
          <SkeletonTextLine
            width={120}
            height={TypographyV2.meta.size}
            style={{ marginBottom: Space.sm }}
          />

          {/* Action row */}
          <View style={styles.profileActionRow}>
            <View style={styles.profileActionPrimary}>
              <SkeletonBlock width="100%" height={44} radius={Radius.lg} />
            </View>
            <View style={styles.profileActionPrimary}>
              <SkeletonBlock width="100%" height={44} radius={Radius.lg} />
            </View>
            <View style={styles.profileActionSecondary}>
              <SkeletonBlock width={44} height={44} radius={Radius.lg} />
            </View>
          </View>

          {/* Tab rail */}
          <View style={styles.profileTabRail}>
            <SkeletonBlock width="100%" height={44} radius={Radius.none} />
          </View>

          {/* Listings grid — 3:4 portrait tiles */}
          <View style={styles.profileGrid}>
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock
                key={i}
                width={cardW}
                height={cardH}
                radius={Radius.lg}
              />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Feed
  feedContainer: {
    flexDirection: 'row',
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
    gap: LISTING_GAP,
  },
  feedMasonryColumn: {
    flex: 1,
  },

  // PDP
  pdpContainer: {
    flex: 1,
  },
  pdpSheet: {
    paddingHorizontal: Space.md,
    paddingTop: Space.lg,
  },
  pdpSellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginTop: Space.md,
    paddingVertical: Space.sm,
    borderTopWidth: Stroke.hairline,
    paddingHorizontal: Space.md,
  },
  pdpTrustRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginTop: Space.md,
  },

  // Chat list
  listContainer: {
    paddingTop: Space.sm,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.md,
    paddingVertical: Space.smMd,
    gap: Space.sm,
  },
  chatTextCol: {
    flex: 1,
  },
  chatTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  // Seller hub
  sellerHubContainer: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  sellerHubHero: {
    paddingBottom: Space.lg,
  },
  sellerHubSection: {
    borderTopWidth: Stroke.hairline,
    paddingTop: Space.sm,
    marginTop: Space.sm,
  },
  sellerHubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },
  sellerHubMetricRow: {
    paddingVertical: Space.sm,
  },

  // Settings
  settingsContainer: {
    paddingTop: Space.sm,
  },
  settingsSection: {
    marginBottom: Space.lg,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.smMd,
  },

  // Checkout
  checkoutContainer: {
    paddingHorizontal: Space.md,
    paddingTop: Space.sm,
  },
  checkoutSummary: {
    paddingBottom: Space.lg,
  },
  checkoutLineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Space.xs,
  },
  checkoutTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Space.sm,
    paddingTop: Space.sm,
    borderTopWidth: Stroke.hairline,
  },
  checkoutSection: {
    borderTopWidth: Stroke.hairline,
    paddingTop: Space.sm,
    marginTop: Space.sm,
    paddingBottom: Space.md,
  },
  checkoutPaymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
  },

  // Profile
  profileContainer: {
    flex: 1,
  },
  profileHeroRoot: {
    position: 'relative',
  },
  profileAvatar: {
    position: 'absolute',
    borderWidth: Stroke.emphasis,
    zIndex: 10,
    overflow: 'hidden',
  },
  profileBody: {
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  profileSeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Space.xs,
  },
  profileStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  profileActionRow: {
    flexDirection: 'row',
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  profileActionPrimary: {
    flex: 1,
    height: 44,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  profileActionSecondary: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  profileTabRail: {
    height: 44,
    marginBottom: Space.md,
    overflow: 'hidden',
  },
  profileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
  },
});
