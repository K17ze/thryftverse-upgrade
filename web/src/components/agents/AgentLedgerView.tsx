'use client';

/**
 * AgentLedgerView — /agents/ledger: the durable run record across every
 * installed (and previously installed) assistant. Filter by bot; each row
 * is action · target · outcome · time. Outcomes are coloured text, rows
 * over hairlines — the mobile ledger grammar.
 */

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAgentBots, useAgentLedger } from '@/lib/hooks/agents-queries';
import { AgentRunRow } from './AgentRunRow';

function LedgerSkeleton() {
  return (
    <div className="px-4 sm:px-6" aria-busy aria-label="Loading ledger">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3.5 border-b border-border-subtle py-3.5">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4" style={{ width: `${55 + (i % 3) * 12}%` }} />
            <Skeleton className="mt-2 h-3" style={{ width: `${40 + (i % 4) * 10}%` }} />
          </div>
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

export function AgentLedgerView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterBotId = searchParams.get('bot') ?? 'all';

  const { data: bots, isLoading: botsLoading } = useAgentBots();
  const { data: runs, isLoading: runsLoading, isError, refetch } = useAgentLedger();

  const botById = useMemo(() => new Map((bots ?? []).map((b) => [b.id, b])), [bots]);

  // Filter chips: every bot that has at least one ledger row.
  const filterableBots = useMemo(() => {
    const ids = new Set((runs ?? []).map((r) => r.botId));
    return (bots ?? []).filter((b) => ids.has(b.id));
  }, [bots, runs]);

  const visible = useMemo(
    () =>
      (runs ?? []).filter(
        (r) => filterBotId === 'all' || r.botId === filterBotId,
      ),
    [runs, filterBotId],
  );

  const setFilter = (id: string) => {
    router.replace(id === 'all' ? '/agents/ledger' : `/agents/ledger?bot=${id}`);
  };

  const isLoading = botsLoading || runsLoading;
  const filterName =
    filterBotId === 'all' ? null : botById.get(filterBotId)?.name ?? 'This agent';

  return (
    <div className="pb-16">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back" onClick={() => router.back()} />
        <h1 className="flex-1 text-screen-title font-semibold text-text-primary">
          Agent ledger
        </h1>
      </div>
      <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
        Every action your agents have taken — drafts, alerts, sweeps and
        pauses. Nothing runs without a row here.
      </p>

      {/* Bot filter */}
      {!isLoading && filterableBots.length > 0 ? (
        <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto px-4 sm:px-6">
          <Chip selected={filterBotId === 'all'} onClick={() => setFilter('all')}>
            All agents
          </Chip>
          {filterableBots.map((bot) => (
            <Chip
              key={bot.id}
              selected={filterBotId === bot.id}
              onClick={() => setFilter(bot.id)}
            >
              {bot.name}
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="mt-5">
        {isLoading ? (
          <LedgerSkeleton />
        ) : isError || !runs ? (
          <EmptyState
            icon="receipt"
            title="Couldn't load the ledger"
            subtitle="Check your connection and try again."
            actionLabel="Try again"
            onAction={() => void refetch()}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            compact
            icon="receipt"
            title={filterName ? `No runs for ${filterName}` : 'No activity yet'}
            subtitle={
              filterName
                ? 'It hasn\u2019t acted yet — runs land here the first time it does.'
                : 'Install an agent and every action it takes is recorded here.'
            }
            actionLabel="Browse agents"
            onAction={() => router.push('/agents')}
          />
        ) : (
          <ul className="divide-y divide-border-subtle border-y border-border-subtle px-4 sm:px-6">
            {visible.map((run) => {
              const bot = botById.get(run.botId);
              return (
                <AgentRunRow
                  key={run.id}
                  run={run}
                  botName={bot?.name ?? 'Removed agent'}
                  botCategory={bot?.category}
                  showBot
                />
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
