import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { AuctionStateBadge } from './AuctionStateBadge';
import { AuctionCountdown } from './AuctionCountdown';

interface Props {
  title: string;
  imageUrl: string | null;
  brand?: string | null;
  currentBidText: string;
  secondaryPriceText?: string | null;
  bidCount: number;
  countdownText: string;
  urgent?: boolean;
  state: 'live' | 'upcoming' | 'ended';
  viewerState?: 'leading' | 'outbid' | 'watching' | 'not_participating' | 'won' | 'lost' | 'seller';
  onPress: () => void;
  onWatch?: () => void;
  isWatching?: boolean;
  /** Override the computed card width */
  cardWidth?: number;
  /** Override the image height */
  imageHeight?: number;
  /** When true, metadata renders below the image (clean overlay) */
  metadataBelow?: boolean;
}

export function AuctionRunwayCard({
  title,
  imageUrl,
  brand,
  currentBidText,
  secondaryPriceText,
  bidCount,
  countdownText,
  urgent,
  state,
  viewerState,
  onPress,
  onWatch,
  isWatching,
  cardWidth: cardWidthOverride,
  imageHeight: imageHeightOverride,
  metadataBelow = false,
}: Props) {
  const { width } = useWindowDimensions();
  const cardWidth = cardWidthOverride ?? width * 0.76;
  const imageHeight = imageHeightOverride ?? 360;

  if (metadataBelow) {
    return (
      <AnimatedPressable
        style={[styles.card, styles.cardMetadataBelow, { width: cardWidth }]}
        scaleValue={0.98}
        activeOpacity={0.95}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${state}, ${currentBidText}, ${countdownText}`}
      >
        {/* Clean image — only lifecycle signal + watch */}
        <View style={[styles.imageWrap, { height: imageHeight }]}>
          <CachedImage
            uri={imageUrl ?? ''}
            style={styles.image}
            containerStyle={styles.imageContainer}
            contentFit="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.25)']}
            locations={[0.6, 1]}
            style={styles.gradient}
          />
          <View style={styles.topRow}>
            <AuctionStateBadge state={state} compact />
            {onWatch && (
              <AnimatedPressable
                style={styles.watchBtn}
                scaleValue={0.9}
                onPress={onWatch}
                accessibilityRole="button"
                accessibilityLabel={isWatching ? 'Stop watching' : 'Watch this auction'}
              >
                <Ionicons
                  name={isWatching ? 'eye' : 'eye-outline'}
                  size={16}
                  color={isWatching ? Colors.brand : '#FFFFFF'}
                />
              </AnimatedPressable>
            )}
          </View>
        </View>

        {/* Metadata below image — on page surface */}
        <View style={styles.belowBody}>
          {brand && <Text style={styles.belowBrand} numberOfLines={1}>{brand}</Text>}
          <Text style={styles.belowTitle} numberOfLines={2}>{title}</Text>
          <View style={styles.belowPriceRow}>
            <Text style={styles.belowPriceValue} numberOfLines={1}>{currentBidText}</Text>
            {secondaryPriceText && (
              <Text style={styles.belowPriceSecondary} numberOfLines={1}>{secondaryPriceText}</Text>
            )}
          </View>
          <View style={styles.belowMetaRow}>
            <AuctionCountdown text={countdownText} urgent={urgent} compact />
            <Text style={styles.belowBidCount}>{bidCount} {bidCount === 1 ? 'bid' : 'bids'}</Text>
          </View>
        </View>
      </AnimatedPressable>
    );
  }

  // Original overlay variant
  return (
    <AnimatedPressable
      style={[styles.card, { width: cardWidth }]}
      scaleValue={0.98}
      activeOpacity={0.95}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${state}, current bid ${currentBidText}, ${countdownText} left`}
    >
      <View style={[styles.imageWrap, { height: imageHeight }]}>
        <CachedImage
          uri={imageUrl ?? ''}
          style={styles.image}
          containerStyle={styles.imageContainer}
          contentFit="cover"
        />
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.65)']}
          style={styles.gradient}
        />

        <View style={styles.topRow}>
          <AuctionStateBadge state={state} compact />
          {onWatch && (
            <AnimatedPressable
              style={styles.watchBtn}
              scaleValue={0.9}
              onPress={onWatch}
              accessibilityRole="button"
              accessibilityLabel={isWatching ? 'Stop watching' : 'Watch this auction'}
            >
              <Ionicons
                name={isWatching ? 'eye' : 'eye-outline'}
                size={16}
                color={isWatching ? Colors.brand : '#FFFFFF'}
              />
            </AnimatedPressable>
          )}
        </View>

        {viewerState === 'outbid' && (
          <View style={[styles.viewerChip, styles.viewerChipOutbid]}>
            <Ionicons name="trending-down" size={11} color={Colors.danger} />
            <Text style={[styles.viewerChipText, { color: Colors.danger }]}>OUTBID</Text>
          </View>
        )}
        {viewerState === 'leading' && (
          <View style={[styles.viewerChip, styles.viewerChipLeading]}>
            <Ionicons name="trending-up" size={11} color={Colors.success} />
            <Text style={[styles.viewerChipText, { color: Colors.success }]}>LEADING</Text>
          </View>
        )}

        <View style={styles.bottomContent}>
          {brand && <Text style={styles.brand} numberOfLines={1}>{brand}</Text>}
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceValue} numberOfLines={1}>{currentBidText}</Text>
          </View>
          <View style={styles.metaRow}>
            <AuctionCountdown text={countdownText} urgent={urgent} compact />
            <Text style={styles.bidCount}>{bidCount} {bidCount === 1 ? 'bid' : 'bids'}</Text>
          </View>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  cardMetadataBelow: {
    backgroundColor: 'transparent',
  },
  imageWrap: {
    position: 'relative',
  },
  imageContainer: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topRow: {
    position: 'absolute',
    top: Space.sm,
    left: Space.sm,
    right: Space.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  watchBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerChip: {
    position: 'absolute',
    top: Space.sm + 36,
    left: Space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  viewerChipOutbid: {
    backgroundColor: 'rgba(220,38,38,0.2)',
  },
  viewerChipLeading: {
    backgroundColor: 'rgba(22,163,74,0.2)',
  },
  viewerChipText: {
    fontFamily: Typography.family.semibold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  bottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Space.md,
    gap: 2,
  },
  brand: {
    fontFamily: Typography.family.semibold,
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 0.3,
    opacity: 0.8,
  },
  title: {
    fontFamily: Typography.family.bold,
    fontSize: 18,
    color: '#FFFFFF',
    letterSpacing: -0.4,
    lineHeight: 22,
    marginBottom: 4,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
    marginBottom: 2,
  },
  priceValue: {
    fontFamily: Typography.family.extrabold,
    fontSize: 22,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bidCount: {
    fontFamily: Typography.family.medium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
  },

  // ── Metadata-below variant ──
  belowBody: {
    padding: Space.md,
    gap: 2,
  },
  belowBrand: {
    fontFamily: Typography.family.medium,
    fontSize: 11,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  belowTitle: {
    fontFamily: Typography.family.semibold,
    fontSize: 16,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 21,
    marginBottom: 4,
  },
  belowPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
    marginBottom: 2,
  },
  belowPriceValue: {
    fontFamily: Typography.family.bold,
    fontSize: 20,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  belowPriceSecondary: {
    fontFamily: Typography.family.regular,
    fontSize: 13,
    color: Colors.textMuted,
  },
  belowMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  belowBidCount: {
    fontFamily: Typography.family.regular,
    fontSize: 12,
    color: Colors.textMuted,
  },
});
