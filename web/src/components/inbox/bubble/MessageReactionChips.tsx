'use client';

import type { Message } from '@/lib/contracts/domain';

interface MessageReactionChipsProps {
  message: Message;
  mine: boolean;
  menuable?: boolean;
  onToggleReaction?: (message: Message, emoji: string) => void;
}

export function MessageReactionChips({
  message: m,
  mine,
  menuable,
  onToggleReaction,
}: MessageReactionChipsProps) {
  const reactions = m.reactions ?? [];
  if (reactions.length === 0) return null;

  return (
    <div
      className={`absolute -bottom-2.5 z-[1] flex gap-1 ${
        mine ? 'right-2' : 'left-2'
      }`}
      aria-label={`${reactions.length} reaction${
        reactions.length === 1 ? '' : 's'
      }`}
    >
      {reactions.slice(0, 3).map((r, i) => {
        const count = r.count ?? r.userIds.length;
        const chipCls = `flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 leading-none ${
          r.reactedByMe
            ? 'border-brand bg-brand-subtle'
            : 'border-border-subtle bg-surface-elevated'
        }`;
        const inner = (
          <>
            <span className="text-meta" aria-hidden>
              {r.emoji}
            </span>
            {count > 1 ? (
              <span className="tnum text-micro font-semibold text-text-secondary">
                {count}
              </span>
            ) : null}
          </>
        );
        return onToggleReaction && menuable ? (
          <button
            key={`${r.emoji}-${i}`}
            type="button"
            onClick={() => onToggleReaction(m, r.emoji)}
            aria-pressed={r.reactedByMe === true}
            aria-label={`${r.emoji} reaction${
              count > 1 ? ` — ${count} people` : ''
            }`}
            className={`pressable relative ${chipCls} after:absolute after:-inset-1.5 after:content-['']`}
          >
            {inner}
          </button>
        ) : (
          <span key={`${r.emoji}-${i}`} className={chipCls}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}
