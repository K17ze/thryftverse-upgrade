/**
 * CoOwnOrderBook — executable top-of-book + depth.
 *
 * Two columns (asks descending on top, bids descending below) with depth
 * bars from theme direction subtles. Spread row in the middle. Tap a level to
 * pre-fill the order ticket.
 *
 * States: empty book → "No open orders" per side; halted → frozen with
 * overlay; RFQ → "Request for quote" CTA instead of book.
 *
 * See docs/coown/flagship-exchange-upgrade/04 §A3 + 05 §3.
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, ExchangeLayout, FontFamily } from '../../theme/designTokens';
import { TypographyV2 } from '../../theme/typography.v2';
import { buildDepthRows } from '../../utils/orderBookDepth';

/**
 * Order-book row height = the canonical 44pt touch target — levels are
 * interactive (tap a level to pre-fill the order ticket), so rows keep
 * the full hit height rather than tightening for density.
 */
const BOOK_ROW_HEIGHT = 44;
/** Fixed-width price rail — wider to accommodate larger tabular figures. */
const PRICE_COL_WIDTH = 90;
/** Fixed-width size rail — wider to accommodate larger tabular figures. */
const SIZE_COL_WIDTH = 80;
export type CoOwnBookMode = 'continuous' | 'call_auction' | 'rfq' | 'halted' | 'closed';

export interface CoOwnBookLevel {
  price: number;
  size: number;
  orderCount?: number;
  cumulative?: number;
}

export interface CoOwnOrderBookProps {
  bids: CoOwnBookLevel[];
  asks: CoOwnBookLevel[];
  visibleLevels?: number; // 5 mobile, 10 tablet
  lastPrice?: number;
  lastAgeSeconds?: number | null;
  onSelectLevel?: (side: 'bid' | 'ask', price: number) => void;
  mode: CoOwnBookMode;
  /** Removes the outer card treatment when the book sits inside the
   * page's single market surface. Data, row targets and states remain
   * identical. */
  embedded?: boolean;
  onRequestQuote?: () => void;
}

export function CoOwnOrderBook({
  bids,
  asks,
  visibleLevels = ExchangeLayout.bookVisibleLevels,
  lastPrice,
  lastAgeSeconds,
  onSelectLevel,
  mode,
  embedded = false,
  onRequestQuote,
}: CoOwnOrderBookProps) {
  const { colors } = useAppTheme();
  const containerStyle = [
    styles.container,
    embedded && styles.containerEmbedded,
    {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
  ];

  // RFQ mode — flat inline notice instead of centered icon box
  if (mode === 'rfq') {
    return (
      <View style={containerStyle}>
        <View style={styles.rfqBlock}>
          <Text style={[styles.rfqTitle, { color: colors.textPrimary }]}>Request for quote</Text>
          <Text style={[styles.rfqSubtitle, { color: colors.textSecondary }]}>
            This instrument trades by RFQ. Request a quote from the market maker.
          </Text>
          <Pressable
            style={[styles.rfqBtn, { backgroundColor: colors.brand }]}
            onPress={onRequestQuote}
            disabled={!onRequestQuote}
            accessibilityState={{ disabled: !onRequestQuote }}
            accessibilityRole="button"
            accessibilityLabel="Request quote"
          >
            <Text style={[styles.rfqBtnText, { color: colors.background }]}>{onRequestQuote ? 'Request quote' : 'Quotes unavailable'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Halted / closed — flat inline notice + frozen levels
  if (mode === 'halted' || mode === 'closed') {
    const label = mode === 'halted' ? 'Trading halted' : 'Market closed';
    return (
      <View style={containerStyle}>
        <View style={styles.haltedBlock}>
          <Text style={[styles.haltedTitle, { color: colors.textSecondary }]}>{label}</Text>
          <Text style={[styles.haltedSubtitle, { color: colors.textMuted }]}>
            Order book frozen. No new orders accepted.
          </Text>
        </View>
        {/* Show frozen book levels with reduced opacity */}
        <View style={[styles.bookWrap, { opacity: 0.4 }]}>
          <BookSide
            levels={asks.slice(0, visibleLevels)}
            side="ask"
            colors={colors}
            maxCumulative={getMaxCumulative(asks, bids)}
            onSelectLevel={undefined}
          />
          <SpreadRow
            bestBid={bids[0]?.price}
            bestAsk={asks[0]?.price}
            lastPrice={lastPrice}
            lastAgeSeconds={lastAgeSeconds}
            colors={colors}
          />
          <BookSide
            levels={bids.slice(0, visibleLevels)}
            side="bid"
            colors={colors}
            maxCumulative={getMaxCumulative(asks, bids)}
            onSelectLevel={undefined}
          />
        </View>
      </View>
    );
  }

  const maxCumulative = getMaxCumulative(asks, bids);
  const visibleAsks = asks.slice(0, visibleLevels);
  const visibleBids = bids.slice(0, visibleLevels);
  // Bid/ask imbalance — the resting-unit ratio across the visible book.
  // Rendered as a proportional green/red strip beneath the ladder
  // (Binance B/S gauge convention). Only shown when both sides carry units.
  const bidsTotal = visibleBids.reduce((sum, l) => sum + l.size, 0);
  const asksTotal = visibleAsks.reduce((sum, l) => sum + l.size, 0);
  const imbalanceTotal = bidsTotal + asksTotal;
  const bidShare = imbalanceTotal > 0 ? bidsTotal / imbalanceTotal : null;

  // Call auction — show indicative auction note
  const isCallAuction = mode === 'call_auction';

  return (
    <View style={containerStyle}>
      {/* Header — hidden when embedded (parent section provides the title) */}
      {!embedded ? (
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Order book</Text>
          {isCallAuction && (
            <View style={[styles.auctionBadge, { backgroundColor: colors.warningSubtle }]}>
              <Ionicons name="time-outline" size={11} color={colors.warningText} />
              <Text style={[styles.auctionBadgeText, { color: colors.warningText }]}>Call auction</Text>
            </View>
          )}
        </View>
      ) : isCallAuction ? (
        <View style={styles.headerRow}>
          <View style={[styles.auctionBadge, { backgroundColor: colors.warningSubtle }]}>
            <Ionicons name="time-outline" size={11} color={colors.warningText} />
            <Text style={[styles.auctionBadgeText, { color: colors.warningText }]}>Call auction</Text>
          </View>
        </View>
      ) : null}

      {/* Column headers — fixed-width rails keep price/quantity columns
          aligned across every row so depth reads as comparable columns
          (U24). The cumulative column flexes to fill remaining space.
          Header keeps the 44pt hit target; level rows tighten to 32pt. */}
      <View style={[styles.colHeaderRow, { borderColor: colors.border }]}>
        <Text style={[styles.colHeader, styles.colHeaderPrice, { color: colors.textMuted }]}>Price · 1ZE</Text>
        <Text style={[styles.colHeader, styles.colHeaderSize, { color: colors.textMuted }]}>Units</Text>
        <Text style={[styles.colHeader, { color: colors.textMuted, textAlign: 'right' }]}>Total units</Text>
      </View>

      {/* Asks (descending — highest at top) */}
      <BookSide
        levels={visibleAsks}
        side="ask"
        colors={colors}
        maxCumulative={maxCumulative}
        onSelectLevel={onSelectLevel}
        reverseOrder
      />

      {/* Spread row — recessed band between the two sides */}
      <SpreadRow
        bestBid={bids[0]?.price}
        bestAsk={asks[0]?.price}
        lastPrice={lastPrice}
        lastAgeSeconds={lastAgeSeconds}
        bandColor={embedded ? colors.surface : colors.surfaceAlt}
        colors={colors}
      />

      {/* Bids (descending — highest at top) */}
      <BookSide
        levels={visibleBids}
        side="bid"
        colors={colors}
        maxCumulative={maxCumulative}
        onSelectLevel={onSelectLevel}
      />

      {/* Bid/ask imbalance — proportional B/S strip under the ladder.
          Reads like Binance's B/S gauge: green share = resting bid units,
          red share = resting ask units across the visible depth. */}
      {bidShare != null ? (
        <View
          style={styles.imbalanceWrap}
          accessibilityRole="text"
          accessibilityLabel={`Order book imbalance: ${Math.round(bidShare * 100)}% bids, ${Math.round((1 - bidShare) * 100)}% asks across visible depth`}
        >
          <Text style={[styles.imbalanceLabel, { color: colors.coownUp }]}>
            {Math.round(bidShare * 100)}%
          </Text>
          <View style={[styles.imbalanceTrack, { backgroundColor: colors.coownDown }]}>
            <View
              style={[
                styles.imbalanceFill,
                { backgroundColor: colors.coownUp, width: `${bidShare * 100}%` },
              ]}
            />
          </View>
          <Text style={[styles.imbalanceLabel, { color: colors.coownDown }]}>
            {Math.round((1 - bidShare) * 100)}%
          </Text>
        </View>
      ) : null}

      {/* Empty state — flat inline notice, no centered icon box */}
      {bids.length === 0 && asks.length === 0 && (
        <View style={styles.emptyBlock}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No open orders</Text>
          <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
            Place a limit order or request a quote to start trading.
          </Text>
        </View>
      )}
    </View>
  );
}

/** Max cumulative depth across both sides — the scale for the classic
 *  order-book fan: each row's fill is its cumulative units relative to the
 *  deepest side's total, so bars grow toward the far edge (Binance/Kraken
 *  book convention). */
function getMaxCumulative(asks: CoOwnBookLevel[], bids: CoOwnBookLevel[]): number {
  const asksTotal = asks.reduce((sum, l) => sum + l.size, 0);
  const bidsTotal = bids.reduce((sum, l) => sum + l.size, 0);
  return Math.max(asksTotal, bidsTotal, 1);
}

/**
 * A single book level row. Memoized: the book re-renders on every flushed
 * delta batch (~90ms), but only levels whose price/size/cumulative actually
 * changed should reconcile. Keys are stable per price level so React can
 * keep row identity across size updates.
 *
 * Rendering is intentionally bounded (≤ `visibleLevels` rows per side,
 * default 5) rather than virtualized: a ladder that shows at most ~20
 * rows doesn't justify a FlashList inside a nested ScrollView context.
 */
const BookLevelRow = React.memo(function BookLevelRow({
  level,
  side,
  cumulative,
  depthFraction,
  colors,
  onSelectLevel,
}: {
  level: CoOwnBookLevel;
  side: 'bid' | 'ask';
  cumulative: number;
  depthFraction: number;
  colors: ReturnType<typeof useAppTheme>['colors'];
  onSelectLevel?: (side: 'bid' | 'ask', price: number) => void;
}) {
  // Depth fills are the order book's core visual: full-strength theme
  // subtle tints so the green bid / red ask mass reads at a glance.
  const barColor = side === 'bid' ? colors.coownUpSubtle : colors.coownDownSubtle;
  // Per Design.md: use coownUp/coownDown for financial truth (bid=up/buy,
  // ask=down/sell), not generic success/danger.
  const priceColor = side === 'bid' ? colors.coownUp : colors.coownDown;

  return (
    <Pressable
      onPress={() => onSelectLevel?.(side, level.price)}
      disabled={!onSelectLevel}
      accessibilityRole={onSelectLevel ? 'button' : undefined}
      accessibilityLabel={`${side === 'bid' ? 'Bid' : 'Ask'} ${level.price.toFixed(2)} 1ZE, ${level.size} units, ${cumulative} cumulative units`}
      accessibilityHint={onSelectLevel ? 'Opens a limit order at this price for review' : undefined}
      style={({ pressed }) => pressed && { opacity: 0.6 }}
    >
      <View style={[styles.levelRow, { minHeight: BOOK_ROW_HEIGHT }]}>
        {/* Depth fill — behind the text, sized by CUMULATIVE units at this
            level so the book reads as the classic fan: short bars nearest
            the spread, full bars at the far edge. Bids grow from the left,
            asks from the right. */}
        <View
          style={[
            side === 'ask' ? styles.depthBarRight : styles.depthBarLeft,
            {
              width: `${Math.min(depthFraction * 100, 100)}%`,
              backgroundColor: barColor,
            },
          ]}
        />
        {/* Financial values must remain exact at large text sizes — two
            lines inside the fixed rail instead of silently clipping (F12). */}
        <Text
          style={[styles.levelPrice, { color: priceColor }]}
          numberOfLines={2}
        >
          {level.price.toFixed(2)}
        </Text>
        <Text
          style={[styles.levelSize, { color: colors.textPrimary }]}
          numberOfLines={2}
        >
          {level.size.toLocaleString('en-GB')}
        </Text>
        <Text
          style={[styles.levelTotal, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {cumulative.toLocaleString('en-GB')}
        </Text>
      </View>
    </Pressable>
  );
});

/** Render one side of the book (asks or bids). */
function BookSide({
  levels,
  side,
  colors,
  maxCumulative,
  onSelectLevel,
  reverseOrder,
}: {
  levels: CoOwnBookLevel[];
  side: 'bid' | 'ask';
  colors: ReturnType<typeof useAppTheme>['colors'];
  maxCumulative: number;
  onSelectLevel?: (side: 'bid' | 'ask', price: number) => void;
  reverseOrder?: boolean;
}) {
  // For asks, we want highest price at top (reverse of natural ascending)

  // Per-side empty states are differentiated (U25): "No bids" when only
  // asks exist, "No asks" when only bids exist, "No open orders" when the
  // entire book is empty (handled in the main render). The side label is
  // always shown so the user knows which side they are reading.
  if (levels.length === 0) {
    return (
      <View style={styles.sideWrap}>
        <Text style={[styles.sideLabelText, { color: side === 'bid' ? colors.coownUp : colors.coownDown }]}>
          {side === 'bid' ? 'Bids' : 'Asks'}
        </Text>
        <View style={styles.sideEmptyWrap}>
          <Text style={[styles.sideEmptyText, { color: colors.textMuted }]}>
            No {side === 'bid' ? 'bids' : 'asks'}
          </Text>
        </View>
      </View>
    );
  }

  // Running cumulative totals — single linear pass from the best price
  // outward instead of a slice+reduce per row. Falls back to the level's
  // own size if the API provides a precomputed `cumulative` field.
  const rows = buildDepthRows(levels, reverseOrder);

  return (
    <View style={styles.sideWrap}>
      <Text style={[styles.sideLabelText, { color: side === 'bid' ? colors.coownUp : colors.coownDown }]}>
        {side === 'bid' ? 'Bids' : 'Asks'}
      </Text>
      {rows.map(({ level, cumulative }) => {
        // Depth fills scale by cumulative units at this level relative to
        // the deepest side's total — the classic book fan.
        const depthFraction = cumulative / maxCumulative;

        return (
          <BookLevelRow
            key={`${side}-${level.price}`}
            level={level}
            side={side}
            cumulative={cumulative}
            depthFraction={depthFraction}
            colors={colors}
            onSelectLevel={onSelectLevel}
          />
        );
      })}
    </View>
  );
}

/** Spread band — between asks and bids. Rendered as a bid–spread–ask
 *  bar (Polymarket/Robinhood grammar): the green bid half and red ask
 *  half continue each side's depth-bar axis into the divider and meet
 *  at a neutral centre carrying the spread and last trade. Labels keep
 *  meaning colour-independent. */
function SpreadRow({
  bestBid,
  bestAsk,
  lastPrice,
  lastAgeSeconds,
  bandColor,
  colors,
}: {
  bestBid?: number;
  bestAsk?: number;
  lastPrice?: number;
  lastAgeSeconds?: number | null;
  bandColor?: string;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  const spread = bestBid != null && bestAsk != null ? bestAsk - bestBid : null;
  const mid = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;
  const spreadBps = spread != null && mid != null && mid > 0 ? (spread / mid) * 10000 : null;
  // Trade-side inference (tick rule): a last price at/above the ask was a
  // buy lift, at/below the bid a sell hit, inside the spread is neutral.
  // Mirrors how Polymarket/Robinhood colour the last print on the band.
  const lastSide: 'buy' | 'sell' | null =
    lastPrice == null ? null
    : bestAsk != null && lastPrice >= bestAsk ? 'buy'
    : bestBid != null && lastPrice <= bestBid ? 'sell'
    : null;
  const lastColor =
    lastSide === 'buy' ? colors.coownUp
    : lastSide === 'sell' ? colors.coownDown
    : colors.textSecondary;

  return (
    <View
      style={[styles.spreadRow, { borderColor: colors.border, backgroundColor: bandColor }]}
      accessibilityRole="text"
      accessibilityLabel={
        `Best bid ${bestBid != null ? bestBid.toFixed(2) : 'none'}, best ask ${bestAsk != null ? bestAsk.toFixed(2) : 'none'}` +
        (spread != null ? `, spread ${spread.toFixed(2)}${spreadBps != null ? `, ${spreadBps.toFixed(0)} basis points` : ''}` : '') +
        (lastPrice != null ? `, last trade ${lastPrice.toFixed(2)}${lastSide ? `, ${lastSide}-side` : ''}${lastAgeSeconds != null ? `, ${formatAge(lastAgeSeconds)}` : ''}` : '')
      }
    >
      {/* Bid half — continues the bid depth-bar axis (bars grow from
          the left) into the band. */}
      <View style={[styles.spreadSide, bestBid != null && { backgroundColor: colors.coownUpSubtle }]}>
        <Text style={[styles.spreadSideLabel, { color: colors.textMuted }]}>Bid</Text>
        <Text style={[styles.spreadSideValue, { color: bestBid != null ? colors.coownUp : colors.textMuted }]}>
          {bestBid != null ? bestBid.toFixed(2) : '—'}
        </Text>
      </View>

      {/* Neutral centre — spread magnitude + last trade, stacked. */}
      <View style={styles.spreadCenter}>
        <Text style={[styles.spreadCenterMeta, { color: colors.textMuted }]}>
          Spread{' '}
          <Text style={[styles.spreadCenterValue, { color: colors.textSecondary }]}>
            {spread != null ? spread.toFixed(2) : '—'}
            {spreadBps != null ? ` · ${spreadBps.toFixed(0)}bps` : ''}
          </Text>
        </Text>
        {lastPrice != null && (
          <Text style={[styles.spreadCenterMeta, { color: colors.textMuted }]}>
            Last{' '}
            <Text style={{ color: lastColor }}>{lastPrice.toFixed(2)}</Text>
            {lastAgeSeconds != null ? ` · ${formatAge(lastAgeSeconds)}` : ''}
          </Text>
        )}
      </View>

      {/* Ask half — ask depth bars grow from the right, so the red
          tone anchors the right edge. */}
      <View style={[styles.spreadSide, styles.spreadSideRight, bestAsk != null && { backgroundColor: colors.coownDownSubtle }]}>
        <Text style={[styles.spreadSideLabel, { color: colors.textMuted }]}>Ask</Text>
        <Text style={[styles.spreadSideValue, { color: bestAsk != null ? colors.coownDown : colors.textMuted }]}>
          {bestAsk != null ? bestAsk.toFixed(2) : '—'}
        </Text>
      </View>
    </View>
  );
}

/** Format age in seconds to a human-readable string. */
function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) return 'just now';
  const mins = Math.floor(ageSeconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    gap: Space.xs,
  },
  containerEmbedded: {
    borderRadius: Radius.none,
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingTop: Space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: -0.2,
  },
  auctionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Space.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  auctionBadgeText: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
  },
  colHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingBottom: Space.xs,
    paddingTop: Space.xs,
    paddingHorizontal: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colHeader: {
    flex: 1,
    fontSize: TypographyV2.label.size,
    lineHeight: TypographyV2.label.lineHeight,
    fontFamily: TypographyV2.label.fontFamily,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
  },
  // Fixed-width rails so price and quantity columns align across every
  // row — depth reads as comparable columns, not variable-width text (U24).
  colHeaderPrice: {
    width: PRICE_COL_WIDTH,
    flex: 0,
    flexShrink: 0,
  },
  colHeaderSize: {
    width: SIZE_COL_WIDTH,
    flex: 0,
    flexShrink: 0,
    textAlign: 'right',
  },
  sideWrap: {
    gap: 0,
  },
  // Explicit side label — "Bids" / "Asks" — so the side is named, not
  // just color-coded (U24).
  sideLabelText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: FontFamily.semibold,
    letterSpacing: TypographyV2.meta.letterSpacing,
    paddingTop: Space.xs,
    paddingBottom: 2,
    paddingHorizontal: Space.xs,
  },
  sideEmptyWrap: {
    height: BOOK_ROW_HEIGHT * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideEmptyText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    paddingHorizontal: Space.xs,
    position: 'relative',
  },
  // Depth bars: bid side grows from left, ask side grows from right.
  // Two mutually exclusive base styles so the absolute edge is
  // unambiguous — no `left: undefined` override that RN may ignore.
  depthBarLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 0,
  },
  depthBarRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    zIndex: 0,
  },
  levelPrice: {
    width: PRICE_COL_WIDTH,
    flex: 0,
    flexShrink: 0,
    zIndex: 1,
    fontSize: TypographyV2.numericMeta.size,
    lineHeight: TypographyV2.numericMeta.lineHeight,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    letterSpacing: TypographyV2.numericMeta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  levelSize: {
    width: SIZE_COL_WIDTH,
    flex: 0,
    flexShrink: 0,
    zIndex: 1,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  levelTotal: {
    flex: 1,
    zIndex: 1,
    fontSize: TypographyV2.body.size,
    lineHeight: TypographyV2.body.lineHeight,
    fontFamily: TypographyV2.body.fontFamily,
    letterSpacing: TypographyV2.body.letterSpacing,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  spreadRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // Bid/ask halves — each side's depth-bar tone field extends into the
  // band so the divider reads as green | neutral | red, matching the
  // column axis (bids grow left, asks grow right).
  spreadSide: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.xs,
  },
  spreadSideRight: {
    justifyContent: 'center',
  },
  spreadSideLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
  },
  spreadSideValue: {
    fontSize: TypographyV2.bodyStrong.size,
    lineHeight: TypographyV2.bodyStrong.lineHeight,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    fontVariant: ['tabular-nums'],
  },
  spreadCenter: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.sm,
  },
  spreadCenterValue: {
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  spreadCenterMeta: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight + 2,
    fontFamily: TypographyV2.meta.fontFamily,
    fontVariant: ['tabular-nums'],
  },
  // Bid/ask imbalance strip — one thin proportional gauge under the
  // ladder. Green share = resting bid units, red share = resting ask
  // units. Labels carry the numbers; the bar carries the ratio.
  imbalanceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingTop: Space.xs + 2,
    paddingBottom: 2,
    paddingHorizontal: Space.xs,
  },
  imbalanceTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  imbalanceFill: {
    height: 3,
  },
  imbalanceLabel: {
    fontSize: TypographyV2.meta.size,
    lineHeight: TypographyV2.meta.lineHeight,
    fontFamily: FontFamily.semibold,
    fontVariant: ['tabular-nums'],
  },
  emptyBlock: {
    paddingVertical: Space.md,
    gap: 4,
  },
  emptyText: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
  },
  emptyHint: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    lineHeight: 18,
  },
  // RFQ state — flat block
  rfqBlock: {
    paddingVertical: Space.md,
    gap: Space.xs,
  },
  rfqTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  rfqSubtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    lineHeight: 18,
  },
  rfqBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    marginTop: Space.xs,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rfqBtnText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
  },
  // Halted / closed state — flat block
  haltedBlock: {
    paddingVertical: Space.md,
    gap: 4,
  },
  haltedTitle: {
    fontSize: TypographyV2.bodyStrong.size,
    fontFamily: TypographyV2.bodyStrong.fontFamily,
    letterSpacing: TypographyV2.bodyStrong.letterSpacing,
  },
  haltedSubtitle: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    letterSpacing: TypographyV2.meta.letterSpacing,
    lineHeight: 18,
  },
  bookWrap: {
    gap: 0,
  },
});

export default CoOwnOrderBook;
