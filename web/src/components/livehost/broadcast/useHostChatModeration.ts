'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { getApiBaseUrl, getAuthSession, parseApiError } from '@/lib/api/http';
import * as liveService from '@/lib/api/services/live';
import type { LiveChatMessage } from '@/components/live/useLiveChat';
import type { LiveRoomEndSummary } from '@/components/live/useLiveRoom';
import {
  CHAT_RESYNC_MS,
  type HostBroadcastPhase,
  type HostChatter,
  type RealtimeEnvelope,
} from './broadcastTypes';

export interface UseHostChatModerationParams {
  active: boolean;
  sessionId: string | null;
  phase: HostBroadcastPhase;
  isGuest: boolean;
  myId: string | null;
  attempt: number;
  initialViewers?: number | null;
  onSessionEnded: (summary: LiveRoomEndSummary) => void;
  show: (message: string, tone?: 'info' | 'success' | 'error') => void;
  qc: QueryClient;
}

export function useHostChatModeration({
  active,
  sessionId,
  phase,
  isGuest,
  myId,
  attempt,
  initialViewers,
  onSessionEnded,
  show,
  qc,
}: UseHostChatModerationParams) {
  const [viewerCount, setViewerCount] = useState<number | null>(
    initialViewers ?? null,
  );
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [chatters, setChatters] = useState<HostChatter[]>([]);
  const [mutedViewers, setMutedViewers] = useState<
    liveService.MutedStreamViewer[]
  >([]);

  const seenIds = useRef(new Set<string>());
  const chatterMapRef = useRef(new Map<string, string>());
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const mapMessage = useCallback(
    (m: liveService.StreamChatMessage): LiveChatMessage => ({
      id: m.id,
      user: m.userName,
      text: m.message,
      kind: m.type === 'message' ? 'chat' : 'system',
      seller: m.isSeller,
      mine: myId != null && m.userId === myId,
      userId: m.userId,
    }),
    [myId],
  );

  const trackChatter = useCallback((m: liveService.StreamChatMessage) => {
    if (m.isSeller || !m.userId) return;
    const map = chatterMapRef.current;
    if (map.has(m.userId)) return;
    map.set(m.userId, m.userName);
    setChatters(
      [...map.entries()].map(([userId, userName]) => ({ userId, userName })),
    );
  }, []);

  const appendMessage = useCallback(
    (m: liveService.StreamChatMessage) => {
      trackChatter(m);
      if (seenIds.current.has(m.id)) return;
      seenIds.current.add(m.id);
      setMessages((prev) => [...prev.slice(-150), mapMessage(m)]);
    },
    [mapMessage, trackChatter],
  );

  const appendSystemLine = useCallback((id: string, text: string) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === id)) return prev;
      return [...prev, { id, user: '', text, kind: 'system' as const }];
    });
  }, []);

  // ── Chat snapshot ──
  useEffect(() => {
    if (!active || !sessionId || phase !== 'live') return;
    let cancelled = false;

    const load = async () => {
      try {
        const rows = await liveService.fetchStreamChatMessages(sessionId);
        if (cancelled) return;
        seenIds.current = new Set(rows.map((r) => r.id));
        const map = chatterMapRef.current;
        for (const r of rows) {
          if (!r.isSeller && r.userId) map.set(r.userId, r.userName);
        }
        setChatters(
          [...map.entries()].map(([userId, userName]) => ({
            userId,
            userName,
          })),
        );
        setMessages((prev) => [
          ...prev.filter((m) => m.kind === 'system'),
          ...rows.map(mapMessage),
        ]);
      } catch {
        // History is best-effort — SSE keeps appending over an empty base.
      }
    };

    void load();
    const poll = window.setInterval(load, CHAT_RESYNC_MS);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [active, sessionId, phase, mapMessage]);

  // ── Muted-viewer baseline ──
  useEffect(() => {
    if (!active || !sessionId || isGuest) return;
    let cancelled = false;
    const load = () =>
      liveService
        .fetchMutedStreamViewers(sessionId)
        .then((rows) => {
          if (!cancelled) setMutedViewers(rows);
        })
        .catch(() => {});
    void load();
    return () => {
      cancelled = true;
    };
  }, [active, sessionId, isGuest, attempt]);

  // ── SSE session channel ──
  useEffect(() => {
    if (!active || !sessionId || isGuest || phase === 'ended') return;

    const topic = `live.session:${sessionId}`;
    let disposed = false;
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let connectAttempt = 0;

    const resnapshot = () => {
      if (phaseRef.current === 'live') {
        void liveService
          .fetchStreamChatMessages(sessionId)
          .then((rows) => {
            if (disposed) return;
            seenIds.current = new Set(rows.map((r) => r.id));
            const map = chatterMapRef.current;
            for (const r of rows) {
              if (!r.isSeller && r.userId) map.set(r.userId, r.userName);
            }
            setChatters(
              [...map.entries()].map(([userId, userName]) => ({
                userId,
                userName,
              })),
            );
            setMessages((prev) => [
              ...prev.filter((m) => m.kind === 'system'),
              ...rows.map(mapMessage),
            ]);
          })
          .catch(() => {});
      }
      void liveService
        .fetchMutedStreamViewers(sessionId)
        .then((rows) => {
          if (!disposed) setMutedViewers(rows);
        })
        .catch(() => {});
      void qc.invalidateQueries({ queryKey: ['live-current-lot', sessionId] });
      void qc.invalidateQueries({ queryKey: ['live-lots', sessionId] });
      void qc.invalidateQueries({ queryKey: ['live-sessions'] });
    };

    const handleEvent = (event: RealtimeEnvelope) => {
      const payload = event.payload ?? {};
      switch (event.type) {
        case 'live.chat.message': {
          const message = payload.message as
            | liveService.StreamChatMessage
            | undefined;
          if (message?.id) appendMessage(message);
          return;
        }
        case 'live.viewer_count.update': {
          if (typeof payload.count === 'number') setViewerCount(payload.count);
          return;
        }
        case 'live.session.ended': {
          onSessionEnded({
            totalViewers:
              typeof payload.totalViewers === 'number' ? payload.totalViewers : 0,
            lotsSold: typeof payload.lotsSold === 'number' ? payload.lotsSold : 0,
            totalSales:
              typeof payload.totalSales === 'number' ? payload.totalSales : 0,
          });
          void qc.invalidateQueries({ queryKey: ['live-sessions'] });
          return;
        }
        case 'live.viewer.muted':
        case 'live.viewer.unmuted': {
          void liveService
            .fetchMutedStreamViewers(sessionId)
            .then((rows) => {
              if (!disposed) setMutedViewers(rows);
            })
            .catch(() => {});
          return;
        }
        case 'live.viewer.kicked': {
          return;
        }
        default: {
          if (
            event.type === 'live.bid.placed' ||
            event.type === 'live.current_lot.update' ||
            (event.type?.startsWith('lot.') ?? false)
          ) {
            void qc.invalidateQueries({
              queryKey: ['live-current-lot', sessionId],
            });
            void qc.invalidateQueries({ queryKey: ['live-lots', sessionId] });
          }
        }
      }
    };

    const connect = async () => {
      controller = new AbortController();
      try {
        const auth = await getAuthSession();
        if (disposed || !auth?.accessToken) return;

        const url = `${getApiBaseUrl()}/realtime/stream?topics=${encodeURIComponent(
          topic,
        )}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${auth.accessToken}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`stream failed (${response.status})`);
        }

        connectAttempt = 0;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let dataLines: string[] = [];

        const flush = () => {
          if (dataLines.length === 0) return;
          try {
            handleEvent(JSON.parse(dataLines.join('\n')) as RealtimeEnvelope);
          } catch {
            // Malformed frame — the reconnect resnapshot covers the gap.
          }
          dataLines = [];
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done || disposed) break;
          buffer += decoder.decode(value, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, newline).replace(/\r$/, '');
            buffer = buffer.slice(newline + 1);
            if (line === '') flush();
            else if (line.startsWith('data:'))
              dataLines.push(line.slice(5).trimStart());
          }
        }
      } catch {
        // Intentional abort or a network drop — reconnect below.
      } finally {
        controller = null;
      }

      if (disposed) return;
      resnapshot();
      const delayMs = Math.min(1000 * 2 ** connectAttempt, 15_000);
      connectAttempt += 1;
      retryTimer = setTimeout(() => {
        if (!disposed) void connect();
      }, delayMs);
    };

    void connect();

    return () => {
      disposed = true;
      controller?.abort();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    active,
    sessionId,
    isGuest,
    phase,
    myId,
    qc,
    appendMessage,
    mapMessage,
    onSessionEnded,
  ]);

  const send =
    active && phase === 'live' && sessionId
      ? (text: string) => {
          void liveService
            .sendStreamChatMessage(sessionId, text)
            .then(appendMessage)
            .catch((error: unknown) => {
              show(
                parseApiError(error, 'Message was not sent').message,
                'error',
              );
            });
        }
      : null;

  const muteViewer = useCallback(
    async (userId: string) => {
      if (!sessionId) return;
      await liveService.setStreamViewerMuted(sessionId, userId, true);
      setMutedViewers((prev) =>
        prev.some((v) => v.userId === userId)
          ? prev
          : [
              ...prev,
              { userId, mutedAt: new Date().toISOString(), mutedBy: myId },
            ],
      );
    },
    [sessionId, myId],
  );

  const unmuteViewer = useCallback(
    async (userId: string) => {
      if (!sessionId) return;
      await liveService.setStreamViewerMuted(sessionId, userId, false);
      setMutedViewers((prev) => prev.filter((v) => v.userId !== userId));
    },
    [sessionId],
  );

  const kickViewer = useCallback(
    async (userId: string) => {
      if (!sessionId) return;
      const count = await liveService.kickStreamViewer(sessionId, userId);
      setViewerCount(count);
    },
    [sessionId],
  );

  return {
    viewerCount,
    messages,
    chatters,
    mutedViewers,
    send,
    muteViewer,
    unmuteViewer,
    kickViewer,
    appendSystemLine,
  };
}
