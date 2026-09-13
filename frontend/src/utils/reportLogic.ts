import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import type { ReportReason } from '../services/profileApi';
import type { RootStackParamList } from '../navigation/types';

/**
 * Pure view-model derivations for ReportScreen — reason catalogue,
 * evidence state machine, and submit/block eligibility. No React state,
 * no side effects; all transitions live in `hooks/report/*`.
 */

export type ReportTargetType = RootStackParamList['Report']['type'];

export const MAX_REPORT_EVIDENCE = 3;

export type EvidenceState = 'uploading' | 'attached' | 'submitted';

export interface EvidenceItem {
  id: string;
  uri: string;
  state: EvidenceState;
}

export interface ReportReasonOption {
  key: ReportReason;
  labelKey: string;
  descKey: string;
  icon: ComponentProps<typeof Ionicons>['name'];
}

export const REPORT_REASONS: ReportReasonOption[] = [
  {
    key: 'spam',
    labelKey: 'reasons.spam',
    descKey: 'reasons.spamDesc',
    icon: 'mail-unread-outline' },
  {
    key: 'harassment',
    labelKey: 'reasons.harassment',
    descKey: 'reasons.harassmentDesc',
    icon: 'warning-outline' },
  {
    key: 'hate_speech',
    labelKey: 'reasons.hateSpeech',
    descKey: 'reasons.hateSpeechDesc',
    icon: 'megaphone-outline' },
  {
    key: 'counterfeit',
    labelKey: 'reasons.counterfeit',
    descKey: 'reasons.counterfeitDesc',
    icon: 'bag-handle-outline' },
  {
    key: 'prohibited',
    labelKey: 'reasons.prohibited',
    descKey: 'reasons.prohibitedDesc',
    icon: 'ban-outline' },
  {
    key: 'off_platform',
    labelKey: 'reasons.offPlatform',
    descKey: 'reasons.offPlatformDesc',
    icon: 'exit-outline' },
  {
    key: 'scam',
    labelKey: 'reasons.scam',
    descKey: 'reasons.scamDesc',
    icon: 'cash-outline' },
  {
    key: 'misinformation',
    labelKey: 'reasons.misinformation',
    descKey: 'reasons.misinformationDesc',
    icon: 'information-circle-outline' },
  {
    key: 'privacy',
    labelKey: 'reasons.privacy',
    descKey: 'reasons.privacyDesc',
    icon: 'lock-closed-outline' },
  {
    key: 'impersonation',
    labelKey: 'reasons.impersonation',
    descKey: 'reasons.impersonationDesc',
    icon: 'person-outline' },
  {
    key: 'minor_safety',
    labelKey: 'reasons.minorSafety',
    descKey: 'reasons.minorSafetyDesc',
    icon: 'lock-closed-outline' },
  {
    key: 'other',
    labelKey: 'reasons.other',
    descKey: 'reasons.otherDesc',
    icon: 'help-circle-outline' },
];

export interface ReportSubmitEligibility {
  targetId: string | undefined;
  selectedReason: ReportReason | null;
  isSubmitting: boolean;
  isUploading: boolean;
}

export function deriveCanSubmit({
  targetId,
  selectedReason,
  isSubmitting,
  isUploading,
}: ReportSubmitEligibility): boolean {
  return (
    Boolean(targetId) &&
    Boolean(selectedReason) &&
    !isSubmitting &&
    !isUploading
  );
}

/** URIs that are sent with the report — only fully attached evidence. */
export function attachedEvidenceUris(items: EvidenceItem[]): string[] {
  return items
    .filter((e) => e.state === 'attached')
    .map((e) => e.uri);
}

export function reportTitleKey(type: ReportTargetType | undefined): string {
  return type === 'user' ? 'header.reportAccount'
    : type === 'group' ? 'header.reportGroup'
    : 'header.reportListing';
}

export function formatSubmittedAt(date: Date = new Date()): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function shouldShowBlockAction(
  type: ReportTargetType | undefined,
  isBlocked: boolean,
  hasBlocked: boolean,
): boolean {
  return type === 'user' && !isBlocked && !hasBlocked;
}

export function shouldShowBlockedNote(
  type: ReportTargetType | undefined,
  isBlocked: boolean,
  hasBlocked: boolean,
): boolean {
  return (isBlocked || hasBlocked) && type === 'user';
}
