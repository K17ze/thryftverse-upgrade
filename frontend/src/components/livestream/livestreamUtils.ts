/**
 * livestreamUtils — pure display helpers for the live stream viewer
 * surface. Shared by the lot dock, sheets and stage caption so the mapping
 * rules live in exactly one place.
 */

import type { ThemeColors } from '../../theme/ThemeContext';
import type { LiveKitConnectionState } from '../../platform/streaming/useLiveKitRoom';
import type { LiveLot, LotStatus } from '../../services/liveShoppingApi';

export type LiveStreamTranslate = (key: string, options?: Record<string, unknown>) => string;

export function lotStatusLabel(status: LotStatus, currentPrice: number, t: LiveStreamTranslate): string {
  switch (status) {
    case 'scheduled':
      return t('lotStatus.comingUp');
    case 'open':
      return t('lotStatus.openForBidding');
    case 'closing':
      return t('lotStatus.closingSoon');
    case 'sold':
      return t('lotStatus.sold', { price: currentPrice });
    case 'passed':
      return t('lotStatus.passed');
    case 'cancelled':
      return t('lotStatus.cancelled');
  }
}

export function lotStatusColor(status: LotStatus, colors: ThemeColors): string {
  switch (status) {
    case 'open':
    case 'sold':
      return colors.scrimDeltaPositive;
    case 'closing':
      return colors.warning;
    default:
      return colors.scrimTextSecondary;
  }
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatViewerCount(count: number): string | number {
  return count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count;
}

/** Maps the realtime lot status onto the viewer-facing LotStatus enum. */
export function deriveLotStatus(currentLot: LiveLot | null): LotStatus | null {
  if (!currentLot) return null;
  if (currentLot.status === 'upcoming') return 'scheduled';
  if (currentLot.status === 'active') {
    if (currentLot.timeRemaining != null && currentLot.timeRemaining <= 10) return 'closing';
    return 'open';
  }
  if (currentLot.status === 'sold') return 'sold';
  if (currentLot.status === 'passed') return 'passed';
  return null;
}

/** Quick-bid ladder shown in the bid sheet — fixed increments over the
 *  current price. */
export function suggestedBidAmounts(base: number): number[] {
  return [base + 1, base + 5, base + 10, base + 20];
}

/** True only for the winning viewer of a sold lot — the contract exposes no
 *  winner flag, so 'You' is the marker the realtime payload uses. */
export function isWinningViewer(currentLot: LiveLot | null): boolean {
  return currentLot?.status === 'sold' && currentLot?.currentHighBidder === 'You';
}

/** Stage caption — honest about what the LiveKit room is doing. Null when
 *  video is playing or when the session simply carries no credentials (the
 *  stage then degrades without a message). */
export function resolveStageCaption(args: {
  hasVideoCredentials: boolean;
  roomState: LiveKitConnectionState;
  hasRemoteVideo: boolean;
  t: LiveStreamTranslate;
}): string | null {
  const { hasVideoCredentials, roomState, hasRemoteVideo, t } = args;
  if (!hasVideoCredentials) return null;
  if (roomState === 'connecting' || roomState === 'reconnecting') {
    return t('video.connecting');
  }
  if (roomState === 'error') return 'Video unavailable';
  if (roomState === 'connected' && !hasRemoteVideo) return 'Waiting for host video…';
  return null;
}
