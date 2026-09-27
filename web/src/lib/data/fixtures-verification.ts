/**
 * Verification fixtures — the seller verification-demand dataset backing
 * /verification/demands in fixture mode. Demands target Co-Own assets the
 * demo identity issued, so imagery reuses the co-own dataset. The array is
 * the fixture write-store: responding to a demand mutates it in place, the
 * same pattern fixtures-commerce uses for order transitions — a reload
 * re-seeds, honest fixture behaviour.
 *
 * Deadlines are computed relative to load time so the pending/overdue
 * states stay meaningful whenever the demo runs.
 */

import type {
  SellerVerificationDemand,
  VerificationDemandStatus,
} from '@/lib/contracts/verification';
import { CO_OWN_ASSETS } from './fixtures-coown';

const DAY_MS = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString();

const asset = (index: number) => CO_OWN_ASSETS[index] ?? CO_OWN_ASSETS[0];

export const SELLER_VERIFICATION_DEMANDS: SellerVerificationDemand[] = [
  {
    id: 9001,
    assetId: asset(0).id,
    assetTitle: asset(0).title,
    assetImageUrl: asset(0).imageUrl,
    requestedBy: 'u3',
    demandType: 'authenticity',
    deadline: iso(3),
    status: 'pending',
    respondedAt: null,
    evidenceUrl: null,
    evidenceNotes: null,
    inspectorVerdict: null,
    createdAt: iso(-4),
  },
  {
    id: 9002,
    assetId: asset(2).id,
    assetTitle: asset(2).title,
    assetImageUrl: asset(2).imageUrl,
    requestedBy: 'u5',
    demandType: 'possession',
    deadline: iso(-1),
    status: 'pending',
    respondedAt: null,
    evidenceUrl: null,
    evidenceNotes: null,
    inspectorVerdict: null,
    createdAt: iso(-13),
  },
  {
    id: 9003,
    assetId: asset(4).id,
    assetTitle: asset(4).title,
    assetImageUrl: asset(4).imageUrl,
    requestedBy: 'u6',
    demandType: 'condition',
    deadline: iso(9),
    status: 'responded',
    respondedAt: iso(-2),
    evidenceUrl: asset(4).imageUrl,
    evidenceNotes: 'Full photo set from all angles — corners, hardware, lining.',
    inspectorVerdict: null,
    createdAt: iso(-7),
  },
  {
    id: 9004,
    assetId: asset(1).id,
    assetTitle: asset(1).title,
    assetImageUrl: asset(1).imageUrl,
    requestedBy: 'u2',
    demandType: 'authenticity',
    deadline: iso(-12),
    status: 'compliant',
    respondedAt: iso(-16),
    evidenceUrl: asset(1).imageUrl,
    evidenceNotes: 'Entrupy certificate plus original receipt photos.',
    inspectorVerdict: 'compliant',
    createdAt: iso(-24),
  },
  {
    id: 9005,
    assetId: asset(6).id,
    assetTitle: asset(6).title,
    assetImageUrl: asset(6).imageUrl,
    requestedBy: 'u4',
    demandType: 'inspection',
    deadline: iso(-20),
    status: 'failed',
    respondedAt: iso(-24),
    evidenceUrl: asset(6).imageUrl,
    evidenceNotes: 'Proposed three inspection dates; remote photo set attached.',
    inspectorVerdict: 'failed',
    createdAt: iso(-31),
  },
  {
    id: 9006,
    assetId: asset(3).id,
    assetTitle: asset(3).title,
    assetImageUrl: asset(3).imageUrl,
    requestedBy: 'u7',
    demandType: 'condition',
    deadline: iso(-30),
    status: 'expired',
    respondedAt: null,
    evidenceUrl: null,
    evidenceNotes: null,
    inspectorVerdict: 'inconclusive',
    createdAt: iso(-44),
  },
];

export function demandById(id: number): SellerVerificationDemand | null {
  return SELLER_VERIFICATION_DEMANDS.find((d) => d.id === id) ?? null;
}

/** Count of demands awaiting the seller — what /verification badges with. */
export function pendingDemandCount(): number {
  return SELLER_VERIFICATION_DEMANDS.filter((d) => d.status === 'pending').length;
}

/**
 * Fixture-mode respond write — the same transition the backend applies:
 * pending → responded with evidence recorded. Throws on a demand that
 * isn't pending so the UI never shows a transition the rules reject.
 */
export function respondToFixtureDemand(
  demandId: number,
  evidenceUrl: string,
  evidenceNotes?: string,
): SellerVerificationDemand {
  const demand = demandById(demandId);
  if (!demand) throw new Error('Verification request not found');
  if (demand.status !== 'pending') {
    throw new Error('This verification request is no longer pending');
  }
  demand.status = 'responded' as VerificationDemandStatus;
  demand.respondedAt = new Date().toISOString();
  demand.evidenceUrl = evidenceUrl;
  demand.evidenceNotes = evidenceNotes?.trim() ? evidenceNotes.trim() : null;
  return demand;
}
