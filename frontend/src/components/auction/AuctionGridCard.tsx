import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { AuctionCountdown } from './AuctionCountdown';

interface Props {
  title: string;
  imageUrl: string | null;
  brand?: string | null;
  priceText: string;
  priceLabel: string;
  bidCount: number;
  countdownText: string;
  urgent?: boolean;
  state: 'live' | 'upcoming' | 'ended';
  viewerState?: 'leading' | 'outbid' | 'watching' | 'not_participating' | 'won' | 'lost' | 'seller';
  onPress: () => void;
  /** Card width override (for grid layouts) */
  cardWidth?: number;
}

export function AuctionGridCard({
  title,
  imageUrl,
  brand,
  priceText,
  priceLabel,
  bidCount,
  countdownText,
  urgent,
  state,
  viewerState,
  onPress,
  cardWidth,
}: Props) {
  const { width } = useWindowDimensions();
  const w = cardWidth ?? (width - Space.md * 2 - Space.sm) / 2;

  return (
    <AnimatedPressable
      style={[styles.card, { width: w }]}
      scaleValue={0.97}
      activeOpacity={0.95}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${priceLabel} ${priceText}, ${countdownText} left, ${bidCount} bids`}
    >
      <View style={styles.imageWrap}>
        <CachedImage
          uri={imageUrl ?? ''}
          style={styles.image}
          containerStyle={styles.imageContainer}
          contentFit="cover"
        />
        {/* Minimal state signal — only live dot, no badge overload */}
        {state === 'live' && (
          <View style={styles.liveDotWrap}>
            <View style={styles.liveDot} />
          </View>
        )}
        {/* Viewer state — one chip only */}
        {viewerState === 'outbid' && (
          <View style={styles.outbidChip}>
            <Text style={styles.outbidChipText}>OUTBID</Text>
          </View>
        )}
        {viewerState === 'leading' && (
          <View style={styles.leadingChip}>
            <Text style={styles.leadingChipText}>LEADING</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        {brand && <Text style={styles.brand} numberOfLines={1}>{brand}</Text>}
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <Text style={styles.priceValue} numberOfLines={1}>{priceText}</Text>
        <View style={styles.metaRow}>
          <AuctionCountdown text={countdownText} urgent={urgent} compact />
          <Text style={styles.bidCount}>{bidCount} {bidCount === 1 ? 'bid' : 'bids'}</Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Space.md,
  },
  imageWrap: {
    position: 'relative',
    aspectRatio: 4 / 5,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  imageContainer: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  liveDotWrap: {
    position: 'absolute',
    top: Space.xs,
    left: Space.xs,
    width: 20,
    height: 20,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: Colors.danger,
  },
  outbidChip: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    backgroundColor: 'rgba(220,38,38,0.85)',
    paddingHorizontal: Space.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  outbidChipText: {
    fontFamily: Typography.family.semibold,
    fontSize: 8,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  leadingChip: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    backgroundColor: 'rgba(22,163,74,0.85)',
    paddingHorizontal: Space.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  leadingChipText: {
    fontFamily: Typography.family.semibold,
    fontSize: 8,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  body: {
    paddingTop: Space.sm,
    gap: 1,
  },
  brand: {
    fontFamily: Typography.family.medium,
    fontSize: 10,
    color: Colors.textMuted,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: 13,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 17,
  },
  priceValue: {
    fontFamily: Typography.family.bold,
    fontSize: 15,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  bidCount: {
    fontFamily: Typography.family.regular,
    fontSize: 10,
    color: Colors.textMuted,
  },
});
