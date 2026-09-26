/**
 * orderAuthenticationPresentation — 1:1 port of the mobile presentation
 * mapper. Maps the backend pipeline status to display copy; every state the
 * API can return has an honest rendering — 'request_pending' is never
 * dressed up as an in-flight check, and no SLA is fabricated.
 */

import type { OrderAuthentication } from '@/lib/contracts/domain';
import type { AppIconName } from '@/components/ui/Icon';

export type AuthenticationTone = 'muted' | 'info' | 'success' | 'danger';

export interface AuthenticationPresentation {
  /** Short status line, e.g. "Verification in progress". */
  label: string;
  /** One honest sentence about where the check stands. */
  detail: string;
  tone: AuthenticationTone;
  icon: AppIconName;
}

const BADGE_METHOD_LABEL: Record<string, string> = {
  AI_VERIFIED: 'AI photo triage passed — preliminary check',
  EXPERT_VERIFIED: 'Expert inspection passed',
  LAB_CERTIFIED: 'Laboratory analysis certified',
};

export function orderAuthenticationPresentation(
  authentication: OrderAuthentication | null | undefined,
  verificationRequested: boolean,
): AuthenticationPresentation | null {
  if (!authentication && !verificationRequested) return null;

  const status =
    authentication?.status ??
    (verificationRequested ? 'request_pending' : 'not_requested');

  switch (status) {
    case 'not_requested':
      return null;
    case 'request_pending':
      return {
        label: 'Verification requested',
        detail: 'Recorded on this order — the check is being set up.',
        tone: 'muted',
        icon: 'shield',
      };
    case 'pending_ai_triage':
      return {
        label: 'Verification in progress',
        detail: 'Photo checks are under way.',
        tone: 'info',
        icon: 'shield',
      };
    case 'ai_triage_complete':
    case 'pending_expert_review':
      return {
        label: 'Verification in progress',
        detail: 'Awaiting expert review.',
        tone: 'info',
        icon: 'shield',
      };
    case 'expert_review_complete':
      return {
        label: 'Verification in progress',
        detail: 'Expert review is complete.',
        tone: 'info',
        icon: 'shield',
      };
    case 'pending_lab_analysis':
    case 'lab_analysis_complete':
      return {
        label: 'Verification in progress',
        detail: 'Lab analysis is under way.',
        tone: 'info',
        icon: 'shield',
      };
    case 'authenticated': {
      const badge = authentication?.badge ?? null;
      const methodLabel = badge ? BADGE_METHOD_LABEL[badge.type] : null;
      return {
        label: 'Verified authentic',
        detail: badge
          ? `${methodLabel ?? badge.method} · Certificate ${badge.certificateId}`
          : 'This item passed verification.',
        tone: 'success',
        icon: 'shieldCheck',
      };
    }
    case 'counterfeit':
      return {
        label: 'Authenticity not confirmed',
        detail: 'Verification could not confirm this item is authentic.',
        tone: 'danger',
        icon: 'alert',
      };
    case 'inconclusive':
      return {
        label: 'Verification inconclusive',
        detail: 'The check could not reach a verdict.',
        tone: 'muted',
        icon: 'help',
      };
    case 'cancelled':
      return {
        label: 'Verification cancelled',
        detail: 'The verification request was cancelled.',
        tone: 'muted',
        icon: 'closeCircle',
      };
    default:
      return null;
  }
}
