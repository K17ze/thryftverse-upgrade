import React from 'react';
import { AuctionGridCard } from '../auction';
import { resolveAuctionTiming } from '../../hooks/useServerClock';
import {
  resolvePriceLabel,
  resolveTimeLabel,
  resolveUrgency,
  formatFinalMinutesCountdown,
  type AuctionHomeItem } from '../../utils/auctionHomeLogic';
import type { FormatValueLockup } from '../../hooks/auctionhome';

/**
 * Shared auction grid card for the home surface — resolves timing, urgency
 * and the 1ZE/local value lockup once so search results, browse results,
 * the watching grid, the explore feed and the live continuation grid all
 * render the identical card treatment.
 *
 * `liveScope` forces the known-live presentation (`state="live"`,
 * `valueState="current"`) used inside the Live composition, where every
 * card is already scoped to live auctions.
 */
export function AuctionGridItem({
  item,
  secondClock,
  formatValueLockup,
  onPress,
  cardWidth,
  testID,
  liveScope }: {
  item: AuctionHomeItem;
  secondClock: number;
  formatValueLockup: FormatValueLockup;
  onPress: (auctionId: string) => void;
  cardWidth?: number;
  testID?: string;
  liveScope?: boolean;
}) {
  const timing = resolveAuctionTiming(item, secondClock);
  const urgency = resolveUrgency(timing);
  const valueLockup = formatValueLockup(item.currentBidGbp || item.startingBidGbp);
  const timeLabel = urgency === 'finalMinutes'
    ? formatFinalMinutesCountdown(timing.msToEnd)
    : resolveTimeLabel(timing);
  const effectiveState = liveScope
    ? 'live'
    : timing.effectiveState === 'live' ? 'live' : timing.effectiveState === 'upcoming' ? 'upcoming' : 'ended';
  const valueState = liveScope
    ? 'current'
    : effectiveState === 'ended' ? 'final' : effectiveState === 'upcoming' ? 'starting' : 'current';
  return (
    <AuctionGridCard
      title={item.title}
      imageUrl={item.imageUrl || null}
      brand={item.brand ?? null}
      izeText={valueLockup.izeText}
      localText={valueLockup.localText}
      valueState={valueState}
      priceLabel={resolvePriceLabel(item, timing)}
      bidCount={item.bidCount}
      countdownText={timeLabel}
      urgent={urgency === 'finalMinutes' || urgency === 'endingSoon'}
      state={effectiveState}
      viewerState={item.viewerState}
      onPress={() => onPress(item.id)}
      cardWidth={cardWidth}
      testID={testID}
    />
  );
}
