'use client';

/**
 * HostLiveChat — the live-mode host chat surface. Real messages only:
 * REST history + SSE appends come from useHostBroadcast; the composer
 * POSTs to the same chat endpoint viewers use (the server flags the
 * host's own lines isSeller). Every viewer row exposes mute/unmute and
 * kick — the real moderation routes, one pending target at a time, the
 * server's rejection reason reaching the toast verbatim. There is no
 * message-delete or pin contract — those stay out of the live console.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { parseApiError } from '@/lib/api/http';
import type { LiveChatMessage } from '@/components/live/useLiveChat';

interface HostLiveChatProps {
  messages: LiveChatMessage[];
  /** null while the show isn't live — chat has no pre-air surface. */
  send: ((text: string) => void) | null;
  /** Currently muted viewer ids — rows show their state, actions flip. */
  mutedIds: ReadonlySet<string>;
  onMute: (userId: string) => Promise<void>;
  onUnmute: (userId: string) => Promise<void>;
  onKick: (userId: string) => Promise<void>;
}

const actionBtn =
  'pressable flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-alt hover:text-text-primary disabled:opacity-40';

export function HostLiveChat({
  messages,
  send,
  mutedIds,
  onMute,
  onUnmute,
  onKick,
}: HostLiveChatProps) {
  const { show } = useToast();
  const listRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [pendingUser, setPendingUser] = useState<string | null>(null);

  // Keep the newest line in view — the host watches the tail.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const moderate = async (userId: string, action: () => Promise<void>) => {
    if (pendingUser) return;
    setPendingUser(userId);
    try {
      await action();
    } catch (error) {
      show(parseApiError(error, 'Moderation failed — try again').message, 'error');
    } finally {
      setPendingUser(null);
    }
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || !send) return;
    send(text);
    setDraft('');
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  return (
    <section aria-label="Viewer chat" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="text-section-title font-semibold text-text-primary">
          Viewer chat
        </h2>
        <span className="tnum text-meta text-text-muted">
          {messages.filter((m) => m.kind === 'chat').length} messages
        </span>
      </div>

      <div
        ref={listRef}
        className="max-h-[42vh] min-h-[220px] flex-1 overflow-y-auto lg:max-h-none"
        role="log"
        aria-label="Viewer messages"
      >
        {messages.length === 0 ? (
          <p className="px-1 py-3 text-meta text-text-muted">
            No messages yet — viewers can chat while you&apos;re live.
          </p>
        ) : (
          messages.map((msg) =>
            msg.kind === 'system' ? (
              <p
                key={msg.id}
                className="border-b border-border-subtle px-1 py-2.5 text-meta italic text-text-muted"
              >
                {msg.text}
              </p>
            ) : (
              <div
                key={msg.id}
                className="group flex items-start gap-1 border-b border-border-subtle px-1 py-2.5"
              >
                <p className="min-w-0 flex-1 text-body leading-snug">
                  <span className="mr-2 font-semibold text-text-muted">
                    {msg.mine || msg.seller ? 'You' : msg.user}
                  </span>
                  {msg.seller ? (
                    <span className="mr-1.5 rounded-sm bg-surface-alt px-1 py-px text-micro font-semibold uppercase tracking-[0.08em] text-text-secondary">
                      Host
                    </span>
                  ) : null}
                  <span
                    className={
                      msg.userId && mutedIds.has(msg.userId)
                        ? 'text-text-muted line-through'
                        : 'text-text-primary'
                    }
                  >
                    {msg.text}
                  </span>
                  {msg.userId && mutedIds.has(msg.userId) ? (
                    <span className="ml-1.5 text-meta text-text-muted">
                      muted
                    </span>
                  ) : null}
                </p>
                {/* Moderation targets need a backend user id — lines the
                    server didn't attribute stay read-only. */}
                {msg.userId && !msg.seller && !msg.mine ? (
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() =>
                        void moderate(msg.userId as string, () =>
                          mutedIds.has(msg.userId as string)
                            ? onUnmute(msg.userId as string)
                            : onMute(msg.userId as string),
                        )
                      }
                      disabled={pendingUser === msg.userId}
                      aria-label={
                        mutedIds.has(msg.userId)
                          ? `Unmute ${msg.user}`
                          : `Mute ${msg.user}`
                      }
                      aria-pressed={mutedIds.has(msg.userId)}
                      title={
                        mutedIds.has(msg.userId)
                          ? 'Unmute — they can chat again'
                          : 'Mute — they can watch but not chat'
                      }
                      className={actionBtn}
                    >
                      <Icon
                        name={mutedIds.has(msg.userId) ? 'lockOpen' : 'ban'}
                        size={14}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void moderate(msg.userId as string, () =>
                          onKick(msg.userId as string),
                        )
                      }
                      disabled={pendingUser === msg.userId}
                      aria-label={`Remove ${msg.user} from the stream`}
                      title="Remove from stream"
                      className={actionBtn}
                    >
                      <Icon name="personRemove" size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
            ),
          )
        )}
      </div>

      {send ? (
        <form onSubmit={onSubmit} className="flex items-end gap-1 pt-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Say something"
            aria-label="Chat message"
            maxLength={200}
            enterKeyHint="send"
            className="h-10 min-w-0 flex-1 border-b border-border bg-transparent text-body text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-text-secondary"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send message"
            className="pressable inline-flex h-11 w-10 shrink-0 items-center justify-center text-text-primary disabled:opacity-35"
          >
            <Icon name="send" size={20} />
          </button>
        </form>
      ) : null}
    </section>
  );
}
