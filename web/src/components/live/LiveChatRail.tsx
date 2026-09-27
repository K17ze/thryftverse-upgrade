'use client';

/**
 * LiveChatRail — the chat column over the media stage. Flat rows with
 * hairline separators (mobile grammar: no bubbles, no cards), pinned to the
 * latest line, top edge fades into the canvas. The composer is a hairline-
 * underlined field + send hit area; replays pass `onSend={null}` and get a
 * read-only transcript.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { LiveChatMessage } from './useLiveChat';
import type { PinnedChatNote } from './livePins';

interface LiveChatRailProps {
  messages: LiveChatMessage[];
  /** null → read-only transcript (replays), no composer. */
  onSend: ((text: string) => void) | null;
  /** A chat line the host pinned for the room — rendered above the feed. */
  pinned?: PinnedChatNote | null;
  className?: string;
  /** Sizing for the scroll area — e.g. a max-height bound per placement. */
  listClassName?: string;
}

export function LiveChatRail({
  messages,
  onSend,
  pinned = null,
  className = '',
  listClassName = '',
}: LiveChatRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');

  // Pinned to the latest line — same rule as mobile's scrollToEnd.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text || !onSend) return;
    onSend(text);
    setDraft('');
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  return (
    <div className={`flex min-h-0 flex-col ${className}`}>
      {/* Host-pinned note — Whatnot grammar; only renders when the host
          actually pinned a line this session. */}
      {pinned ? (
        <div className="mb-2 flex items-start gap-2 rounded-md bg-white/10 px-3 py-2">
          <Icon name="pin" filled size={13} className="mt-0.5 shrink-0 text-scrim-text-secondary" />
          <p className="min-w-0 flex-1 text-caption text-scrim-text-primary">
            <span className="font-semibold">{pinned.user}</span>
            <span className="text-scrim-text-secondary">{' · '}</span>
            {pinned.text}
          </p>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Live chat"
        className={`no-scrollbar min-h-0 flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_30px)] ${listClassName}`}
      >
        {messages.map((m) =>
          m.kind === 'system' ? (
            <p key={m.id} className="py-1.5 text-meta italic text-scrim-text-secondary">
              {m.text}
            </p>
          ) : (
            <p
              key={m.id}
              className="border-b border-white/10 py-1.5 text-body leading-snug last:border-b-0"
            >
              <span className="font-semibold text-scrim-text-secondary">
                {m.mine ? 'you' : m.user}
              </span>
              {m.seller ? (
                <span className="ml-1.5 rounded-sm bg-white/15 px-1 py-px text-micro font-bold uppercase tracking-[0.08em] text-scrim-text-primary">
                  Host
                </span>
              ) : null}
              <span className="text-scrim-text-tertiary">{'  '}</span>
              <span className="text-scrim-text-primary">{m.text}</span>
            </p>
          ),
        )}
      </div>

      {onSend ? (
        <form onSubmit={onSubmit} className="flex items-end gap-1 pt-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Say something"
            aria-label="Chat message"
            maxLength={200}
            enterKeyHint="send"
            className="h-10 min-w-0 flex-1 border-b border-white/15 bg-transparent text-body text-scrim-text-primary outline-none transition-colors placeholder:text-scrim-text-tertiary focus:border-white/45"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send message"
            className="pressable inline-flex h-11 w-10 shrink-0 items-center justify-center text-scrim-text-primary disabled:opacity-35"
          >
            <Icon name="send" size={20} />
          </button>
        </form>
      ) : null}
    </div>
  );
}
