import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Radius, Space, Type, Typography } from '../../theme/designTokens';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';

export interface CoOwnInstrumentCardProps {
  imageUri?: string | null;
  title: string;
  categoryLabel: string;
  unitPriceLabel: string;
  localReferenceLabel: string;
  availabilityLabel: string;
  statusLabel: string;
  status: 'open' | 'closed' | 'paused';
  isWatched: boolean;
  focalPoint?: { x: number; y: number };
  onPress: () => void;
  onToggleWatch: () => void;
}

export const CoOwnInstrumentCard = React.memo(function CoOwnInstrumentCard({
  imageUri,
  title,
  categoryLabel,
  unitPriceLabel,
  localReferenceLabel,
  availabilityLabel,
  statusLabel,
  status,
  isWatched,
  focalPoint,
  onPress,
  onToggleWatch,
}: CoOwnInstrumentCardProps) {
  const { colors } = useAppTheme();
  const statusColor = status === 'open'
    ? colors.success
    : status === 'paused'
      ? colors.warning
      : colors.textMuted;

  return (
    <View style={styles.root}>
      <AnimatedPressable
        onPress={onPress}
        style={styles.mediaButton}
        scaleValue={0.985}
        activeOpacity={0.94}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${unitPriceLabel} per unit, ${localReferenceLabel}, ${availabilityLabel}, ${statusLabel}`}
        accessibilityHint="Opens this market"
      >
        <CachedImage
          uri={imageUri ?? ''}
          style={styles.image}
          contentFit="cover"
          transition={240}
          emptyLabel={`${categoryLabel} · ${title}`}
          emptyIcon="diamond-outline"
          focalPoint={focalPoint}
        />
        <View style={styles.statusBadge}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={styles.statusText} numberOfLines={1} maxFontSizeMultiplier={1.3}>{statusLabel}</Text>
        </View>
      </AnimatedPressable>
      <AnimatedPressable
        onPress={onToggleWatch}
        style={[styles.watchButton, { backgroundColor: colors.background + 'E8', borderColor: colors.border }]}
        scaleValue={0.94}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={isWatched ? `Remove ${title} from watchlist` : `Add ${title} to watchlist`}
        accessibilityState={{ selected: isWatched }}
        hapticFeedback="light"
      >
        <Ionicons
          name={isWatched ? 'bookmark' : 'bookmark-outline'}
          size={18}
          color={isWatched ? colors.textPrimary : colors.textSecondary}
        />
      </AnimatedPressable>
      <AnimatedPressable
        onPress={onPress}
        style={styles.contentButton}
        scaleValue={0.985}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityLabel={`View ${title} market details`}
      >
        <Text style={[styles.category, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{categoryLabel}</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2} maxFontSizeMultiplier={1.25}>{title}</Text>
        <Text style={[styles.price, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.25}>{unitPriceLabel}</Text>
        <Text style={[styles.localReference, { color: colors.textMuted }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} maxFontSizeMultiplier={1.25}>{localReferenceLabel}</Text>
        <View style={styles.availabilityRow}>
          <Text style={[styles.availability, { color: colors.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{availabilityLabel}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
        </View>
      </AnimatedPressable>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
  },
  mediaButton: {
    width: '100%',
    aspectRatio: 1.04,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  statusBadge: {
    position: 'absolute',
    left: Space.xs,
    bottom: Space.xs,
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
  },
  watchButton: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentButton: {
    paddingTop: Space.sm,
    gap: 2,
    minHeight: 100,
  },
  category: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: 0.75,
    textTransform: 'uppercase',
  },
  title: {
    minHeight: 38,
    fontSize: Type.bodyEmphasis.size,
    lineHeight: 19,
    fontFamily: Typography.family.semibold,
    letterSpacing: -0.2,
  },
  price: {
    fontSize: Type.bodyEmphasis.size,
    lineHeight: Type.bodyEmphasis.lineHeight,
    fontFamily: Typography.family.bold,
    fontVariant: ['tabular-nums'],
  },
  localReference: {
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
  availabilityRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Space.xs,
    marginTop: 2,
  },
  availability: {
    flex: 1,
    minWidth: 0,
    fontSize: Type.caption.size,
    lineHeight: Type.caption.lineHeight,
    fontFamily: Typography.family.regular,
    fontVariant: ['tabular-nums'],
  },
});
