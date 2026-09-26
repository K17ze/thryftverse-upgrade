'use client';

/**
 * BotDetail — /agents/[id]: what the assistant does, the permissions it
 * needs (capability grants with honest risk words), its recent ledger
 * activity, and the install/run state.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { Switch } from '@/components/settings/Switch';
import { useToast } from '@/components/ui/Toast';
import {
  CAPABILITY_RISK_LABELS,
  RISK_GROUPS,
  riskWord,
  triggerById,
  type RiskLevel,
} from '@/lib/contracts/agents';
import { formatCount } from '@/lib/utils/format';
import {
  useAgentActions,
  useAgentBot,
  useAgentLedger,
} from '@/lib/hooks/agents-queries';
import { AgentIcon } from './AgentIcon';
import { AgentRunRow, PermissionRow } from './AgentRunRow';

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

export function BotDetail({ botId }: { botId: string }) {
  const router = useRouter();
  const { show } = useToast();
  const { data: bot, isLoading } = useAgentBot(botId);
  const { data: runs } = useAgentLedger(botId);
  const { installBot, uninstallBot, setEnabled, deleteBot } = useAgentActions();

  // Permissions grouped by risk tier, in the mobile builder's display order.
  const grantsByRisk = useMemo(() => {
    if (!bot) return [];
    const order: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    return order
      .map((risk) => ({
        group: RISK_GROUPS.find((g) => g.risk === risk)!,
        capabilities: bot.capabilities.filter(
          (c) => CAPABILITY_RISK_LABELS[c].risk === risk,
        ),
      }))
      .filter((entry) => entry.capabilities.length > 0);
  }, [bot]);

  if (isLoading) {
    return (
      <>
        <DetailHeader title="" />
        <DetailSkeleton />
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
          subtitle="It may have been removed from the directory."
          actionLabel="Back to agents"
          onAction={() => router.push('/agents')}
        />
      </>
    );
  }

  const trigger = triggerById(bot.triggerId);
  const recentRuns = (runs ?? []).slice(0, 6);
  const canDelete = bot.origin === 'own';

  return (
    <div className="pb-16">
      <DetailHeader title={bot.name} />

      {/* Identity */}
      <div className="flex items-center gap-3.5 px-4 pt-2 sm:px-6">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center text-text-primary">
          <AgentIcon category={bot.category} name={bot.name} size={26} />
        </span>
        <div className="min-w-0">
          <p className="text-body-emphasis font-medium text-text-primary">{bot.purpose}</p>
          <p className="mt-0.5 text-caption text-text-muted">
            {bot.origin === 'own' ? 'Built by you' : `By ${bot.creator}`} ·{' '}
            {bot.model} · {formatCount(bot.installs)} installs
          </p>
        </div>
      </div>

      {/* What it does */}
      <section aria-label="What it does" className="mt-8">
        <h2 className="px-4 text-label font-semibold uppercase tracking-wider text-text-muted sm:px-6">
          What it does
        </h2>
        <p className="mt-2 px-4 text-body leading-relaxed text-text-secondary sm:px-6">
          {bot.description}
        </p>
        <p className="mt-3 px-4 text-caption text-text-muted sm:px-6">
          Trigger: {trigger.label}. {trigger.detail}.
        </p>
      </section>

      {/* Install state */}
      <section aria-label="Install" className="mt-8">
        <div className="border-y border-border-subtle px-4 py-4 sm:px-6">
          {bot.installed ? (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-body-emphasis text-text-primary">
                  {bot.enabled ? 'Running' : 'Paused'}
                </p>
                <p className="mt-0.5 text-caption text-text-muted">
                  {bot.enabled
                    ? `${trigger.label} trigger — every action lands in the ledger.`
                    : 'Installed but not running.'}
                </p>
              </div>
              <Switch
                checked={bot.enabled}
                onChange={(enabled) => {
                  setEnabled(bot.id, enabled);
                  show(enabled ? `${bot.name} resumed` : `${bot.name} paused`, 'info');
                }}
                aria-label={`${bot.enabled ? 'Pause' : 'Resume'} ${bot.name}`}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-body-emphasis text-text-primary">Not installed</p>
                <p className="mt-0.5 text-caption text-text-muted">
                  Install it and it runs on the permissions below — nothing more.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  installBot(bot.id);
                  show(`${bot.name} installed`, 'success');
                }}
              >
                Install
              </Button>
            </div>
          )}
          {bot.installed ? (
            <div className="mt-3 border-t border-border-subtle pt-3">
              <button
                type="button"
                className="pressable text-caption font-medium text-danger-text"
                onClick={() => {
                  if (canDelete) {
                    deleteBot(bot.id);
                    show(`${bot.name} deleted`, 'info');
                    router.push('/agents');
                  } else {
                    uninstallBot(bot.id);
                    show(`${bot.name} removed`, 'info');
                  }
                }}
              >
                {canDelete ? 'Delete agent' : 'Remove install'}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* Permissions — the granted capability set by risk tier */}
      <section aria-label="Permissions" className="mt-8">
        <h2 className="px-4 text-label font-semibold uppercase tracking-wider text-text-muted sm:px-6">
          What it needs
        </h2>
        {grantsByRisk.map(({ group, capabilities }) => (
          <div key={group.risk} className="mt-4">
            <p className="px-4 text-caption font-medium text-text-secondary sm:px-6">
              {group.title}
              <span className="text-text-muted"> — {group.hint}</span>
            </p>
            <ul className="mt-1 divide-y divide-border-subtle border-y border-border-subtle px-4 sm:px-6">
              {capabilities.map((cap) => (
                <PermissionRow
                  key={cap}
                  label={CAPABILITY_RISK_LABELS[cap].label}
                  riskWord={riskWord(CAPABILITY_RISK_LABELS[cap].risk)}
                />
              ))}
            </ul>
          </div>
        ))}
        <p className="mt-3 px-4 text-caption text-text-muted sm:px-6">
          It can&rsquo;t spend money, publish, or message on your behalf. Ask-first
          actions always wait for you.
        </p>
      </section>

      {/* Recent activity */}
      <section aria-label="Recent activity" className="mt-10">
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
            {bot.installed
              ? 'No runs yet — they appear here the first time it acts.'
              : 'Nothing on record for this agent.'}
          </p>
        )}
      </section>
    </div>
  );
}

function DetailHeader({ title }: { title: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
      <IconButton name="back" aria-label="Back" onClick={() => router.back()} />
      <h1 className="clamp-1 flex-1 text-screen-title font-semibold text-text-primary">
        {title}
      </h1>
    </div>
  );
}
