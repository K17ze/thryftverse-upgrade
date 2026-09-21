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
      return colors.warningText;
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

/** Quick-bid ladder shown in the bid sheet. Suggestions must satisfy the
 *  lot's min_increment — a rung below it would be rejected server-side.
 *  Falls back to the fixed ladder when the lot carries no increment. */
export function suggestedBidAmounts(base: number, minIncrementMinor?: number | null): number[] {
  const inc = minIncrementMinor != null && minIncrementMinor > 0
    ? minIncrementMinor / 100
    : null;
  if (inc == null) {
    return [base + 1, base + 5, base + 10, base + 20];
  }
  const ladder = [inc, inc * 2, inc * 5, inc * 10].map((delta) => base + delta);
  // Round to 2dp to avoid float noise in minor-unit arithmetic.
  return [...new Set(ladder.map((v) => Math.round(v * 100) / 100))];
}

/** True only for the winning viewer of a sold lot. The real contract
 *  carries `winnerId` (the winner's user id) on `lot.sold`; 'You' is the
 *  demo-path marker kept for mock sessions. */
export function isWinningViewer(currentLot: LiveLot | null, viewerUserId?: string | null): boolean {
  if (currentLot?.status !== 'sold') return false;
  if (currentLot.winnerId) {
    return currentLot.winnerId === viewerUserId || currentLot.winnerId === 'me';
  }
  return currentLot.currentHighBidder === 'You';
}

/** Stage caption — honest about what the live feed is doing. The session
 *  resnapshot state wins: while the realtime transport recovers, bids, chat
 *  and the lot are stale regardless of whether video still plays. Null when
 *  video is playing or when the session simply carries no credentials (the
 *  stage then degrades without a message). */
export function resolveStageCaption(args: {
  hasVideoCredentials: boolean;
  roomState: LiveKitConnectionState;
  hasRemoteVideo: boolean;
  /** True while the session's realtime feed is reconnecting or
   *  resnapshotting — the data on stage is stale until it clears. */
  sessionReconnecting?: boolean;
  t: LiveStreamTranslate;
}): string | null {
  const { hasVideoCredentials, roomState, hasRemoteVideo, sessionReconnecting, t } = args;
  if (sessionReconnecting) return t('session.reconnecting');
  if (!hasVideoCredentials) return null;
  if (roomState === 'connecting' || roomState === 'reconnecting') {
    return t('video.connecting');
  }
  if (roomState === 'error') return 'Video unavailable';
  if (roomState === 'connected' && !hasRemoteVideo) return 'Waiting for host video…';
  return null;
}
