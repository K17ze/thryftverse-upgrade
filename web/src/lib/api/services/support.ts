/**
 * Web support service — verified live contract (backend/api/src/routes/
 * support.ts + supportReviews.ts + support/caseService.ts).
 *
 * Two server models sit behind the web "ticket" UI:
 *
 *  - Support cases — GET /support/cases, GET /support/cases/:id. The
 *    ops-desk record: operationalState, resolutionDisposition and a public
 *    event log. There is no messages array — the customer-visible thread
 *    derives from `customer_message` / `operator_message` events (the
 *    route already returns isPublic events only; we filter defensively).
 *    POST /support/cases/:id/messages creates a customer_message event;
 *    POST /support/cases/:id/appeal creates an appeal_requested event.
 *
 *  - Support tickets — GET /support/tickets, POST /support/tickets
 *    (supportReviews.ts). Order-bound resolution requests; creation
 *    requires a real orderId owned by the caller. Tickets have no event
 *    log — `details` is the opening message and `status` is a plain
 *    open|resolved|closed enum.
 *
 * CSAT lives on the CONVERSATION, not the case: POST
 * /support/conversations/:id/feedback {rating: 'helpful'|'unhelpful'}.
 * Case rows carry `conversationId` — that is the join key.
 */

import { fetchJson } from '../http';
import type {
  SupportTicket,
  SupportTicketEvent,
  SupportTicketMessage,
  SupportContextLink,
} from '@/lib/contracts/support';
import { topicById } from '@/lib/contracts/support';
import type { SupportTopicId } from '@/lib/contracts/support';

// ── Wire shapes (serializeCase / serializeSupportTicket) ─────────────────────

interface ApiSupportCase {
  id: string;
  conversationId: string | null;
  userId: string;
  issueType: string;
  requestedOutcome: string | null;
  operationalState: string;
  resolutionDisposition: string | null;
  priority: string;
  riskFlags: unknown[];
  assignedTeam: string | null;
  assignedOperatorId: string | null;
  policyVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ApiCaseEvent {
  id: string;
  caseId: string;
  eventType: string;
  actorId: string | null;
  actorRole: string;
  payload: Record<string, unknown>;
  isPublic: boolean;
  createdAt: string;
}

interface ApiSupportTicket {
  id: string;
  orderId: string;
  topicId: string;
  topicLabel: string;
  details: string;
  status: string;
  evidenceMediaUrls: string[] | null;
  createdAt: string;
  updatedAt: string;
}

// ── Vocabulary ───────────────────────────────────────────────────────────────

/**
 * operationalState → web status vocabulary. The real enum (backend
 * contracts.ts) is new|triaged|awaiting_customer|queued|in_review|
 * awaiting_external|resolved|closed — 'awaiting_customer' maps to 'open'
 * because the next action is the customer's. Unknown states fail safe to
 * 'open' rather than masquerading as resolved.
 */
function mapOperationalState(s: string | undefined): SupportTicket['status'] {
  switch ((s ?? '').toLowerCase()) {
    case 'new':
    case 'open':
    case 'awaiting_customer':
    case 'waiting_on_customer':
      return 'open';
    case 'triaged':
    case 'queued':
    case 'in_review':
    case 'awaiting_external':
    case 'waiting_on_internal':
      return 'in_review';
    case 'resolved':
    case 'decision_made':
      return 'resolved';
    case 'closed':
      return 'closed';
    default:
      return 'open';
  }
}

/** Ticket status is the plain open|resolved|closed enum — same vocabulary. */
function mapTicketStatus(s: string | undefined): SupportTicket['status'] {
  switch ((s ?? '').toLowerCase()) {
    case 'resolved':
      return 'resolved';
    case 'closed':
      return 'closed';
    default:
      return 'open';
  }
}

/** Resolution disposition → label, 1:1 with the native DISPOSITION_LABEL. */
const DISPOSITION_LABEL: Record<string, string> = {
  information_provided: 'Information provided',
  customer_withdrew: 'Withdrawn by customer',
  seller_resolved: 'Resolved by seller',
  refund_approved: 'Refund approved',
  refund_denied: 'Refund denied',
  return_approved: 'Return approved',
  not_eligible: 'Not eligible',
  no_violation: 'No violation found',
  violation_actioned: 'Violation actioned',
  duplicate: 'Duplicate case',
  merged: 'Merged with another case',
  external_dispute: 'Resolved via external dispute',
  unable_to_resolve: 'Unable to resolve',
};

function dispositionLabel(d: string | null | undefined): string | null {
  if (!d) return null;
  return DISPOSITION_LABEL[d] ?? humanize(d);
}

function humanize(s: string): string {
  const t = s.replace(/_/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// ── Event → thread/activity mapping (native renderEvent port) ────────────────

const MESSAGE_EVENT_TYPES = new Set(['customer_message', 'operator_message']);

function messageRole(e: ApiCaseEvent): SupportTicketMessage['role'] {
  if (e.eventType === 'customer_message') return 'customer';
  switch (e.actorRole) {
    case 'agent_ai':
      return 'agent_ai';
    case 'agent_human':
    case 'operator':
      return 'agent_human';
    case 'system':
      return 'system';
    default:
      return 'agent_human';
  }
}

function messageAuthorName(e: ApiCaseEvent): string | null {
  switch (e.actorRole) {
    case 'agent_ai':
      return 'ThryftVerse Assistant';
    case 'agent_human':
    case 'operator':
      return 'Support agent';
    default:
      return null;
  }
}

/** customer_message / operator_message events → thread bubbles. */
function eventToMessage(e: ApiCaseEvent): SupportTicketMessage | null {
  if (!MESSAGE_EVENT_TYPES.has(e.eventType)) return null;
  const body = str(e.payload.body) ?? str(e.payload.message);
  if (!body) return null;
  return {
    id: e.id,
    role: messageRole(e),
    authorName: messageAuthorName(e),
    body,
    createdAt: e.createdAt,
    status: 'sent',
  };
}

/**
 * Non-message events → the activity log / lifecycle stepper. Every known
 * eventType gets a truthful label; unknown types fall back to the
 * humanized eventType — never a fabricated label.
 */
function eventToTicketEvent(e: ApiCaseEvent): SupportTicketEvent | null {
  if (MESSAGE_EVENT_TYPES.has(e.eventType)) return null;
  const p = e.payload;

  switch (e.eventType) {
    case 'case_created': {
      const issueType = str(p.issueType);
      return {
        kind: 'opened',
        label: 'Case opened',
        detail: issueType ? humanize(issueType) : undefined,
        at: e.createdAt,
      };
    }
    case 'triaged':
    case 'assigned': {
      const team = str(p.team) ?? str(p.assignedTeam);
      const operator = str(p.operatorName) ?? str(p.assignedOperatorName);
      const target = team && operator ? `${team} · ${operator}` : team ?? operator;
      return {
        kind: 'in_review',
        label: 'In review',
        detail:
          e.eventType === 'assigned' && target ? `Assigned to ${target}` : undefined,
        at: e.createdAt,
      };
    }
    case 'decision_made': {
      const disposition = dispositionLabel(str(p.disposition));
      const reason = str(p.reason) ?? str(p.rationale);
      return {
        kind: 'resolved',
        label: 'Decision',
        detail: [disposition, reason].filter(Boolean).join(' — ') || undefined,
        at: e.createdAt,
      };
    }
    case 'case_resolved':
      return {
        kind: 'resolved',
        label: 'Case resolved',
        detail: dispositionLabel(str(p.disposition)) ?? undefined,
        at: e.createdAt,
      };
    case 'case_closed':
      return {
        kind: 'closed',
        label: 'Case closed',
        detail: dispositionLabel(str(p.disposition)) ?? undefined,
        at: e.createdAt,
      };
    case 'evidence_received': {
      const count = typeof p.count === 'number' ? p.count : null;
      return {
        kind: 'evidence',
        label: 'Evidence received',
        detail: count != null ? `${count} item${count === 1 ? '' : 's'} attached` : undefined,
        at: e.createdAt,
      };
    }
    case 'appeal_requested':
      return {
        kind: 'note',
        label: 'Appeal requested',
        detail: str(p.reason) ?? undefined,
        at: e.createdAt,
      };
    case 'additional_information_requested':
      return {
        kind: 'note',
        label: 'More information requested',
        detail: str(p.question) ?? str(p.detail) ?? undefined,
        at: e.createdAt,
      };
    case 'external_update':
      return {
        kind: 'note',
        label: 'Status update',
        detail: str(p.detail) ?? str(p.statusDetail) ?? str(p.summary) ?? undefined,
        at: e.createdAt,
      };
    case 'customer_notified':
      return {
        kind: 'note',
        label: 'Customer notified',
        detail: str(p.subject) ?? str(p.channel) ?? undefined,
        at: e.createdAt,
      };
    default:
      return {
        kind: 'note',
        label: humanize(e.eventType),
        detail: str(p.detail) ?? str(p.summary) ?? undefined,
        at: e.createdAt,
      };
  }
}

/** Context links ride the case_created event payload (support_case_links
 *  aren't on the serialized row — the event carries what createCase
 *  extracted). Mirrors the native extractContextLinks. */
function extractContextLinks(events: ApiCaseEvent[]): SupportContextLink[] {
  const links: SupportContextLink[] = [];
  const seen = new Set<string>();
  const push = (kind: SupportContextLink['kind'], id: unknown) => {
    if (typeof id !== 'string' || !id || seen.has(`${kind}:${id}`)) return;
    seen.add(`${kind}:${id}`);
    links.push({ kind, id });
  };
  for (const e of events) {
    const raw = e.payload.contextLinks;
    if (Array.isArray(raw)) {
      for (const l of raw) {
        if (l && typeof l === 'object') {
          const kind = (l as { kind?: unknown }).kind;
          const id = (l as { id?: unknown }).id;
          if (kind === 'order' || kind === 'listing' || kind === 'payout') {
            push(kind, id);
          }
        }
      }
    }
    push('order', e.payload.orderId);
    push('listing', e.payload.listingId);
    push('payout', e.payload.payoutId);
  }
  return links;
}

/** Evidence media rides evidence_received payloads (urls / mediaUrls). */
function extractEvidence(events: ApiCaseEvent[]): Array<{ id: string; uri: string }> {
  const out: Array<{ id: string; uri: string }> = [];
  for (const e of events) {
    if (e.eventType !== 'evidence_received') continue;
    const urls = Array.isArray(e.payload.urls)
      ? e.payload.urls
      : Array.isArray(e.payload.mediaUrls)
        ? e.payload.mediaUrls
        : [];
    for (const u of urls) {
      if (typeof u === 'string' && u) out.push({ id: `${e.id}-ev${out.length}`, uri: u });
    }
  }
  return out;
}

// ── Case → SupportTicket ─────────────────────────────────────────────────────

function topicFrom(issueType: string | undefined, fallbackLabel?: string) {
  const known = issueType ? topicById(issueType) : undefined;
  return {
    topicId: (known?.id ?? 'other') as SupportTopicId,
    topicLabel: known?.label ?? fallbackLabel ?? (issueType ? humanize(issueType) : 'Support'),
  };
}

function mapCase(c: ApiSupportCase, events: ApiCaseEvent[] = []): SupportTicket {
  const publicEvents = events.filter((e) => e.isPublic);
  const links = extractContextLinks(publicEvents);
  const orderLink = links.find((l) => l.kind === 'order');
  const { topicId, topicLabel } = topicFrom(c.issueType);

  const disposition = dispositionLabel(c.resolutionDisposition);
  // The disposition note comes from the deciding event's payload — the
  // case row itself carries no free-text resolution note.
  const decisionEvent = [...publicEvents]
    .reverse()
    .find(
      (e) =>
        e.eventType === 'decision_made' ||
        e.eventType === 'case_resolved' ||
        e.eventType === 'case_closed',
    );
  const decisionNote = decisionEvent
    ? str(decisionEvent.payload.reason) ??
      str(decisionEvent.payload.rationale) ??
      str(decisionEvent.payload.detail)
    : null;

  return {
    id: c.id,
    // The id IS the reference — no invented ref.
    ref: c.id,
    conversationId: c.conversationId,
    operationalState: c.operationalState,
    topicId,
    topicLabel,
    orderId: orderLink?.id ?? null,
    status: mapOperationalState(c.operationalState),
    priority:
      c.priority === 'low' || c.priority === 'high' || c.priority === 'urgent'
        ? c.priority
        : 'normal',
    messages: publicEvents
      .map(eventToMessage)
      .filter((m): m is SupportTicketMessage => m !== null),
    events: publicEvents
      .map(eventToTicketEvent)
      .filter((e): e is SupportTicketEvent => e !== null),
    evidence: extractEvidence(publicEvents),
    contextLinks: links,
    resolution:
      c.resolutionDisposition && disposition
        ? { disposition, note: decisionNote ?? '' }
        : null,
    // Feedback is stored on the conversation and never returned on the
    // case read — the prompt starts blank in live mode.
    csat: null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

// ── Ticket row → SupportTicket ───────────────────────────────────────────────

function mapTicketRow(t: ApiSupportTicket): SupportTicket {
  const { topicId } = topicFrom(t.topicId, t.topicLabel);
  const events: SupportTicketEvent[] = [
    { kind: 'opened', label: 'Request opened', at: t.createdAt },
  ];
  if (t.status === 'resolved' || t.status === 'closed') {
    events.push({ kind: 'resolved', label: 'Resolved', at: t.updatedAt });
  }
  if (t.status === 'closed') {
    events.push({ kind: 'closed', label: 'Case closed', at: t.updatedAt });
  }
  const evidence = (t.evidenceMediaUrls ?? []).map((uri, i) => ({
    id: `${t.id}-ev${i}`,
    uri,
  }));
  return {
    id: t.id,
    ref: t.id,
    // Order-bound ticket rows carry no conversation — CSAT stays hidden.
    conversationId: null,
    operationalState: null,
    topicId,
    topicLabel: t.topicLabel,
    orderId: t.orderId,
    status: mapTicketStatus(t.status),
    priority: 'normal',
    // `details` is the requester's opening statement — rendered as their
    // first message, no synthesized replies.
    messages: t.details
      ? [
          {
            id: `${t.id}-details`,
            role: 'customer' as const,
            authorName: null,
            body: t.details,
            createdAt: t.createdAt,
            status: 'sent' as const,
          },
        ]
      : [],
    events,
    evidence: evidence.length ? evidence : undefined,
    contextLinks: [],
    resolution: null,
    csat: null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** GET /support/cases — ops-desk cases (no events on the list read). */
export async function fetchSupportCases(signal?: AbortSignal): Promise<SupportTicket[]> {
  const payload = await fetchJson<{ ok?: boolean; cases?: ApiSupportCase[] }>(
    '/support/cases',
    undefined,
    { signal },
  );
  return (payload.cases ?? []).map((c) => mapCase(c));
}

/** GET /support/tickets — the user's order-bound tickets. */
export async function fetchSupportTickets(signal?: AbortSignal): Promise<SupportTicket[]> {
  const payload = await fetchJson<{ ok?: boolean; tickets?: ApiSupportTicket[] }>(
    '/support/tickets',
    undefined,
    { signal },
  );
  return (payload.tickets ?? []).map(mapTicketRow);
}

/**
 * GET /support/cases/:id — the full case with its public event log; the
 * thread and activity views derive from events here, not from the list
 * row (which carries none).
 */
export async function fetchSupportCase(
  id: string,
  signal?: AbortSignal,
): Promise<SupportTicket | null> {
  const payload = await fetchJson<{
    ok: boolean;
    case?: ApiSupportCase;
    events?: ApiCaseEvent[];
  }>(`/support/cases/${encodeURIComponent(id)}`, undefined, { signal });
  return payload.ok && payload.case ? mapCase(payload.case, payload.events ?? []) : null;
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * POST /support/tickets — ticket creation is order-bound (supportReviews.ts
 * schema): orderId must reference an order the caller is a party to. There
 * is no unbound case-create route — callers must pass a real orderId.
 */
export async function createSupportTicket(input: {
  orderId: string;
  topicId: string;
  topicLabel: string;
  details: string;
  evidenceMediaUrls?: string[];
}): Promise<SupportTicket> {
  const payload = await fetchJson<{ ok: boolean; ticket?: ApiSupportTicket }>(
    '/support/tickets',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: input.orderId,
        topicId: input.topicId,
        topicLabel: input.topicLabel,
        details: input.details,
        evidenceMediaUrls: input.evidenceMediaUrls?.length
          ? input.evidenceMediaUrls
          : undefined,
      }),
    },
  );
  if (!payload.ok || !payload.ticket) throw new Error('Support request was not created');
  return mapTicketRow(payload.ticket);
}

/**
 * Reply — POST /support/cases/:id/messages creates a customer_message
 * event (201 {ok, event}). There is no equivalent on tickets.
 */
export async function postSupportCaseMessage(caseId: string, body: string): Promise<void> {
  await fetchJson(`/support/cases/${encodeURIComponent(caseId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

/**
 * Contest a decision — POST /support/cases/:id/appeal {reason}, creates an
 * appeal_requested event. The schema requires a non-empty reason.
 */
export async function appealSupportCase(caseId: string, reason: string): Promise<void> {
  await fetchJson(`/support/cases/${encodeURIComponent(caseId)}/appeal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
}

// ── Support conversations ───────────────────────────────────────────────────
// The conversational channel behind cases: POST /support/conversations is
// the only unbound intake route — non-'general' kinds must carry a
// contextId the route can project (CONTEXT_ID_REQUIRED otherwise). The DSA
// notice-and-action flow rides this channel (mobile HelpSupportScreen does
// the same); tickets stay order-bound.

export type SupportContextKind =
  | 'general'
  | 'order'
  | 'listing'
  | 'payout'
  | 'report'
  | 'auction'
  | 'coown_asset'
  | 'catalog_import'
  | 'media_job';

export async function createSupportConversation(input: {
  contextKind: SupportContextKind;
  contextId?: string;
  locale?: string;
}): Promise<{ id: string }> {
  const payload = await fetchJson<{
    ok: boolean;
    conversation?: { id?: string };
  }>('/support/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contextKind: input.contextKind,
      contextId: input.contextId,
      locale: input.locale,
    }),
  });
  if (!payload.ok || !payload.conversation?.id) {
    throw new Error('Support conversation was not created');
  }
  return { id: payload.conversation.id };
}

/**
 * POST /support/conversations/:id/messages — the first message carries the
 * composed notice body (the route appends a customer message, 201).
 */
export async function sendSupportConversationMessage(
  conversationId: string,
  body: string,
): Promise<void> {
  await fetchJson(
    `/support/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    },
  );
}

/**
 * CSAT — POST /support/conversations/:id/feedback. The rating is the
 * server's own binary vocabulary; `note` travels as `reason`.
 */
export async function submitConversationFeedback(
  conversationId: string,
  input: { rating: 'helpful' | 'unhelpful'; reason?: string },
): Promise<void> {
  await fetchJson(`/support/conversations/${encodeURIComponent(conversationId)}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rating: input.rating,
      reason: input.reason || undefined,
    }),
  });
}

// ── Reports filed by the viewer ──────────────────────────────────────────────
// GET /users/me/reports — reporter-scoped read joining the three report
// tables (user/listing/conversation) to their safety notice and case
// outcome. Live-only; fixtures seed no report history.

export interface MyReport {
  reportId: string;
  kind: 'user' | 'listing' | 'conversation';
  reason: string;
  subjectId: string;
  /** submitted | reviewing | actioned | dismissed */
  status: string;
  noticeId: string | null;
  noticeAcknowledgement: string | null;
  caseId: string | null;
  /** open | under_review | decision_pending | enforcement_pending |
   *  closed | appealed | reopened */
  caseStatus: string | null;
  /** no_violation | restrict | escalate | emergency_hold */
  outcome: string | null;
  createdAt: string;
}

interface ApiMyReport {
  reportId: string;
  kind: 'user' | 'listing' | 'conversation';
  reason: string;
  subjectId: string;
  status: string;
  noticeId: string | null;
  noticeAcknowledgement: string | null;
  caseId: string | null;
  caseStatus: string | null;
  outcome: string | null;
  createdAt: string;
}

export async function fetchMyReports(signal?: AbortSignal): Promise<MyReport[]> {
  const payload = await fetchJson<{ ok?: boolean; reports?: ApiMyReport[] }>(
    '/users/me/reports',
    undefined,
    { signal },
  );
  return (payload.reports ?? []).map((r) => ({
    reportId: r.reportId,
    kind: r.kind,
    reason: r.reason,
    subjectId: r.subjectId,
    status: r.status,
    noticeId: r.noticeId,
    noticeAcknowledgement: r.noticeAcknowledgement,
    caseId: r.caseId,
    caseStatus: r.caseStatus,
    outcome: r.outcome,
    createdAt: r.createdAt,
  }));
}
