import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space, Radius, Type } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { AppButton } from '../ui/AppButton';
import { CachedImage } from '../CachedImage';
import { AppStatusPill, type AppStatusTone } from '../ui/AppStatusPill';
import { Meta, BodyEmphasis, Body, Headline } from '../ui/Text';

type TimerUrgency = 'critical' | 'urgent' | 'normal';

interface AuctionCardProps {
  id: string;
  title: string;
  image: string;
  sellerName?: string;
  sellerId?: string;
  currentBid: string;
  bidCount: number;
  timeRemaining: string;
  progress: number;
  isLive?: boolean;
  isWatching?: boolean;
  buyNowPrice?: string;
  viewerState?: 'not_participating' | 'watching' | 'leading' | 'outbid' | 'won' | 'lost' | 'seller';
  timerUrgency?: TimerUrgency;
  endingSoon?: boolean;
  onPress?: () => void;
  onBid?: () => void;
  onBuyNow?: () => void;
  onToggleWatch?: () => void;
  onPressSeller?: () => void;
  onMessageSeller?: () => void;
  onViewBidHistory?: () => void;
  isBuyNowLoading?: boolean;
  isBidSubmitting?: boolean;
}

function LiveDot({ color }: { color: string }) {
  return (
    <View style={{ width: 6, height: 6, borderRadius: Radius.sm, backgroundColor: color }} />
  );
}

const URGENCY_TONE_MAP: Record<TimerUrgency, AppStatusTone> = {
  critical: 'negative',
  urgent: 'warning',
  normal: 'accent',
};

function AuctionCardBase({
  title,
  image,
  sellerName,
  sellerId,
  currentBid,
  bidCount,
  timeRemaining,
  progress,
  isLive = true,
  isWatching = false,
  buyNowPrice,
  viewerState,
  timerUrgency = 'normal',
  endingSoon = false,
  onPress,
  onBid,
  onBuyNow,
  onToggleWatch,
  onPressSeller,
  onMessageSeller,
  onViewBidHistory,
  isBuyNowLoading = false,
  isBidSubmitting = false,
}: AuctionCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

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
            <LiveDot color={colors.danger} />
            <Meta style={styles.liveText}>LIVE</Meta>
          </View>
        )}
        {endingSoon && isLive && (
          <View style={styles.endingSoonBadge}>
            <Ionicons name="time-outline" size={10} color="#fff" />
            <Meta style={styles.viewerBadgeText}>ENDING SOON</Meta>
          </View>
        )}
        {viewerState === 'outbid' && !endingSoon && (
          <View style={styles.outbidBadge}>
            <Ionicons name="trending-down-outline" size={10} color="#fff" />
            <Meta style={styles.viewerBadgeText}>OUTBID</Meta>
          </View>
        )}
        {viewerState === 'leading' && !endingSoon && (
          <View style={styles.leadingBadge}>
            <Ionicons name="trophy-outline" size={10} color="#fff" />
            <Meta style={styles.viewerBadgeText}>LEADING</Meta>
          </View>
        )}
        {viewerState === 'won' && !endingSoon && (
          <View style={styles.wonBadge}>
            <Ionicons name="ribbon-outline" size={10} color="#fff" />
            <Meta style={styles.viewerBadgeText}>WON</Meta>
          </View>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Headline style={styles.title} numberOfLines={1}>
            {title}
          </Headline>
          <AppStatusPill
            tone={URGENCY_TONE_MAP[timerUrgency]}
            iconName="time-outline"
            label={timeRemaining}
            size="sm"
          />
        </View>

        {sellerName && (
          <View style={styles.sellerRow}>
            <AnimatedPressable
              style={styles.sellerIdentity}
              onPress={onPressSeller}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Open ${sellerName} profile`}
              accessibilityHint="Shows seller profile details"
            >
              <Meta style={styles.seller}>by {sellerName}</Meta>
            </AnimatedPressable>
            {onMessageSeller && sellerId && (
              <AnimatedPressable
                style={styles.sellerMessageBtn}
                onPress={onMessageSeller}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Message ${sellerName}`}
                accessibilityHint="Opens chat with this seller"
              >
                <Ionicons name="chatbubble-ellipses-outline" size={14} color={colors.textPrimary} />
              </AnimatedPressable>
            )}
          </View>
        )}

        <View style={styles.bidRow}>
          <View>
            <Meta style={styles.bidLabel}>Current bid</Meta>
            <BodyEmphasis style={styles.bidValue}>{currentBid}</BodyEmphasis>
          </View>
          <View style={styles.bidCountWrap}>
            <Ionicons name="people-outline" size={12} color={colors.textMuted} />
            <Meta style={styles.bidCount}>{bidCount} bids</Meta>
          </View>
        </View>

        {onViewBidHistory && bidCount > 0 ? (
          <Pressable
            style={styles.bidHistoryBtn}
            onPress={onViewBidHistory}
            accessibilityRole="button"
            accessibilityLabel={`View bid history for ${title}`}
          >
            <Ionicons name="list-outline" size={12} color={colors.brand} />
            <Meta style={styles.bidHistoryBtnText}>View bid history</Meta>
            <Ionicons name="chevron-forward" size={10} color={colors.brand} />
          </Pressable>
        ) : null}

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

export const AuctionCard = React.memo(AuctionCardBase);

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
    gap: Space.xs,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.xs,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.sm,
    backgroundColor: colors.danger,
  },
  endingSoonBadge: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    backgroundColor: 'rgba(220,38,38,0.9)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 3,
    paddingVertical: Space.xs / 2 + 1,
  },
  liveText: {
    color: '#fff',
    fontSize: Type.meta.size - 2,
  },
  outbidBadge: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    backgroundColor: 'rgba(255,68,68,0.9)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 3,
    paddingVertical: Space.xs / 2 + 1,
  },
  leadingBadge: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    backgroundColor: 'rgba(0,180,80,0.9)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 3,
    paddingVertical: Space.xs / 2 + 1,
  },
  wonBadge: {
    position: 'absolute',
    top: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs / 2 + 1,
    backgroundColor: 'rgba(255,170,0,0.9)',
    borderRadius: Radius.full,
    paddingHorizontal: Space.xs + 3,
    paddingVertical: Space.xs / 2 + 1,
  },
  viewerBadgeText: {
    color: '#fff',
    fontSize: Type.meta.size - 3,
    fontWeight: '700',
  },
  body: {
    padding: Space.md,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.xs,
  },
  title: {
    flex: 1,
    marginRight: Space.sm,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Space.sm,
  },
  sellerIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seller: {
    color: colors.textSecondary,
  },
  sellerMessageBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: colors.brand,
  },
  bidCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
  },
  bidCount: {},
  bidHistoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.xs,
    marginBottom: Space.sm,
    paddingVertical: Space.xs,
  },
  bidHistoryBtnText: {
    color: colors.brand,
    fontSize: Type.caption.size,
  },
  progressTrack: {
    height: 4,
    borderRadius: Radius.sm,
    backgroundColor: colors.surfaceAlt,
    marginBottom: Space.sm,
  },
  progressFill: {
    height: 4,
    borderRadius: Radius.sm,
    backgroundColor: colors.brand,
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
    borderColor: colors.brand,
  },
  actionBtnDisabled: {
    opacity: 0.52,
  },
});