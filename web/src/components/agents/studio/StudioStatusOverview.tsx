'use client';

/**
 * StudioStatusOverview — flat text with coloured counts, no cards: the
 * web port of mobile's AgentStudioStatusOverview. Each resource (agents,
 * connections, approvals) reports its own freshness — a failed fetch is
 * marked in place with the real error and a labelled retry; healthy
 * segments keep rendering and a failed fetch never reads as
 * confirmed-empty.
 */

import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';

export type StudioResourceKey = 'bots' | 'connections' | 'approvals';

/** 'loading' — nothing resolved yet; 'ok' — fresh; 'stale' — last refresh
 *  failed but prior data is still on screen; 'error' — failed before
 *  anything loaded (never show as confirmed-empty). */
export type StudioResourceStatus = 'loading' | 'ok' | 'stale' | 'error';

export type StudioResourceState = Record<
  StudioResourceKey,
  { status: StudioResourceStatus; errorMessage: string | null }
>;

const RESOURCE_LABEL: Record<StudioResourceKey, string> = {
  bots: 'Agents',
  connections: 'Connections',
  approvals: 'Approvals',
};

export function StudioStatusOverview({
  resources,
  onRetry,
  agentCount,
  healthyConnections,
  totalConnections,
  pendingApprovalCount,
}: {
  resources: StudioResourceState;
  onRetry: (resource: StudioResourceKey) => void;
  agentCount: number;
  healthyConnections: number;
  totalConnections: number;
  pendingApprovalCount: number;
}) {
  const anyResolved = (Object.keys(resources) as StudioResourceKey[]).some(
    (k) => resources[k].status !== 'loading',
  );

  if (!anyResolved) {
    return (
      <div className="mt-5 px-4 sm:px-6" aria-busy aria-label="Loading studio status">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="mt-2 h-3 w-2/5" />
      </div>
    );
  }

  const agentsKnown = resources.bots.status === 'ok' || resources.bots.status === 'stale';
  const connectionsKnown =
    resources.connections.status === 'ok' || resources.connections.status === 'stale';
  const approvalsKnown =
    resources.approvals.status === 'ok' || resources.approvals.status === 'stale';

  // Health is the healthy/total RATIO — 0/2 healthy is a failure state,
  // not success; no connections at all reads as muted.
  const healthColor =
    totalConnections === 0
      ? 'text-text-muted'
      : healthyConnections === totalConnections
        ? 'text-success-text'
        : healthyConnections === 0
          ? 'text-danger-text'
          : 'text-warning-text';

  const issues = (Object.keys(resources) as StudioResourceKey[]).filter(
    (k) => resources[k].status !== 'ok',
  );

  return (
    <div className="mt-5 px-4 sm:px-6">
      <p className="text-body text-text-primary">
        {agentsKnown ? (
          <>
            <span className={agentCount > 0 ? 'text-text-primary' : 'text-text-muted'}>
              {agentCount}
            </span>
            {` ${agentCount === 1 ? 'agent' : 'agents'}`}
          </>
        ) : null}
        {connectionsKnown ? (
          <>
            {agentsKnown ? '  ·  ' : ''}
            <span className={`tnum ${healthColor}`}>
              {healthyConnections}/{totalConnections}
            </span>
            {' connections healthy'}
          </>
        ) : null}
        {approvalsKnown && pendingApprovalCount > 0 ? (
          <>
            {'  ·  '}
            <span className="text-warning-text">
              {`${pendingApprovalCount} pending approval${pendingApprovalCount === 1 ? '' : 's'}`}
            </span>
          </>
        ) : null}
      </p>

      {/* The caption guides, never restates — the counts above already
          say how many connections are healthy. */}
      {agentsKnown && connectionsKnown ? (
        <p className="mt-1 text-caption text-text-secondary">
          {agentCount === 0 && totalConnections === 0
            ? 'Create an agent and connect a provider to get started.'
            : agentCount === 0
              ? 'Connect a provider, then create your first agent.'
              : totalConnections === 0
                ? 'Connect a provider server-side to power agent execution.'
                : healthyConnections === totalConnections
                  ? 'Agents run on your connected server-side keys.'
                  : healthyConnections === 0
                    ? 'Review your provider keys — agents can’t run until a connection verifies.'
                    : 'Some providers need attention.'}
        </p>
      ) : null}

      {/* Per-resource freshness — only the affected resource is marked,
          with its error verbatim and a retry that names it. */}
      {issues.map((key) => {
        const state = resources[key];
        return (
          <div key={key} className="mt-3">
            <p
              className={`text-caption ${
                state.status === 'loading' ? 'text-text-muted' : 'text-warning-text'
              }`}
            >
              {state.status === 'loading'
                ? `Refreshing ${RESOURCE_LABEL[key].toLowerCase()}…`
                : state.status === 'stale'
                  ? `${RESOURCE_LABEL[key]} may be out of date — last refresh failed.`
                  : `${RESOURCE_LABEL[key]} couldn't load.`}
            </p>
            {state.errorMessage ? (
              <p className="mt-0.5 text-caption text-text-secondary">{state.errorMessage}</p>
            ) : null}
            {state.status !== 'loading' ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => onRetry(key)}
              >
                Retry {RESOURCE_LABEL[key].toLowerCase()}
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
