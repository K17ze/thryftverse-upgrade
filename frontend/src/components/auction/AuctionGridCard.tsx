import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Typography, Stroke, Type, AspectRatio } from '../../theme/designTokens';
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
  /**
   * TestID for Maestro/automation semantic selectors. When provided,
   * passes through to the underlying Pressable so Maestro flows can
   * tapOn by id instead of brittle coordinate taps (P0.6).
   */
  testID?: string;
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
  testID,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
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
      testID={testID}
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

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  card: {
    marginBottom: Space.sm,
  },
  imageWrap: {
    position: 'relative',
    aspectRatio: AspectRatio.portrait,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  imageContainer: {
    borderRadius: Radius.lg,
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
    backgroundColor: colors.danger,
    borderWidth: Stroke.standard,
    borderColor: colors.overlay,
  },
  personalMarker: {
    position: 'absolute',
    top: Space.xs + 2,
    right: Space.xs + 2,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${colors.border}40`,
  },
  personalMarkerOutbid: {
    backgroundColor: colors.danger,
  },
  personalMarkerLeading: {
    backgroundColor: colors.success,
  },
  personalMarkerText: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.meta.size,
    color: colors.textInverse,
    letterSpacing: 0.4,
  },
  body: {
    paddingTop: Space.sm,
    gap: 3,
  },
  brand: {
    fontFamily: Typography.family.medium,
    fontSize: Type.meta.size,
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.body.size,
    color: colors.textPrimary,
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
    fontSize: Type.meta.size,
    color: colors.textMuted,
  },
});

