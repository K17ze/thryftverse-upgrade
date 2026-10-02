'use client';

import { useQueryClient } from '@tanstack/react-query';
import type {
  SupportTicket,
  SupportTicketMessage,
} from '@/lib/contracts/support';
import { topicById } from '@/lib/contracts/support';
import { DATA_MODE } from '@/lib/api/client';
import * as supportService from '@/lib/api/services/support';
import { useSession } from '@/lib/session/SessionProvider';
import {
  CASE_KEY,
  type NewTicketInput,
  SEND_MS,
  TICKETS_KEY,
  ticketsKey,
} from './supportModel';

export function useSupportActions() {
  const queryClient = useQueryClient();
  const { isGuest } = useSession();
  const key = ticketsKey(isGuest);

  const update = (fn: (tickets: SupportTicket[]) => SupportTicket[]) => {
    queryClient.setQueryData<SupportTicket[]>(key, (old) =>
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

  const setMessageStatus = (
    ticketId: string,
    messageId: string,
    status: SupportTicketMessage['status'],
  ) => {
    mapTicket(ticketId, (ticket) => ({
      ...ticket,
      messages: ticket.messages.map((m) =>
        m.id === messageId ? { ...m, status } : m,
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const invalidateTicket = (ticketId: string) => {
    void queryClient.invalidateQueries({ queryKey: TICKETS_KEY });
    // The reply lives in the case's event log — refetch the detail read
    // so the new customer_message event lands in the thread.
    void queryClient.invalidateQueries({
      queryKey: [CASE_KEY, isGuest ? 'guest' : 'authed', ticketId],
    });
  };

  /**
   * Resolve an optimistic send. Live mode trusts the POST only — resolve
   * marks the line sent, reject marks it failed (the row offers retry).
   * Fixture mode settles on the local tick.
   */
  const deliver = (ticketId: string, messageId: string, body: string) => {
    if (DATA_MODE === 'live') {
      void supportService
        .postSupportCaseMessage(ticketId, body)
        .then(() => {
          setMessageStatus(ticketId, messageId, 'sent');
          invalidateTicket(ticketId);
        })
        .catch(() => setMessageStatus(ticketId, messageId, 'failed'));
      return;
    }
    window.setTimeout(
      () => setMessageStatus(ticketId, messageId, 'sent'),
      SEND_MS,
    );
  };

  return {
    /**
     * Open a support request — live mode POSTs /support/tickets
     * (order-bound: orderRef must carry a real order id) and seeds the
     * returned row into the cache so the thread renders immediately.
     * Fixture mode writes the session cache for navigation.
     */
    createTicket: (input: NewTicketInput): Promise<SupportTicket> | SupportTicket => {
      if (DATA_MODE === 'live') {
        const orderId = input.orderRef?.trim();
        // The ticket model is order-bound — an unbound request cannot be
        // created. Callers without an order must not reach this path.
        if (!orderId) {
          return Promise.reject(
            new Error('A support request must be tied to an order.'),
          );
        }
        const topic = topicById(input.topicId);
        return supportService
          .createSupportTicket({
            orderId,
            topicId: input.topicId,
            topicLabel: topic?.label ?? 'Support',
            details: input.message.trim(),
            evidenceMediaUrls: input.evidenceUris,
          })
          .then((created) => {
            update((tickets) =>
              tickets.some((t) => t.id === created.id)
                ? tickets
                : [created, ...tickets],
            );
            void queryClient.invalidateQueries({ queryKey: TICKETS_KEY });
            return created;
          });
      }
      const now = new Date().toISOString();
      const id = `tv-${Date.now().toString(36)}`;
      const topic = topicById(input.topicId);
      const evidence = (input.evidenceUris ?? []).map((uri, i) => ({
        id: `${id}-ev${i + 1}`,
        uri,
      }));
      const ticket: SupportTicket = {
        id,
        ref: id.toUpperCase(),
        conversationId: null,
        topicId: input.topicId,
        topicLabel: topic?.label ?? 'Support',
        orderId: input.orderRef?.trim() ? input.orderRef.trim() : null,
        evidence: evidence.length ? evidence : undefined,
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
          // The evidence event is the same record mobile writes
          // (evidence_received) — the activity log renders it.
          ...(evidence.length
            ? [
                {
                  kind: 'evidence' as const,
                  label: 'Evidence received',
                  detail: `${evidence.length} photo${evidence.length === 1 ? '' : 's'} attached`,
                  at: now,
                },
              ]
            : []),
        ],
        resolution: null,
        csat: null,
        createdAt: now,
        updatedAt: now,
      };
      update((tickets) => [ticket, ...tickets]);
      return ticket;
    },

    /** Optimistic customer reply — clock receipt until the send resolves
     *  (live POST) or the fixture tick lands. */
    appendMessage: (ticketId: string, body: string): string => {
      const messageId = `m-${Date.now().toString(36)}`;
      const now = new Date().toISOString();
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
      deliver(ticketId, messageId, body);
      return messageId;
    },

    /** Re-send a failed reply — same body, fresh attempt. */
    retryMessage: (ticketId: string, messageId: string): void => {
      let body: string | null = null;
      mapTicket(ticketId, (ticket) => {
        const message = ticket.messages.find((m) => m.id === messageId);
        body = message?.body ?? null;
        return {
          ...ticket,
          messages: ticket.messages.map((m) =>
            m.id === messageId ? { ...m, status: 'sending' as const } : m,
          ),
        };
      });
      if (body != null) deliver(ticketId, messageId, body);
    },

    /** Fixture mode only — no accept endpoint exists yet, so live cases
     *  keep the proposed resolution without a fake cache write. */
    acceptResolution: (ticketId: string): void => {
      if (DATA_MODE === 'live') return;
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

    /**
     * Bot→human handoff — mirrors mobile POST /support/conversations/:id/
     * handoff. The case API has no handoff route, so live mode makes the
     * request through the channel that does exist: a real message on the
     * case (delivered via the same optimistic-send path as a typed reply).
     * Fixture mode additionally records the queue event + acknowledgement.
     */
    requestHandoff: (ticketId: string): string => {
      const messageId = `m-${Date.now().toString(36)}`;
      const now = new Date().toISOString();
      const handoffBody = "I'd like to talk to a person about this case.";
      mapTicket(ticketId, (ticket) => ({
        ...ticket,
        messages: [
          ...ticket.messages,
          {
            id: messageId,
            role: 'customer' as const,
            authorName: null,
            body: handoffBody,
            createdAt: now,
            status: 'sending' as const,
          },
          // Fixture only — the queue acknowledgement a specialist request
          // produces. Live mode relies on the real reply instead.
          ...(DATA_MODE === 'live'
            ? []
            : [
                {
                  id: `${messageId}-sys`,
                  role: 'system' as const,
                  authorName: null,
                  body: 'A support specialist will continue here — expect a reply within one working day.',
                  createdAt: now,
                  status: 'sent' as const,
                },
              ]),
        ],
        events:
          DATA_MODE === 'live'
            ? ticket.events
            : [
                ...ticket.events,
                {
                  kind: 'handoff' as const,
                  label: 'Specialist handoff requested',
                  at: now,
                },
              ],
        updatedAt: now,
      }));
      deliver(ticketId, messageId, handoffBody);
      return messageId;
    },

    /**
     * Contest a proposed resolution — live mode POSTs the real case-appeal
     * endpoint (/support/cases/:id/appeal) and refetches so the
     * appeal_requested event lands in the activity log. The schema
     * requires a non-empty reason; an empty textarea sends the same
     * default the native screen posts. Fixture mode writes the
     * equivalent local transition.
     */
    contestResolution: async (ticketId: string, reason: string): Promise<boolean> => {
      if (DATA_MODE === 'live') {
        try {
          await supportService.appealSupportCase(
            ticketId,
            reason.trim() || 'Appeal requested by customer.',
          );
          invalidateTicket(ticketId);
          return true;
        } catch {
          return false;
        }
      }
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
            body: reason.trim()
              ? `You contested the resolution: ${reason.trim()} A specialist will review the decision.`
              : 'Case escalated — a specialist will review the decision.',
            createdAt: now,
            status: 'sent' as const,
          },
        ],
        events: [
          ...ticket.events,
          { kind: 'note' as const, label: 'Appeal requested', at: now },
        ],
        updatedAt: now,
      }));
      return true;
    },

    /**
     * CSAT — live mode posts to /support/conversations/:id/feedback using
     * the case's conversationId (feedback lives on the conversation, not
     * the case) and only records the rating when the server accepts it.
     * Cases without a conversationId can't take feedback — the prompt is
     * hidden upstream.
     */
    submitCsat: async (
      ticketId: string,
      rating: 'helpful' | 'unhelpful',
      note: string,
    ): Promise<boolean> => {
      const apply = () =>
        mapTicket(ticketId, (ticket) => ({
          ...ticket,
          csat: { rating, note: note.trim() },
          updatedAt: new Date().toISOString(),
        }));
      if (DATA_MODE === 'live') {
        const ticket = queryClient
          .getQueryData<SupportTicket[]>(key)
          ?.find((t) => t.id === ticketId);
        if (!ticket?.conversationId) return false;
        try {
          await supportService.submitConversationFeedback(ticket.conversationId, {
            rating,
            reason: note.trim() || undefined,
          });
          apply();
          return true;
        } catch {
          return false;
        }
      }
      apply();
      return true;
    },
  };
}
