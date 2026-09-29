'use client';

/**
 * Agent session state — the react-query cache doubles as the session store,
 * mirroring the mobile store's customBots/availableChatBots slices and the
 * web's useSupportTickets pattern. Seeds from fixtures-agents on first
 * mount; install/enable/create/delete and ledger writes mutate the cache so
 * they survive in-app navigation for the whole client session. A hard
 * reload re-seeds — honest fixture-mode behaviour.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AgentBot,
  AgentMemory,
  AgentMemorySettings,
  AgentPurposeId,
  AgentRunEntry,
  AgentTriggerId,
} from '@/lib/contracts/agents';
import { purposeById, DEFAULT_MODEL } from '@/lib/contracts/agents';
import { AGENT_BOTS, AGENT_RUNS } from '@/lib/data/fixtures-agents';
import { AGENT_MEMORIES, AGENT_MEMORY_SETTINGS } from '@/lib/data/fixtures-agents-memory';
import { DATA_MODE } from '@/lib/api/client';
import * as agentsService from '@/lib/api/services/agents';

const BOTS_KEY = ['agent-bots'] as const;
const RUNS_KEY = ['agent-runs'] as const;
const MEMORY_KEY = ['agent-memory'] as const;

const tick = (ms = 320) => new Promise((r) => setTimeout(r, ms));

async function fetchBots(): Promise<AgentBot[]> {
  if (DATA_MODE === 'live') {
    return agentsService.fetchAgentBots();
  }
  await tick();
  return AGENT_BOTS.map((b) => ({ ...b, capabilities: [...b.capabilities] }));
}

async function fetchRuns(botId?: string): Promise<AgentRunEntry[]> {
  if (DATA_MODE === 'live') {
    // botId is a real query param on GET /agent-runs — scope server-side.
    return agentsService.fetchAgentRuns(botId);
  }
  await tick();
  return AGENT_RUNS.filter((r) => !botId || r.botId === botId).map((r) => ({ ...r }));
}

export interface AgentMemoryState {
  settings: AgentMemorySettings;
  memories: AgentMemory[];
}

async function fetchMemory(): Promise<AgentMemoryState> {
  if (DATA_MODE === 'live') {
    return agentsService.fetchAgentMemory();
  }
  await tick();
  return {
    settings: { ...AGENT_MEMORY_SETTINGS },
    memories: AGENT_MEMORIES.map((m) => ({ ...m })),
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Every bot the session knows: directory + community + session-built. */
export function useAgentBots() {
  return useQuery({
    queryKey: BOTS_KEY,
    queryFn: fetchBots,
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

/** One bot by id — reads the shared bots cache so detail stays in sync. */
export function useAgentBot(id: string | undefined) {
  return useQuery({
    queryKey: BOTS_KEY,
    queryFn: fetchBots,
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
    select: (bots) => bots.find((b) => b.id === id),
  });
}

/** The activity ledger — scoped server-side via ?botId= when given. */
export function useAgentLedger(botId?: string) {
  return useQuery({
    queryKey: [...RUNS_KEY, botId ?? 'all'],
    queryFn: () => fetchRuns(botId),
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

/**
 * Memory + settings for /agents/memory — the react-query cache is the
 * session store, so forget/clear survive navigation and a hard reload
 * re-seeds in fixture mode (same honesty as the bots cache).
 */
export function useAgentMemory() {
  return useQuery({
    queryKey: MEMORY_KEY,
    queryFn: fetchMemory,
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

/**
 * Memory writes — every mutation is optimistic with rollback, exactly the
 * mobile screen's semantics: the toggle moves now, a failed write snaps
 * back and the caller toasts. In live mode the server stays the truth —
 * the confirmed payload overwrites the optimistic value.
 */
export function useAgentMemoryActions() {
  const queryClient = useQueryClient();

  const updateMemory = (fn: (s: AgentMemoryState) => AgentMemoryState) => {
    queryClient.setQueryData<AgentMemoryState>(MEMORY_KEY, (old) =>
      old ? fn(old) : old,
    );
  };

  const patchSettings = async (patch: Partial<AgentMemorySettings>) => {
    const prev = queryClient.getQueryData<AgentMemoryState>(MEMORY_KEY);
    updateMemory((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
    try {
      if (DATA_MODE === 'live') {
        const settings = await agentsService.updateAgentMemorySettings(patch);
        updateMemory((s) => ({ ...s, settings }));
      } else {
        await tick(240);
      }
    } catch (err) {
      if (prev) queryClient.setQueryData(MEMORY_KEY, prev);
      throw err;
    }
  };

  return {
    /** "Remember me" — the master memory switch. */
    setMemoryEnabled: (enabled: boolean) => patchSettings({ memoryEnabled: enabled }),
    /** "Learn from chats" — extraction; disabled server-side when memory is off. */
    setExtractionEnabled: (enabled: boolean) =>
      patchSettings({ extractionEnabled: enabled }),

    /** Retract one memory — optimistic remove, rollback on failure. */
    forgetMemory: async (memoryId: string): Promise<void> => {
      const prev = queryClient.getQueryData<AgentMemoryState>(MEMORY_KEY);
      updateMemory((s) => ({
        ...s,
        memories: s.memories.filter((m) => m.id !== memoryId),
      }));
      try {
        if (DATA_MODE === 'live') {
          await agentsService.retractAgentMemory(memoryId);
        } else {
          await tick(240);
        }
      } catch (err) {
        if (prev) queryClient.setQueryData(MEMORY_KEY, prev);
        throw err;
      }
    },

    /** Clear every memory — the danger-zone action. */
    clearAllMemories: async (): Promise<void> => {
      const prev = queryClient.getQueryData<AgentMemoryState>(MEMORY_KEY);
      updateMemory((s) => ({ ...s, memories: [] }));
      try {
        if (DATA_MODE === 'live') {
          await agentsService.clearAgentMemories();
        } else {
          await tick(320);
        }
      } catch (err) {
        if (prev) queryClient.setQueryData(MEMORY_KEY, prev);
        throw err;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Actions — every write lands in the cache, plus an honest ledger row where
// the action itself is agent activity (install, pause, resume, remove).
// Live mutations are optimistic with revert-on-failure (the same grammar
// useAgentMemoryActions uses): the toggle moves now, a failed write snaps
// back and the error is rethrown so the caller toasts the real outcome.
// ---------------------------------------------------------------------------

export interface NewAgentBotInput {
  name: string;
  purposeId: AgentPurposeId;
  /** Fixture automation trigger — no live wire field exists for it. */
  triggerId: AgentTriggerId;
  /** Live agentConfig.triggerMode — the chat reply grammar the wire knows. */
  triggerMode?: 'mention' | 'command' | 'always';
  enabled: boolean;
}

export function useAgentActions() {
  const queryClient = useQueryClient();

  const updateBots = (fn: (bots: AgentBot[]) => AgentBot[]) => {
    queryClient.setQueryData<AgentBot[]>(BOTS_KEY, (old) =>
      old ? fn(old) : old,
    );
  };

  const appendRun = (entry: Omit<AgentRunEntry, 'id' | 'at'>) => {
    const run: AgentRunEntry = {
      ...entry,
      id: `run-local-${Date.now().toString(36)}`,
      at: new Date().toISOString(),
    };
    // The ledger is keyed per scope — write the unscoped list and this
    // bot's scoped list (only if that query already exists).
    queryClient.setQueryData<AgentRunEntry[]>([...RUNS_KEY, 'all'], (old) =>
      old ? [run, ...old] : [run],
    );
    const scopedKey = [...RUNS_KEY, entry.botId] as const;
    if (queryClient.getQueryData(scopedKey)) {
      queryClient.setQueryData<AgentRunEntry[]>(scopedKey, (old) => [
        run,
        ...(old ?? []),
      ]);
    }
  };

  /** Shared live-write shape: optimistic mirror, revert + rethrow on
   *  failure, refetch on success so the server row stays canonical.
   *  enabled ⇔ status 'available' | 'disabled' — the wire has no install
   *  flag, so nothing else is touched. */
  const writeBotFlag = (botId: string, enabled: boolean): Promise<void> => {
    const prev = queryClient.getQueryData<AgentBot[]>(BOTS_KEY);
    updateBots((bots) =>
      bots.map((b) =>
        b.id === botId
          ? {
              ...b,
              enabled,
              ...(b.status !== undefined
                ? { status: enabled ? ('available' as const) : ('disabled' as const) }
                : {}),
            }
          : b,
      ),
    );
    return agentsService
      .setAgentBotEnabled(botId, enabled)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: BOTS_KEY });
      })
      .catch((err) => {
        if (prev) queryClient.setQueryData(BOTS_KEY, prev);
        throw err;
      });
  };

  return {
    /** Install a directory/community bot — enabled by default. */
    installBot: (botId: string): Promise<void> => {
      if (DATA_MODE === 'live') return writeBotFlag(botId, true);
      updateBots((bots) =>
        bots.map((b) =>
          b.id === botId ? { ...b, installed: true, enabled: true } : b,
        ),
      );
      return Promise.resolve();
    },

    /** Remove the install. The bot's past runs stay in the ledger. */
    uninstallBot: (botId: string): Promise<void> => {
      if (DATA_MODE === 'live') return writeBotFlag(botId, false);
      updateBots((bots) =>
        bots.map((b) =>
          b.id === botId ? { ...b, installed: false, enabled: false } : b,
        ),
      );
      return Promise.resolve();
    },

    /** Run toggle — recorded in the ledger so the audit trail stays honest. */
    setEnabled: (botId: string, enabled: boolean): Promise<void> => {
      if (DATA_MODE === 'live') {
        const prev = queryClient.getQueryData<AgentBot[]>(BOTS_KEY);
        updateBots((bots) =>
          bots.map((b) => (b.id === botId ? { ...b, enabled } : b)),
        );
        return agentsService
          .setAgentBotEnabled(botId, enabled)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: BOTS_KEY });
            void queryClient.invalidateQueries({ queryKey: RUNS_KEY });
          })
          .catch((err) => {
            if (prev) queryClient.setQueryData(BOTS_KEY, prev);
            throw err;
          });
      }
      let name = botId;
      updateBots((bots) =>
        bots.map((b) => {
          if (b.id !== botId) return b;
          name = b.name;
          return { ...b, enabled };
        }),
      );
      appendRun({
        botId,
        action: enabled ? 'Resumed' : 'Paused',
        target: name,
        outcome: 'succeeded',
      });
      return Promise.resolve();
    },

    /**
     * Builder create — a session bot from a fixed purpose template.
     * Returns the bot so the caller can navigate to /agents/[id].
     */
    createBot: (input: NewAgentBotInput): Promise<AgentBot> | AgentBot => {
      const purpose = purposeById(input.purposeId);
      if (DATA_MODE === 'live') {
        return agentsService
          .createAgentBot({
            name: input.name.trim(),
            description: purpose?.detail ?? 'Custom assistant.',
            category: purpose?.category ?? 'automation',
            permissions: purpose ? [...purpose.capabilities] : undefined,
            triggerMode: input.triggerMode,
            purposeId: input.purposeId,
          })
          .then((created) => {
            void queryClient.invalidateQueries({ queryKey: BOTS_KEY });
            void queryClient.invalidateQueries({ queryKey: RUNS_KEY });
            return created;
          });
      }
      const now = new Date().toISOString();
      const bot: AgentBot = {
        id: `bot-local-${Date.now().toString(36)}`,
        name: input.name.trim(),
        purpose: purpose?.detail ?? 'Custom assistant.',
        description: purpose
          ? `${purpose.detail} Built from the ${purpose.label.toLowerCase()} template — its permission set can't be extended past what the job needs.`
          : 'A custom assistant built in this session.',
        category: purpose?.category ?? 'automation',
        purposeId: input.purposeId,
        model: DEFAULT_MODEL,
        creator: 'You',
        origin: 'own',
        capabilities: purpose ? [...purpose.capabilities] : [],
        triggerId: input.triggerId,
        installs: 1,
        installed: true,
        enabled: input.enabled,
        createdAt: now,
      };
      updateBots((bots) => [bot, ...bots]);
      appendRun({
        botId: bot.id,
        action: 'Installed',
        target: bot.name,
        outcome: 'succeeded',
      });
      return bot;
    },

    /** Delete a session-built bot — removes it from the list entirely.
     *  Optimistic remove; a failed DELETE restores the row and rethrows. */
    deleteBot: (botId: string): Promise<void> => {
      if (DATA_MODE === 'live') {
        const prev = queryClient.getQueryData<AgentBot[]>(BOTS_KEY);
        if (prev) {
          queryClient.setQueryData<AgentBot[]>(
            BOTS_KEY,
            prev.filter((b) => b.id !== botId),
          );
        }
        return agentsService
          .deleteAgentBot(botId)
          .then(() => queryClient.invalidateQueries({ queryKey: BOTS_KEY }))
          .then(() => undefined)
          .catch((err) => {
            if (prev) queryClient.setQueryData(BOTS_KEY, prev);
            throw err;
          });
      }
      updateBots((bots) => bots.filter((b) => b.id !== botId));
      return Promise.resolve();
    },
  };
}
