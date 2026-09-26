/**
 * Support contracts — web port of frontend/src/contracts/support.ts, scoped
 * to the resolution-centre case model the web surfaces render. Names follow
 * the mobile contracts (operational states, author roles, dispositions) so
 * the two stay legible against each other. Fixture mode only — the server
 * contract remains the mobile platform's.
 */

export type SupportTicketStatus = 'open' | 'in_review' | 'resolved' | 'closed';

export type SupportAuthorRole = 'customer' | 'agent_ai' | 'agent_human' | 'system';

export interface SupportTicketMessage {
  id: string;
  role: SupportAuthorRole;
  /** Display name for agent/system authors; customer renders as "You". */
  authorName: string | null;
  body: string;
  createdAt: string;
  /** Optimistic send — 'sending' renders a clock receipt. */
  status?: 'sending' | 'sent';
}

export type SupportTicketEventKind = 'opened' | 'in_review' | 'resolved' | 'closed' | 'note';

export interface SupportTicketEvent {
  kind: SupportTicketEventKind;
  label: string;
  detail?: string;
  at: string;
}

export interface SupportTicketResolution {
  /** CaseResolutionDisposition label, e.g. "Refund approved". */
  disposition: string;
  note: string;
}

export interface SupportTicketCsat {
  rating: number;
  note: string;
}

export interface SupportTicket {
  id: string;
  /** Display reference, e.g. TV-48213. */
  ref: string;
  topicId: SupportTopicId;
  topicLabel: string;
  /** Order-scoped cases link to the commerce order detail. */
  orderRef: string | null;
  status: SupportTicketStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  messages: SupportTicketMessage[];
  events: SupportTicketEvent[];
  resolution: SupportTicketResolution | null;
  csat: SupportTicketCsat | null;
  createdAt: string;
  updatedAt: string;
}

export type SupportTopicId =
  | 'order_issue'
  | 'refund'
  | 'verification'
  | 'payments'
  | 'other';

export interface SupportTopic {
  id: SupportTopicId;
  label: string;
  /** One-line outcome preview shown under the composer, per OrderSupportScreen. */
  outcome: string;
}

export const SUPPORT_TOPICS: SupportTopic[] = [
  {
    id: 'order_issue',
    label: 'Order issue',
    outcome: "We'll contact the seller and confirm what happened.",
  },
  {
    id: 'refund',
    label: 'Refund',
    outcome: "We'll review eligibility and come back within one working day.",
  },
  {
    id: 'verification',
    label: 'Verification',
    outcome: 'Our trust team reviews documents within 48 hours.',
  },
  {
    id: 'payments',
    label: 'Payments & payouts',
    outcome: "We'll trace the payment and confirm the timeline.",
  },
  { id: 'other', label: 'Something else', outcome: 'Our team will review and respond.' },
];

export function topicById(id: string): SupportTopic | undefined {
  return SUPPORT_TOPICS.find((t) => t.id === id);
}

/** Status → label + badge variant + icon, one mapping for hub and thread. */
export function statusMeta(status: SupportTicketStatus): {
  label: string;
  badge: 'neutral' | 'success' | 'warning' | 'trust' | 'brand';
  icon: 'folder' | 'clock' | 'check' | 'lock';
} {
  switch (status) {
    case 'open':
      return { label: 'Open', badge: 'brand', icon: 'folder' };
    case 'in_review':
      return { label: 'In review', badge: 'trust', icon: 'clock' };
    case 'resolved':
      return { label: 'Resolved', badge: 'success', icon: 'check' };
    case 'closed':
      return { label: 'Closed', badge: 'neutral', icon: 'lock' };
  }
}

/** Canonical timeline steps, mirroring the case lifecycle. */
export const TIMELINE_STEPS: Array<{
  kind: 'opened' | 'in_review' | 'resolved';
  label: string;
  pending: string;
}> = [
  { kind: 'opened', label: 'Case opened', pending: '' },
  { kind: 'in_review', label: 'In review', pending: 'Queued for the support team' },
  { kind: 'resolved', label: 'Resolved', pending: 'Once a decision is made' },
];
