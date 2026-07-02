import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { AuctionValueLockup } from './AuctionValueLockup';

interface Props {
  title: string;
  imageUrl: string | null;
  /** 1ZE primary text e.g. "24.60 1ZE" */
  izeText: string;
  /** Local currency e.g. "£123.00" */
  localText?: string | null;
  /** Value state controls prefix */
  valueState?: 'current' | 'starting' | 'final';
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
  izeText,
  localText,
  valueState = 'current',
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
      accessibilityLabel={`${title}, ${izeText}, ${timeText}`}
    >
      <View style={styles.imageWrap}>
        <CachedImage
          uri={imageUrl ?? ''}
          style={styles.image}
          containerStyle={styles.imageContainer}
          contentFit="cover"
        />
        {/* Single live dot only */}
        {state === 'live' && (
          <View style={styles.liveDot} />
        )}
        {/* Outbid marker — single, compact */}
        {viewerState === 'outbid' && (
          <View style={styles.outbidDot} />
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <AuctionValueLockup
          izeText={izeText}
          localText={localText}
          state={valueState}
          scale="supporting"
        />
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
    backgroundColor: 'transparent',
  },
  imageWrap: {
    position: 'relative',
    aspectRatio: 4 / 3,
    borderRadius: Radius.md,
    overflow: 'hidden',
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
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: Colors.danger,
  },
  outbidDot: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: Colors.danger,
  },
  body: {
    paddingTop: Space.xs,
    gap: 1,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: 12,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 16,
  },
  time: {
    fontFamily: Typography.family.regular,
    fontSize: 11,
    color: Colors.textMuted,
  },
});
