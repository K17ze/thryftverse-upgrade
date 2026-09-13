/**
 * liveSellerUtils — pure display helpers for the seller broadcast surface.
 * These are the seller-side mappings (light theme palette, plain labels);
 * the viewer-side equivalents live in livestreamUtils.ts with different
 * signatures and scrim colours — intentionally not shared.
 */

import type { ThemeColors } from '../../theme/ThemeContext';
import type { LotStatus, LotSettlementStatus } from '../../services/liveShoppingApi';

export function lotStatusLabel(status: LotStatus): string {
  switch (status) {
    case 'scheduled': return 'Scheduled';
    case 'open': return 'Open for bidding';
    case 'closing': return 'Closing soon';
    case 'sold': return 'Sold';
    case 'passed': return 'Passed';
    case 'cancelled': return 'Cancelled';
  }
}

export function lotStatusColor(status: LotStatus, colors: ThemeColors): string {
  switch (status) {
    case 'open':
    case 'sold':
      return colors.success;
    case 'closing':
      return colors.warning;
    case 'scheduled':
      return colors.textSecondary;
    default:
      return colors.textMuted;
  }
}

export function settlementLabel(status: LotSettlementStatus | null): string | null {
  switch (status) {
    case 'settling': return 'Settling…';
    case 'order_created': return 'Order created';
    case 'payment_reserved': return 'Payment pending';
    case 'payment_failed': return 'Payment failed';
    case 'completed': return 'Completed';
    default: return null;
  }
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
