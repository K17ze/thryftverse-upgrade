import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, Typography, Type } from '../../theme/designTokens';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { AuctionValueLockup } from './AuctionValueLockup';

interface Props {
  title: string;
  imageUrl: string | null;
  /** Brand name shown above the title for card hierarchy completeness */
  brand?: string | null;
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
  brand,
  izeText,
  localText,
  valueState = 'current',
  timeText,
  state,
  viewerState,
  onPress,
  cardWidth,
}: Props) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  return (
    <AnimatedPressable
      style={[styles.card, cardWidth ? { width: cardWidth } : null]}
      scaleValue={0.97}
      activeOpacity={0.95}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${brand ? brand + ', ' : ''}${title}, ${izeText}, ${timeText}`}
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
        {brand && <Text style={styles.brand} numberOfLines={1}>{brand}</Text>}
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

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  imageWrap: {
    position: 'relative',
    aspectRatio: 4 / 3,
    borderRadius: Radius.lg,
    overflow: 'hidden',
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
    top: Space.xs,
    left: Space.xs,
    width: 7,
    height: 7,
    borderRadius: Radius.full,
    backgroundColor: colors.danger,
  },
  outbidDot: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    width: 7,
    height: 7,
    borderRadius: Radius.full,
    backgroundColor: colors.danger,
  },
  body: {
    paddingTop: Space.xs,
    gap: 1,
  },
  brand: {
    fontFamily: Typography.family.medium,
    fontSize: Type.meta.size,
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  title: {
    fontFamily: Typography.family.semibold,
    fontSize: Type.caption.size,
    color: colors.textPrimary,
    letterSpacing: -0.2,
    lineHeight: 16,
  },
  time: {
    fontFamily: Typography.family.regular,
    fontSize: Type.meta.size,
    color: colors.textMuted,
  },
});
