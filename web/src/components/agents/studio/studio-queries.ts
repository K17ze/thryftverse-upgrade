'use client';

/**
 * Studio session state — connections and approvals share the agents
 * session contract: the react-query cache is the session store.
 *
 * Live mode reads the real /agent-connections and /agent-approvals
 * endpoints (see services/agentStudio.ts). Fixture mode seeds the cache
 * once with the authored studio rows below — mirroring fixtures-agents —
 * and writes mutate the session cache so they survive in-app navigation.
 * A hard reload re-seeds; nothing pretends a fixture write reached a
 * provider or the server.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import * as studioService from '@/lib/api/services/agentStudio';
import type {
  AgentStudioApproval,
  AgentStudioConnection,
} from '@/lib/api/services/agentStudio';
import { maskDeviceKey } from './deviceKeys';

const CONNECTIONS_KEY = ['agent-connections'] as const;
const APPROVALS_KEY = ['agent-approvals'] as const;

const tick = (ms = 320) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Fixture seed — authored demo state, consistent with fixtures-agents.ts.
// Two connections show the health grammar (healthy + failed with a real
// lastError); two approvals tie into the fixture ledger's awaiting rows.
// ---------------------------------------------------------------------------

const STUDIO_FIXTURE_CONNECTIONS: AgentStudioConnection[] = [
  {
    id: 'conn-fixture-openai',
    ownerId: 'user-fixture',
    provider: 'openai',
    label: 'Support replies',
    environment: 'production',
    maskedKey: 'sk-pro••••••••9xq2',
    baseUrl: null,
    healthStatus: 'healthy',
    lastVerifiedAt: '2026-09-28T17:55:00Z',
    lastFailedAt: null,
    lastError: null,
    discoveredModels: [
      { providerModelId: 'gpt-4o', displayName: 'gpt-4o' },
      { providerModelId: 'gpt-4o-mini', displayName: 'gpt-4o-mini' },
      { providerModelId: 'o4-mini', displayName: 'o4-mini' },
    ],
    isActive: true,
    createdAt: '2026-08-30T10:12:00Z',
    updatedAt: '2026-09-28T17:55:00Z',
  },
  {
    id: 'conn-fixture-custom',
    ownerId: 'user-fixture',
    provider: 'custom',
    label: 'Workstation endpoint',
    environment: 'production',
    maskedKey: '••••••••',
    baseUrl: 'https://llm.example-host.dev/v1',
    healthStatus: 'failed',
    lastVerifiedAt: null,
    lastFailedAt: '2026-09-27T08:20:00Z',
    lastError: 'Endpoint unreachable — check the URL or your network.',
    discoveredModels: [],
    isActive: true,
    createdAt: '2026-09-12T14:02:00Z',
    updatedAt: '2026-09-27T08:20:00Z',
  },
];

const STUDIO_FIXTURE_APPROVALS: AgentStudioApproval[] = [
  {
    id: 'appr-fixture-01',
    runId: 'run-086',
    botId: 'bot-listing-copilot',
    conversationId: 'conv-fixture-01',
    toolName: 'draft_reply',
    toolArguments: {
      text: 'Draft listing ready — "Ceramic studio vase, speckled glaze, signed base." Review the description before it posts.',
    },
    status: 'pending',
    expiresAt: '2026-10-02T20:03:00Z',
    createdAt: '2026-09-26T20:03:00Z',
  },
  {
    id: 'appr-fixture-02',
    runId: 'run-085',
    botId: 'bot-faq-responder',
    conversationId: 'conv-fixture-02',
    toolName: 'draft_reply',
    toolArguments: {
      text: 'Hi! These Blazers run true to size — I\u2019d go with your usual. Happy to measure the insole if that helps.',
    },
    status: 'pending',
    expiresAt: null,
    createdAt: '2026-09-28T18:10:00Z',
  },
];

async function fetchConnections(): Promise<AgentStudioConnection[]> {
  if (DATA_MODE === 'live') return studioService.fetchAgentConnections();
  await tick();
  return STUDIO_FIXTURE_CONNECTIONS.map((c) => ({
    ...c,
    discoveredModels: [...c.discoveredModels],
  }));
}

async function fetchApprovals(): Promise<AgentStudioApproval[]> {
  if (DATA_MODE === 'live') return studioService.fetchAgentApprovals();
  await tick();
  return STUDIO_FIXTURE_APPROVALS.map((a) => ({ ...a, toolArguments: { ...a.toolArguments } }));
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useStudioConnections() {
  return useQuery({
    queryKey: CONNECTIONS_KEY,
    queryFn: fetchConnections,
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

export function useStudioApprovals() {
  return useQuery({
    queryKey: APPROVALS_KEY,
    queryFn: fetchApprovals,
    staleTime: DATA_MODE === 'live' ? undefined : Infinity,
    gcTime: DATA_MODE === 'live' ? undefined : Infinity,
  });
}

// ---------------------------------------------------------------------------
// Connection actions — live calls hit the real endpoints and invalidate;
// fixture writes mutate the session cache (same demo-session semantics as
// the bots cache: actions land locally for the session, a reload re-seeds).
// ---------------------------------------------------------------------------

export function useStudioConnectionActions() {
  const queryClient = useQueryClient();
  const setConnections = (fn: (rows: AgentStudioConnection[]) => AgentStudioConnection[]) =>
    queryClient.setQueryData<AgentStudioConnection[]>(CONNECTIONS_KEY, (old) =>
      old ? fn(old) : old,
    );

  return {
    /** Connect a provider server-side — the backend verifies the key
     *  before storing, so a failed check surfaces as a real rejection. */
    connect: async (input: {
      provider: 'openai' | 'custom';
      apiKey: string;
      label?: string;
      baseUrl?: string;
    }): Promise<void> => {
      if (DATA_MODE === 'live') {
        await studioService.createAgentConnection(input);
        await queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
        return;
      }
      await tick(400);
      const now = new Date().toISOString();
      // Demo-session row — fixture writes behave like every other agents
      // fixture mutation (the bot enable toggle records session runs the
      // same way). discoveredModels stays empty: nothing was discovered.
      setConnections((rows) => [
        {
          id: `conn-local-${Date.now().toString(36)}`,
          ownerId: 'user-fixture',
          provider: input.provider,
          label: input.label?.trim() || 'Default',
          environment: 'production',
          maskedKey: maskDeviceKey(input.apiKey.trim()),
          baseUrl: input.baseUrl?.trim() || null,
          healthStatus: 'healthy',
          lastVerifiedAt: now,
          lastFailedAt: null,
          lastError: null,
          discoveredModels: [],
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
        ...rows,
      ]);
    },

    /** Fresh provider round-trip, server-side. */
    reverify: async (connectionId: string): Promise<void> => {
      if (DATA_MODE === 'live') {
        await studioService.reverifyAgentConnection(connectionId);
        await queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
        return;
      }
      await tick(400);
      setConnections((rows) =>
        rows.map((c) =>
          c.id === connectionId
            ? {
                ...c,
                healthStatus: 'healthy',
                lastVerifiedAt: new Date().toISOString(),
                lastError: null,
                updatedAt: new Date().toISOString(),
              }
            : c,
        ),
      );
    },

    /** Deactivate + unbind bots. Returns the affected agent ids. */
    remove: async (connectionId: string): Promise<string[]> => {
      if (DATA_MODE === 'live') {
        const { affectedAgents } = await studioService.deleteAgentConnection(connectionId);
        await queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
        return affectedAgents;
      }
      await tick(320);
      setConnections((rows) => rows.filter((c) => c.id !== connectionId));
      // No bots can be bound to a fixture connection — nothing affected.
      return [];
    },
  };
}

// ---------------------------------------------------------------------------
// Approval actions — optimistic remove with rollback, mirroring the mobile
// store's filter-on-decide semantics.
// ---------------------------------------------------------------------------

export function useStudioApprovalActions() {
  const queryClient = useQueryClient();

  const decide = async (
    approvalId: string,
    liveWrite: () => Promise<unknown>,
  ): Promise<void> => {
    const prev = queryClient.getQueryData<AgentStudioApproval[]>(APPROVALS_KEY);
    queryClient.setQueryData<AgentStudioApproval[]>(APPROVALS_KEY, (old) =>
      old ? old.filter((a) => a.id !== approvalId) : old,
    );
    try {
      if (DATA_MODE === 'live') {
        await liveWrite();
        void queryClient.invalidateQueries({ queryKey: APPROVALS_KEY });
      } else {
        await tick(280);
      }
    } catch (err) {
      if (prev) queryClient.setQueryData(APPROVALS_KEY, prev);
      throw err;
    }
  };

  return {
    approve: (approvalId: string): Promise<void> =>
      decide(approvalId, () => studioService.approveAgentRequest(approvalId)),
    deny: (approvalId: string): Promise<void> =>
      decide(approvalId, () => studioService.rejectAgentRequest(approvalId)),
  };
}
