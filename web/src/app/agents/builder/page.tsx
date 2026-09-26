'use client';

import { BotBuilder } from '@/components/agents';

export default function AgentBuilderPage() {
  return (
    <div className="mx-auto w-full max-w-2xl pb-16">
      <h1 className="sr-only">Create an agent</h1>
      <BotBuilder />
    </div>
  );
}
