'use client';

/**
 * ConversationAgentsSection — the group chat-agents panel on
 * /inbox/[id]/info, ported from mobile GroupBotManagementScreen. Two
 * flat groups on the canvas — Connected and Available — each row carries
 * name, description, the command hint (deployed) or provenance label
 * (catalog), and the runtime status readout. Connect applies directly;
 * remove confirms first ("will stop responding in this chat"), matching
 * mobile. Rendered only where the caller proved group-manage authority —
 * the section itself stays dumb about permissions.
 */

import { useMemo, useState } from 'react';
import type { Conversation } from '@/lib/contracts/domain';
import type { ConversationAgentCategory } from '@/lib/contracts/conversationAgents';
import { Icon, type AppIconName } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { CLOSED_CONFIRM, ConfirmSheet, type ConfirmSheetState } from './ConfirmSheet';
import { useConversationAgents } from './useConversationAgents';

const CATEGORY_ICON: Record<ConversationAgentCategory, AppIconName> = {
  moderation: 'shieldCheck',
  commerce: 'offer',
  automation: 'zap',
  assistant: 'sparkles',
  safety: 'shield',
  styling: 'palette',
};

/** Mobile status readout — Ready / Limited runtime / Setup required. */
function statusLabel(status: string): string {
  if (status === 'available') return 'Ready';
  if (status === 'local-only') return 'Limited runtime';
  return 'Setup required';
}

/** Row model — the merge the mobile screen applies (deployment truth
 *  wins; catalog fields fill description when the deployment can't). */
interface AgentRowModel {
  id: string;
  name: string;
  description: string;
  category: string;
  type: 'system' | 'custom';
  commandHint: string;
  status: string;
}

export function ConversationAgentsSection({
  conversation,
}: {
  conversation: Conversation;
}) {
  const toast = useToast();
  const { data, isLoading, isError, refetch, deploy, undeploy } =
    useConversationAgents(conversation.id, true);
  const [pendingBotId, setPendingBotId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSheetState>(CLOSED_CONFIRM);

  const agents = useMemo(() => data?.agents ?? [], [data]);
  const deployments = useMemo(() => data?.deployments ?? [], [data]);

  // Connected — the deployment list is the only evidence of an installed
  // agent; runtime readiness demotes the status label honestly.
  const connected = useMemo<AgentRowModel[]>(
    () =>
      deployments.map((d) => ({
        id: d.botId,
        name: d.botName,
        description:
          d.runtimeReadinessReason ??
          agents.find((a) => a.id === d.botId)?.description ??
          'Connected to this chat',
        category: d.botCategory,
        type: d.botType,
        commandHint: d.commandHint,
        status: d.runtimeReady ? d.status : 'setup-required',
      })),
    [deployments, agents],
  );

  // Available — mobile's exact filter: not deployed, not draft/disabled,
  // not backend-required, runtime not flagged unready.
  const available = useMemo<AgentRowModel[]>(() => {
    const deployedIds = new Set(deployments.map((d) => d.botId));
    return agents
      .filter(
        (a) =>
          !deployedIds.has(a.id) &&
          !a.isDraft &&
          !a.isDisabled &&
          a.status !== 'backend-required' &&
          a.runtimeReady !== false,
      )
      .map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description || a.commandHint,
        category: a.category,
        type: a.type,
        commandHint: a.commandHint,
        status: a.status,
      }));
  }, [agents, deployments]);

  const changeDeployment = async (bot: AgentRowModel, connect: boolean) => {
    if (pendingBotId) return;
    setPendingBotId(bot.id);
    const ok = connect ? await deploy(bot.id) : await undeploy(bot.id);
    setPendingBotId(null);
    toast.show(
      ok
        ? connect
          ? `${bot.name} connected`
          : `${bot.name} removed`
        : "Couldn't apply the change — try again",
      ok ? 'success' : 'error',
    );
  };

  const confirmRemove = (bot: AgentRowModel) =>
    setConfirm({
      open: true,
      title: 'Remove agent?',
      message: `${bot.name} will stop responding in this chat.`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        await changeDeployment(bot, false);
      },
    });

  const renderRow = (
    bot: AgentRowModel,
    deployed: boolean,
    isLast: boolean,
  ) => {
    const pending = pendingBotId === bot.id;
    return (
      <div key={bot.id}>
        <div className="flex min-h-[52px] items-center gap-3 px-4 py-2.5">
          <span
            aria-hidden
            className="flex w-8 shrink-0 items-center justify-center text-text-secondary"
          >
            <Icon
              name={CATEGORY_ICON[bot.category as ConversationAgentCategory] ?? 'sparkles'}
              size={20}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="clamp-1 block text-body font-medium text-text-primary">
              {bot.name}
            </span>
            <span className="clamp-2 mt-0.5 block text-meta text-text-muted">
              {bot.description}
            </span>
            <span className="clamp-1 mt-0.5 block text-micro text-text-muted">
              {deployed
                ? bot.commandHint
                : bot.type === 'custom'
                  ? 'Your agent'
                  : 'ThryftVerse agent'}
              {' · '}
              {statusLabel(bot.status)}
            </span>
          </span>
          {pending ? (
            <span
              className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-text-primary"
              aria-label="Working"
            />
          ) : (
            <IconButton
              name={deployed ? 'remove' : 'plus'}
              size={deployed ? 18 : 20}
              aria-label={`${deployed ? 'Remove' : 'Connect'} ${bot.name}`}
              onClick={() =>
                deployed ? confirmRemove(bot) : void changeDeployment(bot, true)
              }
              disabled={pendingBotId !== null}
              className={deployed ? 'text-danger-text' : undefined}
            />
          )}
        </div>
        {!isLast ? (
          <div className="ml-[60px] border-b border-border-subtle" />
        ) : null}
      </div>
    );
  };

  return (
    <section className="mt-6 first:mt-0" aria-label="Chat agents">
      <h2 className="px-4 pb-1.5 text-meta font-semibold uppercase tracking-wide text-text-muted">
        Chat agents
      </h2>
      {isLoading ? (
        <div aria-busy aria-label="Loading agents">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="mt-1.5 h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-meta text-text-muted">
            Couldn&apos;t load agents — check your connection.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="pressable shrink-0 text-body-emphasis font-semibold text-brand"
          >
            Try again
          </button>
        </div>
      ) : connected.length === 0 && available.length === 0 ? (
        <p className="px-4 py-3 text-meta text-text-muted">
          No agents are ready to connect.
        </p>
      ) : (
        <>
          {connected.length > 0 ? (
            <div>
              <p className="px-4 pb-1 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
                Connected
              </p>
              {connected.map((bot, i) =>
                renderRow(bot, true, i === connected.length - 1),
              )}
            </div>
          ) : null}
          {available.length > 0 ? (
            <div className={connected.length > 0 ? 'mt-4' : ''}>
              <p className="px-4 pb-1 text-micro font-semibold uppercase tracking-[0.08em] text-text-muted">
                Available
              </p>
              {available.map((bot, i) =>
                renderRow(bot, false, i === available.length - 1),
              )}
            </div>
          ) : null}
        </>
      )}
      <ConfirmSheet
        state={confirm}
        onClose={() => setConfirm(CLOSED_CONFIRM)}
      />
    </section>
  );
}
