/**
 * Demand view-model — pure derivations for the seller verification-demand
 * surfaces. Ports the label/guidance/status maps from the mobile
 * SellerVerificationScreen + VerificationResponseScreen so copy stays
 * identical across clients. No React, no storage.
 */

import type { AppIconName } from '@/components/ui/Icon';
import type {
  SellerVerificationDemand,
  VerificationDemandStatus,
  VerificationDemandType,
} from '@/lib/contracts/verification';

export const DEMAND_TYPE_LABELS: Record<VerificationDemandType, string> = {
  authenticity: 'Authenticity proof',
  possession: 'Possession proof',
  condition: 'Condition report',
  inspection: 'In-person inspection',
};

/** Per-type evidence guidance — verbatim port of mobile DEMAND_TYPE_GUIDANCE. */
export const DEMAND_TYPE_GUIDANCE: Record<VerificationDemandType, string> = {
  authenticity:
    'Provide photos showing authenticity markers, serial numbers, certificates of authenticity, receipts, or brand verification documentation.',
  possession:
    "Provide a photo or video of the item in your possession, ideally with a visible timestamp or today's newspaper to prove current custody.",
  condition:
    'Provide detailed photos of the item from multiple angles, showing the current condition including any wear, tags, labels, and packaging.',
  inspection:
    'The buyer has requested an in-person inspection. Provide proposed dates/times for inspection, or photos/videos if remote inspection is acceptable.',
};

export function demandTypeLabel(type: VerificationDemandType): string {
  return DEMAND_TYPE_LABELS[type] ?? type;
}

export function demandTypeIcon(type: VerificationDemandType): AppIconName {
  return type === 'inspection' ? 'eye' : 'document';
}

// ── Status presentation ─────────────────────────────────────────────────────

export interface DemandStatusMeta {
  label: string;
  /** Badge variant mapping — pending warns, responded brands, etc. */
  badge: 'warning' | 'brand' | 'success' | 'danger' | 'neutral';
  icon: AppIconName;
}

export function demandStatusMeta(status: VerificationDemandStatus): DemandStatusMeta {
  switch (status) {
    case 'pending':
      return { label: 'Pending', badge: 'warning', icon: 'clock' };
    case 'responded':
      return { label: 'Responded', badge: 'brand', icon: 'document' };
    case 'compliant':
      return { label: 'Compliant', badge: 'success', icon: 'check' };
    case 'failed':
      return { label: 'Failed', badge: 'danger', icon: 'closeCircle' };
    case 'expired':
      return { label: 'Expired', badge: 'neutral', icon: 'clock' };
    case 'withdrawn':
      return { label: 'Withdrawn', badge: 'neutral', icon: 'remove' };
  }
}

// ── Deadline derivations ────────────────────────────────────────────────────

export function demandDaysLeft(demand: SellerVerificationDemand, now = Date.now()): number {
  return Math.ceil((new Date(demand.deadline).getTime() - now) / 86_400_000);
}

/** A pending demand past its deadline — the only "overdue" that exists. */
export function isDemandOverdue(demand: SellerVerificationDemand, now = Date.now()): boolean {
  return demand.status === 'pending' && new Date(demand.deadline).getTime() < now;
}

/** The trailing deadline line on an inbox row — mirrors the mobile copy. */
export function demandDeadlineText(demand: SellerVerificationDemand, now = Date.now()): string {
  if (demand.status === 'pending') {
    if (isDemandOverdue(demand, now)) return 'Recourse may be triggered';
    const days = demandDaysLeft(demand, now);
    if (days <= 0) return 'Due today';
    if (days === 1) return '1 day left';
    return `${days} days left`;
  }
  if (demand.status === 'responded' && demand.respondedAt) {
    return `Responded ${new Date(demand.respondedAt).toLocaleDateString('en-GB', {
      month: 'short',
      day: 'numeric',
    })}`;
  }
  if (demand.status === 'compliant') return 'Verified';
  if (demand.status === 'failed') return 'Recourse triggered';
  return '';
}

/** Badge label override — a pending+overdue demand reads "Overdue". */
export function demandBadgeLabel(demand: SellerVerificationDemand, now = Date.now()): string {
  return isDemandOverdue(demand, now) ? 'Overdue' : demandStatusMeta(demand.status).label;
}

// ── Evidence constraints (VerificationResponseScreen parity) ────────────────

export const MAX_EVIDENCE_PHOTOS = 6;
export const MAX_EVIDENCE_NOTES = 2000;

export interface DemandEvidence {
  id: string;
  /** Preview URL — object URL in fixture mode, uploaded URL in live mode. */
  uri: string;
  /** Canonical URL submitted with the response once the upload resolves. */
  uploadedUrl: string | null;
  /** True while the live-mode upload is in flight. */
  uploading: boolean;
}
