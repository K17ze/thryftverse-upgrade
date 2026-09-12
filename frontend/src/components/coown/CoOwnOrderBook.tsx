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

/**
 * Order-book row height. The shared `ExchangeLayout.bookRowHeight` token is
 * 44pt (the canonical touch target); the order book levels are not
 * interactive, so we tighten them to 32pt to expose more depth per viewport
 * while keeping the 44pt hit target for the header row below.
 */
const BOOK_ROW_HEIGHT = 32;
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
            onPress={() => onSelectLevel?.('ask', 0)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Request quote"
          >
            <Text style={[styles.rfqBtnText, { color: colors.background }]}>Request quote</Text>
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
            maxSize={getMaxSize(asks, bids)}
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
            maxSize={getMaxSize(asks, bids)}
            onSelectLevel={undefined}
          />
        </View>
      </View>
    );
  }

  const maxCumulative = getMaxCumulative(asks, bids);
  const maxSize = getMaxSize(asks, bids);
  const visibleAsks = asks.slice(0, visibleLevels);
  const visibleBids = bids.slice(0, visibleLevels);

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
              <Ionicons name="time-outline" size={11} color={colors.warning} />
              <Text style={[styles.auctionBadgeText, { color: colors.warning }]}>Call auction</Text>
            </View>
          )}
        </View>
      ) : isCallAuction ? (
        <View style={styles.headerRow}>
          <View style={[styles.auctionBadge, { backgroundColor: colors.warningSubtle }]}>
            <Ionicons name="time-outline" size={11} color={colors.warning} />
            <Text style={[styles.auctionBadgeText, { color: colors.warning }]}>Call auction</Text>
          </View>
        </View>
      ) : null}

      {/* Column headers — fixed-width rails keep price/quantity columns
          aligned across every row so depth reads as comparable columns
          (U24). The cumulative column flexes to fill remaining space.
          Header keeps the 44pt hit target; level rows tighten to 32pt. */}
      <View style={[styles.colHeaderRow, { borderColor: colors.border }]}>
        <Text style={[styles.colHeader, styles.colHeaderPrice, { color: colors.textMuted }]}>Price</Text>
        <Text style={[styles.colHeader, styles.colHeaderSize, { color: colors.textMuted }]}>Size</Text>
        <Text style={[styles.colHeader, { color: colors.textMuted, textAlign: 'right' }]}>Cumulative</Text>
      </View>

      {/* Asks (descending — highest at top) */}
      <BookSide
        levels={visibleAsks}
        side="ask"
        colors={colors}
        maxCumulative={maxCumulative}
        maxSize={maxSize}
        onSelectLevel={onSelectLevel}
        reverseOrder
      />

      {/* Spread row */}
      <SpreadRow
        bestBid={bids[0]?.price}
        bestAsk={asks[0]?.price}
        lastPrice={lastPrice}
        lastAgeSeconds={lastAgeSeconds}
        colors={colors}
      />

      {/* Bids (descending — highest at top) */}
      <BookSide
        levels={visibleBids}
        side="bid"
        colors={colors}
        maxCumulative={maxCumulative}
        maxSize={maxSize}
        onSelectLevel={onSelectLevel}
      />

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

/** Get the max cumulative size across both sides for depth bar scaling. */
function getMaxCumulative(asks: CoOwnBookLevel[], bids: CoOwnBookLevel[]): number {
  const askMax = asks.length > 0 ? (asks[asks.length - 1].cumulative ?? asks[asks.length - 1].size) : 0;
  const bidMax = bids.length > 0 ? (bids[bids.length - 1].cumulative ?? bids[bids.length - 1].size) : 0;
  return Math.max(askMax, bidMax, 1);
}

/** Get the max per-level size across both sides — depth bars are proportional
 *  to each level's own size relative to the deepest level in the book. */
function getMaxSize(asks: CoOwnBookLevel[], bids: CoOwnBookLevel[]): number {
  const askMax = asks.reduce((m, l) => Math.max(m, l.size), 0);
  const bidMax = bids.reduce((m, l) => Math.max(m, l.size), 0);
  return Math.max(askMax, bidMax, 1);
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
  isEdge,
  colors,
  onSelectLevel,
}: {
  level: CoOwnBookLevel;
  side: 'bid' | 'ask';
  cumulative: number;
  depthFraction: number;
  isEdge: boolean;
  colors: ReturnType<typeof useAppTheme>['colors'];
  onSelectLevel?: (side: 'bid' | 'ask', price: number) => void;
}) {
  // Depth bars read as structure — theme-resolved subtle fills keep them
  // visible on both canvases (F28 static-palette reconciliation). The bar
  // sits behind the text at 40% opacity so tabular figures stay readable.
  const barColor = side === 'bid' ? colors.coownUpSubtle : colors.coownDownSubtle;
  const barEdgeColor = side === 'bid' ? colors.coownUpBorder : colors.coownDownBorder;
  // Per Design.md: use coownUp/coownDown for financial truth (bid=up/buy,
  // ask=down/sell), not generic success/danger.
  const priceColor = side === 'bid' ? colors.coownUp : colors.coownDown;

  return (
    <Pressable
      onPress={() => onSelectLevel?.(side, level.price)}
      disabled={!onSelectLevel}
      hitSlop={6}
      accessibilityRole={onSelectLevel ? 'button' : undefined}
      accessibilityLabel={`${side === 'bid' ? 'Bid' : 'Ask'} ${level.price.toFixed(2)}, size ${level.size}`}
      style={({ pressed }) => pressed && { opacity: 0.6 }}
    >
      <View style={[styles.levelRow, { height: BOOK_ROW_HEIGHT, minHeight: 44 }]}>
        {/* Depth bar — behind the text (z-index), grows from the
            outer edge: left for bids, right for asks. Fills the full
            row height at 40% opacity so figures stay readable. */}
        <View
          style={[
            side === 'ask' ? styles.depthBarRight : styles.depthBarLeft,
            {
              width: `${Math.min(depthFraction * 100, 100)}%`,
              backgroundColor: isEdge ? barEdgeColor : barColor,
              opacity: 0.4,
            },
          ]}
        />
        <Text
          style={[styles.levelPrice, { color: priceColor }]}
          numberOfLines={1}
        >
          {level.price.toFixed(2)}
        </Text>
        <Text
          style={[styles.levelSize, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {level.size.toLocaleString('en-GB')}
        </Text>
        <Text
          style={[styles.levelTotal, { color: colors.textSecondary }]}
          numberOfLines={1}
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
  maxSize,
  onSelectLevel,
  reverseOrder,
}: {
  levels: CoOwnBookLevel[];
  side: 'bid' | 'ask';
  colors: ReturnType<typeof useAppTheme>['colors'];
  maxCumulative: number;
  maxSize: number;
  onSelectLevel?: (side: 'bid' | 'ask', price: number) => void;
  reverseOrder?: boolean;
}) {
  // For asks, we want highest price at top (reverse of natural ascending)
  const ordered = reverseOrder ? [...levels].reverse() : levels;

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
  let running = 0;
  const rows = ordered.map((level) => {
    running += level.size;
    return { level, cumulative: level.cumulative ?? running };
  });

  return (
    <View style={styles.sideWrap}>
      <Text style={[styles.sideLabelText, { color: side === 'bid' ? colors.coownUp : colors.coownDown }]}>
        {side === 'bid' ? 'Bids' : 'Asks'}
      </Text>
      {rows.map(({ level, cumulative }, i) => {
        // Depth bars are proportional to each level's own size relative to
        // the deepest level in the book — visual depth, not cumulative total.
        const depthFraction = level.size / maxSize;
        const isEdge = i === rows.length - 1;

        return (
          <BookLevelRow
            key={`${side}-${level.price}`}
            level={level}
            side={side}
            cumulative={cumulative}
            depthFraction={depthFraction}
            isEdge={isEdge}
            colors={colors}
            onSelectLevel={onSelectLevel}
          />
        );
      })}
    </View>
  );
}

/** Spread row — between asks and bids. */
function SpreadRow({
  bestBid,
  bestAsk,
  lastPrice,
  lastAgeSeconds,
  colors,
}: {
  bestBid?: number;
  bestAsk?: number;
  lastPrice?: number;
  lastAgeSeconds?: number | null;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  const spread = bestBid != null && bestAsk != null ? bestAsk - bestBid : null;
  const mid = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;
  const spreadBps = spread != null && mid != null && mid > 0 ? (spread / mid) * 10000 : null;

  return (
    <View style={[styles.spreadRow, { borderColor: colors.border }]}>
      <View style={styles.spreadLeft}>
        <Text style={[styles.spreadLabel, { color: colors.textMuted }]}>Spread</Text>
        <Text style={[styles.spreadValue, { color: colors.textSecondary }]}>
          {spread != null ? spread.toFixed(2) : '—'}
          {spreadBps != null && ` · ${spreadBps.toFixed(0)}bps`}
        </Text>
      </View>
      {lastPrice != null && (
        <View style={styles.spreadRight}>
          <Text style={[styles.lastLabel, { color: colors.textMuted }]}>Last</Text>
          <Text style={[styles.lastValue, { color: colors.textPrimary }]}>
            {lastPrice.toFixed(2)}
          </Text>
          {lastAgeSeconds != null && (
            <Text
              style={[styles.lastAge, { color: colors.textMuted }]}
              accessibilityLabel={`Last trade ${formatAge(lastAgeSeconds)}`}
            >
              · {formatAge(lastAgeSeconds)}
            </Text>
          )}
        </View>
      )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Space.xs + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  spreadLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
  },
  spreadLabel: {
    fontSize: TypographyV2.captionElevated.size,
    lineHeight: TypographyV2.captionElevated.lineHeight,
    fontFamily: TypographyV2.captionElevated.fontFamily,
    letterSpacing: TypographyV2.captionElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  spreadValue: {
    fontSize: TypographyV2.captionElevated.size,
    lineHeight: TypographyV2.captionElevated.lineHeight,
    fontFamily: TypographyV2.captionElevated.fontFamily,
    letterSpacing: TypographyV2.captionElevated.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  spreadRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
  },
  lastLabel: {
    fontSize: TypographyV2.captionElevated.size,
    lineHeight: TypographyV2.captionElevated.lineHeight,
    fontFamily: TypographyV2.captionElevated.fontFamily,
    letterSpacing: TypographyV2.captionElevated.letterSpacing,
    textTransform: 'uppercase',
  },
  lastValue: {
    fontSize: TypographyV2.captionElevated.size,
    lineHeight: TypographyV2.captionElevated.lineHeight,
    fontFamily: TypographyV2.captionElevated.fontFamily,
    letterSpacing: TypographyV2.captionElevated.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  lastAge: {
    fontSize: TypographyV2.captionElevated.size,
    lineHeight: TypographyV2.captionElevated.lineHeight,
    fontFamily: TypographyV2.captionElevated.fontFamily,
    letterSpacing: TypographyV2.captionElevated.letterSpacing,
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
