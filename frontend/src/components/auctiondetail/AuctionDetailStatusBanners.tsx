import React from 'react';
import { useConnectivity } from '../../hooks/useConnectivity';
import { CommerceDetailOfflineBanner, CommerceDetailFreshnessBanner } from '../commerce/detail';
import { AuctionCountdownBar } from '../auction/AuctionCountdownBar';
import { AuctionPostEndBanners } from '../auction/AuctionPostEndBanners';

interface Props {
  // Countdown bar
  isLive: boolean;
  liveMsToEnd: number;
  isUpcoming: boolean;
  liveMsToStart: number;
  // Freshness
  isTransitionRefreshing: boolean;
  refreshing: boolean;
  needsResync: boolean;
  resyncFailed: boolean;
  onRetry: () => void;
  // Post-end lifecycle banners
  isReserveNotMet: boolean;
  isAwaitingPayment: boolean;
  isPaymentExpired: boolean;
  isSecondChanceOffered: boolean;
  isSeller: boolean;
  viewerState: string;
  isSecondChanceRecipient: boolean;
  paymentDeadlineCountdown: { text: string; isExpired: boolean } | null;
}

/**
 * Status strip between the media stage and the transaction surface:
 * prominent countdown bar, offline banner, freshness indicator and
 * post-end lifecycle banners.
 *
 * - Countdown bar: red when < 1 hour remaining (urgency). Shows the
 *   server-authoritative countdown so the user always knows the time
 *   state without scrolling.
 * - Offline banner: per spec 05 §14 the offline state must be designed,
 *   not a blank screen. Cached auction data may still be visible.
 * - Freshness: surfaces stale, reconnecting and refresh-failed states so
 *   the user never sees a live countdown that is silently disconnected.
 *   R02: realtime screens expose freshness, not just data.
 * - Post-end banners: flat, restrained bars. One icon + one line of
 *   truthful copy. No decorative chrome.
 */
export function AuctionDetailStatusBanners({
  isLive,
  liveMsToEnd,
  isUpcoming,
  liveMsToStart,
  isTransitionRefreshing,
  refreshing,
  needsResync,
  resyncFailed,
  onRetry,
  isReserveNotMet,
  isAwaitingPayment,
  isPaymentExpired,
  isSecondChanceOffered,
  isSeller,
  viewerState,
  isSecondChanceRecipient,
  paymentDeadlineCountdown,
}: Props) {
  const { isOffline } = useConnectivity();

  return (
    <>
      <AuctionCountdownBar
        isLive={isLive}
        liveMsToEnd={liveMsToEnd}
        isUpcoming={isUpcoming}
        liveMsToStart={liveMsToStart}
      />
      <CommerceDetailOfflineBanner isOffline={isOffline} />
      <CommerceDetailFreshnessBanner
        isRefreshing={isTransitionRefreshing || refreshing}
        isStale={needsResync && !isTransitionRefreshing}
        refreshFailed={resyncFailed}
        onRetry={onRetry}
      />
      <AuctionPostEndBanners
        isReserveNotMet={isReserveNotMet}
        isAwaitingPayment={isAwaitingPayment}
        isPaymentExpired={isPaymentExpired}
        isSecondChanceOffered={isSecondChanceOffered}
        isSeller={isSeller}
        viewerState={viewerState}
        isSecondChanceRecipient={isSecondChanceRecipient}
        paymentDeadlineCountdown={paymentDeadlineCountdown}
      />
    </>
  );
}
