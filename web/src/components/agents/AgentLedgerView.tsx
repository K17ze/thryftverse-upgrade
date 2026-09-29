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
import { parseApiError } from '@/lib/api/http';
import { useAgentBots, useAgentLedger } from '@/lib/hooks/agents-queries';
import { AgentsSignInWall, useAgentsAccess } from './AgentsGate';
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
  // Unscoped feed drives the filter chips; the scoped feed (a real ?botId=
  // query on the wire) drives the rows.
  const { data: allRuns } = useAgentLedger();
  const scopedBotId = filterBotId === 'all' ? undefined : filterBotId;
  const {
    data: runs,
    isLoading: runsLoading,
    isError,
    error,
    refetch,
  } = useAgentLedger(scopedBotId);
  const access = useAgentsAccess(error);

  const botById = useMemo(() => new Map((bots ?? []).map((b) => [b.id, b])), [bots]);

  // Filter chips: every bot that has at least one ledger row.
  const filterableBots = useMemo(() => {
    const ids = new Set((allRuns ?? []).map((r) => r.botId));
    return (bots ?? []).filter((b) => ids.has(b.id));
  }, [bots, allRuns]);

  const visible = useMemo(() => runs ?? [], [runs]);

  const setFilter = (id: string) => {
    router.replace(id === 'all' ? '/agents/ledger' : `/agents/ledger?bot=${id}`);
  };

  const isLoading = botsLoading || runsLoading || access === 'loading';
  const filterName =
    filterBotId === 'all' ? null : botById.get(filterBotId)?.name ?? 'This agent';

  return (
    <div className="pb-16">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to agents" onClick={() => router.push('/agents')} />
        <h1 className="flex-1 text-screen-title text-text-primary">
          Agent ledger
        </h1>
      </div>
      <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
        Every action your agents have taken — drafts, alerts, sweeps and
        pauses. Nothing runs without a row here.
      </p>

      {/* Bot filter */}
      {access === 'blocked' ? (
        <div className="mt-8">
          <AgentsSignInWall title="Sign in to see the ledger" />
        </div>
      ) : !isLoading && filterableBots.length > 0 ? (
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
        {access === 'blocked' ? null : isLoading ? (
          <LedgerSkeleton />
        ) : isError || !runs ? (
          <EmptyState
            icon="receipt"
            title="Couldn't load the ledger"
            subtitle={parseApiError(error, 'Check your connection and try again.').message}
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
                : 'When one of your agents acts in a conversation, the run is recorded here.'
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
