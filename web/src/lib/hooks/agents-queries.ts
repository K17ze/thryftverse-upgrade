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
  AgentPurposeId,
  AgentRunEntry,
  AgentTriggerId,
} from '@/lib/contracts/agents';
import { purposeById, DEFAULT_MODEL } from '@/lib/contracts/agents';
import { AGENT_BOTS, AGENT_RUNS } from '@/lib/data/fixtures-agents';
import { DATA_MODE } from '@/lib/api/client';
import * as agentsService from '@/lib/api/services/agents';

const BOTS_KEY = ['agent-bots'] as const;
const RUNS_KEY = ['agent-runs'] as const;

const tick = (ms = 320) => new Promise((r) => setTimeout(r, ms));

async function fetchBots(): Promise<AgentBot[]> {
  if (DATA_MODE === 'live') {
    return agentsService.fetchAgentBots();
  }
  await tick();
  return AGENT_BOTS.map((b) => ({ ...b, capabilities: [...b.capabilities] }));
}

async function fetchRuns(): Promise<AgentRunEntry[]> {
  if (DATA_MODE === 'live') {
    return agentsService.fetchAgentRuns();
  }
  await tick();
  return AGENT_RUNS.map((r) => ({ ...r }));
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

/** The full activity ledger; pass a botId to scope it client-side. */
export function useAgentLedger(botId?: string) {
  return useQuery({
    queryKey: RUNS_KEY,
    queryFn: fetchRuns,
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
    select: (runs) => (botId ? runs.filter((r) => r.botId === botId) : runs),
  });
}

// ---------------------------------------------------------------------------
// Actions — every write lands in the cache, plus an honest ledger row where
// the action itself is agent activity (install, pause, resume, remove).
// ---------------------------------------------------------------------------

export interface NewAgentBotInput {
  name: string;
  purposeId: AgentPurposeId;
  triggerId: AgentTriggerId;
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
    queryClient.setQueryData<AgentRunEntry[]>(RUNS_KEY, (old) =>
      old ? [run, ...old] : [run],
    );
  };

  return {
    /** Install a directory/community bot — enabled by default. */
    installBot: (botId: string): void => {
      if (DATA_MODE === 'live') {
        void agentsService
          .setAgentBotEnabled(botId, true)
          .then(() => queryClient.invalidateQueries({ queryKey: BOTS_KEY }));
        return;
      }
      updateBots((bots) =>
        bots.map((b) =>
          b.id === botId ? { ...b, installed: true, enabled: true } : b,
        ),
      );
    },

    /** Remove the install. The bot's past runs stay in the ledger. */
    uninstallBot: (botId: string): void => {
      if (DATA_MODE === 'live') {
        void agentsService
          .setAgentBotEnabled(botId, false)
          .then(() => queryClient.invalidateQueries({ queryKey: BOTS_KEY }));
        return;
      }
      updateBots((bots) =>
        bots.map((b) =>
          b.id === botId ? { ...b, installed: false, enabled: false } : b,
        ),
      );
    },

    /** Run toggle — recorded in the ledger so the audit trail stays honest. */
    setEnabled: (botId: string, enabled: boolean): void => {
      if (DATA_MODE === 'live') {
        void agentsService
          .setAgentBotEnabled(botId, enabled)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: BOTS_KEY });
            void queryClient.invalidateQueries({ queryKey: RUNS_KEY });
          });
        return;
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

    /** Delete a session-built bot — removes it from the list entirely. */
    deleteBot: (botId: string): void => {
      if (DATA_MODE === 'live') {
        void agentsService
          .deleteAgentBot(botId)
          .then(() => queryClient.invalidateQueries({ queryKey: BOTS_KEY }));
        return;
      }
      updateBots((bots) => bots.filter((b) => b.id !== botId));
    },
  };
}
