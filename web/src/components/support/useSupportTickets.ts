'use client';

/**
 * Support session state — the react-query cache doubles as the session
 * ticket store, mirroring the mobile store's supportTickets slice. Seeds
 * from fixtures-support on first mount; create/reply/accept/escalate/CSAT
 * mutate the cache so tickets survive in-app navigation for the whole
 * client session. A hard reload re-seeds — honest fixture-mode behaviour.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SupportTicket,
  SupportTopicId,
} from '@/lib/contracts/support';
import { topicById } from '@/lib/contracts/support';
import { SUPPORT_TICKETS } from '@/lib/data/fixtures-support';
import { DATA_MODE } from '@/lib/api/client';
import * as supportService from '@/lib/api/services/support';

const TICKETS_KEY = ['support-tickets'] as const;

const tick = (ms = 360) => new Promise((r) => setTimeout(r, ms));

async function fetchTickets(): Promise<SupportTicket[]> {
  if (DATA_MODE === 'live') {
    return supportService.fetchSupportCases();
  }
  await tick();
  return SUPPORT_TICKETS.map((t) => ({ ...t }));
}

/**
 * Session-scoped ticket state: staleTime/gcTime Infinity keeps created
 * cases and replies alive across in-app navigation in fixture mode; live
 * mode refetches normally.
 */
export function useSupportTickets() {
  return useQuery({
    queryKey: TICKETS_KEY,
    queryFn: fetchTickets,
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

export interface NewTicketInput {
  topicId: SupportTopicId;
  orderRef: string | null;
  message: string;
}

/** One mutation surface for every case action — all cache-local. */
export function useSupportActions() {
  const queryClient = useQueryClient();

  const update = (fn: (tickets: SupportTicket[]) => SupportTicket[]) => {
    queryClient.setQueryData<SupportTicket[]>(TICKETS_KEY, (old) =>
      old ? fn(old) : old,
    );
  };

  const mapTicket = (
    ticketId: string,
    fn: (ticket: SupportTicket) => SupportTicket,
  ) => {
    update((tickets) =>
      tickets.map((t) => (t.id === ticketId ? fn(t) : t)),
    );
  };

  return {
    /** Create a case — live mode posts to /support/cases and invalidates;
     *  fixture mode writes the session cache for navigation. */
    createTicket: (input: NewTicketInput): Promise<SupportTicket> | SupportTicket => {
      if (DATA_MODE === 'live') {
        return supportService
          .createSupportCase(input)
          .then((created) => {
            void queryClient.invalidateQueries({ queryKey: TICKETS_KEY });
            return created;
          });
      }
      const now = new Date().toISOString();
      const id = `tv-${Date.now().toString(36)}`;
      const topic = topicById(input.topicId);
      const ticket: SupportTicket = {
        id,
        ref: id.toUpperCase(),
        topicId: input.topicId,
        topicLabel: topic?.label ?? 'Support',
        orderRef: input.orderRef?.trim() ? input.orderRef.trim() : null,
        status: 'open',
        priority: 'normal',
        messages: [
          {
            id: `${id}-m1`,
            role: 'customer',
            authorName: null,
            body: input.message.trim(),
            createdAt: now,
            status: 'sent',
          },
        ],
        events: [
          {
            kind: 'opened',
            label: 'Case opened',
            detail: topic?.label,
            at: now,
          },
        ],
        resolution: null,
        csat: null,
        createdAt: now,
        updatedAt: now,
      };
      update((tickets) => [ticket, ...tickets]);
      return ticket;
    },

    /** Optimistic customer reply — clock receipt until marked sent.
     *  Live mode posts to /support/cases/:id/messages then invalidates. */
    appendMessage: (ticketId: string, body: string): string => {
      const messageId = `m-${Date.now().toString(36)}`;
      const now = new Date().toISOString();
      if (DATA_MODE === 'live') {
        void supportService
          .postSupportCaseMessage(ticketId, body)
          .then(() => queryClient.invalidateQueries({ queryKey: TICKETS_KEY }))
          .catch(() => undefined);
      }
      mapTicket(ticketId, (ticket) => ({
        ...ticket,
        messages: [
          ...ticket.messages,
          {
            id: messageId,
            role: 'customer' as const,
            authorName: null,
            body,
            createdAt: now,
            status: 'sending' as const,
          },
        ],
        updatedAt: now,
      }));
      return messageId;
    },

    /** Resolve the optimistic send: mark sent + system acknowledgement. */
    confirmMessage: (ticketId: string, messageId: string): void => {
      const now = new Date().toISOString();
      mapTicket(ticketId, (ticket) => ({
        ...ticket,
        messages: [
          ...ticket.messages.map((m) =>
            m.id === messageId ? { ...m, status: 'sent' as const } : m,
          ),
          {
            id: `${messageId}-ack`,
            role: 'system' as const,
            authorName: null,
            body: 'Added to your case — the support team has been notified.',
            createdAt: now,
            status: 'sent' as const,
          },
        ],
        updatedAt: now,
      }));
    },

    acceptResolution: (ticketId: string): void => {
      const now = new Date().toISOString();
      mapTicket(ticketId, (ticket) => ({
        ...ticket,
        status: 'closed',
        messages: [
          ...ticket.messages,
          {
            id: `m-${Date.now().toString(36)}`,
            role: 'system' as const,
            authorName: null,
            body: 'You accepted the resolution. The case is now closed.',
            createdAt: now,
            status: 'sent' as const,
          },
        ],
        events: [
          ...ticket.events,
          { kind: 'closed' as const, label: 'Case closed', at: now },
        ],
        updatedAt: now,
      }));
    },

    escalate: (ticketId: string): void => {
      const now = new Date().toISOString();
      mapTicket(ticketId, (ticket) => ({
        ...ticket,
        status: 'in_review',
        messages: [
          ...ticket.messages,
          {
            id: `m-${Date.now().toString(36)}`,
            role: 'system' as const,
            authorName: null,
            body: 'Case escalated — a specialist will review the decision.',
            createdAt: now,
            status: 'sent' as const,
          },
        ],
        events: [
          ...ticket.events,
          { kind: 'note' as const, label: 'Escalated', at: now },
        ],
        updatedAt: now,
      }));
    },

    submitCsat: (ticketId: string, rating: number, note: string): void => {
      const now = new Date().toISOString();
      mapTicket(ticketId, (ticket) => ({
        ...ticket,
        csat: { rating, note: note.trim() },
        updatedAt: now,
      }));
    },
  };
}
