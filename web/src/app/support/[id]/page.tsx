'use client';

import { useParams } from 'next/navigation';
import { TicketThread } from '@/components/support/TicketThread';

export default function SupportCasePage() {
  const params = useParams<{ id: string }>();
  return <TicketThread ticketId={params?.id ?? ''} />;
}
