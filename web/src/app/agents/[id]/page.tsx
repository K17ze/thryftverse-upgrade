'use client';

import { useParams } from 'next/navigation';
import { BotDetail } from '@/components/agents';

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="mx-auto w-full max-w-2xl pb-16">
      <BotDetail botId={params?.id ?? ''} />
    </div>
  );
}
