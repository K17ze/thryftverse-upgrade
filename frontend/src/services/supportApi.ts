import { fetchJson } from '../lib/apiClient';

export interface SupportTicket {
  id: string;
  orderId: string;
  topicId: string;
  topicLabel: string;
  details: string;
  status: 'open' | 'resolved' | 'closed';
  createdAt: string;
  updatedAt: string;
}

interface CreateSupportTicketResponse {
  ok: true;
  ticket: SupportTicket;
}

interface ListSupportTicketsResponse {
  ok: true;
  tickets: SupportTicket[];
}

interface UpdateSupportTicketStatusResponse {
  ok: true;
  ticketId: string;
  status: SupportTicket['status'];
}

export async function createSupportTicket(
  orderId: string,
  topicId: string,
  topicLabel: string,
  details: string
): Promise<SupportTicket> {
  const res = await fetchJson<CreateSupportTicketResponse>('/support/tickets', {
    method: 'POST',
    body: JSON.stringify({ orderId, topicId, topicLabel, details }),
  });
  return res.ticket;
}

export async function listSupportTickets(): Promise<SupportTicket[]> {
  const res = await fetchJson<ListSupportTicketsResponse>('/support/tickets');
  return res.tickets;
}

export async function listSupportTicketsForOrder(orderId: string): Promise<SupportTicket[]> {
  const res = await fetchJson<ListSupportTicketsResponse>(`/support/tickets/order/${orderId}`);
  return res.tickets;
}

export async function updateSupportTicketStatus(
  ticketId: string,
  status: SupportTicket['status']
): Promise<void> {
  await fetchJson<UpdateSupportTicketStatusResponse>(`/support/tickets/${ticketId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}