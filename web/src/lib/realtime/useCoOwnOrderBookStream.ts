'use client';

/**
 * Co-Own realtime order book — the web transport for the native app's
 * market stream. The backend's WS route requires a Bearer header that
 * browser WebSocket can't send, so this client uses the SSE twin
 * (/realtime/stream?topics=co-own.asset:<id>) over fetch, which does
 * carry the Authorization header.
 *
 * Events write through to the react-query caches the REST hooks already
 * own — `co-own.book-delta` patches the book, `co-own.book-updated` and
 * `order.*` invalidate it for a resnapshot, `trade.executed` refreshes
 * the ledger/tape. A dropped connection resnapshots (not replays) — the
 * book cache is invalidated so the next read is canonical, matching the
 * backend's "gap → resnapshot" guidance.
 *
 * Guests subscribe without an Authorization header — the `co-own.asset:*`
 * topic is public on the backend. The stream transport still gates on a
 * session today, so a 401/403 is treated as terminal (no retry storm):
 * the order-book hook's REST poll keeps guest books fresh until the
 * transport opens up.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { DATA_MODE } from '@/lib/api/client';
import { getApiBaseUrl, getAuthSession } from '@/lib/api/http';
import { useSession } from '@/lib/session/SessionProvider';
import type { OrderBookLevel, OrderBookSnapshot } from '@/lib/contracts/coown';

interface BookDeltaChange {
  side: 'buy' | 'sell';
  priceGbp: number;
  units: number;
  orderCount: number;
}

interface RealtimeEnvelope {
  topic: string;
  type: string;
  payload: Record<string, unknown>;
  seq?: number;
}

const BOOK_KEY = (id: string) => ['coown', 'book', id] as const;
const LEDGER_KEY = (id: string) => ['coown', 'ledger', id] as const;
const TAPE_KEY = ['coown', 'tape'] as const;
const ASSET_KEY = (id: string) => ['coown', 'asset', id] as const;
const ASSETS_KEY = ['coown', 'assets'] as const;
const ORDERS_KEY = ['coown', 'orders'] as const;

/** Apply one delta change to a side of the book — units 0 removes the
 *  level; the ladder stays sorted (bids desc, asks asc). */
function applyChange(levels: OrderBookLevel[], change: BookDeltaChange, side: 'buy' | 'sell') {
  const sideKey: OrderBookLevel['side'] = side;
  const existing = levels.findIndex((l) => l.unitPriceGbp === change.priceGbp);
  let next: OrderBookLevel[];
  if (change.units <= 0) {
    next = levels.filter((_, i) => i !== existing);
  } else if (existing >= 0) {
    next = levels.map((l, i) =>
      i === existing
        ? { ...l, units: change.units, orderCount: change.orderCount }
        : l,
    );
  } else {
    next = [
      ...levels,
      {
        side: sideKey,
        unitPriceGbp: change.priceGbp,
        units: change.units,
        orderCount: change.orderCount,
      },
    ];
  }
  return next.sort((a, b) =>
    side === 'buy'
      ? b.unitPriceGbp - a.unitPriceGbp
      : a.unitPriceGbp - b.unitPriceGbp,
  );
}

/**
 * Subscribe the asset's query caches to the live book topic. Guests get
 * one unauthenticated attempt at the public topic — a 401/403 is
 * terminal and their freshness comes from the book hook's REST poll.
 * No-op in fixture mode and during SSR — the REST snapshot stays the
 * baseline either way.
 */
export function useCoOwnOrderBookStream(assetId: string) {
  const queryClient = useQueryClient();
  const { isGuest, sessionLoading } = useSession();
  // Keep the latest seq inside the effect scope — a reconnect resyncs
  // rather than trusting a book that may have missed deltas.
  const lastSeq = useRef(0);

  useEffect(() => {
    if (DATA_MODE !== 'live' || sessionLoading || !assetId) return;

    let disposed = false;
    let terminal = false;
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const resnapshot = () => {
      // A dropped stream means missed deltas — flag the cached book as
      // broken so the surface shows "resyncing", then invalidate so the
      // next read is a canonical snapshot, never a patched stale book.
      queryClient.setQueryData<OrderBookSnapshot | null>(
        [...BOOK_KEY(assetId)],
        (old) => (old ? { ...old, reconciliationState: 'break' } : old),
      );
      void queryClient.invalidateQueries({ queryKey: [...BOOK_KEY(assetId)] });
    };

    const handleEvent = (event: RealtimeEnvelope) => {
      if (event.seq != null) {
        if (lastSeq.current > 0 && event.seq > lastSeq.current + 1) {
          // Gap — the delta chain is broken; resnapshot before applying.
          resnapshot();
          lastSeq.current = event.seq;
          return;
        }
        lastSeq.current = event.seq;
      }

      const payload = event.payload ?? {};
      switch (event.type) {
        case 'co-own.book-delta': {
          const changes = Array.isArray(payload.changes)
            ? (payload.changes as BookDeltaChange[])
            : [];
          if (changes.length === 0) return;
          queryClient.setQueryData<OrderBookSnapshot | null>(
            [...BOOK_KEY(assetId)],
            (old) => {
              if (!old) return old;
              let bids = old.bids;
              let asks = old.asks;
              for (const change of changes) {
                if (change.side === 'buy') bids = applyChange(bids, change, 'buy');
                else asks = applyChange(asks, change, 'sell');
              }
              return {
                ...old,
                bids,
                asks,
                serverTime:
                  typeof payload.serverTimestamp === 'string'
                    ? payload.serverTimestamp
                    : old.serverTime,
              };
            },
          );
          break;
        }
        case 'co-own.book-updated': {
          resnapshot();
          break;
        }
        case 'trade.executed': {
          void queryClient.invalidateQueries({ queryKey: [...LEDGER_KEY(assetId)] });
          void queryClient.invalidateQueries({ queryKey: [...TAPE_KEY] });
          void queryClient.invalidateQueries({ queryKey: [...ASSET_KEY(assetId)] });
          void queryClient.invalidateQueries({ queryKey: [...ASSETS_KEY] });
          break;
        }
        default: {
          // order.open / order.filled / order.cancelled etc. — the book
          // moved; resnapshot and refresh the viewer's order list.
          if (event.type.startsWith('order.')) {
            resnapshot();
            void queryClient.invalidateQueries({ queryKey: [...ORDERS_KEY] });
          }
        }
      }
    };

    const connect = async () => {
      controller = new AbortController();
      try {
        const session = await getAuthSession();
        if (disposed) return;

        // Authenticated viewers send the Bearer header; guests send none —
        // the co-own.asset topic is authorized public server-side. A
        // signed-in viewer whose token hasn't materialised returns early
        // and the reconnect path retries until it does.
        const headers: Record<string, string> = {};
        if (session?.accessToken) {
          headers.Authorization = `Bearer ${session.accessToken}`;
        } else if (!isGuest) {
          return;
        }

        const url = `${getApiBaseUrl()}/realtime/stream?topics=${encodeURIComponent(
          `co-own.asset:${assetId}`,
        )}`;
        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          // Transport-level auth gate (or a revoked token) — terminal:
          // retrying cannot change it. Guest freshness stays on the
          // order-book REST poll; authed freshness falls back to the
          // resnapshot-on-focus reads.
          terminal = true;
          return;
        }
        if (!response.ok || !response.body) {
          throw new Error(`stream failed (${response.status})`);
        }

        attempt = 0; // healthy connection — reset backoff

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let dataLines: string[] = [];

        const flush = () => {
          if (dataLines.length === 0) return;
          try {
            const envelope = JSON.parse(dataLines.join('\n')) as RealtimeEnvelope;
            handleEvent(envelope);
          } catch {
            // Malformed frame — drop it; the next seq gap resnapshots.
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
            if (line === '') {
              flush();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trimStart());
            }
            // `id:` lines and comments (heartbeats) need no handling.
          }
        }
      } catch {
        // Aborted intentionally or network drop — handled below.
      } finally {
        controller = null;
      }

      if (disposed || terminal) return;
      // Reconnect with backoff; invalidate the book so a gap can't
      // render as patched-stale data.
      resnapshot();
      const delayMs = Math.min(1000 * 2 ** attempt, 15_000);
      attempt += 1;
      retryTimer = setTimeout(() => {
        if (!disposed) void connect();
      }, delayMs);
    };

    void connect();

    return () => {
      disposed = true;
      controller?.abort();
      if (retryTimer) clearTimeout(retryTimer);
      lastSeq.current = 0;
    };
  }, [assetId, isGuest, sessionLoading, queryClient]);
}
