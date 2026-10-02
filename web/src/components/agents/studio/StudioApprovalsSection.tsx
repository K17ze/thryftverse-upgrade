'use client';

/**
 * StudioApprovalsSection — pending approval rows with approve/deny, the
 * web port of the mobile ledger's "Pending approvals" block. Each row is
 * agent · time, the tool name, and the proposed content (draft text in
 * full — that is the thing being decided). Decisions are single-use:
 * a settled row leaves the list, and a server rejection restores it.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { parseApiError } from '@/lib/api/http';
import type { AgentStudioApproval } from '@/lib/api/services/agentStudio';
import type { AgentBot } from '@/lib/contracts/agents';
import { timeAgo } from '@/lib/utils/format';
import { useStudioApprovalActions } from './studio-queries';

/** Future-relative expiry — timeAgo only speaks in the past, so pending
 *  expiries get their own honest phrasing ("in 4h", "soon"). */
function expiresIn(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = then - Date.now();
  if (diff <= 0) return 'soon';
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'in under a minute';
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.floor(hours / 24);
  return `in ${days}d`;
}

/** Mirror of the mobile ledger's formatToolArguments — the tool contract,
 *  not a pretty-printer. Unknown tools fall back to their key:value pairs. */
function formatToolArguments(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'draft_reply': {
      const text = args.text;
      return typeof text === 'string' ? text : '';
    }
    case 'search_listings': {
      const query = args.query;
      return typeof query === 'string' ? `Search “${query}”` : '';
    }
    case 'get_listing_details': {
      const listingId = args.listingId;
      return typeof listingId === 'string' ? `Listing ${listingId}` : '';
    }
    case 'check_price_history': {
      const query = args.query;
      return typeof query === 'string' ? `Price history for “${query}”` : '';
    }
    case 'read_conversation': {
      const limit = args.limit;
      const n = typeof limit === 'number' ? limit : 20;
      return `Read last ${n} messages`;
    }
    default: {
      try {
        const entries = Object.entries(args);
        if (entries.length === 0) return '';
        return entries
          .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
          .join(', ');
      } catch {
        return '';
      }
    }
  }
}

export function StudioApprovalsSection({
  approvals,
  bots,
  loading,
  loadError,
  stale,
  onRetry,
}: {
  approvals: AgentStudioApproval[];
  bots: AgentBot[] | undefined;
  loading: boolean;
  loadError: string | null;
  stale: boolean;
  onRetry: () => void;
}) {
  const { show } = useToast();
  const { approve, deny } = useStudioApprovalActions();
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);

  const botName = (botId: string) =>
    bots?.find((b) => b.id === botId)?.name ?? 'Agent';

  const handleApprove = async (approval: AgentStudioApproval) => {
    setApprovingId(approval.id);
    try {
      await approve(approval.id);
      show('Approved — the agent can continue.', 'success');
    } catch (err) {
      show(parseApiError(err, 'The request could not be approved.').message, 'error');
    } finally {
      setApprovingId(null);
    }
  };

  const handleDeny = async (approval: AgentStudioApproval) => {
    setDenyingId(approval.id);
    try {
      await deny(approval.id);
      show('Denied — the action won’t run.', 'info');
    } catch (err) {
      show(parseApiError(err, 'The request could not be rejected.').message, 'error');
    } finally {
      setDenyingId(null);
    }
  };

  return (
    <div>
      <p className="px-4 text-label uppercase tracking-[0.08em] text-text-muted sm:px-6">
        Pending approvals
      </p>
      <p className="mt-1 px-4 text-caption text-text-muted sm:px-6">
        Consequential actions pause here until you decide. Approving resumes the run.
      </p>

      {stale && !loading ? (
        <div className="mt-2 flex items-baseline gap-3 px-4 sm:px-6">
          <p className="text-caption text-warning-text">
            Approvals may be out of date — last refresh failed.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="pressable text-caption font-medium text-warning-text underline underline-offset-2"
          >
            Retry approvals
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-3 border-y border-border-subtle px-4 sm:px-6" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className="py-4">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="mt-2 h-3 w-64 max-w-full" />
              <Skeleton className="mt-3 h-9 w-40" />
            </div>
          ))}
        </div>
      ) : approvals.length === 0 && loadError ? (
        <div className="mt-3 border-y border-border-subtle px-4 py-6 sm:px-6">
          <p className="text-body text-warning-text">Approvals couldn’t load.</p>
          <p className="mt-1 text-caption text-text-secondary">{loadError}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : approvals.length === 0 ? (
        <p className="mt-3 border-y border-border-subtle px-4 py-6 text-body text-text-muted sm:px-6">
          Nothing is waiting for approval. When an agent proposes a
          consequential action it lands here first.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border-subtle border-y border-border-subtle px-4 sm:px-6">
          {approvals.map((approval) => {
            const name = botName(approval.botId);
            const isApproving = approvingId === approval.id;
            const isDenying = denyingId === approval.id;
            const argsText = formatToolArguments(approval.toolName, approval.toolArguments);
            return (
              <li key={approval.id} className="py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="min-w-0 text-body-emphasis text-text-primary">
                    {name}
                  </p>
                  <span className="tnum shrink-0 text-caption text-text-muted">
                    {timeAgo(approval.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-caption text-text-muted">{approval.toolName}</p>
                {argsText ? (
                  <p className="mt-1.5 text-body text-text-secondary">{argsText}</p>
                ) : null}
                {approval.expiresAt ? (
                  <p className="mt-1 text-caption text-text-muted">
                    Expires {expiresIn(approval.expiresAt)}
                  </p>
                ) : null}
                <div className="mt-2.5 flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleApprove(approval)}
                    disabled={isApproving || isDenying}
                    aria-label={
                      isApproving ? 'Approving…' : `Approve request from ${name}`
                    }
                  >
                    {isApproving ? 'Approving…' : 'Approve'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-danger-text"
                    onClick={() => void handleDeny(approval)}
                    disabled={isApproving || isDenying}
                    aria-label={
                      isDenying ? 'Denying…' : `Deny request from ${name}`
                    }
                  >
                    {isDenying ? 'Denying…' : 'Deny'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
