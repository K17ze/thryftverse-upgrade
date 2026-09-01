import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Stroke, AvatarSize, ThumbSize } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AppIcon } from '../common/AppIcon';
import { IconSize } from '../../theme/iconTokens';
import type { SellerReviewItem, SellerReviewSummary } from '../../services/sellerReviewsApi';
import { formatFullDate, formatShortDate } from '../../utils/dateFormat';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

interface ReviewSummaryBlockProps {
  summary: SellerReviewSummary;
}

/**
 * Reputation summary — dominant average, restrained stars, total count,
 * 5→1 distribution bars using count/totalReviews (NOT count/maxCount).
 * Bars represent actual review proportions.
 */
export function ReviewSummaryBlock({ summary }: ReviewSummaryBlockProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const avg = summary.ratingAverage ?? 0;
  const total = summary.reviewCount;
  const distMap = new Map<number, number>();
  for (const d of summary.distribution) distMap.set(d.rating, d.count);
  const asOfText = summary.asOf ? formatShortDate(summary.asOf) : '';

  return (
    <View style={styles.reviewSummary}>
      <View style={styles.reviewSummaryTop}>
        <View style={styles.reviewSummaryAvg}>
          <Text style={styles.reviewSummaryAvgValue}>{avg.toFixed(1)}</Text>
          <View style={styles.reviewSummaryStars}>
            {[1, 2, 3, 4, 5].map((s) => (
              <AppIcon
                key={s}
                name="star"
                focused={s <= Math.round(avg)}
                size={IconSize.xs}
                color={s <= Math.round(avg) ? 'ratingStar' : 'textMuted'}
                opticalCenter
                accessible={false}
              />
            ))}
          </View>
          <Text style={styles.reviewSummaryCount}>
            {total} verified review{total !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.reviewSummaryDist}>
          {[5, 4, 3, 2, 1].map((star) => {
            const count = distMap.get(star) ?? 0;
            const pct = total > 0 ? count / total : 0;
            return (
              <View key={star} style={styles.distRow}>
                <Text style={styles.distStar}>{star}</Text>
                <AppIcon name="star" focused size={IconSize.micro} color="#F59E0B" opticalCenter accessible={false} />
                <View style={styles.distTrack}>
                  <View style={[styles.distFill, { width: `${Math.round(pct * 100)}%` }]} />
                </View>
                <Text style={styles.distCount}>{count}</Text>
              </View>
            );
          })}
        </View>
      </View>
      {asOfText ? (
        <Text style={styles.reviewSummaryAsOf}>Updated {asOfText}</Text>
      ) : null}
    </View>
  );
}

interface ProfileReviewRowProps {
  item: SellerReviewItem;
  onOpenReviewer?: (userId: string) => void;
  onOpenListing?: (listingId: string) => void;
  /** Called when user taps a review photo (optional fullscreen viewer) */
  onOpenPhoto?: (photoUrls: string[], index: number) => void;
  /** Called when the seller wants to respond to this review (only for own profile) */
  onRespond?: (reviewId: string, reviewerName: string, rating: number) => void;
  /** Called when a non-seller viewer wants to report this review */
  onReport?: (reviewId: string) => void;
}

/**
 * Review row — flagship quality with:
 * - Inline 5-star display (not just "★ 4")
 * - Verified buyer badge
 * - Photo thumbnails
 * - Seller response section
 * - Listing context visually subordinate
 * The full reviewer identity region (avatar + name + date) is tappable.
 */
export const ProfileReviewRow = React.memo(function ProfileReviewRow({
  item,
  onOpenReviewer,
  onOpenListing,
  onOpenPhoto,
  onRespond,
  onReport }: ProfileReviewRowProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const reviewerName = item.reviewer.displayName || item.reviewer.username || 'Anonymous';
  const dateText = item.createdAt
    ? formatFullDate(item.createdAt)
    : '';
  const canOpenReviewer = Boolean(item.reviewer.id && onOpenReviewer);
  const canOpenListing = Boolean(item.listing?.id && onOpenListing);
  const reviewerInitials = getInitials(reviewerName);
  const photos = item.photoUrls ?? [];
  const sellerResponse = item.sellerResponse ?? null;
  const responseDate = sellerResponse?.createdAt
    ? formatShortDate(sellerResponse.createdAt)
    : '';

  return (
    <View style={styles.reviewRow}>
      {/* Reviewer identity + rating */}
      <Pressable
        style={({ pressed }) => [styles.reviewHeader, pressed && { opacity: 0.6 }]}
        onPress={() => canOpenReviewer && onOpenReviewer!(item.reviewer.id!)}
        disabled={!canOpenReviewer}
        accessibilityRole={canOpenReviewer ? 'button' : undefined}
        accessibilityLabel={canOpenReviewer ? `Open ${reviewerName}'s profile` : undefined}
      >
        {item.reviewer.avatar ? (
          <CachedImage
            uri={item.reviewer.avatar}
            style={styles.reviewAvatar}
            containerStyle={{ width: AvatarSize.md, height: AvatarSize.md, borderRadius: Radius.full }}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.reviewAvatar, styles.reviewAvatarFallback]}>
            <Text style={styles.reviewAvatarInitials}>{reviewerInitials}</Text>
          </View>
        )}
        <View style={styles.reviewIdentityCol}>
          <View style={styles.reviewNameRow}>
            <Text style={styles.reviewName} numberOfLines={1}>{reviewerName}</Text>
            <View style={styles.verifiedBadge}>
              <AppIcon name="shieldCheck" focused size={IconSize.micro} color="success" opticalCenter accessible={false} />
              <Text style={styles.verifiedBadgeText}>Verified buyer</Text>
            </View>
          </View>
          <View style={styles.reviewMetaRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <AppIcon
                key={s}
                name="star"
                focused={s <= item.rating}
                size={IconSize.micro}
                color={s <= item.rating ? 'ratingStar' : 'textMuted'}
                opticalCenter
                accessible={false}
              />
            ))}
            <Text style={styles.reviewDate}>{dateText}</Text>
          </View>
        </View>
      </Pressable>

      {/* Comment */}
      {item.comment ? <Text style={styles.reviewComment}>{item.comment}</Text> : null}

      {/* Photo thumbnails */}
      {photos.length > 0 && (
        <View style={styles.photoRow}>
          {photos.slice(0, 4).map((uri, idx) => (
            <Pressable
              key={uri + idx}
              onPress={() => onOpenPhoto?.(photos, idx)}
              disabled={!onOpenPhoto}
              accessibilityRole={onOpenPhoto ? 'button' : undefined}
              accessibilityLabel={onOpenPhoto ? `View review photo ${idx + 1}` : undefined}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <CachedImage
                uri={uri}
                style={styles.reviewPhoto}
                containerStyle={{ width: ThumbSize.md, height: ThumbSize.md, borderRadius: Radius.md }}
                contentFit="cover"
              />
              {photos.length > 4 && idx === 3 && (
                <View style={styles.photoOverflowOverlay}>
                  <Text style={styles.photoOverflowText}>+{photos.length - 4}</Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {/* Seller response — indented typography with a hairline left rule,
          not a card container. The response is subordinate to the review. */}
      {sellerResponse && (
        <View style={styles.sellerResponseBox}>
          <View style={styles.sellerResponseHeader}>
            <Text style={styles.sellerResponseLabel}>Seller's response</Text>
            {responseDate ? <Text style={styles.sellerResponseDate}>{responseDate}</Text> : null}
          </View>
          <Text style={styles.sellerResponseText}>{sellerResponse.text}</Text>
        </View>
      )}

      {/* Respond button — only for own profile and when no response exists */}
      {onRespond && !sellerResponse && (
        <Pressable
          style={({ pressed }) => [styles.respondBtn, pressed && { opacity: 0.6 }]}
          onPress={() => onRespond(item.id, reviewerName, item.rating)}
          accessibilityRole="button"
          accessibilityLabel="Respond to this review"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.brand} />
          <Text style={styles.respondBtnText}>Respond</Text>
        </Pressable>
      )}

      {/* Listing context */}
      {item.listing ? (
        <Pressable
          style={({ pressed }) => [styles.reviewListingContext, pressed && styles.reviewListingPressed]}
          onPress={() => canOpenListing && onOpenListing!(item.listing!.id!)}
          disabled={!canOpenListing}
          accessibilityRole={canOpenListing ? 'button' : undefined}
          accessibilityLabel={canOpenListing ? `Open listing ${item.listing!.title}` : undefined}
          hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
        >
          {item.listing.imageUrl ? (
            <CachedImage
              uri={item.listing.imageUrl}
              style={styles.reviewListingThumb}
              containerStyle={{ width: 28, height: 28, borderRadius: Radius.sm }}
              contentFit="cover"
            />
          ) : null}
          <Text style={styles.reviewListingTitle} numberOfLines={1}>{item.listing.title}</Text>
        </Pressable>
      ) : null}

      {/* Report link — muted text, subordinate to content. Only for non-seller viewers. */}
      {onReport ? (
        <View style={styles.reportRow}>
          <Pressable
            style={({ pressed }) => [styles.reportLink, pressed && { opacity: 0.6 }]}
            onPress={() => onReport(item.id)}
            accessibilityRole="button"
            accessibilityLabel="Report this review"
          >
            <Text style={styles.reportLinkText}>Report</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  reviewSummary: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  reviewSummaryTop: { flexDirection: 'row', alignItems: 'center', gap: Space.lg },
  reviewSummaryAvg: { alignItems: 'center', minWidth: 80 },
  reviewSummaryAvgValue: { fontSize: TypographyV2.priceHero.size, fontFamily: TypographyV2.priceHero.fontFamily, color: colors.textPrimary, letterSpacing: TypographyV2.priceHero.letterSpacing, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  reviewSummaryStars: { flexDirection: 'row', gap: Space.xs / 4, marginTop: Space.xs / 2 },
  reviewSummaryCount: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.textMuted, marginTop: Space.xs / 2 },
  reviewSummaryDist: { flex: 1, gap: Space.xs },
  reviewSummaryAsOf: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.textMuted, marginTop: Space.sm },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs + 2 },
  distStar: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.textSecondary, width: Space.sm },
  distTrack: { flex: 1, height: 3, borderRadius: Radius.full, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  distFill: { height: '100%', backgroundColor: colors.brand, borderRadius: Radius.full },
  distCount: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.textMuted, width: Space.xl, textAlign: 'right', fontVariant: ['tabular-nums'] as ['tabular-nums'] },
  reviewRow: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border },
  // Full reviewer identity region — tappable as one unit
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: Space.sm + 2, marginBottom: Space.sm },
  reviewAvatar: { width: AvatarSize.md, height: AvatarSize.md, borderRadius: Radius.full },
  reviewAvatarFallback: { backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  reviewAvatarInitials: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.textSecondary },
  reviewIdentityCol: { flex: 1, gap: Space.xs / 2 },
  reviewNameRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs + 1 },
  reviewName: { fontSize: TypographyV2.bodyStrong.size, fontFamily: TypographyV2.bodyStrong.fontFamily, color: colors.textPrimary, flexShrink: 1, lineHeight: TypographyV2.bodyStrong.lineHeight },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: Space.xs / 2, flexShrink: 0 },
  verifiedBadgeText: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.success, letterSpacing: 0.15 },
  reviewMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Space.xs / 2 },
  reviewDate: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.textMuted, marginLeft: Space.xs + 2 },
  reviewComment: { fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, color: colors.textPrimary, lineHeight: TypographyV2.body.lineHeight, marginTop: Space.sm },
  photoRow: { flexDirection: 'row', gap: Space.sm, marginTop: Space.sm },
  reviewPhoto: { width: ThumbSize.md, height: ThumbSize.md, borderRadius: Radius.md },
  photoOverflowOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.overlay,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center' },
  photoOverflowText: { fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, color: colors.scrimTextPrimary },
  sellerResponseBox: {
    borderLeftWidth: Stroke.emphasis,
    borderLeftColor: colors.border,
    paddingLeft: Space.sm + 2,
    marginTop: Space.sm,
    gap: Space.xs },
  sellerResponseHeader: { flexDirection: 'row', alignItems: 'center', gap: Space.xs },
  sellerResponseLabel: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.textSecondary, flex: 1 },
  sellerResponseDate: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.textMuted },
  sellerResponseText: { fontSize: TypographyV2.body.size, fontFamily: TypographyV2.body.fontFamily, color: colors.textPrimary, lineHeight: TypographyV2.body.lineHeight },
  respondBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs + 1,
    marginTop: Space.sm,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.full,
    backgroundColor: colors.brandSubtle,
    alignSelf: 'flex-start' },
  respondBtnText: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.brand },
  reviewListingContext: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginTop: Space.sm, paddingVertical: Space.xs },
  reviewListingPressed: { opacity: 0.6 },
  reviewListingThumb: { width: 28, height: 28, borderRadius: Radius.sm },
  reviewListingTitle: { flex: 1, fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.textSecondary },
  reportRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: Space.xs },
  reportLink: { paddingVertical: Space.xs / 2, paddingHorizontal: Space.xs },
  reportLinkText: { fontSize: TypographyV2.meta.size, fontFamily: TypographyV2.meta.fontFamily, color: colors.textMuted } });
}
