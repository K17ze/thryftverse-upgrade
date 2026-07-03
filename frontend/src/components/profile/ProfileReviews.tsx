import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { Colors } from '../../constants/colors';
import { Space, Typography } from '../../theme/designTokens';
import type { SellerReviewItem, SellerReviewSummary } from '../../services/sellerReviewsApi';

const BG = Colors.background;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;
const SECONDARY = Colors.textSecondary;
const SURFACE_ALT = Colors.surfaceAlt;
const BRAND = Colors.brand;

interface ReviewSummaryBlockProps {
  summary: SellerReviewSummary;
}

/**
 * Reputation summary — dominant average, restrained stars, total count,
 * 5→1 distribution bars using count/totalReviews (NOT count/maxCount).
 * Bars represent actual review proportions.
 */
export function ReviewSummaryBlock({ summary }: ReviewSummaryBlockProps) {
  const avg = summary.ratingAverage ?? 0;
  const total = summary.reviewCount;
  const distMap = new Map<number, number>();
  for (const d of summary.distribution) distMap.set(d.rating, d.count);

  return (
    <View style={styles.reviewSummary}>
      <View style={styles.reviewSummaryTop}>
        <View style={styles.reviewSummaryAvg}>
          <Text style={styles.reviewSummaryAvgValue}>{avg.toFixed(1)}</Text>
          <View style={styles.reviewSummaryStars}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Ionicons key={s} name={s <= Math.round(avg) ? 'star' : 'star-outline'} size={13} color={BRAND} />
            ))}
          </View>
          <Text style={styles.reviewSummaryCount}>{total} review{total !== 1 ? 's' : ''}</Text>
        </View>
        <View style={styles.reviewSummaryDist}>
          {[5, 4, 3, 2, 1].map((star) => {
            const count = distMap.get(star) ?? 0;
            // Use count / totalReviews for accurate proportions
            const pct = total > 0 ? count / total : 0;
            return (
              <View key={star} style={styles.distRow}>
                <Text style={styles.distStar}>{star}</Text>
                <Ionicons name="star" size={9} color={MUTED} />
                <View style={styles.distTrack}>
                  <View style={[styles.distFill, { width: `${Math.round(pct * 100)}%` }]} />
                </View>
                <Text style={styles.distCount}>{count}</Text>
              </View>
            );
          })}
        </View>
      </View>
      <Text style={styles.reviewSummaryContext}>Reputation from completed orders</Text>
    </View>
  );
}

interface ProfileReviewRowProps {
  item: SellerReviewItem;
  onOpenReviewer?: (userId: string) => void;
  onOpenListing?: (listingId: string) => void;
}

/**
 * Review row — compact reviewer identity, strong comment readability,
 * listing context visually subordinate. Reviewer and listing are interactive.
 */
export const ProfileReviewRow = React.memo(function ProfileReviewRow({
  item,
  onOpenReviewer,
  onOpenListing,
}: ProfileReviewRowProps) {
  const reviewerName = item.reviewer.displayName || item.reviewer.username || 'Anonymous';
  const dateText = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  const canOpenReviewer = Boolean(item.reviewer.id && onOpenReviewer);
  const canOpenListing = Boolean(item.listing?.id && onOpenListing);

  return (
    <View style={styles.reviewRow}>
      <View style={styles.reviewHeader}>
        <Pressable
          style={styles.reviewAvatarWrap}
          onPress={() => canOpenReviewer && onOpenReviewer!(item.reviewer.id!)}
          disabled={!canOpenReviewer}
          accessibilityRole={canOpenReviewer ? 'button' : undefined}
          accessibilityLabel={canOpenReviewer ? `Open ${reviewerName}'s profile` : undefined}
        >
          {item.reviewer.avatar ? (
            <CachedImage
              uri={item.reviewer.avatar}
              style={styles.reviewAvatar}
              containerStyle={{ width: 36, height: 36, borderRadius: 18 }}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.reviewAvatar, styles.reviewAvatarFallback]}>
              <Text style={styles.reviewAvatarInitials}>
                {reviewerName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </Pressable>
        <View style={styles.reviewIdentityCol}>
          <Text style={styles.reviewName} numberOfLines={1}>{reviewerName}</Text>
          <Text style={styles.reviewDate}>{dateText}</Text>
        </View>
        <View style={styles.reviewRatingRow}>
          <Ionicons name="star" size={12} color={BRAND} />
          <Text style={styles.reviewRatingValue}>{item.rating}</Text>
        </View>
      </View>
      {item.comment ? <Text style={styles.reviewComment}>{item.comment}</Text> : null}
      {item.listing ? (
        <Pressable
          style={styles.reviewListingContext}
          onPress={() => canOpenListing && onOpenListing!(item.listing!.id!)}
          disabled={!canOpenListing}
          accessibilityRole={canOpenListing ? 'button' : undefined}
          accessibilityLabel={canOpenListing ? `Open listing ${item.listing!.title}` : undefined}
        >
          {item.listing.imageUrl ? (
            <CachedImage
              uri={item.listing.imageUrl}
              style={styles.reviewListingThumb}
              containerStyle={{ width: 28, height: 28, borderRadius: 4 }}
              contentFit="cover"
            />
          ) : null}
          <Text style={styles.reviewListingTitle} numberOfLines={1}>{item.listing.title}</Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  reviewSummary: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    backgroundColor: BG,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  reviewSummaryTop: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  reviewSummaryAvg: { alignItems: 'center' },
  reviewSummaryAvgValue: { fontSize: 34, fontFamily: Typography.family.bold, color: TEXT, letterSpacing: -0.8 },
  reviewSummaryStars: { flexDirection: 'row', gap: 1, marginTop: 2 },
  reviewSummaryCount: { fontSize: 12, fontFamily: Typography.family.regular, color: MUTED, marginTop: 2 },
  reviewSummaryDist: { flex: 1, gap: 3 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distStar: { fontSize: 11, fontFamily: Typography.family.medium, color: SECONDARY, width: 8 },
  distTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: SURFACE_ALT, overflow: 'hidden' },
  distFill: { height: '100%', backgroundColor: BRAND, borderRadius: 2 },
  distCount: { fontSize: 11, fontFamily: Typography.family.regular, color: MUTED, width: 24, textAlign: 'right' },
  reviewSummaryContext: { fontSize: 12, fontFamily: Typography.family.regular, color: MUTED, marginTop: Space.sm },
  reviewRow: {
    paddingHorizontal: Space.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  reviewAvatarWrap: {},
  reviewAvatar: { width: 36, height: 36, borderRadius: 18 },
  reviewAvatarFallback: { backgroundColor: SURFACE_ALT, alignItems: 'center', justifyContent: 'center' },
  reviewAvatarInitials: { fontSize: 14, fontFamily: Typography.family.bold, color: SECONDARY },
  reviewIdentityCol: { flex: 1 },
  reviewName: { fontSize: 14, fontFamily: Typography.family.semibold, color: TEXT },
  reviewDate: { fontSize: 12, fontFamily: Typography.family.regular, color: MUTED, marginTop: 1 },
  reviewRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  reviewRatingValue: { fontSize: 13, fontFamily: Typography.family.bold, color: TEXT },
  reviewComment: { fontSize: 14, fontFamily: Typography.family.regular, color: TEXT, lineHeight: 20 },
  reviewListingContext: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingVertical: 4 },
  reviewListingThumb: { width: 28, height: 28, borderRadius: 4 },
  reviewListingTitle: { flex: 1, fontSize: 12, fontFamily: Typography.family.regular, color: SECONDARY },
});
