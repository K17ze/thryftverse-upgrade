import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '../CachedImage';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import type { SellerReviewItem, SellerReviewSummary } from '../../services/sellerReviewsApi';

const BG = Colors.background;
const BORDER = Colors.border;
const MUTED = Colors.textMuted;
const TEXT = Colors.textPrimary;
const SECONDARY = Colors.textSecondary;
const SURFACE_ALT = Colors.surfaceAlt;
const BRAND = Colors.brand;

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
  /** Called when user taps a review photo (optional fullscreen viewer) */
  onOpenPhoto?: (photoUrls: string[], index: number) => void;
  /** Called when the seller wants to respond to this review (only for own profile) */
  onRespond?: (reviewId: string, reviewerName: string, rating: number) => void;
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
}: ProfileReviewRowProps) {
  const reviewerName = item.reviewer.displayName || item.reviewer.username || 'Anonymous';
  const dateText = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  const canOpenReviewer = Boolean(item.reviewer.id && onOpenReviewer);
  const canOpenListing = Boolean(item.listing?.id && onOpenListing);
  const reviewerInitials = getInitials(reviewerName);
  const photos = item.photoUrls ?? [];
  const sellerResponse = item.sellerResponse ?? null;
  const responseDate = sellerResponse?.createdAt
    ? new Date(sellerResponse.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';

  return (
    <View style={styles.reviewRow}>
      {/* Reviewer identity + rating */}
      <Pressable
        style={styles.reviewHeader}
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
            <Text style={styles.reviewAvatarInitials}>{reviewerInitials}</Text>
          </View>
        )}
        <View style={styles.reviewIdentityCol}>
          <View style={styles.reviewNameRow}>
            <Text style={styles.reviewName} numberOfLines={1}>{reviewerName}</Text>
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={10} color={Colors.success} />
              <Text style={styles.verifiedBadgeText}>Verified buyer</Text>
            </View>
          </View>
          <View style={styles.reviewMetaRow}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Ionicons
                key={s}
                name={s <= item.rating ? 'star' : 'star-outline'}
                size={11}
                color={s <= item.rating ? BRAND : MUTED}
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
            >
              <CachedImage
                uri={uri}
                style={styles.reviewPhoto}
                containerStyle={{ width: 72, height: 72, borderRadius: Radius.md }}
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

      {/* Seller response */}
      {sellerResponse && (
        <View style={styles.sellerResponseBox}>
          <View style={styles.sellerResponseHeader}>
            <Ionicons name="storefront-outline" size={12} color={SECONDARY} />
            <Text style={styles.sellerResponseLabel}>Seller's response</Text>
            {responseDate ? <Text style={styles.sellerResponseDate}>{responseDate}</Text> : null}
          </View>
          <Text style={styles.sellerResponseText}>{sellerResponse.text}</Text>
        </View>
      )}

      {/* Respond button — only for own profile and when no response exists */}
      {onRespond && !sellerResponse && (
        <Pressable
          style={styles.respondBtn}
          onPress={() => onRespond(item.id, reviewerName, item.rating)}
          accessibilityRole="button"
          accessibilityLabel="Respond to this review"
        >
          <Ionicons name="chatbubble-ellipses-outline" size={14} color={BRAND} />
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
  // Full reviewer identity region — tappable as one unit
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18 },
  reviewAvatarFallback: { backgroundColor: SURFACE_ALT, alignItems: 'center', justifyContent: 'center' },
  reviewAvatarInitials: { fontSize: 13, fontFamily: Typography.family.bold, color: SECONDARY },
  reviewIdentityCol: { flex: 1, gap: 2 },
  reviewNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewName: { fontSize: 14, fontFamily: Typography.family.semibold, color: TEXT, flexShrink: 1 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  verifiedBadgeText: { fontSize: 10, fontFamily: Typography.family.medium, color: Colors.success, letterSpacing: 0.2 },
  reviewMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  reviewDate: { fontSize: 12, fontFamily: Typography.family.regular, color: MUTED, marginLeft: 6 },
  reviewComment: { fontSize: 14, fontFamily: Typography.family.regular, color: TEXT, lineHeight: 20, marginTop: 4 },
  photoRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  reviewPhoto: { width: 72, height: 72, borderRadius: Radius.md },
  photoOverflowOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoOverflowText: { fontSize: 16, fontFamily: Typography.family.bold, color: '#fff' },
  sellerResponseBox: {
    backgroundColor: SURFACE_ALT,
    borderRadius: Radius.md,
    padding: Space.sm + 2,
    marginTop: 8,
    gap: 4,
  },
  sellerResponseHeader: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sellerResponseLabel: { fontSize: 11, fontFamily: Typography.family.semibold, color: SECONDARY, flex: 1 },
  sellerResponseDate: { fontSize: 11, fontFamily: Typography.family.regular, color: MUTED },
  sellerResponseText: { fontSize: 13, fontFamily: Typography.family.regular, color: TEXT, lineHeight: 18 },
  respondBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: Space.sm + 2,
    borderRadius: Radius.md,
    backgroundColor: `${BRAND}10`,
    alignSelf: 'flex-start',
  },
  respondBtnText: { fontSize: 13, fontFamily: Typography.family.semibold, color: BRAND },
  reviewListingContext: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingVertical: 4 },
  reviewListingPressed: { opacity: 0.6 },
  reviewListingThumb: { width: 28, height: 28, borderRadius: 4 },
  reviewListingTitle: { flex: 1, fontSize: 12, fontFamily: Typography.family.regular, color: SECONDARY },
});
