/**
 * Report model — 1:1 port of the mobile report contract
 * (frontend/src/utils/reportLogic.ts + the i18n report.* strings):
 * the reason catalogue in authored order, evidence limits, and the
 * staged-submit vocabulary. Pure data — no React, no side effects.
 */

import type { AppIconName } from '@/components/ui/Icon';

export type ReportTargetType = 'listing' | 'user';

export interface ReportTarget {
  type: ReportTargetType;
  /** Listing id or user id the report is filed against. */
  id: string;
  /** Human context for the confidential line — listing title or @username. */
  label?: string;
}

export const MAX_REPORT_EVIDENCE = 3;
export const MAX_REPORT_DETAILS = 500;

export type EvidenceState = 'attached' | 'submitted';

export interface EvidenceItem {
  id: string;
  /** Object URL — a session-local preview, never routed through next/image. */
  uri: string;
  state: EvidenceState;
}

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'counterfeit'
  | 'prohibited'
  | 'off_platform'
  | 'scam'
  | 'misinformation'
  | 'privacy'
  | 'impersonation'
  | 'minor_safety'
  | 'other';

export interface ReportReasonOption<K extends string = ReportReason> {
  key: K;
  label: string;
  description: string;
  icon: AppIconName;
}

/** Verbatim port of mobile REPORT_REASONS — same order, same copy, nearest
 *  semantic icon in the web icon map for each mobile glyph. */
export const REPORT_REASONS: ReportReasonOption[] = [
  {
    key: 'spam',
    label: 'Spam',
    description: 'Unwanted promotion, scams or repetitive messages',
    icon: 'mailUnread',
  },
  {
    key: 'harassment',
    label: 'Harassment',
    description: 'Threatening, abusive or targeted unwanted contact',
    icon: 'warning',
  },
  {
    key: 'hate_speech',
    label: 'Hate speech',
    description: 'Slurs, dehumanizing language, or attacks on protected groups',
    icon: 'ban',
  },
  {
    key: 'counterfeit',
    label: 'Fake item',
    description: 'Counterfeit goods or misleading authenticity claims',
    icon: 'bag',
  },
  {
    key: 'prohibited',
    label: 'Prohibited item',
    description: 'Weapons, drugs, wildlife, or other prohibited categories',
    icon: 'stop',
  },
  {
    key: 'off_platform',
    label: 'Off-platform request',
    description: 'Asked to transact outside Thryftverse, against policy',
    icon: 'exit',
  },
  {
    key: 'scam',
    label: 'Scam or fraud',
    description: 'Attempted financial fraud, phishing, or impersonation',
    icon: 'payout',
  },
  {
    key: 'misinformation',
    label: 'Misleading content',
    description: 'False or misleading claims about an item',
    icon: 'info',
  },
  {
    key: 'privacy',
    label: 'Privacy violation',
    description: 'Shared private information without consent',
    icon: 'lock',
  },
  {
    key: 'impersonation',
    label: 'Impersonation',
    description: 'Pretending to be someone else',
    icon: 'profile',
  },
  {
    key: 'minor_safety',
    label: 'Minor safety',
    description: 'Content or behavior endangering minors',
    icon: 'shield',
  },
  {
    key: 'other',
    label: 'Something else',
    description: 'Tell the moderation team what happened',
    icon: 'help',
  },
];

export function reportTitleFor(type: ReportTargetType): string {
  return type === 'user' ? 'Report account' : 'Report listing';
}

// ── DSA notice-and-action (illegal content) ─────────────────────────────────
// Distinct taxonomy from the standard report — DSA Art. 16 notices must say
// why the content is illegal, point at its exact location, and carry the
// reporter's contact plus a good-faith declaration. The mobile entry point
// is the "Report illegal content" row under Trust & Safety in Help & Support.

export type DsaReportReason =
  | 'illegal_goods'
  | 'ip_infringement'
  | 'hate_speech'
  | 'harassment'
  | 'fraud'
  | 'privacy_violation'
  | 'minor_safety'
  | 'other_illegal';

/** Reason catalogue for the DSA notice — ordered most-severe first. */
export const DSA_REPORT_REASONS: ReportReasonOption<DsaReportReason>[] = [
  {
    key: 'illegal_goods',
    label: 'Illegal goods or services',
    description: 'Counterfeits, prohibited items or unlawful offers for sale',
    icon: 'ban',
  },
  {
    key: 'ip_infringement',
    label: 'Intellectual property infringement',
    description: 'Content that violates copyright, trademark or design rights',
    icon: 'document',
  },
  {
    key: 'minor_safety',
    label: 'Content endangering minors',
    description: 'Content that is unsafe for or exploits minors',
    icon: 'shield',
  },
  {
    key: 'hate_speech',
    label: 'Hate speech or discrimination',
    description: 'Illegal attacks or incitement against protected groups',
    icon: 'warning',
  },
  {
    key: 'harassment',
    label: 'Harassment or threats',
    description: 'Unlawful threatening, bullying or targeted abuse',
    icon: 'alert',
  },
  {
    key: 'fraud',
    label: 'Scams or fraud',
    description: 'Deceptive content intended to defraud users',
    icon: 'payout',
  },
  {
    key: 'privacy_violation',
    label: 'Unlawful personal data',
    description: 'Private information shared without a legal basis',
    icon: 'lock',
  },
  {
    key: 'other_illegal',
    label: 'Other illegal content',
    description: 'Content you believe is illegal under EU or national law',
    icon: 'flag',
  },
];

export const MAX_DSA_DETAILS = 2000;

