import type { CommerceOrder } from '../../services/commerceApi';
import type { DispatchExtension, FulfilmentSnapshot } from '../orders/orderCapabilities';

/**
 * Pure view-model derivations for SellerFulfilmentScreen.
 *
 * Ship-by deadline is server truth only — no client-invented fallback.
 * If the server hasn't provided a deadline we return null and the UI
 * shows "Deadline unavailable" rather than inventing one.
 */

// Carriers offered only for MANUAL shipping (when the buyer did NOT purchase
// an integrated service). For integrated purchases, the buyer-selected
// service is shown and the picker is suppressed.
export const MANUAL_CARRIERS = [
  'Royal Mail',
  'DPD',
  'Evri',
  'Yodel',
  'UPS',
  'DHL',
  'FedEx',
];

export function formatShipByDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * Ship-by deadline is server truth only.
 * No client-invented fallback. If the server hasn't provided a deadline,
 * we return null and show "Deadline unavailable" rather than inventing one.
 */
export function getShipByDate(order: CommerceOrder): string | null {
  if (order.shipByDate) return order.shipByDate;
  const snap = order.fulfilmentSnapshot;
  if (snap?.shipByDate) return snap.shipByDate;
  return null;
}

/** Human-readable ETA window, e.g. "2–3 days" — requires both bounds. */
export function formatEtaWindow(snapshot: FulfilmentSnapshot | null): string | null {
  if (snapshot?.etaMinDays == null || snapshot?.etaMaxDays == null) return null;
  return snapshot.etaMinDays !== snapshot.etaMaxDays
    ? `${snapshot.etaMinDays}–${snapshot.etaMaxDays} days`
    : `${snapshot.etaMinDays} day${snapshot.etaMinDays === 1 ? '' : 's'}`;
}

/** The single "Ship by …" line in the item header, urgency copy included. */
export function formatShipByLine(
  shipByLabel: string | null,
  shipByDaysLeft: number | null,
  shipByOverdue: boolean,
): string {
  if (!shipByLabel) return 'Dispatch deadline unavailable';
  if (shipByOverdue) return `Past deadline · ${shipByLabel}`;
  const daysLeftSuffix = shipByDaysLeft != null && shipByDaysLeft >= 0
    ? ` · ${shipByDaysLeft === 0 ? 'today' : `${shipByDaysLeft} day${shipByDaysLeft === 1 ? '' : 's'} left`}`
    : '';
  return `Ship by ${shipByLabel}${daysLeftSuffix}`;
}

/** The order payload only surfaces the latest PENDING extension. */
export function getPendingExtension(order: CommerceOrder | null): DispatchExtension | null {
  return order?.dispatchExtension?.status === 'pending'
    ? order.dispatchExtension
    : null;
}

/**
 * Escrow footnote: quiet, single line, only when the server provides an
 * evidenced estimatedReleaseAt. No invented countdown, no decorative
 * panel, no "safely held" narrative.
 */
export function buildEscrowFootnote(
  normalisedStatus: string,
  order: CommerceOrder,
): string | null {
  const isHeld =
    normalisedStatus === 'paid' ||
    normalisedStatus === 'shipped' ||
    normalisedStatus === 'in transit' ||
    normalisedStatus === 'out for delivery';
  if (!isHeld) return null;
  const releaseAt = order.moneyProjection?.estimatedReleaseAt;
  const releaseTime = releaseAt ? new Date(releaseAt).getTime() : null;
  if (!releaseTime || Number.isNaN(releaseTime)) return null;
  const daysLeft = Math.ceil((releaseTime - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysLeft == null || daysLeft <= 0) return null;
  return `Funds held in escrow · Auto-releases in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
}
