import type { OrderAuthentication } from '../../services/commerceApi';

export type AuthenticationTone = 'muted' | 'info' | 'success' | 'danger';

export interface AuthenticationPresentation {
  /** Short status line, e.g. "Verification in progress". */
  label: string;
  /** One honest sentence about where the check stands — no fabricated SLAs
   *  or review timelines (the backend exposes none). */
  detail: string;
  tone: AuthenticationTone;
  icon:
    | 'shield-checkmark-outline'
    | 'shield-outline'
    | 'alert-circle-outline'
    | 'help-circle-outline'
    | 'close-circle-outline';
}

const BADGE_METHOD_LABEL: Record<string, string> = {
  AI_VERIFIED: 'AI photo triage passed — preliminary check',
  EXPERT_VERIFIED: 'Expert inspection passed',
  LAB_CERTIFIED: 'Laboratory analysis certified',
};

/**
 * Maps the backend pipeline status to display copy. Every state the API can
 * return has an honest rendering — 'request_pending' (durable flag set,
 * pipeline record absent) is never dressed up as an in-flight check.
 */
export function orderAuthenticationPresentation(
  authentication: OrderAuthentication | null | undefined,
  verificationRequested: boolean
): AuthenticationPresentation | null {
  if (!authentication && !verificationRequested) return null;

  const status = authentication?.status ??
    (verificationRequested ? 'request_pending' : 'not_requested');

  switch (status) {
    case 'not_requested':
      return null;
    case 'request_pending':
      return {
        label: 'Verification requested',
        detail: 'Recorded on this order — the check is being set up.',
        tone: 'muted',
        icon: 'shield-outline' };
    case 'pending_ai_triage':
      return {
        label: 'Verification in progress',
        detail: 'Photo checks are under way.',
        tone: 'info',
        icon: 'shield-outline' };
    case 'ai_triage_complete':
    case 'pending_expert_review':
      return {
        label: 'Verification in progress',
        detail: 'Awaiting expert review.',
        tone: 'info',
        icon: 'shield-outline' };
    case 'expert_review_complete':
      return {
        label: 'Verification in progress',
        detail: 'Expert review is complete.',
        tone: 'info',
        icon: 'shield-outline' };
    case 'pending_lab_analysis':
    case 'lab_analysis_complete':
      return {
        label: 'Verification in progress',
        detail: 'Lab analysis is under way.',
        tone: 'info',
        icon: 'shield-outline' };
    case 'authenticated': {
      const badge = authentication?.request?.badge ?? null;
      const methodLabel = badge ? BADGE_METHOD_LABEL[badge.type] : null;
      return {
        label: 'Verified authentic',
        detail: badge
          ? `${methodLabel ?? badge.method} · Certificate ${badge.certificateId}`
          : 'This item passed verification.',
        tone: 'success',
        icon: 'shield-checkmark-outline' };
    }
    case 'counterfeit':
      return {
        label: 'Authenticity not confirmed',
        detail: 'Verification could not confirm this item is authentic.',
        tone: 'danger',
        icon: 'alert-circle-outline' };
    case 'inconclusive':
      return {
        label: 'Verification inconclusive',
        detail: 'The check could not reach a verdict.',
        tone: 'muted',
        icon: 'help-circle-outline' };
    case 'cancelled':
      return {
        label: 'Verification cancelled',
        detail: 'The verification request was cancelled.',
        tone: 'muted',
        icon: 'close-circle-outline' };
    default:
      return null;
  }
}
