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
  /** Optimistic send — 'sending' renders a clock receipt, 'failed' a retry. */
  status?: 'sending' | 'sent' | 'failed';
}

export type SupportTicketEventKind =
  | 'opened'
  | 'in_review'
  | 'resolved'
  | 'closed'
  | 'note'
  /** Evidence landed on the case — mirrors mobile `evidence_received`. */
  | 'evidence'
  /** Buyer asked for a human — mirrors mobile ownership 'human_queued'. */
  | 'handoff';

export interface SupportTicketEvent {
  kind: SupportTicketEventKind;
  label: string;
  detail?: string;
  at: string;
}

/** Linked commerce context — mirrors the mobile extractContextLinks set
 *  (order | listing | payout). Ids are the web route params. */
export type SupportContextKind = 'order' | 'listing' | 'payout';

export interface SupportContextLink {
  kind: SupportContextKind;
  id: string;
}

/** Photo/document evidence attached to the case. Fixture-mode uploads are
 *  session-local object URLs; live mode carries the uploaded media URL. */
export interface SupportEvidence {
  id: string;
  uri: string;
}

export interface SupportTicketResolution {
  /** CaseResolutionDisposition label, e.g. "Refund approved". */
  disposition: string;
  note: string;
}

/** CSAT is the server's binary vocabulary (POST
 *  /support/conversations/:id/feedback) — not a star scale. */
export interface SupportTicketCsat {
  rating: 'helpful' | 'unhelpful';
  note: string;
}

export interface SupportTicket {
  id: string;
  /** The reference shown to the user. Live rows use the record id —
   *  the id IS the reference; `caseRefLabel` renders the short form. */
  ref: string;
  /** The conversation this case belongs to — the CSAT feedback join key
   *  (POST /support/conversations/:id/feedback). Null on order-bound
   *  ticket rows, which carry no conversation. */
  conversationId: string | null;
  /** Raw backend operational state (new|triaged|awaiting_customer|queued|
   *  in_review|awaiting_external|resolved|closed) — `status` folds it into
   *  the 4-state UI vocabulary; this keeps the truthful label available. */
  operationalState?: string | null;
  topicId: SupportTopicId;
  topicLabel: string;
  /** Order-bound tickets carry the real order id (the join key for the
   *  order page's open-ticket indicator); order-linked cases resolve it
   *  from the case's context links. */
  orderId: string | null;
  /** Non-order context (listing, payout) — folded with orderId by
   *  contextLinksFor so the thread renders one deduped link set. */
  contextLinks?: SupportContextLink[];
  /** Evidence attached to the case — renders the evidence block + the
   *  'evidence' activity event carries the received stamp. */
  evidence?: SupportEvidence[];
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

/**
 * Display form of a case/ticket reference. The id IS the reference — long
 * server ids (`case_…`, `ticket_…`) render as the last-8 short code, the
 * same `#` grammar the native SupportCaseDetailScreen header uses.
 */
export function caseRefLabel(ref: string): string {
  return ref.length > 12 ? `#${ref.slice(-8).toUpperCase()}` : ref;
}

/**
 * Raw operationalState → customer-facing label, 1:1 with the native
 * STATE_DISPLAY map. Unknown states humanize rather than lie.
 */
export function operationalStateLabel(state: string): string {
  switch (state) {
    case 'new':
      return 'New';
    case 'triaged':
      return 'Triaged';
    case 'awaiting_customer':
    case 'waiting_on_customer':
      return 'Awaiting your response';
    case 'queued':
      return 'In queue';
    case 'in_review':
      return 'Under review';
    case 'awaiting_external':
    case 'waiting_on_internal':
      return 'Awaiting external party';
    case 'resolved':
      return 'Resolved';
    case 'closed':
      return 'Closed';
    default:
      return state
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
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

/**
 * The linked order/listing/payout set for the context bar — orderId folds
 * into the same row grammar as mobile's extractContextLinks, deduped.
 */
export function contextLinksFor(ticket: SupportTicket): SupportContextLink[] {
  const links: SupportContextLink[] = [];
  const seen = new Set<string>();
  const push = (kind: SupportContextKind, id: string | null | undefined) => {
    if (!id || seen.has(`${kind}:${id}`)) return;
    seen.add(`${kind}:${id}`);
    links.push({ kind, id });
  };
  push('order', ticket.orderId);
  for (const link of ticket.contextLinks ?? []) push(link.kind, link.id);
  return links;
}

export function contextLinkLabel(kind: SupportContextKind): string {
  switch (kind) {
    case 'order':
      return 'Order';
    case 'listing':
      return 'Listing';
    case 'payout':
      return 'Payout';
  }
}

/** Where a context link resolves on web — payout lands on the wallet
 *  surface (no per-payout route exists yet). */
export function contextLinkHref(link: SupportContextLink): string | null {
  switch (link.kind) {
    case 'order':
      return `/orders/${link.id}`;
    case 'listing':
      return `/item/${link.id}`;
    case 'payout':
      return '/wallet';
  }
}

/**
 * Conversation ownership — mirrors mobile headerSubtitleFor /
 * ownershipState derivation. A human agent owns the thread once an
 * agent_human message exists; a 'handoff' event means the request is
 * queued; agent_ai means the assistant is answering.
 */
export function ownershipLabel(ticket: SupportTicket): string | null {
  if (ticket.messages.some((m) => m.role === 'agent_human')) return 'Support specialist';
  if (ticket.events.some((e) => e.kind === 'handoff')) return 'Waiting for a specialist';
  if (ticket.messages.some((m) => m.role === 'agent_ai')) return 'AI assistant';
  return null;
}

/** Bot→human handoff is offerable while the AI assistant (or nobody) owns
 *  an open case — never after a specialist replied or a handoff was
 *  already requested, and never on a closed case. */
export function canRequestHandoff(ticket: SupportTicket): boolean {
  if (ticket.status === 'closed' || ticket.status === 'resolved') return false;
  if (ticket.messages.some((m) => m.role === 'agent_human')) return false;
  return !ticket.events.some((e) => e.kind === 'handoff');
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
