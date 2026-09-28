import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { CachedImage } from '../CachedImage';
import { AnimatedPressable } from '../AnimatedPressable';
import { SupportedCurrencyCode } from '../../constants/currencies';
import { toIze, formatAuctionIze, type FxRates } from '../../utils/currency';
import { resolveAuctionTiming } from '../../hooks/useServerClock';
import type { useFormattedPrice } from '../../hooks/useFormattedPrice';
import {
  resolvePriceAmount,
  resolvePriceLabel,
  resolvePriceText,
  resolveTimeLabel,
  resolveUrgency,
  buildAuctionAccessibilityLabel,
  type AuctionHomeItem } from '../../utils/auctionHomeLogic';
import { resolveStatePresentation } from './sellerAuctionCentreViewModels';
import { Space, Radius, Stroke, ThumbSize, IconGrammar } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';

// ── Inventory row — horizontal, operations-studio layout ──
// Audit finding 09: the row previously behaved like a small dashboard
// (title, state, brand, internal divider, two stacked values, action,
// leading status and bid count beside a 96pt image, money clamped to one
// line). The row now reads in three zones: item identity → one commercial
// value paired with the next task → a single quiet wrapping metadata line
// carrying the local-currency conversion, secondary state and activity.
// Monetary text never clamps — exact values wrap instead (200% text-safe).
export function SellerAuctionRow({
  item,
  clockMs,
  onPress,
  formatFromFiat,
  fxRates,
  currencyCode }: {
  item: AuctionHomeItem;
  clockMs: number;
  onPress: () => void;
  /** The hook-produced formatter — typed from the source so this money
   *  surface can never drift from the real conversion contract. */
  formatFromFiat: ReturnType<typeof useFormattedPrice>['formatFromFiat'];
  fxRates: FxRates;
  currencyCode: SupportedCurrencyCode;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const timing = resolveAuctionTiming(item, clockMs);
  const urgency = resolveUrgency(timing);
  const priceLabel = resolvePriceLabel(item, timing);
  const priceText = resolvePriceText(item, timing, priceLabel, formatFromFiat);
  const timeLabel = resolveTimeLabel(timing);
  const presentation = resolveStatePresentation(item, timing, urgency, timeLabel, colors);

  // Headline amount is selected by the same resolver that feeds the fiat
  // line and the accessibility label — the three can never disagree.
  const amount = resolvePriceAmount(item);
  const izeText = Number.isFinite(amount)
    ? formatAuctionIze(toIze(amount, currencyCode, fxRates))
    : null;
  const localText = priceLabel === 'No bids' ? null : priceText;

  // Value prefix depends on state
  const valuePrefix =
    priceLabel === 'Starting bid' ? 'Starts '
    : priceLabel === 'Final bid' ? 'Final '
    : priceLabel === 'Current bid' ? 'Current '
    : '';

  // One quiet wrapping metadata line: leading operational fact first (it is
  // the state-derived "most important fact" and carries the only colour
  // signal), then conversion, brand and bid activity in muted text. Sold
  // rows already fold the count into `leadingLabel` ("Sold · 3 bids"), so
  // the count is only appended for non-sold states — same rule as before.
  const metaParts: string[] = [];
  if (localText) metaParts.push(localText);
  if (item.brand) metaParts.push(item.brand);
  if (item.bidCount > 0 && presentation.stateLabel !== 'Sold') {
    metaParts.push(`${item.bidCount} ${item.bidCount === 1 ? 'bid' : 'bids'}`);
  }

  return (
    <AnimatedPressable
      style={styles.row}
      scaleValue={0.992}
      activeOpacity={0.94}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={buildAuctionAccessibilityLabel(item, timing, priceLabel, priceText)}
    >
      {/* Media — compact inventory thumbnail, live dot preserved */}
      <View style={styles.rowImageWrap}>
        {item.imageUrl ? (
          <CachedImage
            uri={item.imageUrl}
            style={styles.rowImage}
            containerStyle={styles.rowImageContainer}
            contentFit="cover"
          />
        ) : (
          <View style={styles.rowImagePlaceholder}>
            <Ionicons name="image-outline" size={22} color={colors.textMuted} />
          </View>
        )}
        {presentation.showLiveDot && <View style={styles.rowLiveDot} />}
      </View>

      {/* Body — identity → commercial → metadata, separated by rhythm alone */}
      <View style={styles.rowBody}>
        {/* Identity — what the item is and what state it is in */}
        <View style={styles.rowIdentity}>
          <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.rowStateText, { color: presentation.stateColor }]}>
            {presentation.stateLabel}
          </Text>
        </View>

        {/* Commercial — one exact value (wraps, never truncates) beside the
            single next task for this state */}
        <View style={styles.rowCommercial}>
          <Text style={styles.rowValue}>
            {valuePrefix ? <Text style={styles.rowValuePrefix}>{valuePrefix}</Text> : null}
            {izeText ?? 'No value'}
          </Text>
          <View style={styles.rowAction}>
            <Text style={styles.rowActionLabel}>{presentation.actionLabel}</Text>
            <Ionicons
              name="chevron-forward"
              size={IconGrammar.metadata}
              color={colors.textMuted}
            />
          </View>
        </View>

        {/* Metadata — conversion, secondary state, brand and bid count fold
            into one quiet line that wraps instead of clipping */}
        <Text style={styles.rowMeta}>
          <Text style={{ color: presentation.leadingColor }}>{presentation.leadingLabel}</Text>
          {metaParts.length > 0 ? ` · ${metaParts.join(' · ')}` : null}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

// 80pt — canonical large list-row thumbnail (was 96). The row's height is
// set by the three text zones, not the media, so this slot stays compact
// while remaining recognisable for inventory scanning.
const ROW_IMAGE_SIZE = ThumbSize.lg;

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
  // ── Inventory row — horizontal, operations studio ──
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md },
  rowImageWrap: {
    position: 'relative',
    borderRadius: Radius.md,
    overflow: 'hidden' },
  rowImageContainer: {
    width: ROW_IMAGE_SIZE,
    height: ROW_IMAGE_SIZE },
  rowImage: {
    width: ROW_IMAGE_SIZE,
    height: ROW_IMAGE_SIZE },
  rowImagePlaceholder: {
    width: ROW_IMAGE_SIZE,
    height: ROW_IMAGE_SIZE,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md },
  rowLiveDot: {
    position: 'absolute',
    top: Space.xs + 2,
    left: Space.xs + 2,
    width: Space.xs / 2 + 2,
    height: Space.xs / 2 + 2,
    borderRadius: Radius.sm,
    backgroundColor: colors.danger,
    borderWidth: Stroke.emphasis,
    borderColor: colors.background },
  rowBody: {
    flex: 1,
    minHeight: ROW_IMAGE_SIZE,
    justifyContent: 'center',
    gap: Space.sm - 2 },
  rowIdentity: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Space.sm },
  rowTitle: {
    flex: 1,
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    color: colors.textPrimary,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing },
  rowStateText: {
    flexShrink: 1,
    maxWidth: '45%',
    textAlign: 'right',
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    paddingTop: Space.xs / 2 + 1 },
  rowCommercial: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm },
  // Primary commercial value — wraps exactly; no line clamp may ever hide
  // part of a monetary figure.
  rowValue: {
    flex: 1,
    fontSize: TypographyV2.priceList.size,
    lineHeight: TypographyV2.priceList.lineHeight,
    fontFamily: TypographyV2.priceList.fontFamily,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.priceList.letterSpacing },
  rowValuePrefix: {
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.label.letterSpacing },
  // Next task — quiet text action with a chevron; bounded so the value keeps
  // priority, but allowed to wrap so the label never clips at large text.
  rowAction: {
    flexShrink: 1,
    maxWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Space.xs / 4 },
  rowActionLabel: {
    fontSize: TypographyV2.captionElevated.size,
    lineHeight: TypographyV2.captionElevated.lineHeight,
    color: colors.textSecondary,
    fontFamily: TypographyV2.captionElevated.fontFamily,
    textAlign: 'right',
    letterSpacing: TypographyV2.captionElevated.letterSpacing },
  rowMeta: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    color: colors.textMuted,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
    letterSpacing: TypographyV2.meta.letterSpacing } });
}
