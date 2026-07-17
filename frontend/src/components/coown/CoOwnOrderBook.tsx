/**
 * CoOwnOrderBook — executable top-of-book + depth.
 *
 * Two columns (asks descending on top, bids descending below) with depth
 * bars from DEPTH_COLORS. Spread row in the middle. Tap a level to
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
import { Space, Radius, Type, Typography, ExchangeLayout } from '../../theme/designTokens';
import { DEPTH_COLORS } from '../../constants/colors';
import { CoOwnNumericText } from '../ui/CoOwnNumericText';

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
}

export function CoOwnOrderBook({
  bids,
  asks,
  visibleLevels = ExchangeLayout.bookVisibleLevels,
  lastPrice,
  lastAgeSeconds,
  onSelectLevel,
  mode,
}: CoOwnOrderBookProps) {
  const { colors } = useAppTheme();

  // RFQ mode — show CTA instead of book
  if (mode === 'rfq') {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.rfqWrap}>
          <Ionicons name="chatbubbles-outline" size={28} color={colors.brand} />
          <Text style={[styles.rfqTitle, { color: colors.textPrimary }]}>Request for quote</Text>
          <Text style={[styles.rfqSubtitle, { color: colors.textSecondary }]}>
            This instrument trades by RFQ. Request a quote from the market maker.
          </Text>
          <Pressable
            style={[styles.rfqBtn, { backgroundColor: colors.brand }]}
            onPress={() => onSelectLevel?.('ask', 0)}
            accessibilityRole="button"
            accessibilityLabel="Request quote"
          >
            <Text style={[styles.rfqBtnText, { color: colors.background }]}>Request quote</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Halted / closed — frozen with overlay
  if (mode === 'halted' || mode === 'closed') {
    const label = mode === 'halted' ? 'Trading halted' : 'Market closed';
    return (
      <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.haltedWrap}>
          <Ionicons name="pause-circle-outline" size={28} color={colors.textMuted} />
          <Text style={[styles.haltedTitle, { color: colors.textSecondary }]}>{label}</Text>
          <Text style={[styles.haltedSubtitle, { color: colors.textMuted }]}>
            The order book is frozen. No new orders accepted.
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

  // Call auction — show indicative auction note
  const isCallAuction = mode === 'call_auction';

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Order book</Text>
        {isCallAuction && (
          <View style={[styles.auctionBadge, { backgroundColor: colors.warning + '22' }]}>
            <Ionicons name="time-outline" size={11} color={colors.warning} />
            <Text style={[styles.auctionBadgeText, { color: colors.warning }]}>Call auction</Text>
          </View>
        )}
      </View>

      {/* Column headers */}
      <View style={[styles.colHeaderRow, { borderColor: colors.border }]}>
        <Text style={[styles.colHeader, { color: colors.textMuted }]}>Price</Text>
        <Text style={[styles.colHeader, { color: colors.textMuted }]}>Size</Text>
        <Text style={[styles.colHeader, { color: colors.textMuted, textAlign: 'right' }]}>Total</Text>
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
        onSelectLevel={onSelectLevel}
      />

      {/* Empty state — no open orders */}
      {bids.length === 0 && asks.length === 0 && (
        <View style={styles.emptyWrap}>
          <Ionicons name="document-text-outline" size={20} color={colors.textMuted} />
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No open orders</Text>
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
  const ordered = reverseOrder ? [...levels].reverse() : levels;
  const barColor = side === 'bid' ? DEPTH_COLORS.bidBar : DEPTH_COLORS.askBar;
  const barEdgeColor = side === 'bid' ? DEPTH_COLORS.bidBarEdge : DEPTH_COLORS.askBarEdge;
  const priceColor = side === 'bid' ? colors.success : colors.danger;

  if (levels.length === 0) {
    return (
      <View style={styles.sideEmptyWrap}>
        <Text style={[styles.sideEmptyText, { color: colors.textMuted }]}>
          No {side === 'bid' ? 'bids' : 'asks'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.sideWrap}>
      {ordered.map((level, i) => {
        const cumulative = level.cumulative ?? level.size;
        const depthFraction = cumulative / maxCumulative;
        const isEdge = i === ordered.length - 1;

        return (
          <Pressable
            key={`${side}-${level.price}-${i}`}
            onPress={() => onSelectLevel?.(side, level.price)}
            disabled={!onSelectLevel}
            accessibilityRole={onSelectLevel ? 'button' : undefined}
            accessibilityLabel={`${side === 'bid' ? 'Bid' : 'Ask'} ${level.price.toFixed(2)}, size ${level.size}`}
          >
            <View style={[styles.levelRow, { height: ExchangeLayout.bookRowHeight }]}>
              {/* Depth bar — right-aligned for asks, left-aligned for bids */}
              <View
                style={[
                  styles.depthBar,
                  side === 'ask' && styles.depthBarRight,
                  { width: `${Math.min(depthFraction * 100, 100)}%`, backgroundColor: isEdge ? barEdgeColor : barColor },
                ]}
              />
              <Text style={[styles.levelPrice, { color: priceColor }]} numberOfLines={1}>
                {level.price.toFixed(2)}
              </Text>
              <Text style={[styles.levelSize, { color: colors.textPrimary }]} numberOfLines={1}>
                {level.size.toLocaleString('en-GB')}
              </Text>
              <Text style={[styles.levelTotal, { color: colors.textSecondary }]} numberOfLines={1}>
                {cumulative.toLocaleString('en-GB')}
              </Text>
            </View>
          </Pressable>
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
            <Text style={[styles.lastAge, { color: colors.textMuted }]}>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
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
    fontSize: Type.meta.size,
    lineHeight: Type.meta.lineHeight,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.meta.letterSpacing,
  },
  colHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  colHeader: {
    flex: 1,
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  sideWrap: {
    gap: 0,
  },
  sideEmptyWrap: {
    height: ExchangeLayout.bookRowHeight * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideEmptyText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    paddingHorizontal: Space.xs,
    position: 'relative',
  },
  depthBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 2,
  },
  depthBarRight: {
    left: undefined,
    right: 0,
  },
  levelPrice: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  levelSize: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
    textAlign: 'right',
  },
  levelTotal: {
    flex: 1,
    fontSize: Type.body.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.body.letterSpacing,
    textAlign: 'right',
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
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  spreadValue: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.body.letterSpacing,
  },
  spreadRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Space.xs,
  },
  lastLabel: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.medium,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  lastValue: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.bold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  lastAge: {
    fontSize: Type.meta.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.meta.letterSpacing,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.md,
    gap: Space.xs,
  },
  emptyText: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
  },
  // RFQ state
  rfqWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.lg,
    gap: Space.sm,
  },
  rfqTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  rfqSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    textAlign: 'center',
    paddingHorizontal: Space.md,
  },
  rfqBtn: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm + 2,
    borderRadius: Radius.md,
    marginTop: Space.xs,
  },
  rfqBtnText: {
    fontSize: Type.body.size,
    fontFamily: Typography.family.semibold,
  },
  // Halted / closed state
  haltedWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.md,
    gap: Space.xs,
  },
  haltedTitle: {
    fontSize: Type.bodyEmphasis.size,
    fontFamily: Typography.family.semibold,
    letterSpacing: Type.bodyEmphasis.letterSpacing,
  },
  haltedSubtitle: {
    fontSize: Type.caption.size,
    fontFamily: Typography.family.regular,
    letterSpacing: Type.caption.letterSpacing,
    textAlign: 'center',
    paddingHorizontal: Space.md,
  },
  bookWrap: {
    gap: 0,
  },
});

export default CoOwnOrderBook;
