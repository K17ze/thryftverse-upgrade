'use client';

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import type { AgentStudioConnection } from '@/lib/api/services/agentStudio';
import { timeAgo } from '@/lib/utils/format';
import { providerLabel } from './useStudioConnectionsWorkflow';

const HEALTH_LABEL: Record<string, string> = {
  healthy: 'Healthy',
  failed: 'Failed',
  revoked: 'Revoked',
  expired: 'Expired',
  degraded: 'Degraded',
  unverified: 'Unverified',
};

function healthClass(status: string): string {
  if (status === 'healthy') return 'text-success-text';
  if (status === 'failed' || status === 'revoked' || status === 'expired')
    return 'text-danger-text';
  if (status === 'degraded') return 'text-warning-text';
  return 'text-text-muted';
}

interface ConnectionRowProps {
  connection: AgentStudioConnection;
  isReverifying: boolean;
  isRemoving: boolean;
  onReverify: (id: string) => void;
  onRequestRemove: (conn: AgentStudioConnection) => void;
}

export function ConnectionRow({
  connection: conn,
  isReverifying,
  isRemoving,
  onReverify,
  onRequestRemove,
}: ConnectionRowProps) {
  const healthIsFailure =
    conn.healthStatus === 'failed' ||
    conn.healthStatus === 'revoked' ||
    conn.healthStatus === 'expired';

  return (
    // Column grammar at lg — provider | scope | key | status |
    // actions — so the row reads as a table instead of a text
    // block with status pushed to the far edge. Below lg the
    // same cells stack with the status pinned top-right.
    <li className="relative py-4 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.55fr)_auto] lg:items-start lg:gap-x-8">
      {/* Provider */}
      <div className="flex items-start gap-3 pr-24 lg:pr-0">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center text-text-primary">
          <Icon name="desktop" size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-body-emphasis text-text-primary">
            {providerLabel(conn.provider)}
          </p>
          {conn.label ? (
            <p className="clamp-1 mt-0.5 text-caption text-text-muted">
              {conn.label}
            </p>
          ) : null}
        </div>
      </div>

      {/* Scope — the models this key can serve */}
      <div className="mt-2.5 pl-8 lg:mt-0 lg:pl-0">
        {conn.discoveredModels.length > 0 ? (
          <>
            <p className="tnum text-caption text-text-secondary">
              {conn.discoveredModels.length}{' '}
              {conn.discoveredModels.length === 1 ? 'model' : 'models'}
            </p>
            <p className="clamp-1 mt-0.5 text-meta text-text-muted">
              {conn.discoveredModels
                .slice(0, 4)
                .map((m) => m.displayName)
                .join(', ')}
              {conn.discoveredModels.length > 4
                ? `, +${conn.discoveredModels.length - 4} more`
                : ''}
            </p>
          </>
        ) : (
          <p className="text-caption text-text-muted">No models discovered</p>
        )}
      </div>

      {/* Key — masked secret + endpoint. The provider's error is
          the actionable detail: it wraps in full, never clamped. */}
      <div className="mt-2.5 min-w-0 pl-8 lg:mt-0 lg:pl-0">
        <p className="tnum text-caption text-text-secondary">
          {conn.maskedKey}
        </p>
        {conn.baseUrl ? (
          <p className="clamp-1 mt-0.5 text-meta text-text-muted">
            {conn.baseUrl}
          </p>
        ) : null}
        {conn.lastError ? (
          <p
            className={`mt-1 text-caption ${
              healthIsFailure ? 'text-danger-text' : 'text-text-muted'
            }`}
          >
            {conn.lastError}
          </p>
        ) : null}
      </div>

      {/* Health + last verification */}
      <div className="absolute right-0 top-4 text-right lg:static">
        <p
          className={`text-caption font-medium ${healthClass(conn.healthStatus)}`}
        >
          {HEALTH_LABEL[conn.healthStatus] ?? 'Unverified'}
        </p>
        <p className="mt-0.5 text-meta text-text-muted">
          {conn.lastVerifiedAt
            ? `Verified ${timeAgo(conn.lastVerifiedAt).toLowerCase()}`
            : 'Not yet verified'}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-2 pl-8 lg:mt-0 lg:justify-end lg:pl-0">
        <Button
          variant="outline"
          size="sm"
          onClick={() => void onReverify(conn.id)}
          disabled={isReverifying || isRemoving}
        >
          {isReverifying ? 'Verifying…' : 'Reverify'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-danger-text"
          onClick={() => onRequestRemove(conn)}
          disabled={isReverifying || isRemoving}
        >
          {isRemoving ? 'Removing…' : 'Remove'}
        </Button>
      </div>
    </li>
  );
}
