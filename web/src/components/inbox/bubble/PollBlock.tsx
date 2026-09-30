'use client';

/**
 * PollBlock — interactive in-chat poll widget.
 * Renders question, options, vote distribution fill bars, anonymous & closed tags,
 * and handles optimistic toggle states.
 */

import { useState } from 'react';
import type { ChatPoll } from '@/lib/contracts/domain';
import { Icon } from '@/components/ui/Icon';

interface PollBlockProps {
  poll: ChatPoll;
  mine: boolean;
  readOnly: boolean;
  onToggle: (optionIndex: number) => void;
}

export function PollBlock({
  poll,
  mine,
  readOnly,
  onToggle,
}: PollBlockProps) {
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  const totalVotes = poll.voteCounts.reduce((a, b) => a + b, 0);
  const closed =
    poll.closesAt != null && Date.parse(poll.closesAt) < Date.now();
  const inert = readOnly || closed;

  const toggle = (idx: number) => {
    if (inert || pendingIdx !== null) return;
    setPendingIdx(idx);
    onToggle(idx);
    setTimeout(() => setPendingIdx(null), 400);
  };

  return (
    <div className="min-w-[220px]">
      <p
        className={`text-body font-semibold ${
          mine ? 'text-text-inverse' : 'text-text-primary'
        }`}
      >
        {poll.question}
      </p>
      <p
        className={`mt-0.5 text-meta ${
          mine ? 'text-text-inverse/60' : 'text-text-muted'
        }`}
      >
        {[
          poll.allowMultiple ? 'Select all that apply' : null,
          poll.isAnonymous ? 'Anonymous' : null,
          closed ? 'Closed' : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'Poll'}
      </p>
      <div
        className="mt-2 space-y-1.5"
        role="group"
        aria-label={`Poll: ${poll.question}`}
      >
        {poll.options.map((option, idx) => {
          const count = poll.voteCounts[idx] ?? 0;
          const pct =
            totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const selected = poll.myVotes.includes(idx);
          const inner = (
            <>
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 rounded-md transition-[width] duration-300 ${
                  selected
                    ? mine
                      ? 'bg-text-inverse/30'
                      : 'bg-brand/25'
                    : mine
                      ? 'bg-text-inverse/12'
                      : 'bg-border-subtle'
                }`}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex items-center justify-between gap-3 px-2.5 py-2">
                <span
                  className={`clamp-2 text-body ${
                    selected
                      ? `font-semibold ${
                          mine ? 'text-text-inverse' : 'text-text-primary'
                        }`
                      : mine
                        ? 'text-text-inverse/90'
                        : 'text-text-primary'
                  }`}
                >
                  {selected ? (
                    <Icon
                      name="check"
                      size={13}
                      className="mr-1.5 inline-block -translate-y-px align-middle"
                    />
                  ) : null}
                  {option}
                </span>
                <span
                  className={`tnum shrink-0 text-meta font-semibold ${
                    mine ? 'text-text-inverse/70' : 'text-text-secondary'
                  }`}
                >
                  {pendingIdx === idx ? '…' : count > 0 ? `${pct}%` : ''}
                </span>
              </span>
            </>
          );
          return inert ? (
            <div key={idx} className="relative overflow-hidden rounded-md">
              {inner}
            </div>
          ) : (
            <button
              key={idx}
              type="button"
              onClick={() => toggle(idx)}
              disabled={pendingIdx !== null}
              aria-pressed={selected}
              className={`pressable relative block w-full overflow-hidden rounded-md text-left ${
                mine ? 'hover:bg-text-inverse/10' : 'hover:bg-border-subtle/60'
              }`}
            >
              {inner}
            </button>
          );
        })}
      </div>
      <p
        className={`mt-1.5 text-meta ${
          mine ? 'text-text-inverse/60' : 'text-text-muted'
        }`}
      >
        {totalVotes} vote{totalVotes === 1 ? '' : 's'}
      </p>
    </div>
  );
}
