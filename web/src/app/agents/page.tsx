'use client';

import { AgentsHub } from '@/components/agents';

export default function AgentsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl pb-16">
      <h1 className="sr-only">Agents</h1>
      <AgentsHub />
    </div>
  );
}
