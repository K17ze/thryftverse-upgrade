import React from 'react';
import { View, StyleSheet, useWindowDimensions, DimensionValue } from 'react-native';
import { useAppTheme } from '../../theme/ThemeContext';
import { Space, Radius, ExchangeLayout } from '../../theme/designTokens';

// ── Shared shimmer-free skeleton primitives ──
// Deterministic, layout-matching placeholders. No random values.
// Resemble the final layout shape so the loading → populated transition is smooth.

function SkeletonBlock({ width, height, radius = Radius.md }: { width: DimensionValue; height: number; radius?: number }) {
  const { colors } = useAppTheme();
  return <View style={{ width, height, borderRadius: radius, backgroundColor: colors.surfaceAlt }} />;
}

// ── Hub skeletons ──

export function CoOwnHubSkeleton() {
  const { width } = useWindowDimensions();
  const highlightWidth = Math.round(Math.min(width * 0.86, 380));
  const highlightHeight = Math.round(Math.min(260, Math.max(228, width * 0.63)));

  return (
    <View style={styles.hubSkeleton}>
      <View style={styles.hubHeadingSkeleton}>
        <SkeletonBlock width={120} height={11} radius={Radius.sm} />
        <SkeletonBlock width={70} height={11} radius={Radius.sm} />
      </View>
      <View style={styles.hubHighlightRow}>
        <SkeletonBlock width={highlightWidth} height={highlightHeight} radius={Radius.xl} />
        <SkeletonBlock width={Math.max(16, width - highlightWidth - Space.xl)} height={highlightHeight} radius={Radius.xl} />
      </View>
      <View style={styles.hubIndicatorSkeleton}>
        <SkeletonBlock width={34} height={10} radius={Radius.sm} />
      </View>
      <SkeletonBlock width={width - Space.xl} height={42} radius={Radius.md} />
      <View style={styles.hubTabsSkeleton}>
        {[0, 1, 2, 3].map((index) => <SkeletonBlock key={index} width={64} height={14} radius={Radius.sm} />)}
      </View>
      <View style={styles.hubSectionHeadingSkeleton}>
        <View style={styles.columnGap}>
          <SkeletonBlock width={90} height={10} radius={Radius.sm} />
          <SkeletonBlock width={110} height={24} radius={Radius.sm} />
        </View>
        <SkeletonBlock width={42} height={14} radius={Radius.sm} />
      </View>
      <View style={styles.hubPositionRow}>
        <SkeletonBlock width={280} height={168} radius={Radius.xl} />
        <SkeletonBlock width={Math.max(24, width - 308)} height={168} radius={Radius.xl} />
      </View>
    </View>
  );
}

// ── Asset detail skeleton ──

export function CoOwnAssetDetailSkeleton() {
  const { width, height } = useWindowDimensions();
  const isCompact = width < 390;
  const heroHeight = Math.min(height * (isCompact ? 0.52 : 0.65), width * 1.35);

  return (
    <View style={styles.wrap}>
      <SkeletonBlock width={width} height={heroHeight} radius={0} />
      <View style={styles.contentPad}>
        <SkeletonBlock width="60%" height={28} />
        <View style={styles.itemGap} />
        <SkeletonBlock width="40%" height={22} />
        <View style={styles.itemGap} />
        <SkeletonBlock width="100%" height={80} radius={Radius.lg} />
        <View style={styles.itemGap} />
        <SkeletonBlock width="100%" height={120} radius={Radius.lg} />
        <View style={styles.itemGap} />
        <SkeletonBlock width="100%" height={200} radius={Radius.lg} />
      </View>
    </View>
  );
}

// ── Portfolio skeleton ──

export function CoOwnPortfolioSkeleton() {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const cardWidth = isCompact ? width - Space.md * 2 : (width - Space.md * 3) / 2;
  const cardHeight = isCompact ? cardWidth * 0.7 : cardWidth * 1.3;

  return (
    <View style={styles.wrap}>
      <SkeletonBlock width={width - Space.md * 2} height={100} radius={Radius.lg} />
      <View style={styles.sectionGap} />
      {isCompact ? (
        <View style={styles.columnGap}>
          <SkeletonBlock width={cardWidth} height={cardHeight} radius={Radius.md} />
          <View style={styles.rowGap} />
          <SkeletonBlock width={cardWidth} height={cardHeight} radius={Radius.md} />
        </View>
      ) : (
        <>
          <View style={styles.row}>
            <SkeletonBlock width={cardWidth} height={cardHeight} radius={Radius.md} />
            <SkeletonBlock width={cardWidth} height={cardHeight} radius={Radius.md} />
          </View>
          <View style={styles.rowGap} />
          <View style={styles.row}>
            <SkeletonBlock width={cardWidth} height={cardHeight} radius={Radius.md} />
            <SkeletonBlock width={cardWidth} height={cardHeight} radius={Radius.md} />
          </View>
        </>
      )}
    </View>
  );
}

// ── Activity / ledger skeleton ──

export function CoOwnActivitySkeleton() {
  return (
    <View style={styles.wrap}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.activityRow}>
          <SkeletonBlock width={56} height={56} radius={Radius.md} />
          <View style={styles.activityBody}>
            <SkeletonBlock width="70%" height={16} />
            <View style={styles.itemGap} />
            <SkeletonBlock width="45%" height={14} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Trade skeleton ──

export function CoOwnTradeSkeleton() {
  const { width } = useWindowDimensions();

  return (
    <View style={styles.wrap}>
      <SkeletonBlock width={width - Space.md * 2} height={100} radius={Radius.lg} />
      <View style={styles.sectionGap} />
      <SkeletonBlock width="100%" height={50} radius={Radius.md} />
      <View style={styles.itemGap} />
      <SkeletonBlock width="100%" height={50} radius={Radius.md} />
      <View style={styles.itemGap} />
      <SkeletonBlock width="100%" height={120} radius={Radius.lg} />
    </View>
  );
}

// ── Create studio skeleton ──

export function CoOwnCreateStudioSkeleton() {
  const { width } = useWindowDimensions();
  const isCompact = width < 360;
  const cardWidth = isCompact ? width - Space.md * 2 : (width - Space.md * 3) / 2;
  const cardHeight = isCompact ? cardWidth * 0.7 : cardWidth * 1.2;

  return (
    <View style={styles.wrap}>
      {isCompact ? (
        <View style={styles.columnGap}>
          <SkeletonBlock width={cardWidth} height={cardHeight} radius={Radius.md} />
          <View style={styles.rowGap} />
          <SkeletonBlock width={cardWidth} height={cardHeight} radius={Radius.md} />
        </View>
      ) : (
        <>
          <View style={styles.row}>
            <SkeletonBlock width={cardWidth} height={cardHeight} radius={Radius.md} />
            <SkeletonBlock width={cardWidth} height={cardHeight} radius={Radius.md} />
          </View>
          <View style={styles.rowGap} />
          <View style={styles.row}>
            <SkeletonBlock width={cardWidth} height={cardHeight} radius={Radius.md} />
            <SkeletonBlock width={cardWidth} height={cardHeight} radius={Radius.md} />
          </View>
        </>
      )}
    </View>
  );
}

// ── Leaderboard skeleton ──

export function CoOwnLeaderboardSkeleton() {
  return (
    <View style={styles.wrap}>
      {[0, 1, 2].map((section) => (
        <View key={section} style={styles.leaderboardSection}>
          <SkeletonBlock width="50%" height={20} />
          <View style={styles.itemGap} />
          {[0, 1, 2, 3].map((row) => (
            <View key={row} style={styles.activityRow}>
              <SkeletonBlock width={48} height={48} radius={Radius.md} />
              <View style={styles.activityBody}>
                <SkeletonBlock width="60%" height={14} />
                <View style={styles.itemGap} />
                <SkeletonBlock width="35%" height={12} />
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ── Value strip skeleton (Market/Fundamental/Cash columns) ──
// Matches CoOwnValueStrip final geometry: 3 columns, height = valueStripRowHeight.

export function CoOwnValueStripSkeleton() {
  const { width } = useWindowDimensions();
  const colWidth = (width - Space.md * 2 - Space.sm * 2) / 3;

  return (
    <View style={[styles.wrap, { paddingVertical: Space.sm }]}>
      <View style={styles.row}>
        {[0, 1, 2].map((col) => (
          <View key={col} style={{ width: colWidth, gap: Space.xs }}>
            <SkeletonBlock width="60%" height={11} radius={Radius.sm} />
            <SkeletonBlock width="80%" height={ExchangeLayout.valueStripRowHeight - 16} radius={Radius.sm} />
            <SkeletonBlock width="50%" height={11} radius={Radius.sm} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Order book skeleton ──
// Matches CoOwnOrderBook final geometry: 5 levels per side, deterministic row height.

export function CoOwnOrderBookSkeleton() {
  const { width } = useWindowDimensions();
  const rowH = ExchangeLayout.bookRowHeight;
  const levels = ExchangeLayout.bookVisibleLevels;

  return (
    <View style={[styles.wrap, { paddingVertical: Space.sm }]}>
      {/* Asks (top, descending) */}
      {[...Array(levels)].map((_, i) => (
        <View key={`ask-${i}`} style={{ height: rowH, flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
          <SkeletonBlock width={70} height={14} radius={Radius.sm} />
          <View style={{ flex: 1 }} />
          <SkeletonBlock width={60} height={14} radius={Radius.sm} />
        </View>
      ))}
      {/* Spread row */}
      <View style={{ height: rowH, alignItems: 'center', justifyContent: 'center' }}>
        <SkeletonBlock width={120} height={14} radius={Radius.sm} />
      </View>
      {/* Bids (bottom, descending) */}
      {[...Array(levels)].map((_, i) => (
        <View key={`bid-${i}`} style={{ height: rowH, flexDirection: 'row', alignItems: 'center', gap: Space.sm }}>
          <SkeletonBlock width={70} height={14} radius={Radius.sm} />
          <View style={{ flex: 1 }} />
          <SkeletonBlock width={60} height={14} radius={Radius.sm} />
        </View>
      ))}
    </View>
  );
}

// ── Wallet breakdown skeleton ──
// Matches CoOwnWalletBreakdown final geometry: hero + settled claim rows + pending section.

export function CoOwnWalletBreakdownSkeleton() {
  const { width } = useWindowDimensions();

  return (
    <View style={styles.wrap}>
      {/* Hero: spendable now */}
      <SkeletonBlock width={width - Space.md * 2} height={80} radius={Radius.lg} />
      <View style={styles.sectionGap} />
      {/* Settled claim rows */}
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={[styles.activityRow, { paddingVertical: Space.sm }]}>
          <SkeletonBlock width="40%" height={14} radius={Radius.sm} />
          <View style={{ flex: 1 }} />
          <SkeletonBlock width={80} height={16} radius={Radius.sm} />
        </View>
      ))}
      <View style={styles.sectionGap} />
      {/* Pending section */}
      <SkeletonBlock width="30%" height={12} radius={Radius.sm} />
      <View style={styles.itemGap} />
      {[0, 1].map((i) => (
        <View key={i} style={[styles.activityRow, { paddingVertical: Space.sm }]}>
          <SkeletonBlock width="35%" height={14} radius={Radius.sm} />
          <View style={{ flex: 1 }} />
          <SkeletonBlock width={70} height={16} radius={Radius.sm} />
        </View>
      ))}
    </View>
  );
}

// ── Candle chart skeleton ──
// Matches CoOwnCandleChart final geometry: chart hero min height + range chips.

export function CoOwnCandleChartSkeleton() {
  const { width } = useWindowDimensions();

  return (
    <View style={styles.wrap}>
      {/* Chart area */}
      <SkeletonBlock
        width={width - Space.md * 2}
        height={ExchangeLayout.chartHeroMinHeight}
        radius={Radius.lg}
      />
      <View style={styles.itemGap} />
      {/* Range chips row */}
      <View style={styles.row}>
        {['1D', '1W', '1M', '3M', '1Y', 'ALL'].map((label) => (
          <SkeletonBlock key={label} width={40} height={28} radius={Radius.full} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hubSkeleton: {
    paddingTop: Space.sm,
    alignItems: 'center',
    gap: Space.sm,
    overflow: 'hidden',
  },
  hubHeadingSkeleton: {
    width: '100%',
    minHeight: 28,
    paddingHorizontal: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hubHighlightRow: {
    width: '100%',
    paddingLeft: Space.md,
    flexDirection: 'row',
    gap: 12,
  },
  hubIndicatorSkeleton: {
    width: '100%',
    minHeight: 28,
    paddingHorizontal: Space.md,
    justifyContent: 'center',
  },
  hubTabsSkeleton: {
    width: '100%',
    minHeight: 50,
    paddingHorizontal: Space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hubSectionHeadingSkeleton: {
    width: '100%',
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  hubPositionRow: {
    width: '100%',
    paddingLeft: Space.md,
    flexDirection: 'row',
    gap: 12,
  },
  wrap: {
    paddingHorizontal: Space.md,
    paddingTop: Space.md,
  },
  row: {
    flexDirection: 'row',
    gap: Space.md,
  },
  rowGap: {
    height: Space.md,
  },
  columnGap: {
    gap: Space.md,
  },
  sectionGap: {
    height: Space.lg,
  },
  itemGap: {
    height: Space.sm,
  },
  contentPad: {
    padding: Space.md,
    gap: Space.md,
  },
  activityRow: {
    flexDirection: 'row',
    gap: Space.md,
    paddingVertical: Space.sm,
  },
  activityBody: {
    flex: 1,
    justifyContent: 'center',
  },
  leaderboardSection: {
    marginBottom: Space.lg,
  },
});
