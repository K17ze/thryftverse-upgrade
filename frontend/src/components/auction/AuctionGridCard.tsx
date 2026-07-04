import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { Colors } from '../../constants/colors';
import { Space, Radius, Typography } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { AuctionCountdown } from './AuctionCountdown';
import { AuctionValueLockup } from './AuctionValueLockup';

interface Props {
  title: string;
  imageUrl: string | null;
  brand?: string | null;
  /** 1ZE primary text e.g. "24.60 1ZE" */
  izeText: string;
  /** Local currency e.g. "£123.00" */
  localText?: string | null;
  /** Value state controls prefix */
  valueState?: 'current' | 'starting' | 'final';
  bidCount: number;
  countdownText: string;
  urgent?: boolean;
  state: 'live' | 'upcoming' | 'ended';
  viewerState?: 'leading' | 'outbid' | 'watching' | 'not_participating' | 'won' | 'lost' | 'seller';
  onPress: () => void;
  /** Card width override (for grid layouts) */
  cardWidth?: number;
  /** Price label for accessibility only */
  priceLabel?: string;
}

export function AuctionGridCard({
  title,
  imageUrl,
  brand,
  izeText,
  localText,
  valueState = 'current',
  bidCount,
  countdownText,
  urgent,
  state,
  viewerState,
  onPress,
  cardWidth,
  priceLabel,
}: Props) {
  const { width } = useWindowDimensions();
  const w = cardWidth ?? (width - Space.md * 2 - Space.sm) / 2;

  // Single personal marker — not both chip and state badge
  const personalLabel = viewerState === 'outbid' ? 'Outbid'
    : viewerState === 'leading' ? 'Leading'
    : null;

  return (
    <AnimatedPressable
      style={[styles.card, { width: w }]}
      scaleValue={0.97}
      activeOpacity={0.95}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${priceLabel ?? ''} ${izeText}, ${countdownText}, ${bidCount} bids`}
    >
      <View style={styles.imageWrap}>
        <CachedImage
          uri={imageUrl ?? ''}
          style={styles.image}
          containerStyle={styles.imageContainer}
          contentFit="cover"
        />
        {/* Single live dot — not a full badge */}
        {state === 'live' && (
          <View style={styles.liveDot} />
        )}
        {/* Personal state — one compact marker, not a full chip */}
        {personalLabel && (
          <View style={[
            styles.personalMarker,
            viewerState === 'outbid' && styles.personalMarkerOutbid,
            viewerState === 'leading' && styles.personalMarkerLeading,
          ]}>
            <Text style={styles.personalMarkerText}>{personalLabel}</Text>
          </View>
        )}
      </View>

      <View style={styles.body}>
        {brand && <Text style={styles.brand} numberOfLines={1}>{brand}</Text>}
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        <AuctionValueLockup
          izeText={izeText}
          localText={localText}
          state={valueState}
          scale="supporting"
        />
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
    marginBottom: Space.md - 2,
  },
  imageWrap: {
    position: 'relative',
    aspectRatio: 4 / 5,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceAlt,
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
    top: Space.xs + 2,
    left: Space.xs + 2,
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.danger,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.35)',
  },
  personalMarker: {
    position: 'absolute',
    top: Space.xs + 2,
    right: Space.xs + 2,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  personalMarkerOutbid: {
    backgroundColor: 'rgba(220,38,38,0.92)',
  },
  personalMarkerLeading: {
    backgroundColor: 'rgba(22,163,74,0.92)',
  },
  personalMarkerText: {
    fontFamily: Typography.family.semibold,
    fontSize: 10,
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  body: {
    paddingTop: Space.sm,
    gap: 3,
  },
  brand: {
    fontFamily: Typography.family.medium,
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 0.2,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: 14,
    color: Colors.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  bidCount: {
    fontFamily: Typography.family.medium,
    fontSize: 10,
    color: Colors.textMuted,
  },
});
});
});
    fontFamily: Typography.family.medium,
    fontSize: 10,
    color: Colors.textMuted,
  },
});
  },
});
    fontFamily: Typography.family.bold,
    fontSize: 15,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
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
    letterSpacing: 0.5,
  },
  priceValue: {
    fontFamily: Typography.family.bold,
    fontSize: 15,
    color: Colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
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
