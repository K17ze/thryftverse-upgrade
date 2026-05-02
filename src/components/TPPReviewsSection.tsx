import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/colors';

interface Review {
  id: string;
  reviewerName: string;
  reviewerAvatar?: string;
  rating: number;
  text: string;
  date: string;
  itemName?: string;
  itemImage?: string;
  photos?: string[];
  sellerResponse?: string;
}

interface RatingBreakdown {
  stars: 5 | 4 | 3 | 2 | 1;
  count: number;
  percentage: number;
}

interface TPPReviewsSectionProps {
  averageRating: number;
  totalReviews: number;
  breakdown: RatingBreakdown[];
  reviews: Review[];
  tagFilters?: string[];
  onSeeAllPress?: () => void;
  onReviewPress?: (review: Review) => void;
  onTagFilterPress?: (tag: string) => void;
  maxReviews?: number;
  style?: ViewStyle;
}

export function TPPReviewsSection({
  averageRating,
  totalReviews,
  breakdown,
  reviews,
  tagFilters = [],
  onSeeAllPress,
  onReviewPress,
  onTagFilterPress,
  maxReviews = 3,
  style,
}: TPPReviewsSectionProps) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const displayedReviews = reviews.slice(0, maxReviews);

  const renderStars = (rating: number, size: number = 14) => {
    return (
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Ionicons
            key={star}
            name={star <= rating ? 'star' : 'star-outline'}
            size={size}
            color="#FFB800"
            style={{ marginRight: 2 }}
          />
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, style]}>
      {/* Section Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.sectionTitle}>Reviews</Text>
          <View style={styles.ratingSummary}>
            {renderStars(Math.round(averageRating), 18)}
            <Text style={styles.averageRating}>{averageRating.toFixed(1)}</Text>
            <Text style={styles.reviewCount}>({totalReviews} reviews)</Text>
          </View>
        </View>
        <TouchableOpacity onPress={onSeeAllPress}>
          <Text style={styles.seeAllText}>See all</Text>
        </TouchableOpacity>
      </View>

      {/* Rating Breakdown */}
      <View style={styles.breakdownContainer}>
        {breakdown
          .sort((a, b) => b.stars - a.stars)
          .map((item) => (
            <View key={item.stars} style={styles.breakdownRow}>
              <Text style={styles.breakdownStars}>{item.stars} star</Text>
              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBar,
                    { width: `${item.percentage}%` },
                  ]}
                />
              </View>
              <Text style={styles.breakdownCount}>{item.count}</Text>
            </View>
          ))}
      </View>

      {/* Tag Filters */}
      {tagFilters.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tagsContainer}
          contentContainerStyle={styles.tagsContent}
        >
          {tagFilters.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={[
                styles.tagPill,
                selectedTag === tag && styles.tagPillActive,
              ]}
              onPress={() => {
                setSelectedTag(selectedTag === tag ? null : tag);
                onTagFilterPress?.(tag);
              }}
            >
              <Text
                style={[
                  styles.tagText,
                  selectedTag === tag && styles.tagTextActive,
                ]}
              >
                {tag}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Review Cards */}
      <View style={styles.reviewsList}>
        {displayedReviews.map((review) => (
          <TouchableOpacity
            key={review.id}
            style={styles.reviewCard}
            onPress={() => onReviewPress?.(review)}
            activeOpacity={0.9}
          >
            {/* Review Header */}
            <View style={styles.reviewHeader}>
              {review.reviewerAvatar ? (
                <Image
                  source={{ uri: review.reviewerAvatar }}
                  style={styles.reviewerAvatar}
                />
              ) : (
                <View style={styles.reviewerAvatarPlaceholder}>
                  <Ionicons name="person" size={20} color={Colors.textMuted} />
                </View>
              )}
              <View style={styles.reviewerInfo}>
                <Text style={styles.reviewerName}>{review.reviewerName}</Text>
                {renderStars(review.rating, 12)}
              </View>
              <Text style={styles.reviewDate}>{review.date}</Text>
            </View>

            {/* Review Text */}
            <Text style={styles.reviewText} numberOfLines={3}>
              {review.text}
            </Text>

            {/* Review Photos */}
            {review.photos && review.photos.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.photosContainer}
              >
                {review.photos.map((photo, index) => (
                  <Image
                    key={index}
                    source={{ uri: photo }}
                    style={styles.reviewPhoto}
                  />
                ))}
              </ScrollView>
            )}

            {/* Reviewed Item */}
            {review.itemName && (
              <View style={styles.reviewedItem}>
                {review.itemImage && (
                  <Image
                    source={{ uri: review.itemImage }}
                    style={styles.reviewedItemImage}
                  />
                )}
                <Text style={styles.reviewedItemName} numberOfLines={1}>
                  {review.itemName}
                </Text>
              </View>
            )}

            {/* Seller Response */}
            {review.sellerResponse && (
              <View style={styles.sellerResponse}>
                <Text style={styles.sellerResponseLabel}>Seller Response</Text>
                <Text style={styles.sellerResponseText} numberOfLines={2}>
                  {review.sellerResponse}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {},
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  ratingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  starsRow: {
    flexDirection: 'row',
  },
  averageRating: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  reviewCount: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  seeAllText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.brand,
  },
  breakdownContainer: {
    marginBottom: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  breakdownStars: {
    width: 45,
    fontSize: 13,
    color: Colors.textMuted,
  },
  progressBarContainer: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
    marginHorizontal: 10,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FFB800',
    borderRadius: 3,
  },
  breakdownCount: {
    width: 40,
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'right',
  },
  tagsContainer: {
    marginBottom: 16,
  },
  tagsContent: {
    gap: 8,
    paddingRight: 16,
  },
  tagPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: Colors.background,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tagPillActive: {
    backgroundColor: `${Colors.brand}15`,
    borderColor: Colors.brand,
  },
  tagText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  tagTextActive: {
    color: Colors.brand,
  },
  reviewsList: {
    gap: 12,
  },
  reviewCard: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  reviewerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  reviewerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  reviewerInfo: {
    flex: 1,
  },
  reviewerName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  reviewDate: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  reviewText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  photosContainer: {
    marginBottom: 10,
  },
  reviewPhoto: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 8,
  },
  reviewedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  reviewedItemImage: {
    width: 40,
    height: 40,
    borderRadius: 6,
    marginRight: 10,
  },
  reviewedItemName: {
    flex: 1,
    fontSize: 13,
    color: Colors.textMuted,
  },
  sellerResponse: {
    backgroundColor: `${Colors.success}08`,
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.success,
  },
  sellerResponseLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.success,
    marginBottom: 4,
  },
  sellerResponseText: {
    fontSize: 13,
    color: Colors.textPrimary,
    lineHeight: 18,
  },
});
