import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import { CachedImage } from '../CachedImage';
import { AppStatusPill } from '../ui/AppStatusPill';
import { Meta, BodyEmphasis, Body, Headline } from '../ui/Text';

interface AuctionCardProps {
  id: string;
  title: string;
  image: string;
  sellerName?: string;
  currentBid: string;
  bidCount: number;
  timeRemaining: string;
  progress: number;
  isLive?: boolean;
  isWatching?: boolean;
  buyNowPrice?: string;
  onPress?: () => void;
  onBid?: () => void;
  onBuyNow?: () => void;
  onToggleWatch?: () => void;
  isBuyNowLoading?: boolean;
  isBidSubmitting?: boolean;
}

export function AuctionCard({
  title,
  image,
  sellerName,
  currentBid,
  bidCount,
  timeRemaining,
  progress,
  isLive = true,
  isWatching = false,
  buyNowPrice,
  onPress,
  onBid,
  onBuyNow,
  onToggleWatch,
  isBuyNowLoading = false,
  isBidSubmitting = false,
}: AuctionCardProps) {
  return (
    <AnimatedPressable
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.92}
      disableAnimation={false}
      scaleValue={0.985}
      accessibilityRole="button"
      accessibilityLabel={`Auction: ${title}`}
      accessibilityHint="Opens auction details"
    >
      <View style={styles.imageWrap}>
        <CachedImage
          uri={image}
          style={styles.image}
          containerStyle={styles.imageContainer}
          contentFit="cover"
        />
        {isLive && (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Meta style={styles.liveText}>LIVE</Meta>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Headline style={styles.title} numberOfLines={1}>
            {title}
          </Headline>
          <AppStatusPill
            tone="accent"
            iconName="time-outline"
            label={timeRemaining}
            size="sm"
          />
        </View>

        {sellerName && (
          <Meta style={styles.seller}>by {sellerName}</Meta>
        )}

        <View style={styles.bidRow}>
          <View>
            <Meta style={styles.bidLabel}>Current bid</Meta>
            <BodyEmphasis style={styles.bidValue}>{currentBid}</BodyEmphasis>
          </View>
          <View style={styles.bidCountWrap}>
            <Ionicons name="people-outline" size={12} color={Colors.textMuted} />
            <Meta style={styles.bidCount}>{bidCount} bids</Meta>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(100, progress * 100)}%` }]} />
        </View>

        <View style={styles.actionRow}>
          {buyNowPrice ? (
            <AppButton
              style={[styles.actionBtn, isBuyNowLoading && styles.actionBtnDisabled]}
              onPress={onBuyNow}
              disabled={isBuyNowLoading}
              variant="primary"
              size="sm"
              align="center"
              title={isBuyNowLoading ? 'Buying...' : `Buy Now ${buyNowPrice}`}
              hapticFeedback="medium"
              accessibilityLabel="Buy now"
              accessibilityHint="Purchases the item instantly at buy now price"
            />
          ) : (
            <>
              <AppButton
                style={styles.actionBtn}
                onPress={onBid}
                disabled={isBidSubmitting}
                variant="primary"
                size="sm"
                align="center"
                title="Place Bid"
                hapticFeedback="medium"
                accessibilityLabel="Place bid"
              />
              <AppButton
                style={[styles.watchBtn, isWatching && styles.watchBtnActive]}
                onPress={onToggleWatch}
                variant="secondary"
                size="sm"
                align="center"
                title={isWatching ? 'Watching' : 'Watch'}
                hapticFeedback="light"
                accessibilityLabel={isWatching ? 'Unwatch auction' : 'Watch auction'}
              />
            </>
          )}
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    marginHorizontal: Space.md,
    marginBottom: Space.sm,
  },
  imageWrap: {
    position: 'relative',
  },
  imageContainer: {
    width: '100%',
    height: 172,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  livePill: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff4444',
  },
  liveText: {
    color: '#fff',
    fontSize: 10,
  },
  body: {
    padding: Space.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    flex: 1,
    marginRight: Space.sm,
  },
  seller: {
    marginBottom: Space.sm,
  },
  bidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: Space.sm,
  },
  bidLabel: {
    marginBottom: 2,
  },
  bidValue: {
    color: Colors.brand,
  },
  bidCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bidCount: {},
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceAlt,
    marginBottom: Space.sm,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.brand,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  actionBtn: {
    flex: 1,
  },
  watchBtn: {
    flex: 1,
  },
  watchBtnActive: {
    borderColor: Colors.brand,
  },
  actionBtnDisabled: {
    opacity: 0.52,
  },
});
