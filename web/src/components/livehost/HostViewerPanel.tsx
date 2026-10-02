'use client';

/**
 * HostViewerPanel — the live-mode moderation surface. Three honest lists:
 *
 *  - Count: the server's viewer_count (SSE + kick responses) — no
 *    fabricated drift.
 *  - Chatters: viewers who actually sent a message this session. There is
 *    no roster endpoint, so the chat senders are the actionable viewer
 *    set — same truth mobile's moderation sheet works from.
 *  - Muted: GET /moderation/viewers — names resolve from chat senders
 *    first, then /users/:id/profile for muted accounts that never
 *    chatted; an unresolvable id stays an id, never a fake name.
 */

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { parseApiError } from '@/lib/api/http';
import * as liveService from '@/lib/api/services/live';
import { fetchUserProfile } from '@/lib/api/services/users';
import { formatCount } from '@/lib/utils/format';
import type { HostChatter } from './useHostBroadcast';

interface HostViewerPanelProps {
  viewerCount: number | null;
  chatters: HostChatter[];
  muted: liveService.MutedStreamViewer[];
  onMute: (userId: string) => Promise<void>;
  onUnmute: (userId: string) => Promise<void>;
  onKick: (userId: string) => Promise<void>;
}

const actionBtn =
  'pressable relative flex h-8 w-8 items-center justify-center rounded-md after:absolute after:-inset-1.5 after:content-[""] text-text-muted transition-colors hover:bg-surface-alt hover:text-text-primary disabled:opacity-40';

/** "Viewer ab12cd…" — the honest label for an id with no resolvable name. */
function idLabel(userId: string): string {
  return `Viewer ${userId.slice(0, 6)}…`;
}

export function HostViewerPanel({
  viewerCount,
  chatters,
  muted,
  onMute,
  onUnmute,
  onKick,
}: HostViewerPanelProps) {
  const { show } = useToast();
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  /** Resolved display names for muted ids that never chatted — fetched
   *  once per id from the public profile contract. */
  const [resolvedNames, setResolvedNames] = useState<Map<string, string>>(
    new Map(),
  );

  const chatterName = new Map(chatters.map((c) => [c.userId, c.userName]));

  const labelFor = (userId: string): string =>
    chatterName.get(userId) ?? resolvedNames.get(userId) ?? idLabel(userId);

  // Resolve names for muted viewers the chat never surfaced — small,
  // one-shot fetches, cached in the map.
  useEffect(() => {
    const missing = muted.filter(
      (v) => !chatterName.has(v.userId) && !resolvedNames.has(v.userId),
    );
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(
      missing.map(async (v) => {
        try {
          const profile = await fetchUserProfile(v.userId);
          return { userId: v.userId, name: profile?.username ?? null };
        } catch {
          return { userId: v.userId, name: null };
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setResolvedNames((prev) => {
        const next = new Map(prev);
        for (const r of results) {
          if (r.name) next.set(r.userId, r.name);
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muted, chatters]);

  const moderate = async (userId: string, action: () => Promise<void>) => {
    if (pendingUser) return;
    setPendingUser(userId);
    try {
      await action();
    } catch (error) {
      show(
        parseApiError(error, 'Moderation failed — try again').message,
        'error',
      );
    } finally {
      setPendingUser(null);
    }
  };

  const mutedIds = new Set(muted.map((v) => v.userId));

  return (
    <section aria-label="Viewers" className="border-b border-border-subtle pb-5">
      <div className="flex items-baseline justify-between pb-2">
        <h2 className="text-section-title font-semibold text-text-primary">
          Viewers
        </h2>
        <span className="tnum text-meta text-text-muted">
          {viewerCount != null ? `${formatCount(viewerCount)} watching` : '—'}
        </span>
      </div>

      {/* Chatters — the actionable viewer set; moderation is per row. */}
      {chatters.length > 0 ? (
        <ul>
          {chatters.map((chatter) => {
            const isMuted = mutedIds.has(chatter.userId);
            const busy = pendingUser === chatter.userId;
            return (
              <li
                key={chatter.userId}
                className="flex items-center gap-2 border-b border-border-subtle px-1 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-caption text-text-primary">
                  {chatter.userName}
                  {isMuted ? (
                    <span className="ml-1.5 text-meta text-text-muted">
                      muted
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void moderate(chatter.userId, () =>
                      isMuted
                        ? onUnmute(chatter.userId)
                        : onMute(chatter.userId),
                    )
                  }
                  disabled={busy}
                  aria-label={
                    isMuted
                      ? `Unmute ${chatter.userName}`
                      : `Mute ${chatter.userName}`
                  }
                  aria-pressed={isMuted}
                  title={
                    isMuted
                      ? 'Unmute — they can chat again'
                      : 'Mute — they can watch but not chat'
                  }
                  className={actionBtn}
                >
                  <Icon name={isMuted ? 'lockOpen' : 'ban'} size={14} />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void moderate(chatter.userId, () => onKick(chatter.userId))
                  }
                  disabled={busy}
                  aria-label={`Remove ${chatter.userName} from the stream`}
                  title="Remove from stream"
                  className={actionBtn}
                >
                  <Icon name="personRemove" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {/* Muted viewers — the moderation route's real roster. Anyone muted
          who never chatted still lands here (from history or another
          host's action), names resolved by profile lookup. */}
      {muted.length > 0 ? (
        <ul>
          {muted
            .filter((v) => !chatterName.has(v.userId))
            .map((v) => (
              <li
                key={v.userId}
                className="flex items-center gap-2 border-b border-border-subtle px-1 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-caption text-text-muted">
                  {labelFor(v.userId)}
                  <span className="ml-1.5 text-meta">muted</span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void moderate(v.userId, () => onUnmute(v.userId))
                  }
                  disabled={pendingUser === v.userId}
                  aria-label={`Unmute ${labelFor(v.userId)}`}
                  title="Unmute — they can chat again"
                  className={actionBtn}
                >
                  <Icon name="lockOpen" size={14} />
                </button>
              </li>
            ))}
        </ul>
      ) : null}

      {chatters.length === 0 && muted.length === 0 ? (
        <p className="px-1 py-2 text-meta text-text-muted">
          Nobody has chatted yet — chatters and muted viewers appear here.
        </p>
      ) : null}
    </section>
  );
}
