'use client';

/**
 * HostChatPanel — the host's chat moderation surface. The seeded viewer
 * script streams in on a deterministic tick (same seeded-rhythm grammar as
 * the viewer's useLiveChat); every row exposes pin / hide controls. Pin
 * lifts a message into a banner the host keeps on top; hide removes it
 * from view with a count + restore. Everything is labelled simulated.
 */

import { useEffect, useRef, useState } from 'react';
import { HOST_CHAT_LINES } from '@/lib/data/fixtures-livehost';
import { Icon } from '@/components/ui/Icon';
import { seededRandom } from '@/components/live/useLivePresence';
import { setPinnedChatNote } from '@/components/live/livePins';

interface HostChatMessage {
  id: string;
  user: string;
  text: string;
  kind: 'chat' | 'system';
}

interface HostChatPanelProps {
  /** Seeds the deterministic chat rhythm. */
  sessionId: string;
  /** False while scheduled — the stream only "airs" once live. */
  active: boolean;
}

const actionBtn =
  'pressable relative flex h-8 w-8 items-center justify-center rounded-md after:absolute after:-inset-1.5 after:content-[""] text-text-muted transition-colors hover:bg-surface-alt hover:text-text-primary';

export function HostChatPanel({ sessionId, active }: HostChatPanelProps) {
  const [messages, setMessages] = useState<HostChatMessage[]>([]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Deterministic stream-in — the same lines arrive in the same order on
  // every visit, matching the viewer overlay's fixture rhythm.
  useEffect(() => {
    if (!active) {
      setMessages([]);
      return;
    }
    setMessages([
      { id: `${sessionId}-sys`, user: '', text: 'You went live — viewers can chat now', kind: 'system' },
    ]);
    setHidden(new Set());
    setPinnedId(null);

    const rand = seededRandom(`${sessionId}:host-chat`);
    const timers: number[] = [];
    let delay = 1_400;
    HOST_CHAT_LINES.forEach((line) => {
      delay += 1_800 + rand() * 2_200;
      timers.push(
        window.setTimeout(() => {
          setMessages((m) => [
            ...m,
            { id: line.id, user: line.user, text: line.text, kind: 'chat' },
          ]);
        }, delay),
      );
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [sessionId, active]);

  // Keep the newest line in view — the host watches the tail.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const pinned = pinnedId ? messages.find((m) => m.id === pinnedId) ?? null : null;

  // Pin/unpin writes through to the shared pins store — the viewer's chat
  // rail shows the same note, so a host pin reaches the audience mid-show.
  const pin = (msg: HostChatMessage) => {
    setPinnedId(msg.id);
    setPinnedChatNote(sessionId, { user: msg.user, text: msg.text });
  };

  const unpin = () => {
    setPinnedId(null);
    setPinnedChatNote(sessionId, null);
  };

  const hide = (id: string) => {
    setHidden((h) => new Set(h).add(id));
    if (pinnedId === id) unpin();
  };

  // Leaving the room releases the note — a pinned line must not outlive
  // the show it was pinned on.
  useEffect(() => () => setPinnedChatNote(sessionId, null), [sessionId]);

  return (
    <section aria-label="Viewer chat moderation" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="text-section-title font-semibold text-text-primary">Viewer chat</h2>
        <span className="text-meta text-text-muted">Simulated</span>
      </div>

      {pinned ? (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-border bg-surface-alt px-3 py-2">
          <Icon name="pin" filled size={14} className="mt-0.5 shrink-0 text-text-secondary" />
          <p className="min-w-0 flex-1 text-caption text-text-primary">
            <span className="font-semibold">{pinned.user}</span> {pinned.text}
          </p>
          <button
            type="button"
            onClick={unpin}
            aria-label="Unpin message"
            className={actionBtn}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : null}

      <div
        ref={listRef}
        className="max-h-[42vh] min-h-[220px] flex-1 overflow-y-auto lg:max-h-none"
        role="log"
        aria-label="Viewer messages"
      >
        {messages.filter((m) => !hidden.has(m.id)).map((msg) =>
          msg.kind === 'system' ? (
            <p key={msg.id} className="border-b border-border-subtle px-1 py-2.5 text-meta italic text-text-muted">
              {msg.text}
            </p>
          ) : (
            <div
              key={msg.id}
              className="group flex items-start gap-1 border-b border-border-subtle px-1 py-2.5"
            >
              <p className="min-w-0 flex-1 text-body leading-snug">
                <span className="mr-2 text-text-muted">{msg.user}</span>
                <span className="text-text-primary">{msg.text}</span>
              </p>
              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => (pinnedId === msg.id ? unpin() : pin(msg))}
                  aria-label={
                    pinnedId === msg.id
                      ? `Unpin message from ${msg.user}`
                      : `Pin message from ${msg.user}`
                  }
                  aria-pressed={pinnedId === msg.id}
                  title="Pin for viewers"
                  className={actionBtn}
                >
                  <Icon name="pin" filled={pinnedId === msg.id} size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => hide(msg.id)}
                  aria-label={`Hide message from ${msg.user}`}
                  title="Hide"
                  className={actionBtn}
                >
                  <Icon name="eyeOff" size={14} />
                </button>
              </div>
            </div>
          ),
        )}
      </div>

      {hidden.size > 0 ? (
        <button
          type="button"
          onClick={() => setHidden(new Set())}
          className="pressable mt-2 self-start rounded-md px-1 py-1 text-meta font-medium text-text-muted transition-colors hover:text-text-primary"
        >
          {hidden.size} hidden — show all
        </button>
      ) : null}
    </section>
  );
}
