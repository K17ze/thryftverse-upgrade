'use client';

/**
 * AgentStudioView — /agents/studio: the Agent Studio surface. Web port of
 * mobile's AIAgentIntegrationScreen, narrowed to what the hub doesn't
 * already carry — the "agents" tab lives on /agents, so this surface is
 * connections, approvals and device-local keys.
 *
 * Information architecture (top → bottom):
 *  1. Header — "Agent studio"
 *  2. Status overview — agents, connections, pending approvals (flat text)
 *  3. Tabs — Connections | Approvals | Device keys
 *  4. Security note — what agents can and cannot do
 *
 * Every read is a real wire call in live mode (/agent-connections,
 * /agent-approvals, /bots); per-resource freshness marks only what failed.
 * Device keys are localStorage-only by design — never a server sync.
 */

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconButton } from '@/components/ui/IconButton';
import { Icon } from '@/components/ui/Icon';
import { Tabs, tabId, tabPanelId } from '@/components/ui/Tabs';
import { parseApiError } from '@/lib/api/http';
import { useAgentBots } from '@/lib/hooks/agents-queries';
import { AgentsSignInWall, useAgentsAccess } from '../AgentsGate';
import {
  useStudioApprovals,
  useStudioConnections,
} from './studio-queries';
import {
  StudioStatusOverview,
  type StudioResourceKey,
  type StudioResourceState,
} from './StudioStatusOverview';
import { StudioConnectionsSection } from './StudioConnectionsSection';
import { StudioApprovalsSection } from './StudioApprovalsSection';
import { StudioDeviceKeysSection } from './StudioDeviceKeysSection';

type StudioTab = 'connections' | 'approvals' | 'device';

function resourceState(query: {
  isLoading: boolean;
  isError: boolean;
  data: unknown;
  error: unknown;
}): { status: StudioResourceState[StudioResourceKey]['status']; errorMessage: string | null } {
  if (query.isLoading) return { status: 'loading', errorMessage: null };
  if (query.isError) {
    return {
      // Rows already on screen are labelled possibly-stale; a first-load
      // failure is a hard error and never renders as confirmed-empty.
      status: query.data ? 'stale' : 'error',
      errorMessage: parseApiError(query.error, 'Check your connection and try again.').message,
    };
  }
  return { status: 'ok', errorMessage: null };
}

export function AgentStudioView() {
  const router = useRouter();
  const idBase = useId();
  const [tab, setTab] = useState<StudioTab>('connections');

  const bots = useAgentBots();
  const connections = useStudioConnections();
  const approvals = useStudioApprovals();

  const resources: StudioResourceState = {
    bots: resourceState(bots),
    connections: resourceState(connections),
    approvals: resourceState(approvals),
  };

  const access = useAgentsAccess(connections.error ?? approvals.error ?? bots.error);

  const connectionRows = connections.data ?? [];
  const approvalRows = approvals.data ?? [];
  const healthy = connectionRows.filter((c) => c.healthStatus === 'healthy').length;
  const pendingCount = approvalRows.filter((a) => a.status === 'pending').length;
  // "Your agents" — the hub's own definition: owned bots (live custom
  // bots) plus fixture session installs.
  const agentCount = (bots.data ?? []).filter(
    (b) => b.origin === 'own' || b.installed === true,
  ).length;

  const retry = (key: StudioResourceKey) => {
    if (key === 'bots') void bots.refetch();
    else if (key === 'connections') void connections.refetch();
    else void approvals.refetch();
  };

  return (
    <div className="pb-16">
      <div className="flex items-center gap-1 px-2 pt-1 sm:px-4">
        <IconButton name="back" aria-label="Back to agents" onClick={() => router.push('/agents')} />
        <h1 className="flex-1 text-screen-title text-text-primary">Agent studio</h1>
      </div>
      <p className="mt-1 px-4 text-caption text-text-secondary sm:px-6">
        The keys and approvals your agents run on.
      </p>

      {access === 'blocked' ? (
        <div className="mt-8">
          <AgentsSignInWall title="Sign in to open the studio" />
        </div>
      ) : (
        <>
          <StudioStatusOverview
            resources={resources}
            onRetry={retry}
            agentCount={agentCount}
            healthyConnections={healthy}
            totalConnections={connectionRows.length}
            pendingApprovalCount={pendingCount}
          />

          <Tabs
            idBase={idBase}
            ariaLabel="Agent studio sections"
            className="mt-6"
            railClassName="px-4 sm:px-6"
            active={tab}
            onChange={(key) => setTab(key)}
            tabs={[
              { key: 'connections', label: 'Connections' },
              { key: 'approvals', label: 'Approvals', count: pendingCount },
              { key: 'device', label: 'Device keys' },
            ]}
          />

          <div
            role="tabpanel"
            id={tabPanelId(idBase, tab)}
            aria-labelledby={tabId(idBase, tab)}
            className="mt-5"
          >
            {tab === 'connections' ? (
              <StudioConnectionsSection
                connections={connectionRows}
                loading={resources.connections.status === 'loading'}
                loadError={
                  resources.connections.status === 'error'
                    ? resources.connections.errorMessage
                    : null
                }
                stale={resources.connections.status === 'stale'}
                onRetry={() => retry('connections')}
              />
            ) : null}
            {tab === 'approvals' ? (
              <StudioApprovalsSection
                approvals={approvalRows}
                bots={bots.data}
                loading={resources.approvals.status === 'loading'}
                loadError={
                  resources.approvals.status === 'error'
                    ? resources.approvals.errorMessage
                    : null
                }
                stale={resources.approvals.status === 'stale'}
                onRetry={() => retry('approvals')}
              />
            ) : null}
            {tab === 'device' ? <StudioDeviceKeysSection /> : null}
          </div>

          {/* Honest capability note — the mobile help footer, verbatim. */}
          <div className="mt-10 border-t border-border-subtle px-4 pt-5 sm:px-6">
            <div className="flex items-center gap-2">
              <Icon name="info" size={16} className="text-text-secondary" />
              <p className="text-body-emphasis text-text-primary">
                What agents can and cannot do
              </p>
            </div>
            <p className="mt-1.5 text-caption text-text-secondary">
              Agents draft replies and summarise conversations using the provider
              keys you connect. They cannot access your wallet, make payments, or
              act outside the permissions you grant. Server-side keys are stored
              encrypted on the server; device-local keys never leave this device.
              Each agent action is logged in the activity ledger for transparency.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
