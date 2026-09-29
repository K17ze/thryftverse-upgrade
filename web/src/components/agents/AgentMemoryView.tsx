'use client';

/**
 * AgentMemoryView — /agents/memory: the user-facing control surface for
 * agent memory. Web port of the mobile AgentMemoryScreen — inspect every
 * stored memory, forget individual records, clear everything, and switch
 * memory or extraction off entirely. Backed by /agent-memory in live
 * mode; fixture mode is session-scoped like every agents surface.
 *
 * The memory text is the label — rows over hairlines, no badges.
 * Destructive writes (forget, clear) sit behind ConfirmSheet — they only
 * exist in the loaded state, and the clear-all row only exists when there
 * is something to clear.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ConfirmSheet, type ConfirmSheetState } from '@/components/orders/ConfirmSheet';
import { SettingsSection } from '@/components/settings/SettingsSection';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { Switch } from '@/components/settings/Switch';
import {
  AGENT_MEMORY_KIND_LABELS,
  type AgentMemory,
} from '@/lib/contracts/agents';
import { parseApiError } from '@/lib/api/http';
import { useAgentBots, useAgentMemory, useAgentMemoryActions } from '@/lib/hooks/agents-queries';
import { AgentsSignInWall, useAgentsAccess } from './AgentsGate';

function MemorySkeleton() {
  return (
    <div className="mt-8 px-4 sm:px-6" aria-busy aria-label="Loading agent memory">
      <Skeleton className="h-4 w-24" />
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3.5 border-b border-border-subtle py-4">
          <Skeleton className="h-5 w-5 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="mt-2 h-3 w-52 max-w-full" />
          </div>
          <Skeleton className="h-7 w-12 rounded-full" />
        </div>
      ))}
      <Skeleton className="mt-8 h-4 w-28" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="border-b border-border-subtle py-4">
          <Skeleton className="h-4" style={{ width: `${68 + (i % 2) * 14}%` }} />
          <Skeleton className="mt-2 h-3 w-44" />
        </div>
      ))}
    </div>
  );
}

/** Kind · scope · saved — the mobile memorySubtitle grammar verbatim. */
function memorySubtitle(m: AgentMemory, botName?: string): string {
  const scope = botName ?? (m.botId ? 'one agent' : 'all agents');
  const saved = m.createdAt.slice(0, 10);
  return `${AGENT_MEMORY_KIND_LABELS[m.kind] ?? 'Memory'} · ${scope} · saved ${saved}`;
}

/** One memory — the text is the label; tapping opens the forget sheet. */
function MemoryRow({
  memory,
  botName,
  onPress,
}: {
  memory: AgentMemory;
  botName?: string;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={`Memory: ${memory.content}`}
      className="pressable flex min-h-[52px] w-full flex-col justify-center px-4 py-2.5 text-left sm:px-5"
    >
      <span className="block text-body-emphasis text-text-primary">{memory.content}</span>
      <span className="mt-0.5 block text-caption text-text-muted">
        {memorySubtitle(memory, botName)}
      </span>
    </button>
  );
}

export function AgentMemoryView() {
  const router = useRouter();
  const { show } = useToast();
  const { data, isLoading, isError, error, refetch } = useAgentMemory();
  const { data: bots } = useAgentBots();
  const access = useAgentsAccess(error);
  const { setMemoryEnabled, setExtractionEnabled, forgetMemory, clearAllMemories } =
    useAgentMemoryActions();

  const [syncing, setSyncing] = useState<'memory' | 'extraction' | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSheetState | null>(null);
  const [busy, setBusy] = useState(false);

  const botById = useMemo(() => new Map((bots ?? []).map((b) => [b.id, b.name])), [bots]);
  const memories = data?.memories ?? [];
  const settings = data?.settings;

  const runToggle = async (which: 'memory' | 'extraction', v: boolean) => {
    if (!settings || syncing) return;
    setSyncing(which);
    try {
      await (which === 'memory' ? setMemoryEnabled(v) : setExtractionEnabled(v));
    } catch {
      show('Couldn’t update — try again', 'error');
    } finally {
      setSyncing(null);
    }
  };

  const requestForget = (m: AgentMemory) =>
    setConfirm({
      title: 'Forget this?',
      message: m.content,
      confirmLabel: 'Forget',
      cancelLabel: 'Keep',
      variant: 'destructive',
      onConfirm: async () => {
        setBusy(true);
        try {
          await forgetMemory(m.id);
          setConfirm(null);
        } catch {
          show('Couldn’t forget — try again', 'error');
        } finally {
          setBusy(false);
        }
      },
    });

  const requestClearAll = () =>
    setConfirm({
      title: 'Clear all memories?',
      message: `${memories.length} ${memories.length === 1 ? 'memory' : 'memories'} will be forgotten. This cannot be undone.`,
      confirmLabel: 'Clear all',
      variant: 'destructive',
      onConfirm: async () => {
        setBusy(true);
        try {
          await clearAllMemories();
          setConfirm(null);
          show('All memories cleared', 'info');
        } catch {
          show('Couldn’t clear memories — try again', 'error');
        } finally {
          setBusy(false);
        }
      },
    });

  return (
    <div className="pb-16">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to agents" onClick={() => router.push('/agents')} />
        <h1 className="flex-1 text-screen-title text-text-primary">Agent memory</h1>
      </div>
      <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
        What your agents remember between conversations — every fact is yours
        to inspect or forget.
      </p>

      {access === 'loading' || isLoading ? (
        <MemorySkeleton />
      ) : access === 'blocked' ? (
        <div className="mt-8">
          <AgentsSignInWall title="Sign in to see agent memory" />
        </div>
      ) : isError || !data || !settings ? (
        <div className="mt-8">
          <EmptyState
            icon="inbox"
            title="Couldn’t load memories"
            subtitle={parseApiError(
              error,
              'Your agent memory could not be reached. Try again.',
            ).message}
            actionLabel="Try again"
            onAction={() => void refetch()}
          />
        </div>
      ) : (
        <div className="lg:mt-4 lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-x-12">
          {/* Controls — a sticky rail at lg, first in flow on mobile. */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <SettingsSection title="Controls">
              <SettingsRow
                icon="bookmark"
                label="Remember me"
                subtitle="Agents can recall what they have learned about you"
                trailing={
                  <Switch
                    checked={settings.memoryEnabled}
                    onChange={(v) => void runToggle('memory', v)}
                    disabled={syncing !== null}
                    aria-label="Remember me"
                  />
                }
              />
              <SettingsRow
                icon="sparkles"
                label="Learn from chats"
                subtitle="Agents may save durable facts and preferences after a conversation"
                trailing={
                  <Switch
                    checked={settings.extractionEnabled}
                    onChange={(v) => void runToggle('extraction', v)}
                    disabled={syncing !== null || !settings.memoryEnabled}
                    aria-label="Learn from chats"
                  />
                }
              />
            </SettingsSection>
          </div>

          {/* Remembered list + the clear-all danger zone — same DOM order
              as mobile (controls → remembered → danger). */}
          <div className="mt-8 min-w-0 lg:mt-0">
            <SettingsSection
              title={memories.length > 0 ? `Remembered (${memories.length})` : 'Remembered'}
            >
              {memories.length === 0 ? (
                <div className="px-4 py-6 sm:px-5">
                  <p className="text-body-emphasis text-text-primary">Nothing remembered yet</p>
                  <p className="mt-1.5 text-caption text-text-secondary">
                    {settings.memoryEnabled
                      ? 'When an agent learns something durable about you — a size, a preference, a standing rule — it appears here for you to review or forget.'
                      : 'Memory is off. Turn on “Remember me” to let agents keep context across conversations.'}
                  </p>
                </div>
              ) : (
                memories.map((m) => (
                  <MemoryRow
                    key={m.id}
                    memory={m}
                    botName={m.botId ? botById.get(m.botId) : undefined}
                    onPress={() => requestForget(m)}
                  />
                ))
              )}
            </SettingsSection>

            {/* Danger zone — only when there is something to destroy. */}
            {memories.length > 0 ? (
              <div className="mt-10 border-t border-b border-border-subtle px-4 py-4 sm:px-6">
                <p className="text-body-emphasis font-medium text-text-primary">
                  Clear all memories
                </p>
                <p className="mt-1 text-caption text-text-secondary">
                  Every remembered fact, preference and rule is forgotten. Agents
                  will not use them again.
                </p>
                <button
                  type="button"
                  onClick={requestClearAll}
                  className="pressable mt-3 text-body-emphasis font-semibold text-danger-text"
                >
                  Clear all memories
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <ConfirmSheet sheet={confirm} busy={busy} onDismiss={() => setConfirm(null)} />
    </div>
  );
}
