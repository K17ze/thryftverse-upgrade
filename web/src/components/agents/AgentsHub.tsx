'use client';

/**
 * AgentsHub — the /agents surface: your installed assistants with run
 * toggles, then the community/stock directory behind a category filter,
 * then the ledger + algorithm links. Flat canvas, hairline sections —
 * honest automation copy, no AI theatre.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import type { AgentCategory } from '@/lib/contracts/agents';
import { AGENT_CATEGORIES } from '@/lib/contracts/agents';
import { useAgentActions, useAgentBots } from '@/lib/hooks/agents-queries';
import { BotRow } from './BotRows';

type CategoryFilter = 'all' | AgentCategory;

const FILTERS: Array<{ value: CategoryFilter; label: string }> = [
  { value: 'all', label: 'All' },
  ...AGENT_CATEGORIES.map((c) => ({ value: c.value as CategoryFilter, label: c.label })),
];

function HubSkeleton() {
  return (
    <div aria-busy aria-label="Loading agents">
      <div className="mt-8 px-4 sm:px-6">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 border-b border-border-subtle py-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-56" />
            </div>
            <Skeleton className="h-7 w-12 rounded-full" />
          </div>
        ))}
      </div>
      <div className="mt-10 px-4 sm:px-6">
        <Skeleton className="h-4 w-28" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 border-b border-border-subtle py-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="mt-2 h-3 w-64 max-w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LinkRow({
  href,
  icon,
  label,
  detail,
}: {
  href: string;
  icon: 'receipt' | 'trending';
  label: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="pressable flex min-h-[56px] w-full items-center gap-1 px-4 sm:px-5"
    >
      <span className="flex h-11 w-9 shrink-0 items-center text-text-secondary">
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body-emphasis text-text-primary">{label}</span>
        <span className="clamp-1 block text-caption text-text-muted">{detail}</span>
      </span>
      <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
    </Link>
  );
}

export function AgentsHub() {
  const router = useRouter();
  const { show } = useToast();
  const { data: bots, isLoading, isError, refetch } = useAgentBots();
  const { setEnabled } = useAgentActions();
  const [filter, setFilter] = useState<CategoryFilter>('all');

  const installed = useMemo(() => (bots ?? []).filter((b) => b.installed), [bots]);
  const directory = useMemo(
    () =>
      (bots ?? []).filter(
        (b) => b.origin !== 'own' && (filter === 'all' || b.category === filter),
      ),
    [bots, filter],
  );

  const handleToggle = (botId: string, name: string) => (enabled: boolean) => {
    setEnabled(botId, enabled);
    show(enabled ? `${name} resumed` : `${name} paused`, 'info');
  };

  if (isLoading) {
    return (
      <>
        <HubHeader onCreate={() => router.push('/agents/builder')} />
        <HubSkeleton />
      </>
    );
  }

  if (isError || !bots) {
    return (
      <>
        <HubHeader onCreate={() => router.push('/agents/builder')} />
        <EmptyState
          icon="inbox"
          title="Couldn't load agents"
          subtitle="Check your connection and try again."
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      </>
    );
  }

  return (
    <div className="pb-16">
      <HubHeader onCreate={() => router.push('/agents/builder')} />
      <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
        Automation assistants that work on rules you set. Every run is recorded.
      </p>

      {/* Your agents — installed bots with run toggles */}
      <section aria-label="Your agents" className="mt-8">
        <div className="flex items-baseline justify-between px-4 sm:px-6">
          <h2 className="text-section-title font-semibold text-text-primary">Your agents</h2>
          {installed.length > 0 ? (
            <p className="tnum text-caption text-text-muted">
              {installed.filter((b) => b.enabled).length} of {installed.length} running
            </p>
          ) : null}
        </div>
        <div className="mt-3 divide-y divide-border-subtle border-y border-border-subtle">
          {installed.length > 0 ? (
            installed.map((bot) => (
              <BotRow
                key={bot.id}
                bot={bot}
                variant="installed"
                onToggle={handleToggle(bot.id, bot.name)}
              />
            ))
          ) : (
            <div className="px-4 py-8 text-center sm:px-6">
              <p className="text-body text-text-secondary">No agents installed yet.</p>
              <p className="mt-1 text-caption text-text-muted">
                Install one from the directory below, or{' '}
                <Link href="/agents/builder" className="text-text-primary underline underline-offset-2">
                  build your own
                </Link>
                .
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Directory — stock + community assistants */}
      <section aria-label="Agent directory" className="mt-10">
        <h2 className="px-4 text-section-title font-semibold text-text-primary sm:px-6">
          Directory
        </h2>
        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto px-4 sm:px-6">
          {FILTERS.map((f) => (
            <Chip key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </Chip>
          ))}
        </div>
        <div className="mt-2 divide-y divide-border-subtle border-y border-border-subtle">
          {directory.length > 0 ? (
            directory.map((bot) => <BotRow key={bot.id} bot={bot} variant="directory" />)
          ) : (
            <p className="px-4 py-8 text-center text-body text-text-muted sm:px-6">
              No agents in this specialty yet.
            </p>
          )}
        </div>
      </section>

      {/* Oversight — ledger + feed tuning */}
      <section aria-label="Oversight" className="mt-10">
        <div className="divide-y divide-border-subtle border-y border-border-subtle">
          <LinkRow
            href="/agents/ledger"
            icon="receipt"
            label="Agent ledger"
            detail="Every action your agents have taken"
          />
          <LinkRow
            href="/agents/algorithm"
            icon="trending"
            label="Your algorithm"
            detail="Tune what your home feed favours"
          />
        </div>
      </section>
    </div>
  );
}

function HubHeader({ onCreate }: { onCreate: () => void }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
      <IconButton name="back" aria-label="Back" onClick={() => router.back()} />
      <h1 className="flex-1 text-screen-title font-semibold text-text-primary">Agents</h1>
      <IconButton name="plus" aria-label="Create an agent" onClick={onCreate} />
    </div>
  );
}
