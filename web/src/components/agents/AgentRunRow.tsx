'use client';

/**
 * AgentRunRow — one ledger line: what the bot did, what it acted on, how it
 * ended, when. Outcome is coloured text, not a badge — port of the mobile
 * AgentLedger row grammar.
 */

import type { AgentCategory, AgentRunEntry } from '@/lib/contracts/agents';
import { OUTCOME_META } from '@/lib/contracts/agents';
import { timeAgo } from '@/lib/utils/format';
import { Icon } from '@/components/ui/Icon';
import { AgentIcon } from './AgentIcon';

const OUTCOME_CLASS: Record<AgentRunEntry['outcome'], string> = {
  succeeded: 'text-success-text',
  skipped: 'text-text-muted',
  failed: 'text-danger-text',
  awaiting_approval: 'text-warning-text',
};

interface AgentRunRowProps {
  run: AgentRunEntry;
  /** Bot display info — when the ledger mixes bots the row shows who ran it. */
  botName?: string;
  botCategory?: AgentCategory;
  showBot?: boolean;
}

export function AgentRunRow({ run, botName, botCategory, showBot }: AgentRunRowProps) {
  const outcome = OUTCOME_META[run.outcome];
  return (
    <li className="flex items-start gap-3.5 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-text-secondary">
        <AgentIcon category={botCategory} name={botName} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <p className="clamp-1 min-w-0 flex-1 text-body font-medium text-text-primary">
            {run.action}
          </p>
          <span
            className={`shrink-0 text-caption font-medium ${OUTCOME_CLASS[run.outcome]}`}
          >
            {outcome.label}
          </span>
          <span className="tnum w-16 shrink-0 text-right text-meta text-text-muted">
            {timeAgo(run.at)}
          </span>
        </div>
        <p className="clamp-1 mt-0.5 text-caption text-text-secondary">
          {showBot && botName ? `${botName} · ` : ''}
          {run.target}
        </p>
        {run.detail ? (
          <p className="clamp-2 mt-0.5 text-caption text-text-muted">{run.detail}</p>
        ) : null}
      </div>
    </li>
  );
}

/** Compact permission row — capability label + honest risk word. */
export function PermissionRow({
  label,
  riskWord,
}: {
  label: string;
  riskWord: string;
}) {
  return (
    <li className="flex items-center gap-3.5 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center text-text-muted">
        <Icon name="key" size={15} />
      </span>
      <span className="flex-1 text-body text-text-primary">{label}</span>
      <span className="text-caption text-text-muted">{riskWord}</span>
    </li>
  );
}
