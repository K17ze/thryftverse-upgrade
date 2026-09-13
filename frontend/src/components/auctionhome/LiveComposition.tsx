import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useAppTheme, type ThemeColors } from '../../theme/ThemeContext';
import { Space } from '../../theme/designTokens';
import { AuctionRunwayCard, AuctionSupportingTile } from '../auction';
import { AuctionGridItem } from './AuctionGridItem';
import { resolveAuctionTiming } from '../../hooks/useServerClock';
import {
  resolveTimeLabel,
  resolveUrgency,
  formatFinalMinutesCountdown,
  type AuctionHomeItem } from '../../utils/auctionHomeLogic';
import type { AuctionHomeLayout, FormatValueLockup } from '../../hooks/auctionhome';

/**
 * Live scope editorial composition: featured runway card + supporting
 * tiles + continuation grid. No duplicate horizontal rail — one
 * composition per viewport. Shape adapts to item count and viewport width.
 */
export function LiveComposition({
  items,
  secondClock,
  formatValueLockup,
  onPressItem,
  layout }: {
  items: AuctionHomeItem[];
  secondClock: number;
  formatValueLockup: FormatValueLockup;
  onPressItem: (auctionId: string) => void;
  layout: AuctionHomeLayout;
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { fullWidth, gridCardWidth, isSmallWidth, featuredWidth, supportingColumnWidth } = layout;

  const renderFeatured = (featured: AuctionHomeItem, cardWidth: number, imageHeight: number) => {
    const featuredTiming = resolveAuctionTiming(featured, secondClock);
    const featuredUrgency = resolveUrgency(featuredTiming);
    const featuredValue = formatValueLockup(featured.currentBidGbp || featured.startingBidGbp);
    const featuredTime = featuredUrgency === 'finalMinutes'
      ? formatFinalMinutesCountdown(featuredTiming.msToEnd)
      : resolveTimeLabel(featuredTiming);
    const featuredPersonalAction = featured.viewerState === 'outbid' ? 'Bid again'
      : featured.viewerState === 'won' ? 'View result'
      : null;
    return (
      <AuctionRunwayCard
        title={featured.title}
        imageUrl={featured.imageUrl || null}
        brand={featured.brand ?? null}
        izeText={featuredValue.izeText}
        localText={featuredValue.localText}
        valueState="current"
        bidCount={featured.bidCount}
        countdownText={featuredTime}
        urgent={featuredUrgency === 'finalMinutes' || featuredUrgency === 'endingSoon'}
        state="live"
        viewerState={featured.viewerState}
        onPress={() => onPressItem(featured.id)}
        cardWidth={cardWidth}
        imageHeight={imageHeight}
        metadataBelow
        personalActionLabel={featuredPersonalAction}
        onPersonalAction={featuredPersonalAction ? () => onPressItem(featured.id) : undefined}
      />
    );
  };

  // ── Editorial composition: featured + supporting + continuation grid ──
  if (items.length >= 3 && !isSmallWidth) {
    const [featured, ...rest] = items;
    const supporting = rest.slice(0, 2);
    const continuation = rest.slice(2);
    return (
      <View style={styles.compositionWrap}>
        <View style={styles.asymmetricRow}>
          {renderFeatured(featured, featuredWidth, 300)}
          <View style={[styles.supportingColumn, { width: supportingColumnWidth }]}>
            {supporting.map((item) => {
              const timing = resolveAuctionTiming(item, secondClock);
              const urgency = resolveUrgency(timing);
              const valueLockup = formatValueLockup(item.currentBidGbp || item.startingBidGbp);
              const timeLabel = urgency === 'finalMinutes'
                ? formatFinalMinutesCountdown(timing.msToEnd)
                : resolveTimeLabel(timing);
              return (
                <AuctionSupportingTile
                  key={item.id}
                  title={item.title}
                  imageUrl={item.imageUrl || null}
                  brand={item.brand}
                  izeText={valueLockup.izeText}
                  localText={valueLockup.localText}
                  valueState="current"
                  timeText={timeLabel}
                  state="live"
                  viewerState={item.viewerState}
                  onPress={() => onPressItem(item.id)}
                />
              );
            })}
          </View>
        </View>
        {continuation.length > 0 && (
          <View style={styles.continuationGrid}>
            {continuation.map((item) => (
              <AuctionGridItem
                key={item.id}
                item={item}
                secondClock={secondClock}
                formatValueLockup={formatValueLockup}
                onPress={onPressItem}
                cardWidth={gridCardWidth}
                liveScope
              />
            ))}
          </View>
        )}
      </View>
    );
  }

  // Small width or <3 items: featured wide + supporting row
  if (items.length >= 3 && isSmallWidth) {
    const [featured, ...rest] = items;
    const supporting = rest.slice(0, 2);
    const continuation = rest.slice(2);
    return (
      <View style={styles.compositionWrap}>
        {renderFeatured(featured, fullWidth, 260)}
        <View style={styles.supportingRow}>
          {supporting.map((item, supportIdx) => (
            <AuctionGridItem
              key={item.id}
              item={item}
              secondClock={secondClock}
              formatValueLockup={formatValueLockup}
              onPress={onPressItem}
              cardWidth={gridCardWidth}
              testID={supportIdx === 0 ? 'golden-auction-first-card' : undefined}
              liveScope
            />
          ))}
        </View>
        {continuation.length > 0 && (
          <View style={styles.continuationGrid}>
            {continuation.map((item) => (
              <AuctionGridItem
                key={item.id}
                item={item}
                secondClock={secondClock}
                formatValueLockup={formatValueLockup}
                onPress={onPressItem}
                cardWidth={gridCardWidth}
                liveScope
              />
            ))}
          </View>
        )}
      </View>
    );
  }

  // 2 items: balanced editorial columns
  if (items.length === 2) {
    return (
      <View style={styles.compositionWrap}>
        <View style={styles.continuationGrid}>
          {items.map((item) => (
            <AuctionGridItem
              key={item.id}
              item={item}
              secondClock={secondClock}
              formatValueLockup={formatValueLockup}
              onPress={onPressItem}
              cardWidth={gridCardWidth}
              liveScope
            />
          ))}
        </View>
      </View>
    );
  }

  // 1 item: feature
  const featured = items[0];
  return (
    <View style={styles.compositionWrap}>
      {renderFeatured(featured, fullWidth, 280)}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    compositionWrap: {
      paddingHorizontal: Space.md,
      marginTop: Space.xl },
    asymmetricRow: {
      flexDirection: 'row',
      gap: Space.sm,
      alignItems: 'stretch' },
    supportingColumn: {
      gap: Space.sm,
      flex: 1 },
    supportingRow: {
      flexDirection: 'row',
      gap: Space.sm,
      marginTop: Space.sm },
    continuationGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: Space.sm,
      marginTop: Space.sm } });
}
