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
  AGENT_BOT_STATUS_LABELS,
  CAPABILITY_RISK_LABELS,
  RISK_GROUPS,
  isAgentCapability,
  riskWord,
  triggerById,
  triggerModeById,
  type AgentBot,
  type RiskLevel,
} from '@/lib/contracts/agents';
import { parseApiError } from '@/lib/api/http';
import { formatCount } from '@/lib/utils/format';
import {
  useAgentActions,
  useAgentBot,
  useAgentLedger,
} from '@/lib/hooks/agents-queries';
import { AgentsSignInWall, useAgentsAccess } from './AgentsGate';
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

/** The state rail for a live wire row: the real status, plus the owner
 *  toggle where the server accepts it. */
function WireState({ bot }: { bot: AgentBot }) {
  const { show } = useToast();
  const { setEnabled, deleteBot } = useAgentActions();
  const router = useRouter();

  const statusLabel = bot.status ? AGENT_BOT_STATUS_LABELS[bot.status] : 'Unknown';
  const draftNote =
    bot.isDraft === true
      ? 'Draft — it can’t join a conversation until it’s published.'
      : null;

  const onToggle = async (enabled: boolean) => {
    try {
      await setEnabled(bot.id, enabled);
      show(enabled ? `${bot.name} enabled` : `${bot.name} disabled`, 'info');
    } catch (err) {
      show(parseApiError(err, `Couldn't update ${bot.name}`).message, 'error');
    }
  };

  const onDelete = async () => {
    try {
      await deleteBot(bot.id);
      show(`${bot.name} deleted`, 'info');
      router.push('/agents');
    } catch (err) {
      show(parseApiError(err, `Couldn't delete ${bot.name}`).message, 'error');
    }
  };

  return (
    <div className="border-y border-border-subtle px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body-emphasis text-text-primary">
            {statusLabel}
          </p>
          <p className="mt-0.5 text-caption text-text-muted">
            {bot.canToggle
              ? draftNote ??
                (bot.enabled
                  ? 'Enabled — deploy it into a conversation to run it.'
                  : 'Disabled — it won’t reply until you enable it.')
              : bot.enabled
                ? 'Available — deploy it into a conversation from chat.'
                : bot.runtimeReadinessReason ??
                  'Not available to deploy right now.'}
          </p>
        </div>
        {bot.canToggle === true ? (
          <Switch
            checked={bot.enabled}
            onChange={(enabled) => void onToggle(enabled)}
            aria-label={`${bot.enabled ? 'Disable' : 'Enable'} ${bot.name}`}
          />
        ) : null}
      </div>
      {bot.canToggle === true ? (
        <div className="mt-3 border-t border-border-subtle pt-3">
          <button
            type="button"
            className="pressable text-caption font-medium text-danger-text"
            onClick={() => void onDelete()}
          >
            Delete agent
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The fixture-mode install model — session installs are authored demo
 *  behaviour; every write is still awaited and failures toast. */
function FixtureInstallState({ bot }: { bot: AgentBot }) {
  const { show } = useToast();
  const { installBot, uninstallBot, setEnabled, deleteBot } = useAgentActions();
  const router = useRouter();
  const canDelete = bot.origin === 'own';
  const triggerLabel = bot.triggerId ? triggerById(bot.triggerId).label : null;

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      show(done, 'info');
    } catch (err) {
      show(parseApiError(err, 'That didn’t go through — try again').message, 'error');
    }
  };

  return (
    <div className="border-y border-border-subtle px-4 py-4 sm:px-6">
      {bot.installed ? (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-body-emphasis text-text-primary">
              {bot.enabled ? 'Running' : 'Paused'}
            </p>
            <p className="mt-0.5 text-caption text-text-muted">
              {bot.enabled
                ? `${triggerLabel ? `${triggerLabel} trigger — ` : ''}every action lands in the ledger.`
                : 'Installed but not running.'}
            </p>
          </div>
          <Switch
            checked={bot.enabled}
            onChange={(enabled) =>
              void run(
                () => setEnabled(bot.id, enabled),
                enabled ? `${bot.name} resumed` : `${bot.name} paused`,
              )
            }
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
            onClick={() =>
              void run(() => installBot(bot.id), `${bot.name} installed`)
            }
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
            onClick={() =>
              void run(
                async () => {
                  if (canDelete) {
                    await deleteBot(bot.id);
                    router.push('/agents');
                  } else {
                    await uninstallBot(bot.id);
                  }
                },
                canDelete ? `${bot.name} deleted` : `${bot.name} removed`,
              )
            }
          >
            {canDelete ? 'Delete agent' : 'Remove install'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function BotDetail({ botId }: { botId: string }) {
  const router = useRouter();
  const { data: bot, isLoading, error } = useAgentBot(botId);
  const { data: runs } = useAgentLedger(botId);
  const access = useAgentsAccess(error);

  // Permissions grouped by risk tier, in the mobile builder's display order.
  const grantsByRisk = useMemo(() => {
    if (!bot) return [];
    const order: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    return order
      .map((risk) => ({
        group: RISK_GROUPS.find((g) => g.risk === risk)!,
        capabilities: bot.capabilities.filter(
          (c) => isAgentCapability(c) && CAPABILITY_RISK_LABELS[c].risk === risk,
        ),
      }))
      .filter((entry) => entry.capabilities.length > 0);
  }, [bot]);

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

  // Wire permissions that aren't in the web capability taxonomy (e.g.
  // 'reply_in_chat') are still the bot's real grants — show them verbatim.
  const otherPermissions = (bot.permissions ?? []).filter(
    (p) => !isAgentCapability(p),
  );

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
      <section aria-label="Permissions" className="mt-8 lg:col-start-1">
        <h2 className="px-4 text-label text-text-muted sm:px-6">
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
        {otherPermissions.length > 0 ? (
          <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle px-4 sm:px-6">
            {otherPermissions.map((p) => (
              <PermissionRow key={p} label={p} riskWord="Declared" />
            ))}
          </ul>
        ) : null}
        {grantsByRisk.length === 0 && otherPermissions.length === 0 ? (
          <p className="mt-2 px-4 text-caption text-text-muted sm:px-6">
            This agent declares no permissions.
          </p>
        ) : null}
        {/* Fixture rows carry only the conservative template grants, so the
            assurance holds there; a wire bot can reply in chat and we say
            nothing it can't back up. */}
        {bot.permissions === undefined ? (
          <p className="mt-3 px-4 text-caption text-text-muted sm:px-6">
            It can&rsquo;t spend money, publish, or message on your behalf. Ask-first
            actions always wait for you.
          </p>
        ) : null}
      </section>

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
