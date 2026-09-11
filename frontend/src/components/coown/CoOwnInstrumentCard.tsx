import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Radius, Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { AnimatedPressable } from '../AnimatedPressable';
import { CachedImage } from '../CachedImage';

/** Watch toggle status — drives the icon's pending/failed visual state.
 * Absent means no toggle is in progress. */
export type CoOwnWatchStatus = 'pending' | 'confirmed' | 'failed';

export interface CoOwnInstrumentCardProps {
  imageUri?: string | null;
  title: string;
  categoryLabel: string;
  unitPriceLabel: string;
  /** ONE lifecycle/liquidity fact — e.g. "65% funded", "Last £85.00",
   * "Bid £85 · Ask £90". This is the only metadata line on the card;
   * less urgent data lives on the detail screen. */
  liquidityLabel?: string;
  allocatedPct?: number;
  statusLabel: string;
  status: 'open' | 'closed' | 'paused';
  isWatched: boolean;
  /** Status of the last watch toggle — 'pending' shows a dimmed icon
   * while the server request is in flight; 'failed' shows a warning tint. */
  watchStatus?: CoOwnWatchStatus;
  focalPoint?: { x: number; y: number };
  onPress: () => void;
  onToggleWatch: () => void;
}

export const CoOwnInstrumentCard = React.memo(function CoOwnInstrumentCard({
  imageUri,
  title,
  categoryLabel,
  unitPriceLabel,
  liquidityLabel,
  allocatedPct,
  statusLabel,
  status,
  isWatched,
  watchStatus,
  focalPoint,
  onPress,
  onToggleWatch,
}: CoOwnInstrumentCardProps) {
  const { colors } = useAppTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const statusColor = status === 'open'
    ? colors.success
    : status === 'paused'
      ? colors.warning
      : colors.textMuted;

  // Watch icon visual state — pending dims the icon, failed tints it warning.
  const isPending = watchStatus === 'pending';
  const isFailed = watchStatus === 'failed';
  const watchIconColor = isPending
    ? colors.textMuted
    : isFailed
      ? colors.warning
      : isWatched
        ? colors.textPrimary
        : colors.textSecondary;

  return (
    <View style={styles.root}>
      <AnimatedPressable
        onPress={onPress}
        style={styles.mediaButton}
        scaleValue={0.985}
        activeOpacity={0.94}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${unitPriceLabel} per unit, ${liquidityLabel ?? 'Liquidity unavailable'}, ${statusLabel}`}
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
      {/* Watch button — independent hit area (zIndex: 2) so tapping it
          never triggers the media button's onPress (asset navigation).
          Scrim circle ensures contrast over light and dark images. */}
      <AnimatedPressable
        onPress={onToggleWatch}
        style={styles.watchButton}
        scaleValue={0.94}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={isWatched ? `Remove ${title} from watchlist` : `Add ${title} to watchlist`}
        accessibilityState={{ selected: isWatched, busy: isPending }}
        hapticFeedback="light"
        disabled={isPending}
      >
        <View style={[styles.watchScrim, isWatched ? styles.watchScrimActive : null]} />
        <Ionicons
          name={isWatched ? 'bookmark' : 'bookmark-outline'}
          size={18}
          color={watchIconColor}
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
        {allocatedPct != null && allocatedPct > 0 && status === 'open' ? (
          <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(100, Math.max(0, allocatedPct))}%`,
                  backgroundColor: colors.brand,
                },
              ]}
            />
          </View>
        ) : null}
        {liquidityLabel ? (
          <Text style={[styles.liquidity, { color: colors.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{liquidityLabel}</Text>
        ) : null}
      </AnimatedPressable>
    </View>
  );
});

const createStyles = (colors: ThemeColors) => StyleSheet.create({
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
    paddingHorizontal: Space.sm,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: Radius.sm,
  },
  statusText: {
    color: colors.scrimTextPrimary,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  watchButton: {
    position: 'absolute',
    top: Space.xs,
    right: Space.xs,
    zIndex: 2,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Subtle scrim behind the watch icon for contrast over any image.
  // Transparent fill with a light overlay — not a visible circle, just
  // enough to separate the glyph from the underlying media.
  watchScrim: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: colors.overlay,
    opacity: 0.72,
  },
  watchScrimActive: {
    opacity: 0.88,
  },
  contentButton: {
    paddingTop: Space.sm,
    gap: 2,
    minHeight: 80,
  },
  category: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: 0.75,
    textTransform: 'uppercase',
  },
  title: {
    minHeight: 38,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: 19,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: -0.2,
  },
  price: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'],
  },
  liquidity: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  progressTrack: {
    height: 3,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
});
