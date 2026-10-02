import type {
  SupportTicket,
  SupportTopicId,
} from '@/lib/contracts/support';
import { SUPPORT_TICKETS } from '@/lib/data/fixtures-support';
import { DATA_MODE } from '@/lib/api/client';
import * as supportService from '@/lib/api/services/support';

export const TICKETS_KEY = ['support-tickets'] as const;
export const CASE_KEY = 'support-case';

const tick = (ms = 360) => new Promise((r) => setTimeout(r, ms));
/** Optimistic-send settle delay — fixture mode only, mirrors the composer. */
export const SEND_MS = 700;

export async function fetchTickets(isGuest: boolean): Promise<SupportTicket[]> {
  // Guests have no case list — fixture seeds belong to the demo identity
  // and a live fetch would just 401.
  if (isGuest) return [];
  if (DATA_MODE === 'live') {
    // Cases and tickets are two server models behind one list — fetch
    // both, merge newest-first.
    const [cases, tickets] = await Promise.all([
      supportService.fetchSupportCases(),
      supportService.fetchSupportTickets(),
    ]);
    return [...cases, ...tickets].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  await tick();
  return SUPPORT_TICKETS.map((t) => ({ ...t }));
}

/** Guest and authed sessions keep separate caches — signing in or out
 *  re-seeds rather than leaking one identity's cases into the other. */
export const ticketsKey = (isGuest: boolean) =>
  [...TICKETS_KEY, isGuest ? 'guest' : 'authed'] as const;

export interface NewTicketInput {
  topicId: SupportTopicId;
  /**
   * The real order id this request is bound to — live mode POSTs it as
   * `orderId` to /support/tickets, which rejects ids the caller isn't a
   * party to. There is no unbound case-create route; a null value cannot
   * create a live ticket.
   */
  orderRef: string | null;
  message: string;
  /** Evidence photo URLs — uploaded media URLs in live mode, session-local
   *  object URLs in fixture mode (the same honesty boundary as messages). */
  evidenceUris?: string[];
}
