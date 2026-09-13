/**
 * CoOwnDepthChart — cumulative depth visualization alongside the order book
 * ladder.
 *
 * Two-sided Skia area chart: bids (coownUpSubtle) on the left, asks
 * (coownDownSubtle) on the right, mid price as a hairline center line.
 * Mirrors the depth chart flagship broker apps render next to the ladder
 * (Robinhood, IBKR).
 *
 * Visual language matches the Wave 34 order book: depth bars use the
 * coownUpSubtle / coownDownSubtle direction tints, prices use numericMeta
 * (13pt semibold tabular), sizes use body (14pt regular tabular), and axis
 * labels use meta (11pt) textMuted. Flat on canvas — no card chrome, no
 * shadows. Tabular numerals throughout. Updates statically on data change.
 *
 * States: empty book → "No depth data"; single side → only the available
 * side; normal → both sides with mid hairline + grid. Loading and error
 * states are owned by the parent (AssetMarketSection.renderDepth) so the
 * chart only renders when depth data is present.
 *
 * See docs/coown/flagship-exchange-upgrade/04 §A3.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import {
  Canvas, Path, Line, LinearGradient, DashPathEffect, vec, Skia,
} from '@shopify/react-native-skia';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { FontFamily } from '../../theme/fontFamily';

export interface CoOwnDepthLevel {
  price: number;
  cumulativeUnits: number;
  orderCount: number;
}

export interface CoOwnDepthChartProps {
  /** Sorted descending by price (best bid first). */
  bids: CoOwnDepthLevel[];
  /** Sorted ascending by price (best ask first). */
  asks: CoOwnDepthLevel[];
  midPrice?: number | null;
  lastPrice?: number | null;
  /** Canvas height in px. Default 120. */
  height?: number;
  /** Compact mode for inline display — fewer labels, shorter canvas. */
  compact?: boolean;
}

const PAD_X = 6;
const PAD_TOP = 4;
// Area-fill gradient stops — the direction-subtle tints fade from a readable
// top edge down to a near-transparent baseline, giving the classic depth
// silhouette while reusing the same tokens as the order book depth bars.
const FILL_TOP_ALPHA = 0.6;
const FILL_BOT_ALPHA = 0.08;
const EDGE_ALPHA = 0.55;
const COMPACT_H = 80;

/** Append an alpha channel to a `#rrggbb` hex, yielding `#rrggbbaa`. */
function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const a = Math.round(Math.min(Math.max(alpha, 0), 1) * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

/**
 * Set the alpha of any color — hex (`#rrggbb`) or `rgba(r,g,b,a)` — returning
 * a color string Skia can render. The direction-subtle tokens are `rgba(...)`
 * in production but `#rrggbb` in test mocks, so both forms are supported.
 */
function adjustAlpha(color: string, alpha: number): string {
  if (color.startsWith('#')) return withAlpha(color, alpha);
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})`;
  return color;
}

/** Format a cumulative depth value with tabular-friendly grouping. */
function formatDepth(value: number): string {
  return Math.round(value).toLocaleString('en-GB');
}

/** Build a closed area path + its top edge from cumulative depth points. */
function buildArea(
  levels: CoOwnDepthLevel[],
  xFor: (p: number) => number,
  yFor: (c: number) => number,
  baseline: number,
): { fill: ReturnType<typeof Skia.Path.Make>; edge: ReturnType<typeof Skia.Path.Make> } | null {
  if (levels.length === 0) return null;
  const fill = Skia.Path.Make();
  const edge = Skia.Path.Make();
  // P2-3: Skia.Path.Make() can return null under memory pressure — guard
  // against null deref before calling moveTo/lineTo.
  if (!fill || !edge) return null;
  fill.moveTo(xFor(levels[0].price), baseline);
  edge.moveTo(xFor(levels[0].price), yFor(levels[0].cumulativeUnits));
  for (const lvl of levels) {
    const x = xFor(lvl.price);
    const y = yFor(lvl.cumulativeUnits);
    fill.lineTo(x, y);
    edge.lineTo(x, y);
  }
  fill.lineTo(xFor(levels[levels.length - 1].price), baseline);
  fill.close();
  return { fill, edge };
}

/** Interpolate the cumulative depth available at a given price. */
function cumulativeAtPrice(levels: CoOwnDepthLevel[], price: number): number | null {
  if (levels.length === 0) return null;
  if (levels.length === 1) return levels[0].cumulativeUnits;
  for (let i = 0; i < levels.length - 1; i++) {
    const lo = levels[i];
    const hi = levels[i + 1];
    if ((price >= lo.price && price <= hi.price) || (price <= lo.price && price >= hi.price)) {
      const t = hi.price === lo.price ? 0 : (price - lo.price) / (hi.price - lo.price);
      return lo.cumulativeUnits + t * (hi.cumulativeUnits - lo.cumulativeUnits);
    }
  }
  return price >= levels[0].price
    ? levels[levels.length - 1].cumulativeUnits
    : levels[0].cumulativeUnits;
}

export function CoOwnDepthChart({
  bids, asks, midPrice, lastPrice, height = 120, compact = false,
}: CoOwnDepthChartProps) {
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const W = measuredWidth ?? Math.max(screenWidth - 32, 240);
  const chartH = compact ? Math.min(height, COMPACT_H) : height;
  const hasBids = bids.length > 0;
  const hasAsks = asks.length > 0;

  const geometry = useMemo(() => {
    const bestBid = hasBids ? bids[0].price : null;
    const bestAsk = hasAsks ? asks[0].price : null;
    const mid = midPrice ?? (bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null);
    if ((!hasBids && !hasAsks) || mid == null) return null;

    const priceMin = hasBids ? bids[bids.length - 1].price : mid;
    const priceMax = hasAsks ? asks[asks.length - 1].price : mid;
    const span = Math.max(mid - priceMin, priceMax - mid, Math.abs(mid) * 0.01, 1);
    const maxCum = Math.max(
      hasBids ? bids[bids.length - 1].cumulativeUnits : 0,
      hasAsks ? asks[asks.length - 1].cumulativeUnits : 0,
      1,
    );
    const midX = W / 2;
    const baseline = chartH - PAD_TOP;
    const xBid = (p: number) => midX - ((mid - p) / span) * (midX - PAD_X);
    const xAsk = (p: number) => midX + ((p - mid) / span) * (W - PAD_X - midX);
    const yFor = (c: number) => PAD_TOP + (1 - c / maxCum) * (baseline - PAD_TOP);

    // Last price — horizontal dotted line at the cumulative depth available
    // at the last traded price (liquidity sitting on the book at last trade).
    let lastY: number | null = null;
    if (lastPrice != null && lastPrice !== mid) {
      const cum = cumulativeAtPrice(lastPrice >= mid ? asks : bids, lastPrice);
      if (cum != null) lastY = yFor(cum);
    }

    return {
      mid, midX, bestBid, bestAsk, baseline, lastY, maxCum,
      bid: buildArea(bids, xBid, yFor, baseline),
      ask: buildArea(asks, xAsk, yFor, baseline),
    };
  }, [bids, asks, midPrice, lastPrice, hasBids, hasAsks, W, chartH]);

  // Empty book — flat centered notice, no icon box.
  if (!geometry) {
    return (
      <View style={[styles.empty, { height: chartH }]}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>No depth data</Text>
      </View>
    );
  }

  const { mid, midX, bestBid, bestAsk, baseline, lastY, maxCum, bid, ask } = geometry;
  const bidDepth = hasBids ? bids[bids.length - 1].cumulativeUnits : null;
  const askDepth = hasAsks ? asks[asks.length - 1].cumulativeUnits : null;

  // Screen-reader summary — the canvas is a Skia render with no a11y
  // tree, so the whole chart collapses into one announcement covering
  // every real figure: best bid/ask + cumulative depth, mid, last trade.
  // Nothing is fabricated — every value comes from the level arrays.
  const summaryParts: string[] = [];
  if (bestBid != null && bidDepth != null) {
    summaryParts.push(`best bid ${bestBid.toFixed(2)} with ${formatDepth(bidDepth)} units`);
  }
  if (bestAsk != null && askDepth != null) {
    summaryParts.push(`best ask ${bestAsk.toFixed(2)} with ${formatDepth(askDepth)} units`);
  }
  summaryParts.push(`mid price ${mid.toFixed(2)}`);
  if (lastPrice != null) summaryParts.push(`last trade ${lastPrice.toFixed(2)}`);
  const depthSummary = `Order book depth: ${summaryParts.join(', ')}.`;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="text"
      accessibilityLabel={depthSummary}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        if (measuredWidth == null || Math.abs(measuredWidth - w) > 0.5) setMeasuredWidth(w);
      }}
    >
      <Canvas style={{ width: W, height: chartH }}>
        {/* Bid area — coownUpSubtle fill, coownUp edge stroke. */}
        {bid && (
          <Path path={bid.fill} style="fill">
            <LinearGradient
              start={vec(0, PAD_TOP)}
              end={vec(0, baseline)}
              colors={[
                adjustAlpha(colors.coownUpSubtle, FILL_TOP_ALPHA),
                adjustAlpha(colors.coownUpSubtle, FILL_BOT_ALPHA),
              ]}
            />
          </Path>
        )}
        {bid && (
          <Path path={bid.edge} style="stroke" color={withAlpha(colors.coownUp, EDGE_ALPHA)} strokeWidth={1} />
        )}
        {/* Ask area — coownDownSubtle fill, coownDown edge stroke. */}
        {ask && (
          <Path path={ask.fill} style="fill">
            <LinearGradient
              start={vec(0, PAD_TOP)}
              end={vec(0, baseline)}
              colors={[
                adjustAlpha(colors.coownDownSubtle, FILL_TOP_ALPHA),
                adjustAlpha(colors.coownDownSubtle, FILL_BOT_ALPHA),
              ]}
            />
          </Path>
        )}
        {ask && (
          <Path path={ask.edge} style="stroke" color={withAlpha(colors.coownDown, EDGE_ALPHA)} strokeWidth={1} />
        )}
        {/* Mid price — hairline center line (borderSubtle). A subtle grid
            line at the mid price anchors the two-sided silhouette. */}
        <Line p1={vec(midX, 0)} p2={vec(midX, chartH)} color={colors.borderSubtle} strokeWidth={1} style="stroke" />
        {/* Last price — horizontal dotted line at depth available at last
            trade. Hairline in borderSubtle, dashed to distinguish from mid. */}
        {lastY != null && (
          <Line p1={vec(0, lastY)} p2={vec(W, lastY)} color={colors.borderSubtle} strokeWidth={1} style="stroke">
            <DashPathEffect intervals={[1, 3]} phase={0} />
          </Line>
        )}
      </Canvas>

      {/* Label block — hairline-separated from the canvas. Three columns:
          Bids / Mid / Asks. Each column shows an axis label (meta, textMuted),
          a price label (numericMeta, tabular, direction-colored) and a size
          label (body, tabular, textSecondary). Compact mode shows only the
          mid column. */}
      <View style={[styles.labelBlock, { borderTopColor: colors.borderSubtle }]}>
        {/* Axis labels — meta (11pt), textMuted */}
        <View style={styles.labelRow}>
          <Text style={[styles.axisLabel, { color: colors.textMuted, textAlign: 'left' }]}>
            {!compact && hasBids ? 'Bids' : ''}
          </Text>
          <Text style={[styles.axisLabel, { color: colors.textMuted, textAlign: 'center' }]}>
            Mid
          </Text>
          <Text style={[styles.axisLabel, { color: colors.textMuted, textAlign: 'right' }]}>
            {!compact && hasAsks ? 'Asks' : ''}
          </Text>
        </View>
        {/* Price labels — numericMeta (13pt semibold tabular) */}
        <View style={styles.labelRow}>
          <Text style={[styles.priceLabel, { color: colors.coownUp, textAlign: 'left' }]}>
            {!compact && bestBid != null ? bestBid.toFixed(2) : ''}
          </Text>
          <Text style={[styles.priceLabel, styles.priceLabelMid, { color: colors.textPrimary, textAlign: 'center' }]}>
            {mid.toFixed(2)}
          </Text>
          <Text style={[styles.priceLabel, { color: colors.coownDown, textAlign: 'right' }]}>
            {!compact && bestAsk != null ? bestAsk.toFixed(2) : ''}
          </Text>
        </View>
        {/* Size labels — body (14pt regular tabular) */}
        <View style={styles.labelRow}>
          <Text style={[styles.sizeLabel, { color: colors.textSecondary, textAlign: 'left' }]}>
            {!compact && bidDepth != null ? formatDepth(bidDepth) : ''}
          </Text>
          <Text style={[styles.sizeLabel, { color: colors.textMuted, textAlign: 'center' }]}>
            {formatDepth(maxCum)}
          </Text>
          <Text style={[styles.sizeLabel, { color: colors.textSecondary, textAlign: 'right' }]}>
            {!compact && askDepth != null ? formatDepth(askDepth) : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // Label block — hairline separator above, compact vertical rhythm.
  labelBlock: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Space.xs,
    gap: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Axis labels — meta (11pt medium), textMuted. Names the column without
  // restating the obvious.
  axisLabel: {
    flex: 1,
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  // Price labels — numericMeta (13pt semibold tabular). Direction-colored
  // to match the order book price column.
  priceLabel: {
    flex: 1,
    fontSize: TypographyV2.numericMeta.size,
    lineHeight: TypographyV2.numericMeta.lineHeight,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    letterSpacing: TypographyV2.numericMeta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  priceLabelMid: {
    fontFamily: FontFamily.semibold,
  },
  // Size labels — body (14pt regular tabular). Matches the order book size
  // column weight so the two panels read as one system.
  sizeLabel: {
    flex: 1,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
});

export default CoOwnDepthChart;
