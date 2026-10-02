'use client';

/**
 * AgentsHub — the /agents surface. "Your agents" holds the caller's own
 * custom bots (live) or the fixture's installed assistants, each with the
 * status toggle the owner can actually write. The directory is the public
 * system-bot catalog — capability cards, no install affordance (live bots
 * deploy into conversations, never into the account). Flat canvas,
 * hairline sections, honest copy.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import type { AgentBot, AgentCategory } from '@/lib/contracts/agents';
import { AGENT_CATEGORIES } from '@/lib/contracts/agents';
import { parseApiError } from '@/lib/api/http';
import { useAgentActions, useAgentBots } from '@/lib/hooks/agents-queries';
import { AgentsSignInWall, useAgentsAccess } from './AgentsGate';
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
  icon: 'receipt' | 'trending' | 'bookmark' | 'key';
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
        <span className="clamp-2 mt-0.5 block text-caption text-text-muted">{detail}</span>
      </span>
      <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
    </Link>
  );
}

export function AgentsHub() {
  const router = useRouter();
  const { show } = useToast();
  const { data: bots, isLoading, isError, error, refetch } = useAgentBots();
  const { setEnabled } = useAgentActions();
  const access = useAgentsAccess(error);
  const [filter, setFilter] = useState<CategoryFilter>('all');

  // "Your agents" = bots the caller owns (live) plus fixture session
  // installs. The directory is everything else — read-only in live mode.
  const yours = useMemo(
    () => (bots ?? []).filter((b) => b.origin === 'own' || b.installed === true),
    [bots],
  );
  const directory = useMemo(
    () =>
      (bots ?? []).filter(
        (b) =>
          b.origin !== 'own' &&
          b.installed !== true &&
          (filter === 'all' || b.category === filter),
      ),
    [bots, filter],
  );

  const handleToggle = (bot: AgentBot) => async (enabled: boolean) => {
    try {
      await setEnabled(bot.id, enabled);
      show(enabled ? `${bot.name} resumed` : `${bot.name} paused`, 'info');
    } catch (err) {
      // The optimistic cache already reverted — report the server's answer.
      show(parseApiError(err, `Couldn't update ${bot.name}`).message, 'error');
    }
  };

  if (access === 'loading' || isLoading) {
    return (
      <>
        <HubHeader onCreate={() => router.push('/agents/builder')} />
        <HubSkeleton />
      </>
    );
  }

  if (access === 'blocked') {
    return (
      <>
        <HubHeader onCreate={() => router.push('/agents/builder')} />
        <AgentsSignInWall />
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
          subtitle={parseApiError(error, 'Check your connection and try again.').message}
          actionLabel="Try again"
          onAction={() => void refetch()}
        />
      </>
    );
  }

  return (
    <div className="pb-16 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-x-12">
      <div className="min-w-0">
        <HubHeader onCreate={() => router.push('/agents/builder')} />
        <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
          Assistants that reply in your conversations. Every run is recorded
          in the ledger.
        </p>

        {/* Your agents — owned bots (and fixture installs) with the
            status toggle the wire actually supports. */}
        <section aria-label="Your agents" className="mt-8">
          <div className="flex items-baseline justify-between px-4 sm:px-6">
            <h2 className="text-section-title font-semibold text-text-primary">Your agents</h2>
            {yours.length > 0 ? (
              <p className="tnum text-caption text-text-muted">
                {yours.filter((b) => b.enabled).length} of {yours.length} enabled
              </p>
            ) : null}
          </div>
          <div className="mt-3 divide-y divide-border-subtle border-y border-border-subtle xl:grid xl:grid-cols-2 xl:gap-x-8">
            {yours.length > 0 ? (
              yours.map((bot) => (
                <BotRow
                  key={bot.id}
                  bot={bot}
                  variant="installed"
                  onToggle={handleToggle(bot)}
                />
              ))
            ) : (
              <div className="px-4 py-8 text-center sm:px-6 xl:col-span-2">
                <p className="text-body text-text-secondary">No agents of your own yet.</p>
                <p className="mt-1 text-caption text-text-muted">
                  <Link href="/agents/builder" className="text-text-primary underline underline-offset-2">
                    Build your own
                  </Link>
                  {' '}— the directory below is what ThryftVerse ships.
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
          <div className="mt-2 divide-y divide-border-subtle border-y border-border-subtle xl:grid xl:grid-cols-2 xl:gap-x-8">
            {directory.length > 0 ? (
              directory.map((bot) => <BotRow key={bot.id} bot={bot} variant="directory" />)
            ) : (
              <p className="px-4 py-8 text-center text-body text-text-muted sm:px-6 xl:col-span-2">
                No agents in this specialty yet.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Oversight — ledger + feed tuning; a sticky rail at lg, in-flow on
          mobile where the section order is unchanged. */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <section aria-label="Oversight" className="mt-10 lg:mt-0">
          <h2 className="hidden px-4 pb-2 text-label text-text-muted lg:block lg:px-5">
            Oversight
          </h2>
          <div className="divide-y divide-border-subtle border-y border-border-subtle">
            <LinkRow
              href="/agents/studio"
              icon="key"
              label="Agent studio"
              detail="Connections, approvals and device keys"
            />
            <LinkRow
              href="/agents/ledger"
              icon="receipt"
              label="Agent ledger"
              detail="Every action your agents have taken"
            />
            <LinkRow
              href="/agents/memory"
              icon="bookmark"
              label="Agent memory"
              detail="See and forget what your agents remember"
            />
            <LinkRow
              href="/agents/algorithm"
              icon="trending"
              label="Your algorithm"
              detail="Tune what your home feed favours"
            />
          </div>
        </section>
      </aside>
    </div>
  );
}

function HubHeader({ onCreate }: { onCreate: () => void }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
      <IconButton name="back" aria-label="Back" onClick={() => router.back()} />
      <h1 className="flex-1 text-screen-title text-text-primary">Agents</h1>
      <Button variant="secondary" size="sm" icon="plus" onClick={onCreate}>
        New agent
      </Button>
    </div>
  );
}
