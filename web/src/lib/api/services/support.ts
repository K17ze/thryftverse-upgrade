/**
 * Web support service — mirrors frontend/src/services/supportApi.ts.
 * Maps `/support/cases` rows onto the web SupportTicket contract; the
 * resolution-centre case model is the shared one.
 */

import { fetchJson } from '../http';
import type {
  SupportTicket,
  SupportTicketEvent,
  SupportTicketMessage,
} from '@/lib/contracts/support';
import { topicById } from '@/lib/contracts/support';
import type { SupportTopicId } from '@/lib/contracts/support';

interface ApiSupportCase {
  id: string;
  ref?: string;
  reference?: string;
  topicId?: string;
  topicLabel?: string;
  orderRef?: string | null;
  status?: string;
  priority?: string;
  messages?: Array<{
    id: string;
    role?: string;
    authorName?: string | null;
    body: string;
    createdAt: string;
  }>;
  events?: Array<{ kind?: string; label: string; detail?: string; at: string }>;
  resolution?: { disposition: string; note: string } | null;
  csat?: { rating: number; note: string } | null;
  createdAt: string;
  updatedAt: string;
}

function mapStatus(s: string | undefined): SupportTicket['status'] {
  switch ((s ?? '').toLowerCase()) {
    case 'open':
      return 'open';
    case 'in_review':
    case 'review':
    case 'under_review':
      return 'in_review';
    case 'resolved':
      return 'resolved';
    case 'closed':
      return 'closed';
    default:
      return 'open';
  }
}

function mapRole(r: string | undefined): SupportTicketMessage['role'] {
  switch ((r ?? '').toLowerCase()) {
    case 'agent':
    case 'agent_ai':
      return 'agent_ai';
    case 'agent_human':
    case 'human':
      return 'agent_human';
    case 'system':
      return 'system';
    default:
      return 'customer';
  }
}

function mapCase(c: ApiSupportCase): SupportTicket {
  const topicId = (c.topicId ?? 'other') as SupportTopicId;
  return {
    id: c.id,
    ref: c.ref ?? c.reference ?? c.id.toUpperCase(),
    topicId,
    topicLabel: c.topicLabel ?? topicById(topicId)?.label ?? 'Support',
    orderRef: c.orderRef ?? null,
    status: mapStatus(c.status),
    priority:
      c.priority === 'low' || c.priority === 'high' || c.priority === 'urgent'
        ? c.priority
        : 'normal',
    messages: (c.messages ?? []).map((m) => ({
      id: m.id,
      role: mapRole(m.role),
      authorName: m.authorName ?? null,
      body: m.body,
      createdAt: m.createdAt,
      status: 'sent' as const,
    })),
    events: (c.events ?? []).map(
      (e): SupportTicketEvent => ({
        kind:
          e.kind === 'opened' || e.kind === 'in_review' || e.kind === 'resolved' || e.kind === 'closed'
            ? e.kind
            : 'note',
        label: e.label,
        detail: e.detail,
        at: e.at,
      }),
    ),
    resolution: c.resolution ?? null,
    csat: c.csat ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function fetchSupportCases(signal?: AbortSignal): Promise<SupportTicket[]> {
  const payload = await fetchJson<{ ok?: boolean; items?: ApiSupportCase[]; cases?: ApiSupportCase[] }>(
    '/support/cases',
    undefined,
    { signal },
  );
  return (payload.items ?? payload.cases ?? []).map(mapCase);
}

export async function fetchSupportCase(
  id: string,
  signal?: AbortSignal,
): Promise<SupportTicket | null> {
  const payload = await fetchJson<{ ok: boolean; case?: ApiSupportCase }>(
    `/support/cases/${encodeURIComponent(id)}`,
    undefined,
    { signal },
  );
  return payload.ok && payload.case ? mapCase(payload.case) : null;
}

export async function createSupportCase(input: {
  topicId: SupportTopicId;
  orderRef: string | null;
  message: string;
}): Promise<SupportTicket> {
  const payload = await fetchJson<{ ok: boolean; case?: ApiSupportCase }>('/support/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topicId: input.topicId,
      orderRef: input.orderRef,
      message: input.message,
    }),
  });
  if (!payload.ok || !payload.case) throw new Error('Support case was not created');
  return mapCase(payload.case);
}

export async function postSupportCaseMessage(caseId: string, body: string): Promise<void> {
  await fetchJson(`/support/cases/${encodeURIComponent(caseId)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

export async function submitSupportCsat(
  caseId: string,
  input: { rating: number; note: string },
): Promise<void> {
  await fetchJson(`/support/cases/${encodeURIComponent(caseId)}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
