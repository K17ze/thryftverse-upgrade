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
  onWatch?: () => void;
  isWatching?: boolean;
  /** Override the computed card width */
  cardWidth?: number;
  /** Override the image height */
  imageHeight?: number;
  /** When true, metadata renders below the image (clean overlay) */
  metadataBelow?: boolean;
  /** Personal action label shown when viewerState is relevant */
  personalActionLabel?: string | null;
  onPersonalAction?: () => void;
}

export function AuctionRunwayCard({
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
  onWatch,
  isWatching,
  cardWidth: cardWidthOverride,
  imageHeight: imageHeightOverride,
  metadataBelow = false,
  personalActionLabel,
  onPersonalAction,
}: Props) {
  const { width } = useWindowDimensions();
  const cardWidth = cardWidthOverride ?? width * 0.85;
  const imageHeight = imageHeightOverride ?? 380;

  // Personal state label — only one, no duplication
  const personalLabel = viewerState === 'outbid' ? 'Outbid'
    : viewerState === 'leading' ? 'Leading'
    : viewerState === 'won' ? 'Won'
    : viewerState === 'lost' ? 'Lost'
    : null;
  const personalColor = viewerState === 'outbid' ? Colors.danger
    : viewerState === 'leading' ? Colors.success
    : viewerState === 'won' ? Colors.success
    : viewerState === 'lost' ? Colors.danger
    : Colors.textSecondary;

  if (metadataBelow) {
    return (
      <AnimatedPressable
        style={[styles.card, styles.cardMetadataBelow, { width: cardWidth }]}
        scaleValue={0.98}
        activeOpacity={0.95}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${state}, ${izeText}, ${countdownText}`}
      >
        {/* Clean image — only state badge + watch */}
        <View style={[styles.imageWrap, { height: imageHeight }]}>
          <CachedImage
            uri={imageUrl ?? ''}
            style={styles.image}
            containerStyle={styles.imageContainer}
            contentFit="cover"
          />
          {/* Subtle top gradient only for badge legibility */}
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'rgba(0,0,0,0)']}
            locations={[0, 0.3]}
            style={styles.topGradient}
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
          <AuctionValueLockup
            izeText={izeText}
            localText={localText}
            state={valueState}
            scale="featured"
          />
          <View style={styles.belowMetaRow}>
            <AuctionCountdown text={countdownText} urgent={urgent} compact />
            <Text style={styles.belowBidCount}>{bidCount} {bidCount === 1 ? 'bid' : 'bids'}</Text>
          </View>
          {/* Personal action — single, no duplication */}
          {personalActionLabel && onPersonalAction && (
            <AnimatedPressable
              style={styles.personalActionBtn}
              scaleValue={0.95}
              onPress={onPersonalAction}
              accessibilityRole="button"
              accessibilityLabel={personalActionLabel}
            >
              <Text style={styles.personalActionText}>{personalActionLabel}</Text>
            </AnimatedPressable>
          )}
        </View>
      </AnimatedPressable>
    );
  }

  // Overlay variant — for horizontal rail usage
  return (
    <AnimatedPressable
      style={[styles.card, { width: cardWidth }]}
      scaleValue={0.98}
      activeOpacity={0.95}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${state}, ${izeText}, ${countdownText}`}
    >
      <View style={[styles.imageWrap, { height: imageHeight }]}>
        <CachedImage
          uri={imageUrl ?? ''}
          style={styles.image}
          containerStyle={styles.imageContainer}
          contentFit="cover"
        />
        {/* Bottom gradient only — for text legibility */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)']}
          locations={[0.5, 1]}
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

        <View style={styles.bottomContent}>
          {brand && <Text style={styles.brand} numberOfLines={1}>{brand}</Text>}
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <AuctionValueLockup
            izeText={izeText}
            localText={localText}
            state={valueState}
            scale="featured"
          />
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
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
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
  bottomContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: Space.md,
    gap: 3,
  },
  brand: {
    fontFamily: Typography.family.medium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.2,
  },
  title: {
    fontFamily: Typography.family.bold,
    fontSize: 20,
    color: '#FFFFFF',
    letterSpacing: -0.4,
    lineHeight: 24,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  bidCount: {
    fontFamily: Typography.family.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },

  // ── Metadata-below variant ──
  belowBody: {
    paddingTop: Space.sm,
    gap: 3,
  },
  belowBrand: {
    fontFamily: Typography.family.medium,
    fontSize: 11,
    color: Colors.textMuted,
    letterSpacing: 0.2,
  },
  belowTitle: {
    fontFamily: Typography.family.bold,
    fontSize: 20,
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    lineHeight: 24,
    marginBottom: 2,
  },
  belowMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  belowBidCount: {
    fontFamily: Typography.family.regular,
    fontSize: 12,
    color: Colors.textMuted,
  },
  personalActionBtn: {
    marginTop: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand,
    alignSelf: 'flex-start',
  },
  personalActionText: {
    fontFamily: Typography.family.semibold,
    fontSize: 13,
    color: Colors.textInverse,
  },
});
