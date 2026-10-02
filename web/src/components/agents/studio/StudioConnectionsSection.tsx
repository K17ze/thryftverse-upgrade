'use client';

/**
 * StudioConnectionsSection — the "Connections" tab. Verified server-side
 * keys that power agent execution: a flat-row list with truthful health
 * text (Healthy / Failed / Degraded / Expired / Revoked / Unverified as
 * coloured text, never a pill), the inline connect form, reverify and
 * remove — removal sits behind ConfirmSheet, mirroring the mobile flow.
 */

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmSheet } from '@/components/orders/ConfirmSheet';
import type { AgentStudioConnection } from '@/lib/api/services/agentStudio';
import { useStudioConnectionsWorkflow } from './connections/useStudioConnectionsWorkflow';
import { ConnectionForm } from './connections/ConnectionForm';
import { ConnectionRow } from './connections/ConnectionRow';

export function StudioConnectionsSection({
  connections,
  loading,
  loadError,
  stale,
  onRetry,
}: {
  connections: AgentStudioConnection[];
  loading: boolean;
  /** Non-null when the fetch failed before anything loaded — render it
   *  instead of a confirmed-empty state. */
  loadError: string | null;
  /** Prior data is on screen but the last refresh failed. */
  stale: boolean;
  onRetry: () => void;
}) {
  const workflow = useStudioConnectionsWorkflow();

  return (
    <div>
      <p className="px-4 text-label uppercase tracking-[0.08em] text-text-muted sm:px-6">
        Server connections
      </p>
      <p className="mt-1 px-4 text-caption text-text-muted sm:px-6">
        Keys verified and stored encrypted on the server. These power agent execution.
      </p>

      {/* Connect action / inline form */}
      {!workflow.showForm ? (
        <button
          type="button"
          onClick={workflow.openForm}
          className="pressable mt-2 flex min-h-[56px] w-full items-center gap-1 px-4 text-left sm:px-5"
        >
          <span className="flex h-11 w-9 shrink-0 items-center text-brand">
            <Icon name="desktop" size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-body-emphasis text-text-primary">
              Connect server-side
            </span>
            <span className="clamp-1 block text-caption text-text-secondary">
              Keys are verified against the provider and stored encrypted on the server.
            </span>
          </span>
          <Icon name="forward" size={16} className="shrink-0 text-text-muted" />
        </button>
      ) : (
        <ConnectionForm
          provider={workflow.provider}
          setProvider={workflow.setProvider}
          apiKey={workflow.key}
          setApiKey={workflow.setKey}
          label={workflow.label}
          setLabel={workflow.setLabel}
          baseUrl={workflow.baseUrl}
          setBaseUrl={workflow.setBaseUrl}
          creating={workflow.creating}
          onCancel={workflow.closeForm}
          onSubmit={() => void workflow.handleConnect()}
        />
      )}

      {stale && !loading ? (
        <div className="mt-2 flex items-baseline gap-3 px-4 sm:px-6">
          <p className="text-caption text-warning-text">
            Connections may be out of date — last refresh failed.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="pressable text-caption font-medium text-warning-text underline underline-offset-2"
          >
            Retry connections
          </button>
        </div>
      ) : null}

      {/* The list — flat rows over hairlines */}
      {loading ? (
        <div className="mt-3 border-y border-border-subtle px-4 sm:px-6" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="flex items-start gap-3 py-4">
              <Skeleton className="h-5 w-5 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-52 max-w-full" />
              </div>
              <Skeleton className="h-3 w-14" />
            </div>
          ))}
        </div>
      ) : connections.length === 0 && loadError ? (
        <div className="mt-3 border-y border-border-subtle px-4 py-6 sm:px-6">
          <p className="text-body text-warning-text">Connections couldn’t load.</p>
          <p className="mt-1 text-caption text-text-secondary">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : connections.length === 0 ? (
        <p className="mt-3 border-y border-border-subtle px-4 py-6 text-body text-text-muted sm:px-6">
          No server connections yet. Connect a provider to power your agents.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle px-4 sm:px-6">
          {connections.map((conn) => (
            <ConnectionRow
              key={conn.id}
              connection={conn}
              isReverifying={workflow.reverifyingId === conn.id}
              isRemoving={workflow.removingId === conn.id}
              onReverify={workflow.handleReverify}
              onRequestRemove={workflow.requestRemove}
            />
          ))}
        </ul>
      )}

      <ConfirmSheet
        sheet={workflow.confirm}
        busy={workflow.removingId !== null}
        onDismiss={() => workflow.setConfirm(null)}
      />
    </div>
  );
}
