import type { Metadata } from 'next';
import { TicketThread } from '@/components/support/TicketThread';

export const metadata: Metadata = {
  title: 'Support case',
};

export default async function SupportCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TicketThread ticketId={id} />;
}
