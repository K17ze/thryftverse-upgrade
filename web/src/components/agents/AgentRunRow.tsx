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
  queued: 'text-text-muted',
  running: 'text-text-muted',
  awaiting_approval: 'text-warning-text',
  waiting_for_input: 'text-warning-text',
  succeeded: 'text-success-text',
  failed: 'text-danger-text',
  timed_out: 'text-danger-text',
  cancelled: 'text-text-muted',
  unknown_outcome: 'text-text-muted',
  skipped: 'text-text-muted',
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
  // The wire's target is the conversation the run happened in; fixture
  // rows carry an authored object label. Show whichever exists — never a
  // placeholder.
  const targetLabel =
    run.target ?? (run.conversationId ? `Chat ${run.conversationId}` : '');
  // Mobile: the stacked ledger line (action / target / detail). At lg the
  // two wrapper divs dissolve via display:contents and the row re-forms as
  // a dense ops table — action · target · outcome · time columns.
  return (
    <li className="flex items-start gap-3.5 py-3 lg:grid lg:grid-cols-[32px_minmax(0,1.2fr)_minmax(0,1fr)_96px_64px] lg:items-center lg:gap-x-6">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center text-text-secondary lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:mt-0">
        <AgentIcon category={botCategory} name={botName} size={18} />
      </span>
      <div className="min-w-0 flex-1 lg:contents">
        <div className="flex items-baseline gap-3 lg:contents">
          <p className="clamp-1 min-w-0 flex-1 text-body font-medium text-text-primary lg:col-start-2 lg:row-start-1">
            {run.action}
          </p>
          <span
            className={`shrink-0 text-caption font-medium lg:col-start-4 lg:row-start-1 lg:text-right ${OUTCOME_CLASS[run.outcome]}`}
          >
            {outcome.label}
          </span>
          <span className="tnum w-16 shrink-0 text-right text-meta text-text-muted lg:col-start-5 lg:row-start-1 lg:w-auto">
            {timeAgo(run.at)}
          </span>
        </div>
        <p className="clamp-1 mt-0.5 text-caption text-text-secondary lg:col-start-3 lg:row-start-1 lg:mt-0">
          {showBot && botName ? `${botName} · ` : ''}
          {targetLabel}
        </p>
        {run.detail ? (
          <p className="clamp-2 mt-0.5 text-caption text-text-muted lg:col-span-3 lg:col-start-2 lg:row-start-2">
            {run.detail}
          </p>
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
