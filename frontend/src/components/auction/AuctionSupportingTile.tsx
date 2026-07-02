import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';

interface Props {
  title: string;
  imageUrl: string | null;
  priceText: string;
  timeText: string;
  state: 'live' | 'upcoming' | 'ended';
  viewerState?: 'leading' | 'outbid' | 'watching' | 'not_participating' | 'won' | 'lost' | 'seller';
  onPress: () => void;
  /** Card width override */
  cardWidth?: number;
}

export function AuctionSupportingTile({
  title,
  imageUrl,
  priceText,
  timeText,
  state,
  viewerState,
  onPress,
  cardWidth,
}: Props) {
  return (
    <AnimatedPressable
      style={[styles.card, cardWidth ? { width: cardWidth } : null]}
      scaleValue={0.97}
      activeOpacity={0.95}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${priceText}, ${timeText}`}
    >
      <View style={styles.imageWrap}>
        <CachedImage
          uri={imageUrl ?? ''}
          style={styles.image}
          containerStyle={styles.imageContainer}
          contentFit="cover"
        />
        {/* Single state marker only */}
        {state === 'live' && (
          <View style={styles.liveDot} />
        )}
        {viewerState === 'outbid' && (
          <View style={styles.outbidDot} />
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.price} numberOfLines={1}>{priceText}</Text>
        <Text style={styles.time} numberOfLines={1}>{timeText}</Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  imageWrap: {
    position: 'relative',
    aspectRatio: 4 / 3,
  },
  imageContainer: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  liveDot: {
    position: 'absolute',
    top: Space.xs,
    left: Space.xs,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
  outbidDot: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
  },
  body: {
    padding: Space.sm,
    gap: 1,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: 12,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 16,
  },
  price: {
    fontFamily: Typography.family.bold,
    fontSize: 14,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  time: {
    fontFamily: Typography.family.regular,
    fontSize: 11,
    color: Colors.textMuted,
  },
});
