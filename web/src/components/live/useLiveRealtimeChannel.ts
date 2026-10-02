'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getApiBaseUrl,
  getAuthSession,
  parseApiError,
} from '@/lib/api/http';
import * as liveService from '@/lib/api/services/live';
import { useToast } from '@/components/ui/Toast';
import type { LiveSession } from '@/lib/data/fixtures-media';
import type { LiveChatMessage } from './useLiveChat';
import {
  CHAT_RESYNC_MS,
  type LivePlaybackState,
  type LiveRoomEndSummary,
  type RealtimeEnvelope,
} from './liveRoomTypes';

export interface UseLiveRealtimeChannelParams {
  live: boolean;
  session: LiveSession | null;
  sessionId: string | null;
  isLiveNow: boolean;
  isGuest: boolean;
  myId: string | null;
  attempt: number;
  playback: LivePlaybackState;
  setPlayback: React.Dispatch<React.SetStateAction<LivePlaybackState>>;
}

export function useLiveRealtimeChannel({
  live,
  session,
  sessionId,
  isLiveNow,
  isGuest,
  myId,
  attempt,
  playback,
  setPlayback,
}: UseLiveRealtimeChannelParams) {
  const { show } = useToast();
  const qc = useQueryClient();

  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const [messages, setMessages] = useState<LiveChatMessage[]>([]);
  const [muted, setMuted] = useState(false);
  const [endSummary, setEndSummary] = useState<LiveRoomEndSummary | null>(null);

  const seenIds = useRef(new Set<string>());

  const mapMessage = useCallback(
    (m: liveService.StreamChatMessage): LiveChatMessage => ({
      id: m.id,
      user: m.userName,
      text: m.message,
      kind: m.type === 'message' ? 'chat' : 'system',
      seller: m.isSeller,
      mine: myId != null && m.userId === myId,
    }),
    [myId],
  );

  const appendMessage = useCallback(
    (m: liveService.StreamChatMessage) => {
      if (seenIds.current.has(m.id)) return;
      seenIds.current.add(m.id);
      setMessages((prev) => [...prev.slice(-120), mapMessage(m)]);
    },
    [mapMessage],
  );

  const appendSystemLine = useCallback((id: string, text: string) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === id)) return prev;
      return [...prev, { id, user: '', text, kind: 'system' as const }];
    });
  }, []);

  // ── Chat snapshot — initial history + a slow reconciliation poll. ──
  useEffect(() => {
    if (!live || !sessionId) {
      setMessages([]);
      return;
    }
    seenIds.current = new Set();
    let cancelled = false;

    const sellerName = session?.sellerName || 'the host';
    const load = async () => {
      try {
        const rows = await liveService.fetchStreamChatMessages(sessionId);
        if (cancelled) return;
        seenIds.current = new Set(rows.map((r) => r.id));
        setMessages([
          {
            id: `${sessionId}-join`,
            user: '',
            text:
              session?.status === 'ended'
                ? 'Chat from the live show'
                : `You joined @${sellerName}’s show`,
            kind: 'system',
          },
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
  }, [live, sessionId, session?.sellerName, session?.status, mapMessage]);

  // ── SSE session channel ──
  useEffect(() => {
    if (!live || !sessionId || !isLiveNow || isGuest) return;

    const topic = `live.session:${sessionId}`;
    let disposed = false;
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let connectAttempt = 0;

    const resnapshot = () => {
      void liveService
        .fetchStreamChatMessages(sessionId)
        .then((rows) => {
          if (disposed) return;
          seenIds.current = new Set(rows.map((r) => r.id));
          setMessages((prev) => [
            ...prev.filter((m) => m.kind === 'system'),
            ...rows.map(mapMessage),
          ]);
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
          setPlayback('ended');
          setEndSummary({
            totalViewers:
              typeof payload.totalViewers === 'number' ? payload.totalViewers : 0,
            lotsSold: typeof payload.lotsSold === 'number' ? payload.lotsSold : 0,
            totalSales:
              typeof payload.totalSales === 'number' ? payload.totalSales : 0,
          });
          void qc.invalidateQueries({ queryKey: ['live-sessions'] });
          return;
        }
        case 'live.viewer.kicked': {
          if (myId && payload.userId === myId) {
            setPlayback('removed');
            appendSystemLine(
              `${sessionId}-kicked`,
              'The host removed you from this stream',
            );
          }
          return;
        }
        case 'live.viewer.muted': {
          if (myId && payload.userId === myId) {
            setMuted(true);
            appendSystemLine(
              `${sessionId}-muted`,
              'The host muted you — you can watch but not chat',
            );
          }
          return;
        }
        case 'live.viewer.unmuted': {
          if (myId && payload.userId === myId) setMuted(false);
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
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
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
    live,
    sessionId,
    isLiveNow,
    isGuest,
    myId,
    qc,
    attempt,
    mapMessage,
    appendMessage,
    appendSystemLine,
    setPlayback,
  ]);

  const send =
    live && isLiveNow && playback !== 'removed' && playback !== 'ended' && !muted
      ? (text: string) => {
          void liveService
            .sendStreamChatMessage(sessionId as string, text)
            .then((m) => appendMessage(m))
            .catch((error: unknown) => {
              show(parseApiError(error, 'Message was not sent').message, 'error');
            });
        }
      : null;

  return {
    viewerCount,
    messages,
    muted,
    endSummary,
    send,
  };
}
