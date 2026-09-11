/**
 * CoOwnTimeAndSales — real-time trade tape alongside the order book.
 *
 * Flat on canvas (no card chrome). One row per trade laid out as three
 * tabular columns: time (left, 60pt) | price (center, flex) | size
 * (right, 80pt). Hairline row dividers (borderSubtle) give the tape
 * structure so it never reads as a floating list.
 *
 * Type hierarchy:
 *  - Time  → meta (11pt) textMuted      — least important
 *  - Price → numericMeta (13pt semibold) — most important, colored by
 *    taker direction (buy → coownUp, sell → coownDown, unknown →
 *    textPrimary)
 *  - Size  → body (14pt regular)        — secondary
 *  - Header → label (11pt uppercase) "TIME | PRICE | SIZE"
 *
 * States: loading → skeleton rows; empty → "No trades yet"; error →
 * "Trade history unavailable" with retry; normal → trades list. Most
 * recent trade at top. Tabular numerals throughout.
 *
 * See docs/coown/flagship-exchange-upgrade/04 §A3.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { TypographyV2 } from '../../theme/typography.v2';
import { Space } from '../../theme/designTokens';
import { formatFiatAmount } from '../../utils/currency';

export interface CoOwnTradeEntry {
  id: number;
  priceGbp: number;
  units: number;
  /** Taker side. "unknown" covers upstream gaps without fabricating a
   *  direction — rendered in textPrimary rather than a directional hue. */
  side: 'buy' | 'sell' | 'unknown';
  timestamp: string; // ISO
}

export interface CoOwnTimeAndSalesProps {
  trades: CoOwnTradeEntry[];
  /** Loading state */
  isLoading?: boolean;
  /** Show "No trades yet" empty state */
  isEmpty?: boolean;
  /** Error state — shows "Trade history unavailable" with a retry control */
  error?: boolean;
  /** Retry callback; shown when `error` is true */
  onRetry?: () => void;
  /** Max rows to show (default 30) */
  maxRows?: number;
  /** Compact mode — 32pt rows, more trades visible */
  compact?: boolean;
}

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function formatTime(timestamp: string): string {
  try {
    return timeFormatter.format(new Date(timestamp));
  } catch {
    return '--:--:--';
  }
}

function formatPrice(priceGbp: number): string {
  try {
    return formatFiatAmount(priceGbp, 'GBP', 2);
  } catch {
    return `£${priceGbp.toFixed(2)}`;
  }
}

function formatUnits(units: number): string {
  return units.toLocaleString('en-GB');
}

/** One trade row. Memoized so only changed rows re-render when the list
 * grows — the existing rows keep stable identities via key=id. */
const TradeRow = memo(function TradeRow({
  trade,
  rowHeight,
  borderColor,
}: {
  trade: CoOwnTradeEntry;
  rowHeight: number;
  borderColor: string;
}) {
  const { colors } = useAppTheme();
  const priceColor =
    trade.side === 'buy'
      ? colors.coownUp
      : trade.side === 'sell'
        ? colors.coownDown
        : colors.textPrimary;

  return (
    <View
      style={[styles.row, { height: rowHeight, borderBottomColor: borderColor }]}
      accessibilityLabel={`Trade at ${formatTime(trade.timestamp)}, ${formatUnits(
        trade.units
      )} units at ${trade.priceGbp.toFixed(2)} GBP, ${trade.side}`}
    >
      <Text
        style={[styles.cellTime, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        {formatTime(trade.timestamp)}
      </Text>
      <Text
        style={[styles.cellPrice, { color: priceColor }]}
        numberOfLines={1}
      >
        {formatPrice(trade.priceGbp)}
      </Text>
      <Text
        style={[styles.cellUnits, { color: colors.textPrimary }]}
        numberOfLines={1}
      >
        {formatUnits(trade.units)}
      </Text>
    </View>
  );
});

/** Skeleton row — View-based shimmer-like opacity placeholder. */
function SkeletonRow({
  rowHeight,
  borderColor,
}: {
  rowHeight: number;
  borderColor: string;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.row, { height: rowHeight, borderBottomColor: borderColor }]}>
      <View style={[styles.skelBar, styles.skelTime, { backgroundColor: colors.border }]} />
      <View style={[styles.skelBar, styles.skelPrice, { backgroundColor: colors.border }]} />
      <View style={[styles.skelBar, styles.skelUnits, { backgroundColor: colors.border }]} />
    </View>
  );
}

export function CoOwnTimeAndSales({
  trades,
  isLoading = false,
  isEmpty = false,
  error = false,
  onRetry,
  maxRows = 30,
  compact = false,
}: CoOwnTimeAndSalesProps) {
  const { colors } = useAppTheme();
  const rowHeight = compact ? 32 : 40;
  const rowBorder = colors.borderSubtle;

  // Error — flat notice with retry. Owns the full state machine rather
  // than leaving the error surface to the parent alone.
  if (error) {
    return (
      <View style={styles.container}>
        <HeaderRow colors={colors} />
        <View style={styles.statusBlock}>
          <Text style={[styles.statusText, { color: colors.textMuted }]}>
            Trade history unavailable
          </Text>
          {onRetry ? (
            <Pressable
              onPress={onRetry}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Retry loading trade history"
            >
              <Text style={[styles.retryText, { color: colors.brand }]}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  // Loading — 4 skeleton rows with shimmer-like opacity.
  if (isLoading) {
    return (
      <View style={styles.container}>
        <HeaderRow colors={colors} />
        {[0, 1, 2, 3].map((i) => (
          <SkeletonRow key={`skel-${i}`} rowHeight={rowHeight} borderColor={rowBorder} />
        ))}
      </View>
    );
  }

  // Empty — flat centered notice, no icon box.
  if (isEmpty || trades.length === 0) {
    return (
      <View style={styles.container}>
        <HeaderRow colors={colors} />
        <View style={styles.emptyBlock}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No trades yet
          </Text>
        </View>
      </View>
    );
  }

  // Normal — most recent first. Parent is expected to pass descending
  // order; we slice defensively to maxRows.
  const visible = trades.slice(0, maxRows);

  return (
    <View style={styles.container}>
      <HeaderRow colors={colors} />
      <ScrollView style={styles.scroll} fadingEdgeLength={24}>
        {visible.map((trade) => (
          <TradeRow
            key={trade.id}
            trade={trade}
            rowHeight={rowHeight}
            borderColor={rowBorder}
          />
        ))}
      </ScrollView>
    </View>
  );
}

/** Column header — "Time | Price | Size" in uppercase label text. */
function HeaderRow({
  colors,
}: {
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <View style={[styles.headerRow, { borderBottomColor: colors.border }]}>
      <Text
        style={[styles.headerCell, styles.headerTime, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        Time
      </Text>
      <Text
        style={[styles.headerCell, styles.headerPrice, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        Price
      </Text>
      <Text
        style={[styles.headerCell, styles.headerSize, { color: colors.textMuted }]}
        numberOfLines={1}
      >
        Size
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Flat on canvas — no card chrome, no border, no padding around the
    // list. The parent surface provides the surrounding container.
  },
  scroll: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    paddingHorizontal: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCell: {
    fontSize: TypographyV2.label.size,
    fontFamily: TypographyV2.label.fontFamily,
    fontWeight: TypographyV2.label.weight,
    letterSpacing: TypographyV2.label.letterSpacing,
    textTransform: 'uppercase',
  },
  headerTime: {
    width: 60,
    textAlign: 'left',
  },
  headerPrice: {
    flex: 1,
    textAlign: 'center',
  },
  headerSize: {
    width: 80,
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cellTime: {
    width: 60,
    textAlign: 'left',
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontWeight: TypographyV2.meta.weight,
    letterSpacing: TypographyV2.meta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  cellPrice: {
    flex: 1,
    textAlign: 'center',
    fontSize: TypographyV2.numericMeta.size,
    fontFamily: TypographyV2.numericMeta.fontFamily,
    fontWeight: TypographyV2.numericMeta.weight,
    letterSpacing: TypographyV2.numericMeta.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  cellUnits: {
    width: 80,
    textAlign: 'right',
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    fontWeight: TypographyV2.body.weight,
    letterSpacing: TypographyV2.body.letterSpacing,
    fontVariant: ['tabular-nums'],
  },
  emptyBlock: {
    paddingVertical: Space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    fontWeight: TypographyV2.body.weight,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  statusBlock: {
    paddingVertical: Space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  statusText: {
    fontSize: TypographyV2.body.size,
    fontFamily: TypographyV2.body.fontFamily,
    fontWeight: TypographyV2.body.weight,
    letterSpacing: TypographyV2.body.letterSpacing,
  },
  retryText: {
    fontSize: TypographyV2.meta.size,
    fontFamily: TypographyV2.meta.fontFamily,
    fontWeight: TypographyV2.meta.weight,
    letterSpacing: TypographyV2.meta.letterSpacing,
    textTransform: 'uppercase',
  },
  // Skeleton bars — fixed widths within the columns.
  skelBar: {
    height: 10,
    borderRadius: 4,
    opacity: 0.35,
  },
  skelTime: {
    width: 48,
  },
  skelPrice: {
    width: 64,
    marginHorizontal: Space.xs,
    alignSelf: 'center',
  },
  skelUnits: {
    width: 44,
    alignSelf: 'flex-end',
  },
});

export default CoOwnTimeAndSales;
