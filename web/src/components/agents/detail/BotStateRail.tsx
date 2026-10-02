'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/settings/Switch';
import { useToast } from '@/components/ui/Toast';
import {
  AGENT_BOT_STATUS_LABELS,
  triggerById,
  type AgentBot,
} from '@/lib/contracts/agents';
import { parseApiError } from '@/lib/api/http';
import { useAgentActions } from '@/lib/hooks/agents-queries';

/** The state rail for a live wire row: the real status, plus the owner
 *  toggle where the server accepts it. */
export function WireState({ bot }: { bot: AgentBot }) {
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
export function FixtureInstallState({ bot }: { bot: AgentBot }) {
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
