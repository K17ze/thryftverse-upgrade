'use client';

/**
 * BotDetail — /agents/[id]: what the assistant does, the permissions it
 * declares, its recent ledger activity, and the state the wire actually
 * supports.
 *
 * Two honest models, picked by what the row carries:
 *  - Live rows (status field present): owned custom bots get the
 *    enable/disable status write (PATCH /bots/:id); system bots are
 *    read-only capability cards — there is no user-level install, bots
 *    deploy into conversations from chat.
 *  - Fixture rows (no status): the authored session install model.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { triggerById, triggerModeById } from '@/lib/contracts/agents';
import { formatCount } from '@/lib/utils/format';
import { useAgentBot, useAgentLedger } from '@/lib/hooks/agents-queries';
import { AgentsSignInWall, useAgentsAccess } from './AgentsGate';
import { AgentIcon } from './AgentIcon';
import { AgentRunRow } from './AgentRunRow';
import { WireState, FixtureInstallState } from './detail/BotStateRail';
import { BotPermissionsSection } from './detail/BotPermissionsSection';

function DetailSkeleton() {
  return (
    <div className="px-4 pt-2 sm:px-6" aria-busy aria-label="Loading agent">
      <div className="flex items-center gap-3.5">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-2 h-3 w-64 max-w-full" />
        </div>
      </div>
      <Skeleton className="mt-6 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-3/4" />
      <Skeleton className="mt-10 h-4 w-32" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="mt-4 h-8 w-full" />
      ))}
    </div>
  );
}

function DetailHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-1 px-2 pt-1 sm:px-4 lg:col-span-2">
      <IconButton name="back" aria-label="Back to agents" onClick={() => router.push('/agents')} />
      <h1 className="clamp-1 flex-1 text-screen-title text-text-primary">
        {title}
      </h1>
    </div>
  );
}

export function BotDetail({ botId }: { botId: string }) {
  const router = useRouter();
  const { data: bot, isLoading, error } = useAgentBot(botId);
  const { data: runs } = useAgentLedger(botId);
  const access = useAgentsAccess(error);

  if (access === 'loading' || isLoading) {
    return (
      <>
        <DetailHeader title="" />
        <DetailSkeleton />
      </>
    );
  }

  if (access === 'blocked') {
    return (
      <>
        <DetailHeader title="Agent" />
        <AgentsSignInWall />
      </>
    );
  }

  if (!bot) {
    return (
      <>
        <DetailHeader title="Agent" />
        <EmptyState
          icon="inbox"
          title="Agent not found"
          subtitle="It may have been removed, or the link is out of date."
          actionLabel="Back to agents"
          onAction={() => router.push('/agents')}
        />
      </>
    );
  }

  // Every displayed field comes from the row — model, trigger and install
  // counts render only when present.
  const meta = [
    bot.origin === 'own' ? 'Built by you' : `By ${bot.creator}`,
    bot.isDraft === true ? 'Draft' : null,
    bot.model ?? null,
    typeof bot.installs === 'number' ? `${formatCount(bot.installs)} installs` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const triggerLine = bot.triggerId
    ? (() => {
        const t = triggerById(bot.triggerId);
        return `Trigger: ${t.label}. ${t.detail}.`;
      })()
    : bot.triggerMode
      ? (() => {
          const t = triggerModeById(bot.triggerMode);
          return `${t.label} — ${t.detail}.`;
        })()
      : null;

  const recentRuns = (runs ?? []).slice(0, 6);

  return (
    <div className="pb-16 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-12">
      <DetailHeader title={bot.name} />

      {/* Identity */}
      <div className="flex items-center gap-3.5 px-4 pt-2 sm:px-6 lg:col-start-1">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center text-text-primary">
          <AgentIcon category={bot.category} name={bot.name} size={26} />
        </span>
        <div className="min-w-0">
          <p className="text-body-emphasis font-medium text-text-primary">{bot.purpose}</p>
          <p className="mt-0.5 text-caption text-text-muted">{meta}</p>
        </div>
      </div>

      {/* What it does */}
      <section aria-label="What it does" className="mt-8 lg:col-start-1">
        <h2 className="px-4 text-label text-text-muted sm:px-6">
          What it does
        </h2>
        <p className="mt-2 px-4 text-body leading-relaxed text-text-secondary sm:px-6">
          {bot.description}
        </p>
        {triggerLine ? (
          <p className="mt-3 px-4 text-caption text-text-muted sm:px-6">
            {triggerLine}
          </p>
        ) : null}
      </section>

      {/* State — the sticky action rail at lg (top of the right column);
          in-flow between the description and permissions on mobile. */}
      <section
        aria-label="Status"
        className="mt-8 lg:sticky lg:top-24 lg:col-start-2 lg:row-start-2 lg:row-span-3 lg:mt-0 lg:self-start"
      >
        {bot.status !== undefined ? (
          <WireState bot={bot} />
        ) : (
          <FixtureInstallState bot={bot} />
        )}
      </section>

      {/* Permissions — the granted capability set by risk tier, plus any
          wire permissions outside the taxonomy, verbatim. */}
      <BotPermissionsSection bot={bot} />

      {/* Recent activity — runs full canvas width at lg under the rail. */}
      <section aria-label="Recent activity" className="mt-10 lg:col-span-2">
        <div className="flex items-baseline justify-between px-4 sm:px-6">
          <h2 className="text-section-title font-semibold text-text-primary">Activity</h2>
          {(runs?.length ?? 0) > 0 ? (
            <Link
              href={`/agents/ledger?bot=${bot.id}`}
              className="pressable text-caption font-medium text-text-secondary"
            >
              Full ledger
            </Link>
          ) : null}
        </div>
        {recentRuns.length > 0 ? (
          <ul className="mt-2 divide-y divide-border-subtle border-y border-border-subtle px-4 sm:px-6">
            {recentRuns.map((run) => (
              <AgentRunRow
                key={run.id}
                run={run}
                botName={bot.name}
                botCategory={bot.category}
              />
            ))}
          </ul>
        ) : (
          <p className="mt-2 border-y border-border-subtle px-4 py-8 text-center text-body text-text-muted sm:px-6">
            {bot.enabled || bot.installed === true
              ? 'No runs yet — they appear here the first time it acts.'
              : 'Nothing on record for this agent.'}
          </p>
        )}
      </section>
    </div>
  );
}
